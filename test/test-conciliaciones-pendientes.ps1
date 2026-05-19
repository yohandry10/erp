# Test: Obtener conciliaciones pendientes
# Endpoint: GET /api/finanzas/conciliacion/pendientes

Write-Host "=== TEST: Obtener Conciliaciones Pendientes ===" -ForegroundColor Cyan
Write-Host ""

# Configuración
$baseUrl = "http://localhost:3002"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "d290f1ee-6c54-4b01-90e6-d701748f0851"

# Obtener conciliaciones pendientes
Write-Host "Obteniendo conciliaciones pendientes..." -ForegroundColor Yellow

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/pendientes" -Method Get -Headers $headers

    Write-Host "✓ Conciliaciones pendientes obtenidas exitosamente" -ForegroundColor Green
    Write-Host ""

    if ($response.data.Count -eq 0) {
        Write-Host "  No hay conciliaciones pendientes" -ForegroundColor Yellow
    } else {
        Write-Host "  Total de conciliaciones pendientes: $($response.data.Count)" -ForegroundColor Cyan
        Write-Host ""

        foreach ($conciliacion in $response.data) {
            Write-Host "  Conciliación ID: $($conciliacion.id)" -ForegroundColor White
            Write-Host "    Período: $($conciliacion.periodo)" -ForegroundColor Gray
            Write-Host "    Estado: $($conciliacion.estado)" -ForegroundColor $(if ($conciliacion.estado -eq 'ABIERTA') { 'Yellow' } else { 'Cyan' })
            Write-Host "    Cuenta: $($conciliacion.cuenta_bancaria.banco) - $($conciliacion.cuenta_bancaria.numero_cuenta)" -ForegroundColor Gray
            Write-Host "    Fecha desde: $($conciliacion.fecha_desde)" -ForegroundColor Gray
            Write-Host "    Fecha hasta: $($conciliacion.fecha_hasta)" -ForegroundColor Gray
            Write-Host "    Saldo libro: $($conciliacion.saldo_libro) $($conciliacion.cuenta_bancaria.moneda)" -ForegroundColor Gray
            Write-Host "    Saldo banco: $($conciliacion.saldo_banco) $($conciliacion.cuenta_bancaria.moneda)" -ForegroundColor Gray
            Write-Host "    Diferencia: $($conciliacion.diferencia) $($conciliacion.cuenta_bancaria.moneda)" -ForegroundColor $(if ([Math]::Abs($conciliacion.diferencia) -gt 0) { 'Red' } else { 'Green' })
            Write-Host ""
            Write-Host "    Estadísticas:" -ForegroundColor Cyan
            Write-Host "      Movimientos sistema: $($conciliacion.estadisticas.total_movimientos_sistema) (Conciliados: $($conciliacion.estadisticas.movimientos_sistema_conciliados), Pendientes: $($conciliacion.estadisticas.movimientos_sistema_pendientes))" -ForegroundColor Gray
            Write-Host "      Movimientos extracto: $($conciliacion.estadisticas.total_movimientos_extracto) (Conciliados: $($conciliacion.estadisticas.movimientos_extracto_conciliados), Pendientes: $($conciliacion.estadisticas.movimientos_extracto_pendientes))" -ForegroundColor Gray
            Write-Host "      Porcentaje de avance: $($conciliacion.estadisticas.porcentaje_avance)%" -ForegroundColor $(if ($conciliacion.estadisticas.porcentaje_avance -ge 80) { 'Green' } elseif ($conciliacion.estadisticas.porcentaje_avance -ge 50) { 'Yellow' } else { 'Red' })
            Write-Host ""
            Write-Host "  " + ("-" * 80) -ForegroundColor DarkGray
            Write-Host ""
        }
    }

    Write-Host ""
    Write-Host "=== Respuesta completa ===" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10

} catch {
    Write-Host "✗ Error obteniendo conciliaciones pendientes:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Green
