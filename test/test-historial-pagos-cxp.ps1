# Test: Obtener historial de pagos de una CxP
# Endpoint: GET /api/finanzas/cxp/:id/pagos

$API_URL = "http://localhost:3002"

Write-Host "=== TEST: Historial de Pagos CxP ===" -ForegroundColor Cyan
Write-Host ""

# Primero, obtener una CxP existente con pagos
Write-Host "1. Obteniendo lista de CxP..." -ForegroundColor Yellow
$listResponse = Invoke-RestMethod -Uri "$API_URL/api/finanzas/cxp" -Method GET -ContentType "application/json"

if ($listResponse.success -and $listResponse.data.Count -gt 0) {
    # Buscar una CxP que tenga saldo menor al total (indica que tiene pagos)
    $cxpConPagos = $listResponse.data | Where-Object { $_.saldo -lt $_.total } | Select-Object -First 1

    if ($cxpConPagos) {
        $cxpId = $cxpConPagos.id
        Write-Host "   ✓ CxP encontrada: $($cxpConPagos.numero_documento)" -ForegroundColor Green
        Write-Host "     Total: $($cxpConPagos.total) $($cxpConPagos.moneda)" -ForegroundColor Gray
        Write-Host "     Saldo: $($cxpConPagos.saldo) $($cxpConPagos.moneda)" -ForegroundColor Gray
        Write-Host "     Pagado: $($cxpConPagos.total - $cxpConPagos.saldo) $($cxpConPagos.moneda)" -ForegroundColor Gray
        Write-Host ""

        # Obtener historial de pagos
        Write-Host "2. Obteniendo historial de pagos..." -ForegroundColor Yellow
        $historialResponse = Invoke-RestMethod -Uri "$API_URL/api/finanzas/cxp/$cxpId/pagos" -Method GET -ContentType "application/json"

        if ($historialResponse.success) {
            Write-Host "   ✓ Historial obtenido exitosamente" -ForegroundColor Green
            Write-Host ""

            if ($historialResponse.data.Count -gt 0) {
                Write-Host "   📊 PAGOS REGISTRADOS ($($historialResponse.data.Count)):" -ForegroundColor Cyan
                Write-Host ""

                $totalPagado = 0
                foreach ($pago in $historialResponse.data) {
                    Write-Host "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
                    Write-Host "   Fecha:           $($pago.fecha)" -ForegroundColor White
                    Write-Host "   Monto:           $($pago.monto) $($cxpConPagos.moneda)" -ForegroundColor Green
                    Write-Host "   Método:          $($pago.metodo_pago)" -ForegroundColor White
                    Write-Host "   Referencia:      $($pago.referencia)" -ForegroundColor Gray

                    if ($pago.cuenta_bancaria) {
                        Write-Host "   Cuenta:          $($pago.cuenta_bancaria.banco) - $($pago.cuenta_bancaria.numero_cuenta)" -ForegroundColor White
                    }

                    $estadoConciliado = if ($pago.conciliado) { "✓ Conciliado" } else { "⏳ Pendiente" }
                    $colorConciliado = if ($pago.conciliado) { "Green" } else { "Yellow" }
                    Write-Host "   Estado:          $estadoConciliado" -ForegroundColor $colorConciliado
                    Write-Host ""

                    $totalPagado += $pago.monto
                }

                Write-Host "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
                Write-Host "   TOTAL PAGADO:    $totalPagado $($cxpConPagos.moneda)" -ForegroundColor Green
                Write-Host ""

                # Verificar que el total pagado coincida
                $totalEsperado = $cxpConPagos.total - $cxpConPagos.saldo
                if ([Math]::Abs($totalPagado - $totalEsperado) -lt 0.01) {
                    Write-Host "   ✓ Verificación: Total pagado coincide con (Total - Saldo)" -ForegroundColor Green
                } else {
                    Write-Host "   ⚠ Advertencia: Total pagado ($totalPagado) no coincide con esperado ($totalEsperado)" -ForegroundColor Yellow
                }
            } else {
                Write-Host "   ℹ No hay pagos registrados para esta CxP" -ForegroundColor Yellow
                Write-Host "   (Esto puede indicar que el saldo se actualizó sin crear movimientos bancarios)" -ForegroundColor Gray
            }
        } else {
            Write-Host "   ✗ Error obteniendo historial: $($historialResponse.message)" -ForegroundColor Red
        }
    } else {
        Write-Host "   ℹ No se encontraron CxP con pagos aplicados" -ForegroundColor Yellow
        Write-Host "   Probando con la primera CxP disponible..." -ForegroundColor Gray
        Write-Host ""

        $cxpId = $listResponse.data[0].id
        Write-Host "   CxP seleccionada: $($listResponse.data[0].numero_documento)" -ForegroundColor White

        $historialResponse = Invoke-RestMethod -Uri "$API_URL/api/finanzas/cxp/$cxpId/pagos" -Method GET -ContentType "application/json"

        if ($historialResponse.success) {
            Write-Host "   ✓ Endpoint funciona correctamente" -ForegroundColor Green
            Write-Host "   Pagos encontrados: $($historialResponse.data.Count)" -ForegroundColor White
        } else {
            Write-Host "   ✗ Error: $($historialResponse.message)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "   ✗ No se encontraron CxP en el sistema" -ForegroundColor Red
    Write-Host "   Cree una CxP y aplique un pago primero" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== FIN DEL TEST ===" -ForegroundColor Cyan
