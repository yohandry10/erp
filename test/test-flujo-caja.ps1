# Test: GET /api/finanzas/tesoreria/flujo-caja
# Descripción: Obtener proyección de flujo de caja

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkR1cGxpY2F0ZSBvZiBlRzRKMGRhZGJCZGhqNGN3IiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2Rqb2Fxb3Fhb2Fhd2Nkb2Nod2RqZi5zdXBhYmFzZS5jby9hdXRoL3YxIiwic3ViIjoiNzJhNzU5YzAtNzBhYi00YzY5LWI5YzAtNzU5YzI5YjI5YjI5IiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTc2MTQ5NTYwMCwiaWF0IjoxNzI5OTU5NjAwLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6e30sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3Mjk5NTk2MDB9XSwic2Vzc2lvbl9pZCI6IjEyM2U0NTY3LWU4OWItMTJkMy1hNDU2LTQyNjYxNDE3NDAwMCIsImlzX2Fub255bW91cyI6ZmFsc2V9.test-signature"
$tenantId = "550e8400-e29b-41d4-a716-446655440001"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: Flujo de Caja - Proyección 90 días" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Proyección por defecto (90 días)
Write-Host "1. Proyección por defecto (90 días desde hoy)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/flujo-caja" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop
    
    Write-Host "✅ Proyección obtenida exitosamente" -ForegroundColor Green
    Write-Host "Período: $($response.data.periodo.fecha_desde) a $($response.data.periodo.fecha_hasta)" -ForegroundColor White
    Write-Host "Días: $($response.data.periodo.dias)" -ForegroundColor White
    Write-Host "`nCuentas bancarias:" -ForegroundColor White
    foreach ($cuenta in $response.data.cuentas_bancarias) {
        Write-Host "  - $($cuenta.nombre) ($($cuenta.banco)): $($cuenta.moneda) $($cuenta.saldo_actual)" -ForegroundColor White
    }
    Write-Host "`nResumen por moneda:" -ForegroundColor White
    foreach ($resumen in $response.data.resumen) {
        Write-Host "  $($resumen.moneda):" -ForegroundColor Cyan
        Write-Host "    Saldo actual: $($resumen.saldo_actual)" -ForegroundColor White
        Write-Host "    Ingresos proyectados: $($resumen.total_ingresos)" -ForegroundColor Green
        Write-Host "    Egresos proyectados: $($resumen.total_egresos)" -ForegroundColor Red
        Write-Host "    Flujo neto: $($resumen.flujo_neto)" -ForegroundColor $(if ($resumen.flujo_neto -ge 0) { "Green" } else { "Red" })
        Write-Host "    Saldo proyectado: $($resumen.saldo_proyectado)" -ForegroundColor White
        if ($resumen.alerta) {
            Write-Host "    ⚠️  ALERTA: $($resumen.alerta)" -ForegroundColor Yellow
        }
    }
    Write-Host "`nEstadísticas:" -ForegroundColor White
    Write-Host "  - CxP pendientes: $($response.data.estadisticas.total_cxp_pendientes)" -ForegroundColor White
    Write-Host "  - CxC pendientes: $($response.data.estadisticas.total_cxc_pendientes)" -ForegroundColor White
    Write-Host "  - Total movimientos: $($response.data.estadisticas.total_movimientos)" -ForegroundColor White
    
    if ($response.data.proyeccion.Count -gt 0) {
        Write-Host "`nPrimeros 5 movimientos proyectados:" -ForegroundColor White
        $response.data.proyeccion | Select-Object -First 5 | ForEach-Object {
            Write-Host "`n  Fecha: $($_.fecha) - $($_.moneda)" -ForegroundColor Cyan
            Write-Host "    Saldo inicial: $($_.saldo_inicial)" -ForegroundColor White
            Write-Host "    Ingresos: $($_.ingresos)" -ForegroundColor Green
            Write-Host "    Egresos: $($_.egresos)" -ForegroundColor Red
            Write-Host "    Flujo neto: $($_.flujo_neto)" -ForegroundColor $(if ($_.flujo_neto -ge 0) { "Green" } else { "Red" })
            Write-Host "    Saldo final: $($_.saldo_final)" -ForegroundColor White
            Write-Host "    Items: $($_.items.Count)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# Test 2: Proyección personalizada (30 días)
Write-Host "`n`n2. Proyección personalizada (30 días)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/flujo-caja?dias_proyeccion=30" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop
    
    Write-Host "✅ Proyección obtenida exitosamente" -ForegroundColor Green
    Write-Host "Período: $($response.data.periodo.fecha_desde) a $($response.data.periodo.fecha_hasta)" -ForegroundColor White
    Write-Host "Días: $($response.data.periodo.dias)" -ForegroundColor White
    Write-Host "Total movimientos: $($response.data.estadisticas.total_movimientos)" -ForegroundColor White
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Proyección con fechas específicas
Write-Host "`n`n3. Proyección con fechas específicas..." -ForegroundColor Yellow
$fechaDesde = (Get-Date).ToString("yyyy-MM-dd")
$fechaHasta = (Get-Date).AddDays(60).ToString("yyyy-MM-dd")
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/flujo-caja?fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop
    
    Write-Host "✅ Proyección obtenida exitosamente" -ForegroundColor Green
    Write-Host "Período: $($response.data.periodo.fecha_desde) a $($response.data.periodo.fecha_hasta)" -ForegroundColor White
    Write-Host "Días: $($response.data.periodo.dias)" -ForegroundColor White
    Write-Host "Total movimientos: $($response.data.estadisticas.total_movimientos)" -ForegroundColor White
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TESTS COMPLETADOS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
