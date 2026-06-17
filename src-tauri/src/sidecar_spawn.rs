use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::State;

pub struct SidecarChild(pub Mutex<Option<Child>>);

#[tauri::command]
pub fn spawn_phonton_serve(
    exe: String,
    workspace_dir: Option<String>,
    state: State<'_, SidecarChild>,
) -> Result<u32, String> {
    let path = std::path::Path::new(&exe);
    if !path.is_file() {
        return Err(format!("phonton.exe not found at {exe}"));
    }

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
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
            .creation_flags(CREATE_NO_WINDOW);
        if let Some(dir) = work_dir {
            cmd.current_dir(dir);
        }
        let child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn {exe}: {e}"))?;
        let pid = child.id();
        *guard = Some(child);
        return Ok(pid);
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
        *guard = Some(child);
        Ok(pid)
    }
}

#[tauri::command]
pub fn phonton_sidecar_alive(state: State<'_, SidecarChild>) -> bool {
    let Ok(mut guard) = state.0.lock() else {
        return false;
    };
    let Some(child) = guard.as_mut() else {
        return false;
    };
    match child.try_wait() {
        Ok(Some(_)) => false,
        Ok(None) => true,
        Err(_) => false,
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn kill_serve_port_listeners(port: u16) -> Result<u32, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let needle = format!(":{port}");
    let output = Command::new("netstat")
        .args(["-ano"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut killed = 0u32;
    for line in text.lines() {
        if !line.contains("LISTENING") || !line.contains(&needle) {
            continue;
        }
        let Some(pid) = line.split_whitespace().last() else {
            continue;
        };
        if pid == "0" {
            continue;
        }
        let _ = Command::new("taskkill")
            .args(["/F", "/PID", pid])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        killed += 1;
    }
    Ok(killed)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn kill_serve_port_listeners(_port: u16) -> Result<u32, String> {
    Ok(0)
}

#[tauri::command]
pub fn stop_phonton_serve(state: State<'_, SidecarChild>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
        let _ = child.wait();
    }
    Ok(())
}
