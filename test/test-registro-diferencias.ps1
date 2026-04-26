# Test: Verificar que el registro de diferencias funciona correctamente
# Este script prueba que las diferencias se registran cuando hay discrepancias entre sistema y extracto

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4ZTU3ZGU2Yy1hOTBjLTRhMzItYjU5Zi1lMzJiMzE0YzQwNjgiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwidGVuYW50X2lkIjoiNzZhNjU0YTUtZTNiMy00YzU3LWI0YzYtMzk1YzJhMzY5YjU3IiwiaWF0IjoxNzMzMzQ1Mzk3LCJleHAiOjE3MzM0MzE3OTd9.Rl-tMYqvhBqOXqKEqLlZJjvPvXCqLlZJjvPvXCqLlZJjvPvXCqLlZJjvPvXCqLl"
$tenantId = "76a654a5-e3b3-4c57-b4c6-395c2a369b57"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "=== TEST: Registro de Diferencias en Conciliación ===" -ForegroundColor Cyan
Write-Host ""

# PASO 1: Crear una conciliación de prueba
Write-Host "PASO 1: Creando conciliación de prueba..." -ForegroundColor Yellow

# Obtener una cuenta bancaria
$cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Get -Headers $headers
$cuentaBancaria = $cuentasResponse.data[0]

if (-not $cuentaBancaria) {
    Write-Host "ERROR: No hay cuentas bancarias disponibles" -ForegroundColor Red
    exit 1
}

Write-Host "Cuenta bancaria: $($cuentaBancaria.banco) - $($cuentaBancaria.numero_cuenta)" -ForegroundColor Green

$conciliacionBody = @{
    cuenta_bancaria_id = $cuentaBancaria.id
    periodo = "2024-12-DIFF"
    fecha_desde = "2024-12-01"
    fecha_hasta = "2024-12-31"
} | ConvertTo-Json

try {
    $conciliacionResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion" -Method Post -Headers $headers -Body $conciliacionBody
    $conciliacionId = $conciliacionResponse.data.id
    Write-Host "✓ Conciliación creada: $conciliacionId" -ForegroundColor Green
} catch {
    Write-Host "ERROR creando conciliación: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# PASO 2: Crear movimiento del sistema con monto específico
Write-Host "PASO 2: Creando movimiento del sistema..." -ForegroundColor Yellow

$montoSistema = 1500.00
$movimientoSistemaBody = @{
    cuenta_bancaria_id = $cuentaBancaria.id
    tipo = "ABONO"
    monto = $montoSistema
    fecha = "2024-12-15"
    descripcion = "Pago de cliente - Test Diferencias"
    referencia = "REF-DIFF-001"
} | ConvertTo-Json

try {
    $movSistemaResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" -Method Post -Headers $headers -Body $movimientoSistemaBody
    $movimientoSistemaId = $movSistemaResponse.data.id
    Write-Host "✓ Movimiento sistema creado: $movimientoSistemaId" -ForegroundColor Green
    Write-Host "  - Tipo: ABONO" -ForegroundColor Gray
    Write-Host "  - Monto: $montoSistema" -ForegroundColor Gray
} catch {
    Write-Host "ERROR creando movimiento sistema: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# PASO 3: Importar extracto CSV con monto diferente (comisión bancaria)
Write-Host "PASO 3: Importando extracto CSV con diferencia..." -ForegroundColor Yellow

$montoExtracto = 1485.50  # Diferencia de 14.50 (comisión bancaria)
$diferencia = [Math]::Abs($montoExtracto - $montoSistema)

Write-Host "  - Monto Sistema: $montoSistema" -ForegroundColor Gray
Write-Host "  - Monto Extracto: $montoExtracto" -ForegroundColor Gray
Write-Host "  - Diferencia esperada: $diferencia" -ForegroundColor Yellow

$csvContent = @"
Fecha,Descripcion,Cargo,Abono,Saldo
15/12/2024,Deposito cliente (con comision),0.00,$montoExtracto,10485.50
"@

$importarCsvBody = @{
    contenidoCsv = $csvContent
    banco = "GENERICO"
} | ConvertTo-Json

try {
    $importResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/importar-csv" -Method Post -Headers $headers -Body $importarCsvBody
    Write-Host "✓ Extracto importado: $($importResponse.data.movimientos_importados) movimientos" -ForegroundColor Green
} catch {
    Write-Host "ERROR importando CSV: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# PASO 4: Obtener el movimiento del extracto
Write-Host "PASO 4: Obteniendo movimiento del extracto..." -ForegroundColor Yellow

$movimientosUrl = "$baseUrl/api/finanzas/bancos/cuentas/$($cuentaBancaria.id)/movimientos"
try {
    $movimientosResponse = Invoke-RestMethod -Uri $movimientosUrl -Method Get -Headers $headers
    $movimientoExtracto = $movimientosResponse.data | Where-Object { 
        $_.es_extracto -eq $true -and 
        $_.conciliacion_id -eq $conciliacionId 
    } | Select-Object -First 1
    
    if (-not $movimientoExtracto) {
        Write-Host "ERROR: No se encontró el movimiento del extracto" -ForegroundColor Red
        exit 1
    }
    
    $movimientoExtractoId = $movimientoExtracto.id
    Write-Host "✓ Movimiento extracto encontrado: $movimientoExtractoId" -ForegroundColor Green
    Write-Host "  - Tipo: $($movimientoExtracto.tipo)" -ForegroundColor Gray
    Write-Host "  - Monto: $($movimientoExtracto.monto)" -ForegroundColor Gray
} catch {
    Write-Host "ERROR obteniendo movimientos: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# PASO 5: Realizar match manual SIN especificar diferencia (debe calcularla automáticamente)
Write-Host "PASO 5: Realizando match manual (cálculo automático de diferencia)..." -ForegroundColor Yellow

$marcarItemBody = @{
    movimiento_sistema_id = $movimientoSistemaId
    movimiento_extracto_id = $movimientoExtractoId
} | ConvertTo-Json

try {
    $matchResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/marcar-item" -Method Post -Headers $headers -Body $marcarItemBody
    Write-Host "✓ Match manual realizado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Resultado del match:" -ForegroundColor Cyan
    Write-Host "  Movimiento Sistema:" -ForegroundColor White
    Write-Host "    - Monto: $($matchResponse.data.movimiento_sistema.monto)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Movimiento Extracto:" -ForegroundColor White
    Write-Host "    - Monto: $($matchResponse.data.movimiento_extracto.monto)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Diferencia registrada: $($matchResponse.data.diferencia)" -ForegroundColor $(if ($matchResponse.data.diferencia -gt 0) { "Yellow" } else { "Green" })
    Write-Host "  Mensaje: $($matchResponse.data.mensaje)" -ForegroundColor Gray
    
    $diferenciaRegistrada = $matchResponse.data.diferencia
} catch {
    Write-Host "ERROR realizando match manual: $_" -ForegroundColor Red
    $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "Detalles: $($errorDetails.message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# PASO 6: Verificar que la diferencia se registró correctamente en la BD
Write-Host "PASO 6: Verificando registro de diferencia en BD..." -ForegroundColor Yellow

try {
    $movimientosResponse = Invoke-RestMethod -Uri $movimientosUrl -Method Get -Headers $headers
    
    $movSistemaActualizado = $movimientosResponse.data | Where-Object { $_.id -eq $movimientoSistemaId } | Select-Object -First 1
    $movExtractoActualizado = $movimientosResponse.data | Where-Object { $_.id -eq $movimientoExtractoId } | Select-Object -First 1
    
    Write-Host ""
    Write-Host "Verificación de diferencias registradas:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Movimiento Sistema:" -ForegroundColor White
    Write-Host "  - Conciliado: $($movSistemaActualizado.conciliado)" -ForegroundColor $(if ($movSistemaActualizado.conciliado) { "Green" } else { "Red" })
    Write-Host "  - Diferencia Conciliación: $($movSistemaActualizado.diferencia_conciliacion)" -ForegroundColor Yellow
    Write-Host "  - Movimiento Relacionado ID: $($movSistemaActualizado.movimiento_relacionado_id)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Movimiento Extracto:" -ForegroundColor White
    Write-Host "  - Conciliado: $($movExtractoActualizado.conciliado)" -ForegroundColor $(if ($movExtractoActualizado.conciliado) { "Green" } else { "Red" })
    Write-Host "  - Diferencia Conciliación: $($movExtractoActualizado.diferencia_conciliacion)" -ForegroundColor Yellow
    Write-Host "  - Movimiento Relacionado ID: $($movExtractoActualizado.movimiento_relacionado_id)" -ForegroundColor Gray
    Write-Host ""
    
    # Validaciones
    $errores = @()
    
    # 1. Verificar que ambos están conciliados
    if (-not $movSistemaActualizado.conciliado) {
        $errores += "Movimiento sistema NO está conciliado"
    }
    if (-not $movExtractoActualizado.conciliado) {
        $errores += "Movimiento extracto NO está conciliado"
    }
    
    # 2. Verificar que la diferencia se registró
    if ($null -eq $movSistemaActualizado.diferencia_conciliacion) {
        $errores += "Diferencia NO registrada en movimiento sistema"
    }
    if ($null -eq $movExtractoActualizado.diferencia_conciliacion) {
        $errores += "Diferencia NO registrada en movimiento extracto"
    }
    
    # 3. Verificar que la diferencia es correcta
    $diferenciaEsperada = [Math]::Round($diferencia, 2)
    $diferenciaRegistradaSistema = [Math]::Round($movSistemaActualizado.diferencia_conciliacion, 2)
    $diferenciaRegistradaExtracto = [Math]::Round($movExtractoActualizado.diferencia_conciliacion, 2)
    
    if ($diferenciaRegistradaSistema -ne $diferenciaEsperada) {
        $errores += "Diferencia en sistema ($diferenciaRegistradaSistema) no coincide con esperada ($diferenciaEsperada)"
    }
    if ($diferenciaRegistradaExtracto -ne $diferenciaEsperada) {
        $errores += "Diferencia en extracto ($diferenciaRegistradaExtracto) no coincide con esperada ($diferenciaEsperada)"
    }
    
    # 4. Verificar que los movimientos están vinculados
    if ($movSistemaActualizado.movimiento_relacionado_id -ne $movimientoExtractoId) {
        $errores += "Movimiento sistema NO está vinculado correctamente al extracto"
    }
    if ($movExtractoActualizado.movimiento_relacionado_id -ne $movimientoSistemaId) {
        $errores += "Movimiento extracto NO está vinculado correctamente al sistema"
    }
    
    if ($errores.Count -gt 0) {
        Write-Host "✗✗✗ ERRORES ENCONTRADOS ✗✗✗" -ForegroundColor Red
        foreach ($error in $errores) {
            Write-Host "  - $error" -ForegroundColor Red
        }
        exit 1
    } else {
        Write-Host "✓✓✓ ÉXITO: Registro de diferencias funciona correctamente ✓✓✓" -ForegroundColor Green
        Write-Host ""
        Write-Host "Validaciones exitosas:" -ForegroundColor Green
        Write-Host "  ✓ Ambos movimientos conciliados" -ForegroundColor Green
        Write-Host "  ✓ Diferencia registrada en ambos movimientos" -ForegroundColor Green
        Write-Host "  ✓ Diferencia calculada correctamente: $diferenciaEsperada" -ForegroundColor Green
        Write-Host "  ✓ Movimientos vinculados correctamente" -ForegroundColor Green
    }
} catch {
    Write-Host "ERROR verificando estado: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# PASO 7: Verificar el reporte de diferencias
Write-Host "PASO 7: Verificando reporte de diferencias..." -ForegroundColor Yellow

try {
    $diferenciasResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/diferencias" -Method Get -Headers $headers
    
    Write-Host ""
    Write-Host "Reporte de Diferencias:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Saldos:" -ForegroundColor White
    Write-Host "  - Saldo Libro: $($diferenciasResponse.data.saldos.saldo_libro)" -ForegroundColor Gray
    Write-Host "  - Saldo Banco: $($diferenciasResponse.data.saldos.saldo_banco)" -ForegroundColor Gray
    Write-Host "  - Diferencia Neta: $($diferenciasResponse.data.saldos.diferencia_neta)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Movimientos Sistema:" -ForegroundColor White
    Write-Host "  - Total: $($diferenciasResponse.data.movimientos_sistema.total)" -ForegroundColor Gray
    Write-Host "  - Conciliados: $($diferenciasResponse.data.movimientos_sistema.conciliados)" -ForegroundColor Green
    Write-Host "  - Pendientes: $($diferenciasResponse.data.movimientos_sistema.pendientes)" -ForegroundColor $(if ($diferenciasResponse.data.movimientos_sistema.pendientes -eq 0) { "Green" } else { "Yellow" })
    Write-Host ""
    Write-Host "Movimientos Extracto:" -ForegroundColor White
    Write-Host "  - Total: $($diferenciasResponse.data.movimientos_extracto.total)" -ForegroundColor Gray
    Write-Host "  - Conciliados: $($diferenciasResponse.data.movimientos_extracto.conciliados)" -ForegroundColor Green
    Write-Host "  - Pendientes: $($diferenciasResponse.data.movimientos_extracto.pendientes)" -ForegroundColor $(if ($diferenciasResponse.data.movimientos_extracto.pendientes -eq 0) { "Green" } else { "Yellow" })
    Write-Host ""
    Write-Host "Métricas:" -ForegroundColor White
    Write-Host "  - % Conciliado Sistema: $($diferenciasResponse.data.metricas.porcentaje_conciliado_sistema)%" -ForegroundColor Green
    Write-Host "  - % Conciliado Extracto: $($diferenciasResponse.data.metricas.porcentaje_conciliado_extracto)%" -ForegroundColor Green
    Write-Host ""
    Write-Host "✓ Reporte de diferencias generado correctamente" -ForegroundColor Green
} catch {
    Write-Host "ERROR obteniendo reporte de diferencias: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== TEST COMPLETADO EXITOSAMENTE ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "La tarea 'Registro de diferencias' está COMPLETADA y funciona correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Funcionalidades verificadas:" -ForegroundColor Cyan
Write-Host "  ✓ Cálculo automático de diferencias" -ForegroundColor Green
Write-Host "  ✓ Registro de diferencias en BD (columna diferencia_conciliacion)" -ForegroundColor Green
Write-Host "  ✓ Vinculación de movimientos (columna movimiento_relacionado_id)" -ForegroundColor Green
Write-Host "  ✓ Reporte de diferencias (endpoint GET /diferencias)" -ForegroundColor Green
Write-Host "  ✓ Marcado de movimientos como conciliados" -ForegroundColor Green
