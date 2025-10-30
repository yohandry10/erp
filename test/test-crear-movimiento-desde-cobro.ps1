# Test: Crear movimiento bancario desde cobro de cliente
# Este script prueba que al registrar un cobro de CxC, se cree automáticamente un movimiento bancario

$baseUrl = "http://localhost:3000/api"
$tenantId = "d290f1ee-6c54-4b01-90e6-d701748f0851"

Write-Host "=== Test: Crear Movimiento Bancario desde Cobro ===" -ForegroundColor Cyan
Write-Host ""

# Headers
$headers = @{
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

# Paso 1: Obtener una CxC pendiente
Write-Host "1. Obteniendo CxC pendiente..." -ForegroundColor Yellow
try {
    $cxcResponse = Invoke-RestMethod -Uri "$baseUrl/finanzas/cxc?estado=PENDIENTE&limit=1" -Method Get -Headers $headers
    
    if ($cxcResponse.data.Count -eq 0) {
        Write-Host "❌ No hay CxC pendientes para probar" -ForegroundColor Red
        Write-Host "   Crea una CxC primero o usa una existente" -ForegroundColor Yellow
        exit 1
    }
    
    $cxc = $cxcResponse.data[0]
    $cxcId = $cxc.id
    
    Write-Host "✅ CxC encontrada:" -ForegroundColor Green
    Write-Host "   ID: $($cxc.id)"
    Write-Host "   Cliente: $($cxc.clientes.razon_social)"
    Write-Host "   Saldo pendiente: $($cxc.monto_pendiente) $($cxc.moneda)"
    Write-Host ""
} catch {
    Write-Host "❌ Error obteniendo CxC: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Paso 2: Obtener una cuenta bancaria activa
Write-Host "2. Obteniendo cuenta bancaria activa..." -ForegroundColor Yellow
try {
    $cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/finanzas/bancos/cuentas" -Method Get -Headers $headers
    
    if ($cuentasResponse.data.Count -eq 0) {
        Write-Host "❌ No hay cuentas bancarias disponibles" -ForegroundColor Red
        Write-Host "   Crea una cuenta bancaria primero" -ForegroundColor Yellow
        exit 1
    }
    
    # Buscar cuenta con la misma moneda que la CxC
    $cuentaBancaria = $cuentasResponse.data | Where-Object { $_.activa -eq $true -and $_.moneda -eq $cxc.moneda } | Select-Object -First 1
    
    if (-not $cuentaBancaria) {
        Write-Host "❌ No hay cuenta bancaria activa con moneda $($cxc.moneda)" -ForegroundColor Red
        exit 1
    }
    
    $cuentaBancariaId = $cuentaBancaria.id
    $saldoAnterior = $cuentaBancaria.saldo
    
    Write-Host "✅ Cuenta bancaria encontrada:" -ForegroundColor Green
    Write-Host "   ID: $($cuentaBancaria.id)"
    Write-Host "   Nombre: $($cuentaBancaria.nombre)"
    Write-Host "   Banco: $($cuentaBancaria.banco)"
    Write-Host "   Saldo actual: $saldoAnterior $($cuentaBancaria.moneda)"
    Write-Host ""
} catch {
    Write-Host "❌ Error obteniendo cuenta bancaria: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Paso 3: Registrar cobro con cuenta bancaria
Write-Host "3. Registrando cobro con cuenta bancaria..." -ForegroundColor Yellow

$montoCobro = [Math]::Min(100, $cxc.monto_pendiente)

$cobroData = @{
    monto = $montoCobro
    fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
    moneda = $cxc.moneda
    metodo_pago = "TRANSFERENCIA"
    referencia = "TEST-COBRO-$(Get-Date -Format 'yyyyMMddHHmmss')"
    notas = "Test de creación automática de movimiento bancario desde cobro"
    cuenta_bancaria_id = $cuentaBancariaId
} | ConvertTo-Json

Write-Host "Datos del cobro:"
Write-Host $cobroData
Write-Host ""

try {
    $cobroResponse = Invoke-RestMethod -Uri "$baseUrl/finanzas/cxc/$cxcId/pago" -Method Post -Headers $headers -Body $cobroData
    
    Write-Host "✅ Cobro registrado exitosamente" -ForegroundColor Green
    Write-Host "   Monto cobrado: $montoCobro"
    Write-Host "   Nuevo saldo CxC: $($cobroResponse.data.monto_pendiente)"
    Write-Host ""
} catch {
    Write-Host "❌ Error registrando cobro: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Paso 4: Verificar que se creó el movimiento bancario
Write-Host "4. Verificando movimiento bancario creado..." -ForegroundColor Yellow
Start-Sleep -Seconds 1

try {
    $movimientosResponse = Invoke-RestMethod -Uri "$baseUrl/finanzas/bancos/cuentas/$cuentaBancariaId/movimientos?limit=1" -Method Get -Headers $headers
    
    if ($movimientosResponse.data.Count -eq 0) {
        Write-Host "❌ No se encontró el movimiento bancario" -ForegroundColor Red
        exit 1
    }
    
    $movimiento = $movimientosResponse.data[0]
    
    Write-Host "✅ Movimiento bancario creado:" -ForegroundColor Green
    Write-Host "   ID: $($movimiento.id)"
    Write-Host "   Tipo: $($movimiento.tipo) (debe ser ABONO)"
    Write-Host "   Monto: $($movimiento.monto)"
    Write-Host "   Fecha: $($movimiento.fecha)"
    Write-Host "   Descripción: $($movimiento.descripcion)"
    Write-Host "   Cliente ID: $($movimiento.cliente_id)"
    Write-Host "   CxC ID: $($movimiento.cxc_id)"
    Write-Host ""
    
    # Validaciones
    $errores = @()
    
    if ($movimiento.tipo -ne "ABONO") {
        $errores += "El tipo de movimiento debe ser ABONO, pero es $($movimiento.tipo)"
    }
    
    if ([Math]::Abs($movimiento.monto - $montoCobro) -gt 0.01) {
        $errores += "El monto del movimiento ($($movimiento.monto)) no coincide con el cobro ($montoCobro)"
    }
    
    if ($movimiento.cxc_id -ne $cxcId) {
        $errores += "El CxC ID del movimiento no coincide"
    }
    
    if ($movimiento.cliente_id -ne $cxc.cliente_id) {
        $errores += "El cliente ID del movimiento no coincide"
    }
    
    if ($errores.Count -gt 0) {
        Write-Host "❌ Errores de validación:" -ForegroundColor Red
        foreach ($error in $errores) {
            Write-Host "   - $error" -ForegroundColor Red
        }
        exit 1
    }
    
} catch {
    Write-Host "❌ Error verificando movimiento bancario: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Paso 5: Verificar que se actualizó el saldo de la cuenta bancaria
Write-Host "5. Verificando actualización de saldo bancario..." -ForegroundColor Yellow

try {
    $cuentaActualizada = Invoke-RestMethod -Uri "$baseUrl/finanzas/bancos/cuentas/$cuentaBancariaId" -Method Get -Headers $headers
    
    $saldoNuevo = $cuentaActualizada.data.saldo
    $saldoEsperado = $saldoAnterior + $montoCobro
    
    Write-Host "✅ Saldo de cuenta bancaria:" -ForegroundColor Green
    Write-Host "   Saldo anterior: $saldoAnterior"
    Write-Host "   Cobro: +$montoCobro"
    Write-Host "   Saldo esperado: $saldoEsperado"
    Write-Host "   Saldo actual: $saldoNuevo"
    Write-Host ""
    
    if ([Math]::Abs($saldoNuevo - $saldoEsperado) -gt 0.01) {
        Write-Host "❌ El saldo no se actualizó correctamente" -ForegroundColor Red
        Write-Host "   Diferencia: $([Math]::Abs($saldoNuevo - $saldoEsperado))" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "❌ Error verificando saldo: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ TEST EXITOSO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Resumen:" -ForegroundColor Cyan
Write-Host "  ✓ Cobro registrado correctamente"
Write-Host "  ✓ Movimiento bancario creado automáticamente (tipo ABONO)"
Write-Host "  ✓ Saldo de cuenta bancaria actualizado (+$montoCobro)"
Write-Host "  ✓ Referencias correctas (cliente_id, cxc_id)"
Write-Host ""
