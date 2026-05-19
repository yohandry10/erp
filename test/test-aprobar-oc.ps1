#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Test script for "Aprobar OC" E2E test
.DESCRIPTION
    Runs the Playwright E2E test for approving a purchase order (Orden de Compra)
#>

Write-Host "🧪 Running E2E Test: Aprobar OC" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if Playwright is installed
Write-Host "📦 Checking Playwright installation..." -ForegroundColor Yellow
$playwrightInstalled = Test-Path "apps/web/node_modules/@playwright/test"

if (-not $playwrightInstalled) {
    Write-Host "❌ Playwright not found. Installing..." -ForegroundColor Red
    Set-Location apps/web
    pnpm install
    pnpm exec playwright install
    Set-Location ../..
}

Write-Host "✅ Playwright is installed" -ForegroundColor Green
Write-Host ""

# Set environment variables for test
Write-Host "🔧 Setting up test environment..." -ForegroundColor Yellow
$env:TEST_USER_EMAIL = "admin@test.com"
$env:TEST_USER_PASSWORD = "password123"

Write-Host "✅ Environment configured" -ForegroundColor Green
Write-Host ""

# Run the specific test
Write-Host "🚀 Running 'Aprobar OC' test..." -ForegroundColor Cyan
Write-Host ""

Set-Location apps/web

# Run only the "Aprobar OC" test
pnpm exec playwright test --grep "Aprobar OC" --project=chromium

$exitCode = $LASTEXITCODE

Set-Location ../..

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "✅ Test completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📸 Screenshots saved in:" -ForegroundColor Cyan
    Write-Host "   - apps/web/tests/screenshots/oc-detail-before-approval.png" -ForegroundColor Gray
    Write-Host "   - apps/web/tests/screenshots/oc-approval-modal.png" -ForegroundColor Gray
    Write-Host "   - apps/web/tests/screenshots/oc-approval-modal-filled.png" -ForegroundColor Gray
    Write-Host "   - apps/web/tests/screenshots/oc-approved.png" -ForegroundColor Gray
    Write-Host "   - apps/web/tests/screenshots/oc-approvals-panel.png" -ForegroundColor Gray
} else {
    Write-Host "❌ Test failed with exit code: $exitCode" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "   1. Make sure the development server is running (pnpm dev)" -ForegroundColor Gray
    Write-Host "   2. Check that test user credentials are correct" -ForegroundColor Gray
    Write-Host "   3. Verify database has proveedores and productos" -ForegroundColor Gray
    Write-Host "   4. Check browser console for errors" -ForegroundColor Gray
}

Write-Host ""
exit $exitCode
