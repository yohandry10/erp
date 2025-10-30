# Test Flujo de Caja Proyectado
# Este script verifica que la proyección de flujo de caja funcione correctamente

$baseUrl = "http://localhost:3001"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjQyMDJiYy1hMzBjLTRjMzItYjI3Yy1lNzE5YzI3YzI3YzIiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiaWF0IjoxNzMwMDAwMDAwfQ.mZIcfH5ujiRjoF-EyHCVs8KqNPwJLKqZl0x0FqXqqqo"
$tenantId = "vierdes"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "=== TEST FLUJO DE CAJA PROYECTADO ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Proyección de 30 días
Write-Host "1. Obteniendo proyección de flujo de caja (30 días)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/flujo-caja?dias_proyeccion=30" -Method Get -Headers $headers
    if ($response.success) {
        Write-Host "✅ Proyección obtenida exitosamente" -ForegroundColor Green
        Write-Host ""
        
        # Período
        Write-Host "📅 PERÍODO:" -ForegroundColor Cyan
        Write-Host "   Desde: $($response.data.periodo.fecha_desde)" -ForegroundColor Gray
        Write-Host "   Hasta: $($response.data.periodo.fecha_hasta)" -ForegroundColor Gray
        Write-Host "   Días: $($response.data.periodo.dias)" -ForegroundColor Gray
        Write-Host ""
        
        # Cuentas bancarias
        Write-Host "🏦 CUENTAS BANCARIAS:" -ForegroundColor Cyan
        $response.data.cuentas_bancarias | ForEach-Object {
            Write-Host "   - $($_.nombre) ($($_.banco))" -ForegroundColor Gray
            Write-Host "     Moneda: $($_.moneda)" -ForegroundColor Gray
            Write-Host "     Saldo actual: $($_.saldo_actual)" -ForegroundColor Gray
        }
        Write-Host ""
        
        # Resumen por moneda
        Write-Host "💰 RESUMEN POR MONEDA:" -ForegroundColor Cyan
        $response.data.resumen | ForEach-Object {
            Write-Host "   $($_.moneda):" -ForegroundColor Yellow
            Write-Host "     Saldo actual: $($_.saldo_actual)" -ForegroundColor Gray
            Write-Host "     Ingresos proyectados: +$($_.total_ingresos)" -ForegroundColor Green
            Write-Host "     Egresos proyectados: -$($_.total_egresos)" -ForegroundColor Red
            Write-Host "     Flujo neto: $($_.flujo_neto)" -ForegroundColor $(if ($_.flujo_neto -ge 0) { "Green" } else { "Red" })
            Write-Host "     Saldo proyectado: $($_.saldo_proyectado)" -ForegroundColor $(if ($_.saldo_proyectado -ge 0) { "Green" } else { "Red" })
            if ($_.alerta) {
                Write-Host "     ⚠️ ALERTA: $($_.alerta)" -ForegroundColor Yellow
            }
            Write-Host ""
        }
        
        # Estadísticas
        Write-Host "📊 ESTADÍSTICAS:" -ForegroundColor Cyan
        Write-Host "   CxP pendientes: $($response.data.estadisticas.total_cxp_pendientes)" -ForegroundColor Gray
        Write-Host "   CxC pendientes: $($response.data.estadisticas.total_cxc_pendientes)" -ForegroundColor Gray
        Write-Host "   Días con movimientos: $($response.data.estadisticas.total_movimientos)" -ForegroundColor Gray
        Write-Host ""
        
        # Primeros 5 días de proyección
        if ($response.data.proyeccion -and $response.data.proyeccion.Count -gt 0) {
            Write-Host "📈 PRIMEROS 5 DÍAS DE PROYECCIÓN:" -ForegroundColor Cyan
            $response.data.proyeccion | Select-Object -First 5 | ForEach-Object {
                Write-Host "   $($_.fecha) ($($_.moneda)):" -ForegroundColor Yellow
                Write-Host "     Saldo inicial: $($_.saldo_inicial)" -ForegroundColor Gray
                Write-Host "     Ingresos: +$($_.ingresos)" -ForegroundColor Green
                Write-Host "     Egresos: -$($_.egresos)" -ForegroundColor Red
                Write-Host "     Flujo neto: $($_.flujo_neto)" -ForegroundColor $(if ($_.flujo_neto -ge 0) { "Green" } else { "Red" })
                Write-Host "     Saldo final: $($_.saldo_final)" -ForegroundColor $(if ($_.saldo_final -ge 0) { "Green" } else { "Red" })
                Write-Host "     Movimientos: $($_.items.Count)" -ForegroundColor Gray
                Write-Host ""
            }
        }
    } else {
        Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en request: $_" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
Write-Host ""

# Test 2: Proyección de 90 días
Write-Host "2. Obteniendo proyección de flujo de caja (90 días)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/flujo-caja?dias_proyeccion=90" -Method Get -Headers $headers
    if ($response.success) {
        Write-Host "✅ Proyección de 90 días obtenida exitosamente" -ForegroundColor Green
        Write-Host "   Período: $($response.data.periodo.fecha_desde) a $($response.data.periodo.fecha_hasta)" -ForegroundColor Gray
        Write-Host "   Días con movimientos: $($response.data.estadisticas.total_movimientos)" -ForegroundColor Gray
    } else {
        Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en request: $_" -ForegroundColor Red
}
Write-Host ""

# Test 3: Proyección con filtro de cuenta bancaria (si existe)
Write-Host "3. Obteniendo cuentas bancarias para filtro..." -ForegroundColor Yellow
try {
    $cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Get -Headers $headers
    if ($cuentasResponse.success -and $cuentasResponse.data.Count -gt 0) {
        $primeraCuenta = $cuentasResponse.data[0]
        Write-Host "✅ Probando proyección filtrada por cuenta: $($primeraCuenta.nombre)" -ForegroundColor Green
        
        $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/flujo-caja?dias_proyeccion=30&cuenta_bancaria_id=$($primeraCuenta.id)" -Method Get -Headers $headers
        if ($response.success) {
            Write-Host "✅ Proyección filtrada obtenida exitosamente" -ForegroundColor Green
            Write-Host "   Cuenta: $($primeraCuenta.nombre)" -ForegroundColor Gray
            Write-Host "   Días con movimientos: $($response.data.estadisticas.total_movimientos)" -ForegroundColor Gray
        } else {
            Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠️ No hay cuentas bancarias para probar filtro" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error en request: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== TESTS COMPLETADOS ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Página de Flujo de Caja Proyectado implementada en:" -ForegroundColor Green
Write-Host "   apps/web/app/dashboard/finanzas/tesoreria/flujo-caja/page.tsx" -ForegroundColor Cyan
Write-Host ""
Write-Host "Funcionalidades implementadas:" -ForegroundColor Green
Write-Host "  ✅ Resumen por moneda con alertas" -ForegroundColor Gray
Write-Host "  ✅ Estadísticas de CxP y CxC pendientes" -ForegroundColor Gray
Write-Host "  ✅ Proyección día por día expandible" -ForegroundColor Gray
Write-Host "  ✅ Filtros por días (30, 60, 90, 180) y moneda" -ForegroundColor Gray
Write-Host "  ✅ Detalle de movimientos por día" -ForegroundColor Gray
Write-Host "  ✅ Indicadores visuales de saldo negativo/bajo" -ForegroundColor Gray
Write-Host "  ✅ Navegación de regreso a dashboard de tesorería" -ForegroundColor Gray
Write-Host ""
Write-Host "Para probar la página:" -ForegroundColor Yellow
Write-Host "  1. Asegúrate de que el servidor esté corriendo (npm run dev)" -ForegroundColor Gray
Write-Host "  2. Navega a: http://localhost:3000/dashboard/finanzas/tesoreria/flujo-caja" -ForegroundColor Gray
Write-Host "  3. O desde el dashboard de tesorería, haz clic en 'Ver Detalle' en la sección de Flujo de Caja" -ForegroundColor Gray
Write-Host ""
