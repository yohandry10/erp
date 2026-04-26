-- ============================================================================
-- 235__cajas_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en Cajas.
-- Tablas foco:
--   public.cajas
--   public.sesiones_caja
--   public.retiros_caja (estado_conciliacion)
--   public.cambios_turno
--   public.autorizaciones_caja
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_cajas_estado_case_insensitive_runtime(
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
    'cajas_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cajas'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'cajas.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'sesiones_caja_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'sesiones_caja'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'sesiones_caja.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'retiros_caja_estado_conciliacion_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'retiros_caja'
        AND c.column_name = 'estado_conciliacion'
        AND c.udt_name = 'citext'
    ),
    'retiros_caja.estado_conciliacion usa citext'::text;

  RETURN QUERY
  SELECT
    'cambios_turno_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cambios_turno'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'cambios_turno.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'autorizaciones_caja_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'autorizaciones_caja'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'autorizaciones_caja.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'normalize_cajas_estado_233_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'normalize_cajas_estado_233'
    ),
    'helper app.normalize_cajas_estado_233'::text;

  RETURN QUERY
  SELECT
    'normalize_sesiones_caja_estado_233_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'normalize_sesiones_caja_estado_233'
    ),
    'helper app.normalize_sesiones_caja_estado_233'::text;

  RETURN QUERY
  SELECT
    'normalize_retiros_caja_estado_conciliacion_233_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'normalize_retiros_caja_estado_conciliacion_233'
    ),
    'helper app.normalize_retiros_caja_estado_conciliacion_233'::text;

  RETURN QUERY
  SELECT
    'normalize_cambios_turno_estado_233_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'normalize_cambios_turno_estado_233'
    ),
    'helper app.normalize_cambios_turno_estado_233'::text;

  RETURN QUERY
  SELECT
    'normalize_autorizaciones_caja_estado_233_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'normalize_autorizaciones_caja_estado_233'
    ),
    'helper app.normalize_autorizaciones_caja_estado_233'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_cajas_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cajas'
        AND t.tgname = 'trg_normalize_cajas_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en cajas'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_sesiones_caja_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'sesiones_caja'
        AND t.tgname = 'trg_normalize_sesiones_caja_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en sesiones_caja'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_retiros_caja_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'retiros_caja'
        AND t.tgname = 'trg_normalize_retiros_caja_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en retiros_caja'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_cambios_turno_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cambios_turno'
        AND t.tgname = 'trg_normalize_cambios_turno_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en cambios_turno'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_autorizaciones_caja_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'autorizaciones_caja'
        AND t.tgname = 'trg_normalize_autorizaciones_caja_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en autorizaciones_caja'::text;

  RETURN QUERY
  SELECT
    'ck_cajas_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_cajas_estado_valid'
        AND conrelid = 'public.cajas'::regclass
    ),
    'constraint estado en cajas'::text;

  RETURN QUERY
  SELECT
    'ck_sesiones_caja_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_sesiones_caja_estado_valid'
        AND conrelid = 'public.sesiones_caja'::regclass
    ),
    'constraint estado en sesiones_caja'::text;

  RETURN QUERY
  SELECT
    'ck_retiros_caja_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_retiros_caja_estado_valid'
        AND conrelid = 'public.retiros_caja'::regclass
    ),
    'constraint estado_conciliacion en retiros_caja'::text;

  RETURN QUERY
  SELECT
    'ck_cambios_turno_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_cambios_turno_estado_valid'
        AND conrelid = 'public.cambios_turno'::regclass
    ),
    'constraint estado en cambios_turno'::text;

  RETURN QUERY
  SELECT
    'ck_cambios_turno_estado_fin_consistency_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_cambios_turno_estado_fin_consistency'
        AND conrelid = 'public.cambios_turno'::regclass
    ),
    'constraint consistencia estado/timestamp_fin en cambios_turno'::text;

  RETURN QUERY
  SELECT
    'ck_autorizaciones_caja_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_autorizaciones_caja_estado_valid'
        AND conrelid = 'public.autorizaciones_caja'::regclass
    ),
    'constraint estado en autorizaciones_caja'::text;

  RETURN QUERY
  SELECT
    'idx_cajas_tenant_estado_ci_runtime_233_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cajas'
        AND indexname = 'idx_cajas_tenant_estado_ci_runtime_233'
    ),
    'indice tenant+estado CI en cajas'::text;

  RETURN QUERY
  SELECT
    'idx_sesiones_caja_tenant_estado_apertura_ci_runtime_233_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'sesiones_caja'
        AND indexname = 'idx_sesiones_caja_tenant_estado_apertura_ci_runtime_233'
    ),
    'indice tenant+estado CI en sesiones_caja'::text;

  RETURN QUERY
  SELECT
    'idx_retiros_caja_tenant_estado_conciliacion_ci_runtime_233_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'retiros_caja'
        AND indexname = 'idx_retiros_caja_tenant_estado_conciliacion_ci_runtime_233'
    ),
    'indice tenant+estado_conciliacion CI en retiros_caja'::text;

  RETURN QUERY
  SELECT
    'idx_cambios_turno_tenant_sesion_estado_ci_runtime_233_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cambios_turno'
        AND indexname = 'idx_cambios_turno_tenant_sesion_estado_ci_runtime_233'
    ),
    'indice tenant+estado CI en cambios_turno'::text;

  RETURN QUERY
  SELECT
    'idx_autorizaciones_caja_tenant_sesion_estado_ci_runtime_233_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'autorizaciones_caja'
        AND indexname = 'idx_autorizaciones_caja_tenant_sesion_estado_ci_runtime_233'
    ),
    'indice tenant+estado CI en autorizaciones_caja'::text;

  RETURN QUERY
  SELECT
    'rls_cajas_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'cajas'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cajas'::text;

  RETURN QUERY
  SELECT
    'rls_sesiones_caja_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'sesiones_caja'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en sesiones_caja'::text;

  RETURN QUERY
  SELECT
    'rls_retiros_caja_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'retiros_caja'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en retiros_caja'::text;

  RETURN QUERY
  SELECT
    'rls_cambios_turno_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'cambios_turno'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cambios_turno'::text;

  RETURN QUERY
  SELECT
    'rls_autorizaciones_caja_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'autorizaciones_caja'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en autorizaciones_caja'::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.cajas c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
         AND c.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.cajas c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
         AND c.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'cajas_estado_case_insensitive_activo'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.sesiones_caja s
       WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
         AND s.estado = 'ABIERTA')
    - (SELECT COUNT(*) FROM public.sesiones_caja s
       WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
         AND s.estado = 'abierta')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'sesiones_caja_estado_case_insensitive_abierta'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.retiros_caja r
       WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
         AND r.estado_conciliacion = 'CONCILIADO')
    - (SELECT COUNT(*) FROM public.retiros_caja r
       WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
         AND r.estado_conciliacion = 'conciliado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'retiros_caja_estado_case_insensitive_conciliado'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.cambios_turno ct
       WHERE (p_tenant_id IS NULL OR ct.tenant_id = p_tenant_id)
         AND ct.estado = 'EN_PROCESO')
    - (SELECT COUNT(*) FROM public.cambios_turno ct
       WHERE (p_tenant_id IS NULL OR ct.tenant_id = p_tenant_id)
         AND ct.estado = 'en_proceso')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'cambios_turno_estado_case_insensitive_en_proceso'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.autorizaciones_caja a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
         AND a.estado = 'PENDIENTE')
    - (SELECT COUNT(*) FROM public.autorizaciones_caja a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
         AND a.estado = 'pendiente')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'autorizaciones_caja_estado_case_insensitive_pendiente'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.cajas c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (c.estado IS NULL OR lower(c.estado::text) NOT IN ('activo', 'inactivo', 'mantenimiento', 'bloqueada'));
  RETURN QUERY SELECT 'cajas_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.sesiones_caja s
  WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
    AND (s.estado IS NULL OR lower(s.estado::text) NOT IN ('abierta', 'cerrada', 'pausada', 'anulada'));
  RETURN QUERY SELECT 'sesiones_caja_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.retiros_caja r
  WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
    AND (r.estado_conciliacion IS NULL OR lower(r.estado_conciliacion::text) NOT IN ('pendiente', 'conciliado', 'rechazado'));
  RETURN QUERY SELECT 'retiros_caja_invalid_estado_conciliacion_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.cambios_turno ct
  WHERE (p_tenant_id IS NULL OR ct.tenant_id = p_tenant_id)
    AND (
      ct.estado IS NULL
      OR lower(ct.estado::text) NOT IN ('en_proceso', 'completado', 'cancelado')
      OR ((lower(ct.estado::text) = 'en_proceso') AND ct.timestamp_fin IS NOT NULL)
      OR ((lower(ct.estado::text) IN ('completado', 'cancelado')) AND ct.timestamp_fin IS NULL)
    );
  RETURN QUERY SELECT 'cambios_turno_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.autorizaciones_caja a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (a.estado IS NULL OR lower(a.estado::text) NOT IN ('aprobado', 'rechazado', 'pendiente'));
  RETURN QUERY SELECT 'autorizaciones_caja_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_cajas_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_cajas_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
