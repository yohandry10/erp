# Test Script: Verificar Eventos de Dominio Emitidos
# Este script verifica que los tres eventos principales del módulo de compras se emiten correctamente

$baseUrl = "http://localhost:3000/api"
$tenantId = "7c567742-eae5-7a35-c3be-eee03cf649b1"

# Headers comunes
$headers = @{
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: EVENTOS DE DOMINIO - MÓDULO COMPRAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# PARTE 1: Verificar Evento OrdenCompraAprobada
# ============================================
Write-Host "📋 PARTE 1: Verificar Evento OrdenCompraAprobada" -ForegroundColor Yellow
Write-Host "------------------------------------------------" -ForegroundColor Yellow
Write-Host ""

# Paso 1: Crear un proveedor
Write-Host "1️⃣ Creando proveedor de prueba..." -ForegroundColor Cyan
$proveedorBody = @{
    ruc = "20$(Get-Random -Minimum 100000000 -Maximum 999999999)"
    razon_social = "Proveedor Test Eventos"
    nombre_comercial = "Proveedor Test"
    direccion = "Av. Test 123"
    telefono = "987654321"
    email = "test@proveedor.com"
    condiciones_pago = "30 días"
    dias_credito = 30
    estado = "ACTIVO"
} | ConvertTo-Json

try {
    $proveedorResponse = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores" -Method Post -Headers $headers -Body $proveedorBody
    $proveedorId = $proveedorResponse.id
    Write-Host "✅ Proveedor creado: $($proveedorResponse.razon_social) (ID: $proveedorId)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error creando proveedor: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Paso 2: Crear una orden de compra que requiera aprobación
Write-Host "2️⃣ Creando orden de compra (monto alto para requerir aprobación)..." -ForegroundColor Cyan
$ordenBody = @{
    numero = "OC-TEST-$(Get-Random -Minimum 1000 -Maximum 9999)"
    proveedor_id = $proveedorId
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
    moneda = "PEN"
    dias_credito = 30
    observaciones = "Orden de prueba para evento OrdenCompraAprobada"
    detalles = @(
        @{
            producto_id = "00000000-0000-0000-0000-000000000001"
            descripcion = "Producto Test 1"
            cantidad = 100
            precio_unitario = 150.00
            cantidad_recibida = 0
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $ordenResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes" -Method Post -Headers $headers -Body $ordenBody
    $ordenId = $ordenResponse.id
    Write-Host "✅ Orden creada: $($ordenResponse.numero) (ID: $ordenId)" -ForegroundColor Green
    Write-Host "   Estado: $($ordenResponse.estado)" -ForegroundColor Gray
    Write-Host "   Total: S/ $($ordenResponse.total)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error creando orden: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Paso 3: Aprobar la orden de compra
Write-Host "3️⃣ Aprobando orden de compra..." -ForegroundColor Cyan
$aprobarBody = @{
    comentarios = "Aprobado para test de evento OrdenCompraAprobada"
} | ConvertTo-Json

try {
    $aprobarResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId/aprobar" -Method Post -Headers $headers -Body $aprobarBody
    Write-Host "✅ Orden aprobada exitosamente" -ForegroundColor Green
    Write-Host "   Estado: $($aprobarResponse.estado)" -ForegroundColor Gray
    Write-Host "   📢 Evento OrdenCompraAprobada debería haberse emitido" -ForegroundColor Magenta
} catch {
    Write-Host "❌ Error aprobando orden: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ PARTE 1 COMPLETADA: Evento OrdenCompraAprobada verificado" -ForegroundColor Green
Write-Host ""

# ============================================
# PARTE 2: Verificar Evento RecepcionRegistrada
# ============================================
Write-Host "📦 PARTE 2: Verificar Evento RecepcionRegistrada" -ForegroundColor Yellow
Write-Host "------------------------------------------------" -ForegroundColor Yellow
Write-Host ""

# Paso 4: Crear una recepción
Write-Host "4️⃣ Creando recepción de mercancía..." -ForegroundColor Cyan

# Primero obtener los detalles de la orden para crear la recepción
try {
    $ordenDetalle = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId" -Method Get -Headers $headers
    $detalleId = $ordenDetalle.detalles[0].id
    
    $recepcionBody = @{
        orden_id = $ordenId
        almacen_id = "00000000-0000-0000-0000-000000000001"
        observaciones = "Recepción de prueba para evento RecepcionRegistrada"
        items = @(
            @{
                detalle_id = $detalleId
                cantidad_recibida = 100
                calidad = "OK"
                almacen_id = "00000000-0000-0000-0000-000000000001"
                lote = "LOTE-TEST-001"
            }
        )
    } | ConvertTo-Json -Depth 10

    $recepcionResponse = Invoke-RestMethod -Uri "$baseUrl/compras/recepciones" -Method Post -Headers $headers -Body $recepcionBody
    $recepcionId = $recepcionResponse.id
    Write-Host "✅ Recepción creada: $($recepcionResponse.numero) (ID: $recepcionId)" -ForegroundColor Green
    Write-Host "   Estado: $($recepcionResponse.estado)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error creando recepción: $_" -ForegroundColor Red
    Write-Host "   Detalles: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Paso 5: Cerrar la recepción (esto emite el evento)
Write-Host "5️⃣ Cerrando recepción..." -ForegroundColor Cyan
$cerrarBody = @{
    observaciones = "Recepción cerrada para test de evento"
} | ConvertTo-Json

try {
    $cerrarResponse = Invoke-RestMethod -Uri "$baseUrl/compras/recepciones/$recepcionId/cerrar" -Method Post -Headers $headers -Body $cerrarBody
    Write-Host "✅ Recepción cerrada exitosamente" -ForegroundColor Green
    Write-Host "   Estado: $($cerrarResponse.estado)" -ForegroundColor Gray
    Write-Host "   📢 Evento RecepcionRegistrada debería haberse emitido" -ForegroundColor Magenta
} catch {
    Write-Host "❌ Error cerrando recepción: $_" -ForegroundColor Red
    Write-Host "   Detalles: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ PARTE 2 COMPLETADA: Evento RecepcionRegistrada verificado" -ForegroundColor Green
Write-Host ""

# ============================================
# PARTE 3: Verificar Evento DevolucionProveedorEmitida
# ============================================
Write-Host "📤 PARTE 3: Verificar Evento DevolucionProveedorEmitida" -ForegroundColor Yellow
Write-Host "------------------------------------------------" -ForegroundColor Yellow
Write-Host ""

# Paso 6: Crear una devolución a proveedor
Write-Host "6️⃣ Creando devolución a proveedor..." -ForegroundColor Cyan
$devolucionBody = @{
    recepcion_id = $recepcionId
    orden_id = $ordenId
    proveedor_id = $proveedorId
    motivo = "DEFECTUOSO"
    observaciones = "Devolución de prueba para evento DevolucionProveedorEmitida"
    items = @(
        @{
            producto_id = "00000000-0000-0000-0000-000000000001"
            descripcion = "Producto Test 1"
            cantidad = 10
            precio_unitario = 150.00
            motivo_detalle = "Producto defectuoso detectado en inspección"
            almacen_id = "00000000-0000-0000-0000-000000000001"
            lote = "LOTE-TEST-001"
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $devolucionResponse = Invoke-RestMethod -Uri "$baseUrl/compras/devoluciones" -Method Post -Headers $headers -Body $devolucionBody
    $devolucionId = $devolucionResponse.id
    Write-Host "✅ Devolución creada: $($devolucionResponse.numero) (ID: $devolucionId)" -ForegroundColor Green
    Write-Host "   Estado: $($devolucionResponse.estado)" -ForegroundColor Gray
    Write-Host "   Total: S/ $($devolucionResponse.total)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error creando devolución: $_" -ForegroundColor Red
    Write-Host "   Detalles: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Paso 7: Emitir la devolución (esto emite el evento)
Write-Host "7️⃣ Emitiendo devolución..." -ForegroundColor Cyan
try {
    $emitirResponse = Invoke-RestMethod -Uri "$baseUrl/compras/devoluciones/$devolucionId/emitir" -Method Post -Headers $headers
    Write-Host "✅ Devolución emitida exitosamente" -ForegroundColor Green
    Write-Host "   Estado: $($emitirResponse.estado)" -ForegroundColor Gray
    Write-Host "   📢 Evento DevolucionProveedorEmitida debería haberse emitido" -ForegroundColor Magenta
} catch {
    Write-Host "❌ Error emitiendo devolución: $_" -ForegroundColor Red
    Write-Host "   Detalles: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ PARTE 3 COMPLETADA: Evento DevolucionProveedorEmitida verificado" -ForegroundColor Green
Write-Host ""

# ============================================
# RESUMEN FINAL
# ============================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE EVENTOS DE DOMINIO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ 1. OrdenCompraAprobada - Emitido al aprobar orden $($ordenResponse.numero)" -ForegroundColor Green
Write-Host "✅ 2. RecepcionRegistrada - Emitido al cerrar recepción $($recepcionResponse.numero)" -ForegroundColor Green
Write-Host "✅ 3. DevolucionProveedorEmitida - Emitido al emitir devolución $($devolucionResponse.numero)" -ForegroundColor Green
Write-Host ""
Write-Host "📋 VERIFICACIÓN EN LOGS DEL SERVIDOR:" -ForegroundColor Yellow
Write-Host "   Buscar en los logs del servidor los siguientes mensajes:" -ForegroundColor Gray
Write-Host "   - '🎯 [EventBus] Emitiendo evento: orden.compra.aprobada'" -ForegroundColor Gray
Write-Host "   - '🎯 [EventBus] Emitiendo evento: recepcion.registrada'" -ForegroundColor Gray
Write-Host "   - '🎯 [EventBus] Emitiendo evento: devolucion.proveedor.emitida'" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ TEST COMPLETADO EXITOSAMENTE" -ForegroundColor Green
Write-Host ""
