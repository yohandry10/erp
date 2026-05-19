# Test script para listar asientos contables con filtros
# Endpoint: GET /api/contabilidad/asientos

$baseUrl = "http://localhost:3000/api"

Write-Host "🧪 TEST: Listar Asientos Contables con Filtros" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Login para obtener token
Write-Host "1️⃣ Iniciando sesión..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@vierdes.com"
    password = "Admin123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    $tenantId = $loginResponse.user.tenant_id

    Write-Host "✅ Login exitoso" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host "   Tenant ID: $tenantId" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Error en login: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
    "x-tenant-id" = $tenantId
}

# 2. Listar todos los asientos (sin filtros)
Write-Host "2️⃣ Listando todos los asientos (página 1, límite 10)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/asientos?page=1&limit=10" -Method Get -Headers $headers

    Write-Host "✅ Asientos obtenidos exitosamente" -ForegroundColor Green
    Write-Host "   Total de asientos: $($response.total)" -ForegroundColor Gray
    Write-Host "   Página actual: $($response.page)" -ForegroundColor Gray
    Write-Host "   Límite por página: $($response.limit)" -ForegroundColor Gray
    Write-Host "   Total de páginas: $($response.totalPages)" -ForegroundColor Gray
    Write-Host "   Asientos en esta página: $($response.data.Count)" -ForegroundColor Gray
    Write-Host ""

    if ($response.data.Count -gt 0) {
        Write-Host "   📋 Primeros asientos:" -ForegroundColor Cyan
        $response.data | Select-Object -First 3 | ForEach-Object {
            Write-Host "      - $($_.numero_asiento) | Fecha: $($_.fecha) | Estado: $($_.estado)" -ForegroundColor Gray
            Write-Host "        Concepto: $($_.concepto)" -ForegroundColor DarkGray
            Write-Host "        Debe: $($_.total_debe) | Haber: $($_.total_haber)" -ForegroundColor DarkGray
            if ($_.detalles) {
                Write-Host "        Detalles: $($_.detalles.Count) línea(s)" -ForegroundColor DarkGray
            }
            Write-Host ""
        }
    }
} catch {
    Write-Host "❌ Error listando asientos: $_" -ForegroundColor Red
    Write-Host $_.Exception.Response.StatusCode -ForegroundColor Red
}

# 3. Filtrar por fecha
Write-Host "3️⃣ Filtrando asientos por fecha (último mes)..." -ForegroundColor Yellow
$fechaDesde = (Get-Date).AddMonths(-1).ToString("yyyy-MM-dd")
$fechaHasta = (Get-Date).ToString("yyyy-MM-dd")

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/asientos?fecha_desde=$fechaDesde&fecha_hasta=$fechaHasta&limit=5" -Method Get -Headers $headers

    Write-Host "✅ Asientos filtrados por fecha obtenidos" -ForegroundColor Green
    Write-Host "   Fecha desde: $fechaDesde" -ForegroundColor Gray
    Write-Host "   Fecha hasta: $fechaHasta" -ForegroundColor Gray
    Write-Host "   Total encontrados: $($response.total)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Error filtrando por fecha: $_" -ForegroundColor Red
}

# 4. Filtrar por estado
Write-Host "4️⃣ Filtrando asientos por estado (CONFIRMADO)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/asientos?estado=CONFIRMADO&limit=5" -Method Get -Headers $headers

    Write-Host "✅ Asientos confirmados obtenidos" -ForegroundColor Green
    Write-Host "   Total confirmados: $($response.total)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Error filtrando por estado: $_" -ForegroundColor Red
}

# 5. Buscar por número de asiento
Write-Host "5️⃣ Buscando asientos por número..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/asientos?numero_asiento=A-&limit=5" -Method Get -Headers $headers

    Write-Host "✅ Búsqueda por número completada" -ForegroundColor Green
    Write-Host "   Total encontrados: $($response.total)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Error buscando por número: $_" -ForegroundColor Red
}

# 6. Obtener un asiento específico por ID (si existe alguno)
Write-Host "6️⃣ Obteniendo un asiento específico por ID..." -ForegroundColor Yellow
try {
    $listResponse = Invoke-RestMethod -Uri "$baseUrl/contabilidad/asientos?limit=1" -Method Get -Headers $headers

    if ($listResponse.data.Count -gt 0) {
        $asientoId = $listResponse.data[0].id
        $response = Invoke-RestMethod -Uri "$baseUrl/contabilidad/asientos/$asientoId" -Method Get -Headers $headers

        Write-Host "✅ Asiento obtenido exitosamente" -ForegroundColor Green
        Write-Host "   ID: $($response.data.id)" -ForegroundColor Gray
        Write-Host "   Número: $($response.data.numero_asiento)" -ForegroundColor Gray
        Write-Host "   Fecha: $($response.data.fecha)" -ForegroundColor Gray
        Write-Host "   Concepto: $($response.data.concepto)" -ForegroundColor Gray
        Write-Host "   Estado: $($response.data.estado)" -ForegroundColor Gray
        Write-Host "   Total Debe: $($response.data.total_debe)" -ForegroundColor Gray
        Write-Host "   Total Haber: $($response.data.total_haber)" -ForegroundColor Gray

        if ($response.data.detalles) {
            Write-Host ""
            Write-Host "   📋 Detalles del asiento:" -ForegroundColor Cyan
            $response.data.detalles | ForEach-Object {
                Write-Host "      - Cuenta: $($_.cuenta_codigo) - $($_.cuenta_nombre)" -ForegroundColor Gray
                Write-Host "        Debe: $($_.debe) | Haber: $($_.haber)" -ForegroundColor DarkGray
                Write-Host "        Concepto: $($_.concepto)" -ForegroundColor DarkGray
                if ($_.centro_costo_nombre) {
                    Write-Host "        Centro de Costo: $($_.centro_costo_nombre)" -ForegroundColor DarkGray
                }
                Write-Host ""
            }
        }
    } else {
        Write-Host "⚠️ No hay asientos disponibles para obtener por ID" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error obteniendo asiento por ID: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "✅ TEST COMPLETADO" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
