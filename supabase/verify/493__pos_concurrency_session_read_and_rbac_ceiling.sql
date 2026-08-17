\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_pos_493') THEN
    RAISE EXCEPTION 'VERIFY_493_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_493_REQUIERE_POSTGRESQL_16';
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'DEV',
    project_ref = 'localerpephemeralqax',
    allow_demo_data = true,
    configured_at = clock_timestamp(),
    updated_at = clock_timestamp()
WHERE singleton = true;

DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_operational_permission uuid;
  v_users_manage_permission uuid;
  v_limited_role jsonb;
  v_limited_role_id uuid;
  v_limited_user jsonb;
  v_limited_user_id uuid;
  v_almacen uuid;
  v_caja uuid;
  v_sesion uuid;
  v_session_projection jsonb;
  v_numbers text[] := '{}'::text[];
  v_number text;
  v_before_fiscal bigint;
  v_after_fiscal bigint;
  v_index integer;
BEGIN
  v_demo := public.create_demo_tenant_ready_tx(
    'Verify POS/RBAC 493', 14, 'PE', 'verify-493-demo', NULL, NULL, NULL, 'COMERCIO'
  );
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;

  -- ADMIN_DEMO conserva users.manage y el check vive en SQL, no sólo en Nest.
  PERFORM app.assert_admin_actor_462(v_tenant, v_actor);
  SELECT p.id INTO v_users_manage_permission
  FROM public.permisos p
  WHERE p.tenant_id = v_tenant
    AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) = 'users.manage'
    AND COALESCE(p.activo, true)
  LIMIT 1;
  IF v_users_manage_permission IS NULL THEN
    RAISE EXCEPTION 'VERIFY_493_USERS_MANAGE_NOT_SEEDED';
  END IF;

  -- users.manage no se puede copiar a un rol personalizado.
  BEGIN
    PERFORM public.crear_rol_rbac_tx(
      v_tenant,
      v_actor,
      'verify-493-forbidden-users-manage',
      jsonb_build_object('nombre', 'ADMIN COPIADO 493'),
      ARRAY[v_users_manage_permission]
    );
    RAISE EXCEPTION 'VERIFY_493_USERS_MANAGE_WAS_DELEGATED';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%RESTRICTED%' THEN RAISE; END IF;
  END;

  SELECT p.id INTO v_operational_permission
  FROM public.permisos p
  WHERE p.tenant_id = v_tenant
    AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
      = 'configuracion.usuarios.crear'
    AND COALESCE(p.activo, true)
  LIMIT 1;
  IF v_operational_permission IS NULL THEN
    SELECT p.id INTO v_operational_permission
    FROM public.permisos p
    WHERE p.tenant_id = v_tenant
      AND COALESCE(p.activo, true)
      AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) <> 'users.manage'
    ORDER BY p.id
    LIMIT 1;
  END IF;

  v_limited_role := public.crear_rol_rbac_tx(
    v_tenant,
    v_actor,
    'verify-493-limited-role',
    jsonb_build_object('nombre', 'CREADOR LIMITADO 493'),
    ARRAY[v_operational_permission]
  );
  v_limited_role_id := (v_limited_role->>'id')::uuid;
  v_limited_user := public.crear_usuario_rbac_tx(
    v_tenant,
    v_actor,
    'verify-493-limited-user',
    jsonb_build_object(
      'nombre', 'Actor limitado 493',
      'email', 'limited-493@verify.local',
      'password_hash', 'verify-hash-not-a-login-secret',
      'estado', 'ACTIVO'
    ),
    ARRAY[v_limited_role_id]
  );
  v_limited_user_id := (v_limited_user->>'id')::uuid;

  -- Reproduce la antigua ruta usuarios-sistema/crear directamente contra su
  -- writer: un actor activo sin users.manage ya no puede asignar ningún rol,
  -- mucho menos ADMIN_DEMO.
  BEGIN
    PERFORM public.crear_usuario_rbac_tx(
      v_tenant,
      v_limited_user_id,
      'verify-493-escalation-attempt',
      jsonb_build_object(
        'nombre', 'Escalado bloqueado 493',
        'email', 'blocked-escalation-493@verify.local',
        'password_hash', 'verify-hash-not-a-login-secret',
        'estado', 'ACTIVO'
      ),
      ARRAY[(
        SELECT r.id FROM public.roles r
        WHERE r.tenant_id = v_tenant AND upper(r.nombre) = 'ADMIN_DEMO'
        LIMIT 1
      )]
    );
    RAISE EXCEPTION 'VERIFY_493_LEGACY_USER_PRIVILEGE_ESCALATION_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%USERS_MANAGE%' THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.rol_permisos rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permisos p ON p.id = rp.permiso_id
    WHERE r.tenant_id = v_tenant
      AND NOT COALESCE(r.is_system_role, false)
      AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) = 'users.manage'
      AND COALESCE(rp.concedido, true)
  ) THEN
    RAISE EXCEPTION 'VERIFY_493_CUSTOM_ROLE_RETAINED_USERS_MANAGE';
  END IF;

  -- Diez cajas lógicas comparten T001: cada reserva debe ser única y debe
  -- existir un único contador activo sin caja.
  FOR v_index IN 1..10 LOOP
    v_number := public.obtener_siguiente_numero_pos(
      v_tenant, 'T001', 'TICKET', gen_random_uuid()
    );
    v_numbers := array_append(v_numbers, v_number);
  END LOOP;
  IF cardinality(v_numbers) <> 10
     OR (SELECT count(DISTINCT n) FROM unnest(v_numbers) n) <> 10
     OR EXISTS (SELECT 1 FROM unnest(v_numbers) n WHERE n !~ '^[0-9]{8}$')
     OR (SELECT count(*) FROM public.pos_numeracion pn
         WHERE pn.tenant_id = v_tenant
           AND upper(pn.tipo_documento) = 'TICKET'
           AND upper(pn.serie) = 'T001'
           AND pn.caja_id IS NULL
           AND COALESCE(pn.activo, true)) <> 1
     OR EXISTS (
       SELECT 1 FROM public.pos_numeracion pn
       WHERE pn.tenant_id = v_tenant
         AND upper(pn.serie) = 'T001'
         AND pn.caja_id IS NOT NULL
         AND COALESCE(pn.activo, true)
     ) THEN
    RAISE EXCEPTION 'VERIFY_493_TENANT_TICKET_COUNTER_INVALID:%', v_numbers;
  END IF;

  -- B/F siguen usando documento_series y no se mezclan con T001.
  SELECT COALESCE(max(ds.correlativo_actual), 0) INTO v_before_fiscal
  FROM public.documento_series ds
  WHERE ds.tenant_id = v_tenant AND upper(ds.tipo_documento) = 'BOLETA' AND upper(ds.serie) = 'B001';
  PERFORM public.obtener_siguiente_numero_pos(v_tenant, 'B001', 'TICKET', gen_random_uuid());
  SELECT COALESCE(max(ds.correlativo_actual), 0) INTO v_after_fiscal
  FROM public.documento_series ds
  WHERE ds.tenant_id = v_tenant AND upper(ds.tipo_documento) = 'BOLETA' AND upper(ds.serie) = 'B001';
  IF v_after_fiscal <> v_before_fiscal + 1 THEN
    RAISE EXCEPTION 'VERIFY_493_FISCAL_SEQUENCE_REGRESSED:%:%', v_before_fiscal, v_after_fiscal;
  END IF;

  SELECT a.id INTO v_almacen
  FROM public.almacenes a
  WHERE a.tenant_id = v_tenant AND COALESCE(a.activo, true)
  ORDER BY COALESCE(a.es_principal, false) DESC, a.id
  LIMIT 1;
  INSERT INTO public.cajas(tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por)
  VALUES(v_tenant, 'CAJA-493', 'Caja verify 493', 'ACTIVO', v_almacen, 'MOSTRADOR', v_actor)
  RETURNING id INTO v_caja;
  v_session_projection := public.obtener_sesion_caja_actual_tx(v_tenant, v_actor);
  IF v_session_projection IS NULL THEN
    SELECT (public.abrir_caja_tx(
      v_tenant,
      v_caja,
      v_actor,
      jsonb_build_object('cajero_id', v_actor, 'monto_inicio', 50, 'moneda', 'PEN', 'dispositivo', 'VERIFY-493')
    )->>'id')::uuid INTO v_sesion;
    v_session_projection := public.obtener_sesion_caja_actual_tx(v_tenant, v_actor);
  ELSE
    v_sesion := (v_session_projection->>'id')::uuid;
    v_caja := (v_session_projection->>'caja_id')::uuid;
  END IF;
  IF (v_session_projection->>'id')::uuid IS DISTINCT FROM v_sesion
     OR v_session_projection->>'caja_id' IS DISTINCT FROM v_caja::text
     OR v_session_projection->>'estado' <> 'ABIERTA' THEN
    RAISE EXCEPTION 'VERIFY_493_SESSION_PROJECTION_INVALID:%', v_session_projection;
  END IF;
  IF public.obtener_sesion_caja_actual_tx(v_tenant, v_limited_user_id) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_493_SESSION_PROJECTION_LEAKED_OTHER_USER';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.sesiones_caja', 'SELECT')
     OR has_table_privilege('service_role', 'public.sesiones_caja', 'INSERT')
     OR has_table_privilege('service_role', 'public.sesiones_caja', 'UPDATE')
     OR has_table_privilege('service_role', 'public.sesiones_caja', 'DELETE')
     OR has_function_privilege('anon', 'public.obtener_sesion_caja_actual_tx(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.obtener_sesion_caja_actual_tx(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.obtener_sesion_caja_actual_tx(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.obtener_siguiente_numero_pos(uuid,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.obtener_siguiente_numero_pos(uuid,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.obtener_siguiente_numero_pos(uuid,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.assert_admin_actor_462(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_493_ACL_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'ventas_pos'
      AND indexname = 'ux_ventas_pos_tenant_ticket_new_493'
  ) THEN
    RAISE EXCEPTION 'VERIFY_493_TICKET_UNIQUE_INDEX_MISSING';
  END IF;
END;
$verify$;

ROLLBACK;
