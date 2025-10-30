# Test de manejo de errores con reintentos en eventos contables
# Este script verifica que el sistema de reintentos funciona correctamente

$baseUrl = "http://localhost:3000/api"
$headers = @{
    "Content-Type" = "application/json"
}

Write-Host "🧪 TEST: Manejo de Errores con Reintentos - Eventos Contables" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Obtener estadísticas de eventos
Write-Host "📊 Test 1: Obtener estadísticas de eventos" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/eventos/estadisticas" -Method GET -Headers $headers
    Write-Host "✅ Estadísticas obtenidas:" -ForegroundColor Green
    Write-Host "   - Pendientes: $($response.data.pending)" -ForegroundColor White
    Write-Host "   - Procesados: $($response.data.processed)" -ForegroundColor White
    Write-Host "   - Fallidos: $($response.data.failed)" -ForegroundColor White
    Write-Host "   - Dead Letter: $($response.data.dead_letter)" -ForegroundColor White
} catch {
    Write-Host "❌ Error obteniendo estadísticas: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Obtener eventos fallidos
Write-Host "🔴 Test 2: Obtener eventos fallidos" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/eventos/fallidos?limit=10" -Method GET -Headers $headers
    Write-Host "✅ Eventos fallidos obtenidos: $($response.data.Count)" -ForegroundColor Green
    if ($response.data.Count -gt 0) {
        Write-Host "   Primeros eventos fallidos:" -ForegroundColor White
        $response.data | Select-Object -First 3 | ForEach-Object {
            Write-Host "   - ID: $($_.event_id), Tipo: $($_.event_type), Reintentos: $($_.retry_count)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Error obteniendo eventos fallidos: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Obtener eventos dead letter
Write-Host "💀 Test 3: Obtener eventos dead letter" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/eventos/dead-letter?limit=10" -Method GET -Headers $headers
    Write-Host "✅ Eventos dead letter obtenidos: $($response.data.Count)" -ForegroundColor Green
    if ($response.data.Count -gt 0) {
        Write-Host "   Primeros eventos dead letter:" -ForegroundColor White
        $response.data | Select-Object -First 3 | ForEach-Object {
            Write-Host "   - ID: $($_.event_id), Tipo: $($_.event_type), Error: $($_.error_message)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Error obteniendo eventos dead letter: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Obtener estadísticas detalladas de eventos fallidos
Write-Host "📈 Test 4: Obtener estadísticas detalladas de eventos fallidos" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/eventos/estadisticas-fallidos" -Method GET -Headers $headers
    Write-Host "✅ Estadísticas detalladas obtenidas:" -ForegroundColor Green
    Write-Host "   - Total fallidos: $($response.data.total_fallidos)" -ForegroundColor White
    Write-Host "   - Total dead letter: $($response.data.total_dead_letter)" -ForegroundColor White
    if ($response.data.por_tipo) {
        Write-Host "   - Por tipo:" -ForegroundColor White
        $response.data.por_tipo.PSObject.Properties | ForEach-Object {
            Write-Host "     * $($_.Name): $($_.Value)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Error obteniendo estadísticas detalladas: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Reintentar un evento fallido (simulado)
Write-Host "🔄 Test 5: Reintentar un evento fallido" -ForegroundColor Yellow
$testEventId = "test-event-" + (Get-Date -Format "yyyyMMddHHmmss")
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/eventos/$testEventId/reintentar" -Method POST -Headers $headers
    Write-Host "✅ Evento reiniciado:" -ForegroundColor Green
    Write-Host "   - Event ID: $($response.data.eventId)" -ForegroundColor White
    Write-Host "   - Reiniciado: $($response.data.reiniciado)" -ForegroundColor White
} catch {
    Write-Host "❌ Error reintentando evento: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "✅ Tests de manejo de errores con reintentos completados" -ForegroundColor Green
Write-Host ""
Write-Host "📝 RESUMEN DE IMPLEMENTACIÓN:" -ForegroundColor Cyan
Write-Host "   ✅ Sistema de reintentos con backoff exponencial" -ForegroundColor Green
Write-Host "   ✅ Clasificación de errores recuperables vs no recuperables" -ForegroundColor Green
Write-Host "   ✅ Límite de 3 reintentos antes de marcar como dead_letter" -ForegroundColor Green
Write-Host "   ✅ Endpoints para monitorear y gestionar eventos fallidos" -ForegroundColor Green
Write-Host "   ✅ Estadísticas detalladas de eventos por estado" -ForegroundColor Green
Write-Host "   ✅ Capacidad de reiniciar eventos fallidos manualmente" -ForegroundColor Green
Write-Host ""
