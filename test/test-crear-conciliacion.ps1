# Test script for POST /api/finanzas/conciliacion endpoint

$baseUrl = "http://localhost:3002"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== Test: Crear Conciliación Bancaria ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get a cuenta bancaria ID
Write-Host "1. Getting cuenta bancaria..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

try {
    $cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/api/api/finanzas/bancos/cuentas" -Method GET -Headers $headers

    if ($cuentasResponse.data.Count -eq 0) {
        Write-Host "✗ No hay cuentas bancarias disponibles. Crea una primero." -ForegroundColor Red
        exit 1
    }

    $cuentaId = $cuentasResponse.data[0].id
    $cuentaNombre = $cuentasResponse.data[0].nombre
    Write-Host "✓ Cuenta bancaria encontrada: $cuentaNombre (ID: $cuentaId)" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "✗ Error obteniendo cuentas: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Create conciliacion
Write-Host "2. Creating conciliación..." -ForegroundColor Yellow

$conciliacionBody = @{
    cuenta_bancaria_id = $cuentaId
    periodo = "2025-10"
    fecha_desde = "2025-10-01"
    fecha_hasta = "2025-10-31"
} | ConvertTo-Json

Write-Host "Request body:" -ForegroundColor Gray
Write-Host $conciliacionBody -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/api/finanzas/conciliacion" -Method POST -Headers $headers -Body $conciliacionBody

    Write-Host "✓ Conciliación creada exitosamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor White

} catch {
    Write-Host "✗ Error creando conciliación:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        Write-Host ""
        Write-Host "Error details:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor White
    }
    exit 1
}

Write-Host ""
Write-Host "=== Test completed successfully ===" -ForegroundColor Green
