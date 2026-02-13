use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::path::BaseDirectory;
use tauri::Manager;

const KEYRING_SERVICE: &str = "tgcampaigner-control";
const KEY_DEVICE_SK: &str = "device_sk_v1";
const KEY_LICENSE_TOKEN: &str = "license_token_v1";
const SECRETS_FILE_NAME: &str = "secrets.json";
const BACKEND_PORT: u16 = 8000;

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

fn local_backend_up() -> bool {
    TcpStream::connect_timeout(&local_backend_addr(), Duration::from_millis(250)).is_ok()
}

fn local_backend_autostart_enabled() -> bool {
    std::env::var("TGCAMPAIGNER_BACKEND_AUTOSTART")
        .unwrap_or_else(|_| "1".to_string())
        .trim()
        != "0"
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

    let candidates = [
        "backend/tgcampaigner-backend-linux-x64",
        "backend/tgcampaigner-backend",
        "resources/backend/tgcampaigner-backend-linux-x64",
        "resources/backend/tgcampaigner-backend",
        "tgcampaigner-backend-linux-x64",
        "tgcampaigner-backend",
    ];
    for rel in candidates {
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
        return Ok(());
    }

    let bin = resolve_backend_binary(app).ok_or_else(|| {
        "No bundled backend sidecar found; expected resources/backend/tgcampaigner-backend-linux-x64".to_string()
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&bin, fs::Permissions::from_mode(0o755));
    }

    let backend_home = app
        .path()
        .resolve("backend-home", BaseDirectory::AppData)
        .map_err(|err| err.to_string())?;
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
        )
        .current_dir(&backend_home)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));

    let _child = cmd.spawn().map_err(|err| {
        format!(
            "Failed to start local backend sidecar '{}': {}",
            bin.display(),
            err
        )
    })?;

    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if local_backend_up() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }

    Err("Local backend sidecar started but did not become healthy on 127.0.0.1:8000".to_string())
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Err(err) = start_local_backend(app.handle()) {
                eprintln!("[tgcampaigner] backend autostart warning: {err}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            licensing_device_public_key,
            licensing_sign,
            licensing_get_token,
            licensing_set_token,
            licensing_clear_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
