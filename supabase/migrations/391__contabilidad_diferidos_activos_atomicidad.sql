-- Cierre de atomicidad para diferidos y activos fijos.
--
-- Cada RPC bloquea el agregado antes de modificarlo. Si falla el asiento, el
-- historial o el cambio de estado, PostgreSQL revierte la operacion completa.

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION public.devengar_diferidos_tx(
  p_tenant_id uuid,
  p_asiento jsonb,
  p_detalles jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_asiento jsonb;
  v_item record;
  v_diferido public.diferidos;
BEGIN
  IF jsonb_typeof(COALESCE(p_items, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'DIFERIDOS_ITEMS_REQUERIDOS';
  END IF;

  -- El orden estable evita deadlocks si dos cierres alcanzan los mismos items.
  FOR v_item IN
    SELECT *
    FROM jsonb_to_recordset(p_items) AS x(
      diferido_id uuid,
      periodo text,
      fecha date,
      monto numeric,
      monto_acumulado numeric,
      created_by text
    )
    ORDER BY diferido_id
  LOOP
    SELECT * INTO v_diferido
    FROM public.diferidos d
    WHERE d.id = v_item.diferido_id
      AND d.tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND OR upper(COALESCE(v_diferido.estado, '')) <> 'VIGENTE' THEN
      RAISE EXCEPTION 'DIFERIDO_NO_VIGENTE:%', v_item.diferido_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.diferidos_devengos dd
      WHERE dd.tenant_id = p_tenant_id
        AND dd.diferido_id = v_item.diferido_id
        AND dd.periodo = v_item.periodo
    ) THEN
      RAISE EXCEPTION 'DIFERIDO_PERIODO_YA_DEVENGADO:%:%', v_item.diferido_id, v_item.periodo;
    END IF;

    IF round(COALESCE(v_diferido.monto_devengado, 0) + v_item.monto, 2)
       <> round(v_item.monto_acumulado, 2)
       OR v_item.monto <= 0
       OR v_item.monto_acumulado > v_diferido.monto_total + 0.005 THEN
      RAISE EXCEPTION 'DIFERIDO_CAMBIO_CONCURRENTEMENTE:%', v_item.diferido_id;
    END IF;
  END LOOP;

  v_asiento := public.crear_asiento_con_detalles_tx(p_tenant_id, p_asiento, p_detalles);

  INSERT INTO public.diferidos_devengos (
    tenant_id, diferido_id, periodo, fecha, monto, monto_acumulado,
    asiento_id, created_by
  )
  SELECT
    p_tenant_id, x.diferido_id, x.periodo, x.fecha, round(x.monto, 2),
    round(x.monto_acumulado, 2), (v_asiento->>'id')::uuid, x.created_by
  FROM jsonb_to_recordset(p_items) AS x(
    diferido_id uuid,
    periodo text,
    fecha date,
    monto numeric,
    monto_acumulado numeric,
    created_by text
  );

  UPDATE public.diferidos d
  SET monto_devengado = round(x.monto_acumulado, 2),
      estado = CASE
        WHEN round(x.monto_acumulado, 2) >= round(d.monto_total, 2)
          THEN 'DEVENGADO'
        ELSE 'VIGENTE'
      END,
      updated_at = now()
  FROM jsonb_to_recordset(p_items) AS x(
    diferido_id uuid,
    periodo text,
    fecha date,
    monto numeric,
    monto_acumulado numeric,
    created_by text
  )
  WHERE d.id = x.diferido_id
    AND d.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'asiento', v_asiento,
    'diferidos_devengados', jsonb_array_length(p_items)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_depreciacion_tx(
  p_tenant_id uuid,
  p_activo_id uuid,
  p_periodo text,
  p_fecha date,
  p_monto numeric,
  p_acumulado numeric,
  p_valor_neto numeric,
  p_centro_costo_id uuid,
  p_created_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_activo public.activos_fijos;
  v_depreciacion public.depreciaciones;
  v_situacion text;
BEGIN
  SELECT * INTO v_activo
  FROM public.activos_fijos a
  WHERE a.id = p_activo_id
    AND a.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR upper(COALESCE(v_activo.situacion, '')) <> 'ACTIVO' THEN
    RAISE EXCEPTION 'ACTIVO_NO_DEPRECIABLE:%', p_activo_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.depreciaciones d
    WHERE d.tenant_id = p_tenant_id
      AND d.activo_id = p_activo_id
      AND d.periodo = p_periodo
  ) THEN
    RAISE EXCEPTION 'DEPRECIACION_YA_REGISTRADA:%:%', p_activo_id, p_periodo;
  END IF;

  IF p_monto <= 0
     OR round(COALESCE(v_activo.depreciacion_acumulada, 0) + p_monto, 2)
        <> round(p_acumulado, 2)
     OR round(COALESCE(v_activo.valor_adquisicion, 0) - p_acumulado, 2)
        <> round(p_valor_neto, 2)
     OR p_acumulado > COALESCE(v_activo.valor_adquisicion, 0)
                        - COALESCE(v_activo.valor_residual, 0) + 0.005 THEN
    RAISE EXCEPTION 'DEPRECIACION_CAMBIO_CONCURRENTEMENTE:%', p_activo_id;
  END IF;

  v_situacion := CASE
    WHEN round(p_valor_neto, 2) <= round(COALESCE(v_activo.valor_residual, 0), 2)
      THEN 'DEPRECIADO'
    ELSE 'ACTIVO'
  END;

  INSERT INTO public.depreciaciones (
    tenant_id, activo_id, periodo, fecha_depreciacion, monto_depreciacion,
    depreciacion_acumulada, valor_neto, centro_costo_id, procesado_outbox,
    created_by, estado
  ) VALUES (
    p_tenant_id, p_activo_id, p_periodo, p_fecha, round(p_monto, 2),
    round(p_acumulado, 2), round(p_valor_neto, 2), p_centro_costo_id, false,
    p_created_by, 'ACTIVO'
  )
  RETURNING * INTO v_depreciacion;

  UPDATE public.activos_fijos a
  SET depreciacion_acumulada = round(p_acumulado, 2),
      situacion = v_situacion,
      updated_at = now()
  WHERE a.id = p_activo_id
    AND a.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'depreciacion', to_jsonb(v_depreciacion),
    'situacion', v_situacion
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.dar_baja_activo_tx(
  p_tenant_id uuid,
  p_activo_id uuid,
  p_asiento jsonb,
  p_detalles jsonb,
  p_baja jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_activo public.activos_fijos;
  v_asiento jsonb;
  v_actualizado public.activos_fijos;
  v_situacion text := upper(COALESCE(p_baja->>'situacion', ''));
BEGIN
  SELECT * INTO v_activo
  FROM public.activos_fijos a
  WHERE a.id = p_activo_id
    AND a.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIVO_NO_ENCONTRADO';
  END IF;

  IF upper(COALESCE(v_activo.situacion, '')) IN ('BAJA', 'VENDIDO')
     OR v_activo.asiento_baja_id IS NOT NULL THEN
    RAISE EXCEPTION 'ACTIVO_YA_RETIRADO:%', p_activo_id;
  END IF;

  IF v_situacion NOT IN ('BAJA', 'VENDIDO') THEN
    RAISE EXCEPTION 'ACTIVO_SITUACION_BAJA_INVALIDA';
  END IF;

  IF round(COALESCE(v_activo.valor_adquisicion, 0), 2)
       <> round((p_baja->>'valor_adquisicion_esperado')::numeric, 2)
     OR round(COALESCE(v_activo.depreciacion_acumulada, 0), 2)
       <> round((p_baja->>'depreciacion_acumulada_esperada')::numeric, 2) THEN
    RAISE EXCEPTION 'ACTIVO_CAMBIO_CONCURRENTEMENTE:%', p_activo_id;
  END IF;

  v_asiento := public.crear_asiento_con_detalles_tx(p_tenant_id, p_asiento, p_detalles);

  UPDATE public.activos_fijos a
  SET situacion = v_situacion,
      fecha_baja = (p_baja->>'fecha_baja')::date,
      motivo_baja = NULLIF(p_baja->>'motivo_baja', ''),
      valor_venta = NULLIF(p_baja->>'valor_venta', '')::numeric,
      asiento_baja_id = (v_asiento->>'id')::uuid,
      updated_at = now()
  WHERE a.id = p_activo_id
    AND a.tenant_id = p_tenant_id
  RETURNING * INTO v_actualizado;

  RETURN jsonb_build_object(
    'asiento', v_asiento,
    'activo', to_jsonb(v_actualizado)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.devengar_diferidos_tx(uuid, jsonb, jsonb, jsonb)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_depreciacion_tx(uuid, uuid, text, date, numeric, numeric, numeric, uuid, text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dar_baja_activo_tx(uuid, uuid, jsonb, jsonb, jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.devengar_diferidos_tx(uuid, jsonb, jsonb, jsonb)
TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_depreciacion_tx(uuid, uuid, text, date, numeric, numeric, numeric, uuid, text)
TO service_role;
GRANT EXECUTE ON FUNCTION public.dar_baja_activo_tx(uuid, uuid, jsonb, jsonb, jsonb)
TO service_role;

COMMENT ON FUNCTION public.devengar_diferidos_tx(uuid, jsonb, jsonb, jsonb)
IS 'Crea asiento, detalles, historial y acumulados de diferidos atomicamente.';
COMMENT ON FUNCTION public.registrar_depreciacion_tx(uuid, uuid, text, date, numeric, numeric, numeric, uuid, text)
IS 'Registra una cuota y actualiza el activo bajo un mismo lock y transaccion.';
COMMENT ON FUNCTION public.dar_baja_activo_tx(uuid, uuid, jsonb, jsonb, jsonb)
IS 'Crea el asiento de baja o venta y retira el activo atomicamente.';

COMMIT;
