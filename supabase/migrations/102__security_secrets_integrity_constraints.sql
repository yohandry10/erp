-- ============================================================================
-- 102__security_secrets_integrity_constraints.sql
-- Integridad de datos y hardening RLS para secretos/alertas/PII logs.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill defensivo antes de constraints.
-- ----------------------------------------------------------------------------
UPDATE public.secret_rotation_state
SET
  secret_key = upper(COALESCE(NULLIF(btrim(COALESCE(secret_key, '')), ''), 'UNKNOWN_SECRET')),
  current_secret_hash = COALESCE(
    NULLIF(btrim(COALESCE(current_secret_hash, '')), ''),
    substring(md5(COALESCE(secret_key, 'UNKNOWN_SECRET') || COALESCE(rotated_at::text, now()::text)), 1, 16)
  ),
  previous_secret_hash = NULLIF(btrim(COALESCE(previous_secret_hash, '')), ''),
  grace_period_hours = GREATEST(COALESCE(grace_period_hours, 24), 0),
  source_module = COALESCE(NULLIF(btrim(COALESCE(source_module, '')), ''), 'SECURITY'),
  rotation_reason = COALESCE(NULLIF(btrim(COALESCE(rotation_reason, '')), ''), 'SCHEDULED'),
  rotated_at = COALESCE(rotated_at, created_at, now()),
  next_rotation_due_at = COALESCE(next_rotation_due_at, COALESCE(rotated_at, created_at, now()) + make_interval(days => 90)),
  estado = COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), 'ACTIVO'),
  updated_at = now()
WHERE
  secret_key IS NULL
  OR btrim(COALESCE(secret_key, '')) = ''
  OR current_secret_hash IS NULL
  OR btrim(COALESCE(current_secret_hash, '')) = ''
  OR grace_period_hours IS NULL
  OR grace_period_hours < 0
  OR rotated_at IS NULL
  OR next_rotation_due_at IS NULL
  OR source_module IS NULL
  OR btrim(COALESCE(source_module, '')) = ''
  OR rotation_reason IS NULL
  OR btrim(COALESCE(rotation_reason, '')) = ''
  OR estado IS NULL
  OR btrim(COALESCE(estado, '')) = '';

UPDATE public.system_alerts
SET
  type = upper(COALESCE(NULLIF(btrim(COALESCE(type, '')), ''), 'SYSTEM')),
  severity = upper(COALESCE(NULLIF(btrim(COALESCE(severity, '')), ''), 'MEDIUM')),
  message = COALESCE(NULLIF(btrim(COALESCE(message, '')), ''), 'System alert'),
  category = COALESCE(NULLIF(btrim(COALESCE(category, '')), ''), split_part(upper(COALESCE(NULLIF(btrim(COALESCE(type, '')), ''), 'SYSTEM')), '_', 1)),
  source_module = COALESCE(NULLIF(btrim(COALESCE(source_module, '')), ''), 'SECURITY'),
  alert_key = NULLIF(btrim(COALESCE(alert_key, '')), ''),
  acknowledged = COALESCE(acknowledged, false),
  acknowledged_at = CASE
    WHEN COALESCE(acknowledged, false) = true THEN COALESCE(acknowledged_at, created_at, now())
    ELSE acknowledged_at
  END,
  resolved_at = resolved_at,
  estado = CASE
    WHEN resolved_at IS NOT NULL THEN 'INACTIVO'
    ELSE COALESCE(NULLIF(btrim(COALESCE(estado, '')), ''), 'ACTIVO')
  END,
  updated_at = now()
WHERE
  type IS NULL
  OR btrim(COALESCE(type, '')) = ''
  OR severity IS NULL
  OR btrim(COALESCE(severity, '')) = ''
  OR message IS NULL
  OR btrim(COALESCE(message, '')) = ''
  OR category IS NULL
  OR btrim(COALESCE(category, '')) = ''
  OR source_module IS NULL
  OR btrim(COALESCE(source_module, '')) = ''
  OR acknowledged IS NULL
  OR estado IS NULL
  OR btrim(COALESCE(estado, '')) = '';

UPDATE public.pii_encryption_log
SET
  table_name = lower(COALESCE(NULLIF(btrim(COALESCE(table_name, '')), ''), 'unknown_table')),
  field_name = COALESCE(NULLIF(btrim(COALESCE(field_name, '')), ''), 'unknown_field'),
  action = upper(COALESCE(NULLIF(btrim(COALESCE(action, '')), ''), 'ENCRYPT')),
  algorithm = upper(COALESCE(NULLIF(btrim(COALESCE(algorithm, '')), ''), 'AES-256-GCM')),
  key_version = COALESCE(NULLIF(btrim(COALESCE(key_version, '')), ''), 'v1'),
  success = COALESCE(success, true),
  error_message = NULLIF(btrim(COALESCE(error_message, '')), ''),
  processed_at = COALESCE(processed_at, created_at, now()),
  estado = CASE WHEN COALESCE(success, true) THEN 'ACTIVO' ELSE 'ERROR' END,
  updated_at = now()
WHERE
  table_name IS NULL
  OR btrim(COALESCE(table_name, '')) = ''
  OR field_name IS NULL
  OR btrim(COALESCE(field_name, '')) = ''
  OR action IS NULL
  OR btrim(COALESCE(action, '')) = ''
  OR algorithm IS NULL
  OR btrim(COALESCE(algorithm, '')) = ''
  OR key_version IS NULL
  OR btrim(COALESCE(key_version, '')) = ''
  OR success IS NULL
  OR processed_at IS NULL
  OR estado IS NULL
  OR btrim(COALESCE(estado, '')) = '';

UPDATE public.secret_rotation_state
SET
  previous_secret_hash = NULL,
  updated_at = now()
WHERE previous_secret_hash IS NOT NULL
  AND previous_secret_hash = current_secret_hash;

-- ----------------------------------------------------------------------------
-- Dedupe para soportar índices únicos.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(secret_key), rotated_at
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.secret_rotation_state
  WHERE secret_key IS NOT NULL
    AND btrim(secret_key) <> ''
    AND rotated_at IS NOT NULL
)
UPDATE public.secret_rotation_state s
SET
  rotated_at = s.rotated_at + make_interval(secs => ranked.rn - 1),
  next_rotation_due_at = COALESCE(
    s.next_rotation_due_at,
    s.rotated_at + make_interval(days => 90)
  ) + make_interval(secs => ranked.rn - 1),
  updated_at = now()
FROM ranked
WHERE s.id = ranked.id
  AND ranked.rn > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(alert_key)
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.system_alerts
  WHERE alert_key IS NOT NULL
    AND btrim(alert_key) <> ''
    AND resolved_at IS NULL
)
UPDATE public.system_alerts a
SET
  resolved_at = now(),
  estado = 'INACTIVO',
  acknowledged = true,
  acknowledged_at = COALESCE(acknowledged_at, now()),
  updated_at = now(),
  metadata = COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object('dedupe_migration', '102__security_secrets_integrity_constraints')
FROM ranked
WHERE a.id = ranked.id
  AND ranked.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints y relaciones.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.secret_rotation_state') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_secret_rotation_state_secret_key_nonempty'
        AND conrelid = 'public.secret_rotation_state'::regclass
    ) THEN
      ALTER TABLE public.secret_rotation_state
      ADD CONSTRAINT ck_secret_rotation_state_secret_key_nonempty
      CHECK (secret_key IS NOT NULL AND btrim(secret_key) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_secret_rotation_state_current_hash_nonempty'
        AND conrelid = 'public.secret_rotation_state'::regclass
    ) THEN
      ALTER TABLE public.secret_rotation_state
      ADD CONSTRAINT ck_secret_rotation_state_current_hash_nonempty
      CHECK (current_secret_hash IS NOT NULL AND btrim(current_secret_hash) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_secret_rotation_state_grace_nonnegative'
        AND conrelid = 'public.secret_rotation_state'::regclass
    ) THEN
      ALTER TABLE public.secret_rotation_state
      ADD CONSTRAINT ck_secret_rotation_state_grace_nonnegative
      CHECK (grace_period_hours >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_secret_rotation_state_due_after_rotated'
        AND conrelid = 'public.secret_rotation_state'::regclass
    ) THEN
      ALTER TABLE public.secret_rotation_state
      ADD CONSTRAINT ck_secret_rotation_state_due_after_rotated
      CHECK (next_rotation_due_at IS NULL OR rotated_at IS NULL OR next_rotation_due_at >= rotated_at);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_secret_rotation_state_prev_diff_current'
        AND conrelid = 'public.secret_rotation_state'::regclass
    ) THEN
      ALTER TABLE public.secret_rotation_state
      ADD CONSTRAINT ck_secret_rotation_state_prev_diff_current
      CHECK (previous_secret_hash IS NULL OR previous_secret_hash <> current_secret_hash);
    END IF;
  END IF;

  IF to_regclass('public.system_alerts') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_system_alerts_type_nonempty'
        AND conrelid = 'public.system_alerts'::regclass
    ) THEN
      ALTER TABLE public.system_alerts
      ADD CONSTRAINT ck_system_alerts_type_nonempty
      CHECK (type IS NOT NULL AND btrim(type) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_system_alerts_severity_valid'
        AND conrelid = 'public.system_alerts'::regclass
    ) THEN
      ALTER TABLE public.system_alerts
      ADD CONSTRAINT ck_system_alerts_severity_valid
      CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_system_alerts_message_nonempty'
        AND conrelid = 'public.system_alerts'::regclass
    ) THEN
      ALTER TABLE public.system_alerts
      ADD CONSTRAINT ck_system_alerts_message_nonempty
      CHECK (message IS NOT NULL AND btrim(message) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_system_alerts_ack_timeline'
        AND conrelid = 'public.system_alerts'::regclass
    ) THEN
      ALTER TABLE public.system_alerts
      ADD CONSTRAINT ck_system_alerts_ack_timeline
      CHECK (acknowledged_at IS NULL OR acknowledged_at >= created_at);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_system_alerts_resolved_timeline'
        AND conrelid = 'public.system_alerts'::regclass
    ) THEN
      ALTER TABLE public.system_alerts
      ADD CONSTRAINT ck_system_alerts_resolved_timeline
      CHECK (resolved_at IS NULL OR resolved_at >= created_at);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_system_alerts_resolved_requires_ack'
        AND conrelid = 'public.system_alerts'::regclass
    ) THEN
      ALTER TABLE public.system_alerts
      ADD CONSTRAINT ck_system_alerts_resolved_requires_ack
      CHECK (resolved_at IS NULL OR COALESCE(acknowledged, false) = true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_system_alerts_acknowledged_by'
        AND conrelid = 'public.system_alerts'::regclass
    ) THEN
      ALTER TABLE public.system_alerts
      ADD CONSTRAINT fk_system_alerts_acknowledged_by
      FOREIGN KEY (acknowledged_by) REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_system_alerts_resolved_by'
        AND conrelid = 'public.system_alerts'::regclass
    ) THEN
      ALTER TABLE public.system_alerts
      ADD CONSTRAINT fk_system_alerts_resolved_by
      FOREIGN KEY (resolved_by) REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('public.pii_encryption_log') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pii_encryption_log_table_nonempty'
        AND conrelid = 'public.pii_encryption_log'::regclass
    ) THEN
      ALTER TABLE public.pii_encryption_log
      ADD CONSTRAINT ck_pii_encryption_log_table_nonempty
      CHECK (table_name IS NOT NULL AND btrim(table_name) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pii_encryption_log_field_nonempty'
        AND conrelid = 'public.pii_encryption_log'::regclass
    ) THEN
      ALTER TABLE public.pii_encryption_log
      ADD CONSTRAINT ck_pii_encryption_log_field_nonempty
      CHECK (field_name IS NOT NULL AND btrim(field_name) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pii_encryption_log_action_valid'
        AND conrelid = 'public.pii_encryption_log'::regclass
    ) THEN
      ALTER TABLE public.pii_encryption_log
      ADD CONSTRAINT ck_pii_encryption_log_action_valid
      CHECK (action IN ('ENCRYPT', 'DECRYPT', 'REENCRYPT', 'MASK', 'HASH'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pii_encryption_log_algorithm_nonempty'
        AND conrelid = 'public.pii_encryption_log'::regclass
    ) THEN
      ALTER TABLE public.pii_encryption_log
      ADD CONSTRAINT ck_pii_encryption_log_algorithm_nonempty
      CHECK (algorithm IS NOT NULL AND btrim(algorithm) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pii_encryption_log_failed_requires_error'
        AND conrelid = 'public.pii_encryption_log'::regclass
    ) THEN
      ALTER TABLE public.pii_encryption_log
      ADD CONSTRAINT ck_pii_encryption_log_failed_requires_error
      CHECK (COALESCE(success, true) OR (error_message IS NOT NULL AND btrim(error_message) <> ''));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pii_encryption_log_processed_at_timeline'
        AND conrelid = 'public.pii_encryption_log'::regclass
    ) THEN
      ALTER TABLE public.pii_encryption_log
      ADD CONSTRAINT ck_pii_encryption_log_processed_at_timeline
      CHECK (processed_at IS NULL OR processed_at >= created_at);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_pii_encryption_log_usuario_id'
        AND conrelid = 'public.pii_encryption_log'::regclass
    ) THEN
      ALTER TABLE public.pii_encryption_log
      ADD CONSTRAINT fk_pii_encryption_log_usuario_id
      FOREIGN KEY (usuario_id) REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL;
    END IF;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Índices únicos operativos.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_secret_rotation_state_scope_secret_rotated_at
ON public.secret_rotation_state (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(secret_key),
  rotated_at
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_system_alerts_scope_alert_key_unresolved
ON public.system_alerts (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(alert_key)
)
WHERE alert_key IS NOT NULL
  AND btrim(alert_key) <> ''
  AND resolved_at IS NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS para tablas de seguridad.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.secret_rotation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.secret_rotation_state FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.secret_rotation_state;
DROP POLICY IF EXISTS secret_rotation_state_read_scope ON public.secret_rotation_state;
DROP POLICY IF EXISTS secret_rotation_state_write_scope ON public.secret_rotation_state;
CREATE POLICY secret_rotation_state_read_scope
ON public.secret_rotation_state
FOR SELECT
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (tenant_id IS NULL AND app.current_tenant_id() IS NOT NULL)
);
CREATE POLICY secret_rotation_state_write_scope
ON public.secret_rotation_state
FOR ALL
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (tenant_id IS NULL AND app.current_tenant_id() IS NOT NULL)
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (tenant_id IS NULL AND app.current_tenant_id() IS NOT NULL)
);

ALTER TABLE IF EXISTS public.system_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.system_alerts;
DROP POLICY IF EXISTS system_alerts_read_scope ON public.system_alerts;
DROP POLICY IF EXISTS system_alerts_write_scope ON public.system_alerts;
CREATE POLICY system_alerts_read_scope
ON public.system_alerts
FOR SELECT
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (tenant_id IS NULL AND app.current_tenant_id() IS NOT NULL)
);
CREATE POLICY system_alerts_write_scope
ON public.system_alerts
FOR ALL
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (tenant_id IS NULL AND app.current_tenant_id() IS NOT NULL)
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (tenant_id IS NULL AND app.current_tenant_id() IS NOT NULL)
);

ALTER TABLE IF EXISTS public.pii_encryption_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pii_encryption_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.pii_encryption_log;
DROP POLICY IF EXISTS pii_encryption_log_tenant_policy ON public.pii_encryption_log;
CREATE POLICY pii_encryption_log_tenant_policy
ON public.pii_encryption_log
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
);

COMMIT;
