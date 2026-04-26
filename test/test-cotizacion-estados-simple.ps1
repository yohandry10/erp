# Test simplificado para verificar el flujo de estados de cotizaciones
# Este script asume que ya existen proveedores y productos en la BD

$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== TEST: Flujo de Estados de Cotizaciones (Simplificado) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "NOTA: Este test requiere que existan proveedores y productos en la BD" -ForegroundColor Yellow
Write-Host "Si falla por foreign key, crear primero un proveedor y producto" -ForegroundColor Yellow
Write-Host ""

# IDs de prueba - ajustar según tu BD
$proveedorId = "11111111-1111-1111-1111-111111111111"
$productoId = "22222222-2222-2222-2222-222222222222"

# Función para hacer requests
function Invoke-ApiRequest {
    param(
        [string]$Uri,
        [string]$Method = "GET",
        [object]$Body = $null
    )
    
    try {
        $params = @{
            Uri = $Uri
            Method = $Method
            ContentType = "application/json"
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        return $response
    } catch {
        Write-Host "Error en request: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# 1. Crear cotización en BORRADOR
Write-Host "1. Creando cotización en estado BORRADOR..." -ForegroundColor Yellow

$nuevaCotizacion = @{
    tenant_id = $tenantId
    numero = "COT-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = $proveedorId
    fecha_cotizacion = (Get-Date -Format "yyyy-MM-dd")
    validez_dias = 30
    estado = "BORRADOR"
    observaciones = "Cotización de prueba para flujo de estados"
    detalles = @(
        @{
            producto_id = $productoId
            descripcion = "Producto de prueba 1"
            cantidad = 10
            precio_unitario = 100.00
        }
    )
}

$response = Invoke-ApiRequest -Uri "$baseUrl/compras/cotizaciones" -Method Post -Body $nuevaCotizacion

if ($response -and $response.success) {
    $cotizacionId = $response.data.id
    Write-Host "✓ Cotización creada: $cotizacionId" -ForegroundColor Green
    Write-Host "  Estado: $($response.data.estado)" -ForegroundColor Gray
} else {
    Write-Host "✗ Error al crear cotización" -ForegroundColor Red
    if ($response) {
        Write-Host "  Error: $($response.error)" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "SOLUCIÓN: Asegúrate de tener un proveedor y producto en la BD" -ForegroundColor Yellow
    Write-Host "O actualiza los IDs en el script:" -ForegroundColor Yellow
    Write-Host "  proveedorId = '$proveedorId'" -ForegroundColor Gray
    Write-Host "  productoId = '$productoId'" -ForegroundColor Gray
    exit 1
}

Write-Host ""

# 2. Enviar cotización (BORRADOR → ENVIADA)
Write-Host "2. Enviando cotización (BORRADOR → ENVIADA)..." -ForegroundColor Yellow

$response = Invoke-ApiRequest -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/enviar" -Method Post -Body @{ tenant_id = $tenantId }

if ($response -and $response.success) {
    Write-Host "✓ Cotización enviada" -ForegroundColor Green
    Write-Host "  Estado: $($response.data.estado)" -ForegroundColor Gray
} else {
    Write-Host "✗ Error al enviar" -ForegroundColor Red
    if ($response) { Write-Host "  Error: $($response.error)" -ForegroundColor Red }
    exit 1
}

Write-Host ""

# 3. Aprobar cotización (ENVIADA → APROBADA)
Write-Host "3. Aprobando cotización (ENVIADA → APROBADA)..." -ForegroundColor Yellow

$response = Invoke-ApiRequest -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/aprobar" -Method Post -Body @{ tenant_id = $tenantId }

if ($response -and $response.success) {
    Write-Host "✓ Cotización aprobada" -ForegroundColor Green
    Write-Host "  Estado: $($response.data.estado)" -ForegroundColor Gray
} else {
    Write-Host "✗ Error al aprobar" -ForegroundColor Red
    if ($response) { Write-Host "  Error: $($response.error)" -ForegroundColor Red }
    exit 1
}

Write-Host ""

# 4. Crear segunda cotización para probar rechazo
Write-Host "4. Creando segunda cotización para probar rechazo..." -ForegroundColor Yellow

$nuevaCotizacion.numero = "COT-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')-2"
$response = Invoke-ApiRequest -Uri "$baseUrl/compras/cotizaciones" -Method Post -Body $nuevaCotizacion

if ($response -and $response.success) {
    $cotizacionId2 = $response.data.id
    Write-Host "✓ Segunda cotización creada: $cotizacionId2" -ForegroundColor Green
} else {
    Write-Host "✗ Error al crear segunda cotización" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 5. Enviar segunda cotización
Write-Host "5. Enviando segunda cotización..." -ForegroundColor Yellow

$response = Invoke-ApiRequest -Uri "$baseUrl/compras/cotizaciones/$cotizacionId2/enviar" -Method Post -Body @{ tenant_id = $tenantId }

if ($response -and $response.success) {
    Write-Host "✓ Segunda cotización enviada" -ForegroundColor Green
} else {
    Write-Host "✗ Error al enviar segunda cotización" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 6. Rechazar cotización (ENVIADA → RECHAZADA)
Write-Host "6. Rechazando cotización (ENVIADA → RECHAZADA)..." -ForegroundColor Yellow

$response = Invoke-ApiRequest -Uri "$baseUrl/compras/cotizaciones/$cotizacionId2/rechazar" -Method Post -Body @{ 
    tenant_id = $tenantId
    motivo = "Precio muy alto, no se ajusta al presupuesto"
}

if ($response -and $response.success) {
    Write-Host "✓ Cotización rechazada" -ForegroundColor Green
    Write-Host "  Estado: $($response.data.estado)" -ForegroundColor Gray
} else {
    Write-Host "✗ Error al rechazar" -ForegroundColor Red
    if ($response) { Write-Host "  Error: $($response.error)" -ForegroundColor Red }
    exit 1
}

Write-Host ""
Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host "✓ Flujo de estados implementado correctamente" -ForegroundColor Green
Write-Host "✓ BORRADOR → ENVIADA → APROBADA: OK" -ForegroundColor Green
Write-Host "✓ BORRADOR → ENVIADA → RECHAZADA: OK" -ForegroundColor Green
Write-Host ""
Write-Host "Cotización 1 (Aprobada): $cotizacionId" -ForegroundColor Gray
Write-Host "Cotización 2 (Rechazada): $cotizacionId2" -ForegroundColor Gray
