-- ============================================================================
-- 101__security_secrets_runtime_alignment.sql
-- Alineación runtime para rotación de secretos, alertas del sistema y trazas PII.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas runtime para estado de rotación de secretos.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.secret_rotation_state
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS rotation_reason text,
  ADD COLUMN IF NOT EXISTS next_rotation_due_at timestamptz;

-- ----------------------------------------------------------------------------
-- Columnas runtime para alertas de sistema.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.system_alerts
  ADD COLUMN IF NOT EXISTS alert_key text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS acknowledged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

-- ----------------------------------------------------------------------------
-- Columnas runtime para auditoría PII.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pii_encryption_log
  ADD COLUMN IF NOT EXISTS table_name text,
  ADD COLUMN IF NOT EXISTS record_id uuid,
  ADD COLUMN IF NOT EXISTS field_name text,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS algorithm text,
  ADD COLUMN IF NOT EXISTS key_version text,
  ADD COLUMN IF NOT EXISTS success boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS usuario_id uuid;

-- ----------------------------------------------------------------------------
-- Normalización de secret_rotation_state.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_secret_rotation_state_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.secret_key := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.secret_key, '')), ''), 'UNKNOWN_SECRET'));
  NEW.current_secret_hash := COALESCE(
    NULLIF(btrim(COALESCE(NEW.current_secret_hash, '')), ''),
    substring(md5(NEW.secret_key || COALESCE(NEW.rotated_at::text, now()::text)), 1, 16)
  );
  NEW.previous_secret_hash := NULLIF(btrim(COALESCE(NEW.previous_secret_hash, '')), '');
  NEW.grace_period_hours := GREATEST(COALESCE(NEW.grace_period_hours, 24), 0);
  NEW.source_module := COALESCE(NULLIF(btrim(COALESCE(NEW.source_module, '')), ''), 'SECURITY');
  NEW.rotation_reason := COALESCE(NULLIF(btrim(COALESCE(NEW.rotation_reason, '')), ''), 'SCHEDULED');
  NEW.rotated_at := COALESCE(NEW.rotated_at, NEW.created_at, now());
  NEW.next_rotation_due_at := COALESCE(
    NEW.next_rotation_due_at,
    NEW.rotated_at + make_interval(days => 90)
  );
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), NEW.secret_key);
  NEW.codigo := COALESCE(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''), NEW.secret_key);
  NEW.estado := COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO');
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_secret_rotation_state_row ON public.secret_rotation_state;
CREATE TRIGGER trg_normalize_secret_rotation_state_row
BEFORE INSERT OR UPDATE ON public.secret_rotation_state
FOR EACH ROW
EXECUTE FUNCTION app.normalize_secret_rotation_state_row();

-- ----------------------------------------------------------------------------
-- Normalización de system_alerts.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_system_alerts_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.type := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.type, '')), ''), 'SYSTEM'));
  NEW.severity := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.severity, '')), ''), 'MEDIUM'));
  NEW.message := COALESCE(
    NULLIF(btrim(COALESCE(NEW.message, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('System alert %s', NEW.type)
  );
  NEW.alert_key := NULLIF(btrim(COALESCE(NEW.alert_key, '')), '');
  NEW.category := COALESCE(
    NULLIF(btrim(COALESCE(NEW.category, '')), ''),
    split_part(NEW.type, '_', 1)
  );
  NEW.source_module := COALESCE(NULLIF(btrim(COALESCE(NEW.source_module, '')), ''), 'SECURITY');
  NEW.acknowledged := COALESCE(NEW.acknowledged, false);
  IF NEW.resolved_at IS NOT NULL THEN
    NEW.acknowledged := true;
  END IF;
  IF NEW.acknowledged AND NEW.acknowledged_at IS NULL THEN
    NEW.acknowledged_at := now();
  END IF;
  NEW.estado := CASE
    WHEN NEW.resolved_at IS NOT NULL THEN 'INACTIVO'
    ELSE COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO')
  END;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_system_alerts_row ON public.system_alerts;
CREATE TRIGGER trg_normalize_system_alerts_row
BEFORE INSERT OR UPDATE ON public.system_alerts
FOR EACH ROW
EXECUTE FUNCTION app.normalize_system_alerts_row();

-- ----------------------------------------------------------------------------
-- Normalización de pii_encryption_log.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_pii_encryption_log_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.table_name := lower(COALESCE(
    NULLIF(btrim(COALESCE(NEW.table_name, '')), ''),
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'unknown_table'
  ));
  NEW.field_name := COALESCE(
    NULLIF(btrim(COALESCE(NEW.field_name, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'unknown_field'
  );
  NEW.action := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.action, '')), ''), 'ENCRYPT'));
  NEW.algorithm := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.algorithm, '')), ''), 'AES-256-GCM'));
  NEW.key_version := COALESCE(NULLIF(btrim(COALESCE(NEW.key_version, '')), ''), 'v1');
  NEW.success := COALESCE(NEW.success, true);
  NEW.error_message := NULLIF(btrim(COALESCE(NEW.error_message, '')), '');
  NEW.processed_at := COALESCE(NEW.processed_at, NEW.created_at, now());
  NEW.estado := CASE WHEN COALESCE(NEW.success, true) THEN 'ACTIVO' ELSE 'ERROR' END;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pii_encryption_log_row ON public.pii_encryption_log;
CREATE TRIGGER trg_normalize_pii_encryption_log_row
BEFORE INSERT OR UPDATE ON public.pii_encryption_log
FOR EACH ROW
EXECUTE FUNCTION app.normalize_pii_encryption_log_row();

-- ----------------------------------------------------------------------------
-- Backfill de normalización.
-- ----------------------------------------------------------------------------
UPDATE public.secret_rotation_state
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.system_alerts
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.pii_encryption_log
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Índices runtime.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_secret_rotation_state_tenant_secret_rotated_runtime
ON public.secret_rotation_state (tenant_id, secret_key, rotated_at DESC);

CREATE INDEX IF NOT EXISTS idx_secret_rotation_state_next_due_runtime
ON public.secret_rotation_state (next_rotation_due_at)
WHERE next_rotation_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_type_severity_created_runtime
ON public.system_alerts (tenant_id, type, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_alerts_unresolved_runtime
ON public.system_alerts (tenant_id, severity, created_at DESC)
WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_system_alerts_alert_key_unresolved_runtime
ON public.system_alerts (tenant_id, alert_key)
WHERE alert_key IS NOT NULL AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pii_encryption_log_tenant_table_record_runtime
ON public.pii_encryption_log (tenant_id, table_name, record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pii_encryption_log_tenant_success_created_runtime
ON public.pii_encryption_log (tenant_id, success, created_at DESC);

-- ----------------------------------------------------------------------------
-- Vista operativa de rotación de secretos.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_secrets_rotation_status;

CREATE OR REPLACE VIEW public.v_secrets_rotation_status AS
SELECT
  s.id,
  s.tenant_id,
  s.secret_key,
  s.current_secret_hash,
  s.previous_secret_hash,
  s.rotated_at,
  s.grace_period_hours,
  s.next_rotation_due_at,
  s.source_module,
  s.rotation_reason,
  s.estado,
  s.created_at,
  s.updated_at
FROM public.secret_rotation_state s;

COMMIT;
