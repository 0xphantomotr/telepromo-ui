use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::path::BaseDirectory;
use tauri::Manager;

const KEYRING_SERVICE: &str = "tgcampaigner-control";
const KEY_DEVICE_SK: &str = "device_sk_v1";
const KEY_LICENSE_TOKEN: &str = "license_token_v1";
const SECRETS_FILE_NAME: &str = "secrets.json";
const BACKEND_PORT: u16 = 8000;
const BACKEND_HEALTH_TAG: &str = "\"ok\":true";
const DEFAULT_UPDATE_MANIFEST_URL: &str = "https://downloads.tgcampaigner.com/latest.json";
const UPDATE_STATE_FILE_NAME: &str = "update-state.json";
const UPDATE_BACKUP_DIR_NAME: &str = "update-backups";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PendingUpdateState {
    from_version: String,
    to_version: String,
    backup_dir: String,
    created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct UpdateIntegrityResult {
    from_version: String,
    to_version: String,
    checked_at: i64,
    updated: bool,
    restored: bool,
    integrity_ok: bool,
    message: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct UpdateStateFile {
    pending: Option<PendingUpdateState>,
    last_result: Option<UpdateIntegrityResult>,
}

#[derive(Debug, Deserialize)]
struct UpdateManifest {
    version: String,
    notes: Option<String>,
    published_at: Option<String>,
    download_url: Option<String>,
    downloads: Option<ManifestDownloads>,
    linux: Option<ManifestDownloads>,
    windows: Option<ManifestDownloads>,
}

#[derive(Debug, Deserialize, Clone)]
struct ManifestDownloads {
    appimage: Option<String>,
    deb: Option<String>,
    rpm: Option<String>,
    msi: Option<String>,
    nsis: Option<String>,
    exe: Option<String>,
}

#[derive(Debug, Serialize)]
struct UpdateCheckResponse {
    current_version: String,
    latest_version: Option<String>,
    available: bool,
    package_kind: String,
    manifest_url: String,
    download_url: Option<String>,
    notes: Option<String>,
    published_at: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct UpdatePrepareResponse {
    ok: bool,
    from_version: String,
    to_version: String,
    backup_dir: String,
}

#[derive(Debug, Serialize)]
struct UpdateFinalizeResponse {
    checked: bool,
    updated: bool,
    restored: bool,
    integrity_ok: bool,
    message: String,
    from_version: Option<String>,
    to_version: Option<String>,
}

#[cfg(target_os = "linux")]
fn strip_snap_path_entries(value: &str) -> Option<String> {
    let filtered: Vec<&str> = value
        .split(':')
        .filter(|part| !part.trim().is_empty() && !part.contains("/snap/"))
        .collect();
    if filtered.is_empty() {
        None
    } else {
        Some(filtered.join(":"))
    }
}

#[cfg(target_os = "linux")]
fn sanitize_runtime_env_for_snap_conflicts() {
    let keys: Vec<String> = std::env::vars().map(|(k, _)| k).collect();
    for key in keys {
        if key.starts_with("SNAP") {
            std::env::remove_var(key);
        }
    }

    for key in [
        "LD_LIBRARY_PATH",
        "GTK_PATH",
        "GIO_EXTRA_MODULES",
        "XDG_DATA_DIRS",
        "XDG_CONFIG_DIRS",
    ] {
        if let Ok(value) = std::env::var(key) {
            if value.contains("/snap/") {
                if let Some(next) = strip_snap_path_entries(&value) {
                    std::env::set_var(key, next);
                } else {
                    std::env::remove_var(key);
                }
            }
        }
    }

    for key in [
        "LD_PRELOAD",
        "GTK_EXE_PREFIX",
        "GTK_MODULES",
        "GTK_IM_MODULE",
        "GTK_IM_MODULE_FILE",
        "GDK_PIXBUF_MODULEDIR",
        "GDK_PIXBUF_MODULE_FILE",
    ] {
        if let Ok(value) = std::env::var(key) {
            if value.contains("/snap/") {
                std::env::remove_var(key);
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct SecretsFile {
    device_sk_b64: Option<String>,
    license_token: Option<String>,
}

fn secrets_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve(SECRETS_FILE_NAME, BaseDirectory::AppData)
        .map_err(|err| err.to_string())
}

fn app_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = secrets_path(app)?;
    path.parent()
        .map(|parent| parent.to_path_buf())
        .ok_or_else(|| "Failed to resolve app data directory".to_string())
}

fn update_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_root(app)?.join(UPDATE_STATE_FILE_NAME))
}

fn update_backups_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_root(app)?.join(UPDATE_BACKUP_DIR_NAME))
}

fn now_unix_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn sanitize_label(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    out.trim_matches('_').chars().take(48).collect()
}

fn write_update_state(app: &tauri::AppHandle, state: &UpdateStateFile) -> Result<(), String> {
    let path = update_state_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let raw = serde_json::to_string_pretty(state).map_err(|err| err.to_string())?;
    fs::write(&path, raw).map_err(|err| err.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn read_update_state(app: &tauri::AppHandle) -> UpdateStateFile {
    let path = match update_state_path(app) {
        Ok(path) => path,
        Err(_) => return UpdateStateFile::default(),
    };
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(_) => return UpdateStateFile::default(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn read_secrets_file(app: &tauri::AppHandle) -> SecretsFile {
    let path = match secrets_path(app) {
        Ok(path) => path,
        Err(_) => return SecretsFile::default(),
    };
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(_) => return SecretsFile::default(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn write_secrets_file(app: &tauri::AppHandle, secrets: &SecretsFile) -> Result<(), String> {
    let path = secrets_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let raw = serde_json::to_string_pretty(secrets).map_err(|err| err.to_string())?;
    fs::write(&path, raw).map_err(|err| err.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o600);
        let _ = fs::set_permissions(&path, perms);
    }

    Ok(())
}

fn keyring_get(name: &str) -> Option<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, name).ok()?;
    entry.get_password().ok()
}

fn keyring_set(name: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, name).map_err(|err| err.to_string())?;
    entry.set_password(value).map_err(|err| err.to_string())?;
    Ok(())
}

fn keyring_clear(name: &str) -> Result<(), String> {
    let entry = match keyring::Entry::new(KEYRING_SERVICE, name) {
        Ok(entry) => entry,
        Err(err) => return Err(err.to_string()),
    };
    // Ignore "not found".
    let _ = entry.delete_password();
    Ok(())
}

fn decode_b64_32(value: &str) -> Result<[u8; 32], String> {
    let raw = B64
        .decode(value.trim())
        .map_err(|_| "Invalid base64".to_string())?;
    if raw.len() != 32 {
        return Err("Invalid key length".to_string());
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&raw);
    Ok(out)
}

fn get_or_create_device_signing_key(app: &tauri::AppHandle) -> Result<SigningKey, String> {
    if let Some(sk_b64) = keyring_get(KEY_DEVICE_SK) {
        let sk_raw = decode_b64_32(&sk_b64)?;
        return Ok(SigningKey::from_bytes(&sk_raw));
    }

    let secrets = read_secrets_file(app);
    if let Some(sk_b64) = secrets.device_sk_b64.as_deref() {
        let sk_raw = decode_b64_32(sk_b64)?;
        return Ok(SigningKey::from_bytes(&sk_raw));
    }

    let sk = SigningKey::generate(&mut OsRng);
    let sk_b64 = B64.encode(sk.to_bytes());

    // Prefer OS keychain; fall back to a local file with 0600 permissions.
    if keyring_set(KEY_DEVICE_SK, &sk_b64).is_err() {
        let mut next = secrets;
        next.device_sk_b64 = Some(sk_b64);
        write_secrets_file(app, &next)?;
    }

    Ok(sk)
}

fn get_license_token(app: &tauri::AppHandle) -> Option<String> {
    if let Some(token) = keyring_get(KEY_LICENSE_TOKEN) {
        return Some(token);
    }
    let secrets = read_secrets_file(app);
    secrets.license_token
}

fn set_license_token(app: &tauri::AppHandle, token: &str) -> Result<(), String> {
    if keyring_set(KEY_LICENSE_TOKEN, token).is_err() {
        let mut secrets = read_secrets_file(app);
        secrets.license_token = Some(token.to_string());
        write_secrets_file(app, &secrets)?;
    }
    Ok(())
}

fn clear_license_token(app: &tauri::AppHandle) -> Result<(), String> {
    let _ = keyring_clear(KEY_LICENSE_TOKEN);
    let mut secrets = read_secrets_file(app);
    secrets.license_token = None;
    let _ = write_secrets_file(app, &secrets);
    Ok(())
}

fn local_backend_addr() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], BACKEND_PORT))
}

fn local_backend_port_open() -> bool {
    TcpStream::connect_timeout(&local_backend_addr(), Duration::from_millis(250)).is_ok()
}

fn local_backend_health_raw() -> Option<String> {
    let mut stream = TcpStream::connect_timeout(&local_backend_addr(), Duration::from_millis(300)).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(700)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(700)));

    let req = b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    stream.write_all(req).ok()?;
    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    Some(response)
}

fn local_backend_up() -> bool {
    local_backend_health_raw()
        .map(|raw| raw.starts_with("HTTP/1.1 200") && raw.contains(BACKEND_HEALTH_TAG))
        .unwrap_or(false)
}

fn backend_startup_error_cell() -> &'static Mutex<Option<String>> {
    static CELL: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(None))
}

fn set_backend_startup_error(value: Option<String>) {
    if let Ok(mut guard) = backend_startup_error_cell().lock() {
        *guard = value;
    }
}

fn get_backend_startup_error() -> Option<String> {
    backend_startup_error_cell()
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

fn local_backend_autostart_enabled() -> bool {
    std::env::var("TGCAMPAIGNER_BACKEND_AUTOSTART")
        .unwrap_or_else(|_| "1".to_string())
        .trim()
        != "0"
}

fn backend_home_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("backend-home", BaseDirectory::AppData)
        .map_err(|err| err.to_string())
}

fn backend_pid_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(backend_home_dir(app)?.join("backend.pid"))
}

#[cfg(target_os = "linux")]
fn backend_sidecar_candidates() -> &'static [&'static str] {
    &[
        "backend/tgcampaigner-backend-linux-x64",
        "backend/tgcampaigner-backend",
        "resources/backend/tgcampaigner-backend-linux-x64",
        "resources/backend/tgcampaigner-backend",
        "tgcampaigner-backend-linux-x64",
        "tgcampaigner-backend",
    ]
}

#[cfg(target_os = "windows")]
fn backend_sidecar_candidates() -> &'static [&'static str] {
    &[
        "backend/tgcampaigner-backend-windows-x64.exe",
        "backend/tgcampaigner-backend.exe",
        "resources/backend/tgcampaigner-backend-windows-x64.exe",
        "resources/backend/tgcampaigner-backend.exe",
        "tgcampaigner-backend-windows-x64.exe",
        "tgcampaigner-backend.exe",
    ]
}

#[cfg(all(not(target_os = "linux"), not(target_os = "windows")))]
fn backend_sidecar_candidates() -> &'static [&'static str] {
    &[
        "backend/tgcampaigner-backend",
        "resources/backend/tgcampaigner-backend",
        "tgcampaigner-backend",
    ]
}

fn resolve_backend_binary(app: &tauri::AppHandle) -> Option<PathBuf> {
    let env_bin = std::env::var("TGCAMPAIGNER_BACKEND_BIN")
        .ok()
        .map(PathBuf::from);
    if let Some(path) = env_bin {
        if path.exists() {
            return Some(path);
        }
    }

    for rel in backend_sidecar_candidates() {
        if let Ok(path) = app.path().resolve(rel, BaseDirectory::Resource) {
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(unix)]
fn set_dir_mode(path: &PathBuf, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode));
}

fn start_local_backend(app: &tauri::AppHandle) -> Result<(), String> {
    if !local_backend_autostart_enabled() || local_backend_up() {
        set_backend_startup_error(None);
        return Ok(());
    }

    if local_backend_port_open() {
        let msg = "Port 8000 is already in use by a stale or unhealthy local backend process. Stop old tgcampaigner-backend services and relaunch TGCampaigner.".to_string();
        set_backend_startup_error(Some(msg.clone()));
        return Err(msg);
    }

    let bin = resolve_backend_binary(app).ok_or_else(|| {
        let expected = backend_sidecar_candidates().join(", ");
        format!("No bundled backend sidecar found; expected one of: {expected}")
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&bin, fs::Permissions::from_mode(0o755));
    }

    let backend_home = backend_home_dir(app)?;
    let backend_logs = backend_home.join("logs");
    fs::create_dir_all(&backend_logs).map_err(|err| err.to_string())?;
    #[cfg(unix)]
    {
        set_dir_mode(&backend_home, 0o700);
        set_dir_mode(&backend_logs, 0o700);
    }

    let stdout_path = backend_logs.join("backend_stdout.log");
    let stderr_path = backend_logs.join("backend_stderr.log");
    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(stdout_path)
        .map_err(|err| err.to_string())?;
    let stderr = OpenOptions::new()
        .create(true)
        .append(true)
        .open(stderr_path)
        .map_err(|err| err.to_string())?;

    let mut cmd = Command::new(&bin);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // Launch backend sidecar without showing a console window.
        cmd.creation_flags(0x08000000);
        cmd.env("TGCAMPAIGNER_HOME", &backend_home);
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd.env_clear()
            .env("TGCAMPAIGNER_HOME", &backend_home)
            .env(
                "PATH",
                std::env::var("PATH").unwrap_or_else(|_| "/usr/local/bin:/usr/bin:/bin".to_string()),
            )
            .env(
                "LANG",
                std::env::var("LANG").unwrap_or_else(|_| "C.UTF-8".to_string()),
            )
            .env(
                "LC_ALL",
                std::env::var("LC_ALL").unwrap_or_else(|_| "C.UTF-8".to_string()),
            );
    }
    cmd.current_dir(&backend_home)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));

    let child = cmd.spawn().map_err(|err| {
        format!(
            "Failed to start local backend sidecar '{}': {}",
            bin.display(),
            err
        )
    })?;
    let pid_path = backend_pid_path(app)?;
    fs::write(&pid_path, child.id().to_string()).map_err(|err| err.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&pid_path, fs::Permissions::from_mode(0o600));
    }

    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if local_backend_up() {
            set_backend_startup_error(None);
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    let msg = "Local backend sidecar started but did not become healthy on 127.0.0.1:8000".to_string();
    set_backend_startup_error(Some(msg.clone()));
    Err(msg)
}

#[cfg(unix)]
fn stop_local_backend(app: &tauri::AppHandle) -> Result<(), String> {
    let pid_path = backend_pid_path(app)?;
    let pid_raw = fs::read_to_string(&pid_path).map_err(|err| err.to_string())?;
    let pid = pid_raw
        .trim()
        .parse::<i32>()
        .map_err(|_| "Invalid backend pid file".to_string())?;
    let status = Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status()
        .map_err(|err| err.to_string())?;
    if !status.success() {
        return Err("Failed to stop local backend sidecar (SIGTERM).".to_string());
    }

    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        if !local_backend_up() {
            let _ = fs::remove_file(&pid_path);
            return Ok(());
        }
        thread::sleep(Duration::from_millis(200));
    }

    let _ = Command::new("kill")
        .arg("-KILL")
        .arg(pid.to_string())
        .status();
    let _ = fs::remove_file(&pid_path);
    Ok(())
}

#[cfg(not(unix))]
fn stop_local_backend(app: &tauri::AppHandle) -> Result<(), String> {
    let pid_path = backend_pid_path(app)?;
    let pid_raw = fs::read_to_string(&pid_path).map_err(|err| err.to_string())?;
    let pid = pid_raw
        .trim()
        .parse::<u32>()
        .map_err(|_| "Invalid backend pid file".to_string())?;
    let _ = Command::new("taskkill")
        .arg("/PID")
        .arg(pid.to_string())
        .arg("/T")
        .arg("/F")
        .status();

    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        if !local_backend_up() {
            let _ = fs::remove_file(&pid_path);
            return Ok(());
        }
        thread::sleep(Duration::from_millis(200));
    }

    let _ = fs::remove_file(&pid_path);
    Ok(())
}

fn command_exists(binary: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| {
            std::env::split_paths(&paths).any(|dir| {
                let candidate = dir.join(binary);
                if candidate.is_file() {
                    return true;
                }
                #[cfg(target_os = "windows")]
                {
                    for ext in ["exe", "cmd", "bat"] {
                        let with_ext = dir.join(format!("{binary}.{ext}"));
                        if with_ext.is_file() {
                            return true;
                        }
                    }
                }
                false
            })
        })
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn detect_package_kind() -> String {
    if command_exists("msiexec") {
        return "msi".to_string();
    }
    "nsis".to_string()
}

#[cfg(target_os = "linux")]
fn detect_package_kind() -> String {
    if std::env::var_os("APPIMAGE").is_some() {
        return "appimage".to_string();
    }
    if let Ok(exe) = std::env::current_exe() {
        if exe
            .extension()
            .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("appimage"))
            .unwrap_or(false)
        {
            return "appimage".to_string();
        }
    }
    if command_exists("dpkg") {
        return "deb".to_string();
    }
    if command_exists("rpm") {
        return "rpm".to_string();
    }
    "appimage".to_string()
}

#[cfg(all(not(target_os = "linux"), not(target_os = "windows")))]
fn detect_package_kind() -> String {
    "appimage".to_string()
}

fn version_parts(version: &str) -> Vec<u64> {
    let mut parts = Vec::new();
    let mut current = String::new();
    for ch in version.chars() {
        if ch.is_ascii_digit() {
            current.push(ch);
            continue;
        }
        if !current.is_empty() {
            if let Ok(value) = current.parse::<u64>() {
                parts.push(value);
            }
            current.clear();
        }
    }
    if !current.is_empty() {
        if let Ok(value) = current.parse::<u64>() {
            parts.push(value);
        }
    }
    if parts.is_empty() {
        parts.push(0);
    }
    parts
}

fn is_version_newer(current: &str, latest: &str) -> bool {
    let current_parts = version_parts(current);
    let latest_parts = version_parts(latest);
    let max_len = current_parts.len().max(latest_parts.len());
    for i in 0..max_len {
        let a = *current_parts.get(i).unwrap_or(&0);
        let b = *latest_parts.get(i).unwrap_or(&0);
        if b > a {
            return true;
        }
        if b < a {
            return false;
        }
    }
    false
}

fn select_download_url(manifest: &UpdateManifest, package_kind: &str) -> Option<String> {
    let pick = |downloads: &ManifestDownloads, key: &str| -> Option<String> {
        match key {
            "deb" => downloads.deb.clone(),
            "rpm" => downloads.rpm.clone(),
            "msi" => downloads
                .msi
                .clone()
                .or_else(|| downloads.exe.clone())
                .or_else(|| downloads.nsis.clone()),
            "nsis" => downloads
                .nsis
                .clone()
                .or_else(|| downloads.exe.clone())
                .or_else(|| downloads.msi.clone()),
            "exe" => downloads
                .exe
                .clone()
                .or_else(|| downloads.nsis.clone())
                .or_else(|| downloads.msi.clone()),
            _ => downloads.appimage.clone(),
        }
    };
    if let Some(url) = manifest.download_url.clone() {
        if !url.trim().is_empty() {
            return Some(url);
        }
    }
    if let Some(downloads) = manifest.downloads.as_ref() {
        if let Some(url) = pick(downloads, package_kind) {
            return Some(url);
        }
    }
    if let Some(downloads) = manifest.linux.as_ref() {
        if let Some(url) = pick(downloads, package_kind) {
            return Some(url);
        }
    }
    if let Some(downloads) = manifest.windows.as_ref() {
        if let Some(url) = pick(downloads, package_kind) {
            return Some(url);
        }
    }
    None
}

fn fetch_manifest(manifest_url: &str) -> Result<UpdateManifest, String> {
    let output = Command::new("curl")
        .arg("-fsSL")
        .arg("--max-time")
        .arg("8")
        .arg(manifest_url)
        .output()
        .map_err(|err| format!("Failed to run curl: {err}"))?;
    if !output.status.success() {
        return Err(format!(
            "Failed to fetch manifest (curl exit code {}).",
            output.status.code().unwrap_or(-1)
        ));
    }
    let manifest_raw = String::from_utf8(output.stdout).map_err(|_| "Manifest is not valid UTF-8.".to_string())?;
    serde_json::from_str::<UpdateManifest>(&manifest_raw).map_err(|err| format!("Invalid manifest JSON: {err}"))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(|err| err.to_string())?;
    let entries = fs::read_dir(src).map_err(|err| err.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        let file_type = entry.file_type().map_err(|err| err.to_string())?;
        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if file_type.is_file() {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent).map_err(|err| err.to_string())?;
            }
            fs::copy(&src_path, &dst_path).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

fn run_integrity_checks(app: &tauri::AppHandle, pending: &PendingUpdateState) -> Result<(), String> {
    let backup_backend_home = PathBuf::from(&pending.backup_dir).join("backend-home");
    if !backup_backend_home.is_dir() {
        return Ok(());
    }

    let backend_home = backend_home_dir(app)?;
    if !backend_home.is_dir() {
        return Err("Missing backend-home directory.".to_string());
    }

    for sub in ["data", "logs", "sessions"] {
        let backup_sub = backup_backend_home.join(sub);
        if backup_sub.is_dir() && !backend_home.join(sub).is_dir() {
            return Err(format!("Missing backend-home/{sub} directory."));
        }
    }

    let backup_db = backup_backend_home.join("data").join("sessions.db");
    if backup_db.is_file() && !backend_home.join("data").join("sessions.db").is_file() {
        return Err("Missing backend-home/data/sessions.db".to_string());
    }
    Ok(())
}

fn restore_from_backup(app: &tauri::AppHandle, pending: &PendingUpdateState) -> Result<(), String> {
    let backup_dir = PathBuf::from(&pending.backup_dir);
    if !backup_dir.is_dir() {
        return Err("Backup directory not found.".to_string());
    }

    let backup_backend_home = backup_dir.join("backend-home");
    let live_backend_home = backend_home_dir(app)?;
    if backup_backend_home.is_dir() {
        if live_backend_home.exists() {
            let failed_name = format!("backend-home.failed.{}", now_unix_ts());
            let failed_path = app_data_root(app)?.join(failed_name);
            let _ = fs::rename(&live_backend_home, failed_path);
        }
        copy_dir_recursive(&backup_backend_home, &live_backend_home)?;
    }

    let backup_secrets = backup_dir.join(SECRETS_FILE_NAME);
    if backup_secrets.is_file() {
        let live_secrets = secrets_path(app)?;
        if let Some(parent) = live_secrets.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        fs::copy(backup_secrets, live_secrets).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn backend_restart(app: tauri::AppHandle) -> Result<bool, String> {
    if !local_backend_autostart_enabled() {
        return Err("Backend autostart is disabled in this build.".to_string());
    }
    let pid_path = backend_pid_path(&app)?;
    if pid_path.exists() {
        stop_local_backend(&app)?;
    }
    start_local_backend(&app)?;
    Ok(true)
}

#[derive(Debug, Serialize)]
struct BackendStatus {
    healthy: bool,
    startup_error: Option<String>,
}

#[tauri::command]
fn backend_status() -> BackendStatus {
    BackendStatus {
        healthy: local_backend_up(),
        startup_error: get_backend_startup_error(),
    }
}

#[tauri::command]
fn updater_check(manifest_url: Option<String>) -> UpdateCheckResponse {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let manifest_url = manifest_url
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_UPDATE_MANIFEST_URL.to_string());
    let package_kind = detect_package_kind();
    match fetch_manifest(&manifest_url) {
        Ok(manifest) => {
            let latest_version = manifest.version.trim().to_string();
            let available = is_version_newer(&current_version, &latest_version);
            let download_url = select_download_url(&manifest, &package_kind);
            UpdateCheckResponse {
                current_version,
                latest_version: Some(latest_version),
                available,
                package_kind,
                manifest_url,
                download_url,
                notes: manifest.notes.clone(),
                published_at: manifest.published_at.clone(),
                error: None,
            }
        }
        Err(err) => UpdateCheckResponse {
            current_version,
            latest_version: None,
            available: false,
            package_kind,
            manifest_url,
            download_url: None,
            notes: None,
            published_at: None,
            error: Some(err),
        },
    }
}

#[tauri::command]
fn updater_prepare(app: tauri::AppHandle, to_version: String) -> Result<UpdatePrepareResponse, String> {
    let to_version = to_version.trim();
    if to_version.is_empty() {
        return Err("Missing target version for update backup.".to_string());
    }

    let backups_root = update_backups_root(&app)?;
    fs::create_dir_all(&backups_root).map_err(|err| err.to_string())?;
    let backup_tag = format!("{}_{}", now_unix_ts(), sanitize_label(to_version));
    let backup_dir = backups_root.join(backup_tag);
    fs::create_dir_all(&backup_dir).map_err(|err| err.to_string())?;

    let backend_home = backend_home_dir(&app)?;
    if backend_home.is_dir() {
        copy_dir_recursive(&backend_home, &backup_dir.join("backend-home"))?;
    }
    let secrets = secrets_path(&app)?;
    if secrets.is_file() {
        fs::copy(&secrets, backup_dir.join(SECRETS_FILE_NAME)).map_err(|err| err.to_string())?;
    }

    let from_version = env!("CARGO_PKG_VERSION").to_string();
    let mut state = read_update_state(&app);
    state.pending = Some(PendingUpdateState {
        from_version: from_version.clone(),
        to_version: to_version.to_string(),
        backup_dir: backup_dir.to_string_lossy().to_string(),
        created_at: now_unix_ts(),
    });
    write_update_state(&app, &state)?;

    Ok(UpdatePrepareResponse {
        ok: true,
        from_version,
        to_version: to_version.to_string(),
        backup_dir: backup_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn updater_finalize(app: tauri::AppHandle) -> Result<UpdateFinalizeResponse, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let mut state = read_update_state(&app);
    let Some(pending) = state.pending.clone() else {
        return Ok(UpdateFinalizeResponse {
            checked: false,
            updated: false,
            restored: false,
            integrity_ok: true,
            message: String::new(),
            from_version: None,
            to_version: None,
        });
    };

    if !is_version_newer(&pending.from_version, &current_version)
        && pending.from_version != current_version
    {
        return Ok(UpdateFinalizeResponse {
            checked: false,
            updated: false,
            restored: false,
            integrity_ok: true,
            message: String::new(),
            from_version: Some(pending.from_version),
            to_version: Some(pending.to_version),
        });
    }

    if pending.from_version == current_version {
        return Ok(UpdateFinalizeResponse {
            checked: false,
            updated: false,
            restored: false,
            integrity_ok: true,
            message: String::new(),
            from_version: Some(pending.from_version),
            to_version: Some(pending.to_version),
        });
    }

    let mut restored = false;
    let mut integrity_ok = run_integrity_checks(&app, &pending).is_ok();
    let message = if integrity_ok {
        format!(
            "Update to {} completed. Local data integrity check passed.",
            current_version
        )
    } else {
        restore_from_backup(&app, &pending)?;
        restored = true;
        integrity_ok = run_integrity_checks(&app, &pending).is_ok();
        if integrity_ok {
            "Update integrity check failed; previous local data was restored from backup.".to_string()
        } else {
            "Update integrity check failed and automatic restore could not fully recover local data.".to_string()
        }
    };

    let result = UpdateIntegrityResult {
        from_version: pending.from_version.clone(),
        to_version: pending.to_version.clone(),
        checked_at: now_unix_ts(),
        updated: true,
        restored,
        integrity_ok,
        message: message.clone(),
    };

    state.pending = None;
    state.last_result = Some(result.clone());
    write_update_state(&app, &state)?;

    Ok(UpdateFinalizeResponse {
        checked: true,
        updated: true,
        restored,
        integrity_ok,
        message,
        from_version: Some(result.from_version),
        to_version: Some(result.to_version),
    })
}

#[tauri::command]
fn licensing_device_public_key(app: tauri::AppHandle) -> Result<String, String> {
    let sk = get_or_create_device_signing_key(&app)?;
    let pk = sk.verifying_key().to_bytes();
    Ok(B64.encode(pk))
}

#[tauri::command]
fn licensing_sign(app: tauri::AppHandle, message: String) -> Result<String, String> {
    let sk = get_or_create_device_signing_key(&app)?;
    let sig: Signature = sk.sign(message.as_bytes());
    Ok(B64.encode(sig.to_bytes()))
}

#[tauri::command]
fn licensing_get_token(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(get_license_token(&app))
}

#[tauri::command]
fn licensing_set_token(app: tauri::AppHandle, token: String) -> Result<bool, String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Ok(false);
    }
    set_license_token(&app, &token)?;
    Ok(true)
}

#[tauri::command]
fn licensing_clear_token(app: tauri::AppHandle) -> Result<bool, String> {
    clear_license_token(&app)?;
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    sanitize_runtime_env_for_snap_conflicts();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.maximize();
            }
            if let Err(err) = start_local_backend(app.handle()) {
                set_backend_startup_error(Some(err.clone()));
                eprintln!("[tgcampaigner] backend autostart warning: {err}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backend_status,
            backend_restart,
            updater_check,
            updater_prepare,
            updater_finalize,
            licensing_device_public_key,
            licensing_sign,
            licensing_get_token,
            licensing_set_token,
            licensing_clear_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
