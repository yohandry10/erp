-- Migration 032: Habilitar RLS en módulo Finanzas
-- Fecha: 2025-10-24
-- Descripción: Habilita Row Level Security en las 9 tablas del módulo Finanzas
-- Parte de: TASK 1.2 - Habilitar RLS en Módulo Finanzas
-- Objetivo: Implementar aislamiento multi-tenant a nivel de base de datos

BEGIN;

-- =====================================================
-- MÓDULO FINANZAS - HABILITAR RLS (9 TABLAS)
-- =====================================================

-- Este script habilita RLS y crea políticas tenant_isolation para las 9 tablas
-- críticas del módulo Finanzas. Usa las funciones helper de la migración 025.

DO $$
BEGIN
  RAISE NOTICE '=== INICIANDO HABILITACIÓN DE RLS EN MÓDULO FINANZAS ===';
  
  -- Tabla 1: cuentas_por_pagar
  RAISE NOTICE 'Habilitando RLS para: cuentas_por_pagar';
  PERFORM enable_rls_tenant_isolation('cuentas_por_pagar');
  
  -- Tabla 2: cuentas_bancarias
  RAISE NOTICE 'Habilitando RLS para: cuentas_bancarias';
  PERFORM enable_rls_tenant_isolation('cuentas_bancarias');
  
  -- Tabla 3: conciliaciones_bancarias
  RAISE NOTICE 'Habilitando RLS para: conciliaciones_bancarias';
  PERFORM enable_rls_tenant_isolation('conciliaciones_bancarias');
  
  -- Tabla 4: cobranzas
  RAISE NOTICE 'Habilitando RLS para: cobranzas';
  PERFORM enable_rls_tenant_isolation('cobranzas');
  
  -- Tabla 5: gestiones_cobranza
  RAISE NOTICE 'Habilitando RLS para: gestiones_cobranza';
  PERFORM enable_rls_tenant_isolation('gestiones_cobranza');
  
  -- Tabla 6: egresos
  RAISE NOTICE 'Habilitando RLS para: egresos';
  PERFORM enable_rls_tenant_isolation('egresos');
  
  -- Tabla 7: gastos
  RAISE NOTICE 'Habilitando RLS para: gastos';
  PERFORM enable_rls_tenant_isolation('gastos');
  
  -- Tabla 8: pagos_empleados
  RAISE NOTICE 'Habilitando RLS para: pagos_empleados';
  PERFORM enable_rls_tenant_isolation('pagos_empleados');
  
  -- Tabla 9: pagos_facturas
  RAISE NOTICE 'Habilitando RLS para: pagos_facturas';
  PERFORM enable_rls_tenant_isolation('pagos_facturas');
  
  RAISE NOTICE '=== RLS HABILITADO EXITOSAMENTE EN 9 TABLAS DEL MÓDULO FINANZAS ===';
END
$$;

-- =====================================================
-- VALIDACIÓN: VERIFICAR QUE RLS FUE HABILITADO
-- =====================================================

DO $$
DECLARE
  v_table_name text;
  v_rls_enabled boolean;
  v_policy_count integer;
  v_tenant_policy_exists boolean;
BEGIN
  RAISE NOTICE '=== INICIANDO VALIDACIÓN DE RLS EN MÓDULO FINANZAS ===';
  
  FOR v_table_name IN 
    SELECT unnest(ARRAY[
      'cuentas_por_pagar',
      'cuentas_bancarias',
      'conciliaciones_bancarias',
      'cobranzas',
      'gestiones_cobranza',
      'egresos',
      'gastos',
      'pagos_empleados',
      'pagos_facturas'
    ])
  LOOP
    RAISE NOTICE '--- Validando RLS para tabla: % ---', v_table_name;
    
    -- 1. Verificar que la tabla existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' 
        AND t.table_name = v_table_name
    ) THEN
      RAISE WARNING 'ATENCIÓN: La tabla % NO EXISTE', v_table_name;
      CONTINUE;
    END IF;
    
    -- 2. Verificar que RLS está habilitado
    SELECT relrowsecurity
    FROM pg_class
    WHERE relname = v_table_name
      AND relnamespace = 'public'::regnamespace
    INTO v_rls_enabled;
    
    IF v_rls_enabled THEN
      RAISE NOTICE '✓ RLS habilitado en %', v_table_name;
    ELSE
      RAISE WARNING '✗ RLS NO habilitado en %', v_table_name;
      CONTINUE;
    END IF;
    
    -- 3. Contar políticas activas
    SELECT COUNT(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = v_table_name
    INTO v_policy_count;
    
    RAISE NOTICE '  Políticas activas: %', v_policy_count;
    
    -- 4. Verificar que existe la política tenant_isolation
    SELECT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table_name
        AND policyname = 'tenant_isolation'
    ) INTO v_tenant_policy_exists;
    
    IF v_tenant_policy_exists THEN
      RAISE NOTICE '✓ Política tenant_isolation existe en %', v_table_name;
    ELSE
      RAISE WARNING '✗ Política tenant_isolation NO existe en %', v_table_name;
    END IF;
    
  END LOOP;
  
  RAISE NOTICE '=== VALIDACIÓN COMPLETADA ===';
END
$$;

-- =====================================================
-- CREAR VISTAS DE MONITOREO
-- =====================================================

-- Vista de resumen del estado de RLS en módulo Finanzas
CREATE OR REPLACE VIEW v_rls_status_finanzas AS
SELECT 
  c.relname AS tabla,
  c.relrowsecurity AS rls_habilitado,
  c.relforcerowsecurity AS rls_forzado,
  COUNT(p.policyname) AS num_politicas,
  ARRAY_AGG(p.policyname) FILTER (WHERE p.policyname IS NOT NULL) AS politicas,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS tamaño_tabla
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN (
    'cuentas_por_pagar',
    'cuentas_bancarias',
    'conciliaciones_bancarias',
    'cobranzas',
    'gestiones_cobranza',
    'egresos',
    'gastos',
    'pagos_empleados',
    'pagos_facturas'
  )
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity, c.oid
ORDER BY c.relname;

COMMENT ON VIEW v_rls_status_finanzas IS 
  'Vista de resumen del estado de RLS en tablas del módulo Finanzas';

-- Vista detallada de políticas RLS
CREATE OR REPLACE VIEW v_rls_policies_finanzas AS
SELECT 
  schemaname,
  tablename AS tabla,
  policyname AS politica,
  permissive AS permisiva,
  roles,
  cmd AS comando,
  qual AS condicion_using,
  with_check AS condicion_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'cuentas_por_pagar',
    'cuentas_bancarias',
    'conciliaciones_bancarias',
    'cobranzas',
    'gestiones_cobranza',
    'egresos',
    'gastos',
    'pagos_empleados',
    'pagos_facturas'
  )
ORDER BY tablename, policyname;

COMMENT ON VIEW v_rls_policies_finanzas IS 
  'Vista detallada de políticas RLS en tablas del módulo Finanzas';

-- Consultas de ejemplo para verificar el estado
-- SELECT * FROM v_rls_status_finanzas;
-- SELECT * FROM v_rls_policies_finanzas;

COMMIT;

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================

/*
  NOTAS POST-MIGRACIÓN:
  =====================

  1. VERIFICAR RLS HABILITADO:
     Ejecutar: SELECT * FROM v_rls_status_finanzas;
     Todas las tablas deben tener:
     - rls_habilitado = true
     - num_politicas >= 1
     - 'tenant_isolation' en el array de políticas

  2. VERIFICAR POLÍTICAS:
     Ejecutar: SELECT * FROM v_rls_policies_finanzas;
     Debe mostrar las políticas tenant_isolation para las 9 tablas

  3. PROBAR AISLAMIENTO:
     
     -- Configurar tenant_id en la sesión
     SET app.current_tenant_id = '[uuid-tenant-1]';
     
     -- Esta query solo debe retornar datos del tenant-1
     SELECT * FROM cuentas_por_pagar;
     
     -- Cambiar a otro tenant
     SET app.current_tenant_id = '[uuid-tenant-2]';
     
     -- Esta query solo debe retornar datos del tenant-2
     SELECT * FROM cuentas_por_pagar;
     
     -- Intentar acceder sin tenant_id (debe fallar o retornar vacío)
     RESET app.current_tenant_id;
     SELECT * FROM cuentas_por_pagar;

  4. IMPACTO EN LA APLICACIÓN:
     
     CRÍTICO: La aplicación DEBE configurar app.current_tenant_id en cada sesión
     
     En el código de la aplicación (ejemplo con Supabase):
     
     // Al iniciar sesión o en cada request
     const { data, error } = await supabase.rpc('set_tenant_context', {
       tenant_id: user.tenant_id
     });
     
     // O usando SQL directo
     await supabase.rpc('exec_sql', {
       sql: `SET app.current_tenant_id = '${tenantId}'`
     });

  5. TROUBLESHOOTING:
     
     PROBLEMA: "No se retornan datos después de habilitar RLS"
     SOLUCIÓN: 
       1. Verificar que app.current_tenant_id está configurado
       2. Verificar que los registros tienen tenant_id asignado
       3. Verificar que el tenant_id coincide
     
     PROBLEMA: "Error: permission denied for table [tabla]"
     SOLUCIÓN:
       1. Verificar que el rol tiene permisos en la tabla
       2. Verificar que las políticas RLS están activas
       3. Verificar que el usuario está autenticado
     
     PROBLEMA: "Se ven datos de otros tenants"
     SOLUCIÓN:
       1. Verificar que RLS está habilitado (no solo las políticas)
       2. Verificar que la política tenant_isolation está activa
       3. Verificar que no hay políticas permisivas adicionales

  6. PERFORMANCE:
     
     - Los índices en tenant_id (migración 031) son CRÍTICOS
     - Sin índices: Performance degradado significativamente
     - Con índices: Performance similar a queries sin RLS
     
     Monitorear performance:
     EXPLAIN ANALYZE SELECT * FROM cuentas_por_pagar 
     WHERE tenant_id = '[uuid]';
     
     Debe usar el índice: Index Scan using cuentas_por_pagar_tenant_id_idx

  7. SEGURIDAD:
     
     ✓ Aislamiento a nivel de base de datos (no depende de la aplicación)
     ✓ Imposible acceder a datos de otros tenants (incluso con SQL injection)
     ✓ Superadmin puede acceder a todos los datos (si está configurado)
     
     IMPORTANTE: RLS NO protege contra:
     - Usuarios con rol de superusuario de PostgreSQL
     - Acceso directo a la base de datos (fuera de la aplicación)
     - Backups de base de datos (contienen todos los datos)

  8. PRÓXIMOS PASOS:
     - Aplicar RLS a módulo Contabilidad (TASK 1.3)
     - Aplicar RLS a módulo RRHH (TASK 1.4)
     - Crear tests de seguridad automatizados (TASK 2.1)
     - Pruebas de penetración (TASK 2.3)

  9. ROLLBACK:
     Si es necesario deshabilitar RLS:
     
     ALTER TABLE cuentas_por_pagar DISABLE ROW LEVEL SECURITY;
     ALTER TABLE cuentas_bancarias DISABLE ROW LEVEL SECURITY;
     ALTER TABLE conciliaciones_bancarias DISABLE ROW LEVEL SECURITY;
     ALTER TABLE cobranzas DISABLE ROW LEVEL SECURITY;
     ALTER TABLE gestiones_cobranza DISABLE ROW LEVEL SECURITY;
     ALTER TABLE egresos DISABLE ROW LEVEL SECURITY;
     ALTER TABLE gastos DISABLE ROW LEVEL SECURITY;
     ALTER TABLE pagos_empleados DISABLE ROW LEVEL SECURITY;
     ALTER TABLE pagos_facturas DISABLE ROW LEVEL SECURITY;
     
     -- Eliminar políticas
     DROP POLICY IF EXISTS tenant_isolation ON cuentas_por_pagar;
     DROP POLICY IF EXISTS tenant_isolation ON cuentas_bancarias;
     DROP POLICY IF EXISTS tenant_isolation ON conciliaciones_bancarias;
     DROP POLICY IF EXISTS tenant_isolation ON cobranzas;
     DROP POLICY IF EXISTS tenant_isolation ON gestiones_cobranza;
     DROP POLICY IF EXISTS tenant_isolation ON egresos;
     DROP POLICY IF EXISTS tenant_isolation ON gastos;
     DROP POLICY IF EXISTS tenant_isolation ON pagos_empleados;
     DROP POLICY IF EXISTS tenant_isolation ON pagos_facturas;
     
     -- Eliminar vistas
     DROP VIEW IF EXISTS v_rls_status_finanzas;
     DROP VIEW IF EXISTS v_rls_policies_finanzas;

  10. REFERENCIAS:
      - PostgreSQL RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
      - Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
      - Multi-tenancy patterns: https://www.postgresql.org/docs/current/ddl-schemas.html
*/