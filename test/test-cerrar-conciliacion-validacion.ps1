# Test: Validar cierre de conciliación con validación de ítems procesados
# Este script prueba que la validación funciona correctamente

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjBjMzU3Zi1hMzU5LTRhNzAtYjJiZS1hNzE5YzI3YzY3YjgiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiaWF0IjoxNzM0OTI3NTk5LCJleHAiOjE3MzUwMTM5OTl9.Aq-Aq7Aq-Aq7Aq-Aq7Aq-Aq7Aq-Aq7Aq-Aq7Aq-Aq7Aq"
$tenantId = "vierdes"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "=== TEST: Validación de Cierre de Conciliación ===" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Listar conciliaciones para obtener una ID
Write-Host "1. Listando conciliaciones..." -ForegroundColor Yellow
$response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion" -Method Get -Headers $headers
$conciliacionId = $response.data[0].id

if (-not $conciliacionId) {
    Write-Host "ERROR: No hay conciliaciones disponibles para probar" -ForegroundColor Red
    exit 1
}

Write-Host "   Usando conciliación ID: $conciliacionId" -ForegroundColor Green
Write-Host ""

# Paso 2: Obtener detalles de la conciliación
Write-Host "2. Obteniendo detalles de la conciliación..." -ForegroundColor Yellow
$conciliacion = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId" -Method Get -Headers $headers
Write-Host "   Estado: $($conciliacion.data.estado)" -ForegroundColor Green
Write-Host ""

# Paso 3: Obtener diferencias (para ver movimientos pendientes)
Write-Host "3. Obteniendo reporte de diferencias..." -ForegroundColor Yellow
$diferencias = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/diferencias" -Method Get -Headers $headers
$pendientesSistema = $diferencias.data.movimientos_sistema.pendientes
$pendientesExtracto = $diferencias.data.movimientos_extracto.pendientes

Write-Host "   Movimientos sistema pendientes: $pendientesSistema" -ForegroundColor $(if ($pendientesSistema -gt 0) { "Yellow" } else { "Green" })
Write-Host "   Movimientos extracto pendientes: $pendientesExtracto" -ForegroundColor $(if ($pendientesExtracto -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

# Paso 4: Intentar cerrar SIN forzar (debe fallar si hay pendientes)
Write-Host "4. Intentando cerrar conciliación SIN forzar..." -ForegroundColor Yellow
$body = @{
    forzar_cierre = $false
} | ConvertTo-Json

try {
    $resultado = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/cerrar" -Method Post -Headers $headers -Body $body
    
    if ($pendientesSistema -gt 0 -or $pendientesExtracto -gt 0) {
        Write-Host "   ERROR: Debería haber fallado con movimientos pendientes" -ForegroundColor Red
    } else {
        Write-Host "   SUCCESS: Conciliación cerrada (no había pendientes)" -ForegroundColor Green
    }
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($pendientesSistema -gt 0 -or $pendientesExtracto -gt 0) {
        Write-Host "   SUCCESS: Validación funcionó correctamente" -ForegroundColor Green
        Write-Host "   Mensaje: $($errorResponse.message)" -ForegroundColor Cyan
    } else {
        Write-Host "   ERROR: No debería haber fallado sin pendientes" -ForegroundColor Red
        Write-Host "   Mensaje: $($errorResponse.message)" -ForegroundColor Red
    }
}
Write-Host ""

# Paso 5: Intentar cerrar FORZANDO (debe funcionar siempre)
if ($conciliacion.data.estado -ne "CERRADA") {
    Write-Host "5. Intentando cerrar conciliación FORZANDO..." -ForegroundColor Yellow
    $bodyForzar = @{
        forzar_cierre = $true
    } | ConvertTo-Json

    try {
        $resultadoForzar = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/cerrar" -Method Post -Headers $headers -Body $bodyForzar
        Write-Host "   SUCCESS: Conciliación cerrada forzadamente" -ForegroundColor Green
        Write-Host "   Mensaje: $($resultadoForzar.data.mensaje)" -ForegroundColor Cyan
    } catch {
        $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "   ERROR: No se pudo cerrar forzadamente" -ForegroundColor Red
        Write-Host "   Mensaje: $($errorResponse.message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Cyan
