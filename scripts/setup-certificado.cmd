@echo off
echo ========================================
echo   CONFIGURACION DE CERTIFICADO DIGITAL
echo ========================================
echo.

REM Verificar si existe la carpeta certs
if not exist "certs" (
    echo [1/4] Creando carpeta certs...
    mkdir certs
    echo ✅ Carpeta creada
) else (
    echo [1/4] ✅ Carpeta certs ya existe
)

echo.
echo [2/4] Verificando .gitignore...
findstr /C:"certs/" .gitignore >nul 2>&1
if errorlevel 1 (
    echo # Certificados digitales >> .gitignore
    echo certs/ >> .gitignore
    echo *.pfx >> .gitignore
    echo *.p12 >> .gitignore
    echo ✅ Agregado a .gitignore
) else (
    echo ✅ Ya está en .gitignore
)

echo.
echo [3/4] Estado actual:
echo.

if exist "certs\certificado.pfx" (
    echo ✅ Certificado encontrado: certs\certificado.pfx
    dir certs\certificado.pfx | findstr /C:"certificado.pfx"
) else (
    echo ⚠️  NO se encontró certificado en: certs\certificado.pfx
    echo.
    echo Para agregar tu certificado:
    echo   1. Copia tu archivo .pfx a la carpeta certs\
    echo   2. Renómbralo como: certificado.pfx
    echo   3. O actualiza PFX_PATH en .env con el nombre correcto
)

echo.
echo [4/4] Configuración en .env:
echo.

findstr /C:"PFX_PATH" apps\erp-api\.env
findstr /C:"SUNAT_ENVIRONMENT" apps\erp-api\.env
findstr /C:"EMPRESA_RUC" apps\erp-api\.env

echo.
echo ========================================
echo   PROXIMOS PASOS
echo ========================================
echo.
echo 1. Coloca tu certificado .pfx en: certs\certificado.pfx
echo 2. Edita apps\erp-api\.env y configura:
echo    - PFX_PATH=./certs/certificado.pfx
echo    - PFX_PASS=tu_contraseña
echo    - EMPRESA_RUC=tu_ruc
echo 3. Reinicia el servidor: pnpm dev
echo.
echo 📖 Ver guía completa: CERTIFICADO_DIGITAL_SETUP.md
echo.
pause
