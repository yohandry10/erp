-- Restore the exact named-argument contract used by PostgREST and the API.
-- The historical two-argument overload must not coexist because every input
-- has a default and PostgREST cannot disambiguate the request reliably.
BEGIN;

DROP FUNCTION IF EXISTS public.create_demo_tenant(character varying, integer);

CREATE OR REPLACE FUNCTION public.create_demo_tenant(
  p_nombre varchar DEFAULT 'DEMO COMERCIAL S.A.C.',
  p_dias_duracion integer DEFAULT 14,
  p_pais_codigo varchar DEFAULT 'PE'
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
  v_country text := upper(btrim(COALESCE(p_pais_codigo, 'PE')));
  v_pais_id bigint;
  v_currency text;
  v_tax_id text;
  v_base text;
BEGIN
  IF v_country NOT IN ('PE', 'AR', 'CO') THEN
    RAISE EXCEPTION 'País demo no soportado: %. Use PE, AR o CO.', v_country;
  END IF;

  SELECT id, moneda_codigo
    INTO v_pais_id, v_currency
  FROM public.paises
  WHERE codigo_iso = v_country
    AND activo = true;

  IF v_pais_id IS NULL THEN
    RAISE EXCEPTION 'Catálogo del país % no disponible', v_country;
  END IF;

  IF v_country = 'AR' THEN
    v_base := '30' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    v_tax_id := v_base || app.argentina_cuit_check_digit(v_base)::text;
  ELSIF v_country = 'CO' THEN
    v_base := '9' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    v_tax_id := v_base || app.colombia_nit_check_digit(v_base)::text;
  ELSE
    v_tax_id := '20' || lpad((random() * 999999999)::int::text, 9, '0');
  END IF;

  v_demo_email := 'demo-' || lower(v_country) || '-' || left(v_tenant_id::text, 8) || '@temp.local';
  v_demo_password := upper(left(md5(random()::text), 8));
  v_expires_at := now() + make_interval(days => GREATEST(COALESCE(p_dias_duracion, 14), 1));

  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado, created_at, updated_at
  ) VALUES (
    v_tenant_id,
    'DEMO-' || v_country || '-' || upper(left(v_tenant_id::text, 8)),
    p_nombre,
    'Tenant demo autogenerado para ' || v_country,
    v_country,
    'demo',
    true,
    'ACTIVO',
    now(),
    now()
  );

  INSERT INTO public.empresa_config (
    id, tenant_id, razon_social, nombre_comercial, ruc, pais, pais_id, moneda_defecto,
    tipo_empresa, usar_flujo_logistica,
    is_demo, demo_created_at, demo_expires_at, demo_extended, demo_conversion_attempted,
    estado, plan, created_at, updated_at
  ) VALUES (
    extensions.gen_random_uuid(), v_tenant_id, p_nombre, p_nombre, v_tax_id,
    v_country, v_pais_id, v_currency, 'MICRO', false,
    true, now(), v_expires_at, false, false,
    'PRUEBA', 'BASICO', now(), now()
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado, is_super_admin, is_demo_user, demo_email_temp,
    demo_expires_at, demo_retention_until, created_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, 'Usuario', 'Demo ' || v_country, v_demo_email, 'demo',
    extensions.crypt(v_demo_password, extensions.gen_salt('bf')),
    true, 'ACTIVO', false, true, v_demo_email, v_expires_at,
    v_expires_at + interval '30 days', now(), now()
  );

  INSERT INTO public.users (
    id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, v_demo_email, 'Usuario', 'Demo ' || v_country,
    true, 'ACTIVO', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  PERFORM app.ensure_demo_admin_rbac_for_tenant(v_tenant_id);

  SELECT id
    INTO v_admin_demo_role_id
  FROM public.roles
  WHERE tenant_id = v_tenant_id
    AND upper(nombre::text) = 'ADMIN_DEMO'
  LIMIT 1;

  IF v_admin_demo_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (
      id, usuario_sistema_id, role_id, tenant_id, created_at
    ) VALUES (
      extensions.gen_random_uuid(), v_user_id, v_admin_demo_role_id, v_tenant_id, now()
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'user_id', v_user_id,
    'email', v_demo_email,
    'password', v_demo_password,
    'expires_at', v_expires_at,
    'dias_restantes', GREATEST(COALESCE(p_dias_duracion, 14), 1),
    'pais', v_country,
    'pais_id', v_pais_id,
    'moneda', v_currency
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) FROM anon;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) TO service_role;

DO $$
DECLARE
  v_arg_names text[];
BEGIN
  SELECT p.proargnames
    INTO v_arg_names
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.oid = 'public.create_demo_tenant(character varying,integer,character varying)'::regprocedure;

  IF v_arg_names IS DISTINCT FROM ARRAY['p_nombre', 'p_dias_duracion', 'p_pais_codigo']::text[] THEN
    RAISE EXCEPTION 'Firma PostgREST inválida para create_demo_tenant: %', v_arg_names;
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_demo_tenant') <> 1 THEN
    RAISE EXCEPTION 'create_demo_tenant debe tener una sola firma para PostgREST';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
