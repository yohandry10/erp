# Test script para verificar el endpoint de eventos pendientes
# Este script prueba el endpoint GET /api/contabilidad/eventos/estadisticas

$API_URL = "http://localhost:3000"
$TOKEN = $env:AUTH_TOKEN

if (-not $TOKEN) {
    Write-Host "❌ Error: AUTH_TOKEN no está configurado" -ForegroundColor Red
    Write-Host "Por favor, ejecuta: `$env:AUTH_TOKEN = 'tu_token_aqui'" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type" = "application/json"
}

Write-Host "📊 Probando endpoint de estadísticas de eventos..." -ForegroundColor Cyan
Write-Host ""

try {
    # Test 1: Obtener estadísticas de eventos
    Write-Host "1️⃣ GET /api/contabilidad/eventos/estadisticas" -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "$API_URL/api/contabilidad/eventos/estadisticas" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "✅ Respuesta recibida:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 5)
    Write-Host ""

    # Verificar estructura de respuesta
    if ($response.success -and $response.data) {
        Write-Host "✅ Estructura de respuesta correcta" -ForegroundColor Green
        Write-Host "   - Eventos pendientes: $($response.data.pending)" -ForegroundColor Cyan
        Write-Host "   - Eventos procesados: $($response.data.processed)" -ForegroundColor Cyan
        Write-Host "   - Eventos fallidos: $($response.data.failed)" -ForegroundColor Cyan
        Write-Host "   - Eventos dead letter: $($response.data.dead_letter)" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️ Estructura de respuesta inesperada" -ForegroundColor Yellow
    }
    Write-Host ""

    # Test 2: Obtener eventos fallidos
    Write-Host "2️⃣ GET /api/contabilidad/eventos/fallidos" -ForegroundColor Yellow
    $response2 = Invoke-RestMethod -Uri "$API_URL/api/contabilidad/eventos/fallidos?limit=10" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "✅ Respuesta recibida:" -ForegroundColor Green
    Write-Host "   - Total eventos fallidos: $($response2.data.Count)" -ForegroundColor Cyan
    Write-Host ""

    # Test 3: Obtener eventos dead letter
    Write-Host "3️⃣ GET /api/contabilidad/eventos/dead-letter" -ForegroundColor Yellow
    $response3 = Invoke-RestMethod -Uri "$API_URL/api/contabilidad/eventos/dead-letter?limit=10" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "✅ Respuesta recibida:" -ForegroundColor Green
    Write-Host "   - Total eventos dead letter: $($response3.data.Count)" -ForegroundColor Cyan
    Write-Host ""

    # Test 4: Obtener estadísticas de eventos fallidos
    Write-Host "4️⃣ GET /api/contabilidad/eventos/estadisticas-fallidos" -ForegroundColor Yellow
    $response4 = Invoke-RestMethod -Uri "$API_URL/api/contabilidad/eventos/estadisticas-fallidos" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "✅ Respuesta recibida:" -ForegroundColor Green
    Write-Host ($response4 | ConvertTo-Json -Depth 5)
    Write-Host ""

    Write-Host "✅ TODOS LOS TESTS PASARON" -ForegroundColor Green

} catch {
    Write-Host "❌ Error en la prueba:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
    exit 1
}
