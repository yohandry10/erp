\set ON_ERROR_STOP on

BEGIN;

DO $contract$
DECLARE
  v_tenant_id uuid;
  v_proveedor_id uuid;
  v_cxp jsonb;
  v_cxp_id uuid;
  v_banco_id uuid;
  v_resultado jsonb;
  v_repetido jsonb;
  v_key text := 'qa:pago:' || gen_random_uuid()::text;
  v_event_id uuid := gen_random_uuid();
  v_pago_id uuid := gen_random_uuid();
  v_count integer;
BEGIN
  SELECT p.tenant_id, p.id INTO v_tenant_id, v_proveedor_id
  FROM public.proveedores p WHERE p.tenant_id IS NOT NULL LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'QA requiere proveedor'; END IF;
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, true);

  v_cxp := public.crear_factura_proveedor_tx(
    v_tenant_id,
    jsonb_build_object(
      'proveedor_id', v_proveedor_id,
      'numero_documento', 'QA-PAGO-' || upper(substr(gen_random_uuid()::text, 1, 8)),
      'fecha_emision', current_date, 'fecha_vencimiento', current_date,
      'condiciones_pago', 'CONTADO', 'dias_credito', 0,
      'subtotal', 100, 'igv', 18, 'total', 118, 'saldo', 118,
      'retencion_total', 0, 'percepcion_total', 0, 'detraccion_total', 0, 'anticipo_total', 0,
      'moneda', 'PEN', 'tipo_documento', 'FACTURA',
      'fiscal_metadata', jsonb_build_object('tipo_cambio', 1),
      'estado', 'PENDIENTE', 'estado_comparacion', 'OK', 'discrepancias', '[]'::jsonb
    ),
    gen_random_uuid(),
    'qa:factura-pago:' || gen_random_uuid()::text
  );
  v_cxp_id := (v_cxp->>'id')::uuid;

  INSERT INTO public.cuentas_bancarias (
    tenant_id, nombre, banco, numero_cuenta, moneda, tipo_cuenta,
    estado, activa, activo, saldo, saldo_actual, saldo_contable, permite_sobregiro
  ) VALUES (
    v_tenant_id, 'Banco QA Atomic', 'BCP', 'QA-' || substr(gen_random_uuid()::text, 1, 8),
    'PEN', 'CORRIENTE', 'ACTIVO', true, true, 500, 500, 500, false
  ) RETURNING id INTO v_banco_id;

  v_resultado := public.aplicar_pago_cxp_tx(
    v_tenant_id, v_cxp_id,
    jsonb_build_object(
      'pago_id', v_pago_id, 'event_id', v_event_id, 'idempotency_key', v_key,
      'monto', 18, 'fecha_pago', current_date, 'metodo_pago', 'TRANSFERENCIA',
      'cuenta_bancaria_id', v_banco_id, 'referencia', 'OP-QA-ATOMIC'
    ), NULL
  );
  IF (v_resultado->'cxp'->>'saldo')::numeric <> 100
     OR (v_resultado->'movimiento_bancario'->>'id')::uuid <> v_pago_id THEN
    RAISE EXCEPTION 'Resultado bancario inesperado: %', v_resultado;
  END IF;
  IF (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_banco_id) <> 482 THEN
    RAISE EXCEPTION 'El saldo bancario no quedo en 482';
  END IF;
  SELECT count(*) INTO v_count FROM public.outbox_events
  WHERE event_id = v_event_id AND event_type = 'pago.proveedor.registrado';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Pago no dejo un evento durable'; END IF;

  v_repetido := public.aplicar_pago_cxp_tx(
    v_tenant_id, v_cxp_id,
    jsonb_build_object(
      'pago_id', v_pago_id, 'event_id', v_event_id, 'idempotency_key', v_key,
      'monto', 18, 'fecha_pago', current_date, 'metodo_pago', 'TRANSFERENCIA',
      'cuenta_bancaria_id', v_banco_id, 'referencia', 'OP-QA-ATOMIC'
    ), NULL
  );
  IF NOT (v_repetido->>'idempotent')::boolean
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id = v_banco_id) <> 482 THEN
    RAISE EXCEPTION 'La reejecucion bancaria no fue idempotente: %', v_repetido;
  END IF;

  v_resultado := public.aplicar_pago_cxp_tx(
    v_tenant_id, v_cxp_id,
    jsonb_build_object(
      'pago_id', gen_random_uuid(), 'event_id', gen_random_uuid(),
      'idempotency_key', 'qa:pago-efectivo:' || gen_random_uuid()::text,
      'monto', 100, 'fecha_pago', current_date, 'metodo_pago', 'EFECTIVO'
    ), NULL
  );
  IF v_resultado->'cxp'->>'estado' <> 'PAGADA'
     OR v_resultado->'movimiento_bancario' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'El cierre en efectivo no fue correcto: %', v_resultado;
  END IF;
  SELECT count(*) INTO v_count FROM public.pagos_facturas
  WHERE tenant_id = v_tenant_id AND cuenta_por_pagar_id = v_cxp_id AND estado = 'APLICADO';
  IF v_count <> 1 THEN RAISE EXCEPTION 'El pago no bancario no dejo evidencia en pagos_facturas'; END IF;

  RAISE NOTICE 'Contrato pago CxP atomico OK: CxP %, banco %', v_cxp_id, v_banco_id;
END;
$contract$;

ROLLBACK;
