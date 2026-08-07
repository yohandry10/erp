-- ============================================================================
-- 427__rrhh_liquidacion_confirmation_atomic.sql
-- Calcular una liquidacion no cesa al trabajador. La confirmacion explicita
-- aprueba la liquidacion, termina el contrato, inactiva al empleado y publica
-- el evento durable dentro de una sola transaccion.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION app.confirmar_liquidacion_tx(
  p_tenant_id uuid,
  p_liquidacion_id uuid,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_liquidacion public.liquidaciones%ROWTYPE;
  v_event_id uuid;
  v_idempotency_key text;
  v_aprobado_por uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_liquidacion_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id y liquidacion_id son obligatorios' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_liquidacion
  FROM public.liquidaciones
  WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidacion no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;
  IF lower(v_liquidacion.estado::text) NOT IN ('calculada', 'aprobada') THEN
    RAISE EXCEPTION 'Solo se puede confirmar una liquidacion calculada; estado actual %', v_liquidacion.estado
      USING ERRCODE = '23514';
  END IF;

  SELECT us.id INTO v_aprobado_por
  FROM public.usuarios_sistema us
  WHERE us.id = p_usuario_id AND us.tenant_id = p_tenant_id
  LIMIT 1;

  UPDATE public.contratos
  SET estado = 'terminado',
      fecha_fin = v_liquidacion.fecha_terminacion,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND id_empleado = v_liquidacion.id_empleado
    AND lower(estado::text) IN ('vigente', 'renovado', 'periodo_prueba');

  IF NOT FOUND AND lower(v_liquidacion.estado::text) = 'calculada' THEN
    RAISE EXCEPTION 'El empleado no tiene un contrato vigente para terminar'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.empleados
  SET estado = 'inactivo', updated_at = now()
  WHERE id = v_liquidacion.id_empleado AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empleado no encontrado para el tenant' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.liquidaciones
  SET estado = 'aprobada', aprobado_por = COALESCE(aprobado_por, v_aprobado_por), updated_at = now()
  WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id;

  v_idempotency_key := format('liquidacion.aprobada:%s:%s', p_tenant_id, p_liquidacion_id);
  SELECT event_id INTO v_event_id
  FROM public.outbox_events
  WHERE tenant_id = p_tenant_id
    AND event_type = 'liquidacion.aprobada'
    AND idempotency_key = v_idempotency_key
  LIMIT 1;

  IF v_event_id IS NULL THEN
    v_event_id := gen_random_uuid();
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at
    ) VALUES (
      p_tenant_id, 'rrhh', p_liquidacion_id::text, 'liquidacion.aprobada',
      jsonb_build_object(
        'eventId', v_event_id,
        'tenantId', p_tenant_id,
        'idempotencyKey', v_idempotency_key,
        'liquidacionId', p_liquidacion_id,
        'empleadoId', v_liquidacion.id_empleado,
        'fechaTerminacion', v_liquidacion.fecha_terminacion,
        'totalLiquidacion', v_liquidacion.total_liquidacion,
        'actorId', p_usuario_id
      ),
      'pending', 0, v_idempotency_key, v_event_id, clock_timestamp()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'liquidacionId', p_liquidacion_id,
    'empleadoId', v_liquidacion.id_empleado,
    'estado', 'aprobada',
    'eventId', v_event_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirmar_liquidacion_tx(
  p_tenant_id uuid,
  p_liquidacion_id uuid,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.confirmar_liquidacion_tx(p_tenant_id, p_liquidacion_id, p_usuario_id);
$function$;

REVOKE ALL ON FUNCTION app.confirmar_liquidacion_tx(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirmar_liquidacion_tx(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_liquidacion_tx(uuid, uuid, uuid)
TO service_role;

COMMENT ON FUNCTION public.confirmar_liquidacion_tx(uuid, uuid, uuid) IS
  'Aprueba la liquidacion, cesa al trabajador y publica liquidacion.aprobada en una unica transaccion.';

COMMIT;

NOTIFY pgrst, 'reload schema';
