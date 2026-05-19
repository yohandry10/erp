# Script de Validación de Cálculos de Estados Financieros
# Este script valida que los cálculos de los estados financieros sean correctos
# según las reglas contables estándar

$ErrorActionPreference = "Stop"

# Configuración
$API_URL = "http://localhost:3000"
$TENANT_ID = "vierdes-tenant-id"
$ANIO = 2024
$MES = 10

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "VALIDACIÓN DE ESTADOS FINANCIEROS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tenant: $TENANT_ID" -ForegroundColor Yellow
Write-Host "Período: $ANIO-$MES" -ForegroundColor Yellow
Write-Host ""

# Función para hacer peticiones HTTP
function Invoke-ApiRequest {
    param(
        [string]$Method,
        [string]$Endpoint,
        [object]$Body = $null,
        [string]$Token = $null
    )

    $headers = @{
        "Content-Type" = "application/json"
        "x-tenant-id" = $TENANT_ID
    }

    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }

    $params = @{
        Method = $Method
        Uri = "$API_URL$Endpoint"
        Headers = $headers
    }

    if ($Body) {
        $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
    }

    try {
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        Write-Host "Error en petición: $_" -ForegroundColor Red
        throw
    }
}

# 1. Obtener Balance de Comprobación
Write-Host "1️⃣  Obteniendo Balance de Comprobación..." -ForegroundColor Cyan
try {
    $balanceComprobacion = Invoke-ApiRequest -Method GET -Endpoint "/api/contabilidad/estados/balance-comprobacion?anio=$ANIO&mes=$MES"
    Write-Host "✅ Balance de Comprobación obtenido: $($balanceComprobacion.Count) cuentas" -ForegroundColor Green
}
catch {
    Write-Host "❌ Error obteniendo Balance de Comprobación" -ForegroundColor Red
    exit 1
}

# 2. Obtener Estado de Resultados
Write-Host ""
Write-Host "2️⃣  Obteniendo Estado de Resultados..." -ForegroundColor Cyan
try {
    $estadoResultados = Invoke-ApiRequest -Method GET -Endpoint "/api/contabilidad/estados/estado-resultados?anio=$ANIO&mes=$MES"
    Write-Host "✅ Estado de Resultados obtenido" -ForegroundColor Green
}
catch {
    Write-Host "❌ Error obteniendo Estado de Resultados" -ForegroundColor Red
    exit 1
}

# 3. Obtener Balance General
Write-Host ""
Write-Host "3️⃣  Obteniendo Balance General..." -ForegroundColor Cyan
try {
    $balanceGeneral = Invoke-ApiRequest -Method GET -Endpoint "/api/contabilidad/estados/balance-general?anio=$ANIO&mes=$MES"
    Write-Host "✅ Balance General obtenido" -ForegroundColor Green
}
catch {
    Write-Host "❌ Error obteniendo Balance General" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "VALIDACIONES CONTABLES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$errores = @()
$advertencias = @()

# VALIDACIÓN 1: Balance de Comprobación - Debe = Haber
Write-Host ""
Write-Host "📊 VALIDACIÓN 1: Balance de Comprobación" -ForegroundColor Yellow
Write-Host "Verificando que la suma de Debe = suma de Haber" -ForegroundColor Gray

$totalDebe = 0
$totalHaber = 0

foreach ($cuenta in $balanceComprobacion) {
    $totalDebe += $cuenta.debe
    $totalHaber += $cuenta.haber
}

Write-Host "  Total Debe:  $($totalDebe.ToString('N2'))" -ForegroundColor White
Write-Host "  Total Haber: $($totalHaber.ToString('N2'))" -ForegroundColor White

$diferenciaDH = [Math]::Abs($totalDebe - $totalHaber)
if ($diferenciaDH -lt 0.01) {
    Write-Host "  ✅ Balance cuadrado (diferencia: $($diferenciaDH.ToString('N2')))" -ForegroundColor Green
}
else {
    $error = "Balance de Comprobación descuadrado. Diferencia: $($diferenciaDH.ToString('N2'))"
    $errores += $error
    Write-Host "  ❌ $error" -ForegroundColor Red
}

# VALIDACIÓN 2: Estado de Resultados - Cálculos
Write-Host ""
Write-Host "📈 VALIDACIÓN 2: Estado de Resultados" -ForegroundColor Yellow
Write-Host "Verificando cálculos de ingresos, costos y gastos" -ForegroundColor Gray

# Validar Total Ingresos
$totalIngresosCalculado = $estadoResultados.ingresos.ventas + $estadoResultados.ingresos.otros_ingresos
Write-Host "  Ventas:         $($estadoResultados.ingresos.ventas.ToString('N2'))" -ForegroundColor White
Write-Host "  Otros Ingresos: $($estadoResultados.ingresos.otros_ingresos.ToString('N2'))" -ForegroundColor White
Write-Host "  Total Ingresos: $($estadoResultados.ingresos.total_ingresos.ToString('N2'))" -ForegroundColor White

if ([Math]::Abs($totalIngresosCalculado - $estadoResultados.ingresos.total_ingresos) -lt 0.01) {
    Write-Host "  ✅ Total Ingresos correcto" -ForegroundColor Green
}
else {
    $error = "Total Ingresos incorrecto. Esperado: $($totalIngresosCalculado.ToString('N2')), Obtenido: $($estadoResultados.ingresos.total_ingresos.ToString('N2'))"
    $errores += $error
    Write-Host "  ❌ $error" -ForegroundColor Red
}

# Validar Utilidad Bruta
$utilidadBrutaCalculada = $estadoResultados.ingresos.total_ingresos - $estadoResultados.costos.costo_ventas
Write-Host ""
Write-Host "  Costo de Ventas: $($estadoResultados.costos.costo_ventas.ToString('N2'))" -ForegroundColor White
Write-Host "  Utilidad Bruta:  $($estadoResultados.costos.utilidad_bruta.ToString('N2'))" -ForegroundColor White

if ([Math]::Abs($utilidadBrutaCalculada - $estadoResultados.costos.utilidad_bruta) -lt 0.01) {
    Write-Host "  ✅ Utilidad Bruta correcta" -ForegroundColor Green
}
else {
    $error = "Utilidad Bruta incorrecta. Esperado: $($utilidadBrutaCalculada.ToString('N2')), Obtenido: $($estadoResultados.costos.utilidad_bruta.ToString('N2'))"
    $errores += $error
    Write-Host "  ❌ $error" -ForegroundColor Red
}

# Validar Total Gastos
$totalGastosCalculado = $estadoResultados.gastos.gastos_administrativos + $estadoResultados.gastos.gastos_ventas + $estadoResultados.gastos.gastos_financieros
Write-Host ""
Write-Host "  Gastos Administrativos: $($estadoResultados.gastos.gastos_administrativos.ToString('N2'))" -ForegroundColor White
Write-Host "  Gastos de Ventas:       $($estadoResultados.gastos.gastos_ventas.ToString('N2'))" -ForegroundColor White
Write-Host "  Gastos Financieros:     $($estadoResultados.gastos.gastos_financieros.ToString('N2'))" -ForegroundColor White
Write-Host "  Total Gastos:           $($estadoResultados.gastos.total_gastos.ToString('N2'))" -ForegroundColor White

if ([Math]::Abs($totalGastosCalculado - $estadoResultados.gastos.total_gastos) -lt 0.01) {
    Write-Host "  ✅ Total Gastos correcto" -ForegroundColor Green
}
else {
    $error = "Total Gastos incorrecto. Esperado: $($totalGastosCalculado.ToString('N2')), Obtenido: $($estadoResultados.gastos.total_gastos.ToString('N2'))"
    $errores += $error
    Write-Host "  ❌ $error" -ForegroundColor Red
}

# Validar Utilidad Neta
$utilidadNetaCalculada = $estadoResultados.costos.utilidad_bruta - $estadoResultados.gastos.total_gastos
Write-Host ""
Write-Host "  Utilidad Neta: $($estadoResultados.utilidad_neta.ToString('N2'))" -ForegroundColor White

if ([Math]::Abs($utilidadNetaCalculada - $estadoResultados.utilidad_neta) -lt 0.01) {
    Write-Host "  ✅ Utilidad Neta correcta" -ForegroundColor Green
}
else {
    $error = "Utilidad Neta incorrecta. Esperado: $($utilidadNetaCalculada.ToString('N2')), Obtenido: $($estadoResultados.utilidad_neta.ToString('N2'))"
    $errores += $error
    Write-Host "  ❌ $error" -ForegroundColor Red
}

# VALIDACIÓN 3: Balance General - Cálculos de Subtotales
Write-Host ""
Write-Host "🏦 VALIDACIÓN 3: Balance General - Subtotales" -ForegroundColor Yellow
Write-Host "Verificando cálculos de activos, pasivos y patrimonio" -ForegroundColor Gray

# Validar Total Activos Corrientes
$totalActivosCorrientesCalculado = $balanceGeneral.activos.corrientes.efectivo +
                                    $balanceGeneral.activos.corrientes.cuentas_por_cobrar +
                                    $balanceGeneral.activos.corrientes.inventarios +
                                    $balanceGeneral.activos.corrientes.otros_activos

Write-Host ""
Write-Host "  ACTIVOS CORRIENTES:" -ForegroundColor Cyan
Write-Host "    Efectivo:            $($balanceGeneral.activos.corrientes.efectivo.ToString('N2'))" -ForegroundColor White
Write-Host "    Cuentas por Cobrar:  $($balanceGeneral.activos.corrientes.cuentas_por_cobrar.ToString('N2'))" -ForegroundColor White
Write-Host "    Inventarios:         $($balanceGeneral.activos.corrientes.inventarios.ToString('N2'))" -ForegroundColor White
Write-Host "    Otros Activos:       $($balanceGeneral.activos.corrientes.otros_activos.ToString('N2'))" -ForegroundColor White
Write-Host "    Total Corrientes:    $($balanceGeneral.activos.corrientes.total_corrientes.ToString('N2'))" -ForegroundColor White

if ([Math]::Abs($totalActivosCorrientesCalculado - $balanceGeneral.activos.corrientes.total_corrientes) -lt 0.01) {
    Write-Host "    ✅ Total Activos Corrientes correcto" -ForegroundColor Green
}
else {
    $error = "Total Activos Corrientes incorrecto. Esperado: $($totalActivosCorrientesCalculado.ToString('N2')), Obtenido: $($balanceGeneral.activos.corrientes.total_corrientes.ToString('N2'))"
    $errores += $error
    Write-Host "    ❌ $error" -ForegroundColor Red
}

# Validar Activos Fijos Neto
$activosFijosNetoCalculado = $balanceGeneral.activos.no_corrientes.activos_fijos - $balanceGeneral.activos.no_corrientes.depreciacion_acumulada

Write-Host ""
Write-Host "  ACTIVOS NO CORRIENTES:" -ForegroundColor Cyan
Write-Host "    Activos Fijos:           $($balanceGeneral.activos.no_corrientes.activos_fijos.ToString('N2'))" -ForegroundColor White
Write-Host "    Depreciación Acumulada: -$($balanceGeneral.activos.no_corrientes.depreciacion_acumulada.ToString('N2'))" -ForegroundColor White
Write-Host "    Activos Fijos Neto:      $($balanceGeneral.activos.no_corrientes.activos_fijos_neto.ToString('N2'))" -ForegroundColor White

if ([Math]::Abs($activosFijosNetoCalculado - $balanceGeneral.activos.no_corrientes.activos_fijos_neto) -lt 0.01) {
    Write-Host "    ✅ Activos Fijos Neto correcto" -ForegroundColor Green
}
else {
    $error = "Activos Fijos Neto incorrecto. Esperado: $($activosFijosNetoCalculado.ToString('N2')), Obtenido: $($balanceGeneral.activos.no_corrientes.activos_fijos_neto.ToString('N2'))"
    $errores += $error
    Write-Host "    ❌ $error" -ForegroundColor Red
}

# Validar Total Activos No Corrientes
$totalActivosNoCorrientesCalculado = $balanceGeneral.activos.no_corrientes.activos_fijos_neto + $balanceGeneral.activos.no_corrientes.otros_activos

Write-Host "    Otros Activos:           $($balanceGeneral.activos.no_corrientes.otros_activos.ToString('N2'))" -ForegroundColor White
Write-Host "    Total No Corrientes:     $($balanceGeneral.activos.no_corrientes.total_no_corrientes.ToString('N2'))" -ForegroundColor White

if ([Math]::Abs($totalActivosNoCorrientesCalculado - $balanceGeneral.activos.no_corrientes.total_no_corrientes) -lt 0.01) {
    Write-Host "    ✅ Total Activos No Corrientes correcto" -ForegroundColor Green
}
else {
    $error = "Total Activos No Corrientes incorrecto. Esperado: $($totalActivosNoCorrientesCalculado.ToString('N2')), Obtenido: $($balanceGeneral.activos.no_corrientes.total_no_corrientes.ToString('N2'))"
    $errores += $error
    Write-Host "    ❌ $error" -ForegroundColor Red
}

# Validar Total Activos
$totalActivosCalculado = $balanceGeneral.activos.corrientes.total_corrientes + $balanceGeneral.activos.no_corrientes.total_no_corrientes

Write-Host ""
Write-Host "  TOTAL ACTIVOS: $($balanceGeneral.activos.total_activos.ToString('N2'))" -ForegroundColor Cyan

if ([Math]::Abs($totalActivosCalculado - $balanceGeneral.activos.total_activos) -lt 0.01) {
    Write-Host "  ✅ Total Activos correcto" -ForegroundColor Green
}
else {
    $error = "Total Activos incorrecto. Esperado: $($totalActivosCalculado.ToString('N2')), Obtenido: $($balanceGeneral.activos.total_activos.ToString('N2'))"
    $errores += $error
    Write-Host "  ❌ $error" -ForegroundColor Red
}

# Validar Total Pasivos Corrientes
$totalPasivosCorrientesCalculado = $balanceGeneral.pasivos.corrientes.cuentas_por_pagar +
                                    $balanceGeneral.pasivos.corrientes.tributos_por_pagar +
                                    $balanceGeneral.pasivos.corrientes.remuneraciones_por_pagar +
                                    $balanceGeneral.pasivos.corrientes.otros_pasivos

Write-Host ""
Write-Host "  PASIVOS CORRIENTES:" -ForegroundColor Cyan
Write-Host "    Cuentas por Pagar:       $($balanceGeneral.pasivos.corrientes.cuentas_por_pagar.ToString('N2'))" -ForegroundColor White
Write-Host "    Tributos por Pagar:      $($balanceGeneral.pasivos.corrientes.tributos_por_pagar.ToString('N2'))" -ForegroundColor White
Write-Host "    Remuneraciones por Pagar:$($balanceGeneral.pasivos.corrientes.remuneraciones_por_pagar.ToString('N2'))" -ForegroundColor White
Write-Host "    Otros Pasivos:           $($balanceGeneral.pasivos.corrientes.otros_pasivos.ToString('N2'))" -ForegroundColor White
Write-Host "    Total Corrientes:        $($balanceGeneral.pasivos.corrientes.total_corrientes.ToString('N2'))" -ForegroundColor White

if ([Math]::Abs($totalPasivosCorrientesCalculado - $balanceGeneral.pasivos.corrientes.total_corrientes) -lt 0.01) {
    Write-Host "    ✅ Total Pasivos Corrientes correcto" -ForegroundColor Green
}
else {
    $error = "Total Pasivos Corrientes incorrecto. Esperado: $($totalPasivosCorrientesCalculado.ToString('N2')), Obtenido: $($balanceGeneral.pasivos.corrientes.total_corrientes.ToString('N2'))"
    $errores += $error
    Write-Host "    ❌ $error" -ForegroundColor Red
}

# Validar Total Pasivos No Corrientes
$totalPasivosNoCorrientesCalculado = $balanceGeneral.pasivos.no_corrientes.deudas_largo_plazo + $balanceGeneral.pasivos.no_corrientes.otros_pasivos

Write-Host ""
Write-Host "  PASIVOS NO CORRIENTES:" -ForegroundColor Cyan
Write-Host "    Deudas Largo Plazo:      $($balanceGeneral.pasivos.no_corrientes.deudas_largo_plazo.ToString('N2'))" -ForegroundColor White
Write-Host "    Otros Pasivos:           $($balanceGeneral.pasivos.no_corrientes.otros_pasivos.ToString('N2'))" -ForegroundColor White
Write-Host "    Total No Corrientes:     $($balanceGeneral.pasivos.no_corrientes.total_no_corrientes.ToString('N2'))" -ForegroundColor White

if ([Math]::Abs($totalPasivosNoCorrientesCalculado - $balanceGeneral.pasivos.no_corrientes.total_no_corrientes) -lt 0.01) {
    Write-Host "    ✅ Total Pasivos No Corrientes correcto" -ForegroundColor Green
}
else {
    $error = "Total Pasivos No Corrientes incorrecto. Esperado: $($totalPasivosNoCorrientesCalculado.ToString('N2')), Obtenido: $($balanceGeneral.pasivos.no_corrientes.total_no_corrientes.ToString('N2'))"
    $errores += $error
    Write-Host "    ❌ $error" -ForegroundColor Red
}

# Validar Total Pasivos
$totalPasivosCalculado = $balanceGeneral.pasivos.corrientes.total_corrientes + $balanceGeneral.pasivos.no_corrientes.total_no_corrientes

Write-Host ""
Write-Host "  TOTAL PASIVOS: $($balanceGeneral.pasivos.total_pasivos.ToString('N2'))" -ForegroundColor Cyan

if ([Math]::Abs($totalPasivosCalculado - $balanceGeneral.pasivos.total_pasivos) -lt 0.01) {
    Write-Host "  ✅ Total Pasivos correcto" -ForegroundColor Green
}
else {
    $error = "Total Pasivos incorrecto. Esperado: $($totalPasivosCalculado.ToString('N2')), Obtenido: $($balanceGeneral.pasivos.total_pasivos.ToString('N2'))"
    $errores += $error
    Write-Host "  ❌ $error" -ForegroundColor Red
}

# Validar Total Patrimonio
$totalPatrimonioCalculado = $balanceGeneral.patrimonio.capital +
                             $balanceGeneral.patrimonio.resultados_acumulados +
                             $balanceGeneral.patrimonio.resultado_ejercicio

Write-Host ""
Write-Host "  PATRIMONIO:" -ForegroundColor Cyan
Write-Host "    Capital:                 $($balanceGeneral.patrimonio.capital.ToString('N2'))" -ForegroundColor White
Write-Host "    Resultados Acumulados:   $($balanceGeneral.patrimonio.resultados_acumulados.ToString('N2'))" -ForegroundColor White
Write-Host "    Resultado del Ejercicio: $($balanceGeneral.patrimonio.resultado_ejercicio.ToString('N2'))" -ForegroundColor White
Write-Host "    Total Patrimonio:        $($balanceGeneral.patrimonio.total_patrimonio.ToString('N2'))" -ForegroundColor White

if ([Math]::Abs($totalPatrimonioCalculado - $balanceGeneral.patrimonio.total_patrimonio) -lt 0.01) {
    Write-Host "    ✅ Total Patrimonio correcto" -ForegroundColor Green
}
else {
    $error = "Total Patrimonio incorrecto. Esperado: $($totalPatrimonioCalculado.ToString('N2')), Obtenido: $($balanceGeneral.patrimonio.total_patrimonio.ToString('N2'))"
    $errores += $error
    Write-Host "    ❌ $error" -ForegroundColor Red
}

# VALIDACIÓN 4: Ecuación Contable Fundamental
Write-Host ""
Write-Host "⚖️  VALIDACIÓN 4: Ecuación Contable Fundamental" -ForegroundColor Yellow
Write-Host "Verificando: ACTIVOS = PASIVOS + PATRIMONIO" -ForegroundColor Gray

$totalPasivosPatrimonio = $balanceGeneral.pasivos.total_pasivos + $balanceGeneral.patrimonio.total_patrimonio
$diferenciaEcuacion = [Math]::Abs($balanceGeneral.activos.total_activos - $totalPasivosPatrimonio)

Write-Host ""
Write-Host "  Total Activos:             $($balanceGeneral.activos.total_activos.ToString('N2'))" -ForegroundColor White
Write-Host "  Total Pasivos + Patrimonio: $($totalPasivosPatrimonio.ToString('N2'))" -ForegroundColor White
Write-Host "  Diferencia:                 $($diferenciaEcuacion.ToString('N2'))" -ForegroundColor White

if ($diferenciaEcuacion -lt 0.01) {
    Write-Host "  ✅ Ecuación contable balanceada" -ForegroundColor Green
}
else {
    $error = "Ecuación contable NO balanceada. Diferencia: $($diferenciaEcuacion.ToString('N2'))"
    $errores += $error
    Write-Host "  ❌ $error" -ForegroundColor Red
}

# VALIDACIÓN 5: Consistencia entre Estado de Resultados y Balance General
Write-Host ""
Write-Host "🔗 VALIDACIÓN 5: Consistencia entre Estados" -ForegroundColor Yellow
Write-Host "Verificando que el Resultado del Ejercicio coincida" -ForegroundColor Gray

Write-Host ""
Write-Host "  Utilidad Neta (Estado de Resultados): $($estadoResultados.utilidad_neta.ToString('N2'))" -ForegroundColor White
Write-Host "  Resultado Ejercicio (Balance General): $($balanceGeneral.patrimonio.resultado_ejercicio.ToString('N2'))" -ForegroundColor White

$diferenciaResultado = [Math]::Abs($estadoResultados.utilidad_neta - $balanceGeneral.patrimonio.resultado_ejercicio)

if ($diferenciaResultado -lt 0.01) {
    Write-Host "  ✅ Resultado del ejercicio consistente entre estados" -ForegroundColor Green
}
else {
    $error = "Resultado del ejercicio NO consistente. Diferencia: $($diferenciaResultado.ToString('N2'))"
    $errores += $error
    Write-Host "  ❌ $error" -ForegroundColor Red
}

# RESUMEN FINAL
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE VALIDACIÓN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($errores.Count -eq 0 -and $advertencias.Count -eq 0) {
    Write-Host "✅ TODOS LOS CÁLCULOS SON CORRECTOS" -ForegroundColor Green
    Write-Host ""
    Write-Host "Los estados financieros cumplen con todas las validaciones contables:" -ForegroundColor Green
    Write-Host "  ✓ Balance de Comprobación cuadrado (Debe = Haber)" -ForegroundColor Green
    Write-Host "  ✓ Estado de Resultados con cálculos correctos" -ForegroundColor Green
    Write-Host "  ✓ Balance General con subtotales correctos" -ForegroundColor Green
    Write-Host "  ✓ Ecuación contable balanceada (Activos = Pasivos + Patrimonio)" -ForegroundColor Green
    Write-Host "  ✓ Consistencia entre estados financieros" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ APROBADO PARA USO CONTABLE" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "❌ SE ENCONTRARON ERRORES EN LOS CÁLCULOS" -ForegroundColor Red
    Write-Host ""

    if ($errores.Count -gt 0) {
        Write-Host "ERRORES CRÍTICOS ($($errores.Count)):" -ForegroundColor Red
        foreach ($error in $errores) {
            Write-Host "  • $error" -ForegroundColor Red
        }
        Write-Host ""
    }

    if ($advertencias.Count -gt 0) {
        Write-Host "ADVERTENCIAS ($($advertencias.Count)):" -ForegroundColor Yellow
        foreach ($advertencia in $advertencias) {
            Write-Host "  • $advertencia" -ForegroundColor Yellow
        }
        Write-Host ""
    }

    Write-Host "❌ NO APROBADO - REQUIERE CORRECCIONES" -ForegroundColor Red
    exit 1
}
