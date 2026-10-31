\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' OR current_setting('server_version_num')::integer < 160000 OR inet_server_addr() IS NULL THEN
    RAISE EXCEPTION 'SIMULACION_REQUIERE_POSTGRESQL_16_LOCAL_ERP_E2E';
  END IF;
END $guard$;

-- Fixture sintética de la base efímera de la simulación de migración: dos empresas
-- (la que migra y otra para aislamiento) con administrador, aprobador de
-- compras, auditor y vendedor. Credenciales sólo locales.
UPDATE app.deployment_environment
SET environment = 'DEV', project_ref = 'localerpephemeralqax', allow_demo_data = true,
    configured_at = clock_timestamp(), updated_at = clock_timestamp()
WHERE singleton = true;

DO $fixture$
DECLARE d jsonb; t uuid; a uuid; k integer; v_rol text; v_clave text := extensions.crypt('Local-Migracion-2026-Only!', extensions.gen_salt('bf'));
BEGIN
  FOR k IN 1..2 LOOP
    d := public.create_demo_tenant_ready_tx(('Simulación de migración ' || k)::varchar, 14, 'PE', 'migracion-simulacion-' || k, NULL, NULL, NULL, 'COMERCIO');
    t := (d->>'tenant_id')::uuid; a := (d->>'user_id')::uuid;
    UPDATE public.usuarios_sistema SET email = 'mig-sim-admin-' || k || '@example.test', password_hash = v_clave, estado = 'ACTIVO' WHERE id = a;
    UPDATE public.usuarios_sistema SET email = 'mig-sim-aprobador-' || k || '@example.test', password_hash = v_clave, estado = 'ACTIVO'
    WHERE id = (d->>'aprobador_user_id')::uuid;
    -- La migración pertenece a ADMIN, como en una empresa real.
    PERFORM app.sembrar_permisos_migracion_554(t);
    INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
    SELECT a, r.id, t FROM public.roles r WHERE r.tenant_id = t AND upper(r.nombre) = 'ADMIN'
      AND NOT EXISTS (SELECT 1 FROM public.user_roles x WHERE x.usuario_sistema_id = a AND x.role_id = r.id);
    FOREACH v_rol IN ARRAY ARRAY['AUDITOR', 'VENDEDOR'] LOOP
      PERFORM public.crear_usuario_rbac_tx(t, a, 'mig-sim-' || lower(v_rol) || '-' || k,
        jsonb_build_object('email', 'mig-sim-' || lower(v_rol) || '-' || k || '@example.test', 'nombre', initcap(v_rol) || ' simulación de migración',
          'estado', 'ACTIVO', 'password_hash', v_clave),
        ARRAY[(SELECT r.id FROM public.roles r WHERE r.tenant_id = t AND upper(r.nombre) = v_rol)]);
    END LOOP;
  END LOOP;
END $fixture$;
COMMIT;

SELECT jsonb_agg(jsonb_build_object('tenant_id', u.tenant_id, 'email', u.email, 'user_id', u.id) ORDER BY u.email)
FROM public.usuarios_sistema u WHERE u.email LIKE 'mig-sim-%@example.test';
