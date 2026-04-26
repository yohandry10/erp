# Test GET /api/finanzas/conciliacion/:id/diferencias

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjQwMjE3Yy1hMzY3LTQ3YzAtYjU5Zi1lNzE5YzI5YzI5YjgiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwidGVuYW50X2lkIjoiNzc3Nzc3NzctNzc3Ny03Nzc3LTc3NzctNzc3Nzc3Nzc3Nzc3IiwiaWF0IjoxNzM0ODk2NTU3LCJleHAiOjE3MzQ5ODI5NTd9.Ql8Aq-Aq0Aq0Aq0Aq0Aq0Aq0Aq0Aq0Aq0Aq0Aq0Aq0"
$tenantId = "77777777-7777-7777-7777-777777777777"

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

Write-Host "`n=== TEST: GET /api/finanzas/conciliacion/:id/diferencias ===" -ForegroundColor Cyan

# Primero, obtener una conciliación existente
Write-Host "`n1. Obteniendo lista de conciliaciones..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion" -Method Get -Headers $headers
    
    if ($response.success -and $response.data.Count -gt 0) {
        $conciliacionId = $response.data[0].id
        Write-Host "✓ Conciliación encontrada: $conciliacionId" -ForegroundColor Green
        Write-Host "  Período: $($response.data[0].periodo)" -ForegroundColor Gray
        Write-Host "  Estado: $($response.data[0].estado)" -ForegroundColor Gray
        
        # Obtener reporte de diferencias
        Write-Host "`n2. Obteniendo reporte de diferencias..." -ForegroundColor Yellow
        $diferenciasResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/diferencias" -Method Get -Headers $headers
        
        if ($diferenciasResponse.success) {
            Write-Host "✓ Reporte de diferencias obtenido exitosamente" -ForegroundColor Green
            
            $reporte = $diferenciasResponse.data
            
            Write-Host "`n--- INFORMACIÓN DE LA CONCILIACIÓN ---" -ForegroundColor Cyan
            Write-Host "ID: $($reporte.conciliacion.id)"
            Write-Host "Período: $($reporte.conciliacion.periodo)"
            Write-Host "Estado: $($reporte.conciliacion.estado)"
            Write-Host "Fecha desde: $($reporte.conciliacion.fecha_desde)"
            Write-Host "Fecha hasta: $($reporte.conciliacion.fecha_hasta)"
            Write-Host "Banco: $($reporte.conciliacion.cuenta_bancaria.banco)"
            Write-Host "Cuenta: $($reporte.conciliacion.cuenta_bancaria.numero_cuenta)"
            
            Write-Host "`n--- SALDOS ---" -ForegroundColor Cyan
            Write-Host "Saldo según libros: $($reporte.saldos.saldo_libro)"
            Write-Host "Saldo según banco: $($reporte.saldos.saldo_banco)"
            Write-Host "Diferencia neta: $($reporte.saldos.diferencia_neta)" -ForegroundColor $(if ($reporte.saldos.diferencia_neta -eq 0) { "Green" } else { "Yellow" })
            
            Write-Host "`n--- MOVIMIENTOS DEL SISTEMA ---" -ForegroundColor Cyan
            Write-Host "Total: $($reporte.movimientos_sistema.total)"
            Write-Host "Conciliados: $($reporte.movimientos_sistema.conciliados)" -ForegroundColor Green
            Write-Host "Pendientes: $($reporte.movimientos_sistema.pendientes)" -ForegroundColor $(if ($reporte.movimientos_sistema.pendientes -eq 0) { "Green" } else { "Yellow" })
            Write-Host "Total abonos: $($reporte.movimientos_sistema.total_abonos)"
            Write-Host "Total cargos: $($reporte.movimientos_sistema.total_cargos)"
            
            if ($reporte.movimientos_sistema.pendientes -gt 0) {
                Write-Host "`nMovimientos pendientes del sistema:" -ForegroundColor Yellow
                foreach ($mov in $reporte.movimientos_sistema.pendientes_detalle) {
                    Write-Host "  - $($mov.fecha) | $($mov.tipo) | $($mov.monto) | $($mov.descripcion)" -ForegroundColor Gray
                }
            }
            
            Write-Host "`n--- MOVIMIENTOS DEL EXTRACTO ---" -ForegroundColor Cyan
            Write-Host "Total: $($reporte.movimientos_extracto.total)"
            Write-Host "Conciliados: $($reporte.movimientos_extracto.conciliados)" -ForegroundColor Green
            Write-Host "Pendientes: $($reporte.movimientos_extracto.pendientes)" -ForegroundColor $(if ($reporte.movimientos_extracto.pendientes -eq 0) { "Green" } else { "Yellow" })
            Write-Host "Total abonos: $($reporte.movimientos_extracto.total_abonos)"
            Write-Host "Total cargos: $($reporte.movimientos_extracto.total_cargos)"
            
            if ($reporte.movimientos_extracto.pendientes -gt 0) {
                Write-Host "`nMovimientos pendientes del extracto:" -ForegroundColor Yellow
                foreach ($mov in $reporte.movimientos_extracto.pendientes_detalle) {
                    Write-Host "  - $($mov.fecha) | $($mov.tipo) | $($mov.monto) | $($mov.descripcion)" -ForegroundColor Gray
                }
            }
            
            Write-Host "`n--- DIFERENCIAS ---" -ForegroundColor Cyan
            Write-Host "Diferencia en abonos: $($reporte.diferencias.abonos)" -ForegroundColor $(if ($reporte.diferencias.abonos -eq 0) { "Green" } else { "Yellow" })
            Write-Host "Diferencia en cargos: $($reporte.diferencias.cargos)" -ForegroundColor $(if ($reporte.diferencias.cargos -eq 0) { "Green" } else { "Yellow" })
            Write-Host "Diferencia neta: $($reporte.diferencias.neta)" -ForegroundColor $(if ($reporte.diferencias.neta -eq 0) { "Green" } else { "Yellow" })
            
            Write-Host "`n--- MÉTRICAS ---" -ForegroundColor Cyan
            Write-Host "% Conciliado (Sistema): $($reporte.metricas.porcentaje_conciliado_sistema)%"
            Write-Host "% Conciliado (Extracto): $($reporte.metricas.porcentaje_conciliado_extracto)%"
            Write-Host "% Conciliado (General): $($reporte.metricas.porcentaje_conciliado_general)%"
            
            Write-Host "`n✓ TEST EXITOSO" -ForegroundColor Green
        } else {
            Write-Host "✗ Error al obtener diferencias" -ForegroundColor Red
            Write-Host ($diferenciasResponse | ConvertTo-Json -Depth 10)
        }
    } else {
        Write-Host "⚠ No hay conciliaciones disponibles para probar" -ForegroundColor Yellow
        Write-Host "Crea una conciliación primero usando test-crear-conciliacion.ps1" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error en la prueba" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}

Write-Host "`n=== FIN DEL TEST ===" -ForegroundColor Cyan
