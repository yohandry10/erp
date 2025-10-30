# Test script para GET /api/finanzas/cxp con filtros
# Asegúrate de tener un token válido y tenant_id

$baseUrl = "http://localhost:3000"
$token = "tu_token_aqui"
$tenantId = "tu_tenant_id_aqui"

Write-Host "=== TEST: Listar Cuentas por Pagar ===" -ForegroundColor Cyan

# Test 1: Listar todas las CxP
Write-Host "`n1. Listar todas las CxP (sin filtros)" -ForegroundColor Yellow
$response1 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }
Write-Host "Resultado:" -ForegroundColor Green
$response1 | ConvertTo-Json -Depth 5

# Test 2: Filtrar por estado PENDIENTE
Write-Host "`n2. Filtrar por estado PENDIENTE" -ForegroundColor Yellow
$response2 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }
Write-Host "Resultado:" -ForegroundColor Green
$response2 | ConvertTo-Json -Depth 5

# Test 3: Filtrar por rango de vencimiento
Write-Host "`n3. Filtrar por rango de vencimiento" -ForegroundColor Yellow
$fechaDesde = "2025-01-01"
$fechaHasta = "2025-12-31"
$response3 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?vencimiento_desde=$fechaDesde&vencimiento_hasta=$fechaHasta" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }
Write-Host "Resultado:" -ForegroundColor Green
$response3 | ConvertTo-Json -Depth 5

# Test 4: Filtrar por proveedor (reemplaza con un proveedor_id válido)
Write-Host "`n4. Filtrar por proveedor_id" -ForegroundColor Yellow
$proveedorId = "proveedor_id_aqui"
$response4 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?proveedor_id=$proveedorId" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }
Write-Host "Resultado:" -ForegroundColor Green
$response4 | ConvertTo-Json -Depth 5

# Test 5: Filtros combinados
Write-Host "`n5. Filtros combinados (estado + vencimiento)" -ForegroundColor Yellow
$response5 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE&vencimiento_desde=2025-01-01&vencimiento_hasta=2025-12-31" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }
Write-Host "Resultado:" -ForegroundColor Green
$response5 | ConvertTo-Json -Depth 5

Write-Host "`n=== TESTS COMPLETADOS ===" -ForegroundColor Cyan
