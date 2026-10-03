BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- El agregado y el recibo de la intención se confirman juntos. No altera libros
-- existentes ni cambia los escritores de plantillas o eventos contables.
CREATE OR REPLACE FUNCTION app.crear_asiento_manual_tx_557(
  p_tenant_id uuid, p_actor_id uuid, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key,'')));
  v_fingerprint text;
  v_operation public.financial_master_operations%ROWTYPE;
  v_period public.periodos_contables%ROWTYPE;
  v_instant timestamptz;
  v_calendar timestamp;
  v_zone text := 'UTC';
  v_previous_zone text;
  v_state text := upper(coalesce(p_payload->>'estado','CONFIRMADO'));
  v_asiento jsonb;
  v_result jsonb;
BEGIN
  PERFORM app.assert_financial_master_actor_477(p_tenant_id,p_actor_id);
  IF length(v_key) NOT BETWEEN 8 AND 200 OR jsonb_typeof(coalesce(p_payload,'null')) <> 'object'
     OR v_state NOT IN ('BORRADOR','CONFIRMADO') THEN
    RAISE EXCEPTION 'MANUAL_ACCOUNTING_REQUEST_INVALID';
  END IF;
  v_fingerprint := app.financial_master_fingerprint_477(p_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':manual-accounting:'||v_key,0));
  SELECT * INTO v_operation FROM public.financial_master_operations
    WHERE tenant_id=p_tenant_id AND operation_type='ACCOUNTING_MANUAL_CREATE' AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_operation.actor_id <> p_actor_id OR v_operation.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MANUAL_ACCOUNTING_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_operation.result || jsonb_build_object('idempotent',true);
  END IF;

  v_instant := (p_payload->>'fecha')::timestamptz;
  v_calendar := v_instant AT TIME ZONE 'UTC';
  -- Medianoche UTC exacta representa fecha de calendario, como en fecha-tenant.
  IF date_trunc('day',v_calendar) IS DISTINCT FROM v_calendar THEN
    v_zone := app.zona_horaria_pais((SELECT pais FROM public.empresa_config WHERE tenant_id=p_tenant_id));
    v_calendar := v_instant AT TIME ZONE v_zone;
  END IF;
  SELECT * INTO v_period FROM public.periodos_contables
    WHERE tenant_id=p_tenant_id AND anio=extract(year FROM v_calendar)::integer
      AND mes=extract(month FROM v_calendar)::integer FOR SHARE;
  IF NOT FOUND OR upper(v_period.estado) <> 'ABIERTO' THEN
    RAISE EXCEPTION 'MANUAL_ACCOUNTING_PERIOD_NOT_OPEN';
  END IF;
  IF jsonb_typeof(coalesce(p_payload->'detalles','null')) <> 'array' THEN
    RAISE EXCEPTION 'ASIENTO_DETALLES_INSUFICIENTES';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_payload->'detalles') AS line(cuenta_id uuid)
    LEFT JOIN public.plan_cuentas pc ON pc.id=line.cuenta_id AND pc.tenant_id=p_tenant_id
    WHERE pc.id IS NULL OR NOT coalesce(pc.activo,true) OR NOT coalesce(pc.acepta_movimiento,false)) THEN
    RAISE EXCEPTION 'ASIENTO_CUENTA_AJENA_INACTIVA_O_NO_IMPUTABLE';
  END IF;
  -- Los guards existentes convierten timestamptz a date. Su zona durante esta
  -- escritura debe coincidir con el período validado; se restaura al terminar.
  v_previous_zone := current_setting('TimeZone');
  PERFORM set_config('TimeZone',v_zone,true);
  v_asiento := public.crear_asiento_con_detalles_tx(p_tenant_id,jsonb_build_object(
    'fecha',v_instant,'concepto',p_payload->>'concepto','referencia',p_payload->>'referencia',
    'estado',v_state,'created_by',p_actor_id::text,
    'confirmado_por',CASE WHEN v_state='CONFIRMADO' THEN p_actor_id::text END,
    'confirmado_en',CASE WHEN v_state='CONFIRMADO' THEN clock_timestamp() END
  ),p_payload->'detalles');
  PERFORM set_config('TimeZone',v_previous_zone,true);
  v_result := jsonb_build_object('asiento_id',(v_asiento->>'id')::uuid,'idempotent',false);
  INSERT INTO public.financial_master_operations(tenant_id,operation_type,idempotency_key,
    request_fingerprint,actor_id,record_id,result)
    VALUES(p_tenant_id,'ACCOUNTING_MANUAL_CREATE',v_key,v_fingerprint,p_actor_id,(v_asiento->>'id')::uuid,v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_asiento_manual_tx(
  p_tenant_id uuid, p_actor_id uuid, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $$ SELECT app.crear_asiento_manual_tx_557($1,$2,$3,$4) $$;
REVOKE ALL ON FUNCTION app.crear_asiento_manual_tx_557(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crear_asiento_manual_tx(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crear_asiento_manual_tx(uuid,uuid,jsonb,text) TO service_role;
-- Reapertura administrativa dedicada: el actor global conserva su identidad al
-- cambiar de contexto. No amplía los guards de otros escritores contables ni
-- modifica la RPC histórica. Locks, reglas y cierre anual se conservan.
CREATE OR REPLACE FUNCTION public.reabrir_periodo_contable_admin_tx(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_periodo public.periodos_contables;
  v_estado text;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, true);

  SELECT p.* INTO v_periodo
  FROM public.periodos_contables p
  WHERE p.tenant_id = p_tenant_id AND p.anio = p_anio AND p.mes = p_mes
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND:%-%', p_anio, p_mes;
  END IF;

  v_estado := upper(v_periodo.estado::text);
  IF v_estado = 'ABIERTO' THEN
    RETURN jsonb_build_object('periodo', to_jsonb(v_periodo), 'idempotent', true);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.periodos_contables later
    WHERE later.tenant_id = p_tenant_id
      AND upper(later.estado::text) = 'CERRADO'
      AND (later.anio, later.mes) > (p_anio, p_mes)
  ) THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_LATER_CLOSED_PERIODS' USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.period_transition_458', 'on', true);
  UPDATE public.periodos_contables p
  SET estado = 'ABIERTO',
      fecha_cierre = NULL,
      cerrado_por = NULL,
      metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'reabierto_en', now(),
        'reabierto_por', p_actor_id
      ),
      updated_at = now()
  WHERE p.id = v_periodo.id
  RETURNING p.* INTO v_periodo;
  PERFORM set_config('app.period_transition_458', 'off', true);

  IF v_estado = 'CERRADO' THEN
    UPDATE public.asientos_contables a
    SET estado = 'ANULADO',
        anulado_por = p_actor_id::text,
        anulado_en = now(),
        motivo_anulacion = format('Reapertura del periodo %s-%s', p_anio, lpad(p_mes::text, 2, '0')),
        updated_at = now()
    WHERE a.tenant_id = p_tenant_id
      AND upper(COALESCE(a.estado::text, '')) = 'CONFIRMADO'
      AND upper(COALESCE(a.origen, '')) = 'CIERRE_ANUAL'
      AND COALESCE(a.fecha, a.created_at)::date >= make_date(p_anio, p_mes, 1)
      AND COALESCE(a.fecha, a.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date;
  END IF;

  RETURN jsonb_build_object('periodo', to_jsonb(v_periodo), 'idempotent', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
