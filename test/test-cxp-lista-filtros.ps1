# Test script for CxP List with Filters
# This script tests the GET /api/finanzas/cxp endpoint with various filters

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "=== TEST 1: Get all CxP ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" -Method Get -Headers $headers
    Write-Host "✓ Success: Retrieved $($response.data.Count) cuentas por pagar" -ForegroundColor Green
    if ($response.data.Count -gt 0) {
        $cuenta = $response.data[0]
        Write-Host "  Sample: $($cuenta.numero_documento) - $($cuenta.proveedores.razon_social) - Estado: $($cuenta.estado)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST 2: Filter by estado=PENDIENTE ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE" -Method Get -Headers $headers
    Write-Host "✓ Success: Retrieved $($response.data.Count) cuentas PENDIENTES" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST 3: Filter by estado=VENCIDA ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=VENCIDA" -Method Get -Headers $headers
    Write-Host "✓ Success: Retrieved $($response.data.Count) cuentas VENCIDAS" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST 4: Filter by vencimiento date range ===" -ForegroundColor Cyan
try {
    $desde = "2025-01-01"
    $hasta = "2025-12-31"
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?vencimiento_desde=$desde&vencimiento_hasta=$hasta" -Method Get -Headers $headers
    Write-Host "✓ Success: Retrieved $($response.data.Count) cuentas with vencimiento between $desde and $hasta" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST 5: Filter by proveedor_id ===" -ForegroundColor Cyan
try {
    # First get a proveedor
    $proveedoresResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores?activo=true" -Method Get -Headers $headers
    if ($proveedoresResponse.data.Count -gt 0) {
        $proveedorId = $proveedoresResponse.data[0].id
        $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?proveedor_id=$proveedorId" -Method Get -Headers $headers
        Write-Host "✓ Success: Retrieved $($response.data.Count) cuentas for proveedor $proveedorId" -ForegroundColor Green
    } else {
        Write-Host "⚠ Warning: No proveedores found to test filter" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST 6: Combined filters ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE&vencimiento_desde=2025-01-01" -Method Get -Headers $headers
    Write-Host "✓ Success: Retrieved $($response.data.Count) cuentas PENDIENTES venciendo desde 2025-01-01" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "All filter tests completed. Check the results above." -ForegroundColor White
Write-Host "Frontend page available at: http://localhost:3000/dashboard/finanzas/cxp" -ForegroundColor Yellow
