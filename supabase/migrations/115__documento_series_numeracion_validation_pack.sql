-- ============================================================================
-- 115__documento_series_numeracion_validation_pack.sql
-- Pack de validación runtime para correlativos fiscales (documento_series).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_documento_series_numeracion_runtime(
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
    'trigger_normalize_documento_series_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_series'
        AND t.tgname = 'trg_normalize_documento_series_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de documento_series';

  RETURN QUERY
  SELECT
    'documento_series_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'documento_series'
        AND c.column_name IN (
          'tipo_documento',
          'serie',
          'correlativo_actual',
          'correlativo_maximo',
          'activo',
          'longitud_correlativo',
          'reiniciar_por_periodo',
          'periodo_actual'
        )
    ),
    'columnas runtime de numeración fiscal';

  RETURN QUERY
  SELECT
    'ux_documento_series_tenant_tipo_serie_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'documento_series'
        AND indexname = 'ux_documento_series_tenant_tipo_serie'
    ),
    'índice único de compatibilidad para upserts';

  RETURN QUERY
  SELECT
    'ux_documento_series_scope_active_upper_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'documento_series'
        AND indexname = 'ux_documento_series_scope_active_upper'
    ),
    'unicidad operativa de series activas';

  RETURN QUERY
  SELECT
    'rls_documento_series_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_series'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado y forzado en documento_series';

  RETURN QUERY
  SELECT
    'rls_documento_series_tenant_policy_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = 'documento_series'
        AND p.policyname = 'tenant_isolation'
    ),
    'policy tenant_isolation presente';

  RETURN QUERY
  SELECT
    'rpc_obtener_siguiente_numero_serie_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc pr
      JOIN pg_namespace pn ON pn.oid = pr.pronamespace
      WHERE pn.nspname = 'public'
        AND pr.proname = 'obtener_siguiente_numero_serie'
        AND pr.pronargs = 3
    ),
    'RPC de correlativo por serie';

  RETURN QUERY
  SELECT
    'rpc_obtener_siguiente_numero_documento_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc pr
      JOIN pg_namespace pn ON pn.oid = pr.pronamespace
      WHERE pn.nspname = 'public'
        AND pr.proname = 'obtener_siguiente_numero_documento'
        AND pr.pronargs = 3
    ),
    'wrapper RPC de correlativo de documento';

  SELECT COUNT(*)
  INTO v_count
  FROM public.documento_series ds
  WHERE (
      ds.tipo_documento IS NULL
      OR btrim(ds.tipo_documento) = ''
      OR ds.serie IS NULL
      OR ds.serie !~ '^[A-Z0-9]{1,10}$'
      OR COALESCE(ds.correlativo_actual, -1) < 0
      OR COALESCE(ds.correlativo_maximo, 0) < GREATEST(COALESCE(ds.correlativo_actual, 0), 1)
      OR COALESCE(ds.longitud_correlativo, 0) NOT BETWEEN 4 AND 12
      OR (COALESCE(ds.activo, false) = true AND ds.tenant_id IS NULL)
      OR (COALESCE(ds.activo, false) = true AND upper(COALESCE(ds.estado, '')) <> 'ACTIVO')
    )
    AND (p_tenant_id IS NULL OR ds.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'documento_series_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      ds.tenant_id,
      upper(COALESCE(ds.tipo_documento, '01')) AS tipo_norm,
      upper(COALESCE(ds.serie, 'F001')) AS serie_norm,
      COUNT(*) AS c
    FROM public.documento_series ds
    WHERE COALESCE(ds.activo, true) = true
      AND ds.tenant_id IS NOT NULL
      AND (p_tenant_id IS NULL OR ds.tenant_id = p_tenant_id)
    GROUP BY ds.tenant_id, upper(COALESCE(ds.tipo_documento, '01')), upper(COALESCE(ds.serie, 'F001'))
    HAVING COUNT(*) > 1
  ) dup;

  RETURN QUERY
  SELECT
    'documento_series_duplicate_active_scope_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_documento_series_numeracion_runtime_status_actual AS
SELECT *
FROM public.validar_documento_series_numeracion_runtime(app.resolve_request_tenant_id());

COMMIT;
