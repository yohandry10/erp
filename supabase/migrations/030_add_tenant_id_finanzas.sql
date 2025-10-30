-- Migration 030: Agregar tenant_id a tablas del módulo Finanzas
-- Fecha: 2025-10-24
-- Descripción: Agrega columna tenant_id a las 9 tablas del módulo Finanzas
-- Parte de: TASK 1.2 - Habilitar RLS en Módulo Finanzas

BEGIN;

-- =====================================================
-- MÓDULO FINANZAS - AGREGAR TENANT_ID (9 TABLAS)
-- =====================================================

-- Este script agrega la columna tenant_id a las 9 tablas críticas del módulo Finanzas
-- Usa las funciones helper definidas en la migración 025

DO $$
BEGIN
  RAISE NOTICE '=== INICIANDO AGREGADO DE TENANT_ID EN MÓDULO FINANZAS ===';
  
  -- Tabla 1: cuentas_por_pagar
  -- Tabla crítica que registra las deudas a proveedores
  RAISE NOTICE 'Procesando tabla: cuentas_por_pagar';
  PERFORM add_tenant_id_if_missing('cuentas_por_pagar');
  
  -- Tabla 2: cuentas_bancarias
  -- Tabla crítica que registra las cuentas bancarias de la empresa
  RAISE NOTICE 'Procesando tabla: cuentas_bancarias';
  PERFORM add_tenant_id_if_missing('cuentas_bancarias');
  
  -- Tabla 3: conciliaciones_bancarias
  -- Tabla que registra las conciliaciones bancarias
  RAISE NOTICE 'Procesando tabla: conciliaciones_bancarias';
  PERFORM add_tenant_id_if_missing('conciliaciones_bancarias');
  
  -- Tabla 4: cobranzas
  -- Tabla que registra la gestión de cobranzas
  RAISE NOTICE 'Procesando tabla: cobranzas';
  PERFORM add_tenant_id_if_missing('cobranzas');
  
  -- Tabla 5: gestiones_cobranza
  -- Tabla que registra el historial de gestiones de cobranza
  RAISE NOTICE 'Procesando tabla: gestiones_cobranza';
  PERFORM add_tenant_id_if_missing('gestiones_cobranza');
  
  -- Tabla 6: egresos
  -- Tabla crítica que registra los egresos y pagos
  RAISE NOTICE 'Procesando tabla: egresos';
  PERFORM add_tenant_id_if_missing('egresos');
  
  -- Tabla 7: gastos
  -- Tabla que registra los gastos de la empresa
  RAISE NOTICE 'Procesando tabla: gastos';
  PERFORM add_tenant_id_if_missing('gastos');
  
  -- Tabla 8: pagos_empleados
  -- Tabla crítica que registra los pagos a empleados
  RAISE NOTICE 'Procesando tabla: pagos_empleados';
  PERFORM add_tenant_id_if_missing('pagos_empleados');
  
  -- Tabla 9: pagos_facturas
  -- Tabla que registra los pagos de facturas de clientes
  RAISE NOTICE 'Procesando tabla: pagos_facturas';
  PERFORM add_tenant_id_if_missing('pagos_facturas');
  
  RAISE NOTICE '=== TENANT_ID AGREGADO EXITOSAMENTE EN 9 TABLAS DEL MÓDULO FINANZAS ===';
END
$$;

-- =====================================================
-- VALIDACIÓN: VERIFICAR QUE TENANT_ID FUE AGREGADO
-- =====================================================

-- Validar que todas las tablas del módulo Finanzas tienen la columna tenant_id
-- y que los índices fueron creados correctamente

DO $$
DECLARE
  v_table_name text;
  v_column_exists boolean;
  v_index_exists boolean;
  v_row_count integer;
  v_null_tenant_count integer;
BEGIN
  RAISE NOTICE '=== INICIANDO VALIDACIÓN DE TENANT_ID EN MÓDULO FINANZAS ===';
  
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
    RAISE NOTICE '--- Validando tabla: % ---', v_table_name;
    
    -- 1. Verificar que la tabla existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' 
        AND t.table_name = v_table_name
    ) THEN
      RAISE WARNING 'ATENCIÓN: La tabla % NO EXISTE en la base de datos', v_table_name;
      CONTINUE;
    END IF;
    
    -- 2. Verificar que la columna tenant_id existe
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v_table_name
        AND c.column_name = 'tenant_id'
    ) INTO v_column_exists;
    
    IF v_column_exists THEN
      RAISE NOTICE '✓ Columna tenant_id existe en %', v_table_name;
    ELSE
      RAISE WARNING '✗ Columna tenant_id NO existe en %', v_table_name;
      CONTINUE;
    END IF;
    
    -- 3. Verificar que existe índice en tenant_id
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes i
      WHERE i.schemaname = 'public' 
        AND i.tablename = v_table_name 
        AND i.indexname LIKE '%tenant_id%'
    ) INTO v_index_exists;
    
    IF v_index_exists THEN
      RAISE NOTICE '✓ Índice tenant_id existe en %', v_table_name;
    ELSE
      RAISE WARNING '✗ Índice tenant_id NO existe en %', v_table_name;
    END IF;
    
    -- 4. Verificar cantidad de registros existentes
    EXECUTE format('SELECT COUNT(*) FROM %I', v_table_name) INTO v_row_count;
    RAISE NOTICE 'Total de registros en %: %', v_table_name, v_row_count;
    
    -- 5. Verificar registros con tenant_id NULL
    IF v_row_count > 0 THEN
      EXECUTE format(
        'SELECT COUNT(*) FROM %I WHERE tenant_id IS NULL',
        v_table_name
      ) INTO v_null_tenant_count;
      
      IF v_null_tenant_count > 0 THEN
        RAISE WARNING 'ATENCIÓN: % tiene % registros con tenant_id NULL', 
          v_table_name, v_null_tenant_count;
        RAISE NOTICE 'ACCIÓN REQUERIDA: Ejecutar backfill de tenant_id para registros existentes';
      ELSE
        RAISE NOTICE '✓ Todos los registros en % tienen tenant_id asignado', v_table_name;
      END IF;
    END IF;
    
  END LOOP;
  
  RAISE NOTICE '=== VALIDACIÓN COMPLETADA ===';
  RAISE NOTICE 'Revisar los mensajes de WARNING arriba si los hay';
  
END
$$;

-- =====================================================
-- CREAR VISTA DE RESUMEN
-- =====================================================

-- Crear vista de resumen del estado de tenant_id en módulo Finanzas
CREATE OR REPLACE VIEW v_tenant_id_status_finanzas AS
SELECT 
  t.tablename,
  EXISTS (
    SELECT 1 
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = t.tablename
      AND c.column_name = 'tenant_id'
  ) AS tiene_tenant_id,
  COUNT(DISTINCT i.indexname) FILTER (WHERE i.indexname LIKE '%tenant_id%') AS tiene_indice_tenant,
  pg_size_pretty(pg_total_relation_size(t.schemaname||'.'||t.tablename)) AS tamaño_tabla
FROM pg_tables t
LEFT JOIN pg_indexes i ON i.tablename = t.tablename AND i.schemaname = t.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename IN (
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
GROUP BY t.schemaname, t.tablename
ORDER BY t.tablename;

COMMENT ON VIEW v_tenant_id_status_finanzas IS 
  'Vista de resumen del estado de tenant_id en tablas del módulo Finanzas';

-- Consulta de ejemplo para verificar el estado
-- SELECT * FROM v_tenant_id_status_finanzas;

COMMIT;

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================

/*
  NOTAS POST-MIGRACIÓN:
  =====================

  1. VERIFICAR ESTADO:
     Ejecutar: SELECT * FROM v_tenant_id_status_finanzas;
     Todas las tablas deben tener tiene_tenant_id = true y tiene_indice_tenant >= 1

  2. BACKFILL DE DATOS EXISTENTES:
     Si hay registros con tenant_id NULL, ejecutar backfill basado en relaciones:
     
     -- Ejemplo para cuentas_por_pagar (ajustar según estructura real)
     UPDATE cuentas_por_pagar
     SET tenant_id = (
       SELECT tenant_id FROM proveedores 
       WHERE proveedores.id = cuentas_por_pagar.proveedor_id 
       LIMIT 1
     )
     WHERE tenant_id IS NULL;

  3. PRÓXIMOS PASOS:
     - Crear índices adicionales si es necesario
     - Habilitar RLS en estas tablas (siguiente tarea)
     - Validar que las queries existentes funcionan correctamente

  4. ROLLBACK:
     Si es necesario revertir esta migración:
     
     ALTER TABLE cuentas_por_pagar DROP COLUMN IF EXISTS tenant_id;
     ALTER TABLE cuentas_bancarias DROP COLUMN IF EXISTS tenant_id;
     ALTER TABLE conciliaciones_bancarias DROP COLUMN IF EXISTS tenant_id;
     ALTER TABLE cobranzas DROP COLUMN IF EXISTS tenant_id;
     ALTER TABLE gestiones_cobranza DROP COLUMN IF EXISTS tenant_id;
     ALTER TABLE egresos DROP COLUMN IF EXISTS tenant_id;
     ALTER TABLE gastos DROP COLUMN IF EXISTS tenant_id;
     ALTER TABLE pagos_empleados DROP COLUMN IF EXISTS tenant_id;
     ALTER TABLE pagos_facturas DROP COLUMN IF EXISTS tenant_id;
     DROP VIEW IF EXISTS v_tenant_id_status_finanzas;
*/
