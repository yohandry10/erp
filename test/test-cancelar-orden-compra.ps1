# Test script for POST /api/compras/ordenes/:id/cancelar endpoint

$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== TEST: Cancelar Orden de Compra ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test order first
Write-Host "Step 1: Creating test order..." -ForegroundColor Yellow
$createOrderBody = @{
    tenant_id = $tenantId
    numero = "OC-CANCEL-$(Get-Date -Format 'yyyyMMddHHmm')"
    proveedor_id = "550e8400-e29b-41d4-a716-446655440010"
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO_30"
    dias_credito = 30
    observaciones = "Test cancelación"
    estado = "APROBADA"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440020"
            descripcion = "Test Product"
            cantidad = 10
            precio_unitario = 100.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes" -Method Post -Body $createOrderBody -ContentType "application/json"

    if ($createResponse.success) {
        $ordenId = $createResponse.data.id
        Write-Host "✓ Order created successfully" -ForegroundColor Green
        Write-Host "  Order ID: $ordenId" -ForegroundColor Gray
        Write-Host "  Order Number: $($createResponse.data.numero)" -ForegroundColor Gray
        Write-Host "  Current Status: $($createResponse.data.estado)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Failed to create order: $($createResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error creating order: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Cancel the order
Write-Host "Step 2: Canceling order..." -ForegroundColor Yellow
$cancelBody = @{
    tenant_id = $tenantId
    cancelado_por_id = "550e8400-e29b-41d4-a716-446655440001"
    cancelado_por_nombre = "Test User"
    motivo_cancelacion = "Cambio en requerimientos"
} | ConvertTo-Json

try {
    $cancelResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId/cancelar" -Method Post -Body $cancelBody -ContentType "application/json"

    if ($cancelResponse.success) {
        Write-Host "✓ Order canceled successfully" -ForegroundColor Green
        Write-Host "  Order ID: $($cancelResponse.data.id)" -ForegroundColor Gray
        Write-Host "  New Status: $($cancelResponse.data.estado)" -ForegroundColor Gray
        Write-Host "  Canceled At: $($cancelResponse.data.cancelado_at)" -ForegroundColor Gray
        Write-Host "  Canceled By: $($cancelResponse.data.cancelado_by)" -ForegroundColor Gray
        Write-Host "  Cancellation Reason: $($cancelResponse.data.motivo_cancelacion)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Failed to cancel order: $($cancelResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error canceling order: $_" -ForegroundColor Red
    Write-Host "  Error details: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Verify the order status
Write-Host "Step 3: Verifying order status..." -ForegroundColor Yellow
try {
    $verifyResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId`?tenant_id=$tenantId" -Method Get

    if ($verifyResponse.success) {
        Write-Host "✓ Order status verified" -ForegroundColor Green
        Write-Host "  Current Status: $($verifyResponse.data.estado)" -ForegroundColor Gray

        if ($verifyResponse.data.estado -eq "ANULADA") {
            Write-Host "  ✓ Status is correctly set to ANULADA" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Status is not ANULADA (expected ANULADA, got $($verifyResponse.data.estado))" -ForegroundColor Red
        }
        Write-Host ""
    } else {
        Write-Host "✗ Failed to verify order: $($verifyResponse.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error verifying order: $_" -ForegroundColor Red
}

# Step 4: Test validation - try to cancel an already canceled order
Write-Host "Step 4: Testing validation - trying to cancel already canceled order..." -ForegroundColor Yellow
try {
    $invalidCancelResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId/cancelar" -Method Post -Body $cancelBody -ContentType "application/json"

    if ($invalidCancelResponse.success) {
        Write-Host "✗ Should not allow canceling an already canceled order" -ForegroundColor Red
    } else {
        Write-Host "✓ Correctly rejected canceling already canceled order" -ForegroundColor Green
        Write-Host "  Error message: $($invalidCancelResponse.error)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✓ Correctly rejected canceling already canceled order (exception thrown)" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== TEST COMPLETED ===" -ForegroundColor Cyan
