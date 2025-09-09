use sqlx::{SqlitePool, Row};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Database {
    pool: SqlitePool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Factura {
    pub id: String,
    pub serie: String,
    pub numero: i32,
    pub fecha_emision: DateTime<Utc>,
    pub cliente_ruc: String,
    pub cliente_nombre: String,
    pub subtotal: f64,
    pub igv: f64,
    pub total: f64,
    pub estado: String,
    pub xml_content: Option<String>,
    pub pdf_path: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = SqlitePool::connect(&format!("sqlite:{}", database_url)).await?;
        
        // Crear tablas si no existen
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS facturas (
                id TEXT PRIMARY KEY,
                serie TEXT NOT NULL,
                numero INTEGER NOT NULL,
                fecha_emision TEXT NOT NULL,
                cliente_ruc TEXT NOT NULL,
                cliente_nombre TEXT NOT NULL,
                subtotal REAL NOT NULL,
                igv REAL NOT NULL,
                total REAL NOT NULL,
                estado TEXT NOT NULL DEFAULT 'PENDIENTE',
                xml_content TEXT,
                pdf_path TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(serie, numero)
            )
        "#).execute(&pool).await?;
        
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS boletas (
                id TEXT PRIMARY KEY,
                serie TEXT NOT NULL,
                numero INTEGER NOT NULL,
                fecha_emision TEXT NOT NULL,
                cliente_documento TEXT,
                cliente_nombre TEXT,
                subtotal REAL NOT NULL,
                igv REAL NOT NULL,
                total REAL NOT NULL,
                estado TEXT NOT NULL DEFAULT 'PENDIENTE',
                xml_content TEXT,
                pdf_path TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(serie, numero)
            )
        "#).execute(&pool).await?;
        
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS guias_remision (
                id TEXT PRIMARY KEY,
                serie TEXT NOT NULL,
                numero INTEGER NOT NULL,
                fecha_emision TEXT NOT NULL,
                destinatario_ruc TEXT NOT NULL,
                destinatario_nombre TEXT NOT NULL,
                punto_partida TEXT NOT NULL,
                punto_llegada TEXT NOT NULL,
                motivo_traslado TEXT NOT NULL,
                peso_total REAL NOT NULL,
                estado TEXT NOT NULL DEFAULT 'PENDIENTE',
                xml_content TEXT,
                pdf_path TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(serie, numero)
            )
        "#).execute(&pool).await?;
        
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS productos (
                id TEXT PRIMARY KEY,
                codigo TEXT UNIQUE NOT NULL,
                descripcion TEXT NOT NULL,
                precio REAL NOT NULL,
                stock INTEGER NOT NULL DEFAULT 0,
                unidad_medida TEXT NOT NULL DEFAULT 'NIU',
                categoria TEXT,
                activo BOOLEAN NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        "#).execute(&pool).await?;
        
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS clientes (
                id TEXT PRIMARY KEY,
                ruc_dni TEXT UNIQUE NOT NULL,
                razon_social TEXT NOT NULL,
                direccion TEXT,
                telefono TEXT,
                email TEXT,
                activo BOOLEAN NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        "#).execute(&pool).await?;
        
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS configuracion (
                clave TEXT PRIMARY KEY,
                valor TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        "#).execute(&pool).await?;
        
        Ok(Database { pool })
    }
    
    pub async fn save_factura(&self, factura: &Factura) -> Result<(), sqlx::Error> {
        sqlx::query(r#"
            INSERT OR REPLACE INTO facturas 
            (id, serie, numero, fecha_emision, cliente_ruc, cliente_nombre, 
             subtotal, igv, total, estado, xml_content, pdf_path, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#)
        .bind(&factura.id)
        .bind(&factura.serie)
        .bind(factura.numero)
        .bind(factura.fecha_emision.to_rfc3339())
        .bind(&factura.cliente_ruc)
        .bind(&factura.cliente_nombre)
        .bind(factura.subtotal)
        .bind(factura.igv)
        .bind(factura.total)
        .bind(&factura.estado)
        .bind(&factura.xml_content)
        .bind(&factura.pdf_path)
        .bind(factura.created_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }
    
    pub async fn get_facturas(&self, limit: i32, offset: i32) -> Result<Vec<Factura>, sqlx::Error> {
        let rows = sqlx::query(r#"
            SELECT * FROM facturas 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        "#)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;
        
        let mut facturas = Vec::new();
        for row in rows {
            facturas.push(Factura {
                id: row.get("id"),
                serie: row.get("serie"),
                numero: row.get("numero"),
                fecha_emision: DateTime::parse_from_rfc3339(&row.get::<String, _>("fecha_emision"))
                    .unwrap().with_timezone(&Utc),
                cliente_ruc: row.get("cliente_ruc"),
                cliente_nombre: row.get("cliente_nombre"),
                subtotal: row.get("subtotal"),
                igv: row.get("igv"),
                total: row.get("total"),
                estado: row.get("estado"),
                xml_content: row.get("xml_content"),
                pdf_path: row.get("pdf_path"),
                created_at: DateTime::parse_from_rfc3339(&row.get::<String, _>("created_at"))
                    .unwrap().with_timezone(&Utc),
            });
        }
        
        Ok(facturas)
    }
    
    pub async fn backup(&self, backup_path: &str) -> Result<(), String> {
        // Implementar backup de SQLite
        let backup_query = format!(
            "VACUUM INTO '{}'", 
            backup_path.replace("'", "''")
        );
        
        sqlx::query(&backup_query)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Error creating backup: {}", e))?;
        
        Ok(())
    }
    
    pub async fn export_sire_data(&self, periodo: &str) -> Result<String, String> {
        // Exportar datos para SIRE en formato requerido por SUNAT
        let rows = sqlx::query(r#"
            SELECT serie, numero, fecha_emision, cliente_ruc, total, igv
            FROM facturas 
            WHERE strftime('%Y-%m', fecha_emision) = ?
            AND estado = 'ACEPTADO'
            ORDER BY fecha_emision
        "#)
        .bind(periodo)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Error querying SIRE data: {}", e))?;
        
        let mut sire_content = String::new();
        sire_content.push_str("PERIODO|SERIE|NUMERO|FECHA|RUC_CLIENTE|TOTAL|IGV\n");
        
        for row in rows {
            sire_content.push_str(&format!(
                "{}|{}|{}|{}|{}|{:.2}|{:.2}\n",
                periodo,
                row.get::<String, _>("serie"),
                row.get::<i32, _>("numero"),
                row.get::<String, _>("fecha_emision"),
                row.get::<String, _>("cliente_ruc"),
                row.get::<f64, _>("total"),
                row.get::<f64, _>("igv")
            ));
        }
        
        Ok(sire_content)
    }
}