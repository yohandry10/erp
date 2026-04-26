-- ============================================================================
-- 229__sire_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en SIRE.
-- Tablas foco: public.sire_files, public.sire_registros_detalle.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_sire_estado_case_insensitive_runtime(
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
    'sire_files_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'sire_files'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'sire_files.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'sire_files_status_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'sire_files'
        AND c.column_name = 'status'
        AND c.udt_name = 'citext'
    ),
    'sire_files.status usa citext'::text;

  RETURN QUERY
  SELECT
    'sire_registros_detalle_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'sire_registros_detalle'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'sire_registros_detalle.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'normalize_sire_files_estado_227_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_sire_files_estado_227'
    ),
    'helper app.normalize_sire_files_estado_227'::text;

  RETURN QUERY
  SELECT
    'map_sire_files_status_227_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'map_sire_files_status_227'
    ),
    'helper app.map_sire_files_status_227'::text;

  RETURN QUERY
  SELECT
    'normalize_sire_registros_detalle_estado_227_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_sire_registros_detalle_estado_227'
    ),
    'helper app.normalize_sire_registros_detalle_estado_227'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_sire_files_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'sire_files'
        AND t.tgname = 'trg_normalize_sire_files_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en sire_files'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_sire_registros_detalle_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'sire_registros_detalle'
        AND t.tgname = 'trg_normalize_sire_registros_detalle_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en sire_registros_detalle'::text;

  RETURN QUERY
  SELECT
    'ck_sire_files_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_sire_files_estado_valid'
        AND conrelid = 'public.sire_files'::regclass
    ),
    'constraint de dominio de estado en sire_files'::text;

  RETURN QUERY
  SELECT
    'ck_sire_files_status_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_sire_files_status_valid'
        AND conrelid = 'public.sire_files'::regclass
    ),
    'constraint de dominio de status en sire_files'::text;

  RETURN QUERY
  SELECT
    'ck_sire_files_estado_status_consistency_runtime_227_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_sire_files_estado_status_consistency_runtime_227'
        AND conrelid = 'public.sire_files'::regclass
    ),
    'constraint de consistencia estado/status en sire_files'::text;

  RETURN QUERY
  SELECT
    'ck_sire_registros_detalle_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_sire_registros_detalle_estado_valid'
        AND conrelid = 'public.sire_registros_detalle'::regclass
    ),
    'constraint de dominio de estado en sire_registros_detalle'::text;

  RETURN QUERY
  SELECT
    'idx_sire_files_tenant_estado_ci_runtime_227_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'sire_files'
        AND indexname = 'idx_sire_files_tenant_estado_ci_runtime_227'
    ),
    'indice tenant+estado CI en sire_files'::text;

  RETURN QUERY
  SELECT
    'idx_sire_files_tenant_status_ci_runtime_227_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'sire_files'
        AND indexname = 'idx_sire_files_tenant_status_ci_runtime_227'
    ),
    'indice tenant+status CI en sire_files'::text;

  RETURN QUERY
  SELECT
    'idx_sire_registros_detalle_tenant_estado_ci_runtime_227_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'sire_registros_detalle'
        AND indexname = 'idx_sire_registros_detalle_tenant_estado_ci_runtime_227'
    ),
    'indice tenant+estado CI en sire_registros_detalle'::text;

  RETURN QUERY
  SELECT
    'rls_sire_files_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'sire_files'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en sire_files'::text;

  RETURN QUERY
  SELECT
    'rls_sire_registros_detalle_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'sire_registros_detalle'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en sire_registros_detalle'::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.sire_files sf
       WHERE (p_tenant_id IS NULL OR sf.tenant_id = p_tenant_id)
         AND sf.estado = 'GENERADO')
    - (SELECT COUNT(*) FROM public.sire_files sf
       WHERE (p_tenant_id IS NULL OR sf.tenant_id = p_tenant_id)
         AND sf.estado = 'generado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'sire_files_estado_case_insensitive_generado'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.sire_files sf
       WHERE (p_tenant_id IS NULL OR sf.tenant_id = p_tenant_id)
         AND sf.status = 'SENT')
    - (SELECT COUNT(*) FROM public.sire_files sf
       WHERE (p_tenant_id IS NULL OR sf.tenant_id = p_tenant_id)
         AND sf.status = 'sent')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'sire_files_status_case_insensitive_sent'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.sire_registros_detalle srd
       WHERE (p_tenant_id IS NULL OR srd.tenant_id = p_tenant_id)
         AND srd.estado = 'REGISTRADO')
    - (SELECT COUNT(*) FROM public.sire_registros_detalle srd
       WHERE (p_tenant_id IS NULL OR srd.tenant_id = p_tenant_id)
         AND srd.estado = 'registrado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'sire_registros_detalle_estado_case_insensitive_registrado'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.sire_files sf
  WHERE (p_tenant_id IS NULL OR sf.tenant_id = p_tenant_id)
    AND (
      sf.estado IS NULL
      OR lower(sf.estado::text) NOT IN ('generando', 'generado', 'enviado', 'pendiente', 'error', 'anulado')
    );
  RETURN QUERY
  SELECT
    'sire_files_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.sire_files sf
  WHERE (p_tenant_id IS NULL OR sf.tenant_id = p_tenant_id)
    AND (
      sf.status IS NULL
      OR lower(sf.status::text) NOT IN ('running', 'completed', 'sent', 'pending', 'error', 'cancelled')
    );
  RETURN QUERY
  SELECT
    'sire_files_invalid_status_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.sire_registros_detalle srd
  WHERE (p_tenant_id IS NULL OR srd.tenant_id = p_tenant_id)
    AND (
      srd.estado IS NULL
      OR lower(srd.estado::text) NOT IN ('registrado', 'anulado')
    );
  RETURN QUERY
  SELECT
    'sire_registros_detalle_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.sire_files sf
  WHERE (p_tenant_id IS NULL OR sf.tenant_id = p_tenant_id)
    AND (
      (lower(sf.estado::text) = 'generando' AND lower(sf.status::text) <> 'running')
      OR (lower(sf.estado::text) = 'generado' AND lower(sf.status::text) <> 'completed')
      OR (lower(sf.estado::text) = 'enviado' AND lower(sf.status::text) <> 'sent')
      OR (lower(sf.estado::text) = 'pendiente' AND lower(sf.status::text) <> 'pending')
      OR (lower(sf.estado::text) = 'error' AND lower(sf.status::text) <> 'error')
      OR (lower(sf.estado::text) = 'anulado' AND lower(sf.status::text) <> 'cancelled')
    );
  RETURN QUERY
  SELECT
    'sire_files_alias_sync_gap_case_insensitive'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_sire_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_sire_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
