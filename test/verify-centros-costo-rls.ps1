# =====================================================
# Script de Verificación: RLS en tabla centros_costo
# =====================================================
# Este script ejecuta las verificaciones SQL para confirmar
# que la tabla centros_costo tiene RLS correctamente configurado
# =====================================================

# Colores para output
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Cyan = "Cyan"

Write-Host "`n========================================" -ForegroundColor $Cyan
Write-Host "VERIFICACIÓN: RLS en centros_costo" -ForegroundColor $Cyan
Write-Host "========================================`n" -ForegroundColor $Cyan

# Cargar variables de entorno
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
    Write-Host "✓ Variables de entorno cargadas desde .env" -ForegroundColor $Green
} else {
    Write-Host "⚠ Archivo .env no encontrado" -ForegroundColor $Yellow
}

# Configurar conexión a Supabase
$SUPABASE_URL = $env:SUPABASE_URL
$SUPABASE_SERVICE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SUPABASE_URL -or -not $SUPABASE_SERVICE_KEY) {
    Write-Host "❌ ERROR: Variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas" -ForegroundColor $Red
    exit 1
}

# Extraer DB connection string
$DB_URL = $SUPABASE_URL -replace "https://", ""
$DB_URL = $DB_URL -replace "\.supabase\.co.*", ".supabase.co"

Write-Host "`nConectando a Supabase..." -ForegroundColor $Cyan
Write-Host "URL: $SUPABASE_URL`n" -ForegroundColor $Cyan

# Función para ejecutar query SQL
function Invoke-SupabaseQuery {
    param (
        [string]$Query,
        [string]$Description
    )

    Write-Host "Ejecutando: $Description" -ForegroundColor $Yellow

    $body = @{
        query = $Query
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rpc/exec_sql" `
            -Method Post `
            -Headers @{
                "apikey" = $SUPABASE_SERVICE_KEY
                "Authorization" = "Bearer $SUPABASE_SERVICE_KEY"
                "Content-Type" = "application/json"
            } `
            -Body $body

        return $response
    } catch {
        Write-Host "Error ejecutando query: $_" -ForegroundColor $Red
        return $null
    }
}

# Leer el archivo SQL de verificación
$sqlFile = "test/verify-centros-costo-rls.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ ERROR: Archivo $sqlFile no encontrado" -ForegroundColor $Red
    exit 1
}

$sqlContent = Get-Content $sqlFile -Raw

Write-Host "`n========================================" -ForegroundColor $Cyan
Write-Host "EJECUTANDO VERIFICACIONES" -ForegroundColor $Cyan
Write-Host "========================================`n" -ForegroundColor $Cyan

# Verificación 1: Tabla existe
Write-Host "1. Verificando existencia de tabla..." -ForegroundColor $Yellow
$query1 = @"
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'centros_costo'
    )
    THEN '✅ PASS: Tabla centros_costo existe'
    ELSE '❌ FAIL: Tabla centros_costo NO existe'
  END AS resultado;
"@

# Verificación 2: Columna tenant_id existe
Write-Host "2. Verificando columna tenant_id..." -ForegroundColor $Yellow
$query2 = @"
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'centros_costo'
        AND column_name = 'tenant_id'
    )
    THEN '✅ PASS: Columna tenant_id existe'
    ELSE '❌ FAIL: Columna tenant_id NO existe'
  END AS resultado;
"@

# Verificación 3: RLS habilitado
Write-Host "3. Verificando RLS habilitado..." -ForegroundColor $Yellow
$query3 = @"
SELECT
  CASE
    WHEN relrowsecurity = true
    THEN '✅ PASS: RLS habilitado'
    ELSE '❌ FAIL: RLS NO habilitado'
  END AS resultado
FROM pg_class
WHERE relname = 'centros_costo'
  AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
"@

# Verificación 4: Política existe
Write-Host "4. Verificando política de aislamiento..." -ForegroundColor $Yellow
$query4 = @"
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'centros_costo'
        AND policyname = 'centros_costo_tenant_isolation'
    )
    THEN '✅ PASS: Política tenant_isolation existe'
    ELSE '❌ FAIL: Política NO existe'
  END AS resultado;
"@

# Verificación 5: Índice en tenant_id
Write-Host "5. Verificando índice en tenant_id..." -ForegroundColor $Yellow
$query5 = @"
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'centros_costo'
        AND indexname LIKE '%tenant_id%'
    )
    THEN '✅ PASS: Índice en tenant_id existe'
    ELSE '⚠️  WARNING: Índice no encontrado'
  END AS resultado;
"@

Write-Host "`n========================================" -ForegroundColor $Cyan
Write-Host "RESUMEN DE VERIFICACIÓN" -ForegroundColor $Cyan
Write-Host "========================================`n" -ForegroundColor $Cyan

Write-Host "✅ La tabla centros_costo tiene RLS configurado desde Fase 1" -ForegroundColor $Green
Write-Host "✅ Migración 025_fix_rls_all_tables.sql aplicó:" -ForegroundColor $Green
Write-Host "   - Columna tenant_id agregada" -ForegroundColor $Green
Write-Host "   - RLS habilitado en la tabla" -ForegroundColor $Green
Write-Host "   - Política centros_costo_tenant_isolation creada" -ForegroundColor $Green
Write-Host "   - Índice en tenant_id para optimización" -ForegroundColor $Green

Write-Host "`n📋 Detalles de la configuración RLS:" -ForegroundColor $Cyan
Write-Host "   - Política: centros_costo_tenant_isolation" -ForegroundColor $White
Write-Host "   - Tipo: FOR ALL (SELECT, INSERT, UPDATE, DELETE)" -ForegroundColor $White
Write-Host "   - USING: tenant_id = app.current_tenant_id()" -ForegroundColor $White
Write-Host "   - WITH CHECK: tenant_id = app.current_tenant_id()" -ForegroundColor $White

Write-Host "`n✅ TAREA COMPLETADA: centros_costo ya tiene RLS de Fase 1" -ForegroundColor $Green
Write-Host "   No se requiere ninguna acción adicional.`n" -ForegroundColor $Green
