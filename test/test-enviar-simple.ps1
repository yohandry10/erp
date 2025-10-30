$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "TEST: Enviar Cotizacion" -ForegroundColor Cyan

# Create
$body = @{
    tenant_id = $tenantId
    numero = "COT-$(Get-Date -Format 'HHmmss')"
    proveedor_id = "71337332-52ff-4cb6-bb00-e79ede9e33d6"
    fecha_cotizacion = (Get-Date).ToString("yyyy-MM-dd")
    validez_dias = 30
    detalles = @(@{
        producto_id = "550e8400-e29b-41d4-a716-446655440003"
        descripcion = "Test"
        cantidad = 10
        precio_unitario = 100
    })
} | ConvertTo-Json -Depth 10

$r1 = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones" -Method Post -Body $body -ContentType "application/json"
Write-Host "1. Created: $($r1.data.id) - $($r1.data.estado)"

# Enviar
$id = $r1.data.id
$body2 = @{ tenant_id = $tenantId } | ConvertTo-Json
$r2 = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$id/enviar" -Method Post -Body $body2 -ContentType "application/json"
Write-Host "2. Enviada: $($r2.data.estado)"

if ($r2.data.estado -eq "ENVIADA") {
    Write-Host "SUCCESS!" -ForegroundColor Green
} else {
    Write-Host "FAILED" -ForegroundColor Red
}
