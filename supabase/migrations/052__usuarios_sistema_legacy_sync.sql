-- ============================================================================
-- 052__usuarios_sistema_legacy_sync.sql
-- Mantiene espejo legacy usuarios_sistemas desde usuarios_sistema.
-- Objetivo: evitar perdida de contexto en consultas heredadas y reportes antiguos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Alineacion de columnas en tabla legacy
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.usuarios_sistemas
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS apellido text,
  ADD COLUMN IF NOT EXISTS nombres text,
  ADD COLUMN IF NOT EXISTS apellidos text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS nombre_usuario text,
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS departamento text,
  ADD COLUMN IF NOT EXISTS fecha_ultimo_acceso timestamptz;

CREATE INDEX IF NOT EXISTS idx_usuarios_sistemas_tenant_email
ON public.usuarios_sistemas (tenant_id, email);

CREATE INDEX IF NOT EXISTS idx_usuarios_sistemas_tenant_activo
ON public.usuarios_sistemas (tenant_id, activo);

-- ----------------------------------------------------------------------------
-- Trigger: usuarios_sistema -> usuarios_sistemas (espejo canonical -> legacy)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_usuarios_sistemas_from_usuarios_sistema()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_codigo text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.usuarios_sistemas usl
    WHERE usl.id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_codigo := COALESCE(
    NULLIF(btrim(NEW.nombre_usuario), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    NEW.id::text
  );

  INSERT INTO public.usuarios_sistemas (
    id,
    tenant_id,
    nombre,
    apellido,
    nombres,
    apellidos,
    email,
    telefono,
    activo,
    estado,
    is_super_admin,
    nombre_usuario,
    cargo,
    departamento,
    fecha_ultimo_acceso,
    codigo,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.nombre,
    NEW.apellido,
    COALESCE(NEW.nombres, NEW.nombre),
    COALESCE(NEW.apellidos, NEW.apellido),
    NEW.email,
    NEW.telefono,
    COALESCE(NEW.activo, true),
    COALESCE(NULLIF(btrim(NEW.estado), ''), 'ACTIVO'),
    COALESCE(NEW.is_super_admin, false),
    NEW.nombre_usuario,
    NEW.cargo,
    NEW.departamento,
    NEW.fecha_ultimo_acceso,
    v_codigo,
    jsonb_build_object('sync_source', 'usuarios_sistema'),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    nombre = EXCLUDED.nombre,
    apellido = EXCLUDED.apellido,
    nombres = EXCLUDED.nombres,
    apellidos = EXCLUDED.apellidos,
    email = EXCLUDED.email,
    telefono = EXCLUDED.telefono,
    activo = EXCLUDED.activo,
    estado = EXCLUDED.estado,
    is_super_admin = EXCLUDED.is_super_admin,
    nombre_usuario = EXCLUDED.nombre_usuario,
    cargo = EXCLUDED.cargo,
    departamento = EXCLUDED.departamento,
    fecha_ultimo_acceso = EXCLUDED.fecha_ultimo_acceso,
    codigo = EXCLUDED.codigo,
    metadata = COALESCE(public.usuarios_sistemas.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'usuarios_sistema'),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_usuarios_sistemas_from_usuarios_sistema ON public.usuarios_sistema;

CREATE TRIGGER trg_sync_usuarios_sistemas_from_usuarios_sistema
AFTER INSERT OR UPDATE OR DELETE
ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION app.sync_usuarios_sistemas_from_usuarios_sistema();

-- ----------------------------------------------------------------------------
-- Backfill inicial de espejo legacy
-- ----------------------------------------------------------------------------
INSERT INTO public.usuarios_sistemas (
  id,
  tenant_id,
  nombre,
  apellido,
  nombres,
  apellidos,
  email,
  telefono,
  activo,
  estado,
  is_super_admin,
  nombre_usuario,
  cargo,
  departamento,
  fecha_ultimo_acceso,
  codigo,
  metadata,
  created_at,
  updated_at
)
SELECT
  us.id,
  us.tenant_id,
  us.nombre,
  us.apellido,
  COALESCE(us.nombres, us.nombre),
  COALESCE(us.apellidos, us.apellido),
  us.email,
  us.telefono,
  COALESCE(us.activo, true),
  COALESCE(NULLIF(btrim(us.estado), ''), 'ACTIVO'),
  COALESCE(us.is_super_admin, false),
  us.nombre_usuario,
  us.cargo,
  us.departamento,
  us.fecha_ultimo_acceso,
  COALESCE(
    NULLIF(btrim(us.nombre_usuario), ''),
    NULLIF(split_part(COALESCE(us.email, ''), '@', 1), ''),
    us.id::text
  ),
  jsonb_build_object('sync_source', 'usuarios_sistema_backfill'),
  COALESCE(us.created_at, now()),
  COALESCE(us.updated_at, now())
FROM public.usuarios_sistema us
WHERE us.id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  nombre = EXCLUDED.nombre,
  apellido = EXCLUDED.apellido,
  nombres = EXCLUDED.nombres,
  apellidos = EXCLUDED.apellidos,
  email = EXCLUDED.email,
  telefono = EXCLUDED.telefono,
  activo = EXCLUDED.activo,
  estado = EXCLUDED.estado,
  is_super_admin = EXCLUDED.is_super_admin,
  nombre_usuario = EXCLUDED.nombre_usuario,
  cargo = EXCLUDED.cargo,
  departamento = EXCLUDED.departamento,
  fecha_ultimo_acceso = EXCLUDED.fecha_ultimo_acceso,
  codigo = EXCLUDED.codigo,
  metadata = COALESCE(public.usuarios_sistemas.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'usuarios_sistema_backfill'),
  updated_at = now();

COMMIT;
