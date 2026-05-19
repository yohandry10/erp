# Test script for GET /api/compras/devoluciones endpoint
# Tests listing devoluciones with various filters

$baseUrl = "http://localhost:3002"
$tenantId = "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: GET /api/compras/devoluciones" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Get all devoluciones (no filters)
Write-Host "Test 1: Get all devoluciones (no filters)" -ForegroundColor Yellow
Write-Host "GET $baseUrl/api/compras/devoluciones?tenant_id=$tenantId" -ForegroundColor Gray
Write-Host ""

$headers = @{
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones?tenant_id=$tenantId" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "✅ SUCCESS - Status: 200 OK" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor White
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
    Write-Host "Total devoluciones: $($response.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 2: Filter by estado=PENDIENTE
Write-Host "Test 2: Filter by estado=PENDIENTE" -ForegroundColor Yellow
Write-Host "GET $baseUrl/api/compras/devoluciones?tenant_id=$tenantId&estado=PENDIENTE" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones?tenant_id=$tenantId&estado=PENDIENTE" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "✅ SUCCESS - Status: 200 OK" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor White
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
    Write-Host "Devoluciones PENDIENTE: $($response.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 3: Filter by estado=EMITIDA
Write-Host "Test 3: Filter by estado=EMITIDA" -ForegroundColor Yellow
Write-Host "GET $baseUrl/api/compras/devoluciones?tenant_id=$tenantId&estado=EMITIDA" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones?tenant_id=$tenantId&estado=EMITIDA" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "✅ SUCCESS - Status: 200 OK" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor White
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
    Write-Host "Devoluciones EMITIDA: $($response.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 4: Filter by date range
$fechaDesde = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
$fechaHasta = (Get-Date).ToString("yyyy-MM-dd")

Write-Host "Test 4: Filter by date range (last 30 days)" -ForegroundColor Yellow
Write-Host "GET $baseUrl/api/compras/devoluciones?tenant_id=$tenantId&fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones?tenant_id=$tenantId&fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "✅ SUCCESS - Status: 200 OK" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor White
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
    Write-Host "Devoluciones (last 30 days): $($response.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST COMPLETED" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
