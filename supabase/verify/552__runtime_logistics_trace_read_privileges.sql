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
    RAISE EXCEPTION 'VERIFY_552_REQUIERE_BASE_EFIMERA_ERP_E2E';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY['logistica_eventos', 'pedido_backorders'] LOOP
    relation_oid := to_regclass('public.' || relation_name);
    IF relation_oid IS NULL OR NOT has_table_privilege('service_role', relation_oid, 'SELECT') THEN
      RAISE EXCEPTION 'VERIFY_552_RUNTIME_SELECT_MISSING:%', relation_name;
    END IF;
    -- La invariancia de ACL no SELECT se mide antes/después en ambos runners.
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=relation_oid AND relrowsecurity AND relforcerowsecurity) THEN
      RAISE EXCEPTION 'VERIFY_552_RLS_NOT_FORCED:%', relation_name;
    END IF;
  END LOOP;
END;
$verify$;
SET LOCAL ROLE service_role;
SELECT id, tenant_id, pedido_id, tipo, registrado_en FROM public.logistica_eventos LIMIT 0;
SELECT id, tenant_id, pedido_id, detalle_id, cantidad_pendiente FROM public.pedido_backorders LIMIT 0;
RESET ROLE;
ROLLBACK;
