-- ============================================================================
-- 283__fiscal_retenciones_proveedores_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en
-- fiscal/retenciones/proveedores.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_fiscal_retenciones_proveedores_estado_case_insensitive_runtime(
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
  WITH expected(table_name, detail_msg) AS (
    VALUES
      ('configuracion_fiscal', 'configuracion_fiscal.estado usa citext'),
      ('configuracion_retenciones', 'configuracion_retenciones.estado usa citext'),
      ('proveedores', 'proveedores.estado usa citext'),
      ('proveedores_cuarta_categoria', 'proveedores_cuarta_categoria.estado usa citext'),
      ('libro_retenciones', 'libro_retenciones.estado usa citext')
  )
  SELECT
    format('%s_estado_type_citext', e.table_name)::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = e.table_name
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  SELECT
    'helper_normalize_fiscal_retenciones_proveedores_estado_281_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_fiscal_retenciones_proveedores_estado_281'
    ),
    'helper canonico de normalizacion de estado'::text;

  RETURN QUERY
  WITH expected(table_name, trigger_name, detail_msg) AS (
    VALUES
      ('configuracion_fiscal', 'trg_normalize_configuracion_fiscal_row', 'normalizacion configuracion_fiscal'),
      ('configuracion_retenciones', 'trg_normalize_configuracion_retenciones_row', 'normalizacion configuracion_retenciones'),
      ('proveedores', 'trg_normalize_proveedores_documentos_row', 'normalizacion proveedores'),
      ('proveedores_cuarta_categoria', 'trg_normalize_proveedores_cuarta_categoria_row', 'normalizacion proveedores_cuarta_categoria'),
      ('libro_retenciones', 'trg_normalize_libro_retenciones_row', 'normalizacion libro_retenciones'),
      ('libro_retenciones', 'trg_enforce_tenant_libro_retenciones', 'consistencia tenant libro_retenciones'),
      ('proveedores_cuarta_categoria', 'trg_enforce_tenant_proveedores_cuarta_categoria', 'consistencia tenant proveedores_cuarta_categoria')
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
      ('configuracion_fiscal', 'ck_configuracion_fiscal_estado_valid', 'dominio estado configuracion_fiscal'),
      ('configuracion_fiscal', 'ck_configuracion_fiscal_estado_activo_sync_281', 'consistencia estado/activo configuracion_fiscal'),
      ('configuracion_retenciones', 'ck_configuracion_retenciones_estado_valid', 'dominio estado configuracion_retenciones'),
      ('configuracion_retenciones', 'ck_configuracion_retenciones_estado_activo_sync_281', 'consistencia estado/activo configuracion_retenciones'),
      ('proveedores', 'ck_proveedores_estado_valid', 'dominio estado proveedores'),
      ('proveedores', 'ck_proveedores_estado_activo_sync_281', 'consistencia estado/activo proveedores'),
      ('proveedores_cuarta_categoria', 'ck_proveedores_cuarta_estado_valid', 'dominio estado proveedores_cuarta_categoria'),
      ('proveedores_cuarta_categoria', 'ck_proveedores_cuarta_estado_activo_sync_281', 'consistencia estado/activo proveedores_cuarta_categoria'),
      ('libro_retenciones', 'ck_libro_retenciones_estado_valid', 'dominio estado libro_retenciones')
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
      ('configuracion_fiscal', 'idx_configuracion_fiscal_tenant_estado_ci_runtime_281', 'indice CI configuracion_fiscal'),
      ('configuracion_retenciones', 'idx_configuracion_retenciones_tenant_estado_ci_runtime_281', 'indice CI configuracion_retenciones'),
      ('proveedores', 'idx_proveedores_tenant_estado_ci_runtime_281', 'indice CI proveedores'),
      ('proveedores_cuarta_categoria', 'idx_proveedores_cuarta_tenant_estado_ci_runtime_281', 'indice CI proveedores_cuarta_categoria'),
      ('libro_retenciones', 'idx_libro_retenciones_tenant_estado_ci_runtime_281', 'indice CI libro_retenciones'),
      ('configuracion_fiscal', 'ux_configuracion_fiscal_active_single_by_pais', 'unicidad activa configuracion_fiscal'),
      ('configuracion_retenciones', 'ux_configuracion_retenciones_tenant_categoria_activa', 'unicidad activa configuracion_retenciones'),
      ('proveedores', 'ux_proveedores_tenant_ruc_activo', 'unicidad activa proveedores'),
      ('proveedores_cuarta_categoria', 'ux_proveedores_cuarta_tenant_proveedor_activo', 'unicidad activa proveedores_cuarta_categoria'),
      ('libro_retenciones', 'ux_libro_retenciones_tenant_numero_correlativo', 'unicidad correlativo libro_retenciones')
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
      ('configuracion_fiscal'),
      ('configuracion_retenciones'),
      ('proveedores'),
      ('proveedores_cuarta_categoria'),
      ('libro_retenciones')
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
      (SELECT COUNT(*) FROM public.configuracion_fiscal cf
       WHERE (p_tenant_id IS NULL OR cf.tenant_id = p_tenant_id OR cf.tenant_id IS NULL)
         AND cf.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.configuracion_fiscal cf
       WHERE (p_tenant_id IS NULL OR cf.tenant_id = p_tenant_id OR cf.tenant_id IS NULL)
         AND cf.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'configuracion_fiscal_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.configuracion_retenciones cr
       WHERE (p_tenant_id IS NULL OR cr.tenant_id = p_tenant_id)
         AND cr.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.configuracion_retenciones cr
       WHERE (p_tenant_id IS NULL OR cr.tenant_id = p_tenant_id)
         AND cr.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'configuracion_retenciones_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.proveedores p
       WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
         AND p.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.proveedores p
       WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
         AND p.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'proveedores_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.proveedores_cuarta_categoria pc
       WHERE (p_tenant_id IS NULL OR pc.tenant_id = p_tenant_id)
         AND pc.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.proveedores_cuarta_categoria pc
       WHERE (p_tenant_id IS NULL OR pc.tenant_id = p_tenant_id)
         AND pc.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'proveedores_cuarta_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.libro_retenciones lr
       WHERE (p_tenant_id IS NULL OR lr.tenant_id = p_tenant_id)
         AND lr.estado = 'ANULADO')
    - (SELECT COUNT(*) FROM public.libro_retenciones lr
       WHERE (p_tenant_id IS NULL OR lr.tenant_id = p_tenant_id)
         AND lr.estado = 'anulado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'libro_retenciones_estado_case_insensitive_anulado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_fiscal cf
  WHERE (p_tenant_id IS NULL OR cf.tenant_id = p_tenant_id OR cf.tenant_id IS NULL)
    AND (cf.estado IS NULL OR lower(cf.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'configuracion_fiscal_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_retenciones cr
  WHERE (p_tenant_id IS NULL OR cr.tenant_id = p_tenant_id)
    AND (cr.estado IS NULL OR lower(cr.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'configuracion_retenciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.proveedores p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (p.estado IS NULL OR lower(p.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'proveedores_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.proveedores_cuarta_categoria pc
  WHERE (p_tenant_id IS NULL OR pc.tenant_id = p_tenant_id)
    AND (pc.estado IS NULL OR lower(pc.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY
  SELECT 'proveedores_cuarta_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.libro_retenciones lr
  WHERE (p_tenant_id IS NULL OR lr.tenant_id = p_tenant_id)
    AND (lr.estado IS NULL OR lower(lr.estado::text) NOT IN ('activo', 'anulado', 'pendiente', 'procesada'));
  RETURN QUERY
  SELECT 'libro_retenciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_fiscal cf
  WHERE (p_tenant_id IS NULL OR cf.tenant_id = p_tenant_id OR cf.tenant_id IS NULL)
    AND (
      cf.activo IS NULL
      OR (cf.activo = true AND lower(cf.estado::text) <> 'activo')
      OR (cf.activo = false AND lower(cf.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'configuracion_fiscal_estado_activo_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_retenciones cr
  WHERE (p_tenant_id IS NULL OR cr.tenant_id = p_tenant_id)
    AND (
      cr.activo IS NULL
      OR (cr.activo = true AND lower(cr.estado::text) <> 'activo')
      OR (cr.activo = false AND lower(cr.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'configuracion_retenciones_estado_activo_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.proveedores p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (
      p.activo IS NULL
      OR (p.activo = true AND lower(p.estado::text) <> 'activo')
      OR (p.activo = false AND lower(p.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'proveedores_estado_activo_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.proveedores_cuarta_categoria pc
  WHERE (p_tenant_id IS NULL OR pc.tenant_id = p_tenant_id)
    AND (
      pc.activo IS NULL
      OR (pc.activo = true AND lower(pc.estado::text) <> 'activo')
      OR (pc.activo = false AND lower(pc.estado::text) <> 'inactivo')
    );
  RETURN QUERY
  SELECT 'proveedores_cuarta_estado_activo_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      cf.pais_id,
      COUNT(*) AS c
    FROM public.configuracion_fiscal cf
    WHERE cf.pais_id IS NOT NULL
      AND lower(cf.estado::text) = 'activo'
      AND (
        p_tenant_id IS NULL
        OR cf.tenant_id = p_tenant_id
        OR cf.tenant_id IS NULL
      )
    GROUP BY cf.pais_id
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'configuracion_fiscal_duplicate_active_by_pais_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      cr.tenant_id,
      upper(cr.categoria) AS categoria_key,
      COUNT(*) AS c
    FROM public.configuracion_retenciones cr
    WHERE cr.tenant_id IS NOT NULL
      AND cr.categoria IS NOT NULL
      AND lower(cr.estado::text) = 'activo'
      AND (p_tenant_id IS NULL OR cr.tenant_id = p_tenant_id)
    GROUP BY cr.tenant_id, upper(cr.categoria)
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'configuracion_retenciones_duplicate_active_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      p.tenant_id,
      lower(btrim(p.ruc)) AS ruc_key,
      COUNT(*) AS c
    FROM public.proveedores p
    WHERE p.tenant_id IS NOT NULL
      AND NULLIF(btrim(COALESCE(p.ruc, '')), '') IS NOT NULL
      AND lower(p.estado::text) = 'activo'
      AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    GROUP BY p.tenant_id, lower(btrim(p.ruc))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'proveedores_duplicate_active_ruc_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      pc.tenant_id,
      pc.proveedor_id,
      COUNT(*) AS c
    FROM public.proveedores_cuarta_categoria pc
    WHERE pc.tenant_id IS NOT NULL
      AND pc.proveedor_id IS NOT NULL
      AND lower(pc.estado::text) = 'activo'
      AND (p_tenant_id IS NULL OR pc.tenant_id = p_tenant_id)
    GROUP BY pc.tenant_id, pc.proveedor_id
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'proveedores_cuarta_duplicate_active_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      lr.tenant_id,
      upper(btrim(lr.numero_correlativo)) AS correlativo_key,
      COUNT(*) AS c
    FROM public.libro_retenciones lr
    WHERE lr.tenant_id IS NOT NULL
      AND NULLIF(btrim(COALESCE(lr.numero_correlativo, '')), '') IS NOT NULL
      AND (p_tenant_id IS NULL OR lr.tenant_id = p_tenant_id)
    GROUP BY lr.tenant_id, upper(btrim(lr.numero_correlativo))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'libro_retenciones_duplicate_correlativo_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_fiscal_retenciones_proveedores_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_fiscal_retenciones_proveedores_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
