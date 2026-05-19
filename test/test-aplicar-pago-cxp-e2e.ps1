# E2E Test: Aplicar Pago a CxP
# Este script prueba el flujo completo de aplicar un pago a una cuenta por pagar

$baseUrl = "http://localhost:3002"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "550e8400-e29b-41d4-a716-446655440001"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "E2E TEST: Aplicar Pago a CxP" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

$testsPassed = 0
$testsFailed = 0

# TEST 1: Aplicar pago parcial a CxP
Write-Host "TEST 1: Aplicar pago parcial a CxP" -ForegroundColor Yellow
Write-Host "-----------------------------------" -ForegroundColor Yellow

try {
    # Obtener una CxP pendiente
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE" -Method Get -Headers $headers

    if ($response.data -and $response.data.Count -gt 0) {
        $cxp = $response.data[0]
        Write-Host "  CxP encontrada: $($cxp.numero_documento)" -ForegroundColor Gray
        Write-Host "  Saldo actual: $($cxp.saldo)" -ForegroundColor Gray

        # Aplicar pago parcial (50%)
        $montoPago = [math]::Round($cxp.saldo / 2, 2)

        $pagoData = @{
            monto = $montoPago
            fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
            metodo_pago = "TRANSFERENCIA"
            referencia = "TEST-E2E-PARCIAL-$(Get-Date -Format 'yyyyMMddHHmmss')"
            observaciones = "Pago parcial de prueba E2E - 50% del saldo"
        } | ConvertTo-Json

        $pagoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)/aplicar-pago" -Method Post -Headers $headers -Body $pagoData

        if ($pagoResponse.success) {
            # Verificar que el saldo se actualizó correctamente
            $verifyResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)" -Method Get -Headers $headers

            $expectedSaldo = [math]::Round($cxp.saldo - $montoPago, 2)
            $actualSaldo = $verifyResponse.data.saldo

            if ([math]::Abs($actualSaldo - $expectedSaldo) -lt 0.01) {
                Write-Host "  ✓ Pago parcial aplicado correctamente" -ForegroundColor Green
                Write-Host "  ✓ Saldo actualizado: $actualSaldo" -ForegroundColor Green
                $testsPassed++
            } else {
                Write-Host "  ✗ ERROR: Saldo incorrecto. Esperado: $expectedSaldo, Actual: $actualSaldo" -ForegroundColor Red
                $testsFailed++
            }
        } else {
            Write-Host "  ✗ ERROR: No se pudo aplicar el pago" -ForegroundColor Red
            $testsFailed++
        }
    } else {
        Write-Host "  ⚠ No hay CxP pendientes para probar" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# TEST 2: Validar monto máximo
Write-Host "TEST 2: Validar monto máximo en pago" -ForegroundColor Yellow
Write-Host "-------------------------------------" -ForegroundColor Yellow

try {
    # Obtener una CxP pendiente
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE" -Method Get -Headers $headers

    if ($response.data -and $response.data.Count -gt 0) {
        $cxp = $response.data[0]
        Write-Host "  CxP encontrada: $($cxp.numero_documento)" -ForegroundColor Gray
        Write-Host "  Saldo actual: $($cxp.saldo)" -ForegroundColor Gray

        # Intentar aplicar un pago mayor al saldo
        $montoExcesivo = $cxp.saldo + 1000

        $pagoData = @{
            monto = $montoExcesivo
            fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
            metodo_pago = "TRANSFERENCIA"
            referencia = "TEST-E2E-EXCESIVO"
        } | ConvertTo-Json

        try {
            $pagoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)/aplicar-pago" -Method Post -Headers $headers -Body $pagoData
            Write-Host "  ✗ ERROR: Se permitió un pago mayor al saldo" -ForegroundColor Red
            $testsFailed++
        } catch {
            if ($_.Exception.Message -match "mayor") {
                Write-Host "  ✓ Validación correcta: No se permite pago mayor al saldo" -ForegroundColor Green
                $testsPassed++
            } else {
                Write-Host "  ✗ ERROR: Validación incorrecta: $($_.Exception.Message)" -ForegroundColor Red
                $testsFailed++
            }
        }
    } else {
        Write-Host "  ⚠ No hay CxP pendientes para probar" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# TEST 3: Aplicar pago completo
Write-Host "TEST 3: Aplicar pago completo a CxP" -ForegroundColor Yellow
Write-Host "------------------------------------" -ForegroundColor Yellow

try {
    # Obtener una CxP pendiente
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE" -Method Get -Headers $headers

    if ($response.data -and $response.data.Count -gt 0) {
        $cxp = $response.data[0]
        Write-Host "  CxP encontrada: $($cxp.numero_documento)" -ForegroundColor Gray
        Write-Host "  Saldo actual: $($cxp.saldo)" -ForegroundColor Gray

        # Aplicar pago completo
        $pagoData = @{
            monto = $cxp.saldo
            fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
            metodo_pago = "TRANSFERENCIA"
            referencia = "TEST-E2E-COMPLETO-$(Get-Date -Format 'yyyyMMddHHmmss')"
            observaciones = "Pago completo de prueba E2E - 100% del saldo"
        } | ConvertTo-Json

        $pagoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)/aplicar-pago" -Method Post -Headers $headers -Body $pagoData

        if ($pagoResponse.success) {
            # Verificar que el saldo es 0 y el estado es PAGADA
            $verifyResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)" -Method Get -Headers $headers

            if ($verifyResponse.data.saldo -eq 0 -and $verifyResponse.data.estado -eq "PAGADA") {
                Write-Host "  ✓ Pago completo aplicado correctamente" -ForegroundColor Green
                Write-Host "  ✓ Saldo: $($verifyResponse.data.saldo)" -ForegroundColor Green
                Write-Host "  ✓ Estado: $($verifyResponse.data.estado)" -ForegroundColor Green
                $testsPassed++
            } else {
                Write-Host "  ✗ ERROR: Estado o saldo incorrecto" -ForegroundColor Red
                Write-Host "    Saldo: $($verifyResponse.data.saldo)" -ForegroundColor Red
                Write-Host "    Estado: $($verifyResponse.data.estado)" -ForegroundColor Red
                $testsFailed++
            }
        } else {
            Write-Host "  ✗ ERROR: No se pudo aplicar el pago completo" -ForegroundColor Red
            $testsFailed++
        }
    } else {
        Write-Host "  ⚠ No hay CxP pendientes para probar" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# TEST 4: Validar campos requeridos
Write-Host "TEST 4: Validar campos requeridos" -ForegroundColor Yellow
Write-Host "----------------------------------" -ForegroundColor Yellow

try {
    # Obtener una CxP pendiente
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE" -Method Get -Headers $headers

    if ($response.data -and $response.data.Count -gt 0) {
        $cxp = $response.data[0]

        # Intentar aplicar pago sin monto
        $pagoData = @{
            fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
            metodo_pago = "TRANSFERENCIA"
        } | ConvertTo-Json

        try {
            $pagoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)/aplicar-pago" -Method Post -Headers $headers -Body $pagoData
            Write-Host "  ✗ ERROR: Se permitió un pago sin monto" -ForegroundColor Red
            $testsFailed++
        } catch {
            if ($_.Exception.Message -match "monto|requerido|required") {
                Write-Host "  ✓ Validación correcta: Se requiere el monto" -ForegroundColor Green
                $testsPassed++
            } else {
                Write-Host "  ✗ ERROR: Validación incorrecta: $($_.Exception.Message)" -ForegroundColor Red
                $testsFailed++
            }
        }
    } else {
        Write-Host "  ⚠ No hay CxP pendientes para probar" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE TESTS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Tests Pasados: $testsPassed" -ForegroundColor Green
Write-Host "Tests Fallidos: $testsFailed" -ForegroundColor Red
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "✓ TODOS LOS TESTS PASARON" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ ALGUNOS TESTS FALLARON" -ForegroundColor Red
    exit 1
}
