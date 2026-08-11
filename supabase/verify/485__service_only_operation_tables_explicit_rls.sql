\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_485_SOLO_ERP_E2E:%',current_database();END IF;END $$;
DO $verify$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['caja_operaciones_474','configuration_operation_intents','cxp_ajustes_proveedor','pedido_cancelaciones','rrhh_operaciones_475'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=v_table AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'VERIFY_485_RLS_FLAGS:%',v_table;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_table AND policyname='service_only_no_direct_access_485'
    AND coalesce(qual,'')='false' AND coalesce(with_check,'')='false') THEN
    RAISE EXCEPTION 'VERIFY_485_DENY_POLICY:%',v_table;
  END IF;
  IF has_table_privilege('authenticated',format('public.%I',v_table),'SELECT')
     OR has_table_privilege('authenticated',format('public.%I',v_table),'INSERT')
     OR has_table_privilege('service_role',format('public.%I',v_table),'INSERT')
     OR has_table_privilege('service_role',format('public.%I',v_table),'UPDATE')
     OR has_table_privilege('service_role',format('public.%I',v_table),'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_485_ACL:%',v_table;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.v_rls_tenant_tables_audit WHERE needs_attention) THEN
  RAISE EXCEPTION 'VERIFY_485_GLOBAL_RLS_AUDIT_FAILED';
 END IF;
END $verify$;
ROLLBACK;
