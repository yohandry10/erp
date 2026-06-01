use rusqlite::{params, Connection};
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

fn offline_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No se pudo resolver el directorio de configuracion: {e}"))?;
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("No se pudo crear el directorio de configuracion: {e}"))?;
    Ok(config_dir.join("erp_local.sqlite"))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn open_local_db(app: &AppHandle) -> Result<Connection, String> {
    let path = offline_db_path(app)?;
    let conn = Connection::open(path).map_err(|e| format!("No se pudo abrir SQLite local: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("No se pudo activar WAL en SQLite local: {e}"))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("No se pudo activar foreign_keys en SQLite local: {e}"))?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS local_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS offline_requests (
            id TEXT PRIMARY KEY,
            endpoint TEXT NOT NULL,
            method TEXT NOT NULL,
            url TEXT NOT NULL,
            headers_json TEXT NOT NULL DEFAULT '[]',
            body TEXT,
            tenant_id TEXT,
            user_id TEXT,
            status TEXT NOT NULL CHECK (status IN ('pending', 'failed', 'synced')),
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            last_error TEXT,
            response_status INTEGER,
            response_body TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_offline_requests_status_updated
            ON offline_requests(status, updated_at);
        CREATE INDEX IF NOT EXISTS idx_offline_requests_tenant_status
            ON offline_requests(tenant_id, status);
        "#,
    )
    .map_err(|e| format!("No se pudo inicializar SQLite local: {e}"))?;

    migrate_legacy_json_outbox(app, &conn)?;
    Ok(conn)
}

fn migrate_legacy_json_outbox(app: &AppHandle, conn: &Connection) -> Result<(), String> {
    let existing: i64 = conn
        .query_row("SELECT COUNT(*) FROM offline_requests", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("No se pudo contar cola offline SQLite: {e}"))?;
    if existing > 0 {
        return Ok(());
    }

    let path = offline_outbox_path(app)?;
    if !path.exists() {
        return Ok(());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("No se pudo leer cola offline legacy: {e}"))?;
    let items: Vec<OfflineQueueItem> =
        serde_json::from_str(&raw).map_err(|e| format!("Cola offline legacy invalida: {e}"))?;

    for item in items {
        insert_offline_item(conn, &item)?;
    }

    let migrated_path = path.with_extension("json.migrated");
    let _ = fs::rename(path, migrated_path);
    Ok(())
}

fn insert_offline_item(conn: &Connection, item: &OfflineQueueItem) -> Result<(), String> {
    let headers_json = serde_json::to_string(&item.headers)
        .map_err(|e| format!("No se pudo serializar headers offline: {e}"))?;
    conn.execute(
        r#"
        INSERT OR REPLACE INTO offline_requests (
            id, endpoint, method, url, headers_json, body, tenant_id, user_id,
            status, attempts, created_at, updated_at, last_error, response_status, response_body
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        "#,
        params![
            &item.id,
            &item.endpoint,
            &item.method,
            &item.url,
            headers_json,
            &item.body,
            &item.tenant_id,
            &item.user_id,
            &item.status,
            item.attempts,
            item.created_at,
            item.updated_at,
            &item.last_error,
            item.response_status,
            &item.response_body,
        ],
    )
    .map_err(|e| format!("No se pudo guardar operacion offline en SQLite: {e}"))?;
    Ok(())
}

fn read_offline_queue(app: &AppHandle) -> Result<Vec<OfflineQueueItem>, String> {
    let conn = open_local_db(app)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, endpoint, method, url, headers_json, body, tenant_id, user_id,
                   status, attempts, created_at, updated_at, last_error, response_status, response_body
            FROM offline_requests
            ORDER BY created_at ASC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar lectura offline SQLite: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let headers_json: String = row.get(4)?;
            let headers: Vec<HeaderPair> = serde_json::from_str(&headers_json).unwrap_or_default();
            Ok(OfflineQueueItem {
                id: row.get(0)?,
                endpoint: row.get(1)?,
                method: row.get(2)?,
                url: row.get(3)?,
                headers,
                body: row.get(5)?,
                tenant_id: row.get(6)?,
                user_id: row.get(7)?,
                status: row.get(8)?,
                attempts: row.get::<_, i64>(9)? as u32,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                last_error: row.get(12)?,
                response_status: row.get::<_, Option<i64>>(13)?.map(|value| value as u16),
                response_body: row.get(14)?,
            })
        })
        .map_err(|e| format!("No se pudo leer cola offline SQLite: {e}"))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("Fila offline SQLite invalida: {e}"))?);
    }
    Ok(items)
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
    serde_json::from_str(&raw).map_err(|e| format!("Configuracion local invalida: {e}"))
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
    let conn = open_local_db(&app)?;
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

    insert_offline_item(&conn, &item)?;
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
    let conn = open_local_db(&app)?;
    let changed = conn
        .execute(
            r#"
            UPDATE offline_requests
            SET status = 'synced',
                response_status = ?2,
                response_body = ?3,
                last_error = NULL,
                updated_at = ?4
            WHERE id = ?1
            "#,
            params![&id, response_status as i64, &response_body, now_ms()],
        )
        .map_err(|e| format!("No se pudo marcar operacion offline sincronizada: {e}"))?;

    if changed == 0 {
        return Err(format!("No existe item offline con id {id}"));
    }

    Ok(())
}

#[tauri::command]
fn mark_offline_request_failed(app: AppHandle, id: String, error: String) -> Result<(), String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let changed = conn
        .execute(
            r#"
            UPDATE offline_requests
            SET status = 'failed',
                attempts = attempts + 1,
                last_error = ?2,
                updated_at = ?3
            WHERE id = ?1
            "#,
            params![&id, &error, now_ms()],
        )
        .map_err(|e| format!("No se pudo marcar operacion offline fallida: {e}"))?;

    if changed == 0 {
        return Err(format!("No existe item offline con id {id}"));
    }

    Ok(())
}

#[tauri::command]
fn delete_offline_request(app: AppHandle, id: String) -> Result<(), String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let changed = conn
        .execute("DELETE FROM offline_requests WHERE id = ?1", params![&id])
        .map_err(|e| format!("No se pudo eliminar operacion offline: {e}"))?;

    if changed == 0 {
        return Err(format!("No existe item offline con id {id}"));
    }

    Ok(())
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
    Err(
        "La generacion de PDF fiscal se ejecuta en el backend API en modo desktop online-first."
            .to_string(),
    )
}

#[tauri::command]
async fn backup_database(app: AppHandle, backup_path: String) -> Result<(), String> {
    let config = load_config(app.clone()).unwrap_or_default();
    let _guard = lock_offline_queue()?;
    let queue = read_offline_queue(&app)?;
    let sqlite_path = offline_db_path(&app)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();
    let payload = serde_json::json!({
        "kind": "erp_desktop_offline_backup",
        "generated_at": now_ms(),
        "config": config,
        "offline_outbox": queue,
        "sqlite_path": sqlite_path,
        "note": "Backup local del cliente desktop. La base autoritativa sigue siendo backend/BD."
    });
    let raw = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("No se pudo serializar backup local: {e}"))?;
    fs::write(backup_path, raw).map_err(|e| format!("No se pudo escribir backup local: {e}"))
}

#[tauri::command]
async fn export_sire_data(_periodo: String) -> Result<String, String> {
    Err(
        "La exportacion SIRE se ejecuta en el backend API en modo desktop online-first."
            .to_string(),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
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
