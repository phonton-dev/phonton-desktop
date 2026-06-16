mod sidecar_spawn;

use std::sync::Mutex;

use sidecar_spawn::{spawn_phonton_serve, stop_phonton_serve, SidecarChild};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }));
    }

    builder
        .manage(SidecarChild(Mutex::new(None)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![spawn_phonton_serve, stop_phonton_serve])
        .run(tauri::generate_context!())
        .expect("error while running Phonton Desktop");
}
