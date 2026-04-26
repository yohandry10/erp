-- ============================================================================
-- 196__rrhh_asistencia_validation_pack.sql
-- Pack de validacion runtime para asistencia RRHH:
-- tablas: asistencia, asistencias.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_asistencia_runtime(
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
  -- Triggers de normalizacion y sync.
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('asistencia', 'trg_normalize_asistencia_row', 'normalizacion en asistencia'),
      ('asistencias', 'trg_normalize_asistencias_row', 'normalizacion en asistencias'),
      ('asistencia', 'trg_sync_asistencia_to_asistencias', 'sync asistencia -> asistencias'),
      ('asistencias', 'trg_sync_asistencias_to_asistencia', 'sync asistencias -> asistencia')
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

  -- Triggers de consistencia tenant.
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('asistencia', 'trg_enforce_asistencia_tenant_consistency', 'consistencia tenant en asistencia'),
      ('asistencias', 'trg_enforce_asistencias_tenant_consistency', 'consistencia tenant en asistencias')
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

  -- Shape runtime de columnas.
  RETURN QUERY
  SELECT
    'asistencia_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 14
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'asistencia'
        AND c.column_name IN (
          'tenant_id', 'id_empleado', 'empleado_id', 'fecha',
          'hora_entrada', 'hora_salida', 'horas_trabajadas', 'estado',
          'tardanza_minutos', 'turno', 'observaciones', 'marcado_por',
          'origen', 'activo'
        )
    ),
    'columnas runtime de asistencia';

  RETURN QUERY
  SELECT
    'asistencias_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 14
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'asistencias'
        AND c.column_name IN (
          'tenant_id', 'empleado_id', 'id_empleado', 'fecha',
          'hora_entrada', 'hora_salida', 'horas_trabajadas', 'estado',
          'tardanza_minutos', 'turno', 'observaciones', 'marcado_por',
          'origen', 'activo'
        )
    ),
    'columnas runtime de asistencias';

  -- FKs esperadas.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('asistencia', 'asistencia_id_empleado_fkey_runtime', 'FK asistencia -> empleados'),
      ('asistencias', 'asistencias_empleado_id_fkey_runtime', 'FK asistencias -> empleados')
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

  -- Indices esperados.
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('asistencia', 'idx_asistencia_tenant_fecha_estado_runtime', 'indice runtime asistencia por fecha/estado'),
      ('asistencia', 'idx_asistencia_tenant_empleado_fecha_runtime', 'indice runtime asistencia por empleado'),
      ('asistencia', 'idx_asistencia_tenant_tardanza_runtime', 'indice runtime asistencia tardanza'),
      ('asistencias', 'idx_asistencias_tenant_fecha_estado_runtime', 'indice runtime asistencias por fecha/estado'),
      ('asistencias', 'idx_asistencias_tenant_empleado_fecha_runtime', 'indice runtime asistencias por empleado'),
      ('asistencias', 'idx_asistencias_tenant_tardanza_runtime', 'indice runtime asistencias tardanza'),
      ('asistencia', 'ux_asistencia_tenant_empleado_fecha_runtime', 'unicidad asistencia por tenant+empleado+fecha'),
      ('asistencias', 'ux_asistencias_tenant_empleado_fecha_runtime', 'unicidad asistencias por tenant+empleado+fecha')
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

  -- RLS enabled + forced.
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('asistencia'),
      ('asistencias')
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

  -- Duplicados por scope.
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, id_empleado, fecha, COUNT(*)
    FROM public.asistencia
    WHERE tenant_id IS NOT NULL
      AND id_empleado IS NOT NULL
      AND fecha IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_empleado, fecha
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY SELECT 'asistencia_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, empleado_id, fecha, COUNT(*)
    FROM public.asistencias
    WHERE tenant_id IS NOT NULL
      AND empleado_id IS NOT NULL
      AND fecha IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, empleado_id, fecha
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY SELECT 'asistencias_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count)::text;

  -- Filas invalidas por reglas de negocio.
  SELECT COUNT(*) INTO v_count
  FROM public.asistencia a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      a.tenant_id IS NULL
      OR a.id_empleado IS NULL
      OR a.fecha IS NULL
      OR a.estado NOT IN ('presente', 'ausente', 'tardanza', 'justificado', 'licencia', 'vacaciones')
      OR a.horas_trabajadas < 0
      OR a.horas_trabajadas > 24
      OR a.tardanza_minutos < 0
      OR a.tardanza_minutos > 1440
      OR (a.hora_salida IS NOT NULL AND a.hora_entrada IS NULL)
      OR (a.turno IS NOT NULL AND a.turno NOT IN ('manana', 'tarde', 'noche', 'mixto'))
      OR (a.origen IS NOT NULL AND a.origen NOT IN ('manual', 'web', 'api', 'biometrico', 'importacion', 'job', 'sistema'))
    );
  RETURN QUERY SELECT 'asistencia_invalid_rows'::text, (v_count = 0), format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.asistencias a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      a.tenant_id IS NULL
      OR a.empleado_id IS NULL
      OR a.fecha IS NULL
      OR a.estado NOT IN ('presente', 'ausente', 'tardanza', 'justificado', 'licencia', 'vacaciones')
      OR a.horas_trabajadas < 0
      OR a.horas_trabajadas > 24
      OR a.tardanza_minutos < 0
      OR a.tardanza_minutos > 1440
      OR (a.hora_salida IS NOT NULL AND a.hora_entrada IS NULL)
      OR (a.turno IS NOT NULL AND a.turno NOT IN ('manana', 'tarde', 'noche', 'mixto'))
      OR (a.origen IS NOT NULL AND a.origen NOT IN ('manual', 'web', 'api', 'biometrico', 'importacion', 'job', 'sistema'))
    );
  RETURN QUERY SELECT 'asistencias_invalid_rows'::text, (v_count = 0), format('filas invalidas: %s', v_count)::text;

  -- Mismatch tenant por relaciones.
  SELECT COUNT(*) INTO v_count
  FROM public.asistencia a
  LEFT JOIN public.empleados e ON e.id = a.id_empleado
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND e.id IS NOT NULL
    AND e.tenant_id IS NOT NULL
    AND a.tenant_id <> e.tenant_id;
  RETURN QUERY SELECT 'asistencia_tenant_mismatch_empleado'::text, (v_count = 0), format('mismatches: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.asistencias a
  LEFT JOIN public.empleados e ON e.id = a.empleado_id
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND e.id IS NOT NULL
    AND e.tenant_id IS NOT NULL
    AND a.tenant_id <> e.tenant_id;
  RETURN QUERY SELECT 'asistencias_tenant_mismatch_empleado'::text, (v_count = 0), format('mismatches: %s', v_count)::text;

  -- Huerfanos por relacion con empleados.
  SELECT COUNT(*) INTO v_count
  FROM public.asistencia a
  LEFT JOIN public.empleados e ON e.id = a.id_empleado
  WHERE a.id_empleado IS NOT NULL
    AND e.id IS NULL
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'asistencia_orphans_empleado'::text, (v_count = 0), format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.asistencias a
  LEFT JOIN public.empleados e ON e.id = a.empleado_id
  WHERE a.empleado_id IS NOT NULL
    AND e.id IS NULL
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'asistencias_orphans_empleado'::text, (v_count = 0), format('huerfanos: %s', v_count)::text;

  -- Gaps de sincronizacion entre tablas alias.
  SELECT COUNT(*) INTO v_count
  FROM public.asistencia a
  LEFT JOIN public.asistencias b
    ON b.tenant_id = a.tenant_id
   AND b.empleado_id = a.id_empleado
   AND b.fecha = a.fecha
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND a.tenant_id IS NOT NULL
    AND a.id_empleado IS NOT NULL
    AND a.fecha IS NOT NULL
    AND b.id IS NULL;
  RETURN QUERY SELECT 'sync_gap_asistencia_not_in_asistencias'::text, (v_count = 0), format('missing=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.asistencias b
  LEFT JOIN public.asistencia a
    ON a.tenant_id = b.tenant_id
   AND a.id_empleado = b.empleado_id
   AND a.fecha = b.fecha
  WHERE (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
    AND b.tenant_id IS NOT NULL
    AND b.empleado_id IS NOT NULL
    AND b.fecha IS NOT NULL
    AND a.id IS NULL;
  RETURN QUERY SELECT 'sync_gap_asistencias_not_in_asistencia'::text, (v_count = 0), format('missing=%s', v_count)::text;

  -- Diferencias de payload entre alias sincronizados.
  SELECT COUNT(*) INTO v_count
  FROM public.asistencia a
  JOIN public.asistencias b
    ON b.tenant_id = a.tenant_id
   AND b.empleado_id = a.id_empleado
   AND b.fecha = a.fecha
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      COALESCE(a.estado, '') <> COALESCE(b.estado, '')
      OR COALESCE(a.hora_entrada::text, '') <> COALESCE(b.hora_entrada::text, '')
      OR COALESCE(a.hora_salida::text, '') <> COALESCE(b.hora_salida::text, '')
      OR COALESCE(a.horas_trabajadas, 0) <> COALESCE(b.horas_trabajadas, 0)
      OR COALESCE(a.tardanza_minutos, 0) <> COALESCE(b.tardanza_minutos, 0)
    );
  RETURN QUERY SELECT 'sync_payload_mismatch_asistencia_asistencias'::text, (v_count = 0), format('mismatches=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_asistencia_runtime_status_actual AS
SELECT *
FROM public.validar_rrhh_asistencia_runtime(app.current_tenant_id());

COMMIT;

