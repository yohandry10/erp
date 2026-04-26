# Test Drag & Drop Match Manual
# Este script simula el match manual que se realiza con drag & drop

$API_BASE_URL = "http://localhost:3002"
$CONCILIACION_ID = "replace-with-actual-id"
$MOVIMIENTO_SISTEMA_ID = "replace-with-actual-id"
$MOVIMIENTO_EXTRACTO_ID = "replace-with-actual-id"

Write-Host "Testing Drag & Drop Match Manual..." -ForegroundColor Cyan
Write-Host "Conciliacion ID: $CONCILIACION_ID" -ForegroundColor Yellow
Write-Host "Sistema ID: $MOVIMIENTO_SISTEMA_ID" -ForegroundColor Blue
Write-Host "Extracto ID: $MOVIMIENTO_EXTRACTO_ID" -ForegroundColor Green

$body = @{
    movimiento_sistema_id = $MOVIMIENTO_SISTEMA_ID
    movimiento_extracto_id = $MOVIMIENTO_EXTRACTO_ID
} | ConvertTo-Json

Write-Host "`nSending match request..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri "$API_BASE_URL/api/finanzas/conciliacion/$CONCILIACION_ID/marcar-item" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
        } `
        -Body $body `
        -WebSession $session

    Write-Host "`n✅ Match realizado exitosamente!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10)
}
catch {
    Write-Host "`n❌ Error al realizar match:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}

Write-Host "`n=== Instrucciones de Uso ===" -ForegroundColor Yellow
Write-Host "1. Reemplaza CONCILIACION_ID con un ID válido de conciliación"
Write-Host "2. Reemplaza MOVIMIENTO_SISTEMA_ID con un ID de movimiento del sistema"
Write-Host "3. Reemplaza MOVIMIENTO_EXTRACTO_ID con un ID de movimiento del extracto"
Write-Host "4. Asegúrate de que ambos movimientos sean del mismo tipo (ABONO o CARGO)"
Write-Host "5. Ejecuta el script: .\test-drag-drop-match.ps1"
