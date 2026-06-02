use base64::{engine::general_purpose, Engine as _};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
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
            document_type TEXT NOT NULL,
            serie TEXT NOT NULL,
            ultimo_numero INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (document_type, serie)
        );

        CREATE TABLE IF NOT EXISTS local_fiscal_documents (
            id TEXT PRIMARY KEY,
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
            UNIQUE(document_type, serie, numero)
        );

        CREATE INDEX IF NOT EXISTS idx_local_fiscal_documents_estado
            ON local_fiscal_documents(estado, updated_at);
        CREATE INDEX IF NOT EXISTS idx_local_fiscal_documents_source
            ON local_fiscal_documents(source_type, source_id);

        CREATE TABLE IF NOT EXISTS pos_products (
            id TEXT PRIMARY KEY,
            codigo TEXT,
            nombre TEXT NOT NULL,
            stock_actual REAL NOT NULL DEFAULT 0,
            stock_disponible REAL NOT NULL DEFAULT 0,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pos_cash_sessions (
            id TEXT PRIMARY KEY,
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

    migrate_legacy_json_outbox(app, &conn)?;
    Ok(conn)
}

fn local_cache_key(endpoint: &str, url: &str) -> String {
    format!("{endpoint}|{url}")
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

fn response_headers_json(headers: &[HeaderPair]) -> Result<String, String> {
    serde_json::to_string(headers).map_err(|e| format!("No se pudo serializar headers locales: {e}"))
}

fn header_value(headers: &[HeaderPair], name: &str) -> Option<String> {
    headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case(name))
        .map(|header| header.value.clone())
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
) -> Result<i64, String> {
    conn.execute(
        r#"
        INSERT OR IGNORE INTO local_fiscal_series
            (document_type, serie, ultimo_numero, updated_at)
        VALUES (?1, ?2, 0, ?3)
        "#,
        params![document_type_code(document_type), serie, now_ms()],
    )
    .map_err(|e| format!("No se pudo inicializar serie fiscal local: {e}"))?;

    conn.execute(
        r#"
        UPDATE local_fiscal_series
        SET ultimo_numero = ultimo_numero + 1,
            updated_at = ?3
        WHERE document_type = ?1 AND serie = ?2
        "#,
        params![document_type_code(document_type), serie, now_ms()],
    )
    .map_err(|e| format!("No se pudo reservar correlativo fiscal local: {e}"))?;

    conn.query_row(
        "SELECT ultimo_numero FROM local_fiscal_series WHERE document_type = ?1 AND serie = ?2",
        params![document_type_code(document_type), serie],
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
    let moneda = input.moneda.as_deref().unwrap_or("PEN");
    let cliente_ruc = input.cliente_ruc.as_deref().unwrap_or("00000000");
    let cliente_nombre = input.cliente_nombre.as_deref().unwrap_or("Cliente");
    let issue_date = current_utc_date();
    let mut lines = String::new();

    for (index, item) in input.items.iter().enumerate() {
        let cantidad = item.get("cantidad").and_then(Value::as_f64).unwrap_or(1.0);
        let descripcion = value_string(item, "descripcion")
            .or_else(|| value_string(item, "nombre"))
            .unwrap_or_else(|| "Producto/servicio".to_string());
        let precio = item
            .get("precio_unitario")
            .or_else(|| item.get("precio"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        let total = item
            .get("total")
            .or_else(|| item.get("subtotal"))
            .and_then(Value::as_f64)
            .unwrap_or(cantidad * precio);
        lines.push_str(&format!(
            r#"
  <cac:InvoiceLine>
    <cbc:ID>{}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">{:.2}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="{}">{:.2}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Description>{}</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="{}">{:.2}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>"#,
            index + 1,
            cantidad,
            moneda,
            total,
            escape_xml(&descripcion),
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
      <cac:PartyIdentification><cbc:ID>{}</cbc:ID></cac:PartyIdentification>
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
    status: u16,
    headers: &[HeaderPair],
    body: &str,
) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_api_snapshots
            (cache_key, endpoint, url, status, headers_json, body, cached_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        params![
            local_cache_key(endpoint, url),
            endpoint,
            url,
            status as i64,
            response_headers_json(headers)?,
            body,
            now_ms(),
        ],
    )
    .map_err(|e| format!("No se pudo guardar snapshot local: {e}"))?;
    Ok(())
}

fn extract_response_data(body: &str) -> Option<Value> {
    let parsed: Value = serde_json::from_str(body).ok()?;
    Some(parsed.get("data").cloned().unwrap_or(parsed))
}

fn hydrate_pos_products(conn: &Connection, body: &str) -> Result<(), String> {
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
                (id, codigo, nombre, stock_actual, stock_disponible, data_json, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                id,
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

fn hydrate_local_customers(conn: &Connection, body: &str) -> Result<(), String> {
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
                (id, documento, razon_social, data_json, deleted, updated_at)
            VALUES (?1, ?2, ?3, ?4, 0, ?5)
            "#,
            params![
                id,
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

fn hydrate_sales_documents(conn: &Connection, body: &str, kind: &str) -> Result<(), String> {
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
                (id, kind, numero, cliente_id, estado, total, data_json, deleted, sync_status, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 'synced', ?8, ?8)
            "#,
            params![
                id,
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

fn hydrate_cash_session(conn: &Connection, body: &str) -> Result<(), String> {
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
            (id, caja_id, estado, monto_inicio, monto_cierre, opened_at, closed_at, data_json, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
        params![
            id,
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

fn read_local_snapshot(conn: &Connection, endpoint: &str, url: &str) -> Result<Option<LocalFirstResponse>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT status, headers_json, body
            FROM local_api_snapshots
            WHERE cache_key = ?1 OR endpoint = ?2
            ORDER BY CASE WHEN cache_key = ?1 THEN 0 ELSE 1 END, cached_at DESC
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("No se pudo preparar snapshot local: {e}"))?;

    let mut rows = stmt
        .query(params![local_cache_key(endpoint, url), endpoint])
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

fn build_products_snapshot(conn: &Connection) -> Result<LocalFirstResponse, String> {
    let mut stmt = conn
        .prepare("SELECT data_json FROM pos_products ORDER BY nombre ASC")
        .map_err(|e| format!("No se pudo preparar productos POS locales: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
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
) -> Result<Option<LocalFirstResponse>, String> {
    let id = endpoint.trim_start_matches("/api/inventario/productos/");
    let raw: Option<String> = conn
        .query_row(
            "SELECT data_json FROM pos_products WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Ok(None);
    };
    let product: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    Ok(Some(json_success_response(product, "Producto local")?))
}

fn build_customers_snapshot(conn: &Connection) -> Result<LocalFirstResponse, String> {
    let mut stmt = conn
        .prepare("SELECT data_json FROM local_customers WHERE deleted = 0 ORDER BY razon_social ASC")
        .map_err(|e| format!("No se pudo preparar clientes locales: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
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
) -> Result<Option<LocalFirstResponse>, String> {
    let id = endpoint.trim_start_matches("/api/ventas/clientes/");
    let raw: Option<String> = conn
        .query_row(
            "SELECT data_json FROM local_customers WHERE id = ?1 AND deleted = 0",
            params![id],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Ok(None);
    };
    let customer: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    Ok(Some(json_success_response(customer, "Cliente local")?))
}

fn attach_customer(conn: &Connection, mut document: Value) -> Value {
    let Some(cliente_id) = value_string(&document, "cliente_id") else {
        return document;
    };
    let customer_raw: Option<String> = conn
        .query_row(
            "SELECT data_json FROM local_customers WHERE id = ?1 AND deleted = 0",
            params![cliente_id],
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

fn build_sales_documents_snapshot(conn: &Connection, kind: &str) -> Result<LocalFirstResponse, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT data_json FROM local_sales_documents
            WHERE kind = ?1 AND deleted = 0
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar documentos venta locales: {e}"))?;
    let rows = stmt
        .query_map(params![kind], |row| {
            let raw: String = row.get(0)?;
            Ok(serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null))
        })
        .map_err(|e| format!("No se pudo leer documentos venta locales: {e}"))?;
    let mut documents = Vec::new();
    for row in rows {
        let value = row.map_err(|e| format!("Documento venta local invalido: {e}"))?;
        if !value.is_null() {
            documents.push(attach_customer(conn, value));
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
) -> Result<Option<LocalFirstResponse>, String> {
    let prefix = if kind == "quote" {
        "/api/ventas/cotizaciones/"
    } else {
        "/api/ventas/pedidos/"
    };
    let id = endpoint.trim_start_matches(prefix);
    let raw: Option<String> = conn
        .query_row(
            "SELECT data_json FROM local_sales_documents WHERE id = ?1 AND kind = ?2 AND deleted = 0",
            params![id, kind],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Ok(None);
    };
    let document: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    Ok(Some(json_success_response(
        attach_customer(conn, document),
        if kind == "quote" { "Cotizacion local" } else { "Pedido local" },
    )?))
}

fn merge_local_records_into_response(
    conn: &Connection,
    endpoint: &str,
    snapshot: Option<LocalFirstResponse>,
) -> Result<Option<LocalFirstResponse>, String> {
    let collection = collection_endpoint(endpoint);
    let mut stmt = conn
        .prepare(
            r#"
            SELECT data_json FROM local_generic_records
            WHERE collection_endpoint = ?1 AND deleted = 0
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(|e| format!("No se pudo preparar registros locales genericos: {e}"))?;
    let rows = stmt
        .query_map(params![&collection], |row| {
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
) -> Result<Option<LocalFirstResponse>, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT data_json FROM local_generic_records WHERE endpoint = ?1 AND deleted = 0",
            params![endpoint],
            |row| row.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Ok(None);
    };
    let data = serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null);
    Ok(Some(json_success_response(data, "Registro local pendiente")?))
}

fn build_open_session_snapshot(conn: &Connection) -> Result<Option<LocalFirstResponse>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT data_json FROM pos_cash_sessions
            WHERE estado = 'ABIERTA'
            ORDER BY opened_at DESC
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("No se pudo preparar sesion POS local: {e}"))?;
    let mut rows = stmt
        .query([])
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

fn build_recent_sales_snapshot(conn: &Connection) -> Result<LocalFirstResponse, String> {
    let mut stmt = conn
        .prepare("SELECT response_json FROM pos_sales ORDER BY created_at DESC LIMIT 50")
        .map_err(|e| format!("No se pudo preparar ventas POS locales: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
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
    let caja_id = input
        .endpoint
        .trim_start_matches("/api/cajas/")
        .trim_end_matches("/apertura")
        .to_string();
    let session_id = format!("local-session-{}", Uuid::new_v4());
    let monto_inicio = value_number(&payload, "monto_inicio");
    let timestamp = now_ms();
    let session = serde_json::json!({
        "id": session_id,
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

    conn.execute("UPDATE pos_cash_sessions SET estado = 'CERRADA', closed_at = ?1, updated_at = ?1 WHERE estado = 'ABIERTA'", params![timestamp])
        .map_err(|e| format!("No se pudo cerrar sesion local anterior: {e}"))?;
    conn.execute(
        r#"
        INSERT INTO pos_cash_sessions
            (id, caja_id, estado, monto_inicio, opened_at, data_json, updated_at)
        VALUES (?1, ?2, 'ABIERTA', ?3, ?4, ?5, ?4)
        "#,
        params![
            session_id,
            caja_id,
            monto_inicio,
            timestamp,
            serde_json::to_string(&session)
                .map_err(|e| format!("No se pudo serializar sesion local: {e}"))?,
        ],
    )
    .map_err(|e| format!("No se pudo abrir caja local: {e}"))?;
    let queued_input = with_local_entity_headers(input, &session_id, "cash_session");
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(session, "Caja abierta localmente; pendiente de sincronizacion")
}

fn process_local_cash_close(conn: &Connection, input: &LocalFirstWriteInput) -> Result<LocalFirstResponse, String> {
    let payload = parse_json_body(&input.body)?;
    let session_id = value_string(&payload, "sesion_id")
        .ok_or_else(|| "El cierre local requiere sesion_id".to_string())?;
    let monto_cierre = payload
        .get("monto_cierre")
        .or_else(|| payload.get("monto_contado"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let timestamp = now_ms();
    let mut session = serde_json::json!({
        "id": session_id,
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
            "SELECT data_json FROM pos_cash_sessions WHERE id = ?1",
            params![&session_id],
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
        "#,
        params![
            session_id,
            monto_cierre,
            timestamp,
            serde_json::to_string(&session)
                .map_err(|e| format!("No se pudo serializar cierre local: {e}"))?,
        ],
    )
    .map_err(|e| format!("No se pudo cerrar caja local: {e}"))?;
    let queued_input = with_local_entity_headers(input, &session_id, "cash_session");
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(session, "Caja cerrada localmente; pendiente de sincronizacion")
}

fn process_local_pos_sale(
    conn: &Connection,
    input: &LocalFirstWriteInput,
    config: &AppConfig,
) -> Result<LocalFirstResponse, String> {
    let payload = parse_json_body(&input.body)?;
    let idempotency_key = value_string(&payload, "idempotency_key")
        .unwrap_or_else(|| format!("local-{}", Uuid::new_v4()));
    let existing: Option<String> = conn
        .query_row(
            "SELECT response_json FROM pos_sales WHERE idempotency_key = ?1",
            params![&idempotency_key],
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
                "SELECT data_json FROM pos_products WHERE id = ?1",
                params![&producto_id],
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
            "UPDATE pos_products SET stock_actual = ?2, stock_disponible = ?2, data_json = ?3, updated_at = ?4 WHERE id = ?1",
            params![producto_id, next_stock, product_raw, now_ms()],
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
        if let Ok(fiscal_doc) = create_local_fiscal_document_with_conn(conn, config, fiscal_input) {
            if let Some(data) = response.get_mut("data").and_then(Value::as_object_mut) {
                data.insert("cpe_id".to_string(), serde_json::json!(fiscal_doc.id));
                data.insert("cpe_estado".to_string(), serde_json::json!(fiscal_doc.estado));
                data.insert("cpe_hash".to_string(), serde_json::json!(fiscal_doc.hash));
            }
        }
    }
    let response_raw = serde_json::to_string(&response)
        .map_err(|e| format!("No se pudo serializar venta local: {e}"))?;
    conn.execute(
        r#"
        INSERT INTO pos_sales
            (id, idempotency_key, sesion_caja_id, numero_ticket, total, body_json, response_json, sync_status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?8)
        "#,
        params![
            sale_id,
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
    let queued_input = with_local_entity_headers(input, &sale_id, "pos_sale");
    enqueue_offline_request_with_conn(conn, &queued_input)?;

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
                "SELECT data_json FROM pos_products WHERE id = ?1",
                params![&id],
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
            (id, codigo, nombre, stock_actual, stock_disponible, data_json, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6)
        "#,
        params![
            id,
            codigo,
            nombre,
            stock,
            serde_json::to_string(&product)
                .map_err(|e| format!("No se pudo serializar producto local: {e}"))?,
            timestamp,
        ],
    )
    .map_err(|e| format!("No se pudo guardar producto local: {e}"))?;
    let queued_input = with_local_entity_headers(input, &id, "inventory_product");
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
    let id = if method == "POST" {
        format!("local-customer-{}", Uuid::new_v4())
    } else {
        input
            .endpoint
            .trim_start_matches("/api/ventas/clientes/")
            .to_string()
    };

    let payload = if method == "DELETE" {
        let existing: Option<String> = conn
            .query_row(
                "SELECT data_json FROM local_customers WHERE id = ?1",
                params![&id],
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
            (id, documento, razon_social, data_json, deleted, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![
            id,
            documento,
            razon_social,
            serde_json::to_string(&customer)
                .map_err(|e| format!("No se pudo serializar cliente local: {e}"))?,
            if method == "DELETE" { 1 } else { 0 },
            timestamp,
        ],
    )
    .map_err(|e| format!("No se pudo guardar cliente local: {e}"))?;
    let queued_input = with_local_entity_headers(input, &id, "customer");
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

fn reserve_order_stock(conn: &Connection, payload: &Value) -> Result<(), String> {
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
                "SELECT data_json FROM pos_products WHERE id = ?1",
                params![&producto_id],
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
            "UPDATE pos_products SET data_json = ?2, updated_at = ?3 WHERE id = ?1",
            params![
                producto_id,
                serde_json::to_string(&product_json)
                    .map_err(|e| format!("No se pudo serializar reserva local: {e}"))?,
                now_ms(),
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
                "SELECT data_json FROM local_sales_documents WHERE id = ?1 AND kind = ?2",
                params![&id, kind],
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
        reserve_order_stock(conn, &document)?;
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
            (id, kind, numero, cliente_id, estado, total, data_json, deleted, sync_status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?9)
        "#,
        params![
            id,
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
    let queued_input = with_local_entity_headers(input, &id, entity_type);
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(
        attach_customer(conn, document),
        if kind == "quote" {
            "Cotizacion guardada localmente; pendiente de sincronizacion"
        } else {
            "Pedido guardado localmente; pendiente de sincronizacion"
        },
    )
}

fn process_generic_local_write(
    conn: &Connection,
    input: &LocalFirstWriteInput,
) -> Result<LocalFirstResponse, String> {
    let method = input.method.to_uppercase();
    let timestamp = now_ms();
    let collection = collection_endpoint(&input.endpoint);
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
                "SELECT data_json FROM local_generic_records WHERE id = ?1",
                params![&id],
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
            (id, endpoint, collection_endpoint, method, data_json, deleted, sync_status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?7)
        "#,
        params![
            id,
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
    let queued_input = with_local_entity_headers(input, &id, "generic_record");
    enqueue_offline_request_with_conn(conn, &queued_input)?;
    json_success_response(data, "Operacion guardada localmente; pendiente de sincronizacion")
}

#[tauri::command]
fn hydrate_local_first_response(
    app: AppHandle,
    endpoint: String,
    url: String,
    status: u16,
    headers: Vec<HeaderPair>,
    body: String,
) -> Result<(), String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    upsert_snapshot(&conn, &endpoint, &url, status, &headers, &body)?;

    match endpoint.as_str() {
        "/api/pos/productos" | "/api/inventario/productos" => hydrate_pos_products(&conn, &body)?,
        "/api/pos/clientes" | "/api/ventas/clientes" => hydrate_local_customers(&conn, &body)?,
        "/api/ventas/cotizaciones" => hydrate_sales_documents(&conn, &body, "quote")?,
        "/api/ventas/pedidos" => hydrate_sales_documents(&conn, &body, "order")?,
        "/api/pos/sesion-caja" => hydrate_cash_session(&conn, &body)?,
        _ => {}
    }

    Ok(())
}

#[tauri::command]
fn get_local_first_response(
    app: AppHandle,
    endpoint: String,
    url: String,
) -> Result<Option<LocalFirstResponse>, String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;

    match endpoint.as_str() {
        "/api/pos/productos" | "/api/inventario/productos" => {
            return Ok(Some(build_products_snapshot(&conn)?))
        }
        "/api/pos/clientes" | "/api/ventas/clientes" => {
            return Ok(Some(build_customers_snapshot(&conn)?))
        }
        "/api/ventas/cotizaciones" => {
            return Ok(Some(build_sales_documents_snapshot(&conn, "quote")?))
        }
        "/api/ventas/pedidos" => {
            return Ok(Some(build_sales_documents_snapshot(&conn, "order")?))
        }
        "/api/pos/sesion-caja" => return build_open_session_snapshot(&conn),
        "/api/pos/ventas-recientes" => return Ok(Some(build_recent_sales_snapshot(&conn)?)),
        _ => {}
    }

    if endpoint.starts_with("/api/inventario/productos/") {
        return build_product_detail_snapshot(&conn, &endpoint);
    }
    if endpoint.starts_with("/api/ventas/clientes/") {
        return build_customer_detail_snapshot(&conn, &endpoint);
    }
    if endpoint.starts_with("/api/ventas/cotizaciones/") {
        return build_sales_document_detail_snapshot(&conn, &endpoint, "quote");
    }
    if endpoint.starts_with("/api/ventas/pedidos/") {
        return build_sales_document_detail_snapshot(&conn, &endpoint, "order");
    }

    if let Some(detail) = build_generic_detail_snapshot(&conn, &endpoint)? {
        return Ok(Some(detail));
    }

    let snapshot = read_local_snapshot(&conn, &endpoint, &url)?;
    merge_local_records_into_response(&conn, &endpoint, snapshot)
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
        && request.endpoint.starts_with("/api/cajas/")
        && request.endpoint.ends_with("/apertura")
    {
        process_local_cash_open(&tx, &request)
    } else if request.method.eq_ignore_ascii_case("POST")
        && request.endpoint.starts_with("/api/cajas/")
        && request.endpoint.ends_with("/cierre")
    {
        process_local_cash_close(&tx, &request)
    } else if request.endpoint == "/api/inventario/productos"
        || request.endpoint.starts_with("/api/inventario/productos/")
    {
        process_local_inventory_product(&tx, &request)
    } else if request.endpoint == "/api/ventas/clientes"
        || request.endpoint.starts_with("/api/ventas/clientes/")
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
    let request: Option<(String, Option<String>, String)> = conn
        .query_row(
            "SELECT endpoint, body, headers_json FROM offline_requests WHERE id = ?1",
            params![offline_request_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok();
    let Some((endpoint, body, headers_json)) = request else {
        return Ok(());
    };
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

    if endpoint == "/api/ventas/cotizaciones"
        || endpoint == "/api/cotizaciones/crear"
        || endpoint.starts_with("/api/ventas/cotizaciones/")
    {
        let synced_document_json = response_data_json(response_body);
        let local_id = local_id.or_else(|| value_string(&payload, "id"));
        if let Some(id) = local_id {
            conn.execute(
                "UPDATE local_sales_documents SET sync_status = ?2, data_json = COALESCE(?3, data_json), updated_at = ?4 WHERE id = ?1 AND kind = 'quote'",
                params![id, sync_status, synced_document_json, now_ms()],
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
                "UPDATE local_sales_documents SET sync_status = ?2, data_json = COALESCE(?3, data_json), updated_at = ?4 WHERE id = ?1 AND kind = 'order'",
                params![id, sync_status, synced_document_json, now_ms()],
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
                "UPDATE pos_products SET data_json = COALESCE(?2, data_json), updated_at = ?3 WHERE id = ?1",
                params![id, synced_json, now_ms()],
            )
            .map_err(|e| format!("No se pudo actualizar sync de producto local: {e}"))?;
        }
        return Ok(());
    }

    if endpoint == "/api/ventas/clientes" || endpoint.starts_with("/api/ventas/clientes/") {
        let synced_json = response_data_json(response_body);
        let local_id = local_id.or_else(|| value_string(&payload, "id"));
        if let Some(id) = local_id {
            conn.execute(
                "UPDATE local_customers SET data_json = COALESCE(?2, data_json), updated_at = ?3 WHERE id = ?1",
                params![id, synced_json, now_ms()],
            )
            .map_err(|e| format!("No se pudo actualizar sync de cliente local: {e}"))?;
        }
        return Ok(());
    }

    if endpoint != "/api/pos/venta" {
        let generic_id = local_id.or_else(|| value_string(&payload, "id"));
        if let Some(id) = generic_id {
            let synced_json = response_data_json(response_body);
            conn.execute(
                "UPDATE local_generic_records SET sync_status = ?2, data_json = COALESCE(?3, data_json), updated_at = ?4 WHERE id = ?1",
                params![id, sync_status, synced_json, now_ms()],
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
            "UPDATE pos_sales SET sync_status = ?2, response_json = ?3, updated_at = ?4 WHERE idempotency_key = ?1",
            params![idempotency_key, sync_status, response, now_ms()],
        )
        .map_err(|e| format!("No se pudo actualizar estado sync POS local: {e}"))?;
    } else {
        conn.execute(
            "UPDATE pos_sales SET sync_status = ?2, updated_at = ?3 WHERE idempotency_key = ?1",
            params![idempotency_key, sync_status, now_ms()],
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
    status: u16,
    headers: Vec<HeaderPair>,
    body_base64: String,
) -> Result<(), String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_binary_cache
            (cache_key, endpoint, url, status, headers_json, body_base64, cached_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        params![
            local_cache_key(&endpoint, &url),
            endpoint,
            url,
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
) -> Result<Option<BinaryLocalResponse>, String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT status, headers_json, body_base64, cached_at
            FROM local_binary_cache
            WHERE cache_key = ?1 OR endpoint = ?2
            ORDER BY CASE WHEN cache_key = ?1 THEN 0 ELSE 1 END, cached_at DESC
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("No se pudo preparar binario local: {e}"))?;
    let mut rows = stmt
        .query(params![local_cache_key(&endpoint, &url), endpoint])
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
) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT OR REPLACE INTO local_fiscal_documents (
            id, document_type, serie, numero, estado, cliente_ruc, cliente_nombre,
            moneda, subtotal, igv, total, source_type, source_id, xml_content,
            signed_xml, pdf_base64, hash, response_json, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, NULL, ?18, ?18)
        "#,
        params![
            document.id,
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
) -> Result<OfflineFiscalDocument, String> {
    if config.ruc.trim().is_empty() || config.razon_social.trim().is_empty() {
        return Err("Configura RUC y razon social en desktop antes de emitir offline".to_string());
    }
    let serie = document
        .serie
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| default_series(&document.document_type).to_string());
    let numero = reserve_local_fiscal_number(conn, &document.document_type, &serie)?;
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
    save_local_fiscal_document(conn, &result, &document)?;

    let queued_body = serde_json::to_string(&serde_json::json!({
        "local_fiscal_id": result.id,
        "document_type": result.document_type,
        "serie": result.serie,
        "numero": result.numero,
        "estado": result.estado,
        "xml_content": result.xml_content,
        "signed_xml": result.signed_xml,
        "hash": result.hash,
        "source_type": document.source_type,
        "source_id": document.source_id,
        "cliente_ruc": document.cliente_ruc,
        "cliente_nombre": document.cliente_nombre,
        "subtotal": document.subtotal,
        "igv": document.igv,
        "total": document.total
    }))
    .map_err(|e| format!("No se pudo serializar documento fiscal para sync: {e}"))?;
    let queued = LocalFirstWriteInput {
        endpoint: "/api/cpe/offline-documents".to_string(),
        method: "POST".to_string(),
        url: "/api/cpe/offline-documents".to_string(),
        headers: vec![
            HeaderPair {
                name: "Content-Type".to_string(),
                value: "application/json".to_string(),
            },
            HeaderPair {
                name: "x-erp-local-id".to_string(),
                value: result.id.clone(),
            },
            HeaderPair {
                name: "x-erp-local-entity-type".to_string(),
                value: "fiscal_document".to_string(),
            },
        ],
        body: Some(queued_body),
        tenant_id: None,
        user_id: None,
    };
    enqueue_offline_request_with_conn(conn, &queued)?;
    Ok(result)
}

#[tauri::command]
fn generate_offline_fiscal_document(
    app: AppHandle,
    document: OfflineFiscalDocumentInput,
) -> Result<OfflineFiscalDocument, String> {
    let config = load_config(app.clone()).unwrap_or_default();
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("No se pudo iniciar transaccion fiscal local: {e}"))?;
    let result = create_local_fiscal_document_with_conn(&tx, &config, document)?;
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
async fn send_to_sunat(app: AppHandle, signed_xml: String) -> Result<String, String> {
    let _guard = lock_offline_queue()?;
    let conn = open_local_db(&app)?;
    let hash = hash_base64(&signed_xml);
    let body = serde_json::to_string(&serde_json::json!({
        "signed_xml": signed_xml,
        "hash": hash,
        "estado": "PENDIENTE_ENVIO",
        "origen": "desktop_offline"
    }))
    .map_err(|e| format!("No se pudo serializar envio SUNAT pendiente: {e}"))?;
    let queued = LocalFirstWriteInput {
        endpoint: "/api/cpe/send-signed".to_string(),
        method: "POST".to_string(),
        url: "/api/cpe/send-signed".to_string(),
        headers: vec![
            HeaderPair {
                name: "Content-Type".to_string(),
                value: "application/json".to_string(),
            },
            HeaderPair {
                name: "x-erp-local-id".to_string(),
                value: hash.clone(),
            },
            HeaderPair {
                name: "x-erp-local-entity-type".to_string(),
                value: "fiscal_send".to_string(),
            },
        ],
        body: Some(body),
        tenant_id: None,
        user_id: None,
    };
    enqueue_offline_request_with_conn(&conn, &queued)?;
    Ok("PENDIENTE_ENVIO: XML firmado guardado localmente; SUNAT/OSE se enviara al reconectar".to_string())
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
