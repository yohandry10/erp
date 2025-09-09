@echo off
echo 🚀 Iniciando entorno de desarrollo ERP Suite...

echo 📦 Instalando dependencias...
call pnpm install

echo 🚀 Iniciando servicios...

echo 🔧 Iniciando Backend API en puerto 3002...
start "Backend API" cmd /k "cd /d %CD%\apps\erp-api && pnpm dev"

timeout /t 3 /nobreak >nul

echo 🌐 Iniciando Frontend Next.js en puerto 3001...
start "Frontend Next.js" cmd /k "cd /d %CD%\apps\web && pnpm run dev"

timeout /t 5 /nobreak >nul

echo 🖥️ Iniciando aplicación Tauri...
start "Tauri App" cmd /k "cd /d %CD%\apps\web && pnpm run tauri:dev"

echo ✅ Todos los servicios iniciados!
echo 📍 URLs disponibles:
echo    🌐 Frontend: http://localhost:3001
echo    🔧 Backend API: http://localhost:3002/api
echo    📚 Documentación: http://localhost:3002/api/docs
echo    🖥️ Tauri: Se abrirá automáticamente

pause