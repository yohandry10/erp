use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct PdfTemplate {
    pub name: String,
    pub content: String,
}

pub async fn generate_from_xml(xml_content: &str, template: &str) -> Result<Vec<u8>, String> {
    // Parsear XML para extraer datos
    let document_data = parse_xml_document(xml_content)?;
    
    // Generar HTML desde template
    let html_content = render_template(template, &document_data)?;
    
    // Convertir HTML a PDF usando wkhtmltopdf o similar
    generate_pdf_from_html(&html_content).await
}

fn parse_xml_document(xml_content: &str) -> Result<HashMap<String, String>, String> {
    let mut data = HashMap::new();
    
    // Parser básico para extraer datos del XML
    // En producción usar un parser XML completo como roxmltree
    
    // Extraer RUC emisor
    if let Some(ruc) = extract_xml_value(xml_content, "cbc:ID", "schemeID=\"6\"") {
        data.insert("emisor_ruc".to_string(), ruc);
    }
    
    // Extraer razón social
    if let Some(razon_social) = extract_xml_value(xml_content, "cbc:RegistrationName", "") {
        data.insert("emisor_razon_social".to_string(), razon_social);
    }
    
    // Extraer serie y número
    if let Some(serie_numero) = extract_xml_value(xml_content, "cbc:ID", "") {
        let parts: Vec<&str> = serie_numero.split('-').collect();
        if parts.len() == 2 {
            data.insert("serie".to_string(), parts[0].to_string());
            data.insert("numero".to_string(), parts[1].to_string());
        }
    }
    
    // Extraer fecha de emisión
    if let Some(fecha) = extract_xml_value(xml_content, "cbc:IssueDate", "") {
        data.insert("fecha_emision".to_string(), fecha);
    }
    
    // Extraer totales
    if let Some(total) = extract_xml_value(xml_content, "cbc:PayableAmount", "") {
        data.insert("total".to_string(), total);
    }
    
    if let Some(igv) = extract_xml_value(xml_content, "cbc:TaxAmount", "") {
        data.insert("igv".to_string(), igv);
    }
    
    // Extraer datos del cliente
    if let Some(cliente_ruc) = extract_xml_value(xml_content, "cac:AccountingCustomerParty", "") {
        data.insert("cliente_ruc".to_string(), cliente_ruc);
    }
    
    Ok(data)
}

fn extract_xml_value(xml: &str, tag: &str, attribute: &str) -> Option<String> {
    let start_tag = if attribute.is_empty() {
        format!("<{}>", tag)
    } else {
        format!("<{} {}>", tag, attribute)
    };
    
    let end_tag = format!("</{}>", tag);
    
    if let Some(start) = xml.find(&start_tag) {
        let content_start = start + start_tag.len();
        if let Some(end) = xml[content_start..].find(&end_tag) {
            return Some(xml[content_start..content_start + end].trim().to_string());
        }
    }
    
    None
}

fn render_template(template: &str, data: &HashMap<String, String>) -> Result<String, String> {
    let mut html = template.to_string();
    
    // Reemplazar variables en el template
    for (key, value) in data {
        let placeholder = format!("{{{{{}}}}}", key);
        html = html.replace(&placeholder, value);
    }
    
    // Template básico si no se proporciona uno
    if template.is_empty() {
        html = create_default_template(data);
    }
    
    Ok(html)
}

fn create_default_template(data: &HashMap<String, String>) -> String {
    format!(r#"
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Comprobante Electrónico</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 20px; }}
            .header {{ text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }}
            .content {{ margin: 20px 0; }}
            .footer {{ margin-top: 30px; font-size: 12px; }}
            table {{ width: 100%; border-collapse: collapse; }}
            th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
            th {{ background-color: #f2f2f2; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>{}</h1>
            <p>RUC: {}</p>
            <h2>FACTURA ELECTRÓNICA</h2>
            <p>{} - {}</p>
        </div>
        
        <div class="content">
            <p><strong>Fecha de Emisión:</strong> {}</p>
            <p><strong>Cliente:</strong> {}</p>
            
            <table>
                <tr>
                    <th>Concepto</th>
                    <th>Cantidad</th>
                    <th>Precio</th>
                    <th>Total</th>
                </tr>
                <tr>
                    <td colspan="4">Detalle de productos/servicios</td>
                </tr>
            </table>
            
            <div style="text-align: right; margin-top: 20px;">
                <p><strong>IGV:</strong> S/ {}</p>
                <p><strong>TOTAL:</strong> S/ {}</p>
            </div>
        </div>
        
        <div class="footer">
            <p>Representación impresa de la Factura Electrónica</p>
        </div>
    </body>
    </html>
    "#,
    data.get("emisor_razon_social").unwrap_or(&"".to_string()),
    data.get("emisor_ruc").unwrap_or(&"".to_string()),
    data.get("serie").unwrap_or(&"".to_string()),
    data.get("numero").unwrap_or(&"".to_string()),
    data.get("fecha_emision").unwrap_or(&"".to_string()),
    data.get("cliente_ruc").unwrap_or(&"".to_string()),
    data.get("igv").unwrap_or(&"0.00".to_string()),
    data.get("total").unwrap_or(&"0.00".to_string())
    )
}

async fn generate_pdf_from_html(html_content: &str) -> Result<Vec<u8>, String> {
    // En un entorno real, usar wkhtmltopdf, puppeteer, o similar
    // Por ahora, simular generación de PDF
    
    use std::process::Command;
    use std::fs;
    use uuid::Uuid;
    
    let temp_id = Uuid::new_v4().to_string();
    let html_path = format!("/tmp/temp_{}.html", temp_id);
    let pdf_path = format!("/tmp/temp_{}.pdf", temp_id);
    
    // Escribir HTML temporal
    fs::write(&html_path, html_content)
        .map_err(|e| format!("Error writing temp HTML: {}", e))?;
    
    // Usar wkhtmltopdf si está disponible
    let output = Command::new("wkhtmltopdf")
        .args(&[
            "--page-size", "A4",
            "--margin-top", "0.75in",
            "--margin-right", "0.75in",
            "--margin-bottom", "0.75in",
            "--margin-left", "0.75in",
            &html_path,
            &pdf_path
        ])
        .output();
    
    match output {
        Ok(result) => {
            if result.status.success() {
                let pdf_data = fs::read(&pdf_path)
                    .map_err(|e| format!("Error reading generated PDF: {}", e))?;
                
                // Limpiar archivos temporales
                let _ = fs::remove_file(&html_path);
                let _ = fs::remove_file(&pdf_path);
                
                Ok(pdf_data)
            } else {
                Err(format!("wkhtmltopdf failed: {}", String::from_utf8_lossy(&result.stderr)))
            }
        }
        Err(_) => {
            // Fallback: generar PDF básico usando una librería Rust
            generate_simple_pdf(html_content).await
        }
    }
}

async fn generate_simple_pdf(html_content: &str) -> Result<Vec<u8>, String> {
    // Implementación básica de PDF usando printpdf o similar
    // Por ahora retornar un PDF mínimo
    
    let pdf_content = format!(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n\
        2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n\
        3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n\
        xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n\
        0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n174\n%%EOF"
    );
    
    Ok(pdf_content.into_bytes())
}