\set ON_ERROR_STOP on

BEGIN;

DO $contract$
DECLARE
  v_tenant_id uuid;
  v_cuenta_debe uuid;
  v_cuenta_haber uuid;
  v_event_id uuid := gen_random_uuid();
  v_resultado jsonb;
  v_repetido jsonb;
  v_asiento_id uuid;
  v_count integer;
BEGIN
  SELECT pc.tenant_id, ids[1], ids[2]
  INTO v_tenant_id, v_cuenta_debe, v_cuenta_haber
  FROM (
    SELECT tenant_id, array_agg(id ORDER BY codigo, id) AS ids
    FROM public.plan_cuentas
    WHERE acepta_movimiento IS TRUE
    GROUP BY tenant_id
    HAVING count(*) >= 2
  ) pc
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'QA requiere un tenant con dos cuentas de movimiento';
  END IF;

  v_resultado := public.crear_asiento_contable_tx(
    v_tenant_id,
    clock_timestamp(),
    'QA asiento atomico',
    'QA-ATOMIC',
    'QA',
    v_event_id,
    NULL,
    'qa-contract',
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cuenta_debe, 'debe', 137.50, 'haber', 0, 'concepto', 'Debe QA'),
      jsonb_build_object('cuenta_id', v_cuenta_haber, 'debe', 0, 'haber', 137.50, 'concepto', 'Haber QA')
    )
  );
  v_asiento_id := (v_resultado->>'id')::uuid;

  IF v_asiento_id IS NULL OR (v_resultado->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'La primera llamada no creo el asiento esperado: %', v_resultado;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.detalle_asientos
  WHERE tenant_id = v_tenant_id AND asiento_id = v_asiento_id;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'El asiento atomico tiene % detalles, se esperaban 2', v_count;
  END IF;

  v_repetido := public.crear_asiento_contable_tx(
    v_tenant_id,
    clock_timestamp(),
    'QA asiento atomico repetido',
    'QA-ATOMIC-RETRY',
    'QA',
    v_event_id,
    NULL,
    'qa-contract',
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cuenta_debe, 'debe', 999, 'haber', 0),
      jsonb_build_object('cuenta_id', v_cuenta_haber, 'debe', 0, 'haber', 999)
    )
  );
  IF (v_repetido->>'id')::uuid <> v_asiento_id
     OR NOT (v_repetido->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'La reejecucion no fue idempotente: %', v_repetido;
  END IF;

  BEGIN
    PERFORM public.crear_asiento_contable_tx(
      v_tenant_id,
      clock_timestamp(),
      'QA asiento descuadrado',
      NULL,
      'QA',
      gen_random_uuid(),
      NULL,
      'qa-contract',
      jsonb_build_array(
        jsonb_build_object('cuenta_id', v_cuenta_debe, 'debe', 10, 'haber', 0),
        jsonb_build_object('cuenta_id', v_cuenta_haber, 'debe', 0, 'haber', 9)
      )
    );
    RAISE EXCEPTION 'El contrato acepto un asiento descuadrado';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  IF has_function_privilege(
       'authenticated',
       'public.crear_asiento_contable_tx(uuid,timestamptz,text,text,text,uuid,uuid,text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'authenticated conserva EXECUTE sobre el RPC privilegiado';
  END IF;
  IF NOT has_function_privilege(
       'service_role',
       'public.crear_asiento_contable_tx(uuid,timestamptz,text,text,text,uuid,uuid,text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service_role no puede ejecutar el RPC atomico';
  END IF;

  RAISE NOTICE 'Contrato contable atomico OK: asiento %, tenant %', v_asiento_id, v_tenant_id;
END;
$contract$;

ROLLBACK;
