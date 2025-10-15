# =============================================
# Script de instalación del Módulo de Documentos
# Fecha: 2025-10-15
# =============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "INSTALACION DEL MODULO DE DOCUMENTOS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuración de la base de datos
$DB_USER = "postgres"
$DB_NAME = "postgres"
$DB_HOST = "localhost"
$DB_PORT = "5432"

Write-Host "Configuracion:" -ForegroundColor Yellow
Write-Host "- Usuario: $DB_USER"
Write-Host "- Base de datos: $DB_NAME"
Write-Host "- Host: $DB_HOST"
Write-Host "- Puerto: $DB_PORT"
Write-Host ""

# Solicitar confirmación
$confirm = Read-Host "Deseas continuar con la instalacion? (S/N)"
if ($confirm -ne "S" -and $confirm -ne "s") {
    Write-Host "Instalacion cancelada." -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PASO 1: LIMPIEZA DE TABLAS EXISTENTES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$env:PGPASSWORD = ""
& psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -f "supabase\migrations\20251015_cleanup_documentos.sql"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ADVERTENCIA: Fallo en la limpieza de tablas" -ForegroundColor Yellow
    Write-Host "Continuando con la instalacion..." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PASO 2: CREACION DEL MODULO COMPLETO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

& psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -f "supabase\migrations\20251015_create_documentos_module_complete.sql"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Fallo en la creacion del modulo" -ForegroundColor Red
    Write-Host "Por favor revisa los errores anteriores" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PASO 3: VERIFICACION DE LA INSTALACION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

& psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -f "supabase\migrations\20251015_verify_documentos.sql"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Fallo en la verificacion" -ForegroundColor Red
    Write-Host "El modulo puede no estar completamente instalado" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "INSTALACION COMPLETADA EXITOSAMENTE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "El modulo de documentos ha sido instalado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Proximos pasos:" -ForegroundColor Yellow
Write-Host "1. Configurar la facturacion electronica en fe_configuracion"
Write-Host "2. Crear series de documentos en documento_series"
Write-Host "3. Integrar con el modulo de clientes"
Write-Host ""

Read-Host "Presiona Enter para salir"
