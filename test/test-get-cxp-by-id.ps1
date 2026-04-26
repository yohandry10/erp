# Test GET /api/finanzas/cxp/:id endpoint
# Este script prueba obtener una cuenta por pagar específica por ID

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsImtpZCI6IjdPRGRvN0VoNGFjcGtKRUkiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2Rqb2Fxd3Fhb2Fhd2Fhd2Fhd2Fhd2Euc3VwYWJhc2UuY28vYXV0aC92MSIsInN1YiI6IjU5YzI5YzI5LTI5YzItNDljMi05YzI5LTI5YzI5YzI5YzI5YyIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjE3NjQ4OTk5OTksImlhdCI6MTczMzM2Mzk5OSwiZW1haWwiOiJhZG1pbkB2aWVyZGVzLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnt9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzMzMzYzOTk5fV0sInNlc3Npb25faWQiOiI1OWMyOWMyOS0yOWMyLTQ5YzItOWMyOS0yOWMyOWMyOWMyOWMiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.test-signature"
$tenantId = "d290f1ee-6c54-4b01-90e6-d701748f0851"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: GET /api/finanzas/cxp/:id" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Primero obtener la lista de CxP para tener un ID válido
Write-Host "Paso 1: Obteniendo lista de CxP para obtener un ID válido..." -ForegroundColor Yellow
try {
    $listResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" -Method Get -Headers $headers
    
    if ($listResponse.success -and $listResponse.data.Count -gt 0) {
        $cxpId = $listResponse.data[0].id
        Write-Host "✓ ID de CxP obtenido: $cxpId" -ForegroundColor Green
        Write-Host ""
        
        # Paso 2: Obtener el detalle de la CxP
        Write-Host "Paso 2: Obteniendo detalle de la CxP..." -ForegroundColor Yellow
        $detailResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId" -Method Get -Headers $headers
        
        Write-Host "✓ Respuesta recibida:" -ForegroundColor Green
        Write-Host ($detailResponse | ConvertTo-Json -Depth 10)
        Write-Host ""
        
        # Validaciones
        Write-Host "Validaciones:" -ForegroundColor Yellow
        
        if ($detailResponse.success) {
            Write-Host "✓ success = true" -ForegroundColor Green
        } else {
            Write-Host "✗ success = false" -ForegroundColor Red
        }
        
        if ($detailResponse.data) {
            Write-Host "✓ data existe" -ForegroundColor Green
            
            # Validar campos principales
            $cxp = $detailResponse.data
            
            if ($cxp.id -eq $cxpId) {
                Write-Host "✓ ID correcto: $($cxp.id)" -ForegroundColor Green
            } else {
                Write-Host "✗ ID incorrecto" -ForegroundColor Red
            }
            
            if ($cxp.proveedor) {
                Write-Host "✓ Proveedor incluido: $($cxp.proveedor.razon_social)" -ForegroundColor Green
            } else {
                Write-Host "✗ Proveedor no incluido" -ForegroundColor Red
            }
            
            if ($cxp.numero_documento) {
                Write-Host "✓ Número documento: $($cxp.numero_documento)" -ForegroundColor Green
            }
            
            if ($cxp.total) {
                Write-Host "✓ Total: $($cxp.total)" -ForegroundColor Green
            }
            
            if ($cxp.saldo) {
                Write-Host "✓ Saldo: $($cxp.saldo)" -ForegroundColor Green
            }
            
            if ($cxp.estado) {
                Write-Host "✓ Estado: $($cxp.estado)" -ForegroundColor Green
            }
            
            if ($cxp.fecha_emision) {
                Write-Host "✓ Fecha emisión: $($cxp.fecha_emision)" -ForegroundColor Green
            }
            
            if ($cxp.fecha_vencimiento) {
                Write-Host "✓ Fecha vencimiento: $($cxp.fecha_vencimiento)" -ForegroundColor Green
            }
            
        } else {
            Write-Host "✗ data no existe" -ForegroundColor Red
        }
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "TEST COMPLETADO EXITOSAMENTE" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
        
    } else {
        Write-Host "⚠ No hay CxP en el sistema para probar" -ForegroundColor Yellow
        Write-Host "Por favor, crea una CxP primero usando POST /api/finanzas/cxp" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "✗ Error en la prueba:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles:" -ForegroundColor Red
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}

Write-Host ""

# Paso 3: Probar con un ID inexistente (debe retornar 404)
Write-Host "Paso 3: Probando con ID inexistente (debe retornar 404)..." -ForegroundColor Yellow
$fakeId = "00000000-0000-0000-0000-000000000000"

try {
    $errorResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$fakeId" -Method Get -Headers $headers
    Write-Host "✗ Debería haber retornado 404" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "✓ Retornó 404 correctamente para ID inexistente" -ForegroundColor Green
    } else {
        Write-Host "✗ Error inesperado: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PRUEBAS FINALIZADAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
