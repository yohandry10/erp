# Test script for Aging CxP Report
# Tests the GET /api/finanzas/cxp/aging endpoint

$baseUrl = "http://localhost:3001"
$loginUrl = "$baseUrl/api/auth/login"
$agingUrl = "$baseUrl/api/finanzas/cxp/aging"

Write-Host "=== TEST: Aging CxP Report ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login
Write-Host "Step 1: Login..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = "Admin123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri $loginUrl -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    Write-Host "✓ Login successful" -ForegroundColor Green
    Write-Host "Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    Write-Host "✗ Login failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure the API server is running on port 3001" -ForegroundColor Yellow
    Write-Host "You can start it with: cd apps/erp-api && npm run dev" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 2: Get Aging Report (All Providers)
Write-Host "Step 2: Get Aging Report (All Providers)..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    $agingResponse = Invoke-RestMethod -Uri $agingUrl -Method Get -Headers $headers
    
    if ($agingResponse.success) {
        Write-Host "✓ Aging report retrieved successfully" -ForegroundColor Green
        Write-Host ""
        
        # Display summary
        Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
        Write-Host "Fecha Reporte: $($agingResponse.data.fecha_reporte)" -ForegroundColor White
        Write-Host ""
        
        $resumen = $agingResponse.data.resumen
        Write-Host "Total Vencido:" -ForegroundColor White
        Write-Host "  Cantidad: $($resumen.total.cantidad) cuentas" -ForegroundColor Gray
        Write-Host "  Monto: S/ $($resumen.total.monto)" -ForegroundColor Gray
        Write-Host ""
        
        Write-Host "Por Rangos:" -ForegroundColor White
        Write-Host "  0-30 días:   $($resumen.rango_0_30.cantidad) cuentas - S/ $($resumen.rango_0_30.monto)" -ForegroundColor Yellow
        Write-Host "  31-60 días:  $($resumen.rango_31_60.cantidad) cuentas - S/ $($resumen.rango_31_60.monto)" -ForegroundColor Yellow
        Write-Host "  61-90 días:  $($resumen.rango_61_90.cantidad) cuentas - S/ $($resumen.rango_61_90.monto)" -ForegroundColor Yellow
        Write-Host "  +90 días:    $($resumen.rango_mas_90.cantidad) cuentas - S/ $($resumen.rango_mas_90.monto)" -ForegroundColor Red
        Write-Host ""
        
        # Display top 5 providers
        if ($agingResponse.data.por_proveedor.Count -gt 0) {
            Write-Host "=== TOP 5 PROVEEDORES CON MAYOR DEUDA ===" -ForegroundColor Cyan
            $topProveedores = $agingResponse.data.por_proveedor | Select-Object -First 5
            
            foreach ($proveedor in $topProveedores) {
                Write-Host ""
                Write-Host "$($proveedor.proveedor_razon_social) (RUC: $($proveedor.proveedor_ruc))" -ForegroundColor White
                Write-Host "  Total: S/ $($proveedor.total) ($($proveedor.cantidad_cxp) cuentas)" -ForegroundColor Gray
                Write-Host "  0-30:  S/ $($proveedor.rango_0_30)" -ForegroundColor Gray
                Write-Host "  31-60: S/ $($proveedor.rango_31_60)" -ForegroundColor Gray
                Write-Host "  61-90: S/ $($proveedor.rango_61_90)" -ForegroundColor Gray
                Write-Host "  +90:   S/ $($proveedor.rango_mas_90)" -ForegroundColor Gray
            }
        }
        
        Write-Host ""
        Write-Host "=== DETALLE (Primeras 10 cuentas) ===" -ForegroundColor Cyan
        $detalleTop = $agingResponse.data.detalle | Select-Object -First 10
        
        foreach ($cuenta in $detalleTop) {
            Write-Host ""
            Write-Host "Doc: $($cuenta.numero_documento) - $($cuenta.proveedor_razon_social)" -ForegroundColor White
            Write-Host "  Vencimiento: $($cuenta.fecha_vencimiento) (Días vencidos: $($cuenta.dias_vencidos))" -ForegroundColor Gray
            Write-Host "  Saldo: $($cuenta.moneda) $($cuenta.saldo) - Rango: $($cuenta.rango)" -ForegroundColor Gray
        }
        
    } else {
        Write-Host "✗ Failed to retrieve aging report" -ForegroundColor Red
        Write-Host "Response: $($agingResponse | ConvertTo-Json -Depth 5)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error getting aging report: $_" -ForegroundColor Red
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TEST COMPLETED ===" -ForegroundColor Cyan
