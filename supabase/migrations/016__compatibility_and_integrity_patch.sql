-- ============================================================================
-- 016__compatibility_and_integrity_patch.sql
-- Cierra brechas de compatibilidad RPC y reglas de integridad pendientes.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Ajustes de columnas detectados en diff codigo vs migraciones
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.conceptos_planilla
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- ----------------------------------------------------------------------------
-- Helper para agregar constraints CHECK solo cuando la columna existe
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.add_check_if_possible(
  p_table text,
  p_column text,
  p_constraint_name text,
  p_expression text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_column_exists boolean;
  v_constraint_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  )
  INTO v_column_exists;

  IF NOT v_column_exists THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = p_table
      AND c.conname = p_constraint_name
  )
  INTO v_constraint_exists;

  IF v_constraint_exists THEN
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s)',
    p_table,
    p_constraint_name,
    p_expression
  );
END;
$$;

SELECT app.add_check_if_possible(
  'productos',
  'stock_actual',
  'ck_productos_stock_actual_non_negative',
  'stock_actual >= 0'
);

SELECT app.add_check_if_possible(
  'productos',
  'stock_reservado',
  'ck_productos_stock_reservado_non_negative',
  'stock_reservado >= 0'
);

SELECT app.add_check_if_possible(
  'productos',
  'stock',
  'ck_productos_stock_non_negative',
  'stock >= 0'
);

SELECT app.add_check_if_possible(
  'producto_existencias',
  'stock_actual',
  'ck_producto_existencias_stock_actual_non_negative',
  'stock_actual >= 0'
);

SELECT app.add_check_if_possible(
  'producto_existencias',
  'stock_reservado',
  'ck_producto_existencias_stock_reservado_non_negative',
  'stock_reservado >= 0'
);

SELECT app.add_check_if_possible(
  'producto_existencias',
  'stock_danado',
  'ck_producto_existencias_stock_danado_non_negative',
  'stock_danado >= 0'
);

-- ----------------------------------------------------------------------------
-- RPC wrappers de compatibilidad detectados en runtime
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_tenant_context(
  p_tenant_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_is_superadmin boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  PERFORM app.set_tenant_context(p_tenant_id, p_user_id, p_is_superadmin);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_config(
  setting text,
  value text,
  is_local boolean DEFAULT true
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.set_config(setting, value, is_local);
$$;

CREATE OR REPLACE FUNCTION public.pgrst_reload_schema()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_table_indexes(p_table_name text)
RETURNS TABLE (
  schemaname text,
  tablename text,
  indexname text,
  indexdef text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
  SELECT
    i.schemaname::text,
    i.tablename::text,
    i.indexname::text,
    i.indexdef::text
  FROM pg_catalog.pg_indexes i
  WHERE i.schemaname = 'public'
    AND i.tablename = p_table_name
  ORDER BY i.indexname;
$$;

COMMIT;
