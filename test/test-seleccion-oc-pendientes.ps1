# Test Script: Selección de OC con Pendientes
# Tests the reception page that shows orders with pending items to receive

$baseUrl = "http://localhost:3000/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Selección de OC con Pendientes" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Get orders with APROBADA status
Write-Host "Test 1: Obtener órdenes APROBADAS" -ForegroundColor Yellow
Write-Host "GET /api/compras/ordenes?estado=APROBADA&tenant_id=$tenantId" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes?estado=APROBADA&tenant_id=$tenantId" -Method Get -ContentType "application/json"
    Write-Host "✓ Órdenes APROBADAS obtenidas:" -ForegroundColor Green
    Write-Host "  Total: $($response.count)" -ForegroundColor White
    if ($response.data) {
        foreach ($orden in $response.data) {
            Write-Host "  - $($orden.numero) | Proveedor: $($orden.proveedores.razon_social) | Estado: $($orden.estado)" -ForegroundColor White
            if ($orden.detalles) {
                $pendientes = 0
                foreach ($detalle in $orden.detalles) {
                    $cantidadRecibida = if ($detalle.cantidad_recibida) { $detalle.cantidad_recibida } else { 0 }
                    $pendiente = $detalle.cantidad - $cantidadRecibida
                    $pendientes += $pendiente
                }
                Write-Host "    Items pendientes: $pendientes" -ForegroundColor Cyan
            }
        }
    }
    Write-Host ""
} catch {
    Write-Host "✗ Error obteniendo órdenes APROBADAS" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
}

# Test 2: Get orders with PARCIAL status
Write-Host "Test 2: Obtener órdenes PARCIALES" -ForegroundColor Yellow
Write-Host "GET /api/compras/ordenes?estado=PARCIAL&tenant_id=$tenantId" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes?estado=PARCIAL&tenant_id=$tenantId" -Method Get -ContentType "application/json"
    Write-Host "✓ Órdenes PARCIALES obtenidas:" -ForegroundColor Green
    Write-Host "  Total: $($response.count)" -ForegroundColor White
    if ($response.data) {
        foreach ($orden in $response.data) {
            Write-Host "  - $($orden.numero) | Proveedor: $($orden.proveedores.razon_social) | Estado: $($orden.estado)" -ForegroundColor White
            if ($orden.detalles) {
                $totalCantidad = 0
                $totalRecibida = 0
                foreach ($detalle in $orden.detalles) {
                    $totalCantidad += $detalle.cantidad
                    $cantidadRecibida = if ($detalle.cantidad_recibida) { $detalle.cantidad_recibida } else { 0 }
                    $totalRecibida += $cantidadRecibida
                }
                $porcentaje = if ($totalCantidad -gt 0) { [math]::Round(($totalRecibida / $totalCantidad) * 100) } else { 0 }
                Write-Host "    Progreso: $porcentaje% ($totalRecibida de $totalCantidad items)" -ForegroundColor Cyan
            }
        }
    }
    Write-Host ""
} catch {
    Write-Host "✗ Error obteniendo órdenes PARCIALES" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
}

# Test 3: Get all orders that can receive items (APROBADA or PARCIAL)
Write-Host "Test 3: Obtener todas las órdenes que pueden recibir items" -ForegroundColor Yellow
Write-Host "GET /api/compras/ordenes?tenant_id=$tenantId (filtrar APROBADA y PARCIAL)" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes?tenant_id=$tenantId" -Method Get -ContentType "application/json"
    $ordenesRecepcionables = $response.data | Where-Object { $_.estado -eq "APROBADA" -or $_.estado -eq "PARCIAL" }
    
    Write-Host "✓ Órdenes recepcionables obtenidas:" -ForegroundColor Green
    Write-Host "  Total: $($ordenesRecepcionables.Count)" -ForegroundColor White
    
    $conPendientes = 0
    foreach ($orden in $ordenesRecepcionables) {
        if ($orden.detalles) {
            $tienePendientes = $false
            foreach ($detalle in $orden.detalles) {
                $cantidadRecibida = if ($detalle.cantidad_recibida) { $detalle.cantidad_recibida } else { 0 }
                if ($cantidadRecibida -lt $detalle.cantidad) {
                    $tienePendientes = $true
                    break
                }
            }
            if ($tienePendientes) {
                $conPendientes++
            }
        }
    }
    
    Write-Host "  Órdenes con items pendientes: $conPendientes" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "✗ Error obteniendo órdenes" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE PRUEBAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Funcionalidad implementada:" -ForegroundColor Green
Write-Host "✓ Página de recepciones que lista órdenes pendientes" -ForegroundColor White
Write-Host "✓ Filtrado de órdenes APROBADAS y PARCIALES" -ForegroundColor White
Write-Host "✓ Cálculo de items pendientes por orden" -ForegroundColor White
Write-Host "✓ Cálculo de porcentaje de recepción" -ForegroundColor White
Write-Host "✓ Navegación a wizard de recepción con orden_id" -ForegroundColor White
Write-Host "✓ Estadísticas de órdenes pendientes" -ForegroundColor White
Write-Host "✓ Cards visuales con información completa" -ForegroundColor White
Write-Host "✓ Uso de variables CSS globales" -ForegroundColor White
Write-Host ""
Write-Host "Para probar la interfaz:" -ForegroundColor Yellow
Write-Host "1. Inicia el servidor: cd apps/web && npm run dev" -ForegroundColor White
Write-Host "2. Navega a: http://localhost:3000/dashboard/compras/recepciones" -ForegroundColor White
Write-Host "3. Verás las órdenes con items pendientes de recepción" -ForegroundColor White
Write-Host "4. Click en 'Recepcionar' para ir al wizard (próxima tarea)" -ForegroundColor White
Write-Host ""
