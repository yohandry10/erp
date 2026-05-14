-- ============================================================================
-- 241__contabilidad_activos_consignacion_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en contabilidad de
-- activos/consignacion.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_contabilidad_activos_consignacion_estado_case_insensitive_runtime(
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
  WITH expected(table_name, column_name, detail) AS (
    VALUES
      ('activos_fijos', 'estado', 'activos_fijos.estado usa citext'),
      ('depreciaciones', 'estado', 'depreciaciones.estado usa citext'),
      ('registro_consignaciones', 'estado', 'registro_consignaciones.estado usa citext'),
      ('movimientos_consignacion', 'estado', 'movimientos_consignacion.estado usa citext'),
      ('inventarios_permanentes', 'estado', 'inventarios_permanentes.estado usa citext'),
      ('asignacion_costos', 'estado', 'asignacion_costos.estado usa citext'),
      ('calendario_empresa', 'estado', 'calendario_empresa.estado usa citext'),
      ('saldos_iniciales_cuentas', 'estado', 'saldos_iniciales_cuentas.estado usa citext')
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
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(function_name, detail) AS (
    VALUES
      ('normalize_activos_fijos_estado_239', 'helper activos_fijos'),
      ('normalize_depreciaciones_estado_239', 'helper depreciaciones'),
      ('normalize_registro_consignaciones_estado_239', 'helper registro_consignaciones'),
      ('normalize_movimientos_consignacion_estado_239', 'helper movimientos_consignacion'),
      ('normalize_inventarios_permanentes_estado_239', 'helper inventarios_permanentes'),
      ('normalize_asignacion_costos_estado_239', 'helper asignacion_costos'),
      ('normalize_calendario_empresa_estado_239', 'helper calendario_empresa'),
      ('normalize_saldos_iniciales_cuentas_estado_239', 'helper saldos_iniciales_cuentas')
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
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('activos_fijos', 'trg_normalize_activos_fijos_row', 'trigger normalizacion activos_fijos'),
      ('depreciaciones', 'trg_normalize_depreciaciones_row', 'trigger normalizacion depreciaciones'),
      ('registro_consignaciones', 'trg_normalize_registro_consignaciones_row', 'trigger normalizacion registro_consignaciones'),
      ('movimientos_consignacion', 'trg_normalize_movimientos_consignacion_row', 'trigger normalizacion movimientos_consignacion')
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
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('activos_fijos', 'ck_activos_fijos_runtime', 'constraint runtime activos_fijos'),
      ('depreciaciones', 'ck_depreciaciones_runtime', 'constraint runtime depreciaciones'),
      ('registro_consignaciones', 'ck_registro_consignaciones_runtime', 'constraint runtime registro_consignaciones'),
      ('movimientos_consignacion', 'ck_movimientos_consignacion_runtime', 'constraint runtime movimientos_consignacion'),
      ('inventarios_permanentes', 'ck_inventarios_permanentes_runtime', 'constraint runtime inventarios_permanentes'),
      ('asignacion_costos', 'ck_asignacion_costos_runtime', 'constraint runtime asignacion_costos'),
      ('calendario_empresa', 'ck_calendario_empresa_runtime', 'constraint runtime calendario_empresa'),
      ('saldos_iniciales_cuentas', 'ck_saldos_iniciales_cuentas_runtime', 'constraint runtime saldos_iniciales_cuentas')
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
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('activos_fijos', 'idx_activos_fijos_tenant_estado_ci_runtime_239', 'indice CI activos_fijos'),
      ('depreciaciones', 'idx_depreciaciones_tenant_estado_ci_runtime_239', 'indice CI depreciaciones'),
      ('registro_consignaciones', 'idx_registro_consignaciones_tenant_estado_ci_runtime_239', 'indice CI registro_consignaciones'),
      ('movimientos_consignacion', 'idx_movimientos_consignacion_tenant_estado_ci_runtime_239', 'indice CI movimientos_consignacion'),
      ('inventarios_permanentes', 'idx_inventarios_permanentes_tenant_estado_ci_runtime_239', 'indice CI inventarios_permanentes'),
      ('asignacion_costos', 'idx_asignacion_costos_tenant_estado_ci_runtime_239', 'indice CI asignacion_costos'),
      ('calendario_empresa', 'idx_calendario_empresa_tenant_estado_ci_runtime_239', 'indice CI calendario_empresa'),
      ('saldos_iniciales_cuentas', 'idx_saldos_iniciales_cuentas_tenant_estado_ci_runtime_239', 'indice CI saldos_iniciales_cuentas'),
      ('activos_fijos', 'ux_activos_fijos_tenant_codigo_activo', 'unicidad activos_fijos'),
      ('depreciaciones', 'ux_depreciaciones_tenant_activo_periodo_runtime', 'unicidad depreciaciones'),
      ('registro_consignaciones', 'ux_registro_consignaciones_tenant_numero_runtime', 'unicidad registro_consignaciones'),
      ('inventarios_permanentes', 'ux_inventarios_permanentes_tenant_producto_almacen_periodo_runtime', 'unicidad inventarios_permanentes'),
      ('calendario_empresa', 'ux_calendario_empresa_tenant_fecha_runtime', 'unicidad calendario_empresa'),
      ('saldos_iniciales_cuentas', 'ux_saldos_iniciales_cuentas_tenant_cuenta_periodo_runtime', 'unicidad saldos_iniciales_cuentas')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = left(e.indexname, 63)
    ),
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('activos_fijos'),
      ('depreciaciones'),
      ('registro_consignaciones'),
      ('movimientos_consignacion'),
      ('inventarios_permanentes'),
      ('asignacion_costos'),
      ('calendario_empresa'),
      ('saldos_iniciales_cuentas')
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
      (SELECT COUNT(*) FROM public.activos_fijos a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.activos_fijos a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'activos_fijos_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.depreciaciones d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id) AND d.estado = 'PENDIENTE')
    - (SELECT COUNT(*) FROM public.depreciaciones d
       WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id) AND d.estado = 'pendiente')
  ) INTO v_delta;
  RETURN QUERY SELECT 'depreciaciones_estado_case_insensitive_pendiente'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.registro_consignaciones r
       WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id) AND r.estado = 'VENDIDA')
    - (SELECT COUNT(*) FROM public.registro_consignaciones r
       WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id) AND r.estado = 'vendida')
  ) INTO v_delta;
  RETURN QUERY SELECT 'registro_consignaciones_estado_case_insensitive_vendida'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.movimientos_consignacion m
       WHERE (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id) AND m.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.movimientos_consignacion m
       WHERE (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id) AND m.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'movimientos_consignacion_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.inventarios_permanentes i
       WHERE (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id) AND i.estado = 'ABIERTO')
    - (SELECT COUNT(*) FROM public.inventarios_permanentes i
       WHERE (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id) AND i.estado = 'abierto')
  ) INTO v_delta;
  RETURN QUERY SELECT 'inventarios_permanentes_estado_case_insensitive_abierto'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.asignacion_costos a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'ACTIVA')
    - (SELECT COUNT(*) FROM public.asignacion_costos a
       WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id) AND a.estado = 'activa')
  ) INTO v_delta;
  RETURN QUERY SELECT 'asignacion_costos_estado_case_insensitive_activa'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.calendario_empresa c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.calendario_empresa c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'calendario_empresa_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.saldos_iniciales_cuentas s
       WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id) AND s.estado = 'ABIERTO')
    - (SELECT COUNT(*) FROM public.saldos_iniciales_cuentas s
       WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id) AND s.estado = 'abierto')
  ) INTO v_delta;
  RETURN QUERY SELECT 'saldos_iniciales_cuentas_estado_case_insensitive_abierto'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.activos_fijos a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (a.estado IS NULL OR lower(a.estado::text) NOT IN ('activo', 'inactivo', 'baja', 'vendido', 'depreciado'));
  RETURN QUERY SELECT 'activos_fijos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.depreciaciones d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (d.estado IS NULL OR lower(d.estado::text) NOT IN ('pendiente', 'procesada', 'anulada', 'error'));
  RETURN QUERY SELECT 'depreciaciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.registro_consignaciones r
  WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
    AND (r.estado IS NULL OR lower(r.estado::text) NOT IN ('pendiente', 'vendida', 'devuelta', 'anulada', 'cerrada'));
  RETURN QUERY SELECT 'registro_consignaciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.movimientos_consignacion m
  WHERE (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id)
    AND (m.estado IS NULL OR lower(m.estado::text) NOT IN ('activo', 'anulado'));
  RETURN QUERY SELECT 'movimientos_consignacion_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.inventarios_permanentes i
  WHERE (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id)
    AND (i.estado IS NULL OR lower(i.estado::text) NOT IN ('abierto', 'cerrado', 'anulado'));
  RETURN QUERY SELECT 'inventarios_permanentes_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.asignacion_costos a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (a.estado IS NULL OR lower(a.estado::text) NOT IN ('activa', 'inactiva', 'anulada'));
  RETURN QUERY SELECT 'asignacion_costos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.calendario_empresa c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (c.estado IS NULL OR lower(c.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY SELECT 'calendario_empresa_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.saldos_iniciales_cuentas s
  WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
    AND (s.estado IS NULL OR lower(s.estado::text) NOT IN ('abierto', 'cerrado', 'anulado'));
  RETURN QUERY SELECT 'saldos_iniciales_cuentas_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_contabilidad_activos_consignacion_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_contabilidad_activos_consignacion_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
