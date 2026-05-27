-- Corrige create_demo_tenant cuando pgcrypto vive en el schema extensions.
-- En Supabase, SECURITY DEFINER + search_path acotado puede dejar fuera
-- gen_salt/crypt si se invocan sin calificar.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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
  v_admin_role_id uuid;
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
    now(),
    now()
  );

  INSERT INTO public.users (
    id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, v_demo_email, 'Usuario', 'Demo', true, 'ACTIVO', now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.roles (
    id, tenant_id, nombre, descripcion, is_system_role, activo, created_at, updated_at
  )
  VALUES (
    extensions.gen_random_uuid(), v_tenant_id, 'ADMIN', 'Administrador del tenant demo', true, true, now(), now()
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_admin_role_id
  FROM public.roles
  WHERE tenant_id = v_tenant_id
    AND lower(nombre::text) = 'admin'
  LIMIT 1;

  IF v_admin_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (
      id, usuario_sistema_id, role_id, tenant_id, created_at
    ) VALUES (
      extensions.gen_random_uuid(), v_user_id, v_admin_role_id, v_tenant_id, now()
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

REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer) FROM anon;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_tenant(varchar, integer) TO service_role;

COMMIT;
