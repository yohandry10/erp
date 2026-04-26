# Test script para POST /api/finanzas/tesoreria/pagos
# Registra un pago a proveedor

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5YzQzMzI2Yy1lMzI3LTQ3YzAtYjU5Yy1lNzI5YjI5ZjI5YjgiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyYWRtaW4iLCJ0ZW5hbnRfaWQiOiI5YzQzMzI2Yy1lMzI3LTQ3YzAtYjU5Yy1lNzI5YjI5ZjI5YjgiLCJpYXQiOjE3MzAwMDAwMDAsImV4cCI6OTk5OTk5OTk5OX0.placeholder"
$tenantId = "9c43326c-e327-47c0-b59c-e729b29f29b8"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Registrar Pago a Proveedor" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Primero, obtener una CxP pendiente para aplicar el pago
Write-Host "1. Obteniendo CxP pendiente..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

try {
    $cxpResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE" -Method Get -Headers $headers
    
    if ($cxpResponse.data -and $cxpResponse.data.Count -gt 0) {
        $cxp = $cxpResponse.data[0]
        Write-Host "✓ CxP encontrada: $($cxp.numero_documento)" -ForegroundColor Green
        Write-Host "  - ID: $($cxp.id)" -ForegroundColor Gray
        Write-Host "  - Proveedor: $($cxp.proveedor.razon_social)" -ForegroundColor Gray
        Write-Host "  - Total: $($cxp.total) $($cxp.moneda)" -ForegroundColor Gray
        Write-Host "  - Saldo: $($cxp.saldo) $($cxp.moneda)" -ForegroundColor Gray
        Write-Host ""
        
        # Registrar pago (50% del saldo)
        $montoPago = [math]::Round($cxp.saldo * 0.5, 2)
        
        Write-Host "2. Registrando pago de $montoPago $($cxp.moneda)..." -ForegroundColor Yellow
        
        $pagoData = @{
            cxp_id = $cxp.id
            monto = $montoPago
            fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
            metodo_pago = "TRANSFERENCIA"
            referencia = "OP-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
            observaciones = "Pago de prueba desde script PowerShell"
        }
        
        $pagoJson = $pagoData | ConvertTo-Json
        Write-Host "Request Body:" -ForegroundColor Gray
        Write-Host $pagoJson -ForegroundColor Gray
        Write-Host ""
        
        $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/pagos" -Method Post -Headers $headers -Body $pagoJson
        
        Write-Host "✓ Pago registrado exitosamente" -ForegroundColor Green
        Write-Host ""
        Write-Host "Respuesta:" -ForegroundColor Cyan
        Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor White
        Write-Host ""
        
        # Verificar CxP actualizada
        Write-Host "3. Verificando CxP actualizada..." -ForegroundColor Yellow
        $cxpActualizada = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)" -Method Get -Headers $headers
        
        Write-Host "✓ CxP actualizada:" -ForegroundColor Green
        Write-Host "  - Saldo anterior: $($cxp.saldo)" -ForegroundColor Gray
        Write-Host "  - Saldo nuevo: $($cxpActualizada.data.saldo)" -ForegroundColor Gray
        Write-Host "  - Estado anterior: $($cxp.estado)" -ForegroundColor Gray
        Write-Host "  - Estado nuevo: $($cxpActualizada.data.estado)" -ForegroundColor Gray
        Write-Host ""
        
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "✓ TEST COMPLETADO EXITOSAMENTE" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        
    } else {
        Write-Host "✗ No se encontraron CxP pendientes" -ForegroundColor Red
        Write-Host "  Crea una CxP primero con: .\test-crear-cxp.ps1" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "✗ Error en la prueba:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
}

Write-Host ""
