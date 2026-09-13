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
    RAISE EXCEPTION 'VERIFY_546_REQUIERE_BASE_EFIMERA_ERP_E2E';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY[
    'activos_fijos', 'centros_costo', 'compras', 'comunicaciones_baja',
    'cotizaciones', 'diferidos', 'documento_detalles', 'grupos_consolidacion',
    'grupos_consolidacion_miembros', 'normativa_peru_periodos',
    'plantillas_asientos', 'presupuestos', 'registro_consignaciones',
    'reportes_contables_configurables', 'reportes_contables_lineas',
    'movimientos_consignacion', 'resumenes_diarios', 'tasas_detraccion', 'tipos_cambio',
    'asistencia', 'departamentos', 'empleado_horarios', 'horarios_trabajo',
    'candidatos', 'vacantes', 'libro_retenciones', 'conciliaciones_bancarias',
    'pedidos_venta', 'pedidos_venta_detalle', 'rma_solicitudes'
  ] LOOP
    relation_oid := to_regclass('public.' || relation_name);
    IF relation_oid IS NULL OR NOT has_table_privilege('service_role', relation_oid, 'SELECT') THEN
      RAISE EXCEPTION 'VERIFY_546_RUNTIME_SELECT_MISSING:%', relation_name;
    END IF;
    -- La invariancia de ACL no SELECT se mide antes/después en ambos runners.
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=relation_oid AND relrowsecurity AND relforcerowsecurity) THEN
      RAISE EXCEPTION 'VERIFY_546_RLS_NOT_FORCED:%', relation_name;
    END IF;
  END LOOP;
END;
$verify$;

SET LOCAL ROLE service_role;
SELECT id FROM public.activos_fijos LIMIT 0;
SELECT id FROM public.centros_costo LIMIT 0;
SELECT id FROM public.documento_detalles LIMIT 0;
SELECT periodo, uit, rmv FROM public.normativa_peru_periodos LIMIT 0;
SELECT id FROM public.presupuestos LIMIT 0;
SELECT id FROM public.grupos_consolidacion LIMIT 0;
SELECT id FROM public.v_documentos_completos LIMIT 0;
SELECT * FROM public.vw_inventario_recepciones LIMIT 0;
SELECT id, tenant_id, nombre, apellido, email, activo FROM public.usuarios LIMIT 0;
RESET ROLE;
ROLLBACK;
