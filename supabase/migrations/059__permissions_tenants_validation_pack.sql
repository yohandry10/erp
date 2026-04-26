-- ============================================================================
-- 059__permissions_tenants_validation_pack.sql
-- Validaciones operativas para aliases de permisos y consistencia tenants.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_permissions_tenants_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id());
  v_count bigint;
  v_count_2 bigint;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN QUERY
    SELECT
      'tenant_context'::text,
      false,
      'No se pudo resolver tenant para validar permissions/tenants runtime';
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    'permissions_table_exists'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'permissions'
    ),
    'tabla legacy para nested selects de permisos';

  RETURN QUERY
  SELECT
    'role_permissions_table_exists'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'role_permissions'
    ),
    'tabla legacy para nested selects de relaciones rol-permiso';

  RETURN QUERY
  SELECT
    'trg_sync_permissions_from_permisos'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'permisos'
        AND t.tgname = 'trg_sync_permissions_from_permisos'
        AND NOT t.tgisinternal
    ),
    'trigger canónico -> legacy (permisos -> permissions)';

  RETURN QUERY
  SELECT
    'trg_sync_permisos_from_permissions'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'permissions'
        AND t.tgname = 'trg_sync_permisos_from_permissions'
        AND NOT t.tgisinternal
    ),
    'trigger legacy -> canónico (permissions -> permisos)';

  RETURN QUERY
  SELECT
    'trg_sync_role_permissions_from_rol_permisos'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rol_permisos'
        AND t.tgname = 'trg_sync_role_permissions_from_rol_permisos'
        AND NOT t.tgisinternal
    ),
    'trigger canónico -> legacy (rol_permisos -> role_permissions)';

  RETURN QUERY
  SELECT
    'trg_sync_rol_permisos_from_role_permissions'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'role_permissions'
        AND t.tgname = 'trg_sync_rol_permisos_from_role_permissions'
        AND NOT t.tgisinternal
    ),
    'trigger legacy -> canónico (role_permissions -> rol_permisos)';

  RETURN QUERY
  SELECT
    'trg_normalize_tenants_estado_activo'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'tenants'
        AND t.tgname = 'trg_normalize_tenants_estado_activo'
        AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenants.estado/activo';

  SELECT COUNT(*)
  INTO v_count
  FROM public.permisos p
  WHERE (p.tenant_id = v_tenant_id OR p.tenant_id IS NULL)
    AND NOT EXISTS (
      SELECT 1
      FROM public.permissions pl
      WHERE pl.id = p.id
    );

  SELECT COUNT(*)
  INTO v_count_2
  FROM public.permissions pl
  WHERE (pl.tenant_id = v_tenant_id OR pl.tenant_id IS NULL)
    AND NOT EXISTS (
      SELECT 1
      FROM public.permisos p
      WHERE p.id = pl.id
    );

  RETURN QUERY
  SELECT
    'permissions_sync_gap'::text,
    (v_count = 0 AND v_count_2 = 0),
    format('missing_legacy=%s missing_canonical=%s', v_count, v_count_2);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rol_permisos rp
  JOIN public.roles r
    ON r.id = rp.role_id
  WHERE r.tenant_id = v_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.role_permissions rpl
      WHERE rpl.id = rp.id
    );

  SELECT COUNT(*)
  INTO v_count_2
  FROM public.role_permissions rpl
  WHERE rpl.tenant_id = v_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.rol_permisos rp
      WHERE rp.id = rpl.id
    );

  RETURN QUERY
  SELECT
    'role_permissions_sync_gap'::text,
    (v_count = 0 AND v_count_2 = 0),
    format('missing_legacy=%s missing_canonical=%s', v_count, v_count_2);

  SELECT COUNT(*)
  INTO v_count
  FROM public.permisos p
  WHERE (p.tenant_id = v_tenant_id OR p.tenant_id IS NULL)
    AND (p.codigo IS NULL OR btrim(p.codigo) = '');

  SELECT COUNT(*)
  INTO v_count_2
  FROM public.permissions p
  WHERE (p.tenant_id = v_tenant_id OR p.tenant_id IS NULL)
    AND (p.codigo IS NULL OR btrim(p.codigo) = '');

  RETURN QUERY
  SELECT
    'permissions_codigo_population'::text,
    (v_count = 0 AND v_count_2 = 0),
    format('canonical_missing_codigo=%s legacy_missing_codigo=%s', v_count, v_count_2);

  SELECT COUNT(*)
  INTO v_count
  FROM public.tenants t
  WHERE COALESCE(t.activo, false)
        <> (upper(btrim(COALESCE(t.estado, ''))) = 'ACTIVO');

  RETURN QUERY
  SELECT
    'tenants_estado_activo_consistency'::text,
    (v_count = 0),
    format('inconsistent_rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_permissions_tenants_runtime_status_actual AS
SELECT *
FROM public.validar_permissions_tenants_runtime(app.resolve_request_tenant_id());

COMMIT;
