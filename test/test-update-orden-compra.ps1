# Test script for PUT /api/compras/ordenes/:id endpoint

$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== Testing PUT /api/compras/ordenes/:id ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test orden de compra first
Write-Host "Step 1: Creating a test orden de compra..." -ForegroundColor Yellow

$createPayload = @{
    tenant_id = $tenantId
    numero = "OC-TEST-UPD-002"
    proveedor_id = "a43a6ede-783d-4237-b115-3fc4c9579510"
    fecha_orden = "2024-10-24"
    fecha_entrega_esperada = "2024-11-24"
    condiciones_pago = "CREDITO_30"
    dias_credito = 30
    estado = "PENDIENTE"
    observaciones = "Orden de prueba para actualización"
    detalles = @(
        @{
            producto_id = "d60710ae-26e8-44d3-bf8f-82aff42c8b8a"
            descripcion = "Laptop HP Original"
            cantidad = 5
            precio_unitario = 2500.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes" -Method Post -Body $createPayload -ContentType "application/json"
    
    if ($createResponse.success) {
        Write-Host "✓ Orden created successfully" -ForegroundColor Green
        $ordenId = $createResponse.data.id
        Write-Host "  Orden ID: $ordenId" -ForegroundColor Gray
        Write-Host "  Número: $($createResponse.data.numero)" -ForegroundColor Gray
        Write-Host "  Total: $($createResponse.data.total)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Failed to create orden: $($createResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error creating orden: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Update the orden de compra
Write-Host "Step 2: Updating the orden de compra..." -ForegroundColor Yellow

$updatePayload = @{
    tenant_id = $tenantId
    numero = "OC-TEST-UPD-001"
    fecha_entrega_esperada = "2024-12-01"
    dias_credito = 45
    observaciones = "Orden actualizada - plazo extendido"
    detalles = @(
        @{
            producto_id = "d60710ae-26e8-44d3-bf8f-82aff42c8b8a"
            descripcion = "Laptop HP Actualizada"
            cantidad = 10
            precio_unitario = 2400.00
        },
        @{
            producto_id = "94ab51e3-9180-4113-85cb-3e43affe3679"
            descripcion = "Mouse Inalámbrico"
            cantidad = 10
            precio_unitario = 50.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $updateResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId" -Method Put -Body $updatePayload -ContentType "application/json"
    
    if ($updateResponse.success) {
        Write-Host "✓ Orden updated successfully" -ForegroundColor Green
        Write-Host "  Número: $($updateResponse.data.numero)" -ForegroundColor Gray
        Write-Host "  Días crédito: $($updateResponse.data.dias_credito)" -ForegroundColor Gray
        Write-Host "  Fecha entrega: $($updateResponse.data.fecha_entrega_esperada)" -ForegroundColor Gray
        Write-Host "  Observaciones: $($updateResponse.data.observaciones)" -ForegroundColor Gray
        Write-Host "  Subtotal: $($updateResponse.data.subtotal)" -ForegroundColor Gray
        Write-Host "  IGV: $($updateResponse.data.igv)" -ForegroundColor Gray
        Write-Host "  Total: $($updateResponse.data.total)" -ForegroundColor Gray
        Write-Host "  Detalles count: $($updateResponse.data.detalles.Count)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Failed to update orden: $($updateResponse.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error updating orden: $_" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Red
}

# Step 3: Verify the update by fetching the orden
Write-Host "Step 3: Verifying the update..." -ForegroundColor Yellow

try {
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId`?tenant_id=$tenantId" -Method Get
    
    if ($getResponse.success) {
        Write-Host "✓ Orden fetched successfully" -ForegroundColor Green
        Write-Host "  Número: $($getResponse.data.numero)" -ForegroundColor Gray
        Write-Host "  Días crédito: $($getResponse.data.dias_credito)" -ForegroundColor Gray
        Write-Host "  Total: $($getResponse.data.total)" -ForegroundColor Gray
        Write-Host "  Detalles:" -ForegroundColor Gray
        foreach ($detalle in $getResponse.data.detalles) {
            Write-Host "    - $($detalle.descripcion): $($detalle.cantidad) x $($detalle.precio_unitario)" -ForegroundColor Gray
        }
        Write-Host ""
    } else {
        Write-Host "✗ Failed to fetch orden: $($getResponse.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error fetching orden: $_" -ForegroundColor Red
}

# Step 4: Test updating a non-BORRADOR orden (should fail)
Write-Host "Step 4: Testing update on non-BORRADOR orden (should fail)..." -ForegroundColor Yellow

# First, change the estado to APROBADA
$changeEstadoPayload = @{
    tenant_id = $tenantId
    estado = "APROBADA"
} | ConvertTo-Json

try {
    $changeEstadoResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId" -Method Put -Body $changeEstadoPayload -ContentType "application/json"
    
    if ($changeEstadoResponse.success) {
        Write-Host "✓ Estado changed to APROBADA" -ForegroundColor Green
        Write-Host ""
        
        # Now try to update again (should fail)
        $failUpdatePayload = @{
            tenant_id = $tenantId
            observaciones = "This should fail"
        } | ConvertTo-Json
        
        try {
            $failResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId" -Method Put -Body $failUpdatePayload -ContentType "application/json"
            
            if ($failResponse.success) {
                Write-Host "✗ Update should have failed but succeeded" -ForegroundColor Red
            } else {
                Write-Host "✓ Update correctly failed: $($failResponse.error)" -ForegroundColor Green
            }
        } catch {
            Write-Host "✓ Update correctly failed with error" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "Note: Could not change estado (expected if validation exists)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Test completed ===" -ForegroundColor Cyan
