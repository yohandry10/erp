-- Administración canónica: usuarios, roles y permisos mutan mediante RPCs
-- atómicas. No crea identidades en un proveedor externo: el login operativo
-- del ERP usa usuarios_sistema.password_hash y las credenciales del tenant.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS creation_idempotency_key text,
  ADD COLUMN IF NOT EXISTS creation_fingerprint text;

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS creation_idempotency_key text,
  ADD COLUMN IF NOT EXISTS creation_fingerprint text;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS assigned_by uuid;

ALTER TABLE public.rol_permisos
  ADD COLUMN IF NOT EXISTS assigned_by uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_usuarios_sistema_created_by_462') THEN
    ALTER TABLE public.usuarios_sistema
      ADD CONSTRAINT fk_usuarios_sistema_created_by_462 FOREIGN KEY (created_by)
      REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_usuarios_sistema_updated_by_462') THEN
    ALTER TABLE public.usuarios_sistema
      ADD CONSTRAINT fk_usuarios_sistema_updated_by_462 FOREIGN KEY (updated_by)
      REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_roles_created_by_462') THEN
    ALTER TABLE public.roles
      ADD CONSTRAINT fk_roles_created_by_462 FOREIGN KEY (created_by)
      REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_roles_updated_by_462') THEN
    ALTER TABLE public.roles
      ADD CONSTRAINT fk_roles_updated_by_462 FOREIGN KEY (updated_by)
      REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_roles_assigned_by_462') THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT fk_user_roles_assigned_by_462 FOREIGN KEY (assigned_by)
      REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rol_permisos_assigned_by_462') THEN
    ALTER TABLE public.rol_permisos
      ADD CONSTRAINT fk_rol_permisos_assigned_by_462 FOREIGN KEY (assigned_by)
      REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL NOT VALID;
  END IF;
END;
$constraints$;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.usuarios_sistema
    GROUP BY lower(btrim(email)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ADMIN_USER_EMAIL_CASE_DUPLICATE_PREFLIGHT' USING ERRCODE = '23505';
  END IF;
END;
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email_lower_462
ON public.usuarios_sistema (lower(btrim(email)));

CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_tenant_creation_key_462
ON public.usuarios_sistema (tenant_id, creation_idempotency_key)
WHERE tenant_id IS NOT NULL AND creation_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_tenant_creation_key_462
ON public.roles (tenant_id, creation_idempotency_key)
WHERE tenant_id IS NOT NULL AND creation_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION app.admin_fingerprint_462(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(COALESCE(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION app.assert_admin_actor_462(p_tenant_id uuid, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND COALESCE(u.activo, false)
      AND lower(COALESCE(u.estado::text, '')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'ADMIN_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.audit_admin_462(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_table_name text,
  p_operation text,
  p_record_id uuid,
  p_old jsonb,
  p_new jsonb,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id,
    old_values, new_values, changed_fields, metadata
  ) VALUES (
    p_tenant_id, p_actor_id, p_table_name, upper(p_operation), p_record_id::text,
    p_old, p_new,
    CASE WHEN upper(p_operation) = 'UPDATE' THEN (
      SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb)
      FROM (
        SELECT key AS k FROM jsonb_each(COALESCE(p_old, '{}'::jsonb))
        UNION
        SELECT key AS k FROM jsonb_each(COALESCE(p_new, '{}'::jsonb))
      ) keys
      WHERE COALESCE(p_old, '{}'::jsonb)->k IS DISTINCT FROM COALESCE(p_new, '{}'::jsonb)->k
    ) ELSE NULL END,
    jsonb_build_object('accion', p_action, 'source', 'admin_rbac_462') || COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.normalized_uuid_array_462(p_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT COALESCE(array_agg(DISTINCT value ORDER BY value), '{}'::uuid[])
  FROM unnest(COALESCE(p_ids, '{}'::uuid[])) AS value
$function$;

CREATE OR REPLACE FUNCTION app.assert_roles_462(
  p_tenant_id uuid,
  p_role_ids uuid[],
  p_require_one boolean DEFAULT false
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_ids uuid[] := app.normalized_uuid_array_462(p_role_ids);
  v_count integer;
BEGIN
  IF cardinality(v_ids) <> cardinality(COALESCE(p_role_ids, '{}'::uuid[])) THEN
    RAISE EXCEPTION 'ADMIN_ROLE_IDS_DUPLICATED' USING ERRCODE = '22023';
  END IF;
  IF p_require_one AND cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'ADMIN_USER_REQUIRES_ROLE' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.roles r
  WHERE r.tenant_id = p_tenant_id AND r.id = ANY(v_ids) AND COALESCE(r.activo, true);
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'ADMIN_ROLE_INVALID_OR_CROSS_TENANT' USING ERRCODE = '42501';
  END IF;
  RETURN v_ids;
END;
$function$;

CREATE OR REPLACE FUNCTION app.assert_permissions_462(p_tenant_id uuid, p_permission_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_ids uuid[] := app.normalized_uuid_array_462(p_permission_ids);
  v_count integer;
BEGIN
  IF cardinality(v_ids) <> cardinality(COALESCE(p_permission_ids, '{}'::uuid[])) THEN
    RAISE EXCEPTION 'ADMIN_PERMISSION_IDS_DUPLICATED' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.permisos p
  WHERE p.tenant_id = p_tenant_id AND p.id = ANY(v_ids) AND COALESCE(p.activo, true);
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'ADMIN_PERMISSION_INVALID_OR_CROSS_TENANT' USING ERRCODE = '42501';
  END IF;
  RETURN v_ids;
END;
$function$;

CREATE OR REPLACE FUNCTION app.safe_user_462(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT (to_jsonb(u) - ARRAY[
    'password_hash', 'password_reset_token', 'password_reset_expires',
    'creation_fingerprint', 'creation_idempotency_key'
  ]) || jsonb_build_object(
    'role_ids', COALESCE((
      SELECT jsonb_agg(ur.role_id ORDER BY ur.role_id)
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id AND r.tenant_id = u.tenant_id
      WHERE ur.usuario_sistema_id = u.id AND ur.tenant_id = u.tenant_id AND COALESCE(r.activo, true)
    ), '[]'::jsonb)
  )
  FROM public.usuarios_sistema u
  WHERE u.id = p_user_id
$function$;

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
    v_estado, v_estado = 'ACTIVO', v_bootstrap, v_is_demo,
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

CREATE OR REPLACE FUNCTION public.crear_primer_admin_tenant_tx(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_usuario jsonb,
  p_admin_role_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT public.crear_usuario_rbac_tx(
    p_tenant_id,
    NULL,
    p_idempotency_key,
    COALESCE(p_usuario, '{}'::jsonb) || jsonb_build_object('bootstrap_first_admin', true, 'estado', 'ACTIVO'),
    ARRAY[p_admin_role_id]
  )
$function$;

CREATE OR REPLACE FUNCTION public.asignar_roles_usuario_rbac_tx(
  p_usuario_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_role_ids uuid[],
  p_mode text DEFAULT 'REPLACE'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_user public.usuarios_sistema;
  v_ids uuid[];
  v_mode text := upper(btrim(COALESCE(p_mode, 'REPLACE')));
  v_old_roles uuid[];
  v_new_roles uuid[];
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  IF v_mode NOT IN ('ADD', 'REMOVE', 'REPLACE') THEN
    RAISE EXCEPTION 'ADMIN_ROLE_ASSIGN_MODE_INVALID' USING ERRCODE = '22023';
  END IF;
  v_ids := app.assert_roles_462(p_tenant_id, p_role_ids, v_mode IN ('ADD', 'REPLACE'));
  SELECT * INTO v_user FROM public.usuarios_sistema u
  WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_USER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT COALESCE(array_agg(ur.role_id ORDER BY ur.role_id), '{}'::uuid[]) INTO v_old_roles
  FROM public.user_roles ur WHERE ur.usuario_sistema_id = p_usuario_id AND ur.tenant_id = p_tenant_id;

  IF v_mode = 'REPLACE' THEN
    DELETE FROM public.user_roles ur WHERE ur.usuario_sistema_id = p_usuario_id AND ur.tenant_id = p_tenant_id;
    INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id, assigned_by)
    SELECT p_usuario_id, x, p_tenant_id, p_actor_id FROM unnest(v_ids) x;
  ELSIF v_mode = 'ADD' THEN
    INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id, assigned_by)
    SELECT p_usuario_id, x, p_tenant_id, p_actor_id FROM unnest(v_ids) x
    ON CONFLICT (usuario_sistema_id, role_id, tenant_id) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles ur
    WHERE ur.usuario_sistema_id = p_usuario_id AND ur.tenant_id = p_tenant_id AND ur.role_id = ANY(v_ids);
  END IF;

  SELECT COALESCE(array_agg(ur.role_id ORDER BY ur.role_id), '{}'::uuid[]) INTO v_new_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id AND r.tenant_id = p_tenant_id AND COALESCE(r.activo, true)
  WHERE ur.usuario_sistema_id = p_usuario_id AND ur.tenant_id = p_tenant_id;
  IF COALESCE(v_user.activo, false) AND NOT v_user.is_super_admin AND cardinality(v_new_roles) = 0 THEN
    RAISE EXCEPTION 'ADMIN_ACTIVE_USER_REQUIRES_ROLE' USING ERRCODE = '23514';
  END IF;

  UPDATE public.usuarios_sistema SET updated_by = p_actor_id, updated_at = now()
  WHERE id = p_usuario_id AND tenant_id = p_tenant_id;
  PERFORM app.audit_admin_462(
    p_tenant_id, p_actor_id, 'user_roles', 'UPDATE', p_usuario_id,
    jsonb_build_object('role_ids', to_jsonb(v_old_roles)),
    jsonb_build_object('role_ids', to_jsonb(v_new_roles)),
    'CAMBIAR_ROLES_USUARIO', jsonb_build_object('mode', v_mode)
  );
  RETURN app.safe_user_462(p_usuario_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_usuario_rbac_tx(
  p_usuario_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cambios jsonb,
  p_role_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old public.usuarios_sistema;
  v_new public.usuarios_sistema;
  v_email text;
  v_nombre text;
  v_estado text;
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  SELECT * INTO v_old FROM public.usuarios_sistema u
  WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_USER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  v_email := CASE WHEN p_cambios ? 'email' THEN NULLIF(lower(btrim(p_cambios->>'email')), '') ELSE v_old.email END;
  v_nombre := CASE WHEN p_cambios ? 'nombre' THEN NULLIF(btrim(p_cambios->>'nombre'), '') ELSE v_old.nombre END;
  v_estado := CASE WHEN p_cambios ? 'estado' THEN upper(NULLIF(btrim(p_cambios->>'estado'), '')) ELSE upper(v_old.estado::text) END;
  IF v_email IS NULL OR v_nombre IS NULL OR v_estado NOT IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO') THEN
    RAISE EXCEPTION 'ADMIN_USER_UPDATE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_usuario_id = p_actor_id AND v_estado <> 'ACTIVO' THEN
    RAISE EXCEPTION 'ADMIN_USER_CANNOT_DEACTIVATE_SELF' USING ERRCODE = '42501';
  END IF;
  IF v_old.is_super_admin AND v_estado <> 'ACTIVO' AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema other
    WHERE other.tenant_id = p_tenant_id AND other.id <> p_usuario_id
      AND other.is_super_admin AND COALESCE(other.activo, false)
  ) THEN
    RAISE EXCEPTION 'ADMIN_LAST_SUPERADMIN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.usuarios_sistema u SET
    email = v_email,
    nombre = v_nombre,
    apellido = CASE WHEN p_cambios ? 'apellido' THEN NULLIF(btrim(p_cambios->>'apellido'), '') ELSE u.apellido END,
    telefono = CASE WHEN p_cambios ? 'telefono' THEN NULLIF(btrim(p_cambios->>'telefono'), '') ELSE u.telefono END,
    cargo = CASE WHEN p_cambios ? 'cargo' THEN NULLIF(btrim(p_cambios->>'cargo'), '') ELSE u.cargo END,
    departamento = CASE WHEN p_cambios ? 'departamento' THEN NULLIF(btrim(p_cambios->>'departamento'), '') ELSE u.departamento END,
    estado = v_estado,
    activo = v_estado = 'ACTIVO',
    updated_by = p_actor_id,
    updated_at = now()
  WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id RETURNING * INTO v_new;

  IF v_estado <> 'ACTIVO' THEN
    UPDATE public.user_sessions s SET
      estado = 'REVOCADA', revoked_at = COALESCE(s.revoked_at, now()),
      revocation_reason = COALESCE(s.revocation_reason, 'USER_DISABLED'), updated_at = now()
    WHERE s.usuario_sistema_id = p_usuario_id AND s.tenant_id = p_tenant_id AND s.revoked_at IS NULL;
  END IF;
  IF p_role_ids IS NOT NULL THEN
    PERFORM public.asignar_roles_usuario_rbac_tx(p_usuario_id, p_tenant_id, p_actor_id, p_role_ids, 'REPLACE');
  END IF;
  PERFORM app.audit_admin_462(
    p_tenant_id, p_actor_id, 'usuarios_sistema', 'UPDATE', p_usuario_id,
    to_jsonb(v_old) - ARRAY['password_hash','password_reset_token','creation_fingerprint','creation_idempotency_key'],
    app.safe_user_462(p_usuario_id), 'ACTUALIZAR_USUARIO'
  );
  RETURN app.safe_user_462(p_usuario_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'ADMIN_USER_EMAIL_CONFLICT' USING ERRCODE = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_usuario_rbac_tx(
  p_usuario_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_estado text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT public.actualizar_usuario_rbac_tx(
    p_usuario_id, p_tenant_id, p_actor_id,
    jsonb_build_object('estado', upper(btrim(p_estado))), NULL
  )
$function$;

CREATE OR REPLACE FUNCTION public.registrar_reset_usuario_rbac_tx(
  p_usuario_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_user public.usuarios_sistema;
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  IF NULLIF(btrim(COALESCE(p_token_hash, '')), '') IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'ADMIN_RESET_TOKEN_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_user FROM public.usuarios_sistema u
  WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_USER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.usuarios_sistema SET password_reset_token = p_token_hash,
    password_reset_expires = p_expires_at, updated_by = p_actor_id, updated_at = now()
  WHERE id = p_usuario_id AND tenant_id = p_tenant_id;
  PERFORM app.audit_admin_462(
    p_tenant_id, p_actor_id, 'usuarios_sistema', 'UPDATE', p_usuario_id,
    jsonb_build_object('reset_pending', v_user.password_reset_token IS NOT NULL),
    jsonb_build_object('reset_pending', true, 'expires_at', p_expires_at),
    'GENERAR_RESET_PASSWORD'
  );
  RETURN app.safe_user_462(p_usuario_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_login_exitoso_auth_tx(p_usuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_user public.usuarios_sistema;
BEGIN
  SELECT * INTO v_user FROM public.usuarios_sistema u WHERE u.id = p_usuario_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(v_user.activo, false) OR lower(v_user.estado::text) <> 'activo' THEN
    RAISE EXCEPTION 'AUTH_USER_INACTIVE_OR_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  UPDATE public.usuarios_sistema SET
    failed_login_attempts = 0, locked_until = NULL,
    fecha_ultimo_acceso = now(), updated_at = now()
  WHERE id = p_usuario_id;
  RETURN jsonb_build_object('usuario_id', p_usuario_id, 'fecha_ultimo_acceso', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_intento_login_auth_tx(
  p_email text,
  p_ip_address text,
  p_user_agent text,
  p_success boolean,
  p_failed_reason text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_ip inet;
  v_attempt_id uuid;
BEGIN
  IF length(v_email) < 3 OR length(v_email) > 320 OR position('@' IN v_email) <= 1 THEN
    RAISE EXCEPTION 'AUTH_LOGIN_ATTEMPT_EMAIL_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_tenant_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'AUTH_LOGIN_ATTEMPT_TENANT_INVALID' USING ERRCODE = '23503';
  END IF;
  BEGIN
    v_ip := NULLIF(btrim(COALESCE(p_ip_address, '')), '')::inet;
  EXCEPTION WHEN invalid_text_representation THEN
    v_ip := NULL;
  END;

  INSERT INTO public.auth_login_attempts (
    tenant_id, user_email, ip_address, user_agent, success, estado,
    failed_reason, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_email, v_ip, left(NULLIF(btrim(COALESCE(p_user_agent, '')), ''), 2048),
    COALESCE(p_success, false), CASE WHEN COALESCE(p_success, false) THEN 'EXITOSO' ELSE 'FALLIDO' END,
    left(NULLIF(btrim(COALESCE(p_failed_reason, '')), ''), 1000), now(), now()
  ) RETURNING id INTO v_attempt_id;

  RETURN v_attempt_id;
END;
$function$;

-- PostgREST expone el esquema public en este runtime; el writer histórico vive
-- en app. Este wrapper evita que el backend crea que incrementó el bloqueo
-- cuando en realidad llamó una firma no expuesta.
CREATE OR REPLACE FUNCTION public.increment_failed_login_attempts(
  p_user_id uuid,
  p_max_attempts integer DEFAULT 5,
  p_lock_minutes integer DEFAULT 15
)
RETURNS TABLE (failed_login_attempts integer, locked_until timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT * FROM app.increment_failed_login_attempts(p_user_id, p_max_attempts, p_lock_minutes);
$function$;

CREATE OR REPLACE FUNCTION public.crear_sesion_login_auth_tx(
  p_usuario_id uuid,
  p_session_token text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_user public.usuarios_sistema;
  v_session public.user_sessions;
BEGIN
  IF NULLIF(btrim(COALESCE(p_session_token, '')), '') IS NULL
     OR p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'AUTH_SESSION_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_user
  FROM public.usuarios_sistema u
  WHERE u.id = p_usuario_id
  FOR UPDATE;
  IF NOT FOUND
     OR NOT COALESCE(v_user.activo, false)
     OR lower(v_user.estado::text) <> 'activo' THEN
    RAISE EXCEPTION 'AUTH_USER_INACTIVE_OR_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.empresa_config ec
    WHERE ec.tenant_id = v_user.tenant_id
      AND (
        lower(COALESCE(ec.estado::text, 'activo')) = 'activo'
        OR (
          lower(ec.estado::text) = 'prueba'
          AND COALESCE(ec.is_demo, false)
          AND ec.demo_expires_at > now()
        )
      )
  ) THEN
    RAISE EXCEPTION 'AUTH_TENANT_INACTIVE_OR_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  UPDATE public.usuarios_sistema SET
    failed_login_attempts = 0,
    locked_until = NULL,
    fecha_ultimo_acceso = now(),
    updated_at = now()
  WHERE id = p_usuario_id;

  INSERT INTO public.user_sessions (
    tenant_id, usuario_sistema_id, session_token, estado,
    expires_at, last_activity, created_at, updated_at
  ) VALUES (
    v_user.tenant_id, p_usuario_id, btrim(p_session_token), 'ACTIVO',
    p_expires_at, now(), now(), now()
  )
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'session_token', v_session.session_token,
    'usuario_id', p_usuario_id,
    'tenant_id', v_user.tenant_id,
    'expires_at', v_session.expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tocar_sesion_auth_tx(p_session_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_updated integer;
BEGIN
  IF NULLIF(btrim(COALESCE(p_session_token, '')), '') IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.user_sessions
  SET last_activity = now(), updated_at = now()
  WHERE session_token = btrim(p_session_token)
    AND revoked_at IS NULL
    AND upper(COALESCE(estado::text, 'ACTIVO')) = 'ACTIVO'
    AND expires_at > now();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revocar_sesion_auth_tx(
  p_session_token text,
  p_usuario_id uuid,
  p_reason text DEFAULT 'LOGOUT'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_updated integer;
BEGIN
  IF NULLIF(btrim(COALESCE(p_session_token, '')), '') IS NULL OR p_usuario_id IS NULL THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM public.usuarios_sistema u WHERE u.id = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.user_sessions SET
    estado = 'REVOCADA',
    revoked_at = COALESCE(revoked_at, now()),
    revocation_reason = COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), revocation_reason, 'LOGOUT'),
    updated_at = now()
  WHERE session_token = btrim(p_session_token)
    AND usuario_sistema_id = p_usuario_id
    AND revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revocar_sesiones_usuario_auth_tx(
  p_usuario_id uuid,
  p_reason text DEFAULT 'LOGOUT_ALL'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_user public.usuarios_sistema;
  v_updated integer;
BEGIN
  SELECT * INTO v_user FROM public.usuarios_sistema u WHERE u.id = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_USER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.user_sessions SET
    estado = 'REVOCADA',
    revoked_at = COALESCE(revoked_at, now()),
    revocation_reason = COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), revocation_reason, 'LOGOUT_ALL'),
    updated_at = now()
  WHERE usuario_sistema_id = p_usuario_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object(
    'usuario_id', p_usuario_id,
    'tenant_id', v_user.tenant_id,
    'sessions_revoked', v_updated
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_solicitud_reset_auth_tx(
  p_usuario_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_user public.usuarios_sistema;
BEGIN
  IF NULLIF(btrim(COALESCE(p_token_hash, '')), '') IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'AUTH_RESET_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_user FROM public.usuarios_sistema u WHERE u.id = p_usuario_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(v_user.activo, false) THEN
    RAISE EXCEPTION 'AUTH_RESET_USER_INACTIVE_OR_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  UPDATE public.usuarios_sistema SET password_reset_token = p_token_hash,
    password_reset_expires = p_expires_at, updated_at = now()
  WHERE id = p_usuario_id;
  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id, old_values, new_values, metadata
  ) VALUES (
    v_user.tenant_id, p_usuario_id, 'usuarios_sistema', 'UPDATE', p_usuario_id::text,
    jsonb_build_object('reset_pending', v_user.password_reset_token IS NOT NULL),
    jsonb_build_object('reset_pending', true, 'expires_at', p_expires_at),
    jsonb_build_object('accion', 'SOLICITAR_RESET_PASSWORD', 'source', 'admin_rbac_462')
  );
  RETURN jsonb_build_object('usuario_id', p_usuario_id, 'expires_at', p_expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.consumir_reset_password_auth_tx(
  p_usuario_id uuid,
  p_expected_token_hash text,
  p_new_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_user public.usuarios_sistema;
  v_revoked integer;
BEGIN
  IF NULLIF(btrim(COALESCE(p_expected_token_hash, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_new_password_hash, '')), '') IS NULL THEN
    RAISE EXCEPTION 'AUTH_RESET_CONSUME_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_user FROM public.usuarios_sistema u WHERE u.id = p_usuario_id FOR UPDATE;
  IF NOT FOUND OR v_user.password_reset_token IS DISTINCT FROM p_expected_token_hash
     OR v_user.password_reset_expires IS NULL OR v_user.password_reset_expires <= now() THEN
    RAISE EXCEPTION 'AUTH_RESET_TOKEN_INVALID_OR_CONSUMED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.usuarios_sistema SET
    password_hash = p_new_password_hash,
    password_reset_token = NULL, password_reset_expires = NULL,
    failed_login_attempts = 0, locked_until = NULL, updated_at = now()
  WHERE id = p_usuario_id;
  UPDATE public.user_sessions SET
    estado = 'REVOCADA', revoked_at = COALESCE(revoked_at, now()),
    revocation_reason = COALESCE(revocation_reason, 'PASSWORD_RESET'), updated_at = now()
  WHERE usuario_sistema_id = p_usuario_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_revoked = ROW_COUNT;
  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id, old_values, new_values, metadata
  ) VALUES (
    v_user.tenant_id, p_usuario_id, 'usuarios_sistema', 'UPDATE', p_usuario_id::text,
    jsonb_build_object('reset_pending', true), jsonb_build_object('reset_pending', false),
    jsonb_build_object('accion', 'CONSUMIR_RESET_PASSWORD', 'source', 'admin_rbac_462', 'sessions_revoked', v_revoked)
  );
  RETURN jsonb_build_object('usuario_id', p_usuario_id, 'sessions_revoked', v_revoked);
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_credencial_demo_usuario_rbac_tx(
  p_usuario_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_password_hash text,
  p_perfil jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old public.usuarios_sistema;
  v_new public.usuarios_sistema;
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  IF NULLIF(btrim(COALESCE(p_password_hash, '')), '') IS NULL THEN
    RAISE EXCEPTION 'ADMIN_DEMO_PASSWORD_HASH_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_old FROM public.usuarios_sistema u
  WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_USER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.usuarios_sistema u SET
    password_hash = p_password_hash,
    nombre = CASE WHEN p_perfil ? 'nombre' THEN NULLIF(btrim(p_perfil->>'nombre'), '') ELSE u.nombre END,
    apellido = CASE WHEN p_perfil ? 'apellido' THEN NULLIF(btrim(p_perfil->>'apellido'), '') ELSE u.apellido END,
    estado = 'ACTIVO', activo = true,
    is_demo_user = true,
    demo_email_temp = u.email,
    updated_by = p_actor_id, updated_at = now()
  WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id RETURNING * INTO v_new;
  UPDATE public.user_sessions SET
    estado = 'REVOCADA', revoked_at = COALESCE(revoked_at, now()),
    revocation_reason = COALESCE(revocation_reason, 'DEMO_CREDENTIAL_ROTATION'), updated_at = now()
  WHERE usuario_sistema_id = p_usuario_id AND tenant_id = p_tenant_id AND revoked_at IS NULL;
  PERFORM app.audit_admin_462(
    p_tenant_id, p_actor_id, 'usuarios_sistema', 'UPDATE', p_usuario_id,
    jsonb_build_object('is_demo_user', v_old.is_demo_user, 'estado', v_old.estado),
    jsonb_build_object('is_demo_user', true, 'estado', v_new.estado),
    'ROTAR_CREDENCIAL_DEMO'
  );
  RETURN app.safe_user_462(p_usuario_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.desmarcar_usuarios_demo_rbac_tx(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_user record;
  v_count integer := 0;
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  FOR v_user IN
    SELECT u.id, u.is_demo_user, u.demo_email_temp FROM public.usuarios_sistema u
    WHERE u.tenant_id = p_tenant_id AND COALESCE(u.is_demo_user, false)
    ORDER BY u.id FOR UPDATE
  LOOP
    UPDATE public.usuarios_sistema SET
      is_demo_user = false, demo_email_temp = NULL,
      updated_by = p_actor_id, updated_at = now()
    WHERE id = v_user.id AND tenant_id = p_tenant_id;
    PERFORM app.audit_admin_462(
      p_tenant_id, p_actor_id, 'usuarios_sistema', 'UPDATE', v_user.id,
      jsonb_build_object('is_demo_user', v_user.is_demo_user, 'demo_email_temp', v_user.demo_email_temp),
      jsonb_build_object('is_demo_user', false, 'demo_email_temp', NULL),
      'DESMARCAR_USUARIO_DEMO'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('tenant_id', p_tenant_id, 'usuarios_actualizados', v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_rol_rbac_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_rol jsonb,
  p_permission_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_name text := NULLIF(upper(btrim(COALESCE(p_rol->>'nombre', ''))), '');
  v_permissions uuid[];
  v_fingerprint text;
  v_existing public.roles;
  v_created public.roles;
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  IF v_key IS NULL OR v_name IS NULL THEN RAISE EXCEPTION 'ADMIN_ROLE_REQUIRED_FIELDS' USING ERRCODE = '22023'; END IF;
  v_permissions := app.assert_permissions_462(p_tenant_id, p_permission_ids);
  v_fingerprint := app.admin_fingerprint_462(jsonb_build_object(
    'tenant_id', p_tenant_id, 'nombre', v_name,
    'descripcion', NULLIF(btrim(COALESCE(p_rol->>'descripcion', '')), ''),
    'permission_ids', to_jsonb(v_permissions)
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':admin:role:' || v_name, 0));
  SELECT * INTO v_existing FROM public.roles r
  WHERE r.tenant_id = p_tenant_id AND lower(r.nombre) = lower(v_name) FOR UPDATE;
  IF FOUND THEN
    IF v_existing.creation_idempotency_key = v_key AND v_existing.creation_fingerprint = v_fingerprint THEN
      RETURN to_jsonb(v_existing) || jsonb_build_object('idempotent', true);
    END IF;
    RAISE EXCEPTION 'ADMIN_ROLE_NAME_OR_KEY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.roles (
    tenant_id, nombre, descripcion, is_system_role, activo,
    created_by, updated_by, creation_idempotency_key, creation_fingerprint
  ) VALUES (
    p_tenant_id, v_name, NULLIF(btrim(COALESCE(p_rol->>'descripcion', '')), ''), false, true,
    p_actor_id, p_actor_id, v_key, v_fingerprint
  ) RETURNING * INTO v_created;
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido, assigned_by)
  SELECT v_created.id, x, true, p_actor_id FROM unnest(v_permissions) x;
  PERFORM app.audit_admin_462(
    p_tenant_id, p_actor_id, 'roles', 'INSERT', v_created.id, NULL, to_jsonb(v_created),
    'CREAR_ROL', jsonb_build_object('permission_ids', to_jsonb(v_permissions), 'idempotency_key', v_key)
  );
  RETURN to_jsonb(v_created) || jsonb_build_object('permission_ids', to_jsonb(v_permissions), 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.asignar_permisos_rol_rbac_tx(
  p_rol_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_permission_ids uuid[],
  p_mode text DEFAULT 'REPLACE'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_role public.roles;
  v_ids uuid[];
  v_mode text := upper(btrim(COALESCE(p_mode, 'REPLACE')));
  v_old_ids uuid[];
  v_new_ids uuid[];
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  IF v_mode NOT IN ('ADD', 'REMOVE', 'REPLACE') THEN
    RAISE EXCEPTION 'ADMIN_PERMISSION_ASSIGN_MODE_INVALID' USING ERRCODE = '22023';
  END IF;
  v_ids := app.assert_permissions_462(p_tenant_id, p_permission_ids);
  SELECT * INTO v_role FROM public.roles r WHERE r.id = p_rol_id AND r.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_ROLE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_role.is_system_role THEN RAISE EXCEPTION 'ADMIN_SYSTEM_ROLE_IMMUTABLE' USING ERRCODE = '42501'; END IF;
  IF NOT COALESCE(v_role.activo, true) THEN RAISE EXCEPTION 'ADMIN_ROLE_INACTIVE' USING ERRCODE = '23514'; END IF;
  SELECT COALESCE(array_agg(rp.permiso_id ORDER BY rp.permiso_id), '{}'::uuid[]) INTO v_old_ids
  FROM public.rol_permisos rp WHERE rp.role_id = p_rol_id AND COALESCE(rp.concedido, true);
  IF v_mode = 'REPLACE' THEN
    DELETE FROM public.rol_permisos rp WHERE rp.role_id = p_rol_id;
    INSERT INTO public.rol_permisos (role_id, permiso_id, concedido, assigned_by)
    SELECT p_rol_id, x, true, p_actor_id FROM unnest(v_ids) x;
  ELSIF v_mode = 'ADD' THEN
    INSERT INTO public.rol_permisos (role_id, permiso_id, concedido, assigned_by)
    SELECT p_rol_id, x, true, p_actor_id FROM unnest(v_ids) x
    ON CONFLICT (role_id, permiso_id) DO UPDATE SET concedido = true, assigned_by = EXCLUDED.assigned_by;
  ELSE
    DELETE FROM public.rol_permisos rp WHERE rp.role_id = p_rol_id AND rp.permiso_id = ANY(v_ids);
  END IF;
  UPDATE public.roles SET updated_by = p_actor_id, updated_at = now() WHERE id = p_rol_id AND tenant_id = p_tenant_id;
  SELECT COALESCE(array_agg(rp.permiso_id ORDER BY rp.permiso_id), '{}'::uuid[]) INTO v_new_ids
  FROM public.rol_permisos rp WHERE rp.role_id = p_rol_id AND COALESCE(rp.concedido, true);
  PERFORM app.audit_admin_462(
    p_tenant_id, p_actor_id, 'rol_permisos', 'UPDATE', p_rol_id,
    jsonb_build_object('permission_ids', to_jsonb(v_old_ids)),
    jsonb_build_object('permission_ids', to_jsonb(v_new_ids)),
    'CAMBIAR_PERMISOS_ROL', jsonb_build_object('mode', v_mode)
  );
  RETURN to_jsonb(v_role) || jsonb_build_object('permission_ids', to_jsonb(v_new_ids));
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_rol_rbac_tx(
  p_rol_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cambios jsonb,
  p_permission_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old public.roles;
  v_new public.roles;
  v_name text;
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  SELECT * INTO v_old FROM public.roles r WHERE r.id = p_rol_id AND r.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_ROLE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_old.is_system_role THEN RAISE EXCEPTION 'ADMIN_SYSTEM_ROLE_IMMUTABLE' USING ERRCODE = '42501'; END IF;
  v_name := CASE WHEN p_cambios ? 'nombre' THEN NULLIF(upper(btrim(p_cambios->>'nombre')), '') ELSE v_old.nombre END;
  IF v_name IS NULL THEN RAISE EXCEPTION 'ADMIN_ROLE_NAME_REQUIRED' USING ERRCODE = '22023'; END IF;
  UPDATE public.roles r SET
    nombre = v_name,
    descripcion = CASE WHEN p_cambios ? 'descripcion' THEN NULLIF(btrim(p_cambios->>'descripcion'), '') ELSE r.descripcion END,
    updated_by = p_actor_id, updated_at = now()
  WHERE r.id = p_rol_id AND r.tenant_id = p_tenant_id RETURNING * INTO v_new;
  IF p_permission_ids IS NOT NULL THEN
    PERFORM public.asignar_permisos_rol_rbac_tx(p_rol_id, p_tenant_id, p_actor_id, p_permission_ids, 'REPLACE');
  END IF;
  PERFORM app.audit_admin_462(p_tenant_id, p_actor_id, 'roles', 'UPDATE', p_rol_id, to_jsonb(v_old), to_jsonb(v_new), 'ACTUALIZAR_ROL');
  RETURN to_jsonb(v_new);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'ADMIN_ROLE_NAME_CONFLICT' USING ERRCODE = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.desactivar_rol_rbac_tx(
  p_rol_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old public.roles;
  v_new public.roles;
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  SELECT * INTO v_old FROM public.roles r WHERE r.id = p_rol_id AND r.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_ROLE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_old.is_system_role THEN RAISE EXCEPTION 'ADMIN_SYSTEM_ROLE_IMMUTABLE' USING ERRCODE = '42501'; END IF;
  IF NOT COALESCE(v_old.activo, true) THEN RETURN to_jsonb(v_old) || jsonb_build_object('idempotent', true); END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.usuarios_sistema u ON u.id = ur.usuario_sistema_id AND u.tenant_id = p_tenant_id
    WHERE ur.role_id = p_rol_id AND ur.tenant_id = p_tenant_id
      AND COALESCE(u.activo, false) AND NOT u.is_super_admin
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur2
        JOIN public.roles r2 ON r2.id = ur2.role_id AND r2.tenant_id = p_tenant_id AND COALESCE(r2.activo, true)
        WHERE ur2.usuario_sistema_id = u.id AND ur2.tenant_id = p_tenant_id AND ur2.role_id <> p_rol_id
      )
  ) THEN
    RAISE EXCEPTION 'ADMIN_ROLE_IS_LAST_ACTIVE_ASSIGNMENT' USING ERRCODE = '23514';
  END IF;
  UPDATE public.roles SET activo = false, updated_by = p_actor_id, updated_at = now()
  WHERE id = p_rol_id AND tenant_id = p_tenant_id RETURNING * INTO v_new;
  PERFORM app.audit_admin_462(p_tenant_id, p_actor_id, 'roles', 'UPDATE', p_rol_id, to_jsonb(v_old), to_jsonb(v_new), 'DESACTIVAR_ROL');
  RETURN to_jsonb(v_new) || jsonb_build_object('idempotent', false);
END;
$function$;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.usuarios_sistema, public.roles, public.permisos, public.user_roles, public.rol_permisos,
  public.user_sessions, public.auth_login_attempts
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.usuarios_sistema, public.roles, public.permisos, public.user_roles, public.rol_permisos,
  public.user_sessions, public.auth_login_attempts
TO service_role;

REVOKE ALL ON FUNCTION
  app.admin_fingerprint_462(jsonb), app.assert_admin_actor_462(uuid, uuid),
  app.audit_admin_462(uuid, uuid, text, text, uuid, jsonb, jsonb, text, jsonb),
  app.normalized_uuid_array_462(uuid[]), app.assert_roles_462(uuid, uuid[], boolean),
  app.assert_permissions_462(uuid, uuid[]), app.safe_user_462(uuid),
  public.crear_usuario_rbac_tx(uuid, uuid, text, jsonb, uuid[]),
  public.crear_primer_admin_tenant_tx(uuid, text, jsonb, uuid),
  public.asignar_roles_usuario_rbac_tx(uuid, uuid, uuid, uuid[], text),
  public.actualizar_usuario_rbac_tx(uuid, uuid, uuid, jsonb, uuid[]),
  public.cambiar_estado_usuario_rbac_tx(uuid, uuid, uuid, text),
  public.registrar_reset_usuario_rbac_tx(uuid, uuid, uuid, text, timestamptz),
  public.registrar_login_exitoso_auth_tx(uuid),
  public.registrar_intento_login_auth_tx(text, text, text, boolean, text, uuid),
  public.increment_failed_login_attempts(uuid, integer, integer),
  public.crear_sesion_login_auth_tx(uuid, text, timestamptz),
  public.tocar_sesion_auth_tx(text),
  public.revocar_sesion_auth_tx(text, uuid, text),
  public.revocar_sesiones_usuario_auth_tx(uuid, text),
  public.registrar_solicitud_reset_auth_tx(uuid, text, timestamptz),
  public.consumir_reset_password_auth_tx(uuid, text, text),
  public.actualizar_credencial_demo_usuario_rbac_tx(uuid, uuid, uuid, text, jsonb),
  public.desmarcar_usuarios_demo_rbac_tx(uuid, uuid),
  public.crear_rol_rbac_tx(uuid, uuid, text, jsonb, uuid[]),
  public.asignar_permisos_rol_rbac_tx(uuid, uuid, uuid, uuid[], text),
  public.actualizar_rol_rbac_tx(uuid, uuid, uuid, jsonb, uuid[]),
  public.desactivar_rol_rbac_tx(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.revoke_user_session(text, text),
  public.cleanup_expired_user_sessions(integer)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.crear_usuario_rbac_tx(uuid, uuid, text, jsonb, uuid[]),
  public.crear_primer_admin_tenant_tx(uuid, text, jsonb, uuid),
  public.asignar_roles_usuario_rbac_tx(uuid, uuid, uuid, uuid[], text),
  public.actualizar_usuario_rbac_tx(uuid, uuid, uuid, jsonb, uuid[]),
  public.cambiar_estado_usuario_rbac_tx(uuid, uuid, uuid, text),
  public.registrar_reset_usuario_rbac_tx(uuid, uuid, uuid, text, timestamptz),
  public.registrar_login_exitoso_auth_tx(uuid),
  public.registrar_intento_login_auth_tx(text, text, text, boolean, text, uuid),
  public.increment_failed_login_attempts(uuid, integer, integer),
  public.crear_sesion_login_auth_tx(uuid, text, timestamptz),
  public.tocar_sesion_auth_tx(text),
  public.revocar_sesion_auth_tx(text, uuid, text),
  public.revocar_sesiones_usuario_auth_tx(uuid, text),
  public.registrar_solicitud_reset_auth_tx(uuid, text, timestamptz),
  public.consumir_reset_password_auth_tx(uuid, text, text),
  public.actualizar_credencial_demo_usuario_rbac_tx(uuid, uuid, uuid, text, jsonb),
  public.desmarcar_usuarios_demo_rbac_tx(uuid, uuid),
  public.crear_rol_rbac_tx(uuid, uuid, text, jsonb, uuid[]),
  public.asignar_permisos_rol_rbac_tx(uuid, uuid, uuid, uuid[], text),
  public.actualizar_rol_rbac_tx(uuid, uuid, uuid, jsonb, uuid[]),
  public.desactivar_rol_rbac_tx(uuid, uuid, uuid)
TO service_role;

GRANT EXECUTE ON FUNCTION
  public.revoke_user_session(text, text),
  public.cleanup_expired_user_sessions(integer)
TO service_role;

COMMIT;
