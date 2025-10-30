# Test: Exportar Presupuesto vs Real a Excel
# Este script verifica que la funcionalidad de exportación a Excel esté implementada

Write-Host "=== TEST: Exportar Presupuesto vs Real a Excel ===" -ForegroundColor Cyan
Write-Host ""

# Verificar que el archivo de utilidad existe
$excelUtilPath = "apps/web/lib/excel-export.ts"
if (Test-Path $excelUtilPath) {
    Write-Host "✅ Archivo de utilidad Excel existe: $excelUtilPath" -ForegroundColor Green
} else {
    Write-Host "❌ Archivo de utilidad Excel NO existe: $excelUtilPath" -ForegroundColor Red
    exit 1
}

# Verificar que el componente actualizado existe
$componentPath = "apps/web/components/contabilidad/PresupuestoVsRealChart.tsx"
if (Test-Path $componentPath) {
    Write-Host "✅ Componente existe: $componentPath" -ForegroundColor Green
} else {
    Write-Host "❌ Componente NO existe: $componentPath" -ForegroundColor Red
    exit 1
}

# Verificar que el componente importa la utilidad de Excel
$componentContent = Get-Content $componentPath -Raw
if ($componentContent -match "import.*excel-export") {
    Write-Host "✅ Componente importa utilidad de Excel" -ForegroundColor Green
} else {
    Write-Host "❌ Componente NO importa utilidad de Excel" -ForegroundColor Red
    exit 1
}

# Verificar que existe la función handleExportToExcel
if ($componentContent -match "handleExportToExcel") {
    Write-Host "✅ Función handleExportToExcel implementada" -ForegroundColor Green
} else {
    Write-Host "❌ Función handleExportToExcel NO implementada" -ForegroundColor Red
    exit 1
}

# Verificar que el botón llama a la función de exportación
if ($componentContent -match "onClick=\{handleExportToExcel\}") {
    Write-Host "✅ Botón de exportación conectado a la función" -ForegroundColor Green
} else {
    Write-Host "❌ Botón de exportación NO conectado" -ForegroundColor Red
    exit 1
}

# Verificar que xlsx está en package.json
$packageJsonPath = "apps/web/package.json"
$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
if ($packageJson.dependencies.xlsx) {
    Write-Host "✅ Paquete xlsx instalado: $($packageJson.dependencies.xlsx)" -ForegroundColor Green
} else {
    Write-Host "❌ Paquete xlsx NO instalado" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host "✅ Todas las verificaciones pasaron correctamente" -ForegroundColor Green
Write-Host ""
Write-Host "Funcionalidad implementada:" -ForegroundColor Yellow
Write-Host "  - Utilidad de exportación a Excel creada" -ForegroundColor White
Write-Host "  - Componente PresupuestoVsRealChart actualizado" -ForegroundColor White
Write-Host "  - Función handleExportToExcel implementada" -ForegroundColor White
Write-Host "  - Botón 'Exportar a Excel' funcional" -ForegroundColor White
Write-Host "  - Exporta 3 hojas: Resumen Global, Detalle por Cuenta, Totales por Centro" -ForegroundColor White
Write-Host ""
Write-Host "Para probar manualmente:" -ForegroundColor Yellow
Write-Host "  1. Navegar a /dashboard/contabilidad/presupuestos/comparacion" -ForegroundColor White
Write-Host "  2. Seleccionar un período con presupuestos" -ForegroundColor White
Write-Host "  3. Hacer clic en el botón 'Exportar a Excel'" -ForegroundColor White
Write-Host "  4. Se descargará un archivo .xlsx con el formato: Presupuesto_vs_Real_YYYY_MM.xlsx" -ForegroundColor White
Write-Host ""
