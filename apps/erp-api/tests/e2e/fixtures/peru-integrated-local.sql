\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e'
     OR current_setting('server_version_num')::integer < 160000
     OR inet_server_addr() IS NULL THEN
    RAISE EXCEPTION 'PERU_INTEGRATED_REQUIERE_POSTGRESQL_16_LOCAL_ERP_E2E';
  END IF;
END;
$guard$;

-- Fixture sintética exclusiva de la base efímera creada por el ejecutor local.
UPDATE app.deployment_environment
SET environment = 'DEV', project_ref = 'localerpephemeralqax', allow_demo_data = true,
    configured_at = clock_timestamp(), updated_at = clock_timestamp()
WHERE singleton = true;

DO $fixture$
DECLARE
  v_demo jsonb;
  v_audit_restricted_role jsonb;
  v_auditor_role jsonb;
  v_index integer;
BEGIN
  FOR v_index IN 1..2 LOOP
    v_demo := public.create_demo_tenant_ready_tx(
      ('Integración local Perú ' || v_index)::varchar, 14, 'PE',
      'peru-integrated-local-' || v_index, NULL, NULL, NULL, 'COMERCIO'
    );
    UPDATE public.usuarios_sistema
    SET email = 'peru-integrated-' || v_index || '@example.test',
        password_hash = extensions.crypt('Local-Peru-2026-Only!', extensions.gen_salt('bf')),
        estado = 'ACTIVO'
    WHERE id = (v_demo->>'user_id')::uuid;
    IF v_demo->>'aprobador_user_id' IS NULL THEN
      RAISE EXCEPTION 'PERU_INTEGRATED_FIXTURE_SIN_APROBADOR';
    END IF;
    UPDATE public.usuarios_sistema
    SET email = 'peru-integrated-approver-' || v_index || '@example.test',
        password_hash = extensions.crypt('Local-Peru-2026-Only!', extensions.gen_salt('bf')),
        estado = 'ACTIVO'
    WHERE id = (v_demo->>'aprobador_user_id')::uuid;
    v_audit_restricted_role := public.crear_rol_rbac_tx(
      (v_demo->>'tenant_id')::uuid, (v_demo->>'user_id')::uuid,
      'local-no-audit-role-' || v_index, '{"nombre":"OPERADOR_SIN_AUDITORIA"}'::jsonb, '{}'::uuid[]
    );
    PERFORM public.crear_usuario_rbac_tx(
      (v_demo->>'tenant_id')::uuid, (v_demo->>'user_id')::uuid, 'local-no-audit-user-' || v_index,
      jsonb_build_object('email','peru-integrated-restricted-' || v_index || '@example.test',
        'nombre','Operador local restringido','estado','ACTIVO',
        'password_hash',extensions.crypt('Local-Peru-2026-Only!',extensions.gen_salt('bf'))),
      ARRAY[(v_audit_restricted_role->>'id')::uuid]
    );
    v_auditor_role := public.crear_rol_rbac_tx(
      (v_demo->>'tenant_id')::uuid, (v_demo->>'user_id')::uuid,
      'local-auditor-role-' || v_index, '{"nombre":"AUDITOR_LOCAL"}'::jsonb, '{}'::uuid[]
    );
    PERFORM public.crear_usuario_rbac_tx(
      (v_demo->>'tenant_id')::uuid, (v_demo->>'user_id')::uuid, 'local-auditor-user-' || v_index,
      jsonb_build_object('email','peru-integrated-auditor-' || v_index || '@example.test',
        'nombre','Auditor local','estado','ACTIVO',
        'password_hash',extensions.crypt('Local-Peru-2026-Only!',extensions.gen_salt('bf'))),
      ARRAY[(v_auditor_role->>'id')::uuid]
    );
    -- Preparación exclusiva del fixture por el dueño de la base efímera.
    -- ADMIN_DEMO conserva su prohibición de leer/delegar auditoría global.
    INSERT INTO public.rol_permisos(role_id,permiso_id,concedido)
    SELECT (v_auditor_role->>'id')::uuid,p.id,true FROM public.permisos p
    WHERE p.tenant_id=(v_demo->>'tenant_id')::uuid AND p.codigo='security.audit.read';
    IF NOT FOUND THEN RAISE EXCEPTION 'PERU_INTEGRATED_AUDIT_PERMISSION_MISSING'; END IF;
    IF v_index=1 THEN
      INSERT INTO public.usuarios_sistema(tenant_id,email,nombre,estado,activo,is_super_admin,password_hash)
      VALUES(NULL,'peru-integrated-support-1@example.test','Soporte global local','ACTIVO',true,true,
        extensions.crypt('Local-Peru-2026-Only!',extensions.gen_salt('bf')));
    END IF;
  END LOOP;
END;
$fixture$;
COMMIT;

SELECT jsonb_agg(jsonb_build_object(
  'tenant_id', u.tenant_id, 'user_id', u.id, 'email', u.email,
  'products', (SELECT count(*) FROM public.productos p WHERE p.tenant_id = u.tenant_id),
  'cajas', (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre))
            FROM public.cajas c WHERE c.tenant_id = u.tenant_id)
) ORDER BY u.email)
FROM public.usuarios_sistema u
WHERE u.email IN ('peru-integrated-1@example.test', 'peru-integrated-2@example.test');
