-- ============================================================================
-- 445__rrhh_payroll_lifecycle_atomic.sql
-- Cierra el ciclo de planilla en dos hitos contables durables:
--   CALCULADA -> APROBADA  : devengo planilla.liquidada
--   APROBADA  -> PAGADA    : pagos/proyecciones + planilla.pagada
-- Ambas operaciones bloquean la cabecera, son idempotentes y publican su
-- evento en la misma transaccion que cambia el estado operativo.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

-- La cabecera no puede saltarse el flujo mediante updates directos. Las RPC
-- autorizan una unica transicion identificando tambien la planilla objetivo.
CREATE OR REPLACE FUNCTION app.enforce_planilla_lifecycle_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old_estado text := lower(COALESCE(OLD.estado::text, ''));
  v_new_estado text := lower(COALESCE(NEW.estado::text, ''));
  v_transition text := COALESCE(current_setting('app.planilla_transition', true), '');
  v_expected text;
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'No se puede cambiar el tenant de una planilla'
      USING ERRCODE = '23514';
  END IF;

  IF v_old_estado IN ('calculada', 'aprobada', 'pagada')
     AND (
       OLD.periodo IS DISTINCT FROM NEW.periodo
       OR OLD.total_ingresos IS DISTINCT FROM NEW.total_ingresos
       OR OLD.total_descuentos IS DISTINCT FROM NEW.total_descuentos
       OR OLD.total_aportes IS DISTINCT FROM NEW.total_aportes
       OR OLD.total_neto IS DISTINCT FROM NEW.total_neto
     )
     AND v_transition NOT IN (
       format('aprobar:%s', OLD.id),
       format('pagar:%s', OLD.id)
     ) THEN
    RAISE EXCEPTION 'Los importes y periodo de una planilla % son inmutables desde CALCULADA', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF (
       OLD.estado_pago IS DISTINCT FROM NEW.estado_pago
       OR OLD.fecha_pago IS DISTINCT FROM NEW.fecha_pago
       OR OLD.metodo_pago IS DISTINCT FROM NEW.metodo_pago
       OR OLD.total_pagado IS DISTINCT FROM NEW.total_pagado
     )
     AND v_transition <> format('pagar:%s', OLD.id) THEN
    RAISE EXCEPTION 'El estado de pago de la planilla % solo cambia mediante el pago atomico', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF v_old_estado = v_new_estado THEN
    RETURN NEW;
  END IF;

  v_expected := CASE
    WHEN v_old_estado = 'borrador' AND v_new_estado = 'calculada'
      THEN format('calcular:%s', OLD.id)
    WHEN v_old_estado = 'calculada' AND v_new_estado = 'aprobada'
      THEN format('aprobar:%s', OLD.id)
    WHEN v_old_estado = 'aprobada' AND v_new_estado = 'pagada'
      THEN format('pagar:%s', OLD.id)
    ELSE NULL
  END;

  IF v_expected IS NULL OR v_transition <> v_expected THEN
    RAISE EXCEPTION 'Transicion de planilla no permitida: % -> %', v_old_estado, v_new_estado
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_zz_enforce_planilla_lifecycle_transition ON public.planillas;
CREATE TRIGGER trg_zz_enforce_planilla_lifecycle_transition
BEFORE UPDATE OF tenant_id, periodo, estado, estado_pago, fecha_pago, metodo_pago,
  total_ingresos, total_descuentos, total_aportes, total_neto, total_pagado
ON public.planillas
FOR EACH ROW
EXECUTE FUNCTION app.enforce_planilla_lifecycle_transition();

-- Una planilla calculada ya es evidencia laboral y una aprobada/pagada además
-- tiene eventos contables. No puede desaparecer por el DELETE genérico.
CREATE OR REPLACE FUNCTION app.enforce_planilla_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF lower(COALESCE(OLD.estado::text, '')) <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se puede eliminar una planilla en borrador; estado actual %', OLD.estado
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_zz_enforce_planilla_delete ON public.planillas;
CREATE TRIGGER trg_zz_enforce_planilla_delete
BEFORE DELETE ON public.planillas
FOR EACH ROW
EXECUTE FUNCTION app.enforce_planilla_delete();

-- El detalle no puede aparentar un pago que la cabecera no confirmo. La RPC de
-- pago habilita estas columnas para todas las filas dentro de su transaccion.
CREATE OR REPLACE FUNCTION app.enforce_empleado_planilla_payment_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_planilla_id uuid := COALESCE(NEW.planilla_id, app.to_uuid_or_null(NEW.id_planilla));
  v_transition text := COALESCE(current_setting('app.planilla_transition', true), '');
BEGIN
  IF (
       OLD.estado_pago IS DISTINCT FROM NEW.estado_pago
       OR OLD.fecha_pago IS DISTINCT FROM NEW.fecha_pago
       OR OLD.metodo_pago IS DISTINCT FROM NEW.metodo_pago
       OR OLD.numero_operacion IS DISTINCT FROM NEW.numero_operacion
       OR OLD.observaciones_pago IS DISTINCT FROM NEW.observaciones_pago
     )
     AND v_transition <> format('pagar:%s', v_planilla_id) THEN
    RAISE EXCEPTION 'El pago del empleado de planilla solo cambia mediante el pago atomico'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_zz_enforce_empleado_planilla_payment_transition
ON public.empleado_planilla;
CREATE TRIGGER trg_zz_enforce_empleado_planilla_payment_transition
BEFORE UPDATE OF estado_pago, fecha_pago, metodo_pago, numero_operacion, observaciones_pago
ON public.empleado_planilla
FOR EACH ROW
EXECUTE FUNCTION app.enforce_empleado_planilla_payment_transition();

-- Reemplaza la persistencia de calculo para autorizar exclusivamente la primera
-- transicion y dejar el detalle explicitamente pendiente.
CREATE OR REPLACE FUNCTION app.guardar_calculo_planilla_tx(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_empleados jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_planilla public.planillas%ROWTYPE;
  v_empleado jsonb;
  v_concepto jsonb;
  v_empleado_id uuid;
  v_empleado_planilla_id uuid;
  v_total_ingresos numeric(14,2) := 0;
  v_total_descuentos numeric(14,2) := 0;
  v_total_aportes numeric(14,2) := 0;
  v_total_neto numeric(14,2) := 0;
  v_count integer := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_planilla_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id y planilla_id son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_empleados) <> 'array' OR jsonb_array_length(p_empleados) = 0 THEN
    RAISE EXCEPTION 'La planilla requiere al menos un empleado' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_planilla
  FROM public.planillas
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planilla no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;
  IF lower(v_planilla.estado::text) <> 'borrador'
     OR lower(v_planilla.estado_pago::text) <> 'pendiente' THEN
    RAISE EXCEPTION 'La planilla no se puede calcular desde estado %/%',
      v_planilla.estado, v_planilla.estado_pago USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_empleados) item
    GROUP BY item->>'empleado_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'La solicitud contiene empleados duplicados' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_empleados) item
    LEFT JOIN public.empleados e
      ON e.id = app.to_uuid_or_null(item->>'empleado_id')
     AND e.tenant_id = p_tenant_id
     AND lower(e.estado::text) = 'activo'
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'La solicitud contiene empleados inexistentes, inactivos o de otro tenant'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.empleado_planilla_conceptos epc
  USING public.empleado_planilla ep
  WHERE epc.empleado_planilla_id = ep.id
    AND ep.planilla_id = p_planilla_id
    AND ep.tenant_id = p_tenant_id;
  DELETE FROM public.empleado_planilla
  WHERE planilla_id = p_planilla_id AND tenant_id = p_tenant_id;

  FOR v_empleado IN SELECT value FROM jsonb_array_elements(p_empleados)
  LOOP
    v_empleado_id := app.to_uuid_or_null(v_empleado->>'empleado_id');
    IF COALESCE((v_empleado->>'dias_trabajados')::integer, 0) NOT BETWEEN 0 AND 30
       OR COALESCE((v_empleado->>'horas_extras_25')::numeric, 0) < 0
       OR COALESCE((v_empleado->>'horas_extras_35')::numeric, 0) < 0
       OR COALESCE((v_empleado->>'tardanzas_minutos')::integer, 0) < 0
       OR COALESCE((v_empleado->>'faltas')::integer, 0) NOT BETWEEN 0 AND 30
       OR COALESCE((v_empleado->>'total_ingresos')::numeric, -1) < 0
       OR COALESCE((v_empleado->>'total_descuentos')::numeric, -1) < 0
       OR COALESCE((v_empleado->>'total_aportes')::numeric, -1) < 0
       OR COALESCE((v_empleado->>'neto_pagar')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Importes o cantidades invalidos para empleado %', v_empleado_id
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.empleado_planilla (
      tenant_id, planilla_id, empleado_id, id_planilla, id_empleado,
      dias_trabajados, horas_extras_25, horas_extras_35,
      tardanzas_minutos, faltas, total_ingresos, total_descuentos,
      total_aportes, neto_pagar, estado_pago
    ) VALUES (
      p_tenant_id, p_planilla_id, v_empleado_id,
      p_planilla_id::text, v_empleado_id::text,
      COALESCE((v_empleado->>'dias_trabajados')::integer, 0),
      COALESCE((v_empleado->>'horas_extras_25')::numeric, 0),
      COALESCE((v_empleado->>'horas_extras_35')::numeric, 0),
      COALESCE((v_empleado->>'tardanzas_minutos')::integer, 0),
      COALESCE((v_empleado->>'faltas')::integer, 0),
      round((v_empleado->>'total_ingresos')::numeric, 2),
      round((v_empleado->>'total_descuentos')::numeric, 2),
      round((v_empleado->>'total_aportes')::numeric, 2),
      round((v_empleado->>'neto_pagar')::numeric, 2),
      'pendiente'
    ) RETURNING id INTO v_empleado_planilla_id;

    FOR v_concepto IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_empleado->'conceptos', '[]'::jsonb))
    LOOP
      IF COALESCE((v_concepto->>'monto')::numeric, 0) <= 0 THEN CONTINUE; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.conceptos_planilla cp
        WHERE cp.id = app.to_uuid_or_null(v_concepto->>'concepto_id')
          AND cp.tenant_id = p_tenant_id AND COALESCE(cp.activo, true)
      ) THEN
        RAISE EXCEPTION 'Concepto de planilla inexistente, inactivo o de otro tenant'
          USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.empleado_planilla_conceptos (
        tenant_id, empleado_planilla_id, concepto_id,
        id_empleado_planilla, id_concepto, monto, observaciones
      ) VALUES (
        p_tenant_id, v_empleado_planilla_id,
        app.to_uuid_or_null(v_concepto->>'concepto_id'),
        v_empleado_planilla_id::text, v_concepto->>'concepto_id',
        round((v_concepto->>'monto')::numeric, 2),
        NULLIF(btrim(v_concepto->>'observaciones'), '')
      );
    END LOOP;

    v_total_ingresos := v_total_ingresos + round((v_empleado->>'total_ingresos')::numeric, 2);
    v_total_descuentos := v_total_descuentos + round((v_empleado->>'total_descuentos')::numeric, 2);
    v_total_aportes := v_total_aportes + round((v_empleado->>'total_aportes')::numeric, 2);
    v_total_neto := v_total_neto + round((v_empleado->>'neto_pagar')::numeric, 2);
    v_count := v_count + 1;
  END LOOP;

  IF abs(v_total_ingresos - v_total_descuentos - v_total_neto) > 0.01 THEN
    RAISE EXCEPTION 'La planilla no cuadra: ingresos % <> descuentos % + neto %',
      v_total_ingresos, v_total_descuentos, v_total_neto USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.planilla_transition', format('calcular:%s', p_planilla_id), true);
  UPDATE public.planillas
  SET total_ingresos = v_total_ingresos,
      total_descuentos = v_total_descuentos,
      total_aportes = v_total_aportes,
      total_neto = v_total_neto,
      total_pagado = 0,
      estado = 'calculada', estado_pago = 'pendiente', updated_at = now()
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id;
  PERFORM set_config('app.planilla_transition', '', true);

  RETURN jsonb_build_object(
    'success', true, 'totalEmpleados', v_count,
    'totalIngresos', v_total_ingresos, 'totalDescuentos', v_total_descuentos,
    'totalAportes', v_total_aportes, 'totalNeto', v_total_neto
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.aprobar_planilla_tx(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_usuario_id text DEFAULT 'sistema'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_planilla public.planillas%ROWTYPE;
  v_estado_inicial text;
  v_outbox_row_id uuid;
  v_event_id uuid;
  v_event_status text;
  v_event_count integer;
  v_idempotency_key text;
  v_fecha_devengo timestamptz;
  v_count integer;
  v_total_ingresos numeric(14,2);
  v_total_descuentos numeric(14,2);
  v_total_aportes numeric(14,2);
  v_total_neto numeric(14,2);
BEGIN
  IF p_tenant_id IS NULL OR p_planilla_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id y planilla_id son obligatorios' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_planilla
  FROM public.planillas
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planilla no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;
  v_estado_inicial := lower(v_planilla.estado::text);
  IF v_estado_inicial NOT IN ('calculada', 'aprobada', 'pagada') THEN
    RAISE EXCEPTION 'Solo se puede aprobar una planilla calculada; estado actual %', v_planilla.estado
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*),
         COALESCE(sum(round(COALESCE(ep.total_ingresos, 0), 2)), 0),
         COALESCE(sum(round(COALESCE(ep.total_descuentos, 0), 2)), 0),
         COALESCE(sum(round(COALESCE(ep.total_aportes, 0), 2)), 0),
         COALESCE(sum(round(COALESCE(ep.neto_pagar, 0), 2)), 0)
    INTO v_count, v_total_ingresos, v_total_descuentos, v_total_aportes, v_total_neto
  FROM public.empleado_planilla ep
  WHERE ep.tenant_id = p_tenant_id AND ep.planilla_id = p_planilla_id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'La planilla no contiene empleados calculados' USING ERRCODE = '22023';
  END IF;
  IF abs(v_total_ingresos - v_total_descuentos - v_total_neto) > 0.01 THEN
    RAISE EXCEPTION 'La planilla no cuadra y no puede aprobarse' USING ERRCODE = '23514';
  END IF;

  v_idempotency_key := format('planilla.liquidada:%s:%s', p_tenant_id, p_planilla_id);
  v_fecha_devengo := CASE
    WHEN COALESCE(v_planilla.periodo, '') ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      THEN ((v_planilla.periodo || '-01')::date + interval '1 month - 1 day')::date::timestamptz
    ELSE clock_timestamp()
  END;

  SELECT count(*) INTO v_event_count
  FROM public.outbox_events
  WHERE tenant_id = p_tenant_id AND event_type = 'planilla.liquidada'
    AND (
      idempotency_key = v_idempotency_key
      OR aggregate_id = p_planilla_id::text
    );
  IF v_event_count > 1 THEN
    RAISE EXCEPTION 'Existen multiples eventos de devengo para la misma planilla; requiere conciliacion'
      USING ERRCODE = '23505';
  END IF;

  SELECT id, COALESCE(event_id, gen_random_uuid()), lower(status::text)
    INTO v_outbox_row_id, v_event_id, v_event_status
  FROM public.outbox_events
  WHERE tenant_id = p_tenant_id AND event_type = 'planilla.liquidada'
    AND (
      idempotency_key = v_idempotency_key
      OR aggregate_id = p_planilla_id::text
    )
  ORDER BY (idempotency_key = v_idempotency_key) DESC, created_at, id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    v_event_id := gen_random_uuid();
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at
    ) VALUES (
      p_tenant_id, 'planilla', p_planilla_id::text, 'planilla.liquidada',
      jsonb_build_object(
        'eventId', v_event_id, 'tenantId', p_tenant_id,
        'idempotencyKey', v_idempotency_key, 'planillaId', p_planilla_id,
        'periodo', v_planilla.periodo, 'fecha', v_fecha_devengo,
        'totalIngresos', v_total_ingresos,
        'totalDescuentos', v_total_descuentos,
        'totalAportes', v_total_aportes, 'totalNeto', v_total_neto,
        'centro_costo_id', app.to_uuid_or_null(v_planilla.metadata->>'centro_costo_id'),
        'paisCodigo', v_planilla.pais_codigo, 'moneda', v_planilla.moneda,
        'accountingHandledByOutbox', true
      ),
      'pending', 0, v_idempotency_key, v_event_id, v_fecha_devengo
    );
  ELSE
    UPDATE public.outbox_events
    SET event_id = v_event_id,
        aggregate_type = COALESCE(NULLIF(aggregate_type, ''), 'planilla'),
        aggregate_id = p_planilla_id::text,
        payload = CASE
          WHEN v_event_status IN ('pending', 'failed') THEN
            COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
              'eventId', v_event_id, 'tenantId', p_tenant_id,
              'planillaId', p_planilla_id, 'periodo', v_planilla.periodo,
              'fecha', v_fecha_devengo,
              'totalIngresos', v_total_ingresos,
              'totalDescuentos', v_total_descuentos,
              'totalAportes', v_total_aportes, 'totalNeto', v_total_neto,
              'centro_costo_id', app.to_uuid_or_null(v_planilla.metadata->>'centro_costo_id'),
              'paisCodigo', v_planilla.pais_codigo, 'moneda', v_planilla.moneda,
              'accountingHandledByOutbox', true
            )
          ELSE payload
        END,
        updated_at = now()
    WHERE id = v_outbox_row_id;
  END IF;

  IF v_estado_inicial = 'calculada' THEN
    PERFORM set_config('app.planilla_transition', format('aprobar:%s', p_planilla_id), true);
  END IF;
  UPDATE public.planillas
  SET total_ingresos = v_total_ingresos,
      total_descuentos = v_total_descuentos,
      total_aportes = v_total_aportes,
      total_neto = v_total_neto,
      estado = CASE WHEN v_estado_inicial = 'calculada' THEN 'aprobada' ELSE estado END,
      asientos_generados = COALESCE(asientos_generados, 'false'),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'accounting_handled_by_outbox', true,
        'devengo_event_id', v_event_id,
        'aprobada_por', COALESCE(NULLIF(btrim(p_usuario_id), ''), 'sistema')
      ),
      updated_at = now()
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id;
  PERFORM set_config('app.planilla_transition', '', true);

  RETURN jsonb_build_object(
    'success', true, 'planillaId', p_planilla_id,
    'estado', CASE WHEN v_estado_inicial = 'pagada' THEN 'pagada' ELSE 'aprobada' END,
    'eventId', v_event_id, 'devengoEncolado', true,
    'idempotent', v_estado_inicial <> 'calculada'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.pagar_planilla_completa_tx(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_metodo_pago text,
  p_usuario_id text DEFAULT 'sistema'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_planilla public.planillas%ROWTYPE;
  v_estado_inicial text;
  v_metodo text := lower(btrim(COALESCE(p_metodo_pago, '')));
  v_fecha_pago timestamptz;
  v_outbox_row_id uuid;
  v_event_id uuid;
  v_event_status text;
  v_event_count integer;
  v_idempotency_key text;
  v_fingerprint text;
  v_existing_payload jsonb;
  v_total_pagado numeric(14,2);
  v_empleados_pagados integer;
  v_insertados integer;
  v_pagos jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_planilla_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id y planilla_id son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF v_metodo NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'Metodo de pago no permitido: %', p_metodo_pago USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_planilla
  FROM public.planillas
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planilla no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;
  v_estado_inicial := lower(v_planilla.estado::text);
  IF v_estado_inicial NOT IN ('aprobada', 'pagada') THEN
    RAISE EXCEPTION 'Solo se puede pagar una planilla aprobada; estado actual %', v_planilla.estado
      USING ERRCODE = '23514';
  END IF;

  v_fingerprint := md5(format('%s|%s|%s', p_tenant_id, p_planilla_id, v_metodo));
  IF v_estado_inicial = 'pagada'
     AND lower(COALESCE(v_planilla.metodo_pago, '')) IS DISTINCT FROM v_metodo THEN
    RAISE EXCEPTION 'La planilla ya fue pagada con un metodo diferente (%)', v_planilla.metodo_pago
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.empleado_planilla ep
    WHERE ep.tenant_id = p_tenant_id AND ep.planilla_id = p_planilla_id
      AND COALESCE(ep.neto_pagar, 0) > 0
  ) THEN
    RAISE EXCEPTION 'La planilla no contiene empleados con neto por pagar'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pagos_empleados pe
    LEFT JOIN public.empleado_planilla ep
      ON ep.planilla_id = pe.planilla_id AND ep.empleado_id = pe.empleado_id
     AND ep.tenant_id = pe.tenant_id
    WHERE pe.tenant_id = p_tenant_id AND pe.planilla_id = p_planilla_id
      AND (
        ep.id IS NULL
        OR round(COALESCE(pe.sueldo_bruto, 0), 2) <> round(COALESCE(ep.total_ingresos, 0), 2)
        OR round(COALESCE(pe.descuentos, 0), 2) <> round(COALESCE(ep.total_descuentos, 0), 2)
        OR round(COALESCE(pe.monto_neto, 0), 2) <> round(COALESCE(ep.neto_pagar, 0), 2)
        OR (
          upper(COALESCE(pe.estado, '')) IN ('PROCESADO', 'PAGADO')
          AND lower(COALESCE(pe.metodo_pago, '')) IS DISTINCT FROM v_metodo
        )
      )
  ) THEN
    RAISE EXCEPTION 'Existen pagos previos que no coinciden con la planilla o el metodo solicitado'
      USING ERRCODE = '23514';
  END IF;

  v_fecha_pago := COALESCE(v_planilla.fecha_pago, clock_timestamp());
  INSERT INTO public.pagos_empleados (
    tenant_id, empleado_id, planilla_id, periodo, sueldo_bruto,
    descuentos, monto_neto, metodo_pago, estado, fecha_pago, usuario_id, metadata
  )
  SELECT
    p_tenant_id, ep.empleado_id, p_planilla_id, v_planilla.periodo,
    ep.total_ingresos, ep.total_descuentos, ep.neto_pagar,
    v_metodo, 'PROCESADO', v_fecha_pago,
    COALESCE(NULLIF(btrim(p_usuario_id), ''), 'sistema'),
    jsonb_build_object('payment_fingerprint', v_fingerprint, 'source', 'pagar_planilla_completa_tx')
  FROM public.empleado_planilla ep
  WHERE ep.tenant_id = p_tenant_id AND ep.planilla_id = p_planilla_id
    AND ep.empleado_id IS NOT NULL AND COALESCE(ep.neto_pagar, 0) > 0
  ON CONFLICT (tenant_id, planilla_id, empleado_id)
    WHERE tenant_id IS NOT NULL AND planilla_id IS NOT NULL AND empleado_id IS NOT NULL
  DO UPDATE SET
    periodo = EXCLUDED.periodo,
    sueldo_bruto = EXCLUDED.sueldo_bruto,
    descuentos = EXCLUDED.descuentos,
    monto_neto = EXCLUDED.monto_neto,
    metodo_pago = EXCLUDED.metodo_pago,
    estado = 'PROCESADO',
    fecha_pago = COALESCE(pagos_empleados.fecha_pago, EXCLUDED.fecha_pago),
    usuario_id = COALESCE(pagos_empleados.usuario_id, EXCLUDED.usuario_id),
    metadata = COALESCE(pagos_empleados.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = now()
  WHERE upper(COALESCE(pagos_empleados.estado, '')) NOT IN ('PROCESADO', 'PAGADO');
  GET DIAGNOSTICS v_insertados = ROW_COUNT;

  SELECT count(*), COALESCE(sum(pe.monto_neto), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', pe.id, 'empleado_id', pe.empleado_id, 'monto_neto', pe.monto_neto
         ) ORDER BY pe.empleado_id), '[]'::jsonb)
    INTO v_empleados_pagados, v_total_pagado, v_pagos
  FROM public.pagos_empleados pe
  WHERE pe.tenant_id = p_tenant_id AND pe.planilla_id = p_planilla_id
    AND upper(pe.estado) IN ('PROCESADO', 'PAGADO');

  IF v_empleados_pagados <> (
    SELECT count(*) FROM public.empleado_planilla ep
    WHERE ep.tenant_id = p_tenant_id AND ep.planilla_id = p_planilla_id
      AND ep.empleado_id IS NOT NULL AND COALESCE(ep.neto_pagar, 0) > 0
  ) OR abs(v_total_pagado - COALESCE(v_planilla.total_neto, 0)) > 0.01 THEN
    RAISE EXCEPTION 'No se pudo confirmar el pago completo y conciliado de la planilla'
      USING ERRCODE = '40001';
  END IF;

  v_idempotency_key := format('planilla.pagada:%s:%s', p_tenant_id, p_planilla_id);
  SELECT count(*) INTO v_event_count
  FROM public.outbox_events
  WHERE tenant_id = p_tenant_id AND event_type = 'planilla.pagada'
    AND (
      idempotency_key = v_idempotency_key
      OR aggregate_id = p_planilla_id::text
    );
  IF v_event_count > 1 THEN
    RAISE EXCEPTION 'Existen multiples eventos de pago para la misma planilla; requiere conciliacion'
      USING ERRCODE = '23505';
  END IF;

  SELECT id, COALESCE(event_id, gen_random_uuid()), payload, lower(status::text)
    INTO v_outbox_row_id, v_event_id, v_existing_payload, v_event_status
  FROM public.outbox_events
  WHERE tenant_id = p_tenant_id AND event_type = 'planilla.pagada'
    AND (
      idempotency_key = v_idempotency_key
      OR aggregate_id = p_planilla_id::text
    )
  ORDER BY (idempotency_key = v_idempotency_key) DESC, created_at, id
  LIMIT 1
  FOR UPDATE;
  IF FOUND AND (
       lower(COALESCE(v_existing_payload->>'metodoPago', v_metodo)) IS DISTINCT FROM v_metodo
       OR COALESCE(v_existing_payload->>'paymentFingerprint', v_fingerprint) IS DISTINCT FROM v_fingerprint
     ) THEN
    RAISE EXCEPTION 'La misma operacion de pago ya existe con un payload diferente'
      USING ERRCODE = '23514';
  END IF;

  IF v_outbox_row_id IS NULL THEN
    v_event_id := gen_random_uuid();
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at
    ) VALUES (
      p_tenant_id, 'planilla', p_planilla_id::text, 'planilla.pagada',
      jsonb_build_object(
        'eventId', v_event_id, 'tenantId', p_tenant_id,
        'idempotencyKey', v_idempotency_key, 'paymentFingerprint', v_fingerprint,
        'planillaId', p_planilla_id, 'periodo', v_planilla.periodo,
        'totalPagado', v_total_pagado, 'metodoPago', v_metodo,
        'cantidadEmpleados', v_empleados_pagados, 'fechaPago', v_fecha_pago,
        'empleados', v_pagos, 'accountingHandledByOutbox', true
      ),
      'pending', 0, v_idempotency_key, v_event_id, v_fecha_pago
    );
  ELSE
    UPDATE public.outbox_events
    SET event_id = v_event_id,
        aggregate_type = COALESCE(NULLIF(aggregate_type, ''), 'planilla'),
        aggregate_id = p_planilla_id::text,
        payload = CASE
          WHEN v_event_status IN ('pending', 'failed') THEN
            COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
              'eventId', v_event_id, 'tenantId', p_tenant_id,
              'paymentFingerprint', v_fingerprint,
              'planillaId', p_planilla_id, 'periodo', v_planilla.periodo,
              'totalPagado', v_total_pagado, 'metodoPago', v_metodo,
              'cantidadEmpleados', v_empleados_pagados, 'fechaPago', v_fecha_pago,
              'empleados', v_pagos, 'accountingHandledByOutbox', true
            )
          ELSE payload
        END,
        updated_at = now()
    WHERE id = v_outbox_row_id;
  END IF;

  PERFORM set_config('app.planilla_transition', format('pagar:%s', p_planilla_id), true);
  UPDATE public.empleado_planilla
  SET estado_pago = 'pagado', fecha_pago = COALESCE(fecha_pago, v_fecha_pago),
      metodo_pago = v_metodo,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_event_id', v_event_id, 'payment_fingerprint', v_fingerprint
      ),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND planilla_id = p_planilla_id;

  UPDATE public.planillas
  SET estado = 'pagada', estado_pago = 'pagado',
      fecha_pago = COALESCE(fecha_pago, v_fecha_pago), metodo_pago = v_metodo,
      total_pagado = v_total_pagado,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_event_id', v_event_id, 'payment_fingerprint', v_fingerprint,
        'pagada_por', COALESCE(NULLIF(btrim(p_usuario_id), ''), 'sistema')
      ),
      updated_at = now()
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id;
  PERFORM set_config('app.planilla_transition', '', true);

  INSERT INTO public.historial_pagos_planilla (
    id, tenant_id, estado, metadata, planilla_id, fecha, metodo, monto,
    empleados_count, observaciones, metodo_pago, moneda,
    procesado_por, fecha_registro, activo
  ) VALUES (
    v_event_id, p_tenant_id, 'registrado',
    jsonb_build_object('payment_event_id', v_event_id, 'payment_fingerprint', v_fingerprint),
    p_planilla_id, v_fecha_pago::date, v_metodo, v_total_pagado,
    v_empleados_pagados, 'Pago total atomico de planilla', v_metodo,
    COALESCE(NULLIF(v_planilla.moneda, ''), 'PEN'),
    app.to_uuid_or_null(p_usuario_id), v_fecha_pago, true
  ) ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'planillaId', p_planilla_id, 'periodo', v_planilla.periodo,
    'totalPagado', v_total_pagado, 'empleadosPagados', v_empleados_pagados,
    'pagosInsertados', v_insertados, 'metodoPago', v_metodo,
    'paymentFingerprint', v_fingerprint, 'eventId', v_event_id,
    'idempotent', v_estado_inicial = 'pagada', 'pagos', v_pagos
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.aprobar_planilla_tx(
  p_tenant_id uuid, p_planilla_id uuid, p_usuario_id text DEFAULT 'sistema'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.aprobar_planilla_tx(p_tenant_id, p_planilla_id, p_usuario_id);
$function$;

CREATE OR REPLACE FUNCTION public.pagar_planilla_completa_tx(
  p_tenant_id uuid, p_planilla_id uuid, p_metodo_pago text,
  p_usuario_id text DEFAULT 'sistema'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.pagar_planilla_completa_tx(
    p_tenant_id, p_planilla_id, p_metodo_pago, p_usuario_id
  );
$function$;

REVOKE ALL ON FUNCTION app.enforce_planilla_lifecycle_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.enforce_planilla_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.enforce_empleado_planilla_payment_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.guardar_calculo_planilla_tx(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.aprobar_planilla_tx(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.pagar_planilla_completa_tx(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aprobar_planilla_tx(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pagar_planilla_completa_tx(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_planilla_tx(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pagar_planilla_completa_tx(uuid, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.aprobar_planilla_tx(uuid, uuid, text) IS
  'Aprueba una planilla calculada y publica una sola vez su devengo contable durable.';
COMMENT ON FUNCTION public.pagar_planilla_completa_tx(uuid, uuid, text, text) IS
  'Paga exclusivamente una planilla aprobada; sincroniza detalle, cabecera, proyecciones e outbox con fingerprint del metodo.';

COMMIT;

NOTIFY pgrst, 'reload schema';
