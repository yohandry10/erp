\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
 allocated numeric[]; previous numeric[]; exact_cents numeric[];
 caps numeric[]; target numeric; sample record; i integer; denied boolean;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
  WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY597_LOCAL_ONLY'; END IF;
 allocated:=app.rma_allocate_currency_cents_597(ARRAY[7.6,0],ARRAY[0,0],ARRAY[11,4],8);
 IF allocated<>ARRAY[.08,0] THEN RAISE EXCEPTION 'VERIFY597_FIRST_HALF:%',allocated; END IF;
 allocated:=app.rma_allocate_currency_cents_597(ARRAY[11.4,3.8],ARRAY[8,0],ARRAY[11,4],15);
 IF allocated<>ARRAY[.03,.04] THEN RAISE EXCEPTION 'VERIFY597_SECOND_HALF:%',allocated; END IF;
 allocated:=app.rma_allocate_currency_cents_597(ARRAY[7.6,7.6],ARRAY[8,0],ARRAY[27,27],15);
 IF allocated<>ARRAY[0,.07] THEN RAISE EXCEPTION 'VERIFY597_DEBT_AND_CREDIT:%',allocated; END IF;
 FOR sample IN SELECT * FROM (VALUES
  (11::numeric,4::numeric),(3,1),(99999999,18000000),(0,1),(1,0)
 ) s(base,tax) LOOP
  caps:=ARRAY[sample.base,sample.tax];previous:=ARRAY[0,0]::numeric[];
  FOR i IN 1..1000 LOOP
   exact_cents:=ARRAY[caps[1]*i/1000,caps[2]*i/1000];
   target:=round((caps[1]+caps[2])*i/1000);
   allocated:=app.rma_allocate_currency_cents_597(exact_cents,previous,caps,target);
   IF allocated[1]<0 OR allocated[2]<0 THEN RAISE EXCEPTION 'VERIFY597_NEGATIVE'; END IF;
   previous:=ARRAY[previous[1]+allocated[1]*100,previous[2]+allocated[2]*100];
   IF previous[1]+previous[2]<>target OR previous[1]>caps[1] OR previous[2]>caps[2] THEN
    RAISE EXCEPTION 'VERIFY597_LIMIT_OR_SUM'; END IF;
  END LOOP;
  IF previous<>caps THEN RAISE EXCEPTION 'VERIFY597_FULL_CONSERVATION'; END IF;
 END LOOP;
 denied:=false;
 BEGIN PERFORM app.rma_allocate_currency_cents_597(ARRAY[11.4,3.8],ARRAY[12,4],ARRAY[11,4],15);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'VERIFY597_BAD_HISTORY_ACCEPTED'; END IF;
 denied:=false;
 BEGIN PERFORM app.rma_allocate_currency_cents_597(ARRAY[NULL,3.8],ARRAY[0,0],ARRAY[11,4],15);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'VERIFY597_NULL_ACCEPTED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) roles(name)
  WHERE ns.nspname='app' AND p.proname IN ('rma_allocate_currency_cents_597','rma_currency_credit_597')
   AND has_function_privilege(roles.name,p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'VERIFY597_HELPER_EXPOSED'; END IF;
 IF strpos(pg_get_functiondef('public.emitir_nota_credito_rma_legacy_532(uuid,uuid,uuid,jsonb,text)'::regprocedure),'cumulative_currency_rounding_597')=0 THEN
  RAISE EXCEPTION 'VERIFY597_REAL_WRITER_NOT_PATCHED'; END IF;
 RAISE NOTICE 'PASS597:5000fracciones, componentes, CxC/saldo, historia y helpers privados';
END;
$verify$;
ROLLBACK;
