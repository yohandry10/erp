-- Migration 031: Crear índices por tenant_id en módulo Finanzas
-- Fecha: 2025-10-24
-- Descripción: Crea índices explícitos en tenant_id para las 9 tablas del módulo Finanzas
-- Parte de: TASK 1.2 - Habilitar RLS en Módulo Finanzas
-- Objetivo: Optimizar performance de queries con RLS habilitado

BEGIN;

-- =====================================================
-- MÓDULO FINANZAS - CREAR ÍNDICES POR TENANT_ID (9 TABLAS)
-- =====================================================

-- Los índices en tenant_id son CRÍTICOS para el rendimiento de RLS
-- Sin estos índices, las políticas RLS causarían table scans completos
-- en cada query, degradando significativamente el performance

DO $$
BEGIN
  RAISE NOTICE '=== INICIANDO CREACIÓN DE ÍNDICES TENANT_ID EN MÓDULO FINANZAS ===';
  
  -- Tabla 1: cuentas_por_pagar
  -- Índice para optimizar queries de cuentas por pagar filtradas por tenant
  RAISE NOTICE 'Creando índice para: cuentas_por_pagar';
  CREATE INDEX IF NOT EXISTS cuentas_por_pagar_tenant_id_idx 
    ON cuentas_por_pagar(tenant_id);
  
  -- Tabla 2: cuentas_bancarias
  -- Índice para optimizar queries de cuentas bancarias filtradas por tenant
  RAISE NOTICE 'Creando índice para: cuentas_bancarias';
  CREATE INDEX IF NOT EXISTS cuentas_bancarias_tenant_id_idx 
    ON cuentas_bancarias(tenant_id);
  
  -- Tabla 3: conciliaciones_bancarias
  -- Índice para optimizar queries de conciliaciones filtradas por tenant
  RAISE NOTICE 'Creando índice para: conciliaciones_bancarias';
  CREATE INDEX IF NOT EXISTS conciliaciones_bancarias_tenant_id_idx 
    ON conciliaciones_bancarias(tenant_id);
  
  -- Tabla 4: cobranzas
  -- Índice para optimizar queries de cobranzas filtradas por tenant
  RAISE NOTICE 'Creando índice para: cobranzas';
  CREATE INDEX IF NOT EXISTS cobranzas_tenant_id_idx 
    ON cobranzas(tenant_id);
  
  -- Tabla 5: gestiones_cobranza
  -- Índice para optimizar queries de gestiones de cobranza filtradas por tenant
  RAISE NOTICE 'Creando índice para: gestiones_cobranza';
  CREATE INDEX IF NOT EXISTS gestiones_cobranza_tenant_id_idx 
    ON gestiones_cobranza(tenant_id);
  
  -- Tabla 6: egresos
  -- Índice para optimizar queries de egresos filtradas por tenant
  RAISE NOTICE 'Creando índice para: egresos';
  CREATE INDEX IF NOT EXISTS egresos_tenant_id_idx 
    ON egresos(tenant_id);
  
  -- Tabla 7: gastos
  -- Índice para optimizar queries de gastos filtradas por tenant
  RAISE NOTICE 'Creando índice para: gastos';
  CREATE INDEX IF NOT EXISTS gastos_tenant_id_idx 
    ON gastos(tenant_id);
  
  -- Tabla 8: pagos_empleados
  -- Índice para optimizar queries de pagos a empleados filtradas por tenant
  RAISE NOTICE 'Creando índice para: pagos_empleados';
  CREATE INDEX IF NOT EXISTS pagos_empleados_tenant_id_idx 
    ON pagos_empleados(tenant_id);
  
  -- Tabla 9: pagos_facturas
  -- Índice para optimizar queries de pagos de facturas filtradas por tenant
  RAISE NOTICE 'Creando índice para: pagos_facturas';
  CREATE INDEX IF NOT EXISTS pagos_facturas_tenant_id_idx 
    ON pagos_facturas(tenant_id);
  
  RAISE NOTICE '=== ÍNDICES TENANT_ID CREADOS EXITOSAMENTE EN 9 TABLAS DEL MÓDULO FINANZAS ===';
END
$$;

-- =====================================================
-- VALIDACIÓN: VERIFICAR QUE LOS ÍNDICES FUERON CREADOS
-- =====================================================

-- Validar que todos los índices existen y están activos
-- Mostrar información sobre el tamaño y uso de cada índice

DO $$
DECLARE
  v_table_name text;
  v_index_name text;
  v_index_exists boolean;
  v_index_size text;
  v_table_size text;
  v_row_count bigint;
BEGIN
  RAISE NOTICE '=== INICIANDO VALIDACIÓN DE ÍNDICES EN MÓDULO FINANZAS ===';
  
  -- Array de tablas del módulo Finanzas
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
    RAISE NOTICE '--- Validando índice para tabla: % ---', v_table_name;
    
    -- Nombre del índice esperado
    v_index_name := v_table_name || '_tenant_id_idx';
    
    -- 1. Verificar que la tabla existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' 
        AND t.table_name = v_table_name
    ) THEN
      RAISE WARNING 'ATENCIÓN: La tabla % NO EXISTE en la base de datos', v_table_name;
      CONTINUE;
    END IF;
    
    -- 2. Verificar que el índice existe
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes i
      WHERE i.schemaname = 'public' 
        AND i.tablename = v_table_name 
        AND i.indexname = v_index_name
    ) INTO v_index_exists;
    
    IF v_index_exists THEN
      RAISE NOTICE '✓ Índice % existe', v_index_name;
      
      -- 3. Obtener tamaño del índice
      SELECT pg_size_pretty(pg_relation_size(v_index_name::regclass))
      INTO v_index_size;
      
      -- 4. Obtener tamaño de la tabla
      SELECT pg_size_pretty(pg_total_relation_size(v_table_name::regclass))
      INTO v_table_size;
      
      -- 5. Obtener cantidad de registros
      EXECUTE format('SELECT COUNT(*) FROM %I', v_table_name) INTO v_row_count;
      
      RAISE NOTICE '  Tamaño del índice: %', v_index_size;
      RAISE NOTICE '  Tamaño de la tabla: %', v_table_size;
      RAISE NOTICE '  Registros en la tabla: %', v_row_count;
      
    ELSE
      RAISE WARNING '✗ Índice % NO EXISTE', v_index_name;
      RAISE WARNING '  ACCIÓN REQUERIDA: Crear el índice manualmente';
    END IF;
    
  END LOOP;
  
  RAISE NOTICE '=== VALIDACIÓN COMPLETADA ===';
  RAISE NOTICE 'Revisar los mensajes de WARNING arriba si los hay';
  
END
$$;

-- =====================================================
-- CREAR VISTA DE RESUMEN DE ÍNDICES
-- =====================================================

-- Crear vista que muestra el estado de los índices tenant_id en módulo Finanzas
CREATE OR REPLACE VIEW v_indices_tenant_finanzas AS
SELECT 
  i.tablename AS tabla,
  i.indexname AS indice,
  pg_size_pretty(pg_relation_size(i.indexname::regclass)) AS tamaño_indice,
  pg_size_pretty(pg_total_relation_size(i.tablename::regclass)) AS tamaño_tabla,
  (SELECT COUNT(*) FROM information_schema.columns c 
   WHERE c.table_schema = 'public' 
     AND c.table_name = i.tablename) AS num_columnas,
  i.indexdef AS definicion_indice
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND i.tablename IN (
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
  AND i.indexname LIKE '%tenant_id_idx'
ORDER BY i.tablename;

COMMENT ON VIEW v_indices_tenant_finanzas IS 
  'Vista de resumen de índices tenant_id en tablas del módulo Finanzas';

-- =====================================================
-- ANÁLISIS DE PERFORMANCE
-- =====================================================

-- Crear vista para analizar el impacto de los índices en el performance
CREATE OR REPLACE VIEW v_performance_indices_finanzas AS
SELECT 
  schemaname,
  relname AS tablename,
  indexrelname AS indexname,
  idx_scan AS veces_usado,
  idx_tup_read AS tuplas_leidas,
  idx_tup_fetch AS tuplas_obtenidas,
  pg_size_pretty(pg_relation_size(indexrelid)) AS tamaño_indice
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname IN (
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
  AND indexrelname LIKE '%tenant_id_idx'
ORDER BY idx_scan DESC;

COMMENT ON VIEW v_performance_indices_finanzas IS 
  'Vista de análisis de performance de índices tenant_id en módulo Finanzas';

-- Consultas de ejemplo para verificar el estado
-- SELECT * FROM v_indices_tenant_finanzas;
-- SELECT * FROM v_performance_indices_finanzas;

COMMIT;

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================

/*
  NOTAS POST-MIGRACIÓN:
  =====================

  1. VERIFICAR ÍNDICES CREADOS:
     Ejecutar: SELECT * FROM v_indices_tenant_finanzas;
     Debe mostrar 9 índices (uno por cada tabla del módulo Finanzas)

  2. MONITOREAR PERFORMANCE:
     Ejecutar: SELECT * FROM v_performance_indices_finanzas;
     Después de usar la aplicación, verificar que idx_scan > 0
     Esto confirma que los índices están siendo utilizados

  3. IMPACTO EN PERFORMANCE:
     - Los índices en tenant_id son CRÍTICOS para RLS
     - Sin índices: Table scan completo en cada query (muy lento)
     - Con índices: Acceso directo a registros del tenant (rápido)
     - Overhead de espacio: Mínimo (~5-10% del tamaño de la tabla)

  4. MANTENIMIENTO:
     - PostgreSQL mantiene los índices automáticamente
     - Ejecutar ANALYZE periódicamente para actualizar estadísticas:
       ANALYZE cuentas_por_pagar;
       ANALYZE cuentas_bancarias;
       -- etc.

  5. TROUBLESHOOTING:
     
     PROBLEMA: "Índice no existe"
     SOLUCIÓN: Ejecutar manualmente:
       CREATE INDEX [tabla]_tenant_id_idx ON [tabla](tenant_id);
     
     PROBLEMA: "Performance degradado después de habilitar RLS"
     SOLUCIÓN: 
       1. Verificar que los índices existen
       2. Ejecutar ANALYZE en las tablas
       3. Verificar que las queries usan los índices:
          EXPLAIN ANALYZE SELECT * FROM [tabla] WHERE tenant_id = '[uuid]';
     
     PROBLEMA: "Índice no se está usando"
     SOLUCIÓN:
       1. Verificar que las queries filtran por tenant_id
       2. Ejecutar ANALYZE para actualizar estadísticas
       3. Considerar REINDEX si el índice está corrupto:
          REINDEX INDEX [tabla]_tenant_id_idx;

  6. PRÓXIMOS PASOS:
     - Habilitar RLS en estas 9 tablas (siguiente subtarea)
     - Crear políticas tenant_isolation
     - Validar que las queries funcionan correctamente
     - Monitorear performance en producción

  7. ROLLBACK:
     Si es necesario eliminar los índices:
     
     DROP INDEX IF EXISTS cuentas_por_pagar_tenant_id_idx;
     DROP INDEX IF EXISTS cuentas_bancarias_tenant_id_idx;
     DROP INDEX IF EXISTS conciliaciones_bancarias_tenant_id_idx;
     DROP INDEX IF EXISTS cobranzas_tenant_id_idx;
     DROP INDEX IF EXISTS gestiones_cobranza_tenant_id_idx;
     DROP INDEX IF EXISTS egresos_tenant_id_idx;
     DROP INDEX IF EXISTS gastos_tenant_id_idx;
     DROP INDEX IF EXISTS pagos_empleados_tenant_id_idx;
     DROP INDEX IF EXISTS pagos_facturas_tenant_id_idx;
     DROP VIEW IF EXISTS v_indices_tenant_finanzas;
     DROP VIEW IF EXISTS v_performance_indices_finanzas;

  8. REFERENCIAS:
     - PostgreSQL Index Documentation: https://www.postgresql.org/docs/current/indexes.html
     - RLS Performance: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
     - Index Monitoring: https://www.postgresql.org/docs/current/monitoring-stats.html
*/

