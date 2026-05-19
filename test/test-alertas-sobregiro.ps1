# Test script para verificar endpoints de alertas de sobregiro presupuestal
# Ejecutar desde la raíz del proyecto

$baseUrl = "http://localhost:3001/api/contabilidad"
$token = "REPLACE_WITH_TEST_JWT" # Reemplazar con token válido
$tenantId = "00000000-0000-0000-0000-000000000001" # Reemplazar con tenant ID válido

Write-Host "🚨 Testing Alertas de Sobregiro Presupuestal" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Headers comunes
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

# Test 1: Obtener todas las alertas
Write-Host "📋 Test 1: Obtener todas las alertas de sobregiro" -ForegroundColor Yellow
Write-Host "GET $baseUrl/presupuestos/alertas" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/presupuestos/alertas" -Method Get -Headers $headers
    Write-Host "✅ Alertas obtenidas exitosamente" -ForegroundColor Green
    Write-Host "   Total alertas: $($response.data.Count)" -ForegroundColor White

    if ($response.data.Count -gt 0) {
        $sobregiros = ($response.data | Where-Object { $_.nivel_alerta -eq "SOBREGIRO" }).Count
        $advertencias = ($response.data | Where-Object { $_.nivel_alerta -eq "ADVERTENCIA" }).Count
        Write-Host "   Sobregiros: $sobregiros" -ForegroundColor Red
        Write-Host "   Advertencias: $advertencias" -ForegroundColor Yellow

        Write-Host ""
        Write-Host "   Primera alerta:" -ForegroundColor Cyan
        $primeraAlerta = $response.data[0]
        Write-Host "   - Nivel: $($primeraAlerta.nivel_alerta)" -ForegroundColor White
        Write-Host "   - Centro de costo: $($primeraAlerta.centro_costo.nombre)" -ForegroundColor White
        Write-Host "   - Cuenta: $($primeraAlerta.cuenta.codigo) - $($primeraAlerta.cuenta.nombre)" -ForegroundColor White
        Write-Host "   - Porcentaje ejecutado: $($primeraAlerta.porcentaje_ejecutado)%" -ForegroundColor White
        Write-Host "   - Mensaje: $($primeraAlerta.mensaje)" -ForegroundColor White
    } else {
        Write-Host "   ℹ️ No hay alertas activas" -ForegroundColor Blue
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Obtener resumen de alertas
Write-Host "📊 Test 2: Obtener resumen de alertas" -ForegroundColor Yellow
Write-Host "GET $baseUrl/presupuestos/alertas/resumen" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/presupuestos/alertas/resumen" -Method Get -Headers $headers
    Write-Host "✅ Resumen obtenido exitosamente" -ForegroundColor Green
    Write-Host "   Total alertas: $($response.data.total_alertas)" -ForegroundColor White
    Write-Host ""
    Write-Host "   Sobregiros:" -ForegroundColor Red
    Write-Host "   - Cantidad: $($response.data.sobregiros.cantidad)" -ForegroundColor White
    Write-Host "   - Total excedente: S/ $($response.data.sobregiros.total_excedente)" -ForegroundColor White
    Write-Host ""
    Write-Host "   Advertencias:" -ForegroundColor Yellow
    Write-Host "   - Cantidad: $($response.data.advertencias.cantidad)" -ForegroundColor White
    Write-Host "   - Total en riesgo: S/ $($response.data.advertencias.total_en_riesgo)" -ForegroundColor White
    Write-Host ""
    Write-Host "   Fecha generación: $($response.data.fecha_generacion)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Obtener alertas con filtro de período
Write-Host "📅 Test 3: Obtener alertas con filtro de período" -ForegroundColor Yellow
$periodoId = "00000000-0000-0000-0000-000000000001" # Reemplazar con período ID válido
Write-Host "GET $baseUrl/presupuestos/alertas?periodo_id=$periodoId" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/presupuestos/alertas?periodo_id=$periodoId" -Method Get -Headers $headers
    Write-Host "✅ Alertas filtradas obtenidas exitosamente" -ForegroundColor Green
    Write-Host "   Total alertas para el período: $($response.data.Count)" -ForegroundColor White
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "✅ Tests completados" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Notas:" -ForegroundColor Cyan
Write-Host "   - Las alertas se generan automáticamente cuando un presupuesto supera el 90% de ejecución" -ForegroundColor White
Write-Host "   - Los sobregiros se detectan cuando se supera el 100% del presupuesto" -ForegroundColor White
Write-Host "   - Para ver alertas, primero debe haber presupuestos creados y asientos contables registrados" -ForegroundColor White
Write-Host ""
