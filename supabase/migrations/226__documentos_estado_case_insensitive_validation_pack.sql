-- ============================================================================
-- 226__documentos_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en documentos.
-- Tablas foco: public.documentos, public.documento_archivos.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_documentos_estado_case_insensitive_runtime(
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
    'documentos_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'documentos'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'documentos.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'documento_archivos_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'documento_archivos'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'documento_archivos.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'normalize_documentos_estado_224_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_documentos_estado_224'
    ),
    'helper app.normalize_documentos_estado_224'::text;

  RETURN QUERY
  SELECT
    'normalize_documento_archivos_estado_224_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_documento_archivos_estado_224'
    ),
    'helper app.normalize_documento_archivos_estado_224'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_documentos_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documentos'
        AND t.tgname = 'trg_normalize_documentos_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización en documentos'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_documento_archivos_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_archivos'
        AND t.tgname = 'trg_normalize_documento_archivos_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización en documento_archivos'::text;

  RETURN QUERY
  SELECT
    'ck_documentos_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_documentos_estado_valid'
        AND conrelid = 'public.documentos'::regclass
    ),
    'constraint de estado en documentos'::text;

  RETURN QUERY
  SELECT
    'ck_documento_archivos_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_documento_archivos_estado_valid'
        AND conrelid = 'public.documento_archivos'::regclass
    ),
    'constraint de estado en documento_archivos'::text;

  RETURN QUERY
  SELECT
    'idx_documentos_tenant_estado_ci_runtime_224_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'documentos'
        AND indexname = 'idx_documentos_tenant_estado_ci_runtime_224'
    ),
    'indice tenant+estado de documentos'::text;

  RETURN QUERY
  SELECT
    'idx_documento_archivos_tenant_estado_ci_runtime_224_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'documento_archivos'
        AND indexname = 'idx_documento_archivos_tenant_estado_ci_runtime_224'
    ),
    'indice tenant+estado de documento_archivos'::text;

  RETURN QUERY
  SELECT
    'rls_documentos_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documentos'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en documentos'::text;

  RETURN QUERY
  SELECT
    'rls_documento_archivos_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_archivos'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en documento_archivos'::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.documentos d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
         AND d.estado = 'EMITIDO')
    - (SELECT COUNT(*) FROM public.documentos d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
         AND d.estado = 'emitido')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'documentos_estado_case_insensitive_emitido'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.documento_archivos a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
         AND a.estado = 'ARCHIVADO')
    - (SELECT COUNT(*) FROM public.documento_archivos a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
         AND a.estado = 'archivado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'documento_archivos_estado_case_insensitive_archivado'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.documentos d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      d.estado IS NULL
      OR lower(d.estado::text) NOT IN ('borrador', 'emitido', 'enviado_sunat', 'observado', 'rechazado', 'anulado')
    );
  RETURN QUERY
  SELECT
    'documentos_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.documento_archivos a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      a.estado IS NULL
      OR lower(a.estado::text) NOT IN ('activo', 'archivado', 'eliminado')
    );
  RETURN QUERY
  SELECT
    'documento_archivos_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_documentos_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_documentos_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
