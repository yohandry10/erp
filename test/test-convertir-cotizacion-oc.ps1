# Test script para convertir cotización a orden de compra
# Este script prueba el endpoint POST /api/compras/cotizaciones/:id/convertir-oc

$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== TEST: Convertir Cotización a Orden de Compra ===" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Crear un proveedor de prueba
Write-Host "1. Creando proveedor de prueba..." -ForegroundColor Yellow
$proveedor = @{
    tenant_id = $tenantId
    ruc = "20123456789"
    razon_social = "Proveedor Test OC"
    nombre_comercial = "Proveedor Test"
    email = "proveedor@test.com"
    telefono = "987654321"
    direccion = "Av. Test 123"
    condiciones_pago = "CREDITO_30"
    dias_credito = 30
    limite_credito = 50000.00
} | ConvertTo-Json

try {
    $responseProveedor = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores" -Method Post -Body $proveedor -ContentType "application/json"

    if ($responseProveedor.success) {
        $proveedorId = $responseProveedor.data.id
        Write-Host "✓ Proveedor creado: $proveedorId" -ForegroundColor Green
    } else {
        Write-Host "✗ Error al crear proveedor: $($responseProveedor.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Paso 2: Crear una cotización
Write-Host "2. Creando cotización de compra..." -ForegroundColor Yellow
$cotizacion = @{
    tenant_id = $tenantId
    numero = "COT-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = $proveedorId
    fecha_cotizacion = (Get-Date).ToString("yyyy-MM-dd")
    validez_dias = 30
    estado = "BORRADOR"
    observaciones = "Cotización de prueba para conversión a OC"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440001"
            descripcion = "Producto Test 1"
            cantidad = 10
            precio_unitario = 100.00
        },
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440002"
            descripcion = "Producto Test 2"
            cantidad = 5
            precio_unitario = 200.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $responseCotizacion = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones" -Method Post -Body $cotizacion -ContentType "application/json"

    if ($responseCotizacion.success) {
        $cotizacionId = $responseCotizacion.data.id
        Write-Host "✓ Cotización creada: $cotizacionId" -ForegroundColor Green
        Write-Host "  Número: $($responseCotizacion.data.numero)" -ForegroundColor Gray
        Write-Host "  Total: S/ $($responseCotizacion.data.total)" -ForegroundColor Gray
    } else {
        Write-Host "✗ Error al crear cotización: $($responseCotizacion.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Paso 3: Intentar convertir cotización en estado BORRADOR (debe fallar)
Write-Host "3. Intentando convertir cotización en estado BORRADOR (debe fallar)..." -ForegroundColor Yellow
$convertirBorrador = @{
    tenant_id = $tenantId
    numero_oc = "OC-TEST-FAIL-$(Get-Date -Format 'yyyyMMddHHmmss')"
} | ConvertTo-Json

try {
    $responseConvertirBorrador = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/convertir-oc" -Method Post -Body $convertirBorrador -ContentType "application/json"

    if (-not $responseConvertirBorrador.success) {
        Write-Host "✓ Validación correcta: $($responseConvertirBorrador.error)" -ForegroundColor Green
    } else {
        Write-Host "✗ Error: Se permitió convertir una cotización en BORRADOR" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
}

Write-Host ""

# Paso 4: Actualizar cotización a estado APROBADA
Write-Host "4. Actualizando cotización a estado APROBADA..." -ForegroundColor Yellow
$updateCotizacion = @{
    tenant_id = $tenantId
    estado = "APROBADA"
} | ConvertTo-Json

try {
    $responseUpdate = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId" -Method Put -Body $updateCotizacion -ContentType "application/json"

    if ($responseUpdate.success) {
        Write-Host "✓ Cotización actualizada a APROBADA" -ForegroundColor Green
    } else {
        Write-Host "✗ Error al actualizar cotización: $($responseUpdate.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Paso 5: Convertir cotización a orden de compra
Write-Host "5. Convirtiendo cotización a orden de compra..." -ForegroundColor Yellow
$convertirOC = @{
    tenant_id = $tenantId
    numero_oc = "OC-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
} | ConvertTo-Json

try {
    $responseConvertir = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/convertir-oc" -Method Post -Body $convertirOC -ContentType "application/json"

    if ($responseConvertir.success) {
        Write-Host "✓ Conversión exitosa" -ForegroundColor Green
        Write-Host ""
        Write-Host "=== DATOS DE ORDEN DE COMPRA GENERADA ===" -ForegroundColor Cyan
        Write-Host "Número OC: $($responseConvertir.data.numero)" -ForegroundColor White
        Write-Host "Proveedor ID: $($responseConvertir.data.proveedor_id)" -ForegroundColor White
        Write-Host "Cotización ID: $($responseConvertir.data.cotizacion_id)" -ForegroundColor White
        Write-Host "Fecha Orden: $($responseConvertir.data.fecha_orden)" -ForegroundColor White
        Write-Host "Fecha Entrega Esperada: $($responseConvertir.data.fecha_entrega_esperada)" -ForegroundColor White
        Write-Host "Condiciones Pago: $($responseConvertir.data.condiciones_pago)" -ForegroundColor White
        Write-Host "Días Crédito: $($responseConvertir.data.dias_credito)" -ForegroundColor White
        Write-Host "Estado: $($responseConvertir.data.estado)" -ForegroundColor White
        Write-Host "Observaciones: $($responseConvertir.data.observaciones)" -ForegroundColor White
        Write-Host ""
        Write-Host "Detalles ($($responseConvertir.data.detalles.Count) productos):" -ForegroundColor White
        foreach ($detalle in $responseConvertir.data.detalles) {
            Write-Host "  - $($detalle.descripcion): $($detalle.cantidad) x S/ $($detalle.precio_unitario)" -ForegroundColor Gray
        }
        Write-Host ""
        Write-Host "✓ Datos precargados correctamente desde la cotización" -ForegroundColor Green
    } else {
        Write-Host "✗ Error al convertir: $($responseConvertir.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Paso 6: Intentar convertir nuevamente (debe fallar)
Write-Host "6. Intentando convertir nuevamente la misma cotización (debe fallar)..." -ForegroundColor Yellow
$convertirDuplicado = @{
    tenant_id = $tenantId
    numero_oc = "OC-TEST-DUP-$(Get-Date -Format 'yyyyMMddHHmmss')"
} | ConvertTo-Json

try {
    $responseConvertirDup = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/convertir-oc" -Method Post -Body $convertirDuplicado -ContentType "application/json"

    if (-not $responseConvertirDup.success) {
        Write-Host "✓ Validación correcta: $($responseConvertirDup.error)" -ForegroundColor Green
    } else {
        Write-Host "✗ Error: Se permitió convertir una cotización ya convertida" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Cyan
