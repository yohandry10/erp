# Test script for POST /api/compras/devoluciones/:id/emitir endpoint
# Tests the emission of a return to supplier

$baseUrl = "http://localhost:3001"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Emitir Devolución a Proveedor" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test devolution first
Write-Host "Step 1: Creating test devolution..." -ForegroundColor Yellow

# First, get a valid orden_id and proveedor_id
$ordenesResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes?tenant_id=$tenantId&limit=1" -Method Get
if ($ordenesResponse.Count -eq 0) {
    Write-Host "❌ No orders found. Please create an order first." -ForegroundColor Red
    exit 1
}

$orden = $ordenesResponse[0]
$ordenId = $orden.id
$proveedorId = $orden.proveedor_id

Write-Host "✅ Using orden: $($orden.numero) (ID: $ordenId)" -ForegroundColor Green
Write-Host "✅ Using proveedor: $proveedorId" -ForegroundColor Green

# Get a product from the order
$ordenDetalleResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/${ordenId}?tenant_id=$tenantId" -Method Get
if (-not $ordenDetalleResponse.detalles -or $ordenDetalleResponse.detalles.Count -eq 0) {
    Write-Host "❌ Order has no items. Please use an order with items." -ForegroundColor Red
    exit 1
}

$primerItem = $ordenDetalleResponse.detalles[0]
$productoId = $primerItem.producto_id

Write-Host "✅ Using producto: $productoId" -ForegroundColor Green
Write-Host ""

# Create devolution
$devolucionBody = @{
    orden_id = $ordenId
    proveedor_id = $proveedorId
    motivo = "Producto defectuoso - Test automatizado"
    items = @(
        @{
            producto_id = $productoId
            descripcion = "Producto de prueba"
            cantidad = 1
            precio_unitario = 100.00
            motivo_detalle = "Defecto de fabricación"
        }
    )
    observaciones = "Devolución de prueba para testing del endpoint emitir"
} | ConvertTo-Json -Depth 10

Write-Host "Creating devolution..." -ForegroundColor Yellow
Write-Host "Body: $devolucionBody" -ForegroundColor Gray

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones?tenant_id=$tenantId" -Method Post -Body $devolucionBody -ContentType "application/json"
    $devolucionId = $createResponse.id
    Write-Host "✅ Devolution created: $($createResponse.numero) (ID: $devolucionId)" -ForegroundColor Green
    Write-Host "   Estado: $($createResponse.estado)" -ForegroundColor Gray
    Write-Host "   Total: $($createResponse.total)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Error creating devolution: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.Response -ForegroundColor Red
    exit 1
}

# Step 2: Get stock before emission
Write-Host "Step 2: Getting stock before emission..." -ForegroundColor Yellow
try {
    $stockAntes = Invoke-RestMethod -Uri "$baseUrl/api/inventario/productos/${productoId}?tenant_id=$tenantId" -Method Get -ErrorAction SilentlyContinue
    if ($stockAntes) {
        Write-Host "✅ Stock actual antes: $($stockAntes.stock_actual)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Could not get stock info" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not get stock info: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Step 3: Emit the devolution
Write-Host "Step 3: Emitting devolution..." -ForegroundColor Yellow
Write-Host "POST $baseUrl/api/compras/devoluciones/${devolucionId}/emitir?tenant_id=$tenantId" -ForegroundColor Gray

try {
    $emitResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones/${devolucionId}/emitir?tenant_id=$tenantId" -Method Post -ContentType "application/json"
    
    Write-Host "✅ Devolution emitted successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    $emitResponse | ConvertTo-Json -Depth 10 | Write-Host
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Verify estado changed to EMITIDA
    if ($emitResponse.estado -eq "EMITIDA") {
        Write-Host "✅ Estado changed to EMITIDA" -ForegroundColor Green
    } else {
        Write-Host "❌ Estado is not EMITIDA: $($emitResponse.estado)" -ForegroundColor Red
    }
    
    # Verify emitido_at is set
    if ($emitResponse.emitido_at) {
        Write-Host "✅ emitido_at is set: $($emitResponse.emitido_at)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  emitido_at is not set" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "❌ Error emitting devolution: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
    exit 1
}

# Step 4: Verify stock was updated
Write-Host ""
Write-Host "Step 4: Verifying stock was updated..." -ForegroundColor Yellow
try {
    $stockDespues = Invoke-RestMethod -Uri "$baseUrl/api/inventario/productos/${productoId}?tenant_id=$tenantId" -Method Get -ErrorAction SilentlyContinue
    if ($stockDespues) {
        Write-Host "✅ Stock actual después: $($stockDespues.stock_actual)" -ForegroundColor Green
        if ($stockAntes -and $stockDespues.stock_actual -lt $stockAntes.stock_actual) {
            Write-Host "✅ Stock was decreased (expected behavior)" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "⚠️  Could not verify stock: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 5: Try to emit again (should fail)
Write-Host ""
Write-Host "Step 5: Testing duplicate emission (should fail)..." -ForegroundColor Yellow
try {
    $duplicateResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones/${devolucionId}/emitir?tenant_id=$tenantId" -Method Post -ContentType "application/json"
    Write-Host "❌ Duplicate emission should have failed but succeeded" -ForegroundColor Red
} catch {
    Write-Host "✅ Duplicate emission correctly rejected" -ForegroundColor Green
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# Step 6: Verify devolution details
Write-Host ""
Write-Host "Step 6: Verifying devolution details..." -ForegroundColor Yellow
try {
    $devolucionFinal = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones/${devolucionId}?tenant_id=$tenantId" -Method Get
    
    Write-Host "✅ Devolution retrieved successfully" -ForegroundColor Green
    Write-Host "   Número: $($devolucionFinal.numero)" -ForegroundColor Gray
    Write-Host "   Estado: $($devolucionFinal.estado)" -ForegroundColor Gray
    Write-Host "   Total: $($devolucionFinal.total)" -ForegroundColor Gray
    Write-Host "   Items: $($devolucionFinal.items.Count)" -ForegroundColor Gray
    
    if ($devolucionFinal.estado -eq "EMITIDA") {
        Write-Host "✅ Final estado is EMITIDA" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Could not retrieve devolution: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ TEST COMPLETED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
