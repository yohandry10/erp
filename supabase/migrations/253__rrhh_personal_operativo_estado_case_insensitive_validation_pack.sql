-- ============================================================================
-- 253__rrhh_personal_operativo_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en RRHH personal
-- operativo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_personal_operativo_estado_case_insensitive_runtime(
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
      ('beneficios', 'estado', 'beneficios.estado usa citext'),
      ('capacitaciones', 'estado', 'capacitaciones.estado usa citext'),
      ('horarios_trabajo', 'estado', 'horarios_trabajo.estado usa citext'),
      ('empleado_beneficios', 'estado', 'empleado_beneficios.estado usa citext'),
      ('empleado_capacitaciones', 'estado', 'empleado_capacitaciones.estado usa citext'),
      ('empleado_horarios', 'estado', 'empleado_horarios.estado usa citext'),
      ('expediente_documentos', 'estado', 'expediente_documentos.estado usa citext'),
      ('liquidaciones', 'estado', 'liquidaciones.estado usa citext'),
      ('historial_pagos_planilla', 'estado', 'historial_pagos_planilla.estado usa citext')
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
      ('normalize_beneficios_estado_251', 'helper beneficios'),
      ('normalize_capacitaciones_estado_251', 'helper capacitaciones'),
      ('normalize_horarios_trabajo_estado_251', 'helper horarios'),
      ('normalize_empleado_beneficios_estado_251', 'helper empleado_beneficios'),
      ('normalize_empleado_capacitaciones_estado_251', 'helper empleado_capacitaciones'),
      ('normalize_empleado_horarios_estado_251', 'helper empleado_horarios'),
      ('normalize_expediente_documentos_estado_251', 'helper expediente_documentos'),
      ('normalize_liquidaciones_estado_251', 'helper liquidaciones'),
      ('normalize_historial_pagos_planilla_estado_251', 'helper historial_pagos_planilla')
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
      ('beneficios', 'trg_normalize_beneficios_row', 'normalizacion beneficios'),
      ('capacitaciones', 'trg_normalize_capacitaciones_row', 'normalizacion capacitaciones'),
      ('horarios_trabajo', 'trg_normalize_horarios_trabajo_row', 'normalizacion horarios_trabajo'),
      ('empleado_beneficios', 'trg_normalize_empleado_beneficios_row', 'normalizacion empleado_beneficios'),
      ('empleado_capacitaciones', 'trg_normalize_empleado_capacitaciones_row', 'normalizacion empleado_capacitaciones'),
      ('empleado_horarios', 'trg_normalize_empleado_horarios_row', 'normalizacion empleado_horarios'),
      ('expediente_documentos', 'trg_normalize_expediente_documentos_row', 'normalizacion expediente_documentos'),
      ('liquidaciones', 'trg_normalize_liquidaciones_row', 'normalizacion liquidaciones'),
      ('historial_pagos_planilla', 'trg_normalize_historial_pagos_planilla_row', 'normalizacion historial_pagos_planilla'),
      ('empleado_beneficios', 'trg_enforce_empleado_beneficios_tenant_consistency', 'consistencia tenant empleado_beneficios'),
      ('empleado_capacitaciones', 'trg_enforce_empleado_capacitaciones_tenant_consistency', 'consistencia tenant empleado_capacitaciones'),
      ('empleado_horarios', 'trg_enforce_empleado_horarios_tenant_consistency', 'consistencia tenant empleado_horarios'),
      ('expediente_documentos', 'trg_enforce_expediente_documentos_tenant_consistency', 'consistencia tenant expediente_documentos'),
      ('liquidaciones', 'trg_enforce_liquidaciones_tenant_consistency', 'consistencia tenant liquidaciones'),
      ('historial_pagos_planilla', 'trg_enforce_historial_pagos_planilla_tenant_consistency', 'consistencia tenant historial_pagos_planilla')
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
      ('beneficios', 'ck_beneficios_estado_runtime', 'constraint estado beneficios'),
      ('capacitaciones', 'ck_capacitaciones_estado_runtime', 'constraint estado capacitaciones'),
      ('horarios_trabajo', 'ck_horarios_trabajo_estado_runtime', 'constraint estado horarios_trabajo'),
      ('empleado_beneficios', 'ck_empleado_beneficios_estado_runtime', 'constraint estado empleado_beneficios'),
      ('empleado_capacitaciones', 'ck_empleado_capacitaciones_estado_runtime', 'constraint estado empleado_capacitaciones'),
      ('empleado_horarios', 'ck_empleado_horarios_estado_runtime', 'constraint estado empleado_horarios'),
      ('expediente_documentos', 'ck_expediente_documentos_estado_runtime', 'constraint estado expediente_documentos'),
      ('liquidaciones', 'ck_liquidaciones_estado_runtime', 'constraint estado liquidaciones'),
      ('historial_pagos_planilla', 'ck_historial_pagos_planilla_estado_runtime', 'constraint estado historial_pagos_planilla')
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
      ('beneficios', 'idx_beneficios_tenant_estado_ci_runtime_251', 'indice CI beneficios'),
      ('capacitaciones', 'idx_capacitaciones_tenant_estado_ci_runtime_251', 'indice CI capacitaciones'),
      ('horarios_trabajo', 'idx_horarios_trabajo_tenant_estado_ci_runtime_251', 'indice CI horarios_trabajo'),
      ('empleado_beneficios', 'idx_empleado_beneficios_tenant_estado_ci_runtime_251', 'indice CI empleado_beneficios'),
      ('empleado_capacitaciones', 'idx_empleado_capacitaciones_tenant_estado_ci_runtime_251', 'indice CI empleado_capacitaciones'),
      ('empleado_horarios', 'idx_empleado_horarios_tenant_estado_ci_runtime_251', 'indice CI empleado_horarios'),
      ('expediente_documentos', 'idx_expediente_documentos_tenant_estado_ci_runtime_251', 'indice CI expediente_documentos'),
      ('liquidaciones', 'idx_liquidaciones_tenant_estado_ci_runtime_251', 'indice CI liquidaciones'),
      ('historial_pagos_planilla', 'idx_historial_pagos_planilla_tenant_estado_ci_runtime_251', 'indice CI historial_pagos_planilla'),
      ('beneficios', 'ux_beneficios_tenant_codigo_activo', 'unicidad beneficios activo/inactivo'),
      ('capacitaciones', 'ux_capacitaciones_tenant_codigo_activo', 'unicidad capacitaciones activo/inactivo'),
      ('horarios_trabajo', 'ux_horarios_trabajo_tenant_codigo_activo', 'unicidad horarios activo/inactivo'),
      ('empleado_beneficios', 'ux_empleado_beneficios_tenant_empleado_beneficio_fecha', 'unicidad empleado_beneficios'),
      ('liquidaciones', 'ux_liquidaciones_tenant_empleado_fecha_terminacion', 'unicidad liquidaciones')
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
    e.detail::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('beneficios'),
      ('capacitaciones'),
      ('horarios_trabajo'),
      ('empleado_beneficios'),
      ('empleado_capacitaciones'),
      ('empleado_horarios'),
      ('expediente_documentos'),
      ('liquidaciones'),
      ('historial_pagos_planilla')
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
      (SELECT COUNT(*) FROM public.beneficios b
       WHERE (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id) AND b.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.beneficios b
       WHERE (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id) AND b.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY SELECT 'beneficios_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.capacitaciones c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'CANCELADA')
    - (SELECT COUNT(*) FROM public.capacitaciones c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'cancelada')
  ) INTO v_delta;
  RETURN QUERY SELECT 'capacitaciones_estado_case_insensitive_cancelada'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.empleado_capacitaciones ec
       WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id) AND ec.estado = 'EN_PROGRESO')
    - (SELECT COUNT(*) FROM public.empleado_capacitaciones ec
       WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id) AND ec.estado = 'en_progreso')
  ) INTO v_delta;
  RETURN QUERY SELECT 'empleado_capacitaciones_estado_case_insensitive_en_progreso'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.liquidaciones l
       WHERE (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id) AND l.estado = 'PAGADA')
    - (SELECT COUNT(*) FROM public.liquidaciones l
       WHERE (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id) AND l.estado = 'pagada')
  ) INTO v_delta;
  RETURN QUERY SELECT 'liquidaciones_estado_case_insensitive_pagada'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.historial_pagos_planilla h
       WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id) AND h.estado = 'REGISTRADO')
    - (SELECT COUNT(*) FROM public.historial_pagos_planilla h
       WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id) AND h.estado = 'registrado')
  ) INTO v_delta;
  RETURN QUERY SELECT 'historial_pagos_planilla_estado_case_insensitive_registrado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(codigo)) AS codigo_norm, COUNT(*) AS cnt
    FROM public.beneficios
    WHERE tenant_id IS NOT NULL
      AND codigo IS NOT NULL
      AND btrim(codigo) <> ''
      AND lower(estado::text) IN ('activo', 'inactivo')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(codigo))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_beneficios_tenant_codigo_activo'::text, (v_count = 0), format('duplicados=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(codigo)) AS codigo_norm, COUNT(*) AS cnt
    FROM public.capacitaciones
    WHERE tenant_id IS NOT NULL
      AND codigo IS NOT NULL
      AND btrim(codigo) <> ''
      AND lower(estado::text) IN ('activo', 'inactivo')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(codigo))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_capacitaciones_tenant_codigo_activo'::text, (v_count = 0), format('duplicados=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.beneficios b
  WHERE (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
    AND (b.estado IS NULL OR lower(b.estado::text) NOT IN ('activo', 'inactivo', 'archivado'));
  RETURN QUERY SELECT 'beneficios_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.capacitaciones c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (c.estado IS NULL OR lower(c.estado::text) NOT IN ('activo', 'inactivo', 'completada', 'cancelada'));
  RETURN QUERY SELECT 'capacitaciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.horarios_trabajo h
  WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
    AND (h.estado IS NULL OR lower(h.estado::text) NOT IN ('activo', 'inactivo'));
  RETURN QUERY SELECT 'horarios_trabajo_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_beneficios eb
  WHERE (p_tenant_id IS NULL OR eb.tenant_id = p_tenant_id)
    AND (eb.estado IS NULL OR lower(eb.estado::text) NOT IN ('activo', 'inactivo', 'suspendido', 'vencido'));
  RETURN QUERY SELECT 'empleado_beneficios_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_capacitaciones ec
  WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id)
    AND (ec.estado IS NULL OR lower(ec.estado::text) NOT IN ('inscrito', 'en_progreso', 'completado', 'aprobado', 'reprobado', 'cancelado'));
  RETURN QUERY SELECT 'empleado_capacitaciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_horarios eh
  WHERE (p_tenant_id IS NULL OR eh.tenant_id = p_tenant_id)
    AND (eh.estado IS NULL OR lower(eh.estado::text) NOT IN ('activo', 'inactivo', 'suspendido'));
  RETURN QUERY SELECT 'empleado_horarios_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.expediente_documentos ed
  WHERE (p_tenant_id IS NULL OR ed.tenant_id = p_tenant_id)
    AND (ed.estado IS NULL OR lower(ed.estado::text) NOT IN ('activo', 'archivado', 'eliminado'));
  RETURN QUERY SELECT 'expediente_documentos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.liquidaciones l
  WHERE (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
    AND (l.estado IS NULL OR lower(l.estado::text) NOT IN ('calculada', 'aprobada', 'pagada', 'anulada'));
  RETURN QUERY SELECT 'liquidaciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.historial_pagos_planilla h
  WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
    AND (h.estado IS NULL OR lower(h.estado::text) NOT IN ('registrado', 'anulado', 'conciliado'));
  RETURN QUERY SELECT 'historial_pagos_planilla_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_personal_operativo_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_rrhh_personal_operativo_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
