-- =====================================================
-- G2: Triggers de Auditoría en BD para Tablas Críticas
-- Migración: 058_db_audit_triggers_core.sql
-- =====================================================
-- 
-- Objetivo: Registrar automáticamente todos los cambios (INSERT, UPDATE, DELETE)
-- en tablas críticas de negocio en la tabla audit_log para trazabilidad completa.
--
-- Tablas cubiertas:
-- - ordenes_compra
-- - pedidos_venta
-- - movimientos_bancarios
-- - asientos_contables
-- - cuentas_por_cobrar
-- - cuentas_por_pagar
-- - cpe
-- - gre
--
-- =====================================================

-- Función genérica de auditoría reutilizable
CREATE OR REPLACE FUNCTION audit_table_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_name TEXT := TG_TABLE_NAME;
  v_operation TEXT := TG_OP;
  v_record_id UUID;
  v_tenant_id UUID;
  v_user_id UUID;
  v_old_values JSONB := NULL;
  v_new_values JSONB := NULL;
  v_changed_fields TEXT[] := NULL;
BEGIN
  -- Determinar record_id y tenant_id según la operación
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_tenant_id := OLD.tenant_id;
    v_old_values := row_to_json(OLD)::jsonb;
  ELSE
    v_record_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
    v_new_values := row_to_json(NEW)::jsonb;
    
    -- Para UPDATE, también capturar valores anteriores
    IF TG_OP = 'UPDATE' THEN
      v_old_values := row_to_json(OLD)::jsonb;
      
      -- Calcular campos cambiados
      SELECT array_agg(key)
      INTO v_changed_fields
      FROM jsonb_each(v_new_values)
      WHERE (v_old_values->>key) IS DISTINCT FROM (v_new_values->>key);
    END IF;
  END IF;

  -- Obtener user_id del contexto
  BEGIN
    v_user_id := app.current_user_id();
  EXCEPTION
    WHEN OTHERS THEN
      v_user_id := NULL; -- Si no se puede obtener, usar NULL
  END;

  -- Insertar en audit_log
  INSERT INTO audit_log (
    table_name,
    operation,
    record_id,
    old_values,
    new_values,
    changed_fields,
    user_id,
    tenant_id,
    timestamp,
    metadata
  ) VALUES (
    v_table_name,
    v_operation,
    v_record_id,
    v_old_values,
    v_new_values,
    v_changed_fields,
    v_user_id,
    v_tenant_id,
    NOW(),
    jsonb_build_object(
      'trigger_name', TG_NAME,
      'trigger_when', TG_WHEN,
      'trigger_level', TG_LEVEL
    )
  );

  -- Retornar el registro apropiado según la operación
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION audit_table_changes IS 
  'Función genérica de auditoría que registra cambios en audit_log. Captura INSERT, UPDATE, DELETE automáticamente.';

-- =====================================================
-- TRIGGERS PARA CADA TABLA CRÍTICA
-- =====================================================

-- 1. ordenes_compra
DROP TRIGGER IF EXISTS audit_ordenes_compra_trigger ON ordenes_compra;
CREATE TRIGGER audit_ordenes_compra_trigger
  AFTER INSERT OR UPDATE OR DELETE ON ordenes_compra
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

COMMENT ON TRIGGER audit_ordenes_compra_trigger ON ordenes_compra IS 
  'Registra automáticamente todos los cambios en órdenes de compra para auditoría.';

-- 2. pedidos_venta
DROP TRIGGER IF EXISTS audit_pedidos_venta_trigger ON pedidos_venta;
CREATE TRIGGER audit_pedidos_venta_trigger
  AFTER INSERT OR UPDATE OR DELETE ON pedidos_venta
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

COMMENT ON TRIGGER audit_pedidos_venta_trigger ON pedidos_venta IS 
  'Registra automáticamente todos los cambios en pedidos de venta para auditoría.';

-- 3. movimientos_bancarios
DROP TRIGGER IF EXISTS audit_movimientos_bancarios_trigger ON movimientos_bancarios;
CREATE TRIGGER audit_movimientos_bancarios_trigger
  AFTER INSERT OR UPDATE OR DELETE ON movimientos_bancarios
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

COMMENT ON TRIGGER audit_movimientos_bancarios_trigger ON movimientos_bancarios IS 
  'Registra automáticamente todos los cambios en movimientos bancarios para auditoría.';

-- 4. asientos_contables
DROP TRIGGER IF EXISTS audit_asientos_contables_trigger ON asientos_contables;
CREATE TRIGGER audit_asientos_contables_trigger
  AFTER INSERT OR UPDATE OR DELETE ON asientos_contables
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

COMMENT ON TRIGGER audit_asientos_contables_trigger ON asientos_contables IS 
  'Registra automáticamente todos los cambios en asientos contables para auditoría.';

-- 5. cuentas_por_cobrar
DROP TRIGGER IF EXISTS audit_cuentas_por_cobrar_trigger ON cuentas_por_cobrar;
CREATE TRIGGER audit_cuentas_por_cobrar_trigger
  AFTER INSERT OR UPDATE OR DELETE ON cuentas_por_cobrar
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

COMMENT ON TRIGGER audit_cuentas_por_cobrar_trigger ON cuentas_por_cobrar IS 
  'Registra automáticamente todos los cambios en cuentas por cobrar para auditoría.';

-- 6. cuentas_por_pagar
DROP TRIGGER IF EXISTS audit_cuentas_por_pagar_trigger ON cuentas_por_pagar;
CREATE TRIGGER audit_cuentas_por_pagar_trigger
  AFTER INSERT OR UPDATE OR DELETE ON cuentas_por_pagar
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

COMMENT ON TRIGGER audit_cuentas_por_pagar_trigger ON cuentas_por_pagar IS 
  'Registra automáticamente todos los cambios en cuentas por pagar para auditoría.';

-- 7. cpe
DROP TRIGGER IF EXISTS audit_cpe_trigger ON cpe;
CREATE TRIGGER audit_cpe_trigger
  AFTER INSERT OR UPDATE OR DELETE ON cpe
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

COMMENT ON TRIGGER audit_cpe_trigger ON cpe IS 
  'Registra automáticamente todos los cambios en comprobantes electrónicos (CPE) para auditoría.';

-- 8. gre
DROP TRIGGER IF EXISTS audit_gre_trigger ON gre;
CREATE TRIGGER audit_gre_trigger
  AFTER INSERT OR UPDATE OR DELETE ON gre
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

COMMENT ON TRIGGER audit_gre_trigger ON gre IS 
  'Registra automáticamente todos los cambios en guías de remisión electrónica (GRE) para auditoría.';

-- =====================================================
-- VERIFICACIÓN DE TRIGGERS CREADOS
-- =====================================================

DO $$
DECLARE
  v_trigger_count INTEGER;
  v_expected_triggers TEXT[] := ARRAY[
    'audit_ordenes_compra_trigger',
    'audit_pedidos_venta_trigger',
    'audit_movimientos_bancarios_trigger',
    'audit_asientos_contables_trigger',
    'audit_cuentas_por_cobrar_trigger',
    'audit_cuentas_por_pagar_trigger',
    'audit_cpe_trigger',
    'audit_gre_trigger'
  ];
  v_trigger_name TEXT;
  v_all_exist BOOLEAN := TRUE;
BEGIN
  RAISE NOTICE '=== VERIFICACIÓN DE TRIGGERS DE AUDITORÍA ===';
  
  FOREACH v_trigger_name IN ARRAY v_expected_triggers
  LOOP
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger
    WHERE tgname = v_trigger_name;
    
    IF v_trigger_count > 0 THEN
      RAISE NOTICE '✓ Trigger % existe', v_trigger_name;
    ELSE
      RAISE WARNING '✗ ERROR: Trigger % NO existe', v_trigger_name;
      v_all_exist := FALSE;
    END IF;
  END LOOP;
  
  IF v_all_exist THEN
    RAISE NOTICE '=== ✓ TODOS LOS TRIGGERS FUERON CREADOS EXITOSAMENTE ===';
  ELSE
    RAISE EXCEPTION 'ERROR: Algunos triggers no fueron creados. Abortando migración.';
  END IF;
END $$;

-- =====================================================
-- REGISTRO EN AUDIT LOG
-- =====================================================

INSERT INTO audit_log (
  table_name,
  operation,
  record_id,
  new_values,
  user_id,
  tenant_id,
  metadata,
  timestamp
) VALUES (
  'system_migrations',
  'INSERT',
  gen_random_uuid(),
  jsonb_build_object(
    'migration', '058_db_audit_triggers_core',
    'triggers_created', 8,
    'tables_covered', ARRAY[
      'ordenes_compra',
      'pedidos_venta',
      'movimientos_bancarios',
      'asientos_contables',
      'cuentas_por_cobrar',
      'cuentas_por_pagar',
      'cpe',
      'gre'
    ],
    'function_created', 'audit_table_changes',
    'priority', 'IMPORTANT',
    'sprint', 'Sprint 5 - Auditoría y Trazabilidad'
  ),
  NULL,  -- System migration
  NULL,  -- System-wide
  jsonb_build_object(
    'action', 'CREATE_AUDIT_TRIGGERS',
    'compliance', 'AUDIT_TRACEABILITY_COMPLETE',
    'security_impact', 'MEDIUM'
  ),
  NOW()
);

-- =====================================================
-- COMENTARIOS FINALES
-- =====================================================

COMMENT ON FUNCTION audit_table_changes IS 
  'Función genérica de auditoría que puede ser reutilizada para cualquier tabla. 
   Registra automáticamente INSERT, UPDATE, DELETE en audit_log con información completa
   incluyendo old_values, new_values, changed_fields, user_id y tenant_id.';

