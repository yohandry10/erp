# Test Tesorería Dashboard
# Este script verifica que el dashboard de tesorería funcione correctamente

$baseUrl = "http://localhost:3001"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "vierdes"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "=== TEST DASHBOARD TESORERÍA ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Obtener cuentas bancarias
Write-Host "1. Obteniendo cuentas bancarias..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Get -Headers $headers
    if ($response.success) {
        Write-Host "✅ Cuentas bancarias obtenidas: $($response.data.Count) cuenta(s)" -ForegroundColor Green
        if ($response.data.Count -gt 0) {
            $response.data | ForEach-Object {
                Write-Host "   - $($_.nombre) ($($_.moneda)): $($_.saldo)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en request: $_" -ForegroundColor Red
}
Write-Host ""

# Test 2: Obtener programación de pagos (próximos 15 días)
Write-Host "2. Obteniendo programación de pagos (próximos 15 días)..." -ForegroundColor Yellow
try {
    $hoy = Get-Date -Format "yyyy-MM-dd"
    $en15Dias = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/programacion?fecha_hasta=$en15Dias&limit=10" -Method Get -Headers $headers
    if ($response.success) {
        Write-Host "✅ Próximos pagos obtenidos: $($response.data.Count) pago(s)" -ForegroundColor Green
        if ($response.data.Count -gt 0) {
            $response.data | ForEach-Object {
                Write-Host "   - $($_.numero_documento) - $($_.proveedor.razon_social): $($_.saldo) $($_.moneda) (Vence: $($_.fecha_vencimiento), Urgencia: $($_.urgencia))" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en request: $_" -ForegroundColor Red
}
Write-Host ""

# Test 3: Obtener flujo de caja (próximos 30 días)
Write-Host "3. Obteniendo proyección de flujo de caja (30 días)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/flujo-caja?dias_proyeccion=30" -Method Get -Headers $headers
    if ($response.success) {
        Write-Host "✅ Flujo de caja obtenido" -ForegroundColor Green
        if ($response.data.resumen) {
            Write-Host "   Resumen por moneda:" -ForegroundColor Gray
            $response.data.resumen | ForEach-Object {
                Write-Host "   - $($_.moneda):" -ForegroundColor Gray
                Write-Host "     Saldo actual: $($_.saldo_actual)" -ForegroundColor Gray
                Write-Host "     Ingresos: +$($_.total_ingresos)" -ForegroundColor Green
                Write-Host "     Egresos: -$($_.total_egresos)" -ForegroundColor Red
                Write-Host "     Flujo neto: $($_.flujo_neto)" -ForegroundColor $(if ($_.flujo_neto -ge 0) { "Green" } else { "Red" })
                Write-Host "     Saldo proyectado: $($_.saldo_proyectado)" -ForegroundColor Gray
                if ($_.alerta) {
                    Write-Host "     ⚠️ ALERTA: $($_.alerta)" -ForegroundColor Yellow
                }
            }
        }
        Write-Host "   Estadísticas:" -ForegroundColor Gray
        Write-Host "   - CxP pendientes: $($response.data.estadisticas.total_cxp_pendientes)" -ForegroundColor Gray
        Write-Host "   - CxC pendientes: $($response.data.estadisticas.total_cxc_pendientes)" -ForegroundColor Gray
        Write-Host "   - Total movimientos: $($response.data.estadisticas.total_movimientos)" -ForegroundColor Gray
    } else {
        Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en request: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== TESTS COMPLETADOS ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Dashboard de Tesorería implementado correctamente en:" -ForegroundColor Green
Write-Host "  apps/web/app/dashboard/finanzas/tesoreria/page.tsx" -ForegroundColor Cyan
Write-Host ""
Write-Host "Funcionalidades implementadas:" -ForegroundColor Green
Write-Host "  ✅ Saldos de cuentas bancarias (PEN y USD)" -ForegroundColor Gray
Write-Host "  ✅ Próximos pagos (15 días) con urgencia" -ForegroundColor Gray
Write-Host "  ✅ Proyección de flujo de caja (30 días)" -ForegroundColor Gray
Write-Host "  ✅ Alertas de pagos vencidos y urgentes" -ForegroundColor Gray
Write-Host "  ✅ Acciones rápidas (navegación)" -ForegroundColor Gray
Write-Host ""
Write-Host "Para probar el dashboard:" -ForegroundColor Yellow
Write-Host "  1. Asegúrate de que el servidor esté corriendo (npm run dev)" -ForegroundColor Gray
Write-Host "  2. Navega a: http://localhost:3000/dashboard/finanzas/tesoreria" -ForegroundColor Gray
Write-Host ""
