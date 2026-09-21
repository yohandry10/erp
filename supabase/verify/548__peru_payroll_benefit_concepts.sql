\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE demo jsonb; pe uuid; ar uuid; total integer;
BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY548_REQUIERE_ERP_E2E'; END IF;
  UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',
    allow_demo_data=true,configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton;
  demo:=public.create_demo_tenant_ready_tx('VERIFY548',14,'PE','verify548-'||gen_random_uuid());
  pe:=(demo->>'tenant_id')::uuid;
  demo:=public.create_demo_tenant_ready_tx('VERIFY548-AR',14,'AR','verify548-ar-'||gen_random_uuid());
  ar:=(demo->>'tenant_id')::uuid;
  SELECT count(*) INTO total FROM public.conceptos_planilla WHERE tenant_id=pe AND codigo IN('006','007','008') AND activo;
  IF total<>3 THEN RAISE EXCEPTION 'VERIFY548_PERU_INCOMPLETO'; END IF;
  IF EXISTS(SELECT 1 FROM public.conceptos_planilla WHERE tenant_id=ar AND metadata->>'seed'='peru_payroll_benefits_548') THEN
    RAISE EXCEPTION 'VERIFY548_AFECTO_OTRO_PAIS';
  END IF;
  UPDATE public.conceptos_planilla SET nombre='Nombre personalizado',activo=false WHERE tenant_id=pe AND codigo='006';
  UPDATE public.empresa_config SET pais='PE' WHERE tenant_id=pe;
  IF NOT EXISTS(SELECT 1 FROM public.conceptos_planilla WHERE tenant_id=pe AND codigo='006'
    AND nombre='Nombre personalizado' AND NOT activo) THEN RAISE EXCEPTION 'VERIFY548_SOBRESCRIBIO_CONFIGURACION'; END IF;
  IF (SELECT count(*) FROM public.conceptos_planilla WHERE tenant_id=pe AND codigo IN('006','007','008'))<>3 THEN
    RAISE EXCEPTION 'VERIFY548_DUPLICADOS';
  END IF;
  IF has_function_privilege('service_role','app.ensure_peru_payroll_benefits_548(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY548_ESCRITURA_RUNTIME_ABIERTA';
  END IF;
END;
$verify$;
ROLLBACK;
