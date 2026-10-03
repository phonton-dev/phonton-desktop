//! Resolve a locally packaged engine without invoking npm or an online installer.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{io::Read, path::Path};
use tauri::Manager;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    schema: u32,
    version: String,
    sha256: String,
    target: String,
    profile: String,
}

/// Engine identity checked against the resources shipped with this application.
#[derive(Debug, Serialize)]
pub struct BundledEngine {
    path: String,
    version: String,
    sha256: String,
}

fn resolve(root: &Path, required: bool) -> Result<Option<BundledEngine>, String> {
    let manifest_path = root.join("local-engine/manifest.json");
    let executable = root.join("local-engine/phonton.exe");
    if !manifest_path.exists() && !executable.exists() {
        if required {
            return Err("This build is missing its bundled engine; rebuild or reinstall it".into());
        }
        return Ok(None);
    }
    let mut manifest_bytes = Vec::new();
    std::fs::File::open(&manifest_path)
        .map_err(|e| format!("Bundled engine manifest unavailable: {e}"))?
        .take(16 * 1024 + 1)
        .read_to_end(&mut manifest_bytes)
        .map_err(|e| e.to_string())?;
    if manifest_bytes.len() > 16 * 1024 {
        return Err("Bundled engine manifest exceeds its size limit".into());
    }
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|e| format!("Invalid bundled engine manifest: {e}"))?;
    if !cfg!(all(target_os = "windows", target_arch = "x86_64"))
        || manifest.schema != 1
        || manifest.target != "x86_64-pc-windows-msvc"
        || !matches!(manifest.profile.as_str(), "debug" | "release")
        || manifest.version.is_empty()
        || manifest.version.len() > 100
        || manifest.sha256.len() != 64
        || !manifest.sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("Bundled engine manifest is not supported by this application build".into());
    }
    let mut file =
        std::fs::File::open(&executable).map_err(|e| format!("Bundled engine unavailable: {e}"))?;
    const LIMIT: u64 = 512 * 1024 * 1024;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > LIMIT {
        return Err("Bundled engine exceeds its file size limit".into());
    }
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    let mut total = 0u64;
    loop {
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        total += count as u64;
        if total > LIMIT {
            return Err("Bundled engine grew beyond its file size limit".into());
        }
        hash.update(&buffer[..count]);
    }
    let observed = format!("{:x}", hash.finalize());
    if observed != manifest.sha256.to_ascii_lowercase() {
        return Err(
            "Bundled engine hash does not match its manifest; rebuild or reinstall this build"
                .into(),
        );
    }
    Ok(Some(BundledEngine {
        path: executable.to_string_lossy().into_owned(),
        version: manifest.version,
        sha256: observed,
    }))
}

#[tauri::command]
/// Locate the optional packaged engine and reject incomplete or changed resources.
pub fn bundled_phonton_engine(app: tauri::AppHandle) -> Result<Option<BundledEngine>, String> {
    let root = app.path().resource_dir().map_err(|e| e.to_string())?;
    resolve(&root, bundle_required(&app.config().identifier))
}

fn bundle_required(identifier: &str) -> bool {
    identifier == "dev.phonton.desktop.preview"
        || (cfg!(all(target_os = "windows", target_arch = "x86_64"))
            && identifier == "dev.phonton.desktop")
}

pub(crate) fn requires_bundled_engine(app: &tauri::AppHandle) -> bool {
    bundle_required(&app.config().identifier)
}

fn requested_path_allowed(identifier: &str, requested: &Path, bundled: &Path) -> bool {
    !bundle_required(identifier) || requested == bundled
}

pub(crate) fn validate_spawn_path(app: &tauri::AppHandle, requested: &Path) -> Result<(), String> {
    if !requires_bundled_engine(app) {
        return Ok(());
    }
    let bundle = bundled_phonton_engine(app.clone())?
        .ok_or_else(|| "This build is missing its bundled engine".to_owned())?;
    if !requested_path_allowed(&app.config().identifier, requested, Path::new(&bundle.path)) {
        return Err("This build can only start its verified bundled engine".into());
    }
    Ok(())
}

#[cfg(all(test, target_os = "windows", target_arch = "x86_64"))]
mod tests {
    use super::*;
    #[test]
    fn normal_windows_build_requires_its_bundled_engine() {
        assert!(bundle_required("dev.phonton.desktop"));
        assert!(bundle_required("dev.phonton.desktop.preview"));
        assert!(!bundle_required("dev.phonton.unrelated"));
        let bundled = Path::new(r"C:\Phonton\local-engine\phonton.exe");
        let other = Path::new(r"C:\Other\phonton.exe");
        for identifier in ["dev.phonton.desktop", "dev.phonton.desktop.preview"] {
            assert!(requested_path_allowed(identifier, bundled, bundled));
            assert!(!requested_path_allowed(identifier, other, bundled));
        }
        assert!(requested_path_allowed(
            "dev.phonton.unrelated",
            other,
            bundled
        ));
    }
    #[test]
    fn missing_bundle_is_optional_but_incomplete_or_modified_bundle_is_rejected() {
        let root = tempfile::tempdir().unwrap();
        assert!(resolve(root.path(), false).unwrap().is_none());
        assert!(resolve(root.path(), true).unwrap_err().contains("missing"));
        let dir = root.path().join("local-engine");
        std::fs::create_dir(&dir).unwrap();
        std::fs::write(dir.join("phonton.exe"), b"fixture engine").unwrap();
        assert!(resolve(root.path(), true).is_err());
        let digest = format!("{:x}", Sha256::digest(b"fixture engine"));
        let manifest = serde_json::json!({"schema":1,"version":"0.21.1","sha256":digest,"target":"x86_64-pc-windows-msvc","profile":"debug"});
        std::fs::write(
            dir.join("manifest.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        assert_eq!(resolve(root.path(), true).unwrap().unwrap().sha256, digest);
        std::fs::write(dir.join("phonton.exe"), b"changed engine").unwrap();
        assert!(resolve(root.path(), true).unwrap_err().contains("hash"));
    }
}
