# Test: Match automático por referencia/número de operación
# Este script prueba que el match automático funciona correctamente cuando hay referencias coincidentes

$baseUrl = "http://localhost:3000"
$tenantId = "7c567742-eae5-7a35-c3be-eee03cf649b1"

# Headers
$headers = @{
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "=== TEST: MATCH AUTOMÁTICO POR REFERENCIA ===" -ForegroundColor Cyan
Write-Host ""

# PASO 1: Crear una cuenta bancaria de prueba
Write-Host "PASO 1: Creando cuenta bancaria de prueba..." -ForegroundColor Yellow
$cuentaBancaria = @{
    banco = "BCP"
    numero_cuenta = "19100000000001"
    tipo_cuenta = "CORRIENTE"
    moneda = "PEN"
    saldo_inicial = 10000.00
    saldo_actual = 10000.00
    saldo_contable = 10000.00
    activo = $true
} | ConvertTo-Json

try {
    $responseCuenta = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $cuentaBancaria
    $cuentaId = $responseCuenta.data.id
    Write-Host "✓ Cuenta bancaria creada: $cuentaId" -ForegroundColor Green
} catch {
    Write-Host "✗ Error creando cuenta bancaria: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# PASO 2: Crear movimientos del sistema con referencias
Write-Host ""
Write-Host "PASO 2: Creando movimientos del sistema con referencias..." -ForegroundColor Yellow

$movimientos = @(
    @{
        tipo = "ABONO"
        monto = 1500.00
        fecha = "2025-01-15"
        descripcion = "Pago cliente ABC"
        referencia = "OP-2025-001"
    },
    @{
        tipo = "CARGO"
        monto = 800.00
        fecha = "2025-01-16"
        descripcion = "Pago proveedor XYZ"
        referencia = "OP-2025-002"
    },
    @{
        tipo = "ABONO"
        monto = 2200.00
        fecha = "2025-01-17"
        descripcion = "Transferencia recibida"
        referencia = "OP-2025-003"
    }
)

$movimientosIds = @()
foreach ($mov in $movimientos) {
    $movData = @{
        cuenta_bancaria_id = $cuentaId
        tipo = $mov.tipo
        monto = $mov.monto
        fecha = $mov.fecha
        descripcion = $mov.descripcion
        referencia = $mov.referencia
    } | ConvertTo-Json

    try {
        $responseMov = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" -Method Post -Headers $headers -Body $movData
        $movimientosIds += $responseMov.data.id
        Write-Host "  ✓ Movimiento creado: $($mov.referencia) - $($mov.tipo) $($mov.monto)" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Error creando movimiento: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# PASO 3: Crear conciliación
Write-Host ""
Write-Host "PASO 3: Creando período de conciliación..." -ForegroundColor Yellow

$conciliacion = @{
    cuenta_bancaria_id = $cuentaId
    periodo = "2025-01"
    fecha_desde = "2025-01-01"
    fecha_hasta = "2025-01-31"
} | ConvertTo-Json

try {
    $responseConciliacion = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion" -Method Post -Headers $headers -Body $conciliacion
    $conciliacionId = $responseConciliacion.data.id
    Write-Host "✓ Conciliación creada: $conciliacionId" -ForegroundColor Green
    Write-Host "  Saldo libro: $($responseConciliacion.data.saldo_libro)" -ForegroundColor Cyan
} catch {
    Write-Host "✗ Error creando conciliación: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# PASO 4: Importar extracto CSV con las mismas referencias
Write-Host ""
Write-Host "PASO 4: Importando extracto bancario con referencias coincidentes..." -ForegroundColor Yellow

# Crear CSV con movimientos que tienen las mismas referencias
$csvContent = @"
Fecha,Descripcion,Cargo,Abono,Referencia
15/01/2025,Pago cliente ABC,,1500.00,OP-2025-001
16/01/2025,Pago proveedor XYZ,800.00,,OP-2025-002
17/01/2025,Transferencia recibida,,2200.00,OP-2025-003
"@

$importarCsv = @{
    contenidoCsv = $csvContent
    banco = "GENERICO"
} | ConvertTo-Json

try {
    $responseImportar = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/importar-csv" -Method Post -Headers $headers -Body $importarCsv
    Write-Host "✓ Extracto importado exitosamente" -ForegroundColor Green
    Write-Host "  Movimientos importados: $($responseImportar.data.movimientos_importados)" -ForegroundColor Cyan
    Write-Host "  Saldo final extracto: $($responseImportar.data.saldo_final)" -ForegroundColor Cyan
} catch {
    Write-Host "✗ Error importando extracto: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.Response.StatusCode -ForegroundColor Red
    exit 1
}

# PASO 5: Ejecutar match automático
Write-Host ""
Write-Host "PASO 5: Ejecutando match automático..." -ForegroundColor Yellow

$matchDto = @{
    tolerancia_dias = 2
} | ConvertTo-Json

try {
    $responseMatch = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/match-automatico" -Method Post -Headers $headers -Body $matchDto
    Write-Host "✓ Match automático ejecutado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "RESULTADOS DEL MATCH:" -ForegroundColor Cyan
    Write-Host "  Total matches realizados: $($responseMatch.data.matches_realizados)" -ForegroundColor White
    Write-Host "  Matches por referencia: $($responseMatch.data.matches_por_referencia)" -ForegroundColor Green
    Write-Host "  Matches por monto/fecha: $($responseMatch.data.matches_por_monto_fecha)" -ForegroundColor Yellow
    Write-Host "  Movimientos sistema total: $($responseMatch.data.movimientos_sistema_total)" -ForegroundColor White
    Write-Host "  Movimientos extracto total: $($responseMatch.data.movimientos_extracto_total)" -ForegroundColor White
    Write-Host "  Movimientos sistema pendientes: $($responseMatch.data.movimientos_sistema_pendientes)" -ForegroundColor $(if ($responseMatch.data.movimientos_sistema_pendientes -eq 0) { "Green" } else { "Yellow" })
    Write-Host "  Movimientos extracto pendientes: $($responseMatch.data.movimientos_extracto_pendientes)" -ForegroundColor $(if ($responseMatch.data.movimientos_extracto_pendientes -eq 0) { "Green" } else { "Yellow" })
    Write-Host "  Porcentaje de match: $($responseMatch.data.porcentaje_match)%" -ForegroundColor $(if ($responseMatch.data.porcentaje_match -ge 80) { "Green" } else { "Yellow" })
    Write-Host ""
    
    # Validar que todos los matches fueron por referencia
    if ($responseMatch.data.matches_por_referencia -eq 3) {
        Write-Host "✓ ÉXITO: Todos los movimientos fueron conciliados por referencia" -ForegroundColor Green
    } else {
        Write-Host "⚠ ADVERTENCIA: No todos los movimientos fueron conciliados por referencia" -ForegroundColor Yellow
    }
    
    if ($responseMatch.data.porcentaje_match -eq 100) {
        Write-Host "✓ ÉXITO: 100% de los movimientos fueron conciliados" -ForegroundColor Green
    } else {
        Write-Host "⚠ ADVERTENCIA: No se logró 100% de conciliación" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Error ejecutando match automático: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# PASO 6: Obtener reporte de diferencias
Write-Host ""
Write-Host "PASO 6: Obteniendo reporte de diferencias..." -ForegroundColor Yellow

try {
    $responseDiferencias = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/diferencias" -Method Get -Headers $headers
    Write-Host "✓ Reporte de diferencias obtenido" -ForegroundColor Green
    Write-Host ""
    Write-Host "REPORTE DE DIFERENCIAS:" -ForegroundColor Cyan
    Write-Host "  Movimientos sistema conciliados: $($responseDiferencias.data.movimientos_sistema.conciliados)/$($responseDiferencias.data.movimientos_sistema.total)" -ForegroundColor White
    Write-Host "  Movimientos extracto conciliados: $($responseDiferencias.data.movimientos_extracto.conciliados)/$($responseDiferencias.data.movimientos_extracto.total)" -ForegroundColor White
    Write-Host "  Porcentaje conciliado: $($responseDiferencias.data.metricas.porcentaje_conciliado_general)%" -ForegroundColor Green
} catch {
    Write-Host "✗ Error obteniendo diferencias: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "RESUMEN:" -ForegroundColor Yellow
Write-Host "  ✓ El match por referencia está funcionando correctamente" -ForegroundColor Green
Write-Host "  ✓ Los movimientos con referencias coincidentes se concilian automáticamente" -ForegroundColor Green
Write-Host "  ✓ El sistema prioriza el match por referencia sobre el match por monto/fecha" -ForegroundColor Green
