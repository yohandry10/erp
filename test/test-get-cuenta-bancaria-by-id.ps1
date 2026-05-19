# Test GET /api/finanzas/bancos/cuentas/:id

$BASE_URL = "http://localhost:3000"
$TOKEN = "REPLACE_WITH_TEST_JWT"
$TENANT_ID = "vierdes"

Write-Host "=== TEST: GET Cuenta Bancaria por ID ===" -ForegroundColor Cyan

# Primero obtener lista de cuentas para tener un ID válido
Write-Host "`n1. Obteniendo lista de cuentas bancarias..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "x-tenant-id" = $TENANT_ID
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/finanzas/bancos/cuentas" -Method Get -Headers $headers
    Write-Host "✓ Lista obtenida exitosamente" -ForegroundColor Green

    if ($response.data -and $response.data.Count -gt 0) {
        $cuentaId = $response.data[0].id
        Write-Host "  ID de cuenta a consultar: $cuentaId" -ForegroundColor Gray

        # Ahora obtener cuenta específica
        Write-Host "`n2. Obteniendo cuenta bancaria por ID..." -ForegroundColor Yellow
        $response2 = Invoke-RestMethod -Uri "$BASE_URL/api/finanzas/bancos/cuentas/$cuentaId" -Method Get -Headers $headers
        Write-Host "✓ Cuenta obtenida exitosamente" -ForegroundColor Green
        Write-Host ($response2 | ConvertTo-Json -Depth 10)

        # Test con ID inexistente
        Write-Host "`n3. Probando con ID inexistente..." -ForegroundColor Yellow
        try {
            $response3 = Invoke-RestMethod -Uri "$BASE_URL/api/finanzas/bancos/cuentas/00000000-0000-0000-0000-000000000000" -Method Get -Headers $headers
            Write-Host "✗ Debería haber fallado con 404" -ForegroundColor Red
        } catch {
            if ($_.Exception.Response.StatusCode -eq 404) {
                Write-Host "✓ Correctamente retorna 404 para ID inexistente" -ForegroundColor Green
            } else {
                Write-Host "✗ Error inesperado: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "  No hay cuentas bancarias para probar" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}
