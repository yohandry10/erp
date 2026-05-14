-- ============================================================================
-- 275__identidad_usuarios_tenants_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive de estado en identidad (tenants/usuarios).
-- Tablas foco:
--   public.tenants
--   public.usuarios_sistema
--   public.usuarios
--   public.usuarios_sistemas
--   public.users
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helper canonico de normalizacion de estado para identidad.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_identity_estado_275(
  p_estado text,
  p_activo boolean DEFAULT true
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(NULLIF(btrim(COALESCE(p_estado, '')), ''));

  IF v IS NULL THEN
    v := CASE WHEN COALESCE(p_activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  END IF;

  IF v IN ('ENABLED', 'HABILITADO', 'VIGENTE', 'ACTIVA') THEN
    v := 'ACTIVO';
  END IF;

  IF v IN ('DISABLED', 'DESHABILITADO', 'INACTIVA', 'BAJA') THEN
    v := 'INACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Tenants: normalizacion runtime (reemplaza logica previa manteniendo nombre).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_tenants_estado_activo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_identity_estado_275(NEW.estado::text, COALESCE(NEW.activo, true));
  NEW.activo := (lower(NEW.estado::text) = 'activo');
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- usuarios/usuarios_sistema: normalizacion runtime (mantiene nombre de funcion).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_usuarios_alias_estado_activo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.nombre := NULLIF(btrim(COALESCE(NEW.nombre, '')), '');
  NEW.apellido := NULLIF(btrim(COALESCE(NEW.apellido, '')), '');

  NEW.estado := app.normalize_identity_estado_275(NEW.estado::text, COALESCE(NEW.activo, true));
  NEW.activo := (lower(NEW.estado::text) = 'activo');
  NEW.updated_at := COALESCE(NEW.updated_at, now());

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- users/usuarios_sistemas: normalizacion ligera de estado/activo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_users_like_estado_activo_275()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_identity_estado_275(NEW.estado::text, COALESCE(NEW.activo, true));
  NEW.activo := (lower(NEW.estado::text) = 'activo');
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Garantizar columna activo en tablas legacy donde no exista.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.usuarios_sistemas
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

DROP TRIGGER IF EXISTS trg_normalize_tenants_estado_activo ON public.tenants;
DROP TRIGGER IF EXISTS trg_normalize_usuarios_estado_activo ON public.usuarios;
DROP TRIGGER IF EXISTS trg_normalize_usuarios_sistema_estado_activo ON public.usuarios_sistema;
DROP TRIGGER IF EXISTS trg_normalize_usuarios_sistemas_estado_activo_275 ON public.usuarios_sistemas;
DROP TRIGGER IF EXISTS trg_normalize_users_estado_activo_275 ON public.users;

DROP VIEW IF EXISTS public.v_tenants_estado_activo;

-- ----------------------------------------------------------------------------
-- Migracion de estado a citext para las tablas foco.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants
  ALTER COLUMN estado TYPE citext
  USING app.normalize_identity_estado_275(estado::text, COALESCE(activo, true));

ALTER TABLE public.usuarios_sistema
  ALTER COLUMN estado TYPE citext
  USING app.normalize_identity_estado_275(estado::text, COALESCE(activo, true));

ALTER TABLE public.usuarios
  ALTER COLUMN estado TYPE citext
  USING app.normalize_identity_estado_275(estado::text, COALESCE(activo, true));

ALTER TABLE public.usuarios_sistemas
  ALTER COLUMN estado TYPE citext
  USING app.normalize_identity_estado_275(estado::text, COALESCE(activo, true));

ALTER TABLE public.users
  ALTER COLUMN estado TYPE citext
  USING app.normalize_identity_estado_275(estado::text, COALESCE(activo, true));

-- ----------------------------------------------------------------------------
-- Defaults canonicos.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext,
  ALTER COLUMN activo SET DEFAULT true;

ALTER TABLE public.usuarios_sistema
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext,
  ALTER COLUMN activo SET DEFAULT true;

ALTER TABLE public.usuarios
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext,
  ALTER COLUMN activo SET DEFAULT true;

ALTER TABLE public.usuarios_sistemas
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext,
  ALTER COLUMN activo SET DEFAULT true;

ALTER TABLE public.users
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext,
  ALTER COLUMN activo SET DEFAULT true;

-- ----------------------------------------------------------------------------
-- Backfill defensivo de sincronia estado/activo.
-- ----------------------------------------------------------------------------
UPDATE public.tenants
SET
  estado = app.normalize_identity_estado_275(estado::text, COALESCE(activo, true)),
  activo = (lower(app.normalize_identity_estado_275(estado::text, COALESCE(activo, true))::text) = 'activo'),
  updated_at = COALESCE(updated_at, now());

UPDATE public.usuarios_sistema
SET
  estado = app.normalize_identity_estado_275(estado::text, COALESCE(activo, true)),
  activo = (lower(app.normalize_identity_estado_275(estado::text, COALESCE(activo, true))::text) = 'activo'),
  updated_at = COALESCE(updated_at, now());

UPDATE public.usuarios
SET
  estado = app.normalize_identity_estado_275(estado::text, COALESCE(activo, true)),
  activo = (lower(app.normalize_identity_estado_275(estado::text, COALESCE(activo, true))::text) = 'activo'),
  updated_at = COALESCE(updated_at, now());

UPDATE public.usuarios_sistemas
SET
  estado = app.normalize_identity_estado_275(estado::text, COALESCE(activo, true)),
  activo = (lower(app.normalize_identity_estado_275(estado::text, COALESCE(activo, true))::text) = 'activo'),
  updated_at = COALESCE(updated_at, now());

UPDATE public.users
SET
  estado = app.normalize_identity_estado_275(estado::text, COALESCE(activo, true)),
  activo = (lower(app.normalize_identity_estado_275(estado::text, COALESCE(activo, true))::text) = 'activo'),
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Reaplicar triggers (manteniendo nombres operativos existentes).
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_normalize_tenants_estado_activo ON public.tenants;
CREATE TRIGGER trg_normalize_tenants_estado_activo
BEFORE INSERT OR UPDATE OF estado, activo
ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION app.normalize_tenants_estado_activo();

DROP TRIGGER IF EXISTS trg_normalize_usuarios_estado_activo ON public.usuarios;
CREATE TRIGGER trg_normalize_usuarios_estado_activo
BEFORE INSERT OR UPDATE OF email, nombre, apellido, estado, activo
ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION app.normalize_usuarios_alias_estado_activo();

DROP TRIGGER IF EXISTS trg_normalize_usuarios_sistema_estado_activo ON public.usuarios_sistema;
CREATE TRIGGER trg_normalize_usuarios_sistema_estado_activo
BEFORE INSERT OR UPDATE OF email, nombre, apellido, estado, activo
ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION app.normalize_usuarios_alias_estado_activo();

DROP TRIGGER IF EXISTS trg_normalize_usuarios_sistemas_estado_activo_275 ON public.usuarios_sistemas;
CREATE TRIGGER trg_normalize_usuarios_sistemas_estado_activo_275
BEFORE INSERT OR UPDATE OF estado, activo
ON public.usuarios_sistemas
FOR EACH ROW
EXECUTE FUNCTION app.normalize_users_like_estado_activo_275();

DROP TRIGGER IF EXISTS trg_normalize_users_estado_activo_275 ON public.users;
CREATE TRIGGER trg_normalize_users_estado_activo_275
BEFORE INSERT OR UPDATE OF estado, activo
ON public.users
FOR EACH ROW
EXECUTE FUNCTION app.normalize_users_like_estado_activo_275();

-- ----------------------------------------------------------------------------
-- Indices runtime CI por tenant+estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tenants_estado_ci_runtime_275
ON public.tenants (estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_tenant_estado_ci_runtime_275
ON public.usuarios_sistema (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_estado_ci_runtime_275
ON public.usuarios (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_usuarios_sistemas_tenant_estado_ci_runtime_275
ON public.usuarios_sistemas (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_tenant_estado_ci_runtime_275
ON public.users (tenant_id, estado, updated_at DESC);

CREATE OR REPLACE VIEW public.v_tenants_estado_activo AS
SELECT
  t.id,
  t.codigo,
  t.nombre,
  t.estado::text AS estado,
  t.activo,
  (lower(t.estado::text) = 'activo') AS should_be_active,
  (t.activo = (lower(t.estado::text) = 'activo')) AS is_consistent,
  t.created_at,
  t.updated_at
FROM public.tenants t;

COMMIT;
