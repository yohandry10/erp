# Simple test for Ver Recepciones functionality
# This script tests the GET endpoint directly

$baseUrl = "http://localhost:3002"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Simple Test: Ver Recepciones" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get an existing orden with recepciones
Write-Host "Step 1: Getting existing ordenes..." -ForegroundColor Yellow
try {
    $ordenesResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes?tenant_id=$tenantId&limit=10" -Method Get

    if ($ordenesResponse.success -and $ordenesResponse.data -and $ordenesResponse.data.Count -gt 0) {
        Write-Host "✅ Found $($ordenesResponse.count) ordenes" -ForegroundColor Green

        # Try to find an orden with estado PARCIAL, RECIBIDA, or CERRADA
        $ordenConRecepciones = $ordenesResponse.data | Where-Object {
            $_.estado -in @('PARCIAL', 'RECIBIDA', 'CERRADA', 'APROBADA')
        } | Select-Object -First 1

        if ($ordenConRecepciones) {
            $ordenId = $ordenConRecepciones.id
            Write-Host "✅ Testing with orden: $($ordenConRecepciones.numero) (Estado: $($ordenConRecepciones.estado))" -ForegroundColor Green
            Write-Host "   Orden ID: $ordenId" -ForegroundColor Gray
            Write-Host ""

            # Get recepciones for this orden
            Write-Host "Step 2: Getting recepciones for orden..." -ForegroundColor Yellow
            try {
                $recepcionesResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$ordenId/recepciones?tenant_id=$tenantId" -Method Get

                if ($recepcionesResponse.success) {
                    Write-Host "✅ Recepciones retrieved successfully" -ForegroundColor Green
                    Write-Host "   Total recepciones: $($recepcionesResponse.count)" -ForegroundColor Gray
                    Write-Host ""

                    if ($recepcionesResponse.count -gt 0) {
                        Write-Host "Recepciones Details:" -ForegroundColor Cyan
                        Write-Host "===================" -ForegroundColor Cyan

                        foreach ($recepcion in $recepcionesResponse.data) {
                            Write-Host ""
                            Write-Host "📦 Recepcion: $($recepcion.numero)" -ForegroundColor White
                            Write-Host "   Estado: $($recepcion.estado)" -ForegroundColor Gray
                            Write-Host "   Fecha: $($recepcion.fecha_recepcion)" -ForegroundColor Gray

                            if ($recepcion.recepcion_items) {
                                Write-Host "   Items: $($recepcion.recepcion_items.Count)" -ForegroundColor Gray
                            }
                        }

                        Write-Host ""
                        Write-Host "========================================" -ForegroundColor Cyan
                        Write-Host "✅ TEST PASSED" -ForegroundColor Green
                        Write-Host "========================================" -ForegroundColor Cyan
                        Write-Host ""
                        Write-Host "Frontend URL:" -ForegroundColor Yellow
                        Write-Host "http://localhost:3000/dashboard/compras/ordenes/$ordenId" -ForegroundColor Cyan

                    } else {
                        Write-Host "ℹ️  No recepciones found for this orden" -ForegroundColor Yellow
                        Write-Host "   This is normal if no recepciones have been created yet" -ForegroundColor Gray
                        Write-Host ""
                        Write-Host "✅ Endpoint works correctly (returns empty array)" -ForegroundColor Green
                    }
                } else {
                    Write-Host "❌ Failed to get recepciones: $($recepcionesResponse.error)" -ForegroundColor Red
                }
            } catch {
                Write-Host "❌ Error getting recepciones: $_" -ForegroundColor Red
            }
        } else {
            Write-Host "ℹ️  No ordenes found in suitable states" -ForegroundColor Yellow
            Write-Host "   Create an orden in APROBADA state to test" -ForegroundColor Gray
        }
    } else {
        Write-Host "ℹ️  No ordenes found" -ForegroundColor Yellow
        Write-Host "   Create an orden first to test this functionality" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Error getting ordenes: $_" -ForegroundColor Red
}
