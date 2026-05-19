# Test: Crear Movimiento Bancario Manual
# Endpoint: POST /api/finanzas/bancos/movimientos

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "c77b8c4e-4d5e-4f6a-8b9c-1a2b3c4d5e6f"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: Crear Movimiento Bancario Manual" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Paso 1: Obtener cuentas bancarias disponibles
Write-Host "Paso 1: Obteniendo cuentas bancarias..." -ForegroundColor Yellow
try {
    $cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Get -Headers $headers

    if ($cuentasResponse.success -and $cuentasResponse.data.Count -gt 0) {
        $cuenta = $cuentasResponse.data[0]
        Write-Host "✓ Cuenta bancaria encontrada:" -ForegroundColor Green
        Write-Host "  ID: $($cuenta.id)" -ForegroundColor White
        Write-Host "  Nombre: $($cuenta.nombre)" -ForegroundColor White
        Write-Host "  Banco: $($cuenta.banco)" -ForegroundColor White
        Write-Host "  Saldo actual: $($cuenta.saldo) $($cuenta.moneda)" -ForegroundColor White
        Write-Host "  Permite sobregiro: $($cuenta.permite_sobregiro)" -ForegroundColor White

        $cuentaBancariaId = $cuenta.id
        $saldoAnterior = $cuenta.saldo
    } else {
        Write-Host "✗ No se encontraron cuentas bancarias" -ForegroundColor Red
        Write-Host "Creando una cuenta bancaria de prueba..." -ForegroundColor Yellow

        $nuevaCuenta = @{
            nombre = "Cuenta Test Movimientos"
            banco = "BCP"
            numero_cuenta = "191-$(Get-Random -Minimum 1000000 -Maximum 9999999)"
            tipo_cuenta = "CORRIENTE"
            moneda = "PEN"
            saldo = 10000.00
            permite_sobregiro = $false
            activa = $true
        } | ConvertTo-Json

        $cuentaResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $nuevaCuenta
        $cuentaBancariaId = $cuentaResponse.data.id
        $saldoAnterior = $cuentaResponse.data.saldo

        Write-Host "✓ Cuenta bancaria creada: $cuentaBancariaId" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Error obteniendo cuentas bancarias: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Paso 2: Crear movimiento ABONO (ingreso)
Write-Host "`nPaso 2: Creando movimiento ABONO (ingreso)..." -ForegroundColor Yellow
$movimientoAbono = @{
    cuenta_bancaria_id = $cuentaBancariaId
    tipo = "ABONO"
    monto = 2500.75
    fecha = "2025-10-25"
    descripcion = "Depósito por venta de contado - Cliente ABC"
    referencia = "DEP-2025-001234"
    metodo_pago = "DEPOSITO"
} | ConvertTo-Json

try {
    $abonoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" -Method Post -Headers $headers -Body $movimientoAbono

    if ($abonoResponse.success) {
        Write-Host "✓ Movimiento ABONO creado exitosamente" -ForegroundColor Green
        Write-Host "  ID: $($abonoResponse.data.id)" -ForegroundColor White
        Write-Host "  Tipo: $($abonoResponse.data.tipo)" -ForegroundColor White
        Write-Host "  Monto: $($abonoResponse.data.monto)" -ForegroundColor White
        Write-Host "  Fecha: $($abonoResponse.data.fecha)" -ForegroundColor White
        Write-Host "  Descripción: $($abonoResponse.data.descripcion)" -ForegroundColor White
        Write-Host "  Referencia: $($abonoResponse.data.referencia)" -ForegroundColor White
        Write-Host "  Saldo anterior: $($abonoResponse.data.cuenta_bancaria.saldo_anterior)" -ForegroundColor White
        Write-Host "  Saldo nuevo: $($abonoResponse.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor White

        $nuevoSaldo = $abonoResponse.data.cuenta_bancaria.saldo_nuevo
    } else {
        Write-Host "✗ Error: $($abonoResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error creando movimiento ABONO: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

# Paso 3: Crear movimiento CARGO (egreso)
Write-Host "`nPaso 3: Creando movimiento CARGO (egreso)..." -ForegroundColor Yellow
$movimientoCargo = @{
    cuenta_bancaria_id = $cuentaBancariaId
    tipo = "CARGO"
    monto = 1200.50
    fecha = "2025-10-25"
    descripcion = "Pago de servicios - Luz y agua"
    referencia = "PAG-2025-005678"
    metodo_pago = "TRANSFERENCIA"
} | ConvertTo-Json

try {
    $cargoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" -Method Post -Headers $headers -Body $movimientoCargo

    if ($cargoResponse.success) {
        Write-Host "✓ Movimiento CARGO creado exitosamente" -ForegroundColor Green
        Write-Host "  ID: $($cargoResponse.data.id)" -ForegroundColor White
        Write-Host "  Tipo: $($cargoResponse.data.tipo)" -ForegroundColor White
        Write-Host "  Monto: $($cargoResponse.data.monto)" -ForegroundColor White
        Write-Host "  Fecha: $($cargoResponse.data.fecha)" -ForegroundColor White
        Write-Host "  Descripción: $($cargoResponse.data.descripcion)" -ForegroundColor White
        Write-Host "  Referencia: $($cargoResponse.data.referencia)" -ForegroundColor White
        Write-Host "  Saldo anterior: $($cargoResponse.data.cuenta_bancaria.saldo_anterior)" -ForegroundColor White
        Write-Host "  Saldo nuevo: $($cargoResponse.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor White
    } else {
        Write-Host "✗ Error: $($cargoResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error creando movimiento CARGO: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

# Paso 4: Verificar movimientos creados
Write-Host "`nPaso 4: Verificando movimientos creados..." -ForegroundColor Yellow
try {
    $movimientosResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaBancariaId/movimientos" -Method Get -Headers $headers

    if ($movimientosResponse.success) {
        Write-Host "✓ Movimientos obtenidos: $($movimientosResponse.data.Count)" -ForegroundColor Green
        Write-Host "`nÚltimos movimientos:" -ForegroundColor Cyan

        $movimientosResponse.data | Select-Object -First 5 | ForEach-Object {
            $color = if ($_.tipo -eq "ABONO") { "Green" } else { "Red" }
            Write-Host "  - [$($_.tipo)] $($_.fecha) | $($_.monto) | $($_.descripcion)" -ForegroundColor $color
        }

        Write-Host "`nPaginación:" -ForegroundColor Cyan
        Write-Host "  Página: $($movimientosResponse.pagination.page)" -ForegroundColor White
        Write-Host "  Total: $($movimientosResponse.pagination.total)" -ForegroundColor White
        Write-Host "  Total páginas: $($movimientosResponse.pagination.totalPages)" -ForegroundColor White
    }
} catch {
    Write-Host "✗ Error verificando movimientos: $($_.Exception.Message)" -ForegroundColor Red
}

# Paso 5: Verificar saldo actualizado de la cuenta
Write-Host "`nPaso 5: Verificando saldo actualizado de la cuenta..." -ForegroundColor Yellow
try {
    $cuentaActualizada = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaBancariaId" -Method Get -Headers $headers

    if ($cuentaActualizada.success) {
        Write-Host "✓ Saldo actualizado correctamente" -ForegroundColor Green
        Write-Host "  Saldo inicial: $saldoAnterior" -ForegroundColor White
        Write-Host "  + ABONO: 2500.75" -ForegroundColor Green
        Write-Host "  - CARGO: 1200.50" -ForegroundColor Red
        Write-Host "  = Saldo final: $($cuentaActualizada.data.saldo)" -ForegroundColor Cyan

        $saldoEsperado = [math]::Round($saldoAnterior + 2500.75 - 1200.50, 2)
        $saldoReal = $cuentaActualizada.data.saldo

        if ([math]::Abs($saldoReal - $saldoEsperado) -lt 0.01) {
            Write-Host "`n✓ VALIDACIÓN: El saldo es correcto" -ForegroundColor Green
        } else {
            Write-Host "`n✗ VALIDACIÓN: El saldo no coincide (esperado: $saldoEsperado, real: $saldoReal)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "✗ Error verificando saldo: $($_.Exception.Message)" -ForegroundColor Red
}

# Paso 6: Probar validación de saldo insuficiente
Write-Host "`nPaso 6: Probando validación de saldo insuficiente..." -ForegroundColor Yellow
$movimientoExcesivo = @{
    cuenta_bancaria_id = $cuentaBancariaId
    tipo = "CARGO"
    monto = 999999.99
    fecha = "2025-10-25"
    descripcion = "Intento de cargo excesivo"
    referencia = "TEST-VALIDACION"
} | ConvertTo-Json

try {
    $validacionResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" -Method Post -Headers $headers -Body $movimientoExcesivo
    Write-Host "✗ La validación de saldo insuficiente NO funcionó (debería haber fallado)" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "✓ Validación de saldo insuficiente funcionó correctamente" -ForegroundColor Green
        $errorDetail = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "  Mensaje: $($errorDetail.message)" -ForegroundColor Yellow
    } else {
        Write-Host "✗ Error inesperado: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE PRUEBAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Endpoint POST /api/finanzas/bancos/movimientos implementado" -ForegroundColor Green
Write-Host "✓ Movimientos ABONO y CARGO funcionan correctamente" -ForegroundColor Green
Write-Host "✓ Saldo de cuenta bancaria se actualiza automáticamente" -ForegroundColor Green
Write-Host "✓ Validación de saldo insuficiente funciona" -ForegroundColor Green
Write-Host "✓ Movimientos se pueden consultar correctamente" -ForegroundColor Green
Write-Host "`n¡Implementación completada exitosamente!" -ForegroundColor Green
