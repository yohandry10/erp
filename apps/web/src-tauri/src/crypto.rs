use base64::{engine::general_purpose, Engine as _};
use sha2::{Digest, Sha256};
use std::fs;

pub fn sign_xml_document(
    xml_content: &str,
    cert_path: &str,
    cert_password: &str,
) -> Result<String, String> {
    validate_certificate(cert_path, cert_password)?;
    let cert_data = fs::read(cert_path)
        .map_err(|e| format!("No se pudo leer el certificado local: {e}"))?;
    let cert_hash = general_purpose::STANDARD.encode(Sha256::digest(&cert_data));
    let digest = general_purpose::STANDARD.encode(Sha256::digest(xml_content.as_bytes()));
    let local_signature = general_purpose::STANDARD.encode(Sha256::digest(
        format!("{digest}:{cert_hash}:{}", cert_password.len()).as_bytes(),
    ));

    Ok(format!(
        r#"{}
<!-- ERP_DESKTOP_LOCAL_SIGNATURE
DigestValue={}
CertificateHash={}
SignatureValue={}
Status=PENDIENTE_ENVIO_SUNAT_OSE
-->"#,
        xml_content, digest, cert_hash, local_signature
    ))
}

pub fn validate_certificate(cert_path: &str, password: &str) -> Result<bool, String> {
    if cert_path.trim().is_empty() {
        return Err("Ruta de certificado vacia".to_string());
    }
    if password.is_empty() {
        return Err("Contrasena de certificado vacia".to_string());
    }
    let metadata = fs::metadata(cert_path)
        .map_err(|e| format!("No se pudo acceder al certificado local: {e}"))?;
    if !metadata.is_file() {
        return Err("La ruta del certificado no apunta a un archivo".to_string());
    }
    Ok(true)
}
