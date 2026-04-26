-- ============================================================================
-- 220__cpe_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en CPE.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_cpe_estado_case_insensitive_runtime(
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
    'cpe_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cpe'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'cpe.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'cpe_sunat_status_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cpe'
        AND c.column_name = 'sunat_status'
        AND c.udt_name = 'citext'
    ),
    'cpe.sunat_status usa citext'::text;

  RETURN QUERY
  SELECT
    'cpe_estado_sunat_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cpe'
        AND c.column_name = 'estado_sunat'
        AND c.udt_name = 'citext'
    ),
    'cpe.estado_sunat usa citext'::text;

  RETURN QUERY
  SELECT
    'normalize_cpe_estado_218_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_cpe_estado_218'
    ),
    'helper app.normalize_cpe_estado_218'::text;

  RETURN QUERY
  SELECT
    'normalize_cpe_sunat_status_218_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_cpe_sunat_status_218'
    ),
    'helper app.normalize_cpe_sunat_status_218'::text;

  RETURN QUERY
  SELECT
    'map_cpe_estado_sunat_218_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'map_cpe_estado_sunat_218'
    ),
    'helper app.map_cpe_estado_sunat_218'::text;

  RETURN QUERY
  SELECT
    'normalize_cpe_row_218_trigger_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cpe'
        AND t.tgname = 'trg_normalize_cpe_row_218'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en cpe'::text;

  RETURN QUERY
  SELECT
    'ck_cpe_estado_valid_runtime_218_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_cpe_estado_valid_runtime_218'
        AND conrelid = 'public.cpe'::regclass
    ),
    'constraint de dominio de estado en cpe'::text;

  RETURN QUERY
  SELECT
    'ck_cpe_sunat_status_valid_runtime_218_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_cpe_sunat_status_valid_runtime_218'
        AND conrelid = 'public.cpe'::regclass
    ),
    'constraint de dominio de sunat_status en cpe'::text;

  RETURN QUERY
  SELECT
    'ck_cpe_estado_sunat_consistency_runtime_218_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_cpe_estado_sunat_consistency_runtime_218'
        AND conrelid = 'public.cpe'::regclass
    ),
    'consistencia estado/sunat_status en cpe'::text;

  RETURN QUERY
  SELECT
    'idx_cpe_tenant_estado_ci_runtime_218_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cpe'
        AND indexname = 'idx_cpe_tenant_estado_ci_runtime_218'
    ),
    'indice tenant+estado para cpe'::text;

  RETURN QUERY
  SELECT
    'idx_cpe_tenant_sunat_status_ci_runtime_218_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cpe'
        AND indexname = 'idx_cpe_tenant_sunat_status_ci_runtime_218'
    ),
    'indice tenant+sunat_status para cpe'::text;

  RETURN QUERY
  SELECT
    'idx_cpe_retry_rechazado_runtime_218_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cpe'
        AND indexname = 'idx_cpe_retry_rechazado_runtime_218'
    ),
    'indice parcial de retry para rechazados'::text;

  RETURN QUERY
  SELECT
    'rls_cpe_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cpe'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cpe'::text;

  RETURN QUERY
  SELECT
    'rls_comprobantes_electronicos_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'comprobantes_electronicos'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en comprobantes_electronicos'::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.cpe t
       WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
         AND t.estado = 'RECHAZADO')
    - (SELECT COUNT(*) FROM public.cpe t
       WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
         AND t.estado = 'rechazado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'cpe_estado_case_insensitive_rechazado'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.cpe t
       WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
         AND t.sunat_status = 'SENDING')
    - (SELECT COUNT(*) FROM public.cpe t
       WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
         AND t.sunat_status = 'sending')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'cpe_sunat_status_case_insensitive_sending'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.cpe t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (
      t.estado IS NULL
      OR lower(t.estado::text) NOT IN ('borrador', 'firmado', 'enviado', 'aceptado', 'rechazado', 'anulado', 'error')
    );
  RETURN QUERY
  SELECT
    'cpe_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.cpe t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (
      t.sunat_status IS NULL
      OR lower(t.sunat_status::text) NOT IN ('not_sent', 'ready', 'sending', 'accepted', 'rejected', 'error')
    );
  RETURN QUERY
  SELECT
    'cpe_invalid_sunat_status_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.cpe t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (
      (lower(t.estado::text) = 'aceptado' AND lower(t.sunat_status::text) <> 'accepted')
      OR (lower(t.estado::text) = 'rechazado' AND lower(t.sunat_status::text) NOT IN ('rejected', 'error'))
      OR (lower(t.estado::text) = 'enviado' AND lower(t.sunat_status::text) NOT IN ('sending', 'ready'))
      OR (lower(t.estado::text) = 'firmado' AND lower(t.sunat_status::text) NOT IN ('ready', 'not_sent'))
      OR (lower(t.estado::text) = 'borrador' AND lower(t.sunat_status::text) NOT IN ('not_sent', 'ready'))
    );
  RETURN QUERY
  SELECT
    'cpe_invalid_estado_sunat_consistency_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_cpe_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_cpe_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
