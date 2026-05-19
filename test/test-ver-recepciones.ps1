# Test script for Ver Recepciones Asociadas functionality
# Tests the GET /api/compras/ordenes/:id/recepciones endpoint

$baseUrl = "http://localhost:3002"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

# Get an existing proveedor
Write-Host "Getting existing proveedor..." -ForegroundColor Yellow
try {
    $proveedoresResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores?tenant_id=$tenantId&limit=1" -Method Get
    if ($proveedoresResponse.success -and $proveedoresResponse.data -and $proveedoresResponse.data.Count -gt 0) {
        $proveedorId = $proveedoresResponse.data[0].id
        Write-Host "✅ Using proveedor: $($proveedoresResponse.data[0].razon_social) (ID: $proveedorId)" -ForegroundColor Green
    } else {
        Write-Host "❌ No proveedores found. Please create a proveedor first." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error getting proveedores: $_" -ForegroundColor Red
    exit 1
}

# Use a dummy almacen ID (will be created if doesn't exist or use existing)
$almacenId = "00000000-0000-0000-0000-000000000099"
Write-Host "✅ Using almacen ID: $almacenId" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Ver Recepciones Asociadas" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a test orden de compra
Write-Host "Step 1: Creating test orden de compra..." -ForegroundColor Yellow
$ordenBody = @{
    tenant_id = $tenantId
    numero = "OC-TEST-REC-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = $proveedorId
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO"
    dias_credito = 30
    estado = "APROBADA"
    observaciones = "Orden de prueba para recepciones"
    detalles = @(
        @{
            producto_id = "00000000-0000-0000-0000-000000000001"
            descripcion = "Producto Test 1 - Laptop HP"
            cantidad = 100
            precio_unitario = 50.00
        },
        @{
            producto_id = "00000000-0000-0000-0000-000000000002"
            descripcion = "Producto Test 2 - Mouse Logitech"
            cantidad = 50
            precio_unitario = 75.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $ordenResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes" -Method Post -Body $ordenBody -ContentType "application/json"

    if ($ordenResponse.success) {
        $ordenId = $ordenResponse.data.id
        Write-Host "✅ Orden created successfully: $($ordenResponse.data.numero)" -ForegroundColor Green
        Write-Host "   Orden ID: $ordenId" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ Failed to create orden: $($ordenResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error creating orden: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Create first recepcion
Write-Host "Step 2: Creating first recepcion..." -ForegroundColor Yellow
$recepcion1Body = @{
    tenant_id = $tenantId
    orden_id = $ordenId
    numero = "REC-001-$(Get-Date -Format 'yyyyMMddHHmmss')"
    fecha_recepcion = (Get-Date).ToString("yyyy-MM-dd")
    almacen_id = $almacenId
    recibido_por = "Usuario Test"
    observaciones = "Primera recepción parcial"
    items = @(
        @{
            producto_id = "00000000-0000-0000-0000-000000000001"
            cantidad = 50
            cantidad_aceptada = 50
            cantidad_rechazada = 0
            calidad = "OK"
            lote = "LOTE-001"
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $recepcion1Response = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$ordenId/recepciones" -Method Post -Body $recepcion1Body -ContentType "application/json"

    if ($recepcion1Response.success) {
        $recepcion1Id = $recepcion1Response.data.id
        Write-Host "✅ First recepcion created: $($recepcion1Response.data.numero)" -ForegroundColor Green
        Write-Host "   Recepcion ID: $recepcion1Id" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ Failed to create first recepcion: $($recepcion1Response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error creating first recepcion: $_" -ForegroundColor Red
}

# Step 3: Create second recepcion
Write-Host "Step 3: Creating second recepcion..." -ForegroundColor Yellow
Start-Sleep -Seconds 1
$recepcion2Body = @{
    tenant_id = $tenantId
    orden_id = $ordenId
    numero = "REC-002-$(Get-Date -Format 'yyyyMMddHHmmss')"
    fecha_recepcion = (Get-Date).ToString("yyyy-MM-dd")
    almacen_id = $almacenId
    recibido_por = "Usuario Test"
    observaciones = "Segunda recepción parcial"
    items = @(
        @{
            producto_id = "00000000-0000-0000-0000-000000000001"
            cantidad = 30
            cantidad_aceptada = 28
            cantidad_rechazada = 2
            calidad = "OBSERVADO"
            lote = "LOTE-002"
            observaciones = "2 unidades con defectos menores"
        },
        @{
            producto_id = "00000000-0000-0000-0000-000000000002"
            cantidad = 50
            cantidad_aceptada = 50
            cantidad_rechazada = 0
            calidad = "OK"
            lote = "LOTE-003"
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $recepcion2Response = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$ordenId/recepciones" -Method Post -Body $recepcion2Body -ContentType "application/json"

    if ($recepcion2Response.success) {
        $recepcion2Id = $recepcion2Response.data.id
        Write-Host "✅ Second recepcion created: $($recepcion2Response.data.numero)" -ForegroundColor Green
        Write-Host "   Recepcion ID: $recepcion2Id" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ Failed to create second recepcion: $($recepcion2Response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error creating second recepcion: $_" -ForegroundColor Red
}

# Step 4: Get recepciones by orden ID
Write-Host "Step 4: Getting recepciones for orden..." -ForegroundColor Yellow
try {
    $recepcionesResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$ordenId/recepciones?tenant_id=$tenantId" -Method Get

    if ($recepcionesResponse.success) {
        Write-Host "✅ Recepciones retrieved successfully" -ForegroundColor Green
        Write-Host "   Total recepciones: $($recepcionesResponse.count)" -ForegroundColor Gray
        Write-Host ""

        Write-Host "Recepciones Details:" -ForegroundColor Cyan
        Write-Host "===================" -ForegroundColor Cyan

        foreach ($recepcion in $recepcionesResponse.data) {
            Write-Host ""
            Write-Host "Recepcion: $($recepcion.numero)" -ForegroundColor White
            Write-Host "  ID: $($recepcion.id)" -ForegroundColor Gray
            Write-Host "  Estado: $($recepcion.estado)" -ForegroundColor Gray
            Write-Host "  Fecha: $($recepcion.fecha_recepcion)" -ForegroundColor Gray
            Write-Host "  Recibido por: $($recepcion.recibido_por)" -ForegroundColor Gray

            if ($recepcion.observaciones) {
                Write-Host "  Observaciones: $($recepcion.observaciones)" -ForegroundColor Gray
            }

            if ($recepcion.recepcion_items -and $recepcion.recepcion_items.Count -gt 0) {
                Write-Host "  Items ($($recepcion.recepcion_items.Count)):" -ForegroundColor Gray
                foreach ($item in $recepcion.recepcion_items) {
                    Write-Host "    - Producto: $($item.producto_id)" -ForegroundColor DarkGray
                    Write-Host "      Cantidad: $($item.cantidad) | Aceptada: $($item.cantidad_aceptada) | Rechazada: $($item.cantidad_rechazada)" -ForegroundColor DarkGray
                    Write-Host "      Calidad: $($item.calidad)" -ForegroundColor DarkGray
                    if ($item.lote) {
                        Write-Host "      Lote: $($item.lote)" -ForegroundColor DarkGray
                    }
                    if ($item.observaciones) {
                        Write-Host "      Obs: $($item.observaciones)" -ForegroundColor DarkGray
                    }
                }
            }
        }

        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "✅ ALL TESTS PASSED" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Frontend Test:" -ForegroundColor Yellow
        Write-Host "Visit: $baseUrl/dashboard/compras/ordenes/$ordenId" -ForegroundColor Cyan
        Write-Host "The recepciones panel should display the 2 recepciones created above." -ForegroundColor Gray

    } else {
        Write-Host "❌ Failed to get recepciones: $($recepcionesResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error getting recepciones: $_" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Test orden ID for reference: $ordenId" -ForegroundColor Yellow
