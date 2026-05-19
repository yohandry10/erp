# Test script for Aprobar/Rechazar Orden de Compra functionality
# This script tests the approve and reject endpoints for purchase orders

$baseUrl = "http://localhost:3001"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Aprobar/Rechazar Orden de Compra" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test proveedor
Write-Host "Step 1: Creating test proveedor..." -ForegroundColor Yellow
$proveedorBody = @{
    ruc = "20123456789"
    razon_social = "Proveedor Test Aprobacion"
    nombre_comercial = "Proveedor Test"
    direccion = "Av. Test 123"
    email = "test@proveedor.com"
    telefono = "987654321"
    condiciones_pago = "30 días"
    limite_credito = 50000
    estado = "ACTIVO"
} | ConvertTo-Json

try {
    $proveedorResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores?tenant_id=$tenantId" `
        -Method Post `
        -Body $proveedorBody `
        -ContentType "application/json"

    $proveedorId = $proveedorResponse.data.id
    Write-Host "✅ Proveedor created: $proveedorId" -ForegroundColor Green
} catch {
    Write-Host "❌ Error creating proveedor: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Create a test orden de compra in APROBACION state
Write-Host "Step 2: Creating test orden de compra..." -ForegroundColor Yellow
$ordenBody = @{
    numero = "OC-TEST-APROBACION-$(Get-Random -Maximum 9999)"
    proveedor_id = $proveedorId
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
    condiciones_pago = "30 días"
    dias_credito = 30
    moneda = "PEN"
    estado = "APROBACION"
    observaciones = "Orden de prueba para aprobar/rechazar"
    detalles = @(
        @{
            producto_id = "00000000-0000-0000-0000-000000000001"
            descripcion = "Producto Test 1"
            cantidad = 10
            precio_unitario = 100.00
        },
        @{
            producto_id = "00000000-0000-0000-0000-000000000002"
            descripcion = "Producto Test 2"
            cantidad = 5
            precio_unitario = 200.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $ordenResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes?tenant_id=$tenantId" `
        -Method Post `
        -Body $ordenBody `
        -ContentType "application/json"

    $ordenId = $ordenResponse.data.id
    $ordenNumero = $ordenResponse.data.numero
    Write-Host "✅ Orden created: $ordenNumero (ID: $ordenId)" -ForegroundColor Green
    Write-Host "   Estado: $($ordenResponse.data.estado)" -ForegroundColor Cyan
    Write-Host "   Total: S/ $($ordenResponse.data.total)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error creating orden: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Get orden details before approval
Write-Host "Step 3: Getting orden details before approval..." -ForegroundColor Yellow
try {
    $ordenDetails = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/${ordenId}?tenant_id=$tenantId" `
        -Method Get

    Write-Host "✅ Orden details retrieved" -ForegroundColor Green
    Write-Host "   Número: $($ordenDetails.data.numero)" -ForegroundColor Cyan
    Write-Host "   Estado: $($ordenDetails.data.estado)" -ForegroundColor Cyan
    Write-Host "   Proveedor: $($ordenDetails.data.proveedores.razon_social)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error getting orden details: $_" -ForegroundColor Red
}

Write-Host ""

# Step 4: Test APROBAR endpoint
Write-Host "Step 4: Testing APROBAR endpoint..." -ForegroundColor Yellow
$aprobarBody = @{
    comentarios = "Aprobado para pruebas de funcionalidad"
} | ConvertTo-Json

try {
    $aprobarResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/${ordenId}/aprobar?tenant_id=$tenantId" `
        -Method Post `
        -Body $aprobarBody `
        -ContentType "application/json"

    Write-Host "✅ Orden APROBADA successfully" -ForegroundColor Green
    Write-Host "   Nuevo estado: $($aprobarResponse.data.estado)" -ForegroundColor Cyan
    Write-Host "   Mensaje: $($aprobarResponse.message)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error approving orden: $_" -ForegroundColor Red
    Write-Host "   Response: $($_.Exception.Response)" -ForegroundColor Red
}

Write-Host ""

# Step 5: Get orden details after approval
Write-Host "Step 5: Getting orden details after approval..." -ForegroundColor Yellow
try {
    $ordenDetailsAfter = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/${ordenId}?tenant_id=$tenantId" `
        -Method Get

    Write-Host "✅ Orden details retrieved" -ForegroundColor Green
    Write-Host "   Estado: $($ordenDetailsAfter.data.estado)" -ForegroundColor Cyan

    if ($ordenDetailsAfter.data.estado -eq "APROBADA") {
        Write-Host "   ✅ Estado changed to APROBADA correctly" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Estado is $($ordenDetailsAfter.data.estado), expected APROBADA" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error getting orden details: $_" -ForegroundColor Red
}

Write-Host ""

# Step 6: Create another orden to test RECHAZAR
Write-Host "Step 6: Creating another orden to test RECHAZAR..." -ForegroundColor Yellow
$ordenBody2 = @{
    numero = "OC-TEST-RECHAZO-$(Get-Random -Maximum 9999)"
    proveedor_id = $proveedorId
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
    condiciones_pago = "30 días"
    dias_credito = 30
    moneda = "PEN"
    estado = "APROBACION"
    observaciones = "Orden de prueba para rechazar"
    detalles = @(
        @{
            producto_id = "00000000-0000-0000-0000-000000000001"
            descripcion = "Producto Test 1"
            cantidad = 20
            precio_unitario = 150.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $ordenResponse2 = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes?tenant_id=$tenantId" `
        -Method Post `
        -Body $ordenBody2 `
        -ContentType "application/json"

    $ordenId2 = $ordenResponse2.data.id
    $ordenNumero2 = $ordenResponse2.data.numero
    Write-Host "✅ Orden created: $ordenNumero2 (ID: $ordenId2)" -ForegroundColor Green
    Write-Host "   Estado: $($ordenResponse2.data.estado)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error creating orden: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 7: Test RECHAZAR endpoint
Write-Host "Step 7: Testing RECHAZAR endpoint..." -ForegroundColor Yellow
$rechazarBody = @{
    motivo_rechazo = "Presupuesto insuficiente para este periodo"
} | ConvertTo-Json

try {
    $rechazarResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/${ordenId2}/rechazar?tenant_id=$tenantId" `
        -Method Post `
        -Body $rechazarBody `
        -ContentType "application/json"

    Write-Host "✅ Orden RECHAZADA successfully" -ForegroundColor Green
    Write-Host "   Nuevo estado: $($rechazarResponse.data.estado)" -ForegroundColor Cyan
    Write-Host "   Mensaje: $($rechazarResponse.message)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error rejecting orden: $_" -ForegroundColor Red
    Write-Host "   Response: $($_.Exception.Response)" -ForegroundColor Red
}

Write-Host ""

# Step 8: Get orden details after rejection
Write-Host "Step 8: Getting orden details after rejection..." -ForegroundColor Yellow
try {
    $ordenDetailsRejected = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/${ordenId2}?tenant_id=$tenantId" `
        -Method Get

    Write-Host "✅ Orden details retrieved" -ForegroundColor Green
    Write-Host "   Estado: $($ordenDetailsRejected.data.estado)" -ForegroundColor Cyan

    if ($ordenDetailsRejected.data.estado -eq "ANULADA") {
        Write-Host "   ✅ Estado changed to ANULADA correctly" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Estado is $($ordenDetailsRejected.data.estado), expected ANULADA" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error getting orden details: $_" -ForegroundColor Red
}

Write-Host ""

# Step 9: Test validation - try to approve already approved orden
Write-Host "Step 9: Testing validation - trying to approve already approved orden..." -ForegroundColor Yellow
try {
    $aprobarResponse2 = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/${ordenId}/aprobar?tenant_id=$tenantId" `
        -Method Post `
        -Body $aprobarBody `
        -ContentType "application/json"

    Write-Host "⚠️  Unexpected: Orden was approved again (should fail)" -ForegroundColor Yellow
} catch {
    Write-Host "✅ Validation working: Cannot approve already approved orden" -ForegroundColor Green
    Write-Host "   Error message: $($_.Exception.Message)" -ForegroundColor Cyan
}

Write-Host ""

# Step 10: Test validation - try to reject already rejected orden
Write-Host "Step 10: Testing validation - trying to reject already rejected orden..." -ForegroundColor Yellow
try {
    $rechazarResponse2 = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/${ordenId2}/rechazar?tenant_id=$tenantId" `
        -Method Post `
        -Body $rechazarBody `
        -ContentType "application/json"

    Write-Host "⚠️  Unexpected: Orden was rejected again (should fail)" -ForegroundColor Yellow
} catch {
    Write-Host "✅ Validation working: Cannot reject already rejected orden" -ForegroundColor Green
    Write-Host "   Error message: $($_.Exception.Message)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST COMPLETED" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "- Orden 1 ($ordenNumero): APROBADA" -ForegroundColor Green
Write-Host "- Orden 2 ($ordenNumero2): RECHAZADA (ANULADA)" -ForegroundColor Red
Write-Host ""
Write-Host "You can view these orders in the UI at:" -ForegroundColor Cyan
Write-Host "http://localhost:3000/dashboard/compras/ordenes/$ordenId" -ForegroundColor Blue
Write-Host "http://localhost:3000/dashboard/compras/ordenes/$ordenId2" -ForegroundColor Blue
