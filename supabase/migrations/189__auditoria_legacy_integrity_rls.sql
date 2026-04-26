-- ============================================================================
-- 189__auditoria_legacy_integrity_rls.sql
-- Integrity + RLS hardening for:
-- - audit_log_archive
-- - auditoria
-- - auditoria_cotizaciones
-- ============================================================================

BEGIN;

-- Backfill tenant by parent relations.
UPDATE public.audit_log_archive a
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE a.actor_user_id = u.id
  AND u.tenant_id IS NOT NULL
  AND (a.tenant_id IS NULL OR a.tenant_id <> u.tenant_id);

UPDATE public.auditoria a
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE a.usuario_id = u.id
  AND u.tenant_id IS NOT NULL
  AND (a.tenant_id IS NULL OR a.tenant_id <> u.tenant_id);

UPDATE public.auditoria_cotizaciones ac
SET tenant_id = c.tenant_id
FROM public.cotizaciones c
WHERE ac.cotizacion_id = c.id
  AND c.tenant_id IS NOT NULL
  AND (ac.tenant_id IS NULL OR ac.tenant_id <> c.tenant_id);

UPDATE public.auditoria_cotizaciones ac
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE ac.usuario_id = u.id
  AND u.tenant_id IS NOT NULL
  AND ac.tenant_id IS NULL;

-- Runtime FKs.
SELECT app.add_fk_if_possible(
  'audit_log_archive',
  'actor_user_id',
  'usuarios_sistema',
  'id',
  'audit_log_archive_actor_user_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'auditoria',
  'usuario_id',
  'usuarios_sistema',
  'id',
  'auditoria_usuario_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'auditoria_cotizaciones',
  'usuario_id',
  'usuarios_sistema',
  'id',
  'auditoria_cotizaciones_usuario_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'auditoria_cotizaciones',
  'cotizacion_id',
  'cotizaciones',
  'id',
  'auditoria_cotizaciones_cotizacion_id_fkey_runtime'
);

-- Conservative dedupe for exact audit archive duplicates.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, source_table, source_id, operation, archived_at
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.audit_log_archive
  WHERE tenant_id IS NOT NULL
    AND source_table IS NOT NULL
    AND archived_at IS NOT NULL
)
UPDATE public.audit_log_archive a
SET
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked
WHERE a.id = ranked.id
  AND ranked.rn > 1;

-- Tenant consistency triggers.
CREATE OR REPLACE FUNCTION app.enforce_audit_log_archive_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_actor uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.actor_user_id := app.to_uuid_or_null(COALESCE(NEW.actor_user_id::text, ''));

  IF NEW.actor_user_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_actor
    FROM public.usuarios_sistema
    WHERE id = NEW.actor_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('usuario no existe: %s', NEW.actor_user_id), ERRCODE = '23503';
    END IF;
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_actor);
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en audit_log_archive', ERRCODE = '23514';
  END IF;
  IF v_tenant_actor IS NOT NULL AND NEW.tenant_id <> v_tenant_actor THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con actor_user_id en audit_log_archive', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_audit_log_archive_tenant_consistency ON public.audit_log_archive;
CREATE TRIGGER trg_enforce_audit_log_archive_tenant_consistency
BEFORE INSERT OR UPDATE ON public.audit_log_archive
FOR EACH ROW
EXECUTE FUNCTION app.enforce_audit_log_archive_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_auditoria_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_usuario uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  IF NEW.usuario_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_usuario
    FROM public.usuarios_sistema
    WHERE id = NEW.usuario_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('usuario no existe: %s', NEW.usuario_id), ERRCODE = '23503';
    END IF;
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_usuario);
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en auditoria', ERRCODE = '23514';
  END IF;
  IF v_tenant_usuario IS NOT NULL AND NEW.tenant_id <> v_tenant_usuario THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con usuario_id en auditoria', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_auditoria_tenant_consistency ON public.auditoria;
CREATE TRIGGER trg_enforce_auditoria_tenant_consistency
BEFORE INSERT OR UPDATE ON public.auditoria
FOR EACH ROW
EXECUTE FUNCTION app.enforce_auditoria_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_auditoria_cotizaciones_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_cotizacion uuid;
  v_tenant_usuario uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cotizacion_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  IF NEW.cotizacion_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_cotizacion
    FROM public.cotizaciones
    WHERE id = NEW.cotizacion_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('cotizacion no existe: %s', NEW.cotizacion_id), ERRCODE = '23503';
    END IF;
  END IF;

  IF NEW.usuario_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_usuario
    FROM public.usuarios_sistema
    WHERE id = NEW.usuario_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('usuario no existe: %s', NEW.usuario_id), ERRCODE = '23503';
    END IF;
  END IF;

  IF v_tenant_cotizacion IS NOT NULL AND v_tenant_usuario IS NOT NULL AND v_tenant_cotizacion <> v_tenant_usuario THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant de cotizacion y usuario no coincide en auditoria_cotizaciones', ERRCODE = '23514';
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_cotizacion, v_tenant_usuario);
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en auditoria_cotizaciones', ERRCODE = '23514';
  END IF;
  IF v_tenant_cotizacion IS NOT NULL AND NEW.tenant_id <> v_tenant_cotizacion THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cotizacion_id en auditoria_cotizaciones', ERRCODE = '23514';
  END IF;
  IF v_tenant_usuario IS NOT NULL AND NEW.tenant_id <> v_tenant_usuario THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con usuario_id en auditoria_cotizaciones', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_auditoria_cotizaciones_tenant_consistency ON public.auditoria_cotizaciones;
CREATE TRIGGER trg_enforce_auditoria_cotizaciones_tenant_consistency
BEFORE INSERT OR UPDATE ON public.auditoria_cotizaciones
FOR EACH ROW
EXECUTE FUNCTION app.enforce_auditoria_cotizaciones_tenant_consistency();

-- Business constraints.
ALTER TABLE public.audit_log_archive
DROP CONSTRAINT IF EXISTS ck_audit_log_archive_runtime;
ALTER TABLE public.audit_log_archive
ADD CONSTRAINT ck_audit_log_archive_runtime CHECK (
  tenant_id IS NOT NULL
  AND source_table IS NOT NULL
  AND btrim(source_table) <> ''
  AND operation IN ('INSERT', 'UPDATE', 'DELETE', 'UPSERT', 'ARCHIVE', 'RESTORE', 'LOGIN', 'LOGOUT')
  AND archived_at IS NOT NULL
  AND retention_until IS NOT NULL
  AND retention_until >= archived_at
  AND estado IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO')
);

ALTER TABLE public.auditoria
DROP CONSTRAINT IF EXISTS ck_auditoria_runtime;
ALTER TABLE public.auditoria
ADD CONSTRAINT ck_auditoria_runtime CHECK (
  tenant_id IS NOT NULL
  AND tabla IS NOT NULL
  AND btrim(tabla) <> ''
  AND accion IS NOT NULL
  AND btrim(accion) <> ''
  AND ocurrido_en IS NOT NULL
  AND criticidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')
  AND estado IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO')
);

ALTER TABLE public.auditoria_cotizaciones
DROP CONSTRAINT IF EXISTS ck_auditoria_cotizaciones_runtime;
ALTER TABLE public.auditoria_cotizaciones
ADD CONSTRAINT ck_auditoria_cotizaciones_runtime CHECK (
  tenant_id IS NOT NULL
  AND accion IS NOT NULL
  AND btrim(accion) <> ''
  AND "timestamp" IS NOT NULL
  AND criticidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')
  AND estado IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO')
);

-- Operational indexes/uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS ux_audit_log_archive_scope_runtime
ON public.audit_log_archive (tenant_id, source_table, source_id, operation, archived_at)
WHERE tenant_id IS NOT NULL
  AND source_table IS NOT NULL
  AND archived_at IS NOT NULL
  AND estado <> 'INACTIVO';

CREATE INDEX IF NOT EXISTS idx_auditoria_tenant_criticidad_ocurrido_runtime
ON public.auditoria (tenant_id, criticidad, ocurrido_en DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_cotizaciones_tenant_criticidad_timestamp_runtime
ON public.auditoria_cotizaciones (tenant_id, criticidad, "timestamp" DESC);

-- Explicit RLS hardening.
ALTER TABLE IF EXISTS public.audit_log_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log_archive FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auditoria FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auditoria_cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.auditoria_cotizaciones FORCE ROW LEVEL SECURITY;

SELECT app.apply_tenant_policy('public', 'audit_log_archive');
SELECT app.apply_tenant_policy('public', 'auditoria');
SELECT app.apply_tenant_policy('public', 'auditoria_cotizaciones');

COMMIT;
