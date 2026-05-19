# Test: Programación de Pagos por Vencimiento
# Verifica que el endpoint de programación de pagos funcione correctamente

$baseUrl = "http://localhost:3001"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "vierdes"

Write-Host "=== TEST: Programación de Pagos por Vencimiento ===" -ForegroundColor Cyan
Write-Host ""

# Headers
$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

# Test 1: Obtener programación sin filtros
Write-Host "Test 1: Obtener programación de pagos (sin filtros)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/programacion" -Method Get -Headers $headers
    Write-Host "✅ Programación obtenida exitosamente" -ForegroundColor Green
    Write-Host "Total de pagos: $($response.total)" -ForegroundColor Cyan
    Write-Host "Página: $($response.page) | Límite: $($response.limit)" -ForegroundColor Cyan

    if ($response.data.Count -gt 0) {
        Write-Host "`nPrimeros 3 pagos:" -ForegroundColor Cyan
        $response.data | Select-Object -First 3 | ForEach-Object {
            Write-Host "  - $($_.numero_documento) | Proveedor: $($_.proveedor.razon_social)" -ForegroundColor White
            Write-Host "    Vencimiento: $($_.fecha_vencimiento) | Días: $($_.dias_hasta_vencimiento) | Urgencia: $($_.urgencia)" -ForegroundColor Gray
            Write-Host "    Saldo: $($_.saldo) $($_.moneda) | Estado: $($_.estado)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.Response.StatusCode -ForegroundColor Red
}

Write-Host ""

# Test 2: Filtrar por fecha (próximos 7 días)
Write-Host "Test 2: Filtrar pagos urgentes (próximos 7 días)" -ForegroundColor Yellow
try {
    $hoy = Get-Date -Format "yyyy-MM-dd"
    $en7Dias = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")

    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/programacion?fecha_desde=$hoy&fecha_hasta=$en7Dias" -Method Get -Headers $headers
    Write-Host "✅ Pagos urgentes obtenidos" -ForegroundColor Green
    Write-Host "Total de pagos urgentes: $($response.total)" -ForegroundColor Cyan

    if ($response.data.Count -gt 0) {
        Write-Host "`nPagos urgentes:" -ForegroundColor Cyan
        $response.data | ForEach-Object {
            Write-Host "  - $($_.numero_documento) | $($_.proveedor.razon_social)" -ForegroundColor White
            Write-Host "    Vence: $($_.fecha_vencimiento) ($($_.dias_hasta_vencimiento) días) | Urgencia: $($_.urgencia)" -ForegroundColor Gray
            Write-Host "    Saldo: $($_.saldo) $($_.moneda)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Filtrar por estado PENDIENTE
Write-Host "Test 3: Filtrar por estado PENDIENTE" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/programacion?estado=PENDIENTE&limit=5" -Method Get -Headers $headers
    Write-Host "✅ Pagos pendientes obtenidos" -ForegroundColor Green
    Write-Host "Total de pagos pendientes: $($response.total)" -ForegroundColor Cyan

    if ($response.data.Count -gt 0) {
        Write-Host "`nPagos pendientes:" -ForegroundColor Cyan
        $response.data | ForEach-Object {
            Write-Host "  - $($_.numero_documento) | Estado: $($_.estado)" -ForegroundColor White
            Write-Host "    Saldo: $($_.saldo) $($_.moneda) | Urgencia: $($_.urgencia)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Paginación
Write-Host "Test 4: Probar paginación (página 1, límite 10)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/programacion?page=1&limit=10" -Method Get -Headers $headers
    Write-Host "✅ Paginación funcionando" -ForegroundColor Green
    Write-Host "Página: $($response.page) | Límite: $($response.limit) | Total: $($response.total)" -ForegroundColor Cyan
    Write-Host "Registros en esta página: $($response.data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 5: Estadísticas por urgencia
Write-Host "Test 5: Estadísticas por urgencia" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/programacion?limit=100" -Method Get -Headers $headers

    $vencidas = ($response.data | Where-Object { $_.urgencia -eq "VENCIDA" }).Count
    $hoy = ($response.data | Where-Object { $_.urgencia -eq "HOY" }).Count
    $urgentes = ($response.data | Where-Object { $_.urgencia -eq "URGENTE" }).Count
    $proximas = ($response.data | Where-Object { $_.urgencia -eq "PROXIMA" }).Count
    $normales = ($response.data | Where-Object { $_.urgencia -eq "NORMAL" }).Count

    Write-Host "✅ Estadísticas calculadas" -ForegroundColor Green
    Write-Host "  Vencidas: $vencidas" -ForegroundColor Red
    Write-Host "  Vence Hoy: $hoy" -ForegroundColor Yellow
    Write-Host "  Urgentes (1-7 días): $urgentes" -ForegroundColor Yellow
    Write-Host "  Próximas (8-15 días): $proximas" -ForegroundColor Blue
    Write-Host "  Normales (>15 días): $normales" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== FIN DE TESTS ===" -ForegroundColor Cyan
