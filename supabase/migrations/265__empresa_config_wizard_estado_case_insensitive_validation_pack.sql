-- ============================================================================
-- 265__empresa_config_wizard_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en
-- empresa_config/wizard.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_empresa_config_wizard_estado_case_insensitive_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, app, pg_temp
AS $$
DECLARE
  v_count bigint;
  v_delta bigint;
BEGIN
  RETURN QUERY
  SELECT
    'citext_extension_present'::text,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext'),
    'extension citext instalada'::text;

  RETURN QUERY
  SELECT
    'empresa_config_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'empresa_config'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'empresa_config.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'normalize_empresa_config_estado_263_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_empresa_config_estado_263'
    ),
    'helper app.normalize_empresa_config_estado_263'::text;

  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('empresa_config', 'trg_normalize_empresa_config_row', 'normalizacion empresa_config'),
      ('wizard_progress', 'trg_normalize_wizard_progress_row', 'normalizacion wizard_progress')
  )
  SELECT
    format('trigger_%s_exists', e.trigger_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND t.tgname = e.trigger_name
        AND NOT t.tgisinternal
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('empresa_config', 'ck_empresa_config_estado_runtime', 'constraint estado empresa_config'),
      ('wizard_progress', 'ck_wizard_progress_step_runtime', 'constraint wizard_progress step')
  )
  SELECT
    format('constraint_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = e.relname
        AND c.conname = e.conname
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('empresa_config', 'idx_empresa_config_tenant_estado_ci_runtime_263', 'indice CI empresa_config'),
      ('empresa_config', 'idx_empresa_config_tenant_estado_plan_runtime', 'indice base estado/plan'),
      ('wizard_progress', 'idx_wizard_progress_tenant_completado_updated_runtime', 'indice wizard_progress')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES ('empresa_config'), ('wizard_progress')
  )
  SELECT
    format('rls_%s_enabled_forced', e.table_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.empresa_config ec
       WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id) AND ec.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.empresa_config ec
       WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id) AND ec.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'empresa_config_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empresa_config ec
  WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id)
    AND (ec.estado IS NULL OR lower(ec.estado::text) NOT IN ('activo', 'inactivo', 'suspendido', 'prueba'));
  RETURN QUERY SELECT 'empresa_config_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.wizard_progress wp
  WHERE (p_tenant_id IS NULL OR wp.tenant_id = p_tenant_id)
    AND (
      wp.paso_actual < 1
      OR wp.paso_actual > 7
      OR NOT (wp.pasos_completados <@ ARRAY[1,2,3,4,5,6,7]::integer[])
      OR jsonb_typeof(wp.configuracion_temporal) <> 'object'
      OR (wp.completado = false AND wp.completado_at IS NOT NULL)
      OR (wp.completado = true AND wp.completado_at IS NULL)
    );
  RETURN QUERY SELECT 'wizard_progress_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_empresa_config_wizard_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_empresa_config_wizard_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
