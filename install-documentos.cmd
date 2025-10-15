@echo off
REM =============================================
REM Script de instalación del Módulo de Documentos
REM Fecha: 2025-10-15
REM =============================================

echo ========================================
echo INSTALACION DEL MODULO DE DOCUMENTOS
echo ========================================
echo.

REM Configuración de la base de datos
set DB_USER=postgres
set DB_NAME=postgres
set DB_HOST=localhost
set DB_PORT=5432

echo Configuracion:
echo - Usuario: %DB_USER%
echo - Base de datos: %DB_NAME%
echo - Host: %DB_HOST%
echo - Puerto: %DB_PORT%
echo.

REM Solicitar confirmación
set /p CONFIRM="Deseas continuar con la instalacion? (S/N): "
if /i not "%CONFIRM%"=="S" (
    echo Instalacion cancelada.
    exit /b 0
)

echo.
echo ========================================
echo PASO 1: LIMPIEZA DE TABLAS EXISTENTES
echo ========================================
echo.

psql -U %DB_USER% -d %DB_NAME% -h %DB_HOST% -p %DB_PORT% -f supabase\migrations\20251015_cleanup_documentos.sql

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Fallo en la limpieza de tablas
    echo Continuando con la instalacion...
    echo.
)

echo.
echo ========================================
echo PASO 2: CREACION DEL MODULO COMPLETO
echo ========================================
echo.

psql -U %DB_USER% -d %DB_NAME% -h %DB_HOST% -p %DB_PORT% -f supabase\migrations\20251015_create_documentos_module_complete.sql

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Fallo en la creacion del modulo
    echo Por favor revisa los errores anteriores
    pause
    exit /b 1
)

echo.
echo ========================================
echo PASO 3: VERIFICACION DE LA INSTALACION
echo ========================================
echo.

psql -U %DB_USER% -d %DB_NAME% -h %DB_HOST% -p %DB_PORT% -f supabase\migrations\20251015_verify_documentos.sql

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Fallo en la verificacion
    echo El modulo puede no estar completamente instalado
    pause
    exit /b 1
)

echo.
echo ========================================
echo INSTALACION COMPLETADA EXITOSAMENTE
echo ========================================
echo.
echo El modulo de documentos ha sido instalado correctamente.
echo.
echo Proximos pasos:
echo 1. Configurar la facturacion electronica en fe_configuracion
echo 2. Crear series de documentos en documento_series
echo 3. Integrar con el modulo de clientes
echo.

pause
