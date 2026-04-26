-- ============================================================================
-- 188__auditoria_legacy_runtime_alignment.sql
-- Runtime alignment for legacy audit tables:
-- - audit_log_archive
-- - auditoria
-- - auditoria_cotizaciones
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.normalize_criticidad_auditoria(
  p_input text,
  p_default text DEFAULT 'BAJA'
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(p_input), ''), upper(COALESCE(NULLIF(btrim(p_default), ''), 'BAJA'))));
  IF v IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA') THEN
    RETURN v;
  END IF;
  IF v IN ('INFO', 'INFORMATIVA', 'LOW') THEN RETURN 'BAJA'; END IF;
  IF v IN ('WARN', 'WARNING', 'MEDIUM') THEN RETURN 'MEDIA'; END IF;
  IF v IN ('HIGH') THEN RETURN 'ALTA'; END IF;
  IF v IN ('CRITICAL', 'CRÍTICA') THEN RETURN 'CRITICA'; END IF;
  RETURN 'BAJA';
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_operacion_auditoria(
  p_input text,
  p_default text DEFAULT 'UPDATE'
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(p_input), ''), upper(COALESCE(NULLIF(btrim(p_default), ''), 'UPDATE'))));
  IF v IN ('INSERT', 'UPDATE', 'DELETE', 'UPSERT', 'ARCHIVE', 'RESTORE', 'LOGIN', 'LOGOUT') THEN
    RETURN v;
  END IF;
  IF v IN ('CREAR', 'CREATED') THEN RETURN 'INSERT'; END IF;
  IF v IN ('MODIFICAR', 'MODIFIED') THEN RETURN 'UPDATE'; END IF;
  IF v IN ('ELIMINAR', 'REMOVED') THEN RETURN 'DELETE'; END IF;
  RETURN 'UPDATE';
END;
$$;

-- ----------------------------------------------------------------------------
-- audit_log_archive
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.audit_log_archive
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS operation text,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS actor_email text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS retention_until timestamptz,
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS motivo_archivo text;

ALTER TABLE IF EXISTS public.audit_log_archive
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN source_table TYPE text USING NULLIF(lower(btrim(COALESCE(source_table, ''))), ''),
  ALTER COLUMN source_id TYPE uuid USING app.to_uuid_or_null(COALESCE(source_id::text, '')),
  ALTER COLUMN operation TYPE text USING app.normalize_operacion_auditoria(operation, 'ARCHIVE'),
  ALTER COLUMN actor_user_id TYPE uuid USING app.to_uuid_or_null(COALESCE(actor_user_id::text, '')),
  ALTER COLUMN actor_email TYPE text USING NULLIF(lower(btrim(COALESCE(actor_email, ''))), ''),
  ALTER COLUMN archived_at TYPE timestamptz USING COALESCE(app.to_timestamptz_or_null(COALESCE(archived_at::text, '')), created_at, now()),
  ALTER COLUMN retention_until TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(retention_until::text, '')),
  ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN motivo_archivo TYPE text USING NULLIF(btrim(COALESCE(motivo_archivo, '')), ''),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ARCHIVADO')),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.audit_log_archive a
SET
  source_table = COALESCE(NULLIF(lower(btrim(COALESCE(a.source_table, ''))), ''), 'unknown'),
  operation = app.normalize_operacion_auditoria(a.operation, 'ARCHIVE'),
  actor_email = NULLIF(lower(btrim(COALESCE(a.actor_email, ''))), ''),
  archived_at = COALESCE(a.archived_at, a.created_at, now()),
  retention_until = COALESCE(a.retention_until, COALESCE(a.archived_at, a.created_at, now()) + interval '7 years'),
  payload = COALESCE(a.payload, '{}'::jsonb),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'ARCHIVADO')) IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO') THEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'ARCHIVADO'))
    ELSE 'ARCHIVADO'
  END,
  metadata = COALESCE(a.metadata, '{}'::jsonb),
  updated_at = now()
WHERE a.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_audit_log_archive_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.source_table := COALESCE(NULLIF(lower(btrim(COALESCE(NEW.source_table, ''))), ''), 'unknown');
  NEW.source_id := app.to_uuid_or_null(COALESCE(NEW.source_id::text, ''));
  NEW.operation := app.normalize_operacion_auditoria(NEW.operation, 'ARCHIVE');
  NEW.actor_user_id := app.to_uuid_or_null(COALESCE(NEW.actor_user_id::text, ''));
  NEW.actor_email := NULLIF(lower(btrim(COALESCE(NEW.actor_email, ''))), '');
  NEW.archived_at := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.archived_at::text, '')), NEW.created_at, now());
  NEW.retention_until := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.retention_until::text, '')), NEW.archived_at + interval '7 years');
  NEW.payload := COALESCE(NEW.payload, '{}'::jsonb);
  NEW.motivo_archivo := NULLIF(btrim(COALESCE(NEW.motivo_archivo, '')), '');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ARCHIVADO'));
  IF NEW.estado NOT IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO') THEN NEW.estado := 'ARCHIVADO'; END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_audit_log_archive_row ON public.audit_log_archive;
CREATE TRIGGER trg_normalize_audit_log_archive_row
BEFORE INSERT OR UPDATE ON public.audit_log_archive
FOR EACH ROW
EXECUTE FUNCTION app.normalize_audit_log_archive_row();

-- ----------------------------------------------------------------------------
-- auditoria
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.auditoria
  ADD COLUMN IF NOT EXISTS tabla text,
  ADD COLUMN IF NOT EXISTS accion text,
  ADD COLUMN IF NOT EXISTS registro_id text,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS detalles jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ocurrido_en timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS criticidad text DEFAULT 'BAJA';

ALTER TABLE IF EXISTS public.auditoria
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN tabla TYPE text USING NULLIF(lower(btrim(COALESCE(tabla, ''))), ''),
  ALTER COLUMN accion TYPE text USING app.normalize_operacion_auditoria(accion, 'UPDATE'),
  ALTER COLUMN registro_id TYPE text USING NULLIF(btrim(COALESCE(registro_id, '')), ''),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN ip_address TYPE inet USING app.to_inet_or_null(COALESCE(ip_address::text, '')),
  ALTER COLUMN user_agent TYPE text USING NULLIF(left(btrim(COALESCE(user_agent, '')), 512), ''),
  ALTER COLUMN detalles SET DEFAULT '{}'::jsonb,
  ALTER COLUMN ocurrido_en TYPE timestamptz USING COALESCE(app.to_timestamptz_or_null(COALESCE(ocurrido_en::text, '')), created_at, now()),
  ALTER COLUMN criticidad TYPE text USING app.normalize_criticidad_auditoria(criticidad, 'BAJA'),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.auditoria a
SET
  tabla = COALESCE(NULLIF(lower(btrim(COALESCE(a.tabla, ''))), ''), 'unknown'),
  accion = app.normalize_operacion_auditoria(a.accion, 'UPDATE'),
  registro_id = NULLIF(btrim(COALESCE(a.registro_id, '')), ''),
  ip_address = app.to_inet_or_null(COALESCE(a.ip_address::text, '')),
  user_agent = NULLIF(left(btrim(COALESCE(a.user_agent, '')), 512), ''),
  detalles = COALESCE(a.detalles, '{}'::jsonb),
  ocurrido_en = COALESCE(a.ocurrido_en, a.created_at, now()),
  criticidad = app.normalize_criticidad_auditoria(a.criticidad, 'BAJA'),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO') THEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'ACTIVO'))
    ELSE 'ACTIVO'
  END,
  metadata = COALESCE(a.metadata, '{}'::jsonb),
  updated_at = now()
WHERE a.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_auditoria_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.tabla := COALESCE(NULLIF(lower(btrim(COALESCE(NEW.tabla, ''))), ''), 'unknown');
  NEW.accion := app.normalize_operacion_auditoria(NEW.accion, 'UPDATE');
  NEW.registro_id := NULLIF(btrim(COALESCE(NEW.registro_id, '')), '');
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.ip_address := app.to_inet_or_null(COALESCE(NEW.ip_address::text, ''));
  NEW.user_agent := NULLIF(left(btrim(COALESCE(NEW.user_agent, '')), 512), '');
  NEW.detalles := COALESCE(NEW.detalles, '{}'::jsonb);
  NEW.ocurrido_en := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.ocurrido_en::text, '')), NEW.created_at, now());
  NEW.criticidad := app.normalize_criticidad_auditoria(NEW.criticidad, 'BAJA');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado NOT IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO') THEN NEW.estado := 'ACTIVO'; END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_auditoria_row ON public.auditoria;
CREATE TRIGGER trg_normalize_auditoria_row
BEFORE INSERT OR UPDATE ON public.auditoria
FOR EACH ROW
EXECUTE FUNCTION app.normalize_auditoria_row();

-- ----------------------------------------------------------------------------
-- auditoria_cotizaciones
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.auditoria_cotizaciones
  ADD COLUMN IF NOT EXISTS cotizacion_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS accion text,
  ADD COLUMN IF NOT EXISTS cambios jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS criticidad text DEFAULT 'BAJA';

ALTER TABLE IF EXISTS public.auditoria_cotizaciones
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN cotizacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cotizacion_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN accion TYPE text USING app.normalize_operacion_auditoria(accion, 'UPDATE'),
  ALTER COLUMN cambios SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "timestamp" TYPE timestamptz USING COALESCE(app.to_timestamptz_or_null(COALESCE("timestamp"::text, '')), created_at, now()),
  ALTER COLUMN ip_address TYPE inet USING app.to_inet_or_null(COALESCE(ip_address::text, '')),
  ALTER COLUMN user_agent TYPE text USING NULLIF(left(btrim(COALESCE(user_agent, '')), 512), ''),
  ALTER COLUMN criticidad TYPE text USING app.normalize_criticidad_auditoria(criticidad, 'BAJA'),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.auditoria_cotizaciones ac
SET
  accion = app.normalize_operacion_auditoria(ac.accion, 'UPDATE'),
  cambios = COALESCE(ac.cambios, '{}'::jsonb),
  "timestamp" = COALESCE(ac."timestamp", ac.created_at, now()),
  ip_address = app.to_inet_or_null(COALESCE(ac.ip_address::text, '')),
  user_agent = NULLIF(left(btrim(COALESCE(ac.user_agent, '')), 512), ''),
  criticidad = app.normalize_criticidad_auditoria(ac.criticidad, 'BAJA'),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(ac.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO') THEN upper(COALESCE(NULLIF(btrim(ac.estado), ''), 'ACTIVO'))
    ELSE 'ACTIVO'
  END,
  metadata = COALESCE(ac.metadata, '{}'::jsonb),
  updated_at = now()
WHERE ac.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_auditoria_cotizaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cotizacion_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.accion := app.normalize_operacion_auditoria(NEW.accion, 'UPDATE');
  NEW.cambios := COALESCE(NEW.cambios, '{}'::jsonb);
  NEW."timestamp" := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW."timestamp"::text, '')), NEW.created_at, now());
  NEW.ip_address := app.to_inet_or_null(COALESCE(NEW.ip_address::text, ''));
  NEW.user_agent := NULLIF(left(btrim(COALESCE(NEW.user_agent, '')), 512), '');
  NEW.criticidad := app.normalize_criticidad_auditoria(NEW.criticidad, 'BAJA');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado NOT IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO') THEN NEW.estado := 'ACTIVO'; END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_auditoria_cotizaciones_row ON public.auditoria_cotizaciones;
CREATE TRIGGER trg_normalize_auditoria_cotizaciones_row
BEFORE INSERT OR UPDATE ON public.auditoria_cotizaciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_auditoria_cotizaciones_row();

CREATE INDEX IF NOT EXISTS idx_audit_log_archive_tenant_archived_at_runtime
ON public.audit_log_archive (tenant_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_archive_tenant_operation_runtime
ON public.audit_log_archive (tenant_id, operation, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_tenant_tabla_ocurrido_runtime
ON public.auditoria (tenant_id, tabla, ocurrido_en DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_tenant_usuario_ocurrido_runtime
ON public.auditoria (tenant_id, usuario_id, ocurrido_en DESC)
WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auditoria_cotizaciones_tenant_cotizacion_timestamp_runtime
ON public.auditoria_cotizaciones (tenant_id, cotizacion_id, "timestamp" DESC)
WHERE cotizacion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auditoria_cotizaciones_tenant_accion_timestamp_runtime
ON public.auditoria_cotizaciones (tenant_id, accion, "timestamp" DESC);

COMMIT;
