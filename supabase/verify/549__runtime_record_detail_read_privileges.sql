\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
DO $verify$
DECLARE
  relation_name text;
  relation_oid oid;
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_549_REQUIERE_BASE_EFIMERA_ERP_E2E';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY['cotizacion_detalles', 'solicitudes', 'rma_items', 'rma_eventos'] LOOP
    relation_oid := to_regclass('public.' || relation_name);
    IF relation_oid IS NULL OR NOT has_table_privilege('service_role', relation_oid, 'SELECT') THEN
      RAISE EXCEPTION 'VERIFY_549_RUNTIME_SELECT_MISSING:%', relation_name;
    END IF;
    -- La invariancia de ACL no SELECT se mide antes/después en ambos runners.
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=relation_oid AND relrowsecurity AND relforcerowsecurity) THEN
      RAISE EXCEPTION 'VERIFY_549_RLS_NOT_FORCED:%', relation_name;
    END IF;
  END LOOP;
END;
$verify$;
SET LOCAL ROLE service_role;
SELECT id, tenant_id, cotizacion_id FROM public.cotizacion_detalles LIMIT 0;
SELECT id_empleado, tenant_id, fecha_inicio, fecha_fin FROM public.solicitudes LIMIT 0;
SELECT id, tenant_id, rma_id FROM public.rma_items LIMIT 0;
SELECT id, tenant_id, rma_id FROM public.rma_eventos LIMIT 0;
RESET ROLE;
ROLLBACK;
