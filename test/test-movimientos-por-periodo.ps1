# Test: Obtener movimientos bancarios por período
# Endpoint: GET /api/finanzas/bancos/movimientos/periodo

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZTBiMzBjYy1hNzBhLTRhNzAtYjU3Zi1lMzI5YzY5YzI3YjgiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwidGVuYW50X2lkIjoiNjU0MzIxMDktYWJjZC0xMjM0LTU2NzgtOTBhYmNkZWYwMTIzIiwiaWF0IjoxNzMwMDcwMDAwLCJleHAiOjE3NjE2MDYwMDB9.test-signature-for-development"
$tenantId = "65432109-abcd-1234-5678-90abcdef0123"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: Movimientos Bancarios por Período" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Obtener todos los movimientos (sin filtros)
Write-Host "Test 1: Obtener todos los movimientos" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos/periodo" `
        -Method Get `
        -Headers $headers
    
    Write-Host "✅ Movimientos obtenidos exitosamente" -ForegroundColor Green
    Write-Host "Total de movimientos: $($response.pagination.total)" -ForegroundColor White
    Write-Host "Página: $($response.pagination.page) de $($response.pagination.totalPages)" -ForegroundColor White
    
    if ($response.resumen.por_moneda) {
        Write-Host "`nResumen por moneda:" -ForegroundColor Cyan
        foreach ($moneda in $response.resumen.por_moneda) {
            Write-Host "  $($moneda.moneda):" -ForegroundColor White
            Write-Host "    - Total Abonos: $($moneda.total_abonos) ($($moneda.cantidad_abonos) movimientos)" -ForegroundColor Green
            Write-Host "    - Total Cargos: $($moneda.total_cargos) ($($moneda.cantidad_cargos) movimientos)" -ForegroundColor Red
            Write-Host "    - Flujo Neto: $($moneda.flujo_neto)" -ForegroundColor $(if ($moneda.flujo_neto -ge 0) { "Green" } else { "Red" })
        }
    }
    
    if ($response.data -and $response.data.Count -gt 0) {
        Write-Host "`nPrimeros 3 movimientos:" -ForegroundColor Cyan
        $response.data | Select-Object -First 3 | ForEach-Object {
            Write-Host "  - Fecha: $($_.fecha) | Tipo: $($_.tipo) | Monto: $($_.monto) | Cuenta: $($_.cuentas_bancarias.nombre)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.Response.StatusCode -ForegroundColor Red
}

# Test 2: Filtrar por rango de fechas
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Test 2: Filtrar por rango de fechas (último mes)" -ForegroundColor Yellow
try {
    $fechaHasta = Get-Date -Format "yyyy-MM-dd"
    $fechaDesde = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos/periodo?fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta" `
        -Method Get `
        -Headers $headers
    
    Write-Host "✅ Movimientos filtrados exitosamente" -ForegroundColor Green
    Write-Host "Período: $fechaDesde a $fechaHasta" -ForegroundColor White
    Write-Host "Total de movimientos: $($response.pagination.total)" -ForegroundColor White
    
    if ($response.resumen.por_moneda) {
        Write-Host "`nResumen del período:" -ForegroundColor Cyan
        foreach ($moneda in $response.resumen.por_moneda) {
            Write-Host "  $($moneda.moneda): Flujo Neto = $($moneda.flujo_neto)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Filtrar solo ABONOS
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Test 3: Filtrar solo ABONOS (ingresos)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos/periodo?tipo=ABONO" `
        -Method Get `
        -Headers $headers
    
    Write-Host "✅ Abonos obtenidos exitosamente" -ForegroundColor Green
    Write-Host "Total de abonos: $($response.pagination.total)" -ForegroundColor White
    
    if ($response.resumen.por_moneda) {
        Write-Host "`nTotal de ingresos por moneda:" -ForegroundColor Cyan
        foreach ($moneda in $response.resumen.por_moneda) {
            Write-Host "  $($moneda.moneda): $($moneda.total_abonos) ($($moneda.cantidad_abonos) movimientos)" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Filtrar solo CARGOS
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Test 4: Filtrar solo CARGOS (egresos)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos/periodo?tipo=CARGO" `
        -Method Get `
        -Headers $headers
    
    Write-Host "✅ Cargos obtenidos exitosamente" -ForegroundColor Green
    Write-Host "Total de cargos: $($response.pagination.total)" -ForegroundColor White
    
    if ($response.resumen.por_moneda) {
        Write-Host "`nTotal de egresos por moneda:" -ForegroundColor Cyan
        foreach ($moneda in $response.resumen.por_moneda) {
            Write-Host "  $($moneda.moneda): $($moneda.total_cargos) ($($moneda.cantidad_cargos) movimientos)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Filtrar movimientos no conciliados
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Test 5: Filtrar movimientos no conciliados" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos/periodo?conciliado=false" `
        -Method Get `
        -Headers $headers
    
    Write-Host "✅ Movimientos no conciliados obtenidos exitosamente" -ForegroundColor Green
    Write-Host "Total de movimientos pendientes de conciliar: $($response.pagination.total)" -ForegroundColor White
    
    if ($response.data -and $response.data.Count -gt 0) {
        Write-Host "`nPrimeros 5 movimientos pendientes:" -ForegroundColor Cyan
        $response.data | Select-Object -First 5 | ForEach-Object {
            Write-Host "  - $($_.fecha) | $($_.tipo) | $($_.monto) | $($_.cuentas_bancarias.banco) - $($_.cuentas_bancarias.numero_cuenta)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Paginación
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Test 6: Paginación (página 1, límite 10)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos/periodo?page=1&limit=10" `
        -Method Get `
        -Headers $headers
    
    Write-Host "✅ Paginación funcionando correctamente" -ForegroundColor Green
    Write-Host "Página: $($response.pagination.page)" -ForegroundColor White
    Write-Host "Límite: $($response.pagination.limit)" -ForegroundColor White
    Write-Host "Total: $($response.pagination.total)" -ForegroundColor White
    Write-Host "Total de páginas: $($response.pagination.totalPages)" -ForegroundColor White
    Write-Host "Movimientos en esta página: $($response.data.Count)" -ForegroundColor White
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Combinación de filtros
Write-Host "`n----------------------------------------" -ForegroundColor Gray
Write-Host "Test 7: Combinación de filtros (CARGO + último mes + no conciliado)" -ForegroundColor Yellow
try {
    $fechaHasta = Get-Date -Format "yyyy-MM-dd"
    $fechaDesde = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos/periodo?tipo=CARGO&fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta&conciliado=false" `
        -Method Get `
        -Headers $headers
    
    Write-Host "✅ Filtros combinados aplicados exitosamente" -ForegroundColor Green
    Write-Host "Egresos no conciliados del último mes: $($response.pagination.total)" -ForegroundColor White
    
    if ($response.resumen.por_moneda) {
        Write-Host "`nTotal por moneda:" -ForegroundColor Cyan
        foreach ($moneda in $response.resumen.por_moneda) {
            Write-Host "  $($moneda.moneda): $($moneda.total_cargos)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TESTS COMPLETADOS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
