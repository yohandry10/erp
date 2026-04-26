# Test script for Aging CxC Report endpoint
# GET /api/ventas/reportes/cxc-aging

$baseUrl = "http://localhost:3001/api"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = "vierdes"
    "Content-Type" = "application/json"
}

Write-Host "=== TEST: Aging CxC Report ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Get Aging CxC without filters
Write-Host "Test 1: Get Aging CxC (sin filtros)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/ventas/reportes/cxc-aging" -Method Get -Headers $headers
    Write-Host "✅ Success" -ForegroundColor Green
    Write-Host "Resumen:" -ForegroundColor White
    Write-Host "  - Total Pendiente: $($response.data.resumen.totalPendiente)" -ForegroundColor White
    Write-Host "  - Total Vencido: $($response.data.resumen.totalVencido)" -ForegroundColor White
    Write-Host "  - % Vencido: $($response.data.resumen.porcentajeVencido)%" -ForegroundColor White
    Write-Host "  - Cuentas Analizadas: $($response.data.resumen.cuentasAnalizadas)" -ForegroundColor White
    Write-Host ""
    Write-Host "Buckets:" -ForegroundColor White
    foreach ($bucket in $response.data.buckets) {
        Write-Host "  - $($bucket.nombre) ($($bucket.rango)): $($bucket.monto) ($($bucket.porcentaje)%)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test completado ===" -ForegroundColor Cyan
