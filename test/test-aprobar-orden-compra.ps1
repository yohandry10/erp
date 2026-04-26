# Test script for POST /api/compras/ordenes/:id/aprobar endpoint
# This script tests the approval of a purchase order

$baseUrl = "http://localhost:3000/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test: Aprobar Orden de Compra" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test proveedor first
Write-Host "Step 1: Creating test proveedor..." -ForegroundColor Yellow
$proveedorBody = @{
    tenant_id = $tenantId
    ruc = "20123456789"
    razon_social = "Proveedor Test Aprobacion SA"
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

# Step 2: Create a test orden de compra
Write-Host "Step 2: Creating test orden de compra..." -ForegroundColor Yellow
$ordenBody = @{
    tenant_id = $tenantId
    numero = "OC-TEST-APROBACION-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = $proveedorId
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    estado = "PENDIENTE"
    condiciones_pago = "CREDITO"
    dias_credito = 30
    observaciones = "Orden de compra para test de aprobación"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440001"
            descripcion = "Producto Test 1"
            cantidad = 10
            precio_unitario = 100.00
        },
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440002"
            descripcion = "Producto Test 2"
            cantidad = 5
            precio_unitario = 200.00
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
} catch {
    Write-Host "✗ Error creating orden: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Aprobar la orden de compra
Write-Host "Step 3: Approving orden de compra..." -ForegroundColor Yellow
$aprobarBody = @{
    tenant_id = $tenantId
    aprobador_id = "550e8400-e29b-41d4-a716-446655440099"
    aprobador_nombre = "Juan Pérez"
    comentarios = "Aprobado según presupuesto del trimestre"
} | ConvertTo-Json

try {
    $aprobarResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId/aprobar" -Method Post -Body $aprobarBody -ContentType "application/json"
    
    if ($aprobarResponse.success) {
        Write-Host "✓ Orden aprobada exitosamente" -ForegroundColor Green
        Write-Host "  ID: $($aprobarResponse.data.id)" -ForegroundColor Gray
        Write-Host "  Número: $($aprobarResponse.data.numero)" -ForegroundColor Gray
        Write-Host "  Estado: $($aprobarResponse.data.estado)" -ForegroundColor Gray
        Write-Host "  Aprobado por: $($aprobarResponse.data.aprobado_by)" -ForegroundColor Gray
        Write-Host "  Aprobado en: $($aprobarResponse.data.aprobado_at)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Error: $($aprobarResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error approving orden: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "  Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""

# Step 4: Verify the orden estado changed to APROBADA
Write-Host "Step 4: Verifying orden estado..." -ForegroundColor Yellow
try {
    $verifyResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId`?tenant_id=$tenantId" -Method Get
    
    if ($verifyResponse.data.estado -eq "APROBADA") {
        Write-Host "✓ Estado verified: APROBADA" -ForegroundColor Green
        Write-Host "  Aprobado por: $($verifyResponse.data.aprobado_by)" -ForegroundColor Gray
        Write-Host "  Aprobado en: $($verifyResponse.data.aprobado_at)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Estado incorrecto: $($verifyResponse.data.estado)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error verifying orden: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 5: Test error case - try to approve already approved orden
Write-Host "Step 5: Testing error case - approving already approved orden..." -ForegroundColor Yellow
try {
    $errorResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId/aprobar" -Method Post -Body $aprobarBody -ContentType "application/json"
    
    if (-not $errorResponse.success) {
        Write-Host "✓ Error case handled correctly" -ForegroundColor Green
        Write-Host "  Error message: $($errorResponse.error)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Should have returned error for already approved orden" -ForegroundColor Red
    }
} catch {
    Write-Host "✓ Error case handled correctly (exception thrown)" -ForegroundColor Green
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test completed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
