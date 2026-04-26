-- ============================================================================
-- 082__usuario_configuracion_validation_pack.sql
-- Pack de validación runtime para usuario_configuracion.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_usuario_configuracion_runtime(
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
    'trigger_normalize_usuario_configuracion_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'usuario_configuracion'
        AND t.tgname = 'trg_normalize_usuario_configuracion_row'
        AND NOT t.tgisinternal
    ),
    'normalización de preferencias de usuario';

  RETURN QUERY
  SELECT
    'fk_usuario_configuracion_usuario_id_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_usuario_configuracion_usuario_id'
        AND contype = 'f'
        AND conrelid = 'public.usuario_configuracion'::regclass
    ),
    'FK hacia usuarios_sistema';

  RETURN QUERY
  SELECT
    'fk_usuario_configuracion_pais_id_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_usuario_configuracion_pais_id'
        AND contype = 'f'
        AND conrelid = 'public.usuario_configuracion'::regclass
    ),
    'FK canónica hacia paises por pais_id';

  RETURN QUERY
  SELECT
    'single_fk_to_paises_for_postgrest_embed'::text,
    (
      SELECT COUNT(*)
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class ref ON ref.oid = c.confrelid
      JOIN pg_namespace rn ON rn.oid = ref.relnamespace
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
        AND rel.relname = 'usuario_configuracion'
        AND rn.nspname = 'public'
        AND ref.relname = 'paises'
    ) = 1,
    'evita ambigüedad en embed `paises(...)`';

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuario_configuracion uc
  WHERE uc.usuario_id IS NULL
    AND (p_tenant_id IS NULL OR uc.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rows_without_usuario_id'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuario_configuracion uc
  LEFT JOIN public.usuarios_sistema us
    ON us.id = uc.usuario_id
  WHERE uc.usuario_id IS NOT NULL
    AND us.id IS NULL
    AND (p_tenant_id IS NULL OR uc.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rows_with_missing_usuario_sistema'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuario_configuracion uc
  JOIN public.usuarios_sistema us
    ON us.id = uc.usuario_id
  WHERE uc.tenant_id IS DISTINCT FROM us.tenant_id
    AND (
      p_tenant_id IS NULL
      OR uc.tenant_id = p_tenant_id
      OR us.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'tenant_mismatch_usuario_configuracion'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuario_configuracion uc
  LEFT JOIN public.paises p
    ON p.id = uc.pais_id
  WHERE uc.pais_id IS NOT NULL
    AND p.id IS NULL
    AND (p_tenant_id IS NULL OR uc.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rows_with_invalid_pais_id'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuario_configuracion uc
  WHERE uc.pais_id IS DISTINCT FROM uc.pais_preferido_id
    AND uc.pais_id IS NOT NULL
    AND uc.pais_preferido_id IS NOT NULL
    AND (p_tenant_id IS NULL OR uc.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'pais_id_vs_pais_preferido_id_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT usuario_id, COUNT(*) AS c
    FROM public.usuario_configuracion
    WHERE usuario_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY usuario_id
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_usuario_configuracion_by_usuario_id'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuario_configuracion uc
  WHERE uc.idioma IS NOT NULL
    AND uc.idioma !~ '^[a-z]{2}$'
    AND (p_tenant_id IS NULL OR uc.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'invalid_idioma_format'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuario_configuracion uc
  WHERE (
      uc.zona_horaria IS NULL
      OR btrim(uc.zona_horaria) = ''
    )
    AND (p_tenant_id IS NULL OR uc.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'missing_zona_horaria'::text,
    (v_count = 0),
    format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_usuario_configuracion_runtime_status_actual AS
SELECT *
FROM public.validar_usuario_configuracion_runtime(app.resolve_request_tenant_id());

COMMIT;
