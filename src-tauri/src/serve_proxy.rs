use std::time::Duration;

const SERVE_BASE: &str = "http://127.0.0.1:47831";

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn serve_health() -> Result<bool, String> {
    let client = http_client()?;
    match client
        .get(format!("{SERVE_BASE}/health"))
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(res) => Ok(res.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn serve_rpc(body: String) -> Result<String, String> {
    let client = http_client()?;
    let res = client
        .post(format!("{SERVE_BASE}/rpc"))
        .header("Content-Type", "application/json")
        .body(body)
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
