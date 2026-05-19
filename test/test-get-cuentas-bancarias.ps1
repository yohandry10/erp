# Test GET /api/finanzas/bancos/cuentas endpoint

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "11111111-1111-1111-1111-111111111111"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "`n=== TEST: GET /api/finanzas/bancos/cuentas ===" -ForegroundColor Cyan
Write-Host "Obteniendo lista de cuentas bancarias..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "`n✅ SUCCESS - Cuentas bancarias obtenidas" -ForegroundColor Green
    Write-Host "`nRespuesta:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10

    if ($response.data) {
        Write-Host "`n📊 Total de cuentas: $($response.data.Count)" -ForegroundColor Magenta

        if ($response.data.Count -gt 0) {
            Write-Host "`n📋 Detalle de cuentas:" -ForegroundColor Yellow
            foreach ($cuenta in $response.data) {
                Write-Host "  - $($cuenta.nombre) ($($cuenta.banco))" -ForegroundColor White
                Write-Host "    Número: $($cuenta.numero_cuenta)" -ForegroundColor Gray
                Write-Host "    Tipo: $($cuenta.tipo_cuenta) | Moneda: $($cuenta.moneda)" -ForegroundColor Gray
                Write-Host "    Saldo: $($cuenta.saldo) | Activa: $($cuenta.activa)" -ForegroundColor Gray
                Write-Host ""
            }
        } else {
            Write-Host "`n⚠️  No hay cuentas bancarias registradas" -ForegroundColor Yellow
        }
    }

} catch {
    Write-Host "`n❌ ERROR" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        Write-Host "`nDetalles del error:" -ForegroundColor Yellow
        $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 10
    }
}

Write-Host "`n=== FIN DEL TEST ===" -ForegroundColor Cyan
