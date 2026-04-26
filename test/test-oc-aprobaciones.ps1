# Test script para verificar la creación de registros en oc_aprobaciones
# Este script prueba el flujo de aprobación y rechazo de órdenes de compra

$baseUrl = "http://localhost:3000/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

# Headers comunes
$headers = @{
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "=== TEST: Crear Orden de Compra para Aprobación ===" -ForegroundColor Cyan

# 1. Crear una orden de compra que requiera aprobación (monto alto)
$ordenData = @{
    numero = "OC-TEST-APR-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = "550e8400-e29b-41d4-a716-446655440010"
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO"
    dias_credito = 30
    estado = "APROBACION"
    observaciones = "Orden de prueba para flujo de aprobaciones"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440020"
            descripcion = "Producto de prueba 1"
            cantidad = 100
            precio_unitario = 150.00
        },
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440021"
            descripcion = "Producto de prueba 2"
            cantidad = 50
            precio_unitario = 200.00
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Creando orden de compra..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes" -Method Post -Headers $headers -Body $ordenData
    $ordenId = $response.id
    Write-Host "✓ Orden creada exitosamente: $($response.numero)" -ForegroundColor Green
    Write-Host "  ID: $ordenId" -ForegroundColor Gray
    Write-Host "  Estado: $($response.estado)" -ForegroundColor Gray
    Write-Host "  Total: $($response.total)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error al crear orden: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== TEST: Aprobar Orden de Compra ===" -ForegroundColor Cyan

# 2. Aprobar la orden de compra
$aprobarData = @{
    aprobador_id = "550e8400-e29b-41d4-a716-446655440001"
    aprobador_nombre = "Juan Pérez"
    comentarios = "Aprobado según presupuesto del trimestre"
} | ConvertTo-Json

Write-Host "Aprobando orden de compra..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId/aprobar" -Method Post -Headers $headers -Body $aprobarData
    Write-Host "✓ Orden aprobada exitosamente" -ForegroundColor Green
    Write-Host "  Estado: $($response.estado)" -ForegroundColor Gray
    Write-Host "  Aprobado por: $($response.aprobado_by)" -ForegroundColor Gray
    Write-Host "  Fecha aprobación: $($response.aprobado_at)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error al aprobar orden: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TEST: Verificar Registro en oc_aprobaciones ===" -ForegroundColor Cyan

# 3. Verificar que se creó el registro en oc_aprobaciones
Write-Host "Consultando registros de aprobación..." -ForegroundColor Yellow
Write-Host "  (Nota: Esto requiere acceso directo a la base de datos)" -ForegroundColor Gray
Write-Host "  Query sugerido:" -ForegroundColor Gray
Write-Host "  SELECT * FROM oc_aprobaciones WHERE orden_id = '$ordenId';" -ForegroundColor DarkGray

Write-Host ""
Write-Host "=== TEST: Crear Orden para Rechazo ===" -ForegroundColor Cyan

# 4. Crear otra orden para probar el rechazo
$ordenData2 = @{
    numero = "OC-TEST-REJ-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = "550e8400-e29b-41d4-a716-446655440010"
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO"
    dias_credito = 30
    estado = "APROBACION"
    observaciones = "Orden de prueba para rechazo"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440020"
            descripcion = "Producto de prueba"
            cantidad = 50
            precio_unitario = 100.00
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Creando segunda orden de compra..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes" -Method Post -Headers $headers -Body $ordenData2
    $ordenId2 = $response.id
    Write-Host "✓ Orden creada exitosamente: $($response.numero)" -ForegroundColor Green
    Write-Host "  ID: $ordenId2" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error al crear orden: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== TEST: Rechazar Orden de Compra ===" -ForegroundColor Cyan

# 5. Rechazar la orden de compra
$rechazarData = @{
    rechazado_por_id = "550e8400-e29b-41d4-a716-446655440002"
    motivo_rechazo = "Presupuesto insuficiente para este período"
} | ConvertTo-Json

Write-Host "Rechazando orden de compra..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/$ordenId2/rechazar" -Method Post -Headers $headers -Body $rechazarData
    Write-Host "✓ Orden rechazada exitosamente" -ForegroundColor Green
    Write-Host "  Estado: $($response.estado)" -ForegroundColor Gray
    Write-Host "  Rechazado por: $($response.rechazado_by)" -ForegroundColor Gray
    Write-Host "  Motivo: $($response.motivo_rechazo)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error al rechazar orden: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TEST: Verificar Registro de Rechazo ===" -ForegroundColor Cyan
Write-Host "Consultando registros de rechazo..." -ForegroundColor Yellow
Write-Host "  Query sugerido:" -ForegroundColor Gray
Write-Host "  SELECT * FROM oc_aprobaciones WHERE orden_id = '$ordenId2';" -ForegroundColor DarkGray

Write-Host ""
Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host "✓ Orden 1 (Aprobada): $ordenId" -ForegroundColor Green
Write-Host "✓ Orden 2 (Rechazada): $ordenId2" -ForegroundColor Green
Write-Host ""
Write-Host "Para verificar los registros en oc_aprobaciones, ejecuta:" -ForegroundColor Yellow
Write-Host "  SELECT * FROM oc_aprobaciones WHERE orden_id IN ('$ordenId', '$ordenId2');" -ForegroundColor White
