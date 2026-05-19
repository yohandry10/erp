# Test: Actualizar Cuenta Bancaria
# Endpoint: PUT /api/finanzas/bancos/cuentas/:id

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "d290f1ee-6c54-4b01-90e6-d701748f0851"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: ACTUALIZAR CUENTA BANCARIA" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Paso 1: Crear una cuenta bancaria de prueba
Write-Host "PASO 1: Crear cuenta bancaria de prueba..." -ForegroundColor Yellow

$crearBody = @{
    nombre = "Cuenta Test Actualizar"
    banco = "Banco de Prueba"
    numero_cuenta = "TEST-UPDATE-$(Get-Random -Minimum 1000 -Maximum 9999)"
    tipo_cuenta = "CORRIENTE"
    moneda = "PEN"
    saldo = 5000.00
    permite_sobregiro = $false
    activa = $true
} | ConvertTo-Json

try {
    $crearResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $crearBody
    Write-Host "✓ Cuenta creada exitosamente" -ForegroundColor Green
    Write-Host "  ID: $($crearResponse.data.id)" -ForegroundColor Gray
    Write-Host "  Nombre: $($crearResponse.data.nombre)" -ForegroundColor Gray
    Write-Host "  Banco: $($crearResponse.data.banco)" -ForegroundColor Gray
    Write-Host "  Número: $($crearResponse.data.numero_cuenta)" -ForegroundColor Gray
    Write-Host "  Tipo: $($crearResponse.data.tipo_cuenta)" -ForegroundColor Gray
    Write-Host "  Saldo: $($crearResponse.data.saldo)" -ForegroundColor Gray

    $cuentaId = $crearResponse.data.id
} catch {
    Write-Host "✗ Error creando cuenta: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Paso 2: Actualizar la cuenta bancaria
Write-Host "`nPASO 2: Actualizar cuenta bancaria..." -ForegroundColor Yellow

$actualizarBody = @{
    nombre = "Cuenta Test Actualizada"
    banco = "Banco Actualizado"
    tipo_cuenta = "AHORROS"
    permite_sobregiro = $true
    activa = $true
} | ConvertTo-Json

try {
    $actualizarResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId" -Method Put -Headers $headers -Body $actualizarBody
    Write-Host "✓ Cuenta actualizada exitosamente" -ForegroundColor Green
    Write-Host "  ID: $($actualizarResponse.data.id)" -ForegroundColor Gray
    Write-Host "  Nombre: $($actualizarResponse.data.nombre)" -ForegroundColor Gray
    Write-Host "  Banco: $($actualizarResponse.data.banco)" -ForegroundColor Gray
    Write-Host "  Tipo: $($actualizarResponse.data.tipo_cuenta)" -ForegroundColor Gray
    Write-Host "  Permite Sobregiro: $($actualizarResponse.data.permite_sobregiro)" -ForegroundColor Gray
    Write-Host "  Activa: $($actualizarResponse.data.activa)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error actualizando cuenta: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Paso 3: Verificar que los cambios se aplicaron
Write-Host "`nPASO 3: Verificar cambios..." -ForegroundColor Yellow

try {
    $verificarResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId" -Method Get -Headers $headers
    Write-Host "✓ Cuenta obtenida para verificación" -ForegroundColor Green

    # Verificar cambios
    $cambiosCorrectos = $true

    if ($verificarResponse.data.nombre -ne "Cuenta Test Actualizada") {
        Write-Host "  ✗ Nombre no actualizado correctamente" -ForegroundColor Red
        $cambiosCorrectos = $false
    } else {
        Write-Host "  ✓ Nombre actualizado correctamente" -ForegroundColor Green
    }

    if ($verificarResponse.data.banco -ne "Banco Actualizado") {
        Write-Host "  ✗ Banco no actualizado correctamente" -ForegroundColor Red
        $cambiosCorrectos = $false
    } else {
        Write-Host "  ✓ Banco actualizado correctamente" -ForegroundColor Green
    }

    if ($verificarResponse.data.tipo_cuenta -ne "AHORROS") {
        Write-Host "  ✗ Tipo de cuenta no actualizado correctamente" -ForegroundColor Red
        $cambiosCorrectos = $false
    } else {
        Write-Host "  ✓ Tipo de cuenta actualizado correctamente" -ForegroundColor Green
    }

    if ($verificarResponse.data.permite_sobregiro -ne $true) {
        Write-Host "  ✗ Permite sobregiro no actualizado correctamente" -ForegroundColor Red
        $cambiosCorrectos = $false
    } else {
        Write-Host "  ✓ Permite sobregiro actualizado correctamente" -ForegroundColor Green
    }

    if (-not $cambiosCorrectos) {
        Write-Host "`n✗ Algunos cambios no se aplicaron correctamente" -ForegroundColor Red
        exit 1
    }

} catch {
    Write-Host "✗ Error verificando cuenta: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 1

# Paso 4: Intentar actualizar con número de cuenta duplicado
Write-Host "`nPASO 4: Probar validación de número de cuenta duplicado..." -ForegroundColor Yellow

# Crear otra cuenta
$otraCuentaBody = @{
    nombre = "Otra Cuenta"
    banco = "Otro Banco"
    numero_cuenta = "OTRA-CUENTA-$(Get-Random -Minimum 1000 -Maximum 9999)"
    tipo_cuenta = "CORRIENTE"
    moneda = "PEN"
    saldo = 1000.00
} | ConvertTo-Json

try {
    $otraCuentaResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" -Method Post -Headers $headers -Body $otraCuentaBody
    $otraCuentaId = $otraCuentaResponse.data.id
    $otraCuentaNumero = $otraCuentaResponse.data.numero_cuenta
    Write-Host "✓ Segunda cuenta creada: $otraCuentaNumero" -ForegroundColor Green
} catch {
    Write-Host "✗ Error creando segunda cuenta: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Intentar actualizar la primera cuenta con el número de la segunda
$duplicadoBody = @{
    numero_cuenta = $otraCuentaNumero
} | ConvertTo-Json

try {
    $duplicadoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaId" -Method Put -Headers $headers -Body $duplicadoBody
    Write-Host "✗ ERROR: Se permitió número de cuenta duplicado" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "✓ Validación correcta: No se permite número de cuenta duplicado" -ForegroundColor Green
    } else {
        Write-Host "✗ Error inesperado: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Start-Sleep -Seconds 1

# Paso 5: Intentar actualizar cuenta inexistente
Write-Host "`nPASO 5: Probar actualización de cuenta inexistente..." -ForegroundColor Yellow

$cuentaInexistenteId = "00000000-0000-0000-0000-000000000000"
$actualizarInexistenteBody = @{
    nombre = "No debería funcionar"
} | ConvertTo-Json

try {
    $inexistenteResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas/$cuentaInexistenteId" -Method Put -Headers $headers -Body $actualizarInexistenteBody
    Write-Host "✗ ERROR: Se permitió actualizar cuenta inexistente" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "✓ Validación correcta: Cuenta inexistente no encontrada" -ForegroundColor Green
    } else {
        Write-Host "✗ Error inesperado: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Resumen final
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE PRUEBAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Cuenta bancaria creada" -ForegroundColor Green
Write-Host "✓ Cuenta bancaria actualizada" -ForegroundColor Green
Write-Host "✓ Cambios verificados correctamente" -ForegroundColor Green
Write-Host "✓ Validación de número duplicado funciona" -ForegroundColor Green
Write-Host "✓ Validación de cuenta inexistente funciona" -ForegroundColor Green
Write-Host "`n¡Todas las pruebas pasaron exitosamente!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan
