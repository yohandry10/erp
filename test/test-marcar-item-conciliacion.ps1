# Test: POST /api/finanzas/conciliacion/:id/marcar-item
# Descripción: Prueba el endpoint de match manual de conciliación bancaria

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "9f40367f-a717-4a70-b59f-e719b29b29b2"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "=== TEST: Marcar Item Manual en Conciliación ===" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Obtener una conciliación existente
Write-Host "Paso 1: Obteniendo conciliaciones..." -ForegroundColor Yellow
try {
    $conciliaciones = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion" -Method Get -Headers $headers

    if ($conciliaciones.data -and $conciliaciones.data.Count -gt 0) {
        $conciliacion = $conciliaciones.data[0]
        $conciliacionId = $conciliacion.id
        Write-Host "✓ Conciliación encontrada: $conciliacionId" -ForegroundColor Green
        Write-Host "  Estado: $($conciliacion.estado)" -ForegroundColor Gray
        Write-Host "  Cuenta: $($conciliacion.cuentas_bancarias.banco) - $($conciliacion.cuentas_bancarias.numero_cuenta)" -ForegroundColor Gray
    } else {
        Write-Host "✗ No hay conciliaciones disponibles. Crea una primero." -ForegroundColor Red
        exit
    }
} catch {
    Write-Host "✗ Error obteniendo conciliaciones: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

Write-Host ""

# Paso 2: Obtener movimientos del sistema (no conciliados)
Write-Host "Paso 2: Obteniendo movimientos del sistema..." -ForegroundColor Yellow
try {
    $movimientosSistema = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$($conciliacion.cuenta_bancaria_id)/movimientos?conciliado=false&es_extracto=false" -Method Get -Headers $headers

    if ($movimientosSistema.data -and $movimientosSistema.data.Count -gt 0) {
        $movSistema = $movimientosSistema.data[0]
        Write-Host "✓ Movimiento sistema encontrado: $($movSistema.id)" -ForegroundColor Green
        Write-Host "  Fecha: $($movSistema.fecha)" -ForegroundColor Gray
        Write-Host "  Tipo: $($movSistema.tipo)" -ForegroundColor Gray
        Write-Host "  Monto: $($movSistema.monto)" -ForegroundColor Gray
    } else {
        Write-Host "⚠ No hay movimientos del sistema sin conciliar" -ForegroundColor Yellow
        Write-Host "  Usando IDs de ejemplo para la prueba..." -ForegroundColor Gray
        $movSistema = @{ id = "00000000-0000-0000-0000-000000000001" }
    }
} catch {
    Write-Host "⚠ Error obteniendo movimientos del sistema: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Usando IDs de ejemplo para la prueba..." -ForegroundColor Gray
    $movSistema = @{ id = "00000000-0000-0000-0000-000000000001" }
}

Write-Host ""

# Paso 3: Obtener movimientos del extracto (no conciliados)
Write-Host "Paso 3: Obteniendo movimientos del extracto..." -ForegroundColor Yellow
try {
    $movimientosExtracto = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$($conciliacion.cuenta_bancaria_id)/movimientos?conciliado=false&es_extracto=true&conciliacion_id=$conciliacionId" -Method Get -Headers $headers

    if ($movimientosExtracto.data -and $movimientosExtracto.data.Count -gt 0) {
        $movExtracto = $movimientosExtracto.data[0]
        Write-Host "✓ Movimiento extracto encontrado: $($movExtracto.id)" -ForegroundColor Green
        Write-Host "  Fecha: $($movExtracto.fecha)" -ForegroundColor Gray
        Write-Host "  Tipo: $($movExtracto.tipo)" -ForegroundColor Gray
        Write-Host "  Monto: $($movExtracto.monto)" -ForegroundColor Gray
    } else {
        Write-Host "⚠ No hay movimientos del extracto sin conciliar" -ForegroundColor Yellow
        Write-Host "  Usando IDs de ejemplo para la prueba..." -ForegroundColor Gray
        $movExtracto = @{ id = "00000000-0000-0000-0000-000000000002" }
    }
} catch {
    Write-Host "⚠ Error obteniendo movimientos del extracto: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Usando IDs de ejemplo para la prueba..." -ForegroundColor Gray
    $movExtracto = @{ id = "00000000-0000-0000-0000-000000000002" }
}

Write-Host ""

# Paso 4: Marcar item manual
Write-Host "Paso 4: Marcando match manual..." -ForegroundColor Yellow

$body = @{
    movimiento_sistema_id = $movSistema.id
    movimiento_extracto_id = $movExtracto.id
    diferencia = 0
} | ConvertTo-Json

Write-Host "Request Body:" -ForegroundColor Gray
Write-Host $body -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/marcar-item" -Method Post -Headers $headers -Body $body

    Write-Host "✓ Match manual realizado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor White

} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = $_.ErrorDetails.Message

    Write-Host "✗ Error al marcar item: Status $statusCode" -ForegroundColor Red
    Write-Host "Error Details:" -ForegroundColor Red
    Write-Host $errorBody -ForegroundColor Red
}

Write-Host ""
Write-Host "=== FIN DEL TEST ===" -ForegroundColor Cyan
