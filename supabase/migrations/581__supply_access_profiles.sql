-- ============================================================================
-- 581__supply_access_profiles.sql
-- F09/F10 ALKHOFAR: perfil del responsable de suministro.
--
-- SUMINISTRO gestiona contratos, OC, cronogramas, recepciones, pedidos
-- vinculados, reglas y cálculos de penalidad, alertas, lotes (lectura) y el
-- tablero con su exportación. No aprueba penalidades (GERENCIA), no crea
-- credenciales BI ni migra datos (ADMIN) y no opera finanzas. La matriz completa
-- por rol se comprueba en el verificador.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE FUNCTION app.seed_perfil_suministro_581(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  INSERT INTO public.roles (tenant_id, nombre, descripcion, is_system_role, activo)
  SELECT p_tenant_id, 'SUMINISTRO', 'Responsable de contratos de suministro', true, true
  WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.tenant_id = p_tenant_id AND lower(r.nombre) = 'suministro');
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true FROM public.roles r JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND upper(r.nombre) = 'SUMINISTRO' AND coalesce(r.activo, true) AND coalesce(p.activo, true)
    AND p.codigo IN ('ventas.contratos.ver', 'ventas.contratos.gestionar', 'ventas.contratos.conformar',
      'ventas.pedidos.ver', 'ventas.pedidos.editar', 'ventas.penalidades.ver', 'ventas.penalidades.gestionar',
      'inventario.lotes.read', 'reports.suministro.read', 'reports.suministro.export',
      'alertas.suministro.ver', 'alertas.suministro.gestionar')
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id = r.id AND rp.permiso_id = p.id);
END $fn$;

-- 469 concede a GERENCIA todo ventas.* cada vez que se crea o cambia un rol.
-- Se conserva salvo calcular penalidades: GERENCIA las aprueba (578).
CREATE OR REPLACE FUNCTION app.seed_rbac_comercial_469(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  INSERT INTO public.permisos(tenant_id,modulo,recurso,accion,codigo,descripcion,activo)
  SELECT p_tenant_id,'ventas',v.recurso,v.accion,'ventas.'||v.recurso||'.'||v.accion,v.descripcion,true
  FROM (VALUES
    ('precios','ver','Consultar listas de precios y resolver precios vigentes'),
    ('precios','gestionar','Registrar y activar/desactivar listas de precios'),
    ('comisiones','ver','Consultar reglas y movimientos de comisiones'),
    ('comisiones','gestionar','Registrar y activar/desactivar reglas de comisión'),
    ('consolidados','ver','Consultar lotes consolidados de ventas'),
    ('consolidados','crear','Crear lotes inmutables de ventas')
  ) v(recurso,accion,descripcion)
  WHERE NOT EXISTS (SELECT 1 FROM public.permisos p WHERE p.tenant_id=p_tenant_id
    AND lower(coalesce(p.codigo,p.modulo||'.'||p.recurso||'.'||p.accion))='ventas.'||v.recurso||'.'||v.accion);

  INSERT INTO public.rol_permisos(role_id,permiso_id,concedido)
  SELECT r.id,p.id,true FROM public.roles r JOIN public.permisos p ON p.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant_id AND r.activo AND p.activo
    AND lower(p.codigo) LIKE 'ventas.%'
    AND (
      upper(r.nombre)='ADMIN'
      OR (upper(r.nombre)='GERENCIA' AND lower(p.codigo)<>'ventas.penalidades.gestionar')
      OR (upper(r.nombre)='VENDEDOR' AND lower(p.codigo) IN (
        'ventas.precios.ver','ventas.comisiones.ver','ventas.consolidados.ver','ventas.consolidados.crear'))
      OR (upper(r.nombre)='CAJERO' AND lower(p.codigo)='ventas.precios.ver')
      OR (upper(r.nombre)='AUDITOR' AND lower(p.codigo) IN (
        'ventas.comisiones.ver','ventas.consolidados.ver'))
    )
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp
      WHERE rp.role_id=r.id AND rp.permiso_id=p.id);
END;
$$;

-- Las empresas nuevas reciben el perfil al sembrar su RBAC operativo.
CREATE OR REPLACE FUNCTION app.seed_operational_rbac_for_tenant(
  p_tenant_id uuid, p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE(permisos_seeded integer, roles_seeded integer, role_permissions_seeded integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_base record;
  v_retirados integer;
BEGIN
  SELECT * INTO v_base FROM app.seed_operational_rbac_for_tenant_base_575(p_tenant_id, p_source_tenant_id);
  PERFORM app.seed_perfil_suministro_581(p_tenant_id);
  -- El sembrado genérico concede ventas.* por patrón: VENDEDOR no gestiona
  -- contratos ni penalidades, y GERENCIA aprueba penalidades pero no las calcula.
  DELETE FROM public.rol_permisos rp
  USING public.roles r, public.permisos p
  WHERE rp.role_id = r.id AND rp.permiso_id = p.id
    AND r.tenant_id = p_tenant_id AND p.tenant_id = p_tenant_id
    AND ((upper(r.nombre) = 'VENDEDOR'
        AND (p.codigo IN ('ventas.contratos.gestionar', 'ventas.contratos.conformar') OR p.codigo LIKE 'ventas.penalidades.%'))
      OR (upper(r.nombre) = 'GERENCIA' AND p.codigo = 'ventas.penalidades.gestionar'))
    AND rp.created_at = now();
  GET DIAGNOSTICS v_retirados = ROW_COUNT;
  permisos_seeded := coalesce(v_base.permisos_seeded, 0);
  roles_seeded := coalesce(v_base.roles_seeded, 0);
  role_permissions_seeded := coalesce(v_base.role_permissions_seeded, 0) - v_retirados;
  RETURN NEXT;
END;
$function$;

DO $seed$ DECLARE t uuid; BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP PERFORM app.seed_perfil_suministro_581(t); END LOOP;
END $seed$;
-- Penalidades (578) se promueve con esta migración: ninguna concesión a
-- GERENCIA de calcular penalidades es anterior a esta regla.
DELETE FROM public.rol_permisos rp
USING public.roles r, public.permisos p
WHERE rp.role_id = r.id AND rp.permiso_id = p.id AND p.tenant_id = r.tenant_id
  AND upper(r.nombre) = 'GERENCIA' AND p.codigo = 'ventas.penalidades.gestionar';

REVOKE ALL ON FUNCTION app.seed_perfil_suministro_581(uuid), app.seed_operational_rbac_for_tenant(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
