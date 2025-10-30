# Test: Evento OrdenCompraAprobada
# Este script prueba que el evento se emite correctamente cuando se aprueba una orden de compra

$baseUrl = "http://localhost:3000"
$tenantId = "vierdes"

# Headers comunes
$headers = @{
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "=== TEST: Evento OrdenCompraAprobada ===" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Crear una orden de compra que requiera aprobación
Write-Host "1. Creando orden de compra que requiere aprobación..." -ForegroundColor Yellow

$ordenData = @{
    numero = "OC-TEST-EVENT-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = "PROVEEDOR_ID_AQUI" # Reemplazar con un ID válido
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
    moneda = "PEN"
    dias_credito = 30
    observaciones = "Orden de prueba para evento OrdenCompraAprobada"
    detalles = @(
        @{
            producto_id = "PRODUCTO_ID_AQUI" # Reemplazar con un ID válido
            descripcion = "Producto de prueba"
            cantidad = 100
            precio_unitario = 150.00
            unidad_medida = "UND"
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes" -Method POST -Headers $headers -Body $ordenData
    $ordenId = $response.id
    $numeroOrden = $response.numero
    
    Write-Host "✅ Orden creada: $numeroOrden (ID: $ordenId)" -ForegroundColor Green
    Write-Host "   Estado: $($response.estado)" -ForegroundColor Gray
    Write-Host "   Total: $($response.total)" -ForegroundColor Gray
    Write-Host ""
    
    # Paso 2: Aprobar la orden
    Write-Host "2. Aprobando orden de compra..." -ForegroundColor Yellow
    
    $aprobarData = @{
        comentarios = "Aprobación de prueba para verificar evento"
    } | ConvertTo-Json
    
    $responseAprobar = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$ordenId/aprobar" -Method POST -Headers $headers -Body $aprobarData
    
    Write-Host "✅ Orden aprobada exitosamente" -ForegroundColor Green
    Write-Host "   Estado: $($responseAprobar.estado)" -ForegroundColor Gray
    Write-Host "   Aprobado en: $($responseAprobar.aprobado_at)" -ForegroundColor Gray
    Write-Host ""
    
    # Paso 3: Verificar en los logs del servidor
    Write-Host "3. Verificar en los logs del servidor:" -ForegroundColor Yellow
    Write-Host "   Buscar las siguientes líneas:" -ForegroundColor Gray
    Write-Host "   - 🎯 [EventBus] Emitiendo evento: orden.compra.aprobada desde compras" -ForegroundColor Cyan
    Write-Host "   - ✅ Evento OrdenCompraAprobada emitido para orden $numeroOrden" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Orden ID: $ordenId" -ForegroundColor White
    Write-Host "Número: $numeroOrden" -ForegroundColor White
    Write-Host "Estado: $($responseAprobar.estado)" -ForegroundColor White
    
} catch {
    Write-Host "❌ Error en el test:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "NOTA: Para probar completamente el evento, implementa un listener en otro módulo:" -ForegroundColor Cyan
Write-Host ""
Write-Host "eventBusService.onOrdenCompraAprobada(async (event) => {" -ForegroundColor Gray
Write-Host "  console.log('📦 Orden aprobada recibida:', event.data);" -ForegroundColor Gray
Write-Host "  // Tu lógica aquí" -ForegroundColor Gray
Write-Host "});" -ForegroundColor Gray
Write-Host ""
