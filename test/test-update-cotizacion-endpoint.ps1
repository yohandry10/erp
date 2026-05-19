# Test script for PUT /api/compras/cotizaciones/:id endpoint

$baseUrl = "http://localhost:3000/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== Testing PUT /api/compras/cotizaciones/:id ===" -ForegroundColor Cyan
Write-Host ""

# First, create a cotizacion to update
Write-Host "Step 1: Creating a test cotizacion..." -ForegroundColor Yellow

$createBody = @{
    tenant_id = $tenantId
    numero = "COT-TEST-UPDATE-001"
    proveedor_id = "550e8400-e29b-41d4-a716-446655440002"
    fecha_cotizacion = "2024-10-24"
    validez_dias = 30
    estado = "BORRADOR"
    observaciones = "Cotización de prueba para actualizar"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440001"
            descripcion = "Producto Test 1"
            cantidad = 10
            precio_unitario = 100.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones" -Method Post -Body $createBody -ContentType "application/json"

    if ($createResponse.success) {
        $cotizacionId = $createResponse.data.id
        Write-Host "✓ Cotización creada con ID: $cotizacionId" -ForegroundColor Green
        Write-Host "  Número: $($createResponse.data.numero)" -ForegroundColor Gray
        Write-Host "  Estado: $($createResponse.data.estado)" -ForegroundColor Gray
        Write-Host "  Total: $($createResponse.data.total)" -ForegroundColor Gray
        Write-Host ""

        # Now update the cotizacion
        Write-Host "Step 2: Updating the cotizacion..." -ForegroundColor Yellow

        $updateBody = @{
            tenant_id = $tenantId
            numero = "COT-TEST-UPDATE-001-MODIFIED"
            validez_dias = 45
            observaciones = "Cotización actualizada - cambio de validez y observaciones"
            detalles = @(
                @{
                    producto_id = "550e8400-e29b-41d4-a716-446655440001"
                    descripcion = "Producto Test 1 - Actualizado"
                    cantidad = 15
                    precio_unitario = 120.00
                },
                @{
                    producto_id = "550e8400-e29b-41d4-a716-446655440003"
                    descripcion = "Producto Test 2 - Nuevo"
                    cantidad = 5
                    precio_unitario = 200.00
                }
            )
        } | ConvertTo-Json -Depth 10

        $updateResponse = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId" -Method Put -Body $updateBody -ContentType "application/json"

        if ($updateResponse.success) {
            Write-Host "✓ Cotización actualizada exitosamente" -ForegroundColor Green
            Write-Host ""
            Write-Host "Datos actualizados:" -ForegroundColor Cyan
            Write-Host "  ID: $($updateResponse.data.id)" -ForegroundColor Gray
            Write-Host "  Número: $($updateResponse.data.numero)" -ForegroundColor Gray
            Write-Host "  Validez días: $($updateResponse.data.validez_dias)" -ForegroundColor Gray
            Write-Host "  Observaciones: $($updateResponse.data.observaciones)" -ForegroundColor Gray
            Write-Host "  Subtotal: $($updateResponse.data.subtotal)" -ForegroundColor Gray
            Write-Host "  IGV: $($updateResponse.data.igv)" -ForegroundColor Gray
            Write-Host "  Total: $($updateResponse.data.total)" -ForegroundColor Gray
            Write-Host "  Cantidad de detalles: $($updateResponse.data.detalles.Count)" -ForegroundColor Gray
            Write-Host ""

            # Verify the update by fetching the cotizacion
            Write-Host "Step 3: Verifying the update..." -ForegroundColor Yellow
            $getResponse = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId`?tenant_id=$tenantId" -Method Get

            if ($getResponse.success) {
                Write-Host "✓ Verificación exitosa" -ForegroundColor Green
                Write-Host "  Número verificado: $($getResponse.data.numero)" -ForegroundColor Gray
                Write-Host "  Validez días verificado: $($getResponse.data.validez_dias)" -ForegroundColor Gray
                Write-Host "  Total verificado: $($getResponse.data.total)" -ForegroundColor Gray
                Write-Host "  Detalles verificados: $($getResponse.data.detalles.Count) items" -ForegroundColor Gray
            }
            Write-Host ""

            # Test updating a non-BORRADOR cotizacion (should fail)
            Write-Host "Step 4: Testing update restriction (non-BORRADOR)..." -ForegroundColor Yellow

            # First change estado to ENVIADA
            $changeEstadoBody = @{
                tenant_id = $tenantId
                estado = "ENVIADA"
            } | ConvertTo-Json

            $changeEstadoResponse = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId" -Method Put -Body $changeEstadoBody -ContentType "application/json"

            if ($changeEstadoResponse.success) {
                Write-Host "  Estado cambiado a ENVIADA" -ForegroundColor Gray

                # Now try to update again (should fail)
                $failUpdateBody = @{
                    tenant_id = $tenantId
                    observaciones = "Esto no debería funcionar"
                } | ConvertTo-Json

                try {
                    $failResponse = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId" -Method Put -Body $failUpdateBody -ContentType "application/json"

                    if (-not $failResponse.success) {
                        Write-Host "✓ Restricción funcionando correctamente" -ForegroundColor Green
                        Write-Host "  Error esperado: $($failResponse.error)" -ForegroundColor Gray
                    } else {
                        Write-Host "✗ ERROR: Se permitió actualizar una cotización no BORRADOR" -ForegroundColor Red
                    }
                } catch {
                    Write-Host "✓ Restricción funcionando correctamente (excepción capturada)" -ForegroundColor Green
                }
            }

        } else {
            Write-Host "✗ Error al actualizar: $($updateResponse.error)" -ForegroundColor Red
        }

    } else {
        Write-Host "✗ Error al crear cotización: $($createResponse.error)" -ForegroundColor Red
    }

} catch {
    Write-Host "✗ Error en la prueba: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.StackTrace -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test completado ===" -ForegroundColor Cyan
