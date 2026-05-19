# Test Simple: Importar CSV a Conciliación Bancaria
# Este test asume que ya existe una conciliación creada

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"

Write-Host "=== TEST: Importar CSV a Conciliación ===" -ForegroundColor Cyan
Write-Host ""

# Solicitar ID de conciliación
$conciliacionId = Read-Host "Ingrese el ID de la conciliación (o presione Enter para listar)"

if ([string]::IsNullOrWhiteSpace($conciliacionId)) {
    Write-Host ""
    Write-Host "Listando conciliaciones disponibles..." -ForegroundColor Yellow

    try {
        $conciliaciones = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion" `
            -Method Get `
            -Headers @{
                "Authorization" = "Bearer $token"
                "x-tenant-id" = "9f40367f-a717-4a70-b59f-e719b29b29b2"
            }

        if ($conciliaciones.data.Count -eq 0) {
            Write-Host "No hay conciliaciones disponibles. Cree una primero." -ForegroundColor Red
            exit 1
        }

        Write-Host ""
        Write-Host "Conciliaciones disponibles:" -ForegroundColor Cyan
        foreach ($c in $conciliaciones.data) {
            Write-Host "  ID: $($c.id)" -ForegroundColor White
            Write-Host "    Período: $($c.periodo)" -ForegroundColor Gray
            Write-Host "    Estado: $($c.estado)" -ForegroundColor Gray
            Write-Host "    Banco: $($c.cuentas_bancarias.banco)" -ForegroundColor Gray
            Write-Host ""
        }

        $conciliacionId = Read-Host "Ingrese el ID de la conciliación a usar"
    } catch {
        Write-Host "Error listando conciliaciones: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Usando conciliación: $conciliacionId" -ForegroundColor Cyan
Write-Host ""

# Preparar CSV de extracto bancario (formato BCP)
Write-Host "Preparando extracto bancario CSV (formato BCP)..." -ForegroundColor Yellow
$csvContent = @"
Fecha,Descripcion,Cargo,Abono,Saldo
2025-10-15,Cobro cliente ABC,,5000.00,15000.00
2025-10-16,Pago proveedor XYZ,2000.00,,13000.00
2025-10-17,Cobro cliente DEF,,3000.00,16000.00
2025-10-18,Comision bancaria,25.00,,15975.00
"@

Write-Host "CSV preparado con 4 movimientos" -ForegroundColor Green
Write-Host ""

# Importar CSV
Write-Host "Importando CSV a la conciliación..." -ForegroundColor Yellow
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
    Write-Host "  Total abonos: S/. $($importarResponse.data.total_abonos)" -ForegroundColor White
    Write-Host "  Total cargos: S/. $($importarResponse.data.total_cargos)" -ForegroundColor White
    Write-Host "  Saldo final: S/. $($importarResponse.data.saldo_final)" -ForegroundColor White

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

# Verificar conciliación actualizada
Write-Host "Verificando conciliación actualizada..." -ForegroundColor Yellow
try {
    $conciliacionActualizada = Invoke-RestMethod -Uri "$baseUrl/api/finanzas/conciliacion/$conciliacionId" `
        -Method Get `
        -Headers @{
            "Authorization" = "Bearer $token"
            "x-tenant-id" = "9f40367f-a717-4a70-b59f-e719b29b29b2"
        }

    Write-Host "✓ Conciliación actualizada:" -ForegroundColor Green
    Write-Host "  Estado: $($conciliacionActualizada.data.estado)" -ForegroundColor Cyan
    Write-Host "  Saldo según libros: S/. $($conciliacionActualizada.data.saldo_libro)" -ForegroundColor Cyan
    Write-Host "  Saldo según banco: S/. $($conciliacionActualizada.data.saldo_banco)" -ForegroundColor Cyan
    Write-Host "  Diferencia: S/. $($conciliacionActualizada.data.diferencia)" -ForegroundColor $(if ($conciliacionActualizada.data.diferencia -eq 0) { "Green" } else { "Yellow" })
} catch {
    Write-Host "✗ Error obteniendo conciliación: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TEST COMPLETADO ===" -ForegroundColor Green
Write-Host ""
Write-Host "Formatos CSV soportados:" -ForegroundColor Cyan
Write-Host "  - BCP: Fecha,Descripcion,Cargo,Abono,Saldo" -ForegroundColor Gray
Write-Host "  - BBVA: Fecha,Descripcion,Cargo,Abono,Saldo" -ForegroundColor Gray
Write-Host "  - GENERICO: Fecha,Descripcion,Referencia,Tipo,Monto" -ForegroundColor Gray
Write-Host "  - INTERBANK: Fecha,Descripcion,Referencia,Tipo,Monto" -ForegroundColor Gray
Write-Host "  - SCOTIABANK: Fecha,Descripcion,Cargo,Abono" -ForegroundColor Gray
