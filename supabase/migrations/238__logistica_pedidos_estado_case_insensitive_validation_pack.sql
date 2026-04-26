-- ============================================================================
-- 238__logistica_pedidos_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en Logistica.
-- Tablas foco:
--   public.logistica_eventos
--   public.pedido_backorders
--   public.pedido_despachos
--   public.pedido_gres
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_logistica_pedidos_estado_case_insensitive_runtime(
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
    'logistica_eventos_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'logistica_eventos'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'logistica_eventos.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'pedido_backorders_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pedido_backorders'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'pedido_backorders.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'pedido_despachos_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pedido_despachos'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'pedido_despachos.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'pedido_gres_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pedido_gres'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'pedido_gres.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'normalize_logistica_eventos_estado_236_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'normalize_logistica_eventos_estado_236'
    ),
    'helper app.normalize_logistica_eventos_estado_236'::text;

  RETURN QUERY
  SELECT
    'normalize_pedido_backorders_estado_236_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'normalize_pedido_backorders_estado_236'
    ),
    'helper app.normalize_pedido_backorders_estado_236'::text;

  RETURN QUERY
  SELECT
    'normalize_pedido_despachos_estado_236_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'normalize_pedido_despachos_estado_236'
    ),
    'helper app.normalize_pedido_despachos_estado_236'::text;

  RETURN QUERY
  SELECT
    'normalize_pedido_gres_estado_236_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'normalize_pedido_gres_estado_236'
    ),
    'helper app.normalize_pedido_gres_estado_236'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_logistica_eventos_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'logistica_eventos'
        AND t.tgname = 'trg_normalize_logistica_eventos_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en logistica_eventos'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_pedido_backorders_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pedido_backorders'
        AND t.tgname = 'trg_normalize_pedido_backorders_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en pedido_backorders'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_pedido_despachos_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pedido_despachos'
        AND t.tgname = 'trg_normalize_pedido_despachos_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en pedido_despachos'::text;

  RETURN QUERY
  SELECT
    'trigger_normalize_pedido_gres_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pedido_gres'
        AND t.tgname = 'trg_normalize_pedido_gres_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalizacion en pedido_gres'::text;

  RETURN QUERY
  SELECT
    'ck_logistica_eventos_estado_not_blank_runtime_236_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_logistica_eventos_estado_not_blank_runtime_236'
        AND conrelid = 'public.logistica_eventos'::regclass
    ),
    'constraint estado no vacio en logistica_eventos'::text;

  RETURN QUERY
  SELECT
    'ck_pedido_backorders_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pedido_backorders_estado_valid'
        AND conrelid = 'public.pedido_backorders'::regclass
    ),
    'constraint estado en pedido_backorders'::text;

  RETURN QUERY
  SELECT
    'ck_pedido_despachos_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pedido_despachos_estado_valid'
        AND conrelid = 'public.pedido_despachos'::regclass
    ),
    'constraint estado en pedido_despachos'::text;

  RETURN QUERY
  SELECT
    'ck_pedido_gres_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pedido_gres_estado_valid'
        AND conrelid = 'public.pedido_gres'::regclass
    ),
    'constraint estado en pedido_gres'::text;

  RETURN QUERY
  SELECT
    'idx_logistica_eventos_tenant_estado_ci_runtime_236_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'logistica_eventos'
        AND indexname = 'idx_logistica_eventos_tenant_estado_ci_runtime_236'
    ),
    'indice tenant+estado CI en logistica_eventos'::text;

  RETURN QUERY
  SELECT
    'idx_pedido_backorders_tenant_estado_ci_runtime_236_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'pedido_backorders'
        AND indexname = 'idx_pedido_backorders_tenant_estado_ci_runtime_236'
    ),
    'indice tenant+estado CI en pedido_backorders'::text;

  RETURN QUERY
  SELECT
    'idx_pedido_despachos_tenant_estado_ci_runtime_236_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'pedido_despachos'
        AND indexname = 'idx_pedido_despachos_tenant_estado_ci_runtime_236'
    ),
    'indice tenant+estado CI en pedido_despachos'::text;

  RETURN QUERY
  SELECT
    'idx_pedido_gres_tenant_estado_ci_runtime_236_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'pedido_gres'
        AND indexname = 'idx_pedido_gres_tenant_estado_ci_runtime_236'
    ),
    'indice tenant+estado CI en pedido_gres'::text;

  RETURN QUERY
  SELECT
    'rls_logistica_eventos_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'logistica_eventos'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en logistica_eventos'::text;

  RETURN QUERY
  SELECT
    'rls_pedido_backorders_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_backorders'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pedido_backorders'::text;

  RETURN QUERY
  SELECT
    'rls_pedido_despachos_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_despachos'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pedido_despachos'::text;

  RETURN QUERY
  SELECT
    'rls_pedido_gres_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_gres'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pedido_gres'::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.logistica_eventos le
       WHERE (p_tenant_id IS NULL OR le.tenant_id = p_tenant_id)
         AND le.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.logistica_eventos le
       WHERE (p_tenant_id IS NULL OR le.tenant_id = p_tenant_id)
         AND le.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'logistica_eventos_estado_case_insensitive_activo'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.pedido_backorders pb
       WHERE (p_tenant_id IS NULL OR pb.tenant_id = p_tenant_id)
         AND pb.estado = 'PENDIENTE')
    - (SELECT COUNT(*) FROM public.pedido_backorders pb
       WHERE (p_tenant_id IS NULL OR pb.tenant_id = p_tenant_id)
         AND pb.estado = 'pendiente')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'pedido_backorders_estado_case_insensitive_pendiente'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.pedido_despachos pd
       WHERE (p_tenant_id IS NULL OR pd.tenant_id = p_tenant_id)
         AND pd.estado = 'REGISTRADO')
    - (SELECT COUNT(*) FROM public.pedido_despachos pd
       WHERE (p_tenant_id IS NULL OR pd.tenant_id = p_tenant_id)
         AND pd.estado = 'registrado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'pedido_despachos_estado_case_insensitive_registrado'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.pedido_gres pg
       WHERE (p_tenant_id IS NULL OR pg.tenant_id = p_tenant_id)
         AND pg.estado = 'BORRADOR')
    - (SELECT COUNT(*) FROM public.pedido_gres pg
       WHERE (p_tenant_id IS NULL OR pg.tenant_id = p_tenant_id)
         AND pg.estado = 'borrador')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'pedido_gres_estado_case_insensitive_borrador'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.logistica_eventos le
  WHERE (p_tenant_id IS NULL OR le.tenant_id = p_tenant_id)
    AND (le.estado IS NULL OR btrim(le.estado::text) = '');
  RETURN QUERY SELECT 'logistica_eventos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pedido_backorders pb
  WHERE (p_tenant_id IS NULL OR pb.tenant_id = p_tenant_id)
    AND (pb.estado IS NULL OR lower(pb.estado::text) NOT IN ('pendiente', 'parcial', 'cerrado'));
  RETURN QUERY SELECT 'pedido_backorders_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pedido_despachos pd
  WHERE (p_tenant_id IS NULL OR pd.tenant_id = p_tenant_id)
    AND (pd.estado IS NULL OR lower(pd.estado::text) NOT IN ('registrado', 'anulado'));
  RETURN QUERY SELECT 'pedido_despachos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pedido_gres pg
  WHERE (p_tenant_id IS NULL OR pg.tenant_id = p_tenant_id)
    AND (pg.estado IS NULL OR lower(pg.estado::text) NOT IN ('borrador', 'enviado', 'aceptado', 'rechazado', 'anulado'));
  RETURN QUERY SELECT 'pedido_gres_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_logistica_pedidos_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_logistica_pedidos_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
