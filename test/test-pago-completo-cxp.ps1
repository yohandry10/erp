# Test script to verify that when saldo = 0, estado changes to PAGADA
# This test creates a CxP and pays it in full to verify the status change

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5YzU3YzJiYy1hNzE0LTRhNzAtYjU5Zi1lMzI5YzY5YzI3YjgiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiaWF0IjoxNzMwMDcwNjI3LCJleHAiOjE3MzAxNTcwMjd9.Uw-Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0"
$tenantId = "550e8400-e29b-41d4-a716-446655440001"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Pago Completo - Estado PAGADA" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

try {
    # Step 1: Get a pending CxP
    Write-Host "Step 1: Obteniendo CxP pendiente..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE" -Method Get -Headers $headers
    
    if ($response.data -and $response.data.Count -gt 0) {
        $cxp = $response.data[0]
        Write-Host "✓ CxP encontrada" -ForegroundColor Green
        Write-Host "  ID: $($cxp.id)" -ForegroundColor Gray
        Write-Host "  Número: $($cxp.numero_documento)" -ForegroundColor Gray
        Write-Host "  Total: $($cxp.total)" -ForegroundColor Gray
        Write-Host "  Saldo: $($cxp.saldo)" -ForegroundColor Gray
        Write-Host "  Estado: $($cxp.estado)" -ForegroundColor Gray
        Write-Host ""
        
        # Step 2: Pay the full balance
        Write-Host "Step 2: Pagando el saldo completo..." -ForegroundColor Yellow
        $pagoData = @{
            monto = $cxp.saldo
            fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
            metodo_pago = "TRANSFERENCIA"
            referencia = "TEST-PAGO-COMPLETO-$(Get-Date -Format 'yyyyMMddHHmmss')"
            observaciones = "Pago completo para verificar estado PAGADA"
        } | ConvertTo-Json
        
        Write-Host "  Monto a pagar: $($cxp.saldo) (saldo completo)" -ForegroundColor Gray
        
        $pagoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)/aplicar-pago" -Method Post -Headers $headers -Body $pagoData
        
        if ($pagoResponse.success) {
            Write-Host "✓ Pago aplicado exitosamente" -ForegroundColor Green
            Write-Host "  Saldo anterior: $($pagoResponse.data.pago.saldo_anterior)" -ForegroundColor Gray
            Write-Host "  Saldo nuevo: $($pagoResponse.data.pago.saldo_nuevo)" -ForegroundColor Gray
            Write-Host "  Estado anterior: $($pagoResponse.data.pago.estado_anterior)" -ForegroundColor Gray
            Write-Host "  Estado nuevo: $($pagoResponse.data.pago.estado_nuevo)" -ForegroundColor Gray
            Write-Host ""
            
            # Step 3: Verify the status changed to PAGADA
            Write-Host "Step 3: Verificando estado PAGADA..." -ForegroundColor Yellow
            
            # Verify saldo is 0
            if ($pagoResponse.data.pago.saldo_nuevo -eq 0) {
                Write-Host "✓ Saldo es 0" -ForegroundColor Green
            } else {
                Write-Host "✗ ERROR: Saldo debería ser 0 pero es $($pagoResponse.data.pago.saldo_nuevo)" -ForegroundColor Red
                exit 1
            }
            
            # Verify estado is PAGADA
            if ($pagoResponse.data.pago.estado_nuevo -eq "PAGADA") {
                Write-Host "✓ Estado es PAGADA" -ForegroundColor Green
            } else {
                Write-Host "✗ ERROR: Estado debería ser PAGADA pero es $($pagoResponse.data.pago.estado_nuevo)" -ForegroundColor Red
                exit 1
            }
            
            # Step 4: Verify by fetching the CxP again
            Write-Host ""
            Write-Host "Step 4: Verificando CxP actualizada..." -ForegroundColor Yellow
            $verifyResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)" -Method Get -Headers $headers
            
            if ($verifyResponse.success) {
                Write-Host "✓ CxP obtenida" -ForegroundColor Green
                Write-Host "  Saldo: $($verifyResponse.data.saldo)" -ForegroundColor Gray
                Write-Host "  Estado: $($verifyResponse.data.estado)" -ForegroundColor Gray
                Write-Host ""
                
                # Final validation
                if ($verifyResponse.data.saldo -eq 0 -and $verifyResponse.data.estado -eq "PAGADA") {
                    Write-Host "========================================" -ForegroundColor Green
                    Write-Host "✓ TEST EXITOSO" -ForegroundColor Green
                    Write-Host "  Cuando saldo = 0, estado = PAGADA" -ForegroundColor Green
                    Write-Host "========================================" -ForegroundColor Green
                } else {
                    Write-Host "========================================" -ForegroundColor Red
                    Write-Host "✗ TEST FALLIDO" -ForegroundColor Red
                    Write-Host "  Saldo: $($verifyResponse.data.saldo) (esperado: 0)" -ForegroundColor Red
                    Write-Host "  Estado: $($verifyResponse.data.estado) (esperado: PAGADA)" -ForegroundColor Red
                    Write-Host "========================================" -ForegroundColor Red
                    exit 1
                }
            }
        }
    } else {
        Write-Host "⚠ No se encontraron CxP pendientes" -ForegroundColor Yellow
        Write-Host "  Crea una CxP primero usando: POST /api/finanzas/cxp" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error en la prueba: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "  Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}
