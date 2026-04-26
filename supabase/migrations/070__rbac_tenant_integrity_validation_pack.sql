-- ============================================================================
-- 070__rbac_tenant_integrity_validation_pack.sql
-- Pack de validación runtime para integridad RBAC multi-tenant.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rbac_tenant_integrity_runtime(
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
    'trigger_user_roles_tenant_integrity'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'user_roles'
        AND t.tgname = 'trg_enforce_tenant_user_roles'
        AND NOT t.tgisinternal
    ),
    'trigger BEFORE INSERT/UPDATE en user_roles';

  RETURN QUERY
  SELECT
    'trigger_rol_permisos_tenant_integrity'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rol_permisos'
        AND t.tgname = 'trg_enforce_tenant_rol_permisos'
        AND NOT t.tgisinternal
    ),
    'trigger BEFORE INSERT/UPDATE en rol_permisos';

  RETURN QUERY
  SELECT
    'trigger_role_permissions_tenant_integrity'::text,
    (
      to_regclass('public.role_permissions') IS NULL
      OR EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'role_permissions'
          AND t.tgname = 'trg_enforce_tenant_role_permissions'
          AND NOT t.tgisinternal
      )
    ),
    'trigger BEFORE INSERT/UPDATE en role_permissions (si existe)';

  SELECT COUNT(*)
  INTO v_count
  FROM public.user_roles ur
  LEFT JOIN public.usuarios_sistema u
    ON u.id = ur.usuario_sistema_id
  LEFT JOIN public.roles r
    ON r.id = ur.role_id
  WHERE (
      (u.tenant_id IS NOT NULL AND ur.tenant_id IS NOT NULL AND ur.tenant_id <> u.tenant_id)
      OR (r.tenant_id IS NOT NULL AND ur.tenant_id IS NOT NULL AND ur.tenant_id <> r.tenant_id)
      OR (u.tenant_id IS NOT NULL AND r.tenant_id IS NOT NULL AND u.tenant_id <> r.tenant_id)
    )
    AND (
      p_tenant_id IS NULL
      OR ur.tenant_id = p_tenant_id
      OR u.tenant_id = p_tenant_id
      OR r.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'user_roles_cross_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.user_roles ur
  LEFT JOIN public.usuarios_sistema u
    ON u.id = ur.usuario_sistema_id
  LEFT JOIN public.roles r
    ON r.id = ur.role_id
  WHERE ur.tenant_id IS NULL
    AND COALESCE(u.tenant_id, r.tenant_id) IS NOT NULL
    AND (
      p_tenant_id IS NULL
      OR u.tenant_id = p_tenant_id
      OR r.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'user_roles_missing_tenant_id'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rol_permisos rp
  JOIN public.roles r
    ON r.id = rp.role_id
  JOIN public.permisos p
    ON p.id = rp.permiso_id
  WHERE p.tenant_id IS NOT NULL
    AND (r.tenant_id IS NULL OR r.tenant_id <> p.tenant_id)
    AND (
      p_tenant_id IS NULL
      OR r.tenant_id = p_tenant_id
      OR p.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'rol_permisos_cross_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  IF to_regclass('public.role_permissions') IS NOT NULL
     AND to_regclass('public.permissions') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.role_permissions rp
    JOIN public.roles r
      ON r.id = rp.role_id
    JOIN public.permissions p
      ON p.id = rp.permission_id
    WHERE p.tenant_id IS NOT NULL
      AND (r.tenant_id IS NULL OR r.tenant_id <> p.tenant_id)
      AND (
        p_tenant_id IS NULL
        OR rp.tenant_id = p_tenant_id
        OR r.tenant_id = p_tenant_id
        OR p.tenant_id = p_tenant_id
      );

    RETURN QUERY
    SELECT
      'role_permissions_cross_tenant_mismatch'::text,
      (v_count = 0),
      format('rows=%s', v_count);
  END IF;

  IF to_regclass('public.permissions') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.permisos p
    JOIN public.permissions pl
      ON pl.id = p.id
    WHERE p.tenant_id IS DISTINCT FROM pl.tenant_id
      AND (
        p_tenant_id IS NULL
        OR p.tenant_id = p_tenant_id
        OR pl.tenant_id = p_tenant_id
      );

    RETURN QUERY
    SELECT
      'permissions_alias_tenant_sync_gap'::text,
      (v_count = 0),
      format('rows=%s', v_count);
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.v_rbac_tenant_integrity_status_actual AS
SELECT *
FROM public.validar_rbac_tenant_integrity_runtime(app.resolve_request_tenant_id());

COMMIT;
