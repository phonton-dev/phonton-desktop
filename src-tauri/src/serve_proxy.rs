use std::time::Duration;
use tauri::{AppHandle, State};

use crate::{bundled_engine, sidecar_spawn::SidecarChild};

const SERVE_BASE: &str = "http://127.0.0.1:47831";
#[cfg(windows)]
pub(crate) const SERVE_PORT: u16 = 47831;
const DEFAULT_RPC_TIMEOUT: Duration = Duration::from_secs(30);
const READ_ONLY_RPC_TIMEOUT: Duration = Duration::from_secs(180);
const LOCAL_MUTATION_TIMEOUT: Duration = Duration::from_secs(600);

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())
}

fn rpc_timeout(body: &str) -> Duration {
    let parsed = serde_json::from_str::<serde_json::Value>(body);
    match parsed
        .as_ref()
        .ok()
        .and_then(|value| value.get("method"))
        .and_then(serde_json::Value::as_str)
    {
        Some("models.catalog" | "models.catalog.snapshot" | "models.status" | "local.run.plan") => {
            READ_ONLY_RPC_TIMEOUT
        }
        Some("local.run.apply" | "local.run.rollback") => LOCAL_MUTATION_TIMEOUT,
        _ => DEFAULT_RPC_TIMEOUT,
    }
}

async fn proxy_rpc(base: &str, body: String, timeout: Duration) -> Result<String, String> {
    let client = http_client()?;
    let res = client
        .post(format!("{base}/rpc"))
        .header("Content-Type", "application/json")
        .body(body)
        .timeout(timeout)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!("serve rpc HTTP {status}: {text}"))
    }
}

#[cfg(windows)]
fn tracked_child_owns_listener(child: &mut std::process::Child, port: u16) -> Result<bool, String> {
    if child.try_wait().map_err(|e| e.to_string())?.is_some() {
        return Ok(false);
    }
    Ok(crate::listener_owner::loopback_listener_owner(port)? == Some(child.id()))
}

fn required_engine_owned(app: &AppHandle, state: &State<'_, SidecarChild>) -> Result<bool, String> {
    if !bundled_engine::requires_bundled_engine(app) {
        return Ok(true);
    }
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let Some(tracked) = guard.as_mut() else {
        return Ok(false);
    };
    #[cfg(windows)]
    {
        let owned = tracked_child_owns_listener(&mut tracked.child, SERVE_PORT)?;
        if owned {
            tracked.listener_seen = true;
        }
        Ok(owned)
    }
    #[cfg(not(windows))]
    {
        let _ = tracked;
        Err("Bundled engine listener ownership is supported on Windows only".into())
    }
}

#[tauri::command]
pub async fn serve_health(app: AppHandle, state: State<'_, SidecarChild>) -> Result<bool, String> {
    if !required_engine_owned(&app, &state)? {
        return Ok(false);
    }
    let client = http_client()?;
    let healthy = match client
        .get(format!("{SERVE_BASE}/health"))
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(res) => res.status().is_success(),
        Err(_) => false,
    };
    // The listener may disappear or be replaced while the HTTP request runs.
    Ok(healthy && required_engine_owned(&app, &state)?)
}

#[tauri::command]
pub async fn serve_rpc(
    app: AppHandle,
    state: State<'_, SidecarChild>,
    body: String,
) -> Result<String, String> {
    if !required_engine_owned(&app, &state)? {
        return Err("This build's bundled engine does not own its local listener".into());
    }
    let timeout = rpc_timeout(&body);
    let reply = proxy_rpc(SERVE_BASE, body, timeout).await?;
    if !required_engine_owned(&app, &state)? {
        return Err("The bundled engine lost its local listener during the request".into());
    }
    Ok(reply)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn delayed_rpc_server(delay: Duration) -> (String, std::thread::JoinHandle<()>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = [0u8; 4096];
            let read = stream.read(&mut request).unwrap();
            assert!(String::from_utf8_lossy(&request[..read]).contains("POST /rpc"));
            std::thread::sleep(delay);
            let _ = stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
        });
        (base, server)
    }

    #[test]
    fn read_only_calls_have_a_longer_bounded_deadline() {
        #[cfg(windows)]
        assert_eq!(SERVE_BASE, format!("http://127.0.0.1:{SERVE_PORT}"));
        assert_eq!(
            rpc_timeout(r#"{"method":"models.catalog"}"#),
            Duration::from_secs(180)
        );
        assert_eq!(
            rpc_timeout(r#"{"method":"models.catalog.snapshot"}"#),
            Duration::from_secs(180)
        );
        assert_eq!(
            rpc_timeout(r#"{"method":"models.status"}"#),
            Duration::from_secs(180)
        );
        assert_eq!(
            rpc_timeout(r#"{"method":"local.run.plan"}"#),
            Duration::from_secs(180)
        );
        assert_eq!(
            rpc_timeout(r#"{"method":"local.run.apply"}"#),
            Duration::from_secs(600)
        );
        assert_eq!(
            rpc_timeout(r#"{"method":"local.run.rollback"}"#),
            Duration::from_secs(600)
        );
        assert_eq!(
            rpc_timeout(r#"{"method":"models.start"}"#),
            Duration::from_secs(30)
        );
        assert_eq!(rpc_timeout("invalid json"), Duration::from_secs(30));
    }

    #[cfg(windows)]
    #[test]
    fn unrelated_listener_cannot_satisfy_a_live_tracked_child() {
        use std::os::windows::process::CommandExt;
        use std::process::{Command, Stdio};

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let mut child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 5",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .unwrap();
        assert!(child.try_wait().unwrap().is_none());
        let owned = tracked_child_owns_listener(&mut child, port);
        let _ = child.kill();
        let _ = child.wait();
        assert!(!owned.unwrap());
    }

    #[cfg(windows)]
    #[test]
    fn tracked_child_owning_loopback_listener_is_accepted() {
        use std::io::{BufRead, BufReader};
        use std::os::windows::process::CommandExt;
        use std::process::{Command, Stdio};

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let script = "$listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'),0); $listener.Start(); [Console]::Out.WriteLine($listener.LocalEndpoint.Port); [Console]::Out.Flush(); Start-Sleep -Seconds 30; $listener.Stop()";
        let mut child = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .unwrap();
        let mut line = String::new();
        let observed = {
            BufReader::new(child.stdout.take().unwrap())
                .read_line(&mut line)
                .unwrap();
            let port = line.trim().parse::<u16>().unwrap();
            tracked_child_owns_listener(&mut child, port)
        };
        let _ = child.kill();
        let _ = child.wait();
        assert!(observed.unwrap());
    }

    #[test]
    fn proxy_waits_for_a_slow_valid_rpc_reply() {
        let (base, server) = delayed_rpc_server(Duration::from_millis(80));
        let reply = tauri::async_runtime::block_on(proxy_rpc(
            &base,
            r#"{"method":"models.catalog"}"#.into(),
            Duration::from_secs(1),
        ))
        .unwrap();
        server.join().unwrap();
        assert_eq!(reply, "{}");
    }

    #[test]
    #[ignore = "31-second regression for the former global 30-second client timeout"]
    fn plan_rpc_survives_the_former_global_deadline() {
        let (base, server) = delayed_rpc_server(Duration::from_secs(31));
        let body = r#"{"method":"local.run.plan"}"#.to_owned();
        let reply =
            tauri::async_runtime::block_on(proxy_rpc(&base, body.clone(), rpc_timeout(&body)));
        server.join().unwrap();
        assert_eq!(reply.unwrap(), "{}");
    }
}
