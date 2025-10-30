# Script para aplicar migración 038
Write-Host "=== Aplicando Migración 038: Agregar CxC y Cliente a movimientos_bancarios ===" -ForegroundColor Cyan
Write-Host ""

$migrationFile = "supabase/migrations/038_add_cxc_cliente_movimientos_bancarios.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Error: No se encontró el archivo de migración: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "Ejecutando migración..." -ForegroundColor Yellow
npx tsx scripts/apply-migration-038.ts

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Migración aplicada exitosamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Columnas agregadas a movimientos_bancarios:" -ForegroundColor Cyan
    Write-Host "  - cliente_id (UUID) - Cliente relacionado para cobros"
    Write-Host "  - cxc_id (UUID) - Cuenta por cobrar relacionada"
    Write-Host ""
    Write-Host "Índices creados:" -ForegroundColor Cyan
    Write-Host "  - idx_movimientos_bancarios_cliente"
    Write-Host "  - idx_movimientos_bancarios_cxc"
} else {
    Write-Host ""
    Write-Host "❌ Error aplicando la migración" -ForegroundColor Red
    exit 1
}
