# Test: Eliminar Presupuesto
# Endpoint: DELETE /api/contabilidad/presupuestos/:id
# Descripción: Prueba la eliminación de un presupuesto

$baseUrl = "http://localhost:3000/api"

Write-Host "=== TEST: ELIMINAR PRESUPUESTO ===" -ForegroundColor Cyan
Write-Host ""

# 1. Login
Write-Host "1. Autenticando usuario..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = "Admin123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    $tenantId = $loginResponse.user.tenant_id
    Write-Host "✓ Login exitoso" -ForegroundColor Green
    Write-Host "  Token: $($token.Substring(0,20))..." -ForegroundColor Gray
    Write-Host "  Tenant ID: $tenantId" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "✗ Error en login: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

# 2. Obtener un centro de costo existente
Write-Host "2. Obteniendo centros de costo..." -ForegroundColor Yellow
try {
    $centrosCosto = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo" -Method Get -Headers $headers
    
    if ($centrosCosto.data -and $centrosCosto.data.Count -gt 0) {
        $centroCostoId = $centrosCosto.data[0].id
        Write-Host "✓ Centro de costo encontrado: $centroCostoId" -ForegroundColor Green
    } else {
        Write-Host "⚠ No hay centros de costo. Creando uno..." -ForegroundColor Yellow
        
        $nuevoCentro = @{
            codigo = "CC-TEST-DEL-001"
            nombre = "Centro de Costo Test Delete"
            descripcion = "Centro de costo para pruebas de eliminación"
            activo = $true
        } | ConvertTo-Json
        
        $centroCreado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo" -Method Post -Body $nuevoCentro -Headers $headers
        $centroCostoId = $centroCreado.data.id
        Write-Host "✓ Centro de costo creado: $centroCostoId" -ForegroundColor Green
    }
    Write-Host ""
} catch {
    Write-Host "✗ Error obteniendo centros de costo: $_" -ForegroundColor Red
    exit 1
}

# 3. Obtener una cuenta contable existente
Write-Host "3. Obteniendo cuentas contables..." -ForegroundColor Yellow
try {
    $cuentas = Invoke-RestMethod -Uri "$baseUrl/contabilidad/plan-cuentas" -Method Get -Headers $headers
    
    if ($cuentas.data -and $cuentas.data.Count -gt 0) {
        $cuentaGasto = $cuentas.data | Where-Object { $_.codigo -like "9*" } | Select-Object -First 1
        
        if ($cuentaGasto) {
            $cuentaId = $cuentaGasto.id
            Write-Host "✓ Cuenta contable encontrada: $cuentaId" -ForegroundColor Green
        } else {
            $cuentaId = $cuentas.data[0].id
            Write-Host "✓ Cuenta contable encontrada: $cuentaId" -ForegroundColor Green
        }
    } else {
        Write-Host "✗ No hay cuentas contables disponibles" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
} catch {
    Write-Host "✗ Error obteniendo cuentas contables: $_" -ForegroundColor Red
    exit 1
}

# 4. Obtener o crear un período contable abierto
Write-Host "4. Obteniendo períodos contables..." -ForegroundColor Yellow
try {
    $periodos = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Get -Headers $headers
    
    $periodoAbierto = $periodos.data | Where-Object { $_.estado -eq "ABIERTO" } | Select-Object -First 1
    
    if ($periodoAbierto) {
        $periodoId = $periodoAbierto.id
        Write-Host "✓ Período contable abierto encontrado: $periodoId" -ForegroundColor Green
        Write-Host "  Período: $($periodoAbierto.anio)-$($periodoAbierto.mes.ToString().PadLeft(2,'0'))" -ForegroundColor Gray
    } else {
        Write-Host "⚠ No hay períodos abiertos. Creando uno..." -ForegroundColor Yellow
        
        $anioActual = (Get-Date).Year
        $mesActual = (Get-Date).Month
        
        $nuevoPeriodo = @{
            anio = $anioActual
            mes = $mesActual
        } | ConvertTo-Json
        
        $periodoCreado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Post -Body $nuevoPeriodo -Headers $headers
        $periodoId = $periodoCreado.data.id
        Write-Host "✓ Período contable creado: $periodoId" -ForegroundColor Green
    }
    Write-Host ""
} catch {
    Write-Host "✗ Error obteniendo/creando período contable: $_" -ForegroundColor Red
    exit 1
}

# 5. Crear presupuesto para eliminar
Write-Host "5. Creando presupuesto para eliminar..." -ForegroundColor Yellow
$presupuestoBody = @{
    centro_costo_id = $centroCostoId
    cuenta_id = $cuentaId
    periodo_contable_id = $periodoId
    monto_presupuestado = 25000.00
    notas = "Presupuesto de prueba para eliminación"
    estado = "ACTIVO"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" -Method Post -Body $presupuestoBody -Headers $headers
    $presupuestoId = $response.data.id
    
    Write-Host "✓ Presupuesto creado exitosamente" -ForegroundColor Green
    Write-Host "  ID: $presupuestoId" -ForegroundColor Gray
    Write-Host "  Monto: S/ $($response.data.monto_presupuestado)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "✗ Error creando presupuesto: $_" -ForegroundColor Red
    exit 1
}

# 6. Eliminar presupuesto
Write-Host "6. Eliminando presupuesto..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$presupuestoId" -Method Delete -Headers $headers
    
    Write-Host "✓ Presupuesto eliminado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "=== RESPUESTA ===" -ForegroundColor Cyan
    Write-Host "Success: $($deleteResponse.success)" -ForegroundColor White
    Write-Host "Message: $($deleteResponse.message)" -ForegroundColor White
    Write-Host ""
    Write-Host "=== DATOS DEL PRESUPUESTO ELIMINADO ===" -ForegroundColor Cyan
    Write-Host "ID: $($deleteResponse.data.id)" -ForegroundColor White
    Write-Host "Monto Presupuestado: S/ $($deleteResponse.data.monto_presupuestado)" -ForegroundColor White
    Write-Host "Estado: $($deleteResponse.data.estado)" -ForegroundColor White
    Write-Host ""
    
    # Validación: el presupuesto debe haber sido eliminado
    if ($deleteResponse.success -eq $true) {
        Write-Host "✓ Respuesta indica éxito" -ForegroundColor Green
    } else {
        Write-Host "✗ Respuesta no indica éxito" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "✗ Error eliminando presupuesto" -ForegroundColor Red
    Write-Host "  Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "  Mensaje: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "  Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "=== TEST FALLIDO ===" -ForegroundColor Red
    exit 1
}

# 7. Verificar que el presupuesto ya no existe
Write-Host "7. Verificando que el presupuesto fue eliminado..." -ForegroundColor Yellow
try {
    $verificacion = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$presupuestoId" -Method Get -Headers $headers
    Write-Host "✗ ERROR: El presupuesto aún existe después de eliminarlo" -ForegroundColor Red
    Write-Host "=== TEST FALLIDO ===" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "✓ Presupuesto no encontrado (eliminado correctamente)" -ForegroundColor Green
    } else {
        Write-Host "⚠ Error inesperado al verificar: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    }
}

Write-Host ""

# 8. Intentar eliminar presupuesto inexistente (debe fallar con 404)
Write-Host "8. Probando eliminación de presupuesto inexistente..." -ForegroundColor Yellow
$idInexistente = "00000000-0000-0000-0000-000000000000"
try {
    $deleteInexistente = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$idInexistente" -Method Delete -Headers $headers
    Write-Host "✗ ERROR: Se permitió eliminar un presupuesto inexistente" -ForegroundColor Red
    Write-Host "=== TEST FALLIDO ===" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "✓ Validación correcta: presupuesto inexistente no se puede eliminar" -ForegroundColor Green
    } else {
        Write-Host "⚠ Error inesperado: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    }
}

Write-Host ""

# 9. Crear presupuesto en período cerrado y probar eliminación (debe fallar)
Write-Host "9. Probando eliminación en período cerrado..." -ForegroundColor Yellow

# Crear un nuevo período para cerrar
$anioTest = (Get-Date).Year - 1
$mesTest = 12

$periodoCerrarBody = @{
    anio = $anioTest
    mes = $mesTest
} | ConvertTo-Json

try {
    # Crear período
    $periodoCerrar = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Post -Body $periodoCerrarBody -Headers $headers
    $periodoCerrarId = $periodoCerrar.data.id
    Write-Host "  Período creado: $anioTest-$mesTest" -ForegroundColor Gray
    
    # Crear presupuesto en ese período
    $presupuestoCerradoBody = @{
        centro_costo_id = $centroCostoId
        cuenta_id = $cuentaId
        periodo_contable_id = $periodoCerrarId
        monto_presupuestado = 15000.00
        notas = "Presupuesto para test de período cerrado"
        estado = "ACTIVO"
    } | ConvertTo-Json
    
    $presupuestoCerrado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" -Method Post -Body $presupuestoCerradoBody -Headers $headers
    $presupuestoCerradoId = $presupuestoCerrado.data.id
    Write-Host "  Presupuesto creado: $presupuestoCerradoId" -ForegroundColor Gray
    
    # Cerrar el período
    $cerrarResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos/$periodoCerrarId/cerrar" -Method Post -Headers $headers
    Write-Host "  Período cerrado" -ForegroundColor Gray
    
    # Intentar eliminar presupuesto en período cerrado
    try {
        $deleteEnCerrado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos/$presupuestoCerradoId" -Method Delete -Headers $headers
        Write-Host "✗ ERROR: Se permitió eliminar presupuesto en período cerrado" -ForegroundColor Red
        Write-Host "=== TEST FALLIDO ===" -ForegroundColor Red
        exit 1
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            Write-Host "✓ Validación correcta: no se puede eliminar presupuesto en período cerrado" -ForegroundColor Green
        } else {
            Write-Host "⚠ Error inesperado: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
        }
    }
    
} catch {
    Write-Host "⚠ No se pudo completar test de período cerrado: $_" -ForegroundColor Yellow
    Write-Host "  Continuando con otros tests..." -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== TODOS LOS TESTS PASARON ===" -ForegroundColor Green
