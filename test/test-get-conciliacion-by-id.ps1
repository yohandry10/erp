# Test GET /api/finanzas/conciliacion/:id
# Obtiene una conciliación bancaria específica por ID

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZTBiNDFhYy1hNzY3LTRhNzAtYjI5Zi1lMzY5ZGE5YjI5YTgiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzMwMDY2NTI4LCJleHAiOjE3MzAxNTI5Mjh9.Aq-CtII_rGPKJqxqJqxqJqxqJqxqJqxqJqxqJqxqJqw"
$tenantId = "vierdes"

Write-Host "=== TEST: GET Conciliación por ID ===" -ForegroundColor Cyan
Write-Host ""

# Primero, listar conciliaciones para obtener un ID válido
Write-Host "1. Listando conciliaciones existentes..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

try {
    $listResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion" -Method Get -Headers $headers
    
    if ($listResponse.data -and $listResponse.data.Count -gt 0) {
        $conciliacionId = $listResponse.data[0].id
        Write-Host "✓ Conciliación encontrada: $conciliacionId" -ForegroundColor Green
        Write-Host ""
        
        # Ahora obtener la conciliación específica
        Write-Host "2. Obteniendo conciliación por ID..." -ForegroundColor Yellow
        $getResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId" -Method Get -Headers $headers
        
        Write-Host "✓ Conciliación obtenida exitosamente" -ForegroundColor Green
        Write-Host ""
        Write-Host "Detalles de la conciliación:" -ForegroundColor Cyan
        Write-Host "ID: $($getResponse.data.id)"
        Write-Host "Período: $($getResponse.data.periodo)"
        Write-Host "Estado: $($getResponse.data.estado)"
        Write-Host "Fecha desde: $($getResponse.data.fecha_desde)"
        Write-Host "Fecha hasta: $($getResponse.data.fecha_hasta)"
        Write-Host "Saldo libro: $($getResponse.data.saldo_libro)"
        Write-Host "Saldo banco: $($getResponse.data.saldo_banco)"
        Write-Host "Diferencia: $($getResponse.data.diferencia)"
        Write-Host ""
        Write-Host "Cuenta bancaria:" -ForegroundColor Cyan
        Write-Host "Banco: $($getResponse.data.cuentas_bancarias.banco)"
        Write-Host "Número: $($getResponse.data.cuentas_bancarias.numero_cuenta)"
        Write-Host "Moneda: $($getResponse.data.cuentas_bancarias.moneda)"
        Write-Host ""
        
        # Test con ID inexistente
        Write-Host "3. Probando con ID inexistente..." -ForegroundColor Yellow
        $fakeId = "00000000-0000-0000-0000-000000000000"
        try {
            $errorResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$fakeId" -Method Get -Headers $headers
            Write-Host "✗ Debería haber fallado con ID inexistente" -ForegroundColor Red
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            if ($statusCode -eq 404) {
                Write-Host "✓ Correctamente retorna 404 para ID inexistente" -ForegroundColor Green
            } else {
                Write-Host "✗ Error inesperado: $statusCode" -ForegroundColor Red
            }
        }
        
    } else {
        Write-Host "⚠ No hay conciliaciones para probar. Crea una primero." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Puedes crear una con:" -ForegroundColor Cyan
        Write-Host ".\test-crear-conciliacion.ps1"
    }
    
} catch {
    Write-Host "✗ Error en la prueba:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}

Write-Host ""
Write-Host "=== FIN DEL TEST ===" -ForegroundColor Cyan
