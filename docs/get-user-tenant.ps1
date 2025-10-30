# Script para obtener el tenant_id del usuario

$baseUrl = "http://localhost:3002"

# Login
$loginData = @{
    email = "superadmin@neon.com"
    password = "6559234.Yoandri1"
} | ConvertTo-Json

Write-Host "Obteniendo token..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
$token = $loginResponse.access_token

Write-Host "Token obtenido: $token" -ForegroundColor Green
Write-Host ""

# Obtener perfil
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "Obteniendo perfil de usuario..." -ForegroundColor Yellow
$profile = Invoke-RestMethod -Uri "$baseUrl/api/auth/profile" -Method Get -Headers $headers

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "INFORMACIÓN DEL USUARIO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Email: $($profile.email)" -ForegroundColor White
Write-Host "Tenant ID: $($profile.tenant_id)" -ForegroundColor Yellow
Write-Host "Role: $($profile.role)" -ForegroundColor White
Write-Host ""
Write-Host "Respuesta completa:" -ForegroundColor Gray
$profile | ConvertTo-Json -Depth 10
