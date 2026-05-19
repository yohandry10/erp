# Test: Listar Conciliaciones Bancarias
# Endpoint: GET /api/finanzas/conciliacion

Write-Host "=== Test: Listar Conciliaciones Bancarias ===" -ForegroundColor Cyan
Write-Host ""

# Configuración
$baseUrl = "http://localhost:3002"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "d290f1ee-6c54-4b01-90e6-d701748f0851"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

# Test 1: Listar todas las conciliaciones
Write-Host "1. Listando todas las conciliaciones..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/api/finanzas/conciliacion" -Method Get -Headers $headers
    Write-Host "✓ Conciliaciones obtenidas:" -ForegroundColor Green
    $response.data | ForEach-Object {
        Write-Host "  - ID: $($_.id)" -ForegroundColor White
        Write-Host "    Período: $($_.periodo)" -ForegroundColor White
        Write-Host "    Estado: $($_.estado)" -ForegroundColor White
        Write-Host "    Cuenta: $($_.cuentas_bancarias.banco) - $($_.cuentas_bancarias.numero_cuenta)" -ForegroundColor White
        Write-Host "    Saldo Libro: $($_.saldo_libro)" -ForegroundColor White
        Write-Host "    Saldo Banco: $($_.saldo_banco)" -ForegroundColor White
        Write-Host "    Diferencia: $($_.diferencia)" -ForegroundColor White
        Write-Host ""
    }
    Write-Host "Total: $($response.data.Count) conciliaciones" -ForegroundColor Cyan
} catch {
    Write-Host "✗ Error listando conciliaciones: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# Test 2: Filtrar por estado ABIERTA
Write-Host "2. Filtrando por estado ABIERTA..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/api/finanzas/conciliacion?estado=ABIERTA" -Method Get -Headers $headers
    Write-Host "✓ Conciliaciones ABIERTAS: $($response.data.Count)" -ForegroundColor Green
    $response.data | ForEach-Object {
        Write-Host "  - $($_.periodo) - $($_.cuentas_bancarias.banco) $($_.cuentas_bancarias.numero_cuenta)" -ForegroundColor White
    }
} catch {
    Write-Host "✗ Error filtrando por estado: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Filtrar por estado CERRADA
Write-Host "3. Filtrando por estado CERRADA..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/api/finanzas/conciliacion?estado=CERRADA" -Method Get -Headers $headers
    Write-Host "✓ Conciliaciones CERRADAS: $($response.data.Count)" -ForegroundColor Green
    $response.data | ForEach-Object {
        Write-Host "  - $($_.periodo) - $($_.cuentas_bancarias.banco) $($_.cuentas_bancarias.numero_cuenta)" -ForegroundColor White
    }
} catch {
    Write-Host "✗ Error filtrando por estado: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test Completado ===" -ForegroundColor Cyan
