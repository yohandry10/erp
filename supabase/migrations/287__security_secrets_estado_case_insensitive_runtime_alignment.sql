-- ============================================================================
-- 287__security_secrets_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive de estado en secretos/alertas/PII.
-- Tablas foco:
--   public.secret_rotation_state
--   public.system_alerts
--   public.pii_encryption_log
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helper canonico de normalizacion de estado por tabla del vertical.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_security_secrets_estado_287(
  p_table text,
  p_estado text,
  p_flag boolean DEFAULT NULL,
  p_resolved_at timestamptz DEFAULT NULL
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_table text;
  v text;
BEGIN
  v_table := lower(COALESCE(NULLIF(btrim(COALESCE(p_table, '')), ''), ''));
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), ''));

  IF v IN ('ENABLED', 'HABILITADO', 'VIGENTE', 'ACTIVA') THEN
    v := 'ACTIVO';
  END IF;
  IF v IN ('DISABLED', 'DESHABILITADO', 'INACTIVA', 'BAJA', 'RESUELTA', 'RESUELTO', 'CERRADA', 'CERRADO') THEN
    v := 'INACTIVO';
  END IF;
  IF v IN ('FAIL', 'FAILED', 'FAILURE', 'FALLIDO', 'ERRONEO') THEN
    v := 'ERROR';
  END IF;
  IF v IN ('SUCCESS', 'SUCCEEDED', 'EXITOSO', 'OK') THEN
    v := 'ACTIVO';
  END IF;

  IF v_table = 'system_alerts' THEN
    IF p_resolved_at IS NOT NULL THEN
      RETURN 'INACTIVO'::citext;
    END IF;

    IF v = '' THEN
      v := 'ACTIVO';
    END IF;
    IF v NOT IN ('ACTIVO', 'INACTIVO') THEN
      v := 'ACTIVO';
    END IF;
    RETURN v::citext;
  END IF;

  IF v_table = 'pii_encryption_log' THEN
    IF p_flag IS NOT NULL THEN
      RETURN CASE
        WHEN p_flag THEN 'ACTIVO'::citext
        ELSE 'ERROR'::citext
      END;
    END IF;

    IF v = '' THEN
      v := 'ACTIVO';
    END IF;
    IF v NOT IN ('ACTIVO', 'ERROR') THEN
      v := 'ACTIVO';
    END IF;
    RETURN v::citext;
  END IF;

  IF v = 'ERROR' THEN
    v := 'INACTIVO';
  END IF;
  IF v = '' THEN
    v := CASE WHEN COALESCE(p_flag, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  END IF;
  IF v NOT IN ('ACTIVO', 'INACTIVO') THEN
    v := CASE WHEN COALESCE(p_flag, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Garantizar columnas minimas de contrato.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.secret_rotation_state
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.system_alerts
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.pii_encryption_log
  ADD COLUMN IF NOT EXISTS success boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- Normalizadores runtime (reemplazo compatible de funciones existentes).
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
  NEW.estado := app.normalize_security_secrets_estado_287(
    'secret_rotation_state',
    NEW.estado::text,
    true,
    NULL
  );
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

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
  NEW.estado := app.normalize_security_secrets_estado_287(
    'system_alerts',
    NEW.estado::text,
    NULL,
    NEW.resolved_at
  );
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

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
  NEW.estado := app.normalize_security_secrets_estado_287(
    'pii_encryption_log',
    NEW.estado::text,
    NEW.success,
    NULL
  );
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

DROP TRIGGER IF EXISTS trg_normalize_system_alerts_row ON public.system_alerts;
CREATE TRIGGER trg_normalize_system_alerts_row
BEFORE INSERT OR UPDATE ON public.system_alerts
FOR EACH ROW
EXECUTE FUNCTION app.normalize_system_alerts_row();

DROP TRIGGER IF EXISTS trg_normalize_pii_encryption_log_row ON public.pii_encryption_log;
CREATE TRIGGER trg_normalize_pii_encryption_log_row
BEFORE INSERT OR UPDATE ON public.pii_encryption_log
FOR EACH ROW
EXECUTE FUNCTION app.normalize_pii_encryption_log_row();

-- ----------------------------------------------------------------------------
-- Migracion de estado a citext + defaults canonicos.
-- ----------------------------------------------------------------------------
ALTER TABLE public.secret_rotation_state
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_secrets_estado_287('secret_rotation_state', estado::text, true, NULL),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.system_alerts
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_secrets_estado_287('system_alerts', estado::text, NULL, resolved_at),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE public.pii_encryption_log
  ALTER COLUMN estado TYPE citext
  USING app.normalize_security_secrets_estado_287('pii_encryption_log', estado::text, COALESCE(success, true), NULL),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo de estado.
-- ----------------------------------------------------------------------------
UPDATE public.secret_rotation_state
SET
  estado = app.normalize_security_secrets_estado_287('secret_rotation_state', estado::text, true, NULL),
  updated_at = COALESCE(updated_at, now());

UPDATE public.system_alerts
SET
  acknowledged = COALESCE(acknowledged, false) OR (resolved_at IS NOT NULL),
  acknowledged_at = CASE
    WHEN (COALESCE(acknowledged, false) OR resolved_at IS NOT NULL) AND acknowledged_at IS NULL
      THEN COALESCE(resolved_at, created_at, now())
    ELSE acknowledged_at
  END,
  estado = app.normalize_security_secrets_estado_287('system_alerts', estado::text, NULL, resolved_at),
  updated_at = COALESCE(updated_at, now());

UPDATE public.pii_encryption_log
SET
  success = COALESCE(success, true),
  estado = app.normalize_security_secrets_estado_287('pii_encryption_log', estado::text, COALESCE(success, true), NULL),
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_secret_rotation_state_tenant_estado_ci_runtime_287
ON public.secret_rotation_state (tenant_id, estado, rotated_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_estado_ci_runtime_287
ON public.system_alerts (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pii_encryption_log_tenant_estado_ci_runtime_287
ON public.pii_encryption_log (tenant_id, estado, created_at DESC);

COMMIT;
