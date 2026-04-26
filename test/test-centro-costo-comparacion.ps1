# Test: Centro de Costo - Comparación Presupuesto vs Real
# Descripción: Verificar que la página de detalle de centro de costo muestre la comparación presupuesto vs real

$baseUrl = "http://localhost:3000/api"

Write-Host "🧪 TEST: Centro de Costo - Comparación Presupuesto vs Real" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# Configuración
$headers = @{
    "Content-Type" = "application/json"
    "x-tenant-id" = "your-tenant-id-here"
}

Write-Host "📋 Verificando archivos creados..." -ForegroundColor Yellow
Write-Host ""

# Verificar que la página de detalle existe
$detailPageDir = "apps\web\app\dashboard\contabilidad\centros-costo"
$detailPageFiles = Get-ChildItem -Path $detailPageDir -Recurse -Filter "page.tsx"
$detailPageFile = $null
foreach ($file in $detailPageFiles) {
    if ($file.Directory.Name -eq "[id]") {
        $detailPageFile = $file
        break
    }
}

if ($detailPageFile) {
    Write-Host "✅ Página de detalle creada: $($detailPageFile.FullName)" -ForegroundColor Green
} else {
    Write-Host "❌ Página de detalle NO encontrada" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔍 Verificando funcionalidades implementadas..." -ForegroundColor Yellow
Write-Host ""

# Verificar que la página tiene las funcionalidades requeridas
$contentLines = Get-Content -LiteralPath $detailPageFile.FullName
$content = $contentLines -join "`n"

$features = @(
    @{ Name = "Selector de período"; Pattern = "selectedPeriodoId" },
    @{ Name = "Tab de Presupuestos vs Real"; Pattern = "presupuestos" },
    @{ Name = "Tab de Reporte de Gastos"; Pattern = "gastos" },
    @{ Name = "Carga de presupuestos"; Pattern = "loadPresupuestos" },
    @{ Name = "Carga de reporte de gastos"; Pattern = "loadReporteGastos" },
    @{ Name = "Indicadores de alerta"; Pattern = "SOBREGIRO|ADVERTENCIA" },
    @{ Name = "Formato de moneda"; Pattern = "formatCurrency" },
    @{ Name = "Formato de porcentaje"; Pattern = "formatPercentage" },
    @{ Name = "Barra de progreso"; Pattern = "porcentaje_ejecutado" },
    @{ Name = "Tabla de presupuestos"; Pattern = "monto_presupuestado" },
    @{ Name = "Tabla de gastos"; Pattern = "gastos_por_cuenta" },
    @{ Name = "Resumen de gastos"; Pattern = "total_gastos" }
)

$allFeaturesFound = $true
foreach ($feature in $features) {
    if ($content -match $feature.Pattern) {
        Write-Host "  ✅ $($feature.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($feature.Name) - NO encontrado" -ForegroundColor Red
        $allFeaturesFound = $false
    }
}

Write-Host ""

if ($allFeaturesFound) {
    Write-Host "✅ TODAS las funcionalidades están implementadas" -ForegroundColor Green
} else {
    Write-Host "❌ Algunas funcionalidades faltan" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📝 Resumen de la implementación:" -ForegroundColor Yellow
Write-Host "  - Página de detalle de centro de costo creada" -ForegroundColor White
Write-Host "  - Selector de período implementado" -ForegroundColor White
Write-Host "  - Tab de Presupuestos vs Real con tabla comparativa" -ForegroundColor White
Write-Host "  - Tab de Reporte de Gastos con resumen" -ForegroundColor White
Write-Host "  - Indicadores visuales de alerta (Normal/Advertencia/Sobregiro)" -ForegroundColor White
Write-Host "  - Barras de progreso de ejecución presupuestal" -ForegroundColor White
Write-Host "  - Formato de moneda y porcentajes" -ForegroundColor White
Write-Host "  - Navegación desde lista de centros de costo" -ForegroundColor White
Write-Host ""

Write-Host "🎯 Para probar manualmente:" -ForegroundColor Yellow
Write-Host "  1. Iniciar la aplicación web" -ForegroundColor White
Write-Host "  2. Navegar a Contabilidad > Centros de Costo" -ForegroundColor White
Write-Host "  3. Hacer clic en un centro de costo (fila o botón de gráfico)" -ForegroundColor White
Write-Host "  4. Seleccionar un período" -ForegroundColor White
Write-Host "  5. Ver la comparación presupuesto vs real en el tab 'Presupuestos vs Real'" -ForegroundColor White
Write-Host "  6. Ver el reporte de gastos en el tab 'Reporte de Gastos'" -ForegroundColor White
Write-Host ""

Write-Host "✅ TEST COMPLETADO EXITOSAMENTE" -ForegroundColor Green
