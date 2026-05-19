# Test GET /api/finanzas/bancos/saldos - Obtener saldos consolidados

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "550e8400-e29b-41d4-a716-446655440001"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: GET /api/finanzas/bancos/saldos" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

try {
    Write-Host "Obteniendo saldos consolidados..." -ForegroundColor Yellow

    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/saldos" `
        -Method Get `
        -Headers $headers

    Write-Host "`n✅ Saldos consolidados obtenidos exitosamente`n" -ForegroundColor Green

    Write-Host "📊 CONSOLIDADO POR MONEDA:" -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────" -ForegroundColor Gray

    if ($response.data.por_moneda -and $response.data.por_moneda.Count -gt 0) {
        foreach ($moneda in $response.data.por_moneda) {
            Write-Host "`nMoneda: $($moneda.moneda)" -ForegroundColor White
            Write-Host "  Saldo Total: $($moneda.saldo_total)" -ForegroundColor Yellow
            Write-Host "  Saldo Activas: $($moneda.saldo_activas)" -ForegroundColor Green
            Write-Host "  Total Cuentas: $($moneda.cantidad_cuentas)" -ForegroundColor Gray
            Write-Host "  Cuentas Activas: $($moneda.cantidad_activas)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  No hay cuentas bancarias registradas" -ForegroundColor Gray
    }

    Write-Host "`n📋 DETALLE POR CUENTA:" -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────" -ForegroundColor Gray

    if ($response.data.por_cuenta -and $response.data.por_cuenta.Count -gt 0) {
        foreach ($cuenta in $response.data.por_cuenta) {
            $estadoColor = if ($cuenta.activa) { "Green" } else { "Red" }
            $estadoTexto = if ($cuenta.activa) { "ACTIVA" } else { "INACTIVA" }

            Write-Host "`n$($cuenta.nombre) ($($cuenta.banco))" -ForegroundColor White
            Write-Host "  Número: $($cuenta.numero_cuenta)" -ForegroundColor Gray
            Write-Host "  Tipo: $($cuenta.tipo_cuenta)" -ForegroundColor Gray
            Write-Host "  Moneda: $($cuenta.moneda)" -ForegroundColor Gray
            Write-Host "  Saldo: $($cuenta.saldo)" -ForegroundColor Yellow
            Write-Host "  Estado: $estadoTexto" -ForegroundColor $estadoColor
        }
    } else {
        Write-Host "  No hay cuentas bancarias registradas" -ForegroundColor Gray
    }

    Write-Host "`n📈 RESUMEN GENERAL:" -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────" -ForegroundColor Gray
    Write-Host "  Total de Cuentas: $($response.data.total_cuentas)" -ForegroundColor White
    Write-Host "  Cuentas Activas: $($response.data.total_cuentas_activas)" -ForegroundColor Green
    Write-Host "  Cuentas Inactivas: $($response.data.total_cuentas - $response.data.total_cuentas_activas)" -ForegroundColor Red

    Write-Host "`n✅ TEST COMPLETADO EXITOSAMENTE`n" -ForegroundColor Green

} catch {
    Write-Host "`n❌ ERROR en la petición:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        Write-Host "`nDetalles del error:" -ForegroundColor Yellow
        $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host ($errorJson | ConvertTo-Json -Depth 10) -ForegroundColor Yellow
    }
}

Write-Host "`n========================================`n" -ForegroundColor Cyan
