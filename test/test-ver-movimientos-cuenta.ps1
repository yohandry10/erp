# Test: Ver movimientos por cuenta bancaria
# Endpoint: GET /api/finanzas/bancos/cuentas/:id/movimientos

$baseUrl = "http://localhost:3001"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "vierdes"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: VER MOVIMIENTOS POR CUENTA" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Paso 1: Obtener lista de cuentas bancarias
Write-Host "PASO 1: Obteniendo cuentas bancarias..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Get -Headers $headers

    if ($response.success -and $response.data.Count -gt 0) {
        Write-Host "✓ Cuentas obtenidas exitosamente" -ForegroundColor Green
        Write-Host "  Total de cuentas: $($response.data.Count)" -ForegroundColor Gray

        # Mostrar las primeras 3 cuentas
        $cuentas = $response.data | Select-Object -First 3
        foreach ($cuenta in $cuentas) {
            Write-Host "  - $($cuenta.nombre) ($($cuenta.banco)) - Saldo: $($cuenta.saldo) $($cuenta.moneda)" -ForegroundColor Gray
        }

        # Usar la primera cuenta para el test
        $cuentaId = $response.data[0].id
        $cuentaNombre = $response.data[0].nombre
        Write-Host "`n  Usando cuenta: $cuentaNombre (ID: $cuentaId)" -ForegroundColor Cyan
    } else {
        Write-Host "✗ No se encontraron cuentas bancarias" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error al obtener cuentas: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Paso 2: Obtener movimientos sin filtros
Write-Host "`nPASO 2: Obteniendo movimientos sin filtros..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos" -Method Get -Headers $headers

    if ($response.success) {
        Write-Host "✓ Movimientos obtenidos exitosamente" -ForegroundColor Green
        Write-Host "  Total de movimientos: $($response.pagination.total)" -ForegroundColor Gray
        Write-Host "  Página: $($response.pagination.page) de $($response.pagination.totalPages)" -ForegroundColor Gray
        Write-Host "  Movimientos en esta página: $($response.data.Count)" -ForegroundColor Gray

        if ($response.data.Count -gt 0) {
            Write-Host "`n  Primeros movimientos:" -ForegroundColor Gray
            $response.data | Select-Object -First 5 | ForEach-Object {
                $tipoColor = if ($_.tipo -eq "ABONO") { "Green" } else { "Red" }
                $tipoSymbol = if ($_.tipo -eq "ABONO") { "+" } else { "-" }
                Write-Host "    $($_.fecha) | $($_.tipo) | $tipoSymbol$($_.monto) | $($_.descripcion)" -ForegroundColor $tipoColor
            }
        }
    } else {
        Write-Host "✗ Error en la respuesta" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error al obtener movimientos: $($_.Exception.Message)" -ForegroundColor Red
}

# Paso 3: Filtrar por tipo ABONO
Write-Host "`nPASO 3: Filtrando movimientos tipo ABONO..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos?tipo=ABONO&limit=10" -Method Get -Headers $headers

    if ($response.success) {
        Write-Host "✓ Movimientos ABONO obtenidos" -ForegroundColor Green
        Write-Host "  Total de abonos: $($response.pagination.total)" -ForegroundColor Gray
        Write-Host "  Abonos en esta página: $($response.data.Count)" -ForegroundColor Gray

        if ($response.data.Count -gt 0) {
            $totalAbonos = ($response.data | Measure-Object -Property monto -Sum).Sum
            Write-Host "  Suma de abonos mostrados: $totalAbonos" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "✗ Error al filtrar abonos: $($_.Exception.Message)" -ForegroundColor Red
}

# Paso 4: Filtrar por tipo CARGO
Write-Host "`nPASO 4: Filtrando movimientos tipo CARGO..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos?tipo=CARGO&limit=10" -Method Get -Headers $headers

    if ($response.success) {
        Write-Host "✓ Movimientos CARGO obtenidos" -ForegroundColor Green
        Write-Host "  Total de cargos: $($response.pagination.total)" -ForegroundColor Gray
        Write-Host "  Cargos en esta página: $($response.data.Count)" -ForegroundColor Gray

        if ($response.data.Count -gt 0) {
            $totalCargos = ($response.data | Measure-Object -Property monto -Sum).Sum
            Write-Host "  Suma de cargos mostrados: $totalCargos" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "✗ Error al filtrar cargos: $($_.Exception.Message)" -ForegroundColor Red
}

# Paso 5: Filtrar por estado de conciliación
Write-Host "`nPASO 5: Filtrando movimientos NO conciliados..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos?conciliado=false&limit=10" -Method Get -Headers $headers

    if ($response.success) {
        Write-Host "✓ Movimientos NO conciliados obtenidos" -ForegroundColor Green
        Write-Host "  Total pendientes de conciliar: $($response.pagination.total)" -ForegroundColor Gray
        Write-Host "  Movimientos en esta página: $($response.data.Count)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error al filtrar por conciliación: $($_.Exception.Message)" -ForegroundColor Red
}

# Paso 6: Filtrar por rango de fechas
Write-Host "`nPASO 6: Filtrando por rango de fechas (último mes)..." -ForegroundColor Yellow
try {
    $fechaHasta = Get-Date -Format "yyyy-MM-dd"
    $fechaDesde = (Get-Date).AddMonths(-1).ToString("yyyy-MM-dd")

    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos?fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta&limit=10" -Method Get -Headers $headers

    if ($response.success) {
        Write-Host "✓ Movimientos del último mes obtenidos" -ForegroundColor Green
        Write-Host "  Rango: $fechaDesde a $fechaHasta" -ForegroundColor Gray
        Write-Host "  Total en el rango: $($response.pagination.total)" -ForegroundColor Gray
        Write-Host "  Movimientos en esta página: $($response.data.Count)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error al filtrar por fechas: $($_.Exception.Message)" -ForegroundColor Red
}

# Paso 7: Paginación
Write-Host "`nPASO 7: Probando paginación (página 2)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos?page=2&limit=5" -Method Get -Headers $headers

    if ($response.success) {
        Write-Host "✓ Página 2 obtenida exitosamente" -ForegroundColor Green
        Write-Host "  Página actual: $($response.pagination.page)" -ForegroundColor Gray
        Write-Host "  Total de páginas: $($response.pagination.totalPages)" -ForegroundColor Gray
        Write-Host "  Movimientos en esta página: $($response.data.Count)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error en paginación: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST COMPLETADO" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
