# Test: Crear Período Contable
# Endpoint: POST /api/contabilidad/periodos

$baseUrl = "http://localhost:3000/api"

Write-Host "🧪 TEST: Crear Período Contable" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# 1. Login
Write-Host "1️⃣ Login..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = "Admin123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    Write-Host "✅ Login exitoso" -ForegroundColor Green
    Write-Host "Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    Write-Host "❌ Error en login: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Crear período contable
Write-Host "2️⃣ Crear período contable (2025-10)..." -ForegroundColor Yellow

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$periodoBody = @{
    anio = 2025
    mes = 10
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Post -Headers $headers -Body $periodoBody
    
    Write-Host "✅ Período creado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "📅 Detalles del período:" -ForegroundColor Cyan
    Write-Host "  ID: $($response.data.id)" -ForegroundColor White
    Write-Host "  Tenant ID: $($response.data.tenant_id)" -ForegroundColor White
    Write-Host "  Año: $($response.data.anio)" -ForegroundColor White
    Write-Host "  Mes: $($response.data.mes)" -ForegroundColor White
    Write-Host "  Estado: $($response.data.estado)" -ForegroundColor White
    Write-Host "  Creado: $($response.data.created_at)" -ForegroundColor White
    Write-Host ""
    Write-Host "Mensaje: $($response.message)" -ForegroundColor Green
} catch {
    $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "❌ Error creando período: $($errorDetails.message)" -ForegroundColor Red
    Write-Host "Detalles: $_" -ForegroundColor Red
}

Write-Host ""

# 3. Intentar crear el mismo período (debe fallar)
Write-Host "3️⃣ Intentar crear período duplicado (debe fallar)..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Post -Headers $headers -Body $periodoBody
    Write-Host "⚠️ No debería permitir crear período duplicado" -ForegroundColor Yellow
} catch {
    Write-Host "✅ Correctamente rechazado (período ya existe)" -ForegroundColor Green
}

Write-Host ""

# 4. Crear otro período (2025-11)
Write-Host "4️⃣ Crear otro período (2025-11)..." -ForegroundColor Yellow

$periodoBody2 = @{
    anio = 2025
    mes = 11
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Post -Headers $headers -Body $periodoBody2
    
    Write-Host "✅ Período 2025-11 creado exitosamente" -ForegroundColor Green
    Write-Host "  ID: $($response.data.id)" -ForegroundColor White
    Write-Host "  Estado: $($response.data.estado)" -ForegroundColor White
} catch {
    $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "❌ Error: $($errorDetails.message)" -ForegroundColor Red
}

Write-Host ""

# 5. Listar todos los períodos
Write-Host "5️⃣ Listar todos los períodos..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Get -Headers $headers
    
    Write-Host "✅ Períodos obtenidos exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Total de períodos: $($response.data.Count)" -ForegroundColor Cyan
    
    foreach ($periodo in $response.data) {
        Write-Host "  • $($periodo.anio)-$(([string]$periodo.mes).PadLeft(2, '0')) - Estado: $($periodo.estado)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Error listando períodos: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ TEST COMPLETADO" -ForegroundColor Green
