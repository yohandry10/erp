-- ============================================================================
-- 299__rebuild_smoke_tests_module_suite.sql
-- Suite de smoke tests por modulo para cierre de reconstruccion.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ejecutar_smoke_tests_modulos_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  module_name text,
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_table_count bigint;
  v_runtime_fn_count bigint;
  v_orch_failed bigint;
BEGIN
  v_tenant_id := COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id());

  RETURN QUERY
  WITH expected_objects(module_name, obj_type, obj_name) AS (
    VALUES
      ('nucleo_seguridad', 'table', 'tenants'),
      ('nucleo_seguridad', 'table', 'empresa_config'),
      ('nucleo_seguridad', 'table', 'usuarios_sistema'),
      ('nucleo_seguridad', 'table', 'roles'),
      ('nucleo_seguridad', 'table', 'permisos'),
      ('nucleo_seguridad', 'table', 'rol_permisos'),
      ('nucleo_seguridad', 'table', 'user_roles'),
      ('nucleo_seguridad', 'table', 'audit_log'),
      ('nucleo_seguridad', 'table', 'wizard_progress'),

      ('ventas_cxc', 'table', 'clientes'),
      ('ventas_cxc', 'table', 'cotizaciones'),
      ('ventas_cxc', 'table', 'pedidos_venta'),
      ('ventas_cxc', 'table', 'pedidos_venta_detalle'),
      ('ventas_cxc', 'table', 'documentos'),
      ('ventas_cxc', 'table', 'documento_detalles'),
      ('ventas_cxc', 'table', 'cuentas_por_cobrar'),
      ('ventas_cxc', 'table', 'cxc_pagos'),
      ('ventas_cxc', 'table', 'ventas'),

      ('pos_cajas', 'table', 'ventas_pos'),
      ('pos_cajas', 'table', 'detalle_ventas_pos'),
      ('pos_cajas', 'table', 'ventas_pos_pagos'),
      ('pos_cajas', 'table', 'cajas'),
      ('pos_cajas', 'table', 'sesiones_caja'),
      ('pos_cajas', 'table', 'movimientos_caja'),
      ('pos_cajas', 'table', 'retiros_caja'),
      ('pos_cajas', 'table', 'cambios_turno'),
      ('pos_cajas', 'table', 'cortes_caja'),
      ('pos_cajas', 'table', 'autorizaciones_caja'),

      ('compras_cxp', 'table', 'proveedores'),
      ('compras_cxp', 'table', 'cotizaciones_compra'),
      ('compras_cxp', 'table', 'ordenes_compra'),
      ('compras_cxp', 'table', 'orden_compra_detalles'),
      ('compras_cxp', 'table', 'recepciones'),
      ('compras_cxp', 'table', 'recepcion_items'),
      ('compras_cxp', 'table', 'devoluciones_proveedor'),
      ('compras_cxp', 'table', 'cuentas_por_pagar'),

      ('inventario_logistica', 'table', 'productos'),
      ('inventario_logistica', 'table', 'stock_movimientos'),
      ('inventario_logistica', 'table', 'movimientos_inventario'),
      ('inventario_logistica', 'table', 'almacenes'),
      ('inventario_logistica', 'table', 'almacen_ubicaciones'),
      ('inventario_logistica', 'table', 'producto_existencias'),
      ('inventario_logistica', 'table', 'lotes_productos'),

      ('finanzas_contabilidad', 'table', 'plan_cuentas'),
      ('finanzas_contabilidad', 'table', 'asientos_contables'),
      ('finanzas_contabilidad', 'table', 'detalle_asientos'),
      ('finanzas_contabilidad', 'table', 'periodos_contables'),
      ('finanzas_contabilidad', 'table', 'cuentas_bancarias'),
      ('finanzas_contabilidad', 'table', 'movimientos_bancarios'),
      ('finanzas_contabilidad', 'table', 'conciliaciones_bancarias'),
      ('finanzas_contabilidad', 'table', 'presupuestos'),
      ('finanzas_contabilidad', 'mview', 'mv_balance_comprobacion'),
      ('finanzas_contabilidad', 'mview', 'mv_balance_general'),
      ('finanzas_contabilidad', 'mview', 'mv_estado_resultados'),

      ('fiscal', 'table', 'cpe'),
      ('fiscal', 'table', 'validaciones_sunat'),
      ('fiscal', 'table', 'comunicaciones_baja'),
      ('fiscal', 'table', 'resumenes_diarios'),
      ('fiscal', 'table', 'gre'),
      ('fiscal', 'table', 'gre_guias'),
      ('fiscal', 'table', 'gre_detalles'),
      ('fiscal', 'table', 'sire_files'),

      ('rrhh', 'table', 'empleados'),
      ('rrhh', 'table', 'departamentos'),
      ('rrhh', 'table', 'contratos'),
      ('rrhh', 'table', 'asistencia'),
      ('rrhh', 'table', 'planillas'),
      ('rrhh', 'table', 'conceptos_planilla'),
      ('rrhh', 'table', 'empleado_planilla'),
      ('rrhh', 'table', 'pagos_empleados'),

      ('observabilidad', 'table', 'integration_logs'),
      ('observabilidad', 'table', 'notificaciones'),
      ('observabilidad', 'table', 'auth_login_attempts'),
      ('observabilidad', 'table', 'user_sessions'),
      ('observabilidad', 'table', 'system_alerts'),
      ('observabilidad', 'table', 'secret_rotation_state'),
      ('observabilidad', 'table', 'pii_encryption_log'),

      ('runtime_gate', 'function', 'validar_rebuild_runtime_orchestrator'),
      ('runtime_gate', 'function', 'validar_rebuild_runtime_summary'),
      ('runtime_gate', 'function', 'validar_rebuild_orchestrator_runtime'),
      ('runtime_gate', 'view', 'v_rebuild_runtime_checks_actual'),
      ('runtime_gate', 'view', 'v_rebuild_runtime_summary_actual'),
      ('runtime_gate', 'view', 'v_rebuild_runtime_failures_actual'),
      ('runtime_gate', 'view', 'v_rebuild_runtime_pack_metrics_actual'),
      ('runtime_gate', 'view', 'v_rebuild_orchestrator_runtime_status_actual')
  )
  SELECT
    e.module_name,
    format('%s_%s_exists', e.obj_type, e.obj_name)::text AS check_name,
    CASE e.obj_type
      WHEN 'table' THEN to_regclass(format('public.%I', e.obj_name)) IS NOT NULL
      WHEN 'view' THEN EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = e.obj_name
          AND c.relkind = 'v'
      )
      WHEN 'mview' THEN EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = e.obj_name
          AND c.relkind = 'm'
      )
      WHEN 'function' THEN EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = e.obj_name
      )
      ELSE false
    END AS ok,
    format('%s public.%s', e.obj_type, e.obj_name)::text AS detail
  FROM expected_objects e
  ORDER BY e.module_name, check_name;

  SELECT COUNT(*)
  INTO v_table_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p');

  RETURN QUERY
  SELECT
    'meta',
    'public_tables_minimum',
    (v_table_count >= 150),
    format('tables=%s (min_expected=150)', v_table_count);

  SELECT COUNT(*)
  INTO v_runtime_fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'validar\_%\_runtime' ESCAPE '\';

  RETURN QUERY
  SELECT
    'meta',
    'runtime_validation_functions_minimum',
    (v_runtime_fn_count >= 50),
    format('functions=%s (min_expected=50)', v_runtime_fn_count);

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'validar_rebuild_runtime_orchestrator'
  ) THEN
    BEGIN
      SELECT COUNT(*)
      INTO v_orch_failed
      FROM public.validar_rebuild_runtime_orchestrator(v_tenant_id, true);

      RETURN QUERY
      SELECT
        'meta',
        'orchestrator_failures_zero',
        (v_orch_failed = 0),
        format('failed_checks=%s', v_orch_failed);
    EXCEPTION
      WHEN OTHERS THEN
        RETURN QUERY
        SELECT
          'meta',
          'orchestrator_execution_error',
          false,
          SQLERRM;
    END;
  ELSE
    RETURN QUERY
    SELECT
      'meta',
      'orchestrator_function_missing',
      false,
      'public.validar_rebuild_runtime_orchestrator no existe';
  END IF;

  RETURN;
END;
$$;

COMMIT;
