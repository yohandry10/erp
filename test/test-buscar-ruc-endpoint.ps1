# Test script for GET /api/compras/proveedores/buscar-ruc/:ruc endpoint

$baseUrl = "http://localhost:3002"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "Testing GET /api/compras/proveedores/buscar-ruc/:ruc endpoint" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test provider first
Write-Host "Step 1: Creating test provider with RUC 20123456789..." -ForegroundColor Yellow
$testProvider = @{
    tenant_id = $tenantId
    ruc = "20123456789"
    razon_social = "Test Provider S.A.C."
    nombre_comercial = "Test Provider"
    email = "test@provider.com"
    telefono = "987654321"
    direccion = "Av. Test 123"
    contacto = "Juan Perez"
    condiciones_pago = "CREDITO"
    limite_credito = 50000
    dias_credito = 30
} | ConvertTo-Json

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores" -Method Post -Body $testProvider -ContentType "application/json"
    Write-Host "Provider created successfully:" -ForegroundColor Green
    $createResponse | ConvertTo-Json -Depth 5
    Write-Host ""
} catch {
    Write-Host "Note: Provider might already exist (this is OK for testing)" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Search for existing RUC
Write-Host "Test 1: Searching for existing RUC 20123456789..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores/buscar-ruc/20123456789?tenant_id=$tenantId" -Method Get -ContentType "application/json"
    Write-Host "Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5

    if ($response.success -eq $true -and $response.data) {
        Write-Host "✓ Test 1 PASSED: Provider found successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Test 1 FAILED: Provider not found" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Test 1 FAILED: Error - $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Test 2: Search for non-existing RUC
Write-Host "Test 2: Searching for non-existing RUC 99999999999..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores/buscar-ruc/99999999999?tenant_id=$tenantId" -Method Get -ContentType "application/json"
    Write-Host "Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5

    if ($response.success -eq $false -and $response.data -eq $null) {
        Write-Host "✓ Test 2 PASSED: Correctly returned not found" -ForegroundColor Green
    } else {
        Write-Host "✗ Test 2 FAILED: Should return not found" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Test 2 FAILED: Error - $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Test 3: Search with different tenant (should not find)
Write-Host "Test 3: Searching with different tenant_id (should not find)..." -ForegroundColor Yellow
$differentTenant = "00000000-0000-0000-0000-000000000000"
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores/buscar-ruc/20123456789?tenant_id=$differentTenant" -Method Get -ContentType "application/json"
    Write-Host "Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5

    if ($response.success -eq $false -and $response.data -eq $null) {
        Write-Host "✓ Test 3 PASSED: Correctly isolated by tenant" -ForegroundColor Green
    } else {
        Write-Host "✗ Test 3 FAILED: Should not find provider from different tenant" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Test 3 FAILED: Error - $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Tests completed!" -ForegroundColor Green
