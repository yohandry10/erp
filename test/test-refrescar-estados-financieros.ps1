# Test: Refrescar Estados Financieros
# Endpoint: POST /api/contabilidad/estados/refrescar

$baseUrl = "http://localhost:3000/api"

Write-Host "🧪 TEST: Refrescar Estados Financieros" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Login
Write-Host "1️⃣ Iniciando sesión..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = "Admin123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    $tenantId = $loginResponse.user.tenant_id

    Write-Host "✅ Login exitoso" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host "   Tenant ID: $tenantId" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Error en login: $_" -ForegroundColor Red
    exit 1
}

# Headers con autenticación
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

# 2. Refrescar estados financieros
Write-Host "2️⃣ Refrescando estados financieros..." -ForegroundColor Yellow

$refrescarBody = @{
    anio = 2024
    mes = 10
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/estados/refrescar" -Method Post -Headers $headers -Body $refrescarBody

    Write-Host "✅ Respuesta recibida:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor White
    Write-Host ""

    if ($response.success) {
        Write-Host "✅ Estados financieros refrescados exitosamente" -ForegroundColor Green
        Write-Host "   Mensaje: $($response.message)" -ForegroundColor Gray

        if ($response.data) {
            Write-Host "   Período: $($response.data.periodo.descripcion)" -ForegroundColor Gray

            if ($response.data.vistas_refrescadas) {
                Write-Host "   Vistas refrescadas: $($response.data.vistas_refrescadas -join ', ')" -ForegroundColor Gray
            }

            if ($response.data.duracion_ms) {
                Write-Host "   Duración: $($response.data.duracion_ms) ms" -ForegroundColor Gray
            }

            if ($response.data.vistas_materializadas -eq $false) {
                Write-Host "   ℹ️ No hay vistas materializadas configuradas" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "⚠️ La operación no fue completamente exitosa" -ForegroundColor Yellow
        Write-Host "   Mensaje: $($response.message)" -ForegroundColor Gray
    }

} catch {
    Write-Host "❌ Error refrescando estados financieros:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ TEST COMPLETADO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
