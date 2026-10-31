-- Lectura del panel global protegido por SuperAdminGuard y security.audit.read.
-- Retira el acceso SQL de clientes y las escrituras del servicio que Supabase
-- concede por defecto; no modifica filas.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE VIEW public.v_rls_violations_by_table WITH (security_invoker=true) AS
SELECT
  COALESCE(table_name, 'unknown') AS table_name,
  COUNT(*)::bigint AS total_violations,
  COUNT(DISTINCT user_id)::bigint AS unique_users,
  COUNT(*) FILTER (WHERE COALESCE(severity, 'WARNING') = 'CRITICAL')::bigint AS critical_count,
  COUNT(*) FILTER (WHERE COALESCE(severity, 'WARNING') <> 'CRITICAL')::bigint AS warning_count,
  MAX("timestamp") AS last_violation,
  COUNT(*) FILTER (WHERE violation_type = 'cross_tenant')::bigint AS cross_tenant_count,
  COUNT(*) FILTER (WHERE violation_type = 'missing_tenant')::bigint AS missing_tenant_count
FROM public.rls_audit_log
GROUP BY COALESCE(table_name, 'unknown')
ORDER BY total_violations DESC;

REVOKE ALL ON TABLE
  public.rls_audit_log,
  public.rls_alert_history,
  public.v_rls_violations_by_table,
  public.v_rls_violations_by_user,
  public.v_rls_violations_hourly,
  public.v_rls_alerts_recent,
  public.v_rls_alerts_unacknowledged
FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.rls_audit_log,
  public.rls_alert_history,
  public.v_rls_violations_by_table,
  public.v_rls_violations_by_user,
  public.v_rls_violations_hourly,
  public.v_rls_alerts_recent,
  public.v_rls_alerts_unacknowledged
FROM service_role;
GRANT SELECT ON TABLE
  public.rls_audit_log,
  public.rls_alert_history,
  public.v_rls_violations_by_table,
  public.v_rls_violations_by_user,
  public.v_rls_violations_hourly,
  public.v_rls_alerts_recent,
  public.v_rls_alerts_unacknowledged
TO service_role;
COMMIT;
