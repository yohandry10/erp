# Test script para crear asiento contable manual
# Endpoint: POST /api/contabilidad/asiento-contable

$baseUrl = "http://localhost:3000/api"

# 1. Login para obtener token
Write-Host "🔐 Iniciando sesión..." -ForegroundColor Cyan
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body (@{
    email = "admin@vierdes.com"
    password = "Admin123!"
} | ConvertTo-Json) -ContentType "application/json"

$token = $loginResponse.access_token
$tenantId = $loginResponse.user.tenants[0].id

Write-Host "✅ Token obtenido: $($token.Substring(0, 20))..." -ForegroundColor Green
Write-Host "✅ Tenant ID: $tenantId" -ForegroundColor Green

# Headers con autenticación
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

# 2. Obtener cuentas del plan de cuentas para usar en el asiento
Write-Host "`n📚 Obteniendo plan de cuentas..." -ForegroundColor Cyan
$planCuentas = Invoke-RestMethod -Uri "$baseUrl/contabilidad/plan-cuentas" -Method Get -Headers $headers

# Buscar cuentas específicas (ajustar según el plan de cuentas disponible)
$cuentaCaja = $planCuentas.data | Where-Object { $_.codigo -like "101*" } | Select-Object -First 1
$cuentaBanco = $planCuentas.data | Where-Object { $_.codigo -like "104*" } | Select-Object -First 1

if (-not $cuentaCaja -or -not $cuentaBanco) {
    Write-Host "❌ No se encontraron las cuentas necesarias en el plan de cuentas" -ForegroundColor Red
    Write-Host "Cuentas disponibles:" -ForegroundColor Yellow
    $planCuentas.data | Select-Object -First 10 | Format-Table codigo, nombre
    exit 1
}

Write-Host "✅ Cuenta Caja encontrada: $($cuentaCaja.codigo) - $($cuentaCaja.nombre)" -ForegroundColor Green
Write-Host "✅ Cuenta Banco encontrada: $($cuentaBanco.codigo) - $($cuentaBanco.nombre)" -ForegroundColor Green

# 3. Crear período contable si no existe
Write-Host "`n📅 Verificando período contable..." -ForegroundColor Cyan
$anio = (Get-Date).Year
$mes = (Get-Date).Month

try {
    $periodos = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Get -Headers $headers
    $periodoActual = $periodos.data | Where-Object { $_.anio -eq $anio -and $_.mes -eq $mes }

    if (-not $periodoActual) {
        Write-Host "📅 Creando período $anio-$mes..." -ForegroundColor Yellow
        $nuevoPeriodo = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Post -Headers $headers -Body (@{
            anio = $anio
            mes = $mes
        } | ConvertTo-Json)
        Write-Host "✅ Período creado: $($nuevoPeriodo.data.id)" -ForegroundColor Green
    } else {
        Write-Host "✅ Período $anio-$mes ya existe (Estado: $($periodoActual.estado))" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Error verificando período: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 4. Crear asiento contable manual
Write-Host "`n📝 Creando asiento contable manual..." -ForegroundColor Cyan

$asientoData = @{
    fecha = (Get-Date).ToString("yyyy-MM-dd")
    concepto = "Transferencia de caja a banco - Prueba manual"
    referencia = "TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
    detalles = @(
        @{
            cuenta_id = $cuentaBanco.id
            debe = 1000.00
            haber = 0.00
            concepto = "Depósito en banco"
        },
        @{
            cuenta_id = $cuentaCaja.id
            debe = 0.00
            haber = 1000.00
            concepto = "Retiro de caja"
        }
    )
}

Write-Host "`nDatos del asiento:" -ForegroundColor Yellow
Write-Host ($asientoData | ConvertTo-Json -Depth 10)

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/asiento-contable" -Method Post -Headers $headers -Body ($asientoData | ConvertTo-Json -Depth 10)

    Write-Host "`n✅ ASIENTO CREADO EXITOSAMENTE" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "ID: $($response.data.id)" -ForegroundColor Cyan
    Write-Host "Número: $($response.data.numero_asiento)" -ForegroundColor Cyan
    Write-Host "Fecha: $($response.data.fecha)" -ForegroundColor Cyan
    Write-Host "Concepto: $($response.data.concepto)" -ForegroundColor Cyan
    Write-Host "Referencia: $($response.data.referencia)" -ForegroundColor Cyan
    Write-Host "Total Debe: S/ $($response.data.total_debe)" -ForegroundColor Cyan
    Write-Host "Total Haber: S/ $($response.data.total_haber)" -ForegroundColor Cyan
    Write-Host "Estado: $($response.data.estado)" -ForegroundColor Cyan

    Write-Host "`nDetalles del asiento:" -ForegroundColor Yellow
    foreach ($detalle in $response.data.detalles) {
        Write-Host "  • $($detalle.cuenta_codigo) - $($detalle.cuenta_nombre)" -ForegroundColor White
        Write-Host "    Debe: S/ $($detalle.debe) | Haber: S/ $($detalle.haber)" -ForegroundColor Gray
        Write-Host "    Concepto: $($detalle.concepto)" -ForegroundColor Gray
    }

    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green

    # 5. Verificar que el asiento se puede consultar
    Write-Host "`n🔍 Verificando asiento creado..." -ForegroundColor Cyan
    $asientoCreado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/asientos-contables/$($response.data.id)" -Method Get -Headers $headers

    if ($asientoCreado.success) {
        Write-Host "✅ Asiento verificado correctamente" -ForegroundColor Green
    }

    # 6. Listar asientos recientes
    Write-Host "`n📋 Listando asientos recientes..." -ForegroundColor Cyan
    $asientosRecientes = Invoke-RestMethod -Uri "$baseUrl/contabilidad/asientos-contables?limit=5" -Method Get -Headers $headers

    Write-Host "Total de asientos: $($asientosRecientes.total)" -ForegroundColor Cyan
    Write-Host "Últimos 5 asientos:" -ForegroundColor Yellow
    foreach ($asiento in $asientosRecientes.data) {
        Write-Host "  • $($asiento.numero_asiento) - $($asiento.concepto) (S/ $($asiento.total_debe))" -ForegroundColor White
    }

} catch {
    Write-Host "`n❌ ERROR CREANDO ASIENTO" -ForegroundColor Red
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    Write-Host "Mensaje: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        Write-Host "`nDetalles del error:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }

    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ TEST COMPLETADO EXITOSAMENTE" -ForegroundColor Green
