#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Test E2E para recepcionar mercancía en el módulo de compras
.DESCRIPTION
    Este script ejecuta el test de Playwright para el flujo completo de recepción de mercancía:
    1. Buscar o crear una orden de compra aprobada
    2. Navegar al wizard de recepción
    3. Completar los 4 pasos del wizard
    4. Verificar que la recepción se creó correctamente
#>

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test E2E: Recepcionar Mercancía" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "apps/web/tests/e2e/compras.spec.ts")) {
    Write-Host "❌ Error: No se encuentra el archivo de tests" -ForegroundColor Red
    Write-Host "   Asegúrate de ejecutar este script desde la raíz del proyecto" -ForegroundColor Yellow
    exit 1
}

Write-Host "📋 Preparando test de recepción de mercancía..." -ForegroundColor Yellow
Write-Host ""

# Navegar al directorio de web
Set-Location apps/web

Write-Host "🧪 Ejecutando test de Playwright..." -ForegroundColor Cyan
Write-Host ""

# Ejecutar el test específico
pnpm exec playwright test --grep "Recepcionar mercancía" --project=chromium

$exitCode = $LASTEXITCODE

# Volver al directorio raíz
Set-Location ../..

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($exitCode -eq 0) {
    Write-Host "✅ Test completado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "📸 Screenshots generados:" -ForegroundColor Cyan
    Write-Host "   - recepcion-orden-aprobada.png" -ForegroundColor Gray
    Write-Host "   - recepcion-wizard-step1.png" -ForegroundColor Gray
    Write-Host "   - recepcion-wizard-step2-initial.png" -ForegroundColor Gray
    Write-Host "   - recepcion-wizard-step2-filled.png" -ForegroundColor Gray
    Write-Host "   - recepcion-wizard-step3-initial.png" -ForegroundColor Gray
    Write-Host "   - recepcion-wizard-step3-filled.png" -ForegroundColor Gray
    Write-Host "   - recepcion-wizard-step4-review.png" -ForegroundColor Gray
    Write-Host "   - recepcion-created.png" -ForegroundColor Gray
    Write-Host ""
    Write-Host "📁 Ubicación: apps/web/tests/screenshots/" -ForegroundColor Cyan
} else {
    Write-Host "❌ Test falló con código de salida: $exitCode" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Sugerencias:" -ForegroundColor Yellow
    Write-Host "   1. Verifica que el servidor de desarrollo esté corriendo" -ForegroundColor Gray
    Write-Host "   2. Verifica que existan proveedores y productos en la BD" -ForegroundColor Gray
    Write-Host "   3. Verifica que existan almacenes configurados" -ForegroundColor Gray
    Write-Host "   4. Revisa los logs de Playwright para más detalles" -ForegroundColor Gray
}

Write-Host "========================================" -ForegroundColor Cyan

exit $exitCode
