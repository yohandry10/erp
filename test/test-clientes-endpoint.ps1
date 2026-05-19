# Test script para verificar endpoint de clientes
# Verifica que los clientes se puedan listar correctamente

$baseUrl = "http://localhost:3001/api"

Write-Host "=== TEST: Listar Clientes ===" -ForegroundColor Cyan

# Obtener token de autenticación (ajusta según tu configuración)
$loginBody = @{
    email = "admin@example.com"
    password = "admin123"
} | ConvertTo-Json

try {
    Write-Host "`nObteniendo token de autenticación..." -ForegroundColor Yellow
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    Write-Host "Token obtenido exitosamente" -ForegroundColor Green

    # Headers con autenticación
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }

    # Test 1: Listar todos los clientes (sin búsqueda)
    Write-Host "`n--- Test 1: Listar todos los clientes ---" -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "$baseUrl/ventas/clientes?limit=100" -Method Get -Headers $headers
    Write-Host "Clientes encontrados: $($response.data.Count)" -ForegroundColor Green

    if ($response.data.Count -gt 0) {
        Write-Host "`nPrimeros 3 clientes:" -ForegroundColor Cyan
        $response.data | Select-Object -First 3 | ForEach-Object {
            Write-Host "  - $($_.razon_social) ($($_.documento_tipo): $($_.documento_numero))" -ForegroundColor White
        }
    }

    # Test 2: Buscar cliente específico
    Write-Host "`n--- Test 2: Buscar cliente por término ---" -ForegroundColor Yellow
    $searchTerm = "empresa"
    $response = Invoke-RestMethod -Uri "$baseUrl/ventas/clientes?search=$searchTerm&limit=10" -Method Get -Headers $headers
    Write-Host "Clientes encontrados con '$searchTerm': $($response.data.Count)" -ForegroundColor Green

    # Test 3: Obtener cliente por ID
    if ($response.data.Count -gt 0) {
        $clienteId = $response.data[0].id
        Write-Host "`n--- Test 3: Obtener cliente por ID ---" -ForegroundColor Yellow
        $cliente = Invoke-RestMethod -Uri "$baseUrl/ventas/clientes/$clienteId" -Method Get -Headers $headers
        Write-Host "Cliente obtenido: $($cliente.data.razon_social)" -ForegroundColor Green
    }

    Write-Host "`n=== TODOS LOS TESTS PASARON ===" -ForegroundColor Green

} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
