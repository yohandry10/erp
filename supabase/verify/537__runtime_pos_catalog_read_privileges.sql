\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
DO $verify$
DECLARE
  v_relation text;
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_537_REQUIERE_BASE_EFIMERA_ERP_E2E';
  END IF;
  FOREACH v_relation IN ARRAY ARRAY[
    'usuario_sucursales','sucursales','vista_pos_productos','metodos_pago',
    'paises','configuracion_fiscal','tipos_documentos_fiscales','tipos_impuestos',
    'documento_series','pos_numeracion','detalle_ventas_pos','ventas_pos',
    'ventas_pos_pagos','plan_cuentas','configuracion_caja','cortes_caja',
    'usuario_configuracion','caja_audit_log','eventos_pos','periodos_contables',
    'asientos_contables','detalle_asientos','plantillas_asientos_ventas','event_processing_log'
  ] LOOP
    IF NOT has_table_privilege('service_role', 'public.' || v_relation, 'SELECT') THEN
      RAISE EXCEPTION 'VERIFY_537_RUNTIME_SELECT_MISSING:%', v_relation;
    END IF;
    -- CI y ensayo restaurado comparan ACL antes/después: no se añade DML ni
    -- acceso de anon/authenticated. No se revocan escritores heredados aquí.
  END LOOP;
END;
$verify$;

-- Ejecutar consultas con el rol real: el catálogo debe ser legible sin usar
-- postgres como sustituto del backend ni conceder SUPERUSER al service role.
SET LOCAL ROLE service_role;
SELECT id FROM public.vista_pos_productos LIMIT 0;
SELECT sucursal_id FROM public.usuario_sucursales LIMIT 0;
SELECT id FROM public.ventas_pos LIMIT 0;
RESET ROLE;
ROLLBACK;
