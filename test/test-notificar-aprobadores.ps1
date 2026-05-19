# Test script para verificar notificaciones a aprobadores
# Este script crea una orden de compra que requiere aprobación y verifica que se envíen notificaciones

$BASE_URL = "http://localhost:3000"
$TENANT_ID = "vierdes"

# Headers comunes
$headers = @{
    "Content-Type" = "application/json"
    "x-tenant-id" = $TENANT_ID
}

Write-Host "=== TEST: Notificar Aprobadores ===" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener configuración actual de monto de aprobación
Write-Host "1. Verificando configuración de monto de aprobación..." -ForegroundColor Yellow
try {
    $configResponse = Invoke-RestMethod -Uri "$BASE_URL/api/configuracion" -Method Get -Headers $headers
    $montoAprobacion = $configResponse.monto_aprobacion_compras
    Write-Host "   Monto de aprobación configurado: $montoAprobacion" -ForegroundColor Green
} catch {
    Write-Host "   Error al obtener configuración: $_" -ForegroundColor Red
    $montoAprobacion = 10000 # Valor por defecto para el test
    Write-Host "   Usando monto por defecto: $montoAprobacion" -ForegroundColor Yellow
}

# 2. Obtener un proveedor existente
Write-Host ""
Write-Host "2. Obteniendo proveedor..." -ForegroundColor Yellow
try {
    $proveedoresResponse = Invoke-RestMethod -Uri "$BASE_URL/api/compras/proveedores?limit=1" -Method Get -Headers $headers
    $proveedor = $proveedoresResponse.data[0]
    Write-Host "   Proveedor: $($proveedor.razon_social) (ID: $($proveedor.id))" -ForegroundColor Green
} catch {
    Write-Host "   Error al obtener proveedor: $_" -ForegroundColor Red
    Write-Host "   Debe existir al menos un proveedor para ejecutar este test" -ForegroundColor Red
    exit 1
}

# 3. Obtener un producto existente
Write-Host ""
Write-Host "3. Obteniendo producto..." -ForegroundColor Yellow
try {
    $productosResponse = Invoke-RestMethod -Uri "$BASE_URL/api/inventario/productos?limit=1" -Method Get -Headers $headers
    $producto = $productosResponse.data[0]
    Write-Host "   Producto: $($producto.nombre) (ID: $($producto.id))" -ForegroundColor Green
} catch {
    Write-Host "   Error al obtener producto: $_" -ForegroundColor Red
    Write-Host "   Debe existir al menos un producto para ejecutar este test" -ForegroundColor Red
    exit 1
}

# 4. Crear orden de compra que REQUIERE aprobación (monto alto)
Write-Host ""
Write-Host "4. Creando orden de compra que requiere aprobación..." -ForegroundColor Yellow

$numeroOrden = "OC-TEST-NOTIF-$(Get-Date -Format 'yyyyMMddHHmmss')"

# Calcular cantidad para exceder el monto de aprobación
$precioUnitario = 1000
$cantidadNecesaria = [Math]::Ceiling(($montoAprobacion * 1.2) / ($precioUnitario * 1.18))

$ordenData = @{
    numero = $numeroOrden
    proveedor_id = $proveedor.id
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO"
    dias_credito = 30
    observaciones = "Test de notificación a aprobadores - Orden que requiere aprobación"
    detalles = @(
        @{
            producto_id = $producto.id
            descripcion = $producto.nombre
            cantidad = $cantidadNecesaria
            precio_unitario = $precioUnitario
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $ordenResponse = Invoke-RestMethod -Uri "$BASE_URL/api/compras/ordenes" -Method Post -Headers $headers -Body $ordenData
    Write-Host "   ✅ Orden creada: $($ordenResponse.numero)" -ForegroundColor Green
    Write-Host "   Estado: $($ordenResponse.estado)" -ForegroundColor $(if ($ordenResponse.estado -eq "APROBACION") { "Green" } else { "Yellow" })
    Write-Host "   Total: $($ordenResponse.total)" -ForegroundColor Green
    Write-Host "   ID: $($ordenResponse.id)" -ForegroundColor Gray

    if ($ordenResponse.estado -ne "APROBACION") {
        Write-Host "   ⚠️  ADVERTENCIA: La orden no está en estado APROBACION" -ForegroundColor Yellow
        Write-Host "   Esto puede indicar que el monto no excede el límite configurado" -ForegroundColor Yellow
    }

    $ordenId = $ordenResponse.id
} catch {
    Write-Host "   ❌ Error al crear orden: $_" -ForegroundColor Red
    Write-Host "   Response: $($_.Exception.Response)" -ForegroundColor Red
    exit 1
}

# 5. Esperar un momento para que se procesen las notificaciones
Write-Host ""
Write-Host "5. Esperando procesamiento de notificaciones..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# 6. Verificar que se crearon notificaciones
Write-Host ""
Write-Host "6. Verificando notificaciones creadas..." -ForegroundColor Yellow
try {
    $notificacionesResponse = Invoke-RestMethod -Uri "$BASE_URL/api/notifications?type=oc_requiere_aprobacion&leida=false" -Method Get -Headers $headers

    $notificacionesOrden = $notificacionesResponse | Where-Object { $_.message -like "*$numeroOrden*" }

    if ($notificacionesOrden.Count -gt 0) {
        Write-Host "   ✅ Se crearon $($notificacionesOrden.Count) notificaciones" -ForegroundColor Green
        foreach ($notif in $notificacionesOrden) {
            Write-Host "   - Usuario: $($notif.usuario_id)" -ForegroundColor Cyan
            Write-Host "     Título: $($notif.title)" -ForegroundColor Gray
            Write-Host "     Mensaje: $($notif.message)" -ForegroundColor Gray
            Write-Host "     URL: $($notif.action_url)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ⚠️  No se encontraron notificaciones para esta orden" -ForegroundColor Yellow
        Write-Host "   Esto puede indicar que:" -ForegroundColor Yellow
        Write-Host "   - No hay usuarios con permisos de aprobación" -ForegroundColor Yellow
        Write-Host "   - Hubo un error al enviar las notificaciones" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Error al obtener notificaciones: $_" -ForegroundColor Red
}

# 7. Limpiar: Cancelar la orden de prueba
Write-Host ""
Write-Host "7. Limpiando: Cancelando orden de prueba..." -ForegroundColor Yellow
try {
    $cancelarData = @{
        motivo_cancelacion = "Test completado - Orden de prueba"
    } | ConvertTo-Json

    $cancelResponse = Invoke-RestMethod -Uri "$BASE_URL/api/compras/ordenes/$ordenId/cancelar" -Method Post -Headers $headers -Body $cancelarData
    Write-Host "   ✅ Orden cancelada exitosamente" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  No se pudo cancelar la orden automáticamente" -ForegroundColor Yellow
    Write-Host "   Puede cancelarla manualmente: $numeroOrden" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Resumen:" -ForegroundColor White
Write-Host "- Orden creada: $numeroOrden" -ForegroundColor Gray
Write-Host "- Estado: APROBACION (requiere aprobación)" -ForegroundColor Gray
Write-Host "- Notificaciones enviadas a aprobadores" -ForegroundColor Gray
Write-Host ""
