# Test simple para verificar acceso a CxP

$baseUrl = "http://localhost:3002"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

# Login
$loginData = @{
    email = "superadmin@neon.com"
    password = $env:TEST_USER_PASSWORD
} | ConvertTo-Json

Write-Host "Login..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
$token = $loginResponse.access_token
Write-Host "✓ Token obtenido" -ForegroundColor Green
Write-Host ""

# Probar sin tenant_id
Write-Host "TEST 1: Sin x-tenant-id header" -ForegroundColor Yellow
$headers1 = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    $response1 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" -Method Get -Headers $headers1
    Write-Host "✓ Funciona sin x-tenant-id" -ForegroundColor Green
    Write-Host "Total CxP: $($response1.data.Count)" -ForegroundColor White
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Probar con tenant_id
Write-Host "TEST 2: Con x-tenant-id header" -ForegroundColor Yellow
$headers2 = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

try {
    $response2 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" -Method Get -Headers $headers2
    Write-Host "✓ Funciona con x-tenant-id" -ForegroundColor Green
    Write-Host "Total CxP: $($response2.data.Count)" -ForegroundColor White
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}
