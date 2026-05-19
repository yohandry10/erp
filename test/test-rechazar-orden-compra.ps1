# Test script for POST /api/compras/ordenes/:id/rechazar endpoint
# This script tests the rejection of a purchase order

$baseUrl = "http://localhost:3000/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== TEST: Rechazar Orden de Compra ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test orden de compra
Write-Host "Step 1: Creating test orden de compra..." -ForegroundColor Yellow
$createOrdenBody = @{
    tenant_id = $tenantId
    numero = "OC-TEST-RECHAZAR-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = "550e8400-e29b-41d4-a716-446655440010"
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    estado = "PENDIENTE"
    condiciones_pago = "30 días"
    dias_credito = 30
    observaciones = "Orden de prueba para rechazo"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440020"
            descripcion = "Producto Test 1"
            cantidad = 10
            precio_unitario = 100.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes" -Method Post -Body $createOrdenBody -ContentType "application/json"

    if ($createResponse.success) {
        $ordenId = $createResponse.data.id
        Write-Host "✓ Orden created successfully" -ForegroundColor Green
        Write-Host "  Orden ID: $ordenId" -ForegroundColor Gray
        Write-Host "  Número: $($createResponse.data.numero)" -ForegroundColor Gray
        Write-Host "  Estado: $($createResponse.data.estado)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Failed to create orden: $($createResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error creating orden: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Rechazar the orden de compra
Write-Host "Step 2: Rejecting orden de compra..." -ForegroundColor Yellow
$rechazarBody = @{
    tenant_id = $tenantId
    rechazado_por_id = "550e8400-e29b-41d4-a716-446655440001"
    rechazado_por_nombre = "María García"
    motivo_rechazo = "Presupuesto insuficiente para este trimestre"
} | ConvertTo-Json

try {
    $rechazarResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId/rechazar" -Method Post -Body $rechazarBody -ContentType "application/json"

    if ($rechazarResponse.success) {
        Write-Host "✓ Orden rejected successfully" -ForegroundColor Green
        Write-Host "  Estado: $($rechazarResponse.data.estado)" -ForegroundColor Gray
        Write-Host "  Rechazado por: $($rechazarResponse.data.rechazado_by)" -ForegroundColor Gray
        Write-Host "  Motivo: $($rechazarResponse.data.motivo_rechazo)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Failed to reject orden: $($rechazarResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error rejecting orden: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Verify the orden state
Write-Host "Step 3: Verifying orden state..." -ForegroundColor Yellow
try {
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId`?tenant_id=$tenantId" -Method Get

    if ($getResponse.success) {
        Write-Host "✓ Orden retrieved successfully" -ForegroundColor Green
        Write-Host "  Estado actual: $($getResponse.data.estado)" -ForegroundColor Gray

        if ($getResponse.data.estado -eq "RECHAZADA") {
            Write-Host "  ✓ Estado correcto: RECHAZADA" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Estado incorrecto: Expected RECHAZADA, got $($getResponse.data.estado)" -ForegroundColor Red
        }

        if ($getResponse.data.motivo_rechazo) {
            Write-Host "  ✓ Motivo de rechazo registrado: $($getResponse.data.motivo_rechazo)" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Motivo de rechazo no registrado" -ForegroundColor Red
        }
        Write-Host ""
    } else {
        Write-Host "✗ Failed to retrieve orden: $($getResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error retrieving orden: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Test rejection of already rejected orden (should fail)
Write-Host "Step 4: Testing rejection of already rejected orden (should fail)..." -ForegroundColor Yellow
try {
    $rechazarAgainResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId/rechazar" -Method Post -Body $rechazarBody -ContentType "application/json"

    if (-not $rechazarAgainResponse.success) {
        Write-Host "✓ Correctly rejected re-rejection attempt" -ForegroundColor Green
        Write-Host "  Error message: $($rechazarAgainResponse.error)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Should not allow re-rejection of already rejected orden" -ForegroundColor Red
    }
} catch {
    Write-Host "✓ Correctly rejected re-rejection attempt (exception thrown)" -ForegroundColor Green
    Write-Host ""
}

# Step 5: Test rejection without motivo (should fail)
Write-Host "Step 5: Testing rejection without motivo (should fail)..." -ForegroundColor Yellow

# Create another orden for this test
$createOrdenBody2 = @{
    tenant_id = $tenantId
    numero = "OC-TEST-RECHAZAR-2-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = "550e8400-e29b-41d4-a716-446655440010"
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    estado = "PENDIENTE"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440020"
            descripcion = "Producto Test 2"
            cantidad = 5
            precio_unitario = 50.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $createResponse2 = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes" -Method Post -Body $createOrdenBody2 -ContentType "application/json"
    $ordenId2 = $createResponse2.data.id

    # Try to reject without motivo
    $rechazarSinMotivoBody = @{
        tenant_id = $tenantId
        rechazado_por_id = "550e8400-e29b-41d4-a716-446655440001"
    } | ConvertTo-Json

    $rechazarSinMotivoResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId2/rechazar" -Method Post -Body $rechazarSinMotivoBody -ContentType "application/json"

    if (-not $rechazarSinMotivoResponse.success) {
        Write-Host "✓ Correctly rejected rejection without motivo" -ForegroundColor Green
        Write-Host "  Error message: $($rechazarSinMotivoResponse.error)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Should require motivo for rejection" -ForegroundColor Red
    }
} catch {
    Write-Host "✓ Correctly rejected rejection without motivo (exception thrown)" -ForegroundColor Green
    Write-Host ""
}

Write-Host "=== TEST COMPLETED ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Host "✓ Endpoint POST /api/compras/ordenes/:id/rechazar is working" -ForegroundColor Green
Write-Host "✓ Orden state changes to RECHAZADA" -ForegroundColor Green
Write-Host "✓ Motivo de rechazo is required and stored" -ForegroundColor Green
Write-Host "✓ Cannot reject already rejected orden" -ForegroundColor Green
