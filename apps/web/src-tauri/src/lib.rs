use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

mod printer;

static OFFLINE_QUEUE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn offline_queue_lock() -> &'static Mutex<()> {
    OFFLINE_QUEUE_LOCK.get_or_init(|| Mutex::new(()))
}

fn lock_offline_queue() -> Result<MutexGuard<'static, ()>, String> {
    offline_queue_lock()
        .lock()
        .map_err(|_| "La cola offline esta bloqueada por un estado inconsistente".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub ruc: String,
    pub razon_social: String,
    pub certificado_path: Option<String>,
    pub certificado_password: Option<String>,
    pub sunat_endpoint: String,
    pub offline_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderPair {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineRequestInput {
    pub endpoint: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<HeaderPair>,
    pub body: Option<String>,
    pub tenant_id: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineQueueItem {
    pub id: String,
    pub endpoint: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<HeaderPair>,
    pub body: Option<String>,
    pub tenant_id: Option<String>,
    pub user_id: Option<String>,
    pub status: String,
    pub attempts: u32,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_error: Option<String>,
    pub response_status: Option<u16>,
    pub response_body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineStatus {
    pub offline_mode: bool,
    pub total: usize,
    pub pending: usize,
    pub failed: usize,
    pub synced: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            ruc: String::new(),
            razon_social: String::new(),
            certificado_path: None,
            certificado_password: None,
            sunat_endpoint: String::new(),
            offline_mode: false,
        }
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No se pudo resolver el directorio de configuracion: {e}"))?;
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("No se pudo crear el directorio de configuracion: {e}"))?;
    Ok(config_dir.join("config.json"))
}

fn offline_outbox_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No se pudo resolver el directorio de configuracion: {e}"))?;
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("No se pudo crear el directorio de configuracion: {e}"))?;
    Ok(config_dir.join("offline_outbox.json"))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn read_offline_queue(app: &AppHandle) -> Result<Vec<OfflineQueueItem>, String> {
    let path = offline_outbox_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(path)
        .map_err(|e| format!("No se pudo leer la cola offline: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Cola offline invalida: {e}"))
}

fn write_offline_queue(app: &AppHandle, items: &[OfflineQueueItem]) -> Result<(), String> {
    let path = offline_outbox_path(app)?;
    let raw = serde_json::to_string_pretty(items)
        .map_err(|e| format!("No se pudo serializar la cola offline: {e}"))?;
    write_file_replace(&path, raw)
        .map_err(|e| format!("No se pudo guardar la cola offline: {e}"))
}

fn write_file_replace(path: &PathBuf, raw: String) -> std::io::Result<()> {
    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, raw)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temp_path, path)
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }

    let raw = fs::read_to_string(path)
        .map_err(|e| format!("No se pudo leer la configuracion local: {e}"))?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("Configuracion local invalida: {e}"))
}

#[tauri::command]
fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    let raw = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("No se pudo serializar la configuracion local: {e}"))?;
    write_file_replace(&path, raw)
        .map_err(|e| format!("No se pudo guardar la configuracion local: {e}"))
}

#[tauri::command]
fn enqueue_offline_request(
    app: AppHandle,
    request: OfflineRequestInput,
) -> Result<OfflineQueueItem, String> {
    let _guard = lock_offline_queue()?;
    let mut queue = read_offline_queue(&app)?;
    let timestamp = now_ms();
    let item = OfflineQueueItem {
        id: Uuid::new_v4().to_string(),
        endpoint: request.endpoint,
        method: request.method.to_uppercase(),
        url: request.url,
        headers: request.headers,
        body: request.body,
        tenant_id: request.tenant_id,
        user_id: request.user_id,
        status: "pending".to_string(),
        attempts: 0,
        created_at: timestamp,
        updated_at: timestamp,
        last_error: None,
        response_status: None,
        response_body: None,
    };

    queue.push(item.clone());
    write_offline_queue(&app, &queue)?;
    Ok(item)
}

#[tauri::command]
fn list_offline_requests(app: AppHandle) -> Result<Vec<OfflineQueueItem>, String> {
    let _guard = lock_offline_queue()?;
    read_offline_queue(&app)
}

#[tauri::command]
fn mark_offline_request_synced(
    app: AppHandle,
    id: String,
    response_status: u16,
    response_body: Option<String>,
) -> Result<(), String> {
    let _guard = lock_offline_queue()?;
    let mut queue = read_offline_queue(&app)?;
    let mut found = false;
    for item in &mut queue {
        if item.id == id {
            item.status = "synced".to_string();
            item.response_status = Some(response_status);
            item.response_body = response_body.clone();
            item.last_error = None;
            item.updated_at = now_ms();
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!("No existe item offline con id {id}"));
    }

    write_offline_queue(&app, &queue)
}

#[tauri::command]
fn mark_offline_request_failed(
    app: AppHandle,
    id: String,
    error: String,
) -> Result<(), String> {
    let _guard = lock_offline_queue()?;
    let mut queue = read_offline_queue(&app)?;
    let mut found = false;
    for item in &mut queue {
        if item.id == id {
            item.status = "failed".to_string();
            item.attempts = item.attempts.saturating_add(1);
            item.last_error = Some(error.clone());
            item.updated_at = now_ms();
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!("No existe item offline con id {id}"));
    }

    write_offline_queue(&app, &queue)
}

#[tauri::command]
fn delete_offline_request(app: AppHandle, id: String) -> Result<(), String> {
    let _guard = lock_offline_queue()?;
    let mut queue = read_offline_queue(&app)?;
    let original_len = queue.len();
    queue.retain(|item| item.id != id);

    if queue.len() == original_len {
        return Err(format!("No existe item offline con id {id}"));
    }

    write_offline_queue(&app, &queue)
}

#[tauri::command]
fn get_offline_status(app: AppHandle) -> Result<OfflineStatus, String> {
    let config = load_config(app.clone()).unwrap_or_default();
    let _guard = lock_offline_queue()?;
    let queue = read_offline_queue(&app)?;
    Ok(OfflineStatus {
        offline_mode: config.offline_mode,
        total: queue.len(),
        pending: queue.iter().filter(|item| item.status == "pending").count(),
        failed: queue.iter().filter(|item| item.status == "failed").count(),
        synced: queue.iter().filter(|item| item.status == "synced").count(),
    })
}

#[tauri::command]
async fn get_printers() -> Result<Vec<String>, String> {
    printer::get_available_printers().await
}

#[tauri::command]
async fn print_document(pdf_data: Vec<u8>, printer_name: Option<String>) -> Result<(), String> {
    printer::print_pdf(&pdf_data, printer_name.as_deref()).await
}

#[tauri::command]
async fn sign_xml(_xml_content: String) -> Result<String, String> {
    Err("La firma XML se ejecuta en el backend API en modo desktop online-first.".to_string())
}

#[tauri::command]
async fn send_to_sunat(_signed_xml: String) -> Result<String, String> {
    Err("El envio fiscal se ejecuta en el backend API en modo desktop online-first.".to_string())
}

#[tauri::command]
async fn generate_pdf(_xml_content: String, _template: Option<String>) -> Result<Vec<u8>, String> {
    Err("La generacion de PDF fiscal se ejecuta en el backend API en modo desktop online-first.".to_string())
}

#[tauri::command]
async fn backup_database(app: AppHandle, backup_path: String) -> Result<(), String> {
    let config = load_config(app.clone()).unwrap_or_default();
    let _guard = lock_offline_queue()?;
    let queue = read_offline_queue(&app)?;
    let payload = serde_json::json!({
        "kind": "erp_desktop_offline_backup",
        "generated_at": now_ms(),
        "config": config,
        "offline_outbox": queue,
        "note": "Backup local del cliente desktop. La base autoritativa sigue siendo backend/BD."
    });
    let raw = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("No se pudo serializar backup local: {e}"))?;
    fs::write(backup_path, raw).map_err(|e| format!("No se pudo escribir backup local: {e}"))
}

#[tauri::command]
async fn export_sire_data(_periodo: String) -> Result<String, String> {
    Err("La exportacion SIRE se ejecuta en el backend API en modo desktop online-first.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            enqueue_offline_request,
            list_offline_requests,
            mark_offline_request_synced,
            mark_offline_request_failed,
            delete_offline_request,
            get_offline_status,
            get_printers,
            print_document,
            sign_xml,
            send_to_sunat,
            generate_pdf,
            backup_database,
            export_sire_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
