\set ON_ERROR_STOP on

DO $$
DECLARE
  v_numbers text[];
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'RMA 456 concurrency assert solo puede ejecutarse en erp_e2e';
  END IF;

  SELECT array_agg(numero ORDER BY numero)
  INTO v_numbers
  FROM public.rma_solicitudes
  WHERE tenant_id = '45610000-0000-4000-8000-000000000001';

  IF v_numbers IS DISTINCT FROM ARRAY[
    format('RMA-%s-00001', extract(year FROM app.hoy_tenant('45610000-0000-4000-8000-000000000001'))::int),
    format('RMA-%s-00002', extract(year FROM app.hoy_tenant('45610000-0000-4000-8000-000000000001'))::int)
  ] THEN
    RAISE EXCEPTION 'RMA_456_CONCURRENT_NUMBERS_INVALID: %', v_numbers;
  END IF;

  IF (SELECT count(*) FROM public.rma_items
      WHERE tenant_id = '45610000-0000-4000-8000-000000000001') <> 2
     OR (SELECT sum(cantidad_autorizada) FROM public.rma_items
         WHERE tenant_id = '45610000-0000-4000-8000-000000000001') <> 2
     OR (SELECT count(*) FROM public.rma_operaciones
         WHERE tenant_id = '45610000-0000-4000-8000-000000000001'
           AND tipo = 'CREAR') <> 2
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = '45610000-0000-4000-8000-000000000001'
           AND event_type = 'rma.creada') <> 2 THEN
    RAISE EXCEPTION 'RMA_456_CONCURRENT_PROJECTIONS_INVALID';
  END IF;
END;
$$;
SELECT numero, id, created_at
FROM public.rma_solicitudes
WHERE tenant_id = '45610000-0000-4000-8000-000000000001'
ORDER BY numero;

DELETE FROM public.tenants
WHERE id = '45610000-0000-4000-8000-000000000001'
  AND codigo = 'QA-RMA-456-RACE';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = '45610000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'RMA_456_CONCURRENCY_FIXTURE_NOT_CLEANED';
  END IF;
END;
$$;
