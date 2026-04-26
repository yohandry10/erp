-- ============================================================================
-- 071__usuarios_alias_bidirectional_sync.sql
-- Sincronización bidireccional controlada entre usuarios_sistema y usuarios.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Asegurar shape mínimo de columnas en alias/canónico.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.usuarios
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS apellido text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS apellido text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- Canónico -> alias (usuarios_sistema -> usuarios)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_usuarios_from_usuarios_sistema()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.usuarios
    WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.usuarios (
    id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.email,
    NEW.nombre,
    NEW.apellido,
    COALESCE(NEW.activo, true),
    COALESCE(NEW.estado, 'ACTIVO'),
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now())
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    email = EXCLUDED.email,
    nombre = EXCLUDED.nombre,
    apellido = EXCLUDED.apellido,
    activo = EXCLUDED.activo,
    estado = EXCLUDED.estado,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_usuarios_from_usuarios_sistema ON public.usuarios_sistema;
CREATE TRIGGER trg_sync_usuarios_from_usuarios_sistema
AFTER INSERT OR UPDATE OR DELETE
ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION app.sync_usuarios_from_usuarios_sistema();

-- ----------------------------------------------------------------------------
-- Alias -> canónico (usuarios -> usuarios_sistema)
-- Nota: DELETE en alias NO borra canónico para evitar pérdida accidental.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_usuarios_sistema_from_usuarios()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.email,
    NEW.nombre,
    NEW.apellido,
    COALESCE(NEW.activo, true),
    COALESCE(NEW.estado, 'ACTIVO'),
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now())
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = COALESCE(EXCLUDED.tenant_id, usuarios_sistema.tenant_id),
    email = COALESCE(EXCLUDED.email, usuarios_sistema.email),
    nombre = COALESCE(EXCLUDED.nombre, usuarios_sistema.nombre),
    apellido = COALESCE(EXCLUDED.apellido, usuarios_sistema.apellido),
    activo = COALESCE(EXCLUDED.activo, usuarios_sistema.activo),
    estado = COALESCE(EXCLUDED.estado, usuarios_sistema.estado),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_usuarios_sistema_from_usuarios ON public.usuarios;
CREATE TRIGGER trg_sync_usuarios_sistema_from_usuarios
AFTER INSERT OR UPDATE OR DELETE
ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION app.sync_usuarios_sistema_from_usuarios();

-- ----------------------------------------------------------------------------
-- Backfill canónico -> alias
-- ----------------------------------------------------------------------------
INSERT INTO public.usuarios (
  id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
)
SELECT
  us.id,
  us.tenant_id,
  us.email,
  us.nombre,
  us.apellido,
  COALESCE(us.activo, true),
  COALESCE(us.estado, 'ACTIVO'),
  COALESCE(us.created_at, now()),
  COALESCE(us.updated_at, now())
FROM public.usuarios_sistema us
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  email = EXCLUDED.email,
  nombre = EXCLUDED.nombre,
  apellido = EXCLUDED.apellido,
  activo = EXCLUDED.activo,
  estado = EXCLUDED.estado,
  updated_at = now();

-- Backfill alias -> canónico solo para IDs faltantes en canónico.
INSERT INTO public.usuarios_sistema (
  id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
)
SELECT
  u.id,
  u.tenant_id,
  u.email,
  u.nombre,
  u.apellido,
  COALESCE(u.activo, true),
  COALESCE(u.estado, 'ACTIVO'),
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM public.usuarios u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.usuarios_sistema us
  WHERE us.id = u.id
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
