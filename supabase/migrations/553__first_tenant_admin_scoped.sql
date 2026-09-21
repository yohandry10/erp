-- El primer administrador obtiene RBAC del tenant, nunca autoridad global.
-- Sin backfill: conserva identidades y sesiones existentes. CREATE OR REPLACE conserva ACL.
-- Rollback: restaurar la definición anterior de crear_usuario_rbac_tx desde el respaldo.
BEGIN;

CREATE OR REPLACE FUNCTION public.crear_usuario_rbac_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_usuario jsonb,
  p_role_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_email text := NULLIF(lower(btrim(COALESCE(p_usuario->>'email', ''))), '');
  v_nombre text := NULLIF(btrim(COALESCE(p_usuario->>'nombre', '')), '');
  v_password_hash text := NULLIF(btrim(COALESCE(p_usuario->>'password_hash', '')), '');
  v_estado text := upper(COALESCE(NULLIF(btrim(p_usuario->>'estado'), ''), 'ACTIVO'));
  v_roles uuid[];
  v_fingerprint text;
  v_existing public.usuarios_sistema;
  v_created public.usuarios_sistema;
  v_is_demo boolean := false;
  v_demo_expires timestamptz;
  v_demo_count integer;
  v_bootstrap boolean := COALESCE((p_usuario->>'bootstrap_first_admin')::boolean, false);
BEGIN
  IF v_bootstrap THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':admin:first-user', 0));
    IF EXISTS (SELECT 1 FROM public.usuarios_sistema u WHERE u.tenant_id = p_tenant_id)
       AND NOT (
         (SELECT count(*) FROM public.usuarios_sistema u WHERE u.tenant_id = p_tenant_id) = 1
         AND EXISTS (
           SELECT 1 FROM public.usuarios_sistema u
           WHERE u.tenant_id = p_tenant_id
             AND lower(btrim(u.email)) = v_email
             AND u.creation_idempotency_key = v_key
         )
       ) THEN
      RAISE EXCEPTION 'ADMIN_BOOTSTRAP_ONLY_EMPTY_TENANT' USING ERRCODE = '42501';
    END IF;
  ELSE
    PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  END IF;
  IF v_key IS NULL OR v_email IS NULL OR v_nombre IS NULL OR v_password_hash IS NULL THEN
    RAISE EXCEPTION 'ADMIN_USER_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'ADMIN_USER_EMAIL_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_estado NOT IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO') THEN
    RAISE EXCEPTION 'ADMIN_USER_STATUS_INVALID' USING ERRCODE = '22023';
  END IF;
  v_roles := app.assert_roles_462(p_tenant_id, p_role_ids, true);
  IF v_bootstrap AND (
    cardinality(v_roles) <> 1 OR NOT EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = v_roles[1] AND r.tenant_id = p_tenant_id
        AND upper(btrim(r.nombre)) IN ('ADMIN', 'SUPER_ADMIN', 'ADMINISTRADOR')
        AND COALESCE(r.activo, true)
    )
  ) THEN
    RAISE EXCEPTION 'ADMIN_BOOTSTRAP_REQUIRES_ADMIN_ROLE' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(ec.is_demo, false), ec.demo_expires_at
  INTO v_is_demo, v_demo_expires
  FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id;
  v_is_demo := COALESCE(v_is_demo, false);
  IF v_is_demo THEN
    SELECT count(*) INTO v_demo_count FROM public.usuarios_sistema u
    WHERE u.tenant_id = p_tenant_id AND COALESCE(u.activo, false);
    IF v_demo_count >= 100 THEN
      RAISE EXCEPTION 'ADMIN_DEMO_USER_LIMIT' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_fingerprint := app.admin_fingerprint_462(jsonb_build_object(
    'tenant_id', p_tenant_id,
    'email', v_email,
    'nombre', v_nombre,
    'apellido', NULLIF(btrim(COALESCE(p_usuario->>'apellido', '')), ''),
    'telefono', NULLIF(btrim(COALESCE(p_usuario->>'telefono', '')), ''),
    'cargo', NULLIF(btrim(COALESCE(p_usuario->>'cargo', '')), ''),
    'departamento', NULLIF(btrim(COALESCE(p_usuario->>'departamento', '')), ''),
    'estado', v_estado,
    'roles', to_jsonb(v_roles)
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended('admin:user:' || v_email, 0));
  SELECT * INTO v_existing FROM public.usuarios_sistema u
  WHERE lower(btrim(u.email)) = v_email FOR UPDATE;
  IF FOUND THEN
    IF v_existing.tenant_id = p_tenant_id
       AND v_existing.creation_idempotency_key = v_key
       AND v_existing.creation_fingerprint = v_fingerprint THEN
      RETURN app.safe_user_462(v_existing.id) || jsonb_build_object('idempotent', true);
    END IF;
    RAISE EXCEPTION 'ADMIN_USER_EMAIL_OR_KEY_CONFLICT' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.usuarios_sistema (
    tenant_id, email, password_hash, nombre, apellido, telefono, cargo, departamento,
    estado, activo, is_super_admin, is_demo_user, demo_email_temp, demo_expires_at,
    demo_retention_until, demo_created_by, created_by, updated_by,
    creation_idempotency_key, creation_fingerprint
  ) VALUES (
    p_tenant_id, v_email, v_password_hash, v_nombre,
    NULLIF(btrim(COALESCE(p_usuario->>'apellido', '')), ''),
    NULLIF(btrim(COALESCE(p_usuario->>'telefono', '')), ''),
    NULLIF(btrim(COALESCE(p_usuario->>'cargo', '')), ''),
    NULLIF(btrim(COALESCE(p_usuario->>'departamento', '')), ''),
    v_estado, v_estado = 'ACTIVO', false, v_is_demo,
    CASE WHEN v_is_demo THEN v_email ELSE NULL END,
    CASE WHEN v_is_demo THEN v_demo_expires ELSE NULL END,
    CASE WHEN v_is_demo AND v_demo_expires IS NOT NULL THEN v_demo_expires + interval '30 days' ELSE NULL END,
    CASE WHEN v_is_demo THEN p_actor_id ELSE NULL END,
    p_actor_id, p_actor_id, v_key, v_fingerprint
  ) RETURNING * INTO v_created;

  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id, assigned_by)
  SELECT v_created.id, x, p_tenant_id, p_actor_id FROM unnest(v_roles) x;

  PERFORM app.audit_admin_462(
    p_tenant_id, p_actor_id, 'usuarios_sistema', 'INSERT', v_created.id,
    NULL, app.safe_user_462(v_created.id), 'CREAR_USUARIO',
    jsonb_build_object('role_ids', to_jsonb(v_roles), 'idempotency_key', v_key)
  );
  RETURN app.safe_user_462(v_created.id) || jsonb_build_object('idempotent', false);
END;
$function$;

-- El backend debe recuperar el progreso sin habilitar escrituras directas.
GRANT SELECT ON public.wizard_progress TO service_role;

COMMIT;
