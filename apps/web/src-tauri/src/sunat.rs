use reqwest::Client;
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct SunatResponse {
    pub success: bool,
    pub message: String,
    pub cdr_content: Option<String>,
    pub ticket: Option<String>,
}

#[derive(Debug, Serialize)]
struct SunatRequest {
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "contentFile")]
    content_file: String,
}

pub async fn send_document(signed_xml: &str, endpoint: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Error creating HTTP client: {}", e))?;
    
    // Comprimir el XML (ZIP)
    let compressed_xml = compress_xml(signed_xml)?;
    let file_name = generate_filename();
    
    let request_body = SunatRequest {
        file_name: file_name.clone(),
        content_file: general_purpose::STANDARD.encode(&compressed_xml),
    };
    
    // Enviar a SUNAT
    let response = client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .header("SOAPAction", "urn:sendBill")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Error sending to SUNAT: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("SUNAT returned error: {}", response.status()));
    }
    
    let response_text = response.text().await
        .map_err(|e| format!("Error reading SUNAT response: {}", e))?;
    
    // Parsear respuesta de SUNAT
    parse_sunat_response(&response_text)
}

fn compress_xml(xml_content: &str) -> Result<Vec<u8>, String> {
    use std::io::Write;
    
    let mut encoder = flate2::write::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    
    encoder.start_file("document.xml", options)
        .map_err(|e| format!("Error creating ZIP file: {}", e))?;
    
    encoder.write_all(xml_content.as_bytes())
        .map_err(|e| format!("Error writing to ZIP: {}", e))?;
    
    let cursor = encoder.finish()
        .map_err(|e| format!("Error finishing ZIP: {}", e))?;
    
    Ok(cursor.into_inner())
}

fn generate_filename() -> String {
    let now = chrono::Utc::now();
    format!("document_{}.zip", now.format("%Y%m%d_%H%M%S"))
}

fn parse_sunat_response(response_xml: &str) -> Result<String, String> {
    // Parsear respuesta SOAP de SUNAT
    if response_xml.contains("faultstring") {
        // Error en SUNAT
        if let Some(start) = response_xml.find("<faultstring>") {
            if let Some(end) = response_xml.find("</faultstring>") {
                let error_msg = &response_xml[start + 13..end];
                return Err(format!("SUNAT Error: {}", error_msg));
            }
        }
        return Err("Unknown SUNAT error".to_string());
    }
    
    // Buscar CDR (Constancia de Recepción)
    if let Some(start) = response_xml.find("<applicationResponse>") {
        if let Some(end) = response_xml.find("</applicationResponse>") {
            let cdr_b64 = &response_xml[start + 21..end];
            
            // Decodificar y descomprimir CDR
            let cdr_compressed = general_purpose::STANDARD.decode(cdr_b64)
                .map_err(|e| format!("Error decoding CDR: {}", e))?;
            
            let cdr_xml = decompress_cdr(&cdr_compressed)?;
            
            // Verificar estado en CDR
            if cdr_xml.contains("<cbc:ResponseCode>0</cbc:ResponseCode>") {
                return Ok("Documento aceptado por SUNAT".to_string());
            } else if cdr_xml.contains("<cbc:ResponseCode>") {
                return Err("Documento rechazado por SUNAT - revisar CDR".to_string());
            }
        }
    }
    
    // Buscar ticket para consulta posterior
    if let Some(start) = response_xml.find("<ticket>") {
        if let Some(end) = response_xml.find("</ticket>") {
            let ticket = &response_xml[start + 8..end];
            return Ok(format!("Documento enviado - Ticket: {}", ticket));
        }
    }
    
    Ok("Documento procesado".to_string())
}

fn decompress_cdr(compressed_data: &[u8]) -> Result<String, String> {
    use std::io::Read;
    
    let cursor = std::io::Cursor::new(compressed_data);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Error reading CDR ZIP: {}", e))?;
    
    let mut file = archive.by_index(0)
        .map_err(|e| format!("Error accessing CDR file: {}", e))?;
    
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| format!("Error reading CDR contents: {}", e))?;
    
    Ok(contents)
}

pub async fn check_ticket_status(ticket: &str, endpoint: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Error creating HTTP client: {}", e))?;
    
    let soap_body = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
                <getStatus xmlns="http://service.sunat.gob.pe">
                    <ticket>{}</ticket>
                </getStatus>
            </soap:Body>
        </soap:Envelope>"#, ticket);
    
    let response = client
        .post(endpoint)
        .header("Content-Type", "text/xml; charset=utf-8")
        .header("SOAPAction", "urn:getStatus")
        .body(soap_body)
        .send()
        .await
        .map_err(|e| format!("Error checking ticket status: {}", e))?;
    
    let response_text = response.text().await
        .map_err(|e| format!("Error reading ticket response: {}", e))?;
    
    parse_sunat_response(&response_text)
}