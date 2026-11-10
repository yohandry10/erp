\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE total_cents integer; n integer; used numeric; carried numeric; delta numeric; rate numeric;
BEGIN
 IF strpos(pg_get_functiondef('public.registrar_cxc_pago_tx(uuid,uuid,jsonb,uuid)'::regprocedure),'cumulative_cxc_book_598')=0
  OR strpos(pg_get_functiondef('app.rma_currency_credit_597(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure),'cumulative_cxc_book_598')=0 THEN
  RAISE EXCEPTION 'VERIFY_598_WRITERS_NOT_PATCHED'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(role)
  WHERE has_function_privilege(r.role,'app.cxc_book_reduction_598(uuid,uuid,numeric,numeric,boolean)','EXECUTE')) THEN
  RAISE EXCEPTION 'VERIFY_598_PRIVATE_HELPER_EXPOSED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.oid='app.cxc_book_reduction_598(uuid,uuid,numeric,numeric,boolean)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
  RAISE EXCEPTION 'VERIFY_598_PUBLIC_EXECUTE'; END IF;
 -- Centavos consumidos: el último pago nunca excede ni deja saldo del origen.
 FOREACH rate IN ARRAY ARRAY[1,3.7,3.8,4.5] LOOP
  FOR total_cents IN 1..500 LOOP
   used:=0;carried:=0;
   FOR n IN 1..total_cents LOOP
    delta:=round((used+.01)*rate,2)-carried;
    IF delta<0 THEN RAISE EXCEPTION 'VERIFY_598_NEGATIVE_ALLOCATION'; END IF;
    used:=used+.01;carried:=carried+delta;
   END LOOP;
   IF used<>total_cents/100.0 OR carried<>round(total_cents/100.0*rate,2) THEN
    RAISE EXCEPTION 'VERIFY_598_NOT_CONSERVED'; END IF;
  END LOOP;
 END LOOP;
END;
$verify$;
ROLLBACK;
