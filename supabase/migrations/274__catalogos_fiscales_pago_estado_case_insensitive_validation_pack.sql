-- ============================================================================
-- 274__catalogos_fiscales_pago_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en catalogos
-- fiscales/pago.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_catalogos_fiscales_pago_estado_case_insensitive_runtime(
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
      ('paises', 'estado', 'paises.estado usa citext'),
      ('metodos_pago', 'estado', 'metodos_pago.estado usa citext'),
      ('tipos_documentos_fiscales', 'estado', 'tipos_documentos_fiscales.estado usa citext'),
      ('tipos_impuestos', 'estado', 'tipos_impuestos.estado usa citext'),
      ('tipos_cambio', 'estado', 'tipos_cambio.estado usa citext')
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
  SELECT
    'helper_normalize_estado_activo_inactivo_272_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_estado_activo_inactivo_272'
    ),
    'helper de normalizacion de estado'::text;

  RETURN QUERY
  WITH expected(table_name, trigger_name, detail_msg) AS (
    VALUES
      ('paises', 'trg_normalize_paises_row_272', 'normalizacion paises'),
      ('metodos_pago', 'trg_normalize_metodos_pago_row_272', 'normalizacion metodos_pago'),
      ('tipos_cambio', 'trg_normalize_tipos_cambio_row_272', 'normalizacion tipos_cambio'),
      ('tipos_documentos_fiscales', 'trg_normalize_tipos_documentos_fiscales_row', 'normalizacion tipos_documentos_fiscales'),
      ('tipos_impuestos', 'trg_normalize_tipos_impuestos_row', 'normalizacion tipos_impuestos')
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
      ('paises', 'ck_paises_estado_runtime_272', 'constraint estado paises'),
      ('paises', 'ck_paises_estado_activo_sync_272', 'consistencia estado/activo paises'),
      ('metodos_pago', 'ck_metodos_pago_estado_runtime_272', 'constraint estado metodos_pago'),
      ('metodos_pago', 'ck_metodos_pago_estado_activo_sync_272', 'consistencia estado/activo metodos_pago'),
      ('tipos_documentos_fiscales', 'ck_tipos_documentos_fiscales_estado_runtime_272', 'constraint estado tipos_documentos_fiscales'),
      ('tipos_documentos_fiscales', 'ck_tipos_documentos_fiscales_estado_activo_sync_272', 'consistencia estado/activo tipos_documentos_fiscales'),
      ('tipos_impuestos', 'ck_tipos_impuestos_estado_runtime_272', 'constraint estado tipos_impuestos'),
      ('tipos_impuestos', 'ck_tipos_impuestos_estado_activo_sync_272', 'consistencia estado/activo tipos_impuestos'),
      ('tipos_cambio', 'ck_tipos_cambio_estado_runtime_272', 'constraint estado tipos_cambio'),
      ('tipos_cambio', 'ck_tipos_cambio_estado_activo_sync_272', 'consistencia estado/activo tipos_cambio')
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
      ('paises', 'idx_paises_estado_ci_runtime_272', 'indice CI paises'),
      ('metodos_pago', 'idx_metodos_pago_tenant_estado_ci_runtime_272', 'indice CI metodos_pago'),
      ('tipos_documentos_fiscales', 'idx_tipos_documentos_fiscales_tenant_pais_estado_ci_runtime_272', 'indice CI tipos_documentos_fiscales'),
      ('tipos_impuestos', 'idx_tipos_impuestos_tenant_pais_estado_ci_runtime_272', 'indice CI tipos_impuestos'),
      ('tipos_cambio', 'idx_tipos_cambio_tenant_estado_ci_runtime_272', 'indice CI tipos_cambio')
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
      ('metodos_pago'),
      ('tipos_documentos_fiscales'),
      ('tipos_impuestos'),
      ('tipos_cambio')
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
      (SELECT COUNT(*) FROM public.paises p WHERE p.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.paises p WHERE p.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'paises_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.metodos_pago mp
       WHERE (p_tenant_id IS NULL OR mp.tenant_id = p_tenant_id OR mp.tenant_id IS NULL)
         AND mp.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.metodos_pago mp
       WHERE (p_tenant_id IS NULL OR mp.tenant_id = p_tenant_id OR mp.tenant_id IS NULL)
         AND mp.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'metodos_pago_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.tipos_documentos_fiscales tdf
       WHERE (p_tenant_id IS NULL OR tdf.tenant_id = p_tenant_id OR tdf.tenant_id IS NULL)
         AND tdf.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.tipos_documentos_fiscales tdf
       WHERE (p_tenant_id IS NULL OR tdf.tenant_id = p_tenant_id OR tdf.tenant_id IS NULL)
         AND tdf.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'tipos_documentos_fiscales_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.tipos_impuestos ti
       WHERE (p_tenant_id IS NULL OR ti.tenant_id = p_tenant_id OR ti.tenant_id IS NULL)
         AND ti.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.tipos_impuestos ti
       WHERE (p_tenant_id IS NULL OR ti.tenant_id = p_tenant_id OR ti.tenant_id IS NULL)
         AND ti.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'tipos_impuestos_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.tipos_cambio tc
       WHERE (p_tenant_id IS NULL OR tc.tenant_id = p_tenant_id OR tc.tenant_id IS NULL)
         AND tc.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.tipos_cambio tc
       WHERE (p_tenant_id IS NULL OR tc.tenant_id = p_tenant_id OR tc.tenant_id IS NULL)
         AND tc.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'tipos_cambio_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.paises p
  WHERE p.estado IS NULL OR lower(p.estado::text) NOT IN ('activo', 'inactivo');
  RETURN QUERY
  SELECT 'paises_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.metodos_pago mp
  WHERE (p_tenant_id IS NULL OR mp.tenant_id = p_tenant_id OR mp.tenant_id IS NULL)
    AND (mp.estado IS NULL OR lower(mp.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'metodos_pago_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.tipos_documentos_fiscales tdf
  WHERE (p_tenant_id IS NULL OR tdf.tenant_id = p_tenant_id OR tdf.tenant_id IS NULL)
    AND (tdf.estado IS NULL OR lower(tdf.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'tipos_documentos_fiscales_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.tipos_impuestos ti
  WHERE (p_tenant_id IS NULL OR ti.tenant_id = p_tenant_id OR ti.tenant_id IS NULL)
    AND (ti.estado IS NULL OR lower(ti.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'tipos_impuestos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.tipos_cambio tc
  WHERE (p_tenant_id IS NULL OR tc.tenant_id = p_tenant_id OR tc.tenant_id IS NULL)
    AND (tc.estado IS NULL OR lower(tc.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'tipos_cambio_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.paises p
  WHERE p.activo IS NULL
     OR (p.activo = true AND lower(p.estado::text) <> 'activo')
     OR (p.activo = false AND lower(p.estado::text) <> 'inactivo');
  RETURN QUERY
  SELECT 'paises_estado_activo_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.metodos_pago mp
  WHERE (p_tenant_id IS NULL OR mp.tenant_id = p_tenant_id OR mp.tenant_id IS NULL)
    AND (
      mp.activo IS NULL
      OR (mp.activo = true AND lower(mp.estado::text) <> 'activo')
      OR (mp.activo = false AND lower(mp.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'metodos_pago_estado_activo_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.tipos_documentos_fiscales tdf
  WHERE (p_tenant_id IS NULL OR tdf.tenant_id = p_tenant_id OR tdf.tenant_id IS NULL)
    AND (
      tdf.activo IS NULL
      OR (tdf.activo = true AND lower(tdf.estado::text) <> 'activo')
      OR (tdf.activo = false AND lower(tdf.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'tipos_documentos_fiscales_estado_activo_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.tipos_impuestos ti
  WHERE (p_tenant_id IS NULL OR ti.tenant_id = p_tenant_id OR ti.tenant_id IS NULL)
    AND (
      ti.activo IS NULL
      OR (ti.activo = true AND lower(ti.estado::text) <> 'activo')
      OR (ti.activo = false AND lower(ti.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'tipos_impuestos_estado_activo_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.tipos_cambio tc
  WHERE (p_tenant_id IS NULL OR tc.tenant_id = p_tenant_id OR tc.tenant_id IS NULL)
    AND (
      tc.activo IS NULL
      OR (tc.activo = true AND lower(tc.estado::text) <> 'activo')
      OR (tc.activo = false AND lower(tc.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'tipos_cambio_estado_activo_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_catalogos_fiscales_pago_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_catalogos_fiscales_pago_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
