\set ON_ERROR_STOP on

-- Contrato real 518. Todo ocurre en erp_e2e y termina en ROLLBACK.
BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 518 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_supervisor uuid := gen_random_uuid();
  v_sin_rol uuid := gen_random_uuid();
  v_almacen uuid;
  v_caja uuid;
  v_otra_caja uuid;
  v_sesion_redondeo uuid;
  v_sesion_sin_evidencia uuid;
  v_sesion_supervisor uuid;
  v_sesion_cajero_supervisor uuid;
  v_rol_supervisor uuid;
  v_producto uuid := gen_random_uuid();
  v_metodo_efectivo uuid;
  v_result jsonb;
  v_retry jsonb;
  v_rechazo jsonb;
  v_payload jsonb;
  v_def text;
  v_close_event uuid;
  v_count bigint;
  v_security_definer boolean;
  v_config text[];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Regla pura: exige evidencia coincidente; el acumulado puede superar .09.
  ---------------------------------------------------------------------------
  IF to_regprocedure('app.es_redondeo_efectivo_legal_518(numeric,text,text,numeric)') IS NULL
     OR to_regprocedure('app.cierre_caja_requiere_supervisor_518(numeric,numeric,text,text,numeric)') IS NULL
     OR to_regprocedure('app.pos_registrar_venta_atomic_tx_518(uuid,uuid,uuid,text,jsonb)') IS NULL
     OR to_regprocedure('app.resumen_redondeo_documentado_cierre_caja_518(uuid,uuid)') IS NULL
     OR to_regprocedure('public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('app.resolver_tolerancia_cierre_caja_518(uuid,uuid)') IS NULL
     OR to_regprocedure('public.resolver_tolerancia_cierre_caja_518(uuid,uuid)') IS NULL
     OR to_regprocedure('app.cerrar_caja_tx_518(uuid,uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_518: faltan funciones del contrato';
  END IF;

  IF app.cierre_caja_requiere_supervisor_518(-0.01, 0, 'PE', 'PEN', 0.01)
     OR app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'PE', 'PEN', 0.04)
     OR app.cierre_caja_requiere_supervisor_518(-0.13, 0, 'PER', 'PEN', 0.13) THEN
    RAISE EXCEPTION 'VERIFY_518: el redondeo legal sigue exigiendo supervisor';
  END IF;
  IF NOT app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'PE', 'PEN', 0)
     OR NOT app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'PE', 'PEN', 0.03)
     OR NOT app.cierre_caja_requiere_supervisor_518(0.04, 0, 'PE', 'PEN', 0.04)
     OR NOT app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'AR', 'ARS', 0.04)
     OR NOT app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'CO', 'COP', 0.04)
     OR NOT app.cierre_caja_requiere_supervisor_518(-0.04, 0, 'PE', 'USD', 0.04) THEN
    RAISE EXCEPTION 'VERIFY_518: diferencia casual/sobrante/otro país/moneda fue perdonada';
  END IF;
  IF app.cierre_caja_requiere_supervisor_518(2, 2, 'AR', 'ARS', 0)
     OR app.cierre_caja_requiere_supervisor_518(-2, 2, 'CO', 'COP', 0)
     OR NOT app.cierre_caja_requiere_supervisor_518(2.01, 2, 'PE', 'PEN', 0) THEN
    RAISE EXCEPTION 'VERIFY_518: tolerancia configurable rota';
  END IF;
  IF app.pos_intencion_comercial_469('{}'::jsonb)
       IS DISTINCT FROM app.pos_intencion_comercial_469(
         '{"redondeo_efectivo_legal":false}'::jsonb)
     OR app.pos_intencion_comercial_469('{}'::jsonb)
       IS NOT DISTINCT FROM app.pos_intencion_comercial_469(
         '{"redondeo_efectivo_legal":true}'::jsonb) THEN
    RAISE EXCEPTION 'VERIFY_518: compatibilidad de huella comercial pre-518 rota';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Fixture local y precedencia específica > global.
  ---------------------------------------------------------------------------
  UPDATE app.deployment_environment
  SET environment = 'DEV', project_ref = 'localcashverifyxxxxx',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY CASH CLOSE 518', 1, 'PE') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  UPDATE public.tenants SET pais = 'PE' WHERE id = v_tenant;
  UPDATE public.empresa_config
  SET pais = 'PE', moneda_defecto = 'PEN', ruc = '20600000518',
      razon_social = 'Empresa verify cierre 518'
  WHERE tenant_id = v_tenant;

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, email, nombre, password_hash, estado, activo
  ) VALUES
    (v_supervisor, v_tenant, 'supervisor-518@verify.local', 'Supervisor 518', 'x', 'ACTIVO', true),
    (v_sin_rol, v_tenant, 'sin-rol-518@verify.local', 'Sin rol 518', 'x', 'ACTIVO', true);

  SELECT id INTO v_rol_supervisor FROM public.roles
  WHERE tenant_id = v_tenant AND upper(btrim(nombre)) = 'SUPERVISOR'
  ORDER BY id LIMIT 1;
  IF v_rol_supervisor IS NULL THEN
    INSERT INTO public.roles (tenant_id, nombre, descripcion, activo)
    VALUES (v_tenant, 'SUPERVISOR', 'Rol verify 518', true)
    RETURNING id INTO v_rol_supervisor;
  END IF;
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  VALUES (v_supervisor, v_rol_supervisor, v_tenant)
  ON CONFLICT DO NOTHING;
  BEGIN
    PERFORM public.registrar_pin_supervisor_caja_tx_518(
      v_tenant, v_sin_rol, v_supervisor, '481590', 'pin-unauthorized-518'
    );
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_USERS_MANAGE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_result := public.registrar_pin_supervisor_caja_tx_518(
    v_tenant, v_actor, v_supervisor, '481590', 'pin-supervisor-518'
  );
  IF (v_result->>'supervisor_id')::uuid <> v_supervisor
     OR (v_result->>'pin_version')::integer <> 1
     OR v_result ? 'pin' OR v_result ? 'hash_pin'
     OR EXISTS (
       SELECT 1 FROM public.supervisor_pins sp
       WHERE sp.tenant_id = v_tenant AND sp.usuario_id = v_supervisor
         AND (sp.hash_pin = '481590' OR sp.hash_pin NOT LIKE '$2%')
     ) THEN
    RAISE EXCEPTION 'VERIFY_518: alta PIN no es segura %', v_result;
  END IF;
  v_retry := public.registrar_pin_supervisor_caja_tx_518(
    v_tenant, v_actor, v_supervisor, '481590', 'pin-supervisor-518'
  );
  IF coalesce((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_retry->>'pin_version')::integer <> 1
     OR (SELECT count(*) FROM public.supervisor_pins sp
         WHERE sp.tenant_id = v_tenant AND sp.usuario_id = v_supervisor) <> 1
     OR (SELECT count(*) FROM public.supervisor_pin_rotaciones_518 op
         WHERE op.tenant_id = v_tenant
           AND op.idempotency_key = 'pin-supervisor-518') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: retry de rotación PIN duplicó la versión %', v_retry;
  END IF;
  BEGIN
    PERFORM public.registrar_pin_supervisor_caja_tx_518(
      v_tenant, v_actor, v_supervisor, '846209', 'pin-supervisor-518'
    );
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_PIN_IDEMPOTENCY_MISMATCH';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.supervisor_pin_rotaciones_518
    SET resultado = resultado || '{"alterado":true}'::jsonb
    WHERE tenant_id = v_tenant AND idempotency_key = 'pin-supervisor-518';
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_PIN_OPERATION_IMMUTABLE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- El actor demo también es administrador/supervisor; se le registra PIN para
  -- demostrar que el selector lo excluye aunque tenga credencial válida.
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id)
  VALUES (v_actor, v_rol_supervisor, v_tenant)
  ON CONFLICT DO NOTHING;
  PERFORM public.registrar_pin_supervisor_caja_tx_518(
    v_tenant, v_actor, v_actor, '864209', 'pin-actor-518'
  );
  PERFORM public.registrar_pin_supervisor_tx(v_tenant, v_actor, v_sin_rol, '736284');

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (v_tenant, 'ALM-518', 'Almacén 518', 'ACTIVO', true, true, 'PE')
  RETURNING id INTO v_almacen;
  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (v_tenant, 'CAJA-518', 'Caja 518', 'ACTIVO', v_almacen, 'MOSTRADOR', v_actor)
  RETURNING id INTO v_caja;
  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (v_tenant, 'CAJA-518-B', 'Caja 518 B', 'ACTIVO', v_almacen, 'MOSTRADOR', v_actor)
  RETURNING id INTO v_otra_caja;

  SELECT id INTO v_metodo_efectivo
  FROM public.metodos_pago
  WHERE tenant_id IS NULL AND lower(btrim(codigo)) = 'efectivo'
    AND upper(coalesce(tipo, '')) = 'EFECTIVO'
  ORDER BY id LIMIT 1;
  INSERT INTO public.productos (
    id, tenant_id, codigo, nombre, estado, activo, es_servicio,
    controla_stock, precio, precio_venta, precio_unitario, precio_compra,
    costo, stock_actual, stock, stock_reservado, unidad_medida,
    afectacion_igv, impuesto
  ) VALUES (
    v_producto, v_tenant, 'PROD-518', 'Servicio redondeo 518', 'ACTIVO', true,
    true, false, 8.51, 8.51, 8.51, 1, 1, 0, 0, 0, 'ZZ', '10', 18
  );

  DELETE FROM public.configuracion_caja WHERE tenant_id = v_tenant;
  INSERT INTO public.configuracion_caja (
    tenant_id, caja_id, tolerancia_diferencia_cierre, estado, activo, updated_by
  ) VALUES
    (v_tenant, NULL, 2, 'ACTIVO', true, v_actor),
    (v_tenant, v_caja, 1, 'ACTIVO', true, v_actor),
    (v_tenant, v_otra_caja, 9, 'ACTIVO', true, v_actor);

  IF app.resolver_tolerancia_cierre_caja_518(v_tenant, v_caja) <> 1
     OR public.resolver_tolerancia_cierre_caja_518(v_tenant, v_caja) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: específica no ganó a global';
  END IF;
  UPDATE public.configuracion_caja SET activo = false, estado = 'INACTIVO'
  WHERE tenant_id = v_tenant AND caja_id = v_caja;
  IF app.resolver_tolerancia_cierre_caja_518(v_tenant, v_caja) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_518: específica inactiva no cayó a global';
  END IF;
  UPDATE public.configuracion_caja SET activo = false, estado = 'INACTIVO'
  WHERE tenant_id = v_tenant AND caja_id IS NULL;
  IF app.resolver_tolerancia_cierre_caja_518(v_tenant, v_caja) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_518: sin fila activa no cayó a cero';
  END IF;
  UPDATE public.configuracion_caja
  SET activo = true, estado = 'ACTIVO', tolerancia_diferencia_cierre = 0
  WHERE tenant_id = v_tenant AND (caja_id = v_caja OR caja_id IS NULL);
  IF app.resolver_tolerancia_cierre_caja_518(v_tenant, v_caja) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_518: múltiples filas/otra caja alteraron precedencia';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Sin evidencia no hay perdón; tres ventas documentadas acumulan .11.
  ---------------------------------------------------------------------------
  SELECT (public.abrir_caja_tx(v_tenant, v_caja, v_actor, jsonb_build_object(
    'cajero_id', v_actor, 'monto_inicio', 203.84, 'moneda', 'PEN',
    'dispositivo', 'TERM-518-SIN-EVIDENCIA', 'denominaciones_apertura', '{}'::jsonb
  ))->>'id')::uuid INTO v_sesion_sin_evidencia;
  UPDATE public.supervisor_pins
  SET estado = 'BLOQUEADO', activo = false,
      bloqueado_hasta = now() + interval '5 minutes'
  WHERE tenant_id = v_tenant AND usuario_id = v_supervisor
    AND lower(estado::text) = 'activo';
  IF EXISTS (
    SELECT 1
    FROM public.listar_supervisores_autorizados_caja_518(
      v_tenant, v_actor, v_sesion_sin_evidencia
    ) s
    WHERE s.id = v_supervisor
  ) THEN
    RAISE EXCEPTION 'VERIFY_518: selector expuso supervisor con bloqueo vigente';
  END IF;
  UPDATE public.supervisor_pins
  SET bloqueado_hasta = now() - interval '1 second'
  WHERE tenant_id = v_tenant AND usuario_id = v_supervisor
    AND lower(estado::text) = 'bloqueado';
  IF NOT EXISTS (
    SELECT 1
    FROM public.listar_supervisores_autorizados_caja_518(
      v_tenant, v_actor, v_sesion_sin_evidencia
    ) s
    WHERE s.id = v_supervisor
  ) THEN
    RAISE EXCEPTION 'VERIFY_518: selector no reactivó bloqueo vencido; pin=%',
      (SELECT to_jsonb(sp) FROM public.supervisor_pins sp
       WHERE sp.tenant_id = v_tenant AND sp.usuario_id = v_supervisor
       ORDER BY sp.pin_version DESC LIMIT 1);
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.listar_supervisores_autorizados_caja_518(
      v_tenant, v_actor, v_sesion_sin_evidencia
    ) s
    WHERE s.id = v_actor
  ) THEN
    RAISE EXCEPTION 'VERIFY_518: selector expuso actor/cajero responsable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.supervisor_pins sp
    WHERE sp.tenant_id = v_tenant AND sp.usuario_id = v_supervisor
      AND (lower(sp.estado::text) <> 'activo' OR NOT sp.activo
           OR sp.bloqueado_hasta IS NOT NULL OR sp.intentos_fallidos <> 0)
  ) THEN
    RAISE EXCEPTION 'VERIFY_518: reactivación no normalizó la credencial';
  END IF;
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_sin_evidencia, v_actor,
      jsonb_build_object('monto_contado', 203.80, 'denominaciones', '{}'::jsonb));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_UNDOCUMENTED_DIFFERENCE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT estado FROM public.sesiones_caja WHERE id = v_sesion_sin_evidencia)
       <> 'ABIERTA' THEN
    RAISE EXCEPTION 'VERIFY_518: diferencia casual cerró la sesión';
  END IF;
  v_result := public.cerrar_caja_tx(
    v_tenant, v_sesion_sin_evidencia, v_actor,
    jsonb_build_object('monto_contado', 203.80, 'denominaciones', '{}'::jsonb,
      'supervisor_id', v_supervisor, 'codigo_autorizacion', '481590')
  );
  IF v_result->>'tipo_diferencia' <> 'FALTANTE'
     OR coalesce((v_result->>'redondeo_efectivo_legal')::boolean, false) THEN
    RAISE EXCEPTION 'VERIFY_518: diferencia casual fue reclasificada %', v_result;
  END IF;

  SELECT (public.abrir_caja_tx(v_tenant, v_caja, v_actor, jsonb_build_object(
    'cajero_id', v_actor, 'monto_inicio', 200, 'moneda', 'PEN',
    'dispositivo', 'TERM-518-A', 'denominaciones_apertura', '{}'::jsonb
  ))->>'id')::uuid INTO v_sesion_redondeo;

  v_result := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion_redondeo, 'rounding-sale-518-a',
    jsonb_build_object(
      'emitir_cpe', false, 'redondeo_efectivo_legal', true,
      'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 518',
      'moneda', 'PEN', 'ticket_serie', 'T518',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto, 'cantidad', 1,
        'precio_unitario', 8.51, 'precio_original', 8.51,
        'descuento_monto', 0, 'subtotal', 8.51, 'igv', 1.53)),
      'pagos', jsonb_build_array(jsonb_build_object(
        'metodo_pago_id', v_metodo_efectivo, 'codigo', 'efectivo',
        'monto', 10.00, 'moneda', 'PEN'))
    )
  );
  IF coalesce((v_result->>'redondeo_efectivo_legal')::boolean, false) IS NOT TRUE
     OR (v_result->>'total')::numeric <> 10.04
     OR (v_result->>'monto_efectivo_cobrado')::numeric <> 10.00
     OR (v_result->>'monto_ajuste_redondeo')::numeric <> 0.04 THEN
    RAISE EXCEPTION 'VERIFY_518: primera venta no documentó ajuste %', v_result;
  END IF;

  v_retry := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion_redondeo, 'rounding-sale-518-a',
    jsonb_build_object(
      'emitir_cpe', false, 'redondeo_efectivo_legal', true,
      'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 518',
      'moneda', 'PEN', 'ticket_serie', 'T518',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto, 'cantidad', 1,
        'precio_unitario', 8.51, 'precio_original', 8.51,
        'descuento_monto', 0, 'subtotal', 8.51, 'igv', 1.53)),
      'pagos', jsonb_build_array(jsonb_build_object(
        'metodo_pago_id', v_metodo_efectivo, 'codigo', 'efectivo',
        'monto', 10.00, 'moneda', 'PEN'))
    )
  );
  IF coalesce((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_retry->>'monto_ajuste_redondeo')::numeric <> 0.04
     OR (SELECT count(*) FROM public.ajustes_redondeo_efectivo_pos a
         WHERE a.tenant_id = v_tenant
           AND a.sesion_caja_id = v_sesion_redondeo) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: replay POS duplicó o perdió evidencia %', v_retry;
  END IF;

  UPDATE public.productos
  SET precio = 8.50, precio_venta = 8.50, precio_unitario = 8.50,
      updated_at = now()
  WHERE id = v_producto AND tenant_id = v_tenant;
  v_result := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion_redondeo, 'rounding-sale-518-b',
    jsonb_build_object(
      'emitir_cpe', false, 'redondeo_efectivo_legal', true,
      'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 518',
      'moneda', 'PEN', 'ticket_serie', 'T518',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto, 'cantidad', 1,
        'precio_unitario', 8.50, 'precio_original', 8.50,
        'descuento_monto', 0, 'subtotal', 8.50, 'igv', 1.53)),
      'pagos', jsonb_build_array(jsonb_build_object(
        'metodo_pago_id', v_metodo_efectivo, 'codigo', 'efectivo',
        'monto', 10.00, 'moneda', 'PEN'))
    )
  );
  IF (v_result->>'total')::numeric <> 10.03
     OR (v_result->>'monto_ajuste_redondeo')::numeric <> 0.03 THEN
    RAISE EXCEPTION 'VERIFY_518: segunda venta no documentó ajuste %', v_result;
  END IF;

  IF (SELECT count(*) FROM public.ajustes_redondeo_efectivo_pos a
      WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_redondeo) <> 2
     OR (SELECT round(sum(a.monto_ajuste), 2)
         FROM public.ajustes_redondeo_efectivo_pos a
         WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_redondeo) <> 0.07
     OR EXISTS (
       SELECT 1 FROM public.ajustes_redondeo_efectivo_pos a
       LEFT JOIN public.ventas_pos v ON v.id = a.venta_pos_id AND v.tenant_id = a.tenant_id
       LEFT JOIN public.ventas_pos_pagos p ON p.id = a.pago_pos_id AND p.tenant_id = a.tenant_id
       LEFT JOIN public.movimientos_caja m ON m.id = a.movimiento_caja_id AND m.tenant_id = a.tenant_id
       WHERE a.tenant_id = v_tenant AND (v.id IS NULL OR p.id IS NULL OR m.id IS NULL
         OR v.sesion_caja_id <> a.sesion_caja_id OR m.sesion_caja_id <> a.sesion_caja_id
         OR upper(p.metodo_pago_tipo) <> 'EFECTIVO'
         OR a.evidencia_fingerprint !~ '^[0-9a-f]{64}$')
     ) THEN
    RAISE EXCEPTION 'VERIFY_518: ledger de ajustes acumulados inconsistente';
  END IF;

  BEGIN
    UPDATE public.ajustes_redondeo_efectivo_pos SET monto_ajuste = 0.01
    WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_redondeo;
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_IMMUTABLE_UPDATE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.ajustes_redondeo_efectivo_pos
    WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_redondeo;
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_IMMUTABLE_DELETE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.pos_registrar_venta_atomic_tx(
      v_tenant, v_actor, v_sesion_redondeo, 'rounding-sale-518-invalid',
      jsonb_build_object(
        'emitir_cpe', false, 'redondeo_efectivo_legal', true,
        'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 518',
        'moneda', 'PEN', 'ticket_serie', 'T518',
        'items', jsonb_build_array(jsonb_build_object(
          'producto_id', v_producto, 'cantidad', 1,
          'precio_unitario', 8.50, 'precio_original', 8.50,
          'descuento_monto', 0, 'subtotal', 8.50, 'igv', 1.53)),
        'pagos', jsonb_build_array(jsonb_build_object(
          'metodo_pago_id', v_metodo_efectivo, 'codigo', 'efectivo',
          'monto', 9.90, 'moneda', 'PEN'))
      )
    );
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_PER_SALE_LIMIT_REJECTION';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.ventas_pos v
      WHERE v.tenant_id = v_tenant AND v.idempotency_key = 'rounding-sale-518-invalid') <> 0
     OR (SELECT count(*) FROM public.ajustes_redondeo_efectivo_pos a
         WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_redondeo) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_518: rechazo de ajuste inválido dejó impactos parciales';
  END IF;

  -- Un total menor a S/ 0,10 puede redondearse legalmente a cero. El writer
  -- interno recibe el total contable, mientras el ledger conserva efectivo=0.
  UPDATE public.productos
  SET precio = 0.03, precio_venta = 0.03, precio_unitario = 0.03,
      updated_at = now()
  WHERE id = v_producto AND tenant_id = v_tenant;
  v_result := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion_redondeo, 'rounding-sale-518-zero',
    jsonb_build_object(
      'emitir_cpe', false, 'redondeo_efectivo_legal', true,
      'cliente_documento', '12345678', 'cliente_nombre', 'Cliente 518',
      'moneda', 'PEN', 'ticket_serie', 'T518',
      'items', jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto, 'cantidad', 1,
        'precio_unitario', 0.03, 'precio_original', 0.03,
        'descuento_monto', 0, 'subtotal', 0.03, 'igv', 0.01)),
      'pagos', jsonb_build_array(jsonb_build_object(
        'metodo_pago_id', v_metodo_efectivo, 'codigo', 'efectivo',
        'monto', 0, 'moneda', 'PEN'))
    )
  );
  IF (v_result->>'total')::numeric <> 0.04
     OR (v_result->>'monto_efectivo_cobrado')::numeric <> 0
     OR (v_result->>'monto_ajuste_redondeo')::numeric <> 0.04
     OR (SELECT count(*) FROM public.ajustes_redondeo_efectivo_pos a
         WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_redondeo) <> 3
     OR (SELECT round(sum(a.monto_ajuste), 2)
         FROM public.ajustes_redondeo_efectivo_pos a
         WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_redondeo) <> 0.11 THEN
    RAISE EXCEPTION 'VERIFY_518: total sub-S/0.10 no quedó documentado %', v_result;
  END IF;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion_redondeo, v_actor,
    jsonb_build_object('monto_contado', 220.00, 'denominaciones', '{}'::jsonb,
      'notas', 'Arqueo con redondeo legal 518')) INTO v_result;
  v_close_event := (v_result->>'close_event_id')::uuid;
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR v_result->>'estado' <> 'CERRADA'
     OR (v_result->>'diferencia')::numeric <> -0.11
     OR v_result->>'tipo_diferencia' <> 'REDONDEO_EFECTIVO_LEGAL'
     OR coalesce((v_result->>'redondeo_efectivo_legal')::boolean, false) IS NOT TRUE
     OR (v_result->>'redondeo_efectivo_documentado')::numeric <> 0.11
     OR (v_result->>'redondeo_efectivo_cantidad')::integer <> 3
     OR v_result->>'supervisor_id' IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_518: cierre legal real inválido %', v_result;
  END IF;

  SELECT payload INTO v_payload FROM public.outbox_events
  WHERE tenant_id = v_tenant AND event_id = v_close_event;
  IF v_payload->>'tipoDiferencia' <> 'REDONDEO_EFECTIVO_LEGAL'
     OR coalesce((v_payload->>'redondeoEfectivoLegal')::boolean, false) IS NOT TRUE
     OR (v_payload->>'diferencia')::numeric <> -0.11
     OR (v_payload->>'redondeoEfectivoDocumentado')::numeric <> 0.11
     OR (v_payload->>'redondeoEfectivoCantidad')::integer <> 3
     OR (v_payload->>'schemaVersion')::integer <> 518 THEN
    RAISE EXCEPTION 'VERIFY_518: outbox no congeló clase contable %', v_payload;
  END IF;
  IF (SELECT count(*) FROM public.cortes_caja
      WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_redondeo) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'caja.cerrada'
           AND aggregate_id = v_sesion_redondeo::text) <> 1
     OR EXISTS (SELECT 1 FROM public.autorizaciones_caja
                WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_redondeo)
     OR NOT public.verificar_integridad_caja(v_tenant, v_sesion_redondeo, v_actor) THEN
    RAISE EXCEPTION 'VERIFY_518: postcondiciones del cierre legal inválidas';
  END IF;

  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_redondeo, v_sin_rol,
      jsonb_build_object('monto_contado', 220.00, 'denominaciones', '{}'::jsonb,
        'notas', 'Arqueo con redondeo legal 518'));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_REPLAY_ACTOR_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion_redondeo, v_actor,
    jsonb_build_object('monto_contado', 220.00, 'denominaciones', '{}'::jsonb,
      'notas', 'Arqueo con redondeo legal 518')) INTO v_retry;
  IF coalesce((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_retry->>'close_event_id')::uuid <> v_close_event
     OR (SELECT count(*) FROM public.cortes_caja
         WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_redondeo) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'caja.cerrada'
           AND aggregate_id = v_sesion_redondeo::text) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: replay duplicó efectos %', v_retry;
  END IF;
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_redondeo, v_actor,
      jsonb_build_object('monto_contado', 219.90, 'denominaciones', '{}'::jsonb));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_PAYLOAD_MISMATCH';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  ---------------------------------------------------------------------------
  -- 4. -0.10 exige otro actor, rol y PIN; evidencia durable no revela PIN.
  ---------------------------------------------------------------------------
  SELECT (public.abrir_caja_tx(v_tenant, v_otra_caja, v_actor, jsonb_build_object(
    'cajero_id', v_supervisor, 'monto_inicio', 100, 'moneda', 'PEN',
    'dispositivo', 'TERM-518-CAJERO-SUP', 'denominaciones_apertura', '{}'::jsonb
  ))->>'id')::uuid INTO v_sesion_cajero_supervisor;
  BEGIN
    PERFORM public.cerrar_caja_tx(
      v_tenant, v_sesion_cajero_supervisor, v_actor,
      jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
        'supervisor_id', v_supervisor, 'codigo_autorizacion', '481590')
    );
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_CASHIER_AUTHORIZATION_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT estado FROM public.sesiones_caja WHERE id = v_sesion_cajero_supervisor)
       <> 'ABIERTA' THEN
    RAISE EXCEPTION 'VERIFY_518: el cajero responsable se autoautorizó';
  END IF;

  SELECT (public.abrir_caja_tx(v_tenant, v_caja, v_actor, jsonb_build_object(
    'cajero_id', v_actor, 'monto_inicio', 100, 'moneda', 'PEN',
    'dispositivo', 'TERM-518-B', 'denominaciones_apertura', '{}'::jsonb
  ))->>'id')::uuid INTO v_sesion_supervisor;

  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
      jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_SUPERVISOR_REQUIRED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
      jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
        'supervisor_id', v_actor, 'codigo_autorizacion', '481590'));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_SELF_AUTHORIZATION_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
      jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
        'supervisor_id', v_sin_rol, 'codigo_autorizacion', '736284'));
    RAISE EXCEPTION 'VERIFY_518_EXPECTED_ROLE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
    jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
      'supervisor_id', v_supervisor, 'codigo_autorizacion', '999111'))
  INTO v_rechazo;
  IF coalesce((v_rechazo->>'success')::boolean, true) IS NOT FALSE
     OR v_rechazo->>'error_code' <> 'SUPERVISOR_PIN_INVALID'
     OR (SELECT estado FROM public.sesiones_caja WHERE id = v_sesion_supervisor) <> 'ABIERTA'
     OR (SELECT intentos_fallidos FROM public.supervisor_pins
         WHERE tenant_id = v_tenant AND usuario_id = v_supervisor
           AND lower(estado::text) IN ('activo', 'bloqueado')) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: PIN erróneo autorizó/cerró/no contó %', v_rechazo;
  END IF;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
    jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
      'notas', 'Diferencia autorizada 518', 'supervisor_id', v_supervisor,
      'codigo_autorizacion', '481590')) INTO v_result;
  v_close_event := (v_result->>'close_event_id')::uuid;
  IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
     OR v_result->>'tipo_diferencia' <> 'FALTANTE'
     OR (v_result->>'supervisor_id')::uuid <> v_supervisor
     OR length(v_result->>'supervisor_authorization_fingerprint') <> 64
     OR (SELECT supervisor_cierre_id FROM public.sesiones_caja
         WHERE id = v_sesion_supervisor) <> v_supervisor THEN
    RAISE EXCEPTION 'VERIFY_518: autorización válida sin evidencia %', v_result;
  END IF;

  SELECT count(*) INTO v_count FROM public.autorizaciones_caja a
  WHERE a.tenant_id = v_tenant AND a.sesion_caja_id = v_sesion_supervisor
    AND a.supervisor_id = v_supervisor AND a.solicitante_id = v_actor
    AND a.tipo_autorizacion = 'CIERRE_DIFERENCIA_ALTA' AND a.estado = 'APROBADO'
    AND a.firma_digital = v_result->>'supervisor_authorization_fingerprint'
    AND a.metadata->>'close_fingerprint' = (
      SELECT close_fingerprint FROM public.sesiones_caja WHERE id = v_sesion_supervisor)
    AND a.metadata->>'pin_version' IS NOT NULL
    AND a.firma_digital <> '481590' AND a.metadata::text NOT LIKE '%481590%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: evidencia PIN/sesión/huella ausente o recuperable';
  END IF;
  SELECT payload INTO v_payload FROM public.outbox_events
  WHERE tenant_id = v_tenant AND event_id = v_close_event;
  IF v_payload->>'supervisorAuthorizationFingerprint'
       <> v_result->>'supervisor_authorization_fingerprint'
     OR (v_payload->>'supervisorId')::uuid <> v_supervisor THEN
    RAISE EXCEPTION 'VERIFY_518: outbox perdió evidencia %', v_payload;
  END IF;

  SELECT public.cerrar_caja_tx(v_tenant, v_sesion_supervisor, v_actor,
    jsonb_build_object('monto_contado', 99.90, 'denominaciones', '{}'::jsonb,
      'notas', 'Diferencia autorizada 518', 'supervisor_id', v_supervisor,
      'codigo_autorizacion', '481590')) INTO v_retry;
  IF coalesce((v_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.cortes_caja
         WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_supervisor) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_type = 'caja.cerrada'
           AND aggregate_id = v_sesion_supervisor::text) <> 1
     OR (SELECT count(*) FROM public.autorizaciones_caja
         WHERE tenant_id = v_tenant AND sesion_caja_id = v_sesion_supervisor) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_518: replay supervisor duplicó efectos %', v_retry;
  END IF;

  ---------------------------------------------------------------------------
  -- 5. Locks, atributos, RLS y ACL.
  ---------------------------------------------------------------------------
  SELECT pg_get_functiondef('public.cerrar_caja_tx(uuid,uuid,uuid,jsonb)'::regprocedure)
  INTO v_def;
  IF v_def !~ 'app[.]cerrar_caja_tx_518' THEN
    RAISE EXCEPTION 'VERIFY_518: wrapper no apunta a 518';
  END IF;
  SELECT pg_get_functiondef('app.cerrar_caja_tx_518(uuid,uuid,uuid,jsonb)'::regprocedure)
  INTO v_def;
  IF v_def !~ 'FOR UPDATE'
     OR v_def !~ 'resolver_tolerancia_cierre_caja_518'
     OR v_def !~ 'verificar_pin_supervisor_tx'
     OR v_def !~ 'CASH_CLOSE_SELF_AUTHORIZATION_FORBIDDEN'
     OR v_def !~ 'CASH_CLOSE_CASHIER_AUTHORIZATION_FORBIDDEN'
     OR v_def !~ 'CASH_CLOSE_REPLAY_ACTOR_MISMATCH'
     OR v_def !~ '''actor_id'', p_actor_id'
     OR v_def !~ 'cash_actor_is_supervisor_474'
     OR v_def !~ 'FOR UPDATE OF ur, r'
     OR v_def !~ 'resumen_redondeo_documentado_cierre_caja_518'
     OR v_def !~ 'INSERT INTO public[.]autorizaciones_caja'
     OR v_def !~ 'supervisorAuthorizationFingerprint'
     OR v_def !~ 'redondeoEfectivoLegal'
     OR v_def !~ 'REDONDEO_EFECTIVO_LEGAL'
     OR v_def !~ 'schemaVersion.*, 518' THEN
    RAISE EXCEPTION 'VERIFY_518: writer perdió lock/autorización/evidencia/clase';
  END IF;
  SELECT pg_get_functiondef(
    'public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_def;
  IF v_def !~ 'app[.]pos_registrar_venta_atomic_tx_518' THEN
    RAISE EXCEPTION 'VERIFY_518: dispatcher POS no apunta al writer de evidencia';
  END IF;
  SELECT pg_get_functiondef(
    'app.pos_registrar_venta_atomic_tx_518(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_def;
  IF v_def !~ 'ajustes_redondeo_efectivo_pos'
     OR v_def !~ 'POS_CASH_ROUNDING_REQUIRES_CASH_ONLY'
     OR v_def !~ 'v_ajuste NOT BETWEEN 0[.]01 AND 0[.]09'
     OR v_def !~ 'pg_advisory_xact_lock'
     OR v_def !~ 'pos[.]sale:'
     OR v_def !~ 'FOR UPDATE' THEN
    RAISE EXCEPTION 'VERIFY_518: writer POS perdió evidencia/límite/lock';
  END IF;
  SELECT pg_get_functiondef(
    'app.resolver_tolerancia_cierre_caja_518(uuid,uuid)'::regprocedure) INTO v_def;
  IF v_def !~ 'NULLS LAST' OR v_def !~ 'cc[.]id DESC'
     OR v_def !~ 'cc[.]caja_id = p_caja_id' OR v_def !~ 'cc[.]caja_id IS NULL' THEN
    RAISE EXCEPTION 'VERIFY_518: resolver no es determinista';
  END IF;
  SELECT pg_get_functiondef(
    'public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)'::regprocedure
  ) INTO v_def;
  IF v_def !~ 'supervisor_pin_rotaciones_518'
     OR v_def !~ 'pg_advisory_xact_lock'
     OR v_def !~ 'FOR UPDATE OF ur, r'
     OR v_def !~ 'FOR UPDATE OF rp, p'
     OR v_def !~ 'assert_admin_actor_462'
     OR v_def !~ 'SUPERVISOR_PIN_IDEMPOTENCY_MISMATCH' THEN
    RAISE EXCEPTION 'VERIFY_518: rotación PIN perdió idempotencia/locks/RBAC';
  END IF;
  SELECT pg_get_functiondef(
    'public.listar_supervisores_autorizados_caja_518(uuid,uuid,uuid)'::regprocedure
  ) INTO v_def;
  IF v_def !~ 'u[.]id <> p_actor_id'
     OR v_def !~ 'u[.]id IS DISTINCT FROM v_cajero_id'
     OR v_def !~ 'reactivar_bloqueos_supervisor_vencidos_518' THEN
    RAISE EXCEPTION 'VERIFY_518: selector perdió exclusiones/reactivación';
  END IF;

  SELECT p.prosecdef, p.proconfig INTO v_security_definer, v_config
  FROM pg_proc p
  WHERE p.oid = 'app.cerrar_caja_tx_518(uuid,uuid,uuid,jsonb)'::regprocedure;
  IF v_security_definer IS NOT TRUE
     OR array_to_string(v_config, ',') !~ 'search_path=pg_catalog' THEN
    RAISE EXCEPTION 'VERIFY_518: atributos seguros incorrectos';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'autorizaciones_caja'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'VERIFY_518: autorizaciones_caja sin RLS forzada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ajustes_redondeo_efectivo_pos'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR has_table_privilege('service_role', 'public.ajustes_redondeo_efectivo_pos', 'SELECT')
     OR has_table_privilege('service_role', 'public.ajustes_redondeo_efectivo_pos', 'INSERT')
     OR has_table_privilege('service_role', 'public.ajustes_redondeo_efectivo_pos', 'UPDATE')
     OR has_table_privilege('service_role', 'public.ajustes_redondeo_efectivo_pos', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_518: ledger de redondeo no es privado/RLS forzado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'supervisor_pin_rotaciones_518'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR has_table_privilege('service_role', 'public.supervisor_pin_rotaciones_518', 'SELECT')
     OR has_table_privilege('service_role', 'public.supervisor_pin_rotaciones_518', 'INSERT')
     OR has_table_privilege('service_role', 'public.supervisor_pin_rotaciones_518', 'UPDATE')
     OR has_table_privilege('service_role', 'public.supervisor_pin_rotaciones_518', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_518: operaciones PIN no son privadas/RLS forzado';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'ajustes_redondeo_efectivo_pos',
        'supervisor_pin_rotaciones_518'
      )
      AND p.polname = 'service_only_no_direct_access_518'
      AND p.polcmd = '*'
      AND pg_get_expr(p.polqual, p.polrelid) = 'false'
      AND pg_get_expr(p.polwithcheck, p.polrelid) = 'false'
  ) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_518: tablas privadas sin política deny-all explícita';
  END IF;
  IF has_function_privilege('anon', 'public.cerrar_caja_tx(uuid,uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cerrar_caja_tx(uuid,uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.cerrar_caja_tx(uuid,uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.resolver_tolerancia_cierre_caja_518(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.resolver_tolerancia_cierre_caja_518(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.resolver_tolerancia_cierre_caja_518(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.resumen_redondeo_documentado_cierre_caja_518(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.listar_supervisores_autorizados_caja_518(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.registrar_pin_supervisor_caja_tx_518(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.registrar_pin_supervisor_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.cerrar_caja_tx_518(uuid,uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.resolver_tolerancia_cierre_caja_518(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.pos_registrar_venta_atomic_tx_518(uuid,uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_518: ACL incorrecta';
  END IF;

  RAISE NOTICE 'VERIFY_518 OK';
END;
$verify$;

ROLLBACK;
