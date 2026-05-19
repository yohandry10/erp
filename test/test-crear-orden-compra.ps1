# Test script para crear orden de compra
# Actualiza los UUIDs con valores reales de tu base de datos

$baseUrl = "http://localhost:3000"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"  # Tenant por defecto

# Datos de prueba para crear una orden de compra
$body = @{
    tenant_id = $tenantId
    numero = "OC-2024-TEST-001"
    proveedor_id = "PROVEEDOR_UUID_HERE"  # Reemplazar con UUID real
    fecha_orden = "2024-10-24"
    fecha_entrega_esperada = "2024-11-24"
    condiciones_pago = "CREDITO_30"
    dias_credito = 30
    observaciones = "Orden de compra de prueba"
    detalles = @(
        @{
            producto_id = "PRODUCTO_UUID_HERE"  # Reemplazar con UUID real
            descripcion = "Producto de prueba 1"
            cantidad = 10
            precio_unitario = 100.00
            cantidad_recibida = 0
        },
        @{
            producto_id = "PRODUCTO_UUID_HERE_2"  # Reemplazar con UUID real
            descripcion = "Producto de prueba 2"
            cantidad = 5
            precio_unitario = 250.00
            cantidad_recibida = 0
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "=== TEST: Crear Orden de Compra ===" -ForegroundColor Cyan
Write-Host "URL: $baseUrl/api/compras/ordenes" -ForegroundColor Yellow
Write-Host "Body:" -ForegroundColor Yellow
Write-Host $body -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes" `
        -Method Post `
        -Headers @{
            "Content-Type" = "application/json"
        } `
        -Body $body

    Write-Host "`n✅ Orden de compra creada exitosamente!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor Green
}
catch {
    Write-Host "`n❌ Error al crear orden de compra:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}

Write-Host "`n=== TEST: Listar Órdenes de Compra ===" -ForegroundColor Cyan
try {
    $listResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes?tenant_id=$tenantId" `
        -Method Get `
        -Headers @{
            "Content-Type" = "application/json"
        }

    Write-Host "✅ Órdenes obtenidas exitosamente!" -ForegroundColor Green
    Write-Host ($listResponse | ConvertTo-Json -Depth 10) -ForegroundColor Green
}
catch {
    Write-Host "❌ Error al listar órdenes:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
