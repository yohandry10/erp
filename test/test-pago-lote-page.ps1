# Test script for Pago Lote Page
# This script verifies that the pago lote page and wizard are properly implemented

Write-Host "=== TEST: Pago Lote Page Implementation ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Verify page file exists
Write-Host "Test 1: Verificar que el archivo de la página existe..." -ForegroundColor Yellow
$pageFile = "apps/web/app/dashboard/finanzas/tesoreria/lote/page.tsx"
if (Test-Path $pageFile) {
    Write-Host "✓ Página existe: $pageFile" -ForegroundColor Green
} else {
    Write-Host "✗ Página NO existe: $pageFile" -ForegroundColor Red
    exit 1
}

# Test 2: Verify wizard component exists
Write-Host ""
Write-Host "Test 2: Verificar que el componente PagoLoteWizard existe..." -ForegroundColor Yellow
$wizardFile = "apps/web/components/finanzas/PagoLoteWizard.tsx"
if (Test-Path $wizardFile) {
    Write-Host "✓ Componente PagoLoteWizard existe: $wizardFile" -ForegroundColor Green
} else {
    Write-Host "✗ Componente PagoLoteWizard NO existe: $wizardFile" -ForegroundColor Red
    exit 1
}

# Test 3: Verify SeleccionarCxpLote component exists
Write-Host ""
Write-Host "Test 3: Verificar que el componente SeleccionarCxpLote existe..." -ForegroundColor Yellow
$seleccionFile = "apps/web/components/finanzas/SeleccionarCxpLote.tsx"
if (Test-Path $seleccionFile) {
    Write-Host "✓ Componente SeleccionarCxpLote existe: $seleccionFile" -ForegroundColor Green
} else {
    Write-Host "✗ Componente SeleccionarCxpLote NO existe: $seleccionFile" -ForegroundColor Red
    exit 1
}

# Test 4: Verify page imports PagoLoteWizard
Write-Host ""
Write-Host "Test 4: Verificar que la página importa PagoLoteWizard..." -ForegroundColor Yellow
$pageContent = Get-Content $pageFile -Raw
if ($pageContent -match "import.*PagoLoteWizard.*from") {
    Write-Host "✓ La página importa PagoLoteWizard correctamente" -ForegroundColor Green
} else {
    Write-Host "✗ La página NO importa PagoLoteWizard" -ForegroundColor Red
    exit 1
}

# Test 5: Verify page uses the wizard component
Write-Host ""
Write-Host "Test 5: Verificar que la página usa el componente PagoLoteWizard..." -ForegroundColor Yellow
if ($pageContent -match "<PagoLoteWizard") {
    Write-Host "✓ La página usa el componente PagoLoteWizard" -ForegroundColor Green
} else {
    Write-Host "✗ La página NO usa el componente PagoLoteWizard" -ForegroundColor Red
    exit 1
}

# Test 6: Verify wizard has all required props
Write-Host ""
Write-Host "Test 6: Verificar que el wizard recibe todas las props requeridas..." -ForegroundColor Yellow
$requiredProps = @("cuentasBancarias", "cxpsDisponibles", "onSubmit", "onCancel")
$allPropsPresent = $true
foreach ($prop in $requiredProps) {
    if ($pageContent -match "$prop=") {
        Write-Host "  ✓ Prop '$prop' presente" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Prop '$prop' faltante" -ForegroundColor Red
        $allPropsPresent = $false
    }
}

if (-not $allPropsPresent) {
    exit 1
}

# Test 7: Verify page handles API calls
Write-Host ""
Write-Host "Test 7: Verificar que la página maneja llamadas a la API..." -ForegroundColor Yellow
if ($pageContent -match "useApi" -and $pageContent -match "/api/finanzas/tesoreria/lote") {
    Write-Host "✓ La página usa useApi y llama al endpoint correcto" -ForegroundColor Green
} else {
    Write-Host "✗ La página NO maneja correctamente las llamadas a la API" -ForegroundColor Red
    exit 1
}

# Test 8: Verify wizard has 3-step flow
Write-Host ""
Write-Host "Test 8: Verificar que el wizard tiene flujo de 3 pasos..." -ForegroundColor Yellow
$wizardContent = Get-Content $wizardFile -Raw
$steps = @("seleccion-cuenta", "seleccion-cxp", "confirmacion")
$allStepsPresent = $true
foreach ($step in $steps) {
    if ($wizardContent -match $step) {
        Write-Host "  ✓ Paso '$step' implementado" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Paso '$step' faltante" -ForegroundColor Red
        $allStepsPresent = $false
    }
}

if (-not $allStepsPresent) {
    exit 1
}

# Test 9: Verify wizard validates balance
Write-Host ""
Write-Host "Test 9: Verificar que el wizard valida saldo suficiente..." -ForegroundColor Yellow
if ($wizardContent -match "saldoSuficiente" -and $wizardContent -match "Saldo Insuficiente") {
    Write-Host "✓ El wizard valida el saldo de la cuenta bancaria" -ForegroundColor Green
} else {
    Write-Host "✗ El wizard NO valida el saldo correctamente" -ForegroundColor Red
    exit 1
}

# Test 10: Verify page shows success result
Write-Host ""
Write-Host "Test 10: Verificar que la página muestra resultado exitoso..." -ForegroundColor Yellow
if ($pageContent -match "processingResult" -and $pageContent -match "Lote Procesado Exitosamente") {
    Write-Host "✓ La página muestra el resultado del procesamiento" -ForegroundColor Green
} else {
    Write-Host "✗ La página NO muestra el resultado correctamente" -ForegroundColor Red
    exit 1
}

# Test 11: Verify SeleccionarCxpLote has filters
Write-Host ""
Write-Host "Test 11: Verificar que SeleccionarCxpLote tiene filtros..." -ForegroundColor Yellow
$seleccionContent = Get-Content $seleccionFile -Raw
$filters = @("filtroProveedor", "filtroEstado", "filtroUrgencia")
$allFiltersPresent = $true
foreach ($filter in $filters) {
    if ($seleccionContent -match $filter) {
        Write-Host "  ✓ Filtro '$filter' implementado" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Filtro '$filter' faltante" -ForegroundColor Red
        $allFiltersPresent = $false
    }
}

if (-not $allFiltersPresent) {
    exit 1
}

# Test 12: Verify SeleccionarCxpLote supports partial payments
Write-Host ""
Write-Host "Test 12: Verificar que SeleccionarCxpLote soporta pagos parciales..." -ForegroundColor Yellow
if ($seleccionContent -match "montosParciales" -and $seleccionContent -match "Monto a pagar") {
    Write-Host "✓ El componente soporta pagos parciales" -ForegroundColor Green
} else {
    Write-Host "✗ El componente NO soporta pagos parciales" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host "✓ Todos los tests pasaron exitosamente" -ForegroundColor Green
Write-Host ""
Write-Host "Implementación completada:" -ForegroundColor Green
Write-Host "  - Página de pago masivo creada" -ForegroundColor White
Write-Host "  - Wizard de 3 pasos implementado" -ForegroundColor White
Write-Host "  - Componente de selección de CxP con filtros" -ForegroundColor White
Write-Host "  - Validación de saldo bancario" -ForegroundColor White
Write-Host "  - Soporte para pagos parciales" -ForegroundColor White
Write-Host "  - Pantalla de resultado exitoso" -ForegroundColor White
Write-Host ""
Write-Host "Ruta de acceso: /dashboard/finanzas/tesoreria/lote" -ForegroundColor Cyan
