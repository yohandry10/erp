-- ============================================================================
-- 068__user_roles_tenant_integrity_hardening.sql
-- Endurece consistencia tenant en user_roles (usuario <-> rol).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id en user_roles usando rol/usuario como fuente canónica.
-- ----------------------------------------------------------------------------
UPDATE public.user_roles ur
SET tenant_id = COALESCE(
  (SELECT r.tenant_id FROM public.roles r WHERE r.id = ur.role_id),
  (SELECT u.tenant_id FROM public.usuarios_sistema u WHERE u.id = ur.usuario_sistema_id),
  ur.tenant_id
)
WHERE ur.tenant_id IS DISTINCT FROM COALESCE(
  (SELECT r.tenant_id FROM public.roles r WHERE r.id = ur.role_id),
  (SELECT u.tenant_id FROM public.usuarios_sistema u WHERE u.id = ur.usuario_sistema_id),
  ur.tenant_id
);

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_role
ON public.user_roles (tenant_id, role_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_usuario
ON public.user_roles (tenant_id, usuario_sistema_id);

-- ----------------------------------------------------------------------------
-- Trigger de integridad tenant para asignaciones usuario-rol.
-- Reglas:
-- - Si usuario y rol tienen tenant distinto => error.
-- - Si tenant_id viene nulo, se infiere por coalesce(usuario, rol).
-- - Si tenant_id explícito no coincide con usuario/rol (cuando existen) => error.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_tenant_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_user_tenant uuid;
  v_role_tenant uuid;
  v_resolved_tenant uuid;
BEGIN
  SELECT u.tenant_id
  INTO v_user_tenant
  FROM public.usuarios_sistema u
  WHERE u.id = NEW.usuario_sistema_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_sistema % no existe para user_roles', NEW.usuario_sistema_id;
  END IF;

  SELECT r.tenant_id
  INTO v_role_tenant
  FROM public.roles r
  WHERE r.id = NEW.role_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role % no existe para user_roles', NEW.role_id;
  END IF;

  IF v_user_tenant IS NOT NULL
     AND v_role_tenant IS NOT NULL
     AND v_user_tenant <> v_role_tenant THEN
    RAISE EXCEPTION
      'user_roles cross-tenant: usuario(%) tenant % != rol(%) tenant %',
      NEW.usuario_sistema_id, v_user_tenant, NEW.role_id, v_role_tenant;
  END IF;

  v_resolved_tenant := COALESCE(NEW.tenant_id, v_user_tenant, v_role_tenant);

  IF v_user_tenant IS NOT NULL
     AND v_resolved_tenant IS NOT NULL
     AND v_resolved_tenant <> v_user_tenant THEN
    RAISE EXCEPTION
      'user_roles tenant_id % no coincide con tenant del usuario %',
      v_resolved_tenant, v_user_tenant;
  END IF;

  IF v_role_tenant IS NOT NULL
     AND v_resolved_tenant IS NOT NULL
     AND v_resolved_tenant <> v_role_tenant THEN
    RAISE EXCEPTION
      'user_roles tenant_id % no coincide con tenant del rol %',
      v_resolved_tenant, v_role_tenant;
  END IF;

  NEW.tenant_id := v_resolved_tenant;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_user_roles ON public.user_roles;
CREATE TRIGGER trg_enforce_tenant_user_roles
BEFORE INSERT OR UPDATE OF usuario_sistema_id, role_id, tenant_id
ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_user_roles();

COMMIT;
