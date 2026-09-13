\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_540_REQUIERE_BASE_EFIMERA_ERP_E2E';
  END IF;
END;
$guard$;
UPDATE app.deployment_environment
SET environment='DEV', project_ref='localerpephemeralqax', allow_demo_data=true,
    configured_at=now(), updated_at=now() WHERE singleton;

CREATE FUNCTION app.verify_540_fail_fiscal_update()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF current_setting('app.verify_540_fail',true)='on' THEN
    RAISE EXCEPTION 'VERIFY_540_LATE_FISCAL_FAILURE';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_verify_540_fail
BEFORE UPDATE OF destino_credito_fiscal ON public.cuentas_por_pagar
FOR EACH ROW EXECUTE FUNCTION app.verify_540_fail_fiscal_update();

DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_provider uuid;
  v_payload jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_case jsonb;
  v_legacy_payload jsonb;
  v_legacy jsonb;
  v_key text := 'verify-540-' || gen_random_uuid()::text;
  v_failed boolean;
BEGIN
  v_demo := public.create_demo_tenant_ready_tx('VERIFY-540-PE',14,'PE',v_key);
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  SELECT id INTO STRICT v_provider FROM public.proveedores WHERE tenant_id=v_tenant ORDER BY id LIMIT 1;
  v_payload := jsonb_build_object(
    'proveedor_id',v_provider, 'created_by',v_actor,
    'numero_documento','F001-00005361', 'tipo_documento','FACTURA',
    'fecha_emision',app.hoy_tenant(v_tenant), 'fecha_vencimiento',app.hoy_tenant(v_tenant)+30,
    'condiciones_pago','CREDITO_30', 'dias_credito',30,
    'subtotal',100, 'igv',18, 'total',118, 'saldo',118, 'estado','PENDIENTE',
    'moneda','PEN', 'fiscal_metadata',jsonb_build_object('serie','F001','tipo_cambio',1),
    'destino_credito_fiscal','COMUN', 'codigo_detraccion','19', 'tipo_cambio_origen',1
  );
  v_result := public.crear_factura_proveedor_tx(v_tenant,v_payload,gen_random_uuid(),v_key||'-invoice');
  IF v_result->>'destino_credito_fiscal' <> 'COMUN'
    OR v_result->>'codigo_detraccion' <> '019'
    OR (v_result->>'tipo_cambio_origen')::numeric <> 1 THEN
    RAISE EXCEPTION 'VERIFY_540_FISCAL_SELECTION_LOST';
  END IF;
  v_replay := public.crear_factura_proveedor_tx(v_tenant,v_payload,gen_random_uuid(),v_key||'-invoice');
  IF v_replay->>'id' <> v_result->>'id' OR NOT (v_replay->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'VERIFY_540_REPLAY_NOT_IDEMPOTENT';
  END IF;
  v_replay := public.crear_factura_proveedor_tx(v_tenant,v_payload || jsonb_build_object(
    'destino_credito_fiscal',' comun ', 'codigo_detraccion','019'
  ),gen_random_uuid(),v_key||'-invoice');
  IF v_replay->>'id' <> v_result->>'id' OR NOT (v_replay->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'VERIFY_540_NORMALIZED_REPLAY_REJECTED';
  END IF;
  FOR v_case IN SELECT * FROM (VALUES
    (jsonb_build_object('destino_credito_fiscal','NO_GRAVADAS')),
    (jsonb_build_object('codigo_detraccion','020')),
    (jsonb_build_object('fecha_emision',app.hoy_tenant(v_tenant)-1)),
    (jsonb_build_object('fiscal_metadata',jsonb_build_object('serie','F002','tipo_cambio',1)))
  ) AS cases(payload) LOOP
    v_failed := false;
    BEGIN
      PERFORM public.crear_factura_proveedor_tx(v_tenant,v_payload||v_case,gen_random_uuid(),v_key||'-invoice');
    EXCEPTION WHEN unique_violation THEN v_failed := true;
    END;
    IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_540_DIFFERENT_CONTEXT_ACCEPTED:%',v_case; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.outbox_events WHERE tenant_id=v_tenant
      AND event_type='factura.proveedor.registrada' AND aggregate_id=v_result->>'id') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_540_DUPLICATE_OUTBOX';
  END IF;

  -- El contexto extranjero también conserva el TC documental para tesorería.
  v_replay := public.crear_factura_proveedor_tx(v_tenant,v_payload || jsonb_build_object(
    'numero_documento','F001-00005362','moneda','USD','tipo_cambio_origen',3.8,
    'destino_credito_fiscal','NO_GRAVADAS','codigo_detraccion',NULL,
    'fiscal_metadata',jsonb_build_object('serie','F001','tipo_cambio',3.8)
  ),gen_random_uuid(),v_key||'-usd');
  IF (v_replay->>'tipo_cambio_origen')::numeric <> 3.8
    OR v_replay->>'destino_credito_fiscal' <> 'NO_GRAVADAS' THEN
    RAISE EXCEPTION 'VERIFY_540_DOCUMENT_RATE_LOST';
  END IF;

  -- Una fila del writer previo admite su contexto acreditado y permanece intacta.
  v_legacy_payload := v_payload || jsonb_build_object(
    'numero_documento','F001-00005364','destino_credito_fiscal','GRAVADAS',
    'codigo_detraccion',NULL
  );
  v_legacy := app.crear_factura_proveedor_tx(v_tenant,v_legacy_payload,gen_random_uuid(),v_key||'-legacy');
  v_replay := public.crear_factura_proveedor_tx(v_tenant,v_legacy_payload,gen_random_uuid(),v_key||'-legacy');
  IF v_replay->>'id' <> v_legacy->>'id' OR NOT (v_replay->>'idempotent')::boolean
    OR EXISTS (SELECT 1 FROM public.cuentas_por_pagar WHERE id=(v_legacy->>'id')::uuid
      AND fiscal_metadata ? 'request_context_540') THEN
    RAISE EXCEPTION 'VERIFY_540_LEGACY_REPLAY_CHANGED_EVIDENCE';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.crear_factura_proveedor_tx(v_tenant,v_legacy_payload || jsonb_build_object(
      'destino_credito_fiscal','COMUN'),gen_random_uuid(),v_key||'-legacy');
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_540_LEGACY_CONTEXT_INFERRED'; END IF;

  -- Un fallo al persistir los campos fiscales revierte también cabecera/outbox.
  PERFORM set_config('app.verify_540_fail','on',true);
  v_failed := false;
  BEGIN
    PERFORM public.crear_factura_proveedor_tx(v_tenant,v_payload||jsonb_build_object(
      'numero_documento','F001-00005363'),gen_random_uuid(),v_key||'-rollback');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'VERIFY_540_LATE_FISCAL_FAILURE' THEN RAISE; END IF;
    v_failed := true;
  END;
  PERFORM set_config('app.verify_540_fail','off',true);
  IF NOT v_failed OR EXISTS (SELECT 1 FROM public.cuentas_por_pagar
    WHERE tenant_id=v_tenant AND numero_documento='F001-00005363')
    OR EXISTS (SELECT 1 FROM public.outbox_events WHERE tenant_id=v_tenant AND idempotency_key=v_key||'-rollback') THEN
    RAISE EXCEPTION 'VERIFY_540_PARTIAL_COMMIT';
  END IF;
  IF NOT has_function_privilege('service_role','public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_540_PRIVILEGES_INVALID';
  END IF;
END;
$verify$;
ROLLBACK;
