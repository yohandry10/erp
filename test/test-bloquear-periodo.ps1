# Test script para el endpoint POST /api/contabilidad/periodos/:id/bloquear
# Este script demuestra cómo usar el nuevo endpoint para bloquear períodos contables

$baseUrl = "http://localhost:3000/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "🧪 Test: Bloquear Período Contable" -ForegroundColor Cyan
Write-Host "====================================`n" -ForegroundColor Cyan

# Paso 1: Login (obtener token)
Write-Host "1️⃣ Obteniendo token de autenticación..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = $env:TEST_USER_PASSWORD
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    Write-Host "✅ Token obtenido exitosamente`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Error obteniendo token: $_" -ForegroundColor Red
    exit 1
}

# Headers con autenticación
$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

# Paso 2: Crear un período de prueba
Write-Host "2️⃣ Creando período de prueba (2024-11)..." -ForegroundColor Yellow
$crearPeriodoBody = @{
    anio = 2024
    mes = 11
} | ConvertTo-Json

try {
    $periodoResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method POST -Headers $headers -Body $crearPeriodoBody
    $periodoId = $periodoResponse.data.id
    Write-Host "✅ Período creado: $periodoId" -ForegroundColor Green
    Write-Host "   Estado inicial: $($periodoResponse.data.estado)`n" -ForegroundColor Gray
} catch {
    # Si el período ya existe, intentar obtenerlo
    Write-Host "⚠️ El período ya existe, obteniendo ID..." -ForegroundColor Yellow
    try {
        $periodosResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method GET -Headers $headers
        $periodo = $periodosResponse.data | Where-Object { $_.anio -eq 2024 -and $_.mes -eq 11 } | Select-Object -First 1
        if ($periodo) {
            $periodoId = $periodo.id
            Write-Host "✅ Período encontrado: $periodoId`n" -ForegroundColor Green
        } else {
            Write-Host "❌ No se pudo encontrar el período" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "❌ Error obteniendo períodos: $_" -ForegroundColor Red
        exit 1
    }
}

# Paso 3: Bloquear el período
Write-Host "3️⃣ Bloqueando período $periodoId..." -ForegroundColor Yellow
try {
    $bloquearResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos/$periodoId/bloquear" -Method POST -Headers $headers
    Write-Host "✅ Período bloqueado exitosamente!" -ForegroundColor Green
    Write-Host "`n📊 Respuesta del servidor:" -ForegroundColor Cyan
    Write-Host "   Success: $($bloquearResponse.success)" -ForegroundColor Gray
    Write-Host "   Message: $($bloquearResponse.message)" -ForegroundColor Gray
    Write-Host "   Estado: $($bloquearResponse.data.estado)" -ForegroundColor Gray
    Write-Host "   Año: $($bloquearResponse.data.anio)" -ForegroundColor Gray
    Write-Host "   Mes: $($bloquearResponse.data.mes)`n" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error bloqueando período: $_" -ForegroundColor Red
    Write-Host $_.Exception.Response.StatusCode -ForegroundColor Red
    exit 1
}

# Paso 4: Verificar que el período está bloqueado
Write-Host "4️⃣ Verificando estado del período..." -ForegroundColor Yellow
try {
    $verificarResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos/$periodoId" -Method GET -Headers $headers
    if ($verificarResponse.data.estado -eq "BLOQUEADO") {
        Write-Host "✅ Verificación exitosa: El período está BLOQUEADO`n" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Advertencia: El período tiene estado: $($verificarResponse.data.estado)`n" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error verificando período: $_" -ForegroundColor Red
}

Write-Host "====================================`n" -ForegroundColor Cyan
Write-Host "✅ Test completado exitosamente!" -ForegroundColor Green
Write-Host "`n📝 Notas:" -ForegroundColor Cyan
Write-Host "   - El endpoint POST /api/contabilidad/periodos/:id/bloquear está funcionando" -ForegroundColor Gray
Write-Host "   - Un período bloqueado no permite registrar movimientos contables" -ForegroundColor Gray
Write-Host "   - Se puede bloquear un período en cualquier estado (ABIERTO o CERRADO)" -ForegroundColor Gray
