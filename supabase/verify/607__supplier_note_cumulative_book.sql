\set ON_ERROR_STOP on
DO $verify$
DECLARE signature text; role_name text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['app.supplier_note_trace_607(uuid,uuid)',
  'app.supplier_note_history_607(uuid,uuid)',
  'app.supplier_note_book_607(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric)'] LOOP
  IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'NOTE607_HELPER_MISSING'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'NOTE607_HELPER_PUBLIC'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=signature::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'NOTE607_HELPER_PUBLIC'; END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY['public.registrar_nota_credito_proveedor_tx(uuid,uuid,uuid,jsonb,text)',
  'app.cxp_book_reduction_601(uuid,uuid,numeric,numeric)','app.supplier_credit_book_606(uuid,uuid,numeric)'] LOOP
  IF strpos(pg_get_functiondef(signature::regprocedure),'supplier_note_cumulative_607')=0 THEN RAISE EXCEPTION 'NOTE607_PATCH_MISSING'; END IF;
 END LOOP;
END; $verify$;
