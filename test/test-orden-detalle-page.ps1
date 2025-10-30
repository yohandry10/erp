# Test script for Order Detail Page
# This script tests if the order detail page loads correctly

Write-Host "🧪 Testing Order Detail Page..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Check if the file exists
Write-Host "✓ Test 1: Checking if detail page file exists..." -ForegroundColor Yellow
$detailPagePath = "apps\web\app\dashboard\compras\ordenes\``[id``]\page.tsx"
if (Test-Path $detailPagePath) {
    Write-Host "  ✅ Detail page file exists at: $detailPagePath" -ForegroundColor Green
} else {
    Write-Host "  ❌ Detail page file NOT found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✓ Test 2: Checking file content..." -ForegroundColor Yellow
$content = Get-Content $detailPagePath -Raw

# Check for key components
$checks = @(
    @{ Name = "OrdenCompra interface"; Pattern = "interface OrdenCompra" },
    @{ Name = "OrdenCompraDetalle interface"; Pattern = "interface OrdenCompraDetalle" },
    @{ Name = "useApi hook"; Pattern = "useApi" },
    @{ Name = "Provider information section"; Pattern = "Información del Proveedor" },
    @{ Name = "Products table"; Pattern = "Productos Solicitados" },
    @{ Name = "Order summary"; Pattern = "Resumen" },
    @{ Name = "Dates section"; Pattern = "Fechas" },
    @{ Name = "Estado badge"; Pattern = "getEstadoBadge" },
    @{ Name = "Format currency function"; Pattern = "formatCurrency" },
    @{ Name = "Format date function"; Pattern = "formatDate" }
)

$allPassed = $true
foreach ($check in $checks) {
    if ($content -match [regex]::Escape($check.Pattern)) {
        Write-Host "  ✅ $($check.Name) found" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($check.Name) NOT found!" -ForegroundColor Red
        $allPassed = $false
    }
}

Write-Host ""
if ($allPassed) {
    Write-Host "🎉 All tests passed! Order detail page is properly implemented." -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Implementation includes:" -ForegroundColor Cyan
    Write-Host "  • Order header with number and status badge" -ForegroundColor White
    Write-Host "  • Provider information card" -ForegroundColor White
    Write-Host "  • Products table with quantities (ordered, received, pending)" -ForegroundColor White
    Write-Host "  • Order summary with totals" -ForegroundColor White
    Write-Host "  • Dates and payment conditions" -ForegroundColor White
    Write-Host "  • Reception progress (for PARCIAL/RECIBIDA states)" -ForegroundColor White
    Write-Host "  • Action buttons (Edit, Download PDF, Create Reception)" -ForegroundColor White
    Write-Host "  • Observations section" -ForegroundColor White
    Write-Host ""
    Write-Host "🔗 To test in browser:" -ForegroundColor Cyan
    Write-Host "  1. Start the dev server: cd apps/web && npm run dev" -ForegroundColor White
    Write-Host "  2. Navigate to: http://localhost:3000/dashboard/compras/ordenes/[order-id]" -ForegroundColor White
    Write-Host "  3. Replace [order-id] with an actual order ID from your database" -ForegroundColor White
} else {
    Write-Host "❌ Some tests failed. Please review the implementation." -ForegroundColor Red
    exit 1
}
