\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 445 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END $$;

DO $$
DECLARE
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_empleado_id uuid;
  v_empleado_2_id uuid;
  v_planilla_id uuid := gen_random_uuid();
  v_rollback_planilla_id uuid := gen_random_uuid();
  v_detalle_id uuid;
  v_result jsonb;
  v_legacy_approval_event_id uuid := gen_random_uuid();
  v_approval_event_id uuid;
  v_payment_event_id uuid;
  v_fecha_pago timestamptz;
  v_count integer;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY RRHH 445', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;

  SELECT id INTO v_empleado_id
  FROM public.empleados
  WHERE tenant_id = v_tenant_id AND lower(estado::text) = 'activo'
  ORDER BY created_at, id
  LIMIT 1;
  IF v_empleado_id IS NULL THEN
    INSERT INTO public.empleados (
      tenant_id, nombre, nombres, apellidos, codigo, tipo_documento,
      numero_documento, estado, activo, fecha_ingreso, pais
    ) VALUES (
      v_tenant_id, 'Empleado Verify 445', 'Empleado', 'Verify 445',
      'EMP-VERIFY-445', 'DNI', '44544544', 'activo', true,
      current_date - 365, 'PE'
    ) RETURNING id INTO v_empleado_id;
  END IF;

  INSERT INTO public.empleados (
    tenant_id, nombre, nombres, apellidos, codigo, tipo_documento,
    numero_documento, estado, activo, fecha_ingreso, pais
  ) VALUES (
    v_tenant_id, 'Segundo Empleado Verify 445', 'Segundo', 'Verify 445',
    'EMP2-VERIFY-445', 'DNI', '44544545', 'activo', true,
    current_date - 300, 'PE'
  ) RETURNING id INTO v_empleado_2_id;

  INSERT INTO public.planillas (
    id, tenant_id, nombre, codigo, estado, estado_pago, periodo,
    total_ingresos, total_descuentos, total_aportes, total_neto,
    total_pagado, pais_codigo, moneda
  ) VALUES (
    v_planilla_id, v_tenant_id, 'Planilla Verify 445', 'PL-VERIFY-445',
    'borrador', 'pendiente', '2026-08', 0, 0, 0, 0, 0, 'PE', 'PEN'
  );

  SELECT public.guardar_calculo_planilla_tx(
    v_tenant_id,
    v_planilla_id,
    jsonb_build_array(
      jsonb_build_object(
        'empleado_id', v_empleado_id,
        'dias_trabajados', 30,
        'horas_extras_25', 0,
        'horas_extras_35', 0,
        'tardanzas_minutos', 0,
        'faltas', 0,
        'total_ingresos', 2000,
        'total_descuentos', 260,
        'total_aportes', 180,
        'neto_pagar', 1740,
        'conceptos', '[]'::jsonb
      ),
      jsonb_build_object(
        'empleado_id', v_empleado_2_id,
        'dias_trabajados', 30,
        'horas_extras_25', 0,
        'horas_extras_35', 0,
        'tardanzas_minutos', 0,
        'faltas', 0,
        'total_ingresos', 1000,
        'total_descuentos', 100,
        'total_aportes', 90,
        'neto_pagar', 900,
        'conceptos', '[]'::jsonb
      )
    )
  ) INTO v_result;

  SELECT id INTO v_detalle_id
  FROM public.empleado_planilla
  WHERE tenant_id = v_tenant_id AND planilla_id = v_planilla_id;

  IF lower((SELECT estado::text FROM public.planillas WHERE id = v_planilla_id)) <> 'calculada'
     OR lower(COALESCE((SELECT estado_pago FROM public.empleado_planilla WHERE id = v_detalle_id), '')) <> 'pendiente'
     OR (v_result->>'totalAportes')::numeric <> 270
     OR (SELECT count(*) FROM public.empleado_planilla
         WHERE tenant_id = v_tenant_id AND planilla_id = v_planilla_id) <> 2 THEN
    RAISE EXCEPTION 'El calculo no sincronizo cabecera/detalle/aportes: %', v_result;
  END IF;

  BEGIN
    PERFORM public.pagar_planilla_completa_tx(
      v_tenant_id, v_planilla_id, 'transferencia', v_user_id::text
    );
    RAISE EXCEPTION 'El pago desde CALCULADA debio fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El pago desde CALCULADA debio fallar' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.planillas SET estado = 'aprobada' WHERE id = v_planilla_id;
    RAISE EXCEPTION 'El update directo CALCULADA -> APROBADA debio fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El update directo CALCULADA -> APROBADA debio fallar' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.empleado_planilla
    SET estado_pago = 'pagado', fecha_pago = now(), metodo_pago = 'transferencia'
    WHERE id = v_detalle_id;
    RAISE EXCEPTION 'El pago directo del detalle debio fallar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El pago directo del detalle debio fallar' THEN RAISE; END IF;
  END;

  -- Compatibilidad: el generador legado usaba una clave con el periodo al final.
  -- La aprobación canónica debe reutilizarla por agregado, no duplicar el devengo.
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    v_tenant_id, 'planilla', v_planilla_id::text, 'planilla.liquidada',
    jsonb_build_object('legacy', true), 'pending', 0,
    format('planilla.liquidada:%s:%s:%s', v_tenant_id, v_planilla_id, '2026-08'),
    v_legacy_approval_event_id, now()
  );

  SELECT public.aprobar_planilla_tx(
    v_tenant_id, v_planilla_id, v_user_id::text
  ) INTO v_result;
  v_approval_event_id := (v_result->>'eventId')::uuid;

  BEGIN
    DELETE FROM public.planillas WHERE id = v_planilla_id;
    RAISE EXCEPTION 'Una planilla aprobada no debe poder eliminarse directamente';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Una planilla aprobada no debe poder eliminarse directamente' THEN RAISE; END IF;
  END;

  IF lower((SELECT estado::text FROM public.planillas WHERE id = v_planilla_id)) <> 'aprobada'
     OR v_approval_event_id IS DISTINCT FROM v_legacy_approval_event_id
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'planilla.liquidada'
           AND aggregate_id = v_planilla_id::text) <> 1
     OR (SELECT event_id FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'planilla.liquidada'
           AND aggregate_id = v_planilla_id::text) IS DISTINCT FROM v_approval_event_id
     OR (SELECT (payload->>'totalAportes')::numeric FROM public.outbox_events
         WHERE event_id = v_approval_event_id) <> 270
     OR NOT COALESCE((SELECT (payload->>'accountingHandledByOutbox')::boolean
                      FROM public.outbox_events WHERE event_id = v_approval_event_id), false)
     OR lower(COALESCE((SELECT asientos_generados FROM public.planillas
                        WHERE id = v_planilla_id), '')) <> 'false'
     OR NOT COALESCE((SELECT (metadata->>'accounting_handled_by_outbox')::boolean
                      FROM public.planillas WHERE id = v_planilla_id), false)
     OR EXISTS (SELECT 1 FROM public.asientos_contables
                WHERE tenant_id = v_tenant_id
                  AND referencia = format('PLANILLA-%s', v_planilla_id)) THEN
    RAISE EXCEPTION 'La aprobacion no dejo un unico devengo durable sin asiento sincrono: %', v_result;
  END IF;

  SELECT public.aprobar_planilla_tx(
    v_tenant_id, v_planilla_id, v_user_id::text
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (v_result->>'eventId')::uuid IS DISTINCT FROM v_approval_event_id
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'planilla.liquidada'
           AND aggregate_id = v_planilla_id::text) <> 1 THEN
    RAISE EXCEPTION 'El retry de aprobacion no fue idempotente: %', v_result;
  END IF;

  SELECT public.pagar_planilla_completa_tx(
    v_tenant_id, v_planilla_id, 'transferencia', v_user_id::text
  ) INTO v_result;
  v_payment_event_id := (v_result->>'eventId')::uuid;
  SELECT fecha_pago INTO v_fecha_pago FROM public.planillas WHERE id = v_planilla_id;

  IF lower((SELECT estado::text FROM public.planillas WHERE id = v_planilla_id)) <> 'pagada'
     OR lower((SELECT estado_pago::text FROM public.planillas WHERE id = v_planilla_id)) <> 'pagado'
     OR lower(COALESCE((SELECT metodo_pago FROM public.planillas WHERE id = v_planilla_id), '')) <> 'transferencia'
     OR (SELECT total_pagado FROM public.planillas WHERE id = v_planilla_id) <> 2640
     OR (SELECT count(*) FROM public.empleado_planilla
         WHERE tenant_id = v_tenant_id AND planilla_id = v_planilla_id
           AND lower(COALESCE(estado_pago, '')) = 'pagado') <> 2
     OR lower(COALESCE((SELECT metodo_pago FROM public.empleado_planilla WHERE id = v_detalle_id), '')) <> 'transferencia'
     OR (SELECT count(*) FROM public.pagos_empleados
         WHERE tenant_id = v_tenant_id AND planilla_id = v_planilla_id) <> 2
     OR (SELECT count(*) FROM public.rrhh_pagos
         WHERE tenant_id = v_tenant_id AND planilla_id = v_planilla_id) <> 2
     OR (SELECT count(*) FROM public.historial_pagos_planilla
         WHERE tenant_id = v_tenant_id AND planilla_id = v_planilla_id) <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'planilla.pagada'
           AND aggregate_id = v_planilla_id::text) <> 1
     OR (SELECT event_id FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'planilla.pagada'
           AND aggregate_id = v_planilla_id::text) IS DISTINCT FROM v_payment_event_id
     OR NULLIF((SELECT payload->>'paymentFingerprint' FROM public.outbox_events
                WHERE event_id = v_payment_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'El pago no sincronizo cabecera/detalle/proyecciones/outbox: %', v_result;
  END IF;

  SELECT public.pagar_planilla_completa_tx(
    v_tenant_id, v_planilla_id, 'transferencia', v_user_id::text
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (v_result->>'eventId')::uuid IS DISTINCT FROM v_payment_event_id
     OR (SELECT fecha_pago FROM public.planillas WHERE id = v_planilla_id) IS DISTINCT FROM v_fecha_pago
     OR (SELECT count(*) FROM public.pagos_empleados
         WHERE tenant_id = v_tenant_id AND planilla_id = v_planilla_id) <> 2
     OR (SELECT count(*) FROM public.rrhh_pagos
         WHERE tenant_id = v_tenant_id AND planilla_id = v_planilla_id) <> 2
     OR (SELECT count(*) FROM public.historial_pagos_planilla
         WHERE tenant_id = v_tenant_id AND planilla_id = v_planilla_id) <> 1 THEN
    RAISE EXCEPTION 'El retry de pago duplico o altero la operacion: %', v_result;
  END IF;

  BEGIN
    PERFORM public.pagar_planilla_completa_tx(
      v_tenant_id, v_planilla_id, 'efectivo', v_user_id::text
    );
    RAISE EXCEPTION 'El retry con metodo distinto debio fallar por fingerprint';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El retry con metodo distinto debio fallar por fingerprint' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.planillas SET metodo_pago = 'efectivo' WHERE id = v_planilla_id;
    RAISE EXCEPTION 'El metodo de una planilla pagada no debe mutar directamente';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'El metodo de una planilla pagada no debe mutar directamente' THEN RAISE; END IF;
  END;

  -- Una colision tardia del outbox sucede despues del UPSERT de pagos dentro
  -- de la funcion. La excepcion debe revertir tambien pagos y sincronizaciones.
  INSERT INTO public.planillas (
    id, tenant_id, nombre, codigo, estado, estado_pago, periodo,
    total_ingresos, total_descuentos, total_aportes, total_neto,
    total_pagado, pais_codigo, moneda
  ) VALUES (
    v_rollback_planilla_id, v_tenant_id, 'Planilla Rollback 445', 'PL-RB-445',
    'borrador', 'pendiente', '2026-09', 0, 0, 0, 0, 0, 'PE', 'PEN'
  );
  PERFORM public.guardar_calculo_planilla_tx(
    v_tenant_id,
    v_rollback_planilla_id,
    jsonb_build_array(jsonb_build_object(
      'empleado_id', v_empleado_id, 'dias_trabajados', 30,
      'horas_extras_25', 0, 'horas_extras_35', 0,
      'tardanzas_minutos', 0, 'faltas', 0,
      'total_ingresos', 1000, 'total_descuentos', 100,
      'total_aportes', 90, 'neto_pagar', 900, 'conceptos', '[]'::jsonb
    ))
  );
  PERFORM public.aprobar_planilla_tx(
    v_tenant_id, v_rollback_planilla_id, v_user_id::text
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    v_tenant_id, 'planilla', v_rollback_planilla_id::text, 'planilla.pagada',
    jsonb_build_object(
      'tenantId', v_tenant_id, 'planillaId', v_rollback_planilla_id,
      'metodoPago', 'efectivo', 'paymentFingerprint', 'conflicto-445'
    ),
    'pending', 0,
    format('planilla.pagada:%s:%s', v_tenant_id, v_rollback_planilla_id),
    gen_random_uuid(), now()
  );
  BEGIN
    PERFORM public.pagar_planilla_completa_tx(
      v_tenant_id, v_rollback_planilla_id, 'transferencia', v_user_id::text
    );
    RAISE EXCEPTION 'La colision tardia del outbox debio abortar el pago';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'La colision tardia del outbox debio abortar el pago' THEN RAISE; END IF;
  END;
  IF lower((SELECT estado::text FROM public.planillas
            WHERE id = v_rollback_planilla_id)) <> 'aprobada'
     OR EXISTS (SELECT 1 FROM public.pagos_empleados
                WHERE tenant_id = v_tenant_id AND planilla_id = v_rollback_planilla_id)
     OR EXISTS (SELECT 1 FROM public.rrhh_pagos
                WHERE tenant_id = v_tenant_id AND planilla_id = v_rollback_planilla_id)
     OR EXISTS (SELECT 1 FROM public.historial_pagos_planilla
                WHERE tenant_id = v_tenant_id AND planilla_id = v_rollback_planilla_id)
     OR EXISTS (SELECT 1 FROM public.empleado_planilla
                WHERE tenant_id = v_tenant_id AND planilla_id = v_rollback_planilla_id
                  AND lower(COALESCE(estado_pago, '')) <> 'pendiente') THEN
    RAISE EXCEPTION 'El fallo tardio dejo pagos o estados parciales';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgrelid IN ('public.planillas'::regclass, 'public.empleado_planilla'::regclass)
    AND tgname IN (
      'trg_zz_enforce_planilla_lifecycle_transition',
      'trg_zz_enforce_empleado_planilla_payment_transition'
    ) AND tgenabled <> 'D';
  IF v_count <> 2 OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.planillas'::regclass
      AND tgname = 'trg_zz_enforce_planilla_delete'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Faltan guards runtime de cabecera/detalle/borrado de planilla';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.aprobar_planilla_tx(uuid,uuid,text)'::regprocedure
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public, app, pg_temp']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.pagar_planilla_completa_tx(uuid,uuid,text,text)'::regprocedure
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public, app, pg_temp']::text[]
  ) THEN
    RAISE EXCEPTION 'Las RPC publicas no conservan SECURITY DEFINER/search_path endurecido';
  END IF;

  IF has_function_privilege('anon', 'public.aprobar_planilla_tx(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.aprobar_planilla_tx(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pagar_planilla_completa_tx(uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pagar_planilla_completa_tx(uuid,uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.aprobar_planilla_tx(uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.pagar_planilla_completa_tx(uuid,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL incorrecta: aprobar/pagar deben ser exclusivamente service_role';
  END IF;
END;
$$;

ROLLBACK;
