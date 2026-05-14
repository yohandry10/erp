-- ============================================================================
-- 069__rbac_permissions_tenant_integrity_hardening.sql
-- Endurece integridad tenant en asignaciones rol-permiso (canónico y legacy).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- rol_permisos (canónico): validar coherencia tenant entre roles y permisos.
-- Reglas:
-- - rol global (tenant NULL) no puede recibir permiso tenant-específico.
-- - rol tenant no puede enlazar permiso de otro tenant.
-- - rol tenant sí puede enlazar permiso global.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_tenant_rol_permisos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_role_tenant uuid;
  v_permiso_tenant uuid;
BEGIN
  SELECT r.tenant_id
  INTO v_role_tenant
  FROM public.roles r
  WHERE r.id = NEW.role_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role % no existe para rol_permisos', NEW.role_id;
  END IF;

  SELECT p.tenant_id
  INTO v_permiso_tenant
  FROM public.permisos p
  WHERE p.id = NEW.permiso_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'permiso % no existe para rol_permisos', NEW.permiso_id;
  END IF;

  IF v_role_tenant IS NULL AND v_permiso_tenant IS NOT NULL THEN
    RAISE EXCEPTION
      'rol_permisos inválido: rol global % no puede enlazar permiso tenant %',
      NEW.role_id, v_permiso_tenant;
  END IF;

  IF v_role_tenant IS NOT NULL
     AND v_permiso_tenant IS NOT NULL
     AND v_role_tenant <> v_permiso_tenant THEN
    RAISE EXCEPTION
      'rol_permisos cross-tenant: rol % tenant % != permiso % tenant %',
      NEW.role_id, v_role_tenant, NEW.permiso_id, v_permiso_tenant;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_rol_permisos ON public.rol_permisos;
CREATE TRIGGER trg_enforce_tenant_rol_permisos
BEFORE INSERT OR UPDATE OF role_id, permiso_id
ON public.rol_permisos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_rol_permisos();

-- ----------------------------------------------------------------------------
-- role_permissions (legacy): mantener tenant_id coherente con rol/permiso.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.role_permissions') IS NULL
     OR to_regclass('public.permissions') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    UPDATE public.role_permissions rp
    SET tenant_id = COALESCE(
      (SELECT r.tenant_id FROM public.roles r WHERE r.id = rp.role_id),
      (SELECT p.tenant_id FROM public.permissions p WHERE p.id = rp.permission_id),
      rp.tenant_id
    )
    WHERE rp.tenant_id IS DISTINCT FROM COALESCE(
      (SELECT r.tenant_id FROM public.roles r WHERE r.id = rp.role_id),
      (SELECT p.tenant_id FROM public.permissions p WHERE p.id = rp.permission_id),
      rp.tenant_id
    )
  $sql$;
END
$$;

CREATE OR REPLACE FUNCTION app.enforce_tenant_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_role_tenant uuid;
  v_permission_tenant uuid;
  v_resolved_tenant uuid;
BEGIN
  SELECT r.tenant_id
  INTO v_role_tenant
  FROM public.roles r
  WHERE r.id = NEW.role_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role % no existe para role_permissions', NEW.role_id;
  END IF;

  SELECT p.tenant_id
  INTO v_permission_tenant
  FROM public.permissions p
  WHERE p.id = NEW.permission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'permission % no existe para role_permissions', NEW.permission_id;
  END IF;

  IF v_role_tenant IS NULL AND v_permission_tenant IS NOT NULL THEN
    RAISE EXCEPTION
      'role_permissions inválido: rol global % no puede enlazar permiso tenant %',
      NEW.role_id, v_permission_tenant;
  END IF;

  IF v_role_tenant IS NOT NULL
     AND v_permission_tenant IS NOT NULL
     AND v_role_tenant <> v_permission_tenant THEN
    RAISE EXCEPTION
      'role_permissions cross-tenant: rol % tenant % != permiso % tenant %',
      NEW.role_id, v_role_tenant, NEW.permission_id, v_permission_tenant;
  END IF;

  v_resolved_tenant := COALESCE(NEW.tenant_id, v_role_tenant, v_permission_tenant);

  IF v_role_tenant IS NOT NULL
     AND v_resolved_tenant IS NOT NULL
     AND v_resolved_tenant <> v_role_tenant THEN
    RAISE EXCEPTION
      'role_permissions tenant_id % no coincide con tenant del rol %',
      v_resolved_tenant, v_role_tenant;
  END IF;

  IF v_permission_tenant IS NOT NULL
     AND v_resolved_tenant IS NOT NULL
     AND v_resolved_tenant <> v_permission_tenant THEN
    RAISE EXCEPTION
      'role_permissions tenant_id % no coincide con tenant del permiso %',
      v_resolved_tenant, v_permission_tenant;
  END IF;

  NEW.tenant_id := v_resolved_tenant;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.role_permissions') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_enforce_tenant_role_permissions ON public.role_permissions';
  EXECUTE '
    CREATE TRIGGER trg_enforce_tenant_role_permissions
    BEFORE INSERT OR UPDATE OF role_id, permission_id, tenant_id
    ON public.role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_tenant_role_permissions()
  ';
END
$$;

ALTER TABLE public.rol_permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_permisos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rol_permisos_tenant_select ON public.rol_permisos;
CREATE POLICY rol_permisos_tenant_select ON public.rol_permisos
FOR SELECT
USING (
  app.is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = rol_permisos.role_id
      AND (
        r.tenant_id = app.current_tenant_id()
        OR (app.current_tenant_id() IS NOT NULL AND r.tenant_id IS NULL)
      )
  )
);

DROP POLICY IF EXISTS rol_permisos_tenant_write ON public.rol_permisos;
CREATE POLICY rol_permisos_tenant_write ON public.rol_permisos
FOR ALL
USING (
  app.is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = rol_permisos.role_id
      AND r.tenant_id = app.current_tenant_id()
  )
)
WITH CHECK (
  app.is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = rol_permisos.role_id
      AND r.tenant_id = app.current_tenant_id()
  )
);

COMMIT;
