BEGIN;

-- CxP necesita el catálogo de proveedores para su filtro y para abrir el
-- tercero asociado. CONTADOR sólo recibe lectura; altas y cambios continúan
-- bajo compras.proveedores.crear/editar/eliminar.
CREATE OR REPLACE FUNCTION app.sembrar_permisos_contador_operativo(
  p_tenant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $fn$
DECLARE
  v_seeded integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id es requerido';
  END IF;

  INSERT INTO public.permisos (
    tenant_id, modulo, recurso, accion, codigo, descripcion, activo
  )
  VALUES (
    p_tenant_id,
    'compras',
    'proveedores',
    'ver',
    'compras.proveedores.ver',
    'Consultar proveedores vinculados a obligaciones y asientos',
    true
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_seeded = ROW_COUNT;

  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND upper(r.nombre) = 'CONTADOR'
    AND COALESCE(r.activo, true) = true
    AND COALESCE(p.activo, true) = true
    AND lower(p.codigo) = 'compras.proveedores.ver'
  ON CONFLICT (role_id, permiso_id) DO UPDATE
    SET concedido = true;

  RETURN v_seeded;
END;
$fn$;

REVOKE ALL ON FUNCTION app.sembrar_permisos_contador_operativo(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contador_operativo(uuid)
  TO service_role;

DO $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permisos_contador_operativo(v_tenant.id);
  END LOOP;
END;
$$;

-- El seeder de 401 reparó tenants existentes, pero todavía no formaba parte
-- del alta de tenants futuros. Integramos ambos seeders en el wrapper vigente
-- sin alterar el seeder base consolidado de 379.
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
AS $wrap$
DECLARE
  v_base record;
  v_extra integer := 0;
BEGIN
  SELECT * INTO v_base
  FROM app.seed_operational_rbac_for_tenant_base_383(
    p_tenant_id,
    p_source_tenant_id
  );

  v_extra := COALESCE(app.sembrar_permisos_asientos_ciclo_vida(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contabilidad_multimoneda(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contabilidad_plantillas(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contabilidad_activos(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contabilidad_conciliacion(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contabilidad_analitica(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_planilla_electronica_contador(p_tenant_id), 0)
    + COALESCE(app.sembrar_permisos_contador_operativo(p_tenant_id), 0);

  permisos_seeded := COALESCE(v_base.permisos_seeded, 0) + v_extra;
  roles_seeded := COALESCE(v_base.roles_seeded, 0);
  role_permissions_seeded := COALESCE(v_base.role_permissions_seeded, 0);

  RETURN NEXT;
END;
$wrap$;

REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid)
  TO service_role;

COMMIT;
