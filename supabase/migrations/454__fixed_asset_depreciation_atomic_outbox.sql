-- Depreciacion de activos: cuota, acumulado y evento contable en un solo commit.
--
-- Antes de esta migracion, registrar_depreciacion_tx actualizaba el activo y
-- dejaba que un cron intentara crear el outbox durante las siguientes 24 horas.
-- Una caida larga o un error Supabase no lanzado dejaba gasto sin asiento.

BEGIN;

SET LOCAL search_path = public, app, extensions, pg_temp;
SET LOCAL lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS ux_depreciaciones_tenant_evento_454
  ON public.depreciaciones (tenant_id, evento_id)
  WHERE tenant_id IS NOT NULL AND evento_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.asegurar_depreciacion_outbox_454(
  p_tenant_id uuid,
  p_depreciacion_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_dep public.depreciaciones%ROWTYPE;
  v_outbox public.outbox_events%ROWTYPE;
  v_event_id uuid;
  v_key text;
  v_payload jsonb;
  v_repaired boolean := false;
BEGIN
  IF p_tenant_id IS NULL OR p_depreciacion_id IS NULL THEN
    RAISE EXCEPTION 'DEPRECIACION_TENANT_E_ID_REQUERIDOS' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  SELECT * INTO v_dep
  FROM public.depreciaciones d
  WHERE d.id = p_depreciacion_id
    AND d.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPRECIACION_NO_ENCONTRADA:%', p_depreciacion_id
      USING ERRCODE = 'P0002';
  END IF;

  IF lower(COALESCE(v_dep.estado::text, '')) = 'anulada'
     OR NOT COALESCE(v_dep.activo, true)
     OR COALESCE(v_dep.monto_depreciacion, 0) <= 0 THEN
    RAISE EXCEPTION 'DEPRECIACION_NO_CONTABILIZABLE:%', p_depreciacion_id
      USING ERRCODE = '23514';
  END IF;

  v_key := format(
    'depreciacion.generada:%s:%s',
    p_tenant_id,
    p_depreciacion_id
  );

  SELECT * INTO v_outbox
  FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id
    AND o.event_type = 'depreciacion.generada'
    AND (
      o.idempotency_key = v_key
      OR (v_dep.evento_id IS NOT NULL AND o.event_id = v_dep.evento_id)
    )
  ORDER BY (o.idempotency_key = v_key) DESC, o.created_at, o.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_outbox.aggregate_type IS DISTINCT FROM 'depreciacion'
       OR v_outbox.aggregate_id NOT IN (p_depreciacion_id::text, v_dep.activo_id::text)
       OR (
         v_outbox.payload ? 'monto'
         AND round((v_outbox.payload->>'monto')::numeric, 2)
             <> round(v_dep.monto_depreciacion, 2)
       )
       OR (
         v_outbox.payload ? 'periodo'
         AND v_outbox.payload->>'periodo' IS DISTINCT FROM v_dep.periodo
       ) THEN
      RAISE EXCEPTION 'DEPRECIACION_OUTBOX_CONFLICTO:%', p_depreciacion_id
        USING ERRCODE = '23505';
    END IF;
    v_event_id := COALESCE(v_outbox.event_id, v_dep.evento_id, gen_random_uuid());
    v_repaired := v_outbox.event_id IS NULL
      OR v_outbox.idempotency_key IS DISTINCT FROM v_key
      OR v_outbox.aggregate_id IS DISTINCT FROM p_depreciacion_id::text;
  ELSE
    v_event_id := COALESCE(v_dep.evento_id, gen_random_uuid());
    v_repaired := v_dep.evento_id IS NOT NULL OR COALESCE(v_dep.procesado_outbox, false);
  END IF;

  v_payload := jsonb_build_object(
    'eventId', v_event_id,
    'tenantId', p_tenant_id,
    'idempotencyKey', v_key,
    'depreciacionId', p_depreciacion_id,
    'activoId', v_dep.activo_id,
    'periodo', v_dep.periodo,
    'fecha', v_dep.fecha_depreciacion,
    'monto', round(v_dep.monto_depreciacion, 2),
    'depreciacionAcumulada', round(COALESCE(v_dep.depreciacion_acumulada, 0), 2),
    'valorNeto', round(COALESCE(v_dep.valor_neto, 0), 2),
    'centro_costo_id', v_dep.centro_costo_id,
    'referencia', format('DEPRECIACION:%s:%s', v_dep.activo_id, v_dep.periodo),
    'accountingHandledByOutbox', true
  );

  IF v_outbox.id IS NULL THEN
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at
    ) VALUES (
      p_tenant_id, 'depreciacion', p_depreciacion_id::text,
      'depreciacion.generada', v_payload,
      'pending', 0, v_key, v_event_id,
      COALESCE(v_dep.fecha_depreciacion::timestamptz, clock_timestamp())
    )
    RETURNING * INTO v_outbox;
  ELSE
    UPDATE public.outbox_events
    SET aggregate_type = 'depreciacion',
        aggregate_id = p_depreciacion_id::text,
        idempotency_key = v_key,
        event_id = v_event_id,
        payload = COALESCE(payload, '{}'::jsonb) || v_payload,
        updated_at = now()
    WHERE id = v_outbox.id
    RETURNING * INTO v_outbox;
  END IF;

  UPDATE public.depreciaciones
  SET procesado_outbox = true,
      evento_id = v_event_id,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'accounting_handled_by_outbox', true,
        'outbox_event_id', v_event_id,
        'outbox_idempotency_key', v_key
      ),
      updated_at = now()
  WHERE id = p_depreciacion_id
    AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'depreciacionId', p_depreciacion_id,
    'eventId', v_event_id,
    'outboxId', v_outbox.id,
    'idempotencyKey', v_key,
    'repaired', v_repaired
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.asegurar_depreciacion_outbox_tx(
  p_tenant_id uuid,
  p_depreciacion_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.asegurar_depreciacion_outbox_454(p_tenant_id, p_depreciacion_id);
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
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_activo public.activos_fijos%ROWTYPE;
  v_depreciacion public.depreciaciones%ROWTYPE;
  v_actor_id uuid := app.to_uuid_or_null(COALESCE(p_created_by, ''));
  v_situacion text;
  v_fingerprint text;
  v_outbox jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_activo_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'DEPRECIACION_ACTOR_REQUERIDO' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = v_actor_id
      AND u.tenant_id = p_tenant_id
      AND COALESCE(u.activo, false)
      AND upper(COALESCE(u.estado::text, 'ACTIVO')) = 'ACTIVO'
  ) THEN
    RAISE EXCEPTION 'DEPRECIACION_ACTOR_INVALIDO' USING ERRCODE = '42501';
  END IF;

  IF p_periodo IS NULL
     OR p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     OR p_fecha IS NULL
     OR to_char(p_fecha, 'YYYY-MM') <> p_periodo
     OR COALESCE(p_monto, 0) <= 0
     OR COALESCE(p_acumulado, 0) <= 0
     OR COALESCE(p_valor_neto, -1) < 0 THEN
    RAISE EXCEPTION 'DEPRECIACION_PAYLOAD_INVALIDO' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  SELECT * INTO v_activo
  FROM public.activos_fijos a
  WHERE a.id = p_activo_id
    AND a.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTIVO_NO_ENCONTRADO:%', p_activo_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_depreciacion
  FROM public.depreciaciones d
  WHERE d.tenant_id = p_tenant_id
    AND d.activo_id = p_activo_id
    AND d.periodo = p_periodo
    AND lower(d.estado::text) IN ('pendiente', 'procesada')
  ORDER BY d.created_at, d.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_depreciacion.fecha_depreciacion IS DISTINCT FROM p_fecha
       OR round(v_depreciacion.monto_depreciacion, 2) <> round(p_monto, 2)
       OR round(COALESCE(v_depreciacion.depreciacion_acumulada, 0), 2)
          <> round(p_acumulado, 2)
       OR round(COALESCE(v_depreciacion.valor_neto, 0), 2) <> round(p_valor_neto, 2)
       OR v_depreciacion.centro_costo_id IS DISTINCT FROM p_centro_costo_id THEN
      RAISE EXCEPTION 'DEPRECIACION_PAYLOAD_CONFLICTO:%:%', p_activo_id, p_periodo
        USING ERRCODE = '23505';
    END IF;

    v_outbox := app.asegurar_depreciacion_outbox_454(
      p_tenant_id,
      v_depreciacion.id
    );
    RETURN jsonb_build_object(
      'depreciacion', to_jsonb(v_depreciacion),
      'situacion', v_activo.situacion,
      'outbox', v_outbox,
      'idempotent', true
    );
  END IF;

  IF upper(COALESCE(v_activo.situacion, '')) <> 'ACTIVO' THEN
    RAISE EXCEPTION 'ACTIVO_NO_DEPRECIABLE:%', p_activo_id USING ERRCODE = '23514';
  END IF;

  IF p_centro_costo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.centros_costo c
    WHERE c.id = p_centro_costo_id AND c.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'DEPRECIACION_CENTRO_COSTO_INVALIDO' USING ERRCODE = '23503';
  END IF;

  IF round(COALESCE(v_activo.depreciacion_acumulada, 0) + p_monto, 2)
        <> round(p_acumulado, 2)
     OR round(COALESCE(v_activo.valor_adquisicion, 0) - p_acumulado, 2)
        <> round(p_valor_neto, 2)
     OR p_acumulado > COALESCE(v_activo.valor_adquisicion, 0)
                        - COALESCE(v_activo.valor_residual, 0) + 0.005 THEN
    RAISE EXCEPTION 'DEPRECIACION_CAMBIO_CONCURRENTEMENTE:%', p_activo_id
      USING ERRCODE = '40001';
  END IF;

  v_situacion := CASE
    WHEN round(p_valor_neto, 2) <= round(COALESCE(v_activo.valor_residual, 0), 2)
      THEN 'DEPRECIADO'
    ELSE 'ACTIVO'
  END;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        concat_ws('|', p_tenant_id, p_activo_id, p_periodo, p_fecha,
          round(p_monto, 2), round(p_acumulado, 2), round(p_valor_neto, 2),
          COALESCE(p_centro_costo_id::text, '')),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.depreciaciones (
    tenant_id, activo_id, periodo, fecha_depreciacion, monto_depreciacion,
    depreciacion_acumulada, valor_neto, centro_costo_id, procesado_outbox,
    created_by, estado, metadata
  ) VALUES (
    p_tenant_id, p_activo_id, p_periodo, p_fecha, round(p_monto, 2),
    round(p_acumulado, 2), round(p_valor_neto, 2), p_centro_costo_id, false,
    v_actor_id::text, 'PENDIENTE',
    jsonb_build_object('depreciation_fingerprint', v_fingerprint)
  )
  RETURNING * INTO v_depreciacion;

  UPDATE public.activos_fijos a
  SET depreciacion_acumulada = round(p_acumulado, 2),
      situacion = v_situacion,
      updated_at = now()
  WHERE a.id = p_activo_id
    AND a.tenant_id = p_tenant_id;

  v_outbox := app.asegurar_depreciacion_outbox_454(
    p_tenant_id,
    v_depreciacion.id
  );

  SELECT * INTO v_depreciacion
  FROM public.depreciaciones
  WHERE id = v_depreciacion.id;

  RETURN jsonb_build_object(
    'depreciacion', to_jsonb(v_depreciacion),
    'situacion', v_situacion,
    'outbox', v_outbox,
    'idempotent', false
  );
END;
$function$;

-- Repara tanto filas olvidadas por la ventana de 24 horas como filas marcadas
-- por el cliente Supabase pese a que el INSERT del outbox habia devuelto error.
DO $block$
DECLARE
  v_dep record;
BEGIN
  FOR v_dep IN
    SELECT d.tenant_id, d.id
    FROM public.depreciaciones d
    WHERE lower(COALESCE(d.estado::text, '')) IN ('pendiente', 'procesada')
      AND COALESCE(d.activo, true)
      AND COALESCE(d.monto_depreciacion, 0) > 0
    ORDER BY d.tenant_id, d.created_at, d.id
  LOOP
    PERFORM app.asegurar_depreciacion_outbox_454(v_dep.tenant_id, v_dep.id);
  END LOOP;
END;
$block$;

REVOKE ALL ON FUNCTION app.asegurar_depreciacion_outbox_454(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.asegurar_depreciacion_outbox_tx(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_depreciacion_tx(
  uuid, uuid, text, date, numeric, numeric, numeric, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.asegurar_depreciacion_outbox_tx(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_depreciacion_tx(
  uuid, uuid, text, date, numeric, numeric, numeric, uuid, text
) TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.depreciaciones
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.registrar_depreciacion_tx(
  uuid, uuid, text, date, numeric, numeric, numeric, uuid, text
) IS 'Registra cuota, actualiza acumulado y publica depreciacion.generada atomicamente; retry natural por activo/periodo.';

COMMENT ON FUNCTION public.asegurar_depreciacion_outbox_tx(uuid, uuid)
IS 'Reconciliacion idempotente service-role-only para depreciaciones historicas sin outbox durable.';

COMMIT;
