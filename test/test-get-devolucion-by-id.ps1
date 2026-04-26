# Test script for GET /api/compras/devoluciones/:id endpoint
# Tests getting a single devolucion by ID with full details

$baseUrl = "http://localhost:3002"
$tenantId = "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: GET /api/compras/devoluciones/:id" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# First, get all devoluciones to find an ID to test with
Write-Host "Step 1: Getting list of devoluciones to find a valid ID..." -ForegroundColor Yellow
Write-Host ""

$headers = @{
    "Content-Type" = "application/json"
}

try {
    $devoluciones = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones?tenant_id=$tenantId" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    if ($devoluciones.Count -eq 0) {
        Write-Host "⚠️  No devoluciones found. Please create a devolucion first using test-crear-devolucion.ps1" -ForegroundColor Yellow
        exit
    }

    $devolucionId = $devoluciones[0].id
    Write-Host "✅ Found devolucion ID: $devolucionId" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ FAILED to get devoluciones list" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test: Get devolucion by ID
Write-Host "Step 2: Getting devolucion by ID with full details..." -ForegroundColor Yellow
Write-Host "GET $baseUrl/api/compras/devoluciones/$devolucionId`?tenant_id=$tenantId" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones/$devolucionId`?tenant_id=$tenantId" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "✅ SUCCESS - Status: 200 OK" -ForegroundColor Green
    Write-Host ""
    Write-Host "Devolucion Details:" -ForegroundColor Cyan
    Write-Host "==================" -ForegroundColor Cyan
    Write-Host "ID: $($response.id)" -ForegroundColor White
    Write-Host "Número: $($response.numero)" -ForegroundColor White
    Write-Host "Estado: $($response.estado)" -ForegroundColor White
    Write-Host "Fecha: $($response.fecha_devolucion)" -ForegroundColor White
    Write-Host "Motivo: $($response.motivo)" -ForegroundColor White
    Write-Host ""
    Write-Host "Proveedor:" -ForegroundColor Cyan
    Write-Host "  Razón Social: $($response.proveedor.razon_social)" -ForegroundColor White
    Write-Host "  RUC: $($response.proveedor.ruc)" -ForegroundColor White
    Write-Host ""
    Write-Host "Orden de Compra:" -ForegroundColor Cyan
    Write-Host "  Número: $($response.orden.numero)" -ForegroundColor White
    Write-Host ""
    if ($response.recepcion) {
        Write-Host "Recepción:" -ForegroundColor Cyan
        Write-Host "  Número: $($response.recepcion.numero)" -ForegroundColor White
        Write-Host ""
    }
    Write-Host "Totales:" -ForegroundColor Cyan
    Write-Host "  Subtotal: S/ $($response.subtotal)" -ForegroundColor White
    Write-Host "  IGV: S/ $($response.igv)" -ForegroundColor White
    Write-Host "  Total: S/ $($response.total)" -ForegroundColor White
    Write-Host ""
    Write-Host "Items ($($response.items.Count)):" -ForegroundColor Cyan
    foreach ($item in $response.items) {
        Write-Host "  - $($item.producto.nombre) (Código: $($item.producto.codigo))" -ForegroundColor White
        Write-Host "    Cantidad: $($item.cantidad)" -ForegroundColor Gray
        Write-Host "    Precio Unit: S/ $($item.precio_unitario)" -ForegroundColor Gray
        Write-Host "    Subtotal: S/ $($item.subtotal)" -ForegroundColor Gray
        if ($item.lote) {
            Write-Host "    Lote: $($item.lote)" -ForegroundColor Gray
        }
        if ($item.motivo_detalle) {
            Write-Host "    Motivo: $($item.motivo_detalle)" -ForegroundColor Gray
        }
        Write-Host ""
    }
    Write-Host ""
    Write-Host "Full JSON Response:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test: Get non-existent devolucion (should return 404)
Write-Host "Step 3: Testing with non-existent ID (should fail)..." -ForegroundColor Yellow
$fakeId = "00000000-0000-0000-0000-000000000000"
Write-Host "GET $baseUrl/api/compras/devoluciones/$fakeId`?tenant_id=$tenantId" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/compras/devoluciones/$fakeId`?tenant_id=$tenantId" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop

    Write-Host "❌ UNEXPECTED SUCCESS - Should have returned 404" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 404 -or $_.ErrorDetails.Message -like "*not found*" -or $_.ErrorDetails.Message -like "*no encontrada*") {
        Write-Host "✅ EXPECTED FAILURE - 404 Not Found" -ForegroundColor Green
        Write-Host "Error message: $($_.ErrorDetails.Message)" -ForegroundColor Gray
    } else {
        Write-Host "❌ UNEXPECTED ERROR" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST COMPLETED" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
