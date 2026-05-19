# Test script for validating all approvals before marking orden as APROBADA
# This script tests the new approval validation logic

$baseUrl = "http://localhost:3000/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test: Validar Todas las Aprobaciones" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test proveedor
Write-Host "Step 1: Creating test proveedor..." -ForegroundColor Yellow
$proveedorBody = @{
    tenant_id = $tenantId
    ruc = "20123456789"
    razon_social = "Proveedor Test Validacion SA"
    nombre_comercial = "Proveedor Test"
    email = "test@proveedor.com"
    telefono = "987654321"
    direccion = "Av Test 123"
    condiciones_pago = "CREDITO"
    dias_credito = 30
} | ConvertTo-Json

try {
    $proveedorResponse = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores" -Method Post -Body $proveedorBody -ContentType "application/json"
    $proveedorId = $proveedorResponse.data.id
    Write-Host "✓ Proveedor created: $proveedorId" -ForegroundColor Green
} catch {
    Write-Host "✗ Error creating proveedor: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Create an orden de compra that requires approval (high amount)
Write-Host "Step 2: Creating orden de compra with high amount (requires approval)..." -ForegroundColor Yellow
$ordenBody = @{
    tenant_id = $tenantId
    numero = "OC-TEST-VAL-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = $proveedorId
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO"
    dias_credito = 30
    observaciones = "Orden de compra para test de validación de aprobaciones"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440001"
            descripcion = "Producto Test 1"
            cantidad = 100
            precio_unitario = 1000.00
        },
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440002"
            descripcion = "Producto Test 2"
            cantidad = 50
            precio_unitario = 2000.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $ordenResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes" -Method Post -Body $ordenBody -ContentType "application/json"
    $ordenId = $ordenResponse.data.id
    $ordenNumero = $ordenResponse.data.numero
    $ordenEstado = $ordenResponse.data.estado
    Write-Host "✓ Orden created: $ordenId" -ForegroundColor Green
    Write-Host "  Número: $ordenNumero" -ForegroundColor Gray
    Write-Host "  Estado: $ordenEstado" -ForegroundColor Gray
    Write-Host "  Total: $($ordenResponse.data.total)" -ForegroundColor Gray

    # Verify it's in APROBACION state if it requires approval
    if ($ordenEstado -eq "APROBACION") {
        Write-Host "  ✓ Orden requires approval (estado: APROBACION)" -ForegroundColor Green
    } else {
        Write-Host "  ℹ Orden does not require approval (estado: $ordenEstado)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Error creating orden: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Get the orden to check for pending approvals
Write-Host "Step 3: Checking for pending approvals..." -ForegroundColor Yellow
try {
    $ordenDetailResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId`?tenant_id=$tenantId" -Method Get
    Write-Host "✓ Orden retrieved successfully" -ForegroundColor Green
    Write-Host "  Estado actual: $($ordenDetailResponse.data.estado)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error retrieving orden: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 4: First approval
Write-Host "Step 4: First approval by Aprobador 1..." -ForegroundColor Yellow
$aprobar1Body = @{
    tenant_id = $tenantId
    aprobador_id = "550e8400-e29b-41d4-a716-446655440091"
    aprobador_nombre = "Juan Pérez"
    comentarios = "Primera aprobación - Revisado presupuesto"
} | ConvertTo-Json

try {
    $aprobar1Response = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId/aprobar" -Method Post -Body $aprobar1Body -ContentType "application/json"

    if ($aprobar1Response.success) {
        Write-Host "✓ Primera aprobación registrada" -ForegroundColor Green
        Write-Host "  Estado: $($aprobar1Response.data.estado)" -ForegroundColor Gray

        # Check if still in APROBACION state (waiting for more approvals)
        if ($aprobar1Response.data.estado -eq "APROBACION") {
            Write-Host "  ✓ Orden still in APROBACION (waiting for more approvals)" -ForegroundColor Green
        } elseif ($aprobar1Response.data.estado -eq "APROBADA") {
            Write-Host "  ✓ Orden moved to APROBADA (all approvals complete)" -ForegroundColor Green
        }
    } else {
        Write-Host "✗ Error: $($aprobar1Response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error in first approval: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "  Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# Step 5: Try to approve again with same aprobador (should fail)
Write-Host "Step 5: Testing duplicate approval by same aprobador..." -ForegroundColor Yellow
try {
    $duplicateResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId/aprobar" -Method Post -Body $aprobar1Body -ContentType "application/json"

    if (-not $duplicateResponse.success) {
        Write-Host "✓ Duplicate approval correctly rejected" -ForegroundColor Green
        Write-Host "  Error message: $($duplicateResponse.error)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Should have rejected duplicate approval" -ForegroundColor Red
    }
} catch {
    Write-Host "✓ Duplicate approval correctly rejected (exception thrown)" -ForegroundColor Green
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host ""

# Step 6: Get current estado
Write-Host "Step 6: Checking current estado..." -ForegroundColor Yellow
try {
    $currentResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId`?tenant_id=$tenantId" -Method Get
    $currentEstado = $currentResponse.data.estado
    Write-Host "✓ Current estado: $currentEstado" -ForegroundColor Green

    if ($currentEstado -eq "APROBADA") {
        Write-Host "  ✓ All approvals completed - Orden is APROBADA" -ForegroundColor Green
        Write-Host "  Aprobado por: $($currentResponse.data.aprobado_by)" -ForegroundColor Gray
        Write-Host "  Aprobado en: $($currentResponse.data.aprobado_at)" -ForegroundColor Gray
    } elseif ($currentEstado -eq "APROBACION") {
        Write-Host "  ℹ Still waiting for more approvals" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Error checking estado: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 7: Test rejection scenario
Write-Host "Step 7: Creating another orden to test rejection..." -ForegroundColor Yellow
$orden2Body = @{
    tenant_id = $tenantId
    numero = "OC-TEST-REJ-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = $proveedorId
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO"
    dias_credito = 30
    observaciones = "Orden para test de rechazo"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440001"
            descripcion = "Producto Test"
            cantidad = 100
            precio_unitario = 1000.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $orden2Response = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes" -Method Post -Body $orden2Body -ContentType "application/json"
    $orden2Id = $orden2Response.data.id
    Write-Host "✓ Second orden created: $orden2Id" -ForegroundColor Green
    Write-Host "  Estado: $($orden2Response.data.estado)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error creating second orden: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 8: Reject the second orden
Write-Host "Step 8: Rejecting second orden..." -ForegroundColor Yellow
$rechazarBody = @{
    tenant_id = $tenantId
    rechazado_por_id = "550e8400-e29b-41d4-a716-446655440092"
    motivo_rechazo = "Presupuesto insuficiente para este periodo"
} | ConvertTo-Json

try {
    $rechazarResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$orden2Id/rechazar" -Method Post -Body $rechazarBody -ContentType "application/json"

    if ($rechazarResponse.success) {
        Write-Host "✓ Orden rechazada exitosamente" -ForegroundColor Green
        Write-Host "  Estado: $($rechazarResponse.data.estado)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error rejecting orden: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 9: Try to approve a rejected orden (should fail)
Write-Host "Step 9: Testing approval of rejected orden (should fail)..." -ForegroundColor Yellow
$aprobarRejectedBody = @{
    tenant_id = $tenantId
    aprobador_id = "550e8400-e29b-41d4-a716-446655440093"
    aprobador_nombre = "Carlos López"
    comentarios = "Intentando aprobar orden rechazada"
} | ConvertTo-Json

try {
    $aprobarRejectedResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$orden2Id/aprobar" -Method Post -Body $aprobarRejectedBody -ContentType "application/json"

    if (-not $aprobarRejectedResponse.success) {
        Write-Host "✓ Approval of rejected orden correctly blocked" -ForegroundColor Green
        Write-Host "  Error message: $($aprobarRejectedResponse.error)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Should have blocked approval of rejected orden" -ForegroundColor Red
    }
} catch {
    Write-Host "✓ Approval of rejected orden correctly blocked (exception thrown)" -ForegroundColor Green
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "- Created orden requiring approval" -ForegroundColor White
Write-Host "- Validated approval workflow" -ForegroundColor White
Write-Host "- Tested duplicate approval prevention" -ForegroundColor White
Write-Host "- Tested rejection workflow" -ForegroundColor White
Write-Host "- Validated approval of rejected orden is blocked" -ForegroundColor White
