# Test: Actualizar Saldo Cuenta Bancaria
# Verifica que el saldo se actualiza correctamente al crear movimientos

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkR1MnMwL3VBZGRLMnBKL0QiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2Vqb2Fxd3Fkb2Fhb2Fhb2Fhb2Fhby5zdXBhYmFzZS5jby9hdXRoL3YxIiwic3ViIjoiNDU0YzI3YzItNjI5Zi00YzI5LWI5YzAtNzU5YzI3YzI3YzI3IiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTc2NzIyNTYwMCwiaWF0IjoxNzM1Njg5NjAwLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6e30sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3MzU2ODk2MDB9XSwic2Vzc2lvbl9pZCI6IjEyMzQ1Njc4LTEyMzQtMTIzNC0xMjM0LTEyMzQ1Njc4OTBhYiIsImlzX2Fub255bW91cyI6ZmFsc2V9.test-signature"
$tenantId = "d290f1ee-6c54-4b01-90e6-d701748f0851"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: ACTUALIZAR SALDO CUENTA BANCARIA" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Paso 1: Crear una cuenta bancaria de prueba
Write-Host "PASO 1: Crear cuenta bancaria de prueba..." -ForegroundColor Yellow

$saldoInicial = 10000.00
$crearBody = @{
    nombre = "Cuenta Test Saldo"
    banco = "Banco de Prueba"
    numero_cuenta = "TEST-SALDO-$(Get-Random -Minimum 1000 -Maximum 9999)"
    tipo_cuenta = "CORRIENTE"
    moneda = "PEN"
    saldo = $saldoInicial
    permite_sobregiro = $false
    activa = $true
} | ConvertTo-Json

try {
    $crearResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $crearBody
    Write-Host "✓ Cuenta creada exitosamente" -ForegroundColor Green
    Write-Host "  ID: $($crearResponse.data.id)" -ForegroundColor Gray
    Write-Host "  Saldo Inicial: $($crearResponse.data.saldo)" -ForegroundColor Gray

    $cuentaId = $crearResponse.data.id
    
    if ($crearResponse.data.saldo -ne $saldoInicial) {
        Write-Host "✗ ERROR: Saldo inicial incorrecto" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error creando cuenta: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Paso 2: Crear un movimiento ABONO (ingreso)
Write-Host "`nPASO 2: Crear movimiento ABONO (+500)..." -ForegroundColor Yellow

$montoAbono = 500.00
$movimientoAbonoBody = @{
    cuenta_bancaria_id = $cuentaId
    tipo = "ABONO"
    monto = $montoAbono
    fecha = (Get-Date).ToString("yyyy-MM-dd")
    descripcion = "Ingreso de prueba"
    metodo_pago = "TRANSFERENCIA"
} | ConvertTo-Json

try {
    $abonoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" -Method Post -Headers $headers -Body $movimientoAbonoBody
    Write-Host "✓ Movimiento ABONO creado" -ForegroundColor Green
    Write-Host "  Monto: +$montoAbono" -ForegroundColor Gray
    Write-Host "  Saldo Anterior: $($abonoResponse.data.cuenta_bancaria.saldo_anterior)" -ForegroundColor Gray
    Write-Host "  Saldo Nuevo: $($abonoResponse.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor Gray
    
    $saldoEsperado = $saldoInicial + $montoAbono
    if ($abonoResponse.data.cuenta_bancaria.saldo_nuevo -ne $saldoEsperado) {
        Write-Host "✗ ERROR: Saldo después de ABONO incorrecto" -ForegroundColor Red
        Write-Host "  Esperado: $saldoEsperado" -ForegroundColor Red
        Write-Host "  Obtenido: $($abonoResponse.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor Red
        exit 1
    }
    
    $saldoActual = $abonoResponse.data.cuenta_bancaria.saldo_nuevo
} catch {
    Write-Host "✗ Error creando movimiento ABONO: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Paso 3: Verificar saldo en la cuenta
Write-Host "`nPASO 3: Verificar saldo en la cuenta..." -ForegroundColor Yellow

try {
    $cuentaResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId" -Method Get -Headers $headers
    Write-Host "✓ Cuenta obtenida" -ForegroundColor Green
    Write-Host "  Saldo: $($cuentaResponse.data.saldo)" -ForegroundColor Gray
    
    if ($cuentaResponse.data.saldo -ne $saldoActual) {
        Write-Host "✗ ERROR: Saldo en cuenta no coincide" -ForegroundColor Red
        Write-Host "  Esperado: $saldoActual" -ForegroundColor Red
        Write-Host "  Obtenido: $($cuentaResponse.data.saldo)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error obteniendo cuenta: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Paso 4: Crear un movimiento CARGO (egreso)
Write-Host "`nPASO 4: Crear movimiento CARGO (-300)..." -ForegroundColor Yellow

$montoCargo = 300.00
$movimientoCargoBody = @{
    cuenta_bancaria_id = $cuentaId
    tipo = "CARGO"
    monto = $montoCargo
    fecha = (Get-Date).ToString("yyyy-MM-dd")
    descripcion = "Egreso de prueba"
    metodo_pago = "TRANSFERENCIA"
} | ConvertTo-Json

try {
    $cargoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" -Method Post -Headers $headers -Body $movimientoCargoBody
    Write-Host "✓ Movimiento CARGO creado" -ForegroundColor Green
    Write-Host "  Monto: -$montoCargo" -ForegroundColor Gray
    Write-Host "  Saldo Anterior: $($cargoResponse.data.cuenta_bancaria.saldo_anterior)" -ForegroundColor Gray
    Write-Host "  Saldo Nuevo: $($cargoResponse.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor Gray
    
    $saldoEsperado = $saldoActual - $montoCargo
    if ($cargoResponse.data.cuenta_bancaria.saldo_nuevo -ne $saldoEsperado) {
        Write-Host "✗ ERROR: Saldo después de CARGO incorrecto" -ForegroundColor Red
        Write-Host "  Esperado: $saldoEsperado" -ForegroundColor Red
        Write-Host "  Obtenido: $($cargoResponse.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor Red
        exit 1
    }
    
    $saldoActual = $cargoResponse.data.cuenta_bancaria.saldo_nuevo
} catch {
    Write-Host "✗ Error creando movimiento CARGO: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Paso 5: Verificar saldo final
Write-Host "`nPASO 5: Verificar saldo final..." -ForegroundColor Yellow

try {
    $cuentaFinalResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId" -Method Get -Headers $headers
    Write-Host "✓ Cuenta obtenida" -ForegroundColor Green
    Write-Host "  Saldo Final: $($cuentaFinalResponse.data.saldo)" -ForegroundColor Gray
    
    $saldoEsperadoFinal = $saldoInicial + $montoAbono - $montoCargo
    if ($cuentaFinalResponse.data.saldo -ne $saldoEsperadoFinal) {
        Write-Host "✗ ERROR: Saldo final incorrecto" -ForegroundColor Red
        Write-Host "  Esperado: $saldoEsperadoFinal" -ForegroundColor Red
        Write-Host "  Obtenido: $($cuentaFinalResponse.data.saldo)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error obteniendo cuenta final: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Paso 6: Intentar crear CARGO que exceda el saldo (sin sobregiro)
Write-Host "`nPASO 6: Probar validación de saldo insuficiente..." -ForegroundColor Yellow

$montoExcesivo = $saldoActual + 1000.00
$movimientoExcesivoBody = @{
    cuenta_bancaria_id = $cuentaId
    tipo = "CARGO"
    monto = $montoExcesivo
    fecha = (Get-Date).ToString("yyyy-MM-dd")
    descripcion = "Egreso excesivo"
    metodo_pago = "TRANSFERENCIA"
} | ConvertTo-Json

try {
    $excesivoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" -Method Post -Headers $headers -Body $movimientoExcesivoBody
    Write-Host "✗ ERROR: Se permitió movimiento con saldo insuficiente" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "✓ Validación correcta: Saldo insuficiente rechazado" -ForegroundColor Green
    } else {
        Write-Host "✗ Error inesperado: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Start-Sleep -Seconds 1

# Paso 7: Habilitar sobregiro y probar movimiento negativo
Write-Host "`nPASO 7: Habilitar sobregiro y probar saldo negativo..." -ForegroundColor Yellow

$habilitarSobregiroBody = @{
    permite_sobregiro = $true
} | ConvertTo-Json

try {
    $sobregiroResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId" -Method Put -Headers $headers -Body $habilitarSobregiroBody
    Write-Host "✓ Sobregiro habilitado" -ForegroundColor Green
} catch {
    Write-Host "✗ Error habilitando sobregiro: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Ahora intentar el movimiento excesivo nuevamente
Write-Host "`nPASO 8: Crear movimiento con sobregiro..." -ForegroundColor Yellow

$montoConSobregiro = $saldoActual + 500.00
$movimientoSobregiroBody = @{
    cuenta_bancaria_id = $cuentaId
    tipo = "CARGO"
    monto = $montoConSobregiro
    fecha = (Get-Date).ToString("yyyy-MM-dd")
    descripcion = "Egreso con sobregiro"
    metodo_pago = "TRANSFERENCIA"
} | ConvertTo-Json

try {
    $sobregiroMovResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" -Method Post -Headers $headers -Body $movimientoSobregiroBody
    Write-Host "✓ Movimiento con sobregiro creado" -ForegroundColor Green
    Write-Host "  Saldo Anterior: $($sobregiroMovResponse.data.cuenta_bancaria.saldo_anterior)" -ForegroundColor Gray
    Write-Host "  Saldo Nuevo: $($sobregiroMovResponse.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor Gray
    
    if ($sobregiroMovResponse.data.cuenta_bancaria.saldo_nuevo -ge 0) {
        Write-Host "✗ ERROR: Saldo debería ser negativo" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  ✓ Saldo negativo permitido con sobregiro" -ForegroundColor Green
} catch {
    Write-Host "✗ Error creando movimiento con sobregiro: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Resumen final
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE PRUEBAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Cuenta bancaria creada con saldo inicial" -ForegroundColor Green
Write-Host "✓ Movimiento ABONO actualiza saldo correctamente (+)" -ForegroundColor Green
Write-Host "✓ Movimiento CARGO actualiza saldo correctamente (-)" -ForegroundColor Green
Write-Host "✓ Saldo se persiste correctamente en la base de datos" -ForegroundColor Green
Write-Host "✓ Validación de saldo insuficiente funciona" -ForegroundColor Green
Write-Host "✓ Sobregiro permite saldos negativos" -ForegroundColor Green
Write-Host "`n¡Todas las pruebas de actualización de saldo pasaron!" -ForegroundColor Green
