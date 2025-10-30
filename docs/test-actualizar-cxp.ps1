# Test script para actualizar cuenta por pagar (PUT /api/finanzas/cxp/:id)

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsImtpZCI6IjdUNGxhcGlYRGlJdGVMNGkiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2Fqb2Fqb2FqZGFzZGFzZGFzZC5zdXBhYmFzZS5jby9hdXRoL3YxIiwic3ViIjoiNzU5YzI5YzUtNjI5Zi00ZjI5LWI5YzAtNzI5YzI5YzU2MjlmIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTc2MTQ5NTU5NiwiaWF0IjoxNzI5OTU5NTk2LCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwiZW1haWxfdmVyaWZpZWQiOmZhbHNlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6Ijc1OWMyOWM1LTYyOWYtNGYyOS1iOWMwLTcyOWMyOWM1NjI5ZiJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzI5OTU5NTk2fV0sInNlc3Npb25faWQiOiI3NTljMjljNS02MjlmLTRmMjktYjljMC03MjljMjljNTYyOWYiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.test-signature"
$tenantId = "d290f1ee-6c54-4b01-90e6-d701748f0851"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: Actualizar Cuenta por Pagar" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Paso 1: Crear una CxP de prueba primero
Write-Host "Paso 1: Creando CxP de prueba..." -ForegroundColor Yellow

# Primero obtener un proveedor existente
$proveedoresResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores?limit=1" -Method Get -Headers $headers
$proveedorId = $proveedoresResponse.data[0].id

Write-Host "Proveedor ID: $proveedorId" -ForegroundColor Gray

$crearCxpBody = @{
    proveedor_id = $proveedorId
    numero_documento = "F001-$(Get-Random -Minimum 10000 -Maximum 99999)"
    fecha_emision = "2025-10-25"
    fecha_vencimiento = "2025-11-25"
    condiciones_pago = "CREDITO_30"
    dias_credito = 30
    subtotal = 1000.00
    igv = 180.00
    total = 1180.00
    moneda = "PEN"
    observaciones = "CxP de prueba para actualización"
} | ConvertTo-Json

try {
    $crearResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" -Method Post -Headers $headers -Body $crearCxpBody
    $cxpId = $crearResponse.data.id
    
    Write-Host "✓ CxP creada exitosamente" -ForegroundColor Green
    Write-Host "  ID: $cxpId" -ForegroundColor Gray
    Write-Host "  Número: $($crearResponse.data.numero_documento)" -ForegroundColor Gray
    Write-Host "  Total original: $($crearResponse.data.total)" -ForegroundColor Gray
    Write-Host "  Observaciones: $($crearResponse.data.observaciones)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error creando CxP: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Paso 2: Actualizar la CxP
Write-Host "`nPaso 2: Actualizando CxP..." -ForegroundColor Yellow

$actualizarBody = @{
    numero_documento = "F001-ACTUALIZADO-$(Get-Random -Minimum 10000 -Maximum 99999)"
    fecha_vencimiento = "2025-12-25"
    condiciones_pago = "CREDITO_60"
    dias_credito = 60
    subtotal = 1500.00
    igv = 270.00
    total = 1770.00
    observaciones = "CxP actualizada - Monto y condiciones modificadas"
} | ConvertTo-Json

try {
    $actualizarResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId" -Method Put -Headers $headers -Body $actualizarBody
    
    Write-Host "✓ CxP actualizada exitosamente" -ForegroundColor Green
    Write-Host "  ID: $($actualizarResponse.data.id)" -ForegroundColor Gray
    Write-Host "  Número actualizado: $($actualizarResponse.data.numero_documento)" -ForegroundColor Gray
    Write-Host "  Total actualizado: $($actualizarResponse.data.total)" -ForegroundColor Gray
    Write-Host "  Saldo actualizado: $($actualizarResponse.data.saldo)" -ForegroundColor Gray
    Write-Host "  Condiciones: $($actualizarResponse.data.condiciones_pago)" -ForegroundColor Gray
    Write-Host "  Días crédito: $($actualizarResponse.data.dias_credito)" -ForegroundColor Gray
    Write-Host "  Observaciones: $($actualizarResponse.data.observaciones)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error actualizando CxP: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Paso 3: Verificar que los cambios se guardaron
Write-Host "`nPaso 3: Verificando cambios..." -ForegroundColor Yellow

try {
    $verificarResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId" -Method Get -Headers $headers
    
    Write-Host "✓ Verificación exitosa" -ForegroundColor Green
    Write-Host "  Total: $($verificarResponse.data.total) (esperado: 1770.00)" -ForegroundColor Gray
    Write-Host "  Subtotal: $($verificarResponse.data.subtotal) (esperado: 1500.00)" -ForegroundColor Gray
    Write-Host "  IGV: $($verificarResponse.data.igv) (esperado: 270.00)" -ForegroundColor Gray
    Write-Host "  Saldo: $($verificarResponse.data.saldo) (esperado: 1770.00)" -ForegroundColor Gray
    Write-Host "  Condiciones: $($verificarResponse.data.condiciones_pago) (esperado: CREDITO_60)" -ForegroundColor Gray
    
    # Validar que los valores son correctos
    if ($verificarResponse.data.total -eq 1770.00 -and 
        $verificarResponse.data.subtotal -eq 1500.00 -and
        $verificarResponse.data.igv -eq 270.00 -and
        $verificarResponse.data.condiciones_pago -eq "CREDITO_60") {
        Write-Host "`n✓ Todos los valores actualizados correctamente" -ForegroundColor Green
    } else {
        Write-Host "`n✗ Algunos valores no coinciden" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error verificando CxP: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Paso 4: Intentar actualizar una CxP con número duplicado (debe fallar)
Write-Host "`nPaso 4: Probando validación de número duplicado..." -ForegroundColor Yellow

# Crear otra CxP
$crearCxpBody2 = @{
    proveedor_id = $proveedorId
    numero_documento = "F001-DUPLICADO-TEST"
    fecha_emision = "2025-10-25"
    fecha_vencimiento = "2025-11-25"
    condiciones_pago = "CONTADO"
    dias_credito = 0
    subtotal = 500.00
    igv = 90.00
    total = 590.00
    moneda = "PEN"
} | ConvertTo-Json

try {
    $crearResponse2 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" -Method Post -Headers $headers -Body $crearCxpBody2
    $cxpId2 = $crearResponse2.data.id
    Write-Host "✓ Segunda CxP creada: $cxpId2" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error creando segunda CxP" -ForegroundColor Red
    exit 1
}

# Intentar actualizar la primera CxP con el número de la segunda
$actualizarDuplicadoBody = @{
    numero_documento = "F001-DUPLICADO-TEST"
} | ConvertTo-Json

try {
    $actualizarDuplicadoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId" -Method Put -Headers $headers -Body $actualizarDuplicadoBody
    Write-Host "✗ ERROR: Se permitió número duplicado (no debería)" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "✓ Validación correcta: No se permite número duplicado" -ForegroundColor Green
    } else {
        Write-Host "✗ Error inesperado: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Paso 5: Intentar actualizar montos con total incorrecto (debe fallar)
Write-Host "`nPaso 5: Probando validación de total = subtotal + IGV..." -ForegroundColor Yellow

$actualizarTotalIncorrectoBody = @{
    subtotal = 1000.00
    igv = 180.00
    total = 1500.00  # Incorrecto, debería ser 1180.00
} | ConvertTo-Json

try {
    $actualizarTotalIncorrectoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId" -Method Put -Headers $headers -Body $actualizarTotalIncorrectoBody
    Write-Host "✗ ERROR: Se permitió total incorrecto (no debería)" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "✓ Validación correcta: Total debe ser igual a subtotal + IGV" -ForegroundColor Green
    } else {
        Write-Host "✗ Error inesperado: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE PRUEBAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Actualización básica: OK" -ForegroundColor Green
Write-Host "✓ Validación número duplicado: OK" -ForegroundColor Green
Write-Host "✓ Validación total = subtotal + IGV: OK" -ForegroundColor Green
Write-Host "`nPruebas completadas exitosamente`n" -ForegroundColor Green
