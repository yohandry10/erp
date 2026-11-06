\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  result jsonb;
  previous_base numeric;
  previous_igv numeric;
  previous_isc numeric;
  previous_total numeric;
  source_base numeric;
  source_igv numeric;
  source_isc numeric;
  source_total numeric;
  i integer;
  sample record;
  denied boolean;
BEGIN
  IF current_database()<>'erp_e2e' OR NOT EXISTS(
    SELECT 1 FROM app.deployment_environment WHERE singleton
      AND environment='DEV' AND project_ref='localerpephemeralqax'
  ) THEN RAISE EXCEPTION 'VERIFY596_LOCAL_ONLY'; END IF;

  result := app.rma_line_credit_allocation_596(1,.03,.01,0,.04,.5,0,0,0,0,0);
  IF result<>jsonb_build_object('base',.02,'igv',0,'isc',0,'total',.02) THEN
    RAISE EXCEPTION 'VERIFY596_FIRST_HALF:%',result; END IF;
  result := app.rma_line_credit_allocation_596(1,.03,.01,0,.04,.5,.5,.02,0,0,.02);
  IF result<>jsonb_build_object('base',.01,'igv',.01,'isc',0,'total',.02) THEN
    RAISE EXCEPTION 'VERIFY596_SECOND_HALF:%',result; END IF;

  -- Muchas fracciones: se acreditan exactamente los componentes originales,
  -- nunca importes negativos ni un céntimo por encima de cada componente.
  FOR sample IN SELECT * FROM (VALUES
    (.03::numeric,.01::numeric,0::numeric),
    (.01::numeric,.01::numeric,.01::numeric),
    (33.33::numeric,6::numeric,0::numeric),
    (999999.99::numeric,180000::numeric,100::numeric)
  ) s(base,igv,isc) LOOP
    source_base:=sample.base;source_igv:=sample.igv;source_isc:=sample.isc;
    source_total:=source_base+source_igv+source_isc;
    previous_base:=0;previous_igv:=0;previous_isc:=0;previous_total:=0;
    FOR i IN 1..1000 LOOP
      result:=app.rma_line_credit_allocation_596(1,source_base,source_igv,
        source_isc,source_total,.001,(i-1)::numeric/1000,
        previous_base,previous_igv,previous_isc,previous_total);
      IF (result->>'base')::numeric<0 OR (result->>'igv')::numeric<0
        OR (result->>'isc')::numeric<0 OR (result->>'total')::numeric<0
        OR (result->>'base')::numeric+(result->>'igv')::numeric+
          (result->>'isc')::numeric<>(result->>'total')::numeric THEN
        RAISE EXCEPTION 'VERIFY596_NEGATIVE_OR_UNBALANCED:%:%',i,result; END IF;
      previous_base:=previous_base+(result->>'base')::numeric;
      previous_igv:=previous_igv+(result->>'igv')::numeric;
      previous_isc:=previous_isc+(result->>'isc')::numeric;
      previous_total:=previous_total+(result->>'total')::numeric;
      IF previous_base>source_base OR previous_igv>source_igv OR previous_isc>source_isc
        OR previous_total<>round(source_total*i/1000,2) THEN
        RAISE EXCEPTION 'VERIFY596_CUMULATIVE_LIMIT:%',i; END IF;
    END LOOP;
    IF previous_base<>source_base OR previous_igv<>source_igv
      OR previous_isc<>source_isc OR previous_total<>source_total THEN
      RAISE EXCEPTION 'VERIFY596_FULL_RETURN_MUST_EQUAL_ORIGINAL'; END IF;
  END LOOP;

  denied:=false;
  BEGIN PERFORM app.rma_line_credit_allocation_596(1,.03,.01,0,.04,.5,.5,.02,.01,0,.03);
  EXCEPTION WHEN check_violation THEN
    denied:=SQLERRM='RMA_CREDIT_NOTE_PRIOR_ROUNDING_REVIEW_REQUIRED'; END;
  IF NOT denied THEN RAISE EXCEPTION 'VERIFY596_BAD_HISTORY_ACCEPTED'; END IF;
  denied:=false;
  BEGIN PERFORM app.rma_line_credit_allocation_596(1,.03,.01,0,.04,.51,.5,.02,0,0,.02);
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'VERIFY596_EXCESS_QUANTITY_ACCEPTED'; END IF;
  denied:=false;
  BEGIN PERFORM app.rma_line_credit_allocation_596(1,.03,.01,0,.05,.5,0,0,0,0,0);
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'VERIFY596_INCOHERENT_SOURCE_ACCEPTED'; END IF;

  IF has_function_privilege('anon','app.rma_line_credit_allocation_596(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)','EXECUTE')
    OR has_function_privilege('authenticated','app.rma_line_credit_allocation_596(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)','EXECUTE')
    OR has_function_privilege('service_role','app.rma_line_credit_allocation_596(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY596_PRIVATE_HELPER_EXPOSED'; END IF;
  IF strpos(pg_get_functiondef('public.emitir_nota_credito_rma_legacy_532(uuid,uuid,uuid,jsonb,text)'::regprocedure),'cumulative_credit_rounding_596')=0 THEN
    RAISE EXCEPTION 'VERIFY596_REAL_WRITER_NOT_PATCHED'; END IF;
  RAISE NOTICE 'PASS596: acumulación, límites,4000fracciones, historia incoherente y helper privado';
END;
$verify$;
ROLLBACK;
