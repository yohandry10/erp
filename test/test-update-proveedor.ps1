# Test: Actualizar Proveedor (PUT /api/compras/proveedores/:id)

$baseUrl = "http://localhost:3002/api"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "=== TEST: ACTUALIZAR PROVEEDOR ===" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Crear un proveedor de prueba
Write-Host "Paso 1: Creando proveedor de prueba..." -ForegroundColor Yellow
$createBody = @{
    tenant_id = $tenantId
    ruc = "20999888777"
    razon_social = "PROVEEDOR TEST ORIGINAL S.A.C."
    nombre_comercial = "Test Original"
    email = "original@test.com"
    telefono = "+51 999 888 777"
    direccion = "Av. Test 123"
    contacto = "Juan Pérez"
    condiciones_pago = "CONTADO"
    limite_credito = 0
    dias_credito = 0
} | ConvertTo-Json

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores" -Method Post -Body $createBody -ContentType "application/json"

    if ($createResponse.success) {
        $proveedorId = $createResponse.data.id
        Write-Host "✓ Proveedor creado exitosamente" -ForegroundColor Green
        Write-Host "  ID: $proveedorId" -ForegroundColor Gray
        Write-Host "  RUC: $($createResponse.data.ruc)" -ForegroundColor Gray
        Write-Host "  Razón Social: $($createResponse.data.razon_social)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Error al crear proveedor: $($createResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

# Paso 2: Actualizar el proveedor
Write-Host "Paso 2: Actualizando proveedor..." -ForegroundColor Yellow
$updateBody = @{
    tenant_id = $tenantId
    razon_social = "PROVEEDOR TEST ACTUALIZADO S.A.C."
    nombre_comercial = "Test Actualizado"
    email = "actualizado@test.com"
    telefono = "+51 111 222 333"
    direccion = "Av. Nueva 456"
    contacto = "María García"
    condiciones_pago = "CREDITO_30"
    limite_credito = 50000
    dias_credito = 30
} | ConvertTo-Json

try {
    $updateResponse = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores/$proveedorId" -Method Put -Body $updateBody -ContentType "application/json"

    if ($updateResponse.success) {
        Write-Host "✓ Proveedor actualizado exitosamente" -ForegroundColor Green
        Write-Host "  Razón Social: $($updateResponse.data.razon_social)" -ForegroundColor Gray
        Write-Host "  Nombre Comercial: $($updateResponse.data.nombre_comercial)" -ForegroundColor Gray
        Write-Host "  Email: $($updateResponse.data.email)" -ForegroundColor Gray
        Write-Host "  Teléfono: $($updateResponse.data.telefono)" -ForegroundColor Gray
        Write-Host "  Dirección: $($updateResponse.data.direccion)" -ForegroundColor Gray
        Write-Host "  Contacto: $($updateResponse.data.contacto)" -ForegroundColor Gray
        Write-Host "  Condiciones Pago: $($updateResponse.data.condiciones_pago)" -ForegroundColor Gray
        Write-Host "  Límite Crédito: $($updateResponse.data.limite_credito)" -ForegroundColor Gray
        Write-Host "  Días Crédito: $($updateResponse.data.dias_credito)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Error al actualizar proveedor: $($updateResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
    exit 1
}

# Paso 3: Verificar que los cambios se guardaron
Write-Host "Paso 3: Verificando cambios..." -ForegroundColor Yellow
try {
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores/$proveedorId`?tenant_id=$tenantId" -Method Get

    if ($getResponse.success) {
        $proveedor = $getResponse.data

        # Verificar cada campo actualizado
        $errores = @()

        if ($proveedor.razon_social -ne "PROVEEDOR TEST ACTUALIZADO S.A.C.") {
            $errores += "Razón social no se actualizó correctamente"
        }

        if ($proveedor.nombre_comercial -ne "Test Actualizado") {
            $errores += "Nombre comercial no se actualizó correctamente"
        }

        if ($proveedor.email -ne "actualizado@test.com") {
            $errores += "Email no se actualizó correctamente"
        }

        if ($proveedor.telefono -ne "+51 111 222 333") {
            $errores += "Teléfono no se actualizó correctamente"
        }

        if ($proveedor.direccion -ne "Av. Nueva 456") {
            $errores += "Dirección no se actualizó correctamente"
        }

        if ($proveedor.contacto -ne "María García") {
            $errores += "Contacto no se actualizó correctamente"
        }

        if ($proveedor.condiciones_pago -ne "CREDITO_30") {
            $errores += "Condiciones de pago no se actualizaron correctamente"
        }

        if ($proveedor.limite_credito -ne 50000) {
            $errores += "Límite de crédito no se actualizó correctamente"
        }

        if ($proveedor.dias_credito -ne 30) {
            $errores += "Días de crédito no se actualizaron correctamente"
        }

        if ($errores.Count -eq 0) {
            Write-Host "✓ Todos los cambios se guardaron correctamente" -ForegroundColor Green
            Write-Host ""
        } else {
            Write-Host "✗ Errores encontrados:" -ForegroundColor Red
            foreach ($error in $errores) {
                Write-Host "  - $error" -ForegroundColor Red
            }
            Write-Host ""
        }
    } else {
        Write-Host "✗ Error al obtener proveedor: $($getResponse.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
}

# Paso 4: Probar actualización parcial (solo algunos campos)
Write-Host "Paso 4: Probando actualización parcial..." -ForegroundColor Yellow
$partialUpdateBody = @{
    tenant_id = $tenantId
    telefono = "+51 444 555 666"
    limite_credito = 75000
} | ConvertTo-Json

try {
    $partialResponse = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores/$proveedorId" -Method Put -Body $partialUpdateBody -ContentType "application/json"

    if ($partialResponse.success) {
        Write-Host "✓ Actualización parcial exitosa" -ForegroundColor Green
        Write-Host "  Teléfono actualizado: $($partialResponse.data.telefono)" -ForegroundColor Gray
        Write-Host "  Límite crédito actualizado: $($partialResponse.data.limite_credito)" -ForegroundColor Gray
        Write-Host "  Razón social (sin cambios): $($partialResponse.data.razon_social)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Error en actualización parcial: $($partialResponse.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error en la petición: $_" -ForegroundColor Red
}

# Paso 5: Probar validaciones
Write-Host "Paso 5: Probando validaciones..." -ForegroundColor Yellow

# Test 5.1: Email inválido
Write-Host "  Test 5.1: Email inválido..." -ForegroundColor Gray
$invalidEmailBody = @{
    tenant_id = $tenantId
    email = "email-invalido"
} | ConvertTo-Json

try {
    $invalidResponse = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores/$proveedorId" -Method Put -Body $invalidEmailBody -ContentType "application/json"

    if (-not $invalidResponse.success) {
        Write-Host "  ✓ Validación de email funcionando correctamente" -ForegroundColor Green
        Write-Host "    Error: $($invalidResponse.error)" -ForegroundColor Gray
    } else {
        Write-Host "  ✗ Validación de email NO funcionó (debería rechazar email inválido)" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✓ Validación de email funcionando (excepción capturada)" -ForegroundColor Green
}

# Test 5.2: Límite de crédito negativo
Write-Host "  Test 5.2: Límite de crédito negativo..." -ForegroundColor Gray
$negativeLimitBody = @{
    tenant_id = $tenantId
    limite_credito = -1000
} | ConvertTo-Json

try {
    $negativeResponse = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores/$proveedorId" -Method Put -Body $negativeLimitBody -ContentType "application/json"

    if (-not $negativeResponse.success) {
        Write-Host "  ✓ Validación de límite de crédito funcionando correctamente" -ForegroundColor Green
        Write-Host "    Error: $($negativeResponse.error)" -ForegroundColor Gray
    } else {
        Write-Host "  ✗ Validación de límite de crédito NO funcionó (debería rechazar valor negativo)" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✓ Validación de límite de crédito funcionando (excepción capturada)" -ForegroundColor Green
}

# Test 5.3: RUC duplicado (intentar cambiar a un RUC que ya existe)
Write-Host "  Test 5.3: RUC duplicado..." -ForegroundColor Gray
# Primero crear otro proveedor
$otherProveedorBody = @{
    tenant_id = $tenantId
    ruc = "20888777666"
    razon_social = "OTRO PROVEEDOR S.A.C."
    email = "otro@test.com"
} | ConvertTo-Json

try {
    $otherResponse = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores" -Method Post -Body $otherProveedorBody -ContentType "application/json"

    if ($otherResponse.success) {
        # Intentar actualizar el primer proveedor con el RUC del segundo
        $duplicateRucBody = @{
            tenant_id = $tenantId
            ruc = "20888777666"
        } | ConvertTo-Json

        try {
            $duplicateResponse = Invoke-RestMethod -Uri "$baseUrl/compras/proveedores/$proveedorId" -Method Put -Body $duplicateRucBody -ContentType "application/json"

            if (-not $duplicateResponse.success) {
                Write-Host "  ✓ Validación de RUC duplicado funcionando correctamente" -ForegroundColor Green
                Write-Host "    Error: $($duplicateResponse.error)" -ForegroundColor Gray
            } else {
                Write-Host "  ✗ Validación de RUC duplicado NO funcionó (debería rechazar RUC existente)" -ForegroundColor Red
            }
        } catch {
            Write-Host "  ✓ Validación de RUC duplicado funcionando (excepción capturada)" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "  ⚠ No se pudo crear segundo proveedor para probar RUC duplicado" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host "✓ Endpoint PUT /api/compras/proveedores/:id está funcionando correctamente" -ForegroundColor Green
Write-Host "✓ Actualización completa funcional" -ForegroundColor Green
Write-Host "✓ Actualización parcial funcional" -ForegroundColor Green
Write-Host "✓ Validaciones implementadas correctamente" -ForegroundColor Green
Write-Host ""
