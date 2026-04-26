-- ============================================================================
-- 038__contabilidad_base_indexes_for_mview_refresh.sql
-- Índices de soporte para refresh/consulta de materialized views contables.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF app.column_exists('asientos_contables', 'tenant_id')
     AND app.column_exists('asientos_contables', 'fecha')
     AND app.column_exists('asientos_contables', 'estado') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_asientos_contables_tenant_fecha_estado ON public.asientos_contables (tenant_id, fecha, estado)';
  END IF;

  IF app.column_exists('asientos_contables', 'tenant_id')
     AND app.column_exists('asientos_contables', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_asientos_contables_tenant_created ON public.asientos_contables (tenant_id, created_at DESC)';
  END IF;

  IF app.column_exists('detalle_asientos', 'asiento_id')
     AND app.column_exists('detalle_asientos', 'cuenta_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_detalle_asientos_asiento_cuenta ON public.detalle_asientos (asiento_id, cuenta_id)';
  END IF;

  IF app.column_exists('detalle_asientos', 'tenant_id')
     AND app.column_exists('detalle_asientos', 'cuenta_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_detalle_asientos_tenant_cuenta ON public.detalle_asientos (tenant_id, cuenta_id)';
  END IF;

  IF app.column_exists('detalle_asientos', 'tenant_id')
     AND app.column_exists('detalle_asientos', 'asiento_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_detalle_asientos_tenant_asiento ON public.detalle_asientos (tenant_id, asiento_id)';
  END IF;

  IF app.column_exists('plan_cuentas', 'tenant_id')
     AND app.column_exists('plan_cuentas', 'codigo')
     AND app.column_exists('plan_cuentas', 'activo') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_plan_cuentas_tenant_codigo_activo_v2 ON public.plan_cuentas (tenant_id, codigo, activo)';
  END IF;
END
$$;

-- Refuerzo de integridad relacional para joins contables
SELECT app.add_fk_if_possible('detalle_asientos', 'asiento_id', 'asientos_contables', 'id', 'fk_detalle_asientos_asiento_id_v2');
SELECT app.add_fk_if_possible('detalle_asientos', 'cuenta_id', 'plan_cuentas', 'id', 'fk_detalle_asientos_cuenta_id_v2');

COMMIT;
