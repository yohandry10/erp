\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 520 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END;
$$;

DO $$
DECLARE
  v_proc oid := to_regprocedure(
    'public.cambiar_estado_cotizacion_tx(uuid,uuid,text,uuid,text)'
  );
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_admin_role_id uuid;
  v_admin_real_role_id uuid;
  v_vendedor_role_id uuid;
  v_permiso_aprobar_id uuid;
  v_cliente_id uuid;
  v_almacen_id uuid;
  v_producto_id uuid;
  v_cotizacion_admin_id uuid;
  v_cotizacion_admin_real_id uuid;
  v_cotizacion_sin_permiso_id uuid;
  v_cotizacion_vendedor_id uuid;
  v_cotizacion_rechazo_id uuid;
  v_detalle jsonb;
BEGIN
  IF v_proc IS NULL THEN
    RAISE EXCEPTION 'No existe cambiar_estado_cotizacion_tx con la firma publica esperada';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = v_proc
      AND prosecdef
      AND provolatile = 'v'
      AND proconfig @> ARRAY['search_path=pg_catalog, public, app, pg_temp']
  ) THEN
    RAISE EXCEPTION 'El RPC no conserva SECURITY DEFINER, VOLATILE o search_path seguro';
  END IF;

  IF has_function_privilege('anon', v_proc, 'EXECUTE')
     OR has_function_privilege('authenticated', v_proc, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Los privilegios del RPC no están cerrados a service_role';
  END IF;

  UPDATE app.deployment_environment
  SET environment = 'PROD',
      project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true,
      configured_at = now(),
      updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY COTIZACION ADMIN 520', 1, 'PE')
  INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;

  SELECT r.id INTO v_admin_role_id
  FROM public.roles r
  WHERE r.tenant_id = v_tenant_id
    AND upper(btrim(r.nombre)) = 'ADMIN_DEMO'
    AND coalesce(r.is_system_role, false)
    AND coalesce(r.activo, true)
  LIMIT 1;

  SELECT r.id INTO v_vendedor_role_id
  FROM public.roles r
  WHERE r.tenant_id = v_tenant_id
    AND upper(btrim(r.nombre)) = 'VENDEDOR'
    AND coalesce(r.is_system_role, false)
    AND coalesce(r.activo, true)
  LIMIT 1;

  SELECT r.id INTO v_admin_real_role_id
  FROM public.roles r
  WHERE r.tenant_id = v_tenant_id
    AND upper(btrim(r.nombre)) = 'ADMIN'
    AND coalesce(r.is_system_role, false)
    AND coalesce(r.activo, true)
  LIMIT 1;

  SELECT p.id INTO v_permiso_aprobar_id
  FROM public.permisos p
  WHERE p.tenant_id = v_tenant_id
    AND lower(coalesce(
      nullif(btrim(p.codigo), ''),
      p.modulo || '.' || p.recurso || '.' || p.accion
    )) = 'ventas.cotizaciones.approve'
    AND coalesce(p.activo, true)
  LIMIT 1;

  IF v_admin_role_id IS NULL OR v_admin_real_role_id IS NULL
     OR v_vendedor_role_id IS NULL
     OR v_permiso_aprobar_id IS NULL THEN
    RAISE EXCEPTION 'La demo no sembró los roles o el permiso canónico de aprobación';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rol_permisos rp
    WHERE rp.role_id = v_admin_role_id
      AND rp.permiso_id = v_permiso_aprobar_id
      AND coalesce(rp.concedido, false)
  ) THEN
    RAISE EXCEPTION 'ADMIN_DEMO no recibió el permiso explícito de aprobación';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rol_permisos rp
    WHERE rp.role_id = v_admin_real_role_id
      AND rp.permiso_id = v_permiso_aprobar_id
      AND coalesce(rp.concedido, false)
  ) THEN
    RAISE EXCEPTION 'ADMIN no recibió el permiso explícito de aprobación';
  END IF;

  -- Deja una sola membresía controlada para que ninguna asignación heredada
  -- convierta la prueba de permiso o de rol en un falso positivo.
  DELETE FROM public.user_roles
  WHERE tenant_id = v_tenant_id
    AND usuario_sistema_id = v_user_id;
  INSERT INTO public.user_roles (
    usuario_sistema_id, role_id, tenant_id
  ) VALUES (
    v_user_id, v_admin_role_id, v_tenant_id
  );

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant_id, 'CLI-VERIFY-520', 'Cliente Verify 520',
    'Cliente Verify 520', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-VERIFY-520', 'Almacén Verify 520',
    'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen_id;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-VERIFY-520',
      'nombre', 'Producto Verify 520',
      'categoria', 'VERIFICACION',
      'precio_venta', 25,
      'precio_compra', 10,
      'afectacion_igv', '10'
    ),
    v_almacen_id,
    10,
    0,
    '[]'::jsonb
  )->>'id')::uuid INTO v_producto_id;

  v_detalle := jsonb_build_array(jsonb_build_object(
    'producto_id', v_producto_id,
    'descripcion', 'Producto Verify 520',
    'cantidad', 1,
    'precio_unitario', 25,
    'orden', 1
  ));

  SELECT (public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, app.hoy_tenant(v_tenant_id) + 7,
    NULL, 'Administrador Verify 520', 'PEN', 25, 4.50, 29.50, v_detalle
  )->'cotizacion'->>'id')::uuid INTO v_cotizacion_admin_id;

  PERFORM public.cambiar_estado_cotizacion_tx(
    v_cotizacion_admin_id, v_tenant_id, 'APROBADA', v_user_id, NULL
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.cotizaciones c
    WHERE c.id = v_cotizacion_admin_id
      AND c.tenant_id = v_tenant_id
      AND upper(c.estado::text) = 'APROBADA'
      AND c.aprobado_por = v_user_id
      AND c.fecha_aprobacion IS NOT NULL
      AND c.observaciones_aprobacion = 'Autoaprobación administrativa'
  ) THEN
    RAISE EXCEPTION 'La autoaprobación administrativa no quedó trazada por completo';
  END IF;

  -- La misma excepción aplica al ADMIN canónico de tenants reales, conservando
  -- exactamente el motivo escrito por el actor cuando sí lo proporciona.
  DELETE FROM public.user_roles
  WHERE tenant_id = v_tenant_id
    AND usuario_sistema_id = v_user_id;
  INSERT INTO public.user_roles (
    usuario_sistema_id, role_id, tenant_id
  ) VALUES (
    v_user_id, v_admin_real_role_id, v_tenant_id
  );

  SELECT (public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, app.hoy_tenant(v_tenant_id) + 7,
    NULL, 'Administrador Verify 520', 'PEN', 25, 4.50, 29.50, v_detalle
  )->'cotizacion'->>'id')::uuid INTO v_cotizacion_admin_real_id;

  PERFORM public.cambiar_estado_cotizacion_tx(
    v_cotizacion_admin_real_id, v_tenant_id, 'APROBADA', v_user_id,
    'Aprobación directa del administrador'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.cotizaciones c
    WHERE c.id = v_cotizacion_admin_real_id
      AND c.tenant_id = v_tenant_id
      AND upper(c.estado::text) = 'APROBADA'
      AND c.aprobado_por = v_user_id
      AND c.fecha_aprobacion IS NOT NULL
      AND c.observaciones_aprobacion = 'Aprobación directa del administrador'
  ) THEN
    RAISE EXCEPTION 'La autoaprobación del ADMIN canónico no conservó su motivo';
  END IF;

  DELETE FROM public.user_roles
  WHERE tenant_id = v_tenant_id
    AND usuario_sistema_id = v_user_id;
  INSERT INTO public.user_roles (
    usuario_sistema_id, role_id, tenant_id
  ) VALUES (
    v_user_id, v_admin_role_id, v_tenant_id
  );

  -- El nombre del rol no basta: sin concesión explícita, el administrador debe
  -- volver a requerir un segundo aprobador.
  UPDATE public.rol_permisos
  SET concedido = false
  WHERE role_id = v_admin_role_id
    AND permiso_id = v_permiso_aprobar_id;

  SELECT (public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, app.hoy_tenant(v_tenant_id) + 7,
    NULL, 'Administrador Verify 520', 'PEN', 25, 4.50, 29.50, v_detalle
  )->'cotizacion'->>'id')::uuid INTO v_cotizacion_sin_permiso_id;

  BEGIN
    PERFORM public.cambiar_estado_cotizacion_tx(
      v_cotizacion_sin_permiso_id, v_tenant_id, 'APROBADA', v_user_id, NULL
    );
    RAISE EXCEPTION 'VERIFY_520_ACEPTO_ADMIN_SIN_PERMISO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'VERIFY_520_ACEPTO_ADMIN_SIN_PERMISO' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'La cotización requiere un aprobador distinto del creador' THEN
      RAISE EXCEPTION 'Error inesperado para ADMIN sin permiso: %', SQLERRM;
    END IF;
  END;

  IF (SELECT upper(estado::text) FROM public.cotizaciones
      WHERE id = v_cotizacion_sin_permiso_id) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'La cotización del ADMIN sin permiso cambió de estado';
  END IF;

  UPDATE public.rol_permisos
  SET concedido = true
  WHERE role_id = v_admin_role_id
    AND permiso_id = v_permiso_aprobar_id;

  DELETE FROM public.user_roles
  WHERE tenant_id = v_tenant_id
    AND usuario_sistema_id = v_user_id;
  INSERT INTO public.user_roles (
    usuario_sistema_id, role_id, tenant_id
  ) VALUES (
    v_user_id, v_vendedor_role_id, v_tenant_id
  );

  SELECT (public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, app.hoy_tenant(v_tenant_id) + 7,
    NULL, 'Vendedor Verify 520', 'PEN', 25, 4.50, 29.50, v_detalle
  )->'cotizacion'->>'id')::uuid INTO v_cotizacion_vendedor_id;

  BEGIN
    PERFORM public.cambiar_estado_cotizacion_tx(
      v_cotizacion_vendedor_id, v_tenant_id, 'APROBADA', v_user_id, NULL
    );
    RAISE EXCEPTION 'VERIFY_520_ACEPTO_VENDEDOR';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'VERIFY_520_ACEPTO_VENDEDOR' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'La cotización requiere un aprobador distinto del creador' THEN
      RAISE EXCEPTION 'Error inesperado para VENDEDOR autocreador: %', SQLERRM;
    END IF;
  END;

  IF (SELECT upper(estado::text) FROM public.cotizaciones
      WHERE id = v_cotizacion_vendedor_id) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'La cotización del VENDEDOR cambió pese al rechazo';
  END IF;

  DELETE FROM public.user_roles
  WHERE tenant_id = v_tenant_id
    AND usuario_sistema_id = v_user_id;
  INSERT INTO public.user_roles (
    usuario_sistema_id, role_id, tenant_id
  ) VALUES (
    v_user_id, v_admin_role_id, v_tenant_id
  );

  SELECT (public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, app.hoy_tenant(v_tenant_id) + 7,
    NULL, 'Administrador Verify 520', 'PEN', 25, 4.50, 29.50, v_detalle
  )->'cotizacion'->>'id')::uuid INTO v_cotizacion_rechazo_id;

  BEGIN
    PERFORM public.cambiar_estado_cotizacion_tx(
      v_cotizacion_rechazo_id, v_tenant_id, 'RECHAZADA', v_user_id, NULL
    );
    RAISE EXCEPTION 'VERIFY_520_ACEPTO_AUTORRECHAZO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'VERIFY_520_ACEPTO_AUTORRECHAZO' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'El creador no puede rechazar su propia cotización' THEN
      RAISE EXCEPTION 'Error inesperado para autorrechazo ADMIN: %', SQLERRM;
    END IF;
  END;

  IF (SELECT upper(estado::text) FROM public.cotizaciones
      WHERE id = v_cotizacion_rechazo_id) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'La cotización cambió pese a prohibir el autorrechazo';
  END IF;
END;
$$;

ROLLBACK;
