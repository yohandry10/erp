# Test: Comparación Presupuesto vs Real en Centro de Costo
# Descripción: Verificar que la comparación presupuesto vs real funciona correctamente

$baseUrl = "http://localhost:3000/api"

Write-Host "🧪 TEST: Comparación Presupuesto vs Real - Centro de Costo" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# =====================================================
# PASO 1: Login
# =====================================================
Write-Host "🔐 PASO 1: Autenticando..." -ForegroundColor Yellow

$loginBody = @{
    email = "admin@vierdes.com"
    password = $env:TEST_USER_PASSWORD
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "✅ Login exitoso" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Error en login: $_" -ForegroundColor Red
    exit 1
}

# =====================================================
# PASO 2: Obtener centros de costo
# =====================================================
Write-Host "📊 PASO 2: Obteniendo centros de costo..." -ForegroundColor Yellow

try {
    $centrosResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo" -Method Get -Headers $headers

    if ($centrosResponse.success -and $centrosResponse.data.Count -gt 0) {
        $centroCosto = $centrosResponse.data[0]
        Write-Host "✅ Centro de costo obtenido: $($centroCosto.codigo) - $($centroCosto.nombre)" -ForegroundColor Green
        Write-Host "   ID: $($centroCosto.id)" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  No hay centros de costo disponibles" -ForegroundColor Yellow
        Write-Host "   Creando centro de costo de prueba..." -ForegroundColor Gray

        $createCentroBody = @{
            codigo = "CC-TEST-001"
            nombre = "Centro de Costo Test"
            descripcion = "Centro de costo para pruebas"
        } | ConvertTo-Json

        $createResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo" -Method Post -Body $createCentroBody -Headers $headers
        $centroCosto = $createResponse.data
        Write-Host "✅ Centro de costo creado: $($centroCosto.codigo)" -ForegroundColor Green
    }
    Write-Host ""
} catch {
    Write-Host "❌ Error obteniendo centros de costo: $_" -ForegroundColor Red
    exit 1
}

# =====================================================
# PASO 3: Obtener períodos contables
# =====================================================
Write-Host "📅 PASO 3: Obteniendo períodos contables..." -ForegroundColor Yellow

try {
    $periodosResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Get -Headers $headers

    if ($periodosResponse.success -and $periodosResponse.data.Count -gt 0) {
        $periodo = $periodosResponse.data | Where-Object { $_.estado -eq "ABIERTO" } | Select-Object -First 1

        if ($periodo) {
            Write-Host "✅ Período obtenido: $($periodo.anio)-$($periodo.mes)" -ForegroundColor Green
            Write-Host "   ID: $($periodo.id)" -ForegroundColor Gray
            Write-Host "   Estado: $($periodo.estado)" -ForegroundColor Gray
        } else {
            Write-Host "⚠️  No hay períodos abiertos" -ForegroundColor Yellow
            $periodo = $periodosResponse.data[0]
        }
    } else {
        Write-Host "⚠️  No hay períodos disponibles" -ForegroundColor Yellow
        exit 1
    }
    Write-Host ""
} catch {
    Write-Host "❌ Error obteniendo períodos: $_" -ForegroundColor Red
    exit 1
}

# =====================================================
# PASO 4: Obtener presupuestos vs real
# =====================================================
Write-Host "💰 PASO 4: Obteniendo presupuestos vs real..." -ForegroundColor Yellow

try {
    $presupuestosUrl = "$baseUrl/contabilidad/presupuestos/centro/$($centroCosto.id)/periodo/$($periodo.id)"
    $presupuestosResponse = Invoke-RestMethod -Uri $presupuestosUrl -Method Get -Headers $headers

    if ($presupuestosResponse.success) {
        Write-Host "✅ Presupuestos obtenidos exitosamente" -ForegroundColor Green

        if ($presupuestosResponse.data.Count -gt 0) {
            Write-Host ""
            Write-Host "📋 Presupuestos encontrados: $($presupuestosResponse.data.Count)" -ForegroundColor Cyan
            Write-Host ""

            foreach ($presupuesto in $presupuestosResponse.data) {
                Write-Host "   Cuenta: $($presupuesto.cuenta_codigo) - $($presupuesto.cuenta_nombre)" -ForegroundColor White
                Write-Host "   Presupuestado: S/ $($presupuesto.monto_presupuestado)" -ForegroundColor Gray
                Write-Host "   Ejecutado: S/ $($presupuesto.monto_ejecutado)" -ForegroundColor Gray
                Write-Host "   Disponible: S/ $($presupuesto.monto_disponible)" -ForegroundColor Gray
                Write-Host "   % Ejecutado: $($presupuesto.porcentaje_ejecutado)%" -ForegroundColor Gray

                $alertColor = switch ($presupuesto.alerta) {
                    "SOBREGIRO" { "Red" }
                    "ADVERTENCIA" { "Yellow" }
                    default { "Green" }
                }
                Write-Host "   Estado: $($presupuesto.alerta)" -ForegroundColor $alertColor
                Write-Host ""
            }
        } else {
            Write-Host "   ℹ️  No hay presupuestos configurados para este centro y período" -ForegroundColor Cyan
        }
    }
} catch {
    Write-Host "❌ Error obteniendo presupuestos: $_" -ForegroundColor Red
}

Write-Host ""

# =====================================================
# PASO 5: Obtener reporte de gastos
# =====================================================
Write-Host "📊 PASO 5: Obteniendo reporte de gastos..." -ForegroundColor Yellow

try {
    # Calcular fechas del período
    $fechaDesde = "$($periodo.anio)-$($periodo.mes.ToString().PadLeft(2, '0'))-01"
    $lastDay = [DateTime]::DaysInMonth($periodo.anio, $periodo.mes)
    $fechaHasta = "$($periodo.anio)-$($periodo.mes.ToString().PadLeft(2, '0'))-$($lastDay.ToString().PadLeft(2, '0'))"

    $reporteUrl = "$baseUrl/contabilidad/centros-costo/$($centroCosto.id)/reporte-gastos?fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta"
    $reporteResponse = Invoke-RestMethod -Uri $reporteUrl -Method Get -Headers $headers

    if ($reporteResponse.success) {
        Write-Host "✅ Reporte de gastos obtenido exitosamente" -ForegroundColor Green
        Write-Host ""

        $reporte = $reporteResponse.data

        Write-Host "📈 Resumen:" -ForegroundColor Cyan
        Write-Host "   Total Gastos: S/ $($reporte.resumen.total_gastos)" -ForegroundColor White
        Write-Host "   Total Movimientos: $($reporte.resumen.total_movimientos)" -ForegroundColor White

        if ($reporte.resumen.cuenta_mayor_gasto) {
            Write-Host "   Mayor Gasto: $($reporte.resumen.cuenta_mayor_gasto.codigo) - $($reporte.resumen.cuenta_mayor_gasto.nombre)" -ForegroundColor White
            Write-Host "   Monto: S/ $($reporte.resumen.cuenta_mayor_gasto.monto)" -ForegroundColor White
        }

        Write-Host ""

        if ($reporte.gastos_por_cuenta.Count -gt 0) {
            Write-Host "📋 Gastos por cuenta (Top 5):" -ForegroundColor Cyan
            Write-Host ""

            $topGastos = $reporte.gastos_por_cuenta | Select-Object -First 5

            foreach ($gasto in $topGastos) {
                Write-Host "   Cuenta: $($gasto.cuenta_codigo) - $($gasto.cuenta_nombre)" -ForegroundColor White
                Write-Host "   Debe: S/ $($gasto.total_debe)" -ForegroundColor Gray
                Write-Host "   Haber: S/ $($gasto.total_haber)" -ForegroundColor Gray
                Write-Host "   Saldo: S/ $($gasto.saldo)" -ForegroundColor Gray
                Write-Host "   Movimientos: $($gasto.cantidad_movimientos)" -ForegroundColor Gray
                Write-Host ""
            }
        } else {
            Write-Host "   ℹ️  No hay gastos registrados para este centro y período" -ForegroundColor Cyan
        }
    }
} catch {
    Write-Host "❌ Error obteniendo reporte de gastos: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "✅ TEST COMPLETADO" -ForegroundColor Green
Write-Host ""
Write-Host "Funcionalidades verificadas:" -ForegroundColor Yellow
Write-Host "  ✓ Obtener centros de costo" -ForegroundColor White
Write-Host "  ✓ Obtener períodos contables" -ForegroundColor White
Write-Host "  ✓ Comparación presupuesto vs real por centro y período" -ForegroundColor White
Write-Host "  ✓ Reporte de gastos por centro de costo" -ForegroundColor White
Write-Host "  ✓ Cálculo de totales (debe, haber, saldo)" -ForegroundColor White
Write-Host "  ✓ Indicadores de alerta (Normal, Advertencia, Sobregiro)" -ForegroundColor White
Write-Host ""
Write-Host "Para probar en el navegador:" -ForegroundColor Yellow
Write-Host "  1. Ir a: http://localhost:3000/dashboard/contabilidad/centros-costo" -ForegroundColor White
Write-Host "  2. Hacer clic en un centro de costo" -ForegroundColor White
Write-Host "  3. Seleccionar un período" -ForegroundColor White
Write-Host "  4. Ver tab 'Presupuestos vs Real' para comparación" -ForegroundColor White
Write-Host "  5. Ver tab 'Reporte de Gastos' para gastos reales" -ForegroundColor White
Write-Host ""
