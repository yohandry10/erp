# Test script para verificar el cálculo automático de fecha de vencimiento
# Endpoint: POST /api/finanzas/cxp

$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5YzY5YzI5Yy1hNzI5LTRhNzAtYjI5Ny1lNzI5YzI5YzI5YzIiLCJlbWFpbCI6ImFkbWluQHZpZXJkZXMuY29tIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzMwMDAwMDAwfQ.fake-signature"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

Write-Host "🧪 Test: Cálculo Automático de Fecha de Vencimiento" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# Obtener un proveedor existente
Write-Host "`n📋 Obteniendo proveedores..." -ForegroundColor Yellow
try {
    $proveedoresResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores?limit=1" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $token"
            "x-tenant-id" = $tenantId
            "Content-Type" = "application/json"
        }

    if ($proveedoresResponse.data -and $proveedoresResponse.data.Count -gt 0) {
        $proveedorId = $proveedoresResponse.data[0].id
        Write-Host "✅ Proveedor encontrado: $proveedorId" -ForegroundColor Green
    } else {
        Write-Host "❌ No se encontraron proveedores. Crea uno primero." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error al obtener proveedores: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 1: Crear CxP sin fecha_vencimiento (debe calcularse automáticamente)
Write-Host "`n📝 Test 1: CxP sin fecha_vencimiento (CREDITO_30)" -ForegroundColor Yellow
Write-Host "   Debe calcular automáticamente: fecha_emision + 30 días" -ForegroundColor Gray

$fechaEmision1 = (Get-Date).ToString("yyyy-MM-dd")
$fechaVencimientoEsperada1 = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
$numeroDocumento1 = "FACT-AUTO-$(Get-Random -Minimum 1000 -Maximum 9999)"

$body1 = @{
    proveedor_id = $proveedorId
    numero_documento = $numeroDocumento1
    fecha_emision = $fechaEmision1
    condiciones_pago = "CREDITO_30"
    subtotal = 1000.00
    igv = 180.00
    total = 1180.00
    moneda = "PEN"
    observaciones = "Test cálculo automático - CREDITO_30"
} | ConvertTo-Json

try {
    $response1 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $token"
            "x-tenant-id" = $tenantId
            "Content-Type" = "application/json"
        } `
        -Body $body1

    Write-Host "✅ CxP creada exitosamente" -ForegroundColor Green
    Write-Host "   Fecha emisión: $($response1.data.fecha_emision)" -ForegroundColor White
    Write-Host "   Fecha vencimiento: $($response1.data.fecha_vencimiento)" -ForegroundColor White
    Write-Host "   Fecha esperada: $fechaVencimientoEsperada1" -ForegroundColor White
    Write-Host "   Días crédito: $($response1.data.dias_credito)" -ForegroundColor White
    
    if ($response1.data.fecha_vencimiento -eq $fechaVencimientoEsperada1) {
        Write-Host "   ✅ Fecha calculada correctamente!" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Fecha no coincide con la esperada" -ForegroundColor Yellow
    }
    
    if ($response1.data.dias_credito -eq 30) {
        Write-Host "   ✅ Días crédito correctos (30)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Días crédito incorrectos: $($response1.data.dias_credito)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en Test 1: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 10 | Write-Host
    }
}

# Test 2: Crear CxP con CONTADO (0 días)
Write-Host "`n📝 Test 2: CxP con CONTADO (0 días)" -ForegroundColor Yellow
Write-Host "   Debe calcular: fecha_emision + 0 días" -ForegroundColor Gray

$fechaEmision2 = (Get-Date).ToString("yyyy-MM-dd")
$fechaVencimientoEsperada2 = $fechaEmision2
$numeroDocumento2 = "FACT-CONTADO-$(Get-Random -Minimum 1000 -Maximum 9999)"

$body2 = @{
    proveedor_id = $proveedorId
    numero_documento = $numeroDocumento2
    fecha_emision = $fechaEmision2
    condiciones_pago = "CONTADO"
    subtotal = 500.00
    igv = 90.00
    total = 590.00
    moneda = "PEN"
    observaciones = "Test cálculo automático - CONTADO"
} | ConvertTo-Json

try {
    $response2 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $token"
            "x-tenant-id" = $tenantId
            "Content-Type" = "application/json"
        } `
        -Body $body2

    Write-Host "✅ CxP creada exitosamente" -ForegroundColor Green
    Write-Host "   Fecha emisión: $($response2.data.fecha_emision)" -ForegroundColor White
    Write-Host "   Fecha vencimiento: $($response2.data.fecha_vencimiento)" -ForegroundColor White
    Write-Host "   Fecha esperada: $fechaVencimientoEsperada2" -ForegroundColor White
    Write-Host "   Días crédito: $($response2.data.dias_credito)" -ForegroundColor White
    
    if ($response2.data.fecha_vencimiento -eq $fechaVencimientoEsperada2) {
        Write-Host "   ✅ Fecha calculada correctamente!" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Fecha no coincide con la esperada" -ForegroundColor Yellow
    }
    
    if ($response2.data.dias_credito -eq 0) {
        Write-Host "   ✅ Días crédito correctos (0)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Días crédito incorrectos: $($response2.data.dias_credito)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en Test 2: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 10 | Write-Host
    }
}

# Test 3: Crear CxP con fecha_vencimiento explícita (debe respetar la fecha proporcionada)
Write-Host "`n📝 Test 3: CxP con fecha_vencimiento explícita" -ForegroundColor Yellow
Write-Host "   Debe usar la fecha proporcionada, no calcularla" -ForegroundColor Gray

$fechaEmision3 = (Get-Date).ToString("yyyy-MM-dd")
$fechaVencimientoExplicita = (Get-Date).AddDays(45).ToString("yyyy-MM-dd")
$numeroDocumento3 = "FACT-EXPLICITA-$(Get-Random -Minimum 1000 -Maximum 9999)"

$body3 = @{
    proveedor_id = $proveedorId
    numero_documento = $numeroDocumento3
    fecha_emision = $fechaEmision3
    fecha_vencimiento = $fechaVencimientoExplicita
    condiciones_pago = "CREDITO_30"
    subtotal = 750.00
    igv = 135.00
    total = 885.00
    moneda = "PEN"
    observaciones = "Test fecha explícita - debe respetar 45 días aunque condición sea 30"
} | ConvertTo-Json

try {
    $response3 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $token"
            "x-tenant-id" = $tenantId
            "Content-Type" = "application/json"
        } `
        -Body $body3

    Write-Host "✅ CxP creada exitosamente" -ForegroundColor Green
    Write-Host "   Fecha emisión: $($response3.data.fecha_emision)" -ForegroundColor White
    Write-Host "   Fecha vencimiento: $($response3.data.fecha_vencimiento)" -ForegroundColor White
    Write-Host "   Fecha esperada: $fechaVencimientoExplicita" -ForegroundColor White
    Write-Host "   Días crédito: $($response3.data.dias_credito)" -ForegroundColor White
    
    if ($response3.data.fecha_vencimiento -eq $fechaVencimientoExplicita) {
        Write-Host "   ✅ Fecha respetada correctamente!" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Fecha no coincide con la proporcionada" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en Test 3: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 10 | Write-Host
    }
}

# Test 4: Crear CxP con dias_credito personalizado (sin condiciones_pago)
Write-Host "`n📝 Test 4: CxP con dias_credito personalizado (sin condiciones_pago)" -ForegroundColor Yellow
Write-Host "   Debe usar dias_credito proporcionado" -ForegroundColor Gray

$fechaEmision4 = (Get-Date).ToString("yyyy-MM-dd")
$diasCreditoPersonalizado = 21
$fechaVencimientoEsperada4 = (Get-Date).AddDays($diasCreditoPersonalizado).ToString("yyyy-MM-dd")
$numeroDocumento4 = "FACT-CUSTOM-$(Get-Random -Minimum 1000 -Maximum 9999)"

$body4 = @{
    proveedor_id = $proveedorId
    numero_documento = $numeroDocumento4
    fecha_emision = $fechaEmision4
    dias_credito = $diasCreditoPersonalizado
    subtotal = 850.00
    igv = 153.00
    total = 1003.00
    moneda = "PEN"
    observaciones = "Test días crédito personalizado - 21 días"
} | ConvertTo-Json

try {
    $response4 = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/cxp" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $token"
            "x-tenant-id" = $tenantId
            "Content-Type" = "application/json"
        } `
        -Body $body4

    Write-Host "✅ CxP creada exitosamente" -ForegroundColor Green
    Write-Host "   Fecha emisión: $($response4.data.fecha_emision)" -ForegroundColor White
    Write-Host "   Fecha vencimiento: $($response4.data.fecha_vencimiento)" -ForegroundColor White
    Write-Host "   Fecha esperada: $fechaVencimientoEsperada4" -ForegroundColor White
    Write-Host "   Días crédito: $($response4.data.dias_credito)" -ForegroundColor White
    
    if ($response4.data.fecha_vencimiento -eq $fechaVencimientoEsperada4) {
        Write-Host "   ✅ Fecha calculada correctamente con días personalizados!" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Fecha no coincide con la esperada" -ForegroundColor Yellow
    }
    
    if ($response4.data.dias_credito -eq $diasCreditoPersonalizado) {
        Write-Host "   ✅ Días crédito correctos ($diasCreditoPersonalizado)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Días crédito incorrectos: $($response4.data.dias_credito)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error en Test 4: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 10 | Write-Host
    }
}

Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host "✅ Tests completados" -ForegroundColor Green
Write-Host "`n📊 Resumen:" -ForegroundColor Cyan
Write-Host "   Test 1: Cálculo automático con CREDITO_30" -ForegroundColor White
Write-Host "   Test 2: Cálculo automático con CONTADO (0 días)" -ForegroundColor White
Write-Host "   Test 3: Fecha explícita (debe respetarse)" -ForegroundColor White
Write-Host "   Test 4: Días crédito personalizado" -ForegroundColor White
