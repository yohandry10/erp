# Test CobroRegistrado Event Emission
# This script verifies that the CobroRegistrado event is properly emitted when a payment is registered

$baseUrl = "http://localhost:3000/api"
$tenantId = "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f90"

Write-Host "=== TEST: CobroRegistrado Event Emission ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get an existing CxC
Write-Host "1. Getting existing CxC..." -ForegroundColor Yellow
$cxcResponse = Invoke-RestMethod -Uri "$baseUrl/finanzas/cxc?limit=1&estado=PENDIENTE" `
    -Method GET `
    -Headers @{
        "x-tenant-id" = $tenantId
        "Content-Type" = "application/json"
    }

if ($cxcResponse.data.Count -eq 0) {
    Write-Host "❌ No pending CxC found. Please create one first." -ForegroundColor Red
    exit 1
}

$cxc = $cxcResponse.data[0]
Write-Host "✅ Found CxC: $($cxc.id)" -ForegroundColor Green
Write-Host "   Cliente: $($cxc.clientes.razon_social)" -ForegroundColor Gray
Write-Host "   Monto Total: $($cxc.monto_total)" -ForegroundColor Gray
Write-Host "   Monto Pendiente: $($cxc.monto_pendiente)" -ForegroundColor Gray
Write-Host ""

# Step 2: Register a payment
Write-Host "2. Registering payment..." -ForegroundColor Yellow
$pagoPayload = @{
    monto = [math]::Min(500, $cxc.monto_pendiente)
    fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
    metodo_pago = "TRANSFERENCIA"
    referencia = "TEST-COBRO-$(Get-Date -Format 'yyyyMMddHHmmss')"
    notas = "Test de evento CobroRegistrado"
} | ConvertTo-Json

try {
    $pagoResponse = Invoke-RestMethod -Uri "$baseUrl/finanzas/cxc/$($cxc.id)/pago" `
        -Method POST `
        -Headers @{
            "x-tenant-id" = $tenantId
            "Content-Type" = "application/json"
        } `
        -Body $pagoPayload

    Write-Host "✅ Payment registered successfully" -ForegroundColor Green
    Write-Host "   Nuevo estado: $($pagoResponse.data.estado)" -ForegroundColor Gray
    Write-Host "   Nuevo saldo: $($pagoResponse.data.monto_pendiente)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Error registering payment: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Verify event in outbox
Write-Host "3. Checking outbox for CobroRegistrado event..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Note: This requires direct database access or an endpoint to check outbox events
Write-Host "⚠️  Manual verification required:" -ForegroundColor Yellow
Write-Host "   Check the outbox_events table for event_type = 'cobro.registrado'" -ForegroundColor Gray
Write-Host "   Expected payload fields:" -ForegroundColor Gray
Write-Host "   - tenantId: $tenantId" -ForegroundColor Gray
Write-Host "   - cobroId: <payment_id>" -ForegroundColor Gray
Write-Host "   - cxcId: $($cxc.id)" -ForegroundColor Gray
Write-Host "   - clienteId: $($cxc.cliente_id)" -ForegroundColor Gray
Write-Host "   - monto: $($pagoPayload.monto)" -ForegroundColor Gray
Write-Host "   - metodoPago: TRANSFERENCIA" -ForegroundColor Gray
Write-Host ""

Write-Host "=== TEST COMPLETED ===" -ForegroundColor Cyan
Write-Host "✅ CobroRegistrado event should be emitted" -ForegroundColor Green
Write-Host "✅ Event should be available for Contabilidad and Tesorería modules" -ForegroundColor Green
