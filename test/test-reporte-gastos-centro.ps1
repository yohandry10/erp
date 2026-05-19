# Test: Reporte de Gastos por Centro de Costo
# Endpoint: GET /api/contabilidad/centros-costo/:id/reporte-gastos

$baseUrl = "http://localhost:3000/api"

# 1. Login
Write-Host "🔐 Iniciando sesión..." -ForegroundColor Cyan
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body (@{
  email = "admin@vierdes.com"
  password = "Admin123!"
} | ConvertTo-Json) -ContentType "application/json"

$token = $loginResponse.access_token
$headers = @{
  "Authorization" = "Bearer $token"
  "Content-Type" = "application/json"
}

Write-Host "✅ Sesión iniciada correctamente" -ForegroundColor Green
Write-Host ""

# 2. Listar centros de costo disponibles
Write-Host "📋 Listando centros de costo..." -ForegroundColor Cyan
try {
  $centrosResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo" -Method Get -Headers $headers

  if ($centrosResponse.success -and $centrosResponse.data.Count -gt 0) {
    Write-Host "✅ Centros de costo encontrados:" -ForegroundColor Green
    foreach ($centro in $centrosResponse.data) {
      Write-Host "  - [$($centro.codigo)] $($centro.nombre)" -ForegroundColor White
    }

    # Usar el primer centro de costo para el reporte
    $centroCostoId = $centrosResponse.data[0].id
    $centroCostoNombre = $centrosResponse.data[0].nombre
    Write-Host ""
    Write-Host "📊 Generando reporte para: $centroCostoNombre" -ForegroundColor Cyan
  } else {
    Write-Host "⚠️ No se encontraron centros de costo" -ForegroundColor Yellow
    Write-Host "Creando un centro de costo de prueba..." -ForegroundColor Yellow

    $nuevoCentro = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo" -Method Post -Headers $headers -Body (@{
      codigo = "CC001"
      nombre = "Centro de Costo Prueba"
      descripcion = "Centro de costo para pruebas"
    } | ConvertTo-Json)

    $centroCostoId = $nuevoCentro.data.id
    $centroCostoNombre = $nuevoCentro.data.nombre
    Write-Host "✅ Centro de costo creado: $centroCostoNombre" -ForegroundColor Green
  }
} catch {
  Write-Host "❌ Error listando centros de costo: $_" -ForegroundColor Red
  exit 1
}

Write-Host ""

# 3. Obtener reporte de gastos (sin filtros de fecha)
Write-Host "📊 Obteniendo reporte de gastos (todo el período)..." -ForegroundColor Cyan
try {
  $reporteResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo/$centroCostoId/reporte-gastos" -Method Get -Headers $headers

  if ($reporteResponse.success) {
    Write-Host "✅ Reporte generado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 REPORTE DE GASTOS - $($reporteResponse.data.centro_costo.nombre)" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "Período: $($reporteResponse.data.periodo.fecha_desde) a $($reporteResponse.data.periodo.fecha_hasta)" -ForegroundColor White
    Write-Host ""

    # Resumen
    Write-Host "📊 RESUMEN:" -ForegroundColor Yellow
    Write-Host "  Total Gastos: S/ $($reporteResponse.data.resumen.total_gastos.ToString('N2'))" -ForegroundColor White
    Write-Host "  Total Movimientos: $($reporteResponse.data.resumen.total_movimientos)" -ForegroundColor White

    if ($reporteResponse.data.resumen.cuenta_mayor_gasto) {
      Write-Host "  Cuenta con Mayor Gasto:" -ForegroundColor White
      Write-Host "    [$($reporteResponse.data.resumen.cuenta_mayor_gasto.codigo)] $($reporteResponse.data.resumen.cuenta_mayor_gasto.nombre)" -ForegroundColor White
      Write-Host "    Monto: S/ $($reporteResponse.data.resumen.cuenta_mayor_gasto.monto.ToString('N2'))" -ForegroundColor White
    }

    Write-Host ""

    # Detalle por cuenta
    if ($reporteResponse.data.gastos_por_cuenta.Count -gt 0) {
      Write-Host "💰 GASTOS POR CUENTA:" -ForegroundColor Yellow
      Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
      Write-Host ("{0,-10} {1,-40} {2,15} {3,15} {4,15} {5,10}" -f "Código", "Nombre", "Debe", "Haber", "Saldo", "Movs.") -ForegroundColor Cyan
      Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray

      foreach ($cuenta in $reporteResponse.data.gastos_por_cuenta) {
        $nombreCorto = if ($cuenta.cuenta_nombre.Length -gt 40) { $cuenta.cuenta_nombre.Substring(0, 37) + "..." } else { $cuenta.cuenta_nombre }
        Write-Host ("{0,-10} {1,-40} {2,15} {3,15} {4,15} {5,10}" -f `
          $cuenta.cuenta_codigo, `
          $nombreCorto, `
          ("S/ " + $cuenta.total_debe.ToString('N2')), `
          ("S/ " + $cuenta.total_haber.ToString('N2')), `
          ("S/ " + $cuenta.saldo.ToString('N2')), `
          $cuenta.cantidad_movimientos) -ForegroundColor White
      }

      Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    } else {
      Write-Host "ℹ️ No hay gastos registrados para este centro de costo en el período seleccionado" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host $reporteResponse.message -ForegroundColor Green
  } else {
    Write-Host "❌ Error: $($reporteResponse.message)" -ForegroundColor Red
  }
} catch {
  Write-Host "❌ Error obteniendo reporte: $_" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""

# 4. Obtener reporte con filtro de fechas (último mes)
$fechaHasta = Get-Date -Format "yyyy-MM-dd"
$fechaDesde = (Get-Date).AddMonths(-1).ToString("yyyy-MM-dd")

Write-Host "📊 Obteniendo reporte de gastos (último mes: $fechaDesde a $fechaHasta)..." -ForegroundColor Cyan
try {
  $reporteMesResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo/$centroCostoId/reporte-gastos?fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta" -Method Get -Headers $headers

  if ($reporteMesResponse.success) {
    Write-Host "✅ Reporte mensual generado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 REPORTE MENSUAL - $($reporteMesResponse.data.centro_costo.nombre)" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "Período: $fechaDesde a $fechaHasta" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 RESUMEN:" -ForegroundColor Yellow
    Write-Host "  Total Gastos: S/ $($reporteMesResponse.data.resumen.total_gastos.ToString('N2'))" -ForegroundColor White
    Write-Host "  Total Movimientos: $($reporteMesResponse.data.resumen.total_movimientos)" -ForegroundColor White
    Write-Host "  Cuentas con Gastos: $($reporteMesResponse.data.gastos_por_cuenta.Count)" -ForegroundColor White
    Write-Host ""
    Write-Host $reporteMesResponse.message -ForegroundColor Green
  } else {
    Write-Host "❌ Error: $($reporteMesResponse.message)" -ForegroundColor Red
  }
} catch {
  Write-Host "❌ Error obteniendo reporte mensual: $_" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Prueba completada" -ForegroundColor Green
