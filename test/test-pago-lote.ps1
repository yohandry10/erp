# Test: Registrar pago masivo a proveedores
# Endpoint: POST /api/finanzas/tesoreria/lote

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkR1cGxpY2F0ZWQgd2l0aCBQb3N0bWFuIiwidHlwIjoiSldUIn0.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYxNDI5NTk5LCJpYXQiOjE3Mjk4OTM1OTksImlzcyI6Imh0dHBzOi8vdGVzdC5zdXBhYmFzZS5jbyIsInN1YiI6IjEyMzQ1Njc4LTEyMzQtMTIzNC0xMjM0LTEyMzQ1Njc4OTAxMiIsImVtYWlsIjoidGVzdEB0ZXN0LmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnt9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzI5ODkzNTk5fV0sInNlc3Npb25faWQiOiIxMjM0NTY3OC0xMjM0LTEyMzQtMTIzNC0xMjM0NTY3ODkwMTIifQ.test-signature"
$tenantId = "550e8400-e29b-41d4-a716-446655440001"

Write-Host "=== TEST: Registrar Pago Masivo a Proveedores ===" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Obtener programación de pagos para seleccionar CxP
Write-Host "Paso 1: Obteniendo programación de pagos..." -ForegroundColor Yellow
$programacionUrl = "$baseUrl/api/finanzas/tesoreria/programacion?limit=5"
$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

try {
    $programacion = Invoke-RestMethod -Uri $programacionUrl -Method Get -Headers $headers
    Write-Host "✅ Programación obtenida:" -ForegroundColor Green
    Write-Host ($programacion | ConvertTo-Json -Depth 5)
    Write-Host ""
    
    if ($programacion.data -and $programacion.data.Count -gt 0) {
        # Seleccionar las primeras 2-3 CxP para el lote
        $cxpsParaLote = $programacion.data | Select-Object -First 3
        Write-Host "CxP seleccionadas para el lote:" -ForegroundColor Cyan
        foreach ($cxp in $cxpsParaLote) {
            Write-Host "  - $($cxp.numero_documento): $($cxp.proveedor.razon_social) - Saldo: $($cxp.saldo) $($cxp.moneda)" -ForegroundColor White
        }
        Write-Host ""
    } else {
        Write-Host "⚠️ No hay CxP pendientes para procesar" -ForegroundColor Yellow
        exit
    }
} catch {
    Write-Host "❌ Error obteniendo programación:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit
}

# Paso 2: Obtener cuentas bancarias disponibles
Write-Host "Paso 2: Obteniendo cuentas bancarias..." -ForegroundColor Yellow
$bancosUrl = "$baseUrl/api/finanzas/bancos/cuentas"

try {
    $cuentas = Invoke-RestMethod -Uri $bancosUrl -Method Get -Headers $headers
    Write-Host "✅ Cuentas bancarias obtenidas:" -ForegroundColor Green
    Write-Host ($cuentas | ConvertTo-Json -Depth 3)
    Write-Host ""
    
    if ($cuentas.data -and $cuentas.data.Count -gt 0) {
        $cuentaBancaria = $cuentas.data[0]
        Write-Host "Cuenta bancaria seleccionada:" -ForegroundColor Cyan
        Write-Host "  - $($cuentaBancaria.nombre): Saldo: $($cuentaBancaria.saldo) $($cuentaBancaria.moneda)" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "⚠️ No hay cuentas bancarias disponibles" -ForegroundColor Yellow
        exit
    }
} catch {
    Write-Host "❌ Error obteniendo cuentas bancarias:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit
}

# Paso 3: Preparar el lote de pagos
Write-Host "Paso 3: Preparando lote de pagos..." -ForegroundColor Yellow

# Construir array de pagos
$pagos = @()
$montoTotalLote = 0

foreach ($cxp in $cxpsParaLote) {
    # Validar que la moneda coincida
    if ($cxp.moneda -eq $cuentaBancaria.moneda) {
        # Pagar el 50% del saldo o el saldo completo si es menor a 1000
        $montoPago = if ($cxp.saldo -lt 1000) { $cxp.saldo } else { [Math]::Round($cxp.saldo * 0.5, 2) }
        
        $pagos += @{
            cxp_id = $cxp.id
            monto = $montoPago
        }
        
        $montoTotalLote += $montoPago
    }
}

if ($pagos.Count -eq 0) {
    Write-Host "⚠️ No hay CxP con moneda compatible para procesar" -ForegroundColor Yellow
    exit
}

Write-Host "Pagos a procesar:" -ForegroundColor Cyan
Write-Host "  - Cantidad: $($pagos.Count)" -ForegroundColor White
Write-Host "  - Monto total: $montoTotalLote $($cuentaBancaria.moneda)" -ForegroundColor White
Write-Host ""

# Validar saldo suficiente
if ($cuentaBancaria.saldo -lt $montoTotalLote -and -not $cuentaBancaria.permite_sobregiro) {
    Write-Host "⚠️ Saldo insuficiente en cuenta bancaria" -ForegroundColor Yellow
    Write-Host "  - Saldo disponible: $($cuentaBancaria.saldo)" -ForegroundColor White
    Write-Host "  - Monto requerido: $montoTotalLote" -ForegroundColor White
    exit
}

# Paso 4: Registrar el lote de pagos
Write-Host "Paso 4: Registrando lote de pagos..." -ForegroundColor Yellow

$loteUrl = "$baseUrl/api/finanzas/tesoreria/lote"
$fechaHoy = Get-Date -Format "yyyy-MM-dd"
$referenciaLote = "LOTE-TEST-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

$body = @{
    pagos = $pagos
    fecha_pago = $fechaHoy
    metodo_pago = "TRANSFERENCIA"
    cuenta_bancaria_id = $cuentaBancaria.id
    referencia_lote = $referenciaLote
    observaciones = "Pago masivo de prueba - Automatizado"
} | ConvertTo-Json -Depth 5

Write-Host "Body del request:" -ForegroundColor Gray
Write-Host $body
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $loteUrl -Method Post -Headers $headers -Body $body
    Write-Host "✅ Lote de pagos registrado exitosamente:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10)
    Write-Host ""
    
    # Resumen
    Write-Host "=== RESUMEN DEL LOTE ===" -ForegroundColor Cyan
    Write-Host "Lote ID: $($response.data.lote_id)" -ForegroundColor White
    Write-Host "Total pagos: $($response.data.total_pagos)" -ForegroundColor White
    Write-Host "Monto total: $($response.data.monto_total)" -ForegroundColor White
    Write-Host "Pagos exitosos: $($response.data.pagos_exitosos)" -ForegroundColor Green
    Write-Host "Pagos fallidos: $($response.data.pagos_fallidos)" -ForegroundColor $(if ($response.data.pagos_fallidos -gt 0) { "Red" } else { "Green" })
    Write-Host ""
    Write-Host "Cuenta bancaria:" -ForegroundColor Cyan
    Write-Host "  - Saldo anterior: $($response.data.cuenta_bancaria.saldo_anterior)" -ForegroundColor White
    Write-Host "  - Saldo nuevo: $($response.data.cuenta_bancaria.saldo_nuevo)" -ForegroundColor White
    Write-Host ""
    
    Write-Host "Detalle de pagos:" -ForegroundColor Cyan
    foreach ($pago in $response.data.pagos) {
        Write-Host "  - $($pago.numero_documento) ($($pago.proveedor)):" -ForegroundColor White
        Write-Host "    Monto: $($pago.monto)" -ForegroundColor White
        Write-Host "    Estado: $($pago.estado_anterior) → $($pago.estado_nuevo)" -ForegroundColor $(if ($pago.estado_nuevo -eq "PAGADA") { "Green" } else { "Yellow" })
        Write-Host "    Saldo: $($pago.saldo_anterior) → $($pago.saldo_nuevo)" -ForegroundColor White
    }
    
} catch {
    Write-Host "❌ Error registrando lote de pagos:" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles:" -ForegroundColor Red
        Write-Host $_.ErrorDetails.Message
    }
}

Write-Host ""
Write-Host "=== FIN DEL TEST ===" -ForegroundColor Cyan
