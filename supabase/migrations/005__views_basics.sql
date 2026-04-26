-- ============================================================================
-- 005__views_basics.sql
-- Vistas y materialized views base para compatibilidad de módulos/reportes.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Materialized views contables base
-- ----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.mv_balance_comprobacion;
CREATE MATERIALIZED VIEW public.mv_balance_comprobacion AS
SELECT
  ac.tenant_id,
  COALESCE(pc.codigo, 'SIN_CUENTA') AS codigo_cuenta,
  COALESCE(pc.nombre, 'SIN_CUENTA') AS nombre_cuenta,
  COALESCE(SUM(da.debe), 0) AS total_debe,
  COALESCE(SUM(da.haber), 0) AS total_haber,
  now() AS generated_at
FROM public.asientos_contables ac
LEFT JOIN public.detalle_asientos da ON da.asiento_id = ac.id
LEFT JOIN public.plan_cuentas pc ON pc.id = da.cuenta_id
GROUP BY ac.tenant_id, COALESCE(pc.codigo, 'SIN_CUENTA'), COALESCE(pc.nombre, 'SIN_CUENTA')
WITH NO DATA;

DROP MATERIALIZED VIEW IF EXISTS public.mv_estado_resultados;
CREATE MATERIALIZED VIEW public.mv_estado_resultados AS
SELECT
  ac.tenant_id,
  COALESCE(SUM(ac.total_haber), 0) AS ingresos,
  COALESCE(SUM(ac.total_debe), 0) AS gastos,
  COALESCE(SUM(ac.total_haber) - SUM(ac.total_debe), 0) AS resultado,
  now() AS generated_at
FROM public.asientos_contables ac
GROUP BY ac.tenant_id
WITH NO DATA;

DROP MATERIALIZED VIEW IF EXISTS public.mv_balance_general;
CREATE MATERIALIZED VIEW public.mv_balance_general AS
SELECT
  tenant_id,
  COALESCE(SUM(total_debe), 0) AS total_activo,
  COALESCE(SUM(total_haber), 0) AS total_pasivo_patrimonio,
  now() AS generated_at
FROM public.asientos_contables
GROUP BY tenant_id
WITH NO DATA;

-- ----------------------------------------------------------------------------
-- Vistas operativas/fiscales
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vista_pos_productos AS
SELECT
  p.id,
  p.tenant_id,
  p.codigo,
  p.nombre,
  COALESCE(p.activo, true) AS activo,
  COALESCE(p.precio_venta, p.precio, 0::numeric) AS precio_venta,
  COALESCE(p.stock_actual, 0::numeric) AS stock_actual,
  COALESCE(p.stock_reservado, 0::numeric) AS stock_reservado
FROM public.productos p;

CREATE OR REPLACE VIEW public.vw_cpe_documentos_auditoria AS
SELECT
  c.id AS cpe_id,
  c.tenant_id,
  c.estado,
  c.estado_sunat,
  c.serie,
  c.numero,
  c.total,
  c.created_at,
  d.id AS documento_id,
  d.tipo_documento
FROM public.cpe c
LEFT JOIN public.documentos d ON d.id = c.documento_id;

CREATE OR REPLACE VIEW public.vw_inventario_recepciones AS
SELECT
  r.id AS recepcion_id,
  r.tenant_id,
  r.estado,
  r.fecha_recepcion,
  ri.id AS item_id,
  ri.producto_id,
  ri.cantidad_recibida
FROM public.recepciones r
LEFT JOIN public.recepcion_items ri ON ri.recepcion_id = r.id;

CREATE OR REPLACE VIEW public.vw_kardex_valorizado AS
SELECT
  m.id AS movimiento_id,
  m.tenant_id,
  m.producto_id,
  m.tipo_movimiento,
  m.cantidad,
  m.created_at
FROM public.movimientos_inventario m;

CREATE OR REPLACE VIEW public.vw_eventos_pos_sospechosos AS
SELECT
  e.id,
  e.tenant_id,
  e.estado,
  e.created_at,
  e.metadata
FROM public.eventos_pos e
WHERE COALESCE(e.estado, '') IN ('ALERTA', 'SOSPECHOSO', 'CRITICO');

CREATE OR REPLACE VIEW public.vw_ranking_cajeros AS
SELECT
  s.tenant_id,
  s.cajero_id,
  COUNT(*) AS total_sesiones,
  COALESCE(SUM(s.total_efectivo), 0) AS total_efectivo,
  COALESCE(SUM(s.total_tarjeta), 0) AS total_tarjeta
FROM public.sesiones_caja s
GROUP BY s.tenant_id, s.cajero_id;

CREATE OR REPLACE VIEW public.vw_sesiones_activas AS
SELECT
  s.*
FROM public.sesiones_caja s
WHERE s.estado = 'ABIERTA';

-- ----------------------------------------------------------------------------
-- Vistas de RLS/auditoria/estado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_rls_violations_by_table AS
SELECT
  COALESCE(metadata->>'table_name', 'unknown') AS table_name,
  COUNT(*) AS total_violaciones
FROM public.rls_audit_log
GROUP BY COALESCE(metadata->>'table_name', 'unknown');

CREATE OR REPLACE VIEW public.v_rls_violations_by_user AS
SELECT
  COALESCE(metadata->>'user_id', 'unknown') AS user_id,
  COUNT(*) AS total_violaciones
FROM public.rls_audit_log
GROUP BY COALESCE(metadata->>'user_id', 'unknown');

CREATE OR REPLACE VIEW public.v_rls_violations_hourly AS
SELECT
  date_trunc('hour', created_at) AS hora,
  COUNT(*) AS total_violaciones
FROM public.rls_audit_log
GROUP BY date_trunc('hour', created_at);

CREATE OR REPLACE VIEW public.v_rls_violations_recent AS
SELECT *
FROM public.rls_audit_log
WHERE created_at >= now() - interval '24 hours';

CREATE OR REPLACE VIEW public.v_rls_alerts_recent AS
SELECT *
FROM public.rls_alert_history
WHERE created_at >= now() - interval '24 hours';

CREATE OR REPLACE VIEW public.v_rls_alerts_unacknowledged AS
SELECT *
FROM public.rls_alert_history
WHERE COALESCE((metadata->>'acknowledged')::boolean, false) = false;

CREATE OR REPLACE VIEW public.v_rls_alerts_summary AS
SELECT
  tenant_id,
  COUNT(*) AS total_alertas,
  MAX(created_at) AS ultima_alerta
FROM public.rls_alert_history
GROUP BY tenant_id;

CREATE OR REPLACE VIEW public.v_rls_status_finanzas AS
SELECT
  c.table_name,
  CASE WHEN c.column_name IS NOT NULL THEN true ELSE false END AS has_tenant_id
FROM information_schema.tables t
LEFT JOIN information_schema.columns c
  ON c.table_schema = t.table_schema
 AND c.table_name = t.table_name
 AND c.column_name = 'tenant_id'
WHERE t.table_schema = 'public'
  AND t.table_name IN ('cuentas_bancarias','movimientos_bancarios','conciliaciones_bancarias','cuentas_por_cobrar','cuentas_por_pagar');

CREATE OR REPLACE VIEW public.v_rls_policies_finanzas AS
SELECT
  schemaname,
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('cuentas_bancarias','movimientos_bancarios','conciliaciones_bancarias','cuentas_por_cobrar','cuentas_por_pagar');

CREATE OR REPLACE VIEW public.v_rls_status_all_tables AS
SELECT
  t.table_name,
  EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = t.table_name
      AND c.column_name = 'tenant_id'
  ) AS has_tenant_id
FROM information_schema.tables t
WHERE t.table_schema = 'public';

CREATE OR REPLACE VIEW public.v_rls_status_contabilidad AS
SELECT *
FROM public.v_rls_status_all_tables
WHERE table_name IN ('plan_cuentas','asientos_contables','detalle_asientos','periodos_contables','presupuestos');

CREATE OR REPLACE VIEW public.v_rls_status_empleado_relaciones AS
SELECT *
FROM public.v_rls_status_all_tables
WHERE table_name LIKE 'empleado_%';

CREATE OR REPLACE VIEW public.v_rls_status_rrhh_maestras AS
SELECT *
FROM public.v_rls_status_all_tables
WHERE table_name IN ('empleados','departamentos','beneficios','horarios_trabajo','conceptos_planilla');

CREATE OR REPLACE VIEW public.v_rls_status_rrhh_transaccionales AS
SELECT *
FROM public.v_rls_status_all_tables
WHERE table_name IN ('planillas','empleado_planilla','pagos_empleados','asistencia','solicitudes','liquidaciones');

CREATE OR REPLACE VIEW public.v_rls_summary_by_module AS
SELECT
  'global'::text AS modulo,
  COUNT(*)::bigint AS total_tablas
FROM information_schema.tables
WHERE table_schema = 'public';

-- ----------------------------------------------------------------------------
-- Vistas adicionales reportadas en panel (compatibilidad)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_tenant_id_status_finanzas AS
SELECT * FROM public.v_rls_status_finanzas;

CREATE OR REPLACE VIEW public.v_indices_tenant_finanzas AS
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('cuentas_bancarias','movimientos_bancarios','conciliaciones_bancarias','cuentas_por_cobrar','cuentas_por_pagar');

CREATE OR REPLACE VIEW public.v_performance_indices_finanzas AS
SELECT * FROM public.v_indices_tenant_finanzas;

CREATE OR REPLACE VIEW public.v_indices_tenant_created_summary AS
SELECT
  tablename,
  COUNT(*) AS total_indices
FROM pg_indexes
WHERE schemaname = 'public'
GROUP BY tablename;

CREATE OR REPLACE VIEW public.v_secrets_rotation_status AS
SELECT
  id,
  estado,
  created_at,
  updated_at
FROM public.secret_rotation_state;

CREATE OR REPLACE VIEW public.v_lotes_proximos_vencer AS
SELECT
  id,
  tenant_id,
  codigo,
  estado,
  created_at
FROM public.lotes_productos;

CREATE OR REPLACE VIEW public.v_kpis_sunat_multitenant AS
SELECT
  tenant_id,
  COUNT(*) AS total_cpe,
  SUM(CASE WHEN estado_sunat = 'ACEPTADO' THEN 1 ELSE 0 END) AS aceptados
FROM public.cpe
GROUP BY tenant_id;

CREATE OR REPLACE VIEW public.v_otif_multialmacen AS
SELECT
  tenant_id,
  COUNT(*) AS total_pedidos
FROM public.pedidos_venta
GROUP BY tenant_id;

CREATE OR REPLACE VIEW public.v_costos_fijos_mensuales AS
SELECT
  tenant_id,
  date_trunc('month', created_at) AS periodo,
  SUM(COALESCE((metadata->>'total')::numeric, 0)) AS total_mes
FROM public.gastos
GROUP BY tenant_id, date_trunc('month', created_at);

CREATE OR REPLACE VIEW public.v_gastos_resumen AS
SELECT
  tenant_id,
  estado,
  COUNT(*) AS total_registros,
  SUM(COALESCE((metadata->>'total')::numeric, 0)) AS total_gastos
FROM public.gastos
GROUP BY tenant_id, estado;

CREATE OR REPLACE VIEW public.v_documentos_completos AS
SELECT
  d.*,
  c.estado_sunat,
  c.error_message
FROM public.documentos d
LEFT JOIN public.cpe c ON c.documento_id = d.id;

CREATE OR REPLACE VIEW public.v_documentos_pendientes_sunat AS
SELECT *
FROM public.documentos
WHERE estado IN ('BORRADOR', 'EMITIDO');

CREATE OR REPLACE VIEW public.vista_autorizaciones_caja AS
SELECT
  a.*
FROM public.autorizaciones_caja a;

CREATE OR REPLACE VIEW public.vista_registro_compras AS
SELECT
  oc.id AS orden_compra_id,
  oc.tenant_id,
  oc.estado,
  oc.total,
  p.nombre AS proveedor_nombre
FROM public.ordenes_compra oc
LEFT JOIN public.proveedores p ON p.id = oc.proveedor_id;

CREATE OR REPLACE VIEW public.vw_demo_dashboard AS
SELECT
  t.id AS tenant_id,
  t.nombre AS tenant_nombre,
  ec.is_demo,
  ec.demo_expires_at
FROM public.tenants t
LEFT JOIN public.empresa_config ec ON ec.tenant_id = t.id;

CREATE OR REPLACE VIEW public.vw_sesiones_caja_resumen AS
SELECT
  s.tenant_id,
  s.id AS sesion_id,
  s.estado,
  COALESCE(s.total_efectivo, 0) AS total_efectivo,
  COALESCE(s.total_tarjeta, 0) AS total_tarjeta,
  COALESCE(s.total_efectivo, 0) + COALESCE(s.total_tarjeta, 0) AS total_sesion
FROM public.sesiones_caja s;

CREATE OR REPLACE VIEW public.vw_turnos_metrics AS
SELECT
  s.tenant_id,
  s.cajero_id,
  COUNT(*) AS total_turnos,
  SUM(COALESCE(s.total_efectivo, 0) + COALESCE(s.total_tarjeta, 0)) AS total_vendido
FROM public.sesiones_caja s
GROUP BY s.tenant_id, s.cajero_id;

COMMIT;
