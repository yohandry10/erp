-- La demo debe poder probar la administración RBAC dentro de su propio tenant.
-- Se habilita users.manage únicamente a ADMIN_DEMO; no se conceden permisos
-- globales, auditoría sensible, debug ni gestión de otros tenants.

BEGIN;

-- Una demo puede delegar permisos operativos, pero nunca convertir un rol
-- personalizado en superadministrador. La validacion vive en PostgreSQL para
-- que ningun caller service-role pueda saltarla accidentalmente.
CREATE OR REPLACE FUNCTION app.assert_permissions_462(p_tenant_id uuid, p_permission_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_ids uuid[] := app.normalized_uuid_array_462(p_permission_ids);
  v_count integer;
  v_is_demo boolean;
BEGIN
  IF cardinality(v_ids) <> cardinality(COALESCE(p_permission_ids, '{}'::uuid[])) THEN
    RAISE EXCEPTION 'ADMIN_PERMISSION_IDS_DUPLICATED' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(ec.is_demo, false) INTO v_is_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  SELECT count(*) INTO v_count
  FROM public.permisos p
  WHERE p.tenant_id = p_tenant_id
    AND p.id = ANY(v_ids)
    AND COALESCE(p.activo, true)
    AND (
      NOT COALESCE(v_is_demo, false)
      OR (
        lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
          !~ '^(security\.audit\.|tenants\.manage$|system\.debug$)'
        AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
          <> 'documentos.audit.read'
      )
    );
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'ADMIN_PERMISSION_INVALID_CROSS_TENANT_OR_RESTRICTED'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_ids;
END;
$function$;

CREATE OR REPLACE FUNCTION app.grant_demo_admin_rbac_490()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF upper(btrim(COALESCE(NEW.nombre, ''))) <> 'ADMIN_DEMO' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.rol_permisos(role_id, permiso_id, concedido)
  SELECT NEW.id, p.id, true
  FROM public.permisos p
  WHERE p.tenant_id = NEW.tenant_id
    AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) = 'users.manage'
    AND COALESCE(p.activo, true)
  ON CONFLICT (role_id, permiso_id) DO UPDATE SET concedido = true;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_grant_demo_admin_rbac_490 ON public.roles;
CREATE TRIGGER trg_grant_demo_admin_rbac_490
AFTER INSERT OR UPDATE OF activo ON public.roles
FOR EACH ROW
EXECUTE FUNCTION app.grant_demo_admin_rbac_490();

INSERT INTO public.rol_permisos(role_id, permiso_id, concedido)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.empresa_config ec ON ec.tenant_id=r.tenant_id AND COALESCE(ec.is_demo,false)
JOIN public.permisos p ON p.tenant_id=r.tenant_id
WHERE upper(btrim(r.nombre))='ADMIN_DEMO'
  AND lower(COALESCE(p.codigo,p.modulo||'.'||p.recurso||'.'||p.accion))='users.manage'
  AND COALESCE(r.activo,true) AND COALESCE(p.activo,true)
ON CONFLICT (role_id, permiso_id) DO UPDATE SET concedido=true;

REVOKE ALL ON FUNCTION app.grant_demo_admin_rbac_490() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_permissions_462(uuid,uuid[]) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
