use base64::{engine::general_purpose, Engine as _};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::ptr;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

mod crypto;
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
pub struct LocalIdMapping {
    pub local_id: String,
    pub remote_id: String,
    pub entity_type: String,
    pub endpoint: String,
    pub synced_at: i64,
    pub response_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineStatus {
    pub offline_mode: bool,
    pub total: usize,
    pub pending: usize,
    pub failed: usize,
    pub synced: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFirstResponse {
    pub status: u16,
    pub body: String,
    pub headers: Vec<HeaderPair>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryLocalResponse {
    pub status: u16,
    pub headers: Vec<HeaderPair>,
    pub body_base64: String,
    pub cached_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineFiscalDocumentInput {
    pub document_type: String,
    pub serie: Option<String>,
    pub cliente_ruc: Option<String>,
    pub cliente_nombre: Option<String>,
    pub moneda: Option<String>,
    pub subtotal: f64,
    pub igv: f64,
    pub total: f64,
    pub items: Vec<Value>,
    pub source_type: Option<String>,
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineFiscalDocument {
    pub id: String,
    pub document_type: String,
    pub serie: String,
    pub numero: i64,
    pub estado: String,
    pub xml_content: String,
    pub signed_xml: Option<String>,
    pub pdf_base64: Option<String>,
    pub hash: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFirstWriteInput {
    pub endpoint: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<HeaderPair>,
    pub body: Option<String>,
    pub tenant_id: Option<String>,
    pub user_id: Option<String>,
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

fn auth_token_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No se pudo resolver el directorio de configuracion: {e}"))?;
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("No se pudo crear el directorio de configuracion: {e}"))?;
    Ok(config_dir.join("auth_token.dat"))
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

        CREATE TABLE IF NOT EXISTS local_api_snapshots (
            cache_key TEXT PRIMARY KEY,
            endpoint TEXT NOT NULL,
            url TEXT NOT NULL,
            tenant_id TEXT,
            status INTEGER NOT NULL,
            headers_json TEXT NOT NULL DEFAULT '[]',
            body TEXT NOT NULL,
            cached_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_local_api_snapshots_endpoint
            ON local_api_snapshots(endpoint, cached_at);

        CREATE TABLE IF NOT EXISTS local_binary_cache (
            cache_key TEXT PRIMARY KEY,
            endpoint TEXT NOT NULL,
            url TEXT NOT NULL,
            tenant_id TEXT,
            status INTEGER NOT NULL,
            headers_json TEXT NOT NULL DEFAULT '[]',
            body_base64 TEXT NOT NULL,
            cached_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_local_binary_cache_endpoint
            ON local_binary_cache(endpoint, cached_at);

        CREATE TABLE IF NOT EXISTS local_id_map (
            local_id TEXT PRIMARY KEY,
            remote_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            synced_at INTEGER NOT NULL,
            response_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_local_id_map_remote
            ON local_id_map(remote_id, entity_type);

        CREATE TABLE IF NOT EXISTS local_fiscal_series (
            tenant_id TEXT NOT NULL DEFAULT '__global__',
            document_type TEXT NOT NULL,
            serie TEXT NOT NULL,
            ultimo_numero INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (tenant_id, document_type, serie)
        );

        CREATE TABLE IF NOT EXISTS local_fiscal_documents (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT '__global__',
            document_type TEXT NOT NULL,
            serie TEXT NOT NULL,
            numero INTEGER NOT NULL,
            estado TEXT NOT NULL CHECK (estado IN ('GENERADO_LOCAL', 'FIRMADO_LOCAL', 'PENDIENTE_ENVIO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'FALLIDO')),
            cliente_ruc TEXT,
            cliente_nombre TEXT,
            moneda TEXT NOT NULL DEFAULT 'PEN',
            subtotal REAL NOT NULL DEFAULT 0,
            igv REAL NOT NULL DEFAULT 0,
            total REAL NOT NULL DEFAULT 0,
            source_type TEXT,
            source_id TEXT,
            xml_content TEXT NOT NULL,
            signed_xml TEXT,
            pdf_base64 TEXT,
            hash TEXT NOT NULL,
            response_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(tenant_id, document_type, serie, numero)
        );

        CREATE INDEX IF NOT EXISTS idx_local_fiscal_documents_estado
            ON local_fiscal_documents(tenant_id, estado, updated_at);
        CREATE INDEX IF NOT EXISTS idx_local_fiscal_documents_source
            ON local_fiscal_documents(tenant_id, source_type, source_id);

        CREATE TABLE IF NOT EXISTS pos_products (
            id TEXT PRIMARY KEY,
            tenant_id TEXT,
            codigo TEXT,
            nombre TEXT NOT NULL,
            stock_actual REAL NOT NULL DEFAULT 0,
            stock_disponible REAL NOT NULL DEFAULT 0,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pos_cash_sessions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT,
            caja_id TEXT NOT NULL,
            estado TEXT NOT NULL CHECK (estado IN ('ABIERTA', 'CERRADA')),
            monto_inicio REAL NOT NULL DEFAULT 0,
            monto_cierre REAL,
            opened_at INTEGER NOT NULL,
            closed_at INTEGER,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pos_cash_sessions_estado
            ON pos_cash_sessions(estado, updated_at);

        CREATE TABLE IF NOT EXISTS pos_sales (
            id TEXT PRIMARY KEY,
            tenant_id TEXT,
            idempotency_key TEXT NOT NULL UNIQUE,
            sesion_caja_id TEXT NOT NULL,
            numero_ticket TEXT NOT NULL,
            total REAL NOT NULL,
            body_json TEXT NOT NULL,
            response_json TEXT NOT NULL,
            sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'failed')),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pos_sales_session_created
            ON pos_sales(sesion_caja_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pos_sales_sync_status
            ON pos_sales(sync_status, updated_at);

        CREATE TABLE IF NOT EXISTS local_customers (
            id TEXT PRIMARY KEY,
            tenant_id TEXT,
            documento TEXT,
            razon_social TEXT NOT NULL,
            data_json TEXT NOT NULL,
            deleted INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_local_customers_documento
            ON local_customers(documento);
        CREATE INDEX IF NOT EXISTS idx_local_customers_updated
            ON local_customers(updated_at);

        CREATE TABLE IF NOT EXISTS local_sales_documents (
            id TEXT PRIMARY KEY,
            tenant_id TEXT,
            kind TEXT NOT NULL CHECK (kind IN ('quote', 'order')),
            numero TEXT NOT NULL,
            cliente_id TEXT,
            estado TEXT NOT NULL,
            total REAL NOT NULL DEFAULT 0,
            data_json TEXT NOT NULL,
            deleted INTEGER NOT NULL DEFAULT 0,
            sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'failed')),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_local_sales_documents_kind_updated
            ON local_sales_documents(kind, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_local_sales_documents_cliente
            ON local_sales_documents(cliente_id, kind);

        CREATE TABLE IF NOT EXISTS local_generic_records (
            id TEXT PRIMARY KEY,
            tenant_id TEXT,
            endpoint TEXT NOT NULL,
            collection_endpoint TEXT NOT NULL,
            method TEXT NOT NULL,
            data_json TEXT NOT NULL,
            deleted INTEGER NOT NULL DEFAULT 0,
            sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'failed')),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_local_generic_records_collection
            ON local_generic_records(collection_endpoint, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_local_generic_records_sync
            ON local_generic_records(sync_status, updated_at);
        "#,
    )
    .map_err(|e| format!("No se pudo inicializar SQLite local: {e}"))?;

    ensure_text_column(&conn, "local_api_snapshots", "tenant_id")?;
    ensure_text_column(&conn, "local_binary_cache", "tenant_id")?;
    ensure_text_column(&conn, "pos_products", "tenant_id")?;
    ensure_text_column(&conn, "pos_cash_sessions", "tenant_id")?;
    ensure_text_column(&conn, "pos_sales", "tenant_id")?;
    ensure_text_column(&conn, "local_customers", "tenant_id")?;
    ensure_text_column(&conn, "local_sales_documents", "tenant_id")?;
    ensure_text_column(&conn, "local_generic_records", "tenant_id")?;
    ensure_text_column(&conn, "local_fiscal_series", "tenant_id")?;
    ensure_text_column(&conn, "local_fiscal_documents", "tenant_id")?;
    migrate_fiscal_tables_tenant_scope(&conn)?;

    migrate_legacy_json_outbox(app, &conn)?;
    Ok(conn)
}

fn ensure_text_column(conn: &Connection, table: &str, column: &str) -> Result<(), String> {
    let pragma = format!("PRAGMA table_info({table})");
    let mut stmt = conn
        .prepare(&pragma)
        .map_err(|e| format!("No se pudo inspeccionar tabla local {table}: {e}"))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("No se pudo leer columnas de tabla local {table}: {e}"))?;
    for row in rows {
        if row.map_err(|e| format!("Columna invalida en tabla local {table}: {e}"))? == column {
            return Ok(());
        }
    }
    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} TEXT");
    conn.execute(&sql, [])
        .map_err(|e| format!("No se pudo agregar columna local {table}.{column}: {e}"))?;
    Ok(())
}

fn table_sql(conn: &Connection, table: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1",
        params![table],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("No se pudo leer schema local de {table}: {e}"))
}

fn fiscal_tables_need_tenant_migration(conn: &Connection) -> Result<bool, String> {
    let Some(series_sql) = table_sql(conn, "local_fiscal_series")? else {
        return Ok(false);
    };
    let Some(documents_sql) = table_sql(conn, "local_fiscal_documents")? else {
        return Ok(false);
    };
    Ok(!series_sql.contains("PRIMARY KEY (tenant_id, document_type, serie)")
        || !documents_sql.contains("UNIQUE(tenant_id, document_type, serie, numero)"))
}

fn migrate_fiscal_tables_tenant_scope(conn: &Connection) -> Result<(), String> {
    if !fiscal_tables_need_tenant_migration(conn)? {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = OFF;

        CREATE TABLE IF NOT EXISTS local_fiscal_series_v2 (
            tenant_id TEXT NOT NULL DEFAULT '__global__',
            document_type TEXT NOT NULL,
            serie TEXT NOT NULL,
            ultimo_numero INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (tenant_id, document_type, serie)
        );

        INSERT OR REPLACE INTO local_fiscal_series_v2
            (tenant_id, document_type, serie, ultimo_numero, updated_at)
        SELECT
            COALESCE(NULLIF(tenant_id, ''), '__global__'),
            document_type,
            serie,
            ultimo_numero,
            updated_at
        FROM local_fiscal_series;

        DROP TABLE local_fiscal_series;
        ALTER TABLE local_fiscal_series_v2 RENAME TO local_fiscal_series;

        CREATE TABLE IF NOT EXISTS local_fiscal_documents_v2 (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT '__global__',
            document_type TEXT NOT NULL,
            serie TEXT NOT NULL,
            numero INTEGER NOT NULL,
            estado TEXT NOT NULL CHECK (estado IN ('GENERADO_LOCAL', 'FIRMADO_LOCAL', 'PENDIENTE_ENVIO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'FALLIDO')),
            cliente_ruc TEXT,
            cliente_nombre TEXT,
            moneda TEXT NOT NULL DEFAULT 'PEN',
            subtotal REAL NOT NULL DEFAULT 0,
            igv REAL NOT NULL DEFAULT 0,
            total REAL NOT NULL DEFAULT 0,
            source_type TEXT,
            source_id TEXT,
            xml_content TEXT NOT NULL,
            signed_xml TEXT,
            pdf_base64 TEXT,
            hash TEXT NOT NULL,
            response_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(tenant_id, document_type, serie, numero)
        );

        INSERT OR REPLACE INTO local_fiscal_documents_v2
            (id, tenant_id, document_type, serie, numero, estado, cliente_ruc, cliente_nombre,
             moneda, subtotal, igv, total, source_type, source_id, xml_content, signed_xml,
             pdf_base64, hash, response_json, created_at, updated_at)
        SELECT
            id,
            COALESCE(NULLIF(tenant_id, ''), '__global__'),
            document_type,
            serie,
            numero,
            estado,
            cliente_ruc,
            cliente_nombre,
            moneda,
            subtotal,
            igv,
            total,
            source_type,
            source_id,
            xml_content,
            signed_xml,
            pdf_base64,
            hash,
            response_json,
            created_at,
            updated_at
        FROM local_fiscal_documents;

        DROP TABLE local_fiscal_documents;
        ALTER TABLE local_fiscal_documents_v2 RENAME TO local_fiscal_documents;

        CREATE INDEX IF NOT EXISTS idx_local_fiscal_documents_estado
            ON local_fiscal_documents(tenant_id, estado, updated_at);
        CREATE INDEX IF NOT EXISTS idx_local_fiscal_documents_source
            ON local_fiscal_documents(tenant_id, source_type, source_id);

        PRAGMA foreign_keys = ON;
        "#,
    )
    .map_err(|e| format!("No se pudo migrar tablas fiscales locales por tenant: {e}"))?;
    Ok(())
}

fn local_cache_key(endpoint: &str, url: &str) -> String {
    format!("{endpoint}|{url}")
}

fn scoped_cache_key(tenant_id: Option<&str>, endpoint: &str, url: &str) -> String {
    format!(
        "{}|{}",
        tenant_id.filter(|value| !value.trim().is_empty()).unwrap_or("__global__"),
        local_cache_key(endpoint, url)
    )
}

fn tenant_scope(tenant_id: Option<&str>) -> &str {
    tenant_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("__global__")
}

fn scoped_metadata_key(key: &str, tenant_id: Option<&str>) -> String {
    if tenant_id.filter(|value| !value.trim().is_empty()).is_some() {
        format!("{}:{key}", tenant_scope(tenant_id))
    } else {
        key.to_string()
    }
}

fn collection_endpoint(endpoint: &str) -> String {
    let trimmed = endpoint.trim_end_matches('/');
    let mut parts: Vec<&str> = trimmed.split('/').filter(|part| !part.is_empty()).collect();
    if parts.len() > 2 {
        if let Some(last) = parts.last() {
            let looks_like_id = last.starts_with("local-")
                || last.len() >= 24
                || last.chars().any(|ch| ch.is_ascii_digit());
            if looks_like_id {
                parts.pop();
            }
        }
    }
    format!("/{}", parts.join("/"))
}

fn local_collection_endpoint_for_write(endpoint: &str) -> String {
    match endpoint {
        "/api/contabilidad/asiento-contable" => "/api/contabilidad/asientos".to_string(),
        "/api/documentos/crear" => "/api/documentos".to_string(),
        "/api/finanzas/tesoreria/lote" => "/api/finanzas/tesoreria/pagos".to_string(),
        "/api/usuarios-sistema/crear" => "/api/usuarios".to_string(),
        "/api/sire/generar-reporte" => "/api/sire/files".to_string(),
        _ if endpoint.starts_with("/api/cajas/movimientos/manual/") => {
            "/api/cajas/movimientos".to_string()
        }
        _ if endpoint.starts_with("/api/cajas/retiros/") => "/api/cajas/movimientos".to_string(),
        _ if endpoint.starts_with("/api/cajas/cambio-turno/") => {
            "/api/cajas/cambios-turno".to_string()
        }
        _ => collection_endpoint(endpoint),
    }
}

fn response_headers_json(headers: &[HeaderPair]) -> Result<String, String> {
    serde_json::to_string(headers).map_err(|e| format!("No se pudo serializar headers locales: {e}"))
}

fn header_value(headers: &[HeaderPair], name: &str) -> Option<String> {
    headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case(name))
        .map(|header| header.value.clone())
}

fn bearer_token_from_headers(headers: &[HeaderPair]) -> Option<String> {
    header_value(headers, "Authorization")
        .and_then(|value| {
            let trimmed = value.trim();
            trimmed
                .strip_prefix("Bearer ")
                .or_else(|| trimmed.strip_prefix("bearer "))
                .map(str::trim)
                .filter(|token| !token.is_empty())
                .map(str::to_string)
        })
}

fn with_local_entity_headers(
    input: &LocalFirstWriteInput,
    local_id: &str,
    entity_type: &str,
) -> LocalFirstWriteInput {
    let mut next = input.clone();
    next.headers
        .retain(|header| !header.name.eq_ignore_ascii_case("x-erp-local-id")
            && !header.name.eq_ignore_ascii_case("x-erp-local-entity-type"));
    next.headers.push(HeaderPair {
        name: "x-erp-local-id".to_string(),
        value: local_id.to_string(),
    });
    next.headers.push(HeaderPair {
        name: "x-erp-local-entity-type".to_string(),
        value: entity_type.to_string(),
    });
    next
}

fn with_json_body_fields(
    input: &LocalFirstWriteInput,
    fields: &[(&str, Value)],
) -> Result<LocalFirstWriteInput, String> {
    let mut body = parse_json_body(&input.body)?;
    let object = body
        .as_object_mut()
        .ok_or_else(|| "El cuerpo local-first debe ser un objeto JSON".to_string())?;
    for (key, value) in fields {
        object.insert((*key).to_string(), value.clone());
    }

    let mut next = input.clone();
    next.body = Some(
        serde_json::to_string(&body)
            .map_err(|e| format!("No se pudo serializar cuerpo local-first: {e}"))?,
    );
    Ok(next)
}

fn with_local_sync_contract(
    input: &LocalFirstWriteInput,
    local_id: &str,
    entity_type: &str,
) -> Result<LocalFirstWriteInput, String> {
    let with_headers = with_local_entity_headers(input, local_id, entity_type);
    if with_headers.body.is_none() {
        return Ok(with_headers);
    }

    let mut body = parse_json_body(&with_headers.body)?;
    if let Some(object) = body.as_object_mut() {
        object
            .entry("local_id".to_string())
            .or_insert_with(|| serde_json::json!(local_id));
        object
            .entry("external_id".to_string())
            .or_insert_with(|| serde_json::json!(local_id));
        object
            .entry("idempotency_key".to_string())
            .or_insert_with(|| serde_json::json!(local_id));
        object
            .entry("offline_entity_type".to_string())
            .or_insert_with(|| serde_json::json!(entity_type));
    }

    let mut next = with_headers;
    next.body = Some(
        serde_json::to_string(&body)
            .map_err(|e| format!("No se pudo serializar contrato de sync local: {e}"))?,
    );
    Ok(next)
}

fn offline_sync_headers(
    _access_token: Option<&str>,
    tenant_id: Option<&str>,
    local_id: &str,
    entity_type: &str,
) -> Vec<HeaderPair> {
    let mut headers = vec![
        HeaderPair {
            name: "Content-Type".to_string(),
            value: "application/json".to_string(),
        },
        HeaderPair {
            name: "x-erp-local-id".to_string(),
            value: local_id.to_string(),
        },
        HeaderPair {
            name: "x-erp-local-entity-type".to_string(),
            value: entity_type.to_string(),
        },
    ];
    if let Some(tenant) = tenant_id.filter(|value| !value.trim().is_empty()) {
        headers.push(HeaderPair {
            name: "x-tenant-id".to_string(),
            value: tenant.trim().to_string(),
        });
        headers.push(HeaderPair {
            name: "x-erp-tenant-id".to_string(),
            value: tenant.trim().to_string(),
        });
    }
    headers
}

fn json_success_response(data: Value, message: &str) -> Result<LocalFirstResponse, String> {
    let body = serde_json::to_string(&serde_json::json!({
        "success": true,
        "offline": true,
        "local_first": true,
        "message": message,
        "data": data
    }))
    .map_err(|e| format!("No se pudo serializar respuesta local: {e}"))?;

    Ok(LocalFirstResponse {
        status: 200,
        body,
        headers: vec![
            HeaderPair {
                name: "Content-Type".to_string(),
                value: "application/json".to_string(),
            },
            HeaderPair {
                name: "x-erp-local-first".to_string(),
                value: "true".to_string(),
            },
        ],
    })
}

fn parse_json_body(body: &Option<String>) -> Result<Value, String> {
    let raw = body
        .as_ref()
        .ok_or_else(|| "La operacion local requiere body JSON".to_string())?;
    serde_json::from_str(raw).map_err(|e| format!("Body JSON local invalido: {e}"))
}

fn value_number(value: &Value, key: &str) -> f64 {
    value.get(key).and_then(Value::as_f64).unwrap_or(0.0)
}

fn value_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

fn normalize_fiscal_sync_items(items: &[Value]) -> Vec<Value> {
    items
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let descripcion = value_string(item, "descripcion")
                .or_else(|| value_string(item, "nombre"))
                .or_else(|| value_string(item, "producto_nombre"))
                .unwrap_or_else(|| format!("Item {}", index + 1));
            let cantidad = item
                .get("cantidad")
                .and_then(Value::as_f64)
                .unwrap_or(1.0);
            let precio_unitario = item
                .get("precio_unitario")
                .or_else(|| item.get("precioUnitario"))
                .or_else(|| item.get("precio"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            let valor_venta = item
                .get("valor_venta")
                .or_else(|| item.get("valorVenta"))
                .or_else(|| item.get("subtotal"))
                .or_else(|| item.get("total"))
                .and_then(Value::as_f64)
                .unwrap_or(cantidad * precio_unitario);
            let igv = item
                .get("igv")
                .or_else(|| item.get("impuesto_igv"))
                .or_else(|| item.get("impuestos"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            serde_json::json!({
                "codigo": value_string(item, "codigo")
                    .or_else(|| value_string(item, "codigo_producto"))
                    .unwrap_or_else(|| format!("ITEM-{}", index + 1)),
                "producto_id": value_string(item, "producto_id"),
                "descripcion": descripcion,
                "cantidad": cantidad,
                "unidad": value_string(item, "unidad")
                    .or_else(|| value_string(item, "unidad_medida"))
                    .unwrap_or_else(|| "NIU".to_string()),
                "precio_unitario": precio_unitario,
                "valor_venta": valor_venta,
                "igv": igv,
                "precio_venta": item
                    .get("precio_venta")
                    .or_else(|| item.get("total"))
                    .and_then(Value::as_f64)
                    .unwrap_or(valor_venta + igv),
            })
        })
        .collect()
}

fn validate_offline_fiscal_snapshot(input: &OfflineFiscalDocumentInput) -> Result<(), String> {
    let document_type = document_type_code(&input.document_type);
    if !matches!(document_type, "01" | "03") {
        return Err("Desktop offline solo sincroniza factura 01 o boleta 03; las notas 07/08 usan el flujo referenciado 472".to_string());
    }
    let serie = input.serie.as_deref().unwrap_or("").trim().to_uppercase();
    if serie.is_empty()
        || (document_type == "01" && !serie.starts_with('F'))
        || (document_type == "03" && !serie.starts_with('B'))
    {
        return Err("La serie fiscal desktop no corresponde al tipo 01/03".to_string());
    }
    let receiver = input.cliente_ruc.as_deref().unwrap_or("").trim();
    let receiver_name = input.cliente_nombre.as_deref().unwrap_or("").trim();
    let currency = input.moneda.as_deref().unwrap_or("").trim();
    let source_type = input.source_type.as_deref().unwrap_or("").trim();
    if !(6..=20).contains(&receiver.len())
        || receiver_name.is_empty()
        || currency.len() != 3
        || source_type.is_empty()
        || input.items.is_empty()
        || input.total <= 0.0
    {
        return Err("El snapshot fiscal desktop requiere receptor, moneda, origen, total e items completos".to_string());
    }

    let normalized = normalize_fiscal_sync_items(&input.items);
    let mut subtotal = 0.0_f64;
    let mut igv = 0.0_f64;
    let mut total = 0.0_f64;
    for (index, item) in normalized.iter().enumerate() {
        let original = &input.items[index];
        let code = value_string(original, "codigo")
            .or_else(|| value_string(original, "codigo_producto"))
            .unwrap_or_default();
        let description = value_string(original, "descripcion")
            .or_else(|| value_string(original, "nombre"))
            .unwrap_or_default();
        let unit = value_string(original, "unidad")
            .or_else(|| value_string(original, "unidad_medida"))
            .unwrap_or_default();
        let quantity = value_number(item, "cantidad");
        let item_subtotal = value_number(item, "valor_venta");
        let item_igv = value_number(item, "igv");
        let item_total = value_number(item, "precio_venta");
        if code.trim().is_empty()
            || description.trim().is_empty()
            || unit.trim().is_empty()
            || quantity <= 0.0
            || item_subtotal < 0.0
            || item_igv < 0.0
            || item_total <= 0.0
            || (item_total - item_subtotal - item_igv).abs() > 0.01
        {
            return Err(format!("El item fiscal desktop {} esta incompleto o no cuadra", index + 1));
        }
        subtotal += item_subtotal;
        igv += item_igv;
        total += item_total;
    }
    if (subtotal - input.subtotal).abs() > 0.01
        || (igv - input.igv).abs() > 0.01
        || (total - input.total).abs() > 0.01
        || (input.total - input.subtotal - input.igv).abs() > 0.01
    {
        return Err("Los totales del snapshot fiscal desktop no coinciden con sus items".to_string());
    }
    Ok(())
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn document_type_code(document_type: &str) -> &'static str {
    match document_type.to_lowercase().as_str() {
        "boleta" | "03" => "03",
        "nota_credito" | "nota-credito" | "07" => "07",
        "nota_debito" | "nota-debito" | "08" => "08",
        "gre" | "guia" | "09" => "09",
        _ => "01",
    }
}

fn default_series(document_type: &str) -> &'static str {
    match document_type_code(document_type) {
        "03" => "B001",
        "07" => "FC01",
        "08" => "FD01",
        "09" => "T001",
        _ => "F001",
    }
}

fn fiscal_document_label(document_type: &str) -> &'static str {
    match document_type_code(document_type) {
        "03" => "BOLETA ELECTRONICA",
        "07" => "NOTA DE CREDITO ELECTRONICA",
        "08" => "NOTA DE DEBITO ELECTRONICA",
        "09" => "GUIA DE REMISION ELECTRONICA",
        _ => "FACTURA ELECTRONICA",
    }
}

fn reserve_local_fiscal_number(
    conn: &Connection,
    document_type: &str,
    serie: &str,
    tenant_id: Option<&str>,
) -> Result<i64, String> {
    let tenant = tenant_scope(tenant_id);
    conn.execute(
        r#"
        INSERT OR IGNORE INTO local_fiscal_series
            (tenant_id, document_type, serie, ultimo_numero, updated_at)
        VALUES (?1, ?2, ?3, 0, ?4)
        "#,
        params![tenant, document_type_code(document_type), serie, now_ms()],
    )
    .map_err(|e| format!("No se pudo inicializar serie fiscal local: {e}"))?;

    conn.execute(
        r#"
        UPDATE local_fiscal_series
        SET ultimo_numero = ultimo_numero + 1,
            updated_at = ?4
        WHERE tenant_id = ?1 AND document_type = ?2 AND serie = ?3
        "#,
        params![tenant, document_type_code(document_type), serie, now_ms()],
    )
    .map_err(|e| format!("No se pudo reservar correlativo fiscal local: {e}"))?;

    conn.query_row(
        r#"
        SELECT ultimo_numero FROM local_fiscal_series
        WHERE tenant_id = ?1 AND document_type = ?2 AND serie = ?3
        "#,
        params![tenant, document_type_code(document_type), serie],
        |row| row.get(0),
    )
    .map_err(|e| format!("No se pudo leer correlativo fiscal local: {e}"))
}

fn hash_base64(raw: &str) -> String {
    general_purpose::STANDARD.encode(Sha256::digest(raw.as_bytes()))
}

fn current_utc_date() -> String {
    let days = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| (duration.as_secs() / 86_400) as i64)
        .unwrap_or(0);
    utc_date_from_days(days)
}

fn utc_date_from_ms(timestamp_ms: i64) -> String {
    utc_date_from_days(timestamp_ms.max(0) / 86_400_000)
}

fn utc_date_from_days(days: i64) -> String {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    format!("{year:04}-{m:02}-{d:02}")
}

fn build_local_ubl_xml(
    config: &AppConfig,
    input: &OfflineFiscalDocumentInput,
    serie: &str,
    numero: i64,
) -> String {
    let document_type = document_type_code(&input.document_type);
    let id = format!("{serie}-{:08}", numero);
    let moneda = input.moneda.as_deref().unwrap_or("");
    let cliente_ruc = input.cliente_ruc.as_deref().unwrap_or("");
    let cliente_nombre = input.cliente_nombre.as_deref().unwrap_or("");
    let cliente_scheme = if cliente_ruc.len() == 11 { "6" } else { "1" };
    let issue_date = current_utc_date();
    let mut lines = String::new();
    let normalized_items = normalize_fiscal_sync_items(&input.items);

    for (index, item) in normalized_items.iter().enumerate() {
        let cantidad = value_number(item, "cantidad");
        let descripcion = value_string(item, "descripcion").unwrap_or_default();
        let codigo = value_string(item, "codigo").unwrap_or_default();
        let unidad = value_string(item, "unidad").unwrap_or_default();
        let precio = value_number(item, "precio_unitario");
        let valor_venta = value_number(item, "valor_venta");
        let igv = value_number(item, "igv");
        lines.push_str(&format!(
            r#"
  <cac:InvoiceLine>
    <cbc:ID>{}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="{}">{:.6}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="{}">{:.2}</cbc:LineExtensionAmount>
    <cac:TaxTotal><cbc:TaxAmount currencyID="{}">{:.2}</cbc:TaxAmount></cac:TaxTotal>
    <cac:Item>
      <cbc:Description>{}</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>{}</cbc:ID></cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="{}">{:.2}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>"#,
            index + 1,
            escape_xml(&unidad),
            cantidad,
            moneda,
            valor_venta,
            moneda,
            igv,
            escape_xml(&descripcion),
            escape_xml(&codigo),
            moneda,
            precio,
        ));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>{}</cbc:ID>
  <cbc:IssueDate>{}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>{}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>{}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="6">{}</cbc:ID></cac:PartyIdentification>
      <cac:PartyLegalEntity><cbc:RegistrationName>{}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="{}">{}</cbc:ID></cac:PartyIdentification>
      <cac:PartyLegalEntity><cbc:RegistrationName>{}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="{}">{:.2}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="{}">{:.2}</cbc:LineExtensionAmount>
    <cbc:PayableAmount currencyID="{}">{:.2}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>{}
</Invoice>"#,
        id,
        issue_date,
        document_type,
        moneda,
        escape_xml(&config.ruc),
        escape_xml(&config.razon_social),
        cliente_scheme,
        escape_xml(cliente_ruc),
        escape_xml(cliente_nombre),
        moneda,
        input.igv,
        moneda,
        input.subtotal,
        moneda,
        input.total,
        lines,
    )
}

fn build_local_pdf_bytes(document: &OfflineFiscalDocumentInput, serie: &str, numero: i64, hash: &str) -> Vec<u8> {
    let text = format!(
        "{}\\n{}-{:08}\\nCliente: {}\\nTotal: {:.2}\\nEstado: PENDIENTE ENVIO SUNAT/OSE\\nHash: {}",
        fiscal_document_label(&document.document_type),
        serie,
        numero,
        document.cliente_nombre.as_deref().unwrap_or("Cliente"),
        document.total,
        hash
    );
    format!(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 220] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length {} >>\nstream\nBT /F1 10 Tf 20 190 Td ({}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n0\n%%EOF",
        text.len() + 40,
        escape_pdf_text(&text),
    )
    .into_bytes()
}

fn escape_pdf_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
        .replace('\n', "\\n")
}

fn upsert_snapshot(
    conn: &Connection,
    endpoint: &str,
    url: &str,
    tenant_id: Option<&str>,
    status: u16,
    headers: &[HeaderPair],
    body: &str,
) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_api_snapshots
            (cache_key, endpoint, url, tenant_id, status, headers_json, body, cached_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        "#,
        params![
            scoped_cache_key(tenant_id, endpoint, url),
            endpoint,
            url,
            tenant_id,
            status as i64,
            response_headers_json(headers)?,
            body,
            now_ms(),
        ],
    )
    .map_err(|e| format!("No se pudo guardar snapshot local: {e}"))?;
    Ok(())
}

fn read_metadata_json(conn: &Connection, key: &str) -> Result<Option<Value>, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM local_metadata WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok();
    raw.map(|value| {
        serde_json::from_str::<Value>(&value)
            .map_err(|e| format!("Metadata local invalida para {key}: {e}"))
    })
    .transpose()
}

fn write_metadata_json(conn: &Connection, key: &str, value: &Value) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_metadata (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        "#,
        params![
            key,
            serde_json::to_string(value)
                .map_err(|e| format!("No se pudo serializar metadata local {key}: {e}"))?,
            now_ms(),
        ],
    )
    .map_err(|e| format!("No se pudo guardar metadata local {key}: {e}"))?;
    Ok(())
}

fn extract_response_data(body: &str) -> Option<Value> {
    let parsed: Value = serde_json::from_str(body).ok()?;
    Some(parsed.get("data").cloned().unwrap_or(parsed))
}

fn hydrate_pos_products(conn: &Connection, body: &str, tenant_id: Option<&str>) -> Result<(), String> {
    let Some(Value::Array(products)) = extract_response_data(body) else {
        return Ok(());
    };

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("No se pudo iniciar hidratacion POS: {e}"))?;
    for product in products {
        let Some(id) = value_string(&product, "id") else {
            continue;
        };
        let codigo = value_string(&product, "codigo");
        let nombre = value_string(&product, "nombre").unwrap_or_else(|| "Producto".to_string());
        let stock_actual = product
            .get("stock_actual")
            .or_else(|| product.get("stock"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let stock_disponible = product
            .get("stock_disponible")
            .and_then(Value::as_f64)
            .unwrap_or(stock_actual);
        tx.execute(
            r#"
            INSERT OR REPLACE INTO pos_products
                (id, tenant_id, codigo, nombre, stock_actual, stock_disponible, data_json, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                id,
                tenant_id,
                codigo,
                nombre,
                stock_actual,
                stock_disponible,
                serde_json::to_string(&product)
                    .map_err(|e| format!("Producto POS invalido para cache local: {e}"))?,
                now_ms(),
            ],
        )
        .map_err(|e| format!("No se pudo hidratar producto POS local: {e}"))?;
    }
    tx.commit()
        .map_err(|e| format!("No se pudo confirmar hidratacion POS: {e}"))?;
    Ok(())
}

fn hydrate_local_customers(conn: &Connection, body: &str, tenant_id: Option<&str>) -> Result<(), String> {
    let Some(data) = extract_response_data(body) else {
        return Ok(());
    };
    let customers = match data {
        Value::Array(items) => items,
        Value::Object(ref obj) => obj
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        _ => Vec::new(),
    };

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("No se pudo iniciar hidratacion clientes: {e}"))?;
    for customer in customers {
        let Some(id) = value_string(&customer, "id") else {
            continue;
        };
        let documento = value_string(&customer, "ruc")
            .or_else(|| value_string(&customer, "codigo"))
            .or_else(|| value_string(&customer, "documento_numero"))
            .or_else(|| value_string(&customer, "numero_documento"));
        let razon_social = value_string(&customer, "razon_social")
            .or_else(|| value_string(&customer, "nombre_comercial"))
            .unwrap_or_else(|| "Cliente".to_string());
        tx.execute(
            r#"
            INSERT OR REPLACE INTO local_customers
                (id, tenant_id, documento, razon_social, data_json, deleted, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)
            "#,
            params![
                id,
                tenant_id,
                documento,
                razon_social,
                serde_json::to_string(&customer)
                    .map_err(|e| format!("Cliente invalido para cache local: {e}"))?,
                now_ms(),
            ],
        )
        .map_err(|e| format!("No se pudo hidratar cliente local: {e}"))?;
    }
    tx.commit()
        .map_err(|e| format!("No se pudo confirmar hidratacion clientes: {e}"))?;
    Ok(())
}

fn hydrate_sales_documents(
    conn: &Connection,
    body: &str,
    kind: &str,
    tenant_id: Option<&str>,
) -> Result<(), String> {
    let Some(data) = extract_response_data(body) else {
        return Ok(());
    };
    let documents = match data {
        Value::Array(items) => items,
        Value::Object(ref obj) => obj
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        _ => Vec::new(),
    };

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("No se pudo iniciar hidratacion ventas: {e}"))?;
    for document in documents {
        let Some(id) = value_string(&document, "id") else {
            continue;
        };
        let numero = value_string(&document, "numero").unwrap_or_else(|| id.clone());
        let cliente_id = value_string(&document, "cliente_id");
        let estado = value_string(&document, "estado").unwrap_or_else(|| {
            if kind == "quote" {
                "BORRADOR".to_string()
            } else {
                "PENDIENTE".to_string()
            }
        });
        let total = value_number(&document, "total");
        tx.execute(
            r#"
            INSERT OR REPLACE INTO local_sales_documents
                (id, tenant_id, kind, numero, cliente_id, estado, total, data_json, deleted, sync_status, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 'synced', ?9, ?9)
            "#,
            params![
                id,
                tenant_id,
                kind,
                numero,
                cliente_id,
                estado,
                total,
                serde_json::to_string(&document)
                    .map_err(|e| format!("Documento venta invalido para cache local: {e}"))?,
                now_ms(),
            ],
        )
        .map_err(|e| format!("No se pudo hidratar documento venta local: {e}"))?;
    }
    tx.commit()
        .map_err(|e| format!("No se pudo confirmar hidratacion ventas: {e}"))?;
    Ok(())
}

fn hydrate_cash_session(conn: &Connection, body: &str, tenant_id: Option<&str>) -> Result<(), String> {
    let Some(session) = extract_response_data(body) else {
        return Ok(());
    };
    if session.is_null() {
        return Ok(());
    }
    let Some(id) = value_string(&session, "id") else {
        return Ok(());
    };
    let caja_id = value_string(&session, "caja_id").unwrap_or_else(|| "local-caja".to_string());
    let estado = value_string(&session, "estado").unwrap_or_else(|| "ABIERTA".to_string());
    let monto_inicio = session
        .get("monto_inicio")
        .or_else(|| session.get("monto_inicial"))
        .or_else(|| session.get("monto_esperado"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    conn.execute(
        r#"
        INSERT OR REPLACE INTO pos_cash_sessions
            (id, tenant_id, caja_id, estado, monto_inicio, monto_cierre, opened_at, closed_at, data_json, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            id,
            tenant_id,
            caja_id,
            if estado == "CERRADA" { "CERRADA" } else { "ABIERTA" },
            monto_inicio,
            session.get("monto_cierre").and_then(Value::as_f64),
            now_ms(),
            if estado == "CERRADA" { Some(now_ms()) } else { None },
            serde_json::to_string(&session)
                .map_err(|e| format!("Sesion caja invalida para cache local: {e}"))?,
            now_ms(),
        ],
    )
    .map_err(|e| format!("No se pudo hidratar sesion de caja local: {e}"))?;
    Ok(())
}

fn read_local_snapshot(
    conn: &Connection,
    endpoint: &str,
    url: &str,
    tenant_id: Option<&str>,
) -> Result<Option<LocalFirstResponse>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT status, headers_json, body
            FROM local_api_snapshots
            WHERE cache_key = ?1
               OR (endpoint = ?2 AND ((?3 IS NULL AND tenant_id IS NULL) OR tenant_id = ?3))
            ORDER BY CASE WHEN cache_key = ?1 THEN 0 ELSE 1 END, cached_at DESC
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("No se pudo preparar snapshot local: {e}"))?;

    let mut rows = stmt
        .query(params![scoped_cache_key(tenant_id, endpoint, url), endpoint, tenant_id])
        .map_err(|e| format!("No se pudo consultar snapshot local: {e}"))?;

    let Some(row) = rows
        .next()
        .map_err(|e| format!("No se pudo leer snapshot local: {e}"))?
    else {
        return Ok(None);
    };

    let status: i64 = row.get(0).map_err(|e| format!("Snapshot local sin status: {e}"))?;
    let headers_json: String = row
        .get(1)
        .map_err(|e| format!("Snapshot local sin headers: {e}"))?;
    let mut headers: Vec<HeaderPair> = serde_json::from_str(&headers_json).unwrap_or_default();
    headers.push(HeaderPair {
        name: "x-erp-local-first".to_string(),
        value: "true".to_string(),
    });
    headers.push(HeaderPair {
        name: "x-erp-offline-cache".to_string(),
        value: "true".to_string(),
    });
    let body: String = row.get(2).map_err(|e| format!("Snapshot local sin body: {e}"))?;

    Ok(Some(LocalFirstResponse {
        status: status as u16,
        body,
        headers,
    }))
}

fn build_default_cajas_snapshot() -> Result<LocalFirstResponse, String> {
    json_success_response(
        serde_json::json!([
            {
                "id": "local-caja",
                "nombre": "Caja local",
                "codigo": "LOCAL",
                "estado": "ACTIVA",
                "offline": true
            }
        ]),
        "Cajas locales",
    )
}

fn build_default_payment_methods_snapshot() -> Result<LocalFirstResponse, String> {
    json_success_response(
        serde_json::json!([
            {
                "id": "local-cash",
                "codigo": "EFECTIVO",
                "nombre": "Efectivo",
                "tipo": "EFECTIVO",
                "requiere_referencia": false,
                "comision_porcentaje": 0,
                "offline": true
            },
            {
                "id": "local-card",
                "codigo": "TARJETA",
                "nombre": "Tarjeta",
                "tipo": "TARJETA",
                "requiere_referencia": true,
                "comision_porcentaje": 0,
                "offline": true
            }
        ]),
        "Metodos de pago locales",
    )
}

fn build_empresa_config_snapshot(config: &AppConfig) -> Result<LocalFirstResponse, String> {
    json_success_response(
        serde_json::json!({
            "ruc": config.ruc,
            "razon_social": config.razon_social,
            "nombre_comercial": config.razon_social,
            "direccion": "",
            "direccion_fiscal": "",
            "email": "",
            "telefono": "",
            "offline": true
        }),
        "Empresa local",
    )
}

fn build_pos_configuration_status_snapshot(config: &AppConfig) -> Result<LocalFirstResponse, String> {
    let has_company = !config.ruc.trim().is_empty() && !config.razon_social.trim().is_empty();
    let has_certificate = config
        .certificado_path
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let mut missing_items = Vec::new();
    if !has_company {
        missing_items.push(serde_json::json!("empresa"));
    }
    if !has_certificate {
        missing_items.push(serde_json::json!("certificado"));
    }
    json_success_response(
        serde_json::json!({
            "isComplete": has_company && has_certificate,
            "offline": true,
            "missingItems": missing_items,
            "company": {
                "isValid": has_company,
                "ruc": config.ruc,
                "razonSocial": config.razon_social
            },
            "certificate": {
                "isValid": has_certificate,
                "expiresAt": Value::Null
            },
            "sunat": {
                "endpoint": config.sunat_endpoint,
                "available": false,
                "externalPending": true
            }
        }),
        "Configuracion POS local",
    )
}

fn build_gre_thresholds_snapshot() -> Result<LocalFirstResponse, String> {
    json_success_response(
        serde_json::json!({
            "umbralGREAutomatico": 700,
            "greAutomaticoHabilitado": true,
            "offline": true
        }),
        "Umbrales GRE locales",
    )
}

fn build_next_number_snapshot(prefix: &str) -> Result<LocalFirstResponse, String> {
    json_success_response(
        serde_json::json!({
            "numero": format!("{prefix}-L{:08}", now_ms() % 100_000_000),
            "offline": true
        }),
        "Numero local temporal",
    )
}

fn build_empty_collection_snapshot(endpoint: &str) -> Result<LocalFirstResponse, String> {
    json_success_response(
        Value::Array(Vec::new()),
        &format!("Listado local sin cache previa para {endpoint}"),
    )
}

fn build_empty_object_snapshot(endpoint: &str) -> Result<LocalFirstResponse, String> {
    json_success_response(
        serde_json::json!({
            "offline": true,
            "local_first": true
        }),
        &format!("Snapshot local sin cache previa para {endpoint}"),
    )
}

fn is_known_empty_collection_endpoint(endpoint: &str) -> bool {
    if matches!(
        endpoint,
        "/api/dashboard/recent-activity"
            | "/api/dashboard/activities"
            | "/api/compras/proveedores"
            | "/api/compras/productos"
            | "/api/compras/next-number"
            | "/api/compras/ordenes"
            | "/api/compras/cotizaciones"
            | "/api/compras/recepciones"
            | "/api/compras/devoluciones"
            | "/api/compras/reporte-compras"
            | "/api/inventario/recepciones"
            | "/api/inventario/kardex"
            | "/api/inventario/almacenes"
            | "/api/inventario/movimientos"
            | "/api/inventario/logistica/ordenes-pendientes"
            | "/api/inventario/logistica/listo-despacho"
            | "/api/rrhh/empleados"
            | "/api/rrhh/departamentos"
            | "/api/rrhh/planillas"
            | "/api/rrhh/pagos"
            | "/api/rrhh/contratos"
            | "/api/rrhh/candidatos"
            | "/api/rrhh/vacantes"
            | "/api/rrhh/asistencia"
            | "/api/rrhh/asistencias"
            | "/api/finanzas/cuentas-bancarias"
            | "/api/finanzas/cxc"
            | "/api/finanzas/cxp"
            | "/api/finanzas/tesoreria"
            | "/api/finanzas/tesoreria/pagos"
            | "/api/finanzas/bancos"
            | "/api/finanzas/bancos/cuentas"
            | "/api/finanzas/bancos/movimientos/periodo"
            | "/api/finanzas/conciliacion"
            | "/api/finanzas/conciliacion/pendientes"
            | "/api/finanzas/tesoreria/programacion"
            | "/api/finanzas/cxp/vencimientos"
            | "/api/finanzas/cxp/proveedores-mayor-deuda"
            | "/api/finanzas/cxp/aging"
            | "/api/contabilidad/asientos"
            | "/api/contabilidad/asientos-contables"
            | "/api/contabilidad/centros-costo"
            | "/api/contabilidad/presupuestos"
            | "/api/contabilidad/periodos"
            | "/api/contabilidad/plan-cuentas"
            | "/api/cpe/comprobantes"
            | "/api/cpe/cotizaciones"
            | "/api/cotizaciones/lista"
            | "/api/cotizaciones/clientes-top"
            | "/api/gre/guias"
            | "/api/gre/reporte"
            | "/api/sire/files"
            | "/api/documentos"
            | "/api/documentos/descargas"
            | "/api/cajas"
            | "/api/cajas/sesiones"
            | "/api/cajas/cortes"
            | "/api/cajas/movimientos"
            | "/api/cajas/retiros"
            | "/api/cajas/cambios-turno"
            | "/api/notifications"
            | "/api/notifications/unread"
            | "/api/audit/logs"
            | "/api/audit-logs/integrations"
            | "/api/users"
            | "/api/roles"
            | "/api/usuarios"
            | "/api/tenants"
            | "/api/usuarios-sistema/me/permissions"
            | "/api/usuarios-sistema/roles"
            | "/api/paises"
            | "/api/ventas/pedidos/aprobaciones/pendientes"
            | "/api/ventas/reportes/fill-rate"
            | "/api/ventas/reportes/cotizaciones-pendientes"
            | "/api/ventas/reportes/cxc-aging"
            | "/api/ventas/reportes/pedidos-por-estado"
            | "/api/ventas/reportes/lead-time"
            | "/api/ventas/reportes/pipeline"
            | "/api/ventas/reportes/productos-mas-vendidos"
            | "/api/ventas/reportes/sunat-kpis"
            | "/api/ventas/reportes/top-clientes"
            | "/api/ventas/reportes/ventas-por-cliente"
    ) {
        return true;
    }

    endpoint.ends_with("/movimientos")
        || endpoint.ends_with("/pagos")
        || endpoint.ends_with("/diferencias")
        || endpoint.ends_with("/historial")
        || endpoint.ends_with("/historial-pagos")
        || endpoint.ends_with("/aprobaciones")
        || endpoint.ends_with("/recepciones")
        || endpoint.ends_with("/gres")
        || endpoint.ends_with("/eventos")
        || endpoint.ends_with("/backorders")
        || endpoint.contains("/movimientos/")
        || endpoint.contains("/reportes/")
}

fn is_known_empty_object_endpoint(endpoint: &str) -> bool {
    if matches!(
        endpoint,
        "/api/dashboard/metrics"
            | "/api/dashboard/stats"
            | "/api/inventario/stats"
            | "/api/compras/stats"
            | "/api/cotizaciones/stats"
            | "/api/usuarios-sistema/stats"
            | "/api/configuration/status"
            | "/api/configuration/complete"
            | "/api/configuration/context/status"
            | "/api/configuration/context/country"
            | "/api/configuration/empresa"
            | "/api/configuration/wizard/progress"
            | "/api/configuration/wizard/reset"
            | "/api/configuration/wizard/step"
            | "/api/demo/status"
            | "/api/configuracion/empresa"
            | "/api/configuracion-fiscal"
            | "/api/cpe/fiscal-config"
            | "/api/configuracion/ose"
            | "/api/analytics/deudas-clientes"
            | "/api/analytics/deudas-proveedores"
            | "/api/analytics/ventas-categoria"
            | "/api/analytics/kpis-visuales"
            | "/api/contabilidad/registro-compras"
            | "/api/contabilidad/balance-comprobacion"
            | "/api/contabilidad/kardex-valorizado"
            | "/api/contabilidad/libro-caja-bancos"
            | "/api/contabilidad/registro-activos-fijos"
            | "/api/contabilidad/libro-planillas"
            | "/api/contabilidad/libro-inventarios-balances"
            | "/api/contabilidad/registro-costos"
            | "/api/contabilidad/libros-electronicos-sunat"
            | "/api/finanzas/tesoreria/flujo-caja"
            | "/api/finanzas/bancos/saldos"
            | "/api/cajas/saldo-esperado"
            | "/api/security/dashboard/violations-by-table"
            | "/api/security/dashboard/violations-recent"
            | "/api/security/dashboard/alerts-unacknowledged"
    ) {
        return true;
    }

    let detail_prefixes = [
        "/api/compras/proveedores/",
        "/api/compras/ordenes/",
        "/api/compras/cotizaciones/",
        "/api/compras/recepciones/",
        "/api/compras/devoluciones/",
        "/api/finanzas/bancos/cuentas/",
        "/api/finanzas/cxc/",
        "/api/finanzas/cxp/",
        "/api/finanzas/conciliacion/",
        "/api/contabilidad/asientos/",
        "/api/contabilidad/asientos-contables/",
        "/api/contabilidad/centros-costo/",
        "/api/contabilidad/presupuestos/",
        "/api/ventas/clientes/",
        "/api/ventas/cotizaciones/",
        "/api/ventas/pedidos/",
        "/api/rrhh/contratos/",
        "/api/rrhh/candidatos/",
        "/api/rrhh/planillas/",
        "/api/documentos/",
        "/api/cpe/comprobantes/",
        "/api/gre/guias/",
    ];
    detail_prefixes.iter().any(|prefix| endpoint.starts_with(prefix))
}

fn build_products_snapshot(conn: &Connection, tenant_id: Option<&str>) -> Result<LocalFirstResponse, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT data_json FROM pos_products
            WHERE ((?1 IS NULL AND tenant_id IS NULL) OR tenant_id = ?1)
            ORDER BY nombre ASC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar productos POS locales: {e}"))?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            let raw: String = row.get(0)?;
            Ok(serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null))
        })
        .map_err(|e| format!("No se pudo leer productos POS locales: {e}"))?;
    let mut products = Vec::new();
    for row in rows {
        let value = row.map_err(|e| format!("Producto POS local invalido: {e}"))?;
        if !value.is_null() {
            products.push(value);
        }
    }
    json_success_response(Value::Array(products), "Productos POS locales")
}

fn build_product_detail_snapshot(
    conn: &Connection,
    endpoint: &str,
    tenant_id: Option<&str>,
) -> Result<Option<LocalFirstResponse>, String> {
    let id = endpoint.trim_start_matches("/api/inventario/productos/");
    let raw: Option<String> = conn
        .query_row(
            r#"
            SELECT data_json FROM pos_products
            WHERE id = ?1
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            "#,
            params![id, tenant_id],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Ok(None);
    };
    let product: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    Ok(Some(json_success_response(product, "Producto local")?))
}

fn build_customers_snapshot(conn: &Connection, tenant_id: Option<&str>) -> Result<LocalFirstResponse, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT data_json FROM local_customers
            WHERE deleted = 0
              AND ((?1 IS NULL AND tenant_id IS NULL) OR tenant_id = ?1)
            ORDER BY razon_social ASC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar clientes locales: {e}"))?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            let raw: String = row.get(0)?;
            Ok(serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null))
        })
        .map_err(|e| format!("No se pudo leer clientes locales: {e}"))?;
    let mut customers = Vec::new();
    for row in rows {
        let value = row.map_err(|e| format!("Cliente local invalido: {e}"))?;
        if !value.is_null() {
            customers.push(value);
        }
    }
    let total = customers.len();
    let body = serde_json::json!({
        "success": true,
        "offline": true,
        "local_first": true,
        "data": customers,
        "pagination": {
            "total": total,
            "page": 1,
            "limit": total,
            "totalPages": 1
        },
        "message": "Clientes locales"
    });
    Ok(LocalFirstResponse {
        status: 200,
        body: serde_json::to_string(&body)
            .map_err(|e| format!("No se pudo serializar clientes locales: {e}"))?,
        headers: vec![
            HeaderPair {
                name: "Content-Type".to_string(),
                value: "application/json".to_string(),
            },
            HeaderPair {
                name: "x-erp-local-first".to_string(),
                value: "true".to_string(),
            },
        ],
    })
}

fn build_customer_detail_snapshot(
    conn: &Connection,
    endpoint: &str,
    tenant_id: Option<&str>,
) -> Result<Option<LocalFirstResponse>, String> {
    let id = endpoint
        .trim_start_matches("/api/ventas/clientes/")
        .trim_start_matches("/api/pos/clientes/");
    let raw: Option<String> = conn
        .query_row(
            r#"
            SELECT data_json FROM local_customers
            WHERE id = ?1 AND deleted = 0
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            "#,
            params![id, tenant_id],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Ok(None);
    };
    let customer: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    Ok(Some(json_success_response(customer, "Cliente local")?))
}

fn attach_customer(conn: &Connection, mut document: Value, tenant_id: Option<&str>) -> Value {
    let Some(cliente_id) = value_string(&document, "cliente_id") else {
        return document;
    };
    let customer_raw: Option<String> = conn
        .query_row(
            r#"
            SELECT data_json FROM local_customers
            WHERE id = ?1 AND deleted = 0
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            "#,
            params![cliente_id, tenant_id],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = customer_raw else {
        return document;
    };
    if let Ok(customer) = serde_json::from_str::<Value>(&raw) {
        if let Some(obj) = document.as_object_mut() {
            obj.insert("cliente".to_string(), customer);
        }
    }
    document
}

fn build_sales_documents_snapshot(
    conn: &Connection,
    kind: &str,
    tenant_id: Option<&str>,
) -> Result<LocalFirstResponse, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT data_json FROM local_sales_documents
            WHERE kind = ?1 AND deleted = 0
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar documentos venta locales: {e}"))?;
    let rows = stmt
        .query_map(params![kind, tenant_id], |row| {
            let raw: String = row.get(0)?;
            Ok(serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null))
        })
        .map_err(|e| format!("No se pudo leer documentos venta locales: {e}"))?;
    let mut documents = Vec::new();
    for row in rows {
        let value = row.map_err(|e| format!("Documento venta local invalido: {e}"))?;
        if !value.is_null() {
            documents.push(attach_customer(conn, value, tenant_id));
        }
    }
    let total = documents.len();
    let body = serde_json::json!({
        "success": true,
        "offline": true,
        "local_first": true,
        "data": documents,
        "total": total,
        "pagination": {
            "total": total,
            "page": 1,
            "limit": total,
            "totalPages": 1
        },
        "message": if kind == "quote" { "Cotizaciones locales" } else { "Pedidos locales" }
    });
    Ok(LocalFirstResponse {
        status: 200,
        body: serde_json::to_string(&body)
            .map_err(|e| format!("No se pudo serializar documentos venta locales: {e}"))?,
        headers: vec![
            HeaderPair {
                name: "Content-Type".to_string(),
                value: "application/json".to_string(),
            },
            HeaderPair {
                name: "x-erp-local-first".to_string(),
                value: "true".to_string(),
            },
        ],
    })
}

fn build_sales_document_detail_snapshot(
    conn: &Connection,
    endpoint: &str,
    kind: &str,
    tenant_id: Option<&str>,
) -> Result<Option<LocalFirstResponse>, String> {
    let prefix = if kind == "quote" {
        "/api/ventas/cotizaciones/"
    } else {
        "/api/ventas/pedidos/"
    };
    let id = endpoint.trim_start_matches(prefix);
    let raw: Option<String> = conn
        .query_row(
            r#"
            SELECT data_json FROM local_sales_documents
            WHERE id = ?1 AND kind = ?2 AND deleted = 0
              AND ((?3 IS NULL AND tenant_id IS NULL) OR tenant_id = ?3)
            "#,
            params![id, kind, tenant_id],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Ok(None);
    };
    let document: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    Ok(Some(json_success_response(
        attach_customer(conn, document, tenant_id),
        if kind == "quote" { "Cotizacion local" } else { "Pedido local" },
    )?))
}

fn merge_local_records_into_response(
    conn: &Connection,
    endpoint: &str,
    snapshot: Option<LocalFirstResponse>,
    tenant_id: Option<&str>,
) -> Result<Option<LocalFirstResponse>, String> {
    let collection = collection_endpoint(endpoint);
    let mut stmt = conn
        .prepare(
            r#"
            SELECT data_json FROM local_generic_records
            WHERE collection_endpoint = ?1 AND deleted = 0
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar registros locales genericos: {e}"))?;
    let rows = stmt
        .query_map(params![&collection, tenant_id], |row| {
            let raw: String = row.get(0)?;
            Ok(serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null))
        })
        .map_err(|e| format!("No se pudo leer registros locales genericos: {e}"))?;
    let mut local_records = Vec::new();
    for row in rows {
        let value = row.map_err(|e| format!("Registro local generico invalido: {e}"))?;
        if !value.is_null() {
            local_records.push(value);
        }
    }

    if local_records.is_empty() {
        return Ok(snapshot);
    }

    let mut base = if let Some(snapshot_response) = snapshot {
        serde_json::from_str::<Value>(&snapshot_response.body).unwrap_or_else(|_| {
            serde_json::json!({
                "success": true,
                "data": []
            })
        })
    } else {
        serde_json::json!({
            "success": true,
            "offline": true,
            "local_first": true,
            "data": []
        })
    };

    if let Some(data) = base.get_mut("data") {
        match data {
            Value::Array(items) => {
                let mut merged = local_records;
                merged.extend(items.clone());
                *items = merged;
            }
            Value::Object(obj) => {
                if let Some(Value::Array(items)) = obj.get_mut("data") {
                    let mut merged = local_records;
                    merged.extend(items.clone());
                    *items = merged;
                }
            }
            _ => {
                base["data"] = Value::Array(local_records);
            }
        }
    } else {
        base["data"] = Value::Array(local_records);
    }
    base["success"] = serde_json::json!(true);
    base["offline"] = serde_json::json!(true);
    base["local_first"] = serde_json::json!(true);

    Ok(Some(LocalFirstResponse {
        status: 200,
        body: serde_json::to_string(&base)
            .map_err(|e| format!("No se pudo serializar listado local generico: {e}"))?,
        headers: vec![
            HeaderPair {
                name: "Content-Type".to_string(),
                value: "application/json".to_string(),
            },
            HeaderPair {
                name: "x-erp-local-first".to_string(),
                value: "true".to_string(),
            },
        ],
    }))
}

fn build_generic_detail_snapshot(
    conn: &Connection,
    endpoint: &str,
    tenant_id: Option<&str>,
) -> Result<Option<LocalFirstResponse>, String> {
    let raw: Option<String> = conn
        .query_row(
            r#"
            SELECT data_json FROM local_generic_records
            WHERE endpoint = ?1 AND deleted = 0
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            "#,
            params![endpoint, tenant_id],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Ok(None);
    };
    let data = serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null);
    Ok(Some(json_success_response(data, "Registro local pendiente")?))
}

fn build_open_session_snapshot(conn: &Connection, tenant_id: Option<&str>) -> Result<Option<LocalFirstResponse>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT data_json FROM pos_cash_sessions
            WHERE estado = 'ABIERTA'
              AND ((?1 IS NULL AND tenant_id IS NULL) OR tenant_id = ?1)
            ORDER BY opened_at DESC
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("No se pudo preparar sesion POS local: {e}"))?;
    let mut rows = stmt
        .query(params![tenant_id])
        .map_err(|e| format!("No se pudo leer sesion POS local: {e}"))?;
    let Some(row) = rows
        .next()
        .map_err(|e| format!("No se pudo resolver sesion POS local: {e}"))?
    else {
        return Ok(Some(json_success_response(Value::Null, "Sin sesion local abierta")?));
    };
    let raw: String = row.get(0).map_err(|e| format!("Sesion POS local invalida: {e}"))?;
    let session: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    Ok(Some(json_success_response(session, "Sesion POS local")?))
}

fn build_recent_sales_snapshot(conn: &Connection, tenant_id: Option<&str>) -> Result<LocalFirstResponse, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT response_json FROM pos_sales
            WHERE ((?1 IS NULL AND tenant_id IS NULL) OR tenant_id = ?1)
            ORDER BY created_at DESC LIMIT 50
            "#,
        )
        .map_err(|e| format!("No se pudo preparar ventas POS locales: {e}"))?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            let raw: String = row.get(0)?;
            Ok(serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null))
        })
        .map_err(|e| format!("No se pudo leer ventas POS locales: {e}"))?;
    let mut sales = Vec::new();
    for row in rows {
        let response = row.map_err(|e| format!("Venta POS local invalida: {e}"))?;
        let data = response.get("data").cloned().unwrap_or(response);
        if !data.is_null() {
            sales.push(data);
        }
    }
    json_success_response(Value::Array(sales), "Ventas POS locales")
}

fn build_pos_sale_details_snapshot(
    conn: &Connection,
    endpoint: &str,
    tenant_id: Option<&str>,
) -> Result<LocalFirstResponse, String> {
    let id = endpoint.trim_start_matches("/api/pos/detalles-venta/");
    let raw: Option<String> = conn
        .query_row(
            r#"
            SELECT body_json, response_json FROM pos_sales
            WHERE (id = ?1 OR idempotency_key = ?1)
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            "#,
            params![id, tenant_id],
            |row| Ok(format!("{}\n{}", row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .ok();
    let Some(raw) = raw else {
        return json_success_response(Value::Array(Vec::new()), "Detalle de venta local no encontrado");
    };
    let mut parts = raw.splitn(2, '\n');
    let body = parts
        .next()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .unwrap_or(Value::Null);
    let response = parts
        .next()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .unwrap_or(Value::Null);
    let sale_id = response
        .get("data")
        .and_then(|data| value_string(data, "id").or_else(|| value_string(data, "venta_id")))
        .unwrap_or_else(|| id.to_string());
    let items = body
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, item)| {
            serde_json::json!({
                "id": format!("local-sale-detail-{sale_id}-{}", index + 1),
                "venta_id": sale_id,
                "producto_id": value_string(&item, "producto_id"),
                "descripcion": value_string(&item, "descripcion")
                    .or_else(|| value_string(&item, "nombre"))
                    .or_else(|| value_string(&item, "producto_nombre"))
                    .unwrap_or_else(|| "Producto".to_string()),
                "cantidad": item.get("cantidad").and_then(Value::as_f64).unwrap_or(0.0),
                "precio_unitario": item
                    .get("precio_unitario")
                    .or_else(|| item.get("precio"))
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0),
                "total": item.get("total").and_then(Value::as_f64).unwrap_or(0.0),
                "offline": true
            })
        })
        .collect::<Vec<_>>();
    json_success_response(Value::Array(items), "Detalle de venta POS local")
}

fn build_user_country_config_snapshot(
    conn: &Connection,
    tenant_id: Option<&str>,
) -> Result<LocalFirstResponse, String> {
    if let Some(config) = read_metadata_json(conn, &scoped_metadata_key("usuario_configuracion", tenant_id))? {
        return json_success_response(config, "Configuracion de usuario local");
    }
    json_success_response(
        serde_json::json!({
            "id": "local-user-config",
            "pais_preferido_id": 1,
            "idioma": "es",
            "zona_horaria": "America/Lima",
            "offline": true,
            "local_first": true
        }),
        "Configuracion de usuario local por defecto",
    )
}

fn notification_id_from_endpoint(endpoint: &str, suffix: &str) -> Option<String> {
    endpoint
        .strip_prefix("/api/notifications/")?
        .strip_suffix(suffix)?
        .trim_matches('/')
        .split('/')
        .next()
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn mark_notification_read(value: &mut Value, timestamp: i64) {
    if let Some(obj) = value.as_object_mut() {
        obj.insert("leida".to_string(), serde_json::json!(true));
        obj.insert("read".to_string(), serde_json::json!(true));
        obj.insert("fecha_lectura".to_string(), serde_json::json!(timestamp));
        obj.insert("updated_at".to_string(), serde_json::json!(timestamp));
        obj.insert("offline".to_string(), serde_json::json!(true));
    }
}

fn mutate_notification_array(
    items: &mut Vec<Value>,
    target_id: Option<&str>,
    mark_all: bool,
    delete: bool,
    timestamp: i64,
) -> usize {
    let mut changed = 0usize;
    if delete {
        let original = items.len();
        items.retain(|item| {
            let matches_target = target_id
                .and_then(|id| value_string(item, "id").map(|item_id| item_id == id))
                .unwrap_or(false);
            !matches_target
        });
        return original.saturating_sub(items.len());
    }

    for item in items.iter_mut() {
        let matches_target = mark_all
            || target_id
                .and_then(|id| value_string(item, "id").map(|item_id| item_id == id))
                .unwrap_or(false);
        if matches_target {
            mark_notification_read(item, timestamp);
            changed += 1;
        }
    }
    changed
}

fn mutate_notification_snapshot_body(
    body: &str,
    target_id: Option<&str>,
    mark_all: bool,
    delete: bool,
    force_unread_empty: bool,
    timestamp: i64,
) -> Result<(String, usize), String> {
    let mut parsed: Value = serde_json::from_str(body)
        .map_err(|e| format!("Snapshot de notificaciones invalido: {e}"))?;
    let mut changed = 0usize;

    if force_unread_empty {
        if let Some(data) = parsed.get_mut("data") {
            *data = Value::Array(Vec::new());
        } else {
            parsed = serde_json::json!({
                "success": true,
                "data": []
            });
        }
        parsed["offline"] = serde_json::json!(true);
        parsed["local_first"] = serde_json::json!(true);
        return serde_json::to_string(&parsed)
            .map(|raw| (raw, changed))
            .map_err(|e| format!("No se pudo serializar snapshot de notificaciones: {e}"));
    }

    if let Some(data) = parsed.get_mut("data") {
        match data {
            Value::Array(items) => {
                changed += mutate_notification_array(items, target_id, mark_all, delete, timestamp);
            }
            Value::Object(obj) => {
                if let Some(Value::Array(items)) = obj.get_mut("data") {
                    changed += mutate_notification_array(items, target_id, mark_all, delete, timestamp);
                }
            }
            _ => {}
        }
    } else if let Value::Array(items) = &mut parsed {
        changed += mutate_notification_array(items, target_id, mark_all, delete, timestamp);
    }

    parsed["offline"] = serde_json::json!(true);
    parsed["local_first"] = serde_json::json!(true);
    serde_json::to_string(&parsed)
        .map(|raw| (raw, changed))
        .map_err(|e| format!("No se pudo serializar snapshot de notificaciones: {e}"))
}

fn update_notification_snapshots(
    conn: &Connection,
    target_id: Option<&str>,
    mark_all: bool,
    delete: bool,
    tenant_id: Option<&str>,
) -> Result<usize, String> {
    let timestamp = now_ms();
    let mut changed = 0usize;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT cache_key, endpoint, body
            FROM local_api_snapshots
            WHERE endpoint IN ('/api/notifications', '/api/notifications/unread')
              AND ((?1 IS NULL AND tenant_id IS NULL) OR tenant_id = ?1)
            "#,
        )
        .map_err(|e| format!("No se pudo preparar snapshots de notificaciones: {e}"))?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("No se pudo leer snapshots de notificaciones: {e}"))?;
    let mut updates = Vec::new();
    for row in rows {
        let (cache_key, endpoint, body) =
            row.map_err(|e| format!("Snapshot de notificaciones invalido: {e}"))?;
        let force_unread_empty = endpoint == "/api/notifications/unread" && mark_all;
        let (next_body, count) = mutate_notification_snapshot_body(
            &body,
            target_id,
            mark_all,
            delete || endpoint == "/api/notifications/unread",
            force_unread_empty,
            timestamp,
        )?;
        changed += count;
        updates.push((cache_key, next_body));
    }
    drop(stmt);

    for (cache_key, body) in updates {
        conn.execute(
            "UPDATE local_api_snapshots SET body = ?2, cached_at = ?3 WHERE cache_key = ?1",
            params![cache_key, body, timestamp],
        )
        .map_err(|e| format!("No se pudo actualizar snapshot de notificaciones: {e}"))?;
    }

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, data_json
            FROM local_generic_records
            WHERE collection_endpoint = '/api/notifications' AND deleted = 0
              AND ((?1 IS NULL AND tenant_id IS NULL) OR tenant_id = ?1)
            "#,
        )
        .map_err(|e| format!("No se pudo preparar notificaciones locales: {e}"))?;
    let rows = stmt
        .query_map(params![tenant_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| format!("No se pudo leer notificaciones locales: {e}"))?;
    let mut local_updates = Vec::new();
    for row in rows {
        let (id, raw) = row.map_err(|e| format!("Notificacion local invalida: {e}"))?;
        let mut value = serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null);
        let matches_target = mark_all || target_id.map(|target| id == target).unwrap_or(false);
        if matches_target && !delete {
            mark_notification_read(&mut value, timestamp);
            local_updates.push((id, Some(value)));
        } else if matches_target {
            local_updates.push((id, None));
        }
    }
    drop(stmt);

    for (id, value) in local_updates {
        if let Some(value) = value {
            conn.execute(
                r#"
                UPDATE local_generic_records
                SET data_json = ?2, updated_at = ?3
                WHERE id = ?1
                  AND ((?4 IS NULL AND tenant_id IS NULL) OR tenant_id = ?4)
                "#,
                params![
                    id,
                    serde_json::to_string(&value)
                        .map_err(|e| format!("No se pudo serializar notificacion local: {e}"))?,
                    timestamp,
                    tenant_id,
                ],
            )
        } else {
            conn.execute(
                r#"
                UPDATE local_generic_records
                SET deleted = 1, updated_at = ?2
                WHERE id = ?1
                  AND ((?3 IS NULL AND tenant_id IS NULL) OR tenant_id = ?3)
                "#,
                params![id, timestamp, tenant_id],
            )
        }
        .map_err(|e| format!("No se pudo actualizar notificacion local: {e}"))?;
    }

    Ok(changed)
}

fn process_local_notifications_mutation(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let method = input.method.to_uppercase();
    let (target_id, mark_all, delete) = if method == "PUT" && input.endpoint == "/api/notifications/mark-all-read" {
        (None, true, false)
    } else if method == "PUT" && input.endpoint.ends_with("/read") {
        (notification_id_from_endpoint(&input.endpoint, "/read"), false, false)
    } else if method == "DELETE" && input.endpoint.starts_with("/api/notifications/") {
        (
            input
                .endpoint
                .trim_start_matches("/api/notifications/")
                .trim_matches('/')
                .split('/')
                .next()
                .filter(|value| !value.is_empty())
                .map(str::to_string),
            false,
            true,
        )
    } else {
        return process_generic_local_write(conn, input);
    };

    let changed = update_notification_snapshots(
        conn,
        target_id.as_deref(),
        mark_all,
        delete,
        input.tenant_id.as_deref(),
    )?;
    let local_id = target_id
        .clone()
        .unwrap_or_else(|| format!("notifications-mark-all-{}", now_ms()));
    let queued_input = with_local_sync_contract(input, &local_id, "notification")?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;

    let data = serde_json::json!({
        "id": target_id,
        "count": changed,
        "leida": !delete,
        "deleted": delete,
        "offline": true,
        "sync_status": "pending"
    });
    json_success_response(data, "Operacion de notificaciones guardada localmente")
}

fn process_local_user_country_config(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let timestamp = now_ms();
    let payload = parse_json_body(&input.body)?;
    let tenant = input.tenant_id.as_deref();
    let key = scoped_metadata_key("usuario_configuracion", tenant);
    let mut config = read_metadata_json(conn, &key)?.unwrap_or_else(|| {
        serde_json::json!({
            "id": "local-user-config",
            "idioma": "es",
            "zona_horaria": "America/Lima"
        })
    });
    if let (Some(obj), Some(payload_obj)) = (config.as_object_mut(), payload.as_object()) {
        for (key, value) in payload_obj {
            obj.insert(key.clone(), value.clone());
        }
        obj.insert("offline".to_string(), serde_json::json!(true));
        obj.insert("local_first".to_string(), serde_json::json!(true));
        obj.insert("sync_status".to_string(), serde_json::json!("pending"));
        obj.insert("updated_at".to_string(), serde_json::json!(timestamp));
    }
    write_metadata_json(conn, &key, &config)?;
    let queued_input = with_local_sync_contract(input, "local-user-config", "user_country_config")?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(config, "Configuracion de usuario guardada localmente")
}

fn extract_data_array(value: Value) -> Vec<Value> {
    match value {
        Value::Array(items) => items,
        Value::Object(obj) => obj
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn latest_snapshot_arrays(conn: &Connection, endpoint: &str) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT body FROM local_api_snapshots
            WHERE endpoint = ?1
            ORDER BY cached_at DESC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar snapshots locales {endpoint}: {e}"))?;
    let rows = stmt
        .query_map(params![endpoint], |row| row.get::<_, String>(0))
        .map_err(|e| format!("No se pudo leer snapshots locales {endpoint}: {e}"))?;
    let mut values = Vec::new();
    for row in rows {
        let raw = row.map_err(|e| format!("Snapshot local invalido {endpoint}: {e}"))?;
        if let Some(data) = extract_response_data(&raw) {
            values.extend(extract_data_array(data));
        }
    }
    Ok(values)
}

fn find_local_snapshot_item(conn: &Connection, endpoint: &str, id: &str) -> Result<Option<Value>, String> {
    Ok(latest_snapshot_arrays(conn, endpoint)?
        .into_iter()
        .find(|item| value_string(item, "id").map(|item_id| item_id == id).unwrap_or(false)))
}

fn process_local_treasury_batch(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let payload = parse_json_body(&input.body)?;
    let pagos = payload
        .get("pagos")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let batch_id = value_string(&payload, "referencia_lote")
        .or_else(|| value_string(&payload, "idempotency_key"))
        .unwrap_or_else(|| format!("local-payment-batch-{}", Uuid::new_v4()));
    let timestamp = now_ms();
    let cuenta_id = value_string(&payload, "cuenta_bancaria_id").unwrap_or_default();
    let cuenta = if cuenta_id.is_empty() {
        None
    } else {
        find_local_snapshot_item(conn, "/api/finanzas/bancos/cuentas", &cuenta_id)?
    };

    let mut total = 0.0f64;
    let mut payment_details = Vec::new();
    for pago in pagos.iter() {
        let cxp_id = value_string(pago, "cxp_id").unwrap_or_default();
        let cxp = if cxp_id.is_empty() {
            None
        } else {
            find_local_snapshot_item(conn, "/api/finanzas/tesoreria/programacion", &cxp_id)?
                .or_else(|| find_local_snapshot_item(conn, "/api/finanzas/cxp", &cxp_id).ok().flatten())
        };
        let saldo = cxp
            .as_ref()
            .and_then(|value| value.get("saldo").and_then(Value::as_f64))
            .unwrap_or(0.0);
        let monto = pago
            .get("monto")
            .and_then(Value::as_f64)
            .filter(|value| *value > 0.0)
            .unwrap_or(saldo);
        total += monto;
        let saldo_nuevo = (saldo - monto).max(0.0);
        let proveedor = cxp
            .as_ref()
            .and_then(|value| value.get("proveedor"))
            .and_then(|value| {
                value_string(value, "razon_social")
                    .or_else(|| value_string(value, "nombre"))
                    .or_else(|| value_string(value, "ruc"))
            })
            .or_else(|| cxp.as_ref().and_then(|value| value_string(value, "proveedor_nombre")))
            .unwrap_or_else(|| "Proveedor pendiente de sincronizacion".to_string());
        payment_details.push(serde_json::json!({
            "id": format!("local-payment-{}", Uuid::new_v4()),
            "cxp_id": cxp_id,
            "proveedor": proveedor,
            "numero_documento": cxp
                .as_ref()
                .and_then(|value| value_string(value, "numero_documento"))
                .unwrap_or_else(|| "Pendiente".to_string()),
            "monto": monto,
            "saldo_anterior": saldo,
            "saldo_nuevo": saldo_nuevo,
            "estado_anterior": cxp
                .as_ref()
                .and_then(|value| value_string(value, "estado"))
                .unwrap_or_else(|| "PENDIENTE".to_string()),
            "estado_nuevo": if saldo_nuevo <= 0.0 { "PAGADO" } else { "PARCIAL" },
            "offline": true,
            "sync_status": "pending"
        }));
    }

    let saldo_anterior = cuenta
        .as_ref()
        .and_then(|value| value.get("saldo").and_then(Value::as_f64))
        .unwrap_or(0.0);
    let saldo_nuevo = if saldo_anterior > 0.0 {
        (saldo_anterior - total).max(0.0)
    } else {
        0.0
    };
    let result = serde_json::json!({
        "lote_id": batch_id,
        "total_pagos": payment_details.len(),
        "pagos_exitosos": payment_details.len(),
        "monto_total": total,
        "fecha_pago": value_string(&payload, "fecha_pago"),
        "metodo_pago": value_string(&payload, "metodo_pago"),
        "referencia_lote": value_string(&payload, "referencia_lote")
            .unwrap_or_else(|| batch_id.clone()),
        "observaciones": value_string(&payload, "observaciones"),
        "cuenta_bancaria": {
            "id": cuenta_id,
            "nombre": cuenta
                .as_ref()
                .and_then(|value| value_string(value, "nombre"))
                .unwrap_or_else(|| "Cuenta local".to_string()),
            "moneda": cuenta
                .as_ref()
                .and_then(|value| value_string(value, "moneda"))
                .unwrap_or_else(|| "PEN".to_string()),
            "saldo_anterior": saldo_anterior,
            "saldo_nuevo": saldo_nuevo
        },
        "pagos": payment_details,
        "offline": true,
        "local_first": true,
        "sync_status": "pending",
        "created_at": timestamp,
        "updated_at": timestamp
    });

    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_generic_records
            (id, tenant_id, endpoint, collection_endpoint, method, data_json, deleted, sync_status, created_at, updated_at)
        VALUES (?1, ?2, ?3, '/api/finanzas/tesoreria/pagos', 'POST', ?4, 0, 'pending', ?5, ?5)
        "#,
        params![
            batch_id,
            input.tenant_id.as_deref(),
            format!("/api/finanzas/tesoreria/pagos/{batch_id}"),
            serde_json::to_string(&result)
                .map_err(|e| format!("No se pudo serializar lote local de pagos: {e}"))?,
            timestamp,
        ],
    )
    .map_err(|e| format!("No se pudo guardar lote local de pagos: {e}"))?;

    let queued_input = with_json_body_fields(
        &with_local_entity_headers(input, &batch_id, "treasury_payment_batch"),
        &[
            ("referencia_lote", serde_json::json!(batch_id.clone())),
            ("idempotency_key", serde_json::json!(batch_id.clone())),
        ],
    )?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(result, "Lote de pagos guardado localmente; pendiente de sincronizacion")
}

fn session_id_from_endpoint(endpoint: &str, prefix: &str) -> Option<String> {
    endpoint
        .strip_prefix(prefix)?
        .trim_matches('/')
        .split('/')
        .next()
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn local_cash_movements(
    conn: &Connection,
    session_id: &str,
    tenant_id: Option<&str>,
) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT data_json FROM local_generic_records
            WHERE collection_endpoint = '/api/cajas/movimientos'
              AND deleted = 0
              AND ((?1 IS NULL AND tenant_id IS NULL) OR tenant_id = ?1)
            ORDER BY created_at ASC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar movimientos de caja locales: {e}"))?;
    let rows = stmt
        .query_map(params![tenant_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("No se pudo leer movimientos de caja locales: {e}"))?;
    let mut movements = Vec::new();
    for row in rows {
        let raw = row.map_err(|e| format!("Movimiento de caja local invalido: {e}"))?;
        let value = serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null);
        let belongs = value_string(&value, "sesion_caja_id")
            .or_else(|| value_string(&value, "sesion_id"))
            .map(|id| id == session_id)
            .unwrap_or(false);
        if belongs {
            movements.push(value);
        }
    }
    Ok(movements)
}

fn local_session_start_amount(
    conn: &Connection,
    session_id: &str,
    tenant_id: Option<&str>,
) -> Result<f64, String> {
    let raw: Option<String> = conn
        .query_row(
            r#"
            SELECT data_json FROM pos_cash_sessions
            WHERE id = ?1
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            "#,
            params![session_id, tenant_id],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Ok(0.0);
    };
    let session = serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null);
    Ok(session
        .get("monto_inicio")
        .or_else(|| session.get("monto_inicial"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0))
}

fn local_session_sales_total(
    conn: &Connection,
    session_id: &str,
    tenant_id: Option<&str>,
) -> Result<f64, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT total FROM pos_sales
            WHERE sesion_caja_id = ?1
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            "#,
        )
        .map_err(|e| format!("No se pudo preparar ventas de sesion local: {e}"))?;
    let rows = stmt
        .query_map(params![session_id, tenant_id], |row| row.get::<_, f64>(0))
        .map_err(|e| format!("No se pudo leer ventas de sesion local: {e}"))?;
    let mut total = 0.0;
    for row in rows {
        total += row.map_err(|e| format!("Venta de sesion local invalida: {e}"))?;
    }
    Ok(total)
}

fn local_cash_expected_balance(
    conn: &Connection,
    session_id: &str,
    tenant_id: Option<&str>,
) -> Result<f64, String> {
    let start = local_session_start_amount(conn, session_id, tenant_id)?;
    let sales = local_session_sales_total(conn, session_id, tenant_id)?;
    let movements = local_cash_movements(conn, session_id, tenant_id)?
        .iter()
        .map(|movement| movement.get("monto").and_then(Value::as_f64).unwrap_or(0.0))
        .sum::<f64>();
    Ok(start + sales + movements)
}

fn build_cash_movements_snapshot(
    conn: &Connection,
    endpoint: &str,
    tenant_id: Option<&str>,
) -> Result<LocalFirstResponse, String> {
    let session_id = session_id_from_endpoint(endpoint, "/api/cajas/movimientos/").unwrap_or_default();
    let mut movements = local_cash_movements(conn, &session_id, tenant_id)?;
    let mut saldo = local_session_start_amount(conn, &session_id, tenant_id)?;
    for (index, movement) in movements.iter_mut().enumerate() {
        let amount = movement.get("monto").and_then(Value::as_f64).unwrap_or(0.0);
        let saldo_anterior = saldo;
        saldo += amount;
        if let Some(obj) = movement.as_object_mut() {
            obj.insert("secuencia".to_string(), serde_json::json!(index + 1));
            obj.insert("saldo_anterior".to_string(), serde_json::json!(saldo_anterior));
            obj.insert("saldo_nuevo".to_string(), serde_json::json!(saldo));
        }
    }
    json_success_response(Value::Array(movements), "Movimientos de caja locales")
}

fn build_cash_expected_balance_snapshot(
    conn: &Connection,
    endpoint: &str,
    tenant_id: Option<&str>,
) -> Result<LocalFirstResponse, String> {
    let session_id = session_id_from_endpoint(endpoint, "/api/cajas/saldo-esperado/").unwrap_or_default();
    let monto_inicial = local_session_start_amount(conn, &session_id, tenant_id)?;
    let ventas = local_session_sales_total(conn, &session_id, tenant_id)?;
    let movimientos = local_cash_movements(conn, &session_id, tenant_id)?
        .iter()
        .map(|movement| movement.get("monto").and_then(Value::as_f64).unwrap_or(0.0))
        .sum::<f64>();
    let saldo_esperado = monto_inicial + ventas + movimientos;
    json_success_response(
        serde_json::json!({
            "sesion_id": session_id,
            "monto_inicial": monto_inicial,
            "total_ventas": ventas,
            "total_movimientos": movimientos,
            "saldo_esperado": saldo_esperado,
            "monto_esperado": saldo_esperado,
            "offline": true,
            "local_first": true
        }),
        "Saldo esperado local de caja",
    )
}

fn process_local_cash_movement(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let payload = parse_json_body(&input.body)?;
    let session_id = session_id_from_endpoint(&input.endpoint, "/api/cajas/movimientos/manual/")
        .or_else(|| session_id_from_endpoint(&input.endpoint, "/api/cajas/retiros/"))
        .ok_or_else(|| "El movimiento local requiere sesion de caja".to_string())?;
    let timestamp = now_ms();
    let movement_id = value_string(&payload, "idempotency_key")
        .or_else(|| value_string(&payload, "referencia_documento"))
        .unwrap_or_else(|| format!("local-cash-movement-{}", Uuid::new_v4()));
    let is_withdrawal = input.endpoint.starts_with("/api/cajas/retiros/");
    let tipo = if is_withdrawal {
        "RETIRO".to_string()
    } else {
        value_string(&payload, "tipo").unwrap_or_else(|| "INGRESO".to_string()).to_uppercase()
    };
    let raw_amount = payload.get("monto").and_then(Value::as_f64).unwrap_or(0.0).abs();
    let signed_amount = if matches!(tipo.as_str(), "GASTO" | "RETIRO" | "EGRESO") {
        -raw_amount
    } else {
        raw_amount
    };
    let tenant = input.tenant_id.as_deref();
    let saldo_anterior = local_cash_expected_balance(conn, &session_id, tenant)?;
    let saldo_nuevo = saldo_anterior + signed_amount;
    let movement = serde_json::json!({
        "id": movement_id,
        "sesion_caja_id": session_id,
        "sesion_id": session_id,
        "tipo_movimiento": tipo,
        "monto": signed_amount,
        "saldo_anterior": saldo_anterior,
        "saldo_nuevo": saldo_nuevo,
        "timestamp": timestamp,
        "motivo": value_string(&payload, "motivo")
            .or_else(|| value_string(&payload, "motivo_detalle"))
            .unwrap_or_else(|| "Movimiento offline".to_string()),
        "referencia_tipo": if is_withdrawal { "RETIRO" } else { "MANUAL" },
        "referencia_documento": movement_id,
        "offline": true,
        "local_first": true,
        "sync_status": "pending"
    });

    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_generic_records
            (id, tenant_id, endpoint, collection_endpoint, method, data_json, deleted, sync_status, created_at, updated_at)
        VALUES (?1, ?2, ?3, '/api/cajas/movimientos', 'POST', ?4, 0, 'pending', ?5, ?5)
        "#,
        params![
            &movement_id,
            tenant,
            format!("/api/cajas/movimientos/{session_id}/{movement_id}"),
            serde_json::to_string(&movement)
                .map_err(|e| format!("No se pudo serializar movimiento de caja local: {e}"))?,
            timestamp,
        ],
    )
    .map_err(|e| format!("No se pudo guardar movimiento de caja local: {e}"))?;
    let queued_input = with_json_body_fields(
        &with_local_entity_headers(input, &movement_id, "cash_movement"),
        &[
            ("idempotency_key", serde_json::json!(movement_id.clone())),
            ("referencia_documento", serde_json::json!(movement_id.clone())),
        ],
    )?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(movement, "Movimiento de caja guardado localmente")
}

fn process_local_shift_change(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let payload = parse_json_body(&input.body)?;
    let timestamp = now_ms();
    let tenant = input.tenant_id.as_deref();
    if input.endpoint.starts_with("/api/cajas/cambio-turno/iniciar/") {
        let session_id = session_id_from_endpoint(&input.endpoint, "/api/cajas/cambio-turno/iniciar/")
            .ok_or_else(|| "El cambio de turno local requiere sesion".to_string())?;
        let change_id = value_string(&payload, "idempotency_key")
            .unwrap_or_else(|| format!("local-shift-change-{}", Uuid::new_v4()));
        let tenant = input.tenant_id.as_deref();
        let saldo_sistema = local_cash_expected_balance(conn, &session_id, tenant)?;
        let data = serde_json::json!({
            "id": change_id,
            "sesion_caja_id": session_id,
            "usuario_entrante_id": value_string(&payload, "usuario_entrante_id"),
            "saldo_sistema": saldo_sistema,
            "estado": "EN_CONTEO",
            "offline": true,
            "local_first": true,
            "sync_status": "pending",
            "created_at": timestamp,
            "updated_at": timestamp
        });
        conn.execute(
            r#"
            INSERT OR REPLACE INTO local_generic_records
                (id, tenant_id, endpoint, collection_endpoint, method, data_json, deleted, sync_status, created_at, updated_at)
            VALUES (?1, ?2, ?3, '/api/cajas/cambios-turno', 'POST', ?4, 0, 'pending', ?5, ?5)
            "#,
            params![
                &change_id,
                tenant,
                format!("/api/cajas/cambios-turno/{change_id}"),
                serde_json::to_string(&data)
                    .map_err(|e| format!("No se pudo serializar cambio de turno local: {e}"))?,
                timestamp,
            ],
        )
        .map_err(|e| format!("No se pudo guardar cambio de turno local: {e}"))?;
        let queued_input = with_json_body_fields(
            &with_local_entity_headers(input, &change_id, "cash_shift_change"),
            &[("idempotency_key", serde_json::json!(change_id.clone()))],
        )?;
        enqueue_offline_request_with_conn(conn, &queued_input)?;
        return json_success_response(data, "Cambio de turno iniciado localmente");
    }

    let change_id = session_id_from_endpoint(&input.endpoint, "/api/cajas/cambio-turno/completar/")
        .ok_or_else(|| "El cierre de cambio local requiere cambio_id".to_string())?;
    let mut data = conn
        .query_row(
            r#"
            SELECT data_json FROM local_generic_records
            WHERE id = ?1
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            "#,
            params![&change_id, tenant],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .unwrap_or_else(|| serde_json::json!({ "id": change_id }));
    let saldo_sistema = data
        .get("saldo_sistema")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let monto_contado = payload
        .get("monto_contado")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    if let (Some(obj), Some(payload_obj)) = (data.as_object_mut(), payload.as_object()) {
        for (key, value) in payload_obj {
            obj.insert(key.clone(), value.clone());
        }
        obj.insert("estado".to_string(), serde_json::json!("COMPLETADO"));
        obj.insert("saldo_sistema".to_string(), serde_json::json!(saldo_sistema));
        obj.insert("diferencia".to_string(), serde_json::json!(monto_contado - saldo_sistema));
        obj.insert("offline".to_string(), serde_json::json!(true));
        obj.insert("local_first".to_string(), serde_json::json!(true));
        obj.insert("sync_status".to_string(), serde_json::json!("pending"));
        obj.insert("updated_at".to_string(), serde_json::json!(timestamp));
    }
    conn.execute(
        r#"
        UPDATE local_generic_records
        SET data_json = ?2, updated_at = ?3
        WHERE id = ?1
          AND ((?4 IS NULL AND tenant_id IS NULL) OR tenant_id = ?4)
        "#,
        params![
            &change_id,
            serde_json::to_string(&data)
                .map_err(|e| format!("No se pudo serializar cierre de cambio local: {e}"))?,
            timestamp,
            tenant,
        ],
    )
    .map_err(|e| format!("No se pudo actualizar cambio de turno local: {e}"))?;
    let queued_input = with_json_body_fields(
        &with_local_entity_headers(input, &change_id, "cash_shift_change"),
        &[("idempotency_key", serde_json::json!(change_id.clone()))],
    )?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(data, "Cambio de turno completado localmente")
}

fn enqueue_offline_request_with_conn(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<OfflineQueueItem, String> {
    let timestamp = now_ms();
    let item = OfflineQueueItem {
        id: Uuid::new_v4().to_string(),
        endpoint: input.endpoint.clone(),
        method: input.method.to_uppercase(),
        url: input.url.clone(),
        headers: input.headers.clone(),
        body: input.body.clone(),
        tenant_id: input.tenant_id.clone(),
        user_id: input.user_id.clone(),
        status: "pending".to_string(),
        attempts: 0,
        created_at: timestamp,
        updated_at: timestamp,
        last_error: None,
        response_status: None,
        response_body: None,
    };
    insert_offline_item(conn, &item)?;
    Ok(item)
}

fn process_local_cash_open(conn: &Connection, input: &LocalFirstWriteInput) -> Result<LocalFirstResponse, String> {
    let payload = parse_json_body(&input.body)?;
    let caja_id = value_string(&payload, "caja_id").unwrap_or_else(|| {
        input
            .endpoint
            .trim_start_matches("/api/cajas/")
            .trim_end_matches("/apertura")
            .trim_end_matches("/abrir")
            .to_string()
    });
    let session_id = value_string(&payload, "idempotency_key")
        .or_else(|| value_string(&payload, "local_session_id"))
        .unwrap_or_else(|| format!("local-session-{}", Uuid::new_v4()));
    let monto_inicio = value_number(&payload, "monto_inicio");
    let timestamp = now_ms();
    let tenant = input.tenant_id.as_deref();
    let session = serde_json::json!({
        "id": session_id,
        "tenant_id": input.tenant_id.clone(),
        "caja_id": caja_id,
        "estado": "ABIERTA",
        "monto_inicio": monto_inicio,
        "monto_inicial": monto_inicio,
        "monto_esperado": monto_inicio,
        "hora_apertura": timestamp,
        "fecha_apertura": timestamp,
        "offline": true,
        "sync_status": "pending"
    });

    conn.execute(
        r#"
        UPDATE pos_cash_sessions
        SET estado = 'CERRADA', closed_at = ?1, updated_at = ?1
        WHERE estado = 'ABIERTA'
          AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
        "#,
        params![timestamp, tenant],
    )
        .map_err(|e| format!("No se pudo cerrar sesion local anterior: {e}"))?;
    conn.execute(
        r#"
        INSERT INTO pos_cash_sessions
            (id, tenant_id, caja_id, estado, monto_inicio, opened_at, data_json, updated_at)
        VALUES (?1, ?2, ?3, 'ABIERTA', ?4, ?5, ?6, ?5)
        "#,
        params![
            session_id,
            tenant,
            caja_id,
            monto_inicio,
            timestamp,
            serde_json::to_string(&session)
                .map_err(|e| format!("No se pudo serializar sesion local: {e}"))?,
        ],
    )
    .map_err(|e| format!("No se pudo abrir caja local: {e}"))?;
    let queued_input = with_json_body_fields(
        &with_local_entity_headers(input, &session_id, "cash_session"),
        &[
            ("idempotency_key", serde_json::json!(session_id.clone())),
            ("local_session_id", serde_json::json!(session_id.clone())),
        ],
    )?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(session, "Caja abierta localmente; pendiente de sincronizacion")
}

fn process_local_cash_close(conn: &Connection, input: &LocalFirstWriteInput) -> Result<LocalFirstResponse, String> {
    let payload = parse_json_body(&input.body)?;
    let session_id = value_string(&payload, "sesion_id")
        .or_else(|| value_string(&payload, "sesionId"))
        .or_else(|| input.endpoint.strip_prefix("/api/cajas/cerrar/").map(str::to_string))
        .ok_or_else(|| "El cierre local requiere sesion_id".to_string())?;
    let monto_cierre = payload
        .get("monto_cierre")
        .or_else(|| payload.get("monto_contado"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let timestamp = now_ms();
    let tenant = input.tenant_id.as_deref();
    let mut session = serde_json::json!({
        "id": session_id,
        "tenant_id": input.tenant_id.clone(),
        "estado": "CERRADA",
        "monto_cierre": monto_cierre,
        "monto_contado": monto_cierre,
        "hora_cierre": timestamp,
        "fecha_cierre": timestamp,
        "offline": true,
        "sync_status": "pending"
    });

    let existing: Option<String> = conn
        .query_row(
            r#"
            SELECT data_json FROM pos_cash_sessions
            WHERE id = ?1
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            "#,
            params![&session_id, tenant],
            |row| row.get(0),
        )
        .ok();
    if let Some(raw) = existing {
        if let Ok(mut current) = serde_json::from_str::<Value>(&raw) {
            if let (Some(current_obj), Some(next_obj)) = (current.as_object_mut(), session.as_object()) {
                for (key, value) in next_obj {
                    current_obj.insert(key.clone(), value.clone());
                }
            }
            session = current;
        }
    }

    conn.execute(
        r#"
        UPDATE pos_cash_sessions
        SET estado = 'CERRADA', monto_cierre = ?2, closed_at = ?3, data_json = ?4, updated_at = ?3
        WHERE id = ?1
          AND ((?5 IS NULL AND tenant_id IS NULL) OR tenant_id = ?5)
        "#,
        params![
            session_id,
            monto_cierre,
            timestamp,
            serde_json::to_string(&session)
                .map_err(|e| format!("No se pudo serializar cierre local: {e}"))?,
            tenant,
        ],
    )
    .map_err(|e| format!("No se pudo cerrar caja local: {e}"))?;
    let queued_input = with_json_body_fields(
        &with_local_entity_headers(input, &session_id, "cash_session"),
        &[("idempotency_key", serde_json::json!(format!("cash-close-{session_id}")))],
    )?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(session, "Caja cerrada localmente; pendiente de sincronizacion")
}

fn process_local_pos_sale(
    conn: &Connection,
    input: &LocalFirstWriteInput,
    config: &AppConfig,
) -> Result<LocalFirstResponse, String> {
    let payload = parse_json_body(&input.body)?;
    let tenant = input.tenant_id.as_deref();
    let idempotency_key = value_string(&payload, "idempotency_key")
        .unwrap_or_else(|| format!("local-{}", Uuid::new_v4()));
    let existing: Option<String> = conn
        .query_row(
            r#"
            SELECT response_json FROM pos_sales
            WHERE idempotency_key = ?1
              AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
            "#,
            params![&idempotency_key, tenant],
            |row| row.get(0),
        )
        .ok();
    if let Some(raw) = existing {
        let body: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
        return json_success_response(
            body.get("data").cloned().unwrap_or(body),
            "Venta local idempotente ya registrada",
        );
    }

    let sale_id = format!("local-sale-{}", Uuid::new_v4());
    let numero_ticket = value_string(&payload, "numero_comprobante")
        .unwrap_or_else(|| format!("L{:08}", now_ms() % 100_000_000));
    let sesion_caja_id = value_string(&payload, "sesion_caja_id")
        .ok_or_else(|| "La venta local requiere sesion_caja_id".to_string())?;
    let total = value_number(&payload, "total");
    let permite_sin_stock = payload
        .get("permite_venta_sin_stock")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let items = payload
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| "La venta local requiere items".to_string())?;

    let mut items_actualizados = Vec::new();
    for item in items {
        let producto_id = value_string(item, "producto_id")
            .ok_or_else(|| "Item POS local sin producto_id".to_string())?;
        let cantidad = value_number(item, "cantidad");
        let mut product_raw: String = conn
            .query_row(
                r#"
                SELECT data_json FROM pos_products
                WHERE id = ?1
                  AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
                "#,
                params![&producto_id, tenant],
                |row| row.get(0),
            )
            .map_err(|_| format!("Producto {producto_id} no existe en SQLite local"))?;
        let mut product_json: Value = serde_json::from_str(&product_raw)
            .map_err(|e| format!("Producto {producto_id} invalido en SQLite local: {e}"))?;
        let stock_actual = product_json
            .get("stock_actual")
            .or_else(|| product_json.get("stock"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        if !permite_sin_stock && stock_actual < cantidad {
            return Err(format!(
                "Stock local insuficiente para {}: disponible {}, requerido {}",
                producto_id, stock_actual, cantidad
            ));
        }
        let next_stock = stock_actual - cantidad;
        if let Some(obj) = product_json.as_object_mut() {
            obj.insert("stock_actual".to_string(), serde_json::json!(next_stock));
            obj.insert("stock_disponible".to_string(), serde_json::json!(next_stock));
            obj.insert("offline_dirty".to_string(), serde_json::json!(true));
        }
        product_raw = serde_json::to_string(&product_json)
            .map_err(|e| format!("No se pudo serializar stock local: {e}"))?;
        conn.execute(
            r#"
            UPDATE pos_products
            SET stock_actual = ?2, stock_disponible = ?2, data_json = ?3, updated_at = ?4
            WHERE id = ?1
              AND ((?5 IS NULL AND tenant_id IS NULL) OR tenant_id = ?5)
            "#,
            params![producto_id, next_stock, product_raw, now_ms(), tenant],
        )
        .map_err(|e| format!("No se pudo descontar stock local POS: {e}"))?;
        items_actualizados.push(serde_json::json!({
            "producto_id": producto_id,
            "stock_actual": next_stock,
            "stock_disponible": next_stock
        }));
    }

    let timestamp = now_ms();
    let mut response = serde_json::json!({
            "success": true,
            "offline": true,
            "local_first": true,
            "data": {
                "venta_id": sale_id,
                "id": sale_id,
                "tenant_id": input.tenant_id.clone(),
                "numero_ticket": numero_ticket,
            "total": total,
            "subtotal": value_number(&payload, "subtotal"),
            "impuestos": value_number(&payload, "impuestos"),
            "estado": "PENDIENTE_SYNC",
            "factura_electronica": false,
            "facturacion_pendiente": true,
            "cpe_pendiente": true,
            "sesion_caja_id": sesion_caja_id,
            "cliente_nombre": value_string(&payload, "cliente_nombre").unwrap_or_else(|| "Cliente General".to_string()),
            "cliente_documento": value_string(&payload, "cliente_documento").unwrap_or_else(|| "00000000".to_string()),
            "numero_comprobante": numero_ticket,
            "fecha": timestamp,
            "items_actualizados": items_actualizados
        },
        "message": "Venta guardada localmente; pendiente de sincronizacion"
    });
    let response_raw = serde_json::to_string(&response)
        .map_err(|e| format!("No se pudo serializar venta local: {e}"))?;
    conn.execute(
        r#"
        INSERT INTO pos_sales
            (id, tenant_id, idempotency_key, sesion_caja_id, numero_ticket, total, body_json, response_json, sync_status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?9)
        "#,
        params![
            sale_id,
            tenant,
            idempotency_key,
            sesion_caja_id,
            numero_ticket,
            total,
            input.body.clone().unwrap_or_default(),
            response_raw,
            timestamp,
        ],
    )
    .map_err(|e| format!("No se pudo guardar venta POS local: {e}"))?;

    let queued_input = with_local_sync_contract(input, &sale_id, "pos_sale")?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;

    if !config.ruc.trim().is_empty() && !config.razon_social.trim().is_empty() {
        let fiscal_input = OfflineFiscalDocumentInput {
            document_type: if value_string(&payload, "tipo_comprobante")
                .unwrap_or_default()
                .eq_ignore_ascii_case("factura")
            {
                "factura".to_string()
            } else {
                "boleta".to_string()
            },
            serie: value_string(&payload, "serie"),
            cliente_ruc: value_string(&payload, "cliente_documento"),
            cliente_nombre: value_string(&payload, "cliente_nombre")
                .or_else(|| Some("Cliente General".to_string())),
            moneda: Some("PEN".to_string()),
            subtotal: value_number(&payload, "subtotal"),
            igv: value_number(&payload, "impuestos"),
            total,
            items: items.clone(),
            source_type: Some("pos_sale".to_string()),
            source_id: Some(sale_id.clone()),
        };
        if let Ok(fiscal_doc) = create_local_fiscal_document_with_conn(
            conn,
            config,
            fiscal_input,
            input.tenant_id.clone(),
            input.user_id.clone(),
            bearer_token_from_headers(&input.headers),
        ) {
            if let Some(data) = response.get_mut("data").and_then(Value::as_object_mut) {
                data.insert("cpe_id".to_string(), serde_json::json!(fiscal_doc.id));
                data.insert("cpe_estado".to_string(), serde_json::json!(fiscal_doc.estado));
                data.insert("cpe_hash".to_string(), serde_json::json!(fiscal_doc.hash));
            }
            let response_raw = serde_json::to_string(&response)
                .map_err(|e| format!("No se pudo serializar venta local con CPE: {e}"))?;
            conn.execute(
                r#"
                UPDATE pos_sales
                SET response_json = ?2, updated_at = ?3
                WHERE id = ?1
                  AND ((?4 IS NULL AND tenant_id IS NULL) OR tenant_id = ?4)
                "#,
                params![sale_id, response_raw, now_ms(), tenant],
            )
            .map_err(|e| format!("No se pudo actualizar venta POS local con CPE: {e}"))?;
        }
    }
    let data = response
        .get("data")
        .cloned()
        .ok_or_else(|| "Respuesta POS local sin data".to_string())?;
    json_success_response(data, "Venta guardada localmente; pendiente de sincronizacion")
}

fn normalize_product_payload(payload: &Value, id: String, deleted: bool) -> Value {
    let mut product = payload.clone();
    if let Some(obj) = product.as_object_mut() {
        obj.insert("id".to_string(), serde_json::json!(id));
        obj.insert(
            "codigo".to_string(),
            serde_json::json!(
                value_string(payload, "codigo").unwrap_or_else(|| format!("LOCAL-{}", now_ms()))
            ),
        );
        obj.insert(
            "nombre".to_string(),
            serde_json::json!(value_string(payload, "nombre").unwrap_or_else(|| "Producto local".to_string())),
        );
        let stock = payload
            .get("stock_actual")
            .or_else(|| payload.get("stock"))
            .and_then(Value::as_f64)
            .unwrap_or_else(|| value_number(payload, "stock"));
        obj.insert("stock_actual".to_string(), serde_json::json!(stock));
        obj.insert("stock_disponible".to_string(), serde_json::json!(stock));
        obj.insert(
            "stock_minimo".to_string(),
            serde_json::json!(
                payload
                    .get("stock_minimo")
                    .or_else(|| payload.get("stockMinimo"))
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0)
            ),
        );
        obj.insert(
            "precio_venta".to_string(),
            serde_json::json!(
                payload
                    .get("precio_venta")
                    .or_else(|| payload.get("precioVenta"))
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0)
            ),
        );
        obj.insert(
            "precio_compra".to_string(),
            serde_json::json!(
                payload
                    .get("precio_compra")
                    .or_else(|| payload.get("precioCompra"))
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0)
            ),
        );
        obj.insert("activo".to_string(), serde_json::json!(!deleted));
        obj.insert("offline".to_string(), serde_json::json!(true));
        obj.insert("sync_status".to_string(), serde_json::json!("pending"));
    }
    product
}

fn process_local_inventory_product(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let method = input.method.to_uppercase();
    let timestamp = now_ms();
    let tenant = input.tenant_id.as_deref();
    let id = if method == "POST" {
        format!("local-product-{}", Uuid::new_v4())
    } else {
        input
            .endpoint
            .trim_start_matches("/api/inventario/productos/")
            .to_string()
    };

    let payload = if method == "DELETE" {
        let existing: Option<String> = conn
            .query_row(
                r#"
                SELECT data_json FROM pos_products
                WHERE id = ?1
                  AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
                "#,
                params![&id, tenant],
                |row| row.get(0),
            )
            .ok();
        existing
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or_else(|| serde_json::json!({ "id": id.clone() }))
    } else {
        parse_json_body(&input.body)?
    };

    let product = normalize_product_payload(&payload, id.clone(), method == "DELETE");
    let codigo = value_string(&product, "codigo");
    let nombre = value_string(&product, "nombre").unwrap_or_else(|| "Producto local".to_string());
    let stock = product
        .get("stock_actual")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    conn.execute(
        r#"
        INSERT OR REPLACE INTO pos_products
            (id, tenant_id, codigo, nombre, stock_actual, stock_disponible, data_json, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7)
        "#,
        params![
            id,
            tenant,
            codigo,
            nombre,
            stock,
            serde_json::to_string(&product)
                .map_err(|e| format!("No se pudo serializar producto local: {e}"))?,
            timestamp,
        ],
    )
    .map_err(|e| format!("No se pudo guardar producto local: {e}"))?;
    let queued_input = with_local_sync_contract(input, &id, "inventory_product")?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(product, "Producto guardado localmente; pendiente de sincronizacion")
}

fn normalize_customer_payload(payload: &Value, id: String, deleted: bool) -> Value {
    let mut customer = payload.clone();
    if let Some(obj) = customer.as_object_mut() {
        obj.insert("id".to_string(), serde_json::json!(id));
        obj.insert(
            "razon_social".to_string(),
            serde_json::json!(
                value_string(payload, "razon_social")
                    .or_else(|| value_string(payload, "nombre_comercial"))
                    .unwrap_or_else(|| "Cliente local".to_string())
            ),
        );
        obj.insert("activo".to_string(), serde_json::json!(!deleted));
        obj.insert("offline".to_string(), serde_json::json!(true));
        obj.insert("sync_status".to_string(), serde_json::json!("pending"));
    }
    customer
}

fn process_local_customer(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let method = input.method.to_uppercase();
    let timestamp = now_ms();
    let tenant = input.tenant_id.as_deref();
    let id = if method == "POST" {
        format!("local-customer-{}", Uuid::new_v4())
    } else {
        input
            .endpoint
            .trim_start_matches("/api/ventas/clientes/")
            .trim_start_matches("/api/pos/clientes/")
            .to_string()
    };

    let payload = if method == "DELETE" {
        let existing: Option<String> = conn
            .query_row(
                r#"
                SELECT data_json FROM local_customers
                WHERE id = ?1
                  AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
                "#,
                params![&id, tenant],
                |row| row.get(0),
            )
            .ok();
        existing
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or_else(|| serde_json::json!({ "id": id.clone() }))
    } else {
        parse_json_body(&input.body)?
    };

    let customer = normalize_customer_payload(&payload, id.clone(), method == "DELETE");
    let documento = value_string(&customer, "ruc")
        .or_else(|| value_string(&customer, "codigo"))
        .or_else(|| value_string(&customer, "documento_numero"))
        .or_else(|| value_string(&customer, "numero_documento"));
    let razon_social = value_string(&customer, "razon_social").unwrap_or_else(|| "Cliente local".to_string());
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_customers
            (id, tenant_id, documento, razon_social, data_json, deleted, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        params![
            id,
            tenant,
            documento,
            razon_social,
            serde_json::to_string(&customer)
                .map_err(|e| format!("No se pudo serializar cliente local: {e}"))?,
            if method == "DELETE" { 1 } else { 0 },
            timestamp,
        ],
    )
    .map_err(|e| format!("No se pudo guardar cliente local: {e}"))?;
    let queued_input = with_local_sync_contract(input, &id, "customer")?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(customer, "Cliente guardado localmente; pendiente de sincronizacion")
}

fn calculate_document_totals(payload: &Value) -> (f64, f64, f64) {
    let detalle = payload
        .get("detalle")
        .or_else(|| payload.get("items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let subtotal = payload.get("subtotal").and_then(Value::as_f64).unwrap_or_else(|| {
        detalle
            .iter()
            .map(|item| {
                item.get("subtotal")
                    .or_else(|| item.get("total"))
                    .and_then(Value::as_f64)
                    .unwrap_or_else(|| value_number(item, "cantidad") * value_number(item, "precio_unitario"))
            })
            .sum()
    });
    let igv = payload
        .get("igv")
        .or_else(|| payload.get("impuestos"))
        .and_then(Value::as_f64)
        .unwrap_or(subtotal * 0.18);
    let total = payload.get("total").and_then(Value::as_f64).unwrap_or(subtotal + igv);
    (subtotal, igv, total)
}

fn normalize_sales_document_payload(
    payload: &Value,
    id: String,
    kind: &str,
    deleted: bool,
) -> Value {
    let mut document = payload.clone();
    let (subtotal, igv, total) = calculate_document_totals(payload);
    if let Some(obj) = document.as_object_mut() {
        obj.insert("id".to_string(), serde_json::json!(id.clone()));
        obj.insert(
            "numero".to_string(),
            serde_json::json!(
                value_string(payload, "numero").unwrap_or_else(|| {
                    let prefix = if kind == "quote" { "COT-L" } else { "PED-L" };
                    format!("{prefix}-{:08}", now_ms() % 100_000_000)
                })
            ),
        );
        obj.insert(
            "estado".to_string(),
            serde_json::json!(
                value_string(payload, "estado").unwrap_or_else(|| {
                    if kind == "quote" {
                        "BORRADOR".to_string()
                    } else {
                        "PENDIENTE".to_string()
                    }
                })
            ),
        );
        let date_key = if kind == "quote" { "fecha" } else { "fecha_pedido" };
        if !obj.contains_key(date_key) {
            obj.insert(date_key.to_string(), serde_json::json!(now_ms()));
        }
        obj.insert("subtotal".to_string(), serde_json::json!(subtotal));
        obj.insert("igv".to_string(), serde_json::json!(igv));
        obj.insert("total".to_string(), serde_json::json!(total));
        obj.insert("activo".to_string(), serde_json::json!(!deleted));
        obj.insert("offline".to_string(), serde_json::json!(true));
        obj.insert("sync_status".to_string(), serde_json::json!("pending"));
    }
    document
}

fn reserve_order_stock(
    conn: &Connection,
    payload: &Value,
    tenant_id: Option<&str>,
) -> Result<(), String> {
    let detalle = payload
        .get("detalle")
        .or_else(|| payload.get("items"))
        .and_then(Value::as_array)
        .ok_or_else(|| "El pedido local requiere detalle".to_string())?;

    for item in detalle {
        let producto_id = value_string(item, "producto_id")
            .ok_or_else(|| "Item de pedido local sin producto_id".to_string())?;
        let cantidad = value_number(item, "cantidad");
        let raw: String = conn
            .query_row(
                r#"
                SELECT data_json FROM pos_products
                WHERE id = ?1
                  AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
                "#,
                params![&producto_id, tenant_id],
                |row| row.get(0),
            )
            .map_err(|_| format!("Producto {producto_id} no existe en SQLite local"))?;
        let mut product_json: Value = serde_json::from_str(&raw)
            .map_err(|e| format!("Producto {producto_id} invalido en SQLite local: {e}"))?;
        let stock_actual = product_json
            .get("stock_actual")
            .or_else(|| product_json.get("stock"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let stock_reservado = product_json
            .get("stock_reservado")
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let disponible = stock_actual - stock_reservado;
        if disponible < cantidad {
            return Err(format!(
                "Stock local insuficiente para reservar {}: disponible {}, requerido {}",
                producto_id, disponible, cantidad
            ));
        }
        let next_reservado = stock_reservado + cantidad;
        if let Some(obj) = product_json.as_object_mut() {
            obj.insert("stock_reservado".to_string(), serde_json::json!(next_reservado));
            obj.insert("offline_dirty".to_string(), serde_json::json!(true));
        }
        conn.execute(
            r#"
            UPDATE pos_products
            SET data_json = ?2, updated_at = ?3
            WHERE id = ?1
              AND ((?4 IS NULL AND tenant_id IS NULL) OR tenant_id = ?4)
            "#,
            params![
                producto_id,
                serde_json::to_string(&product_json)
                    .map_err(|e| format!("No se pudo serializar reserva local: {e}"))?,
                now_ms(),
                tenant_id,
            ],
        )
        .map_err(|e| format!("No se pudo reservar stock local: {e}"))?;
    }
    Ok(())
}

fn process_local_sales_document(
    conn: &Connection,
    input: &LocalFirstWriteInput,
    kind: &str,
) -> Result<LocalFirstResponse, String> {
    let method = input.method.to_uppercase();
    let timestamp = now_ms();
    let tenant = input.tenant_id.as_deref();
    let base = if kind == "quote" {
        "/api/ventas/cotizaciones/"
    } else {
        "/api/ventas/pedidos/"
    };
    let id = if method == "POST" {
        format!(
            "local-{}-{}",
            if kind == "quote" { "quote" } else { "order" },
            Uuid::new_v4()
        )
    } else {
        input.endpoint.trim_start_matches(base).to_string()
    };

    let payload = if method == "DELETE" {
        let existing: Option<String> = conn
            .query_row(
                r#"
                SELECT data_json FROM local_sales_documents
                WHERE id = ?1 AND kind = ?2
                  AND ((?3 IS NULL AND tenant_id IS NULL) OR tenant_id = ?3)
                "#,
                params![&id, kind, tenant],
                |row| row.get(0),
            )
            .ok();
        existing
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or_else(|| serde_json::json!({ "id": id.clone() }))
    } else {
        parse_json_body(&input.body)?
    };

    let document = normalize_sales_document_payload(&payload, id.clone(), kind, method == "DELETE");
    if kind == "order" && method == "POST" {
        reserve_order_stock(conn, &document, tenant)?;
    }
    let numero = value_string(&document, "numero").unwrap_or_else(|| id.clone());
    let cliente_id = value_string(&document, "cliente_id");
    let estado = value_string(&document, "estado").unwrap_or_else(|| {
        if kind == "quote" {
            "BORRADOR".to_string()
        } else {
            "PENDIENTE".to_string()
        }
    });
    let total = value_number(&document, "total");
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_sales_documents
            (id, tenant_id, kind, numero, cliente_id, estado, total, data_json, deleted, sync_status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?10)
        "#,
        params![
            id,
            tenant,
            kind,
            numero,
            cliente_id,
            estado,
            total,
            serde_json::to_string(&document)
                .map_err(|e| format!("No se pudo serializar documento venta local: {e}"))?,
            if method == "DELETE" { 1 } else { 0 },
            timestamp,
        ],
    )
    .map_err(|e| format!("No se pudo guardar documento venta local: {e}"))?;
    let entity_type = if kind == "quote" { "sales_quote" } else { "sales_order" };
    let queued_input = with_local_sync_contract(input, &id, entity_type)?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(
        attach_customer(conn, document, tenant),
        if kind == "quote" {
            "Cotizacion guardada localmente; pendiente de sincronizacion"
        } else {
            "Pedido guardado localmente; pendiente de sincronizacion"
        },
    )
}

fn process_local_attendance_mark(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let payload = parse_json_body(&input.body)?;
    let timestamp = now_ms();
    let tenant = input.tenant_id.as_deref();
    let empleado_id = value_string(&payload, "empleado_id")
        .or_else(|| {
            input
                .endpoint
                .trim_start_matches("/api/rrhh/asistencia/entrada/")
                .trim_start_matches("/api/rrhh/asistencia/salida/")
                .split('/')
                .next()
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .ok_or_else(|| "La marcacion local requiere empleado_id".to_string())?;
    let fecha = value_string(&payload, "fecha").unwrap_or_else(current_utc_date);
    let tipo = value_string(&payload, "tipo").unwrap_or_else(|| {
        if input.endpoint.contains("/salida/") {
            "salida".to_string()
        } else {
            "entrada".to_string()
        }
    });
    let hora = value_string(&payload, "hora").unwrap_or_else(|| {
        let seconds = (timestamp / 1000) % 86_400;
        format!("{:02}:{:02}:{:02}", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
    });

    let mut existing_id: Option<String> = None;
    let mut existing_data: Option<Value> = None;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, data_json FROM local_generic_records
            WHERE collection_endpoint = '/api/rrhh/asistencias' AND deleted = 0
              AND ((?1 IS NULL AND tenant_id IS NULL) OR tenant_id = ?1)
            "#,
        )
        .map_err(|e| format!("No se pudo preparar asistencia local: {e}"))?;
    let rows = stmt
        .query_map(params![tenant], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| format!("No se pudo leer asistencia local: {e}"))?;
    for row in rows {
        let (id, raw) = row.map_err(|e| format!("Asistencia local invalida: {e}"))?;
        if let Ok(data) = serde_json::from_str::<Value>(&raw) {
            let same_employee = value_string(&data, "empleado_id")
                .or_else(|| value_string(&data, "id_empleado"))
                .map(|value| value == empleado_id)
                .unwrap_or(false);
            let same_date = value_string(&data, "fecha")
                .map(|value| value == fecha)
                .unwrap_or(false);
            if same_employee && same_date {
                existing_id = Some(id);
                existing_data = Some(data);
                break;
            }
        }
    }

    let id = existing_id.unwrap_or_else(|| format!("local-attendance-{}", Uuid::new_v4()));
    let mut attendance = existing_data.unwrap_or_else(|| {
        serde_json::json!({
            "id": id,
            "empleado_id": empleado_id,
            "id_empleado": empleado_id,
            "fecha": fecha,
            "offline": true,
            "sync_status": "pending"
        })
    });
    if let Some(obj) = attendance.as_object_mut() {
        obj.insert("id".to_string(), serde_json::json!(id.clone()));
        obj.insert("empleado_id".to_string(), serde_json::json!(empleado_id));
        obj.insert("id_empleado".to_string(), serde_json::json!(empleado_id));
        obj.insert("fecha".to_string(), serde_json::json!(fecha));
        if tipo.eq_ignore_ascii_case("salida") {
            obj.insert("hora_salida".to_string(), serde_json::json!(hora));
        } else {
            obj.insert("hora_entrada".to_string(), serde_json::json!(hora));
        }
        obj.insert("offline".to_string(), serde_json::json!(true));
        obj.insert("sync_status".to_string(), serde_json::json!("pending"));
        obj.insert("updated_at".to_string(), serde_json::json!(timestamp));
    }

    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_generic_records
            (id, tenant_id, endpoint, collection_endpoint, method, data_json, deleted, sync_status, created_at, updated_at)
        VALUES (?1, ?2, ?3, '/api/rrhh/asistencias', 'POST', ?4, 0, 'pending', ?5, ?5)
        "#,
        params![
            id,
            tenant,
            format!("/api/rrhh/asistencias/{id}"),
            serde_json::to_string(&attendance)
                .map_err(|e| format!("No se pudo serializar asistencia local: {e}"))?,
            timestamp,
        ],
    )
    .map_err(|e| format!("No se pudo guardar asistencia local: {e}"))?;
    let queued_input = with_local_sync_contract(input, &id, "rrhh_attendance")?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(attendance, "Asistencia guardada localmente; pendiente de sincronizacion")
}

fn process_generic_local_write(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let method = input.method.to_uppercase();
    let timestamp = now_ms();
    let tenant = input.tenant_id.as_deref();
    let collection = local_collection_endpoint_for_write(&input.endpoint);
    let id = if method == "POST" {
        format!("local-generic-{}", Uuid::new_v4())
    } else {
        input
            .endpoint
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("local-generic-{}", Uuid::new_v4()))
    };

    let payload = if method == "DELETE" {
        let existing: Option<String> = conn
            .query_row(
                r#"
                SELECT data_json FROM local_generic_records
                WHERE id = ?1
                  AND ((?2 IS NULL AND tenant_id IS NULL) OR tenant_id = ?2)
                "#,
                params![&id, tenant],
                |row| row.get(0),
            )
            .ok();
        existing
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or_else(|| serde_json::json!({ "id": id.clone() }))
    } else {
        parse_json_body(&input.body)?
    };

    let mut data = payload;
    if let Some(obj) = data.as_object_mut() {
        obj.insert("id".to_string(), serde_json::json!(id.clone()));
        obj.insert("offline".to_string(), serde_json::json!(true));
        obj.insert("sync_status".to_string(), serde_json::json!("pending"));
        obj.insert("updated_at".to_string(), serde_json::json!(timestamp));
        if !obj.contains_key("created_at") {
            obj.insert("created_at".to_string(), serde_json::json!(timestamp));
        }
        if method == "DELETE" {
            obj.insert("deleted".to_string(), serde_json::json!(true));
        }
    }

    let detail_endpoint = if method == "POST" {
        format!("{}/{}", collection.trim_end_matches('/'), id)
    } else {
        input.endpoint.clone()
    };
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_generic_records
            (id, tenant_id, endpoint, collection_endpoint, method, data_json, deleted, sync_status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?8)
        "#,
        params![
            id,
            tenant,
            detail_endpoint,
            collection,
            method,
            serde_json::to_string(&data)
                .map_err(|e| format!("No se pudo serializar registro local generico: {e}"))?,
            if method == "DELETE" { 1 } else { 0 },
            timestamp,
        ],
    )
    .map_err(|e| format!("No se pudo guardar registro local generico: {e}"))?;
    let queued_input = with_local_sync_contract(input, &id, "generic_record")?;
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(data, "Operacion guardada localmente; pendiente de sincronizacion")
}

#[tauri::command]
fn hydrate_local_first_response(
    app: AppHandle,
    endpoint: String,
    url: String,
    tenant_id: Option<String>,
    status: u16,
    headers: Vec<HeaderPair>,
    body: String,
) -> Result<(), String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let tenant = tenant_id.as_deref();
    upsert_snapshot(&conn, &endpoint, &url, tenant, status, &headers, &body)?;

    match endpoint.as_str() {
        "/api/pos/productos" | "/api/inventario/productos" => hydrate_pos_products(&conn, &body, tenant)?,
        "/api/pos/clientes" | "/api/ventas/clientes" => hydrate_local_customers(&conn, &body, tenant)?,
        "/api/ventas/cotizaciones" => hydrate_sales_documents(&conn, &body, "quote", tenant)?,
        "/api/ventas/pedidos" => hydrate_sales_documents(&conn, &body, "order", tenant)?,
        "/api/pos/sesion-caja" => hydrate_cash_session(&conn, &body, tenant)?,
        _ => {}
    }

    Ok(())
}

#[tauri::command]
fn get_local_first_response(
    app: AppHandle,
    endpoint: String,
    url: String,
    tenant_id: Option<String>,
) -> Result<Option<LocalFirstResponse>, String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let config = load_config(app.clone()).unwrap_or_default();
    let tenant = tenant_id.as_deref();

    match endpoint.as_str() {
        "/api/cajas" => {
            if let Some(snapshot) = read_local_snapshot(&conn, &endpoint, &url, tenant)? {
                return Ok(Some(snapshot));
            }
            return Ok(Some(build_default_cajas_snapshot()?));
        }
        "/api/pos/metodos-pago" => {
            if let Some(snapshot) = read_local_snapshot(&conn, &endpoint, &url, tenant)? {
                return Ok(Some(snapshot));
            }
            return Ok(Some(build_default_payment_methods_snapshot()?));
        }
        "/api/pos/empresa-config" => {
            if let Some(snapshot) = read_local_snapshot(&conn, &endpoint, &url, tenant)? {
                return Ok(Some(snapshot));
            }
            return Ok(Some(build_empresa_config_snapshot(&config)?));
        }
        "/api/pos/configuration-status" => {
            if let Some(snapshot) = read_local_snapshot(&conn, &endpoint, &url, tenant)? {
                return Ok(Some(snapshot));
            }
            return Ok(Some(build_pos_configuration_status_snapshot(&config)?))
        }
        "/api/configuration/gre-thresholds" => {
            if let Some(snapshot) = read_local_snapshot(&conn, &endpoint, &url, tenant)? {
                return Ok(Some(snapshot));
            }
            return Ok(Some(build_gre_thresholds_snapshot()?));
        }
        "/api/compras/next-number" => {
            if let Some(snapshot) = read_local_snapshot(&conn, &endpoint, &url, tenant)? {
                return Ok(Some(snapshot));
            }
            return Ok(Some(build_next_number_snapshot("OC")?));
        }
        "/api/paises/usuario/configuracion" => {
            return Ok(Some(build_user_country_config_snapshot(&conn, tenant)?));
        }
        "/api/pos/productos" | "/api/inventario/productos" => {
            return Ok(Some(build_products_snapshot(&conn, tenant)?))
        }
        "/api/pos/clientes" | "/api/ventas/clientes" => {
            return Ok(Some(build_customers_snapshot(&conn, tenant)?))
        }
        "/api/ventas/cotizaciones" => {
            return Ok(Some(build_sales_documents_snapshot(&conn, "quote", tenant)?))
        }
        "/api/ventas/pedidos" => {
            return Ok(Some(build_sales_documents_snapshot(&conn, "order", tenant)?))
        }
        "/api/pos/sesion-caja" => return build_open_session_snapshot(&conn, tenant),
        "/api/pos/ventas-recientes" => return Ok(Some(build_recent_sales_snapshot(&conn, tenant)?)),
        _ => {}
    }

    if endpoint.starts_with("/api/pos/detalles-venta/") {
        return Ok(Some(build_pos_sale_details_snapshot(&conn, &endpoint, tenant)?));
    }
    if endpoint.starts_with("/api/cajas/movimientos/") {
        return Ok(Some(build_cash_movements_snapshot(&conn, &endpoint, tenant)?));
    }
    if endpoint.starts_with("/api/cajas/saldo-esperado/") {
        return Ok(Some(build_cash_expected_balance_snapshot(&conn, &endpoint, tenant)?));
    }
    if endpoint.starts_with("/api/inventario/productos/") {
        return Ok(Some(
            build_product_detail_snapshot(&conn, &endpoint, tenant)?
                .unwrap_or(build_empty_object_snapshot(&endpoint)?),
        ));
    }
    if endpoint.starts_with("/api/ventas/clientes/") || endpoint.starts_with("/api/pos/clientes/") {
        return Ok(Some(
            build_customer_detail_snapshot(&conn, &endpoint, tenant)?
                .unwrap_or(build_empty_object_snapshot(&endpoint)?),
        ));
    }
    if endpoint.starts_with("/api/ventas/cotizaciones/") {
        return Ok(Some(
            build_sales_document_detail_snapshot(&conn, &endpoint, "quote", tenant)?
                .unwrap_or(build_empty_object_snapshot(&endpoint)?),
        ));
    }
    if endpoint.starts_with("/api/ventas/pedidos/") {
        return Ok(Some(
            build_sales_document_detail_snapshot(&conn, &endpoint, "order", tenant)?
                .unwrap_or(build_empty_object_snapshot(&endpoint)?),
        ));
    }

    if let Some(detail) = build_generic_detail_snapshot(&conn, &endpoint, tenant)? {
        return Ok(Some(detail));
    }

    let snapshot = read_local_snapshot(&conn, &endpoint, &url, tenant)?.or_else(|| {
        if is_known_empty_collection_endpoint(&endpoint) {
            build_empty_collection_snapshot(&endpoint).ok()
        } else if is_known_empty_object_endpoint(&endpoint) {
            build_empty_object_snapshot(&endpoint).ok()
        } else {
            None
        }
    });
    merge_local_records_into_response(&conn, &endpoint, snapshot, tenant)
}

#[tauri::command]
fn process_local_first_write(
    app: AppHandle,
    request: LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let _guard = lock_offline_queue()?;
    let config = load_config(app.clone()).unwrap_or_default();
    let conn = open_local_db(&app)?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("No se pudo iniciar transaccion local-first: {e}"))?;

    let result = if request.method.eq_ignore_ascii_case("POST")
        && request.endpoint == "/api/pos/venta"
    {
        process_local_pos_sale(&tx, &request, &config)
    } else if request.method.eq_ignore_ascii_case("POST")
        && ((request.endpoint.starts_with("/api/cajas/")
            && request.endpoint.ends_with("/apertura"))
            || request.endpoint == "/api/cajas/abrir")
    {
        process_local_cash_open(&tx, &request)
    } else if request.method.eq_ignore_ascii_case("POST")
        && ((request.endpoint.starts_with("/api/cajas/")
            && request.endpoint.ends_with("/cierre"))
            || request.endpoint.starts_with("/api/cajas/cerrar/"))
    {
        process_local_cash_close(&tx, &request)
    } else if request.endpoint == "/api/inventario/productos"
        || request.endpoint.starts_with("/api/inventario/productos/")
    {
        process_local_inventory_product(&tx, &request)
    } else if request.endpoint == "/api/ventas/clientes"
        || request.endpoint == "/api/pos/clientes"
        || request.endpoint.starts_with("/api/ventas/clientes/")
        || request.endpoint.starts_with("/api/pos/clientes/")
    {
        process_local_customer(&tx, &request)
    } else if request.endpoint == "/api/ventas/cotizaciones"
        || request.endpoint == "/api/cotizaciones/crear"
        || request.endpoint.starts_with("/api/ventas/cotizaciones/")
    {
        process_local_sales_document(&tx, &request, "quote")
    } else if request.endpoint == "/api/ventas/pedidos"
        || request.endpoint.starts_with("/api/ventas/pedidos/")
    {
        process_local_sales_document(&tx, &request, "order")
    } else if request.method.eq_ignore_ascii_case("POST")
        && (request.endpoint == "/api/rrhh/asistencias/marcar"
            || request.endpoint.starts_with("/api/rrhh/asistencia/entrada/")
            || request.endpoint.starts_with("/api/rrhh/asistencia/salida/"))
    {
        process_local_attendance_mark(&tx, &request)
    } else if request.endpoint == "/api/paises/usuario/configuracion" {
        process_local_user_country_config(&tx, &request)
    } else if request.endpoint == "/api/finanzas/tesoreria/lote"
        && request.method.eq_ignore_ascii_case("POST")
    {
        process_local_treasury_batch(&tx, &request)
    } else if request.method.eq_ignore_ascii_case("POST")
        && (request.endpoint.starts_with("/api/cajas/movimientos/manual/")
            || request.endpoint.starts_with("/api/cajas/retiros/"))
    {
        process_local_cash_movement(&tx, &request)
    } else if request.method.eq_ignore_ascii_case("POST")
        && (request.endpoint.starts_with("/api/cajas/cambio-turno/iniciar/")
            || request.endpoint.starts_with("/api/cajas/cambio-turno/completar/"))
    {
        process_local_shift_change(&tx, &request)
    } else if request.endpoint == "/api/notifications/mark-all-read"
        || request.endpoint.starts_with("/api/notifications/")
    {
        process_local_notifications_mutation(&tx, &request)
    } else {
        process_generic_local_write(&tx, &request)
    }?;

    tx.commit()
        .map_err(|e| format!("No se pudo confirmar transaccion local-first: {e}"))?;
    Ok(result)
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
        if is_sensitive_offline_request(&item.endpoint, &item.url, &item.method) {
            continue;
        }
        insert_offline_item(conn, &item)?;
    }

    let migrated_path = path.with_extension("json.migrated");
    let _ = fs::rename(path, migrated_path);
    Ok(())
}

fn insert_offline_item(conn: &Connection, item: &OfflineQueueItem) -> Result<(), String> {
    if is_sensitive_offline_request(&item.endpoint, &item.url, &item.method) {
        return Err(SENSITIVE_OFFLINE_ERROR.to_string());
    }

    let safe_headers = strip_sensitive_request_headers(&item.headers);
    let headers_json = serde_json::to_string(&safe_headers)
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

fn response_data_json(response_body: Option<&String>) -> Option<String> {
    response_body.and_then(|response| {
        serde_json::from_str::<Value>(response).ok().and_then(|value| {
            let data = value.get("data").cloned().unwrap_or(value);
            serde_json::to_string(&data).ok()
        })
    })
}

fn response_remote_id(response_body: Option<&String>) -> Option<String> {
    response_body
        .and_then(|response| serde_json::from_str::<Value>(response).ok())
        .and_then(|value| {
            value
                .get("data")
                .and_then(|data| {
                    value_string(data, "id")
                        .or_else(|| value_string(data, "venta_id"))
                        .or_else(|| value_string(data, "pedido_id"))
                        .or_else(|| value_string(data, "cotizacion_id"))
                })
                .or_else(|| value_string(&value, "id"))
        })
}

fn response_fiscal_status(sync_status: &str, response_body: Option<&String>) -> String {
    if sync_status == "failed" {
        return "FALLIDO".to_string();
    }
    let normalized = response_body
        .and_then(|response| serde_json::from_str::<Value>(response).ok())
        .and_then(|value| {
            let data = value.get("data").unwrap_or(&value);
            value_string(data, "sunat_status")
                .or_else(|| value_string(data, "status"))
                .or_else(|| value_string(data, "estado"))
                .or_else(|| value_string(&value, "sunat_status"))
                .or_else(|| value_string(&value, "status"))
                .or_else(|| value_string(&value, "estado"))
        })
        .unwrap_or_else(|| "ENVIADO".to_string())
        .to_uppercase();

    if normalized.contains("ACEPT") || normalized == "ACCEPTED" {
        "ACEPTADO".to_string()
    } else if normalized.contains("RECHAZ") || normalized == "REJECTED" {
        "RECHAZADO".to_string()
    } else if normalized.contains("FALL") || normalized.contains("ERROR") {
        "FALLIDO".to_string()
    } else if normalized.contains("PEND")
        || normalized.contains("FIRMADO")
        || normalized == "READY"
        || normalized == "NOT_SENT"
    {
        "PENDIENTE_ENVIO".to_string()
    } else if normalized.contains("ENVIADO") || normalized == "SENDING" {
        "ENVIADO".to_string()
    } else {
        "ENVIADO".to_string()
    }
}

fn upsert_local_id_map(
    conn: &Connection,
    local_id: Option<&String>,
    remote_id: Option<String>,
    entity_type: Option<&String>,
    endpoint: &str,
    response_body: Option<&String>,
) -> Result<(), String> {
    let (Some(local_id), Some(remote_id), Some(entity_type)) = (local_id, remote_id, entity_type) else {
        return Ok(());
    };
    if local_id == &remote_id {
        return Ok(());
    }
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_id_map
            (local_id, remote_id, entity_type, endpoint, synced_at, response_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![local_id, remote_id, entity_type, endpoint, now_ms(), response_body],
    )
    .map_err(|e| format!("No se pudo registrar mapeo local/remoto: {e}"))?;
    Ok(())
}

fn update_local_first_sync_status(
    conn: &Connection,
    offline_request_id: &str,
    sync_status: &str,
    response_body: Option<&String>,
) -> Result<(), String> {
    let request: Option<(String, Option<String>, String, Option<String>)> = conn
        .query_row(
            "SELECT endpoint, body, headers_json, tenant_id FROM offline_requests WHERE id = ?1",
            params![offline_request_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();
    let Some((endpoint, body, headers_json, tenant_id)) = request else {
        return Ok(());
    };
    let tenant = tenant_id.as_deref();
    let headers: Vec<HeaderPair> = serde_json::from_str(&headers_json).unwrap_or_default();
    let local_id = header_value(&headers, "x-erp-local-id");
    let entity_type = header_value(&headers, "x-erp-local-entity-type");
    let remote_id = response_remote_id(response_body);
    upsert_local_id_map(
        conn,
        local_id.as_ref(),
        remote_id.clone(),
        entity_type.as_ref(),
        &endpoint,
        response_body,
    )?;

    let Some(raw_body) = body else {
        return Ok(());
    };
    let Ok(payload) = serde_json::from_str::<Value>(&raw_body) else {
        return Ok(());
    };

    if endpoint == "/api/cpe/comprobantes" {
        let fiscal_id = local_id
            .or_else(|| value_string(&payload, "local_fiscal_id"))
            .or_else(|| value_string(&payload, "id"));
        if let Some(id) = fiscal_id {
            let fiscal_status = response_fiscal_status(sync_status, response_body);
            let synced_json = response_data_json(response_body);
            conn.execute(
                r#"
                UPDATE local_fiscal_documents
                SET estado = ?2, response_json = COALESCE(?3, response_json), updated_at = ?4
                WHERE id = ?1 AND tenant_id = ?5
                "#,
                params![id, fiscal_status, synced_json, now_ms(), tenant_scope(tenant)],
            )
            .map_err(|e| format!("No se pudo actualizar sync de documento fiscal local: {e}"))?;
        }
        return Ok(());
    }

    if endpoint == "/api/cpe/desktop/signed" {
        let fiscal_hash = value_string(&payload, "hash").or(local_id);
        if let Some(hash) = fiscal_hash {
            let fiscal_status = response_fiscal_status(sync_status, response_body);
            let synced_json = response_data_json(response_body);
            conn.execute(
                r#"
                UPDATE local_fiscal_documents
                SET estado = ?2, response_json = COALESCE(?3, response_json), updated_at = ?4
                WHERE hash = ?1 AND tenant_id = ?5
                "#,
                params![hash, fiscal_status, synced_json, now_ms(), tenant_scope(tenant)],
            )
            .map_err(|e| format!("No se pudo actualizar sync de envio fiscal local: {e}"))?;
        }
        return Ok(());
    }

    if endpoint == "/api/ventas/cotizaciones"
        || endpoint == "/api/cotizaciones/crear"
        || endpoint.starts_with("/api/ventas/cotizaciones/")
    {
        let synced_document_json = response_data_json(response_body);
        let local_id = local_id.or_else(|| value_string(&payload, "id"));
        if let Some(id) = local_id {
            conn.execute(
                r#"
                UPDATE local_sales_documents
                SET sync_status = ?2, data_json = COALESCE(?3, data_json), updated_at = ?4
                WHERE id = ?1 AND kind = 'quote'
                  AND ((?5 IS NULL AND tenant_id IS NULL) OR tenant_id = ?5)
                "#,
                params![id, sync_status, synced_document_json, now_ms(), tenant],
            )
            .map_err(|e| format!("No se pudo actualizar sync de cotizacion local: {e}"))?;
        }
        return Ok(());
    }

    if endpoint == "/api/ventas/pedidos" || endpoint.starts_with("/api/ventas/pedidos/") {
        let synced_document_json = response_data_json(response_body);
        let local_id = local_id.or_else(|| value_string(&payload, "id"));
        if let Some(id) = local_id {
            conn.execute(
                r#"
                UPDATE local_sales_documents
                SET sync_status = ?2, data_json = COALESCE(?3, data_json), updated_at = ?4
                WHERE id = ?1 AND kind = 'order'
                  AND ((?5 IS NULL AND tenant_id IS NULL) OR tenant_id = ?5)
                "#,
                params![id, sync_status, synced_document_json, now_ms(), tenant],
            )
            .map_err(|e| format!("No se pudo actualizar sync de pedido local: {e}"))?;
        }
        return Ok(());
    }

    if endpoint == "/api/inventario/productos" || endpoint.starts_with("/api/inventario/productos/") {
        let synced_json = response_data_json(response_body);
        let local_id = local_id.or_else(|| value_string(&payload, "id"));
        if let Some(id) = local_id {
            conn.execute(
                r#"
                UPDATE pos_products
                SET data_json = COALESCE(?2, data_json), updated_at = ?3
                WHERE id = ?1
                  AND ((?4 IS NULL AND tenant_id IS NULL) OR tenant_id = ?4)
                "#,
                params![id, synced_json, now_ms(), tenant],
            )
            .map_err(|e| format!("No se pudo actualizar sync de producto local: {e}"))?;
        }
        return Ok(());
    }

    if endpoint == "/api/ventas/clientes"
        || endpoint == "/api/pos/clientes"
        || endpoint.starts_with("/api/ventas/clientes/")
        || endpoint.starts_with("/api/pos/clientes/")
    {
        let synced_json = response_data_json(response_body);
        let local_id = local_id.or_else(|| value_string(&payload, "id"));
        if let Some(id) = local_id {
            conn.execute(
                r#"
                UPDATE local_customers
                SET data_json = COALESCE(?2, data_json), updated_at = ?3
                WHERE id = ?1
                  AND ((?4 IS NULL AND tenant_id IS NULL) OR tenant_id = ?4)
                "#,
                params![id, synced_json, now_ms(), tenant],
            )
            .map_err(|e| format!("No se pudo actualizar sync de cliente local: {e}"))?;
        }
        return Ok(());
    }

    if (endpoint.starts_with("/api/cajas/") && (endpoint.ends_with("/apertura") || endpoint.ends_with("/cierre")))
        || endpoint == "/api/cajas/abrir"
        || endpoint.starts_with("/api/cajas/cerrar/")
    {
        let synced_json = response_data_json(response_body);
        let session_id = local_id
            .or_else(|| value_string(&payload, "sesion_id"))
            .or_else(|| value_string(&payload, "sesionId"))
            .or_else(|| value_string(&payload, "id"));
        if let Some(id) = session_id {
            conn.execute(
                r#"
                UPDATE pos_cash_sessions
                SET data_json = COALESCE(?2, data_json), updated_at = ?3
                WHERE id = ?1
                  AND ((?4 IS NULL AND tenant_id IS NULL) OR tenant_id = ?4)
                "#,
                params![id, synced_json, now_ms(), tenant],
            )
            .map_err(|e| format!("No se pudo actualizar sync de caja local: {e}"))?;
        }
        return Ok(());
    }

    if endpoint == "/api/paises/usuario/configuracion" {
        let synced_json = response_data_json(response_body);
        let mut config = synced_json
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or(payload);
        if let Some(obj) = config.as_object_mut() {
            obj.insert("sync_status".to_string(), serde_json::json!(sync_status));
            obj.insert("offline".to_string(), serde_json::json!(sync_status != "synced"));
            obj.insert("local_first".to_string(), serde_json::json!(true));
            obj.insert("updated_at".to_string(), serde_json::json!(now_ms()));
        }
        write_metadata_json(
            conn,
            &scoped_metadata_key("usuario_configuracion", tenant),
            &config,
        )?;
        return Ok(());
    }

    if endpoint != "/api/pos/venta" {
        let generic_id = local_id.or_else(|| value_string(&payload, "id"));
        if let Some(id) = generic_id {
            let synced_json = response_data_json(response_body);
            conn.execute(
                r#"
                UPDATE local_generic_records
                SET sync_status = ?2, data_json = COALESCE(?3, data_json), updated_at = ?4
                WHERE id = ?1
                  AND ((?5 IS NULL AND tenant_id IS NULL) OR tenant_id = ?5)
                "#,
                params![id, sync_status, synced_json, now_ms(), tenant],
            )
            .map_err(|e| format!("No se pudo actualizar sync de registro local generico: {e}"))?;
        }
        return Ok(());
    }

    let Some(idempotency_key) = value_string(&payload, "idempotency_key") else {
        return Ok(());
    };
    if let Some(response) = response_body {
        conn.execute(
            r#"
            UPDATE pos_sales
            SET sync_status = ?2, response_json = ?3, updated_at = ?4
            WHERE idempotency_key = ?1
              AND ((?5 IS NULL AND tenant_id IS NULL) OR tenant_id = ?5)
            "#,
            params![idempotency_key, sync_status, response, now_ms(), tenant],
        )
        .map_err(|e| format!("No se pudo actualizar estado sync POS local: {e}"))?;
    } else {
        conn.execute(
            r#"
            UPDATE pos_sales
            SET sync_status = ?2, updated_at = ?3
            WHERE idempotency_key = ?1
              AND ((?4 IS NULL AND tenant_id IS NULL) OR tenant_id = ?4)
            "#,
            params![idempotency_key, sync_status, now_ms(), tenant],
        )
        .map_err(|e| format!("No se pudo actualizar estado sync POS local: {e}"))?;
    }
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
            ORDER BY created_at ASC, rowid ASC
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
                headers: strip_sensitive_request_headers(&headers),
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

    let mut loaded_items = Vec::new();
    for row in rows {
        loaded_items.push(row.map_err(|e| format!("Fila offline SQLite invalida: {e}"))?);
    }
    drop(stmt);

    let mut items = Vec::new();
    for item in loaded_items {
        if is_sensitive_offline_request(&item.endpoint, &item.url, &item.method) {
            conn.execute("DELETE FROM offline_requests WHERE id = ?1", params![&item.id])
                .map_err(|e| format!("No se pudo purgar configuracion sensible legacy: {e}"))?;
            continue;
        }
        items.push(item);
    }

    for item in &items {
        let headers_json = serde_json::to_string(&item.headers)
            .map_err(|e| format!("No se pudo sanear headers offline: {e}"))?;
        conn.execute(
            "UPDATE offline_requests SET headers_json = ?1 WHERE id = ?2",
            params![headers_json, &item.id],
        )
        .map_err(|e| format!("No se pudo limpiar header sensible legacy: {e}"))?;
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

const DPAPI_PREFIX: &str = "dpapi:";

fn strip_sensitive_request_headers(headers: &[HeaderPair]) -> Vec<HeaderPair> {
    headers
        .iter()
        .filter(|header| {
            !matches!(
                header.name.trim().to_ascii_lowercase().as_str(),
                "authorization"
                    | "cookie"
                    | "proxy-authorization"
                    | "set-cookie"
                    | "x-api-key"
                    | "x-access-token"
                    | "x-auth-token"
                    | "x-refresh-token"
            )
        })
        .cloned()
        .collect()
}

const SENSITIVE_OFFLINE_ERROR: &str =
    "Esta configuracion sensible requiere conexion en vivo y nunca se guarda en la cola offline.";

fn offline_endpoint_path(endpoint: &str) -> String {
    let without_query = endpoint.split('?').next().unwrap_or(endpoint).trim();
    let path = if let Some(scheme) = without_query.find("://") {
        without_query[(scheme + 3)..]
            .find('/')
            .map(|slash| &without_query[(scheme + 3 + slash)..])
            .unwrap_or("/")
    } else {
        without_query
    };
    path.trim_end_matches('/').to_ascii_lowercase()
}

fn has_sensitive_path_segment(path: &str) -> bool {
    path.split(|character| matches!(character, '/' | '-' | '_'))
        .any(|segment| {
            matches!(
                segment,
                "certificate"
                    | "certificado"
                    | "credential"
                    | "credencial"
                    | "pfx"
                    | "secret"
            )
        })
}

fn is_sensitive_non_queueable_endpoint(endpoint: &str, method: &str) -> bool {
    if matches!(
        method.trim().to_ascii_uppercase().as_str(),
        "GET" | "HEAD" | "OPTIONS"
    ) {
        return false;
    }

    let path = offline_endpoint_path(endpoint);
    path == "/api/configuration"
        || path.starts_with("/api/configuration/")
        || path == "/configuration"
        || path.starts_with("/configuration/")
        || path == "/api/configuracion"
        || path.starts_with("/api/configuracion/")
        || path.starts_with("/api/configuracion-")
        || path == "/configuracion"
        || path.starts_with("/configuracion/")
        || path.starts_with("/configuracion-")
        || path == "/api/auth"
        || path.starts_with("/api/auth/")
        || path == "/auth"
        || path.starts_with("/auth/")
        || path == "/api/demo/convert-to-real"
        || path == "/demo/convert-to-real"
        || has_sensitive_path_segment(&path)
}

fn is_sensitive_offline_request(endpoint: &str, url: &str, method: &str) -> bool {
    is_sensitive_non_queueable_endpoint(endpoint, method)
        || is_sensitive_non_queueable_endpoint(url, method)
}

#[cfg(target_os = "windows")]
fn protect_local_secret(value: &str) -> Result<String, String> {
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };
    use windows_sys::Win32::Foundation::LocalFree;

    if value.starts_with(DPAPI_PREFIX) {
        return Ok(value.to_string());
    }
    let mut bytes = value.as_bytes().to_vec();
    let mut input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            &mut input,
            ptr::null(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err("No se pudo cifrar el password del certificado con DPAPI".to_string());
    }
    let encrypted = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
    let encoded = general_purpose::STANDARD.encode(encrypted);
    unsafe {
        LocalFree(output.pbData as _);
    }
    Ok(format!("{DPAPI_PREFIX}{encoded}"))
}

#[cfg(target_os = "windows")]
fn unprotect_local_secret(value: &str) -> Result<String, String> {
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };
    use windows_sys::Win32::Foundation::LocalFree;

    let Some(encoded) = value.strip_prefix(DPAPI_PREFIX) else {
        return Ok(value.to_string());
    };
    let mut bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Password de certificado cifrado invalido: {e}"))?;
    let mut input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &mut input,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err("No se pudo descifrar el password del certificado con DPAPI".to_string());
    }
    let decrypted = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
    let result = String::from_utf8(decrypted.to_vec())
        .map_err(|e| format!("Password de certificado descifrado no es UTF-8 valido: {e}"))?;
    unsafe {
        LocalFree(output.pbData as _);
    }
    Ok(result)
}

#[cfg(not(target_os = "windows"))]
fn protect_local_secret(value: &str) -> Result<String, String> {
    Ok(value.to_string())
}

#[cfg(not(target_os = "windows"))]
fn unprotect_local_secret(value: &str) -> Result<String, String> {
    Ok(value.to_string())
}

#[tauri::command]
fn save_secure_access_token(app: AppHandle, access_token: String) -> Result<(), String> {
    if access_token.trim().is_empty() {
        return clear_secure_access_token(app);
    }
    #[cfg(target_os = "windows")]
    {
        let protected = protect_local_secret(access_token.trim())?;
        let path = auth_token_path(&app)?;
        return write_file_replace(&path, protected)
            .map_err(|e| format!("No se pudo guardar token protegido: {e}"));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("El almacenamiento persistente de token requiere un keyring seguro".to_string())
    }
}

#[tauri::command]
fn load_secure_access_token(app: AppHandle) -> Result<Option<String>, String> {
    let path = auth_token_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    #[cfg(target_os = "windows")]
    {
        let raw = fs::read_to_string(&path)
            .map_err(|e| format!("No se pudo leer token protegido: {e}"))?;
        if !raw.trim().starts_with(DPAPI_PREFIX) {
            return Err("El archivo de token no esta protegido con DPAPI".to_string());
        }
        return unprotect_local_secret(raw.trim()).map(Some);
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("El almacenamiento persistente de token requiere un keyring seguro".to_string())
    }
}

#[tauri::command]
fn clear_secure_access_token(app: AppHandle) -> Result<(), String> {
    let path = auth_token_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("No se pudo eliminar token protegido: {e}"))?;
    }
    Ok(())
}

fn decrypt_config_for_runtime(mut config: AppConfig) -> Result<AppConfig, String> {
    if let Some(password) = config.certificado_password.as_deref() {
        config.certificado_password = Some(unprotect_local_secret(password)?);
    }
    Ok(config)
}

fn encrypt_config_for_disk(mut config: AppConfig) -> Result<AppConfig, String> {
    if let Some(password) = config
        .certificado_password
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        config.certificado_password = Some(protect_local_secret(password)?);
    }
    Ok(config)
}

fn redact_config_for_backup(mut config: AppConfig) -> AppConfig {
    if config.certificado_password.is_some() {
        config.certificado_password = Some("[redacted]".to_string());
    }
    config
}

fn redact_headers_for_backup(headers: &[HeaderPair]) -> Vec<HeaderPair> {
    headers
        .iter()
        .map(|header| {
            let lower = header.name.to_ascii_lowercase();
            if matches!(lower.as_str(), "authorization" | "cookie" | "x-api-key") {
                HeaderPair {
                    name: header.name.clone(),
                    value: "[redacted]".to_string(),
                }
            } else {
                header.clone()
            }
        })
        .collect()
}

fn redact_queue_for_backup(queue: Vec<OfflineQueueItem>) -> Vec<OfflineQueueItem> {
    queue
        .into_iter()
        .map(|mut item| {
            item.headers = redact_headers_for_backup(&item.headers);
            item
        })
        .collect()
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }

    let raw = fs::read_to_string(path)
        .map_err(|e| format!("No se pudo leer la configuracion local: {e}"))?;
    let config: AppConfig =
        serde_json::from_str(&raw).map_err(|e| format!("Configuracion local invalida: {e}"))?;
    decrypt_config_for_runtime(config)
}

#[tauri::command]
fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    let config_for_disk = encrypt_config_for_disk(config)?;
    let raw = serde_json::to_string_pretty(&config_for_disk)
        .map_err(|e| format!("No se pudo serializar la configuracion local: {e}"))?;
    write_file_replace(&path, raw)
        .map_err(|e| format!("No se pudo guardar la configuracion local: {e}"))
}

#[tauri::command]
fn enqueue_offline_request(
    app: AppHandle,
    request: OfflineRequestInput,
) -> Result<OfflineQueueItem, String> {
    if is_sensitive_offline_request(&request.endpoint, &request.url, &request.method) {
        return Err(SENSITIVE_OFFLINE_ERROR.to_string());
    }

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

    update_local_first_sync_status(&conn, &id, "synced", response_body.as_ref())?;

    Ok(())
}

#[tauri::command]
fn mark_offline_request_failed(
    app: AppHandle,
    id: String,
    error: String,
    response_status: Option<u16>,
) -> Result<(), String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let changed = conn
        .execute(
            r#"
            UPDATE offline_requests
            SET status = 'failed',
                attempts = attempts + 1,
                last_error = ?2,
                response_status = ?3,
                updated_at = ?4
            WHERE id = ?1
            "#,
            params![&id, &error, response_status.map(|status| status as i64), now_ms()],
        )
        .map_err(|e| format!("No se pudo marcar operacion offline fallida: {e}"))?;

    if changed == 0 {
        return Err(format!("No existe item offline con id {id}"));
    }

    update_local_first_sync_status(&conn, &id, "failed", None)?;

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
fn list_local_id_mappings(app: AppHandle) -> Result<Vec<LocalIdMapping>, String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT local_id, remote_id, entity_type, endpoint, synced_at, response_json
            FROM local_id_map
            ORDER BY synced_at DESC
            LIMIT 200
            "#,
        )
        .map_err(|e| format!("No se pudo preparar mapeos local/remoto: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LocalIdMapping {
                local_id: row.get(0)?,
                remote_id: row.get(1)?,
                entity_type: row.get(2)?,
                endpoint: row.get(3)?,
                synced_at: row.get(4)?,
                response_json: row.get(5)?,
            })
        })
        .map_err(|e| format!("No se pudo leer mapeos local/remoto: {e}"))?;
    let mut mappings = Vec::new();
    for row in rows {
        mappings.push(row.map_err(|e| format!("Mapeo local/remoto invalido: {e}"))?);
    }
    Ok(mappings)
}

#[tauri::command]
fn cache_binary_response(
    app: AppHandle,
    endpoint: String,
    url: String,
    tenant_id: Option<String>,
    status: u16,
    headers: Vec<HeaderPair>,
    body_base64: String,
) -> Result<(), String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let tenant = tenant_id.as_deref();
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_binary_cache
            (cache_key, endpoint, url, tenant_id, status, headers_json, body_base64, cached_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        "#,
        params![
            scoped_cache_key(tenant, &endpoint, &url),
            endpoint,
            url,
            tenant,
            status as i64,
            response_headers_json(&headers)?,
            body_base64,
            now_ms(),
        ],
    )
    .map_err(|e| format!("No se pudo guardar binario local: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_binary_response(
    app: AppHandle,
    endpoint: String,
    url: String,
    tenant_id: Option<String>,
) -> Result<Option<BinaryLocalResponse>, String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let tenant = tenant_id.as_deref();
    let mut stmt = conn
        .prepare(
            r#"
            SELECT status, headers_json, body_base64, cached_at
            FROM local_binary_cache
            WHERE cache_key = ?1
               OR (endpoint = ?2 AND ((?3 IS NULL AND tenant_id IS NULL) OR tenant_id = ?3))
            ORDER BY CASE WHEN cache_key = ?1 THEN 0 ELSE 1 END, cached_at DESC
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("No se pudo preparar binario local: {e}"))?;
    let mut rows = stmt
        .query(params![scoped_cache_key(tenant, &endpoint, &url), endpoint, tenant])
        .map_err(|e| format!("No se pudo consultar binario local: {e}"))?;
    let Some(row) = rows
        .next()
        .map_err(|e| format!("No se pudo leer binario local: {e}"))?
    else {
        return Ok(None);
    };
    let headers_json: String = row.get(1).map_err(|e| format!("Binario local sin headers: {e}"))?;
    let mut headers: Vec<HeaderPair> = serde_json::from_str(&headers_json).unwrap_or_default();
    headers.push(HeaderPair {
        name: "x-erp-offline-cache".to_string(),
        value: "true".to_string(),
    });
    Ok(Some(BinaryLocalResponse {
        status: row.get::<_, i64>(0).map_err(|e| format!("Binario local sin status: {e}"))? as u16,
        headers,
        body_base64: row.get(2).map_err(|e| format!("Binario local sin body: {e}"))?,
        cached_at: row.get(3).map_err(|e| format!("Binario local sin fecha: {e}"))?,
    }))
}

fn save_local_fiscal_document(
    conn: &Connection,
    document: &OfflineFiscalDocument,
    input: &OfflineFiscalDocumentInput,
    tenant_id: Option<&str>,
) -> Result<(), String> {
    let tenant = tenant_scope(tenant_id);
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_fiscal_documents (
            id, tenant_id, document_type, serie, numero, estado, cliente_ruc, cliente_nombre,
            moneda, subtotal, igv, total, source_type, source_id, xml_content,
            signed_xml, pdf_base64, hash, response_json, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, NULL, ?19, ?19)
        "#,
        params![
            document.id,
            tenant,
            document_type_code(&document.document_type),
            document.serie,
            document.numero,
            document.estado,
            input.cliente_ruc,
            input.cliente_nombre,
            input.moneda.as_deref().unwrap_or("PEN"),
            input.subtotal,
            input.igv,
            input.total,
            input.source_type,
            input.source_id,
            document.xml_content,
            document.signed_xml,
            document.pdf_base64,
            document.hash,
            document.created_at,
        ],
    )
    .map_err(|e| format!("No se pudo guardar documento fiscal local: {e}"))?;
    Ok(())
}

fn create_local_fiscal_document_with_conn(
    conn: &Connection,
    config: &AppConfig,
    document: OfflineFiscalDocumentInput,
    tenant_id: Option<String>,
    user_id: Option<String>,
    access_token: Option<String>,
) -> Result<OfflineFiscalDocument, String> {
    if config.ruc.trim().is_empty() || config.razon_social.trim().is_empty() {
        return Err("Configura RUC y razon social en desktop antes de emitir offline".to_string());
    }
    validate_offline_fiscal_snapshot(&document)?;
    let serie = document
        .serie
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| default_series(&document.document_type).to_string());
    let numero = reserve_local_fiscal_number(
        conn,
        &document.document_type,
        &serie,
        tenant_id.as_deref(),
    )?;
    let xml = build_local_ubl_xml(config, &document, &serie, numero);
    let signed_xml = match (&config.certificado_path, &config.certificado_password) {
        (Some(path), Some(password)) if !path.trim().is_empty() && !password.is_empty() => {
            Some(crypto::sign_xml_document(&xml, path, password)?)
        }
        _ => None,
    };
    let hash = hash_base64(signed_xml.as_deref().unwrap_or(&xml));
    let pdf_bytes = build_local_pdf_bytes(&document, &serie, numero, &hash);
    let timestamp = now_ms();
    let result = OfflineFiscalDocument {
        id: format!("local-fiscal-{}", Uuid::new_v4()),
        document_type: document_type_code(&document.document_type).to_string(),
        serie: serie.clone(),
        numero,
        estado: if signed_xml.is_some() {
            "PENDIENTE_ENVIO".to_string()
        } else {
            "GENERADO_LOCAL".to_string()
        },
        xml_content: xml,
        signed_xml,
        pdf_base64: Some(general_purpose::STANDARD.encode(pdf_bytes)),
        hash,
        created_at: timestamp,
    };
    save_local_fiscal_document(conn, &result, &document, tenant_id.as_deref())?;
    let sync_items = normalize_fiscal_sync_items(&document.items);

    if let Some(signed_xml) = result.signed_xml.clone() {
        if tenant_id.as_deref().unwrap_or("").trim().is_empty()
            || user_id.as_deref().unwrap_or("").trim().is_empty()
            || access_token.as_deref().unwrap_or("").trim().is_empty()
        {
            return Err("El CPE fue guardado localmente, pero no puede encolarse sin tenant, actor y sesion autenticada".to_string());
        }
        let receiver = document.cliente_ruc.clone().unwrap_or_default();
        let receiver_type = if receiver.len() == 11 { "6" } else { "1" };
        let queued_body = serde_json::to_string(&serde_json::json!({
            "local_fiscal_id": result.id,
            "idempotency_key": format!("desktop.offline.cpe:{}", result.id),
            "tipo_documento": result.document_type,
            "serie": result.serie,
            "numero": result.numero,
            "signed_xml": signed_xml,
            "hash": result.hash,
            "fecha_emision": current_utc_date(),
            "source_type": document.source_type.clone().unwrap_or_default(),
            "source_id": document.source_id.clone(),
            "documento_receptor": receiver,
            "tipo_documento_receptor": receiver_type,
            "razon_social_receptor": document.cliente_nombre.clone().unwrap_or_default(),
            "moneda": document.moneda.clone().unwrap_or_default(),
            "items": sync_items,
            "total_gravadas": document.subtotal,
            "total_igv": document.igv,
            "total_venta": document.total
        }))
        .map_err(|e| format!("No se pudo serializar documento fiscal para sync: {e}"))?;
        let queued = LocalFirstWriteInput {
            endpoint: "/api/cpe/desktop/signed".to_string(),
            method: "POST".to_string(),
            url: "/api/cpe/desktop/signed".to_string(),
            headers: offline_sync_headers(
                access_token.as_deref(),
                tenant_id.as_deref(),
                &result.id,
                "fiscal_document",
            ),
            body: Some(queued_body),
            tenant_id,
            user_id,
        };
        enqueue_offline_request_with_conn(conn, &queued)?;
    }
    Ok(result)
}

#[tauri::command]
fn generate_offline_fiscal_document(
    app: AppHandle,
    document: OfflineFiscalDocumentInput,
    tenant_id: Option<String>,
    user_id: Option<String>,
    access_token: Option<String>,
) -> Result<OfflineFiscalDocument, String> {
    let config = load_config(app.clone()).unwrap_or_default();
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("No se pudo iniciar transaccion fiscal local: {e}"))?;
    let result = create_local_fiscal_document_with_conn(
        &tx,
        &config,
        document,
        tenant_id,
        user_id,
        access_token,
    )?;
    tx.commit()
        .map_err(|e| format!("No se pudo confirmar documento fiscal local: {e}"))?;
    Ok(result)
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
async fn sign_xml(app: AppHandle, xml_content: String) -> Result<String, String> {
    let config = load_config(app).unwrap_or_default();
    let cert_path = config
        .certificado_path
        .ok_or_else(|| "Configura el certificado digital en desktop antes de firmar XML".to_string())?;
    let cert_password = config
        .certificado_password
        .ok_or_else(|| "Configura la contrasena del certificado digital antes de firmar XML".to_string())?;
    crypto::sign_xml_document(&xml_content, &cert_path, &cert_password)
}

#[tauri::command]
async fn send_to_sunat(
    app: AppHandle,
    signed_xml: String,
    tenant_id: Option<String>,
    _user_id: Option<String>,
    _access_token: Option<String>,
) -> Result<String, String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let hash = hash_base64(&signed_xml);
    let tenant = tenant_id.as_deref();
    let local_fiscal_id: Option<String> = conn
        .query_row(
            r#"
            SELECT id FROM local_fiscal_documents
            WHERE hash = ?1 AND tenant_id = ?2
            LIMIT 1
            "#,
            params![&hash, tenant_scope(tenant)],
            |row| row.get(0),
        )
        .ok();
    let local_fiscal_id = local_fiscal_id.ok_or_else(|| {
        "No se puede sincronizar un XML aislado: no existe su documento fiscal local completo".to_string()
    })?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT body, status
            FROM offline_requests
            WHERE endpoint = '/api/cpe/desktop/signed'
              AND tenant_id = ?1
              AND body IS NOT NULL
            ORDER BY created_at DESC
            "#,
        )
        .map_err(|e| format!("No se pudo inspeccionar la cola fiscal local: {e}"))?;
    let rows = stmt
        .query_map(params![tenant_scope(tenant)], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("No se pudo leer la cola fiscal local: {e}"))?;
    for row in rows {
        let (body, status) = row.map_err(|e| format!("Entrada fiscal local invalida: {e}"))?;
        let Ok(payload) = serde_json::from_str::<Value>(&body) else {
            continue;
        };
        let has_full_items = payload
            .get("items")
            .and_then(Value::as_array)
            .is_some_and(|items| !items.is_empty());
        if value_string(&payload, "local_fiscal_id").as_deref() == Some(local_fiscal_id.as_str())
            && value_string(&payload, "hash").as_deref() == Some(hash.as_str())
            && value_string(&payload, "signed_xml").as_deref() == Some(signed_xml.as_str())
            && has_full_items
            && value_string(&payload, "idempotency_key").is_some()
            && value_string(&payload, "documento_receptor").is_some()
        {
            return Ok(format!(
                "{}: se reutiliza la intencion fiscal local completa; no se creo una cola parcial",
                status.to_uppercase()
            ));
        }
    }
    Err(
        "No se puede sincronizar el XML sin su snapshot fiscal completo (receptor, totales e items); regenere el documento local"
            .to_string(),
    )
}

#[tauri::command]
async fn generate_pdf(xml_content: String, _template: Option<String>) -> Result<Vec<u8>, String> {
    let hash = hash_base64(&xml_content);
    let input = OfflineFiscalDocumentInput {
        document_type: "factura".to_string(),
        serie: Some("LOCAL".to_string()),
        cliente_ruc: None,
        cliente_nombre: Some("Documento local".to_string()),
        moneda: Some("PEN".to_string()),
        subtotal: 0.0,
        igv: 0.0,
        total: 0.0,
        items: Vec::new(),
        source_type: Some("xml".to_string()),
        source_id: None,
    };
    Ok(build_local_pdf_bytes(&input, "LOCAL", 0, &hash))
}

#[tauri::command]
async fn backup_database(app: AppHandle, backup_path: String) -> Result<(), String> {
    let config = load_config(app.clone()).unwrap_or_default();
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let queue = read_offline_queue(&app)?;
    let mut fiscal_stmt = conn
        .prepare(
            r#"
            SELECT id, document_type, serie, numero, estado, cliente_ruc, cliente_nombre,
                   tenant_id, moneda, subtotal, igv, total, source_type, source_id, hash, created_at
            FROM local_fiscal_documents
            ORDER BY created_at ASC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar backup fiscal local: {e}"))?;
    let fiscal_rows = fiscal_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "document_type": row.get::<_, String>(1)?,
                "serie": row.get::<_, String>(2)?,
                "numero": row.get::<_, i64>(3)?,
                "estado": row.get::<_, String>(4)?,
                "cliente_ruc": row.get::<_, Option<String>>(5)?,
                "cliente_nombre": row.get::<_, Option<String>>(6)?,
                "tenant_id": row.get::<_, String>(7)?,
                "moneda": row.get::<_, String>(8)?,
                "subtotal": row.get::<_, f64>(9)?,
                "igv": row.get::<_, f64>(10)?,
                "total": row.get::<_, f64>(11)?,
                "source_type": row.get::<_, Option<String>>(12)?,
                "source_id": row.get::<_, Option<String>>(13)?,
                "hash": row.get::<_, String>(14)?,
                "created_at": row.get::<_, i64>(15)?,
            }))
        })
        .map_err(|e| format!("No se pudo leer backup fiscal local: {e}"))?;
    let mut fiscal_documents = Vec::new();
    for row in fiscal_rows {
        fiscal_documents.push(row.map_err(|e| format!("Fila fiscal local invalida: {e}"))?);
    }
    let sqlite_path = offline_db_path(&app)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();
    let payload = serde_json::json!({
        "kind": "erp_desktop_offline_backup",
        "generated_at": now_ms(),
        "config": redact_config_for_backup(config),
        "offline_outbox": redact_queue_for_backup(queue),
        "local_fiscal_documents": fiscal_documents,
        "sqlite_path": sqlite_path,
        "note": "Backup local del cliente desktop. La base autoritativa sigue siendo backend/BD."
    });
    let raw = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("No se pudo serializar backup local: {e}"))?;
    fs::write(backup_path, raw).map_err(|e| format!("No se pudo escribir backup local: {e}"))
}

#[tauri::command]
async fn export_sire_data(
    app: AppHandle,
    periodo: String,
    tenant_id: Option<String>,
) -> Result<String, String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let period = periodo.trim();
    let tenant = tenant_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|_| tenant_scope(tenant_id.as_deref()));
    let mut stmt = conn
        .prepare(
            r#"
            SELECT document_type, serie, numero, cliente_ruc, cliente_nombre, moneda,
                   subtotal, igv, total, estado, hash, created_at
            FROM local_fiscal_documents
            WHERE (?1 IS NULL OR tenant_id = ?1)
            ORDER BY created_at ASC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar exportacion SIRE local: {e}"))?;
    let rows = stmt
        .query_map(params![tenant], |row| {
            Ok(serde_json::json!({
                "document_type": row.get::<_, String>(0)?,
                "serie": row.get::<_, String>(1)?,
                "numero": row.get::<_, i64>(2)?,
                "cliente_ruc": row.get::<_, Option<String>>(3)?,
                "cliente_nombre": row.get::<_, Option<String>>(4)?,
                "moneda": row.get::<_, String>(5)?,
                "subtotal": row.get::<_, f64>(6)?,
                "igv": row.get::<_, f64>(7)?,
                "total": row.get::<_, f64>(8)?,
                "estado": row.get::<_, String>(9)?,
                "hash": row.get::<_, String>(10)?,
                "created_at": row.get::<_, i64>(11)?,
            }))
        })
        .map_err(|e| format!("No se pudo leer documentos fiscales locales: {e}"))?;

    let mut lines = vec![
        "periodo|tipo|serie|numero|cliente_ruc|cliente_nombre|moneda|subtotal|igv|total|estado|hash".to_string(),
    ];
    for row in rows {
        let item = row.map_err(|e| format!("Documento fiscal local invalido: {e}"))?;
        let created_date = utc_date_from_ms(item["created_at"].as_i64().unwrap_or(0));
        if !period.is_empty() && !created_date.starts_with(period) {
            continue;
        }
        lines.push(format!(
            "{}|{}|{}|{}|{}|{}|{}|{:.2}|{:.2}|{:.2}|{}|{}",
            period,
            item["document_type"].as_str().unwrap_or(""),
            item["serie"].as_str().unwrap_or(""),
            item["numero"].as_i64().unwrap_or(0),
            item["cliente_ruc"].as_str().unwrap_or(""),
            item["cliente_nombre"].as_str().unwrap_or(""),
            item["moneda"].as_str().unwrap_or("PEN"),
            item["subtotal"].as_f64().unwrap_or(0.0),
            item["igv"].as_f64().unwrap_or(0.0),
            item["total"].as_f64().unwrap_or(0.0),
            item["estado"].as_str().unwrap_or("PENDIENTE_ENVIO"),
            item["hash"].as_str().unwrap_or(""),
        ));
    }
    Ok(lines.join("\n"))
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
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            save_secure_access_token,
            load_secure_access_token,
            clear_secure_access_token,
            enqueue_offline_request,
            list_offline_requests,
            mark_offline_request_synced,
            mark_offline_request_failed,
            delete_offline_request,
            list_local_id_mappings,
            get_offline_status,
            cache_binary_response,
            get_binary_response,
            generate_offline_fiscal_document,
            hydrate_local_first_response,
            get_local_first_response,
            process_local_first_write,
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

#[cfg(test)]
mod offline_secret_policy_tests {
    use super::{is_sensitive_non_queueable_endpoint, offline_endpoint_path};

    #[test]
    fn blocks_sensitive_configuration_writes_but_not_reads() {
        assert!(is_sensitive_non_queueable_endpoint(
            "/api/configuration/wizard/step",
            "POST"
        ));
        assert!(is_sensitive_non_queueable_endpoint(
            "https://erp.test/api/configuration/wizard/validate-certificate?step=3",
            "POST"
        ));
        assert!(is_sensitive_non_queueable_endpoint(
            "/api/validations/certificate",
            "PUT"
        ));
        assert!(!is_sensitive_non_queueable_endpoint(
            "/api/configuration/status",
            "GET"
        ));
    }

    #[test]
    fn does_not_block_unrelated_business_configuration_paths() {
        assert!(!is_sensitive_non_queueable_endpoint(
            "/api/paises/usuario/configuracion",
            "POST"
        ));
        assert!(!is_sensitive_non_queueable_endpoint(
            "/api/ventas/pedidos",
            "POST"
        ));
        assert_eq!(
            offline_endpoint_path("https://erp.test/api/configuration/complete?retry=1"),
            "/api/configuration/complete"
        );
    }
}
