-- ============================================================================
-- 425__rrhh_planilla_calculation_atomic.sql
-- Persiste el calculo completo de una planilla en una unica transaccion.
-- El calculo monetario sigue en el backend (normativa por periodo); esta RPC
-- valida pertenencia tenant, reemplaza cualquier residuo de un intento fallido,
-- inserta empleados/conceptos y cambia el estado de la planilla de una sola vez.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

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
      v_planilla.estado, v_planilla.estado_pago
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_empleados) item
    GROUP BY item->>'empleado_id'
    HAVING count(*) > 1
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

  -- Limpia exclusivamente residuos de intentos antiguos mientras la cabecera
  -- sigue en BORRADOR. Si cualquier paso posterior falla, PostgreSQL revierte
  -- también estas eliminaciones.
  DELETE FROM public.empleado_planilla_conceptos epc
  USING public.empleado_planilla ep
  WHERE epc.empleado_planilla_id = ep.id
    AND ep.planilla_id = p_planilla_id
    AND ep.tenant_id = p_tenant_id;

  DELETE FROM public.empleado_planilla
  WHERE planilla_id = p_planilla_id
    AND tenant_id = p_tenant_id;

  FOR v_empleado IN SELECT value FROM jsonb_array_elements(p_empleados)
  LOOP
    v_empleado_id := (v_empleado->>'empleado_id')::uuid;

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
      total_aportes, neto_pagar
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
      round((v_empleado->>'neto_pagar')::numeric, 2)
    ) RETURNING id INTO v_empleado_planilla_id;

    FOR v_concepto IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_empleado->'conceptos', '[]'::jsonb))
    LOOP
      IF COALESCE((v_concepto->>'monto')::numeric, 0) <= 0 THEN
        CONTINUE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.conceptos_planilla cp
        WHERE cp.id = (v_concepto->>'concepto_id')::uuid
          AND cp.tenant_id = p_tenant_id
          AND COALESCE(cp.activo, true)
      ) THEN
        RAISE EXCEPTION 'Concepto de planilla inexistente, inactivo o de otro tenant'
          USING ERRCODE = '23503';
      END IF;

      INSERT INTO public.empleado_planilla_conceptos (
        tenant_id, empleado_planilla_id, concepto_id,
        id_empleado_planilla, id_concepto, monto, observaciones
      ) VALUES (
        p_tenant_id, v_empleado_planilla_id, (v_concepto->>'concepto_id')::uuid,
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

  UPDATE public.planillas
  SET total_ingresos = v_total_ingresos,
      total_descuentos = v_total_descuentos,
      total_aportes = v_total_aportes,
      total_neto = v_total_neto,
      estado = 'calculada',
      estado_pago = 'pendiente',
      updated_at = now()
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'success', true,
    'totalEmpleados', v_count,
    'totalIngresos', v_total_ingresos,
    'totalDescuentos', v_total_descuentos,
    'totalAportes', v_total_aportes,
    'totalNeto', v_total_neto
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_calculo_planilla_tx(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_empleados jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.guardar_calculo_planilla_tx(p_tenant_id, p_planilla_id, p_empleados);
$function$;

REVOKE ALL ON FUNCTION app.guardar_calculo_planilla_tx(uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_calculo_planilla_tx(uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_calculo_planilla_tx(uuid, uuid, jsonb)
TO service_role;

COMMENT ON FUNCTION public.guardar_calculo_planilla_tx(uuid, uuid, jsonb) IS
  'Persiste empleados, conceptos y totales de una planilla de forma atomica, tenant-scoped e idempotente desde BORRADOR.';

COMMIT;

NOTIFY pgrst, 'reload schema';
