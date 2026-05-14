-- ============================================================================
-- 015__views_alignment_runtime.sql
-- Alinea vistas consumidas por backend/web.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Compatibilidad con .from('pg_matviews')
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.pg_matviews AS
SELECT
  schemaname,
  matviewname,
  matviewowner,
  tablespace,
  hasindexes,
  ispopulated,
  definition
FROM pg_catalog.pg_matviews;

-- ----------------------------------------------------------------------------
-- Vistas de seguridad RLS (nombres de columnas esperados por API)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_rls_alerts_summary;
DROP VIEW IF EXISTS public.v_rls_alerts_unacknowledged;
DROP VIEW IF EXISTS public.v_rls_alerts_recent;
DROP VIEW IF EXISTS public.v_rls_violations_recent;
DROP VIEW IF EXISTS public.v_rls_violations_hourly;
DROP VIEW IF EXISTS public.v_rls_violations_by_user;
DROP VIEW IF EXISTS public.v_rls_violations_by_table;

CREATE OR REPLACE VIEW public.v_rls_violations_by_table AS
SELECT
  COALESCE(table_name, 'unknown') AS table_name,
  COUNT(*)::bigint AS total_violations,
  COUNT(DISTINCT user_id)::bigint AS unique_users,
  COUNT(*) FILTER (WHERE COALESCE(severity, 'WARNING') = 'CRITICAL')::bigint AS critical_count,
  COUNT(*) FILTER (WHERE COALESCE(severity, 'WARNING') <> 'CRITICAL')::bigint AS warning_count,
  MAX("timestamp") AS last_violation
FROM public.rls_audit_log
GROUP BY COALESCE(table_name, 'unknown')
ORDER BY total_violations DESC;

CREATE OR REPLACE VIEW public.v_rls_violations_by_user AS
SELECT
  COALESCE(user_id::text, 'unknown') AS user_id,
  COALESCE(user_email, 'unknown') AS user_email,
  COUNT(*)::bigint AS total_violations,
  COUNT(DISTINCT table_name)::bigint AS tables_affected,
  COUNT(*) FILTER (WHERE COALESCE(severity, 'WARNING') = 'CRITICAL')::bigint AS critical_violations,
  MAX("timestamp") AS last_violation
FROM public.rls_audit_log
GROUP BY COALESCE(user_id::text, 'unknown'), COALESCE(user_email, 'unknown')
ORDER BY total_violations DESC;

CREATE OR REPLACE VIEW public.v_rls_violations_hourly AS
SELECT
  date_trunc('hour', "timestamp") AS hour,
  COUNT(*)::bigint AS total_violations,
  COUNT(DISTINCT user_id)::bigint AS unique_users,
  COUNT(DISTINCT table_name)::bigint AS tables_affected,
  COUNT(*) FILTER (WHERE COALESCE(severity, 'WARNING') = 'CRITICAL')::bigint AS critical_count
FROM public.rls_audit_log
WHERE "timestamp" > now() - interval '7 days'
GROUP BY date_trunc('hour', "timestamp")
ORDER BY hour DESC;

CREATE OR REPLACE VIEW public.v_rls_violations_recent AS
SELECT
  "timestamp",
  table_name,
  operation,
  user_email,
  user_id,
  violation_type,
  severity,
  attempted_tenant_id,
  actual_tenant_id,
  ip_address
FROM public.rls_audit_log
WHERE "timestamp" > now() - interval '24 hours'
ORDER BY "timestamp" DESC;

CREATE OR REPLACE VIEW public.v_rls_alerts_recent AS
SELECT
  triggered_at,
  alert_name,
  severity,
  message,
  violation_count,
  affected_table,
  user_email,
  acknowledged,
  acknowledged_at
FROM public.rls_alert_history
WHERE triggered_at > now() - interval '24 hours'
ORDER BY triggered_at DESC;

CREATE OR REPLACE VIEW public.v_rls_alerts_unacknowledged AS
SELECT
  id,
  triggered_at,
  alert_name,
  severity,
  message,
  violation_count,
  affected_table,
  user_email,
  EXTRACT(EPOCH FROM (now() - triggered_at)) / 60 AS minutes_since_trigger
FROM public.rls_alert_history
WHERE COALESCE(acknowledged, false) = false
ORDER BY triggered_at DESC;

CREATE OR REPLACE VIEW public.v_rls_alerts_summary AS
SELECT
  COALESCE(alert_name, 'unknown') AS alert_name,
  COUNT(*)::bigint AS total_alerts,
  COUNT(*) FILTER (WHERE COALESCE(severity, 'WARNING') = 'CRITICAL')::bigint AS critical_count,
  COUNT(*) FILTER (WHERE COALESCE(acknowledged, false) = false)::bigint AS unacknowledged_count,
  MAX(triggered_at) AS last_alert
FROM public.rls_alert_history
GROUP BY COALESCE(alert_name, 'unknown')
ORDER BY total_alerts DESC;

-- ----------------------------------------------------------------------------
-- Vistas POS/cajas usadas por dashboards
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_turnos_metrics;
DROP VIEW IF EXISTS public.vw_ranking_cajeros;
DROP VIEW IF EXISTS public.vw_sesiones_activas;
DROP VIEW IF EXISTS public.vw_eventos_pos_sospechosos;

CREATE OR REPLACE VIEW public.vw_eventos_pos_sospechosos AS
SELECT
  ep.id,
  ep.tenant_id,
  ep.sesion_caja_id,
  ep.usuario_id,
  ep.tipo_evento,
  ep.subtipo,
  ep.datos,
  ep."timestamp",
  ep.requiere_supervisor,
  ep.supervisor_id,
  ep.justificacion,
  sc.cajero_id,
  c.nombre AS caja_nombre
FROM public.eventos_pos ep
LEFT JOIN public.sesiones_caja sc ON sc.id = ep.sesion_caja_id
LEFT JOIN public.cajas c ON c.id = sc.caja_id
WHERE ep.tipo_evento IN (
  'APERTURA_CAJON_SIN_VENTA',
  'ANULACION_ITEM',
  'DESCUENTO_MANUAL',
  'CAMBIO_PRECIO',
  'VENTA_ANULADA',
  'DEVOLUCION'
)
ORDER BY ep."timestamp" DESC;

CREATE OR REPLACE VIEW public.vw_sesiones_activas AS
SELECT
  sc.id,
  sc.tenant_id,
  sc.caja_id,
  c.nombre AS caja_nombre,
  c.ubicacion AS caja_ubicacion,
  sc.cajero_id,
  COALESCE(sc.hora_apertura, sc.fecha_apertura) AS hora_apertura,
  EXTRACT(EPOCH FROM (now() - COALESCE(sc.hora_apertura, sc.fecha_apertura))) / 3600 AS horas_activa,
  COALESCE(sc.monto_inicio, sc.monto_inicial, 0) AS monto_inicio,
  sc.dispositivo,
  COALESCE(sc.congelada, false) AS congelada,
  COALESCE(sc.monto_inicio, sc.monto_inicial, 0) + COALESCE((
    SELECT SUM(mc.monto) FROM public.movimientos_caja mc WHERE mc.sesion_caja_id = sc.id
  ), 0) AS saldo_actual,
  COALESCE((
    SELECT COUNT(*) FROM public.movimientos_caja mc WHERE mc.sesion_caja_id = sc.id
  ), 0)::bigint AS total_movimientos,
  COALESCE((
    SELECT MAX(mc."timestamp") FROM public.movimientos_caja mc WHERE mc.sesion_caja_id = sc.id
  ), COALESCE(sc.hora_apertura, sc.fecha_apertura)) AS ultima_actividad
FROM public.sesiones_caja sc
LEFT JOIN public.cajas c ON c.id = sc.caja_id
WHERE COALESCE(sc.estado, 'ABIERTA') = 'ABIERTA';

CREATE OR REPLACE VIEW public.vw_ranking_cajeros AS
SELECT
  sc.tenant_id,
  sc.cajero_id,
  COUNT(*)::bigint AS total_sesiones,
  ROUND(COALESCE(SUM(COALESCE(sc.total_efectivo, 0)), 0)::numeric, 2) AS total_efectivo,
  ROUND(COALESCE(SUM(COALESCE(sc.total_tarjeta, 0)), 0)::numeric, 2) AS total_tarjeta,
  ROUND(
    CASE WHEN COUNT(*) = 0 THEN 0
         ELSE ((COUNT(*) FILTER (WHERE COALESCE(sc.diferencia, 0) = 0))::numeric / COUNT(*)::numeric) * 100
    END
  , 2) AS porcentaje_cuadre
FROM public.sesiones_caja sc
WHERE COALESCE(sc.estado, 'ABIERTA') = 'CERRADA'
GROUP BY sc.tenant_id, sc.cajero_id
ORDER BY porcentaje_cuadre DESC, total_sesiones DESC;

CREATE OR REPLACE VIEW public.vw_turnos_metrics AS
SELECT
  sc.tenant_id,
  sc.cajero_id,
  sc.caja_id,
  date(COALESCE(sc.hora_apertura, sc.fecha_apertura)) AS fecha,
  COUNT(*)::bigint AS total_turnos,
  ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(sc.hora_cierre, sc.fecha_cierre) - COALESCE(sc.hora_apertura, sc.fecha_apertura))) / 3600), 0)::numeric, 2) AS duracion_promedio_horas,
  ROUND(COALESCE(SUM(COALESCE(sc.monto_esperado, 0) - COALESCE(sc.monto_inicio, sc.monto_inicial, 0)), 0)::numeric, 2) AS total_ventas_netas,
  ROUND(COALESCE(SUM(COALESCE(sc.diferencia, 0)), 0)::numeric, 2) AS total_diferencias
FROM public.sesiones_caja sc
WHERE COALESCE(sc.estado, 'ABIERTA') = 'CERRADA'
  AND COALESCE(sc.hora_cierre, sc.fecha_cierre) IS NOT NULL
GROUP BY
  sc.tenant_id,
  sc.cajero_id,
  sc.caja_id,
  date(COALESCE(sc.hora_apertura, sc.fecha_apertura));

COMMIT;
