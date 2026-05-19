# Test Match Automático - Conciliación Bancaria
# Este script prueba el endpoint POST /api/finanzas/conciliacion/:id/match-automatico

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "9f40367f-a717-4a70-b59f-e719b29b29b2"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "=== TEST: Match Automático de Conciliación ===" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Listar conciliaciones existentes
Write-Host "1. Listando conciliaciones existentes..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion" -Method Get -Headers $headers
    Write-Host "✓ Conciliaciones encontradas: $($response.data.Count)" -ForegroundColor Green

    if ($response.data.Count -gt 0) {
        $conciliacion = $response.data[0]
        $conciliacionId = $conciliacion.id
        Write-Host "  - ID: $conciliacionId" -ForegroundColor Gray
        Write-Host "  - Período: $($conciliacion.periodo)" -ForegroundColor Gray
        Write-Host "  - Estado: $($conciliacion.estado)" -ForegroundColor Gray
        Write-Host "  - Cuenta: $($conciliacion.cuentas_bancarias.banco) - $($conciliacion.cuentas_bancarias.numero_cuenta)" -ForegroundColor Gray
    } else {
        Write-Host "⚠ No hay conciliaciones. Crea una primero." -ForegroundColor Yellow
        exit
    }
} catch {
    Write-Host "✗ Error listando conciliaciones: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

Write-Host ""

# Paso 2: Ejecutar match automático con tolerancia por defecto (2 días)
Write-Host "2. Ejecutando match automático (tolerancia: 2 días)..." -ForegroundColor Yellow
$matchBody = @{
    tolerancia_dias = 2
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/match-automatico" -Method Post -Headers $headers -Body $matchBody
    Write-Host "✓ Match automático ejecutado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Resultados:" -ForegroundColor Cyan
    Write-Host "  - Matches realizados: $($response.data.matches_realizados)" -ForegroundColor White
    Write-Host "  - Matches por referencia: $($response.data.matches_por_referencia)" -ForegroundColor White
    Write-Host "  - Matches por monto/fecha: $($response.data.matches_por_monto_fecha)" -ForegroundColor White
    Write-Host "  - Movimientos sistema (total): $($response.data.movimientos_sistema_total)" -ForegroundColor White
    Write-Host "  - Movimientos extracto (total): $($response.data.movimientos_extracto_total)" -ForegroundColor White
    Write-Host "  - Movimientos sistema (pendientes): $($response.data.movimientos_sistema_pendientes)" -ForegroundColor White
    Write-Host "  - Movimientos extracto (pendientes): $($response.data.movimientos_extracto_pendientes)" -ForegroundColor White
    Write-Host "  - Porcentaje de match: $($response.data.porcentaje_match)%" -ForegroundColor White
    Write-Host "  - Tolerancia aplicada: ±$($response.data.tolerancia_dias) días" -ForegroundColor White
} catch {
    Write-Host "✗ Error ejecutando match automático: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# Paso 3: Probar con tolerancia diferente (5 días)
Write-Host "3. Ejecutando match automático con tolerancia de 5 días..." -ForegroundColor Yellow
$matchBody2 = @{
    tolerancia_dias = 5
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/match-automatico" -Method Post -Headers $headers -Body $matchBody2
    Write-Host "✓ Match automático ejecutado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Resultados con tolerancia de 5 días:" -ForegroundColor Cyan
    Write-Host "  - Matches realizados: $($response.data.matches_realizados)" -ForegroundColor White
    Write-Host "  - Porcentaje de match: $($response.data.porcentaje_match)%" -ForegroundColor White
} catch {
    Write-Host "✗ Error ejecutando match automático: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Paso 4: Verificar conciliación actualizada
Write-Host "4. Verificando estado de la conciliación..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId" -Method Get -Headers $headers
    Write-Host "✓ Conciliación obtenida" -ForegroundColor Green
    Write-Host "  - Estado: $($response.data.estado)" -ForegroundColor Gray
    Write-Host "  - Saldo libro: $($response.data.saldo_libro)" -ForegroundColor Gray
    Write-Host "  - Saldo banco: $($response.data.saldo_banco)" -ForegroundColor Gray
    Write-Host "  - Diferencia: $($response.data.diferencia)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error obteniendo conciliación: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Cyan
