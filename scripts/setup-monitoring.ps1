# Script de Configuración de Monitoreo
# Configura Prometheus y Grafana para el ERP Suite

Write-Host "🚀 Configurando Sistema de Monitoreo ERP Suite" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar Docker
Write-Host "📦 Verificando Docker..." -ForegroundColor Yellow
$dockerVersion = docker --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker no está instalado. Por favor instale Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker instalado: $dockerVersion" -ForegroundColor Green

# 2. Verificar Docker Compose
Write-Host "📦 Verificando Docker Compose..." -ForegroundColor Yellow
$composeVersion = docker-compose --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker Compose no está instalado." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker Compose instalado: $composeVersion" -ForegroundColor Green

# 3. Instalar dependencias de Node
Write-Host ""
Write-Host "📦 Instalando dependencias..." -ForegroundColor Yellow
Set-Location apps/erp-api
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error instalando dependencias" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencias instaladas" -ForegroundColor Green
Set-Location ../..

# 4. Crear directorios necesarios
Write-Host ""
Write-Host "📁 Creando directorios..." -ForegroundColor Yellow
$dirs = @(
    "monitoring/prometheus/data",
    "monitoring/grafana/data",
    "logs"
)

foreach ($dir in $dirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  ✅ Creado: $dir" -ForegroundColor Green
    } else {
        Write-Host "  ℹ️  Ya existe: $dir" -ForegroundColor Gray
    }
}

# 5. Verificar archivos de configuración
Write-Host ""
Write-Host "📄 Verificando archivos de configuración..." -ForegroundColor Yellow
$configFiles = @(
    "monitoring/prometheus/prometheus.yml",
    "monitoring/prometheus/alerts/erp-alerts.yml",
    "monitoring/grafana/provisioning/datasources/prometheus.yml",
    "monitoring/grafana/provisioning/dashboards/dashboards.yml"
)

$allConfigsExist = $true
foreach ($file in $configFiles) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Falta: $file" -ForegroundColor Red
        $allConfigsExist = $false
    }
}

if (!$allConfigsExist) {
    Write-Host ""
    Write-Host "❌ Faltan archivos de configuración. Ejecute primero la configuración completa." -ForegroundColor Red
    exit 1
}

# 6. Iniciar servicios
Write-Host ""
Write-Host "🚀 Iniciando servicios..." -ForegroundColor Yellow
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error iniciando servicios" -ForegroundColor Red
    exit 1
}

# 7. Esperar a que los servicios estén listos
Write-Host ""
Write-Host "⏳ Esperando a que los servicios estén listos..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 8. Verificar servicios
Write-Host ""
Write-Host "🔍 Verificando servicios..." -ForegroundColor Yellow

# Verificar ERP API
Write-Host "  Verificando ERP API..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "  ✅ ERP API: http://localhost:3001" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠️  ERP API no responde aún (puede tardar unos segundos más)" -ForegroundColor Yellow
}

# Verificar Prometheus
Write-Host "  Verificando Prometheus..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "http://localhost:9090/-/healthy" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "  ✅ Prometheus: http://localhost:9090" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠️  Prometheus no responde aún" -ForegroundColor Yellow
}

# Verificar Grafana
Write-Host "  Verificando Grafana..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "  ✅ Grafana: http://localhost:3000" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠️  Grafana no responde aún" -ForegroundColor Yellow
}

# 9. Verificar métricas
Write-Host ""
Write-Host "📊 Verificando endpoint de métricas..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/metrics" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "  ✅ Endpoint de métricas funcionando" -ForegroundColor Green
        
        # Contar métricas
        $metricsCount = ($response.Content -split "`n" | Where-Object { $_ -match "^erp_" }).Count
        Write-Host "  📈 Métricas disponibles: $metricsCount" -ForegroundColor Cyan
    }
} catch {
    Write-Host "  ⚠️  Endpoint de métricas no responde aún" -ForegroundColor Yellow
}

# 10. Resumen
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "✅ CONFIGURACIÓN COMPLETADA" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "🌐 URLs de Acceso:" -ForegroundColor Yellow
Write-Host "  • ERP API:        http://localhost:3001" -ForegroundColor White
Write-Host "  • API Docs:       http://localhost:3001/api/docs" -ForegroundColor White
Write-Host "  • Métricas:       http://localhost:3001/api/metrics" -ForegroundColor White
Write-Host "  • Prometheus:     http://localhost:9090" -ForegroundColor White
Write-Host "  • Grafana:        http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "🔐 Credenciales de Grafana:" -ForegroundColor Yellow
Write-Host "  • Usuario:        admin" -ForegroundColor White
Write-Host "  • Contraseña:     admin" -ForegroundColor White
Write-Host ""
Write-Host "📚 Documentación:" -ForegroundColor Yellow
Write-Host "  • Ver: monitoring/README.md" -ForegroundColor White
Write-Host "  • Guía: docs/GUIA_INTEGRACION_METRICAS.md" -ForegroundColor White
Write-Host ""
Write-Host "🔍 Comandos Útiles:" -ForegroundColor Yellow
Write-Host "  • Ver logs:       docker-compose logs -f" -ForegroundColor White
Write-Host "  • Detener:        docker-compose down" -ForegroundColor White
Write-Host "  • Reiniciar:      docker-compose restart" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  Nota: Si algún servicio no responde, espere 30-60 segundos" -ForegroundColor Yellow
Write-Host "   y verifique los logs con: docker-compose logs [servicio]" -ForegroundColor Yellow
Write-Host ""
