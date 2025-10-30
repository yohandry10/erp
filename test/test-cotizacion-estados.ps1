# Test script para verificar el flujo de estados de cotizaciones
# Estados: BORRADOR → ENVIADA → APROBADA/RECHAZADA/VENCIDA

$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== TEST: Flujo de Estados de Cotizaciones ===" -ForegroundColor Cyan
Write-Host ""

# 1. Crear una cotización en estado BORRADOR
Write-Host "1. Creando cotización en estado BORRADOR..." -ForegroundColor Yellow

$nuevaCotizacion = @{
    tenant_id = $tenantId
    numero = "COT-2024-TEST-001"
    proveedor_id = "11111111-1111-1111-1111-111111111111"
    fecha_cotizacion = "2024-10-24"
    validez_dias = 30
    estado = "BORRADOR"
    observaciones = "Cotización de prueba para flujo de estados"
    detalles = @(
        @{
            producto_id = "22222222-2222-2222-2222-222222222222"
            descripcion = "Producto de prueba 1"
            cantidad = 10
            precio_unitario = 100.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones" -Method Post -Body $nuevaCotizacion -ContentType "application/json"
    
    if ($response.success) {
        $cotizacionId = $response.data.id
        Write-Host "✓ Cotización creada exitosamente" -ForegroundColor Green
        Write-Host "  ID: $cotizacionId" -ForegroundColor Gray
        Write-Host "  Estado: $($response.data.estado)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Error al crear cotización: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

# 2. Intentar aprobar directamente (debe fallar - solo se puede desde ENVIADA)
Write-Host "2. Intentando aprobar desde BORRADOR (debe fallar)..." -ForegroundColor Yellow

$aprobarBody = @{
    tenant_id = $tenantId
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/aprobar" -Method Post -Body $aprobarBody -ContentType "application/json"
    
    if (-not $response.success) {
        Write-Host "✓ Validación correcta: $($response.error)" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "✗ Error: Se permitió aprobar desde BORRADOR (no debería)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✓ Validación correcta: No se puede aprobar desde BORRADOR" -ForegroundColor Green
    Write-Host ""
}

# 3. Enviar cotización (BORRADOR → ENVIADA)
Write-Host "3. Enviando cotización (BORRADOR → ENVIADA)..." -ForegroundColor Yellow

$enviarBody = @{
    tenant_id = $tenantId
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/enviar" -Method Post -Body $enviarBody -ContentType "application/json"
    
    if ($response.success) {
        Write-Host "✓ Cotización enviada exitosamente" -ForegroundColor Green
        Write-Host "  Estado anterior: BORRADOR" -ForegroundColor Gray
        Write-Host "  Estado actual: $($response.data.estado)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Error al enviar cotización: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

# 4. Intentar enviar nuevamente (debe fallar - ya está ENVIADA)
Write-Host "4. Intentando enviar nuevamente (debe fallar)..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/enviar" -Method Post -Body $enviarBody -ContentType "application/json"
    
    if (-not $response.success) {
        Write-Host "✓ Validación correcta: $($response.error)" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "✗ Error: Se permitió enviar nuevamente (no debería)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✓ Validación correcta: No se puede enviar desde ENVIADA" -ForegroundColor Green
    Write-Host ""
}

# 5. Aprobar cotización (ENVIADA → APROBADA)
Write-Host "5. Aprobando cotización (ENVIADA → APROBADA)..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId/aprobar" -Method Post -Body $aprobarBody -ContentType "application/json"
    
    if ($response.success) {
        Write-Host "✓ Cotización aprobada exitosamente" -ForegroundColor Green
        Write-Host "  Estado anterior: ENVIADA" -ForegroundColor Gray
        Write-Host "  Estado actual: $($response.data.estado)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Error al aprobar cotización: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

# 6. Verificar estado final
Write-Host "6. Verificando estado final..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId`?tenant_id=$tenantId" -Method Get
    
    if ($response.success -and $response.data.estado -eq "APROBADA") {
        Write-Host "✓ Estado final verificado correctamente: APROBADA" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "✗ Error: Estado final incorrecto" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

# 7. Crear otra cotización para probar RECHAZAR
Write-Host "7. Creando segunda cotización para probar rechazo..." -ForegroundColor Yellow

$nuevaCotizacion2 = @{
    tenant_id = $tenantId
    numero = "COT-2024-TEST-002"
    proveedor_id = "11111111-1111-1111-1111-111111111111"
    fecha_cotizacion = "2024-10-24"
    validez_dias = 30
    estado = "BORRADOR"
    observaciones = "Cotización de prueba para rechazo"
    detalles = @(
        @{
            producto_id = "22222222-2222-2222-2222-222222222222"
            descripcion = "Producto de prueba 2"
            cantidad = 5
            precio_unitario = 50.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones" -Method Post -Body $nuevaCotizacion2 -ContentType "application/json"
    
    if ($response.success) {
        $cotizacionId2 = $response.data.id
        Write-Host "✓ Segunda cotización creada exitosamente" -ForegroundColor Green
        Write-Host "  ID: $cotizacionId2" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Error al crear segunda cotización: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

# 8. Enviar segunda cotización
Write-Host "8. Enviando segunda cotización..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId2/enviar" -Method Post -Body $enviarBody -ContentType "application/json"
    
    if ($response.success) {
        Write-Host "✓ Segunda cotización enviada" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "✗ Error al enviar segunda cotización: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

# 9. Rechazar cotización (ENVIADA → RECHAZADA)
Write-Host "9. Rechazando cotización (ENVIADA → RECHAZADA)..." -ForegroundColor Yellow

$rechazarBody = @{
    tenant_id = $tenantId
    motivo = "Precio muy alto, no se ajusta al presupuesto"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId2/rechazar" -Method Post -Body $rechazarBody -ContentType "application/json"
    
    if ($response.success) {
        Write-Host "✓ Cotización rechazada exitosamente" -ForegroundColor Green
        Write-Host "  Estado anterior: ENVIADA" -ForegroundColor Gray
        Write-Host "  Estado actual: $($response.data.estado)" -ForegroundColor Gray
        Write-Host "  Observaciones: $($response.data.observaciones)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Error al rechazar cotización: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

# 10. Verificar que no se puede aprobar una cotización rechazada
Write-Host "10. Intentando aprobar cotización rechazada (debe fallar)..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/compras/cotizaciones/$cotizacionId2/aprobar" -Method Post -Body $aprobarBody -ContentType "application/json"
    
    if (-not $response.success) {
        Write-Host "✓ Validación correcta: $($response.error)" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "✗ Error: Se permitió aprobar cotización rechazada (no debería)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✓ Validación correcta: No se puede aprobar cotización rechazada" -ForegroundColor Green
    Write-Host ""
}

Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host "✓ Flujo de estados implementado correctamente" -ForegroundColor Green
Write-Host "✓ BORRADOR → ENVIADA → APROBADA: OK" -ForegroundColor Green
Write-Host "✓ BORRADOR → ENVIADA → RECHAZADA: OK" -ForegroundColor Green
Write-Host "✓ Validaciones de transiciones: OK" -ForegroundColor Green
Write-Host ""
Write-Host "Cotización 1 (Aprobada): $cotizacionId" -ForegroundColor Gray
Write-Host "Cotización 2 (Rechazada): $cotizacionId2" -ForegroundColor Gray
