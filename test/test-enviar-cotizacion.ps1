# Test script for POST /api/compras/cotizaciones/:id/enviar endpoint
# Tests the transition from BORRADOR to ENVIADA state

$baseUrl = "http://localhost:3001/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== TEST: Enviar Cotización (BORRADOR → ENVIADA) ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create a quotation in BORRADOR state
Write-Host "1. Creando cotización en estado BORRADOR..." -ForegroundColor Yellow

$nuevaCotizacion = @{
    tenant_id = $tenantId
    numero = "COT-ENVIAR-$(Get-Date -Format 'yyyyMMddHHmmss')"
    proveedor_id = "550e8400-e29b-41d4-a716-446655440002"
    fecha_cotizacion = (Get-Date).ToString("yyyy-MM-dd")
    validez_dias = 30
    estado = "BORRADOR"
    observaciones = "Cotización de prueba para endpoint enviar"
    detalles = @(
        @{
            producto_id = "550e8400-e29b-41d4-a716-446655440003"
            descripcion = "Producto de prueba para enviar"
            cantidad = 10
            precio_unitario = 100.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones" `
        -Method Post `
        -Body $nuevaCotizacion `
        -ContentType "application/json" `
        -ErrorAction Stop

    if ($response.success) {
        $cotizacionId = $response.data.id
        Write-Host "✓ Cotización creada exitosamente" -ForegroundColor Green
        Write-Host "  ID: $cotizacionId" -ForegroundColor Cyan
        Write-Host "  Número: $($response.data.numero)" -ForegroundColor Cyan
        Write-Host "  Estado: $($response.data.estado)" -ForegroundColor Cyan
        Write-Host "  Total: $($response.data.total)" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "✗ Error al crear cotización: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
    exit 1
}

# Step 2: Send the quotation (BORRADOR → ENVIADA)
Write-Host "2. Enviando cotización (BORRADOR → ENVIADA)..." -ForegroundColor Yellow

$enviarBody = @{
    tenant_id = $tenantId
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/enviar" `
        -Method Post `
        -Body $enviarBody `
        -ContentType "application/json" `
        -ErrorAction Stop

    if ($response.success) {
        Write-Host "✓ Cotización enviada exitosamente" -ForegroundColor Green
        Write-Host "  Estado anterior: BORRADOR" -ForegroundColor Cyan
        Write-Host "  Estado actual: $($response.data.estado)" -ForegroundColor Cyan
        Write-Host "  Fecha vencimiento: $($response.data.fecha_vencimiento)" -ForegroundColor Cyan
        Write-Host ""

        # Verify state is ENVIADA
        if ($response.data.estado -eq "ENVIADA") {
            Write-Host "✓ Estado verificado correctamente: ENVIADA" -ForegroundColor Green
        } else {
            Write-Host "✗ Error: Estado incorrecto. Esperado: ENVIADA, Actual: $($response.data.estado)" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "✗ Error al enviar cotización: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
    exit 1
}

# Step 3: Try to send again (should fail - already ENVIADA)
Write-Host "3. Intentando enviar nuevamente (debe fallar)..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/enviar" `
        -Method Post `
        -Body $enviarBody `
        -ContentType "application/json" `
        -ErrorAction Stop

    if (-not $response.success) {
        Write-Host "✓ Validación correcta: No se puede enviar desde estado ENVIADA" -ForegroundColor Green
        Write-Host "  Error esperado: $($response.error)" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "✗ Error: Se permitió enviar nuevamente (no debería)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✓ Validación correcta: Petición rechazada por el servidor" -ForegroundColor Green
    Write-Host ""
}

# Step 4: Verify final state
Write-Host "4. Verificando estado final..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId`?tenant_id=$tenantId" `
        -Method Get `
        -ErrorAction Stop

    if ($response.success -and $response.data.estado -eq "ENVIADA") {
        Write-Host "✓ Estado final verificado correctamente" -ForegroundColor Green
        Write-Host "  ID: $($response.data.id)" -ForegroundColor Cyan
        Write-Host "  Número: $($response.data.numero)" -ForegroundColor Cyan
        Write-Host "  Estado: $($response.data.estado)" -ForegroundColor Cyan
        Write-Host "  Proveedor: $($response.data.proveedor.razon_social)" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "✗ Error: Estado final incorrecto" -ForegroundColor Red
        Write-Host "  Esperado: ENVIADA" -ForegroundColor Yellow
        Write-Host "  Actual: $($response.data.estado)" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host "✓ Endpoint POST /api/compras/cotizaciones/:id/enviar funciona correctamente" -ForegroundColor Green
Write-Host "✓ Transición BORRADOR → ENVIADA: OK" -ForegroundColor Green
Write-Host "✓ Validación de estado: OK" -ForegroundColor Green
Write-Host "✓ Prevención de envío duplicado: OK" -ForegroundColor Green
Write-Host ""
Write-Host "Cotización de prueba ID: $cotizacionId" -ForegroundColor Gray
