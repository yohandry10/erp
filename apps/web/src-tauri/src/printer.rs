use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PrinterInfo {
    pub name: String,
    pub status: String,
    pub is_default: bool,
}

pub async fn get_available_printers() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        get_windows_printers().await
    }
    
    #[cfg(target_os = "linux")]
    {
        get_linux_printers().await
    }
    
    #[cfg(target_os = "macos")]
    {
        get_macos_printers().await
    }
}

#[cfg(target_os = "windows")]
async fn get_windows_printers() -> Result<Vec<String>, String> {
    let output = Command::new("wmic")
        .args(&["printer", "get", "name", "/format:csv"])
        .output()
        .map_err(|e| format!("Error executing wmic: {}", e))?;
    
    if !output.status.success() {
        return Err("Failed to get printer list".to_string());
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut printers = Vec::new();
    
    for line in output_str.lines().skip(2) { // Skip header lines
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 2 && !parts[1].trim().is_empty() {
            printers.push(parts[1].trim().to_string());
        }
    }
    
    Ok(printers)
}

#[cfg(target_os = "linux")]
async fn get_linux_printers() -> Result<Vec<String>, String> {
    let output = Command::new("lpstat")
        .args(&["-p"])
        .output()
        .map_err(|e| format!("Error executing lpstat: {}", e))?;
    
    if !output.status.success() {
        return Err("Failed to get printer list".to_string());
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut printers = Vec::new();
    
    for line in output_str.lines() {
        if line.starts_with("printer ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                printers.push(parts[1].to_string());
            }
        }
    }
    
    Ok(printers)
}

#[cfg(target_os = "macos")]
async fn get_macos_printers() -> Result<Vec<String>, String> {
    let output = Command::new("lpstat")
        .args(&["-p"])
        .output()
        .map_err(|e| format!("Error executing lpstat: {}", e))?;
    
    if !output.status.success() {
        return Err("Failed to get printer list".to_string());
    }
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut printers = Vec::new();
    
    for line in output_str.lines() {
        if line.starts_with("printer ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                printers.push(parts[1].to_string());
            }
        }
    }
    
    Ok(printers)
}

pub async fn print_pdf(pdf_data: &[u8], printer_name: Option<&str>) -> Result<(), String> {
    use std::fs;
    use std::env;
    use uuid::Uuid;

    // Crear archivo temporal
    let temp_id = Uuid::new_v4().to_string();
    let temp_path_buf = env::temp_dir().join(format!("print_{}.pdf", temp_id));
    let temp_path = temp_path_buf
        .to_str()
        .ok_or_else(|| "Ruta temporal PDF invalida".to_string())?
        .to_string();
    
    fs::write(&temp_path, pdf_data)
        .map_err(|e| format!("Error writing temp PDF: {}", e))?;
    
    let result = match printer_name {
        Some(printer) => print_to_specific_printer(&temp_path, printer).await,
        None => print_to_default_printer(&temp_path).await,
    };
    
    // Limpiar archivo temporal
    let _ = fs::remove_file(&temp_path);
    
    result
}

#[cfg(target_os = "windows")]
async fn print_to_specific_printer(pdf_path: &str, printer_name: &str) -> Result<(), String> {
    // Usar Adobe Reader o SumatraPDF para imprimir
    let output = Command::new("AcroRd32.exe")
        .args(&["/t", pdf_path, printer_name])
        .output();
    
    match output {
        Ok(result) => {
            if result.status.success() {
                Ok(())
            } else {
                // Fallback a SumatraPDF
                let sumatra_output = Command::new("SumatraPDF.exe")
                    .args(&["-print-to", printer_name, pdf_path])
                    .output()
                    .map_err(|e| format!("Error printing with SumatraPDF: {}", e))?;
                
                if sumatra_output.status.success() {
                    Ok(())
                } else {
                    Err("Failed to print PDF".to_string())
                }
            }
        }
        Err(_) => {
            // Fallback usando PowerShell
            print_with_powershell(pdf_path, Some(printer_name)).await
        }
    }
}

#[cfg(target_os = "windows")]
async fn print_to_default_printer(pdf_path: &str) -> Result<(), String> {
    print_with_powershell(pdf_path, None).await
}

#[cfg(target_os = "windows")]
async fn print_with_powershell(pdf_path: &str, printer_name: Option<&str>) -> Result<(), String> {
    let script = if let Some(printer) = printer_name {
        format!(r#"
            $pdf = New-Object -ComObject AcroExch.PDDoc
            $pdf.Open('{}')
            $pdf.PrintPages(0, $pdf.GetNumPages() - 1, 2, 1, 1, '{}')
            $pdf.Close()
        "#, pdf_path, printer)
    } else {
        format!(r#"
            $pdf = New-Object -ComObject AcroExch.PDDoc
            $pdf.Open('{}')
            $pdf.PrintPages(0, $pdf.GetNumPages() - 1, 2, 1, 1)
            $pdf.Close()
        "#, pdf_path)
    };
    
    let output = Command::new("powershell")
        .args(&["-Command", &script])
        .output()
        .map_err(|e| format!("Error executing PowerShell: {}", e))?;
    
    if output.status.success() {
        Ok(())
    } else {
        Err(format!("PowerShell print failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
async fn print_to_specific_printer(pdf_path: &str, printer_name: &str) -> Result<(), String> {
    let output = Command::new("lp")
        .args(&["-d", printer_name, pdf_path])
        .output()
        .map_err(|e| format!("Error executing lp: {}", e))?;
    
    if output.status.success() {
        Ok(())
    } else {
        Err(format!("Print failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
async fn print_to_default_printer(pdf_path: &str) -> Result<(), String> {
    let output = Command::new("lp")
        .args(&[pdf_path])
        .output()
        .map_err(|e| format!("Error executing lp: {}", e))?;
    
    if output.status.success() {
        Ok(())
    } else {
        Err(format!("Print failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

pub async fn print_thermal_receipt(content: &str, printer_name: Option<&str>) -> Result<(), String> {
    // Función específica para impresoras térmicas (POS)
    let esc_pos_commands = generate_esc_pos_commands(content);
    
    #[cfg(target_os = "windows")]
    {
        print_raw_to_windows_printer(&esc_pos_commands, printer_name).await
    }
    
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        print_raw_to_unix_printer(&esc_pos_commands, printer_name).await
    }
}

fn generate_esc_pos_commands(content: &str) -> Vec<u8> {
    let mut commands = Vec::new();
    
    // ESC/POS initialization
    commands.extend_from_slice(&[0x1B, 0x40]); // ESC @
    
    // Set character size
    commands.extend_from_slice(&[0x1D, 0x21, 0x00]); // GS ! 0
    
    // Print content
    commands.extend_from_slice(content.as_bytes());
    
    // Line feed
    commands.extend_from_slice(&[0x0A, 0x0A, 0x0A]);
    
    // Cut paper
    commands.extend_from_slice(&[0x1D, 0x56, 0x42, 0x00]); // GS V B 0
    
    commands
}

#[cfg(target_os = "windows")]
async fn print_raw_to_windows_printer(data: &[u8], printer_name: Option<&str>) -> Result<(), String> {
    // Implementar impresión raw en Windows usando WinAPI
    // Por simplicidad, usar un archivo temporal y copy con /b
    use std::fs;
    use std::env;
    use uuid::Uuid;

    let temp_id = Uuid::new_v4().to_string();
    let temp_path_buf = env::temp_dir().join(format!("raw_{}.prn", temp_id));
    let temp_path = temp_path_buf
        .to_str()
        .ok_or_else(|| "Ruta temporal raw invalida".to_string())?
        .to_string();
    
    fs::write(&temp_path, data)
        .map_err(|e| format!("Error writing temp file: {}", e))?;
    
    let printer = printer_name.unwrap_or("LPT1");
    let copy_command = format!("copy /b \"{}\" \"{}\"", temp_path, printer);
    let output = Command::new("cmd")
        .args(&["/C", &copy_command])
        .output()
        .map_err(|e| format!("Error copying to printer: {}", e))?;
    
    let _ = fs::remove_file(&temp_path);
    
    if output.status.success() {
        Ok(())
    } else {
        Err("Failed to print raw data".to_string())
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
async fn print_raw_to_unix_printer(data: &[u8], printer_name: Option<&str>) -> Result<(), String> {
    use std::fs;
    use uuid::Uuid;
    
    let temp_id = Uuid::new_v4().to_string();
    let temp_path = format!("/tmp/raw_{}.prn", temp_id);
    
    fs::write(&temp_path, data)
        .map_err(|e| format!("Error writing temp file: {}", e))?;
    
    let output = if let Some(printer) = printer_name {
        Command::new("lp")
            .args(&["-d", printer, "-o", "raw", &temp_path])
            .output()
    } else {
        Command::new("lp")
            .args(&["-o", "raw", &temp_path])
            .output()
    };
    
    let _ = fs::remove_file(&temp_path);
    
    match output {
        Ok(result) => {
            if result.status.success() {
                Ok(())
            } else {
                Err("Failed to print raw data".to_string())
            }
        }
        Err(e) => Err(format!("Error executing lp: {}", e))
    }
}
