-- ============================================================================
-- 053__legacy_aliases_validation_pack.sql
-- Validaciones operativas para aliases legacy sincronizados.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_aliases_legacy_runtime(
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
  v_tenant_id uuid := COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id());
  v_count bigint;
  v_count_2 bigint;
  v_count_3 bigint;
  v_has_cols integer;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN QUERY
    SELECT
      'tenant_context'::text,
      false,
      'No se pudo resolver tenant para validar aliases legacy';
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO v_has_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'comprobantes_electronicos'
    AND column_name IN (
      'documento_referencia_tipo',
      'documento_referencia_serie',
      'documento_referencia_numero',
      'tipo_nota_credito',
      'motivo_nota'
    );

  RETURN QUERY
  SELECT
    'comprobantes_electronicos_nota_credito_columns'::text,
    (v_has_cols = 5),
    format('columns_present=%s expected=5', v_has_cols);

  RETURN QUERY
  SELECT
    'trg_sync_comprobantes_electronicos_from_cpe'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cpe'
        AND t.tgname = 'trg_sync_comprobantes_electronicos_from_cpe'
        AND NOT t.tgisinternal
    ),
    'trigger cpe -> comprobantes_electronicos';

  RETURN QUERY
  SELECT
    'trg_sync_cpe_from_comprobantes_electronicos'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'comprobantes_electronicos'
        AND t.tgname = 'trg_sync_cpe_from_comprobantes_electronicos'
        AND NOT t.tgisinternal
    ),
    'trigger comprobantes_electronicos -> cpe';

  RETURN QUERY
  SELECT
    'trg_sync_usuarios_sistemas_from_usuarios_sistema'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'usuarios_sistema'
        AND t.tgname = 'trg_sync_usuarios_sistemas_from_usuarios_sistema'
        AND NOT t.tgisinternal
    ),
    'trigger usuarios_sistema -> usuarios_sistemas';

  SELECT COUNT(*)
  INTO v_count
  FROM public.cpe c
  WHERE c.tenant_id = v_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.comprobantes_electronicos ce
      WHERE ce.id = c.id
        AND ce.tenant_id = v_tenant_id
    );

  SELECT COUNT(*)
  INTO v_count_2
  FROM public.comprobantes_electronicos ce
  WHERE ce.tenant_id = v_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.cpe c
      WHERE c.id = ce.id
        AND c.tenant_id = v_tenant_id
    );

  RETURN QUERY
  SELECT
    'cpe_comprobantes_id_gap'::text,
    (v_count = 0 AND v_count_2 = 0),
    format('missing_in_comprobantes=%s missing_in_cpe=%s', v_count, v_count_2);

  SELECT COUNT(*)
  INTO v_count
  FROM public.cpe c
  JOIN public.comprobantes_electronicos ce
    ON ce.id = c.id
   AND ce.tenant_id = c.tenant_id
  WHERE c.tenant_id = v_tenant_id
    AND COALESCE(NULLIF(btrim(c.estado), ''), 'BORRADOR')
        <> COALESCE(NULLIF(btrim(ce.estado), ''), 'BORRADOR');

  RETURN QUERY
  SELECT
    'cpe_comprobantes_estado_gap'::text,
    (v_count = 0),
    format('estado_mismatch_rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios_sistema us
  WHERE us.tenant_id = v_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.usuarios_sistemas usl
      WHERE usl.id = us.id
        AND usl.tenant_id = v_tenant_id
    );

  SELECT COUNT(*)
  INTO v_count_2
  FROM public.usuarios_sistema us
  JOIN public.usuarios_sistemas usl
    ON usl.id = us.id
   AND usl.tenant_id = us.tenant_id
  WHERE us.tenant_id = v_tenant_id
    AND COALESCE(lower(us.email), '') <> COALESCE(lower(usl.email), '');

  SELECT COUNT(*)
  INTO v_count_3
  FROM public.usuarios_sistema us
  JOIN public.usuarios_sistemas usl
    ON usl.id = us.id
   AND usl.tenant_id = us.tenant_id
  WHERE us.tenant_id = v_tenant_id
    AND COALESCE(NULLIF(btrim(us.estado), ''), 'ACTIVO')
        <> COALESCE(NULLIF(btrim(usl.estado), ''), 'ACTIVO');

  RETURN QUERY
  SELECT
    'usuarios_alias_gap'::text,
    (v_count = 0 AND v_count_2 = 0 AND v_count_3 = 0),
    format('missing_legacy=%s email_mismatch=%s estado_mismatch=%s', v_count, v_count_2, v_count_3);
END;
$$;

CREATE OR REPLACE VIEW public.v_aliases_legacy_status_actual AS
SELECT *
FROM public.validar_aliases_legacy_runtime(app.resolve_request_tenant_id());

COMMIT;
