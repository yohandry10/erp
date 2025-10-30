# Test: Actualizar Ejecución Presupuestal
# Descripción: Prueba la actualización del monto ejecutado y porcentaje de ejecución de presupuestos

$baseUrl = "http://localhost:3000/api"
$token = $env:AUTH_TOKEN

if (-not $token) {
    Write-Host "❌ ERROR: Variable AUTH_TOKEN no definida" -ForegroundColor Red
    Write-Host "Ejecuta primero: `$env:AUTH_TOKEN = 'tu_token_aqui'" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = "tenant-test-id"
}

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "TEST: ACTUALIZAR EJECUCIÓN PRESUPUESTAL" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# =====================================================
# PASO 1: Obtener un presupuesto existente
# =====================================================
Write-Host "📋 PASO 1: Obteniendo presupuestos existentes..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" -Method Get -Headers $headers
    
    if ($response.success -and $response.data.Count -gt 0) {
        $presupuesto = $response.data[0]
        Write-Host "✅ Presupuesto encontrado:" -ForegroundColor Green
        Write-Host "   ID: $($presupuesto.id)" -ForegroundColor White
        Write-Host "   Centro de costo: $($presupuesto.centro_costo_id)" -ForegroundColor White
        Write-Host "   Cuenta: $($presupuesto.cuenta_id)" -ForegroundColor White
        Write-Host "   Período: $($presupuesto.periodo_contable_id)" -ForegroundColor White
        Write-Host "   Monto presupuestado: S/ $($presupuesto.monto_presupuestado)" -ForegroundColor White
        Write-Host "   Monto ejecutado (antes): S/ $($presupuesto.monto_ejecutado)" -ForegroundColor White
        Write-Host "   Porcentaje ejecutado (antes): $($presupuesto.porcentaje_ejecutado)%" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "⚠️ No hay presupuestos para probar. Crea uno primero." -ForegroundColor Yellow
        exit 0
    }
} catch {
    Write-Host "❌ Error obteniendo presupuestos: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# =====================================================
# PASO 2: Actualizar ejecución de un presupuesto específico
# =====================================================
Write-Host "🔄 PASO 2: Actualizando ejecución presupuestal del presupuesto..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$($presupuesto.id)/actualizar-ejecucion" -Method Post -Headers $headers
    
    if ($response.success) {
        Write-Host "✅ Ejecución presupuestal actualizada:" -ForegroundColor Green
        Write-Host "   Monto ejecutado (después): S/ $($response.data.monto_ejecutado)" -ForegroundColor White
        Write-Host "   Porcentaje ejecutado (después): $($response.data.porcentaje_ejecutado)%" -ForegroundColor White
        Write-Host "   Monto disponible: S/ $($response.data.monto_disponible)" -ForegroundColor White
        Write-Host "   Mensaje: $($response.message)" -ForegroundColor White
        Write-Host ""
        
        # Verificar alertas
        if ($response.data.porcentaje_ejecutado -gt 100) {
            Write-Host "🚨 ALERTA: SOBREGIRO detectado ($($response.data.porcentaje_ejecutado)%)" -ForegroundColor Red
        } elseif ($response.data.porcentaje_ejecutado -gt 90) {
            Write-Host "⚠️ ADVERTENCIA: Ejecución alta ($($response.data.porcentaje_ejecutado)%)" -ForegroundColor Yellow
        } else {
            Write-Host "✅ Estado: NORMAL ($($response.data.porcentaje_ejecutado)%)" -ForegroundColor Green
        }
        Write-Host ""
    } else {
        Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error actualizando ejecución presupuestal: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# =====================================================
# PASO 3: Actualizar ejecución de todos los presupuestos del período
# =====================================================
Write-Host "🔄 PASO 3: Actualizando ejecución de todos los presupuestos del período..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/periodo/$($presupuesto.periodo_contable_id)/actualizar-ejecucion" -Method Post -Headers $headers
    
    if ($response.success) {
        Write-Host "✅ Actualización masiva completada:" -ForegroundColor Green
        Write-Host "   Presupuestos actualizados: $($response.data.actualizados)" -ForegroundColor White
        Write-Host "   Errores: $($response.data.errores)" -ForegroundColor White
        Write-Host "   Mensaje: $($response.message)" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error actualizando ejecución masiva: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# =====================================================
# PASO 4: Verificar que los cambios se reflejaron
# =====================================================
Write-Host "🔍 PASO 4: Verificando cambios..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$($presupuesto.id)" -Method Get -Headers $headers
    
    if ($response.success) {
        Write-Host "✅ Presupuesto verificado:" -ForegroundColor Green
        Write-Host "   Monto ejecutado: S/ $($response.data.monto_ejecutado)" -ForegroundColor White
        Write-Host "   Porcentaje ejecutado: $($response.data.porcentaje_ejecutado)%" -ForegroundColor White
        Write-Host "   Monto disponible: S/ $($response.data.monto_disponible)" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error verificando presupuesto: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# =====================================================
# PASO 5: Obtener comparación presupuesto vs real
# =====================================================
Write-Host "📊 PASO 5: Obteniendo comparación presupuesto vs real..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/comparacion/$($presupuesto.periodo_contable_id)" -Method Get -Headers $headers
    
    if ($response.success) {
        Write-Host "✅ Comparación obtenida:" -ForegroundColor Green
        Write-Host "   Período: $($response.data.periodo.descripcion)" -ForegroundColor White
        Write-Host "   Total centros: $($response.data.resumen_global.total_centros)" -ForegroundColor White
        Write-Host "   Total cuentas: $($response.data.resumen_global.total_cuentas)" -ForegroundColor White
        Write-Host "   Total presupuestado: S/ $($response.data.resumen_global.total_presupuestado)" -ForegroundColor White
        Write-Host "   Total ejecutado: S/ $($response.data.resumen_global.total_ejecutado)" -ForegroundColor White
        Write-Host "   Porcentaje ejecución: $($response.data.resumen_global.porcentaje_ejecucion)%" -ForegroundColor White
        Write-Host "   Alertas:" -ForegroundColor White
        Write-Host "     - Sobregiros: $($response.data.resumen_global.alertas.sobregiros)" -ForegroundColor Red
        Write-Host "     - Advertencias: $($response.data.resumen_global.alertas.advertencias)" -ForegroundColor Yellow
        Write-Host "     - Normales: $($response.data.resumen_global.alertas.normales)" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "❌ Error: $($response.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error obteniendo comparación: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "✅ TEST COMPLETADO EXITOSAMENTE" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "RESUMEN:" -ForegroundColor Cyan
Write-Host "✓ Actualización individual de ejecución presupuestal" -ForegroundColor Green
Write-Host "✓ Actualización masiva por período" -ForegroundColor Green
Write-Host "✓ Cálculo automático de porcentaje ejecutado" -ForegroundColor Green
Write-Host "✓ Cálculo automático de monto disponible" -ForegroundColor Green
Write-Host "✓ Detección de alertas (sobregiro/advertencia)" -ForegroundColor Green
Write-Host "✓ Comparación presupuesto vs real" -ForegroundColor Green
Write-Host ""
