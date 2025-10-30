# Debug test
$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

# Create proveedor
$proveedor = @{
    tenant_id = $tenantId
    ruc = "20$(Get-Random -Minimum 100000000 -Maximum 999999999)"
    razon_social = "Test Proveedor"
    nombre_comercial = "Test"
    email = "test@test.com"
    telefono = "999999999"
    direccion = "Test"
    condiciones_pago = "CREDITO_30"
    dias_credito = 30
    limite_credito = 50000.00
} | ConvertTo-Json

$responseProveedor = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores" -Method Post -Body $proveedor -ContentType "application/json"
$proveedorId = $responseProveedor.data.id
Write-Host "Proveedor ID: $proveedorId"

# Create cotizacion
$cotizacion = @{
    tenant_id = $tenantId
    numero = "COT-DEBUG-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = $proveedorId
    fecha_cotizacion = (Get-Date).ToString("yyyy-MM-dd")
    validez_dias = 30
    estado = "BORRADOR"
    observaciones = "Test"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440001"
            descripcion = "Product 1"
            cantidad = 10
            precio_unitario = 100.00
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "`nCreating cotizacion..."
$responseCotizacion = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones" -Method Post -Body $cotizacion -ContentType "application/json"

Write-Host "`nFull response:"
$responseCotizacion | ConvertTo-Json -Depth 10
