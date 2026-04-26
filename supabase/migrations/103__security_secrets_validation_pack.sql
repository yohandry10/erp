-- ============================================================================
-- 103__security_secrets_validation_pack.sql
-- Pack de validación runtime para secretos/alertas/PII logs.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_security_secrets_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_count bigint;
BEGIN
  RETURN QUERY
  SELECT
    'trigger_normalize_secret_rotation_state_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'secret_rotation_state'
        AND t.tgname = 'trg_normalize_secret_rotation_state_row'
        AND NOT t.tgisinternal
    ),
    'normalización de secret_rotation_state';

  RETURN QUERY
  SELECT
    'trigger_normalize_system_alerts_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'system_alerts'
        AND t.tgname = 'trg_normalize_system_alerts_row'
        AND NOT t.tgisinternal
    ),
    'normalización de system_alerts';

  RETURN QUERY
  SELECT
    'trigger_normalize_pii_encryption_log_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pii_encryption_log'
        AND t.tgname = 'trg_normalize_pii_encryption_log_row'
        AND NOT t.tgisinternal
    ),
    'normalización de pii_encryption_log';

  RETURN QUERY
  SELECT
    'secret_rotation_state_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'secret_rotation_state'
        AND c.column_name IN (
          'secret_key',
          'current_secret_hash',
          'previous_secret_hash',
          'rotated_at',
          'grace_period_hours',
          'source_module',
          'rotation_reason',
          'next_rotation_due_at'
        )
    ),
    'columnas runtime de rotación';

  RETURN QUERY
  SELECT
    'system_alerts_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'system_alerts'
        AND c.column_name IN (
          'type',
          'severity',
          'message',
          'alert_key',
          'category',
          'acknowledged',
          'acknowledged_at',
          'resolved_at'
        )
    ),
    'columnas runtime de alertas';

  RETURN QUERY
  SELECT
    'pii_encryption_log_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pii_encryption_log'
        AND c.column_name IN (
          'table_name',
          'field_name',
          'action',
          'algorithm',
          'key_version',
          'success',
          'error_message',
          'processed_at'
        )
    ),
    'columnas runtime de auditoría PII';

  RETURN QUERY
  SELECT
    'ux_secret_rotation_state_scope_secret_rotated_at_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'secret_rotation_state'
        AND indexname = 'ux_secret_rotation_state_scope_secret_rotated_at'
    ),
    'unicidad operativa por scope+secret+rotated_at';

  RETURN QUERY
  SELECT
    'ux_system_alerts_scope_alert_key_unresolved_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'system_alerts'
        AND indexname = 'ux_system_alerts_scope_alert_key_unresolved'
    ),
    'unicidad operativa de alert_key sin resolver';

  RETURN QUERY
  SELECT
    'view_v_secrets_rotation_status_exists'::text,
    to_regclass('public.v_secrets_rotation_status') IS NOT NULL,
    'vista operativa de rotación de secretos';

  RETURN QUERY
  SELECT
    'rls_secret_rotation_state_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'secret_rotation_state'
        AND c.relrowsecurity = true
    ),
    'RLS habilitado en secret_rotation_state';

  RETURN QUERY
  SELECT
    'rls_system_alerts_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'system_alerts'
        AND c.relrowsecurity = true
    ),
    'RLS habilitado en system_alerts';

  RETURN QUERY
  SELECT
    'rls_pii_encryption_log_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pii_encryption_log'
        AND c.relrowsecurity = true
    ),
    'RLS habilitado en pii_encryption_log';

  SELECT COUNT(*)
  INTO v_count
  FROM public.secret_rotation_state s
  WHERE (
      s.secret_key IS NULL
      OR btrim(s.secret_key) = ''
      OR s.current_secret_hash IS NULL
      OR btrim(s.current_secret_hash) = ''
      OR COALESCE(s.grace_period_hours, -1) < 0
      OR (s.next_rotation_due_at IS NOT NULL AND s.rotated_at IS NOT NULL AND s.next_rotation_due_at < s.rotated_at)
      OR (s.previous_secret_hash IS NOT NULL AND s.previous_secret_hash = s.current_secret_hash)
    )
    AND (
      p_tenant_id IS NULL
      OR s.tenant_id = p_tenant_id
      OR s.tenant_id IS NULL
    );

  RETURN QUERY
  SELECT
    'secret_rotation_state_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.system_alerts a
  WHERE (
      a.type IS NULL
      OR btrim(a.type) = ''
      OR a.message IS NULL
      OR btrim(a.message) = ''
      OR a.severity NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO')
      OR (a.acknowledged_at IS NOT NULL AND a.acknowledged_at < a.created_at)
      OR (a.resolved_at IS NOT NULL AND a.resolved_at < a.created_at)
      OR (a.resolved_at IS NOT NULL AND COALESCE(a.acknowledged, false) = false)
    )
    AND (
      p_tenant_id IS NULL
      OR a.tenant_id = p_tenant_id
      OR a.tenant_id IS NULL
    );

  RETURN QUERY
  SELECT
    'system_alerts_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.pii_encryption_log p
  WHERE (
      p.table_name IS NULL
      OR btrim(p.table_name) = ''
      OR p.field_name IS NULL
      OR btrim(p.field_name) = ''
      OR p.algorithm IS NULL
      OR btrim(p.algorithm) = ''
      OR p.action NOT IN ('ENCRYPT', 'DECRYPT', 'REENCRYPT', 'MASK', 'HASH')
      OR (COALESCE(p.success, true) = false AND (p.error_message IS NULL OR btrim(p.error_message) = ''))
      OR (p.processed_at IS NOT NULL AND p.processed_at < p.created_at)
    )
    AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'pii_encryption_log_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      COALESCE(s.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_scope,
      upper(s.secret_key) AS secret_key_norm,
      s.rotated_at,
      COUNT(*) AS c
    FROM public.secret_rotation_state s
    WHERE s.secret_key IS NOT NULL
      AND btrim(s.secret_key) <> ''
      AND s.rotated_at IS NOT NULL
      AND (
        p_tenant_id IS NULL
        OR s.tenant_id = p_tenant_id
        OR s.tenant_id IS NULL
      )
    GROUP BY COALESCE(s.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(s.secret_key), s.rotated_at
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_secret_rotation_scope_secret_rotated_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      COALESCE(a.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_scope,
      upper(a.alert_key) AS alert_key_norm,
      COUNT(*) AS c
    FROM public.system_alerts a
    WHERE a.alert_key IS NOT NULL
      AND btrim(a.alert_key) <> ''
      AND a.resolved_at IS NULL
      AND (
        p_tenant_id IS NULL
        OR a.tenant_id = p_tenant_id
        OR a.tenant_id IS NULL
      )
    GROUP BY COALESCE(a.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(a.alert_key)
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_system_alerts_unresolved_alert_key_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_security_secrets_runtime_status_actual AS
SELECT *
FROM public.validar_security_secrets_runtime(app.resolve_request_tenant_id());

COMMIT;
