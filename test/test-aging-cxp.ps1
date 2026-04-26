# Test script para el endpoint de aging de CxP
# GET /api/finanzas/cxp/aging

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjI0YzI3Yy1hNzE0LTQ3YzAtYjU5Yy1lMzY5ZjI0YzI3YWEiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiaWF0IjoxNzMwMDAwMDAwfQ.test-signature"
$tenantId = "vierdes-tenant-001"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Reporte Aging de Cuentas por Pagar" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Headers comunes
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "1. Obtener reporte de aging general" -ForegroundColor Yellow
Write-Host "GET $baseUrl/api/finanzas/cxp/aging" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/aging" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop
    
    Write-Host "✓ Reporte obtenido exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Fecha del reporte: $($response.data.fecha_reporte)" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "RESUMEN POR RANGOS:" -ForegroundColor Cyan
    Write-Host "-------------------" -ForegroundColor Cyan
    Write-Host "0-30 días:   $($response.data.resumen.rango_0_30.cantidad) CxP - S/ $($response.data.resumen.rango_0_30.monto)" -ForegroundColor White
    Write-Host "31-60 días:  $($response.data.resumen.rango_31_60.cantidad) CxP - S/ $($response.data.resumen.rango_31_60.monto)" -ForegroundColor White
    Write-Host "61-90 días:  $($response.data.resumen.rango_61_90.cantidad) CxP - S/ $($response.data.resumen.rango_61_90.monto)" -ForegroundColor White
    Write-Host ">90 días:    $($response.data.resumen.rango_mas_90.cantidad) CxP - S/ $($response.data.resumen.rango_mas_90.monto)" -ForegroundColor White
    Write-Host "-------------------" -ForegroundColor Cyan
    Write-Host "TOTAL:       $($response.data.resumen.total.cantidad) CxP - S/ $($response.data.resumen.total.monto)" -ForegroundColor Yellow
    Write-Host ""
    
    if ($response.data.por_proveedor.Count -gt 0) {
        Write-Host "TOP 5 PROVEEDORES CON MAYOR DEUDA:" -ForegroundColor Cyan
        Write-Host "-----------------------------------" -ForegroundColor Cyan
        $top5 = $response.data.por_proveedor | Select-Object -First 5
        foreach ($proveedor in $top5) {
            Write-Host "$($proveedor.proveedor_razon_social) ($($proveedor.proveedor_ruc))" -ForegroundColor White
            Write-Host "  Total: S/ $($proveedor.total) ($($proveedor.cantidad_cxp) CxP)" -ForegroundColor Gray
            Write-Host "  0-30d: S/ $($proveedor.rango_0_30) | 31-60d: S/ $($proveedor.rango_31_60) | 61-90d: S/ $($proveedor.rango_61_90) | >90d: S/ $($proveedor.rango_mas_90)" -ForegroundColor Gray
            Write-Host "  Por vencer: S/ $($proveedor.por_vencer)" -ForegroundColor Gray
            Write-Host ""
        }
    }
    
    if ($response.data.detalle.Count -gt 0) {
        Write-Host "DETALLE (Primeras 10 CxP más vencidas):" -ForegroundColor Cyan
        Write-Host "----------------------------------------" -ForegroundColor Cyan
        $top10 = $response.data.detalle | Select-Object -First 10
        foreach ($cxp in $top10) {
            $color = "White"
            if ($cxp.dias_vencidos -gt 90) { $color = "Red" }
            elseif ($cxp.dias_vencidos -gt 60) { $color = "Magenta" }
            elseif ($cxp.dias_vencidos -gt 30) { $color = "Yellow" }
            elseif ($cxp.dias_vencidos -ge 0) { $color = "White" }
            else { $color = "Green" }
            
            Write-Host "$($cxp.numero_documento) - $($cxp.proveedor_razon_social)" -ForegroundColor $color
            Write-Host "  Vencimiento: $($cxp.fecha_vencimiento) | Días vencidos: $($cxp.dias_vencidos) | Saldo: S/ $($cxp.saldo)" -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "Response completo:" -ForegroundColor Gray
    $response | ConvertTo-Json -Depth 10
    
} catch {
    Write-Host "✗ Error al obtener el reporte" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 2: Filtrar por proveedor específico
Write-Host "2. Obtener reporte de aging por proveedor específico" -ForegroundColor Yellow
Write-Host ""

# Primero obtener un proveedor_id de la lista general
try {
    $responseGeneral = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop
    
    if ($responseGeneral.data.Count -gt 0) {
        $proveedorId = $responseGeneral.data[0].proveedor_id
        $proveedorNombre = $responseGeneral.data[0].proveedor.razon_social
        
        Write-Host "Filtrando por proveedor: $proveedorNombre ($proveedorId)" -ForegroundColor Cyan
        Write-Host "GET $baseUrl/api/finanzas/cxp/aging?proveedor_id=$proveedorId" -ForegroundColor Gray
        Write-Host ""
        
        $responseFiltrado = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/aging?proveedor_id=$proveedorId" `
            -Method Get `
            -Headers $headers `
            -ErrorAction Stop
        
        Write-Host "✓ Reporte filtrado obtenido exitosamente" -ForegroundColor Green
        Write-Host ""
        Write-Host "RESUMEN PARA $proveedorNombre" -ForegroundColor Cyan
        Write-Host "Total CxP vencidas: $($responseFiltrado.data.resumen.total.cantidad)" -ForegroundColor White
        Write-Host "Monto total vencido: S/ $($responseFiltrado.data.resumen.total.monto)" -ForegroundColor White
        Write-Host ""
        
    } else {
        Write-Host "No hay CxP disponibles para filtrar" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "✗ Error al obtener el reporte filtrado" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Tests completados" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
