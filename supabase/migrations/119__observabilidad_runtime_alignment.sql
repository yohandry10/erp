-- ============================================================================
-- 119__observabilidad_runtime_alignment.sql
-- Alineación runtime para observabilidad: integration_logs, notificaciones, audit_log.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- integration_logs: normalización de payload operativo y trazabilidad temporal.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_integration_logs_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  NEW.servicio := upper(COALESCE(
    NULLIF(btrim(COALESCE(NEW.servicio, '')), ''),
    NULLIF(btrim(COALESCE(NEW.tipo, '')), ''),
    'GENERAL'
  ));

  NEW.operacion := upper(COALESCE(
    NULLIF(btrim(COALESCE(NEW.operacion, '')), ''),
    NULLIF(btrim(COALESCE(NEW.action, '')), ''),
    NULLIF(btrim(COALESCE(NEW.tipo, '')), ''),
    'UNSPECIFIED'
  ));

  v_status := upper(COALESCE(
    NULLIF(btrim(COALESCE(NEW.status, '')), ''),
    NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
    'INFO'
  ));

  IF v_status IN ('ACTIVO', 'INACTIVO') THEN
    v_status := 'INFO';
  END IF;

  IF v_status NOT IN ('SUCCESS', 'ERROR', 'SKIP', 'PENDING', 'TIMEOUT', 'GENERATED', 'COMPLETED', 'WARNING', 'INFO') THEN
    v_status := 'INFO';
  END IF;

  NEW.status := v_status;
  NEW.estado := v_status;

  NEW.correlacion_id := NULLIF(btrim(COALESCE(NEW.correlacion_id, '')), '');
  NEW.correlacion_tipo := NULLIF(upper(btrim(COALESCE(NEW.correlacion_tipo, ''))), '');
  NEW.error_message := NULLIF(btrim(COALESCE(NEW.error_message, '')), '');
  NEW.message := NULLIF(btrim(COALESCE(NEW.message, '')), '');

  NEW.request_summary := COALESCE(NEW.request_summary, NEW.payload);
  NEW.response_summary := COALESCE(NEW.response_summary, NULL);
  NEW.duration_ms := GREATEST(COALESCE(NEW.duration_ms, 0), 0);

  NEW.timestamp := COALESCE(NEW.timestamp, now());
  NEW.created_at := COALESCE(NEW.created_at, NEW.timestamp, now());
  NEW.updated_at := now();

  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    NEW.servicio || '-' || NEW.operacion || '-' || to_char(NEW.timestamp, 'YYYYMMDDHH24MISSMS')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_integration_logs_row ON public.integration_logs;
CREATE TRIGGER trg_normalize_integration_logs_row
BEFORE INSERT OR UPDATE ON public.integration_logs
FOR EACH ROW
EXECUTE FUNCTION app.normalize_integration_logs_row();

UPDATE public.integration_logs
SET updated_at = COALESCE(updated_at, now())
WHERE true;

CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant_timestamp_runtime
ON public.integration_logs (tenant_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant_servicio_operacion_timestamp_runtime
ON public.integration_logs (tenant_id, servicio, operacion, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant_status_timestamp_runtime
ON public.integration_logs (tenant_id, status, "timestamp" DESC);

-- ----------------------------------------------------------------------------
-- notificaciones: normalización de targeting y estado de lectura.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_notificaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tipo := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'system'));
  NEW.severidad := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.severidad, '')), ''), 'info'));

  IF NEW.severidad NOT IN ('info', 'warning', 'error', 'success', 'critical') THEN
    NEW.severidad := 'info';
  END IF;

  NEW.titulo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.titulo, '')), ''),
    initcap(replace(NEW.tipo, '_', ' '))
  );

  NEW.mensaje := COALESCE(
    NULLIF(btrim(COALESCE(NEW.mensaje, '')), ''),
    NEW.titulo
  );

  NEW.action_url := NULLIF(btrim(COALESCE(NEW.action_url, '')), '');
  NEW.action_label := NULLIF(btrim(COALESCE(NEW.action_label, '')), '');

  NEW.roles_destinatarios := COALESCE(NEW.roles_destinatarios, '{}'::uuid[]);
  NEW.leida := COALESCE(NEW.leida, false);

  IF NEW.leida AND NEW.leida_at IS NULL THEN
    NEW.leida_at := now();
  ELSIF NOT NEW.leida THEN
    NEW.leida_at := NULL;
  END IF;

  NEW.estado := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.estado, ''))), ''), 'ACTIVO');

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    NEW.tipo || '-' || to_char(NEW.created_at, 'YYYYMMDDHH24MISSMS')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_notificaciones_row ON public.notificaciones;
CREATE TRIGGER trg_normalize_notificaciones_row
BEFORE INSERT OR UPDATE ON public.notificaciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_notificaciones_row();

UPDATE public.notificaciones
SET updated_at = COALESCE(updated_at, now())
WHERE true;

CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_tipo_created_runtime
ON public.notificaciones (tenant_id, tipo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_severidad_created_runtime
ON public.notificaciones (tenant_id, severidad, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_usuario_leida_created_runtime
ON public.notificaciones (tenant_id, usuario_id, leida, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notificaciones_roles_destinatarios_gin_runtime
ON public.notificaciones USING gin (roles_destinatarios);

-- ----------------------------------------------------------------------------
-- audit_log: normalización de operación y formato de campos auxiliares.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_audit_log_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.table_name := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.table_name, '')), ''), 'unknown'));
  NEW.operation := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.operation, '')), ''), 'UPDATE'));

  NEW.record_id := NULLIF(btrim(COALESCE(NEW.record_id, '')), '');
  NEW.user_agent := NULLIF(btrim(COALESCE(NEW.user_agent, '')), '');

  IF NEW.changed_fields IS NOT NULL AND jsonb_typeof(NEW.changed_fields) <> 'array' THEN
    NEW.changed_fields := jsonb_build_array(NEW.changed_fields);
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.timestamp := COALESCE(NEW.timestamp, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_audit_log_row ON public.audit_log;
CREATE TRIGGER trg_normalize_audit_log_row
BEFORE INSERT OR UPDATE ON public.audit_log
FOR EACH ROW
EXECUTE FUNCTION app.normalize_audit_log_row();

UPDATE public.audit_log
SET
  metadata = COALESCE(metadata, '{}'::jsonb),
  operation = upper(COALESCE(NULLIF(btrim(operation), ''), 'UPDATE')),
  table_name = lower(COALESCE(NULLIF(btrim(table_name), ''), 'unknown')),
  changed_fields = CASE
    WHEN changed_fields IS NULL THEN NULL
    WHEN jsonb_typeof(changed_fields) = 'array' THEN changed_fields
    ELSE jsonb_build_array(changed_fields)
  END
WHERE true;

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_table_timestamp_runtime
ON public.audit_log (tenant_id, table_name, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_user_timestamp_runtime
ON public.audit_log (tenant_id, user_id, "timestamp" DESC);

COMMIT;
