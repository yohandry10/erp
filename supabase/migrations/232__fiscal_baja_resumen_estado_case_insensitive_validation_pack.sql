-- ============================================================================
-- 232__fiscal_baja_resumen_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive del flujo fiscal RA/RC.
-- Tablas foco:
--   public.comunicaciones_baja
--   public.resumenes_diarios
--   public.detalle_comunicacion_baja
--   public.detalle_resumen_diario
--   public.validaciones_sunat
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_fiscal_baja_resumen_estado_case_insensitive_runtime(
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
  SELECT
    'comunicaciones_baja_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'comunicaciones_baja'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'comunicaciones_baja.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'resumenes_diarios_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'resumenes_diarios'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'resumenes_diarios.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'detalle_comunicacion_baja_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'detalle_comunicacion_baja'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'detalle_comunicacion_baja.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'detalle_resumen_diario_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'detalle_resumen_diario'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'detalle_resumen_diario.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'validaciones_sunat_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'validaciones_sunat'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'validaciones_sunat.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'normalize_fiscal_baja_estado_230_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_fiscal_baja_estado_230'
    ),
    'helper app.normalize_fiscal_baja_estado_230'::text;

  RETURN QUERY
  SELECT
    'normalize_fiscal_baja_detalle_estado_230_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_fiscal_baja_detalle_estado_230'
    ),
    'helper app.normalize_fiscal_baja_detalle_estado_230'::text;

  RETURN QUERY
  SELECT
    'normalize_validaciones_sunat_estado_230_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_validaciones_sunat_estado_230'
    ),
    'helper app.normalize_validaciones_sunat_estado_230'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_comunicaciones_baja_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'comunicaciones_baja'
        AND t.tgname = 'trg_normalize_comunicaciones_baja_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en comunicaciones_baja'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_resumenes_diarios_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'resumenes_diarios'
        AND t.tgname = 'trg_normalize_resumenes_diarios_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en resumenes_diarios'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_detalle_comunicacion_baja_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'detalle_comunicacion_baja'
        AND t.tgname = 'trg_normalize_detalle_comunicacion_baja_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en detalle_comunicacion_baja'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_detalle_resumen_diario_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'detalle_resumen_diario'
        AND t.tgname = 'trg_normalize_detalle_resumen_diario_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en detalle_resumen_diario'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_validaciones_sunat_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'validaciones_sunat'
        AND t.tgname = 'trg_normalize_validaciones_sunat_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en validaciones_sunat'::text;

  RETURN QUERY
  SELECT
    'ck_comunicaciones_baja_estado_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_comunicaciones_baja_estado_runtime'
        AND conrelid = 'public.comunicaciones_baja'::regclass
    ),
    'constraint estado comunicaciones_baja'::text;

  RETURN QUERY
  SELECT
    'ck_resumenes_diarios_estado_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_resumenes_diarios_estado_runtime'
        AND conrelid = 'public.resumenes_diarios'::regclass
    ),
    'constraint estado resumenes_diarios'::text;

  RETURN QUERY
  SELECT
    'ck_detalle_comunicacion_baja_estado_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_detalle_comunicacion_baja_estado_runtime'
        AND conrelid = 'public.detalle_comunicacion_baja'::regclass
    ),
    'constraint estado detalle_comunicacion_baja'::text;

  RETURN QUERY
  SELECT
    'ck_detalle_resumen_diario_estado_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_detalle_resumen_diario_estado_runtime'
        AND conrelid = 'public.detalle_resumen_diario'::regclass
    ),
    'constraint estado detalle_resumen_diario'::text;

  RETURN QUERY
  SELECT
    'ck_validaciones_sunat_estado_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_validaciones_sunat_estado_runtime'
        AND conrelid = 'public.validaciones_sunat'::regclass
    ),
    'constraint estado validaciones_sunat'::text;

  RETURN QUERY
  SELECT
    'idx_comunicaciones_baja_tenant_estado_ci_runtime_230_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'comunicaciones_baja'
        AND indexname = 'idx_comunicaciones_baja_tenant_estado_ci_runtime_230'
    ),
    'indice tenant+estado CI comunicaciones_baja'::text;

  RETURN QUERY
  SELECT
    'idx_resumenes_diarios_tenant_estado_ci_runtime_230_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'resumenes_diarios'
        AND indexname = 'idx_resumenes_diarios_tenant_estado_ci_runtime_230'
    ),
    'indice tenant+estado CI resumenes_diarios'::text;

  RETURN QUERY
  SELECT
    'idx_detalle_comunicacion_baja_tenant_estado_ci_runtime_230_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'detalle_comunicacion_baja'
        AND indexname = 'idx_detalle_comunicacion_baja_tenant_estado_ci_runtime_230'
    ),
    'indice tenant+estado CI detalle_comunicacion_baja'::text;

  RETURN QUERY
  SELECT
    'idx_detalle_resumen_diario_tenant_estado_ci_runtime_230_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'detalle_resumen_diario'
        AND indexname = 'idx_detalle_resumen_diario_tenant_estado_ci_runtime_230'
    ),
    'indice tenant+estado CI detalle_resumen_diario'::text;

  RETURN QUERY
  SELECT
    'idx_validaciones_sunat_tenant_estado_ci_runtime_230_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'validaciones_sunat'
        AND indexname = 'idx_validaciones_sunat_tenant_estado_ci_runtime_230'
    ),
    'indice tenant+estado CI validaciones_sunat'::text;

  RETURN QUERY
  SELECT
    'rls_comunicaciones_baja_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'comunicaciones_baja'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en comunicaciones_baja'::text;

  RETURN QUERY
  SELECT
    'rls_resumenes_diarios_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'resumenes_diarios'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en resumenes_diarios'::text;

  RETURN QUERY
  SELECT
    'rls_detalle_comunicacion_baja_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'detalle_comunicacion_baja'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en detalle_comunicacion_baja'::text;

  RETURN QUERY
  SELECT
    'rls_detalle_resumen_diario_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'detalle_resumen_diario'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en detalle_resumen_diario'::text;

  RETURN QUERY
  SELECT
    'rls_validaciones_sunat_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'validaciones_sunat'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en validaciones_sunat'::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.comunicaciones_baja cb
       WHERE (p_tenant_id IS NULL OR cb.tenant_id = p_tenant_id)
         AND cb.estado = 'PENDIENTE')
    - (SELECT COUNT(*) FROM public.comunicaciones_baja cb
       WHERE (p_tenant_id IS NULL OR cb.tenant_id = p_tenant_id)
         AND cb.estado = 'pendiente')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'comunicaciones_baja_estado_case_insensitive_pendiente'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.resumenes_diarios r
       WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
         AND r.estado = 'GENERADO')
    - (SELECT COUNT(*) FROM public.resumenes_diarios r
       WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
         AND r.estado = 'generado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'resumenes_diarios_estado_case_insensitive_generado'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.detalle_comunicacion_baja d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
         AND d.estado = 'ACEPTADO')
    - (SELECT COUNT(*) FROM public.detalle_comunicacion_baja d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
         AND d.estado = 'aceptado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'detalle_comunicacion_baja_estado_case_insensitive_aceptado'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.detalle_resumen_diario d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
         AND d.estado = 'RECHAZADO')
    - (SELECT COUNT(*) FROM public.detalle_resumen_diario d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
         AND d.estado = 'rechazado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'detalle_resumen_diario_estado_case_insensitive_rechazado'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.validaciones_sunat v
       WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
         AND v.estado = 'VALIDO')
    - (SELECT COUNT(*) FROM public.validaciones_sunat v
       WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
         AND v.estado = 'valido')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'validaciones_sunat_estado_case_insensitive_valido'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.comunicaciones_baja cb
  WHERE (p_tenant_id IS NULL OR cb.tenant_id = p_tenant_id)
    AND (
      cb.estado IS NULL
      OR lower(cb.estado::text) NOT IN ('pendiente', 'generado', 'enviado', 'aceptado', 'rechazado', 'error', 'anulado')
    );
  RETURN QUERY
  SELECT
    'comunicaciones_baja_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.resumenes_diarios r
  WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
    AND (
      r.estado IS NULL
      OR lower(r.estado::text) NOT IN ('pendiente', 'generado', 'enviado', 'aceptado', 'rechazado', 'error', 'anulado')
    );
  RETURN QUERY
  SELECT
    'resumenes_diarios_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.detalle_comunicacion_baja d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      d.estado IS NULL
      OR lower(d.estado::text) NOT IN ('pendiente', 'aceptado', 'rechazado', 'anulado')
    );
  RETURN QUERY
  SELECT
    'detalle_comunicacion_baja_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.detalle_resumen_diario d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      d.estado IS NULL
      OR lower(d.estado::text) NOT IN ('pendiente', 'aceptado', 'rechazado', 'anulado')
    );
  RETURN QUERY
  SELECT
    'detalle_resumen_diario_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.validaciones_sunat v
  WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    AND (
      v.estado IS NULL
      OR lower(v.estado::text) NOT IN ('pendiente', 'valido', 'invalido', 'error', 'vencido')
    );
  RETURN QUERY
  SELECT
    'validaciones_sunat_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_fiscal_baja_resumen_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_fiscal_baja_resumen_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
