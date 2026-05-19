# Test script for Reception Wizard with Quantity Input
# Tests keyboard and scanner input functionality

$baseUrl = "http://localhost:3001"
$apiUrl = "http://localhost:3000"

Write-Host "=== TEST: Reception Wizard - Quantity Input ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get an approved order with pending items
Write-Host "Step 1: Getting approved orders with pending items..." -ForegroundColor Yellow
$ordersResponse = Invoke-RestMethod -Uri "$apiUrl/api/compras/ordenes?estado=APROBADA,PARCIAL" -Method Get -Headers @{
    "x-tenant-id" = "vierdes"
}

if ($ordersResponse.success -and $ordersResponse.data.Count -gt 0) {
    $orden = $ordersResponse.data[0]
    Write-Host "✓ Found order: $($orden.numero) (ID: $($orden.id))" -ForegroundColor Green
    Write-Host "  Provider: $($orden.proveedores.razon_social)" -ForegroundColor Gray
    Write-Host "  Status: $($orden.estado)" -ForegroundColor Gray
    Write-Host "  Details count: $($orden.detalles.Count)" -ForegroundColor Gray

    # Show pending items
    Write-Host "`n  Pending items:" -ForegroundColor Gray
    foreach ($detalle in $orden.detalles) {
        $cantidadRecibida = if ($detalle.cantidad_recibida) { $detalle.cantidad_recibida } else { 0 }
        $pendiente = $detalle.cantidad - $cantidadRecibida
        if ($pendiente -gt 0) {
            Write-Host "    - $($detalle.productos.nombre): $pendiente pending (of $($detalle.cantidad))" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "✗ No approved orders found" -ForegroundColor Red
    Write-Host "  Create an approved order first" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 2: Test the wizard URL
Write-Host "Step 2: Testing wizard page..." -ForegroundColor Yellow
$wizardUrl = "$baseUrl/dashboard/compras/recepciones/nueva?orden_id=$($orden.id)"
Write-Host "  URL: $wizardUrl" -ForegroundColor Gray
Write-Host "✓ Wizard URL ready" -ForegroundColor Green

Write-Host ""

# Step 3: Simulate creating a reception with quantities
Write-Host "Step 3: Simulating reception creation..." -ForegroundColor Yellow

# Prepare items with quantities (simulate keyboard/scanner input)
$items = @()
foreach ($detalle in $orden.detalles) {
    $cantidadRecibida = if ($detalle.cantidad_recibida) { $detalle.cantidad_recibida } else { 0 }
    $pendiente = $detalle.cantidad - $cantidadRecibida
    if ($pendiente -gt 0) {
        # Receive half of pending quantity (simulating manual input)
        $cantidadRecibir = [Math]::Max(1, [Math]::Floor($pendiente / 2))
        $items += @{
            detalle_id = $detalle.id
            cantidad_recibida = $cantidadRecibir
            calidad = "OK"
            observaciones = "Test reception - keyboard input"
        }
        Write-Host "  - $($detalle.productos.nombre): receiving $cantidadRecibir of $pendiente pending" -ForegroundColor Gray
    }
}

$createDto = @{
    orden_id = $orden.id
    items = $items
    observaciones = "Test reception from wizard"
} | ConvertTo-Json -Depth 10

Write-Host "`n  Creating reception..." -ForegroundColor Gray
try {
    $createResponse = Invoke-RestMethod -Uri "$apiUrl/api/compras/recepciones/ordenes/$($orden.id)" -Method Post -Headers @{
        "x-tenant-id" = "vierdes"
        "Content-Type" = "application/json"
    } -Body $createDto

    if ($createResponse.success) {
        $recepcionId = $createResponse.data.id
        Write-Host "✓ Reception created: $recepcionId" -ForegroundColor Green
        Write-Host "  Number: $($createResponse.data.numero)" -ForegroundColor Gray
        Write-Host "  Status: $($createResponse.data.estado)" -ForegroundColor Gray
        Write-Host "  Items: $($createResponse.data.items.Count)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Failed to create reception: $($createResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error creating reception: $_" -ForegroundColor Red
    Write-Host "  Response: $($_.Exception.Response)" -ForegroundColor Gray
    exit 1
}

Write-Host ""

# Step 4: Close the reception
Write-Host "Step 4: Closing reception..." -ForegroundColor Yellow
$closeDto = @{
    observaciones = "Test reception closed"
} | ConvertTo-Json

try {
    $closeResponse = Invoke-RestMethod -Uri "$apiUrl/api/compras/recepciones/$recepcionId/cerrar" -Method Post -Headers @{
        "x-tenant-id" = "vierdes"
        "Content-Type" = "application/json"
    } -Body $closeDto

    if ($closeResponse.success) {
        Write-Host "✓ Reception closed successfully" -ForegroundColor Green
        Write-Host "  Status: $($closeResponse.data.estado)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Failed to close reception: $($closeResponse.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error closing reception: $_" -ForegroundColor Red
}

Write-Host ""

# Step 5: Verify order status updated
Write-Host "Step 5: Verifying order status..." -ForegroundColor Yellow
$updatedOrderResponse = Invoke-RestMethod -Uri "$apiUrl/api/compras/ordenes/$($orden.id)" -Method Get -Headers @{
    "x-tenant-id" = "vierdes"
}

if ($updatedOrderResponse.success) {
    $updatedOrden = $updatedOrderResponse.data
    Write-Host "✓ Order status: $($updatedOrden.estado)" -ForegroundColor Green

    Write-Host "`n  Updated quantities:" -ForegroundColor Gray
    foreach ($detalle in $updatedOrden.detalles) {
        $recibida = if ($detalle.cantidad_recibida) { $detalle.cantidad_recibida } else { 0 }
        $pendiente = $detalle.cantidad - $recibida
        $pct = [Math]::Round(($recibida / $detalle.cantidad) * 100, 0)
        Write-Host "    - $($detalle.productos.nombre): $recibida/$($detalle.cantidad) ($pct%) - Pending: $pendiente" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "=== TEST COMPLETED ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "MANUAL TESTING:" -ForegroundColor Yellow
Write-Host "1. Open browser: $wizardUrl" -ForegroundColor White
Write-Host "2. Test keyboard input:" -ForegroundColor White
Write-Host "   - Use +/- buttons to adjust quantities" -ForegroundColor Gray
Write-Host "   - Type directly in the input field" -ForegroundColor Gray
Write-Host "   - Use 'Recibir todo' button for full quantity" -ForegroundColor Gray
Write-Host "3. Test scanner mode:" -ForegroundColor White
Write-Host "   - Click 'Activar Scanner' button" -ForegroundColor Gray
Write-Host "   - Type product codes quickly (simulating scanner)" -ForegroundColor Gray
Write-Host "   - Press Enter after each code" -ForegroundColor Gray
Write-Host "   - Watch quantities increment automatically" -ForegroundColor Gray
Write-Host "4. Complete the wizard:" -ForegroundColor White
Write-Host "   - Step 1: Enter quantities" -ForegroundColor Gray
Write-Host "   - Step 2: Set quality (OK/OBSERVADO/RECHAZADO)" -ForegroundColor Gray
Write-Host "   - Step 3: Review and confirm" -ForegroundColor Gray
Write-Host ""
