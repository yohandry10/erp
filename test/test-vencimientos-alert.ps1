# Test script for Vencimientos Alert functionality
# This script tests the upcoming due dates alert feature

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Vencimientos Alert" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$baseUrl = "http://localhost:3001"
$apiUrl = "http://localhost:3000"

# Get tenant and auth token from environment or prompt
$tenantId = $env:TEST_TENANT_ID
$token = $env:TEST_AUTH_TOKEN

if (-not $tenantId) {
    $tenantId = Read-Host "Enter Tenant ID"
}

if (-not $token) {
    $token = Read-Host "Enter Auth Token"
}

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Tenant ID: $tenantId"
Write-Host "  API URL: $apiUrl"
Write-Host ""

# Test 1: Get upcoming due dates (7 days)
Write-Host "Test 1: Get upcoming due dates (7 days)" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/api/finanzas/cxp/vencimientos?dias=7" `
        -Method GET `
        -Headers $headers

    Write-Host "✓ Request successful" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 10
    Write-Host ""

    if ($response.success -and $response.data.vencimientos) {
        $vencimientos = $response.data.vencimientos
        Write-Host "Summary:" -ForegroundColor Cyan
        Write-Host "  Total vencimientos: $($vencimientos.Count)" -ForegroundColor White
        
        $vencidos = $vencimientos | Where-Object { $_.dias_restantes -lt 0 }
        $proximos = $vencimientos | Where-Object { $_.dias_restantes -ge 0 }
        
        Write-Host "  Vencidos: $($vencidos.Count)" -ForegroundColor Red
        Write-Host "  Próximos: $($proximos.Count)" -ForegroundColor Yellow
        
        if ($response.data.resumen.por_moneda) {
            Write-Host ""
            Write-Host "  Por moneda:" -ForegroundColor Cyan
            $response.data.resumen.por_moneda.PSObject.Properties | ForEach-Object {
                Write-Host "    $($_.Name): $($_.Value.cantidad) cuentas - Monto: $($_.Value.monto)" -ForegroundColor White
            }
        }
        
        Write-Host ""
        Write-Host "Detalles de vencimientos:" -ForegroundColor Cyan
        $vencimientos | ForEach-Object {
            $color = if ($_.dias_restantes -lt 0) { "Red" } elseif ($_.dias_restantes -le 3) { "Yellow" } else { "White" }
            $status = if ($_.dias_restantes -lt 0) { 
                "⚠️ Vencido hace $([Math]::Abs($_.dias_restantes)) días" 
            } elseif ($_.dias_restantes -eq 0) {
                "🔴 Vence HOY"
            } else {
                "📅 Vence en $($_.dias_restantes) días"
            }
            Write-Host "  • $($_.numero_documento) - $($_.proveedor_razon_social)" -ForegroundColor $color
            Write-Host "    $status - Saldo: $($_.saldo) $($_.moneda)" -ForegroundColor $color
        }
    }
} catch {
    Write-Host "✗ Request failed" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host ""

# Test 2: Get upcoming due dates (30 days)
Write-Host "Test 2: Get upcoming due dates (30 days)" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/api/finanzas/cxp/vencimientos?dias=30" `
        -Method GET `
        -Headers $headers

    Write-Host "✓ Request successful" -ForegroundColor Green
    Write-Host ""
    
    if ($response.success -and $response.data.vencimientos) {
        $vencimientos = $response.data.vencimientos
        Write-Host "Summary (30 days):" -ForegroundColor Cyan
        Write-Host "  Total vencimientos: $($vencimientos.Count)" -ForegroundColor White
        
        $vencidos = $vencimientos | Where-Object { $_.dias_restantes -lt 0 }
        $proximos = $vencimientos | Where-Object { $_.dias_restantes -ge 0 }
        
        Write-Host "  Vencidos: $($vencidos.Count)" -ForegroundColor Red
        Write-Host "  Próximos: $($proximos.Count)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Request failed" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host ""

# Test 3: Filter by proveedor (if available)
Write-Host "Test 3: Filter by proveedor" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green

try {
    # First get a proveedor ID from existing CxP
    $cxpResponse = Invoke-RestMethod -Uri "$apiUrl/api/finanzas/cxp?limit=1" `
        -Method GET `
        -Headers $headers

    if ($cxpResponse.success -and $cxpResponse.data.Count -gt 0) {
        $proveedorId = $cxpResponse.data[0].proveedor_id
        
        Write-Host "Testing with proveedor_id: $proveedorId" -ForegroundColor Yellow
        
        $response = Invoke-RestMethod -Uri "$apiUrl/api/finanzas/cxp/vencimientos?dias=30&proveedor_id=$proveedorId" `
            -Method GET `
            -Headers $headers

        Write-Host "✓ Request successful" -ForegroundColor Green
        Write-Host ""
        
        if ($response.success -and $response.data.vencimientos) {
            $vencimientos = $response.data.vencimientos
            Write-Host "Summary (filtered by proveedor):" -ForegroundColor Cyan
            Write-Host "  Total vencimientos: $($vencimientos.Count)" -ForegroundColor White
        }
    } else {
        Write-Host "⚠ No CxP found to get proveedor_id" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Request failed" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TESTS COMPLETED" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open the web app at $baseUrl/dashboard/finanzas/cxp" -ForegroundColor White
Write-Host "2. Verify the alert banner appears at the top" -ForegroundColor White
Write-Host "3. Click 'Ver detalles' to expand the alert" -ForegroundColor White
Write-Host "4. Click on a vencimiento to navigate to its detail page" -ForegroundColor White
Write-Host "5. Test the dismiss button (X)" -ForegroundColor White
Write-Host "6. Apply filters and verify the alert updates" -ForegroundColor White
Write-Host ""
