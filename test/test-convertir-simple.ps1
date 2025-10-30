# Simple test for converting cotizacion to OC
$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== TEST: Convertir Cotización a OC ===" -ForegroundColor Cyan

# Step 1: Create proveedor
Write-Host "`n1. Creating proveedor..." -ForegroundColor Yellow
$proveedor = @{
    tenant_id = $tenantId
    ruc = "20$(Get-Random -Minimum 100000000 -Maximum 999999999)"
    razon_social = "Test Proveedor OC"
    nombre_comercial = "Test OC"
    email = "test@oc.com"
    telefono = "999999999"
    direccion = "Test Address"
    condiciones_pago = "CREDITO_30"
    dias_credito = 30
    limite_credito = 50000.00
} | ConvertTo-Json

$responseProveedor = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores" -Method Post -Body $proveedor -ContentType "application/json"
$proveedorId = $responseProveedor.data.id
Write-Host "✓ Proveedor created: $proveedorId" -ForegroundColor Green

# Step 2: Create cotizacion
Write-Host "`n2. Creating cotizacion..." -ForegroundColor Yellow
$cotizacion = @{
    tenant_id = $tenantId
    numero = "COT-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = $proveedorId
    fecha_cotizacion = (Get-Date).ToString("yyyy-MM-dd")
    validez_dias = 30
    estado = "BORRADOR"
    observaciones = "Test cotizacion"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440001"
            descripcion = "Product 1"
            cantidad = 10
            precio_unitario = 100.00
        }
    )
} | ConvertTo-Json -Depth 10

$responseCotizacion = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones" -Method Post -Body $cotizacion -ContentType "application/json"
$cotizacionId = $responseCotizacion.data.id
Write-Host "✓ Cotizacion created: $cotizacionId" -ForegroundColor Green

# Step 3: Update to APROBADA
Write-Host "`n3. Updating to APROBADA..." -ForegroundColor Yellow
$update = @{
    tenant_id = $tenantId
    estado = "APROBADA"
} | ConvertTo-Json

$responseUpdate = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId" -Method Put -Body $update -ContentType "application/json"
Write-Host "✓ Updated to APROBADA" -ForegroundColor Green

# Step 4: Convert to OC
Write-Host "`n4. Converting to OC..." -ForegroundColor Yellow
$convertir = @{
    tenant_id = $tenantId
    numero_oc = "OC-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
} | ConvertTo-Json

$responseConvertir = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/convertir-oc" -Method Post -Body $convertir -ContentType "application/json"

if ($responseConvertir.success) {
    Write-Host "✓ Conversion successful!" -ForegroundColor Green
    Write-Host "`nOrden de Compra:" -ForegroundColor Cyan
    Write-Host "  ID: $($responseConvertir.data.id)" -ForegroundColor White
    Write-Host "  Numero: $($responseConvertir.data.numero)" -ForegroundColor White
    Write-Host "  Proveedor ID: $($responseConvertir.data.proveedor_id)" -ForegroundColor White
    Write-Host "  Cotizacion ID: $($responseConvertir.data.cotizacion_id)" -ForegroundColor White
    Write-Host "  Estado: $($responseConvertir.data.estado)" -ForegroundColor White
    Write-Host "  Total: $($responseConvertir.data.total)" -ForegroundColor White
} else {
    Write-Host "✗ Conversion failed: $($responseConvertir.error)" -ForegroundColor Red
}

Write-Host "`n=== TEST COMPLETED ===" -ForegroundColor Cyan
