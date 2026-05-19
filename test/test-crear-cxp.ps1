# Test script para crear cuenta por pagar manual
# Endpoint: POST /api/finanzas/cxp

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "🧪 Test: Crear Cuenta por Pagar Manual" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Primero, obtener un proveedor existente
Write-Host "`n📋 Obteniendo proveedores..." -ForegroundColor Yellow
$proveedoresResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores?limit=1" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }

if ($proveedoresResponse.data -and $proveedoresResponse.data.Count -gt 0) {
    $proveedorId = $proveedoresResponse.data[0].id
    Write-Host "✅ Proveedor encontrado: $proveedorId" -ForegroundColor Green
} else {
    Write-Host "❌ No se encontraron proveedores. Crea uno primero." -ForegroundColor Red
    exit 1
}

# Crear cuenta por pagar
Write-Host "`n📝 Creando cuenta por pagar..." -ForegroundColor Yellow

$fechaEmision = (Get-Date).ToString("yyyy-MM-dd")
$fechaVencimiento = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
$numeroDocumento = "FACT-$(Get-Random -Minimum 1000 -Maximum 9999)"

$body = @{
    proveedor_id = $proveedorId
    numero_documento = $numeroDocumento
    fecha_emision = $fechaEmision
    fecha_vencimiento = $fechaVencimiento
    condiciones_pago = "CREDITO_30"
    dias_credito = 30
    subtotal = 1000.00
    igv = 180.00
    total = 1180.00
    moneda = "PEN"
    observaciones = "Cuenta por pagar creada manualmente para pruebas"
} | ConvertTo-Json

Write-Host "Body:" -ForegroundColor Gray
Write-Host $body -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $token"
            "x-tenant-id" = $tenantId
            "Content-Type" = "application/json"
        } `
        -Body $body

    Write-Host "`n✅ Cuenta por pagar creada exitosamente!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Gray
    $response | ConvertTo-Json -Depth 10 | Write-Host

    # Verificar campos importantes
    if ($response.success -eq $true) {
        Write-Host "`n📊 Verificación de datos:" -ForegroundColor Cyan
        Write-Host "  - ID: $($response.data.id)" -ForegroundColor White
        Write-Host "  - Número documento: $($response.data.numero_documento)" -ForegroundColor White
        Write-Host "  - Total: $($response.data.total)" -ForegroundColor White
        Write-Host "  - Saldo: $($response.data.saldo)" -ForegroundColor White
        Write-Host "  - Estado: $($response.data.estado)" -ForegroundColor White
        Write-Host "  - Fecha vencimiento: $($response.data.fecha_vencimiento)" -ForegroundColor White
    }
} catch {
    Write-Host "`n❌ Error al crear cuenta por pagar" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" -ForegroundColor Red
        $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 10 | Write-Host
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ Test completado" -ForegroundColor Green
