-- Corrige el iterador de lineas de la RPC 405. PostgreSQL no permite combinar
-- WITH ORDINALITY con la lista de columnas de una funcion que retorna record;
-- jsonb_array_elements preserva el orden y jsonb_to_record tipa cada objeto.

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION public.guardar_plantilla_con_detalles_tx(
  p_tenant_id uuid,
  p_user_id text,
  p_plantilla_id uuid,
  p_plantilla jsonb,
  p_detalles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
DECLARE
  v_plantilla public.plantillas_asientos;
  v_num_detalles integer;
  v_num_cuentas integer;
  v_num_centros integer;
  v_num_centros_validos integer;
  v_total_debe numeric;
  v_total_haber numeric;
  v_periodicidad text := upper(COALESCE(NULLIF(btrim(p_plantilla->>'periodicidad'), ''), 'NINGUNA'));
BEGIN
  IF p_tenant_id IS NULL
     OR jsonb_typeof(COALESCE(p_plantilla, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'PLANTILLA_PARAMETROS_REQUERIDOS';
  END IF;

  IF jsonb_typeof(COALESCE(p_detalles, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_detalles) < 2 THEN
    RAISE EXCEPTION 'PLANTILLA_DETALLES_INSUFICIENTES';
  END IF;

  SELECT
    count(*),
    round(COALESCE(sum(COALESCE(x.debe, 0)), 0), 2),
    round(COALESCE(sum(COALESCE(x.haber, 0)), 0), 2),
    count(*) FILTER (WHERE x.centro_costo_id IS NOT NULL)
  INTO v_num_detalles, v_total_debe, v_total_haber, v_num_centros
  FROM jsonb_to_recordset(p_detalles)
    AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid);

  IF v_total_debe <> v_total_haber OR v_total_debe <= 0 THEN
    RAISE EXCEPTION 'PLANTILLA_NO_CUADRA:%:%', v_total_debe, v_total_haber;
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
    RAISE EXCEPTION 'PLANTILLA_DETALLE_INVALIDO';
  END IF;

  SELECT count(*) INTO v_num_cuentas
  FROM jsonb_to_recordset(p_detalles)
    AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid)
  JOIN public.plan_cuentas c
    ON c.id = x.cuenta_id
   AND c.tenant_id = p_tenant_id;

  IF v_num_cuentas <> v_num_detalles THEN
    RAISE EXCEPTION 'PLANTILLA_CUENTA_AJENA_O_INEXISTENTE';
  END IF;

  SELECT count(*) INTO v_num_centros_validos
  FROM jsonb_to_recordset(p_detalles)
    AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid)
  JOIN public.centros_costo cc
    ON cc.id = x.centro_costo_id
   AND cc.tenant_id = p_tenant_id
  WHERE x.centro_costo_id IS NOT NULL;

  IF v_num_centros_validos <> v_num_centros THEN
    RAISE EXCEPTION 'PLANTILLA_CENTRO_AJENO_O_INEXISTENTE';
  END IF;

  IF p_plantilla_id IS NULL THEN
    INSERT INTO public.plantillas_asientos (
      tenant_id, nombre, descripcion, concepto, referencia, periodicidad,
      dia_ejecucion, fecha_inicio, fecha_fin, proxima_ejecucion,
      crear_en_estado, activa, estado, created_by
    ) VALUES (
      p_tenant_id,
      p_plantilla->>'nombre',
      NULLIF(p_plantilla->>'descripcion', ''),
      p_plantilla->>'concepto',
      NULLIF(p_plantilla->>'referencia', ''),
      v_periodicidad,
      NULLIF(p_plantilla->>'dia_ejecucion', '')::integer,
      NULLIF(p_plantilla->>'fecha_inicio', '')::date,
      NULLIF(p_plantilla->>'fecha_fin', '')::date,
      CASE
        WHEN v_periodicidad = 'NINGUNA' THEN NULL
        ELSE COALESCE(NULLIF(p_plantilla->>'fecha_inicio', '')::date, CURRENT_DATE)
      END,
      upper(COALESCE(NULLIF(p_plantilla->>'crear_en_estado', ''), 'BORRADOR')),
      COALESCE((p_plantilla->>'activa')::boolean, true),
      'ACTIVO',
      p_user_id
    )
    RETURNING * INTO v_plantilla;
  ELSE
    SELECT * INTO v_plantilla
    FROM public.plantillas_asientos p
    WHERE p.id = p_plantilla_id
      AND p.tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLANTILLA_NO_ENCONTRADA';
    END IF;

    UPDATE public.plantillas_asientos
    SET nombre = p_plantilla->>'nombre',
        descripcion = NULLIF(p_plantilla->>'descripcion', ''),
        concepto = p_plantilla->>'concepto',
        referencia = NULLIF(p_plantilla->>'referencia', ''),
        periodicidad = v_periodicidad,
        dia_ejecucion = NULLIF(p_plantilla->>'dia_ejecucion', '')::integer,
        fecha_inicio = NULLIF(p_plantilla->>'fecha_inicio', '')::date,
        fecha_fin = NULLIF(p_plantilla->>'fecha_fin', '')::date,
        proxima_ejecucion = CASE
          WHEN v_periodicidad = 'NINGUNA' THEN NULL
          WHEN ultima_ejecucion IS NULL OR proxima_ejecucion IS NULL
            THEN COALESCE(NULLIF(p_plantilla->>'fecha_inicio', '')::date, CURRENT_DATE)
          ELSE proxima_ejecucion
        END,
        crear_en_estado = upper(COALESCE(NULLIF(p_plantilla->>'crear_en_estado', ''), 'BORRADOR')),
        activa = COALESCE((p_plantilla->>'activa')::boolean, true),
        updated_at = now()
    WHERE id = p_plantilla_id
      AND tenant_id = p_tenant_id
    RETURNING * INTO v_plantilla;
  END IF;

  DELETE FROM public.plantillas_asientos_detalle
  WHERE tenant_id = p_tenant_id
    AND plantilla_id = v_plantilla.id;

  INSERT INTO public.plantillas_asientos_detalle (
    tenant_id, plantilla_id, orden, cuenta_id, cuenta_codigo, nombre,
    lado, tipo_valor, valor_base, debe, haber, concepto,
    descripcion, centro_costo_id, estado, activo
  )
  SELECT
    p_tenant_id,
    v_plantilla.id,
    j.ordinalidad::integer,
    x.cuenta_id,
    c.codigo,
    COALESCE(NULLIF(btrim(x.concepto), ''), format('Linea %s', j.ordinalidad)),
    CASE WHEN COALESCE(x.debe, 0) > 0 THEN 'DEBE' ELSE 'HABER' END,
    'FIJO',
    round(GREATEST(COALESCE(x.debe, 0), COALESCE(x.haber, 0)), 2),
    round(COALESCE(x.debe, 0), 2),
    round(COALESCE(x.haber, 0), 2),
    COALESCE(x.concepto, ''),
    COALESCE(NULLIF(btrim(x.concepto), ''), format('Linea %s', j.ordinalidad)),
    x.centro_costo_id,
    'ACTIVO',
    true
  FROM jsonb_array_elements(p_detalles) WITH ORDINALITY AS j(detalle, ordinalidad)
  CROSS JOIN LATERAL jsonb_to_record(j.detalle)
    AS x(cuenta_id uuid, debe numeric, haber numeric, concepto text, centro_costo_id uuid)
  JOIN public.plan_cuentas c
    ON c.id = x.cuenta_id
   AND c.tenant_id = p_tenant_id;

  RETURN to_jsonb(v_plantilla);
END;
$function$;

REVOKE ALL ON FUNCTION public.guardar_plantilla_con_detalles_tx(uuid, text, uuid, jsonb, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_plantilla_con_detalles_tx(uuid, text, uuid, jsonb, jsonb)
TO service_role;

COMMIT;
