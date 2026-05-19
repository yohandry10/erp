# Test script for batch payment idempotency
# This script tests that duplicate batch payment requests return the same result without reprocessing

$baseUrl = "http://localhost:3000"
$tenantId = "d4b8e19c-5c91-4d5e-8f3a-2e1b3c4d5e6f"

Write-Host "=== TEST: Idempotencia de Pago en Lote ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get auth token
Write-Host "1. Obteniendo token de autenticación..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = "Admin123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    Write-Host "✓ Token obtenido exitosamente" -ForegroundColor Green
} catch {
    Write-Host "✗ Error obteniendo token: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

# Step 2: Get or create test cuenta bancaria
Write-Host ""
Write-Host "2. Obteniendo cuenta bancaria de prueba..." -ForegroundColor Yellow

# For now, we'll use a direct database query or assume a cuenta exists
# In a real scenario, you would get this from the API or create it via SQL
Write-Host "⚠ NOTA: Asegúrate de tener una cuenta bancaria creada en la base de datos" -ForegroundColor Yellow
Write-Host "  Puedes usar este SQL:" -ForegroundColor Gray
Write-Host "  INSERT INTO cuentas_bancarias (tenant_id, nombre, banco, numero_cuenta, moneda, saldo, activa, permite_sobregiro)" -ForegroundColor Gray
Write-Host "  VALUES ('$tenantId', 'Cuenta Test', 'BCP', '19100000000001', 'PEN', 50000.00, true, false);" -ForegroundColor Gray
Write-Host ""
Write-Host "  Ingresa el ID de la cuenta bancaria a usar:" -ForegroundColor Cyan
$cuentaBancariaId = Read-Host "  Cuenta Bancaria ID"

if ([string]::IsNullOrWhiteSpace($cuentaBancariaId)) {
    Write-Host "✗ Debe proporcionar un ID de cuenta bancaria" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Usando cuenta bancaria: $cuentaBancariaId" -ForegroundColor Green

# Step 3: Create test CxP records
Write-Host ""
Write-Host "3. Creando CxP de prueba..." -ForegroundColor Yellow

# Get a proveedor
try {
    $proveedoresResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores?limit=1" -Method Get -Headers $headers
    $proveedorId = $proveedoresResponse.data[0].id
    Write-Host "✓ Proveedor obtenido: $proveedorId" -ForegroundColor Green
} catch {
    Write-Host "✗ Error obteniendo proveedor: $_" -ForegroundColor Red
    exit 1
}

# Create 3 CxP for testing
$cxpIds = @()
for ($i = 1; $i -le 3; $i++) {
    $cxpBody = @{
        proveedor_id = $proveedorId
        numero_documento = "TEST-IDEMP-$i-$(Get-Date -Format 'yyyyMMddHHmmss')"
        fecha_emision = (Get-Date).ToString("yyyy-MM-dd")
        fecha_vencimiento = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
        total = 1000.00 * $i
        saldo = 1000.00 * $i
        moneda = "PEN"
        estado = "PENDIENTE"
        condiciones_pago = "30 días"
        dias_credito = 30
    } | ConvertTo-Json

    try {
        $cxpResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" -Method Post -Headers $headers -Body $cxpBody
        $cxpIds += $cxpResponse.data.id
        Write-Host "✓ CxP $i creada: $($cxpResponse.data.numero_documento) - Saldo: $($cxpResponse.data.saldo)" -ForegroundColor Green
    } catch {
        Write-Host "✗ Error creando CxP $i : $_" -ForegroundColor Red
        exit 1
    }
}

# Step 4: First batch payment request
Write-Host ""
Write-Host "4. Procesando primer lote de pagos..." -ForegroundColor Yellow

$loteReferencia = "LOTE-IDEMP-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
$pagoLoteBody = @{
    cuenta_bancaria_id = $cuentaBancariaId
    fecha_pago = (Get-Date).ToString("yyyy-MM-dd")
    metodo_pago = "TRANSFERENCIA"
    referencia_lote = $loteReferencia
    observaciones = "Test de idempotencia - Primera ejecución"
    pagos = @(
        @{ cxp_id = $cxpIds[0]; monto = 1000.00 },
        @{ cxp_id = $cxpIds[1]; monto = 2000.00 },
        @{ cxp_id = $cxpIds[2]; monto = 3000.00 }
    )
} | ConvertTo-Json -Depth 10

try {
    $primerResultado = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/lote" -Method Post -Headers $headers -Body $pagoLoteBody
    Write-Host "✓ Primer lote procesado exitosamente" -ForegroundColor Green
    Write-Host "  Lote ID: $($primerResultado.data.lote_id)" -ForegroundColor Gray
    Write-Host "  Monto total: $($primerResultado.data.monto_total)" -ForegroundColor Gray
    Write-Host "  Pagos exitosos: $($primerResultado.data.pagos_exitosos)" -ForegroundColor Gray
    Write-Host "  Idempotente: $($primerResultado.data.idempotent)" -ForegroundColor Gray

    # Store first result for comparison
    $primerLoteId = $primerResultado.data.lote_id
    $primerMontoTotal = $primerResultado.data.monto_total
    $primerPagosExitosos = $primerResultado.data.pagos_exitosos
} catch {
    Write-Host "✗ Error procesando primer lote: $_" -ForegroundColor Red
    Write-Host $_.Exception.Response.StatusCode -ForegroundColor Red
    exit 1
}

# Step 5: Verify CxP were updated
Write-Host ""
Write-Host "5. Verificando que las CxP fueron actualizadas..." -ForegroundColor Yellow
foreach ($cxpId in $cxpIds) {
    try {
        $cxpResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId" -Method Get -Headers $headers
        Write-Host "  CxP $($cxpResponse.data.numero_documento): Estado=$($cxpResponse.data.estado), Saldo=$($cxpResponse.data.saldo)" -ForegroundColor Gray
    } catch {
        Write-Host "✗ Error verificando CxP: $_" -ForegroundColor Red
    }
}

# Step 6: Verify bank account balance was updated (via SQL or skip)
Write-Host ""
Write-Host "6. Verificando saldo de cuenta bancaria..." -ForegroundColor Yellow
Write-Host "  ⚠ Verifica manualmente en la base de datos que el saldo se redujo en 6000" -ForegroundColor Yellow
Write-Host "  SELECT saldo FROM cuentas_bancarias WHERE id = '$cuentaBancariaId';" -ForegroundColor Gray

# Step 7: Second batch payment request (DUPLICATE - should be idempotent)
Write-Host ""
Write-Host "7. Procesando SEGUNDO lote con la MISMA referencia (test idempotencia)..." -ForegroundColor Yellow
Write-Host "   Referencia: $loteReferencia" -ForegroundColor Cyan

try {
    $segundoResultado = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/tesoreria/lote" -Method Post -Headers $headers -Body $pagoLoteBody
    Write-Host "✓ Segundo lote procesado (idempotente)" -ForegroundColor Green
    Write-Host "  Lote ID: $($segundoResultado.data.lote_id)" -ForegroundColor Gray
    Write-Host "  Monto total: $($segundoResultado.data.monto_total)" -ForegroundColor Gray
    Write-Host "  Pagos exitosos: $($segundoResultado.data.pagos_exitosos)" -ForegroundColor Gray
    Write-Host "  Idempotente: $($segundoResultado.data.idempotent)" -ForegroundColor Gray

    # Verify idempotency
    if ($segundoResultado.data.idempotent -eq $true) {
        Write-Host ""
        Write-Host "✓✓✓ IDEMPOTENCIA VERIFICADA ✓✓✓" -ForegroundColor Green
        Write-Host "  El segundo request retornó el resultado del primero sin reprocesar" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "✗✗✗ FALLO DE IDEMPOTENCIA ✗✗✗" -ForegroundColor Red
        Write-Host "  El segundo request procesó el lote nuevamente (no debería)" -ForegroundColor Red
    }

    # Compare results
    Write-Host ""
    Write-Host "8. Comparando resultados..." -ForegroundColor Yellow
    if ($primerLoteId -eq $segundoResultado.data.lote_id) {
        Write-Host "  ✓ Lote ID coincide" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Lote ID NO coincide" -ForegroundColor Red
    }

    if ($primerMontoTotal -eq $segundoResultado.data.monto_total) {
        Write-Host "  ✓ Monto total coincide" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Monto total NO coincide" -ForegroundColor Red
    }

    if ($primerPagosExitosos -eq $segundoResultado.data.pagos_exitosos) {
        Write-Host "  ✓ Pagos exitosos coincide" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Pagos exitosos NO coincide" -ForegroundColor Red
    }

} catch {
    Write-Host "✗ Error procesando segundo lote: $_" -ForegroundColor Red
    Write-Host $_.Exception.Response.StatusCode -ForegroundColor Red
}

# Step 9: Verify CxP were NOT updated again
Write-Host ""
Write-Host "9. Verificando que las CxP NO fueron actualizadas nuevamente..." -ForegroundColor Yellow
foreach ($cxpId in $cxpIds) {
    try {
        $cxpResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp/$cxpId" -Method Get -Headers $headers
        Write-Host "  CxP $($cxpResponse.data.numero_documento): Estado=$($cxpResponse.data.estado), Saldo=$($cxpResponse.data.saldo)" -ForegroundColor Gray

        # Verify saldo is still 0 (not negative)
        if ($cxpResponse.data.saldo -eq 0) {
            Write-Host "    ✓ Saldo correcto (0 - no se reprocesó)" -ForegroundColor Green
        } else {
            Write-Host "    ✗ Saldo incorrecto (debería ser 0)" -ForegroundColor Red
        }
    } catch {
        Write-Host "✗ Error verificando CxP: $_" -ForegroundColor Red
    }
}

# Step 10: Verify bank account balance was NOT updated again (via SQL or skip)
Write-Host ""
Write-Host "10. Verificando que el saldo bancario NO cambió..." -ForegroundColor Yellow
Write-Host "  ⚠ Verifica manualmente en la base de datos que el saldo NO cambió" -ForegroundColor Yellow
Write-Host "  SELECT saldo FROM cuentas_bancarias WHERE id = '$cuentaBancariaId';" -ForegroundColor Gray
Write-Host "  El saldo debería seguir siendo el mismo que después del primer pago" -ForegroundColor Gray

Write-Host ""
Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Resumen:" -ForegroundColor Yellow
Write-Host "- Se procesó un lote de pagos con referencia única" -ForegroundColor Gray
Write-Host "- Se intentó procesar el mismo lote nuevamente" -ForegroundColor Gray
Write-Host "- El sistema debería haber detectado la duplicación y retornado el resultado original" -ForegroundColor Gray
Write-Host "- Las CxP y la cuenta bancaria NO deberían haberse actualizado en el segundo intento" -ForegroundColor Gray

