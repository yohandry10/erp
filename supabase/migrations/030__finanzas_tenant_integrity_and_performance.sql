-- ============================================================================
-- 030__finanzas_tenant_integrity_and_performance.sql
-- Hardening tenant en Finanzas + índices de performance por patrones runtime.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Helper de introspección de columnas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.column_exists(p_table text, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  );
$$;

-- ----------------------------------------------------------------------------
-- Asegurar tenant_id en tablas clave de finanzas
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cuentas_bancarias ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS public.movimientos_bancarios ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS public.cuentas_por_pagar ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS public.cxc_pagos ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS public.pagos_facturas ADD COLUMN IF NOT EXISTS tenant_id uuid;

SELECT app.add_fk_if_possible('cuentas_bancarias', 'tenant_id', 'tenants', 'id', 'fk_cuentas_bancarias_tenant_id_v2');
SELECT app.add_fk_if_possible('movimientos_bancarios', 'tenant_id', 'tenants', 'id', 'fk_movimientos_bancarios_tenant_id_v2');
SELECT app.add_fk_if_possible('conciliaciones_bancarias', 'tenant_id', 'tenants', 'id', 'fk_conciliaciones_bancarias_tenant_id_v2');
SELECT app.add_fk_if_possible('cuentas_por_cobrar', 'tenant_id', 'tenants', 'id', 'fk_cuentas_por_cobrar_tenant_id_v2');
SELECT app.add_fk_if_possible('cuentas_por_pagar', 'tenant_id', 'tenants', 'id', 'fk_cuentas_por_pagar_tenant_id_v2');
SELECT app.add_fk_if_possible('cxc_pagos', 'tenant_id', 'tenants', 'id', 'fk_cxc_pagos_tenant_id_v2');
SELECT app.add_fk_if_possible('pagos_facturas', 'tenant_id', 'tenants', 'id', 'fk_pagos_facturas_tenant_id_v2');

-- ----------------------------------------------------------------------------
-- Backfill tenant_id por relaciones disponibles
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF app.column_exists('cuentas_por_cobrar', 'tenant_id')
     AND app.column_exists('cuentas_por_cobrar', 'cliente_id')
     AND app.column_exists('clientes', 'tenant_id') THEN
    UPDATE public.cuentas_por_cobrar c
    SET tenant_id = cl.tenant_id
    FROM public.clientes cl
    WHERE c.tenant_id IS NULL
      AND c.cliente_id = cl.id
      AND cl.tenant_id IS NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF app.column_exists('cuentas_por_pagar', 'tenant_id')
     AND app.column_exists('cuentas_por_pagar', 'proveedor_id')
     AND app.column_exists('proveedores', 'tenant_id') THEN
    UPDATE public.cuentas_por_pagar c
    SET tenant_id = p.tenant_id
    FROM public.proveedores p
    WHERE c.tenant_id IS NULL
      AND c.proveedor_id = p.id
      AND p.tenant_id IS NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF app.column_exists('movimientos_bancarios', 'tenant_id')
     AND app.column_exists('movimientos_bancarios', 'cuenta_bancaria_id')
     AND app.column_exists('cuentas_bancarias', 'tenant_id') THEN
    UPDATE public.movimientos_bancarios m
    SET tenant_id = cb.tenant_id
    FROM public.cuentas_bancarias cb
    WHERE m.tenant_id IS NULL
      AND m.cuenta_bancaria_id = cb.id
      AND cb.tenant_id IS NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF app.column_exists('conciliaciones_bancarias', 'tenant_id')
     AND app.column_exists('conciliaciones_bancarias', 'cuenta_bancaria_id')
     AND app.column_exists('cuentas_bancarias', 'tenant_id') THEN
    UPDATE public.conciliaciones_bancarias c
    SET tenant_id = cb.tenant_id
    FROM public.cuentas_bancarias cb
    WHERE c.tenant_id IS NULL
      AND c.cuenta_bancaria_id = cb.id
      AND cb.tenant_id IS NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF app.column_exists('cxc_pagos', 'tenant_id')
     AND app.column_exists('cxc_pagos', 'cuenta_id')
     AND app.column_exists('cuentas_por_cobrar', 'tenant_id') THEN
    UPDATE public.cxc_pagos p
    SET tenant_id = c.tenant_id
    FROM public.cuentas_por_cobrar c
    WHERE p.tenant_id IS NULL
      AND p.cuenta_id = c.id
      AND c.tenant_id IS NOT NULL;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Índices de performance sobre filtros/ordenamientos reales
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF app.column_exists('cuentas_por_cobrar', 'tenant_id')
     AND app.column_exists('cuentas_por_cobrar', 'estado')
     AND app.column_exists('cuentas_por_cobrar', 'fecha_vencimiento') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cxc_tenant_estado_vencimiento ON public.cuentas_por_cobrar (tenant_id, estado, fecha_vencimiento)';
  END IF;

  IF app.column_exists('cuentas_por_cobrar', 'tenant_id')
     AND app.column_exists('cuentas_por_cobrar', 'cliente_id')
     AND app.column_exists('cuentas_por_cobrar', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cxc_tenant_cliente_created ON public.cuentas_por_cobrar (tenant_id, cliente_id, created_at DESC)';
  END IF;

  IF app.column_exists('cuentas_por_cobrar', 'tenant_id')
     AND app.column_exists('cuentas_por_cobrar', 'idempotency_key') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ux_cxc_tenant_idempotency_v2 ON public.cuentas_por_cobrar (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL';
  END IF;
END
$$;

DO $$
BEGIN
  IF app.column_exists('cuentas_por_pagar', 'tenant_id')
     AND app.column_exists('cuentas_por_pagar', 'estado')
     AND app.column_exists('cuentas_por_pagar', 'fecha_vencimiento') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cxp_tenant_estado_vencimiento ON public.cuentas_por_pagar (tenant_id, estado, fecha_vencimiento)';
  END IF;

  IF app.column_exists('cuentas_por_pagar', 'tenant_id')
     AND app.column_exists('cuentas_por_pagar', 'proveedor_id')
     AND app.column_exists('cuentas_por_pagar', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cxp_tenant_proveedor_created ON public.cuentas_por_pagar (tenant_id, proveedor_id, created_at DESC)';
  END IF;

  IF app.column_exists('cuentas_por_pagar', 'tenant_id')
     AND app.column_exists('cuentas_por_pagar', 'idempotency_key') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ux_cxp_tenant_idempotency_v2 ON public.cuentas_por_pagar (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL';
  END IF;
END
$$;

DO $$
BEGIN
  IF app.column_exists('movimientos_bancarios', 'tenant_id')
     AND app.column_exists('movimientos_bancarios', 'cuenta_bancaria_id')
     AND app.column_exists('movimientos_bancarios', 'fecha') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_mov_bancos_tenant_cuenta_fecha ON public.movimientos_bancarios (tenant_id, cuenta_bancaria_id, fecha DESC)';
  END IF;

  IF app.column_exists('movimientos_bancarios', 'tenant_id')
     AND app.column_exists('movimientos_bancarios', 'conciliado')
     AND app.column_exists('movimientos_bancarios', 'fecha') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_mov_bancos_tenant_conciliado_fecha ON public.movimientos_bancarios (tenant_id, conciliado, fecha DESC)';
  END IF;
END
$$;

DO $$
BEGIN
  IF app.column_exists('conciliaciones_bancarias', 'tenant_id')
     AND app.column_exists('conciliaciones_bancarias', 'cuenta_bancaria_id')
     AND app.column_exists('conciliaciones_bancarias', 'periodo') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_conciliaciones_tenant_cuenta_periodo ON public.conciliaciones_bancarias (tenant_id, cuenta_bancaria_id, periodo)';
  END IF;
END
$$;

DO $$
BEGIN
  IF app.column_exists('cuentas_bancarias', 'tenant_id')
     AND app.column_exists('cuentas_bancarias', 'activo')
     AND app.column_exists('cuentas_bancarias', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_tenant_activo_created ON public.cuentas_bancarias (tenant_id, activo, created_at DESC)';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Reafirmar RLS en tablas finanzas
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cuentas_bancarias',
    'movimientos_bancarios',
    'conciliaciones_bancarias',
    'cuentas_por_cobrar',
    'cuentas_por_pagar',
    'cxc_pagos',
    'pagos_facturas'
  ]
  LOOP
    IF app.column_exists(v_table, 'tenant_id') THEN
      PERFORM app.apply_tenant_policy('public', v_table);
    END IF;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- Vista de estado tenant/RLS en finanzas (enriquecida)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_tenant_id_status_finanzas;

CREATE OR REPLACE VIEW public.v_tenant_id_status_finanzas AS
WITH finance_tables AS (
  SELECT unnest(ARRAY[
    'cuentas_bancarias',
    'movimientos_bancarios',
    'conciliaciones_bancarias',
    'cuentas_por_cobrar',
    'cuentas_por_pagar',
    'cxc_pagos',
    'pagos_facturas'
  ]) AS table_name
),
tenant_cols AS (
  SELECT c.table_name, true AS has_tenant_id
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'tenant_id'
),
rls_state AS (
  SELECT
    cls.relname AS table_name,
    cls.relrowsecurity AS rls_enabled
  FROM pg_class cls
  JOIN pg_namespace ns ON ns.oid = cls.relnamespace
  WHERE ns.nspname = 'public'
    AND cls.relkind = 'r'
),
policy_counts AS (
  SELECT p.tablename AS table_name, COUNT(*)::integer AS policies_count
  FROM pg_policies p
  WHERE p.schemaname = 'public'
  GROUP BY p.tablename
)
SELECT
  ft.table_name,
  COALESCE(tc.has_tenant_id, false) AS has_tenant_id,
  COALESCE(rs.rls_enabled, false) AS rls_enabled,
  COALESCE(pc.policies_count, 0) AS policies_count
FROM finance_tables ft
LEFT JOIN tenant_cols tc ON tc.table_name = ft.table_name
LEFT JOIN rls_state rs ON rs.table_name = ft.table_name
LEFT JOIN policy_counts pc ON pc.table_name = ft.table_name
ORDER BY ft.table_name;

COMMIT;
