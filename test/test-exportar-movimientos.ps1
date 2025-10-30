# Test GET /api/finanzas/bancos/cuentas/:id/movimientos/exportar

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjY3YzI0Yy1hMzE0LTRhNzAtYjU5Zi1lNzE0YzY5YzY5YzYiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6ImFkbWluIiwidGVuYW50X2lkIjoiNzc3Nzc3NzctNzc3Ny03Nzc3LTc3NzctNzc3Nzc3Nzc3Nzc3IiwiaWF0IjoxNzMwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.T8nEz8VjWvU5l_F-example-token-replace-with-real"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = "77777777-7777-7777-7777-777777777777"
}

Write-Host "`n=== TEST: Exportar Movimientos Bancarios a CSV ===" -ForegroundColor Cyan

# Primero, obtener una cuenta bancaria existente
Write-Host "`n1. Obteniendo cuentas bancarias..." -ForegroundColor Yellow
try {
    $cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Get -Headers $headers
    Write-Host "Cuentas obtenidas: $($cuentasResponse.data.Count)" -ForegroundColor Green
    
    if ($cuentasResponse.data.Count -eq 0) {
        Write-Host "No hay cuentas bancarias. Por favor crea una cuenta primero." -ForegroundColor Red
        exit 1
    } else {
        $cuenta = $cuentasResponse.data[0]
        $cuentaId = $cuenta.id
        Write-Host "Usando cuenta: $($cuenta.nombre) - $($cuenta.banco) $($cuenta.numero_cuenta)" -ForegroundColor Green
    }
} catch {
    Write-Host "Error obteniendo cuenta: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 1: Exportar todos los movimientos sin filtros
Write-Host "`n2. Exportando todos los movimientos (sin filtros)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos/exportar" -Method Get -Headers $headers
    
    if ($response.success -and $response.data) {
        Write-Host "✓ CSV generado exitosamente" -ForegroundColor Green
        Write-Host "  Nombre archivo: $($response.filename)" -ForegroundColor Gray
        
        # Mostrar las primeras líneas del CSV
        $lines = $response.data -split "`n"
        Write-Host "`n  Primeras líneas del CSV:" -ForegroundColor Gray
        for ($i = 0; $i -lt [Math]::Min(5, $lines.Count); $i++) {
            Write-Host "    $($lines[$i])" -ForegroundColor Gray
        }
        Write-Host "  ... (Total: $($lines.Count) líneas)" -ForegroundColor Gray
        
        # Guardar el CSV en un archivo
        $outputFile = "movimientos_export_test.csv"
        $response.data | Out-File -FilePath $outputFile -Encoding UTF8
        Write-Host "`n  ✓ CSV guardado en: $outputFile" -ForegroundColor Green
    } else {
        Write-Host "✗ Error: Respuesta inválida" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "  Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# Test 2: Exportar con filtro de tipo ABONO
Write-Host "`n3. Exportando solo movimientos ABONO..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos/exportar?tipo=ABONO" -Method Get -Headers $headers
    
    if ($response.success -and $response.data) {
        $lines = $response.data -split "`n"
        Write-Host "✓ CSV generado: $($lines.Count) líneas (incluyendo header)" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Exportar con filtro de tipo CARGO
Write-Host "`n4. Exportando solo movimientos CARGO..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos/exportar?tipo=CARGO" -Method Get -Headers $headers
    
    if ($response.success -and $response.data) {
        $lines = $response.data -split "`n"
        Write-Host "✓ CSV generado: $($lines.Count) líneas (incluyendo header)" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Exportar con filtro de conciliado
Write-Host "`n5. Exportando solo movimientos no conciliados..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos/exportar?conciliado=false" -Method Get -Headers $headers
    
    if ($response.success -and $response.data) {
        $lines = $response.data -split "`n"
        Write-Host "✓ CSV generado: $($lines.Count) líneas (incluyendo header)" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Exportar con rango de fechas
Write-Host "`n6. Exportando movimientos del último mes..." -ForegroundColor Yellow
try {
    $fechaHasta = Get-Date -Format "yyyy-MM-dd"
    $fechaDesde = (Get-Date).AddMonths(-1).ToString("yyyy-MM-dd")
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos/exportar?fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta" -Method Get -Headers $headers
    
    if ($response.success -and $response.data) {
        $lines = $response.data -split "`n"
        Write-Host "✓ CSV generado: $($lines.Count) líneas (incluyendo header)" -ForegroundColor Green
        Write-Host "  Rango: $fechaDesde a $fechaHasta" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Exportar con múltiples filtros combinados
Write-Host "`n7. Exportando con múltiples filtros (CARGO + no conciliado)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos/exportar?tipo=CARGO&conciliado=false" -Method Get -Headers $headers
    
    if ($response.success -and $response.data) {
        $lines = $response.data -split "`n"
        Write-Host "✓ CSV generado: $($lines.Count) líneas (incluyendo header)" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Cuenta inexistente
Write-Host "`n8. Probando con cuenta inexistente..." -ForegroundColor Yellow
try {
    $cuentaFalsa = "00000000-0000-0000-0000-000000000000"
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaFalsa/movimientos/exportar" -Method Get -Headers $headers
    Write-Host "✗ Debería haber fallado con 404" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "✓ Correctamente retorna 404 para cuenta inexistente" -ForegroundColor Green
    } else {
        Write-Host "✗ Error inesperado: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== TESTS COMPLETADOS ===" -ForegroundColor Cyan
Write-Host "`nArchivo de prueba guardado: movimientos_export_test.csv" -ForegroundColor Yellow

