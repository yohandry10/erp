# Test: Proveedores con Mayor Deuda
# Endpoint: GET /api/finanzas/cxp/proveedores-mayor-deuda
#
# Este endpoint genera un ranking de proveedores ordenados por el monto total
# de deuda pendiente. Incluye:
# - Deuda total por proveedor
# - Cantidad de CxP pendientes
# - Desglose de deuda por moneda
# - Información de contacto del proveedor
#
# Parámetros opcionales:
# - limite: Número máximo de proveedores a retornar (ej: ?limite=5 para top 5)
#
# Casos de uso:
# - Identificar proveedores prioritarios para pagos
# - Análisis de concentración de deuda
# - Planificación de flujo de caja

$baseUrl = "http://localhost:3000/api"

Write-Host "=== TEST: PROVEEDORES CON MAYOR DEUDA ===" -ForegroundColor Cyan
Write-Host ""

# 1. Login
Write-Host "1. Autenticando usuario..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = "Admin123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    $tenantId = $loginResponse.user.tenant_id
    Write-Host "✓ Login exitoso" -ForegroundColor Green
    Write-Host "  Tenant ID: $tenantId" -ForegroundColor Gray
} catch {
    Write-Host "✗ Error en login: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

Write-Host ""

# 2. Obtener proveedores con mayor deuda (sin límite)
Write-Host "2. Obteniendo proveedores con mayor deuda (todos)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/finanzas/cxp/proveedores-mayor-deuda" -Method Get -Headers $headers

    Write-Host "✓ Reporte generado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Fecha del reporte: $($response.data.fecha_reporte)" -ForegroundColor Cyan
    Write-Host "Total proveedores con deuda: $($response.data.total_proveedores_con_deuda)" -ForegroundColor Cyan
    Write-Host "Total proveedores en reporte: $($response.data.total_proveedores)" -ForegroundColor Cyan
    Write-Host "Deuda total: $($response.data.total_deuda)" -ForegroundColor Cyan
    Write-Host ""

    if ($response.data.proveedores.Count -gt 0) {
        Write-Host "Top proveedores con mayor deuda:" -ForegroundColor Yellow
        Write-Host ""

        $counter = 1
        foreach ($proveedor in $response.data.proveedores) {
            Write-Host "$counter. $($proveedor.razon_social) (RUC: $($proveedor.ruc))" -ForegroundColor White
            Write-Host "   Deuda total: $($proveedor.deuda_total)" -ForegroundColor Cyan
            Write-Host "   Cantidad de CxP: $($proveedor.cantidad_cxp)" -ForegroundColor Gray

            if ($proveedor.deuda_por_moneda) {
                Write-Host "   Deuda por moneda:" -ForegroundColor Gray
                foreach ($moneda in $proveedor.deuda_por_moneda.PSObject.Properties) {
                    Write-Host "     - $($moneda.Name): $($moneda.Value)" -ForegroundColor Gray
                }
            }

            if ($proveedor.email) {
                Write-Host "   Email: $($proveedor.email)" -ForegroundColor Gray
            }
            if ($proveedor.telefono) {
                Write-Host "   Teléfono: $($proveedor.telefono)" -ForegroundColor Gray
            }

            Write-Host ""
            $counter++

            # Mostrar solo los primeros 10 en consola
            if ($counter -gt 10) {
                Write-Host "   ... y $($response.data.proveedores.Count - 10) proveedores más" -ForegroundColor Gray
                break
            }
        }
    } else {
        Write-Host "No hay proveedores con deuda pendiente" -ForegroundColor Yellow
    }

} catch {
    Write-Host "✗ Error obteniendo proveedores: $_" -ForegroundColor Red
    Write-Host $_.Exception.Response.StatusCode -ForegroundColor Red
}

Write-Host ""

# 3. Obtener top 5 proveedores con mayor deuda
Write-Host "3. Obteniendo top 5 proveedores con mayor deuda..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/finanzas/cxp/proveedores-mayor-deuda?limite=5" -Method Get -Headers $headers

    Write-Host "✓ Reporte top 5 generado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Total proveedores en reporte: $($response.data.total_proveedores)" -ForegroundColor Cyan
    Write-Host "Deuda total (top 5): $($response.data.total_deuda)" -ForegroundColor Cyan
    Write-Host ""

    if ($response.data.proveedores.Count -gt 0) {
        Write-Host "Top 5 proveedores con mayor deuda:" -ForegroundColor Yellow
        Write-Host ""

        $counter = 1
        foreach ($proveedor in $response.data.proveedores) {
            Write-Host "$counter. $($proveedor.razon_social)" -ForegroundColor White
            Write-Host "   Deuda: $($proveedor.deuda_total) | CxP: $($proveedor.cantidad_cxp)" -ForegroundColor Cyan
            $counter++
        }
    }

} catch {
    Write-Host "✗ Error obteniendo top 5: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== FIN DEL TEST ===" -ForegroundColor Cyan
