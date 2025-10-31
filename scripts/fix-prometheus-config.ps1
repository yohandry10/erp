# Script para corregir la configuración de Prometheus
# Actualiza la ruta de métricas de /api/v1/metrics a /api/metrics

Write-Host "🔧 Corrigiendo configuración de Prometheus..." -ForegroundColor Cyan
Write-Host ""

# 1. Verificar que Prometheus esté corriendo
Write-Host "📦 Verificando contenedor de Prometheus..." -ForegroundColor Yellow
$prometheusContainer = docker ps --filter "name=prometheus" --format "{{.Names}}" 2>$null

if (!$prometheusContainer) {
    Write-Host "❌ Prometheus no está corriendo" -ForegroundColor Red
    Write-Host "   Inicie Prometheus con: docker-compose up -d prometheus" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Prometheus encontrado: $prometheusContainer" -ForegroundColor Green

# 2. Crear configuración corregida
Write-Host ""
Write-Host "📝 Creando configuración corregida..." -ForegroundColor Yellow

$configContent = @"
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "rules/*.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Sistema Contable API - RUTA CORREGIDA
  - job_name: 'sistema-contable-api'
    static_configs:
      - targets: ['host.docker.internal:3002']
    metrics_path: '/api/metrics'
    scrape_interval: 30s
    scrape_timeout: 10s

  # Node Exporter (métricas del sistema)
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  # PostgreSQL Exporter
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

  # Redis Exporter
  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']
"@

# Guardar en archivo temporal
$tempFile = "monitoring/prometheus/prometheus-corrected.yml"
$configContent | Out-File -FilePath $tempFile -Encoding UTF8 -NoNewline

Write-Host "✅ Configuración creada en: $tempFile" -ForegroundColor Green

# 3. Detener Prometheus
Write-Host ""
Write-Host "⏸️  Deteniendo Prometheus..." -ForegroundColor Yellow
docker stop $prometheusContainer | Out-Null
Write-Host "✅ Prometheus detenido" -ForegroundColor Green

# 4. Copiar nueva configuración
Write-Host ""
Write-Host "📋 Copiando nueva configuración..." -ForegroundColor Yellow
docker cp $tempFile "$($prometheusContainer):/etc/prometheus/prometheus.yml"
Write-Host "✅ Configuración copiada" -ForegroundColor Green

# 5. Iniciar Prometheus
Write-Host ""
Write-Host "▶️  Iniciando Prometheus..." -ForegroundColor Yellow
docker start $prometheusContainer | Out-Null
Start-Sleep -Seconds 3
Write-Host "✅ Prometheus iniciado" -ForegroundColor Green

# 6. Verificar que funcione
Write-Host ""
Write-Host "🔍 Verificando configuración..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

try {
    $response = Invoke-WebRequest -Uri "http://localhost:9090/-/healthy" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Prometheus está saludable" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Prometheus no responde aún (puede tardar unos segundos)" -ForegroundColor Yellow
}

# 7. Verificar endpoint de métricas
Write-Host ""
Write-Host "📊 Verificando endpoint de métricas..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3002/api/metrics" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Endpoint /api/metrics funcionando" -ForegroundColor Green
        
        # Contar métricas
        $metricsCount = ($response.Content -split "`n" | Where-Object { $_ -match "^erp_" }).Count
        Write-Host "   📈 Métricas ERP disponibles: $metricsCount" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Endpoint de métricas no responde" -ForegroundColor Red
}

# 8. Verificar targets en Prometheus
Write-Host ""
Write-Host "🎯 Verificando targets en Prometheus..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

try {
    $response = Invoke-WebRequest -Uri "http://localhost:9090/api/v1/targets" -UseBasicParsing -TimeoutSec 5
    $targets = ($response.Content | ConvertFrom-Json).data.activeTargets
    
    $apiTarget = $targets | Where-Object { $_.labels.job -eq "sistema-contable-api" }
    
    if ($apiTarget) {
        $health = $apiTarget.health
        $scrapeUrl = $apiTarget.scrapeUrl
        
        Write-Host "   Target: sistema-contable-api" -ForegroundColor White
        Write-Host "   URL: $scrapeUrl" -ForegroundColor White
        
        if ($health -eq "up") {
            Write-Host "   Estado: ✅ UP" -ForegroundColor Green
        } else {
            Write-Host "   Estado: ❌ $health" -ForegroundColor Red
            Write-Host "   Último error: $($apiTarget.lastError)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "⚠️  No se pudo verificar targets (Prometheus aún iniciando)" -ForegroundColor Yellow
}

# 9. Resumen
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "✅ CONFIGURACIÓN CORREGIDA" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "Cambios realizados:" -ForegroundColor Yellow
Write-Host "  • Ruta de métricas: /api/v1/metrics → /api/metrics" -ForegroundColor White
Write-Host "  • Target: host.docker.internal:3002" -ForegroundColor White
Write-Host "  • Intervalo de scraping: 30s" -ForegroundColor White
Write-Host ""
Write-Host "🌐 URLs:" -ForegroundColor Yellow
Write-Host "  • Métricas API: http://localhost:3002/api/metrics" -ForegroundColor White
Write-Host "  • Prometheus: http://localhost:9090" -ForegroundColor White
Write-Host "  • Targets: http://localhost:9090/targets" -ForegroundColor White
Write-Host ""
Write-Host "⏱️  Espere 30 segundos para que Prometheus haga el primer scrape" -ForegroundColor Yellow
Write-Host "   Luego verifique en: http://localhost:9090/targets" -ForegroundColor Yellow
Write-Host ""
Write-Host "📝 El error '404 - Cannot GET /api/v1/metrics' debería desaparecer" -ForegroundColor Green
Write-Host ""
