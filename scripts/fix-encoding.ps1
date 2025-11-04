# Script para corregir la codificación de archivos TypeScript
# Convierte archivos UTF-16 o UTF-8 con BOM a UTF-8 sin BOM

Write-Host "🔧 Corrigiendo codificación de archivos TypeScript..." -ForegroundColor Cyan
Write-Host ""

$fixedFiles = 0
$totalFiles = 0

# Buscar archivos .ts y .tsx en apps/erp-api/src
Get-ChildItem -Path "apps\erp-api\src" -Filter "*.ts" -Recurse | ForEach-Object {
    $totalFiles++
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $needsFix = $false
    $encoding = "UTF-8 sin BOM"
    
    if ($bytes.Length -ge 2) {
        # Verificar UTF-16 LE BOM (FF FE)
        if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
            $needsFix = $true
            $encoding = "UTF-16 LE"
        }
        # Verificar UTF-16 BE BOM (FE FF)
        elseif ($bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
            $needsFix = $true
            $encoding = "UTF-16 BE"
        }
        # Verificar UTF-8 con BOM (EF BB BF)
        elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            $needsFix = $true
            $encoding = "UTF-8 con BOM"
        }
    }
    
    if ($needsFix) {
        try {
            # Leer contenido con la codificación detectada
            if ($encoding -like "UTF-16*") {
                $content = Get-Content $_.FullName -Raw -Encoding Unicode
            } else {
                $content = Get-Content $_.FullName -Raw -Encoding UTF8
            }
            
            # Escribir como UTF-8 sin BOM
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($_.FullName, $content, $utf8NoBom)
            
            Write-Host "✅ Corregido: $($_.Name) ($encoding → UTF-8 sin BOM)" -ForegroundColor Green
            $fixedFiles++
        } catch {
            Write-Host "❌ Error corrigiendo: $($_.Name) - $_" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "📊 Resumen:" -ForegroundColor Cyan
Write-Host "   Total de archivos verificados: $totalFiles"
Write-Host "   Archivos corregidos: $fixedFiles"

if ($fixedFiles -gt 0) {
    Write-Host ""
    Write-Host "✅ Codificación corregida exitosamente" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ℹ️  No se encontraron archivos que necesiten corrección" -ForegroundColor Blue
}
