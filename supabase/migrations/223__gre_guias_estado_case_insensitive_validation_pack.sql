-- ============================================================================
-- 223__gre_guias_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en GRE canónica.
-- Tabla foco: public.gre_guias.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_gre_guias_estado_case_insensitive_runtime(
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
    'gre_guias_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'gre_guias'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'gre_guias.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'gre_guias_sunat_status_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'gre_guias'
        AND c.column_name = 'sunat_status'
        AND c.udt_name = 'citext'
    ),
    'gre_guias.sunat_status usa citext'::text;

  RETURN QUERY
  SELECT
    'normalize_gre_guias_estado_221_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_gre_guias_estado_221'
    ),
    'helper app.normalize_gre_guias_estado_221'::text;

  RETURN QUERY
  SELECT
    'normalize_gre_guias_sunat_status_221_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_gre_guias_sunat_status_221'
    ),
    'helper app.normalize_gre_guias_sunat_status_221'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_gre_guias_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'gre_guias'
        AND t.tgname = 'trg_normalize_gre_guias_row'
        AND NOT t.tgisinternal
    ),
    'trigger canónico de normalización en gre_guias'::text;

  RETURN QUERY
  SELECT
    'ck_gre_guias_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_gre_guias_estado_valid'
        AND conrelid = 'public.gre_guias'::regclass
    ),
    'constraint de dominio de estado'::text;

  RETURN QUERY
  SELECT
    'ck_gre_guias_sunat_status_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_gre_guias_sunat_status_valid'
        AND conrelid = 'public.gre_guias'::regclass
    ),
    'constraint de dominio de sunat_status'::text;

  RETURN QUERY
  SELECT
    'ck_gre_guias_estado_sunat_consistency_runtime_221_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_gre_guias_estado_sunat_consistency_runtime_221'
        AND conrelid = 'public.gre_guias'::regclass
    ),
    'constraint de consistencia estado/sunat_status'::text;

  RETURN QUERY
  SELECT
    'idx_gre_guias_tenant_estado_ci_runtime_221_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'gre_guias'
        AND indexname = 'idx_gre_guias_tenant_estado_ci_runtime_221'
    ),
    'indice tenant+estado CI'::text;

  RETURN QUERY
  SELECT
    'idx_gre_guias_tenant_sunat_status_ci_runtime_221_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'gre_guias'
        AND indexname = 'idx_gre_guias_tenant_sunat_status_ci_runtime_221'
    ),
    'indice tenant+sunat_status CI'::text;

  RETURN QUERY
  SELECT
    'idx_gre_guias_retry_rechazado_runtime_221_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'gre_guias'
        AND indexname = 'idx_gre_guias_retry_rechazado_runtime_221'
    ),
    'indice parcial de rechazados'::text;

  RETURN QUERY
  SELECT
    'idx_gre_guias_tenant_retry_queue_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'gre_guias'
        AND indexname = 'idx_gre_guias_tenant_retry_queue_runtime'
    ),
    'indice de cola de reintentos'::text;

  RETURN QUERY
  SELECT
    'rls_gre_guias_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'gre_guias'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en gre_guias'::text;

  RETURN QUERY
  SELECT
    'rls_gre_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'gre'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en gre (legacy)'::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.gre_guias g
       WHERE (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id)
         AND g.estado = 'RECHAZADO')
    - (SELECT COUNT(*) FROM public.gre_guias g
       WHERE (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id)
         AND g.estado = 'rechazado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'gre_guias_estado_case_insensitive_rechazado'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.gre_guias g
       WHERE (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id)
         AND g.sunat_status = 'SENDING')
    - (SELECT COUNT(*) FROM public.gre_guias g
       WHERE (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id)
         AND g.sunat_status = 'sending')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'gre_guias_sunat_status_case_insensitive_sending'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.gre_guias g
  WHERE (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id)
    AND (
      g.estado IS NULL
      OR lower(g.estado::text) NOT IN ('borrador', 'firmado', 'enviado', 'aceptado', 'rechazado', 'anulado', 'error')
    );
  RETURN QUERY
  SELECT
    'gre_guias_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.gre_guias g
  WHERE (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id)
    AND (
      g.sunat_status IS NULL
      OR lower(g.sunat_status::text) NOT IN ('not_sent', 'ready', 'sending', 'accepted', 'rejected', 'error')
    );
  RETURN QUERY
  SELECT
    'gre_guias_invalid_sunat_status_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.gre_guias g
  WHERE (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id)
    AND (
      (lower(g.estado::text) = 'aceptado' AND lower(g.sunat_status::text) <> 'accepted')
      OR (lower(g.estado::text) = 'rechazado' AND lower(g.sunat_status::text) NOT IN ('rejected', 'error'))
      OR (lower(g.estado::text) = 'enviado' AND lower(g.sunat_status::text) <> 'sending')
      OR (lower(g.estado::text) = 'firmado' AND lower(g.sunat_status::text) NOT IN ('ready', 'not_sent'))
      OR (lower(g.estado::text) = 'borrador' AND lower(g.sunat_status::text) NOT IN ('not_sent', 'ready'))
    );
  RETURN QUERY
  SELECT
    'gre_guias_invalid_estado_sunat_consistency_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_gre_guias_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_gre_guias_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
