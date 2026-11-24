\set ON_ERROR_STOP on

-- Contrato 621: credencial de integración externa. Todo ocurre en erp_e2e y
-- termina en ROLLBACK.
BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 621 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_otro_tenant uuid;
  v_admin uuid;
  v_sin_admin uuid := gen_random_uuid();
  v_sucursal uuid;
  v_otra_sucursal uuid;
  v_r jsonb;
  v_cred uuid;
  v_cuenta uuid;
  v_rol uuid;
  v_rol_admin uuid;
  v_permiso_extra uuid;
  v_h1 text := repeat('a', 64);
  v_h2 text := repeat('b', 64);
  v_h3 text := repeat('c', 64);
  v_ok jsonb := jsonb_build_object('metodo', 'GET', 'ruta', '/api/pos/sesion-caja', 'ruta_permitida', true);
  v_almacen uuid;
  v_almacen_b uuid;
  v_caja uuid;
  v_caja_b uuid;
  v_sesion uuid;
  v_sesion_b uuid;
  v_producto uuid := gen_random_uuid();
  v_metodo uuid;
  v_payload jsonb;
  v_link jsonb;
  v_venta uuid;
  v_count bigint;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Privilegios: sólo service_role ejecuta; el hash no es legible.
  ---------------------------------------------------------------------------
  IF NOT has_function_privilege('service_role', 'public.autenticar_integracion_externa_621(text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.autenticar_integracion_externa_621(text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crear_integracion_externa_621(uuid,uuid,uuid,text,text,timestamptz,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_registrar_venta_integracion_621(uuid,uuid,uuid,text,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.vincular_integracion_venta_621(uuid,uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_621_FUNCTION_PRIVILEGES';
  END IF;
  IF has_column_privilege('service_role', 'public.integracion_externa_secretos', 'hash_secreto', 'SELECT')
     OR NOT has_column_privilege('service_role', 'public.integracion_externa_secretos', 'prefijo', 'SELECT')
     OR has_table_privilege('service_role', 'public.integracion_externa_eventos', 'INSERT')
     OR has_table_privilege('service_role', 'public.integracion_externa_credenciales', 'UPDATE')
     OR has_table_privilege('anon', 'public.integracion_externa_credenciales', 'SELECT') THEN
    RAISE EXCEPTION 'VERIFY_621_TABLE_PRIVILEGES';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname IN (
       'integracion_externa_credenciales', 'integracion_externa_secretos', 'integracion_externa_eventos')
       AND relnamespace = 'public'::regnamespace AND NOT (relrowsecurity AND relforcerowsecurity)) THEN
    RAISE EXCEPTION 'VERIFY_621_RLS';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Fixture local.
  ---------------------------------------------------------------------------
  UPDATE app.deployment_environment
  SET environment = 'DEV', project_ref = 'localintegrationxxxx',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY INTEGRACION 621', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_admin := (v_demo->>'user_id')::uuid;
  SELECT public.create_demo_tenant('VERIFY INTEGRACION 621 B', 1, 'PE') INTO v_demo;
  v_otro_tenant := (v_demo->>'tenant_id')::uuid;
  UPDATE public.tenants SET pais = 'PE' WHERE id = v_tenant;
  UPDATE public.empresa_config SET pais = 'PE', moneda_defecto = 'PEN', ruc = '20600000621',
    razon_social = 'Empresa verify 621' WHERE tenant_id = v_tenant;

  SELECT id INTO v_sucursal FROM public.sucursales WHERE tenant_id = v_tenant ORDER BY es_principal DESC, id LIMIT 1;
  IF v_sucursal IS NULL THEN
    INSERT INTO public.sucursales (tenant_id, nombre, codigo, activo, estado)
    VALUES (v_tenant, 'Sede 621', 'S621', true, 'ACTIVO') RETURNING id INTO v_sucursal;
  END IF;
  INSERT INTO public.sucursales (tenant_id, nombre, codigo, activo, estado)
  VALUES (v_tenant, 'Sede 621 B', 'S621B', true, 'ACTIVO') RETURNING id INTO v_otra_sucursal;

  INSERT INTO public.usuarios_sistema (id, tenant_id, email, nombre, password_hash, estado, activo)
  VALUES (v_sin_admin, v_tenant, 'sin-admin-621@verify.local', 'Sin admin 621', 'x', 'ACTIVO', true);

  ---------------------------------------------------------------------------
  -- 3. Alta: sólo administrador, permisos acotados, cuenta sin contraseña.
  ---------------------------------------------------------------------------
  BEGIN
    PERFORM public.crear_integracion_externa_621(v_tenant, v_sin_admin, v_sucursal, 'Integración 621', 'Sistema 621',
      now() + interval '30 days', 'aaaaaaaa0621', v_h1, 'alta-621-sin-admin');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_ADMIN_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.crear_integracion_externa_621(v_tenant, v_admin, gen_random_uuid(), 'Integración 621', 'Sistema 621',
      now() + interval '30 days', 'aaaaaaaa0621', v_h1, 'alta-621-sucursal-mala');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_BRANCH_REJECTION';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.crear_integracion_externa_621(v_tenant, v_admin, v_sucursal, 'Integración 621', 'Sistema 621',
      now() + interval '1000 days', 'aaaaaaaa0621', v_h1, 'alta-621-vence-lejos');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_EXPIRY_REJECTION';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  v_r := public.crear_integracion_externa_621(v_tenant, v_admin, v_sucursal, 'Integración – Sede 621', 'Sistema 621',
    now() + interval '30 days', 'aaaaaaaa0621', v_h1, 'alta-621-ok');
  v_cred := (v_r->>'id')::uuid;
  SELECT cuenta_tecnica_id INTO v_cuenta FROM public.integracion_externa_credenciales WHERE id = v_cred;
  IF v_r ? 'hash_secreto' OR (v_r->>'sucursal_id')::uuid <> v_sucursal OR NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema u WHERE u.id = v_cuenta AND u.es_cuenta_integracion
       AND u.password_hash IS NULL AND NOT u.is_super_admin AND u.tenant_id = v_tenant AND u.activo)
  THEN
    RAISE EXCEPTION 'VERIFY_621_ALTA_SHAPE %', v_r;
  END IF;
  SELECT r.id INTO v_rol FROM public.roles r
   WHERE r.tenant_id = v_tenant AND upper(r.nombre) = 'INTEGRACION_EXTERNA';
  IF (SELECT array_agg(lower(p.codigo) ORDER BY lower(p.codigo))
        FROM public.rol_permisos rp JOIN public.permisos p ON p.id = rp.permiso_id
       WHERE rp.role_id = v_rol AND rp.concedido)
     IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(app.integracion_permisos_621()) x)
     OR (SELECT count(*) FROM public.user_roles WHERE usuario_sistema_id = v_cuenta) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_621_SCOPED_PERMISSIONS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.integracion_externa_eventos e
                  WHERE e.credencial_id = v_cred AND e.evento = 'ALTA' AND e.actor_id = v_admin) THEN
    RAISE EXCEPTION 'VERIFY_621_ALTA_NOT_AUDITED';
  END IF;
  BEGIN
    PERFORM public.crear_integracion_externa_621(v_tenant, v_admin, v_sucursal, 'Integración 621', 'Sistema 621',
      now() + interval '30 days', 'dddddddd0621', repeat('d', 64), 'alta-621-ok');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_IDEMPOTENT_ALTA';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'INTEGRATION_CREDENTIAL_ALREADY_CREATED:%' THEN RAISE; END IF;
  END;

  -- Los sembrados RBAC que corren al crear otro rol no tocan el rol técnico.
  INSERT INTO public.roles (tenant_id, nombre, descripcion, activo) VALUES (v_tenant, 'ROL VERIFY 621', 'verify', true);
  IF (SELECT count(*) FROM public.rol_permisos WHERE role_id = v_rol AND concedido)
     <> cardinality(app.integracion_permisos_621()) THEN
    RAISE EXCEPTION 'VERIFY_621_RBAC_SEEDS_WIDENED_ROLE';
  END IF;

  -- La cuenta técnica no gana contraseña, otro rol ni permisos fuera de la lista.
  BEGIN
    UPDATE public.usuarios_sistema SET password_hash = 'x' WHERE id = v_cuenta;
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_PASSWORD_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT ur.role_id INTO v_rol_admin FROM public.user_roles ur WHERE ur.usuario_sistema_id = v_admin LIMIT 1;
  BEGIN
    INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id) VALUES (v_cuenta, v_rol_admin, v_tenant);
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_ROLE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id) VALUES (v_admin, v_rol, v_tenant);
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_HUMAN_ROLE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT p.id INTO v_permiso_extra FROM public.permisos p
   WHERE p.tenant_id = v_tenant AND lower(p.codigo) = 'users.manage' LIMIT 1;
  BEGIN
    INSERT INTO public.rol_permisos (role_id, permiso_id, concedido) VALUES (v_rol, v_permiso_extra, true);
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_PERMISSION_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  ---------------------------------------------------------------------------
  -- 4. Autenticación y alcance: cada rechazo queda auditado.
  ---------------------------------------------------------------------------
  v_r := public.autenticar_integracion_externa_621('aaaaaaaa0621', v_h2, v_ok);
  IF v_r->>'codigo' <> 'INTEGRACION_CREDENCIAL_INVALIDA' THEN RAISE EXCEPTION 'VERIFY_621_BAD_HASH %', v_r; END IF;
  v_r := public.autenticar_integracion_externa_621('zzzzzzzz0621', v_h1, v_ok);
  IF v_r->>'codigo' <> 'INTEGRACION_CREDENCIAL_INVALIDA' THEN RAISE EXCEPTION 'VERIFY_621_UNKNOWN_PREFIX %', v_r; END IF;
  v_r := public.autenticar_integracion_externa_621('aaaaaaaa0621', v_h1, v_ok || '{"ruta_permitida": false}');
  IF v_r->>'codigo' <> 'INTEGRACION_RUTA_NO_PERMITIDA' THEN RAISE EXCEPTION 'VERIFY_621_ROUTE %', v_r; END IF;
  v_r := public.autenticar_integracion_externa_621('aaaaaaaa0621', v_h1,
    v_ok || jsonb_build_object('tenant_solicitado', jsonb_build_array(v_otro_tenant)));
  IF v_r->>'codigo' <> 'INTEGRACION_ALCANCE_TENANT' THEN RAISE EXCEPTION 'VERIFY_621_TENANT_SCOPE %', v_r; END IF;
  v_r := public.autenticar_integracion_externa_621('aaaaaaaa0621', v_h1,
    v_ok || jsonb_build_object('tenant_solicitado', jsonb_build_array(v_tenant),
                               'sucursal_solicitada', jsonb_build_array(v_otra_sucursal)));
  IF v_r->>'codigo' <> 'INTEGRACION_ALCANCE_SUCURSAL' THEN RAISE EXCEPTION 'VERIFY_621_BRANCH_SCOPE %', v_r; END IF;
  v_r := public.autenticar_integracion_externa_621('aaaaaaaa0621', v_h1, v_ok || '{"actor_externo_requerido": true}');
  IF v_r->>'codigo' <> 'INTEGRACION_ACTOR_EXTERNO_REQUERIDO' THEN RAISE EXCEPTION 'VERIFY_621_ACTOR %', v_r; END IF;
  v_r := public.autenticar_integracion_externa_621('aaaaaaaa0621', v_h1, v_ok || jsonb_build_object(
    'tenant_solicitado', jsonb_build_array(v_tenant), 'sucursal_solicitada', jsonb_build_array(v_sucursal),
    'actor_externo_requerido', true, 'actor_externo_id', 'EXT-7', 'actor_externo_nombre', 'Recepción 7'));
  IF NOT (v_r->>'ok')::boolean OR (v_r->>'tenant_id')::uuid <> v_tenant OR (v_r->>'sucursal_id')::uuid <> v_sucursal
     OR (v_r->>'cuenta_tecnica_id')::uuid <> v_cuenta THEN
    RAISE EXCEPTION 'VERIFY_621_AUTH_OK %', v_r;
  END IF;
  SELECT count(*) INTO v_count FROM public.integracion_externa_eventos WHERE credencial_id = v_cred AND evento = 'RECHAZO';
  IF v_count <> 5 OR NOT EXISTS (
    SELECT 1 FROM public.integracion_externa_eventos e WHERE e.credencial_id = v_cred AND e.evento = 'USO'
       AND e.actor_externo_id = 'EXT-7' AND e.actor_externo_nombre = 'Recepción 7' AND e.sucursal_id = v_sucursal
       AND e.sistema = 'Sistema 621' AND e.ruta = '/api/pos/sesion-caja') THEN
    RAISE EXCEPTION 'VERIFY_621_USE_AUDIT rechazos=%', v_count;
  END IF;

  -- Un administrador limitado a otra sede no crea ni administra esta.
  INSERT INTO public.usuario_sucursales (tenant_id, usuario_sistema_id, sucursal_id)
  VALUES (v_tenant, v_admin, v_otra_sucursal);
  BEGIN
    PERFORM public.crear_integracion_externa_621(v_tenant, v_admin, v_sucursal, 'Integración 621 C', 'Sistema 621',
      now() + interval '30 days', 'eeeeeeee0621', repeat('e', 64), 'alta-621-fuera-de-sede');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_ACTOR_BRANCH_CREATE';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'INTEGRATION_BRANCH_OUT_OF_ACTOR_SCOPE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.revocar_integracion_externa_621(v_tenant, v_admin, v_cred, 'Fuera de sede');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_ACTOR_BRANCH_ADMIN';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'INTEGRATION_BRANCH_OUT_OF_ACTOR_SCOPE' THEN RAISE; END IF;
  END;
  DELETE FROM public.usuario_sucursales WHERE tenant_id = v_tenant AND usuario_sistema_id = v_admin;

  ---------------------------------------------------------------------------
  -- 5. Rotación con período de gracia.
  ---------------------------------------------------------------------------
  v_r := public.rotar_integracion_externa_621(v_tenant, v_admin, v_cred, 'bbbbbbbb0621', v_h2, 24);
  IF NOT (public.autenticar_integracion_externa_621('aaaaaaaa0621', v_h1, v_ok)->>'ok')::boolean
     OR NOT (public.autenticar_integracion_externa_621('bbbbbbbb0621', v_h2, v_ok)->>'ok')::boolean THEN
    RAISE EXCEPTION 'VERIFY_621_GRACE_BOTH_VALID';
  END IF;
  BEGIN
    PERFORM public.rotar_integracion_externa_621(v_tenant, v_admin, v_cred, 'cccccccc0621', v_h3, 24);
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_ROTATION_IN_PROGRESS';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  UPDATE public.integracion_externa_secretos SET valido_hasta = now() - interval '1 second'
   WHERE prefijo = 'aaaaaaaa0621';
  v_r := public.autenticar_integracion_externa_621('aaaaaaaa0621', v_h1, v_ok);
  IF v_r->>'codigo' <> 'INTEGRACION_SECRETO_RETIRADO'
     OR (SELECT estado FROM public.integracion_externa_secretos WHERE prefijo = 'aaaaaaaa0621') <> 'RETIRADO'
     OR NOT EXISTS (SELECT 1 FROM public.integracion_externa_eventos WHERE credencial_id = v_cred AND evento = 'SECRETO_RETIRADO')
     OR NOT (public.autenticar_integracion_externa_621('bbbbbbbb0621', v_h2, v_ok)->>'ok')::boolean THEN
    RAISE EXCEPTION 'VERIFY_621_GRACE_END %', v_r;
  END IF;
  PERFORM public.rotar_integracion_externa_621(v_tenant, v_admin, v_cred, 'cccccccc0621', v_h3, 2);
  PERFORM public.finalizar_rotacion_integracion_externa_621(v_tenant, v_admin, v_cred);
  IF (public.autenticar_integracion_externa_621('bbbbbbbb0621', v_h2, v_ok)->>'codigo') <> 'INTEGRACION_SECRETO_RETIRADO'
     OR NOT (public.autenticar_integracion_externa_621('cccccccc0621', v_h3, v_ok)->>'ok')::boolean
     OR (SELECT count(*) FROM public.integracion_externa_eventos
          WHERE credencial_id = v_cred AND evento IN ('ROTACION', 'ROTACION_FINALIZADA')) <> 3 THEN
    RAISE EXCEPTION 'VERIFY_621_ROTATION_FINALIZE';
  END IF;

  ---------------------------------------------------------------------------
  -- 6. Vencimiento: 401 con código claro, auditado una vez; renovable.
  ---------------------------------------------------------------------------
  UPDATE public.integracion_externa_credenciales SET expira_en = now() - interval '1 minute' WHERE id = v_cred;
  -- Llamadas en sentencias separadas: dentro de un mismo IF el planificador
  -- puede evaluar el conteo antes que las llamadas.
  v_r := public.autenticar_integracion_externa_621('cccccccc0621', v_h3, v_ok);
  IF v_r->>'codigo' <> 'INTEGRACION_CREDENCIAL_VENCIDA' THEN RAISE EXCEPTION 'VERIFY_621_EXPIRY %', v_r; END IF;
  v_r := public.autenticar_integracion_externa_621('cccccccc0621', v_h3, v_ok);
  IF v_r->>'codigo' <> 'INTEGRACION_CREDENCIAL_VENCIDA' THEN RAISE EXCEPTION 'VERIFY_621_EXPIRY_AGAIN %', v_r; END IF;
  IF (SELECT count(*) FROM public.integracion_externa_eventos WHERE credencial_id = v_cred AND evento = 'VENCIMIENTO') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_621_EXPIRY_AUDITED_ONCE';
  END IF;
  PERFORM public.actualizar_vencimiento_integracion_externa_621(v_tenant, v_admin, v_cred, now() + interval '90 days');
  IF NOT (public.autenticar_integracion_externa_621('cccccccc0621', v_h3, v_ok)->>'ok')::boolean THEN
    RAISE EXCEPTION 'VERIFY_621_EXPIRY_RENEW';
  END IF;

  ---------------------------------------------------------------------------
  -- 7. Venta con las dos identidades, idempotente y en su sucursal.
  ---------------------------------------------------------------------------
  INSERT INTO public.almacenes (tenant_id, codigo, nombre, estado, activo, es_principal, pais, sucursal_id)
  VALUES (v_tenant, 'ALM-621', 'Almacén 621', 'ACTIVO', true, true, 'PE', v_sucursal) RETURNING id INTO v_almacen;
  INSERT INTO public.almacenes (tenant_id, codigo, nombre, estado, activo, es_principal, pais, sucursal_id)
  VALUES (v_tenant, 'ALM-621-B', 'Almacén 621 B', 'ACTIVO', true, false, 'PE', v_otra_sucursal)
  RETURNING id INTO v_almacen_b;
  INSERT INTO public.cajas (tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por, sucursal_id)
  VALUES (v_tenant, 'CAJA-621', 'Caja 621', 'ACTIVO', v_almacen, 'MOSTRADOR', v_admin, v_sucursal)
  RETURNING id INTO v_caja;
  INSERT INTO public.cajas (tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por, sucursal_id)
  VALUES (v_tenant, 'CAJA-621-B', 'Caja 621 B', 'ACTIVO', v_almacen_b,'MOSTRADOR', v_admin, v_otra_sucursal)
  RETURNING id INTO v_caja_b;
  SELECT id INTO v_metodo FROM public.metodos_pago
   WHERE tenant_id IS NULL AND lower(btrim(codigo)) = 'efectivo' AND upper(coalesce(tipo, '')) = 'EFECTIVO'
   ORDER BY id LIMIT 1;
  INSERT INTO public.productos (
    id, tenant_id, codigo, nombre, estado, activo, es_servicio, controla_stock, precio, precio_venta,
    precio_unitario, precio_compra, costo, stock_actual, stock, stock_reservado, unidad_medida,
    afectacion_igv, impuesto
  ) VALUES (
    v_producto, v_tenant, 'PROD-621', 'Servicio 621', 'ACTIVO', true, true, false, 10, 10, 10,
    1, 1, 0, 0, 0, 'ZZ', '10', 18
  );

  -- La cuenta técnica abre caja con sus propios permisos (pos.caja.write).
  SELECT (public.abrir_caja_tx(v_tenant, v_caja, v_cuenta, jsonb_build_object(
    'cajero_id', v_cuenta, 'monto_inicio', 0, 'moneda', 'PEN', 'dispositivo', 'INT-621',
    'denominaciones_apertura', '{}'::jsonb))->>'id')::uuid INTO v_sesion;

  v_payload := jsonb_build_object(
    'emitir_cpe', false, 'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 621',
    'moneda', 'PEN', 'ticket_serie', 'T621',
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto, 'cantidad', 1, 'precio_unitario', 10, 'precio_original', 10,
      'descuento_monto', 0, 'subtotal', 10, 'igv', 1.8)),
    'pagos', jsonb_build_array(jsonb_build_object(
      'metodo_pago_id', v_metodo, 'codigo', 'efectivo', 'monto', 11.8, 'moneda', 'PEN')));
  v_link := jsonb_build_object('credencial_id', v_cred, 'referencia_externa', 'EXT-0001',
    'actor_externo_id', 'EXT-7', 'actor_externo_nombre', 'Recepción 7');

  v_r := public.pos_registrar_venta_integracion_621(v_tenant, v_cuenta, v_sesion, 'int-621-venta-1', v_payload, v_link);
  v_venta := (v_r->>'venta_id')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.ventas_pos v WHERE v.id = v_venta AND v.referencia_externa = 'EXT-0001'
       AND v.integracion_credencial_id = v_cred AND v.actor_externo_id = 'EXT-7'
       AND v.actor_externo_nombre = 'Recepción 7')
  THEN
    RAISE EXCEPTION 'VERIFY_621_SALE_LINK %', v_r;
  END IF;
  v_r := public.pos_registrar_venta_integracion_621(v_tenant, v_cuenta, v_sesion, 'int-621-venta-1', v_payload, v_link);
  IF (v_r->>'venta_id')::uuid <> v_venta
     OR (SELECT count(*) FROM public.ventas_pos WHERE tenant_id = v_tenant AND idempotency_key = 'int-621-venta-1') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_621_SALE_IDEMPOTENT %', v_r;
  END IF;
  PERFORM public.pos_vincular_integracion_venta_621(v_tenant, v_cuenta, v_venta, v_link);
  BEGIN
    PERFORM public.pos_vincular_integracion_venta_621(v_tenant, v_cuenta, v_venta,
      v_link || '{"referencia_externa": "EXT-0002"}');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_LINK_MISMATCH';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- La persona externa nunca se acepta sin credencial.
  BEGIN
    PERFORM public.pos_vincular_integracion_venta_621(v_tenant, v_cuenta, v_venta,
      '{"actor_externo_id": "EXT-7", "actor_externo_nombre": "Recepción 7"}');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_ACTOR_WITHOUT_CREDENTIAL';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Ni con una credencial ajena a la cuenta que vende.
  BEGIN
    PERFORM public.pos_vincular_integracion_venta_621(v_tenant, v_admin, v_venta, v_link);
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_FOREIGN_ACTOR';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Una sesión en otra sucursal no se enlaza a la credencial. La API nunca la
  -- abre (la caja debe ser de la sucursal); aquí se fuerza para probar la BD.
  PERFORM public.cerrar_caja_tx(v_tenant, v_sesion, v_cuenta,
    jsonb_build_object('monto_contado', 11.8, 'denominaciones', '{}'::jsonb));
  SELECT (public.abrir_caja_tx(v_tenant, v_caja_b, v_cuenta, jsonb_build_object(
    'cajero_id', v_cuenta, 'monto_inicio', 0, 'moneda', 'PEN', 'dispositivo', 'INT-621-B',
    'denominaciones_apertura', '{}'::jsonb))->>'id')::uuid INTO v_sesion_b;
  BEGIN
    PERFORM public.pos_registrar_venta_integracion_621(v_tenant, v_cuenta, v_sesion_b, 'int-621-venta-b',
      v_payload, v_link || '{"referencia_externa": "EXT-0003"}');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_BRANCH_MISMATCH';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'POS_INTEGRATION_BRANCH_MISMATCH' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.ventas_pos WHERE tenant_id = v_tenant AND idempotency_key = 'int-621-venta-b') THEN
    RAISE EXCEPTION 'VERIFY_621_BRANCH_MISMATCH_NOT_ATOMIC';
  END IF;

  ---------------------------------------------------------------------------
  -- 8. Revocación inmediata y eventos inmutables.
  ---------------------------------------------------------------------------
  BEGIN
    PERFORM public.revocar_integracion_externa_621(v_tenant, v_admin, v_cred, '');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_REASON_REQUIRED';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM public.revocar_integracion_externa_621(v_tenant, v_admin, v_cred, 'Cambio de proveedor');
  IF (public.autenticar_integracion_externa_621('cccccccc0621', v_h3, v_ok)->>'codigo') <> 'INTEGRACION_CREDENCIAL_REVOCADA'
     OR EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE id = v_cuenta AND activo)
     OR NOT EXISTS (SELECT 1 FROM public.integracion_externa_eventos WHERE credencial_id = v_cred AND evento = 'REVOCACION') THEN
    RAISE EXCEPTION 'VERIFY_621_REVOCATION';
  END IF;
  BEGIN
    UPDATE public.usuarios_sistema SET activo = true, estado = 'ACTIVO' WHERE id = v_cuenta;
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_REACTIVATION_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.integracion_externa_eventos SET codigo = 'X' WHERE credencial_id = v_cred;
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_APPEND_ONLY';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Otra empresa no ve ni administra esta credencial.
  BEGIN
    PERFORM public.revocar_integracion_externa_621(v_otro_tenant, v_admin, v_cred, 'Intento ajeno');
    RAISE EXCEPTION 'VERIFY_621_EXPECTED_CROSS_TENANT_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$verify$;

SELECT 'PASS621: credencial de integración acotada, rotación con gracia, vencimiento, revocación, alcance y venta con dos identidades';
ROLLBACK;
