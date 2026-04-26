# Test: GET /api/contabilidad/presupuestos/comparacion/:periodoId
# Descripción: Obtener comparación de presupuesto vs real para todos los centros de costo en un período

$baseUrl = "http://localhost:3000/api"

Write-Host "🧪 TEST: Comparación Presupuesto vs Real por Período" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Login
Write-Host "1️⃣ Iniciando sesión..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = "Admin123!"
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

# 2. Obtener períodos disponibles
Write-Host "2️⃣ Obteniendo períodos contables..." -ForegroundColor Yellow
try {
    $periodosResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Get -Headers $headers
    
    if ($periodosResponse.data.Count -eq 0) {
        Write-Host "⚠️ No hay períodos contables creados" -ForegroundColor Yellow
        Write-Host "   Creando período de prueba..." -ForegroundColor Yellow
        
        $createPeriodoBody = @{
            anio = 2025
            mes = 1
        } | ConvertTo-Json
        
        $periodoResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Post -Body $createPeriodoBody -Headers $headers
        $periodoId = $periodoResponse.data.id
        Write-Host "✅ Período creado: $periodoId" -ForegroundColor Green
    } else {
        $periodoId = $periodosResponse.data[0].id
        $periodoInfo = $periodosResponse.data[0]
        Write-Host "✅ Usando período existente: $($periodoInfo.anio)-$($periodoInfo.mes.ToString().PadLeft(2, '0'))" -ForegroundColor Green
        Write-Host "   ID: $periodoId" -ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "❌ Error obteniendo períodos: $_" -ForegroundColor Red
    exit 1
}

# 3. Obtener comparación presupuesto vs real
Write-Host "3️⃣ Obteniendo comparación presupuesto vs real..." -ForegroundColor Yellow
Write-Host "   Período ID: $periodoId" -ForegroundColor Gray
Write-Host ""

try {
    $comparacionResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/comparacion/$periodoId" -Method Get -Headers $headers
    
    Write-Host "✅ Comparación obtenida exitosamente" -ForegroundColor Green
    Write-Host ""
    
    # Mostrar información del período
    Write-Host "📅 PERÍODO:" -ForegroundColor Cyan
    Write-Host "   Año: $($comparacionResponse.data.periodo.anio)" -ForegroundColor White
    Write-Host "   Mes: $($comparacionResponse.data.periodo.mes)" -ForegroundColor White
    Write-Host "   Estado: $($comparacionResponse.data.periodo.estado)" -ForegroundColor White
    Write-Host "   Descripción: $($comparacionResponse.data.periodo.descripcion)" -ForegroundColor White
    Write-Host ""
    
    # Mostrar resumen global
    Write-Host "📊 RESUMEN GLOBAL:" -ForegroundColor Cyan
    $resumen = $comparacionResponse.data.resumen_global
    Write-Host "   Total Centros de Costo: $($resumen.total_centros)" -ForegroundColor White
    Write-Host "   Total Cuentas Presupuestadas: $($resumen.total_cuentas)" -ForegroundColor White
    Write-Host "   Total Presupuestado: S/ $($resumen.total_presupuestado.ToString('N2'))" -ForegroundColor White
    Write-Host "   Total Ejecutado: S/ $($resumen.total_ejecutado.ToString('N2'))" -ForegroundColor White
    Write-Host "   Total Comprometido: S/ $($resumen.total_comprometido.ToString('N2'))" -ForegroundColor White
    Write-Host "   Total Disponible: S/ $($resumen.total_disponible.ToString('N2'))" -ForegroundColor White
    Write-Host "   Total Variación: S/ $($resumen.total_variacion.ToString('N2'))" -ForegroundColor White
    Write-Host "   % Ejecución: $($resumen.porcentaje_ejecucion.ToString('N2'))%" -ForegroundColor White
    Write-Host "   % Variación: $($resumen.variacion_porcentaje.ToString('N2'))%" -ForegroundColor White
    Write-Host ""
    
    # Mostrar alertas
    Write-Host "🚨 ALERTAS:" -ForegroundColor Cyan
    Write-Host "   Sobregiros: $($resumen.alertas.sobregiros)" -ForegroundColor $(if ($resumen.alertas.sobregiros -gt 0) { "Red" } else { "Green" })
    Write-Host "   Advertencias: $($resumen.alertas.advertencias)" -ForegroundColor $(if ($resumen.alertas.advertencias -gt 0) { "Yellow" } else { "Green" })
    Write-Host "   Normales: $($resumen.alertas.normales)" -ForegroundColor Green
    Write-Host ""
    
    # Mostrar detalle por centro de costo
    if ($comparacionResponse.data.centros_costo.Count -gt 0) {
        Write-Host "🏢 DETALLE POR CENTRO DE COSTO:" -ForegroundColor Cyan
        Write-Host ""
        
        foreach ($centro in $comparacionResponse.data.centros_costo) {
            $alertColor = switch ($centro.totales.alerta) {
                "SOBREGIRO" { "Red" }
                "ADVERTENCIA" { "Yellow" }
                default { "Green" }
            }
            
            Write-Host "   📍 $($centro.centro_costo.nombre) [$($centro.centro_costo.codigo)]" -ForegroundColor White
            Write-Host "      Presupuestado: S/ $($centro.totales.presupuestado.ToString('N2'))" -ForegroundColor Gray
            Write-Host "      Ejecutado: S/ $($centro.totales.ejecutado.ToString('N2'))" -ForegroundColor Gray
            Write-Host "      Disponible: S/ $($centro.totales.disponible.ToString('N2'))" -ForegroundColor Gray
            Write-Host "      % Ejecución: $($centro.totales.porcentaje_ejecucion.ToString('N2'))%" -ForegroundColor Gray
            Write-Host "      Variación: S/ $($centro.totales.variacion.ToString('N2')) ($($centro.totales.variacion_porcentaje.ToString('N2'))%)" -ForegroundColor Gray
            Write-Host "      Alerta: $($centro.totales.alerta)" -ForegroundColor $alertColor
            Write-Host "      Cuentas: $($centro.cuentas.Count)" -ForegroundColor Gray
            Write-Host ""
            
            # Mostrar primeras 3 cuentas como ejemplo
            if ($centro.cuentas.Count -gt 0) {
                Write-Host "      📋 Cuentas (mostrando primeras 3):" -ForegroundColor Gray
                $cuentasMostrar = $centro.cuentas | Select-Object -First 3
                foreach ($cuenta in $cuentasMostrar) {
                    $cuentaAlertColor = switch ($cuenta.alerta) {
                        "SOBREGIRO" { "Red" }
                        "ADVERTENCIA" { "Yellow" }
                        default { "Green" }
                    }
                    Write-Host "         • $($cuenta.cuenta.codigo) - $($cuenta.cuenta.nombre)" -ForegroundColor White
                    Write-Host "           Presup: S/ $($cuenta.monto_presupuestado.ToString('N2')) | Ejec: S/ $($cuenta.monto_ejecutado.ToString('N2')) | Disp: S/ $($cuenta.monto_disponible.ToString('N2'))" -ForegroundColor Gray
                    Write-Host "           % Ejec: $($cuenta.porcentaje_ejecutado.ToString('N2'))% | Var: S/ $($cuenta.variacion.ToString('N2')) ($($cuenta.variacion_porcentaje.ToString('N2'))%) | Alerta: $($cuenta.alerta)" -ForegroundColor $cuentaAlertColor
                }
                if ($centro.cuentas.Count -gt 3) {
                    Write-Host "         ... y $($centro.cuentas.Count - 3) cuenta(s) más" -ForegroundColor Gray
                }
                Write-Host ""
            }
        }
    } else {
        Write-Host "ℹ️ No hay presupuestos registrados para este período" -ForegroundColor Yellow
        Write-Host ""
    }
    
    Write-Host "✅ TEST COMPLETADO EXITOSAMENTE" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Mensaje: $($comparacionResponse.message)" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Error obteniendo comparación: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Detalles del error:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "🎉 Test finalizado" -ForegroundColor Green
