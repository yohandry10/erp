# Test script for GET /api/compras/ordenes/:id/recepciones endpoint
# Tests retrieving all recepciones associated with a specific orden de compra

$baseUrl = "http://localhost:3000"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: GET /api/compras/ordenes/:id/recepciones" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# First, let's get a list of existing ordenes to find one to test with
Write-Host "Step 1: Getting list of ordenes de compra..." -ForegroundColor Yellow
$ordenesResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes?tenant_id=$tenantId" -Method Get -ContentType "application/json"

if ($ordenesResponse.success -and $ordenesResponse.data.Count -gt 0) {
    $ordenId = $ordenesResponse.data[0].id
    Write-Host "✓ Found orden de compra: $ordenId" -ForegroundColor Green
    Write-Host "  Numero: $($ordenesResponse.data[0].numero)" -ForegroundColor Gray
    Write-Host "  Estado: $($ordenesResponse.data[0].estado)" -ForegroundColor Gray
    Write-Host ""

    # Test the recepciones endpoint
    Write-Host "Step 2: Getting recepciones for orden $ordenId..." -ForegroundColor Yellow
    try {
        $recepcionesResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$ordenId/recepciones?tenant_id=$tenantId" -Method Get -ContentType "application/json"

        if ($recepcionesResponse.success) {
            Write-Host "✓ Recepciones retrieved successfully!" -ForegroundColor Green
            Write-Host "  Count: $($recepcionesResponse.count)" -ForegroundColor Gray
            Write-Host ""

            if ($recepcionesResponse.count -gt 0) {
                Write-Host "Recepciones found:" -ForegroundColor Cyan
                foreach ($recepcion in $recepcionesResponse.data) {
                    Write-Host "  - ID: $($recepcion.id)" -ForegroundColor White
                    Write-Host "    Numero: $($recepcion.numero)" -ForegroundColor Gray
                    Write-Host "    Estado: $($recepcion.estado)" -ForegroundColor Gray
                    Write-Host "    Fecha: $($recepcion.fecha_recepcion)" -ForegroundColor Gray
                    if ($recepcion.recepcion_items) {
                        Write-Host "    Items: $($recepcion.recepcion_items.Count)" -ForegroundColor Gray
                    }
                    Write-Host ""
                }
            } else {
                Write-Host "  No recepciones found for this orden." -ForegroundColor Yellow
            }
        } else {
            Write-Host "✗ Failed to retrieve recepciones" -ForegroundColor Red
            Write-Host "  Error: $($recepcionesResponse.error)" -ForegroundColor Red
        }
    } catch {
        Write-Host "✗ Request failed" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "✗ No ordenes de compra found. Please create an orden first." -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test completed" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
