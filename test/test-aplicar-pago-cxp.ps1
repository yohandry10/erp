# Test script for POST /api/finanzas/cxp/:id/aplicar-pago endpoint
# This script tests the payment application functionality

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5YzU3YzJiYy1hNzE0LTRhNzAtYjU5Zi1lMzI5YzY5YzI3YjgiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiaWF0IjoxNzMwMDcwNjI3LCJleHAiOjE3MzAxNTcwMjd9.Uw-Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0Uw0"
$tenantId = "550e8400-e29b-41d4-a716-446655440001"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Aplicar Pago a Cuenta por Pagar" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get list of CxP to find one with pending balance
Write-Host "Step 1: Obteniendo lista de CxP pendientes..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp?estado=PENDIENTE" -Method Get -Headers $headers
    Write-Host "✓ Lista obtenida exitosamente" -ForegroundColor Green
    
    if ($response.data -and $response.data.Count -gt 0) {
        $cxp = $response.data[0]
        Write-Host "  CxP ID: $($cxp.id)" -ForegroundColor Gray
        Write-Host "  Número: $($cxp.numero_documento)" -ForegroundColor Gray
        Write-Host "  Total: $($cxp.total)" -ForegroundColor Gray
        Write-Host "  Saldo: $($cxp.saldo)" -ForegroundColor Gray
        Write-Host "  Estado: $($cxp.estado)" -ForegroundColor Gray
        Write-Host ""
        
        # Step 2: Apply partial payment
        Write-Host "Step 2: Aplicando pago parcial..." -ForegroundColor Yellow
        $montoPago = [math]::Round($cxp.saldo / 2, 2)
        
        $pagoData = @{
            monto = $montoPago
            fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
            metodo_pago = "TRANSFERENCIA"
            referencia = "TEST-PAGO-$(Get-Date -Format 'yyyyMMddHHmmss')"
            observaciones = "Pago parcial de prueba"
        } | ConvertTo-Json
        
        Write-Host "  Monto a pagar: $montoPago" -ForegroundColor Gray
        
        $pagoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)/aplicar-pago" -Method Post -Headers $headers -Body $pagoData
        
        if ($pagoResponse.success) {
            Write-Host "✓ Pago aplicado exitosamente" -ForegroundColor Green
            Write-Host "  Saldo anterior: $($pagoResponse.data.pago.saldo_anterior)" -ForegroundColor Gray
            Write-Host "  Saldo nuevo: $($pagoResponse.data.pago.saldo_nuevo)" -ForegroundColor Gray
            Write-Host "  Estado anterior: $($pagoResponse.data.pago.estado_anterior)" -ForegroundColor Gray
            Write-Host "  Estado nuevo: $($pagoResponse.data.pago.estado_nuevo)" -ForegroundColor Gray
            Write-Host ""
            
            # Step 3: Verify the CxP was updated
            Write-Host "Step 3: Verificando actualización de CxP..." -ForegroundColor Yellow
            $verifyResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$($cxp.id)" -Method Get -Headers $headers
            
            if ($verifyResponse.success) {
                Write-Host "✓ CxP verificada exitosamente" -ForegroundColor Green
                Write-Host "  Saldo actual: $($verifyResponse.data.saldo)" -ForegroundColor Gray
                Write-Host "  Estado actual: $($verifyResponse.data.estado)" -ForegroundColor Gray
                Write-Host ""
                
                # Validate the payment was applied correctly
                $expectedSaldo = [math]::Round($cxp.saldo - $montoPago, 2)
                if ([math]::Abs($verifyResponse.data.saldo - $expectedSaldo) -lt 0.01) {
                    Write-Host "✓ Saldo calculado correctamente" -ForegroundColor Green
                } else {
                    Write-Host "✗ ERROR: Saldo incorrecto. Esperado: $expectedSaldo, Actual: $($verifyResponse.data.saldo)" -ForegroundColor Red
                }
                
                # Validate state change
                if ($verifyResponse.data.saldo -gt 0 -and $verifyResponse.data.saldo -lt $cxp.total) {
                    if ($verifyResponse.data.estado -eq "PARCIAL") {
                        Write-Host "✓ Estado actualizado correctamente a PARCIAL" -ForegroundColor Green
                    } else {
                        Write-Host "✗ ERROR: Estado debería ser PARCIAL pero es $($verifyResponse.data.estado)" -ForegroundColor Red
                    }
                } elseif ($verifyResponse.data.saldo -eq 0) {
                    if ($verifyResponse.data.estado -eq "PAGADA") {
                        Write-Host "✓ Estado actualizado correctamente a PAGADA" -ForegroundColor Green
                    } else {
                        Write-Host "✗ ERROR: Estado debería ser PAGADA pero es $($verifyResponse.data.estado)" -ForegroundColor Red
                    }
                }
            }
        }
    } else {
        Write-Host "⚠ No se encontraron CxP pendientes para probar" -ForegroundColor Yellow
        Write-Host "  Crea una CxP primero usando: POST /api/finanzas/cxp" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error en la prueba: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "  Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST COMPLETADO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
