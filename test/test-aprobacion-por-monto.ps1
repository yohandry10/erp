# Test script para verificar la evaluación de aprobación por monto en órdenes de compra
# Este script prueba que las órdenes de compra se crean con estado APROBACION cuando el total excede el monto configurado

$baseUrl = "http://localhost:3000"
$token = "REPLACE_WITH_TEST_JWT"
$tenantId = "550e8400-e29b-41d4-a716-446655440000"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST: Evaluación de Aprobación por Monto" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Obtener un proveedor existente
Write-Host "1. Obteniendo proveedor..." -ForegroundColor Yellow
try {
    $proveedoresResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/proveedores?limit=1" -Method Get -Headers $headers
    $proveedorId = $proveedoresResponse.data[0].id
    Write-Host "   ✓ Proveedor obtenido: $proveedorId" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Error al obtener proveedor: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Paso 2: Obtener un producto existente
Write-Host "2. Obteniendo producto..." -ForegroundColor Yellow
try {
    $productosResponse = Invoke-RestMethod -Uri "$baseUrl/api/inventario/productos?limit=1" -Method Get -Headers $headers
    $productoId = $productosResponse.data[0].id
    $productoNombre = $productosResponse.data[0].nombre
    Write-Host "   ✓ Producto obtenido: $productoNombre" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Error al obtener producto: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Paso 3: Crear OC con monto BAJO (no requiere aprobación)
Write-Host ""
Write-Host "3. Creando OC con monto bajo (< 10,000)..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$ocBaja = @{
    numero = "OC-TEST-BAJO-$timestamp"
    proveedor_id = $proveedorId
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO_30"
    dias_credito = 30
    observaciones = "Test de aprobación - monto bajo"
    detalles = @(
        @{
            producto_id = $productoId
            descripcion = $productoNombre
            cantidad = 2
            precio_unitario = 1000.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $ocBajaResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes" -Method Post -Headers $headers -Body $ocBaja
    Write-Host "   ✓ OC creada: $($ocBajaResponse.numero)" -ForegroundColor Green
    Write-Host "   ✓ Estado: $($ocBajaResponse.estado)" -ForegroundColor Green
    Write-Host "   ✓ Total: $($ocBajaResponse.total)" -ForegroundColor Green

    if ($ocBajaResponse.estado -eq "BORRADOR" -or $ocBajaResponse.estado -eq "PENDIENTE") {
        Write-Host "   ✓ CORRECTO: OC con monto bajo NO requiere aprobación" -ForegroundColor Green
    } else {
        Write-Host "   ✗ ERROR: OC con monto bajo debería estar en BORRADOR o PENDIENTE, no en $($ocBajaResponse.estado)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ Error al crear OC: $($_.Exception.Message)" -ForegroundColor Red
}

# Paso 4: Crear OC con monto ALTO (requiere aprobación)
Write-Host ""
Write-Host "4. Creando OC con monto alto (> 10,000)..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$ocAlta = @{
    numero = "OC-TEST-ALTO-$timestamp"
    proveedor_id = $proveedorId
    fecha_orden = (Get-Date).ToString("yyyy-MM-dd")
    fecha_entrega_esperada = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
    condiciones_pago = "CREDITO_30"
    dias_credito = 30
    observaciones = "Test de aprobación - monto alto"
    detalles = @(
        @{
            producto_id = $productoId
            descripcion = $productoNombre
            cantidad = 20
            precio_unitario = 1000.00
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $ocAltaResponse = Invoke-RestMethod -Uri "$baseUrl/api/compras/ordenes" -Method Post -Headers $headers -Body $ocAlta
    Write-Host "   ✓ OC creada: $($ocAltaResponse.numero)" -ForegroundColor Green
    Write-Host "   ✓ Estado: $($ocAltaResponse.estado)" -ForegroundColor Green
    Write-Host "   ✓ Total: $($ocAltaResponse.total)" -ForegroundColor Green

    if ($ocAltaResponse.estado -eq "APROBACION") {
        Write-Host "   ✓ CORRECTO: OC con monto alto requiere aprobación" -ForegroundColor Green
    } else {
        Write-Host "   ✗ ERROR: OC con monto alto debería estar en APROBACION, no en $($ocAltaResponse.estado)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ Error al crear OC: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST COMPLETADO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
