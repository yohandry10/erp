-- Escritura atomica de cabecera y detalles de asientos manuales.
--
-- Crear, editar o reversar un asiento mediante llamadas PostgREST separadas
-- podia dejar una cabecera sin lineas o un borrador sin detalles. Las funciones
-- siguientes validan y escriben el agregado completo dentro de la transaccion
-- del statement PostgreSQL.

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION public.crear_asiento_con_detalles_tx(
  p_tenant_id uuid,
  p_asiento jsonb,
  p_detalles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_asiento public.asientos_contables;
  v_total_debe numeric;
  v_total_haber numeric;
  v_num_detalles integer;
  v_num_cuentas integer;
  v_estado text := upper(COALESCE(NULLIF(btrim(p_asiento->>'estado'), ''), 'CONFIRMADO'));
  v_plantilla_id uuid := NULLIF(p_asiento->>'plantilla_id', '')::uuid;
  v_plantilla_periodo text := NULLIF(p_asiento->>'plantilla_periodo', '');
BEGIN
  IF p_tenant_id IS NULL OR jsonb_typeof(COALESCE(p_asiento, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'ASIENTO_PARAMETROS_REQUERIDOS';
  END IF;

  IF jsonb_typeof(COALESCE(p_detalles, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_detalles) < 2 THEN
    RAISE EXCEPTION 'ASIENTO_DETALLES_INSUFICIENTES';
  END IF;

  IF v_estado NOT IN ('BORRADOR', 'CONFIRMADO') THEN
    RAISE EXCEPTION 'ASIENTO_ESTADO_INICIAL_INVALIDO';
  END IF;

  IF (v_plantilla_id IS NULL) <> (v_plantilla_periodo IS NULL) THEN
    RAISE EXCEPTION 'ASIENTO_PLANTILLA_TRAZABILIDAD_INCOMPLETA';
  END IF;

  IF v_plantilla_id IS NOT NULL THEN
    PERFORM 1
    FROM public.plantillas_asientos p
    WHERE p.id = v_plantilla_id
      AND p.tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ASIENTO_PLANTILLA_AJENA_O_INEXISTENTE';
    END IF;
  END IF;

  SELECT
    count(*),
    round(COALESCE(sum(COALESCE(x.debe, 0)), 0), 2),
    round(COALESCE(sum(COALESCE(x.haber, 0)), 0), 2)
  INTO v_num_detalles, v_total_debe, v_total_haber
  FROM jsonb_to_recordset(p_detalles)
    AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid);

  IF v_total_debe <> v_total_haber OR v_total_debe <= 0 THEN
    RAISE EXCEPTION 'ASIENTO_NO_CUADRA:%:%', v_total_debe, v_total_haber;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalles)
      AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid)
    WHERE x.cuenta_id IS NULL
       OR COALESCE(x.debe, 0) < 0
       OR COALESCE(x.haber, 0) < 0
       OR (COALESCE(x.debe, 0) = 0 AND COALESCE(x.haber, 0) = 0)
       OR (COALESCE(x.debe, 0) > 0 AND COALESCE(x.haber, 0) > 0)
  ) THEN
    RAISE EXCEPTION 'ASIENTO_DETALLE_INVALIDO';
  END IF;

  SELECT count(*)
  INTO v_num_cuentas
  FROM jsonb_to_recordset(p_detalles)
    AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid)
  JOIN public.plan_cuentas c
    ON c.id = x.cuenta_id
   AND c.tenant_id = p_tenant_id;

  IF v_num_cuentas <> v_num_detalles THEN
    RAISE EXCEPTION 'ASIENTO_CUENTA_AJENA_O_INEXISTENTE';
  END IF;

  INSERT INTO public.asientos_contables (
    tenant_id,
    fecha,
    concepto,
    descripcion,
    referencia,
    total_debe,
    total_haber,
    estado,
    tipo_asiento,
    origen,
    source_event_id,
    reversion_de_asiento_id,
    created_by,
    confirmado_por,
    confirmado_en
  ) VALUES (
    p_tenant_id,
    (p_asiento->>'fecha')::timestamptz,
    p_asiento->>'concepto',
    COALESCE(p_asiento->>'descripcion', p_asiento->>'concepto'),
    NULLIF(p_asiento->>'referencia', ''),
    v_total_debe,
    v_total_haber,
    v_estado,
    NULLIF(p_asiento->>'tipo_asiento', ''),
    NULLIF(p_asiento->>'origen', ''),
    NULLIF(p_asiento->>'source_event_id', '')::uuid,
    NULLIF(p_asiento->>'reversion_de_asiento_id', '')::uuid,
    NULLIF(p_asiento->>'created_by', ''),
    CASE WHEN v_estado = 'CONFIRMADO' THEN NULLIF(p_asiento->>'confirmado_por', '') ELSE NULL END,
    CASE
      WHEN v_estado = 'CONFIRMADO'
        THEN COALESCE(NULLIF(p_asiento->>'confirmado_en', '')::timestamptz, now())
      ELSE NULL
    END
  )
  RETURNING * INTO v_asiento;

  INSERT INTO public.detalle_asientos (
    tenant_id,
    asiento_id,
    cuenta_id,
    debe,
    haber,
    concepto,
    centro_costo_id
  )
  SELECT
    p_tenant_id,
    v_asiento.id,
    x.cuenta_id,
    round(COALESCE(x.debe, 0), 2),
    round(COALESCE(x.haber, 0), 2),
    COALESCE(x.concepto, ''),
    x.centro_costo_id
  FROM jsonb_to_recordset(p_detalles)
    AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid);

  IF v_plantilla_id IS NOT NULL THEN
    INSERT INTO public.plantillas_asientos_historial (
      tenant_id,
      plantilla_id,
      asiento_id,
      periodo,
      generado_por,
      automatico
    ) VALUES (
      p_tenant_id,
      v_plantilla_id,
      v_asiento.id,
      v_plantilla_periodo,
      NULLIF(p_asiento->>'plantilla_generado_por', ''),
      COALESCE((p_asiento->>'plantilla_automatico')::boolean, false)
    );
  END IF;

  RETURN to_jsonb(v_asiento);
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_asiento_con_detalles_tx(uuid, jsonb, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_asiento_con_detalles_tx(uuid, jsonb, jsonb)
TO service_role;

CREATE OR REPLACE FUNCTION public.actualizar_asiento_borrador_tx(
  p_tenant_id uuid,
  p_asiento_id uuid,
  p_asiento jsonb,
  p_detalles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_asiento public.asientos_contables;
  v_total_debe numeric;
  v_total_haber numeric;
  v_num_detalles integer;
  v_num_cuentas integer;
BEGIN
  SELECT * INTO v_asiento
  FROM public.asientos_contables a
  WHERE a.id = p_asiento_id
    AND a.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASIENTO_NO_ENCONTRADO';
  END IF;

  IF upper(COALESCE(v_asiento.estado::text, '')) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'ASIENTO_NO_ES_BORRADOR';
  END IF;

  IF jsonb_typeof(COALESCE(p_detalles, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_detalles) < 2 THEN
    RAISE EXCEPTION 'ASIENTO_DETALLES_INSUFICIENTES';
  END IF;

  SELECT
    count(*),
    round(COALESCE(sum(COALESCE(x.debe, 0)), 0), 2),
    round(COALESCE(sum(COALESCE(x.haber, 0)), 0), 2)
  INTO v_num_detalles, v_total_debe, v_total_haber
  FROM jsonb_to_recordset(p_detalles)
    AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid);

  IF v_total_debe <> v_total_haber OR v_total_debe <= 0 THEN
    RAISE EXCEPTION 'ASIENTO_NO_CUADRA:%:%', v_total_debe, v_total_haber;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalles)
      AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid)
    WHERE x.cuenta_id IS NULL
       OR COALESCE(x.debe, 0) < 0
       OR COALESCE(x.haber, 0) < 0
       OR (COALESCE(x.debe, 0) = 0 AND COALESCE(x.haber, 0) = 0)
       OR (COALESCE(x.debe, 0) > 0 AND COALESCE(x.haber, 0) > 0)
  ) THEN
    RAISE EXCEPTION 'ASIENTO_DETALLE_INVALIDO';
  END IF;

  SELECT count(*)
  INTO v_num_cuentas
  FROM jsonb_to_recordset(p_detalles)
    AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid)
  JOIN public.plan_cuentas c
    ON c.id = x.cuenta_id
   AND c.tenant_id = p_tenant_id;

  IF v_num_cuentas <> v_num_detalles THEN
    RAISE EXCEPTION 'ASIENTO_CUENTA_AJENA_O_INEXISTENTE';
  END IF;

  UPDATE public.asientos_contables a
  SET fecha = (p_asiento->>'fecha')::timestamptz,
      concepto = p_asiento->>'concepto',
      referencia = NULLIF(p_asiento->>'referencia', ''),
      total_debe = v_total_debe,
      total_haber = v_total_haber,
      updated_at = now()
  WHERE a.id = p_asiento_id
    AND a.tenant_id = p_tenant_id
    AND upper(a.estado::text) = 'BORRADOR'
  RETURNING * INTO v_asiento;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASIENTO_CAMBIO_CONCURRENTEMENTE';
  END IF;

  DELETE FROM public.detalle_asientos d
  WHERE d.asiento_id = p_asiento_id
    AND d.tenant_id = p_tenant_id;

  INSERT INTO public.detalle_asientos (
    tenant_id,
    asiento_id,
    cuenta_id,
    debe,
    haber,
    concepto,
    centro_costo_id
  )
  SELECT
    p_tenant_id,
    p_asiento_id,
    x.cuenta_id,
    round(COALESCE(x.debe, 0), 2),
    round(COALESCE(x.haber, 0), 2),
    COALESCE(x.concepto, ''),
    x.centro_costo_id
  FROM jsonb_to_recordset(p_detalles)
    AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid);

  RETURN to_jsonb(v_asiento);
END;
$function$;

REVOKE ALL ON FUNCTION public.actualizar_asiento_borrador_tx(uuid, uuid, jsonb, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_asiento_borrador_tx(uuid, uuid, jsonb, jsonb)
TO service_role;

COMMENT ON FUNCTION public.crear_asiento_con_detalles_tx(uuid, jsonb, jsonb)
IS 'Crea cabecera y detalles de un asiento en una sola transaccion.';

COMMENT ON FUNCTION public.actualizar_asiento_borrador_tx(uuid, uuid, jsonb, jsonb)
IS 'Reemplaza cabecera y detalles de un borrador en una sola transaccion con lock de estado.';

COMMIT;
