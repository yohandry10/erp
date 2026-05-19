# Test GET /api/finanzas/bancos/cuentas/:id/movimientos

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = "77777777-7777-7777-7777-777777777777"
}

Write-Host "`n=== TEST: GET Movimientos Bancarios ===" -ForegroundColor Cyan

# Primero, obtener una cuenta bancaria existente
Write-Host "`n1. Obteniendo cuentas bancarias..." -ForegroundColor Yellow
try {
    $cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Get -Headers $headers
    Write-Host "Cuentas obtenidas: $($cuentasResponse.data.Count)" -ForegroundColor Green

    if ($cuentasResponse.data.Count -eq 0) {
        Write-Host "No hay cuentas bancarias. Creando una cuenta de prueba..." -ForegroundColor Yellow

        $nuevaCuenta = @{
            nombre = "Cuenta Test Movimientos"
            banco = "BCP"
            numero_cuenta = "19100000000$(Get-Random -Minimum 1000 -Maximum 9999)"
            tipo_cuenta = "CORRIENTE"
            moneda = "PEN"
            saldo = 10000.00
            permite_sobregiro = $false
            activa = $true
        } | ConvertTo-Json

        $cuentaResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $nuevaCuenta
        $cuentaId = $cuentaResponse.data.id
        Write-Host "Cuenta creada: $cuentaId" -ForegroundColor Green
    } else {
        $cuentaId = $cuentasResponse.data[0].id
        Write-Host "Usando cuenta existente: $cuentaId" -ForegroundColor Green
    }
} catch {
    Write-Host "Error obteniendo/creando cuenta: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 1: Obtener todos los movimientos sin filtros
Write-Host "`n2. Obteniendo todos los movimientos (sin filtros)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos" -Method Get -Headers $headers
    Write-Host "✓ Movimientos obtenidos: $($response.data.Count)" -ForegroundColor Green
    Write-Host "  Total: $($response.pagination.total)" -ForegroundColor Gray
    Write-Host "  Página: $($response.pagination.page) de $($response.pagination.totalPages)" -ForegroundColor Gray

    if ($response.data.Count -gt 0) {
        $mov = $response.data[0]
        Write-Host "`n  Ejemplo de movimiento:" -ForegroundColor Gray
        Write-Host "    ID: $($mov.id)" -ForegroundColor Gray
        Write-Host "    Tipo: $($mov.tipo)" -ForegroundColor Gray
        Write-Host "    Monto: $($mov.monto)" -ForegroundColor Gray
        Write-Host "    Fecha: $($mov.fecha)" -ForegroundColor Gray
        Write-Host "    Conciliado: $($mov.conciliado)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "  Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# Test 2: Filtrar por tipo ABONO
Write-Host "`n3. Filtrando por tipo ABONO..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos?tipo=ABONO" -Method Get -Headers $headers
    Write-Host "✓ Movimientos ABONO: $($response.data.Count)" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Filtrar por tipo CARGO
Write-Host "`n4. Filtrando por tipo CARGO..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos?tipo=CARGO" -Method Get -Headers $headers
    Write-Host "✓ Movimientos CARGO: $($response.data.Count)" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Filtrar por conciliado
Write-Host "`n5. Filtrando por conciliado=false..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos?conciliado=false" -Method Get -Headers $headers
    Write-Host "✓ Movimientos no conciliados: $($response.data.Count)" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Filtrar por rango de fechas
Write-Host "`n6. Filtrando por rango de fechas (último mes)..." -ForegroundColor Yellow
try {
    $fechaHasta = Get-Date -Format "yyyy-MM-dd"
    $fechaDesde = (Get-Date).AddMonths(-1).ToString("yyyy-MM-dd")
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos?fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta" -Method Get -Headers $headers
    Write-Host "✓ Movimientos del último mes: $($response.data.Count)" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Paginación
Write-Host "`n7. Probando paginación (limit=5, page=1)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId/movimientos?limit=5&page=1" -Method Get -Headers $headers
    Write-Host "✓ Movimientos obtenidos: $($response.data.Count)" -ForegroundColor Green
    Write-Host "  Límite aplicado: $($response.pagination.limit)" -ForegroundColor Gray
    Write-Host "  Total páginas: $($response.pagination.totalPages)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Cuenta inexistente
Write-Host "`n8. Probando con cuenta inexistente..." -ForegroundColor Yellow
try {
    $cuentaFalsa = "00000000-0000-0000-0000-000000000000"
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaFalsa/movimientos" -Method Get -Headers $headers
    Write-Host "✗ Debería haber fallado con 404" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "✓ Correctamente retorna 404 para cuenta inexistente" -ForegroundColor Green
    } else {
        Write-Host "✗ Error inesperado: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== TESTS COMPLETADOS ===" -ForegroundColor Cyan
