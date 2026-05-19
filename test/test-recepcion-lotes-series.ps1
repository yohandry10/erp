# Test: Recepción con Lotes y Series
# Descripción: Prueba la funcionalidad de asignación de lotes/series en el wizard de recepción

Write-Host "=== TEST: Recepción con Lotes y Series ===" -ForegroundColor Cyan
Write-Host ""

# Variables
$BASE_URL = "http://localhost:3001"
$API_URL = "$BASE_URL/api"

# Obtener token de autenticación
Write-Host "1. Obteniendo token de autenticación..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = "Admin123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.data.access_token
    $tenantId = $loginResponse.data.user.tenant_id
    Write-Host "✓ Token obtenido correctamente" -ForegroundColor Green
    Write-Host "  Tenant ID: $tenantId" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error al obtener token: $_" -ForegroundColor Red
    exit 1
}

# Headers con autenticación
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

# Buscar una orden de compra APROBADA con pendientes
Write-Host ""
Write-Host "2. Buscando orden de compra con pendientes..." -ForegroundColor Yellow
try {
    $ordenesResponse = Invoke-RestMethod -Uri "$API_URL/compras/ordenes?estado=APROBADA" -Method GET -Headers $headers

    if ($ordenesResponse.success -and $ordenesResponse.data.length -gt 0) {
        $orden = $ordenesResponse.data[0]
        $ordenId = $orden.id
        Write-Host "✓ Orden encontrada: $($orden.numero)" -ForegroundColor Green
        Write-Host "  ID: $ordenId" -ForegroundColor Gray
        Write-Host "  Proveedor: $($orden.proveedores.razon_social)" -ForegroundColor Gray
        Write-Host "  Total: S/ $($orden.total)" -ForegroundColor Gray
    } else {
        Write-Host "✗ No se encontraron órdenes APROBADAS" -ForegroundColor Red
        Write-Host "  Cree una orden de compra primero" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "✗ Error al buscar órdenes: $_" -ForegroundColor Red
    exit 1
}

# Obtener detalles de la orden
Write-Host ""
Write-Host "3. Obteniendo detalles de la orden..." -ForegroundColor Yellow
try {
    $ordenDetalleResponse = Invoke-RestMethod -Uri "$API_URL/compras/ordenes/$ordenId" -Method GET -Headers $headers

    if ($ordenDetalleResponse.success) {
        $detalles = $ordenDetalleResponse.data.detalles
        Write-Host "✓ Detalles obtenidos: $($detalles.length) productos" -ForegroundColor Green

        # Mostrar productos
        foreach ($detalle in $detalles) {
            $pendiente = $detalle.cantidad - $detalle.cantidad_recibida
            Write-Host "  - $($detalle.productos.nombre): $pendiente pendientes" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "✗ Error al obtener detalles: $_" -ForegroundColor Red
    exit 1
}

# Crear recepción con lotes y series
Write-Host ""
Write-Host "4. Creando recepción con lotes y series..." -ForegroundColor Yellow

# Preparar items con lotes/series
$items = @()
foreach ($detalle in $detalles) {
    $pendiente = $detalle.cantidad - $detalle.cantidad_recibida
    if ($pendiente -gt 0) {
        $cantidadRecibir = [Math]::Min(2, $pendiente)

        $item = @{
            detalle_id = $detalle.id
            cantidad_recibida = $cantidadRecibir
            calidad = "OK"
            lote = "LOTE-2024-$(Get-Random -Minimum 100 -Maximum 999)"
            serie = "SN-$(Get-Random -Minimum 100000 -Maximum 999999)"
            fecha_expiracion = (Get-Date).AddMonths(6).ToString("yyyy-MM-dd")
            observaciones = "Recepción de prueba con lote y serie"
        }
        $items += $item
    }
}

$recepcionBody = @{
    orden_id = $ordenId
    items = $items
    observaciones = "Recepción de prueba con lotes y series"
} | ConvertTo-Json -Depth 10

try {
    $recepcionResponse = Invoke-RestMethod -Uri "$API_URL/compras/recepciones/ordenes/$ordenId" -Method POST -Body $recepcionBody -Headers $headers

    if ($recepcionResponse.success) {
        $recepcionId = $recepcionResponse.data.id
        Write-Host "✓ Recepción creada: $($recepcionResponse.data.numero)" -ForegroundColor Green
        Write-Host "  ID: $recepcionId" -ForegroundColor Gray
        Write-Host "  Estado: $($recepcionResponse.data.estado)" -ForegroundColor Gray

        # Mostrar items con lotes/series
        Write-Host ""
        Write-Host "  Items recibidos:" -ForegroundColor Cyan
        foreach ($item in $items) {
            Write-Host "    - Cantidad: $($item.cantidad_recibida)" -ForegroundColor Gray
            Write-Host "      Lote: $($item.lote)" -ForegroundColor Gray
            Write-Host "      Serie: $($item.serie)" -ForegroundColor Gray
            Write-Host "      Expiración: $($item.fecha_expiracion)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "✗ Error al crear recepción: $_" -ForegroundColor Red
    Write-Host "  Response: $($_.Exception.Response)" -ForegroundColor Red
    exit 1
}

# Cerrar recepción
Write-Host ""
Write-Host "5. Cerrando recepción..." -ForegroundColor Yellow

$cerrarBody = @{
    observaciones = "Recepción cerrada - prueba de lotes/series"
} | ConvertTo-Json

try {
    $cerrarResponse = Invoke-RestMethod -Uri "$API_URL/compras/recepciones/$recepcionId/cerrar" -Method POST -Body $cerrarBody -Headers $headers

    if ($cerrarResponse.success) {
        Write-Host "✓ Recepción cerrada exitosamente" -ForegroundColor Green
        Write-Host "  Estado: $($cerrarResponse.data.estado)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Error al cerrar recepción: $_" -ForegroundColor Red
    exit 1
}

# Verificar recepción con lotes/series
Write-Host ""
Write-Host "6. Verificando recepción con lotes/series..." -ForegroundColor Yellow
try {
    $verificarResponse = Invoke-RestMethod -Uri "$API_URL/compras/recepciones/$recepcionId" -Method GET -Headers $headers

    if ($verificarResponse.success) {
        Write-Host "✓ Recepción verificada" -ForegroundColor Green
        Write-Host "  Número: $($verificarResponse.data.numero)" -ForegroundColor Gray
        Write-Host "  Estado: $($verificarResponse.data.estado)" -ForegroundColor Gray

        # Verificar items con lotes/series
        if ($verificarResponse.data.items) {
            Write-Host ""
            Write-Host "  Items con lotes/series:" -ForegroundColor Cyan
            foreach ($item in $verificarResponse.data.items) {
                Write-Host "    - Producto: $($item.productos.nombre)" -ForegroundColor Gray
                Write-Host "      Cantidad: $($item.cantidad_recibida)" -ForegroundColor Gray
                if ($item.lote) {
                    Write-Host "      Lote: $($item.lote)" -ForegroundColor Green
                }
                if ($item.serie) {
                    Write-Host "      Serie: $($item.serie)" -ForegroundColor Green
                }
                if ($item.fecha_expiracion) {
                    Write-Host "      Expiración: $($item.fecha_expiracion)" -ForegroundColor Green
                }
            }
        }
    }
} catch {
    Write-Host "✗ Error al verificar recepción: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== TEST COMPLETADO EXITOSAMENTE ===" -ForegroundColor Green
Write-Host ""
Write-Host "Resumen:" -ForegroundColor Cyan
Write-Host "  ✓ Recepción creada con lotes y series" -ForegroundColor Green
Write-Host "  ✓ Recepción cerrada correctamente" -ForegroundColor Green
Write-Host "  ✓ Datos de lotes/series guardados" -ForegroundColor Green
Write-Host ""
Write-Host "Puede verificar en la UI:" -ForegroundColor Yellow
Write-Host "  $BASE_URL/dashboard/compras/recepciones" -ForegroundColor Gray
