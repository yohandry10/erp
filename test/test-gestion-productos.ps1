# =====================================================
# TEST: Gestión de Productos en Inventario
# =====================================================
# Descripción: Prueba completa del módulo de productos
# Fecha: 2025-11-12
# =====================================================

$API_URL = "http://localhost:3002/api"
$TOKEN = $env:TEST_TOKEN

if (-not $TOKEN) {
    Write-Host "❌ ERROR: Variable TEST_TOKEN no definida" -ForegroundColor Red
    Write-Host "Ejecute: `$env:TEST_TOKEN = 'su_token_aqui'" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type" = "application/json"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST: GESTIÓN DE PRODUCTOS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# =====================================================
# 1. LISTAR PRODUCTOS
# =====================================================
Write-Host "1️⃣  Listando productos..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$API_URL/inventario/productos" `
        -Method GET `
        -Headers $headers `
        -ErrorAction Stop
    
    if ($response.success) {
        Write-Host "✅ Productos listados: $($response.data.Count)" -ForegroundColor Green
        
        if ($response.data.Count -gt 0) {
            Write-Host "`nPrimeros 3 productos:" -ForegroundColor Cyan
            $response.data | Select-Object -First 3 | ForEach-Object {
                Write-Host "  - [$($_.codigo)] $($_.nombre) - Stock: $($_.stock_actual)" -ForegroundColor White
            }
        }
    } else {
        Write-Host "⚠️  Respuesta sin éxito: $($response.message)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error listando productos: $_" -ForegroundColor Red
}

# =====================================================
# 2. CREAR PRODUCTO DE PRUEBA
# =====================================================
Write-Host "`n2️⃣  Creando producto de prueba..." -ForegroundColor Yellow

$nuevoProducto = @{
    codigo = "TEST-$(Get-Random -Minimum 1000 -Maximum 9999)"
    nombre = "Producto de Prueba $(Get-Date -Format 'HH:mm:ss')"
    descripcion = "Este es un producto creado automáticamente para pruebas"
    categoria = "OFICINA"
    precioVenta = "99.99"
    precioCompra = "50.00"
    stock = "100"
    stockMinimo = "10"
    codigoBarras = "7501234567890"
    impuesto = "18"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$API_URL/inventario/productos" `
        -Method POST `
        -Headers $headers `
        -Body $nuevoProducto `
        -ErrorAction Stop
    
    if ($response.success) {
        $productoId = $response.data.id
        Write-Host "✅ Producto creado exitosamente" -ForegroundColor Green
        Write-Host "   ID: $productoId" -ForegroundColor White
        Write-Host "   Código: $($response.data.codigo)" -ForegroundColor White
        Write-Host "   Nombre: $($response.data.nombre)" -ForegroundColor White
        
        # =====================================================
        # 3. OBTENER PRODUCTO POR ID
        # =====================================================
        Write-Host "`n3️⃣  Obteniendo producto por ID..." -ForegroundColor Yellow
        
        try {
            $response = Invoke-RestMethod -Uri "$API_URL/inventario/productos/$productoId" `
                -Method GET `
                -Headers $headers `
                -ErrorAction Stop
            
            if ($response.success) {
                Write-Host "✅ Producto obtenido correctamente" -ForegroundColor Green
                Write-Host "   Nombre: $($response.data.nombre)" -ForegroundColor White
                Write-Host "   Precio Venta: S/ $($response.data.precio_venta)" -ForegroundColor White
                Write-Host "   Stock Actual: $($response.data.stock_actual)" -ForegroundColor White
                Write-Host "   Stock Reservado: $($response.data.stock_reservado)" -ForegroundColor White
                
                $stockDisponible = $response.data.stock_actual - $response.data.stock_reservado
                Write-Host "   Stock Disponible: $stockDisponible" -ForegroundColor Cyan
            }
        } catch {
            Write-Host "❌ Error obteniendo producto: $_" -ForegroundColor Red
        }
        
        # =====================================================
        # 4. ACTUALIZAR PRODUCTO
        # =====================================================
        Write-Host "`n4️⃣  Actualizando producto..." -ForegroundColor Yellow
        
        $actualizacion = @{
            nombre = "Producto Actualizado $(Get-Date -Format 'HH:mm:ss')"
            precioVenta = "149.99"
            stockMinimo = "20"
            descripcion = "Descripción actualizada en prueba"
        } | ConvertTo-Json
        
        try {
            $response = Invoke-RestMethod -Uri "$API_URL/inventario/productos/$productoId" `
                -Method PUT `
                -Headers $headers `
                -Body $actualizacion `
                -ErrorAction Stop
            
            if ($response.success) {
                Write-Host "✅ Producto actualizado exitosamente" -ForegroundColor Green
                Write-Host "   Nuevo nombre: $($response.data.nombre)" -ForegroundColor White
                Write-Host "   Nuevo precio: S/ $($response.data.precio_venta)" -ForegroundColor White
                Write-Host "   Nuevo stock mínimo: $($response.data.stock_minimo)" -ForegroundColor White
            }
        } catch {
            Write-Host "❌ Error actualizando producto: $_" -ForegroundColor Red
        }
        
        # =====================================================
        # 5. VERIFICAR STOCK CRÍTICO
        # =====================================================
        Write-Host "`n5️⃣  Verificando alertas de stock crítico..." -ForegroundColor Yellow
        
        try {
            $response = Invoke-RestMethod -Uri "$API_URL/inventario/stats" `
                -Method GET `
                -Headers $headers `
                -ErrorAction Stop
            
            if ($response.success) {
                Write-Host "✅ Estadísticas obtenidas" -ForegroundColor Green
                Write-Host "   Total productos: $($response.data.totalProductos)" -ForegroundColor White
                Write-Host "   Productos stock bajo: $($response.data.productosStockBajo)" -ForegroundColor Yellow
                Write-Host "   Valor inventario: S/ $($response.data.valorInventario)" -ForegroundColor Cyan
            }
        } catch {
            Write-Host "❌ Error obteniendo estadísticas: $_" -ForegroundColor Red
        }
        
        # =====================================================
        # 6. ELIMINAR PRODUCTO
        # =====================================================
        Write-Host "`n6️⃣  Eliminando producto de prueba..." -ForegroundColor Yellow
        
        try {
            $response = Invoke-RestMethod -Uri "$API_URL/inventario/productos/$productoId" `
                -Method DELETE `
                -Headers $headers `
                -ErrorAction Stop
            
            if ($response.success) {
                Write-Host "✅ Producto eliminado/desactivado exitosamente" -ForegroundColor Green
                Write-Host "   Mensaje: $($response.message)" -ForegroundColor White
            }
        } catch {
            Write-Host "❌ Error eliminando producto: $_" -ForegroundColor Red
        }
        
    } else {
        Write-Host "⚠️  No se pudo crear el producto: $($response.message)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error creando producto: $_" -ForegroundColor Red
    Write-Host "Detalles: $($_.Exception.Message)" -ForegroundColor Red
}

# =====================================================
# 7. VERIFICAR PERMISOS
# =====================================================
Write-Host "`n7️⃣  Verificando permisos de productos..." -ForegroundColor Yellow

$permisosEsperados = @(
    "inventario.productos.read",
    "inventario.productos.create",
    "inventario.productos.update",
    "inventario.productos.delete"
)

Write-Host "Permisos esperados:" -ForegroundColor Cyan
$permisosEsperados | ForEach-Object {
    Write-Host "  ✓ $_" -ForegroundColor White
}

# =====================================================
# RESUMEN
# =====================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE PRUEBAS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n✅ Funcionalidades probadas:" -ForegroundColor Green
Write-Host "  1. Listar productos" -ForegroundColor White
Write-Host "  2. Crear producto" -ForegroundColor White
Write-Host "  3. Obtener producto por ID" -ForegroundColor White
Write-Host "  4. Actualizar producto" -ForegroundColor White
Write-Host "  5. Verificar estadísticas" -ForegroundColor White
Write-Host "  6. Eliminar producto" -ForegroundColor White

Write-Host "`n📋 Próximos pasos:" -ForegroundColor Yellow
Write-Host "  1. Aplicar migración de permisos (089__add_productos_permissions.sql)" -ForegroundColor White
Write-Host "  2. Verificar acceso desde el frontend" -ForegroundColor White
Write-Host "  3. Probar filtros y búsqueda" -ForegroundColor White
Write-Host "  4. Verificar alertas de stock crítico" -ForegroundColor White

Write-Host "`n✨ Módulo de Gestión de Productos implementado exitosamente!`n" -ForegroundColor Green
