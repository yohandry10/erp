-- ============================================================================
-- 118__core_aux_tables_validation_pack.sql
-- Pack de validación runtime para tablas auxiliares críticas.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_core_aux_tables_runtime(
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
  v_count bigint;
BEGIN
  -- Triggers
  RETURN QUERY
  SELECT
    'trigger_normalize_fe_configuracion_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'fe_configuracion'
        AND t.tgname = 'trg_normalize_fe_configuracion_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de fe_configuracion';

  RETURN QUERY
  SELECT
    'trigger_normalize_asientos_contables_rrhh_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'asientos_contables_rrhh'
        AND t.tgname = 'trg_normalize_asientos_contables_rrhh_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de asientos RRHH';

  RETURN QUERY
  SELECT
    'trigger_normalize_feriados_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'feriados'
        AND t.tgname = 'trg_normalize_feriados_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de feriados';

  RETURN QUERY
  SELECT
    'trigger_normalize_profiles_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'profiles'
        AND t.tgname = 'trg_normalize_profiles_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de profiles';

  -- Columnas runtime mínimas
  RETURN QUERY
  SELECT
    'fe_configuracion_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 6
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'fe_configuracion'
        AND c.column_name IN (
          'ruc',
          'razon_social',
          'direccion_fiscal',
          'ambiente',
          'email_contacto',
          'activo'
        )
    ),
    'columnas runtime de configuración FE';

  RETURN QUERY
  SELECT
    'asientos_contables_rrhh_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 6
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'asientos_contables_rrhh'
        AND c.column_name IN (
          'planilla_id',
          'cuenta',
          'descripcion',
          'debe',
          'haber',
          'fecha'
        )
    ),
    'columnas runtime para asientos RRHH';

  RETURN QUERY
  SELECT
    'feriados_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 6
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'feriados'
        AND c.column_name IN (
          'fecha',
          'pais',
          'descripcion',
          'es_nacional',
          'recurrente_anual',
          'activo'
        )
    ),
    'columnas runtime para feriados';

  RETURN QUERY
  SELECT
    'profiles_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 6
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'profiles'
        AND c.column_name IN (
          'user_id',
          'email',
          'full_name',
          'avatar_url',
          'last_sign_in_at',
          'activo'
        )
    ),
    'columnas runtime para profiles';

  -- Índices/constraints clave
  RETURN QUERY
  SELECT
    'ux_fe_configuracion_tenant_active_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'fe_configuracion'
        AND indexname = 'ux_fe_configuracion_tenant_active'
    ),
    'unicidad de configuración FE activa por tenant';

  RETURN QUERY
  SELECT
    'ux_feriados_scope_pais_fecha_active_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'feriados'
        AND indexname = 'ux_feriados_scope_pais_fecha_active'
    ),
    'unicidad de feriados activos por scope/país/fecha';

  RETURN QUERY
  SELECT
    'ux_profiles_tenant_user_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND indexname = 'ux_profiles_tenant_user'
    ),
    'unicidad de perfil por tenant+usuario';

  -- RLS
  RETURN QUERY
  SELECT
    'rls_fe_configuracion_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'fe_configuracion'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en fe_configuracion';

  RETURN QUERY
  SELECT
    'rls_asientos_contables_rrhh_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'asientos_contables_rrhh'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en asientos_contables_rrhh';

  RETURN QUERY
  SELECT
    'rls_feriados_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'feriados'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en feriados';

  RETURN QUERY
  SELECT
    'rls_profiles_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'profiles'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en profiles';

  -- Filas inválidas
  SELECT COUNT(*)
  INTO v_count
  FROM public.fe_configuracion fc
  WHERE (
      (fc.ruc IS NOT NULL AND fc.ruc !~ '^[0-9]{11}$')
      OR upper(COALESCE(fc.ambiente, 'BETA')) NOT IN ('BETA', 'PRODUCCION', 'HOMOLOGACION')
      OR (COALESCE(fc.activo, false) = true AND upper(COALESCE(fc.estado, '')) <> 'ACTIVO')
    )
    AND (p_tenant_id IS NULL OR fc.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'fe_configuracion_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.asientos_contables_rrhh ar
  WHERE (
      ar.cuenta IS NULL OR btrim(ar.cuenta) = ''
      OR ar.fecha IS NULL
      OR COALESCE(ar.debe, 0) < 0
      OR COALESCE(ar.haber, 0) < 0
    )
    AND (p_tenant_id IS NULL OR ar.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'asientos_contables_rrhh_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.feriados f
  WHERE (
      f.fecha IS NULL
      OR f.pais IS NULL
      OR f.pais !~ '^[A-Z]{2}$'
      OR (COALESCE(f.activo, false) = true AND upper(COALESCE(f.estado, '')) <> 'ACTIVO')
    )
    AND (p_tenant_id IS NULL OR f.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'feriados_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.profiles p
  WHERE (
      p.user_id IS NULL
      OR (p.email IS NOT NULL AND p.email !~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')
      OR (COALESCE(p.activo, false) = true AND upper(COALESCE(p.estado, '')) <> 'ACTIVO')
    )
    AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'profiles_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  -- Duplicados operativos
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT fc.tenant_id
    FROM public.fe_configuracion fc
    WHERE fc.tenant_id IS NOT NULL
      AND COALESCE(fc.activo, true) = true
      AND (p_tenant_id IS NULL OR fc.tenant_id = p_tenant_id)
    GROUP BY fc.tenant_id
    HAVING COUNT(*) > 1
  ) dup;

  RETURN QUERY
  SELECT
    'fe_configuracion_duplicate_active_by_tenant'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      COALESCE(f.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_scope,
      upper(COALESCE(f.pais, 'PE')) AS pais_norm,
      f.fecha
    FROM public.feriados f
    WHERE f.fecha IS NOT NULL
      AND COALESCE(f.activo, true) = true
      AND (p_tenant_id IS NULL OR f.tenant_id = p_tenant_id)
    GROUP BY
      COALESCE(f.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
      upper(COALESCE(f.pais, 'PE')),
      f.fecha
    HAVING COUNT(*) > 1
  ) dup;

  RETURN QUERY
  SELECT
    'feriados_duplicate_active_scope'::text,
    (v_count = 0),
    format('groups=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_core_aux_tables_runtime_status_actual AS
SELECT *
FROM public.validar_core_aux_tables_runtime(app.resolve_request_tenant_id());

COMMIT;
