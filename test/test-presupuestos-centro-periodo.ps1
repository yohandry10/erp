# Test: GET /api/contabilidad/presupuestos/centro/:centroId/periodo/:periodoId
# Obtener presupuestos por centro de costo y período

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"

Write-Host "🧪 TEST: Obtener presupuestos por centro de costo y período" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Primero, obtener un centro de costo existente
Write-Host "📋 Paso 1: Obteniendo centros de costo disponibles..." -ForegroundColor Yellow
$centrosResponse = Invoke-RestMethod -Uri "$baseUrl/api/contabilidad/centros-costo" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }

if ($centrosResponse.success -and $centrosResponse.data.Count -gt 0) {
    $centroCosto = $centrosResponse.data[0]
    $centroCostoId = $centroCosto.id
    Write-Host "✅ Centro de costo encontrado: $($centroCosto.nombre) (ID: $centroCostoId)" -ForegroundColor Green
} else {
    Write-Host "❌ No se encontraron centros de costo. Creando uno nuevo..." -ForegroundColor Red

    # Crear un centro de costo de prueba
    $nuevoCentro = @{
        codigo = "CC-TEST-001"
        nombre = "Centro de Costo Test"
        descripcion = "Centro de costo para pruebas"
        activo = $true
    } | ConvertTo-Json

    $centroCreado = Invoke-RestMethod -Uri "$baseUrl/api/contabilidad/centros-costo" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        } `
        -Body $nuevoCentro

    $centroCostoId = $centroCreado.data.id
    Write-Host "✅ Centro de costo creado: $centroCostoId" -ForegroundColor Green
}

Write-Host ""

# Obtener un período contable existente
Write-Host "📋 Paso 2: Obteniendo períodos contables disponibles..." -ForegroundColor Yellow
$periodosResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }

if ($periodosResponse.success -and $periodosResponse.data.Count -gt 0) {
    $periodo = $periodosResponse.data[0]
    $periodoId = $periodo.id
    Write-Host "✅ Período encontrado: $($periodo.anio)-$($periodo.mes) (ID: $periodoId)" -ForegroundColor Green
} else {
    Write-Host "❌ No se encontraron períodos. Creando uno nuevo..." -ForegroundColor Red

    # Crear un período de prueba
    $nuevoPeriodo = @{
        anio = 2025
        mes = 1
    } | ConvertTo-Json

    $periodoCreado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        } `
        -Body $nuevoPeriodo

    $periodoId = $periodoCreado.data.id
    Write-Host "✅ Período creado: $periodoId" -ForegroundColor Green
}

Write-Host ""

# Crear algunos presupuestos de prueba si no existen
Write-Host "📋 Paso 3: Verificando presupuestos existentes..." -ForegroundColor Yellow
$presupuestosExistentes = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos?centro_costo_id=$centroCostoId&periodo_contable_id=$periodoId" `
    -Method GET `
    -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }

if ($presupuestosExistentes.data.Count -eq 0) {
    Write-Host "⚠️ No hay presupuestos. Creando presupuestos de prueba..." -ForegroundColor Yellow

    # Obtener cuentas contables
    $cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/plan-cuentas" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        }

    if ($cuentasResponse.success -and $cuentasResponse.data.Count -gt 0) {
        # Crear 2 presupuestos de prueba
        $cuenta1 = $cuentasResponse.data[0]
        $presupuesto1 = @{
            centro_costo_id = $centroCostoId
            cuenta_id = $cuenta1.id
            periodo_contable_id = $periodoId
            monto_presupuestado = 10000.00
            notas = "Presupuesto de prueba 1"
            estado = "ACTIVO"
        } | ConvertTo-Json

        $resultado1 = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" `
            -Method POST `
            -Headers @{
                "Authorization" = "Bearer $token"
                "Content-Type" = "application/json"
            } `
            -Body $presupuesto1

        Write-Host "✅ Presupuesto 1 creado: $($resultado1.data.id)" -ForegroundColor Green

        if ($cuentasResponse.data.Count -gt 1) {
            $cuenta2 = $cuentasResponse.data[1]
            $presupuesto2 = @{
                centro_costo_id = $centroCostoId
                cuenta_id = $cuenta2.id
                periodo_contable_id = $periodoId
                monto_presupuestado = 5000.00
                notas = "Presupuesto de prueba 2"
                estado = "ACTIVO"
            } | ConvertTo-Json

            $resultado2 = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" `
                -Method POST `
                -Headers @{
                    "Authorization" = "Bearer $token"
                    "Content-Type" = "application/json"
                } `
                -Body $presupuesto2

            Write-Host "✅ Presupuesto 2 creado: $($resultado2.data.id)" -ForegroundColor Green
        }
    }
} else {
    Write-Host "✅ Ya existen $($presupuestosExistentes.data.Count) presupuesto(s)" -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🎯 TEST PRINCIPAL: GET presupuestos por centro y período" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

try {
    $url = "$baseUrl/contabilidad/presupuestos/centro/$centroCostoId/periodo/$periodoId"
    Write-Host "📡 URL: $url" -ForegroundColor Gray
    Write-Host ""

    $response = Invoke-RestMethod -Uri $url `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        }

    Write-Host "✅ RESPUESTA EXITOSA" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 DATOS RECIBIDOS:" -ForegroundColor Cyan
    Write-Host "==================" -ForegroundColor Cyan

    # Mostrar información del centro de costo
    Write-Host ""
    Write-Host "🏢 Centro de Costo:" -ForegroundColor Yellow
    Write-Host "  - Código: $($response.data.centro_costo.codigo)" -ForegroundColor White
    Write-Host "  - Nombre: $($response.data.centro_costo.nombre)" -ForegroundColor White

    # Mostrar información del período
    Write-Host ""
    Write-Host "📅 Período:" -ForegroundColor Yellow
    Write-Host "  - Año: $($response.data.periodo.anio)" -ForegroundColor White
    Write-Host "  - Mes: $($response.data.periodo.mes)" -ForegroundColor White
    Write-Host "  - Estado: $($response.data.periodo.estado)" -ForegroundColor White

    # Mostrar resumen
    Write-Host ""
    Write-Host "📈 Resumen:" -ForegroundColor Yellow
    Write-Host "  - Total presupuestos: $($response.data.resumen.total_presupuestos)" -ForegroundColor White
    Write-Host "  - Total presupuestado: S/ $($response.data.resumen.total_presupuestado.ToString('N2'))" -ForegroundColor White
    Write-Host "  - Total ejecutado: S/ $($response.data.resumen.total_ejecutado.ToString('N2'))" -ForegroundColor White
    Write-Host "  - Total disponible: S/ $($response.data.resumen.total_disponible.ToString('N2'))" -ForegroundColor White
    Write-Host "  - % Ejecución global: $($response.data.resumen.porcentaje_ejecucion_global.ToString('N2'))%" -ForegroundColor White

    # Mostrar alertas
    Write-Host ""
    Write-Host "⚠️ Alertas:" -ForegroundColor Yellow
    Write-Host "  - Sobregiros: $($response.data.resumen.alertas.sobregiros)" -ForegroundColor $(if ($response.data.resumen.alertas.sobregiros -gt 0) { "Red" } else { "White" })
    Write-Host "  - Advertencias: $($response.data.resumen.alertas.advertencias)" -ForegroundColor $(if ($response.data.resumen.alertas.advertencias -gt 0) { "Yellow" } else { "White" })
    Write-Host "  - Normales: $($response.data.resumen.alertas.normales)" -ForegroundColor Green

    # Mostrar detalle de presupuestos
    Write-Host ""
    Write-Host "💰 Detalle de Presupuestos:" -ForegroundColor Yellow
    Write-Host "============================" -ForegroundColor Yellow

    foreach ($presupuesto in $response.data.presupuestos) {
        Write-Host ""
        Write-Host "  📌 Cuenta: $($presupuesto.plan_cuentas.codigo) - $($presupuesto.plan_cuentas.nombre)" -ForegroundColor Cyan
        Write-Host "     - Presupuestado: S/ $($presupuesto.monto_presupuestado.ToString('N2'))" -ForegroundColor White
        Write-Host "     - Ejecutado: S/ $($presupuesto.monto_ejecutado.ToString('N2'))" -ForegroundColor White
        Write-Host "     - Comprometido: S/ $($presupuesto.monto_comprometido.ToString('N2'))" -ForegroundColor White
        Write-Host "     - Disponible: S/ $($presupuesto.monto_disponible.ToString('N2'))" -ForegroundColor White
        Write-Host "     - % Ejecutado: $($presupuesto.porcentaje_ejecutado.ToString('N2'))%" -ForegroundColor White

        $alertColor = switch ($presupuesto.alerta) {
            "SOBREGIRO" { "Red" }
            "ADVERTENCIA" { "Yellow" }
            default { "Green" }
        }
        Write-Host "     - Alerta: $($presupuesto.alerta)" -ForegroundColor $alertColor
    }

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "✅ TEST COMPLETADO EXITOSAMENTE" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Cyan

    # Mostrar JSON completo
    Write-Host ""
    Write-Host "📄 JSON Completo:" -ForegroundColor Gray
    $response | ConvertTo-Json -Depth 10

} catch {
    Write-Host ""
    Write-Host "❌ ERROR EN LA PRUEBA" -ForegroundColor Red
    Write-Host "=====================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Mensaje: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""

    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $reader.DiscardBufferedData()
        $responseBody = $reader.ReadToEnd()
        Write-Host "Respuesta del servidor:" -ForegroundColor Yellow
        Write-Host $responseBody -ForegroundColor Red
    }
}
