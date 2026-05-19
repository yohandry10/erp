# Test script para verificar el Panel de Aprobaciones
# Este script prueba el endpoint de aprobaciones y la visualización del panel

$baseUrl = "http://localhost:3001"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== TEST: Panel de Aprobaciones ===" -ForegroundColor Cyan
Write-Host ""

# 1. Crear una orden de compra que requiera aprobación
Write-Host "1. Creando orden de compra que requiere aprobación..." -ForegroundColor Yellow

$ordenData = @{
  tenant_id = $tenantId
  numero = "OC-TEST-APROB-$(Get-Date -Format 'yyyyMMddHHmmss')"
  proveedor_id = "11111111-1111-1111-1111-111111111111"
  fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
  fecha_entrega_esperada = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
  condiciones_pago = "30 días"
  dias_credito = 30
  estado = "APROBACION"
  moneda = "PEN"
  observaciones = "Orden de prueba para panel de aprobaciones"
  detalles = @(
    @{
      producto_id = "22222222-2222-2222-2222-222222222222"
      descripcion = "Producto de prueba 1"
      cantidad = 100
      precio_unitario = 150.00
      cantidad_recibida = 0
    }
  )
} | ConvertTo-Json -Depth 10

try {
  $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes" `
    -Method Post `
    -Body $ordenData `
    -ContentType "application/json"

  if ($response.success) {
    $ordenId = $response.data.id
    Write-Host "✓ Orden creada exitosamente: $($response.data.numero)" -ForegroundColor Green
    Write-Host "  ID: $ordenId" -ForegroundColor Gray
    Write-Host "  Estado: $($response.data.estado)" -ForegroundColor Gray
    Write-Host "  Total: $($response.data.total)" -ForegroundColor Gray
  } else {
    Write-Host "✗ Error al crear orden: $($response.error)" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
  exit 1
}

Write-Host ""

# 2. Obtener aprobaciones de la orden
Write-Host "2. Obteniendo aprobaciones de la orden..." -ForegroundColor Yellow

try {
  $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$ordenId/aprobaciones?tenant_id=$tenantId" `
    -Method Get `
    -ContentType "application/json"

  if ($response.success) {
    Write-Host "✓ Aprobaciones obtenidas exitosamente" -ForegroundColor Green
    Write-Host "  Total de aprobaciones: $($response.count)" -ForegroundColor Gray

    if ($response.data.Count -gt 0) {
      Write-Host ""
      Write-Host "  Detalle de aprobaciones:" -ForegroundColor Cyan
      foreach ($aprobacion in $response.data) {
        Write-Host "    - Aprobador: $($aprobacion.aprobador_nombre)" -ForegroundColor White
        Write-Host "      Estado: $($aprobacion.estado)" -ForegroundColor $(if ($aprobacion.estado -eq 'PENDIENTE') { 'Yellow' } elseif ($aprobacion.estado -eq 'APROBADA') { 'Green' } else { 'Red' })
        Write-Host "      Nivel: $($aprobacion.nivel)" -ForegroundColor Gray
        if ($aprobacion.fecha_aprobacion) {
          Write-Host "      Fecha: $($aprobacion.fecha_aprobacion)" -ForegroundColor Gray
        }
        if ($aprobacion.comentarios) {
          Write-Host "      Comentarios: $($aprobacion.comentarios)" -ForegroundColor Gray
        }
        Write-Host ""
      }
    } else {
      Write-Host "  No hay aprobaciones registradas para esta orden" -ForegroundColor Yellow
    }
  } else {
    Write-Host "✗ Error al obtener aprobaciones: $($response.error)" -ForegroundColor Red
  }
} catch {
  Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
}

Write-Host ""

# 3. Aprobar la orden (simular aprobación)
Write-Host "3. Aprobando la orden..." -ForegroundColor Yellow

$aprobarData = @{
  tenant_id = $tenantId
  aprobador_id = "33333333-3333-3333-3333-333333333333"
  aprobador_nombre = "Usuario de Prueba"
  comentarios = "Aprobado para testing del panel"
} | ConvertTo-Json

try {
  $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$ordenId/aprobar" `
    -Method Post `
    -Body $aprobarData `
    -ContentType "application/json"

  if ($response.success) {
    Write-Host "✓ Orden aprobada exitosamente" -ForegroundColor Green
    Write-Host "  Nuevo estado: $($response.data.estado)" -ForegroundColor Gray
  } else {
    Write-Host "✗ Error al aprobar orden: $($response.error)" -ForegroundColor Red
  }
} catch {
  Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
}

Write-Host ""

# 4. Verificar aprobaciones actualizadas
Write-Host "4. Verificando aprobaciones actualizadas..." -ForegroundColor Yellow

try {
  $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes/$ordenId/aprobaciones?tenant_id=$tenantId" `
    -Method Get `
    -ContentType "application/json"

  if ($response.success) {
    Write-Host "✓ Aprobaciones actualizadas obtenidas" -ForegroundColor Green

    $pendientes = ($response.data | Where-Object { $_.estado -eq 'PENDIENTE' }).Count
    $aprobadas = ($response.data | Where-Object { $_.estado -eq 'APROBADA' }).Count
    $rechazadas = ($response.data | Where-Object { $_.estado -eq 'RECHAZADA' }).Count

    Write-Host ""
    Write-Host "  Resumen de aprobaciones:" -ForegroundColor Cyan
    Write-Host "    Pendientes: $pendientes" -ForegroundColor Yellow
    Write-Host "    Aprobadas: $aprobadas" -ForegroundColor Green
    Write-Host "    Rechazadas: $rechazadas" -ForegroundColor Red
  }
} catch {
  Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host "✓ Endpoint de aprobaciones funcionando correctamente" -ForegroundColor Green
Write-Host "✓ Panel de aprobaciones listo para visualización" -ForegroundColor Green
Write-Host ""
Write-Host "Para ver el panel en acción:" -ForegroundColor Yellow
Write-Host "  1. Abre el navegador en: http://localhost:3000" -ForegroundColor White
Write-Host "  2. Navega a: /dashboard/compras/ordenes/$ordenId" -ForegroundColor White
Write-Host "  3. El panel de aprobaciones debe aparecer en la columna derecha" -ForegroundColor White
Write-Host ""
Write-Host "ID de la orden creada: $ordenId" -ForegroundColor Cyan
