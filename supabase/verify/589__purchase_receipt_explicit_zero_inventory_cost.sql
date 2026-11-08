\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  v_def text;
  v_role text;
  v_target regprocedure := 'public.cerrar_recepcion_tx(uuid,uuid,text,text)'::regprocedure;
BEGIN
  IF current_database()<>'erp_e2e' OR NOT EXISTS (
    SELECT 1 FROM app.deployment_environment
    WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
    RAISE EXCEPTION 'VERIFY_576_LOCAL_ONLY';
  END IF;
  IF to_regprocedure('app.close_receipt_core_617(uuid,uuid,text,text)') IS NOT NULL THEN
    v_def := replace(pg_get_functiondef('app.close_receipt_core_617(uuid,uuid,text,text)'::regprocedure),chr(13),'');
    IF has_function_privilege('service_role','app.close_receipt_core_617(uuid,uuid,text,text)','EXECUTE')
       OR position('app.close_receipt_617' IN pg_get_functiondef(v_target))=0 THEN
      RAISE EXCEPTION 'VERIFY589_PRIVATE_CORE_MUST_USE_VALUED_WRAPPER';
    END IF;
  ELSE
    v_def := replace(pg_get_functiondef(v_target),chr(13),'');
  END IF;
  IF position('''costo_cero_confirmado'', coalesce(v_detalle.precio_unitario = 0, false)' IN v_def)=0
     OR position('''costo_unitario'', coalesce(v_detalle.precio_unitario, 0)' IN v_def)=0 THEN
    RAISE EXCEPTION 'VERIFY_576_EXPLICIT_ZERO_NOT_BOUND_TO_ORDER_PRICE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_target AND prosecdef
      AND proconfig @> ARRAY['search_path=public, app, pg_temp']) THEN
    -- Mantener el search_path exacto ya vigente; no inventar otro contexto.
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_target AND prosecdef
      AND proconfig @> ARRAY['search_path=pg_catalog, public, app, pg_temp']) THEN
      RAISE EXCEPTION 'VERIFY_576_WRITER_SECURITY_CONTEXT_CHANGED';
    END IF;
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(v_role,v_target,'EXECUTE') THEN
      RAISE EXCEPTION 'VERIFY_576_CLIENT_WRITER_EXECUTE_ALLOWED:%',v_role;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role',v_target,'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_576_SERVER_WRITER_EXECUTE_MISSING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.recepciones'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.movimientos_inventario'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'VERIFY_576_RLS_MISSING';
  END IF;
END;
$verify$;
ROLLBACK;
