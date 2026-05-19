# Test: Crear Presupuesto
# Endpoint: POST /api/contabilidad/presupuestos
# Descripción: Prueba la creación de un presupuesto por centro de costo, cuenta y período

$baseUrl = "http://localhost:3000/api"

Write-Host "=== TEST: CREAR PRESUPUESTO ===" -ForegroundColor Cyan
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
        Write-Host "  Nombre: $($centrosCosto.data[0].nombre)" -ForegroundColor Gray
    } else {
        Write-Host "⚠ No hay centros de costo. Creando uno..." -ForegroundColor Yellow

        $nuevoCentro = @{
            codigo = "CC-TEST-001"
            nombre = "Centro de Costo Test"
            descripcion = "Centro de costo para pruebas"
            activo = $true
        } | ConvertTo-Json

        $centroCreado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/centros-costo" -Method Post -Body $nuevoCentro -Headers $headers
        $centroCostoId = $centroCreado.data.id
        Write-Host "✓ Centro de costo creado: $centroCostoId" -ForegroundColor Green
    }
    Write-Host ""
} catch {
    Write-Host "✗ Error obteniendo centros de costo: $_" -ForegroundColor Red
    Write-Host "  Detalles: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    exit 1
}

# 3. Obtener una cuenta contable existente
Write-Host "3. Obteniendo cuentas contables..." -ForegroundColor Yellow
try {
    $cuentas = Invoke-RestMethod -Uri "$baseUrl/contabilidad/plan-cuentas" -Method Get -Headers $headers

    if ($cuentas.data -and $cuentas.data.Count -gt 0) {
        # Buscar una cuenta de gastos (clase 9)
        $cuentaGasto = $cuentas.data | Where-Object { $_.codigo -like "9*" } | Select-Object -First 1

        if ($cuentaGasto) {
            $cuentaId = $cuentaGasto.id
            Write-Host "✓ Cuenta contable encontrada: $cuentaId" -ForegroundColor Green
            Write-Host "  Código: $($cuentaGasto.codigo)" -ForegroundColor Gray
            Write-Host "  Nombre: $($cuentaGasto.nombre)" -ForegroundColor Gray
        } else {
            $cuentaId = $cuentas.data[0].id
            Write-Host "✓ Cuenta contable encontrada: $cuentaId" -ForegroundColor Green
            Write-Host "  Código: $($cuentas.data[0].codigo)" -ForegroundColor Gray
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

# 4. Obtener o crear un período contable
Write-Host "4. Obteniendo períodos contables..." -ForegroundColor Yellow
try {
    $periodos = Invoke-RestMethod -Uri "$baseUrl/contabilidad/periodos" -Method Get -Headers $headers

    if ($periodos.data -and $periodos.data.Count -gt 0) {
        # Buscar un período abierto
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
    } else {
        Write-Host "⚠ No hay períodos. Creando uno..." -ForegroundColor Yellow

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

# 5. Crear presupuesto
Write-Host "5. Creando presupuesto..." -ForegroundColor Yellow
$presupuestoBody = @{
    centro_costo_id = $centroCostoId
    cuenta_id = $cuentaId
    periodo_contable_id = $periodoId
    monto_presupuestado = 50000.00
    notas = "Presupuesto de prueba creado desde test automatizado"
    estado = "ACTIVO"
} | ConvertTo-Json

Write-Host "  Request Body:" -ForegroundColor Gray
Write-Host $presupuestoBody -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" -Method Post -Body $presupuestoBody -Headers $headers

    Write-Host "✓ Presupuesto creado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "=== RESPUESTA ===" -ForegroundColor Cyan
    Write-Host "Success: $($response.success)" -ForegroundColor White
    Write-Host "Message: $($response.message)" -ForegroundColor White
    Write-Host ""
    Write-Host "=== DATOS DEL PRESUPUESTO ===" -ForegroundColor Cyan
    Write-Host "ID: $($response.data.id)" -ForegroundColor White
    Write-Host "Centro de Costo ID: $($response.data.centro_costo_id)" -ForegroundColor White
    Write-Host "Cuenta ID: $($response.data.cuenta_id)" -ForegroundColor White
    Write-Host "Período ID: $($response.data.periodo_contable_id)" -ForegroundColor White
    Write-Host "Monto Presupuestado: S/ $($response.data.monto_presupuestado)" -ForegroundColor White
    Write-Host "Monto Ejecutado: S/ $($response.data.monto_ejecutado)" -ForegroundColor White
    Write-Host "Monto Comprometido: S/ $($response.data.monto_comprometido)" -ForegroundColor White
    Write-Host "Monto Disponible: S/ $($response.data.monto_disponible)" -ForegroundColor White
    Write-Host "Porcentaje Ejecutado: $($response.data.porcentaje_ejecutado)%" -ForegroundColor White
    Write-Host "Estado: $($response.data.estado)" -ForegroundColor White
    Write-Host "Notas: $($response.data.notas)" -ForegroundColor White
    Write-Host "Creado: $($response.data.created_at)" -ForegroundColor White
    Write-Host ""

    # Validaciones
    Write-Host "=== VALIDACIONES ===" -ForegroundColor Cyan

    $validaciones = @()

    if ($response.data.monto_presupuestado -eq 50000.00) {
        Write-Host "✓ Monto presupuestado correcto" -ForegroundColor Green
        $validaciones += $true
    } else {
        Write-Host "✗ Monto presupuestado incorrecto" -ForegroundColor Red
        $validaciones += $false
    }

    if ($response.data.monto_ejecutado -eq 0) {
        Write-Host "✓ Monto ejecutado inicializado en 0" -ForegroundColor Green
        $validaciones += $true
    } else {
        Write-Host "✗ Monto ejecutado no está en 0" -ForegroundColor Red
        $validaciones += $false
    }

    if ($response.data.monto_disponible -eq 50000.00) {
        Write-Host "✓ Monto disponible calculado correctamente" -ForegroundColor Green
        $validaciones += $true
    } else {
        Write-Host "✗ Monto disponible incorrecto" -ForegroundColor Red
        $validaciones += $false
    }

    if ($response.data.porcentaje_ejecutado -eq 0) {
        Write-Host "✓ Porcentaje ejecutado inicializado en 0%" -ForegroundColor Green
        $validaciones += $true
    } else {
        Write-Host "✗ Porcentaje ejecutado no está en 0%" -ForegroundColor Red
        $validaciones += $false
    }

    if ($response.data.estado -eq "ACTIVO") {
        Write-Host "✓ Estado correcto (ACTIVO)" -ForegroundColor Green
        $validaciones += $true
    } else {
        Write-Host "✗ Estado incorrecto" -ForegroundColor Red
        $validaciones += $false
    }

    Write-Host ""

    if ($validaciones -contains $false) {
        Write-Host "=== TEST FALLIDO ===" -ForegroundColor Red
        exit 1
    } else {
        Write-Host "=== TEST EXITOSO ===" -ForegroundColor Green
    }

} catch {
    Write-Host "✗ Error creando presupuesto" -ForegroundColor Red
    Write-Host "  Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "  Mensaje: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        Write-Host "  Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "=== TEST FALLIDO ===" -ForegroundColor Red
    exit 1
}

# 6. Intentar crear presupuesto duplicado (debe fallar)
Write-Host ""
Write-Host "6. Probando validación de duplicados..." -ForegroundColor Yellow
try {
    $responseDuplicado = Invoke-RestMethod -Uri "$baseUrl/contabilidad/presupuestos" -Method Post -Body $presupuestoBody -Headers $headers
    Write-Host "✗ ERROR: Se permitió crear un presupuesto duplicado" -ForegroundColor Red
    Write-Host "=== TEST FALLIDO ===" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "✓ Validación de duplicados funciona correctamente" -ForegroundColor Green
        Write-Host "  Se rechazó correctamente el presupuesto duplicado" -ForegroundColor Gray
    } else {
        Write-Host "✗ Error inesperado: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "=== TODOS LOS TESTS PASARON ===" -ForegroundColor Green
