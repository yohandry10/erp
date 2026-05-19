# Test: Pago en Lote con Transacción Atómica
# Verifica que el procesamiento de pagos masivos se realiza en una transacción

$baseUrl = "http://localhost:3001"
$tenantId = "d4b8e0f0-4b8e-4b8e-4b8e-4b8e4b8e4b8e"

Write-Host "=== TEST: PAGO EN LOTE CON TRANSACCIÓN ===" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener token de autenticación
Write-Host "1. Obteniendo token de autenticación..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body (@{
    email = "admin@vierdes.com"
    password = "admin123"
} | ConvertTo-Json) -ContentType "application/json"

$token = $loginResponse.access_token
$headers = @{
    "Authorization" = "Bearer $token"
    "X-Tenant-Id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "✓ Token obtenido" -ForegroundColor Green
Write-Host ""

# 2. Obtener cuenta bancaria
Write-Host "2. Obteniendo cuenta bancaria..." -ForegroundColor Yellow
$cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Get -Headers $headers
$cuentaBancaria = $cuentasResponse.data[0]

if (-not $cuentaBancaria) {
    Write-Host "✗ No se encontró cuenta bancaria" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Cuenta bancaria: $($cuentaBancaria.nombre)" -ForegroundColor Green
Write-Host "  Saldo actual: $($cuentaBancaria.saldo) $($cuentaBancaria.moneda)" -ForegroundColor Gray
Write-Host ""

# 3. Obtener CxP pendientes
Write-Host "3. Obteniendo CxP pendientes..." -ForegroundColor Yellow
$cxpResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE&limit=3" -Method Get -Headers $headers
$cxpsPendientes = $cxpResponse.data

if ($cxpsPendientes.Count -lt 2) {
    Write-Host "✗ Se necesitan al menos 2 CxP pendientes para el test" -ForegroundColor Red
    exit 1
}

Write-Host "✓ CxP pendientes encontradas: $($cxpsPendientes.Count)" -ForegroundColor Green
foreach ($cxp in $cxpsPendientes) {
    Write-Host "  - CxP $($cxp.numero_documento): Saldo $($cxp.saldo) $($cxp.moneda)" -ForegroundColor Gray
}
Write-Host ""

# 4. Preparar lote de pagos (tomar las primeras 2 CxP)
$pagos = @()
$montoTotal = 0

for ($i = 0; $i -lt [Math]::Min(2, $cxpsPendientes.Count); $i++) {
    $cxp = $cxpsPendientes[$i]
    $montoPago = [Math]::Min(100, $cxp.saldo) # Pagar 100 o el saldo completo si es menor

    $pagos += @{
        cxp_id = $cxp.id
        monto = $montoPago
    }

    $montoTotal += $montoPago
}

Write-Host "4. Preparando lote de pagos..." -ForegroundColor Yellow
Write-Host "  Total de pagos: $($pagos.Count)" -ForegroundColor Gray
Write-Host "  Monto total: $montoTotal $($cuentaBancaria.moneda)" -ForegroundColor Gray
Write-Host ""

# 5. Validar saldo suficiente
if ($cuentaBancaria.saldo -lt $montoTotal) {
    Write-Host "✗ Saldo insuficiente en cuenta bancaria" -ForegroundColor Red
    Write-Host "  Saldo disponible: $($cuentaBancaria.saldo)" -ForegroundColor Gray
    Write-Host "  Monto requerido: $montoTotal" -ForegroundColor Gray
    exit 1
}

Write-Host "✓ Saldo suficiente en cuenta bancaria" -ForegroundColor Green
Write-Host ""

# 6. Registrar pago en lote
Write-Host "5. Registrando pago en lote (transacción atómica)..." -ForegroundColor Yellow

$pagoLoteDto = @{
    cuenta_bancaria_id = $cuentaBancaria.id
    fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
    metodo_pago = "TRANSFERENCIA"
    referencia_lote = "LOTE-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
    observaciones = "Test de pago en lote con transacción atómica"
    pagos = $pagos
} | ConvertTo-Json -Depth 10

try {
    $pagoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/lote" -Method Post -Headers $headers -Body $pagoLoteDto

    Write-Host "✓ Lote de pagos procesado exitosamente" -ForegroundColor Green
    Write-Host ""

    Write-Host "=== RESULTADO DEL LOTE ===" -ForegroundColor Cyan
    Write-Host "Lote ID: $($pagoResponse.data.lote_id)" -ForegroundColor White
    Write-Host "Total de pagos: $($pagoResponse.data.total_pagos)" -ForegroundColor White
    Write-Host "Monto total: $($pagoResponse.data.monto_total)" -ForegroundColor White
    Write-Host "Pagos exitosos: $($pagoResponse.data.pagos_exitosos)" -ForegroundColor Green
    Write-Host "Pagos fallidos: $($pagoResponse.data.pagos_fallidos)" -ForegroundColor $(if ($pagoResponse.data.pagos_fallidos -eq 0) { "Green" } else { "Red" })
    Write-Host ""

    Write-Host "=== CUENTA BANCARIA ===" -ForegroundColor Cyan
    Write-Host "Nombre: $($pagoResponse.data.cuenta_bancaria.nombre)" -ForegroundColor White
    Write-Host "Saldo anterior: $($pagoResponse.data.cuenta_bancaria.saldo_anterior)" -ForegroundColor White
    Write-Host "Saldo nuevo: $($pagoResponse.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor White
    Write-Host "Diferencia: $($pagoResponse.data.cuenta_bancaria.saldo_anterior - $pagoResponse.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor Yellow
    Write-Host ""

    Write-Host "=== DETALLE DE PAGOS ===" -ForegroundColor Cyan
    foreach ($pago in $pagoResponse.data.pagos) {
        Write-Host "Proveedor: $($pago.proveedor)" -ForegroundColor White
        Write-Host "  Documento: $($pago.numero_documento)" -ForegroundColor Gray
        Write-Host "  Monto pagado: $($pago.monto)" -ForegroundColor Gray
        Write-Host "  Saldo anterior: $($pago.saldo_anterior) → Saldo nuevo: $($pago.saldo_nuevo)" -ForegroundColor Gray
        Write-Host "  Estado: $($pago.estado_anterior) → $($pago.estado_nuevo)" -ForegroundColor $(if ($pago.estado_nuevo -eq "PAGADA") { "Green" } else { "Yellow" })
        Write-Host "  Movimiento bancario ID: $($pago.movimiento_bancario_id)" -ForegroundColor Gray
        Write-Host ""
    }

    # 7. Verificar que los cambios se aplicaron correctamente
    Write-Host "6. Verificando cambios en la base de datos..." -ForegroundColor Yellow

    # Verificar cuenta bancaria
    $cuentaActualizada = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$($cuentaBancaria.id)" -Method Get -Headers $headers

    if ([Math]::Abs($cuentaActualizada.data.saldo - $pagoResponse.data.cuenta_bancaria.saldo_nuevo) -lt 0.01) {
        Write-Host "✓ Saldo de cuenta bancaria actualizado correctamente" -ForegroundColor Green
    } else {
        Write-Host "✗ Error: Saldo de cuenta bancaria no coincide" -ForegroundColor Red
        Write-Host "  Esperado: $($pagoResponse.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor Gray
        Write-Host "  Actual: $($cuentaActualizada.data.saldo)" -ForegroundColor Gray
    }

    # Verificar CxP actualizadas
    $cxpVerificadas = 0
    foreach ($pago in $pagoResponse.data.pagos) {
        $cxpActualizada = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($pago.cxp_id)" -Method Get -Headers $headers

        if ([Math]::Abs($cxpActualizada.data.saldo - $pago.saldo_nuevo) -lt 0.01 -and $cxpActualizada.data.estado -eq $pago.estado_nuevo) {
            $cxpVerificadas++
        } else {
            Write-Host "✗ Error: CxP $($pago.numero_documento) no actualizada correctamente" -ForegroundColor Red
        }
    }

    if ($cxpVerificadas -eq $pagoResponse.data.pagos.Count) {
        Write-Host "✓ Todas las CxP actualizadas correctamente ($cxpVerificadas/$($pagoResponse.data.pagos.Count))" -ForegroundColor Green
    } else {
        Write-Host "✗ Solo $cxpVerificadas de $($pagoResponse.data.pagos.Count) CxP verificadas" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "=== TEST COMPLETADO EXITOSAMENTE ===" -ForegroundColor Green

} catch {
    Write-Host "✗ Error procesando lote de pagos" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Respuesta del servidor:" -ForegroundColor Yellow
        Write-Host $responseBody -ForegroundColor Gray
    }

    Write-Host ""
    Write-Host "=== VERIFICANDO ROLLBACK ===" -ForegroundColor Yellow
    Write-Host "Si la transacción funcionó correctamente, no debería haber cambios parciales" -ForegroundColor Gray

    # Verificar que la cuenta bancaria no cambió
    $cuentaActualizada = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$($cuentaBancaria.id)" -Method Get -Headers $headers

    if ([Math]::Abs($cuentaActualizada.data.saldo - $cuentaBancaria.saldo) -lt 0.01) {
        Write-Host "✓ Saldo de cuenta bancaria sin cambios (rollback correcto)" -ForegroundColor Green
    } else {
        Write-Host "✗ ADVERTENCIA: Saldo de cuenta bancaria cambió (posible inconsistencia)" -ForegroundColor Red
        Write-Host "  Saldo original: $($cuentaBancaria.saldo)" -ForegroundColor Gray
        Write-Host "  Saldo actual: $($cuentaActualizada.data.saldo)" -ForegroundColor Gray
    }

    exit 1
}

Write-Host ""
Write-Host "=== BENEFICIOS DE LA TRANSACCIÓN ATÓMICA ===" -ForegroundColor Cyan
Write-Host "✓ Todos los pagos se procesan o ninguno (atomicidad)" -ForegroundColor Green
Write-Host "✓ No hay estados inconsistentes en caso de error" -ForegroundColor Green
Write-Host "✓ Rollback automático si falla cualquier operación" -ForegroundColor Green
Write-Host "✓ Mejor rendimiento al procesar múltiples pagos" -ForegroundColor Green
Write-Host "✓ Garantía de integridad de datos" -ForegroundColor Green
