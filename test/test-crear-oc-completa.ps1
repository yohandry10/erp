# Script para probar la creación completa de una orden de compra (E2E Test)
# Este script ejecuta el test de Playwright para crear una OC completa

Write-Host "🧪 Ejecutando test E2E: Crear OC completa" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Cambiar al directorio de la aplicación web
Set-Location apps\web

Write-Host "📋 Ejecutando test de Playwright..." -ForegroundColor Yellow
Write-Host ""

# Ejecutar el test específico
pnpm test:e2e --grep "Crear OC completa"

Write-Host ""
Write-Host "✅ Test completado" -ForegroundColor Green
Write-Host ""
Write-Host "📸 Screenshots guardados en: apps\web\tests\screenshots\" -ForegroundColor Cyan
Write-Host "   - oc-step1-filled.png" -ForegroundColor Gray
Write-Host "   - oc-step2-products.png" -ForegroundColor Gray
Write-Host "   - oc-step3-review.png" -ForegroundColor Gray
Write-Host "   - oc-created.png" -ForegroundColor Gray
Write-Host ""
Write-Host "📊 Reporte HTML disponible en: apps\web\playwright-report\" -ForegroundColor Cyan
Write-Host ""

# Volver al directorio raíz
Set-Location ..\..
