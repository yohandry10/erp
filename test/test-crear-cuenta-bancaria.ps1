# Test: POST /api/finanzas/bancos/cuentas
# Descripción: Crear una nueva cuenta bancaria

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjY3YzI0Yy1hMzE0LTRhNzAtYjU5Zi1lNzE0YzY5YzY5YzYiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6ImFkbWluIiwidGVuYW50X2lkIjoiNzc3Nzc3NzctNzc3Ny03Nzc3LTc3NzctNzc3Nzc3Nzc3Nzc3IiwiaWF0IjoxNzMwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.T8nEz8VjWvU5l_F-example-token-replace-with-real"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = "77777777-7777-7777-7777-777777777777"
}

Write-Host "=== TEST: Crear Cuenta Bancaria ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Crear cuenta bancaria básica
Write-Host "Test 1: Crear cuenta bancaria básica (BCP - Corriente)" -ForegroundColor Yellow
$body1 = @{
    nombre = "BCP - Cuenta Corriente Principal"
    banco = "Banco de Crédito del Perú"
    numero_cuenta = "19100123456789"
    tipo_cuenta = "CORRIENTE"
    moneda = "PEN"
    saldo = 50000.00
    permite_sobregiro = $false
    activa = $true
} | ConvertTo-Json

try {
    $response1 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $body1
    Write-Host "✅ Cuenta creada exitosamente" -ForegroundColor Green
    Write-Host "ID: $($response1.data.id)" -ForegroundColor Gray
    Write-Host "Nombre: $($response1.data.nombre)" -ForegroundColor Gray
    Write-Host "Banco: $($response1.data.banco)" -ForegroundColor Gray
    Write-Host "Número: $($response1.data.numero_cuenta)" -ForegroundColor Gray
    Write-Host "Saldo: $($response1.data.saldo) $($response1.data.moneda)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 2: Crear cuenta en dólares
Write-Host "Test 2: Crear cuenta en dólares (BBVA - Ahorros)" -ForegroundColor Yellow
$body2 = @{
    nombre = "BBVA - Cuenta Ahorros USD"
    banco = "BBVA Continental"
    numero_cuenta = "00110234567890"
    tipo_cuenta = "AHORROS"
    moneda = "USD"
    saldo = 10000.00
    permite_sobregiro = $false
    activa = $true
} | ConvertTo-Json

try {
    $response2 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $body2
    Write-Host "✅ Cuenta creada exitosamente" -ForegroundColor Green
    Write-Host "ID: $($response2.data.id)" -ForegroundColor Gray
    Write-Host "Nombre: $($response2.data.nombre)" -ForegroundColor Gray
    Write-Host "Banco: $($response2.data.banco)" -ForegroundColor Gray
    Write-Host "Número: $($response2.data.numero_cuenta)" -ForegroundColor Gray
    Write-Host "Saldo: $($response2.data.saldo) $($response2.data.moneda)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 3: Crear cuenta con sobregiro permitido
Write-Host "Test 3: Crear cuenta con sobregiro permitido (Interbank)" -ForegroundColor Yellow
$body3 = @{
    nombre = "Interbank - Línea de Crédito"
    banco = "Interbank"
    numero_cuenta = "20012345678901"
    tipo_cuenta = "CORRIENTE"
    moneda = "PEN"
    saldo = 0.00
    permite_sobregiro = $true
    activa = $true
} | ConvertTo-Json

try {
    $response3 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $body3
    Write-Host "✅ Cuenta creada exitosamente" -ForegroundColor Green
    Write-Host "ID: $($response3.data.id)" -ForegroundColor Gray
    Write-Host "Nombre: $($response3.data.nombre)" -ForegroundColor Gray
    Write-Host "Permite sobregiro: $($response3.data.permite_sobregiro)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 4: Intentar crear cuenta duplicada (debe fallar)
Write-Host "Test 4: Intentar crear cuenta duplicada (debe fallar)" -ForegroundColor Yellow
$body4 = @{
    nombre = "BCP - Cuenta Duplicada"
    banco = "Banco de Crédito del Perú"
    numero_cuenta = "19100123456789"  # Mismo número que Test 1
    tipo_cuenta = "CORRIENTE"
    moneda = "PEN"
    saldo = 1000.00
} | ConvertTo-Json

try {
    $response4 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $body4
    Write-Host "❌ ERROR: Debería haber fallado por cuenta duplicada" -ForegroundColor Red
    Write-Host ""
} catch {
    Write-Host "✅ Validación correcta: $($_.Exception.Message)" -ForegroundColor Green
    Write-Host ""
}

# Test 5: Intentar crear cuenta con saldo negativo sin sobregiro (debe fallar)
Write-Host "Test 5: Intentar crear cuenta con saldo negativo sin sobregiro (debe fallar)" -ForegroundColor Yellow
$body5 = @{
    nombre = "Scotiabank - Cuenta Inválida"
    banco = "Scotiabank"
    numero_cuenta = "30012345678901"
    tipo_cuenta = "CORRIENTE"
    moneda = "PEN"
    saldo = -1000.00
    permite_sobregiro = $false
} | ConvertTo-Json

try {
    $response5 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $body5
    Write-Host "❌ ERROR: Debería haber fallado por saldo negativo sin sobregiro" -ForegroundColor Red
    Write-Host ""
} catch {
    Write-Host "✅ Validación correcta: $($_.Exception.Message)" -ForegroundColor Green
    Write-Host ""
}

Write-Host "=== FIN DE TESTS ===" -ForegroundColor Cyan
