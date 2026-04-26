-- ============================================================================
-- 072__usuarios_alias_normalization_constraints.sql
-- Normaliza estado/activo y endurece constraints en usuarios y usuarios_sistema.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.normalize_usuarios_alias_estado_activo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.nombre := NULLIF(btrim(COALESCE(NEW.nombre, '')), '');
  NEW.apellido := NULLIF(btrim(COALESCE(NEW.apellido, '')), '');

  NEW.estado := upper(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
      CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END
    )
  );

  NEW.activo := (NEW.estado = 'ACTIVO');

  RETURN NEW;
END;
$$;

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

UPDATE public.usuarios
SET
  email = NULLIF(lower(btrim(COALESCE(email, ''))), ''),
  nombre = NULLIF(btrim(COALESCE(nombre, '')), ''),
  apellido = NULLIF(btrim(COALESCE(apellido, '')), ''),
  estado = upper(
    COALESCE(
      NULLIF(btrim(COALESCE(estado, '')), ''),
      CASE WHEN COALESCE(activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END
    )
  ),
  activo = (
    upper(
      COALESCE(
        NULLIF(btrim(COALESCE(estado, '')), ''),
        CASE WHEN COALESCE(activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END
      )
    ) = 'ACTIVO'
  ),
  updated_at = now();

UPDATE public.usuarios_sistema
SET
  email = NULLIF(lower(btrim(COALESCE(email, ''))), ''),
  nombre = NULLIF(btrim(COALESCE(nombre, '')), ''),
  apellido = NULLIF(btrim(COALESCE(apellido, '')), ''),
  estado = upper(
    COALESCE(
      NULLIF(btrim(COALESCE(estado, '')), ''),
      CASE WHEN COALESCE(activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END
    )
  ),
  activo = (
    upper(
      COALESCE(
        NULLIF(btrim(COALESCE(estado, '')), ''),
        CASE WHEN COALESCE(activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END
      )
    ) = 'ACTIVO'
  ),
  updated_at = now();

DO $$
BEGIN
  IF to_regclass('public.usuarios') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_usuarios_estado_upper_nonempty'
        AND conrelid = 'public.usuarios'::regclass
    ) THEN
      ALTER TABLE public.usuarios
      ADD CONSTRAINT ck_usuarios_estado_upper_nonempty
      CHECK (estado = upper(btrim(estado)) AND btrim(estado) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_usuarios_estado_activo_consistency'
        AND conrelid = 'public.usuarios'::regclass
    ) THEN
      ALTER TABLE public.usuarios
      ADD CONSTRAINT ck_usuarios_estado_activo_consistency
      CHECK (COALESCE(activo, false) = (upper(btrim(COALESCE(estado, ''))) = 'ACTIVO'));
    END IF;
  END IF;

  IF to_regclass('public.usuarios_sistema') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_usuarios_sistema_estado_upper_nonempty'
        AND conrelid = 'public.usuarios_sistema'::regclass
    ) THEN
      ALTER TABLE public.usuarios_sistema
      ADD CONSTRAINT ck_usuarios_sistema_estado_upper_nonempty
      CHECK (estado = upper(btrim(estado)) AND btrim(estado) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_usuarios_sistema_estado_activo_consistency'
        AND conrelid = 'public.usuarios_sistema'::regclass
    ) THEN
      ALTER TABLE public.usuarios_sistema
      ADD CONSTRAINT ck_usuarios_sistema_estado_activo_consistency
      CHECK (COALESCE(activo, false) = (upper(btrim(COALESCE(estado, ''))) = 'ACTIVO'));
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.usuarios
  VALIDATE CONSTRAINT ck_usuarios_estado_upper_nonempty;
ALTER TABLE IF EXISTS public.usuarios
  VALIDATE CONSTRAINT ck_usuarios_estado_activo_consistency;

ALTER TABLE IF EXISTS public.usuarios_sistema
  VALIDATE CONSTRAINT ck_usuarios_sistema_estado_upper_nonempty;
ALTER TABLE IF EXISTS public.usuarios_sistema
  VALIDATE CONSTRAINT ck_usuarios_sistema_estado_activo_consistency;

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_email_lower
ON public.usuarios (tenant_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_tenant_email_lower
ON public.usuarios_sistema (tenant_id, lower(email));

COMMIT;
