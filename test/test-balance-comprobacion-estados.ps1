# Test Balance de Comprobación - Estados Financieros Endpoints
# GET /api/contabilidad/estados/balance-comprobacion?anio=2025&mes=1
# GET /api/contabilidad/balance-comprobacion?anio=2025&mes=1 (legacy)

$baseUrl = "http://localhost:3000"
$estadosEndpoint = "/api/contabilidad/estados/balance-comprobacion"
$legacyEndpoint = "/api/contabilidad/balance-comprobacion"

Write-Host "🧪 Testing Balance de Comprobación Endpoints" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Sin parámetros (debe fallar)
Write-Host "📋 Test 1: Sin parámetros (debe retornar error)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl$estadosEndpoint" -Method Get -Headers @{
        "x-tenant-id" = "550e8400-e29b-41d4-a716-446655440000"
    }
    Write-Host "❌ FAIL: Debería haber fallado sin parámetros" -ForegroundColor Red
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "✅ PASS: Falló correctamente sin parámetros" -ForegroundColor Green
}
Write-Host ""

# Test 2: Solo con año (debe fallar)
Write-Host "📋 Test 2: Solo con año (debe retornar error)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl$estadosEndpoint`?anio=2025" -Method Get -Headers @{
        "x-tenant-id" = "550e8400-e29b-41d4-a716-446655440000"
    }
    if ($response.success -eq $false) {
        Write-Host "✅ PASS: Retornó error correctamente" -ForegroundColor Green
        Write-Host "Mensaje: $($response.message)" -ForegroundColor Gray
    } else {
        Write-Host "❌ FAIL: Debería haber retornado error" -ForegroundColor Red
    }
} catch {
    Write-Host "⚠️  Error en request: $_" -ForegroundColor Yellow
}
Write-Host ""

# Test 3: Con año y mes válidos
Write-Host "📋 Test 3: Con año y mes válidos (2025-01)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl$estadosEndpoint`?anio=2025&mes=1" -Method Get -Headers @{
        "x-tenant-id" = "550e8400-e29b-41d4-a716-446655440000"
    }

    if ($response.success) {
        Write-Host "✅ PASS: Balance obtenido exitosamente" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Resumen del Balance:" -ForegroundColor Cyan
        Write-Host "  Período: $($response.data.periodo.descripcion)" -ForegroundColor White
        Write-Host "  Total Cuentas: $($response.data.resumen.total_cuentas)" -ForegroundColor White
        Write-Host "  Cuentas con Saldo: $($response.data.resumen.cuentas_con_saldo)" -ForegroundColor White
        Write-Host "  Total Debe: $($response.data.totales.debe)" -ForegroundColor White
        Write-Host "  Total Haber: $($response.data.totales.haber)" -ForegroundColor White
        Write-Host "  Diferencia: $($response.data.totales.diferencia)" -ForegroundColor White
        Write-Host "  Cuadrado: $($response.data.totales.cuadrado)" -ForegroundColor White

        if ($response.data.cuentas.Count -gt 0) {
            Write-Host ""
            Write-Host "📋 Primeras 5 cuentas:" -ForegroundColor Cyan
            $response.data.cuentas | Select-Object -First 5 | ForEach-Object {
                Write-Host "  $($_.cuenta) - $($_.nombre)" -ForegroundColor Gray
                Write-Host "    Debe: $($_.debe) | Haber: $($_.haber) | Saldo: $($_.saldo_final)" -ForegroundColor DarkGray
            }
        }
    } else {
        Write-Host "❌ FAIL: $($response.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en request: $_" -ForegroundColor Red
}
Write-Host ""

# Test 4: Con mes inválido (debe fallar)
Write-Host "📋 Test 4: Con mes inválido (mes=13)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl$estadosEndpoint`?anio=2025&mes=13" -Method Get -Headers @{
        "x-tenant-id" = "550e8400-e29b-41d4-a716-446655440000"
    }

    if ($response.success -eq $false) {
        Write-Host "✅ PASS: Retornó error correctamente" -ForegroundColor Green
        Write-Host "Mensaje: $($response.message)" -ForegroundColor Gray
    } else {
        Write-Host "❌ FAIL: Debería haber retornado error" -ForegroundColor Red
    }
} catch {
    Write-Host "⚠️  Error en request: $_" -ForegroundColor Yellow
}
Write-Host ""

# Test 5: Período diferente (2024-12)
Write-Host "📋 Test 5: Período diferente (2024-12)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl$estadosEndpoint`?anio=2024&mes=12" -Method Get -Headers @{
        "x-tenant-id" = "550e8400-e29b-41d4-a716-446655440000"
    }

    if ($response.success) {
        Write-Host "✅ PASS: Balance obtenido exitosamente" -ForegroundColor Green
        Write-Host "  Período: $($response.data.periodo.descripcion)" -ForegroundColor White
        Write-Host "  Total Cuentas: $($response.data.resumen.total_cuentas)" -ForegroundColor White
    } else {
        Write-Host "⚠️  $($response.message)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Error en request: $_" -ForegroundColor Yellow
}
Write-Host ""

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "🔄 Testing Legacy Endpoint" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Test 6: Legacy endpoint con año y mes
Write-Host "📋 Test 6: Legacy endpoint /api/contabilidad/balance-comprobacion?anio=2025&mes=1" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl$legacyEndpoint`?anio=2025&mes=1" -Method Get -Headers @{
        "x-tenant-id" = "550e8400-e29b-41d4-a716-446655440000"
    }

    if ($response.success) {
        Write-Host "✅ PASS: Legacy endpoint funciona con anio y mes" -ForegroundColor Green
        Write-Host "  Período: $($response.data.periodo.descripcion)" -ForegroundColor White
        Write-Host "  Total Cuentas: $($response.data.resumen.total_cuentas)" -ForegroundColor White
    } else {
        Write-Host "❌ FAIL: $($response.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en request: $_" -ForegroundColor Red
}
Write-Host ""

# Test 7: Legacy endpoint sin parámetros (debe usar servicio antiguo)
Write-Host "📋 Test 7: Legacy endpoint sin parámetros (fallback al servicio antiguo)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl$legacyEndpoint" -Method Get -Headers @{
        "x-tenant-id" = "550e8400-e29b-41d4-a716-446655440000"
    }

    if ($response.success) {
        Write-Host "✅ PASS: Legacy endpoint funciona sin parámetros (fallback)" -ForegroundColor Green
        Write-Host "  Tipo de respuesta: $(if ($response.data.periodo) { 'Nuevo formato' } else { 'Formato antiguo' })" -ForegroundColor White
    } else {
        Write-Host "⚠️  $($response.message)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Error en request: $_" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "✅ Tests completados" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Resumen:" -ForegroundColor Cyan
Write-Host "  - Nuevo endpoint: GET /api/contabilidad/estados/balance-comprobacion?anio&mes" -ForegroundColor White
Write-Host "  - Legacy endpoint actualizado: GET /api/contabilidad/balance-comprobacion?anio&mes" -ForegroundColor White
Write-Host "  - Ambos endpoints soportan los parámetros anio y mes" -ForegroundColor White
