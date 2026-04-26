# Test script para POST /api/compras/ordenes/:id/recepciones
# Crea una nueva recepción de mercancía para una orden de compra

$baseUrl = "http://localhost:3002"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: POST /api/compras/ordenes/:id/recepciones" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Primero, obtener una orden de compra en estado APROBADA o PARCIAL
Write-Host "1. Obteniendo órdenes de compra aprobadas..." -ForegroundColor Yellow
$getOrdenesUrl = "$baseUrl/api/compras/ordenes?tenant_id=$tenantId&estado=APROBADA"

try {
    $ordenesResponse = Invoke-RestMethod -Uri $getOrdenesUrl -Method Get -ContentType "application/json"
    
    if ($ordenesResponse.success -and $ordenesResponse.data.Count -gt 0) {
        $orden = $ordenesResponse.data[0]
        $ordenId = $orden.id
        Write-Host "✓ Orden encontrada: $($orden.numero) (Estado: $($orden.estado))" -ForegroundColor Green
        Write-Host "  Proveedor: $($orden.proveedor.razon_social)" -ForegroundColor Gray
        Write-Host "  Total: $($orden.total)" -ForegroundColor Gray
        Write-Host ""
        
        # Obtener detalles de la orden para construir los items de recepción
        Write-Host "2. Obteniendo detalles de la orden..." -ForegroundColor Yellow
        $getOrdenUrl = "$baseUrl/api/compras/ordenes/$ordenId`?tenant_id=$tenantId"
        $ordenDetalleResponse = Invoke-RestMethod -Uri $getOrdenUrl -Method Get -ContentType "application/json"
        
        if ($ordenDetalleResponse.success) {
            $ordenDetalle = $ordenDetalleResponse.data
            Write-Host "✓ Detalles obtenidos: $($ordenDetalle.detalles.Count) items" -ForegroundColor Green
            Write-Host ""
            
            # Construir items de recepción (recibir todo)
            $items = @()
            foreach ($detalle in $ordenDetalle.detalles) {
                $cantidadPendiente = [decimal]$detalle.cantidad - [decimal]$detalle.cantidad_recibida
                if ($cantidadPendiente -gt 0) {
                    $items += @{
                        detalle_id = $detalle.id
                        cantidad_recibida = $cantidadPendiente
                        calidad = "OK"
                        lote = "LOTE-$(Get-Date -Format 'yyyyMMdd')"
                        observaciones = "Recepción completa del item"
                    }
                    Write-Host "  - $($detalle.descripcion): $cantidadPendiente unidades" -ForegroundColor Gray
                }
            }
            
            if ($items.Count -eq 0) {
                Write-Host "⚠ No hay items pendientes de recibir en esta orden" -ForegroundColor Yellow
                Write-Host "Buscando otra orden..." -ForegroundColor Yellow
                exit
            }
            
            Write-Host ""
            Write-Host "3. Creando recepción..." -ForegroundColor Yellow
            
            # Crear el body de la recepción
            $recepcionBody = @{
                tenant_id = $tenantId
                orden_id = $ordenId
                items = $items
                observaciones = "Recepción de prueba - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                lote = "LOTE-$(Get-Date -Format 'yyyyMMdd')"
            } | ConvertTo-Json -Depth 10
            
            Write-Host "Body de la solicitud:" -ForegroundColor Gray
            Write-Host $recepcionBody -ForegroundColor DarkGray
            Write-Host ""
            
            # Crear la recepción
            $createRecepcionUrl = "$baseUrl/api/compras/ordenes/$ordenId/recepciones?tenant_id=$tenantId"
            $response = Invoke-RestMethod -Uri $createRecepcionUrl -Method Post -Body $recepcionBody -ContentType "application/json"
            
            if ($response.success) {
                Write-Host "========================================" -ForegroundColor Green
                Write-Host "✓ RECEPCIÓN CREADA EXITOSAMENTE" -ForegroundColor Green
                Write-Host "========================================" -ForegroundColor Green
                Write-Host ""
                Write-Host "Detalles de la recepción:" -ForegroundColor Cyan
                Write-Host "  ID: $($response.data.id)" -ForegroundColor White
                Write-Host "  Número: $($response.data.numero)" -ForegroundColor White
                Write-Host "  Estado: $($response.data.estado)" -ForegroundColor White
                Write-Host "  Orden: $($response.data.orden.numero)" -ForegroundColor White
                Write-Host "  Fecha: $($response.data.fecha_recepcion)" -ForegroundColor White
                Write-Host "  Items: $($response.data.items.Count)" -ForegroundColor White
                Write-Host ""
                Write-Host "Items recibidos:" -ForegroundColor Cyan
                foreach ($item in $response.data.items) {
                    Write-Host "  - $($item.producto.nombre)" -ForegroundColor White
                    Write-Host "    Cantidad: $($item.cantidad_recibida)" -ForegroundColor Gray
                    Write-Host "    Calidad: $($item.calidad)" -ForegroundColor Gray
                    Write-Host "    Lote: $($item.lote)" -ForegroundColor Gray
                }
                Write-Host ""
                Write-Host "Observaciones: $($response.data.observaciones)" -ForegroundColor Gray
                Write-Host ""
                Write-Host "========================================" -ForegroundColor Green
                Write-Host "NOTA: La recepción está en estado BORRADOR" -ForegroundColor Yellow
                Write-Host "Para completarla, usar: POST /api/compras/recepciones/$($response.data.id)/cerrar" -ForegroundColor Yellow
                Write-Host "========================================" -ForegroundColor Green
            } else {
                Write-Host "❌ Error al crear recepción" -ForegroundColor Red
                Write-Host "Error: $($response.error)" -ForegroundColor Red
            }
        } else {
            Write-Host "❌ Error al obtener detalles de la orden" -ForegroundColor Red
            Write-Host "Error: $($ordenDetalleResponse.error)" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠ No se encontraron órdenes de compra en estado APROBADA" -ForegroundColor Yellow
        Write-Host "Primero debes crear y aprobar una orden de compra" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Puedes usar:" -ForegroundColor Gray
        Write-Host "  1. test-crear-orden-compra.ps1" -ForegroundColor Gray
        Write-Host "  2. test-aprobar-orden-compra.ps1" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Error en la solicitud" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "StatusCode: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
}

Write-Host ""
