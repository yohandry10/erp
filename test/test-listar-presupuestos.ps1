# Test: Listar presupuestos con filtros
# Endpoint: GET /api/contabilidad/presupuestos

$baseUrl = "http://localhost:3000/api"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjQwMzY3Zi1hNzY3LTRhNzAtYjU3Yy1lNzE5YzI3YzI5YjgiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiaWF0IjoxNzMwMDY0MDAwLCJleHAiOjE3NjE2MDAwMDB9.test-signature"
$tenantId = "d290f1ee-6c54-4b01-90e6-d701748f0851"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: Listar Presupuestos" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Listar todos los presupuestos
Write-Host "1️⃣ Listando TODOS los presupuestos..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" -Method Get -Headers $headers
    Write-Host "✅ Presupuestos obtenidos:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 5)
    Write-Host "`nTotal: $($response.data.Count) presupuesto(s)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.Response
}

# Test 2: Filtrar por estado ACTIVO
Write-Host "`n2️⃣ Filtrando por estado ACTIVO..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos?estado=ACTIVO" -Method Get -Headers $headers
    Write-Host "✅ Presupuestos ACTIVOS:" -ForegroundColor Green
    Write-Host "Total: $($response.data.Count) presupuesto(s)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Filtrar por centro de costo (si existe)
Write-Host "`n3️⃣ Filtrando por centro de costo..." -ForegroundColor Yellow
$centroCostoId = "123e4567-e89b-12d3-a456-426614174000" # Reemplazar con ID real
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos?centro_costo_id=$centroCostoId" -Method Get -Headers $headers
    Write-Host "✅ Presupuestos del centro de costo:" -ForegroundColor Green
    Write-Host "Total: $($response.data.Count) presupuesto(s)" -ForegroundColor Cyan
} catch {
    Write-Host "⚠️ No se encontraron presupuestos para ese centro de costo" -ForegroundColor Yellow
}

# Test 4: Filtrar por período contable (si existe)
Write-Host "`n4️⃣ Filtrando por período contable..." -ForegroundColor Yellow
$periodoId = "123e4567-e89b-12d3-a456-426614174002" # Reemplazar con ID real
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos?periodo_contable_id=$periodoId" -Method Get -Headers $headers
    Write-Host "✅ Presupuestos del período:" -ForegroundColor Green
    Write-Host "Total: $($response.data.Count) presupuesto(s)" -ForegroundColor Cyan
} catch {
    Write-Host "⚠️ No se encontraron presupuestos para ese período" -ForegroundColor Yellow
}

# Test 5: Filtros combinados
Write-Host "`n5️⃣ Filtrando con múltiples criterios..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos?estado=ACTIVO&centro_costo_id=$centroCostoId" -Method Get -Headers $headers
    Write-Host "✅ Presupuestos con filtros combinados:" -ForegroundColor Green
    Write-Host "Total: $($response.data.Count) presupuesto(s)" -ForegroundColor Cyan
} catch {
    Write-Host "⚠️ No se encontraron presupuestos con esos criterios" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ TEST COMPLETADO" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan
