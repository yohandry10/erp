-- ============================================================================
-- 018__tenant_auth_permissions_alignment.sql
-- Alinea seguridad tenant/auth: permisos por tenant, login attempts y sync tenant.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Permisos: pasar de catalogo global a catalogo por tenant
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.permisos
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP INDEX IF EXISTS public.ux_permisos_modulo_recurso_accion;

CREATE UNIQUE INDEX IF NOT EXISTS ux_permisos_tenant_modulo_recurso_accion
ON public.permisos (tenant_id, lower(modulo), lower(recurso), lower(accion))
WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_permisos_global_modulo_recurso_accion
ON public.permisos (lower(modulo), lower(recurso), lower(accion))
WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_permisos_tenant_activo
ON public.permisos (tenant_id, activo);

-- Trigger updated_at para permisos (se agrega en esta migración)
DROP TRIGGER IF EXISTS trg_set_updated_at_permisos ON public.permisos;
CREATE TRIGGER trg_set_updated_at_permisos
BEFORE UPDATE ON public.permisos
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE IF EXISTS public.permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permisos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permisos_read_all ON public.permisos;
DROP POLICY IF EXISTS permisos_write_superadmin ON public.permisos;
DROP POLICY IF EXISTS permisos_tenant_select ON public.permisos;
DROP POLICY IF EXISTS permisos_tenant_write ON public.permisos;

CREATE POLICY permisos_tenant_select
ON public.permisos
FOR SELECT
USING (
  app.is_superadmin()
  OR tenant_id IS NULL
  OR tenant_id = app.current_tenant_id()
);

CREATE POLICY permisos_tenant_write
ON public.permisos
FOR ALL
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
);

-- ----------------------------------------------------------------------------
-- Usuarios de sistema: campos operativos usados por administración de usuarios
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS departamento text;

-- ----------------------------------------------------------------------------
-- Auth login attempts: columnas reales para throttling y auditoría
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.auth_login_attempts
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS failed_reason text;

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_user_email_created_at
ON public.auth_login_attempts (user_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_success_created_at
ON public.auth_login_attempts (success, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_tenant_created_at
ON public.auth_login_attempts (tenant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- User sessions: columnas compatibles con flujo de sesiones de AuthService
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.user_sessions
  ADD COLUMN IF NOT EXISTS usuario_sistema_id uuid,
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sessions_token
ON public.user_sessions (session_token)
WHERE session_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_usuario_sistema
ON public.user_sessions (usuario_sistema_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
ON public.user_sessions (expires_at);

-- ----------------------------------------------------------------------------
-- Sync empresa_config -> tenants para compatibilidad con creación de tenant
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_tenants_from_empresa_config()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.tenants (
    id,
    nombre,
    ruc,
    pais,
    plan,
    estado,
    activo,
    created_at,
    updated_at
  )
  VALUES (
    NEW.tenant_id,
    COALESCE(NULLIF(NEW.razon_social, ''), NULLIF(NEW.nombre_comercial, ''), 'TENANT'),
    NEW.ruc,
    COALESCE(NULLIF(NEW.pais, ''), 'PE'),
    COALESCE(NULLIF(NEW.plan, ''), 'free'),
    COALESCE(NULLIF(NEW.estado, ''), 'ACTIVO'),
    COALESCE(upper(NEW.estado), 'ACTIVO') = 'ACTIVO',
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    nombre = EXCLUDED.nombre,
    ruc = EXCLUDED.ruc,
    pais = EXCLUDED.pais,
    plan = EXCLUDED.plan,
    estado = EXCLUDED.estado,
    activo = EXCLUDED.activo,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tenants_from_empresa_config ON public.empresa_config;
CREATE TRIGGER trg_sync_tenants_from_empresa_config
AFTER INSERT OR UPDATE OF tenant_id, razon_social, nombre_comercial, ruc, pais, plan, estado
ON public.empresa_config
FOR EACH ROW
EXECUTE FUNCTION app.sync_tenants_from_empresa_config();

INSERT INTO public.tenants (
  id,
  nombre,
  ruc,
  pais,
  plan,
  estado,
  activo,
  created_at,
  updated_at
)
SELECT
  ec.tenant_id,
  COALESCE(NULLIF(ec.razon_social, ''), NULLIF(ec.nombre_comercial, ''), 'TENANT'),
  ec.ruc,
  COALESCE(NULLIF(ec.pais, ''), 'PE'),
  COALESCE(NULLIF(ec.plan, ''), 'free'),
  COALESCE(NULLIF(ec.estado, ''), 'ACTIVO'),
  COALESCE(upper(ec.estado), 'ACTIVO') = 'ACTIVO',
  COALESCE(ec.created_at, now()),
  now()
FROM public.empresa_config ec
WHERE ec.tenant_id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  nombre = EXCLUDED.nombre,
  ruc = EXCLUDED.ruc,
  pais = EXCLUDED.pais,
  plan = EXCLUDED.plan,
  estado = EXCLUDED.estado,
  activo = EXCLUDED.activo,
  updated_at = now();

COMMIT;
