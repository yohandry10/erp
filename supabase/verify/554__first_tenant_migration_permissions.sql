\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_554_SOLO_ERP_E2E';
  END IF;
  IF to_regprocedure('app.sembrar_permisos_migracion_554(uuid)') IS NULL
     OR to_regprocedure('app.seed_operational_rbac_for_tenant_base_554(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_554_SEEDER_MISSING';
  END IF;
  IF has_function_privilege('service_role', 'app.sembrar_permisos_migracion_554(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_554_INTERNAL_SEEDER_EXPOSED';
  END IF;
  IF NOT has_table_privilege('service_role','public.migration_runs','SELECT,INSERT,UPDATE')
     OR NOT has_table_privilege('service_role','public.migration_run_rows','SELECT,INSERT')
     OR has_table_privilege('authenticated','public.migration_runs','INSERT')
     OR has_table_privilege('authenticated','public.migration_run_rows','INSERT') THEN
    RAISE EXCEPTION 'VERIFY_554_RUNTIME_ACL_INVALID';
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment='DEV', project_ref='localqaerpephemeralx', allow_demo_data=true,
    configured_at=now(), updated_at=now()
WHERE singleton;

DO $verify$
DECLARE
  fixture jsonb;
  actor uuid;
  tenant uuid := gen_random_uuid();
  created jsonb;
  admin_id uuid;
  replay record;
  demo_grants_before integer;
BEGIN
  fixture := public.create_demo_tenant('VERIFY 554',1,'PE');
  actor := (fixture->>'user_id')::uuid;
  UPDATE public.usuarios_sistema SET is_super_admin=true WHERE id=actor;
  created := public.crear_tenant_empresa_admin_tx(actor,'verify-554-create',tenant,
    jsonb_build_object('razon_social','VERIFY CLIENT 554','ruc','20100047218',
      'email','company554@example.test','pais','PE','pais_id',1,'moneda_defecto','PEN'),
    jsonb_build_object('email','client554@example.test','nombre','Client 554',
      'password_hash','$2b$12$verify554hash'));
  admin_id := (created->'adminUser'->>'id')::uuid;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'VERIFY_554_ADMIN_MISSING'; END IF;
  IF (SELECT count(*) FROM public.permisos p
      WHERE p.tenant_id=tenant AND p.codigo LIKE 'migration.%') <> 14 THEN
    RAISE EXCEPTION 'VERIFY_554_PERMISSION_CATALOG_INCOMPLETE';
  END IF;
  IF (SELECT count(*) FROM public.rol_permisos rp
      JOIN public.roles r ON r.id=rp.role_id
      JOIN public.permisos p ON p.id=rp.permiso_id
      WHERE r.tenant_id=tenant AND upper(r.nombre)='ADMIN'
        AND p.codigo LIKE 'migration.%' AND rp.concedido) <> 14 THEN
    RAISE EXCEPTION 'VERIFY_554_ADMIN_GRANTS_INCOMPLETE';
  END IF;
  -- El seeder histórico puede haber concedido migration.* a ADMIN_DEMO.
  -- El nuevo helper no debe modificar sus concesiones existentes.
  SELECT count(*) INTO demo_grants_before
  FROM public.rol_permisos rp
  JOIN public.roles r ON r.id=rp.role_id
  JOIN public.permisos p ON p.id=rp.permiso_id
  WHERE r.tenant_id=(fixture->>'tenant_id')::uuid
    AND upper(r.nombre)='ADMIN_DEMO' AND p.codigo LIKE 'migration.%';
  PERFORM app.sembrar_permisos_migracion_554((fixture->>'tenant_id')::uuid);
  IF (SELECT count(*) FROM public.rol_permisos rp
      JOIN public.roles r ON r.id=rp.role_id
      JOIN public.permisos p ON p.id=rp.permiso_id
      WHERE r.tenant_id=(fixture->>'tenant_id')::uuid
        AND upper(r.nombre)='ADMIN_DEMO' AND p.codigo LIKE 'migration.%')
      <> demo_grants_before THEN
    RAISE EXCEPTION 'VERIFY_554_DEMO_ROLE_CHANGED';
  END IF;
  SELECT * INTO replay FROM app.sembrar_permisos_migracion_554(tenant);
  IF replay.permisos_seeded <> 0 OR replay.role_permissions_seeded <> 0 THEN
    RAISE EXCEPTION 'VERIFY_554_REPLAY_NOT_IDEMPOTENT';
  END IF;
END;
$verify$;
ROLLBACK;
