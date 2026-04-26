-- ============================================================================
-- 073__usuarios_alias_validation_pack.sql
-- Validaciones runtime para consistencia usuarios <-> usuarios_sistema.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_usuarios_alias_runtime(
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
    'trigger_sync_usuarios_from_usuarios_sistema'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'usuarios_sistema'
        AND t.tgname = 'trg_sync_usuarios_from_usuarios_sistema'
        AND NOT t.tgisinternal
    ),
    'sync canónico -> alias';

  RETURN QUERY
  SELECT
    'trigger_sync_usuarios_sistema_from_usuarios'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'usuarios'
        AND t.tgname = 'trg_sync_usuarios_sistema_from_usuarios'
        AND NOT t.tgisinternal
    ),
    'sync alias -> canónico';

  RETURN QUERY
  SELECT
    'trigger_normalize_usuarios_estado_activo'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'usuarios'
        AND t.tgname = 'trg_normalize_usuarios_estado_activo'
        AND NOT t.tgisinternal
    ),
    'normalización alias usuarios';

  RETURN QUERY
  SELECT
    'trigger_normalize_usuarios_sistema_estado_activo'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'usuarios_sistema'
        AND t.tgname = 'trg_normalize_usuarios_sistema_estado_activo'
        AND NOT t.tgisinternal
    ),
    'normalización canónico usuarios_sistema';

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios_sistema us
  LEFT JOIN public.usuarios u
    ON u.id = us.id
  WHERE u.id IS NULL
    AND (p_tenant_id IS NULL OR us.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'missing_alias_rows_from_canonical'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios u
  LEFT JOIN public.usuarios_sistema us
    ON us.id = u.id
  WHERE us.id IS NULL
    AND (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'missing_canonical_rows_from_alias'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios u
  JOIN public.usuarios_sistema us
    ON us.id = u.id
  WHERE (
      u.tenant_id IS DISTINCT FROM us.tenant_id
      OR u.email IS DISTINCT FROM us.email
      OR u.nombre IS DISTINCT FROM us.nombre
      OR u.apellido IS DISTINCT FROM us.apellido
      OR u.estado IS DISTINCT FROM us.estado
      OR COALESCE(u.activo, false) IS DISTINCT FROM COALESCE(us.activo, false)
    )
    AND (
      p_tenant_id IS NULL
      OR u.tenant_id = p_tenant_id
      OR us.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'usuarios_alias_field_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios u
  WHERE COALESCE(u.activo, false) <> (upper(btrim(COALESCE(u.estado, ''))) = 'ACTIVO')
    AND (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'usuarios_estado_activo_consistency'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios_sistema us
  WHERE COALESCE(us.activo, false) <> (upper(btrim(COALESCE(us.estado, ''))) = 'ACTIVO')
    AND (p_tenant_id IS NULL OR us.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'usuarios_sistema_estado_activo_consistency'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      u.tenant_id,
      lower(u.email) AS email_key,
      COUNT(*) AS c
    FROM public.usuarios u
    WHERE u.email IS NOT NULL
      AND (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id)
    GROUP BY u.tenant_id, lower(u.email)
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'usuarios_duplicate_email_per_tenant'::text,
    (v_count = 0),
    format('groups=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_usuarios_alias_runtime_status_actual AS
SELECT *
FROM public.validar_usuarios_alias_runtime(app.resolve_request_tenant_id());

COMMIT;
