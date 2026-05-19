# Test Script: Integración Compras → CxP
# Verifica que al cerrar una recepción se cree automáticamente una CxP

$ErrorActionPreference = "Stop"

# Configuración
$BASE_URL = "http://localhost:3000"
$TENANT_ID = "vierdes"
$API_KEY = "tu-api-key-aqui"

# Headers
$headers = @{
    "Content-Type" = "application/json"
    "x-tenant-id" = $TENANT_ID
    "Authorization" = "Bearer $API_KEY"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Integración Compras → CxP" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# PASO 1: Verificar configuración de empresa
Write-Host "PASO 1: Verificando configuración de empresa..." -ForegroundColor Yellow
Write-Host "Nota: Asegúrate de que generar_cxp_en = 'RECEPCION' en empresa_config" -ForegroundColor Gray
Write-Host ""

# PASO 2: Crear proveedor de prueba
Write-Host "PASO 2: Creando proveedor de prueba..." -ForegroundColor Yellow
$proveedorBody = @{
    ruc = "20123456789"
    razon_social = "Proveedor Test CxP"
    nombre_comercial = "Test CxP"
    direccion = "Av. Test 123"
    telefono = "987654321"
    email = "test@proveedor.com"
    condiciones_pago = "30 días"
    dias_credito = 30
    limite_credito = 10000
    activo = $true
} | ConvertTo-Json

try {
    $proveedor = Invoke-RestMethod -Uri "$BASE_URL/api/compras/proveedores" -Method POST -Headers $headers -Body $proveedorBody
    Write-Host "✅ Proveedor creado: $($proveedor.id)" -ForegroundColor Green
    Write-Host "   RUC: $($proveedor.ruc)" -ForegroundColor Gray
    Write-Host "   Días crédito: $($proveedor.dias_credito)" -ForegroundColor Gray
    $PROVEEDOR_ID = $proveedor.id
} catch {
    Write-Host "❌ Error creando proveedor: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# PASO 3: Crear orden de compra
Write-Host "PASO 3: Creando orden de compra..." -ForegroundColor Yellow
$ordenBody = @{
    proveedor_id = $PROVEEDOR_ID
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")
    moneda = "PEN"
    observaciones = "Test integración CxP"
    detalles = @(
        @{
            producto_id = "producto-test-id"
            descripcion = "Producto Test"
            cantidad = 10
            precio_unitario = 100
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $orden = Invoke-RestMethod -Uri "$BASE_URL/api/compras/ordenes" -Method POST -Headers $headers -Body $ordenBody
    Write-Host "✅ Orden creada: $($orden.numero)" -ForegroundColor Green
    Write-Host "   ID: $($orden.id)" -ForegroundColor Gray
    Write-Host "   Total: $($orden.total) $($orden.moneda)" -ForegroundColor Gray
    $ORDEN_ID = $orden.id
} catch {
    Write-Host "❌ Error creando orden: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# PASO 4: Aprobar orden de compra
Write-Host "PASO 4: Aprobando orden de compra..." -ForegroundColor Yellow
$aprobarBody = @{
    observaciones = "Aprobado para test CxP"
} | ConvertTo-Json

try {
    $ordenAprobada = Invoke-RestMethod -Uri "$BASE_URL/api/compras/ordenes/$ORDEN_ID/aprobar" -Method POST -Headers $headers -Body $aprobarBody
    Write-Host "✅ Orden aprobada: $($ordenAprobada.estado)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error aprobando orden: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# PASO 5: Crear recepción
Write-Host "PASO 5: Creando recepción..." -ForegroundColor Yellow
$recepcionBody = @{
    orden_id = $ORDEN_ID
    almacen_id = "almacen-test-id"
    observaciones = "Test integración CxP"
    items = @(
        @{
            detalle_id = $orden.detalles[0].id
            cantidad_recibida = 10
            calidad = "OK"
            almacen_id = "almacen-test-id"
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $recepcion = Invoke-RestMethod -Uri "$BASE_URL/api/compras/ordenes/$ORDEN_ID/recepciones" -Method POST -Headers $headers -Body $recepcionBody
    Write-Host "✅ Recepción creada: $($recepcion.numero)" -ForegroundColor Green
    Write-Host "   ID: $($recepcion.id)" -ForegroundColor Gray
    Write-Host "   Estado: $($recepcion.estado)" -ForegroundColor Gray
    $RECEPCION_ID = $recepcion.id
} catch {
    Write-Host "❌ Error creando recepción: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# PASO 6: Cerrar recepción (esto debe disparar la creación de CxP)
Write-Host "PASO 6: Cerrando recepción (debe crear CxP automáticamente)..." -ForegroundColor Yellow
$cerrarBody = @{
    observaciones = "Recepción completa - Test CxP"
} | ConvertTo-Json

try {
    $recepcionCerrada = Invoke-RestMethod -Uri "$BASE_URL/api/compras/recepciones/$RECEPCION_ID/cerrar" -Method POST -Headers $headers -Body $cerrarBody
    Write-Host "✅ Recepción cerrada: $($recepcionCerrada.estado)" -ForegroundColor Green
    Write-Host "   Evento RecepcionRegistrada debe haberse emitido" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error cerrando recepción: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# PASO 7: Esperar un momento para que el evento se procese
Write-Host "PASO 7: Esperando procesamiento del evento..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
Write-Host "✅ Esperado 2 segundos" -ForegroundColor Green
Write-Host ""

# PASO 8: Verificar que se creó la CxP
Write-Host "PASO 8: Verificando creación de CxP..." -ForegroundColor Yellow
Write-Host "Nota: Esto requiere un endpoint GET /api/finanzas/cuentas-por-pagar" -ForegroundColor Gray
Write-Host "      o acceso directo a la base de datos" -ForegroundColor Gray
Write-Host ""
Write-Host "Consulta SQL para verificar:" -ForegroundColor Cyan
Write-Host @"
SELECT
    numero,
    proveedor_id,
    tipo_documento,
    numero_documento,
    fecha_emision,
    fecha_vencimiento,
    total,
    saldo,
    estado,
    referencia_tipo,
    referencia_id
FROM cuentas_por_pagar
WHERE referencia_tipo = 'RECEPCION'
  AND referencia_id = '$RECEPCION_ID'
  AND tenant_id = '$TENANT_ID';
"@ -ForegroundColor White
Write-Host ""

# PASO 9: Verificar logs del servidor
Write-Host "PASO 9: Verificar logs del servidor" -ForegroundColor Yellow
Write-Host "Buscar en los logs del servidor:" -ForegroundColor Gray
Write-Host "  - 📡 [Recepciones] Emitiendo evento RecepcionRegistrada" -ForegroundColor Gray
Write-Host "  - 📦 Procesando RecepcionRegistrada: $($recepcion.numero)" -ForegroundColor Gray
Write-Host "  - ✅ CxP creada: CXP-YYYY-NNNN" -ForegroundColor Gray
Write-Host ""

# RESUMEN
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DEL TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Proveedor ID: $PROVEEDOR_ID" -ForegroundColor White
Write-Host "Orden ID: $ORDEN_ID" -ForegroundColor White
Write-Host "Recepción ID: $RECEPCION_ID" -ForegroundColor White
Write-Host ""
Write-Host "VERIFICACIONES MANUALES REQUERIDAS:" -ForegroundColor Yellow
Write-Host "1. ✓ Revisar logs del servidor para confirmar evento emitido" -ForegroundColor White
Write-Host "2. ✓ Ejecutar consulta SQL para verificar CxP creada" -ForegroundColor White
Write-Host "3. ✓ Verificar que fecha_vencimiento = fecha_recepcion + 30 días" -ForegroundColor White
Write-Host "4. ✓ Verificar que total de CxP = total de recepción" -ForegroundColor White
Write-Host "5. ✓ Verificar que estado de CxP = 'PENDIENTE'" -ForegroundColor White
Write-Host ""

# CLEANUP (opcional)
Write-Host "¿Deseas limpiar los datos de prueba? (S/N): " -NoNewline -ForegroundColor Yellow
$cleanup = Read-Host
if ($cleanup -eq "S" -or $cleanup -eq "s") {
    Write-Host "Limpiando datos de prueba..." -ForegroundColor Yellow

    # Eliminar CxP (si existe endpoint)
    # Invoke-RestMethod -Uri "$BASE_URL/api/finanzas/cuentas-por-pagar/$CXP_ID" -Method DELETE -Headers $headers

    # Eliminar recepción
    # Invoke-RestMethod -Uri "$BASE_URL/api/compras/recepciones/$RECEPCION_ID" -Method DELETE -Headers $headers

    # Eliminar orden
    # Invoke-RestMethod -Uri "$BASE_URL/api/compras/ordenes/$ORDEN_ID" -Method DELETE -Headers $headers

    # Eliminar proveedor
    try {
        Invoke-RestMethod -Uri "$BASE_URL/api/compras/proveedores/$PROVEEDOR_ID" -Method DELETE -Headers $headers
        Write-Host "✅ Proveedor eliminado" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ No se pudo eliminar el proveedor: $_" -ForegroundColor Yellow
    }

    Write-Host "Nota: Limpieza manual requerida para CxP, recepción y orden" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Test completado!" -ForegroundColor Green
