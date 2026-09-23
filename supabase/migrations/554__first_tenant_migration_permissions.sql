-- El primer administrador no demo debe poder importar los maestros del cliente.
-- 336 sembró migration.* sólo para tenants existentes entonces; un tenant nuevo
-- clonado desde ADMIN_DEMO no hereda ese catálogo. El wrapper cubre altas futuras.
BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public, app, pg_temp;

-- El backend escribe el historial con service_role. La 336 creó las tablas
-- sin ACL explícita y el rol de runtime no puede iniciar un lote real.
GRANT SELECT, INSERT, UPDATE ON public.migration_runs TO service_role;
GRANT SELECT, INSERT ON public.migration_run_rows TO service_role;

CREATE OR REPLACE FUNCTION app.sembrar_permisos_migracion_554(p_tenant_id uuid)
RETURNS TABLE(permisos_seeded integer, role_permissions_seeded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_RBAC_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  WITH defs(raw) AS (
    VALUES
      ('migration.templates.read'), ('migration.preview'),
      ('migration.clientes.import'), ('migration.proveedores.import'),
      ('migration.productos.import'), ('migration.plan_cuentas.import'),
      ('migration.cuentas_bancarias.import'), ('migration.cxc.import'),
      ('migration.cxp.import'), ('migration.balance_apertura.import'),
      ('migration.stock_inicial.import'), ('migration.comprobantes.import'),
      ('migration.runs.read'), ('migration.validar.read')
  ), parsed AS (
    SELECT raw, string_to_array(raw, '.') AS parts
    FROM defs
  )
  INSERT INTO public.permisos(tenant_id, modulo, recurso, accion, codigo, descripcion, activo)
  SELECT p_tenant_id, parts[1],
    CASE WHEN array_length(parts, 1) = 2 THEN '__global__'
      ELSE array_to_string(parts[2:(array_length(parts, 1) - 1)], '.') END,
    parts[array_length(parts, 1)], raw, 'Permiso ' || raw, true
  FROM parsed
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.tenant_id = p_tenant_id AND lower(p.codigo) = raw
  );
  GET DIAGNOSTICS permisos_seeded = ROW_COUNT;

  -- La importación del cliente pertenece a ADMIN. ADMIN_DEMO no recibe el
  -- permiso; conservar el rol demo separado evita ampliar su capacidad.
  INSERT INTO public.rol_permisos(role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND upper(btrim(r.nombre)) = 'ADMIN'
    AND coalesce(r.activo, true)
    AND coalesce(p.activo, true)
    AND p.codigo LIKE 'migration.%'
    AND NOT EXISTS (
      SELECT 1 FROM public.rol_permisos rp
      WHERE rp.role_id = r.id AND rp.permiso_id = p.id
    );
  GET DIAGNOSTICS role_permissions_seeded = ROW_COUNT;
  RETURN NEXT;
END;
$function$;

DO $wrap$
BEGIN
  IF to_regprocedure('app.seed_operational_rbac_for_tenant_base_554(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid)
      RENAME TO seed_operational_rbac_for_tenant_base_554;
  END IF;
END;
$wrap$;

CREATE OR REPLACE FUNCTION app.seed_operational_rbac_for_tenant(
  p_tenant_id uuid, p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE(permisos_seeded integer, roles_seeded integer, role_permissions_seeded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_base record;
  v_migration record;
BEGIN
  SELECT * INTO v_base FROM app.seed_operational_rbac_for_tenant_base_554(
    p_tenant_id, p_source_tenant_id
  );
  SELECT * INTO v_migration FROM app.sembrar_permisos_migracion_554(p_tenant_id);
  permisos_seeded := coalesce(v_base.permisos_seeded, 0) + coalesce(v_migration.permisos_seeded, 0);
  roles_seeded := coalesce(v_base.roles_seeded, 0);
  role_permissions_seeded := coalesce(v_base.role_permissions_seeded, 0)
    + coalesce(v_migration.role_permissions_seeded, 0);
  RETURN NEXT;
END;
$function$;

-- Sólo corrige empresas operativas ya creadas; no cambia roles demo.
DO $existing$
DECLARE
  v_tenant_id uuid;
BEGIN
  FOR v_tenant_id IN
    SELECT ec.tenant_id FROM public.empresa_config ec WHERE NOT coalesce(ec.is_demo, false)
  LOOP
    PERFORM app.sembrar_permisos_migracion_554(v_tenant_id);
  END LOOP;
END;
$existing$;

REVOKE ALL ON FUNCTION app.sembrar_permisos_migracion_554(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_operational_rbac_for_tenant_base_554(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
