# Script de Verificación de Monitoreo
# Verifica que todos los componentes de monitoreo estén funcionando

Write-Host "🔍 Verificando Sistema de Monitoreo" -ForegroundColor Cyan
Write-Host ""

$allOk = $true

# 1. Verificar contenedores Docker
Write-Host "📦 Verificando contenedores Docker..." -ForegroundColor Yellow
$containers = @(
    @{Name="erp-api"; Port=3001},
    @{Name="prometheus"; Port=9090},
    @{Name="grafana"; Port=3000},
    @{Name="redis"; Port=6379},
    @{Name="redis-exporter"; Port=9121},
    @{Name="node-exporter"; Port=9100}
)

foreach ($container in $containers) {
    $status = docker ps --filter "name=$($container.Name)" --format "{{.Status}}" 2>$null
    if ($status -match "Up") {
        Write-Host "  ✅ $($container.Name): Running" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($container.Name): Not running" -ForegroundColor Red
        $allOk = $false
    }
}

# 2. Verificar endpoints HTTP
Write-Host ""
Write-Host "🌐 Verificando endpoints HTTP..." -ForegroundColor Yellow

$endpoints = @(
    @{Name="ERP API Health"; Url="http://localhost:3001/api/health"},
    @{Name="ERP API Metrics"; Url="http://localhost:3001/api/metrics"},
    @{Name="Prometheus"; Url="http://localhost:9090/-/healthy"},
    @{Name="Grafana"; Url="http://localhost:3000/api/health"}
)

foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-WebRequest -Uri $endpoint.Url -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "  ✅ $($endpoint.Name): OK" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  $($endpoint.Name): Status $($response.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  ❌ $($endpoint.Name): No responde" -ForegroundColor Red
        $allOk = $false
    }
}

# 3. Verificar métricas específicas
Write-Host ""
Write-Host "📊 Verificando métricas..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/metrics" -UseBasicParsing -TimeoutSec 5
    $content = $response.Content
    
    $expectedMetrics = @(
        "erp_http_requests_total",
        "erp_http_request_duration_seconds",
        "process_cpu_user_seconds_total",
        "process_resident_memory_bytes",
        "nodejs_heap_size_total_bytes"
    )
    
    foreach ($metric in $expectedMetrics) {
        if ($content -match $metric) {
            Write-Host "  ✅ $metric" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $metric: No encontrada" -ForegroundColor Red
            $allOk = $false
        }
    }
    
    # Contar total de métricas
    $totalMetrics = ($content -split "`n" | Where-Object { $_ -match "^[a-z]" -and $_ -notmatch "^#" }).Count
    Write-Host ""
    Write-Host "  📈 Total de métricas expuestas: $totalMetrics" -ForegroundColor Cyan
    
} catch {
    Write-Host "  ❌ No se pudieron obtener las métricas" -ForegroundColor Red
    $allOk = $false
}

# 4. Verificar targets de Prometheus
Write-Host ""
Write-Host "🎯 Verificando targets de Prometheus..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:9090/api/v1/targets" -UseBasicParsing -TimeoutSec 5
    $targets = ($response.Content | ConvertFrom-Json).data.activeTargets
    
    foreach ($target in $targets) {
        $job = $target.labels.job
        $health = $target.health
        
        if ($health -eq "up") {
            Write-Host "  ✅ $job`: UP" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $job`: $health" -ForegroundColor Red
            $allOk = $false
        }
    }
} catch {
    Write-Host "  ❌ No se pudieron obtener los targets de Prometheus" -ForegroundColor Red
    $allOk = $false
}

# 5. Verificar datasource de Grafana
Write-Host ""
Write-Host "📊 Verificando datasource de Grafana..." -ForegroundColor Yellow

try {
    # Grafana requiere autenticación
    $base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin"))
    $headers = @{
        Authorization = "Basic $base64Auth"
    }
    
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/datasources" -Headers $headers -UseBasicParsing -TimeoutSec 5
    $datasources = $response.Content | ConvertFrom-Json
    
    $prometheusDs = $datasources | Where-Object { $_.type -eq "prometheus" }
    
    if ($prometheusDs) {
        Write-Host "  ✅ Datasource Prometheus configurado" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Datasource Prometheus no encontrado" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠️  No se pudo verificar datasource (puede requerir login manual)" -ForegroundColor Yellow
}

# 6. Verificar uso de recursos
Write-Host ""
Write-Host "💻 Uso de recursos..." -ForegroundColor Yellow

$stats = docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>$null
if ($stats) {
    Write-Host $stats
} else {
    Write-Host "  ⚠️  No se pudo obtener estadísticas de recursos" -ForegroundColor Yellow
}

# 7. Resumen final
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan

if ($allOk) {
    Write-Host "✅ TODOS LOS COMPONENTES FUNCIONANDO CORRECTAMENTE" -ForegroundColor Green
} else {
    Write-Host "⚠️  ALGUNOS COMPONENTES TIENEN PROBLEMAS" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Sugerencias:" -ForegroundColor Yellow
    Write-Host "  1. Verificar logs: docker-compose logs [servicio]" -ForegroundColor White
    Write-Host "  2. Reiniciar servicios: docker-compose restart" -ForegroundColor White
    Write-Host "  3. Reconstruir: docker-compose up -d --build" -ForegroundColor White
}

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

# 8. Información adicional
Write-Host "📚 Recursos adicionales:" -ForegroundColor Yellow
Write-Host "  • Documentación: monitoring/README.md" -ForegroundColor White
Write-Host "  • Guía de integración: docs/GUIA_INTEGRACION_METRICAS.md" -ForegroundColor White
Write-Host ""
Write-Host "🔗 URLs:" -ForegroundColor Yellow
Write-Host "  • Prometheus: http://localhost:9090" -ForegroundColor White
Write-Host "  • Grafana: http://localhost:3000 (admin/admin)" -ForegroundColor White
Write-Host "  • Métricas: http://localhost:3001/api/metrics" -ForegroundColor White
Write-Host ""
