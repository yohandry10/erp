# Test script for POST /api/compras/cotizaciones endpoint

$baseUrl = "http://localhost:3001/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "Testing POST /api/compras/cotizaciones endpoint..." -ForegroundColor Cyan

# Test data
$cotizacionData = @{
    tenant_id = $tenantId
    numero = "COT-2024-TEST-001"
    proveedor_id = "550e8400-e29b-41d4-a716-446655440002"
    fecha_cotizacion = "2024-10-24"
    validez_dias = 30
    estado = "BORRADOR"
    observaciones = "Cotización de prueba para testing"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440003"
            descripcion = "Laptop HP 15-dy2021la"
            cantidad = 10
            precio_unitario = 2500.00
        },
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440004"
            descripcion = "Mouse Logitech MX Master 3"
            cantidad = 20
            precio_unitario = 150.00
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "`nRequest Body:" -ForegroundColor Yellow
Write-Host $cotizacionData

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones" `
        -Method Post `
        -Body $cotizacionData `
        -ContentType "application/json" `
        -ErrorAction Stop

    Write-Host "`nResponse:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
    
    if ($response.success) {
        Write-Host "`n✓ Cotización creada exitosamente!" -ForegroundColor Green
        Write-Host "ID: $($response.data.id)" -ForegroundColor Cyan
        Write-Host "Número: $($response.data.numero)" -ForegroundColor Cyan
        Write-Host "Subtotal: $($response.data.subtotal)" -ForegroundColor Cyan
        Write-Host "IGV: $($response.data.igv)" -ForegroundColor Cyan
        Write-Host "Total: $($response.data.total)" -ForegroundColor Cyan
    } else {
        Write-Host "`n✗ Error: $($response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "`n✗ Error al hacer la petición:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "`nDetalles del error:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message
    }
}

Write-Host "`n" -NoNewline
