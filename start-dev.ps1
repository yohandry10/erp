# Script para levantar el entorno de desarrollo completo
Write-Host "🚀 Iniciando entorno de desarrollo ERP Suite..." -ForegroundColor Green

# Función para verificar si un puerto está en uso
function Test-Port {
    param([int]$Port)
    try {
        $connection = New-Object System.Net.Sockets.TcpClient
        $connection.Connect("localhost", $Port)
        $connection.Close()
        return $true
    } catch {
        return $false
    }
}

# Verificar puertos
Write-Host "🔍 Verificando puertos..." -ForegroundColor Yellow
if (Test-Port 3000) { Write-Host "⚠️  Puerto 3000 ocupado (Tauri)" -ForegroundColor Yellow }
if (Test-Port 3001) { Write-Host "⚠️  Puerto 3001 ocupado (Next.js)" -ForegroundColor Yellow }
if (Test-Port 3002) { Write-Host "⚠️  Puerto 3002 ocupado (Backend API)" -ForegroundColor Yellow }

# Crear ventanas separadas para cada servicio
Write-Host "📦 Instalando dependencias..." -ForegroundColor Blue
pnpm install

Write-Host "🚀 Iniciando servicios..." -ForegroundColor Green

# Backend API (puerto 3002)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD/apps/erp-api'; Write-Host '🔧 Iniciando Backend API en puerto 3002...' -ForegroundColor Cyan; pnpm dev"

# Esperar un poco para que el backend inicie
Start-Sleep -Seconds 3

# Frontend Next.js (puerto 3001)  
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD/apps/web'; Write-Host '🌐 Iniciando Frontend Next.js en puerto 3001...' -ForegroundColor Magenta; pnpm run dev"

# Esperar un poco para que Next.js inicie
Start-Sleep -Seconds 5

# Tauri (puerto 3000)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD/apps/web'; Write-Host '🖥️  Iniciando aplicación Tauri...' -ForegroundColor Green; pnpm run tauri dev"

Write-Host "✅ Todos los servicios iniciados!" -ForegroundColor Green
Write-Host "📍 URLs disponibles:" -ForegroundColor White
Write-Host "   🌐 Frontend: http://localhost:3001" -ForegroundColor Cyan
Write-Host "   🔧 Backend API: http://localhost:3002/api" -ForegroundColor Yellow
Write-Host "   📚 Documentación: http://localhost:3002/api/docs" -ForegroundColor Magenta
Write-Host "   🖥️  Tauri: Se abrirá automáticamente" -ForegroundColor Green

Write-Host "`n💡 Presiona cualquier tecla para salir..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")