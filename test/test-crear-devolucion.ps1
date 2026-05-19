# Test script for "Crear devolución" E2E test
# This script runs the Playwright test for creating a devolución (return to supplier)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test: Crear Devolución E2E" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to web app directory
Set-Location apps/web

Write-Host "Running Playwright test for 'Crear devolución'..." -ForegroundColor Yellow
Write-Host ""

# Run the specific test
npx playwright test compras.spec.ts -g "Crear devolución" --headed

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test completed!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Screenshots saved in:" -ForegroundColor Green
Write-Host "  - tests/screenshots/devoluciones-list.png" -ForegroundColor Gray
Write-Host "  - tests/screenshots/devolucion-step1-initial.png" -ForegroundColor Gray
Write-Host "  - tests/screenshots/devolucion-step2-initial.png" -ForegroundColor Gray
Write-Host "  - tests/screenshots/devolucion-step2-filled.png" -ForegroundColor Gray
Write-Host "  - tests/screenshots/devolucion-created.png" -ForegroundColor Gray
Write-Host ""

# Return to root directory
Set-Location ../..
