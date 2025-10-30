# Test script for GET /api/compras/ordenes/:id endpoint
$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== Testing GET /api/compras/ordenes/:id endpoint ===" -ForegroundColor Cyan
Write-Host ""

# First, get list of orders to find a valid ID
Write-Host "Step 1: Getting list of orders to find a valid ID..." -ForegroundColor Yellow
try {
    $listResponse = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes?tenant_id=$tenantId&limit=1" -Method Get -ContentType "application/json"
    
    if ($listResponse.success -and $listResponse.data -and $listResponse.data.Count -gt 0) {
        $ordenId = $listResponse.data[0].id
        Write-Host "Found order ID: $ordenId" -ForegroundColor Green
        Write-Host ""
        
        # Test 1: Get order by ID
        Write-Host "Test 1: Get order by ID" -ForegroundColor Yellow
        Write-Host "GET $baseUrl/compras/ordenes/${ordenId}?tenant_id=$tenantId" -ForegroundColor Gray
        $response1 = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/${ordenId}?tenant_id=$tenantId" -Method Get -ContentType "application/json"
        Write-Host "Response:" -ForegroundColor Green
        $response1 | ConvertTo-Json -Depth 10
        Write-Host ""
        
        # Verify response structure
        Write-Host "Verifying response structure..." -ForegroundColor Yellow
        if ($response1.success) {
            Write-Host "✓ success field is true" -ForegroundColor Green
        } else {
            Write-Host "✗ success field is false or missing" -ForegroundColor Red
        }
        
        if ($response1.data) {
            Write-Host "✓ data field exists" -ForegroundColor Green
            
            # Check main fields
            $requiredFields = @('id', 'numero', 'proveedor_id', 'fecha_orden', 'estado', 'subtotal', 'igv', 'total', 'detalles')
            foreach ($field in $requiredFields) {
                if ($null -ne $response1.data.$field) {
                    Write-Host "  ✓ $field exists" -ForegroundColor Green
                } else {
                    Write-Host "  ✗ $field is missing" -ForegroundColor Red
                }
            }
            
            # Check proveedor nested object
            if ($response1.data.proveedor) {
                Write-Host "  ✓ proveedor object exists" -ForegroundColor Green
                if ($response1.data.proveedor.razon_social) {
                    Write-Host "    ✓ proveedor.razon_social exists" -ForegroundColor Green
                }
            } else {
                Write-Host "  ✗ proveedor object is missing" -ForegroundColor Red
            }
            
            # Check detalles array
            if ($response1.data.detalles -is [Array]) {
                Write-Host "  ✓ detalles is an array with $($response1.data.detalles.Count) items" -ForegroundColor Green
                if ($response1.data.detalles.Count -gt 0) {
                    $detalle = $response1.data.detalles[0]
                    $detalleFields = @('producto_id', 'descripcion', 'cantidad', 'precio_unitario', 'subtotal', 'cantidad_recibida', 'cantidad_pendiente')
                    foreach ($field in $detalleFields) {
                        if ($null -ne $detalle.$field) {
                            Write-Host "    ✓ detalle.$field exists" -ForegroundColor Green
                        } else {
                            Write-Host "    ✗ detalle.$field is missing" -ForegroundColor Red
                        }
                    }
                }
            } else {
                Write-Host "  ✗ detalles is not an array" -ForegroundColor Red
            }
        } else {
            Write-Host "✗ data field is missing" -ForegroundColor Red
        }
        Write-Host ""
        
        # Test 2: Get non-existent order
        Write-Host "Test 2: Get non-existent order (should return error)" -ForegroundColor Yellow
        $fakeId = "00000000-0000-0000-0000-000000000000"
        Write-Host "GET $baseUrl/compras/ordenes/${fakeId}?tenant_id=$tenantId" -ForegroundColor Gray
        try {
            $response2 = Invoke-RestMethod -Uri "$baseUrl/compras/ordenes/${fakeId}?tenant_id=$tenantId" -Method Get -ContentType "application/json"
            Write-Host "Response:" -ForegroundColor Green
            $response2 | ConvertTo-Json -Depth 5
            
            if (-not $response2.success) {
                Write-Host "✓ Correctly returned error for non-existent order" -ForegroundColor Green
            } else {
                Write-Host "✗ Should have returned error for non-existent order" -ForegroundColor Red
            }
        } catch {
            Write-Host "Response:" -ForegroundColor Green
            Write-Host $_.Exception.Message -ForegroundColor Yellow
            Write-Host "✓ Correctly returned error for non-existent order" -ForegroundColor Green
        }
        Write-Host ""
        
    } else {
        Write-Host "No orders found in database. Please create an order first." -ForegroundColor Red
        Write-Host "You can use test-crear-orden-compra.ps1 to create a test order." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure the API server is running on port 3002" -ForegroundColor Yellow
}

Write-Host "=== Test completed ===" -ForegroundColor Cyan
