use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, State};

use crate::bundled_engine;

const BUNDLED_STARTUP_GRACE: Duration = Duration::from_secs(30);

#[cfg(windows)]
struct OwnedWinHandle(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for OwnedWinHandle {}

#[cfg(windows)]
unsafe impl Sync for OwnedWinHandle {}

#[cfg(windows)]
impl Drop for OwnedWinHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(windows)]
fn resume_suspended_engine(pid: u32) -> Result<(), String> {
    use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
    };
    use windows_sys::Win32::System::Threading::{OpenThread, ResumeThread, THREAD_SUSPEND_RESUME};

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(format!(
            "Could not inspect the suspended engine thread: {}",
            std::io::Error::last_os_error()
        ));
    }
    let snapshot = OwnedWinHandle(snapshot);
    let mut entry = THREADENTRY32 {
        dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
        ..Default::default()
    };
    if unsafe { Thread32First(snapshot.0, &mut entry) } == 0 {
        return Err(format!(
            "Could not find the suspended engine thread: {}",
            std::io::Error::last_os_error()
        ));
    }
    loop {
        if entry.th32OwnerProcessID == pid {
            let thread = unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID) };
            if thread.is_null() {
                return Err(format!(
                    "Could not open the suspended engine thread: {}",
                    std::io::Error::last_os_error()
                ));
            }
            let thread = OwnedWinHandle(thread);
            let previous = unsafe { ResumeThread(thread.0) };
            if previous != 1 {
                return Err(format!(
                    "Could not resume the supervised engine (suspend count {previous})"
                ));
            }
            return Ok(());
        }
        if unsafe { Thread32Next(snapshot.0, &mut entry) } == 0 {
            break;
        }
    }
    Err("Could not find the suspended engine's initial thread".into())
}

#[cfg(windows)]
fn supervise_suspended_engine(child: &Child) -> Result<OwnedWinHandle, String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if handle.is_null() {
        return Err(format!(
            "Could not create the engine lifetime job: {}",
            std::io::Error::last_os_error()
        ));
    }
    let job = OwnedWinHandle(handle);
    let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if unsafe {
        SetInformationJobObject(
            job.0,
            JobObjectExtendedLimitInformation,
            (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    } == 0
    {
        return Err(format!(
            "Could not tie engine lifetime to Desktop: {}",
            std::io::Error::last_os_error()
        ));
    }
    if unsafe { AssignProcessToJobObject(job.0, child.as_raw_handle().cast()) } == 0 {
        return Err(format!(
            "Could not attach the engine to Desktop lifetime: {}",
            std::io::Error::last_os_error()
        ));
    }
    resume_suspended_engine(child.id())?;
    Ok(job)
}

pub struct TrackedChild {
    pub child: Child,
    #[cfg(windows)]
    _job: Option<OwnedWinHandle>,
    started_at: Instant,
    pub listener_seen: bool,
}

impl TrackedChild {
    #[cfg(any(test, not(windows)))]
    fn new(child: Child) -> Self {
        Self {
            child,
            #[cfg(windows)]
            _job: None,
            started_at: Instant::now(),
            listener_seen: false,
        }
    }

    #[cfg(windows)]
    fn supervised(child: Child, job: OwnedWinHandle) -> Self {
        Self {
            child,
            _job: Some(job),
            started_at: Instant::now(),
            listener_seen: false,
        }
    }
}

pub struct SidecarChild(pub Mutex<Option<TrackedChild>>);

impl Drop for SidecarChild {
    fn drop(&mut self) {
        let tracked = self
            .0
            .get_mut()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        stop_tracked_child(tracked);
    }
}

#[cfg(windows)]
fn reusable_bundled_child(tracked: &mut TrackedChild, port: u16) -> Result<Option<u32>, String> {
    if tracked
        .child
        .try_wait()
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Ok(None);
    }
    match crate::listener_owner::loopback_listener_owner(port)? {
        Some(owner) if owner != tracked.child.id() => Err(format!(
            "Another process owns the bundled engine listener on 127.0.0.1:{port}; Phonton will not replace its running engine"
        )),
        Some(_) => {
            tracked.listener_seen = true;
            Ok(Some(tracked.child.id()))
        }
        None if !tracked.listener_seen && tracked.started_at.elapsed() < BUNDLED_STARTUP_GRACE => {
            // A newly spawned child may still be binding. The Desktop
            // readiness check waits for it without dropping its operations.
            Ok(Some(tracked.child.id()))
        }
        None if !tracked.listener_seen => Ok(None),
        None => Err("The tracked bundled engine lost its local listener. Phonton kept that process because an operation may still be running; inspect its state before restarting Desktop.".into()),
    }
}

fn stop_tracked_child(tracked: &mut Option<TrackedChild>) {
    if let Some(mut old) = tracked.take() {
        let _ = old.child.kill();
        let _ = old.child.wait();
    }
}

#[cfg(windows)]
fn reconnect_bundled_child(
    tracked: &mut Option<TrackedChild>,
    port: u16,
) -> Result<Option<u32>, String> {
    if let Some(child) = tracked.as_mut() {
        if let Some(pid) = reusable_bundled_child(child, port)? {
            return Ok(Some(pid));
        }
    }
    stop_tracked_child(tracked);
    Ok(None)
}

#[tauri::command]
pub fn spawn_phonton_serve(
    app: AppHandle,
    exe: String,
    workspace_dir: Option<String>,
    state: State<'_, SidecarChild>,
) -> Result<u32, String> {
    let path = std::path::Path::new(&exe);
    bundled_engine::validate_spawn_path(&app, path)?;
    if !path.is_file() {
        return Err(format!("phonton.exe not found at {exe}"));
    }

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    if bundled_engine::requires_bundled_engine(&app) {
        if let Some(pid) = reconnect_bundled_child(&mut guard, crate::serve_proxy::SERVE_PORT)? {
            return Ok(pid);
        }
    }
    stop_tracked_child(&mut guard);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const CREATE_SUSPENDED: u32 = 0x0000_0004;
        let work_dir: Option<std::path::PathBuf> = workspace_dir
            .as_ref()
            .filter(|d| std::path::Path::new(d).is_dir())
            .map(std::path::PathBuf::from)
            .or_else(|| path.parent().map(|p| p.to_path_buf()));
        let mut cmd = Command::new(&exe);
        cmd.arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
        if let Some(dir) = work_dir {
            cmd.current_dir(dir);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn {exe}: {e}"))?;
        let pid = child.id();
        let job = match supervise_suspended_engine(&child) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        *guard = Some(TrackedChild::supervised(child, job));
        Ok(pid)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let work_dir = workspace_dir
            .as_ref()
            .filter(|d| std::path::Path::new(d).is_dir())
            .cloned();
        let mut cmd = Command::new(&exe);
        cmd.arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Some(dir) = work_dir {
            cmd.current_dir(dir);
        }
        let child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn {exe}: {e}"))?;
        let pid = child.id();
        *guard = Some(TrackedChild::new(child));
        Ok(pid)
    }
}

#[tauri::command]
pub fn phonton_sidecar_alive(state: State<'_, SidecarChild>) -> bool {
    let Ok(mut guard) = state.0.lock() else {
        return false;
    };
    let Some(tracked) = guard.as_mut() else {
        return false;
    };
    match tracked.child.try_wait() {
        Ok(Some(_)) => false,
        Ok(None) => true,
        Err(_) => false,
    }
}

#[tauri::command]
pub fn stop_phonton_serve(state: State<'_, SidecarChild>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut tracked) = guard.take() {
        tracked.child.kill().map_err(|e| e.to_string())?;
        let _ = tracked.child.wait();
    }
    Ok(())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    #[test]
    fn supervised_engine_stops_when_its_desktop_job_closes() {
        const CREATE_SUSPENDED: u32 = 0x0000_0004;
        let mut child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 30",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED)
            .spawn()
            .unwrap();
        let job = match supervise_suspended_engine(&child) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                panic!("Could not supervise disposable process: {error}");
            }
        };
        assert!(child.try_wait().unwrap().is_none());
        drop(job);
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut exited = false;
        while Instant::now() < deadline {
            if child.try_wait().unwrap().is_some() {
                exited = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        if !exited {
            let _ = child.kill();
            let _ = child.wait();
        }
        assert!(exited, "Closing the Desktop job left its engine running");
    }

    #[test]
    fn reconnect_retains_a_tracked_bundled_listener() {
        let script = "$listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0); $listener.Start(); [Console]::Out.WriteLine($listener.LocalEndpoint.Port); [Console]::Out.Flush(); Start-Sleep -Seconds 30; $listener.Stop()";
        let child = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .unwrap();
        let pid = child.id();
        let mut tracked = TrackedChild::new(child);
        let mut line = String::new();
        let observed = {
            BufReader::new(tracked.child.stdout.take().unwrap())
                .read_line(&mut line)
                .unwrap();
            let port = line.trim().parse::<u16>().unwrap();
            let retained = reusable_bundled_child(&mut tracked, port);
            let owner = crate::listener_owner::loopback_listener_owner(port);
            (retained, owner)
        };
        let still_running = tracked.child.try_wait().unwrap().is_none();
        let listener_seen = tracked.listener_seen;
        let _ = tracked.child.kill();
        let _ = tracked.child.wait();
        assert_eq!(observed.0.unwrap(), Some(pid));
        assert_eq!(observed.1.unwrap(), Some(pid));
        assert!(still_running);
        assert!(listener_seen);
    }

    #[test]
    fn reconnect_does_not_interrupt_a_bundled_child_still_binding() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 30",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .unwrap();
        let pid = child.id();
        let mut tracked = TrackedChild::new(child);
        let retained = reusable_bundled_child(&mut tracked, port);
        let still_running = tracked.child.try_wait().unwrap().is_none();
        let _ = tracked.child.kill();
        let _ = tracked.child.wait();
        assert_eq!(retained.unwrap(), Some(pid));
        assert!(still_running);
    }

    #[test]
    fn unrelated_listener_does_not_replace_the_running_bundled_child() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 30",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .unwrap();
        let mut tracked = TrackedChild::new(child);
        let result = reusable_bundled_child(&mut tracked, port);
        let still_running = tracked.child.try_wait().unwrap().is_none();
        let _ = tracked.child.kill();
        let _ = tracked.child.wait();
        assert!(result.unwrap_err().contains("Another process owns"));
        assert!(still_running);
    }

    #[test]
    fn stale_child_that_never_bound_is_replaced_on_reconnect() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 30",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .unwrap();
        let mut tracked = Some(TrackedChild::new(child));
        tracked.as_mut().unwrap().started_at -= BUNDLED_STARTUP_GRACE + Duration::from_secs(1);
        assert_eq!(reconnect_bundled_child(&mut tracked, port).unwrap(), None);
        assert!(tracked.is_none());
    }

    #[test]
    fn previously_ready_child_without_listener_reports_recovery_instead_of_killing() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 30",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .unwrap();
        let mut tracked = Some(TrackedChild::new(child));
        tracked.as_mut().unwrap().listener_seen = true;
        let result = reconnect_bundled_child(&mut tracked, port);
        let still_running = tracked
            .as_mut()
            .unwrap()
            .child
            .try_wait()
            .unwrap()
            .is_none();
        stop_tracked_child(&mut tracked);
        assert!(result.unwrap_err().contains("lost its local listener"));
        assert!(still_running);
    }
}
