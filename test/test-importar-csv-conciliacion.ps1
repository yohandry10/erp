# Test: Importar CSV a Conciliación Bancaria
# Endpoint: POST /api/finanzas/conciliacion/:id/importar-csv

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"

Write-Host "=== TEST: Importar CSV a Conciliación Bancaria ===" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Crear una cuenta bancaria de prueba
Write-Host "Paso 1: Crear cuenta bancaria de prueba..." -ForegroundColor Yellow
$cuentaBody = @{
    banco = "BCP"
    numero_cuenta = "19100000000001"
    tipo_cuenta = "CORRIENTE"
    moneda = "PEN"
    saldo_actual = 10000.00
    saldo_contable = 10000.00
    activa = $true
} | ConvertTo-Json

try {
    $cuentaResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/cuentas" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
            "x-tenant-id" = "9f40367f-a717-4a70-b59f-e719b29b29b2"
        } `
        -Body $cuentaBody

    $cuentaId = $cuentaResponse.data.id
    Write-Host "✓ Cuenta bancaria creada: $cuentaId" -ForegroundColor Green
} catch {
    Write-Host "✗ Error creando cuenta bancaria: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Paso 2: Crear algunos movimientos en el sistema
Write-Host "Paso 2: Crear movimientos en el sistema..." -ForegroundColor Yellow
$movimientos = @(
    @{
        tipo = "ABONO"
        monto = 5000.00
        fecha = "2025-10-15"
        descripcion = "Cobro cliente ABC"
        referencia = "COB-001"
    },
    @{
        tipo = "CARGO"
        monto = 2000.00
        fecha = "2025-10-16"
        descripcion = "Pago proveedor XYZ"
        referencia = "PAG-001"
    },
    @{
        tipo = "ABONO"
        monto = 3000.00
        fecha = "2025-10-17"
        descripcion = "Cobro cliente DEF"
        referencia = "COB-002"
    }
)

foreach ($mov in $movimientos) {
    $movBody = @{
        cuenta_bancaria_id = $cuentaId
        tipo = $mov.tipo
        monto = $mov.monto
        fecha = $mov.fecha
        descripcion = $mov.descripcion
        referencia = $mov.referencia
    } | ConvertTo-Json

    try {
        $movResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/bancos/movimientos" `
            -Method Post `
            -Headers @{
                "Authorization" = "Bearer $token"
                "Content-Type" = "application/json"
                "x-tenant-id" = "9f40367f-a717-4a70-b59f-e719b29b29b2"
            } `
            -Body $movBody

        Write-Host "  ✓ Movimiento creado: $($mov.descripcion)" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Error creando movimiento: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# Paso 3: Crear conciliación
Write-Host "Paso 3: Crear conciliación..." -ForegroundColor Yellow
$conciliacionBody = @{
    cuenta_bancaria_id = $cuentaId
    periodo = "2025-10"
    fecha_desde = "2025-10-01"
    fecha_hasta = "2025-10-31"
} | ConvertTo-Json

try {
    $conciliacionResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
            "x-tenant-id" = "9f40367f-a717-4a70-b59f-e719b29b29b2"
        } `
        -Body $conciliacionBody

    $conciliacionId = $conciliacionResponse.data.id
    Write-Host "✓ Conciliación creada: $conciliacionId" -ForegroundColor Green
    Write-Host "  Saldo según libros: $($conciliacionResponse.data.saldo_libro)" -ForegroundColor Cyan
} catch {
    Write-Host "✗ Error creando conciliación: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Paso 4: Preparar CSV de extracto bancario (formato BCP)
Write-Host "Paso 4: Preparar extracto bancario CSV..." -ForegroundColor Yellow
$csvContent = @"
Fecha,Descripcion,Cargo,Abono,Saldo
2025-10-15,Cobro cliente ABC,,5000.00,15000.00
2025-10-16,Pago proveedor XYZ,2000.00,,13000.00
2025-10-17,Cobro cliente DEF,,3000.00,16000.00
2025-10-18,Comision bancaria,25.00,,15975.00
"@

Write-Host "CSV preparado con 4 movimientos" -ForegroundColor Cyan
Write-Host ""

# Paso 5: Importar CSV
Write-Host "Paso 5: Importar CSV a la conciliación..." -ForegroundColor Yellow
$importarBody = @{
    contenidoCsv = $csvContent
    banco = "BCP"
} | ConvertTo-Json

try {
    $importarResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId/importar-csv" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
            "x-tenant-id" = "9f40367f-a717-4a70-b59f-e719b29b29b2"
        } `
        -Body $importarBody

    Write-Host "✓ CSV importado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Resultado de la importación:" -ForegroundColor Cyan
    Write-Host "  Movimientos importados: $($importarResponse.data.movimientos_importados)" -ForegroundColor White
    Write-Host "  Total abonos: $($importarResponse.data.total_abonos)" -ForegroundColor White
    Write-Host "  Total cargos: $($importarResponse.data.total_cargos)" -ForegroundColor White
    Write-Host "  Saldo final: $($importarResponse.data.saldo_final)" -ForegroundColor White

    if ($importarResponse.data.errores -and $importarResponse.data.errores.Count -gt 0) {
        Write-Host "  Errores: $($importarResponse.data.errores.Count)" -ForegroundColor Yellow
        foreach ($error in $importarResponse.data.errores) {
            Write-Host "    - $error" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  Errores: 0" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Error importando CSV: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""

# Paso 6: Verificar conciliación actualizada
Write-Host "Paso 6: Verificar conciliación actualizada..." -ForegroundColor Yellow
try {
    $conciliacionActualizada = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId" `
        -Method Get `
        -Headers @{
            "Authorization" = "Bearer $token"
            "x-tenant-id" = "9f40367f-a717-4a70-b59f-e719b29b29b2"
        }

    Write-Host "✓ Conciliación actualizada:" -ForegroundColor Green
    Write-Host "  Estado: $($conciliacionActualizada.data.estado)" -ForegroundColor Cyan
    Write-Host "  Saldo según libros: $($conciliacionActualizada.data.saldo_libro)" -ForegroundColor Cyan
    Write-Host "  Saldo según banco: $($conciliacionActualizada.data.saldo_banco)" -ForegroundColor Cyan
    Write-Host "  Diferencia: $($conciliacionActualizada.data.diferencia)" -ForegroundColor $(if ($conciliacionActualizada.data.diferencia -eq 0) { "Green" } else { "Yellow" })
} catch {
    Write-Host "✗ Error obteniendo conciliación: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Cyan

# Paso 7: Probar formato genérico
Write-Host ""
Write-Host "=== TEST ADICIONAL: Formato Genérico ===" -ForegroundColor Cyan
Write-Host ""

# Crear otra conciliación
Write-Host "Crear segunda conciliación..." -ForegroundColor Yellow
$conciliacion2Body = @{
    cuenta_bancaria_id = $cuentaId
    periodo = "2025-11"
    fecha_desde = "2025-11-01"
    fecha_hasta = "2025-11-30"
} | ConvertTo-Json

try {
    $conciliacion2Response = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
            "x-tenant-id" = "9f40367f-a717-4a70-b59f-e719b29b29b2"
        } `
        -Body $conciliacion2Body

    $conciliacion2Id = $conciliacion2Response.data.id
    Write-Host "✓ Segunda conciliación creada: $conciliacion2Id" -ForegroundColor Green
} catch {
    Write-Host "✗ Error creando segunda conciliación: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# CSV formato genérico
$csvGenerico = @"
Fecha,Descripcion,Referencia,Tipo,Monto
2025-11-05,Venta productos,VTA-001,ABONO,8500.50
2025-11-06,Pago servicios,SRV-001,CARGO,1200.00
2025-11-07,Cobro factura,FAC-123,ABONO,4500.00
"@

Write-Host "Importar CSV formato genérico..." -ForegroundColor Yellow
$importarGenericoBody = @{
    contenidoCsv = $csvGenerico
    banco = "GENERICO"
} | ConvertTo-Json

try {
    $importarGenericoResponse = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacion2Id/importar-csv" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
            "x-tenant-id" = "9f40367f-a717-4a70-b59f-e719b29b29b2"
        } `
        -Body $importarGenericoBody

    Write-Host "✓ CSV genérico importado exitosamente" -ForegroundColor Green
    Write-Host "  Movimientos: $($importarGenericoResponse.data.movimientos_importados)" -ForegroundColor Cyan
    Write-Host "  Saldo final: $($importarGenericoResponse.data.saldo_final)" -ForegroundColor Cyan
} catch {
    Write-Host "✗ Error importando CSV genérico: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TODOS LOS TESTS COMPLETADOS ===" -ForegroundColor Green
