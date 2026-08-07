\set ON_ERROR_STOP on

BEGIN;

DO $contract$
DECLARE
  v_tenant_id uuid;
  v_proveedor_id uuid;
  v_event_id uuid := gen_random_uuid();
  v_numero text := 'QA-AT-' || upper(substr(gen_random_uuid()::text, 1, 8));
  v_key text;
  v_payload jsonb;
  v_resultado jsonb;
  v_repetido jsonb;
  v_cxp_id uuid;
  v_count integer;
BEGIN
  SELECT p.tenant_id, p.id INTO v_tenant_id, v_proveedor_id
  FROM public.proveedores p
  WHERE p.tenant_id IS NOT NULL
  LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'QA requiere un proveedor con tenant';
  END IF;

  v_key := format('qa:factura:%s:%s', v_tenant_id, v_numero);
  v_payload := jsonb_build_object(
    'proveedor_id', v_proveedor_id,
    'numero_documento', v_numero,
    'fecha_emision', current_date,
    'fecha_vencimiento', current_date,
    'condiciones_pago', 'CONTADO',
    'dias_credito', 0,
    'subtotal', 100,
    'igv', 18,
    'total', 118,
    'saldo', 118,
    'saldo_pendiente', 118,
    'retencion_total', 0,
    'percepcion_total', 0,
    'detraccion_total', 0,
    'anticipo_total', 0,
    'moneda', 'PEN',
    'tipo_documento', 'FACTURA',
    'fiscal_metadata', jsonb_build_object('serie', 'FQA1', 'tipo_cambio', 1),
    'estado', 'PENDIENTE',
    'estado_comparacion', 'OK',
    'discrepancias', '[]'::jsonb
  );

  v_resultado := public.crear_factura_proveedor_tx(
    v_tenant_id, v_payload, v_event_id, v_key
  );
  v_cxp_id := (v_resultado->>'id')::uuid;
  IF v_cxp_id IS NULL OR (v_resultado->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'La primera llamada no creo la CxP esperada: %', v_resultado;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.outbox_events
  WHERE tenant_id = v_tenant_id
    AND event_type = 'factura.proveedor.registrada'
    AND event_id = v_event_id
    AND aggregate_id = v_cxp_id::text;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'La factura no dejo exactamente un evento durable: %', v_count;
  END IF;

  v_repetido := public.crear_factura_proveedor_tx(
    v_tenant_id, v_payload, v_event_id, v_key
  );
  IF (v_repetido->>'id')::uuid <> v_cxp_id
     OR NOT (v_repetido->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'La reejecucion no fue idempotente: %', v_repetido;
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'authenticated conserva EXECUTE sobre el RPC privilegiado';
  END IF;
  IF NOT has_function_privilege(
       'service_role',
       'public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service_role no puede ejecutar el RPC atomico';
  END IF;

  RAISE NOTICE 'Contrato factura proveedor atomica OK: CxP %, evento %', v_cxp_id, v_event_id;
END;
$contract$;

ROLLBACK;
