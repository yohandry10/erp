# Test script for GET /api/compras/proveedores endpoint
# This script tests various filter combinations

$baseUrl = "http://localhost:3000/api/compras/proveedores"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "Testing GET /api/compras/proveedores endpoint..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Get all proveedores
Write-Host "Test 1: Get all proveedores" -ForegroundColor Yellow
$response1 = Invoke-RestMethod -Uri "$baseUrl?tenant_id=$tenantId" -Method Get
Write-Host "Response: $($response1 | ConvertTo-Json -Depth 3)" -ForegroundColor Green
Write-Host ""

# Test 2: Filter by activo=true
Write-Host "Test 2: Filter by activo=true" -ForegroundColor Yellow
$response2 = Invoke-RestMethod -Uri "$baseUrl?tenant_id=$tenantId&activo=true" -Method Get
Write-Host "Response: $($response2 | ConvertTo-Json -Depth 3)" -ForegroundColor Green
Write-Host ""

# Test 3: Search by text
Write-Host "Test 3: Search by text" -ForegroundColor Yellow
$response3 = Invoke-RestMethod -Uri "$baseUrl?tenant_id=$tenantId&search=ABC" -Method Get
Write-Host "Response: $($response3 | ConvertTo-Json -Depth 3)" -ForegroundColor Green
Write-Host ""

# Test 4: Filter by estado
Write-Host "Test 4: Filter by estado=ACTIVO" -ForegroundColor Yellow
$response4 = Invoke-RestMethod -Uri "$baseUrl?tenant_id=$tenantId&estado=ACTIVO" -Method Get
Write-Host "Response: $($response4 | ConvertTo-Json -Depth 3)" -ForegroundColor Green
Write-Host ""

# Test 5: Filter by condiciones_pago
Write-Host "Test 5: Filter by condiciones_pago=CONTADO" -ForegroundColor Yellow
$response5 = Invoke-RestMethod -Uri "$baseUrl?tenant_id=$tenantId&condiciones_pago=CONTADO" -Method Get
Write-Host "Response: $($response5 | ConvertTo-Json -Depth 3)" -ForegroundColor Green
Write-Host ""

# Test 6: Pagination with limit and offset
Write-Host "Test 6: Pagination (limit=5, offset=0)" -ForegroundColor Yellow
$response6 = Invoke-RestMethod -Uri "$baseUrl?tenant_id=$tenantId&limit=5&offset=0" -Method Get
Write-Host "Response: $($response6 | ConvertTo-Json -Depth 3)" -ForegroundColor Green
Write-Host ""

# Test 7: Combined filters
Write-Host "Test 7: Combined filters (activo=true, estado=ACTIVO, limit=10)" -ForegroundColor Yellow
$response7 = Invoke-RestMethod -Uri "$baseUrl?tenant_id=$tenantId&activo=true&estado=ACTIVO&limit=10" -Method Get
Write-Host "Response: $($response7 | ConvertTo-Json -Depth 3)" -ForegroundColor Green
Write-Host ""

Write-Host "All tests completed!" -ForegroundColor Cyan
