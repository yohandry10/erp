# 🔍 Script PowerShell para verificar configuración de archivos de entorno
# Uso: PowerShell -ExecutionPolicy Bypass .\scripts\check-env.ps1

Write-Host "🔍 Verificando configuración de archivos de entorno..." -ForegroundColor Cyan
Write-Host ""

# Verificar que .gitignore incluye archivos .env
Write-Host "✅ Verificando .gitignore:" -ForegroundColor Green
if (Select-String -Path ".gitignore" -Pattern "\.env" -Quiet) {
    Write-Host "   ✓ .gitignore incluye archivos .env" -ForegroundColor Green
} else {
    Write-Host "   ❌ .gitignore NO incluye archivos .env" -ForegroundColor Red
    Write-Host "   Agregue las siguientes líneas a .gitignore:"
    Write-Host "   .env"
    Write-Host "   .env.local"
    Write-Host "   .env.*.local"
}

Write-Host ""

# Verificar que env.example existe
Write-Host "✅ Verificando archivo de ejemplo:" -ForegroundColor Green
if (Test-Path "env.example") {
    Write-Host "   ✓ env.example existe" -ForegroundColor Green
} else {
    Write-Host "   ❌ env.example NO existe" -ForegroundColor Red
    Write-Host "   Cree este archivo como plantilla"
}

Write-Host ""

# Verificar archivos .env en el directorio actual
Write-Host "🚨 Verificando archivos .env en el directorio:" -ForegroundColor Yellow
$envFiles = @(
    ".env",
    ".env.local",
    ".env.development.local",
    ".env.test.local",
    ".env.production.local"
)

$foundEnv = $false
foreach ($file in $envFiles) {
    if (Test-Path $file) {
        Write-Host "   📁 Encontrado: $file" -ForegroundColor Yellow
        $foundEnv = $true
    }
}

if (-not $foundEnv) {
    Write-Host "   ✓ No se encontraron archivos .env" -ForegroundColor Green
    Write-Host "   💡 Para comenzar: Copy-Item env.example .env.local" -ForegroundColor Cyan
}

Write-Host ""

# Verificar git status
Write-Host "🔄 Verificando estado de Git:" -ForegroundColor Cyan
try {
    $gitStatus = git status --porcelain 2>$null | Where-Object { $_ -match "\.env" }
    if (-not $gitStatus) {
        Write-Host "   ✓ No hay archivos .env pendientes de commit" -ForegroundColor Green
    } else {
        Write-Host "   ❌ ALERTA: Archivos .env detectados en git status:" -ForegroundColor Red
        $gitStatus | ForEach-Object { Write-Host "      $_" -ForegroundColor Red }
        Write-Host "   Ejecute: git rm --cached [archivo]" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️ No se pudo verificar git status (¿git instalado?)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Verificación completada" -ForegroundColor Green
Write-Host "💡 Recuerde: NUNCA haga commit de archivos .env con credenciales reales" -ForegroundColor Cyan 