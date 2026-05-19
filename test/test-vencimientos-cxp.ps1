# Test script for GET /api/finanzas/cxp/vencimientos endpoint
# Tests upcoming payment due dates functionality

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "vierdes"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: GET /api/finanzas/cxp/vencimientos" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Get upcoming due dates (default 30 days)
Write-Host "Test 1: Obtener vencimientos próximos (30 días por defecto)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/vencimientos" `
        -Method Get `
        -Headers $headers

    Write-Host "✓ Respuesta exitosa" -ForegroundColor Green
    Write-Host "Fecha consulta: $($response.data.fecha_consulta)" -ForegroundColor White
    Write-Host "Días adelante: $($response.data.dias_adelante)" -ForegroundColor White
    Write-Host "Fecha límite: $($response.data.fecha_limite)" -ForegroundColor White
    Write-Host "Cantidad total: $($response.data.resumen.cantidad_total)" -ForegroundColor White
    Write-Host "Monto total: $($response.data.resumen.monto_total)" -ForegroundColor White

    if ($response.data.resumen.por_moneda) {
        Write-Host "`nResumen por moneda:" -ForegroundColor Cyan
        $response.data.resumen.por_moneda.PSObject.Properties | ForEach-Object {
            Write-Host "  $($_.Name): $($_.Value.cantidad) cuentas, Monto: $($_.Value.monto)" -ForegroundColor White
        }
    }

    if ($response.data.vencimientos -and $response.data.vencimientos.Count -gt 0) {
        Write-Host "`nPrimeros 5 vencimientos:" -ForegroundColor Cyan
        $response.data.vencimientos | Select-Object -First 5 | ForEach-Object {
            Write-Host "  - $($_.numero_documento) | Proveedor: $($_.proveedor_razon_social)" -ForegroundColor White
            Write-Host "    Vence: $($_.fecha_vencimiento) (en $($_.dias_hasta_vencimiento) días)" -ForegroundColor White
            Write-Host "    Saldo: $($_.moneda) $($_.saldo)" -ForegroundColor White
        }
    } else {
        Write-Host "`nNo hay vencimientos en los próximos 30 días" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# Test 2: Get upcoming due dates for next 7 days
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Test 2: Obtener vencimientos próximos (7 días)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/vencimientos?dias=7" `
        -Method Get `
        -Headers $headers

    Write-Host "✓ Respuesta exitosa" -ForegroundColor Green
    Write-Host "Días adelante: $($response.data.dias_adelante)" -ForegroundColor White
    Write-Host "Cantidad total: $($response.data.resumen.cantidad_total)" -ForegroundColor White
    Write-Host "Monto total: $($response.data.resumen.monto_total)" -ForegroundColor White

    if ($response.data.vencimientos -and $response.data.vencimientos.Count -gt 0) {
        Write-Host "`nVencimientos en los próximos 7 días:" -ForegroundColor Cyan
        $response.data.vencimientos | ForEach-Object {
            Write-Host "  - $($_.numero_documento) | $($_.proveedor_razon_social)" -ForegroundColor White
            Write-Host "    Vence: $($_.fecha_vencimiento) (en $($_.dias_hasta_vencimiento) días) | Saldo: $($_.moneda) $($_.saldo)" -ForegroundColor White
        }
    } else {
        Write-Host "`nNo hay vencimientos en los próximos 7 días" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# Test 3: Get upcoming due dates for next 60 days
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Test 3: Obtener vencimientos próximos (60 días)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/vencimientos?dias=60" `
        -Method Get `
        -Headers $headers

    Write-Host "✓ Respuesta exitosa" -ForegroundColor Green
    Write-Host "Días adelante: $($response.data.dias_adelante)" -ForegroundColor White
    Write-Host "Cantidad total: $($response.data.resumen.cantidad_total)" -ForegroundColor White
    Write-Host "Monto total: $($response.data.resumen.monto_total)" -ForegroundColor White
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Filter by specific supplier (if exists)
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Test 4: Obtener vencimientos por proveedor específico" -ForegroundColor Yellow
Write-Host "(Primero obtenemos un proveedor de los vencimientos)" -ForegroundColor Gray

try {
    # First get vencimientos to get a proveedor_id
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/vencimientos" `
        -Method Get `
        -Headers $headers

    if ($response.data.vencimientos -and $response.data.vencimientos.Count -gt 0) {
        $proveedorId = $response.data.vencimientos[0].proveedor_id
        $proveedorNombre = $response.data.vencimientos[0].proveedor_razon_social

        Write-Host "Filtrando por proveedor: $proveedorNombre" -ForegroundColor Cyan

        $responseFiltered = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/vencimientos?proveedor_id=$proveedorId" `
            -Method Get `
            -Headers $headers

        Write-Host "✓ Respuesta exitosa" -ForegroundColor Green
        Write-Host "Cantidad total: $($responseFiltered.data.resumen.cantidad_total)" -ForegroundColor White
        Write-Host "Monto total: $($responseFiltered.data.resumen.monto_total)" -ForegroundColor White

        if ($responseFiltered.data.vencimientos) {
            Write-Host "`nVencimientos del proveedor:" -ForegroundColor Cyan
            $responseFiltered.data.vencimientos | ForEach-Object {
                Write-Host "  - $($_.numero_documento) | Vence: $($_.fecha_vencimiento) | Saldo: $($_.moneda) $($_.saldo)" -ForegroundColor White
            }
        }
    } else {
        Write-Host "No hay vencimientos para filtrar por proveedor" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Invalid parameters
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Test 5: Validación de parámetros inválidos" -ForegroundColor Yellow

Write-Host "`n5a. Días = 0 (debe fallar)" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/vencimientos?dias=0" `
        -Method Get `
        -Headers $headers
    Write-Host "✗ Debería haber fallado pero no lo hizo" -ForegroundColor Red
} catch {
    Write-Host "✓ Validación correcta: $($_.Exception.Message)" -ForegroundColor Green
}

Write-Host "`n5b. Días = 500 (debe fallar, máximo 365)" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/vencimientos?dias=500" `
        -Method Get `
        -Headers $headers
    Write-Host "✗ Debería haber fallado pero no lo hizo" -ForegroundColor Red
} catch {
    Write-Host "✓ Validación correcta: $($_.Exception.Message)" -ForegroundColor Green
}

Write-Host "`n5c. Proveedor ID inválido (debe fallar)" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/vencimientos?proveedor_id=invalid-uuid" `
        -Method Get `
        -Headers $headers
    Write-Host "✗ Debería haber fallado pero no lo hizo" -ForegroundColor Red
} catch {
    Write-Host "✓ Validación correcta: $($_.Exception.Message)" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TESTS COMPLETADOS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
