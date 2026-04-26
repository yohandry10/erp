# Test script for closing a bank reconciliation
# This script tests the close conciliation endpoint

$API_BASE_URL = "http://localhost:3002"
$TENANT_ID = "vierdes"

Write-Host "=== TEST: Cerrar Conciliación Bancaria ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get list of conciliations to find one to close
Write-Host "Step 1: Obteniendo lista de conciliaciones..." -ForegroundColor Yellow
$listResponse = Invoke-WebRequest -Uri "$API_BASE_URL/api/finanzas/conciliacion" `
    -Method GET `
    -Headers @{
        "Content-Type" = "application/json"
        "x-tenant-id" = $TENANT_ID
    } `
    -UseBasicParsing

$conciliaciones = ($listResponse.Content | ConvertFrom-Json).data

if ($conciliaciones.Count -eq 0) {
    Write-Host "❌ No hay conciliaciones disponibles para probar" -ForegroundColor Red
    exit 1
}

# Find an open or in-process conciliation
$conciliacion = $conciliaciones | Where-Object { $_.estado -ne "CERRADA" } | Select-Object -First 1

if (-not $conciliacion) {
    Write-Host "❌ No hay conciliaciones abiertas para cerrar" -ForegroundColor Red
    Write-Host "Conciliaciones disponibles:" -ForegroundColor Yellow
    $conciliaciones | ForEach-Object {
        Write-Host "  - ID: $($_.id), Estado: $($_.estado), Período: $($_.periodo)"
    }
    exit 1
}

$CONCILIACION_ID = $conciliacion.id

Write-Host "✓ Conciliación encontrada:" -ForegroundColor Green
Write-Host "  ID: $CONCILIACION_ID"
Write-Host "  Estado: $($conciliacion.estado)"
Write-Host "  Período: $($conciliacion.periodo)"
Write-Host "  Cuenta: $($conciliacion.cuentas_bancarias.banco) - $($conciliacion.cuentas_bancarias.numero_cuenta)"
Write-Host ""

# Step 2: Get differences report before closing
Write-Host "Step 2: Obteniendo reporte de diferencias..." -ForegroundColor Yellow
try {
    $diferenciasResponse = Invoke-WebRequest -Uri "$API_BASE_URL/api/finanzas/conciliacion/$CONCILIACION_ID/diferencias" `
        -Method GET `
        -Headers @{
            "Content-Type" = "application/json"
            "x-tenant-id" = $TENANT_ID
        } `
        -UseBasicParsing

    $reporte = ($diferenciasResponse.Content | ConvertFrom-Json).data

    Write-Host "✓ Reporte de diferencias obtenido:" -ForegroundColor Green
    Write-Host ""
    Write-Host "Saldos:" -ForegroundColor Cyan
    Write-Host "  Saldo Libro: $($reporte.saldos.saldo_libro)"
    Write-Host "  Saldo Banco: $($reporte.saldos.saldo_banco)"
    Write-Host "  Diferencia: $($reporte.saldos.diferencia_neta)"
    Write-Host ""
    Write-Host "Movimientos del Sistema:" -ForegroundColor Cyan
    Write-Host "  Total: $($reporte.movimientos_sistema.total)"
    Write-Host "  Conciliados: $($reporte.movimientos_sistema.conciliados)"
    Write-Host "  Pendientes: $($reporte.movimientos_sistema.pendientes)"
    Write-Host ""
    Write-Host "Movimientos del Extracto:" -ForegroundColor Cyan
    Write-Host "  Total: $($reporte.movimientos_extracto.total)"
    Write-Host "  Conciliados: $($reporte.movimientos_extracto.conciliados)"
    Write-Host "  Pendientes: $($reporte.movimientos_extracto.pendientes)"
    Write-Host ""
    Write-Host "Métricas:" -ForegroundColor Cyan
    Write-Host "  % Conciliado Sistema: $($reporte.metricas.porcentaje_conciliado_sistema)%"
    Write-Host "  % Conciliado Extracto: $($reporte.metricas.porcentaje_conciliado_extracto)%"
    Write-Host "  % Conciliado General: $($reporte.metricas.porcentaje_conciliado_general)%"
    Write-Host ""

    $hayPendientes = $reporte.movimientos_sistema.pendientes -gt 0 -or $reporte.movimientos_extracto.pendientes -gt 0

    if ($hayPendientes) {
        Write-Host "⚠️  Advertencia: Hay movimientos pendientes de conciliar" -ForegroundColor Yellow
        Write-Host ""
    }

} catch {
    Write-Host "❌ Error obteniendo reporte de diferencias: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Attempt to close the conciliation
Write-Host "Step 3: Intentando cerrar la conciliación..." -ForegroundColor Yellow

$cerrarBody = @{
    forzar_cierre = $false
} | ConvertTo-Json

try {
    $cerrarResponse = Invoke-WebRequest -Uri "$API_BASE_URL/api/finanzas/conciliacion/$CONCILIACION_ID/cerrar" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "x-tenant-id" = $TENANT_ID
        } `
        -Body $cerrarBody `
        -UseBasicParsing

    $resultado = ($cerrarResponse.Content | ConvertFrom-Json).data

    Write-Host "✓ Conciliación cerrada exitosamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Resultado:" -ForegroundColor Cyan
    Write-Host "  Estado: $($resultado.conciliacion.estado)"
    Write-Host "  Cerrado en: $($resultado.conciliacion.cerrado_at)"
    Write-Host "  Mensaje: $($resultado.mensaje)"
    Write-Host ""

    if ($resultado.reporte.forzado) {
        Write-Host "⚠️  Cierre forzado con movimientos pendientes" -ForegroundColor Yellow
    }

} catch {
    $errorResponse = $_.Exception.Response
    if ($errorResponse) {
        $reader = New-Object System.IO.StreamReader($errorResponse.GetResponseStream())
        $errorContent = $reader.ReadToEnd()
        $errorData = $errorContent | ConvertFrom-Json
        
        Write-Host "❌ Error al cerrar conciliación:" -ForegroundColor Red
        Write-Host $errorData.message
        Write-Host ""

        if ($hayPendientes) {
            Write-Host "Intentando forzar el cierre..." -ForegroundColor Yellow
            
            $forzarBody = @{
                forzar_cierre = $true
            } | ConvertTo-Json

            try {
                $forzarResponse = Invoke-WebRequest -Uri "$API_BASE_URL/api/finanzas/conciliacion/$CONCILIACION_ID/cerrar" `
                    -Method POST `
                    -Headers @{
                        "Content-Type" = "application/json"
                        "x-tenant-id" = $TENANT_ID
                    } `
                    -Body $forzarBody `
                    -UseBasicParsing

                $resultadoForzado = ($forzarResponse.Content | ConvertFrom-Json).data

                Write-Host "✓ Conciliación cerrada forzadamente!" -ForegroundColor Green
                Write-Host ""
                Write-Host "Resultado:" -ForegroundColor Cyan
                Write-Host "  Estado: $($resultadoForzado.conciliacion.estado)"
                Write-Host "  Cerrado en: $($resultadoForzado.conciliacion.cerrado_at)"
                Write-Host "  Mensaje: $($resultadoForzado.mensaje)"
                Write-Host ""
                Write-Host "⚠️  Cierre forzado - Movimientos pendientes quedaron sin conciliar" -ForegroundColor Yellow

            } catch {
                Write-Host "❌ Error al forzar cierre: $_" -ForegroundColor Red
                exit 1
            }
        }
    } else {
        Write-Host "❌ Error desconocido: $_" -ForegroundColor Red
        exit 1
    }
}

# Step 4: Verify the conciliation is closed
Write-Host ""
Write-Host "Step 4: Verificando estado final..." -ForegroundColor Yellow

try {
    $verifyResponse = Invoke-WebRequest -Uri "$API_BASE_URL/api/finanzas/conciliacion/$CONCILIACION_ID" `
        -Method GET `
        -Headers @{
            "Content-Type" = "application/json"
            "x-tenant-id" = $TENANT_ID
        } `
        -UseBasicParsing

    $conciliacionFinal = ($verifyResponse.Content | ConvertFrom-Json).data

    Write-Host "✓ Estado verificado:" -ForegroundColor Green
    Write-Host "  Estado: $($conciliacionFinal.estado)"
    Write-Host "  Cerrado en: $($conciliacionFinal.cerrado_at)"
    Write-Host "  Cerrado por: $($conciliacionFinal.cerrado_by)"
    Write-Host ""

    if ($conciliacionFinal.estado -eq "CERRADA") {
        Write-Host "✅ TEST EXITOSO: Conciliación cerrada correctamente" -ForegroundColor Green
    } else {
        Write-Host "❌ TEST FALLIDO: La conciliación no está cerrada" -ForegroundColor Red
        exit 1
    }

} catch {
    Write-Host "❌ Error verificando estado final: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== FIN DEL TEST ===" -ForegroundColor Cyan
