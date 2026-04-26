-- =====================================================
-- SCRIPT DE VALIDACIÓN MANUAL RLS - Migración 053
-- =====================================================
-- Descripción: Script para verificar el correcto funcionamiento
--              de las políticas RLS en las tablas fiscales
-- Uso: Ejecutar como diferentes usuarios para validar aislamiento
-- Fecha: 2025-10-30
-- =====================================================

-- =====================================================
-- PASO 1: VERIFICAR QUE RLS ESTÁ HABILITADO
-- =====================================================

-- Contexto seguro: si no hay tenant/usuario en la sesión, setearlos aquí.
-- Reemplaza los placeholders SOLO si quieres forzar un tenant/usuario concreto.
-- Si ya ejecutaste set_config() antes, este bloque NO lo sobreescribe.
DO $$
DECLARE
  v_tenant text := current_setting('app.current_tenant_id', true);
  v_user   text := current_setting('app.current_user_id', true);
BEGIN
  IF v_tenant IS NULL OR v_tenant = '' THEN
    PERFORM set_config('app.current_tenant_id', '<TENANT_UUID_AQUI>', true);
  END IF;
  IF v_user IS NULL OR v_user = '' THEN
    PERFORM set_config('app.current_user_id', '<USER_UUID_AQUI>', true);
  END IF;
END $$;

SELECT 
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename IN ('cpe', 'gre', 'sire_files', 'auditoria', 'rls_alert_config', 'rls_alert_history')
ORDER BY tablename;

-- Resultado esperado: Todas las tablas deben tener rls_enabled = true

-- =====================================================
-- PASO 2: LISTAR POLÍTICAS RLS CREADAS
-- =====================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE tablename IN ('cpe', 'gre', 'sire_files', 'auditoria', 'rls_alert_config', 'rls_alert_history')
ORDER BY tablename, policyname;

-- Resultado esperado: Debe mostrar las políticas creadas en la migración 053

-- =====================================================
-- PASO 3: CONTAR REGISTROS POR TENANT (COMO SUPERADMIN)
-- =====================================================

-- Nota: Este paso debe ejecutarse con un usuario super-admin
-- o con SERVICE_ROLE_KEY que bypasea RLS

SELECT 'cpe' AS tabla, tenant_id, COUNT(*) AS total_registros
FROM cpe
GROUP BY tenant_id
UNION ALL
SELECT 'gre' AS tabla, tenant_id, COUNT(*) AS total_registros
FROM gre
GROUP BY tenant_id
UNION ALL
SELECT 'sire_files' AS tabla, tenant_id, COUNT(*) AS total_registros
FROM sire_files
GROUP BY tenant_id
UNION ALL
SELECT 'auditoria' AS tabla, tenant_id, COUNT(*) AS total_registros
FROM auditoria
GROUP BY tenant_id
ORDER BY tabla, tenant_id;

-- Resultado esperado: Mostrar distribución de registros por tenant

-- =====================================================
-- PASO 4: TEST DE AISLAMIENTO POR TENANT
-- =====================================================

-- IMPORTANTE: Este test debe ejecutarse con credenciales de un usuario
-- específico de un tenant (NO superadmin)

-- 4.1. Establecer contexto de tenant A (ejemplo)
-- SET app.current_tenant_id = '<tenant_a_uuid>';
-- SET app.is_superadmin = 'false';

-- 4.2. Intentar acceder a registros de tenant actual
SELECT 'TEST 1: Acceso a registros del propio tenant' AS test;
SELECT COUNT(*) AS registros_visibles_cpe FROM cpe;
SELECT COUNT(*) AS registros_visibles_gre FROM gre;
SELECT COUNT(*) AS registros_visibles_sire FROM sire_files;

-- Resultado esperado: Debe retornar los registros del tenant actual

-- 4.3. Intentar acceder a registros de otro tenant (cross-tenant)
-- Este query debe ser bloqueado por RLS
SELECT 'TEST 2: Intento de acceso cross-tenant (debe fallar o retornar 0)' AS test;
-- La siguiente query NO debe retornar registros de otros tenants
-- porque RLS debe filtrarlos automáticamente
SELECT COUNT(*) AS registros_otros_tenants_cpe 
FROM cpe 
WHERE tenant_id != (
  SELECT COALESCE(
    app.current_tenant_id_safe(),
    '00000000-0000-0000-0000-000000000000'::uuid
  )
);

-- Resultado esperado: 0 registros (RLS los filtra automáticamente)

-- =====================================================
-- PASO 5: TEST DE INSERCIÓN Y ACTUALIZACIÓN
-- =====================================================

-- 5.1. Test de inserción en el tenant actual (debe funcionar)
-- SET app.current_tenant_id = '<tenant_a_uuid>';
-- INSERT INTO auditoria (tenant_id, tabla, accion, descripcion)
-- VALUES (app.current_tenant_id(), 'test_table', 'TEST', 'Inserción de prueba RLS');

-- Resultado esperado: INSERT exitoso

-- 5.2. Test de inserción en otro tenant (debe fallar)
-- INSERT INTO auditoria (tenant_id, tabla, accion, descripcion)
-- VALUES ('<otro_tenant_uuid>', 'test_table', 'TEST', 'Intento cross-tenant');

-- Resultado esperado: ERROR - violación de política RLS

-- =====================================================
-- PASO 6: TEST DE SUPER-ADMIN
-- =====================================================

-- IMPORTANTE: Ejecutar con usuario super-admin

-- SET app.is_superadmin = 'true';

SELECT 'TEST 3: Super-admin debe ver todos los registros' AS test;
SELECT 
  'cpe' AS tabla,
  COUNT(*) AS total_registros_todos_tenants,
  COUNT(DISTINCT tenant_id) AS total_tenants
FROM cpe
UNION ALL
SELECT 
  'gre' AS tabla,
  COUNT(*) AS total_registros_todos_tenants,
  COUNT(DISTINCT tenant_id) AS total_tenants
FROM gre
UNION ALL
SELECT 
  'sire_files' AS tabla,
  COUNT(*) AS total_registros_todos_tenants,
  COUNT(DISTINCT tenant_id) AS total_tenants
FROM sire_files;

-- Resultado esperado: Super-admin ve TODOS los registros de TODOS los tenants

-- =====================================================
-- PASO 7: VERIFICAR REGISTROS EN AUDIT_LOG
-- =====================================================

-- Verificar que la migración se registró en audit_log
SELECT 
  table_name,
  operation,
  new_values->>'migration' AS migration_number,
  new_values->'tables_updated' AS tables_updated,
  timestamp
FROM audit_log
WHERE new_values->>'migration' = '053_db_rls_fiscal_and_audit'
ORDER BY timestamp DESC
LIMIT 1;

-- Resultado esperado: Debe mostrar el registro de la migración 053

-- =====================================================
-- PASO 8: VERIFICAR ALERTAS RLS (OPCIONAL)
-- =====================================================

SELECT 
  table_name,
  operation,
  timestamp,
  COUNT(*) AS intentos_bloqueados
FROM rls_audit_log
WHERE table_name IN ('cpe', 'gre', 'sire_files', 'auditoria')
  AND timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY table_name, operation, timestamp
ORDER BY timestamp DESC
LIMIT 10;

-- Resultado esperado: Si hay intentos de acceso cross-tenant,
--                     deben estar registrados aquí

-- =====================================================
-- PASO 9: CHECKLIST DE VALIDACIÓN FINAL
-- =====================================================

-- Ejecutar este checklist y verificar que todos sean TRUE

SELECT 
  'RLS habilitado en cpe' AS check_item,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'cpe') AS passed
UNION ALL
SELECT 
  'RLS habilitado en gre' AS check_item,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'gre') AS passed
UNION ALL
SELECT 
  'RLS habilitado en sire_files' AS check_item,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'sire_files') AS passed
UNION ALL
SELECT 
  'RLS habilitado en auditoria' AS check_item,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'auditoria') AS passed
UNION ALL
SELECT 
  'RLS habilitado en rls_alert_config' AS check_item,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'rls_alert_config') AS passed
UNION ALL
SELECT 
  'RLS habilitado en rls_alert_history' AS check_item,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'rls_alert_history') AS passed
UNION ALL
SELECT 
  'Política cpe_tenant_isolation existe' AS check_item,
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cpe' AND policyname = 'cpe_tenant_isolation') AS passed
UNION ALL
SELECT 
  'Política gre_tenant_isolation existe' AS check_item,
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gre' AND policyname = 'gre_tenant_isolation') AS passed
UNION ALL
SELECT 
  'Política sire_files_tenant_isolation existe' AS check_item,
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sire_files' AND policyname = 'sire_files_tenant_isolation') AS passed
UNION ALL
SELECT 
  'Política auditoria_tenant_isolation existe' AS check_item,
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'auditoria' AND policyname = 'auditoria_tenant_isolation') AS passed;

-- =====================================================
-- RESULTADO ESPERADO FINAL:
-- =====================================================
-- Todas las verificaciones deben retornar TRUE (t)
-- Si alguna es FALSE (f), hay un problema con la migración

-- =====================================================
-- NOTAS ADICIONALES:
-- =====================================================
-- 
-- PARA PROBAR DESDE EL BACKEND (NestJS):
-- 
-- 1. Login como usuario de tenant A
--    POST /api/auth/login
--    { "email": "user_a@tenant_a.com", "password": "..." }
--
-- 2. Obtener CPE (debe mostrar solo CPE de tenant A)
--    GET /api/cpe
--    Authorization: Bearer <token_tenant_a>
--
-- 3. Login como usuario de tenant B
--    POST /api/auth/login
--    { "email": "user_b@tenant_b.com", "password": "..." }
--
-- 4. Obtener CPE (debe mostrar solo CPE de tenant B)
--    GET /api/cpe
--    Authorization: Bearer <token_tenant_b>
--
-- 5. Los resultados NO deben tener intersección
--
-- =====================================================
-- FIN DEL SCRIPT DE VALIDACIÓN
-- =====================================================

