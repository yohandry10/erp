\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
DO $verify$
DECLARE
  v_relation text;
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_538_REQUIERE_BASE_EFIMERA_ERP_E2E';
  END IF;
  FOREACH v_relation IN ARRAY ARRAY[
    'orden_compra_detalles', 'oc_aprobaciones', 'recepcion_items',
    'devoluciones_proveedor', 'devolucion_items', 'cotizaciones_compra',
    'cotizacion_compra_detalles', 'cuentas_por_pagar'
  ] LOOP
    IF NOT has_table_privilege('service_role', 'public.' || v_relation, 'SELECT') THEN
      RAISE EXCEPTION 'VERIFY_538_RUNTIME_SELECT_MISSING:%', v_relation;
    END IF;
    -- La invariancia de ACL no SELECT se mide antes/después en ambos runners.
  END LOOP;
END;
$verify$;

SET LOCAL ROLE service_role;
SELECT id FROM public.orden_compra_detalles LIMIT 0;
SELECT id FROM public.oc_aprobaciones LIMIT 0;
SELECT id FROM public.recepcion_items LIMIT 0;
SELECT id FROM public.cuentas_por_pagar LIMIT 0;
RESET ROLE;
ROLLBACK;
