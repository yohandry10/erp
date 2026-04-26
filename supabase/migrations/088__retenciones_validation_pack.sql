-- ============================================================================
-- 088__retenciones_validation_pack.sql
-- Pack de validación runtime para módulo de retenciones.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_retenciones_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_count bigint;
BEGIN
  RETURN QUERY
  SELECT
    'trigger_normalize_configuracion_retenciones_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'configuracion_retenciones'
        AND t.tgname = 'trg_normalize_configuracion_retenciones_row'
        AND NOT t.tgisinternal
    ),
    'normalización de configuración de retenciones';

  RETURN QUERY
  SELECT
    'configuracion_retenciones_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 4
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'configuracion_retenciones'
        AND c.column_name IN ('categoria', 'tasa_porcentaje', 'monto_minimo', 'activo')
    ),
    'columnas usadas por RetencionesService';

  RETURN QUERY
  SELECT
    'ux_configuracion_retenciones_tenant_categoria_activa_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'configuracion_retenciones'
        AND indexname = 'ux_configuracion_retenciones_tenant_categoria_activa'
    ),
    'unicidad activa tenant+categoria';

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(categoria), COUNT(*) AS c
    FROM public.configuracion_retenciones
    WHERE tenant_id IS NOT NULL
      AND categoria IS NOT NULL
      AND COALESCE(activo, true) = true
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(categoria)
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_active_configuracion_retenciones_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_retenciones cr
  WHERE (cr.categoria IS NULL OR cr.categoria NOT IN ('CUARTA', 'QUINTA'))
    AND (p_tenant_id IS NULL OR cr.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'invalid_categoria_values'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_retenciones cr
  WHERE (
      cr.tasa_porcentaje < 0
      OR cr.tasa_porcentaje > 100
      OR cr.monto_minimo < 0
    )
    AND (p_tenant_id IS NULL OR cr.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'invalid_rate_or_monto_ranges'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT t.id AS tenant_id
    FROM public.tenants t
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
      AND COALESCE(t.activo, true) = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.configuracion_retenciones cr
        WHERE cr.tenant_id = t.id
          AND upper(cr.categoria) = 'CUARTA'
          AND COALESCE(cr.activo, true) = true
      )
  ) d;

  RETURN QUERY
  SELECT
    'tenants_missing_categoria_cuarta'::text,
    (v_count = 0),
    format('tenants=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT t.id AS tenant_id
    FROM public.tenants t
    WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
      AND COALESCE(t.activo, true) = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.configuracion_retenciones cr
        WHERE cr.tenant_id = t.id
          AND upper(cr.categoria) = 'QUINTA'
          AND COALESCE(cr.activo, true) = true
      )
  ) d;

  RETURN QUERY
  SELECT
    'tenants_missing_categoria_quinta'::text,
    (v_count = 0),
    format('tenants=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_retenciones_runtime_status_actual AS
SELECT *
FROM public.validar_retenciones_runtime(app.resolve_request_tenant_id());

COMMIT;
