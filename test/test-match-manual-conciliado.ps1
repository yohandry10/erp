# Test: Verificar que el match manual marca ambos movimientos como CONCILIADO
# Este script prueba el endpoint POST /api/finanzas/conciliacion/:id/marcar-item

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "76a654a5-e3b3-4c57-b4c6-395c2a369b57"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "=== TEST: Match Manual - Marcar ambos como CONCILIADO ===" -ForegroundColor Cyan
Write-Host ""

# PASO 1: Crear una conciliación de prueba
Write-Host "PASO 1: Creando conciliación de prueba..." -ForegroundColor Yellow

# Primero obtener una cuenta bancaria
$cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Get -Headers $headers
$cuentaBancaria = $cuentasResponse.data[0]

if (-not $cuentaBancaria) {
    Write-Host "ERROR: No hay cuentas bancarias disponibles" -ForegroundColor Red
    exit 1
}

Write-Host "Cuenta bancaria: $($cuentaBancaria.banco) - $($cuentaBancaria.numero_cuenta)" -ForegroundColor Green

$conciliacionBody = @{
    cuenta_bancaria_id = $cuentaBancaria.id
    periodo = "2024-12"
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

# PASO 2: Crear un movimiento del sistema (no extracto)
Write-Host "PASO 2: Creando movimiento del sistema..." -ForegroundColor Yellow

$movimientoSistemaBody = @{
    cuenta_bancaria_id = $cuentaBancaria.id
    tipo = "ABONO"
    monto = 1500.00
    fecha = "2024-12-15"
    descripcion = "Pago de cliente - Test Match Manual"
    referencia = "REF-TEST-001"
} | ConvertTo-Json

try {
    $movSistemaResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" -Method Post -Headers $headers -Body $movimientoSistemaBody
    $movimientoSistemaId = $movSistemaResponse.data.id
    Write-Host "✓ Movimiento sistema creado: $movimientoSistemaId" -ForegroundColor Green
    Write-Host "  - Tipo: ABONO" -ForegroundColor Gray
    Write-Host "  - Monto: 1500.00" -ForegroundColor Gray
    Write-Host "  - Conciliado: false (inicial)" -ForegroundColor Gray
} catch {
    Write-Host "ERROR creando movimiento sistema: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# PASO 3: Importar extracto CSV con un movimiento similar
Write-Host "PASO 3: Importando extracto CSV..." -ForegroundColor Yellow

$csvContent = @"
Fecha,Descripcion,Cargo,Abono,Saldo
15/12/2024,Deposito cliente,0.00,1500.00,10500.00
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
    $movimientoExtracto = $movimientosResponse.data | Where-Object { $_.es_extracto -eq $true -and $_.conciliacion_id -eq $conciliacionId } | Select-Object -First 1

    if (-not $movimientoExtracto) {
        Write-Host "ERROR: No se encontró el movimiento del extracto" -ForegroundColor Red
        exit 1
    }

    $movimientoExtractoId = $movimientoExtracto.id
    Write-Host "✓ Movimiento extracto encontrado: $movimientoExtractoId" -ForegroundColor Green
    Write-Host "  - Tipo: $($movimientoExtracto.tipo)" -ForegroundColor Gray
    Write-Host "  - Monto: $($movimientoExtracto.monto)" -ForegroundColor Gray
    Write-Host "  - Conciliado: $($movimientoExtracto.conciliado) (inicial)" -ForegroundColor Gray
} catch {
    Write-Host "ERROR obteniendo movimientos: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# PASO 5: Realizar match manual
Write-Host "PASO 5: Realizando match manual..." -ForegroundColor Yellow

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
    Write-Host "    - ID: $($matchResponse.data.movimiento_sistema.id)" -ForegroundColor Gray
    Write-Host "    - Fecha: $($matchResponse.data.movimiento_sistema.fecha)" -ForegroundColor Gray
    Write-Host "    - Tipo: $($matchResponse.data.movimiento_sistema.tipo)" -ForegroundColor Gray
    Write-Host "    - Monto: $($matchResponse.data.movimiento_sistema.monto)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Movimiento Extracto:" -ForegroundColor White
    Write-Host "    - ID: $($matchResponse.data.movimiento_extracto.id)" -ForegroundColor Gray
    Write-Host "    - Fecha: $($matchResponse.data.movimiento_extracto.fecha)" -ForegroundColor Gray
    Write-Host "    - Tipo: $($matchResponse.data.movimiento_extracto.tipo)" -ForegroundColor Gray
    Write-Host "    - Monto: $($matchResponse.data.movimiento_extracto.monto)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Diferencia: $($matchResponse.data.diferencia)" -ForegroundColor $(if ($matchResponse.data.diferencia -eq 0) { "Green" } else { "Yellow" })
    Write-Host "  Mensaje: $($matchResponse.data.mensaje)" -ForegroundColor Gray
} catch {
    Write-Host "ERROR realizando match manual: $_" -ForegroundColor Red
    $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "Detalles: $($errorDetails.message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# PASO 6: Verificar que ambos movimientos están marcados como conciliados
Write-Host "PASO 6: Verificando estado de conciliación..." -ForegroundColor Yellow

try {
    $movimientosResponse = Invoke-RestMethod -Uri $movimientosUrl -Method Get -Headers $headers

    $movSistemaActualizado = $movimientosResponse.data | Where-Object { $_.id -eq $movimientoSistemaId } | Select-Object -First 1
    $movExtractoActualizado = $movimientosResponse.data | Where-Object { $_.id -eq $movimientoExtractoId } | Select-Object -First 1

    Write-Host ""
    Write-Host "Estado final de los movimientos:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Movimiento Sistema:" -ForegroundColor White
    Write-Host "  - ID: $($movSistemaActualizado.id)" -ForegroundColor Gray
    Write-Host "  - Conciliado: $($movSistemaActualizado.conciliado)" -ForegroundColor $(if ($movSistemaActualizado.conciliado) { "Green" } else { "Red" })
    Write-Host "  - Es Extracto: $($movSistemaActualizado.es_extracto)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Movimiento Extracto:" -ForegroundColor White
    Write-Host "  - ID: $($movExtractoActualizado.id)" -ForegroundColor Gray
    Write-Host "  - Conciliado: $($movExtractoActualizado.conciliado)" -ForegroundColor $(if ($movExtractoActualizado.conciliado) { "Green" } else { "Red" })
    Write-Host "  - Es Extracto: $($movExtractoActualizado.es_extracto)" -ForegroundColor Gray
    Write-Host ""

    # Validar que ambos están conciliados
    if ($movSistemaActualizado.conciliado -and $movExtractoActualizado.conciliado) {
        Write-Host "✓✓✓ ÉXITO: Ambos movimientos están marcados como CONCILIADO ✓✓✓" -ForegroundColor Green
        Write-Host ""
        Write-Host "La tarea 'Marcar ambos como CONCILIADO' está COMPLETADA correctamente." -ForegroundColor Green
    } else {
        Write-Host "✗✗✗ ERROR: Los movimientos NO están marcados como conciliados ✗✗✗" -ForegroundColor Red
        if (-not $movSistemaActualizado.conciliado) {
            Write-Host "  - Movimiento sistema NO conciliado" -ForegroundColor Red
        }
        if (-not $movExtractoActualizado.conciliado) {
            Write-Host "  - Movimiento extracto NO conciliado" -ForegroundColor Red
        }
        exit 1
    }
} catch {
    Write-Host "ERROR verificando estado: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== TEST COMPLETADO EXITOSAMENTE ===" -ForegroundColor Cyan
