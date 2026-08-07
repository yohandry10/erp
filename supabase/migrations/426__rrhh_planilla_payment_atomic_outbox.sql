-- ============================================================================
-- 426__rrhh_planilla_payment_atomic_outbox.sql
-- Paga una planilla completa sin dejar empleados pagados a medias. Los pagos,
-- el estado de la cabecera y el evento contable durable se confirman juntos.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

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
  v_metodo text := lower(btrim(COALESCE(p_metodo_pago, '')));
  v_fecha_pago timestamptz := clock_timestamp();
  v_event_id uuid;
  v_idempotency_key text;
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

  IF lower(v_planilla.estado::text) NOT IN ('calculada', 'pagada') THEN
    RAISE EXCEPTION 'Solo se puede pagar una planilla calculada; estado actual %', v_planilla.estado
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.empleado_planilla ep
    WHERE ep.tenant_id = p_tenant_id
      AND ep.planilla_id = p_planilla_id
      AND COALESCE(ep.neto_pagar, 0) > 0
  ) THEN
    RAISE EXCEPTION 'La planilla no contiene empleados con neto por pagar'
      USING ERRCODE = '22023';
  END IF;

  -- Un pago ya existente sólo es reutilizable si representa exactamente el
  -- calculo vigente. Cualquier divergencia exige revision, nunca sobreescritura.
  IF EXISTS (
    SELECT 1
    FROM public.pagos_empleados pe
    JOIN public.empleado_planilla ep
      ON ep.planilla_id = pe.planilla_id
     AND ep.empleado_id = pe.empleado_id
     AND ep.tenant_id = pe.tenant_id
    WHERE pe.tenant_id = p_tenant_id
      AND pe.planilla_id = p_planilla_id
      AND (
        round(COALESCE(pe.sueldo_bruto, 0), 2) <> round(COALESCE(ep.total_ingresos, 0), 2)
        OR round(COALESCE(pe.descuentos, 0), 2) <> round(COALESCE(ep.total_descuentos, 0), 2)
        OR round(COALESCE(pe.monto_neto, 0), 2) <> round(COALESCE(ep.neto_pagar, 0), 2)
      )
  ) THEN
    RAISE EXCEPTION 'Existen pagos previos que no coinciden con el calculo de planilla'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.pagos_empleados (
    tenant_id, empleado_id, planilla_id, periodo, sueldo_bruto,
    descuentos, monto_neto, metodo_pago, estado, fecha_pago, usuario_id
  )
  SELECT
    p_tenant_id, ep.empleado_id, p_planilla_id, v_planilla.periodo,
    ep.total_ingresos, ep.total_descuentos, ep.neto_pagar,
    v_metodo, 'PROCESADO', v_fecha_pago,
    COALESCE(NULLIF(btrim(p_usuario_id), ''), 'sistema')
  FROM public.empleado_planilla ep
  WHERE ep.tenant_id = p_tenant_id
    AND ep.planilla_id = p_planilla_id
    AND ep.empleado_id IS NOT NULL
    AND COALESCE(ep.neto_pagar, 0) > 0
  ON CONFLICT (tenant_id, planilla_id, empleado_id)
    WHERE tenant_id IS NOT NULL AND planilla_id IS NOT NULL AND empleado_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_insertados = ROW_COUNT;

  SELECT count(*), COALESCE(sum(pe.monto_neto), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', pe.id,
           'empleado_id', pe.empleado_id,
           'monto_neto', pe.monto_neto
         ) ORDER BY pe.empleado_id), '[]'::jsonb)
    INTO v_empleados_pagados, v_total_pagado, v_pagos
  FROM public.pagos_empleados pe
  WHERE pe.tenant_id = p_tenant_id
    AND pe.planilla_id = p_planilla_id
    AND upper(pe.estado) IN ('PROCESADO', 'PAGADO');

  IF v_empleados_pagados <> (
    SELECT count(*) FROM public.empleado_planilla ep
    WHERE ep.tenant_id = p_tenant_id
      AND ep.planilla_id = p_planilla_id
      AND ep.empleado_id IS NOT NULL
      AND COALESCE(ep.neto_pagar, 0) > 0
  ) THEN
    RAISE EXCEPTION 'No se pudo confirmar el pago de todos los empleados'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.planillas
  SET estado = 'pagada',
      estado_pago = 'pagado',
      fecha_pago = COALESCE(fecha_pago, v_fecha_pago),
      metodo_pago = v_metodo,
      total_pagado = v_total_pagado,
      updated_at = now()
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id;

  v_idempotency_key := format('planilla.pagada:%s:%s', p_tenant_id, p_planilla_id);

  SELECT event_id INTO v_event_id
  FROM public.outbox_events
  WHERE tenant_id = p_tenant_id
    AND event_type = 'planilla.pagada'
    AND idempotency_key = v_idempotency_key
  LIMIT 1;

  IF v_event_id IS NULL THEN
    v_event_id := gen_random_uuid();
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at
    ) VALUES (
      p_tenant_id, 'rrhh', p_planilla_id::text, 'planilla.pagada',
      jsonb_build_object(
        'eventId', v_event_id,
        'tenantId', p_tenant_id,
        'idempotencyKey', v_idempotency_key,
        'planillaId', p_planilla_id,
        'periodo', v_planilla.periodo,
        'totalPagado', v_total_pagado,
        'metodoPago', v_metodo,
        'cantidadEmpleados', v_empleados_pagados,
        'fechaPago', v_fecha_pago,
        'empleados', v_pagos
      ),
      'pending', 0, v_idempotency_key, v_event_id, v_fecha_pago
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'planillaId', p_planilla_id,
    'periodo', v_planilla.periodo,
    'totalPagado', v_total_pagado,
    'empleadosPagados', v_empleados_pagados,
    'pagosInsertados', v_insertados,
    'metodoPago', v_metodo,
    'eventId', v_event_id,
    'pagos', v_pagos
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pagar_planilla_completa_tx(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_metodo_pago text,
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

REVOKE ALL ON FUNCTION app.pagar_planilla_completa_tx(uuid, uuid, text, text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pagar_planilla_completa_tx(uuid, uuid, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pagar_planilla_completa_tx(uuid, uuid, text, text)
TO service_role;

COMMENT ON FUNCTION public.pagar_planilla_completa_tx(uuid, uuid, text, text) IS
  'Crea pagos RRHH, marca la planilla pagada y publica planilla.pagada en outbox dentro de una sola transaccion.';

COMMIT;

NOTIFY pgrst, 'reload schema';
