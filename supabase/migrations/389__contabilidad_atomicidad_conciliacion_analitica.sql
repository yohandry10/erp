-- Atomicidad de las escrituras multi-tabla introducidas en las fases 5 y 6.
--
-- Las implementaciones iniciales usaban varias llamadas PostgREST. Aunque cada
-- llamada era correcta por separado, un fallo intermedio podia dejar una
-- conciliacion parcial o borrar una distribucion antes de insertar su reemplazo.
-- Estas RPC concentran cada operacion en un unico statement PostgreSQL: ante
-- cualquier error, la transaccion de la llamada se revierte completa.

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION public.asignar_distribucion_analitica_tx(
  p_tenant_id uuid,
  p_detalle_asiento_id uuid,
  p_eje text,
  p_imputaciones jsonb,
  p_created_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_eje text := upper(btrim(COALESCE(p_eje, '')));
  v_total_porcentaje numeric;
  v_total_destinos integer;
  v_centros_validos integer;
  v_resultado jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_detalle_asiento_id IS NULL OR v_eje = '' THEN
    RAISE EXCEPTION 'ANALITICA_PARAMETROS_REQUERIDOS';
  END IF;

  IF jsonb_typeof(COALESCE(p_imputaciones, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_imputaciones) = 0 THEN
    RAISE EXCEPTION 'ANALITICA_IMPUTACIONES_REQUERIDAS';
  END IF;

  -- Serializa reemplazos concurrentes de la misma linea.
  PERFORM 1
  FROM public.detalle_asientos d
  WHERE d.id = p_detalle_asiento_id
    AND d.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ANALITICA_LINEA_NO_ENCONTRADA';
  END IF;

  SELECT count(*), COALESCE(sum(x.porcentaje), 0)
  INTO v_total_destinos, v_total_porcentaje
  FROM jsonb_to_recordset(p_imputaciones)
    AS x(centro_costo_id uuid, porcentaje numeric, monto numeric);

  IF abs(v_total_porcentaje - 100) > 0.001 THEN
    RAISE EXCEPTION 'ANALITICA_PORCENTAJE_INVALIDO:%', v_total_porcentaje;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_imputaciones)
      AS x(centro_costo_id uuid, porcentaje numeric, monto numeric)
    WHERE x.centro_costo_id IS NULL
       OR x.porcentaje <= 0
       OR x.porcentaje > 100
       OR x.monto < 0
  ) THEN
    RAISE EXCEPTION 'ANALITICA_IMPUTACION_INVALIDA';
  END IF;

  IF (
    SELECT count(DISTINCT x.centro_costo_id)
    FROM jsonb_to_recordset(p_imputaciones)
      AS x(centro_costo_id uuid, porcentaje numeric, monto numeric)
  ) <> v_total_destinos THEN
    RAISE EXCEPTION 'ANALITICA_CENTRO_DUPLICADO';
  END IF;

  SELECT count(*)
  INTO v_centros_validos
  FROM public.centros_costo c
  JOIN (
    SELECT DISTINCT x.centro_costo_id
    FROM jsonb_to_recordset(p_imputaciones)
      AS x(centro_costo_id uuid, porcentaje numeric, monto numeric)
  ) i ON i.centro_costo_id = c.id
  WHERE c.tenant_id = p_tenant_id
    AND upper(COALESCE(c.eje, 'CENTRO_COSTO')) = v_eje
    AND COALESCE(c.activo, true);

  IF v_centros_validos <> v_total_destinos THEN
    RAISE EXCEPTION 'ANALITICA_CENTRO_INVALIDO_PARA_EJE';
  END IF;

  DELETE FROM public.distribucion_analitica d
  WHERE d.tenant_id = p_tenant_id
    AND d.detalle_asiento_id = p_detalle_asiento_id
    AND upper(d.eje) = v_eje;

  INSERT INTO public.distribucion_analitica (
    tenant_id,
    detalle_asiento_id,
    centro_costo_id,
    eje,
    porcentaje,
    monto,
    created_by
  )
  SELECT
    p_tenant_id,
    p_detalle_asiento_id,
    x.centro_costo_id,
    v_eje,
    x.porcentaje,
    x.monto,
    p_created_by
  FROM jsonb_to_recordset(p_imputaciones)
    AS x(centro_costo_id uuid, porcentaje numeric, monto numeric);

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.created_at, d.id), '[]'::jsonb)
  INTO v_resultado
  FROM public.distribucion_analitica d
  WHERE d.tenant_id = p_tenant_id
    AND d.detalle_asiento_id = p_detalle_asiento_id
    AND upper(d.eje) = v_eje;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.asignar_distribucion_analitica_tx(
  uuid, uuid, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_distribucion_analitica_tx(
  uuid, uuid, text, jsonb, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.conciliar_partidas_tx(
  p_tenant_id uuid,
  p_cuenta_id uuid,
  p_estado text,
  p_monto_conciliado numeric,
  p_fecha date,
  p_observaciones text,
  p_created_by text,
  p_aplicaciones jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_estado text := upper(btrim(COALESCE(p_estado, '')));
  v_conciliacion public.conciliaciones_partidas;
  v_aplicacion record;
  v_detalle record;
  v_num_aplicaciones integer;
  v_suma_aplicaciones numeric;
BEGIN
  IF p_tenant_id IS NULL OR p_cuenta_id IS NULL THEN
    RAISE EXCEPTION 'CONCILIACION_PARAMETROS_REQUERIDOS';
  END IF;

  IF v_estado NOT IN ('PARCIAL', 'TOTAL') THEN
    RAISE EXCEPTION 'CONCILIACION_ESTADO_INVALIDO';
  END IF;

  IF p_monto_conciliado IS NULL OR p_monto_conciliado <= 0 THEN
    RAISE EXCEPTION 'CONCILIACION_MONTO_INVALIDO';
  END IF;

  IF jsonb_typeof(COALESCE(p_aplicaciones, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_aplicaciones) < 2 THEN
    RAISE EXCEPTION 'CONCILIACION_APLICACIONES_INSUFICIENTES';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.plan_cuentas c
    WHERE c.id = p_cuenta_id
      AND c.tenant_id = p_tenant_id
      AND c.conciliable
  ) THEN
    RAISE EXCEPTION 'CONCILIACION_CUENTA_NO_CONCILIABLE';
  END IF;

  SELECT count(*), COALESCE(sum(x.monto_aplicado), 0)
  INTO v_num_aplicaciones, v_suma_aplicaciones
  FROM jsonb_to_recordset(p_aplicaciones)
    AS x(detalle_id uuid, monto_aplicado numeric);

  IF (
    SELECT count(DISTINCT x.detalle_id)
    FROM jsonb_to_recordset(p_aplicaciones)
      AS x(detalle_id uuid, monto_aplicado numeric)
  ) <> v_num_aplicaciones THEN
    RAISE EXCEPTION 'CONCILIACION_PARTIDA_DUPLICADA';
  END IF;

  IF abs(v_suma_aplicaciones - (p_monto_conciliado * 2)) > 0.005 THEN
    RAISE EXCEPTION 'CONCILIACION_TOTAL_APLICACIONES_INVALIDO';
  END IF;

  -- El orden estable evita deadlocks cuando dos grupos compiten por partidas.
  FOR v_aplicacion IN
    SELECT x.detalle_id, x.monto_aplicado
    FROM jsonb_to_recordset(p_aplicaciones)
      AS x(detalle_id uuid, monto_aplicado numeric)
    ORDER BY x.detalle_id
  LOOP
    IF v_aplicacion.detalle_id IS NULL OR v_aplicacion.monto_aplicado <= 0 THEN
      RAISE EXCEPTION 'CONCILIACION_APLICACION_INVALIDA';
    END IF;

    SELECT
      d.id,
      d.cuenta_id,
      d.debe,
      d.haber,
      d.monto_conciliado,
      a.estado AS asiento_estado
    INTO v_detalle
    FROM public.detalle_asientos d
    JOIN public.asientos_contables a
      ON a.id = d.asiento_id
     AND a.tenant_id = d.tenant_id
    WHERE d.id = v_aplicacion.detalle_id
      AND d.tenant_id = p_tenant_id
    FOR UPDATE OF d;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONCILIACION_PARTIDA_NO_ENCONTRADA:%', v_aplicacion.detalle_id;
    END IF;

    IF v_detalle.cuenta_id IS DISTINCT FROM p_cuenta_id THEN
      RAISE EXCEPTION 'CONCILIACION_CUENTA_INCONSISTENTE';
    END IF;

    IF upper(COALESCE(v_detalle.asiento_estado, '')) <> 'CONFIRMADO' THEN
      RAISE EXCEPTION 'CONCILIACION_ASIENTO_NO_CONFIRMADO';
    END IF;

    IF COALESCE(v_detalle.monto_conciliado, 0) + v_aplicacion.monto_aplicado
       > abs(COALESCE(v_detalle.debe, 0) - COALESCE(v_detalle.haber, 0)) + 0.005 THEN
      RAISE EXCEPTION 'CONCILIACION_EXCEDE_SALDO:%', v_aplicacion.detalle_id;
    END IF;
  END LOOP;

  INSERT INTO public.conciliaciones_partidas (
    tenant_id,
    cuenta_id,
    estado,
    monto_conciliado,
    fecha,
    observaciones,
    created_by
  ) VALUES (
    p_tenant_id,
    p_cuenta_id,
    v_estado,
    round(p_monto_conciliado, 2),
    COALESCE(p_fecha, CURRENT_DATE),
    p_observaciones,
    p_created_by
  )
  RETURNING * INTO v_conciliacion;

  INSERT INTO public.conciliaciones_partidas_lineas (
    tenant_id,
    conciliacion_id,
    detalle_asiento_id,
    monto_aplicado
  )
  SELECT
    p_tenant_id,
    v_conciliacion.id,
    x.detalle_id,
    round(x.monto_aplicado, 2)
  FROM jsonb_to_recordset(p_aplicaciones)
    AS x(detalle_id uuid, monto_aplicado numeric);

  UPDATE public.detalle_asientos d
  SET monto_conciliado = round(COALESCE(d.monto_conciliado, 0) + x.monto_aplicado, 2),
      updated_at = now()
  FROM jsonb_to_recordset(p_aplicaciones)
    AS x(detalle_id uuid, monto_aplicado numeric)
  WHERE d.id = x.detalle_id
    AND d.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'id', v_conciliacion.id,
    'cuenta_id', v_conciliacion.cuenta_id,
    'estado', v_conciliacion.estado,
    'monto_conciliado', v_conciliacion.monto_conciliado,
    'fecha', v_conciliacion.fecha,
    'observaciones', v_conciliacion.observaciones
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.conciliar_partidas_tx(
  uuid, uuid, text, numeric, date, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_partidas_tx(
  uuid, uuid, text, numeric, date, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.desconciliar_partidas_tx(
  p_tenant_id uuid,
  p_conciliacion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_conciliacion public.conciliaciones_partidas;
  v_linea record;
BEGIN
  SELECT * INTO v_conciliacion
  FROM public.conciliaciones_partidas c
  WHERE c.id = p_conciliacion_id
    AND c.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONCILIACION_NO_ENCONTRADA';
  END IF;

  -- Bloqueo estable de las partidas antes de modificar cualquiera.
  FOR v_linea IN
    SELECT l.detalle_asiento_id, l.monto_aplicado
    FROM public.conciliaciones_partidas_lineas l
    WHERE l.tenant_id = p_tenant_id
      AND l.conciliacion_id = p_conciliacion_id
    ORDER BY l.detalle_asiento_id
  LOOP
    PERFORM 1
    FROM public.detalle_asientos d
    WHERE d.id = v_linea.detalle_asiento_id
      AND d.tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONCILIACION_PARTIDA_NO_ENCONTRADA:%', v_linea.detalle_asiento_id;
    END IF;
  END LOOP;

  UPDATE public.detalle_asientos d
  SET monto_conciliado = greatest(0, round(COALESCE(d.monto_conciliado, 0) - l.monto_aplicado, 2)),
      updated_at = now()
  FROM public.conciliaciones_partidas_lineas l
  WHERE l.tenant_id = p_tenant_id
    AND l.conciliacion_id = p_conciliacion_id
    AND d.id = l.detalle_asiento_id
    AND d.tenant_id = p_tenant_id;

  DELETE FROM public.conciliaciones_partidas c
  WHERE c.id = p_conciliacion_id
    AND c.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'id', p_conciliacion_id,
    'estado', 'DESCONCILIADA'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.desconciliar_partidas_tx(uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desconciliar_partidas_tx(uuid, uuid)
TO service_role;

COMMENT ON FUNCTION public.asignar_distribucion_analitica_tx(uuid, uuid, text, jsonb, text)
IS 'Reemplaza una distribucion analitica completa de forma atomica y serializada por linea.';

COMMENT ON FUNCTION public.conciliar_partidas_tx(uuid, uuid, text, numeric, date, text, text, jsonb)
IS 'Crea grupo, lineas y saldos conciliados en una sola transaccion con locks por partida.';

COMMENT ON FUNCTION public.desconciliar_partidas_tx(uuid, uuid)
IS 'Revierte saldos y elimina el grupo de conciliacion en una sola transaccion.';

COMMIT;
