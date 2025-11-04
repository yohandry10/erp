# Script para verificar la codificación de archivos TypeScript
# Detecta archivos con UTF-16 o UTF-8 con BOM que pueden causar problemas

Write-Host "🔍 Verificando codificación de archivos TypeScript..." -ForegroundColor Cyan
Write-Host ""

$problematicFiles = @()
$totalFiles = 0

# Buscar archivos .ts y .tsx en apps/erp-api/src
Get-ChildItem -Path "apps\erp-api\src" -Filter "*.ts" -Recurse | ForEach-Object {
    $totalFiles++
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    
    if ($bytes.Length -ge 2) {
        # Verificar UTF-16 LE BOM (FF FE)
        if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
            Write-Host "❌ UTF-16 LE detectado: $($_.FullName)" -ForegroundColor Red
            $problematicFiles += @{
                Path = $_.FullName
                Issue = "UTF-16 LE"
            }
        }
        # Verificar UTF-16 BE BOM (FE FF)
        elseif ($bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
            Write-Host "❌ UTF-16 BE detectado: $($_.FullName)" -ForegroundColor Red
            $problematicFiles += @{
                Path = $_.FullName
                Issue = "UTF-16 BE"
            }
        }
        # Verificar UTF-8 con BOM (EF BB BF)
        elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            Write-Host "⚠️  UTF-8 con BOM detectado: $($_.FullName)" -ForegroundColor Yellow
            $problematicFiles += @{
                Path = $_.FullName
                Issue = "UTF-8 con BOM"
            }
        }
    }
}

Write-Host ""
Write-Host "📊 Resumen:" -ForegroundColor Cyan
Write-Host "   Total de archivos verificados: $totalFiles"
Write-Host "   Archivos con problemas: $($problematicFiles.Count)"

if ($problematicFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "🔧 Para corregir automáticamente, ejecuta:" -ForegroundColor Yellow
    Write-Host "   .\scripts\fix-encoding.ps1"
    exit 1
} else {
    Write-Host ""
    Write-Host "✅ Todos los archivos tienen codificación correcta (UTF-8 sin BOM)" -ForegroundColor Green
    exit 0
}
