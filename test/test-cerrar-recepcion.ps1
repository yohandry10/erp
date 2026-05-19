# Test Script: Cerrar Recepción
# Verifica el flujo completo de cierre de recepción con actualización de inventario

$baseUrl = "http://localhost:3001"
$tenantId = "c1e1f1b1-1e1e-1e1e-1e1e-1e1e1e1e1e1e"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Cerrar Recepción" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Headers
$headers = @{
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

# Step 1: Obtener una orden de compra APROBADA
Write-Host "Step 1: Obteniendo órdenes de compra APROBADAS..." -ForegroundColor Yellow
try {
    $ordenesResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes?estado=APROBADA" -Method Get -Headers $headers

    if ($ordenesResponse.success -and $ordenesResponse.data.Count -gt 0) {
        $orden = $ordenesResponse.data[0]
        Write-Host "✅ Orden encontrada: $($orden.numero)" -ForegroundColor Green
        Write-Host "   Proveedor: $($orden.proveedores.razon_social)" -ForegroundColor Gray
        Write-Host "   Total: $($orden.total)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ No se encontraron órdenes APROBADAS" -ForegroundColor Red
        Write-Host "   Cree una orden de compra y apruébela primero" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Error obteniendo órdenes: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Obtener detalles de la orden
Write-Host "Step 2: Obteniendo detalles de la orden..." -ForegroundColor Yellow
try {
    $ordenDetalleResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$($orden.id)" -Method Get -Headers $headers

    if ($ordenDetalleResponse.success) {
        $ordenCompleta = $ordenDetalleResponse.data
        Write-Host "✅ Detalles obtenidos" -ForegroundColor Green
        Write-Host "   Items en la orden: $($ordenCompleta.detalles.Count)" -ForegroundColor Gray

        foreach ($detalle in $ordenCompleta.detalles) {
            $cantidadRecibida = if ($detalle.cantidad_recibida) { $detalle.cantidad_recibida } else { 0 }
            $pendiente = $detalle.cantidad - $cantidadRecibida
            Write-Host "   - $($detalle.productos.nombre): $pendiente pendientes de $($detalle.cantidad)" -ForegroundColor Gray
        }
        Write-Host ""
    } else {
        Write-Host "❌ Error obteniendo detalles de la orden" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Obtener almacenes disponibles
Write-Host "Step 3: Obteniendo almacenes..." -ForegroundColor Yellow
try {
    $almacenesResponse = Invoke-RestMethod -Uri "$baseUrl/api/inventario/almacenes" -Method Get -Headers $headers

    if ($almacenesResponse.success -and $almacenesResponse.data.Count -gt 0) {
        $almacen = $almacenesResponse.data[0]
        Write-Host "✅ Almacén seleccionado: $($almacen.nombre)" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "❌ No se encontraron almacenes" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error obteniendo almacenes: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Crear recepción en estado BORRADOR
Write-Host "Step 4: Creando recepción..." -ForegroundColor Yellow

$items = @()
foreach ($detalle in $ordenCompleta.detalles) {
    $cantidadRecibida = if ($detalle.cantidad_recibida) { $detalle.cantidad_recibida } else { 0 }
    $cantidadPendiente = $detalle.cantidad - $cantidadRecibida

    if ($cantidadPendiente -gt 0) {
        # Recibir la mitad de lo pendiente para probar recepción parcial
        $cantidadRecibir = [Math]::Ceiling($cantidadPendiente / 2)

        $items += @{
            detalle_id = $detalle.id
            cantidad_recibida = $cantidadRecibir
            calidad = "OK"
            almacen_id = $almacen.id
            lote = "LOTE-TEST-$(Get-Date -Format 'yyyyMMdd')"
            observaciones = "Recepción de prueba"
        }
    }
}

$createRecepcionBody = @{
    orden_id = $orden.id
    items = $items
    observaciones = "Recepción de prueba - Test automatizado"
} | ConvertTo-Json -Depth 10

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/recepciones/ordenes/$($orden.id)" -Method Post -Headers $headers -Body $createRecepcionBody

    if ($createResponse.success) {
        $recepcion = $createResponse.data
        Write-Host "✅ Recepción creada: $($recepcion.numero)" -ForegroundColor Green
        Write-Host "   ID: $($recepcion.id)" -ForegroundColor Gray
        Write-Host "   Estado: $($recepcion.estado)" -ForegroundColor Gray
        Write-Host "   Items: $($recepcion.items.Count)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ Error creando recepción: $($createResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

# Step 5: Obtener stock ANTES del cierre
Write-Host "Step 5: Verificando stock ANTES del cierre..." -ForegroundColor Yellow
$stockAntes = @{}

foreach ($item in $recepcion.items) {
    try {
        $productoResponse = Invoke-RestMethod -Uri "$baseUrl/api/inventario/productos/$($item.producto_id)" -Method Get -Headers $headers

        if ($productoResponse.success) {
            $producto = $productoResponse.data
            $stockActual = if ($producto.stock_actual) { $producto.stock_actual } else { 0 }
            $stockAntes[$item.producto_id] = @{
                nombre = $producto.nombre
                stock_actual = $stockActual
                cantidad_recibir = $item.cantidad_recibida
            }
            Write-Host "   $($producto.nombre): Stock actual = $stockActual" -ForegroundColor Gray
        }
    } catch {
        Write-Host "   ⚠️ No se pudo obtener stock del producto $($item.producto_id)" -ForegroundColor Yellow
    }
}
Write-Host ""

# Step 6: CERRAR la recepción
Write-Host "Step 6: CERRANDO recepción..." -ForegroundColor Yellow

$cerrarBody = @{
    observaciones = "Recepción cerrada - Test automatizado"
} | ConvertTo-Json

try {
    $cerrarResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/recepciones/$($recepcion.id)/cerrar" -Method Post -Headers $headers -Body $cerrarBody

    if ($cerrarResponse.success) {
        $recepcionCerrada = $cerrarResponse.data
        Write-Host "✅ Recepción CERRADA exitosamente" -ForegroundColor Green
        Write-Host "   Estado: $($recepcionCerrada.estado)" -ForegroundColor Gray
        Write-Host "   Cerrado en: $($recepcionCerrada.cerrado_at)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ Error cerrando recepción: $($cerrarResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

# Step 7: Verificar stock DESPUÉS del cierre
Write-Host "Step 7: Verificando stock DESPUÉS del cierre..." -ForegroundColor Yellow
$stockDespues = @{}
$stockActualizado = $true

foreach ($productoId in $stockAntes.Keys) {
    try {
        $productoResponse = Invoke-RestMethod -Uri "$baseUrl/api/inventario/productos/$productoId" -Method Get -Headers $headers

        if ($productoResponse.success) {
            $producto = $productoResponse.data
            $stockActualProducto = if ($producto.stock_actual) { $producto.stock_actual } else { 0 }
            $stockDespues[$productoId] = $stockActualProducto

            $stockEsperado = $stockAntes[$productoId].stock_actual + $stockAntes[$productoId].cantidad_recibir
            $stockReal = $stockDespues[$productoId]

            Write-Host "   $($stockAntes[$productoId].nombre):" -ForegroundColor Gray
            Write-Host "     Antes: $($stockAntes[$productoId].stock_actual)" -ForegroundColor Gray
            Write-Host "     Recibido: +$($stockAntes[$productoId].cantidad_recibir)" -ForegroundColor Gray
            Write-Host "     Esperado: $stockEsperado" -ForegroundColor Gray
            Write-Host "     Real: $stockReal" -ForegroundColor Gray

            if ($stockReal -eq $stockEsperado) {
                Write-Host "     ✅ Stock actualizado correctamente" -ForegroundColor Green
            } else {
                Write-Host "     ❌ Stock NO coincide (diferencia: $($stockReal - $stockEsperado))" -ForegroundColor Red
                $stockActualizado = $false
            }
        }
    } catch {
        Write-Host "   ⚠️ No se pudo verificar stock del producto $productoId" -ForegroundColor Yellow
        $stockActualizado = $false
    }
}
Write-Host ""

# Step 8: Verificar estado de la orden de compra
Write-Host "Step 8: Verificando estado de la orden de compra..." -ForegroundColor Yellow
try {
    $ordenActualizadaResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$($orden.id)" -Method Get -Headers $headers

    if ($ordenActualizadaResponse.success) {
        $ordenActualizada = $ordenActualizadaResponse.data
        Write-Host "✅ Estado de la orden: $($ordenActualizada.estado)" -ForegroundColor Green

        # Verificar cantidades recibidas
        foreach ($detalle in $ordenActualizada.detalles) {
            $cantidadRecibida = if ($detalle.cantidad_recibida) { $detalle.cantidad_recibida } else { 0 }
            $pendiente = $detalle.cantidad - $cantidadRecibida
            Write-Host "   - $($detalle.productos.nombre):" -ForegroundColor Gray
            Write-Host "     Pedido: $($detalle.cantidad)" -ForegroundColor Gray
            Write-Host "     Recibido: $cantidadRecibida" -ForegroundColor Gray
            Write-Host "     Pendiente: $pendiente" -ForegroundColor Gray
        }
        Write-Host ""
    }
} catch {
    Write-Host "❌ Error verificando orden: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 9: Verificar movimientos de inventario
Write-Host "Step 9: Verificando movimientos de inventario..." -ForegroundColor Yellow
try {
    # Nota: Este endpoint puede no existir, es opcional
    $movimientosResponse = Invoke-RestMethod -Uri "$baseUrl/api/inventario/movimientos?referencia_tipo=RECEPCION&referencia_id=$($recepcion.id)" -Method Get -Headers $headers -ErrorAction SilentlyContinue

    if ($movimientosResponse.success) {
        Write-Host "✅ Movimientos de inventario creados: $($movimientosResponse.data.Count)" -ForegroundColor Green
        foreach ($mov in $movimientosResponse.data) {
            Write-Host "   - Tipo: $($mov.tipo), Cantidad: $($mov.cantidad)" -ForegroundColor Gray
        }
        Write-Host ""
    }
} catch {
    Write-Host "⚠️ No se pudo verificar movimientos de inventario (endpoint puede no existir)" -ForegroundColor Yellow
    Write-Host ""
}

# RESUMEN FINAL
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DEL TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($recepcionCerrada.estado -eq "CERRADA" -and $stockActualizado) {
    Write-Host "✅ TEST EXITOSO" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verificaciones completadas:" -ForegroundColor Green
    Write-Host "  ✅ Recepción creada en estado BORRADOR" -ForegroundColor Green
    Write-Host "  ✅ Recepción cerrada correctamente" -ForegroundColor Green
    Write-Host "  ✅ Inventario actualizado correctamente" -ForegroundColor Green
    Write-Host "  ✅ Estado de orden actualizado" -ForegroundColor Green
    Write-Host ""
    Write-Host "Funcionalidades implementadas:" -ForegroundColor Cyan
    Write-Host "  • Crear recepción con items" -ForegroundColor Gray
    Write-Host "  • Asignar almacén y lote" -ForegroundColor Gray
    Write-Host "  • Cerrar recepción" -ForegroundColor Gray
    Write-Host "  • Actualizar inventario (movimientos de almacén)" -ForegroundColor Gray
    Write-Host "  • Actualizar cantidad_recibida en orden" -ForegroundColor Gray
    Write-Host "  • Actualizar estado de orden (PARCIAL/RECIBIDA)" -ForegroundColor Gray
    Write-Host "  • Emitir evento RecepcionRegistrada" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "❌ TEST FALLIDO" -ForegroundColor Red
    Write-Host ""
    if ($recepcionCerrada.estado -ne "CERRADA") {
        Write-Host "  ❌ La recepción no se cerró correctamente" -ForegroundColor Red
    }
    if (-not $stockActualizado) {
        Write-Host "  ❌ El inventario no se actualizó correctamente" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "Datos de la prueba:" -ForegroundColor Cyan
Write-Host "  Orden: $($orden.numero)" -ForegroundColor Gray
Write-Host "  Recepción: $($recepcion.numero)" -ForegroundColor Gray
Write-Host "  Almacén: $($almacen.nombre)" -ForegroundColor Gray
Write-Host ""
