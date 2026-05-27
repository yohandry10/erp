-- ============================================================================
-- 330__demo_admin_operational_rbac_policy.sql
-- Política de producto para tenants demo:
-- - ADMIN_DEMO con permisos operativos amplios.
-- - Sin permisos globales/sensibles: auditoría, tenants, debug, users.manage.
-- - Usuarios demo con expiración heredada del tenant demo.
-- - Backfill para demos existentes y actualización de create_demo_tenant.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE IF EXISTS public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS demo_created_by uuid,
  ADD COLUMN IF NOT EXISTS demo_retention_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_demo_expiry_330
ON public.usuarios_sistema (tenant_id, demo_expires_at)
WHERE COALESCE(is_demo_user, false) = true;

CREATE OR REPLACE FUNCTION app.ensure_demo_admin_rbac_for_tenant(
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, extensions, pg_temp
AS $$
DECLARE
  v_admin_demo_role_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id es requerido';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id
      AND COALESCE(ec.is_demo, false) = true
  ) THEN
    RETURN;
  END IF;

  PERFORM app.seed_operational_rbac_for_tenant(p_tenant_id, NULL);

  INSERT INTO public.roles (
    id, tenant_id, nombre, descripcion, is_system_role, activo, created_at, updated_at
  )
  VALUES (
    extensions.gen_random_uuid(),
    p_tenant_id,
    'ADMIN_DEMO',
    'Administrador operativo del tenant demo',
    true,
    true,
    now(),
    now()
  )
  ON CONFLICT DO NOTHING;

  SELECT id
  INTO v_admin_demo_role_id
  FROM public.roles
  WHERE tenant_id = p_tenant_id
    AND upper(nombre::text) = 'ADMIN_DEMO'
  LIMIT 1;

  IF v_admin_demo_role_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver ADMIN_DEMO para tenant %', p_tenant_id;
  END IF;

  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT
    v_admin_demo_role_id,
    p.id,
    true
  FROM public.permisos p
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true) = true
    AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) !~ '^(security\.audit\.|tenants\.manage$|system\.debug$|users\.manage$)'
    AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) NOT IN (
      'documentos.audit.read'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.rol_permisos rp
      WHERE rp.role_id = v_admin_demo_role_id
        AND rp.permiso_id = p.id
    );

  -- Si el rol heredado ADMIN existe en un demo, quitar permisos sensibles por defensa en profundidad.
  DELETE FROM public.rol_permisos rp
  USING public.roles r, public.permisos p
  WHERE rp.role_id = r.id
    AND rp.permiso_id = p.id
    AND r.tenant_id = p_tenant_id
    AND upper(r.nombre::text) = 'ADMIN'
    AND (
      lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) ~ '^(security\.audit\.|tenants\.manage$|system\.debug$|users\.manage$)'
      OR lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) = 'documentos.audit.read'
    );

  -- Los usuarios demo existentes reciben el rol ADMIN_DEMO sin perder roles previos.
  INSERT INTO public.user_roles (
    id, usuario_sistema_id, role_id, tenant_id, created_at
  )
  SELECT
    extensions.gen_random_uuid(),
    u.id,
    v_admin_demo_role_id,
    p_tenant_id,
    now()
  FROM public.usuarios_sistema u
  WHERE u.tenant_id = p_tenant_id
    AND COALESCE(u.activo, true) = true
    AND COALESCE(u.is_demo_user, false) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.usuario_sistema_id = u.id
        AND ur.role_id = v_admin_demo_role_id
    );

  UPDATE public.usuarios_sistema u
  SET
    demo_expires_at = COALESCE(u.demo_expires_at, ec.demo_expires_at),
    demo_retention_until = COALESCE(u.demo_retention_until, ec.demo_expires_at + interval '30 days'),
    updated_at = now()
  FROM public.empresa_config ec
  WHERE ec.tenant_id = u.tenant_id
    AND u.tenant_id = p_tenant_id
    AND COALESCE(ec.is_demo, false) = true
    AND COALESCE(u.is_demo_user, false) = true;
END;
$$;

DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  FOR v_tenant_id IN
    SELECT tenant_id
    FROM public.empresa_config
    WHERE COALESCE(is_demo, false) = true
  LOOP
    PERFORM app.ensure_demo_admin_rbac_for_tenant(v_tenant_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_demo_tenant(
  p_nombre varchar DEFAULT 'DEMO COMERCIAL SAC',
  p_dias_duracion integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := extensions.gen_random_uuid();
  v_user_id uuid := extensions.gen_random_uuid();
  v_demo_email text;
  v_demo_password text;
  v_expires_at timestamptz;
  v_admin_demo_role_id uuid;
BEGIN
  v_demo_email := 'demo-' || left(v_tenant_id::text, 8) || '@temp.local';
  v_demo_password := upper(left(md5(random()::text), 8));
  v_expires_at := now() + make_interval(days => GREATEST(COALESCE(p_dias_duracion, 14), 1));

  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado, created_at, updated_at
  ) VALUES (
    v_tenant_id,
    'DEMO-' || upper(left(v_tenant_id::text, 8)),
    p_nombre,
    'Tenant demo autogenerado',
    'PE',
    'demo',
    true,
    'ACTIVO',
    now(),
    now()
  );

  INSERT INTO public.empresa_config (
    id, tenant_id, razon_social, nombre_comercial, ruc, pais, moneda_defecto,
    is_demo, demo_created_at, demo_expires_at, demo_extended, demo_conversion_attempted,
    estado, plan, created_at, updated_at
  )
  VALUES (
    extensions.gen_random_uuid(),
    v_tenant_id,
    p_nombre,
    p_nombre,
    '20' || lpad((random() * 999999999)::int::text, 9, '0'),
    'PE',
    'PEN',
    true,
    now(),
    v_expires_at,
    false,
    false,
    'PRUEBA',
    'BASICO',
    now(),
    now()
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado, is_super_admin, is_demo_user, demo_email_temp,
    demo_expires_at, demo_retention_until,
    created_at, updated_at
  ) VALUES (
    v_user_id,
    v_tenant_id,
    'Usuario',
    'Demo',
    v_demo_email,
    'demo',
    extensions.crypt(v_demo_password, extensions.gen_salt('bf')),
    true,
    'ACTIVO',
    false,
    true,
    v_demo_email,
    v_expires_at,
    v_expires_at + interval '30 days',
    now(),
    now()
  );

  INSERT INTO public.users (
    id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, v_demo_email, 'Usuario', 'Demo', true, 'ACTIVO', now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM app.ensure_demo_admin_rbac_for_tenant(v_tenant_id);

  SELECT id INTO v_admin_demo_role_id
  FROM public.roles
  WHERE tenant_id = v_tenant_id
    AND upper(nombre::text) = 'ADMIN_DEMO'
  LIMIT 1;

  IF v_admin_demo_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (
      id, usuario_sistema_id, role_id, tenant_id, created_at
    ) VALUES (
      extensions.gen_random_uuid(), v_user_id, v_admin_demo_role_id, v_tenant_id, now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'user_id', v_user_id,
    'email', v_demo_email,
    'password', v_demo_password,
    'expires_at', v_expires_at,
    'dias_restantes', GREATEST(COALESCE(p_dias_duracion, 14), 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION app.ensure_demo_admin_rbac_for_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.ensure_demo_admin_rbac_for_tenant(uuid) FROM anon;
REVOKE ALL ON FUNCTION app.ensure_demo_admin_rbac_for_tenant(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION app.ensure_demo_admin_rbac_for_tenant(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer) FROM anon;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_tenant(varchar, integer) TO service_role;

COMMIT;
