# Test: Actualizar Presupuesto
# Endpoint: PUT /api/contabilidad/presupuestos/:id

$baseUrl = "http://localhost:3000/api"
$token = "REPLACE_WITH_TEST_JWT"  # Reemplazar con token válido
$tenantId = "00000000-0000-0000-0000-000000000001"  # Reemplazar con tenant válido
$presupuestoId = "PRESUPUESTO_ID_AQUI"  # Reemplazar con ID de presupuesto existente

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "🧪 TEST: Actualizar Presupuesto" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# 1. Primero obtener el presupuesto actual
Write-Host "📋 1. Obteniendo presupuesto actual..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$presupuestoId" `
        -Method Get `
        -Headers $headers

    Write-Host "✅ Presupuesto obtenido:" -ForegroundColor Green
    Write-Host "   ID: $($response.data.id)"
    Write-Host "   Monto actual: S/ $($response.data.monto_presupuestado)"
    Write-Host "   Estado actual: $($response.data.estado)"
    Write-Host "   Notas actuales: $($response.data.notas)"
    Write-Host ""
} catch {
    Write-Host "❌ Error obteniendo presupuesto:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# 2. Actualizar el presupuesto
Write-Host "📝 2. Actualizando presupuesto..." -ForegroundColor Yellow

$updateData = @{
    monto_presupuestado = 75000.00
    notas = "Presupuesto ajustado - Incremento aprobado por gerencia"
    estado = "ACTIVO"
} | ConvertTo-Json

Write-Host "Datos a actualizar:"
Write-Host $updateData
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$presupuestoId" `
        -Method Put `
        -Headers $headers `
        -Body $updateData

    Write-Host "✅ Presupuesto actualizado exitosamente:" -ForegroundColor Green
    Write-Host "   ID: $($response.data.id)"
    Write-Host "   Nuevo monto: S/ $($response.data.monto_presupuestado)"
    Write-Host "   Nuevo estado: $($response.data.estado)"
    Write-Host "   Nuevas notas: $($response.data.notas)"
    Write-Host "   Actualizado por: $($response.data.updated_by)"
    Write-Host "   Fecha actualización: $($response.data.updated_at)"
    Write-Host ""
} catch {
    Write-Host "❌ Error actualizando presupuesto:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles:" -ForegroundColor Red
        Write-Host $_.ErrorDetails.Message
    }
    exit 1
}

# 3. Verificar la actualización
Write-Host "🔍 3. Verificando actualización..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$presupuestoId" `
        -Method Get `
        -Headers $headers

    Write-Host "✅ Verificación exitosa:" -ForegroundColor Green
    Write-Host "   Monto confirmado: S/ $($response.data.monto_presupuestado)"
    Write-Host "   Estado confirmado: $($response.data.estado)"
    Write-Host ""
} catch {
    Write-Host "❌ Error verificando actualización:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# 4. Test: Actualizar solo notas
Write-Host "📝 4. Test: Actualizar solo notas..." -ForegroundColor Yellow

$updateNotasData = @{
    notas = "Notas actualizadas - Solo cambio de comentario"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$presupuestoId" `
        -Method Put `
        -Headers $headers `
        -Body $updateNotasData

    Write-Host "✅ Notas actualizadas:" -ForegroundColor Green
    Write-Host "   Nuevas notas: $($response.data.notas)"
    Write-Host "   Monto sin cambios: S/ $($response.data.monto_presupuestado)"
    Write-Host ""
} catch {
    Write-Host "❌ Error actualizando notas:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# 5. Test: Intentar actualizar con monto inválido (debe fallar)
Write-Host "🚫 5. Test: Intentar actualizar con monto inválido (debe fallar)..." -ForegroundColor Yellow

$invalidData = @{
    monto_presupuestado = -1000.00
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$presupuestoId" `
        -Method Put `
        -Headers $headers `
        -Body $invalidData

    Write-Host "❌ ERROR: Debería haber rechazado el monto negativo" -ForegroundColor Red
    exit 1
} catch {
    Write-Host "✅ Validación correcta: Monto negativo rechazado" -ForegroundColor Green
    Write-Host "   Mensaje: $($_.Exception.Message)"
    Write-Host ""
}

Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ TODOS LOS TESTS PASARON" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
