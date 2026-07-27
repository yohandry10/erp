-- ============================================================================
-- 120__observabilidad_integrity_rls.sql
-- Integridad y hardening RLS para observabilidad.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill defensivo antes de constraints.
-- ----------------------------------------------------------------------------
UPDATE public.integration_logs
SET
  servicio = upper(COALESCE(NULLIF(btrim(COALESCE(servicio, '')), ''), NULLIF(btrim(COALESCE(tipo, '')), ''), 'GENERAL')),
  operacion = upper(COALESCE(NULLIF(btrim(COALESCE(operacion, '')), ''), NULLIF(btrim(COALESCE(action, '')), ''), NULLIF(btrim(COALESCE(tipo, '')), ''), 'UNSPECIFIED')),
  status = upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'INFO')),
  estado = upper(COALESCE(NULLIF(btrim(COALESCE(status, '')), ''), NULLIF(btrim(COALESCE(estado, '')), ''), 'INFO')),
  duration_ms = GREATEST(COALESCE(duration_ms, 0), 0),
  "timestamp" = COALESCE("timestamp", now()),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.integration_logs
SET status = 'INFO', estado = 'INFO', updated_at = now()
WHERE status NOT IN ('SUCCESS', 'ERROR', 'SKIP', 'PENDING', 'TIMEOUT', 'GENERATED', 'COMPLETED', 'WARNING', 'INFO');

UPDATE public.notificaciones
SET
  tipo = lower(COALESCE(NULLIF(btrim(COALESCE(tipo, '')), ''), 'system')),
  severidad = lower(COALESCE(NULLIF(btrim(COALESCE(severidad, '')), ''), 'info')),
  titulo = COALESCE(NULLIF(btrim(COALESCE(titulo, '')), ''), initcap(replace(COALESCE(tipo, 'system'), '_', ' '))),
  mensaje = COALESCE(NULLIF(btrim(COALESCE(mensaje, '')), ''), COALESCE(NULLIF(btrim(COALESCE(titulo, '')), ''), 'Notificación')),
  roles_destinatarios = COALESCE(roles_destinatarios, '{}'::uuid[]),
  leida = COALESCE(leida, false),
  leida_at = CASE WHEN COALESCE(leida, false) THEN COALESCE(leida_at, now()) ELSE NULL END,
  updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.notificaciones
SET severidad = 'info', updated_at = now()
WHERE severidad NOT IN ('info', 'warning', 'error', 'success', 'critical');

UPDATE public.audit_log
SET
  table_name = lower(COALESCE(NULLIF(btrim(COALESCE(table_name, '')), ''), 'unknown')),
  operation = upper(COALESCE(NULLIF(btrim(COALESCE(operation, '')), ''), 'UPDATE')),
  metadata = COALESCE(metadata, '{}'::jsonb),
  changed_fields = CASE
    WHEN changed_fields IS NULL THEN NULL
    WHEN jsonb_typeof(changed_fields) = 'array' THEN changed_fields
    ELSE jsonb_build_array(changed_fields)
  END,
  "timestamp" = COALESCE("timestamp", now())
WHERE true;

UPDATE public.audit_log
SET operation = 'UPDATE'
WHERE operation NOT IN (
  'INSERT', 'UPDATE', 'DELETE',
  'LOGIN', 'LOGOUT',
  'CREATE', 'READ',
  'APPROVE', 'REJECT',
  'ASSIGN', 'UNASSIGN'
);

-- ----------------------------------------------------------------------------
-- Constraints de calidad.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.integration_logs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_integration_logs_servicio_nonempty'
        AND conrelid = 'public.integration_logs'::regclass
    ) THEN
      ALTER TABLE public.integration_logs
      ADD CONSTRAINT ck_integration_logs_servicio_nonempty
      CHECK (servicio IS NOT NULL AND btrim(servicio) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_integration_logs_operacion_nonempty'
        AND conrelid = 'public.integration_logs'::regclass
    ) THEN
      ALTER TABLE public.integration_logs
      ADD CONSTRAINT ck_integration_logs_operacion_nonempty
      CHECK (operacion IS NOT NULL AND btrim(operacion) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_integration_logs_status_allowed'
        AND conrelid = 'public.integration_logs'::regclass
    ) THEN
      ALTER TABLE public.integration_logs
      ADD CONSTRAINT ck_integration_logs_status_allowed
      CHECK (status IS NOT NULL AND status IN ('SUCCESS', 'ERROR', 'SKIP', 'PENDING', 'TIMEOUT', 'GENERATED', 'COMPLETED', 'WARNING', 'INFO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_integration_logs_duration_nonnegative'
        AND conrelid = 'public.integration_logs'::regclass
    ) THEN
      ALTER TABLE public.integration_logs
      ADD CONSTRAINT ck_integration_logs_duration_nonnegative
      CHECK (duration_ms IS NULL OR duration_ms >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_integration_logs_status_code_range'
        AND conrelid = 'public.integration_logs'::regclass
    ) THEN
      ALTER TABLE public.integration_logs
      ADD CONSTRAINT ck_integration_logs_status_code_range
      CHECK (status_code IS NULL OR status_code BETWEEN 100 AND 599);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_integration_logs_timestamp_not_null'
        AND conrelid = 'public.integration_logs'::regclass
    ) THEN
      ALTER TABLE public.integration_logs
      ADD CONSTRAINT ck_integration_logs_timestamp_not_null
      CHECK ("timestamp" IS NOT NULL);
    END IF;
  END IF;

  IF to_regclass('public.notificaciones') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_notificaciones_tipo_nonempty'
        AND conrelid = 'public.notificaciones'::regclass
    ) THEN
      ALTER TABLE public.notificaciones
      ADD CONSTRAINT ck_notificaciones_tipo_nonempty
      CHECK (tipo IS NOT NULL AND btrim(tipo) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_notificaciones_severidad_allowed'
        AND conrelid = 'public.notificaciones'::regclass
    ) THEN
      ALTER TABLE public.notificaciones
      ADD CONSTRAINT ck_notificaciones_severidad_allowed
      CHECK (severidad IS NOT NULL AND severidad IN ('info', 'warning', 'error', 'success', 'critical'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_notificaciones_titulo_nonempty'
        AND conrelid = 'public.notificaciones'::regclass
    ) THEN
      ALTER TABLE public.notificaciones
      ADD CONSTRAINT ck_notificaciones_titulo_nonempty
      CHECK (titulo IS NOT NULL AND btrim(titulo) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_notificaciones_mensaje_nonempty'
        AND conrelid = 'public.notificaciones'::regclass
    ) THEN
      ALTER TABLE public.notificaciones
      ADD CONSTRAINT ck_notificaciones_mensaje_nonempty
      CHECK (mensaje IS NOT NULL AND btrim(mensaje) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_notificaciones_leida_at_when_read'
        AND conrelid = 'public.notificaciones'::regclass
    ) THEN
      ALTER TABLE public.notificaciones
      ADD CONSTRAINT ck_notificaciones_leida_at_when_read
      CHECK (COALESCE(leida, false) = false OR leida_at IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_notificaciones_roles_not_null'
        AND conrelid = 'public.notificaciones'::regclass
    ) THEN
      ALTER TABLE public.notificaciones
      ADD CONSTRAINT ck_notificaciones_roles_not_null
      CHECK (roles_destinatarios IS NOT NULL);
    END IF;
  END IF;

  IF to_regclass('public.audit_log') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_audit_log_table_name_nonempty'
        AND conrelid = 'public.audit_log'::regclass
    ) THEN
      ALTER TABLE public.audit_log
      ADD CONSTRAINT ck_audit_log_table_name_nonempty
      CHECK (table_name IS NOT NULL AND btrim(table_name) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_audit_log_operation_allowed'
        AND conrelid = 'public.audit_log'::regclass
    ) THEN
      ALTER TABLE public.audit_log
      ADD CONSTRAINT ck_audit_log_operation_allowed
      CHECK (
        operation IN (
          'INSERT', 'UPDATE', 'DELETE',
          'LOGIN', 'LOGOUT',
          'CREATE', 'READ',
          'APPROVE', 'REJECT',
          'ASSIGN', 'UNASSIGN'
        )
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_audit_log_changed_fields_array'
        AND conrelid = 'public.audit_log'::regclass
    ) THEN
      ALTER TABLE public.audit_log
      ADD CONSTRAINT ck_audit_log_changed_fields_array
      CHECK (changed_fields IS NULL OR jsonb_typeof(changed_fields) = 'array');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_audit_log_timestamp_not_null'
        AND conrelid = 'public.audit_log'::regclass
    ) THEN
      ALTER TABLE public.audit_log
      ADD CONSTRAINT ck_audit_log_timestamp_not_null
      CHECK ("timestamp" IS NOT NULL);
    END IF;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'integration_logs');
SELECT app.apply_tenant_policy('public', 'notificaciones');
SELECT app.apply_tenant_policy('public', 'audit_log');

COMMIT;
