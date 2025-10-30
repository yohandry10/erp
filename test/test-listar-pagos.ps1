# Test GET /api/finanzas/tesoreria/pagos
# Prueba el endpoint de listar pagos a proveedores

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5YzQzMzk1Yy1hMzI3LTQ3YzAtYjU5Yy1lNzI5YzI5YzI5YzIiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiaWF0IjoxNzI5ODY2MDAwfQ.test-signature"
$tenantId = "550e8400-e29b-41d4-a716-446655440001"

Write-Host "=== TEST: GET /api/finanzas/tesoreria/pagos ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Listar todos los pagos (sin filtros)
Write-Host "Test 1: Listar todos los pagos" -ForegroundColor Yellow
$response1 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/pagos" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }

Write-Host "Response:" -ForegroundColor Green
$response1 | ConvertTo-Json -Depth 10
Write-Host ""

# Test 2: Listar pagos con filtro de fecha
Write-Host "Test 2: Listar pagos con filtro de fecha (últimos 30 días)" -ForegroundColor Yellow
$fechaDesde = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
$fechaHasta = (Get-Date).ToString("yyyy-MM-dd")

$response2 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/pagos?fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }

Write-Host "Response:" -ForegroundColor Green
$response2 | ConvertTo-Json -Depth 10
Write-Host ""

# Test 3: Listar pagos con filtro de método de pago
Write-Host "Test 3: Listar pagos con método TRANSFERENCIA" -ForegroundColor Yellow
$response3 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/pagos?metodo_pago=TRANSFERENCIA" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }

Write-Host "Response:" -ForegroundColor Green
$response3 | ConvertTo-Json -Depth 10
Write-Host ""

# Test 4: Listar pagos no conciliados
Write-Host "Test 4: Listar pagos no conciliados" -ForegroundColor Yellow
$response4 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/pagos?conciliado=false" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }

Write-Host "Response:" -ForegroundColor Green
$response4 | ConvertTo-Json -Depth 10
Write-Host ""

# Test 5: Listar pagos con paginación
Write-Host "Test 5: Listar pagos con paginación (página 1, límite 10)" -ForegroundColor Yellow
$response5 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/pagos?page=1&limit=10" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }

Write-Host "Response:" -ForegroundColor Green
$response5 | ConvertTo-Json -Depth 10
Write-Host ""

# Test 6: Listar pagos con múltiples filtros
if ($response1.data.Count -gt 0) {
    $primerPago = $response1.data[0]
    
    if ($primerPago.proveedor -and $primerPago.proveedor.id) {
        Write-Host "Test 6: Listar pagos con filtro de proveedor" -ForegroundColor Yellow
        $proveedorId = $primerPago.proveedor.id
        
        $response6 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/pagos?proveedor_id=$proveedorId" `
            -Method GET `
            -Headers @{
                "Authorization" = "Bearer $token"
                "x-tenant-id" = $tenantId
                "Content-Type" = "application/json"
            }
        
        Write-Host "Response:" -ForegroundColor Green
        $response6 | ConvertTo-Json -Depth 10
        Write-Host ""
    }
    
    if ($primerPago.cuenta_bancaria -and $primerPago.cuenta_bancaria.id) {
        Write-Host "Test 7: Listar pagos con filtro de cuenta bancaria" -ForegroundColor Yellow
        $cuentaId = $primerPago.cuenta_bancaria.id
        
        $response7 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/pagos?cuenta_bancaria_id=$cuentaId" `
            -Method GET `
            -Headers @{
                "Authorization" = "Bearer $token"
                "x-tenant-id" = $tenantId
                "Content-Type" = "application/json"
            }
        
        Write-Host "Response:" -ForegroundColor Green
        $response7 | ConvertTo-Json -Depth 10
        Write-Host ""
    }
}

Write-Host "=== TESTS COMPLETADOS ===" -ForegroundColor Cyan
