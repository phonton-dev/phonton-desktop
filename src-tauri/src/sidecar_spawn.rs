use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::State;

pub struct SidecarChild(pub Mutex<Option<Child>>);

#[tauri::command]
pub fn spawn_phonton_serve(exe: String, state: State<'_, SidecarChild>) -> Result<u32, String> {
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
        let child = Command::new(&exe)
            .arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("failed to spawn {exe}: {e}"))?;
        let pid = child.id();
        *guard = Some(child);
        return Ok(pid);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let child = Command::new(&exe)
            .arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("failed to spawn {exe}: {e}"))?;
        let pid = child.id();
        *guard = Some(child);
        Ok(pid)
    }
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
