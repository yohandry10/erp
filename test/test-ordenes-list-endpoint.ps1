# Test script for GET /api/compras/ordenes endpoint with filters
$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== Testing GET /api/compras/ordenes endpoint ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Get all orders without filters
Write-Host "Test 1: Get all orders (no filters)" -ForegroundColor Yellow
$response1 = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes?tenant_id=$tenantId" -Method Get -ContentType "application/json"
Write-Host "Response:" -ForegroundColor Green
$response1 | ConvertTo-Json -Depth 5
Write-Host ""

# Test 2: Filter by estado
Write-Host "Test 2: Filter by estado=BORRADOR" -ForegroundColor Yellow
$response2 = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes?tenant_id=$tenantId&estado=BORRADOR" -Method Get -ContentType "application/json"
Write-Host "Response:" -ForegroundColor Green
$response2 | ConvertTo-Json -Depth 5
Write-Host ""

# Test 3: Filter by proveedor_id (use an existing proveedor_id from previous tests)
Write-Host "Test 3: Filter by proveedor_id" -ForegroundColor Yellow
if ($response1.data -and $response1.data.Count -gt 0) {
    $proveedorId = $response1.data[0].proveedor_id
    Write-Host "Using proveedor_id: $proveedorId" -ForegroundColor Gray
    $response3 = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes?tenant_id=$tenantId&proveedor_id=$proveedorId" -Method Get -ContentType "application/json"
    Write-Host "Response:" -ForegroundColor Green
    $response3 | ConvertTo-Json -Depth 5
} else {
    Write-Host "No orders found to test proveedor filter" -ForegroundColor Red
}
Write-Host ""

# Test 4: Filter by date range
Write-Host "Test 4: Filter by date range (last 30 days)" -ForegroundColor Yellow
$fechaDesde = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
$fechaHasta = (Get-Date).ToString("yyyy-MM-dd")
Write-Host "Date range: $fechaDesde to $fechaHasta" -ForegroundColor Gray
$response4 = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes?tenant_id=$tenantId&fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta" -Method Get -ContentType "application/json"
Write-Host "Response:" -ForegroundColor Green
$response4 | ConvertTo-Json -Depth 5
Write-Host ""

# Test 5: Pagination with limit and offset
Write-Host "Test 5: Pagination (limit=2, offset=0)" -ForegroundColor Yellow
$response5 = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes?tenant_id=$tenantId&limit=2&offset=0" -Method Get -ContentType "application/json"
Write-Host "Response:" -ForegroundColor Green
$response5 | ConvertTo-Json -Depth 5
Write-Host ""

# Test 6: Combined filters
Write-Host "Test 6: Combined filters (estado + date range)" -ForegroundColor Yellow
$response6 = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes?tenant_id=$tenantId&estado=BORRADOR&fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta&limit=5" -Method Get -ContentType "application/json"
Write-Host "Response:" -ForegroundColor Green
$response6 | ConvertTo-Json -Depth 5
Write-Host ""

Write-Host "=== All tests completed ===" -ForegroundColor Cyan
