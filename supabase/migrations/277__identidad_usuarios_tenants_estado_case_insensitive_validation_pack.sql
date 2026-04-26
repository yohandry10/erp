-- ============================================================================
-- 277__identidad_usuarios_tenants_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en identidad.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_identidad_usuarios_tenants_estado_case_insensitive_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, app, pg_temp
AS $$
DECLARE
  v_count bigint;
  v_delta bigint;
BEGIN
  RETURN QUERY
  SELECT
    'citext_extension_present'::text,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext'),
    'extension citext instalada'::text;

  RETURN QUERY
  WITH expected(table_name, column_name, detail_msg) AS (
    VALUES
      ('tenants', 'estado', 'tenants.estado usa citext'),
      ('usuarios_sistema', 'estado', 'usuarios_sistema.estado usa citext'),
      ('usuarios', 'estado', 'usuarios.estado usa citext'),
      ('usuarios_sistemas', 'estado', 'usuarios_sistemas.estado usa citext'),
      ('users', 'estado', 'users.estado usa citext')
  )
  SELECT
    format('%s_%s_type_citext', e.table_name, e.column_name)::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = e.table_name
        AND c.column_name = e.column_name
        AND c.udt_name = 'citext'
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(function_name, detail_msg) AS (
    VALUES
      ('normalize_identity_estado_275', 'helper identidad estado'),
      ('normalize_tenants_estado_activo', 'normalizador tenants'),
      ('normalize_usuarios_alias_estado_activo', 'normalizador usuarios alias/canonico'),
      ('normalize_users_like_estado_activo_275', 'normalizador legacy users')
  )
  SELECT
    format('helper_%s_exists', e.function_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = e.function_name
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name, trigger_name, detail_msg) AS (
    VALUES
      ('tenants', 'trg_normalize_tenants_estado_activo', 'normalizacion tenants'),
      ('usuarios', 'trg_normalize_usuarios_estado_activo', 'normalizacion usuarios'),
      ('usuarios_sistema', 'trg_normalize_usuarios_sistema_estado_activo', 'normalizacion usuarios_sistema'),
      ('usuarios_sistemas', 'trg_normalize_usuarios_sistemas_estado_activo_275', 'normalizacion usuarios_sistemas'),
      ('users', 'trg_normalize_users_estado_activo_275', 'normalizacion users'),
      ('usuarios_sistema', 'trg_sync_usuarios_from_usuarios_sistema', 'sync canónico -> alias'),
      ('usuarios', 'trg_sync_usuarios_sistema_from_usuarios', 'sync alias -> canónico'),
      ('usuarios_sistema', 'trg_sync_usuarios_sistemas_from_usuarios_sistema', 'sync canónico -> legacy usuarios_sistemas')
  )
  SELECT
    format('trigger_%s_exists', e.trigger_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND t.tgname = e.trigger_name
        AND NOT t.tgisinternal
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(relname, conname, detail_msg) AS (
    VALUES
      ('tenants', 'ck_tenants_estado_upper_nonempty', 'tenants estado nonempty'),
      ('tenants', 'ck_tenants_estado_activo_consistency', 'tenants estado/activo consistency'),
      ('usuarios', 'ck_usuarios_estado_upper_nonempty', 'usuarios estado nonempty'),
      ('usuarios', 'ck_usuarios_estado_activo_consistency', 'usuarios estado/activo consistency'),
      ('usuarios_sistema', 'ck_usuarios_sistema_estado_upper_nonempty', 'usuarios_sistema estado nonempty'),
      ('usuarios_sistema', 'ck_usuarios_sistema_estado_activo_consistency', 'usuarios_sistema estado/activo consistency'),
      ('usuarios_sistemas', 'ck_usuarios_sistemas_estado_nonempty_276', 'usuarios_sistemas estado nonempty'),
      ('usuarios_sistemas', 'ck_usuarios_sistemas_estado_activo_consistency_276', 'usuarios_sistemas estado/activo consistency'),
      ('users', 'ck_users_estado_nonempty_276', 'users estado nonempty'),
      ('users', 'ck_users_estado_activo_consistency_276', 'users estado/activo consistency')
  )
  SELECT
    format('constraint_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = e.relname
        AND c.conname = e.conname
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(tablename, indexname, detail_msg) AS (
    VALUES
      ('tenants', 'idx_tenants_estado_ci_runtime_275', 'indice CI tenants'),
      ('usuarios_sistema', 'idx_usuarios_sistema_tenant_estado_ci_runtime_275', 'indice CI usuarios_sistema'),
      ('usuarios', 'idx_usuarios_tenant_estado_ci_runtime_275', 'indice CI usuarios'),
      ('usuarios_sistemas', 'idx_usuarios_sistemas_tenant_estado_ci_runtime_275', 'indice CI usuarios_sistemas'),
      ('users', 'idx_users_tenant_estado_ci_runtime_275', 'indice CI users')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('tenants'),
      ('usuarios_sistema'),
      ('usuarios'),
      ('usuarios_sistemas'),
      ('users')
  )
  SELECT
    format('rls_%s_enabled_forced', e.table_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.tenants t WHERE t.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.tenants t WHERE t.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'tenants_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.usuarios_sistema us
       WHERE (p_tenant_id IS NULL OR us.tenant_id = p_tenant_id OR us.tenant_id IS NULL)
         AND us.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.usuarios_sistema us
       WHERE (p_tenant_id IS NULL OR us.tenant_id = p_tenant_id OR us.tenant_id IS NULL)
         AND us.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'usuarios_sistema_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.usuarios u
       WHERE (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id OR u.tenant_id IS NULL)
         AND u.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.usuarios u
       WHERE (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id OR u.tenant_id IS NULL)
         AND u.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'usuarios_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.usuarios_sistemas ul
       WHERE (p_tenant_id IS NULL OR ul.tenant_id = p_tenant_id OR ul.tenant_id IS NULL)
         AND ul.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.usuarios_sistemas ul
       WHERE (p_tenant_id IS NULL OR ul.tenant_id = p_tenant_id OR ul.tenant_id IS NULL)
         AND ul.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'usuarios_sistemas_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.users u
       WHERE (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id OR u.tenant_id IS NULL)
         AND u.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.users u
       WHERE (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id OR u.tenant_id IS NULL)
         AND u.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'users_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.tenants t
  WHERE btrim(COALESCE(t.estado::text, '')) = '';
  RETURN QUERY SELECT 'tenants_invalid_estado_blank_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios_sistema us
  WHERE (p_tenant_id IS NULL OR us.tenant_id = p_tenant_id OR us.tenant_id IS NULL)
    AND btrim(COALESCE(us.estado::text, '')) = '';
  RETURN QUERY SELECT 'usuarios_sistema_invalid_estado_blank_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios u
  WHERE (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id OR u.tenant_id IS NULL)
    AND btrim(COALESCE(u.estado::text, '')) = '';
  RETURN QUERY SELECT 'usuarios_invalid_estado_blank_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios_sistemas ul
  WHERE (p_tenant_id IS NULL OR ul.tenant_id = p_tenant_id OR ul.tenant_id IS NULL)
    AND btrim(COALESCE(ul.estado::text, '')) = '';
  RETURN QUERY SELECT 'usuarios_sistemas_invalid_estado_blank_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.users u
  WHERE (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id OR u.tenant_id IS NULL)
    AND btrim(COALESCE(u.estado::text, '')) = '';
  RETURN QUERY SELECT 'users_invalid_estado_blank_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.tenants t
  WHERE COALESCE(t.activo, false) <> (lower(COALESCE(t.estado::text, '')) = 'activo');
  RETURN QUERY SELECT 'tenants_estado_activo_consistency'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios_sistema us
  WHERE (p_tenant_id IS NULL OR us.tenant_id = p_tenant_id OR us.tenant_id IS NULL)
    AND COALESCE(us.activo, false) <> (lower(COALESCE(us.estado::text, '')) = 'activo');
  RETURN QUERY SELECT 'usuarios_sistema_estado_activo_consistency'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios u
  WHERE (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id OR u.tenant_id IS NULL)
    AND COALESCE(u.activo, false) <> (lower(COALESCE(u.estado::text, '')) = 'activo');
  RETURN QUERY SELECT 'usuarios_estado_activo_consistency'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios_sistemas ul
  WHERE (p_tenant_id IS NULL OR ul.tenant_id = p_tenant_id OR ul.tenant_id IS NULL)
    AND COALESCE(ul.activo, false) <> (lower(COALESCE(ul.estado::text, '')) = 'activo');
  RETURN QUERY SELECT 'usuarios_sistemas_estado_activo_consistency'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.users u
  WHERE (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id OR u.tenant_id IS NULL)
    AND COALESCE(u.activo, false) <> (lower(COALESCE(u.estado::text, '')) = 'activo');
  RETURN QUERY SELECT 'users_estado_activo_consistency'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios_sistema us
  LEFT JOIN public.usuarios u
    ON u.id = us.id
  WHERE u.id IS NULL
    AND (p_tenant_id IS NULL OR us.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'missing_alias_rows_from_canonical'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.usuarios u
  LEFT JOIN public.usuarios_sistema us
    ON us.id = u.id
  WHERE us.id IS NULL
    AND (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'missing_canonical_rows_from_alias'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_identidad_usuarios_tenants_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_identidad_usuarios_tenants_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
