-- ============================================================================
-- 001__core_foundation.sql
-- Reconstruccion base: multi-tenant, seguridad core, outbox y configuracion.
-- ============================================================================

BEGIN;

-- Extensiones minimas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Esquema tecnico para helpers
CREATE SCHEMA IF NOT EXISTS app;

-- ----------------------------------------------------------------------------
-- Helpers de contexto multi-tenant
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
BEGIN
  v := current_setting('app.current_tenant_id', true);
  IF v IS NULL OR btrim(v) = '' THEN
    RETURN NULL;
  END IF;
  RETURN v::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v text;
BEGIN
  v := current_setting('app.current_user_id', true);
  IF v IS NULL OR btrim(v) = '' THEN
    RETURN NULL;
  END IF;
  RETURN v::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_superadmin', true), '')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION app.set_tenant_context(
  p_tenant_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_is_superadmin boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', COALESCE(p_tenant_id::text, ''), false);
  PERFORM set_config('app.current_user_id', COALESCE(p_user_id::text, ''), false);
  PERFORM set_config('app.is_superadmin', CASE WHEN p_is_superadmin THEN 'true' ELSE 'false' END, false);
END;
$$;

CREATE OR REPLACE FUNCTION app.clear_tenant_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', '', false);
  PERFORM set_config('app.current_user_id', '', false);
  PERFORM set_config('app.is_superadmin', 'false', false);
END;
$$;

-- Trigger generico de updated_at
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Tablas core
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE,
  nombre text NOT NULL,
  descripcion text,
  ruc text,
  pais text DEFAULT 'PE',
  plan text DEFAULT 'free',
  activo boolean NOT NULL DEFAULT true,
  estado text DEFAULT 'ACTIVO',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.empresa_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  ruc text,
  razon_social text,
  nombre_comercial text,
  email text,
  telefono text,
  direccion_fiscal text,
  direccion text,
  departamento text,
  provincia text,
  distrito text,
  ubigeo text,
  pais text DEFAULT 'PE',
  pais_id uuid,
  moneda_defecto text DEFAULT 'PEN',
  estado text DEFAULT 'ACTIVO',
  plan text DEFAULT 'free',
  configuracion_completa boolean NOT NULL DEFAULT false,
  logo_url text,
  certificado_pfx bytea,
  certificado_password text,
  certificado_expira_en timestamptz,
  pfx_encrypted text,
  pfx_password_encrypted text,
  igv_porcentaje numeric(10,2) DEFAULT 18.00,
  aplicar_retencion boolean DEFAULT false,
  retencion_tasa numeric(10,4) DEFAULT 0,
  aplicar_percepcion boolean DEFAULT false,
  percepcion_tasa numeric(10,4) DEFAULT 0,
  aplicar_detraccion boolean DEFAULT false,
  detraccion_tasa numeric(10,4) DEFAULT 0,
  detraccion_codigo text,
  serie_factura text,
  ultimo_numero_factura bigint DEFAULT 0,
  gre_obligatorio boolean DEFAULT false,
  gre_automatico_habilitado boolean DEFAULT true,
  umbral_gre_automatico numeric(14,2) DEFAULT 700.00,
  habilitar_multialmacen boolean DEFAULT false,
  habilitar_rma boolean DEFAULT false,
  dias_maximos_rma integer DEFAULT 30,
  rma_requiere_control_calidad boolean DEFAULT false,
  dias_vencimiento_factura integer DEFAULT 30,
  monto_aprobacion_compras numeric(14,2),
  generar_cxp_en text DEFAULT 'RECEPCION',
  is_demo boolean DEFAULT false,
  demo_created_at timestamptz,
  demo_expires_at timestamptz,
  demo_extended boolean DEFAULT false,
  demo_conversion_attempted boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usuarios_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  password_hash text,
  nombre text,
  apellido text,
  telefono text,
  activo boolean NOT NULL DEFAULT true,
  estado text DEFAULT 'ACTIVO',
  is_super_admin boolean NOT NULL DEFAULT false,
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  fecha_ultimo_acceso timestamptz,
  password_reset_token text,
  password_reset_expires timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  is_system_role boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_tenant_nombre
ON public.roles (tenant_id, lower(nombre));

CREATE TABLE IF NOT EXISTS public.permisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo text NOT NULL,
  recurso text NOT NULL,
  accion text NOT NULL,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_permisos_modulo_recurso_accion
ON public.permisos (lower(modulo), lower(recurso), lower(accion));

CREATE TABLE IF NOT EXISTS public.rol_permisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permiso_id uuid NOT NULL REFERENCES public.permisos(id) ON DELETE CASCADE,
  concedido boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rol_permisos_role_permiso
ON public.rol_permisos (role_id, permiso_id);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_sistema_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_roles_usuario_role_tenant
ON public.user_roles (usuario_sistema_id, role_id, tenant_id);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL,
  table_name text NOT NULL,
  operation text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_timestamp
ON public.audit_log (tenant_id, "timestamp" DESC);

CREATE TABLE IF NOT EXISTS public.wizard_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  paso_actual integer NOT NULL DEFAULT 1,
  pasos_completados integer[] NOT NULL DEFAULT '{}',
  configuracion_temporal jsonb NOT NULL DEFAULT '{}'::jsonb,
  completado boolean NOT NULL DEFAULT false,
  completado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  aggregate_type text,
  aggregate_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  processed_at timestamptz,
  error_message text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_created
ON public.outbox_events (status, created_at);

CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant_status
ON public.outbox_events (tenant_id, status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_events_idempotency
ON public.outbox_events (tenant_id, event_type, idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Triggers updated_at (core)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_set_updated_at_tenants ON public.tenants;
CREATE TRIGGER trg_set_updated_at_tenants
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_empresa_config ON public.empresa_config;
CREATE TRIGGER trg_set_updated_at_empresa_config
BEFORE UPDATE ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_usuarios_sistema ON public.usuarios_sistema;
CREATE TRIGGER trg_set_updated_at_usuarios_sistema
BEFORE UPDATE ON public.usuarios_sistema
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_roles ON public.roles;
CREATE TRIGGER trg_set_updated_at_roles
BEFORE UPDATE ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_wizard_progress ON public.wizard_progress;
CREATE TRIGGER trg_set_updated_at_wizard_progress
BEFORE UPDATE ON public.wizard_progress
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_outbox_events ON public.outbox_events;
CREATE TRIGGER trg_set_updated_at_outbox_events
BEFORE UPDATE ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

COMMIT;
