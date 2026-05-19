-- ============================================================================
-- 322__tenant_creation_operational_rbac_seed.sql
-- Helper reusable para sembrar RBAC operativo completo al crear tenants nuevos.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.seed_operational_rbac_for_tenant(
  p_tenant_id uuid,
  p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  permisos_seeded integer,
  roles_seeded integer,
  role_permissions_seeded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_source_tenant_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id es requerido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant % no existe', p_tenant_id;
  END IF;

  IF p_source_tenant_id IS NOT NULL THEN
    SELECT t.id
    INTO v_source_tenant_id
    FROM public.tenants t
    WHERE t.id = p_source_tenant_id
      AND t.id <> p_tenant_id
    LIMIT 1;
  END IF;

  IF v_source_tenant_id IS NULL THEN
    SELECT r.tenant_id
    INTO v_source_tenant_id
    FROM public.roles r
    JOIN public.permisos p ON p.tenant_id = r.tenant_id
    WHERE r.tenant_id <> p_tenant_id
      AND COALESCE(r.activo, true) = true
      AND COALESCE(p.activo, true) = true
    GROUP BY r.tenant_id
    HAVING count(DISTINCT lower(r.nombre)) >= 10
       AND count(DISTINCT lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))) >= 100
    ORDER BY count(DISTINCT lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))) DESC
    LIMIT 1;
  END IF;

  IF v_source_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No existe tenant fuente con RBAC operativo completo para sembrar %', p_tenant_id;
  END IF;

  INSERT INTO public.permisos (
    tenant_id,
    modulo,
    recurso,
    accion,
    codigo,
    descripcion,
    activo
  )
  SELECT
    p_tenant_id,
    p.modulo,
    p.recurso,
    p.accion,
    lower(COALESCE(NULLIF(p.codigo, ''), p.modulo || '.' || p.recurso || '.' || p.accion)),
    p.descripcion,
    COALESCE(p.activo, true)
  FROM public.permisos p
  WHERE p.tenant_id = v_source_tenant_id
    AND COALESCE(p.activo, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.permisos existing
      WHERE existing.tenant_id = p_tenant_id
        AND lower(COALESCE(existing.codigo, existing.modulo || '.' || existing.recurso || '.' || existing.accion))
          = lower(COALESCE(NULLIF(p.codigo, ''), p.modulo || '.' || p.recurso || '.' || p.accion))
    );
  GET DIAGNOSTICS permisos_seeded = ROW_COUNT;

  INSERT INTO public.roles (
    tenant_id,
    nombre,
    descripcion,
    is_system_role,
    activo
  )
  SELECT
    p_tenant_id,
    r.nombre,
    r.descripcion,
    COALESCE(r.is_system_role, true),
    COALESCE(r.activo, true)
  FROM public.roles r
  WHERE r.tenant_id = v_source_tenant_id
    AND COALESCE(r.activo, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.roles existing
      WHERE existing.tenant_id = p_tenant_id
        AND lower(existing.nombre) = lower(r.nombre)
    );
  GET DIAGNOSTICS roles_seeded = ROW_COUNT;

  INSERT INTO public.rol_permisos (
    role_id,
    permiso_id,
    concedido
  )
  SELECT
    target_role.id,
    target_perm.id,
    COALESCE(source_rp.concedido, true)
  FROM public.rol_permisos source_rp
  JOIN public.roles source_role ON source_role.id = source_rp.role_id
  JOIN public.permisos source_perm ON source_perm.id = source_rp.permiso_id
  JOIN public.roles target_role
    ON target_role.tenant_id = p_tenant_id
   AND lower(target_role.nombre) = lower(source_role.nombre)
  JOIN public.permisos target_perm
    ON target_perm.tenant_id = p_tenant_id
   AND lower(COALESCE(target_perm.codigo, target_perm.modulo || '.' || target_perm.recurso || '.' || target_perm.accion))
     = lower(COALESCE(source_perm.codigo, source_perm.modulo || '.' || source_perm.recurso || '.' || source_perm.accion))
  WHERE source_role.tenant_id = v_source_tenant_id
    AND source_perm.tenant_id = v_source_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.rol_permisos existing
      WHERE existing.role_id = target_role.id
        AND existing.permiso_id = target_perm.id
    );
  GET DIAGNOSTICS role_permissions_seeded = ROW_COUNT;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid) TO authenticated, service_role;

COMMIT;
