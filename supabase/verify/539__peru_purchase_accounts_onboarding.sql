\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
  v_tenant uuid;
  v_other uuid;
  v_count integer;
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_539_REQUIERE_BASE_EFIMERA_ERP_E2E';
  END IF;
  UPDATE app.deployment_environment
  SET environment='DEV', project_ref='localerpephemeralqax', allow_demo_data=true,
      configured_at=now(), updated_at=now()
  WHERE singleton;
  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-539-PE', 14, 'PE', 'verify-539-pe-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;
  SELECT count(*) INTO v_count FROM public.plan_cuentas
  WHERE tenant_id=v_tenant AND codigo IN ('4699','63')
    AND activo AND acepta_movimiento AND estado='ACTIVO';
  IF v_count <> 2 THEN RAISE EXCEPTION 'VERIFY_539_NEW_PE_MISSING_PURCHASE_ACCOUNTS'; END IF;
  IF app.seed_peru_purchase_accounts_539(v_tenant) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_539_REPLAY_DUPLICATES_ACCOUNTS';
  END IF;
  UPDATE public.plan_cuentas SET nombre='Nombre definido por contador', acepta_movimiento=false
  WHERE tenant_id=v_tenant AND codigo='4699';
  UPDATE public.empresa_config SET pais='PE' WHERE tenant_id=v_tenant;
  IF NOT EXISTS (SELECT 1 FROM public.plan_cuentas WHERE tenant_id=v_tenant
    AND codigo='4699' AND nombre='Nombre definido por contador' AND NOT acepta_movimiento) THEN
    RAISE EXCEPTION 'VERIFY_539_CUSTOM_ACCOUNT_OVERWRITTEN';
  END IF;
  v_other := (public.create_demo_tenant_ready_tx(
    'VERIFY-539-AR', 14, 'AR', 'verify-539-ar-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;
  IF EXISTS (SELECT 1 FROM public.plan_cuentas WHERE tenant_id=v_other
    AND metadata->>'source'='peru_purchase_accounts_539') THEN
    RAISE EXCEPTION 'VERIFY_539_PERU_ACCOUNTS_LEAKED_TO_OTHER_COUNTRY';
  END IF;
  -- Las ACL de tablas se comparan antes/después; no se revocan escritores previos.
  IF has_function_privilege('service_role', 'app.seed_peru_purchase_accounts_539(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_539_HIDDEN_RUNTIME_WRITER_REOPENED';
  END IF;
END;
$verify$;
ROLLBACK;
