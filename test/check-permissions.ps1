# Script para verificar permisos del usuario

$baseUrl = "http://localhost:3002"

# Login
$loginData = @{
    email = "superadmin@neon.com"
    password = "6559234.Yoandri1"
} | ConvertTo-Json

Write-Host "Login..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
$token = $loginResponse.access_token
$userId = $loginResponse.user.id

Write-Host "✓ Token obtenido" -ForegroundColor Green
Write-Host "User ID: $userId" -ForegroundColor White
Write-Host ""

# Obtener permisos del usuario
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "Obteniendo permisos del usuario..." -ForegroundColor Yellow

try {
    $permissions = Invoke-RestMethod -Uri "$baseUrl/api/usuarios-sistema/$userId/permissions" -Method Get -Headers $headers
    Write-Host "✓ Permisos obtenidos" -ForegroundColor Green
    Write-Host ""
    Write-Host "Permisos del usuario:" -ForegroundColor Cyan
    $permissions | ConvertTo-Json -Depth 10
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}
