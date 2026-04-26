use std::fs;
use openssl::pkcs12::Pkcs12;
use openssl::pkey::PKey;
use openssl::x509::X509;
use openssl::sign::Signer;
use openssl::hash::MessageDigest;
use base64::{Engine as _, engine::general_purpose};
use sha2::{Sha256, Digest};

pub async fn sign_xml_document(
    xml_content: &str,
    cert_path: &str,
    cert_password: &str,
) -> Result<String, String> {
    // Leer el certificado .pfx
    let cert_data = fs::read(cert_path)
        .map_err(|e| format!("Error reading certificate: {}", e))?;
    
    // Parsear el PKCS12
    let pkcs12 = Pkcs12::from_der(&cert_data)
        .map_err(|e| format!("Error parsing PKCS12: {}", e))?;
    
    let parsed = pkcs12.parse2(cert_password)
        .map_err(|e| format!("Error parsing certificate with password: {}", e))?;
    
    let private_key = parsed.pkey
        .ok_or("No private key found in certificate")?;
    let certificate = parsed.cert
        .ok_or("No certificate found in PKCS12")?;
    
    // Crear la firma XML según estándares SUNAT
    let signed_xml = create_xml_signature(xml_content, &private_key, &certificate)?;
    
    Ok(signed_xml)
}

fn create_xml_signature(
    xml_content: &str,
    private_key: &PKey<openssl::pkey::Private>,
    certificate: &X509,
) -> Result<String, String> {
    // Calcular hash SHA-256 del contenido XML
    let mut hasher = Sha256::new();
    hasher.update(xml_content.as_bytes());
    let hash = hasher.finalize();
    
    // Crear el SignedInfo
    let signed_info = format!(r#"<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
        <Reference URI="">
            <Transforms>
                <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
            </Transforms>
            <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
            <DigestValue>{}</DigestValue>
        </Reference>
    </SignedInfo>"#, general_purpose::STANDARD.encode(&hash));
    
    // Firmar el SignedInfo
    let mut signer = Signer::new(MessageDigest::sha256(), private_key)
        .map_err(|e| format!("Error creating signer: {}", e))?;
    
    signer.update(signed_info.as_bytes())
        .map_err(|e| format!("Error updating signer: {}", e))?;
    
    let signature = signer.sign_to_vec()
        .map_err(|e| format!("Error signing: {}", e))?;
    
    let signature_b64 = general_purpose::STANDARD.encode(&signature);
    
    // Obtener información del certificado
    let cert_der = certificate.to_der()
        .map_err(|e| format!("Error converting certificate to DER: {}", e))?;
    let cert_b64 = general_purpose::STANDARD.encode(&cert_der);
    
    // Crear la estructura XML firmada completa
    let signed_xml = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
{}
<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    {}
    <SignatureValue>{}</SignatureValue>
    <KeyInfo>
        <X509Data>
            <X509Certificate>{}</X509Certificate>
        </X509Data>
    </KeyInfo>
</Signature>"#, xml_content, signed_info, signature_b64, cert_b64);
    
    Ok(signed_xml)
}

pub fn validate_certificate(cert_path: &str, password: &str) -> Result<bool, String> {
    let cert_data = fs::read(cert_path)
        .map_err(|e| format!("Error reading certificate: {}", e))?;
    
    let pkcs12 = Pkcs12::from_der(&cert_data)
        .map_err(|e| format!("Invalid certificate format: {}", e))?;
    
    let parsed = pkcs12.parse2(password)
        .map_err(|e| format!("Invalid certificate password: {}", e))?;
    
    // Verificar que el certificado tenga clave privada
    if parsed.pkey.is_none() {
        return Err("Certificate does not contain a private key".to_string());
    }
    
    // Verificar que el certificado no haya expirado
    if let Some(cert) = &parsed.cert {
        let now = chrono::Utc::now();
        let not_after = cert.not_after();
        
        // Convertir ASN1Time a DateTime (simplificado)
        let not_after_str = not_after.to_string();
        if let Ok(expiry) = chrono::DateTime::parse_from_str(&not_after_str, "%b %d %H:%M:%S %Y %Z") {
            if expiry.with_timezone(&chrono::Utc) < now {
                return Err("Certificate has expired".to_string());
            }
        }
    }
    
    Ok(true)
}