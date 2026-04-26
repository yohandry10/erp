-- ============================================================================
-- 169__rrhh_personal_operativo_validation_pack.sql
-- Pack de validacion runtime para:
-- beneficios, capacitaciones, horarios_trabajo, empleado_beneficios,
-- empleado_capacitaciones, empleado_horarios, expediente_documentos,
-- liquidaciones, historial_pagos_planilla.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_personal_operativo_runtime(
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
  -- Triggers normalize
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('beneficios', 'trg_normalize_beneficios_row', 'normalizacion en beneficios'),
      ('capacitaciones', 'trg_normalize_capacitaciones_row', 'normalizacion en capacitaciones'),
      ('horarios_trabajo', 'trg_normalize_horarios_trabajo_row', 'normalizacion en horarios_trabajo'),
      ('empleado_beneficios', 'trg_normalize_empleado_beneficios_row', 'normalizacion en empleado_beneficios'),
      ('empleado_capacitaciones', 'trg_normalize_empleado_capacitaciones_row', 'normalizacion en empleado_capacitaciones'),
      ('empleado_horarios', 'trg_normalize_empleado_horarios_row', 'normalizacion en empleado_horarios'),
      ('expediente_documentos', 'trg_normalize_expediente_documentos_row', 'normalizacion en expediente_documentos'),
      ('liquidaciones', 'trg_normalize_liquidaciones_row', 'normalizacion en liquidaciones'),
      ('historial_pagos_planilla', 'trg_normalize_historial_pagos_planilla_row', 'normalizacion en historial_pagos_planilla')
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
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Triggers enforce tenant
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('empleado_beneficios', 'trg_enforce_empleado_beneficios_tenant_consistency', 'consistencia tenant en empleado_beneficios'),
      ('empleado_capacitaciones', 'trg_enforce_empleado_capacitaciones_tenant_consistency', 'consistencia tenant en empleado_capacitaciones'),
      ('empleado_horarios', 'trg_enforce_empleado_horarios_tenant_consistency', 'consistencia tenant en empleado_horarios'),
      ('expediente_documentos', 'trg_enforce_expediente_documentos_tenant_consistency', 'consistencia tenant en expediente_documentos'),
      ('liquidaciones', 'trg_enforce_liquidaciones_tenant_consistency', 'consistencia tenant en liquidaciones'),
      ('historial_pagos_planilla', 'trg_enforce_historial_pagos_planilla_tenant_consistency', 'consistencia tenant en historial_pagos_planilla')
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
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Columnas runtime
  RETURN QUERY
  SELECT
    'beneficios_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 11
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'beneficios'
        AND c.column_name IN (
          'tenant_id', 'nombre', 'codigo', 'descripcion', 'tipo',
          'monto', 'moneda', 'fecha_inicio', 'fecha_fin', 'estado', 'activo'
        )
    ),
    'columnas runtime de beneficios';

  RETURN QUERY
  SELECT
    'capacitaciones_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 11
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'capacitaciones'
        AND c.column_name IN (
          'tenant_id', 'nombre', 'codigo', 'descripcion', 'instructor',
          'duracion_horas', 'fecha_inicio', 'fecha_fin', 'costo', 'estado', 'activo'
        )
    ),
    'columnas runtime de capacitaciones';

  RETURN QUERY
  SELECT
    'horarios_trabajo_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'horarios_trabajo'
        AND c.column_name IN (
          'tenant_id', 'nombre', 'codigo', 'hora_inicio', 'hora_fin',
          'dias_semana', 'tolerancia_minutos', 'estado', 'activo'
        )
    ),
    'columnas runtime de horarios_trabajo';

  RETURN QUERY
  SELECT
    'empleado_beneficios_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'empleado_beneficios'
        AND c.column_name IN (
          'tenant_id', 'id_empleado', 'empleado_id', 'id_beneficio', 'beneficio_id',
          'fecha_inicio', 'fecha_fin', 'estado', 'activo'
        )
    ),
    'columnas runtime de empleado_beneficios';

  RETURN QUERY
  SELECT
    'empleado_capacitaciones_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'empleado_capacitaciones'
        AND c.column_name IN (
          'tenant_id', 'id_empleado', 'empleado_id', 'id_capacitacion', 'capacitacion_id',
          'fecha_inscripcion', 'fecha_completado', 'calificacion', 'estado', 'activo'
        )
    ),
    'columnas runtime de empleado_capacitaciones';

  RETURN QUERY
  SELECT
    'empleado_horarios_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'empleado_horarios'
        AND c.column_name IN (
          'tenant_id', 'id_empleado', 'empleado_id', 'id_horario', 'horario_id',
          'fecha_inicio', 'fecha_fin', 'estado', 'activo'
        )
    ),
    'columnas runtime de empleado_horarios';

  RETURN QUERY
  SELECT
    'expediente_documentos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'expediente_documentos'
        AND c.column_name IN (
          'tenant_id', 'id_empleado', 'empleado_id', 'nombre_archivo', 'archivo_url',
          'tipo_documento', 'fecha_subida', 'subido_por', 'estado', 'activo'
        )
    ),
    'columnas runtime de expediente_documentos';

  RETURN QUERY
  SELECT
    'liquidaciones_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 13
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'liquidaciones'
        AND c.column_name IN (
          'tenant_id', 'id_empleado', 'empleado_id', 'fecha_terminacion', 'ultimo_dia_trabajado',
          'motivo_terminacion', 'monto_cts', 'vacaciones_pendientes', 'indemnizacion',
          'dias_cts', 'total_liquidacion', 'estado', 'activo'
        )
    ),
    'columnas runtime de liquidaciones';

  RETURN QUERY
  SELECT
    'historial_pagos_planilla_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'historial_pagos_planilla'
        AND c.column_name IN (
          'tenant_id', 'planilla_id', 'fecha', 'metodo', 'metodo_pago',
          'monto', 'empleados_count', 'numero_operacion', 'estado'
        )
    ),
    'columnas runtime de historial_pagos_planilla';

  -- FKs esperadas
  RETURN QUERY
  WITH expected(conname, relname, detail) AS (
    VALUES
      ('empleado_beneficios_id_empleado_fkey', 'empleado_beneficios', 'FK empleado_beneficios -> empleados'),
      ('empleado_beneficios_id_beneficio_fkey', 'empleado_beneficios', 'FK empleado_beneficios -> beneficios'),
      ('empleado_capacitaciones_id_empleado_fkey', 'empleado_capacitaciones', 'FK empleado_capacitaciones -> empleados'),
      ('empleado_capacitaciones_id_capacitacion_fkey', 'empleado_capacitaciones', 'FK empleado_capacitaciones -> capacitaciones'),
      ('empleado_horarios_id_empleado_fkey', 'empleado_horarios', 'FK empleado_horarios -> empleados'),
      ('empleado_horarios_id_horario_fkey', 'empleado_horarios', 'FK empleado_horarios -> horarios_trabajo'),
      ('expediente_documentos_id_empleado_fkey', 'expediente_documentos', 'FK expediente_documentos -> empleados'),
      ('expediente_documentos_subido_por_fkey', 'expediente_documentos', 'FK expediente_documentos -> usuarios_sistema'),
      ('liquidaciones_id_empleado_fkey', 'liquidaciones', 'FK liquidaciones -> empleados'),
      ('fk_historial_pagos_planilla_id', 'historial_pagos_planilla', 'FK historial_pagos_planilla -> planillas')
  )
  SELECT
    format('fk_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = e.relname
        AND c.conname = e.conname
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Indices esperados
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('beneficios', 'idx_beneficios_tenant_estado_nombre_runtime', 'indice runtime beneficios'),
      ('capacitaciones', 'idx_capacitaciones_tenant_estado_fecha_inicio_runtime', 'indice runtime capacitaciones'),
      ('horarios_trabajo', 'idx_horarios_trabajo_tenant_estado_nombre_runtime', 'indice runtime horarios_trabajo'),
      ('empleado_beneficios', 'idx_empleado_beneficios_tenant_empleado_estado_fecha_runtime', 'indice runtime empleado_beneficios'),
      ('empleado_capacitaciones', 'idx_empleado_capacitaciones_tenant_empleado_estado_fecha_runtime', 'indice runtime empleado_capacitaciones'),
      ('empleado_horarios', 'idx_empleado_horarios_tenant_empleado_activo_fecha_runtime', 'indice runtime empleado_horarios'),
      ('expediente_documentos', 'idx_expediente_documentos_tenant_empleado_fecha_runtime', 'indice runtime expediente_documentos'),
      ('liquidaciones', 'idx_liquidaciones_tenant_empleado_fecha_runtime', 'indice runtime liquidaciones'),
      ('historial_pagos_planilla', 'idx_historial_pagos_planilla_tenant_planilla_fecha_runtime', 'indice runtime historial_pagos_planilla'),
      ('beneficios', 'ux_beneficios_tenant_codigo_activo', 'unicidad beneficios por codigo activo'),
      ('capacitaciones', 'ux_capacitaciones_tenant_codigo_activo', 'unicidad capacitaciones por codigo activo'),
      ('horarios_trabajo', 'ux_horarios_trabajo_tenant_codigo_activo', 'unicidad horarios por codigo activo'),
      ('empleado_beneficios', 'ux_empleado_beneficios_tenant_empleado_beneficio_fecha', 'unicidad empleado_beneficios'),
      ('empleado_capacitaciones', 'ux_empleado_capacitaciones_tenant_empleado_capacitacion_fecha', 'unicidad empleado_capacitaciones'),
      ('empleado_horarios', 'ux_empleado_horarios_tenant_empleado_horario_fecha', 'unicidad empleado_horarios'),
      ('empleado_horarios', 'ux_empleado_horarios_tenant_empleado_activo', 'unicidad horario activo por empleado'),
      ('liquidaciones', 'ux_liquidaciones_tenant_empleado_fecha_terminacion', 'unicidad liquidaciones por fecha'),
      ('historial_pagos_planilla', 'ux_historial_pagos_planilla_tenant_planilla_fecha_operacion', 'unicidad historial por operacion')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- RLS enabled+forced
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
    ) AS ok,
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  -- Duplicados por scope
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(codigo)) AS codigo_norm, COUNT(*) AS cnt
    FROM public.beneficios
    WHERE tenant_id IS NOT NULL
      AND codigo IS NOT NULL
      AND btrim(codigo) <> ''
      AND estado IN ('activo', 'inactivo')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(codigo))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_beneficios_tenant_codigo_activo'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(codigo)) AS codigo_norm, COUNT(*) AS cnt
    FROM public.capacitaciones
    WHERE tenant_id IS NOT NULL
      AND codigo IS NOT NULL
      AND btrim(codigo) <> ''
      AND estado IN ('activo', 'inactivo')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(codigo))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_capacitaciones_tenant_codigo_activo'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, id_empleado, id_beneficio, fecha_inicio, COUNT(*) AS cnt
    FROM public.empleado_beneficios
    WHERE tenant_id IS NOT NULL
      AND id_empleado IS NOT NULL
      AND id_beneficio IS NOT NULL
      AND fecha_inicio IS NOT NULL
      AND estado IN ('activo', 'inactivo', 'suspendido')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_empleado, id_beneficio, fecha_inicio
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_empleado_beneficios_scope'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, id_empleado, id_capacitacion, fecha_inscripcion, COUNT(*) AS cnt
    FROM public.empleado_capacitaciones
    WHERE tenant_id IS NOT NULL
      AND id_empleado IS NOT NULL
      AND id_capacitacion IS NOT NULL
      AND fecha_inscripcion IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_empleado, id_capacitacion, fecha_inscripcion
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_empleado_capacitaciones_scope'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, id_empleado, COUNT(*) AS cnt
    FROM public.empleado_horarios
    WHERE tenant_id IS NOT NULL
      AND id_empleado IS NOT NULL
      AND activo = true
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_empleado
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_empleado_horarios_activo_por_empleado'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, id_empleado, fecha_terminacion, COUNT(*) AS cnt
    FROM public.liquidaciones
    WHERE tenant_id IS NOT NULL
      AND id_empleado IS NOT NULL
      AND fecha_terminacion IS NOT NULL
      AND estado IN ('calculada', 'aprobada', 'pagada')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_empleado, fecha_terminacion
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_liquidaciones_scope'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, planilla_id, fecha, upper(btrim(numero_operacion)) AS op_norm, COUNT(*) AS cnt
    FROM public.historial_pagos_planilla
    WHERE tenant_id IS NOT NULL
      AND planilla_id IS NOT NULL
      AND fecha IS NOT NULL
      AND numero_operacion IS NOT NULL
      AND btrim(numero_operacion) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, planilla_id, fecha, upper(btrim(numero_operacion))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_historial_pagos_planilla_scope'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  -- Filas invalidas por reglas de negocio
  SELECT COUNT(*)
  INTO v_count
  FROM public.beneficios b
  WHERE (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
    AND (
      b.monto < 0
      OR b.estado NOT IN ('activo', 'inactivo', 'archivado')
      OR (b.fecha_inicio IS NOT NULL AND b.fecha_fin IS NOT NULL AND b.fecha_fin < b.fecha_inicio)
    );
  RETURN QUERY SELECT 'beneficios_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.capacitaciones c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      c.duracion_horas < 0
      OR c.costo < 0
      OR c.estado NOT IN ('activo', 'inactivo', 'completada', 'cancelada')
      OR (c.fecha_inicio IS NOT NULL AND c.fecha_fin IS NOT NULL AND c.fecha_fin < c.fecha_inicio)
    );
  RETURN QUERY SELECT 'capacitaciones_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.horarios_trabajo h
  WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
    AND (
      h.tolerancia_minutos < 0
      OR h.estado NOT IN ('activo', 'inactivo')
      OR (h.hora_inicio IS NOT NULL AND h.hora_fin IS NOT NULL AND h.hora_inicio = h.hora_fin)
    );
  RETURN QUERY SELECT 'horarios_trabajo_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_beneficios eb
  WHERE (p_tenant_id IS NULL OR eb.tenant_id = p_tenant_id)
    AND (
      eb.estado NOT IN ('activo', 'inactivo', 'suspendido', 'vencido')
      OR (eb.fecha_inicio IS NOT NULL AND eb.fecha_fin IS NOT NULL AND eb.fecha_fin < eb.fecha_inicio)
    );
  RETURN QUERY SELECT 'empleado_beneficios_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_capacitaciones ec
  WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id)
    AND (
      ec.estado NOT IN ('inscrito', 'en_progreso', 'completado', 'aprobado', 'reprobado', 'cancelado')
      OR ec.calificacion < 0
      OR ec.calificacion > 100
      OR (ec.fecha_inscripcion IS NOT NULL AND ec.fecha_completado IS NOT NULL AND ec.fecha_completado < ec.fecha_inscripcion)
    );
  RETURN QUERY SELECT 'empleado_capacitaciones_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_horarios eh
  WHERE (p_tenant_id IS NULL OR eh.tenant_id = p_tenant_id)
    AND (
      eh.estado NOT IN ('activo', 'inactivo', 'suspendido')
      OR (eh.fecha_inicio IS NOT NULL AND eh.fecha_fin IS NOT NULL AND eh.fecha_fin < eh.fecha_inicio)
    );
  RETURN QUERY SELECT 'empleado_horarios_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.expediente_documentos ed
  WHERE (p_tenant_id IS NULL OR ed.tenant_id = p_tenant_id)
    AND (
      ed.estado NOT IN ('activo', 'archivado', 'eliminado')
      OR ed.tipo_documento NOT IN ('contrato', 'dni', 'cv', 'certificado', 'licencia', 'otro')
      OR ed.tamanio_bytes < 0
      OR (ed.fecha_subida IS NOT NULL AND ed.fecha_verificacion IS NOT NULL AND ed.fecha_verificacion < ed.fecha_subida)
    );
  RETURN QUERY SELECT 'expediente_documentos_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.liquidaciones l
  WHERE (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
    AND (
      l.estado NOT IN ('calculada', 'aprobada', 'pagada', 'anulada')
      OR l.motivo_terminacion NOT IN ('renuncia', 'despido', 'fin_contrato', 'mutuo_acuerdo', 'abandono', 'fallecimiento', 'otro')
      OR l.monto_cts < 0
      OR l.vacaciones_pendientes < 0
      OR l.indemnizacion < 0
      OR l.dias_cts < 0
      OR l.total_liquidacion < (l.monto_cts + l.indemnizacion)
      OR (l.fecha_terminacion IS NOT NULL AND l.ultimo_dia_trabajado IS NOT NULL AND l.ultimo_dia_trabajado > l.fecha_terminacion)
      OR (l.metodo_pago IS NOT NULL AND l.metodo_pago NOT IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'otro'))
    );
  RETURN QUERY SELECT 'liquidaciones_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.historial_pagos_planilla h
  WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
    AND (
      h.estado NOT IN ('registrado', 'anulado', 'conciliado')
      OR h.monto < 0
      OR h.empleados_count < 0
      OR h.fecha IS NULL
      OR h.metodo NOT IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'mixto', 'otro')
      OR h.metodo_pago NOT IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'mixto', 'otro')
    );
  RETURN QUERY SELECT 'historial_pagos_planilla_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  -- Mismatch tenant por relaciones
  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_beneficios eb
  LEFT JOIN public.empleados e ON e.id = eb.id_empleado
  LEFT JOIN public.beneficios b ON b.id = eb.id_beneficio
  WHERE (p_tenant_id IS NULL OR eb.tenant_id = p_tenant_id)
    AND (
      (e.id IS NOT NULL AND e.tenant_id IS NOT NULL AND eb.tenant_id <> e.tenant_id)
      OR (b.id IS NOT NULL AND b.tenant_id IS NOT NULL AND eb.tenant_id <> b.tenant_id)
    );
  RETURN QUERY SELECT 'empleado_beneficios_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_capacitaciones ec
  LEFT JOIN public.empleados e ON e.id = ec.id_empleado
  LEFT JOIN public.capacitaciones c ON c.id = ec.id_capacitacion
  WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id)
    AND (
      (e.id IS NOT NULL AND e.tenant_id IS NOT NULL AND ec.tenant_id <> e.tenant_id)
      OR (c.id IS NOT NULL AND c.tenant_id IS NOT NULL AND ec.tenant_id <> c.tenant_id)
    );
  RETURN QUERY SELECT 'empleado_capacitaciones_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_horarios eh
  LEFT JOIN public.empleados e ON e.id = eh.id_empleado
  LEFT JOIN public.horarios_trabajo h ON h.id = eh.id_horario
  WHERE (p_tenant_id IS NULL OR eh.tenant_id = p_tenant_id)
    AND (
      (e.id IS NOT NULL AND e.tenant_id IS NOT NULL AND eh.tenant_id <> e.tenant_id)
      OR (h.id IS NOT NULL AND h.tenant_id IS NOT NULL AND eh.tenant_id <> h.tenant_id)
    );
  RETURN QUERY SELECT 'empleado_horarios_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.expediente_documentos ed
  LEFT JOIN public.empleados e ON e.id = ed.id_empleado
  LEFT JOIN public.usuarios_sistema u ON u.id = ed.subido_por
  WHERE (p_tenant_id IS NULL OR ed.tenant_id = p_tenant_id)
    AND (
      (e.id IS NOT NULL AND e.tenant_id IS NOT NULL AND ed.tenant_id <> e.tenant_id)
      OR (u.id IS NOT NULL AND u.tenant_id IS NOT NULL AND ed.tenant_id <> u.tenant_id)
    );
  RETURN QUERY SELECT 'expediente_documentos_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.liquidaciones l
  LEFT JOIN public.empleados e ON e.id = l.id_empleado
  WHERE (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
    AND e.id IS NOT NULL
    AND e.tenant_id IS NOT NULL
    AND l.tenant_id <> e.tenant_id;
  RETURN QUERY SELECT 'liquidaciones_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.historial_pagos_planilla h
  LEFT JOIN public.planillas p ON p.id = h.planilla_id
  WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
    AND p.id IS NOT NULL
    AND p.tenant_id IS NOT NULL
    AND h.tenant_id <> p.tenant_id;
  RETURN QUERY SELECT 'historial_pagos_planilla_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  -- Huerfanos por relaciones clave
  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_beneficios eb
  LEFT JOIN public.empleados e ON e.id = eb.id_empleado
  WHERE eb.id_empleado IS NOT NULL
    AND e.id IS NULL
    AND (p_tenant_id IS NULL OR eb.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'empleado_beneficios_orphans_empleado'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_capacitaciones ec
  LEFT JOIN public.capacitaciones c ON c.id = ec.id_capacitacion
  WHERE ec.id_capacitacion IS NOT NULL
    AND c.id IS NULL
    AND (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'empleado_capacitaciones_orphans_capacitacion'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_horarios eh
  LEFT JOIN public.horarios_trabajo h ON h.id = eh.id_horario
  WHERE eh.id_horario IS NOT NULL
    AND h.id IS NULL
    AND (p_tenant_id IS NULL OR eh.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'empleado_horarios_orphans_horario'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.expediente_documentos ed
  LEFT JOIN public.empleados e ON e.id = ed.id_empleado
  WHERE ed.id_empleado IS NOT NULL
    AND e.id IS NULL
    AND (p_tenant_id IS NULL OR ed.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'expediente_documentos_orphans_empleado'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.liquidaciones l
  LEFT JOIN public.empleados e ON e.id = l.id_empleado
  WHERE l.id_empleado IS NOT NULL
    AND e.id IS NULL
    AND (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'liquidaciones_orphans_empleado'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.historial_pagos_planilla h
  LEFT JOIN public.planillas p ON p.id = h.planilla_id
  WHERE h.planilla_id IS NOT NULL
    AND p.id IS NULL
    AND (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'historial_pagos_planilla_orphans_planilla'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_personal_operativo_runtime_status_actual AS
SELECT *
FROM public.validar_rrhh_personal_operativo_runtime(app.current_tenant_id());

COMMIT;
