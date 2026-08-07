\set ON_ERROR_STOP on

BEGIN;

DO $contract$
DECLARE
  v_tenant_id uuid;
  v_empleado_id uuid;
  v_liquidacion_id uuid;
  v_resultado jsonb;
BEGIN
  SELECT e.tenant_id, e.id
    INTO v_tenant_id, v_empleado_id
  FROM public.empleados e
  WHERE lower(e.estado::text) = 'activo'
    AND EXISTS (
      SELECT 1
      FROM public.contratos c
      WHERE c.tenant_id = e.tenant_id
        AND c.id_empleado = e.id
        AND lower(c.estado::text) IN ('vigente', 'renovado', 'periodo_prueba')
    )
  LIMIT 1;

  IF v_empleado_id IS NULL THEN
    RAISE EXCEPTION 'El contrato QA requiere un empleado activo con contrato vigente en la base local efímera';
  END IF;

  INSERT INTO public.liquidaciones (
    tenant_id, id_empleado, empleado_id, motivo_terminacion,
    fecha_terminacion, ultimo_dia_trabajado, monto_cts,
    vacaciones_pendientes, indemnizacion, total_liquidacion, estado
  ) VALUES (
    v_tenant_id, v_empleado_id, v_empleado_id, 'renuncia',
    DATE '2099-12-31', DATE '2099-12-31', 100, 0, 0, 100, 'calculada'
  )
  RETURNING id INTO v_liquidacion_id;

  v_resultado := app.confirmar_liquidacion_tx(v_tenant_id, v_liquidacion_id, NULL);

  IF v_resultado->>'estado' <> 'aprobada' THEN
    RAISE EXCEPTION 'La RPC no devolvio estado aprobada: %', v_resultado;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.liquidaciones
    WHERE id = v_liquidacion_id AND tenant_id = v_tenant_id AND lower(estado::text) = 'aprobada'
  ) THEN
    RAISE EXCEPTION 'La liquidacion no quedo aprobada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.empleados
    WHERE id = v_empleado_id AND tenant_id = v_tenant_id AND lower(estado::text) = 'inactivo'
  ) THEN
    RAISE EXCEPTION 'El empleado no quedo inactivo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.contratos
    WHERE id_empleado = v_empleado_id AND tenant_id = v_tenant_id
      AND lower(estado::text) IN ('vigente', 'renovado', 'periodo_prueba')
  ) THEN
    RAISE EXCEPTION 'Quedo un contrato vigente luego de confirmar';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.outbox_events
    WHERE tenant_id = v_tenant_id
      AND aggregate_id = v_liquidacion_id::text
      AND event_type = 'liquidacion.aprobada'
  ) THEN
    RAISE EXCEPTION 'No se creo el evento durable de liquidacion';
  END IF;

  RAISE NOTICE 'OK: confirmar_liquidacion_tx actualiza los cuatro efectos atomicamente';
END;
$contract$;

ROLLBACK;
