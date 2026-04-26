# Test script para POST /api/finanzas/cxp/:id/anular
# Este script prueba la anulación de una cuenta por pagar

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkRhRzJPdGhGNGhOdGlYNGEiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzMwMDY5NTU5LCJpYXQiOjE3MzAwNjU5NTksImlzcyI6Imh0dHBzOi8vdGVzdC5zdXBhYmFzZS5jbyIsInN1YiI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsImVtYWlsIjoiYWRtaW5AdGVzdC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTczMDA2NTk1OX1dLCJzZXNzaW9uX2lkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAxIn0.test"
$tenantId = "00000000-0000-0000-0000-000000000001"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Anular Cuenta por Pagar" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Crear una CxP de prueba
Write-Host "Paso 1: Creando CxP de prueba..." -ForegroundColor Yellow

# Primero obtener un proveedor existente
$proveedoresResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores?limit=1" -Method Get -Headers $headers
$proveedorId = $proveedoresResponse.data[0].id

Write-Host "Proveedor ID: $proveedorId" -ForegroundColor Gray

$crearCxpBody = @{
    proveedor_id = $proveedorId
    numero_documento = "F001-$(Get-Random -Minimum 10000 -Maximum 99999)"
    fecha_emision = (Get-Date).ToString("yyyy-MM-dd")
    fecha_vencimiento = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO"
    dias_credito = 30
    subtotal = 1000.00
    igv = 180.00
    total = 1180.00
    moneda = "PEN"
    observaciones = "CxP de prueba para anulación"
} | ConvertTo-Json

try {
    $crearResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" -Method Post -Headers $headers -Body $crearCxpBody
    $cxpId = $crearResponse.data.id
    Write-Host "✓ CxP creada exitosamente" -ForegroundColor Green
    Write-Host "  ID: $cxpId" -ForegroundColor Gray
    Write-Host "  Número: $($crearResponse.data.numero_documento)" -ForegroundColor Gray
    Write-Host "  Estado: $($crearResponse.data.estado)" -ForegroundColor Gray
    Write-Host "  Total: $($crearResponse.data.total)" -ForegroundColor Gray
    Write-Host "  Saldo: $($crearResponse.data.saldo)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "✗ Error creando CxP: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Paso 2: Anular la CxP
Write-Host "Paso 2: Anulando CxP..." -ForegroundColor Yellow

$anularBody = @{
    motivo = "Prueba de anulación - CxP creada por error"
    observaciones = "Esta es una prueba del endpoint de anulación"
} | ConvertTo-Json

try {
    $anularResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId/anular" -Method Post -Headers $headers -Body $anularBody
    Write-Host "✓ CxP anulada exitosamente" -ForegroundColor Green
    Write-Host "  Estado: $($anularResponse.data.estado)" -ForegroundColor Gray
    Write-Host "  Anulado en: $($anularResponse.data.anulado_at)" -ForegroundColor Gray
    Write-Host "  Observaciones: $($anularResponse.data.observaciones)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "✗ Error anulando CxP: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Paso 3: Verificar que no se puede anular de nuevo
Write-Host "Paso 3: Intentando anular nuevamente (debe fallar)..." -ForegroundColor Yellow

try {
    $anularResponse2 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId/anular" -Method Post -Headers $headers -Body $anularBody
    Write-Host "✗ ERROR: Se pudo anular una CxP ya anulada (no debería permitirse)" -ForegroundColor Red
} catch {
    Write-Host "✓ Correcto: No se puede anular una CxP ya anulada" -ForegroundColor Green
    Write-Host "  Error esperado: $($_.ErrorDetails.Message)" -ForegroundColor Gray
    Write-Host ""
}

# Paso 4: Verificar que no se puede aplicar pago a una CxP anulada
Write-Host "Paso 4: Intentando aplicar pago a CxP anulada (debe fallar)..." -ForegroundColor Yellow

$pagoBody = @{
    monto = 100.00
    fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
    metodo_pago = "EFECTIVO"
    referencia = "TEST-001"
} | ConvertTo-Json

try {
    $pagoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId/aplicar-pago" -Method Post -Headers $headers -Body $pagoBody
    Write-Host "✗ ERROR: Se pudo aplicar pago a una CxP anulada (no debería permitirse)" -ForegroundColor Red
} catch {
    Write-Host "✓ Correcto: No se puede aplicar pago a una CxP anulada" -ForegroundColor Green
    Write-Host "  Error esperado: $($_.ErrorDetails.Message)" -ForegroundColor Gray
    Write-Host ""
}

# Paso 5: Crear CxP con pago y verificar que no se puede anular
Write-Host "Paso 5: Creando CxP con pago y verificando que no se puede anular..." -ForegroundColor Yellow

$crearCxpBody2 = @{
    proveedor_id = $proveedorId
    numero_documento = "F001-$(Get-Random -Minimum 10000 -Maximum 99999)"
    fecha_emision = (Get-Date).ToString("yyyy-MM-dd")
    fecha_vencimiento = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO"
    dias_credito = 30
    subtotal = 500.00
    igv = 90.00
    total = 590.00
    moneda = "PEN"
    observaciones = "CxP de prueba con pago"
} | ConvertTo-Json

try {
    $crearResponse2 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" -Method Post -Headers $headers -Body $crearCxpBody2
    $cxpId2 = $crearResponse2.data.id
    Write-Host "✓ CxP creada: $cxpId2" -ForegroundColor Green
    
    # Aplicar un pago parcial
    $pagoBody2 = @{
        monto = 100.00
        fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
        metodo_pago = "EFECTIVO"
        referencia = "PAGO-TEST-001"
    } | ConvertTo-Json
    
    $pagoResponse2 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId2/aplicar-pago" -Method Post -Headers $headers -Body $pagoBody2
    Write-Host "✓ Pago aplicado: $($pagoResponse2.data.pago.monto)" -ForegroundColor Green
    Write-Host "  Saldo anterior: $($pagoResponse2.data.pago.saldo_anterior)" -ForegroundColor Gray
    Write-Host "  Saldo nuevo: $($pagoResponse2.data.pago.saldo_nuevo)" -ForegroundColor Gray
    Write-Host ""
    
    # Intentar anular (debe fallar)
    try {
        $anularResponse3 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId2/anular" -Method Post -Headers $headers -Body $anularBody
        Write-Host "✗ ERROR: Se pudo anular una CxP con pagos aplicados (no debería permitirse)" -ForegroundColor Red
    } catch {
        Write-Host "✓ Correcto: No se puede anular una CxP con pagos aplicados" -ForegroundColor Green
        Write-Host "  Error esperado: $($_.ErrorDetails.Message)" -ForegroundColor Gray
        Write-Host ""
    }
} catch {
    Write-Host "✗ Error en prueba con pago: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PRUEBAS COMPLETADAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
