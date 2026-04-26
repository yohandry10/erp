# Test: Validar que no se permitan presupuestos duplicados
# Verifica que no se pueda crear un presupuesto con la misma combinación de centro + cuenta + período

$baseUrl = "http://localhost:3000/api"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjQwMzY2Zi1hNzY3LTRhNzAtYjU5Zi1lNzE5YzI5YzI5YjgiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwidGVuYW50X2lkIjoiNTU1NTU1NTUtNTU1NS01NTU1LTU1NTUtNTU1NTU1NTU1NTU1IiwiaWF0IjoxNzMwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.placeholder"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = "55555555-5555-5555-5555-555555555555"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: Validación de Presupuestos Duplicados" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Paso 1: Obtener un centro de costo existente
Write-Host "📋 Paso 1: Obteniendo centros de costo..." -ForegroundColor Yellow
try {
    $centrosResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo" -Method Get -Headers $headers
    
    if ($centrosResponse.Count -eq 0) {
        Write-Host "❌ No hay centros de costo disponibles. Creando uno..." -ForegroundColor Red
        
        $nuevoCentro = @{
            codigo = "CC-TEST-001"
            nombre = "Centro de Costo Test"
            descripcion = "Centro de costo para pruebas de presupuestos"
            activo = $true
        } | ConvertTo-Json
        
        $centroCreado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo" -Method Post -Headers $headers -Body $nuevoCentro
        $centroCostoId = $centroCreado.id
        Write-Host "✅ Centro de costo creado: $centroCostoId" -ForegroundColor Green
    } else {
        $centroCostoId = $centrosResponse[0].id
        Write-Host "✅ Centro de costo encontrado: $centroCostoId" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Error obteniendo centros de costo: $_" -ForegroundColor Red
    exit 1
}

# Paso 2: Obtener una cuenta contable existente
Write-Host "`n📋 Paso 2: Obteniendo cuentas contables..." -ForegroundColor Yellow
try {
    $cuentasResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/plan-cuentas" -Method Get -Headers $headers
    
    if ($cuentasResponse.Count -eq 0) {
        Write-Host "❌ No hay cuentas contables disponibles" -ForegroundColor Red
        exit 1
    }
    
    # Buscar una cuenta de gastos (tipo 9x)
    $cuentaGastos = $cuentasResponse | Where-Object { $_.codigo -like "94*" -or $_.codigo -like "95*" } | Select-Object -First 1
    
    if ($null -eq $cuentaGastos) {
        $cuentaId = $cuentasResponse[0].id
    } else {
        $cuentaId = $cuentaGastos.id
    }
    
    Write-Host "✅ Cuenta contable encontrada: $cuentaId" -ForegroundColor Green
} catch {
    Write-Host "❌ Error obteniendo cuentas contables: $_" -ForegroundColor Red
    exit 1
}

# Paso 3: Obtener un período contable existente
Write-Host "`n📋 Paso 3: Obteniendo períodos contables..." -ForegroundColor Yellow
try {
    $periodosResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Get -Headers $headers
    
    if ($periodosResponse.Count -eq 0) {
        Write-Host "❌ No hay períodos contables disponibles. Creando uno..." -ForegroundColor Red
        
        $nuevoPeriodo = @{
            anio = 2025
            mes = 1
        } | ConvertTo-Json
        
        $periodoCreado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Post -Headers $headers -Body $nuevoPeriodo
        $periodoId = $periodoCreado.id
        Write-Host "✅ Período contable creado: $periodoId (2025-01)" -ForegroundColor Green
    } else {
        # Buscar un período ABIERTO
        $periodoAbierto = $periodosResponse | Where-Object { $_.estado -eq "ABIERTO" } | Select-Object -First 1
        
        if ($null -eq $periodoAbierto) {
            Write-Host "❌ No hay períodos ABIERTOS disponibles" -ForegroundColor Red
            exit 1
        }
        
        $periodoId = $periodoAbierto.id
        Write-Host "✅ Período contable encontrado: $periodoId ($($periodoAbierto.anio)-$($periodoAbierto.mes))" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Error obteniendo períodos contables: $_" -ForegroundColor Red
    exit 1
}

# Paso 4: Crear el primer presupuesto
Write-Host "`n📋 Paso 4: Creando primer presupuesto..." -ForegroundColor Yellow
$presupuesto1 = @{
    centro_costo_id = $centroCostoId
    cuenta_id = $cuentaId
    periodo_contable_id = $periodoId
    monto_presupuestado = 10000.00
    notas = "Presupuesto original para prueba de duplicados"
    estado = "ACTIVO"
} | ConvertTo-Json

try {
    $presupuestoCreado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" -Method Post -Headers $headers -Body $presupuesto1
    Write-Host "✅ Primer presupuesto creado exitosamente" -ForegroundColor Green
    Write-Host "   ID: $($presupuestoCreado.id)" -ForegroundColor Gray
    Write-Host "   Centro: $centroCostoId" -ForegroundColor Gray
    Write-Host "   Cuenta: $cuentaId" -ForegroundColor Gray
    Write-Host "   Período: $periodoId" -ForegroundColor Gray
    Write-Host "   Monto: S/ $($presupuestoCreado.monto_presupuestado)" -ForegroundColor Gray
    
    $presupuestoId1 = $presupuestoCreado.id
} catch {
    Write-Host "❌ Error creando primer presupuesto: $_" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Red
    exit 1
}

# Paso 5: Intentar crear un presupuesto duplicado (debe fallar)
Write-Host "`n📋 Paso 5: Intentando crear presupuesto DUPLICADO (debe fallar)..." -ForegroundColor Yellow
$presupuesto2 = @{
    centro_costo_id = $centroCostoId
    cuenta_id = $cuentaId
    periodo_contable_id = $periodoId
    monto_presupuestado = 15000.00
    notas = "Intento de presupuesto duplicado"
    estado = "ACTIVO"
} | ConvertTo-Json

try {
    $presupuestoDuplicado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" -Method Post -Headers $headers -Body $presupuesto2
    Write-Host "❌ ERROR: Se permitió crear un presupuesto duplicado!" -ForegroundColor Red
    Write-Host "   ID duplicado: $($presupuestoDuplicado.id)" -ForegroundColor Red
    $testPassed = $false
} catch {
    $errorMessage = $_.Exception.Message
    
    if ($errorMessage -like "*Ya existe un presupuesto*" -or $errorMessage -like "*duplicado*" -or $errorMessage -like "*400*") {
        Write-Host "✅ CORRECTO: Se rechazó el presupuesto duplicado" -ForegroundColor Green
        Write-Host "   Mensaje de error: $errorMessage" -ForegroundColor Gray
        $testPassed = $true
    } else {
        Write-Host "❌ ERROR: Falló por razón incorrecta" -ForegroundColor Red
        Write-Host "   Mensaje: $errorMessage" -ForegroundColor Red
        $testPassed = $false
    }
}

# Paso 6: Verificar que solo existe un presupuesto
Write-Host "`n📋 Paso 6: Verificando que solo existe un presupuesto..." -ForegroundColor Yellow
try {
    $presupuestosExistentes = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos?centro_costo_id=$centroCostoId&cuenta_id=$cuentaId&periodo_contable_id=$periodoId" -Method Get -Headers $headers
    
    $count = $presupuestosExistentes.Count
    
    if ($count -eq 1) {
        Write-Host "✅ CORRECTO: Solo existe 1 presupuesto" -ForegroundColor Green
        Write-Host "   ID: $($presupuestosExistentes[0].id)" -ForegroundColor Gray
    } else {
        Write-Host "❌ ERROR: Se encontraron $count presupuestos (debería ser 1)" -ForegroundColor Red
        $testPassed = $false
    }
} catch {
    Write-Host "❌ Error verificando presupuestos: $_" -ForegroundColor Red
    $testPassed = $false
}

# Paso 7: Crear presupuesto con diferente cuenta (debe funcionar)
Write-Host "`n📋 Paso 7: Creando presupuesto con DIFERENTE cuenta (debe funcionar)..." -ForegroundColor Yellow

# Buscar otra cuenta diferente
$otraCuenta = $cuentasResponse | Where-Object { $_.id -ne $cuentaId } | Select-Object -First 1

if ($null -eq $otraCuenta) {
    Write-Host "⚠️ No hay otra cuenta disponible para probar" -ForegroundColor Yellow
} else {
    $presupuesto3 = @{
        centro_costo_id = $centroCostoId
        cuenta_id = $otraCuenta.id
        periodo_contable_id = $periodoId
        monto_presupuestado = 20000.00
        notas = "Presupuesto con diferente cuenta"
        estado = "ACTIVO"
    } | ConvertTo-Json
    
    try {
        $presupuestoOtraCuenta = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" -Method Post -Headers $headers -Body $presupuesto3
        Write-Host "✅ CORRECTO: Se permitió crear presupuesto con diferente cuenta" -ForegroundColor Green
        Write-Host "   ID: $($presupuestoOtraCuenta.id)" -ForegroundColor Gray
        Write-Host "   Cuenta diferente: $($otraCuenta.id)" -ForegroundColor Gray
        
        $presupuestoId3 = $presupuestoOtraCuenta.id
    } catch {
        Write-Host "❌ ERROR: No se permitió crear presupuesto con diferente cuenta" -ForegroundColor Red
        Write-Host "   Mensaje: $($_.Exception.Message)" -ForegroundColor Red
        $testPassed = $false
    }
}

# Limpieza: Eliminar presupuestos de prueba
Write-Host "`n📋 Limpieza: Eliminando presupuestos de prueba..." -ForegroundColor Yellow
try {
    if ($presupuestoId1) {
        Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$presupuestoId1" -Method Delete -Headers $headers | Out-Null
        Write-Host "✅ Presupuesto 1 eliminado" -ForegroundColor Green
    }
    
    if ($presupuestoId3) {
        Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$presupuestoId3" -Method Delete -Headers $headers | Out-Null
        Write-Host "✅ Presupuesto 3 eliminado" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Error en limpieza (no crítico): $_" -ForegroundColor Yellow
}

# Resultado final
Write-Host "`n========================================" -ForegroundColor Cyan
if ($testPassed) {
    Write-Host "✅ TEST PASADO: Validación de duplicados funciona correctamente" -ForegroundColor Green
} else {
    Write-Host "❌ TEST FALLIDO: La validación de duplicados tiene problemas" -ForegroundColor Red
}
Write-Host "========================================`n" -ForegroundColor Cyan
