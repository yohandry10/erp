-- ============================================================================
-- 276__identidad_usuarios_tenants_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estado case-insensitive en identidad.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo para asegurar consistencia estado/activo.
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
-- Constraints tenants: mantener nombres para compatibilidad de validaciones.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS ck_tenants_estado_upper_nonempty;
ALTER TABLE public.tenants
  ADD CONSTRAINT ck_tenants_estado_upper_nonempty
  CHECK (btrim(COALESCE(estado::text, '')) <> '') NOT VALID;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS ck_tenants_estado_activo_consistency;
ALTER TABLE public.tenants
  ADD CONSTRAINT ck_tenants_estado_activo_consistency
  CHECK (COALESCE(activo, false) = (lower(COALESCE(estado::text, '')) = 'activo')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Constraints usuarios/usuarios_sistema: mantener nombres historicos.
-- ----------------------------------------------------------------------------
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS ck_usuarios_estado_upper_nonempty;
ALTER TABLE public.usuarios
  ADD CONSTRAINT ck_usuarios_estado_upper_nonempty
  CHECK (btrim(COALESCE(estado::text, '')) <> '') NOT VALID;

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS ck_usuarios_estado_activo_consistency;
ALTER TABLE public.usuarios
  ADD CONSTRAINT ck_usuarios_estado_activo_consistency
  CHECK (COALESCE(activo, false) = (lower(COALESCE(estado::text, '')) = 'activo')) NOT VALID;

ALTER TABLE public.usuarios_sistema DROP CONSTRAINT IF EXISTS ck_usuarios_sistema_estado_upper_nonempty;
ALTER TABLE public.usuarios_sistema
  ADD CONSTRAINT ck_usuarios_sistema_estado_upper_nonempty
  CHECK (btrim(COALESCE(estado::text, '')) <> '') NOT VALID;

ALTER TABLE public.usuarios_sistema DROP CONSTRAINT IF EXISTS ck_usuarios_sistema_estado_activo_consistency;
ALTER TABLE public.usuarios_sistema
  ADD CONSTRAINT ck_usuarios_sistema_estado_activo_consistency
  CHECK (COALESCE(activo, false) = (lower(COALESCE(estado::text, '')) = 'activo')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Constraints legacy adicionales.
-- ----------------------------------------------------------------------------
ALTER TABLE public.usuarios_sistemas DROP CONSTRAINT IF EXISTS ck_usuarios_sistemas_estado_nonempty_276;
ALTER TABLE public.usuarios_sistemas
  ADD CONSTRAINT ck_usuarios_sistemas_estado_nonempty_276
  CHECK (btrim(COALESCE(estado::text, '')) <> '') NOT VALID;

ALTER TABLE public.usuarios_sistemas DROP CONSTRAINT IF EXISTS ck_usuarios_sistemas_estado_activo_consistency_276;
ALTER TABLE public.usuarios_sistemas
  ADD CONSTRAINT ck_usuarios_sistemas_estado_activo_consistency_276
  CHECK (COALESCE(activo, false) = (lower(COALESCE(estado::text, '')) = 'activo')) NOT VALID;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ck_users_estado_nonempty_276;
ALTER TABLE public.users
  ADD CONSTRAINT ck_users_estado_nonempty_276
  CHECK (btrim(COALESCE(estado::text, '')) <> '') NOT VALID;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ck_users_estado_activo_consistency_276;
ALTER TABLE public.users
  ADD CONSTRAINT ck_users_estado_activo_consistency_276
  CHECK (COALESCE(activo, false) = (lower(COALESCE(estado::text, '')) = 'activo')) NOT VALID;

-- ----------------------------------------------------------------------------
-- NOT NULL contractual.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.usuarios_sistema
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.usuarios
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.usuarios_sistemas
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.users
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN activo SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants VALIDATE CONSTRAINT ck_tenants_estado_upper_nonempty;
ALTER TABLE public.tenants VALIDATE CONSTRAINT ck_tenants_estado_activo_consistency;

ALTER TABLE public.usuarios VALIDATE CONSTRAINT ck_usuarios_estado_upper_nonempty;
ALTER TABLE public.usuarios VALIDATE CONSTRAINT ck_usuarios_estado_activo_consistency;

ALTER TABLE public.usuarios_sistema VALIDATE CONSTRAINT ck_usuarios_sistema_estado_upper_nonempty;
ALTER TABLE public.usuarios_sistema VALIDATE CONSTRAINT ck_usuarios_sistema_estado_activo_consistency;

ALTER TABLE public.usuarios_sistemas VALIDATE CONSTRAINT ck_usuarios_sistemas_estado_nonempty_276;
ALTER TABLE public.usuarios_sistemas VALIDATE CONSTRAINT ck_usuarios_sistemas_estado_activo_consistency_276;

ALTER TABLE public.users VALIDATE CONSTRAINT ck_users_estado_nonempty_276;
ALTER TABLE public.users VALIDATE CONSTRAINT ck_users_estado_activo_consistency_276;

-- ----------------------------------------------------------------------------
-- Hardening RLS (solo tablas alias/canonicas tenant, sin tocar politicas especiales).
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'usuarios');
SELECT app.apply_tenant_policy('public', 'usuarios_sistema');
SELECT app.apply_tenant_policy('public', 'usuarios_sistemas');

COMMIT;
