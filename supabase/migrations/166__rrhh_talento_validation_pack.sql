-- ============================================================================
-- 166__rrhh_talento_validation_pack.sql
-- Pack de validacion runtime para:
-- vacantes, candidatos, solicitudes, evaluaciones.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_talento_runtime(
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
      ('vacantes', 'trg_normalize_vacantes_row', 'normalizacion en vacantes'),
      ('candidatos', 'trg_normalize_candidatos_row', 'normalizacion en candidatos'),
      ('solicitudes', 'trg_normalize_solicitudes_row', 'normalizacion en solicitudes'),
      ('evaluaciones', 'trg_normalize_evaluaciones_row', 'normalizacion en evaluaciones')
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
      ('vacantes', 'trg_enforce_vacantes_tenant_consistency', 'consistencia tenant en vacantes'),
      ('candidatos', 'trg_enforce_candidatos_tenant_consistency', 'consistencia tenant en candidatos'),
      ('solicitudes', 'trg_enforce_solicitudes_tenant_consistency', 'consistencia tenant en solicitudes'),
      ('evaluaciones', 'trg_enforce_evaluaciones_tenant_consistency', 'consistencia tenant en evaluaciones')
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
    'vacantes_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 16
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'vacantes'
        AND c.column_name IN (
          'tenant_id', 'titulo', 'descripcion', 'puesto_solicitado', 'departamento_id',
          'ubicacion', 'tipo_contrato', 'salario_minimo', 'salario_maximo',
          'salario_min', 'salario_max', 'fecha_publicacion', 'fecha_cierre',
          'fecha_limite', 'departamento', 'activo'
        )
    ),
    'columnas runtime de vacantes';

  RETURN QUERY
  SELECT
    'candidatos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 17
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'candidatos'
        AND c.column_name IN (
          'tenant_id', 'id_vacante', 'vacante_id', 'nombres', 'apellidos', 'email',
          'telefono', 'numero_documento', 'tipo_documento', 'nivel_educacion',
          'experiencia_anos', 'pretension_salarial', 'estado', 'estado_proceso',
          'puntuacion_cv', 'fecha_postulacion', 'modalidad_trabajo_preferida'
        )
    ),
    'columnas runtime de candidatos';

  RETURN QUERY
  SELECT
    'solicitudes_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 11
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'solicitudes'
        AND c.column_name IN (
          'tenant_id', 'id_empleado', 'tipo', 'fecha_inicio', 'fecha_fin',
          'dias', 'motivo', 'estado', 'aprobado_por', 'fecha_aprobacion', 'activo'
        )
    ),
    'columnas runtime de solicitudes';

  RETURN QUERY
  SELECT
    'evaluaciones_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'evaluaciones'
        AND c.column_name IN (
          'tenant_id', 'id_empleado', 'evaluador_id', 'fecha_evaluacion', 'periodo',
          'tipo', 'puntaje_total', 'estado', 'proxima_evaluacion', 'activo'
        )
    ),
    'columnas runtime de evaluaciones';

  -- FKs esperadas
  RETURN QUERY
  WITH expected(conname, relname, detail) AS (
    VALUES
      ('vacantes_departamento_id_fkey', 'vacantes', 'FK vacantes -> departamentos'),
      ('candidatos_id_vacante_fkey', 'candidatos', 'FK candidatos.id_vacante -> vacantes'),
      ('candidatos_vacante_id_fkey', 'candidatos', 'FK candidatos.vacante_id -> vacantes'),
      ('solicitudes_id_empleado_fkey', 'solicitudes', 'FK solicitudes -> empleados'),
      ('solicitudes_aprobado_por_fkey', 'solicitudes', 'FK solicitudes -> usuarios_sistema'),
      ('evaluaciones_id_empleado_fkey', 'evaluaciones', 'FK evaluaciones -> empleados'),
      ('evaluaciones_evaluador_id_fkey', 'evaluaciones', 'FK evaluaciones -> usuarios_sistema')
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
      ('vacantes', 'idx_vacantes_tenant_estado_fecha_runtime', 'indice tenant+estado+fecha en vacantes'),
      ('vacantes', 'idx_vacantes_tenant_departamento_fecha_runtime', 'indice tenant+departamento+fecha en vacantes'),
      ('candidatos', 'idx_candidatos_tenant_vacante_fecha_runtime', 'indice tenant+vacante+fecha en candidatos'),
      ('candidatos', 'idx_candidatos_tenant_estado_fecha_runtime', 'indice tenant+estado+fecha en candidatos'),
      ('solicitudes', 'idx_solicitudes_tenant_empleado_estado_fecha_runtime', 'indice tenant+empleado+estado+fecha en solicitudes'),
      ('evaluaciones', 'idx_evaluaciones_tenant_empleado_fecha_runtime', 'indice tenant+empleado+fecha en evaluaciones'),
      ('vacantes', 'ux_vacantes_tenant_titulo_puesto_activo', 'unicidad vacantes por tenant+titulo+puesto'),
      ('candidatos', 'ux_candidatos_tenant_vacante_email', 'unicidad candidatos por tenant+vacante+email'),
      ('solicitudes', 'ux_solicitudes_tenant_empleado_tipo_rango', 'unicidad solicitudes por tenant+empleado+tipo+rango'),
      ('evaluaciones', 'ux_evaluaciones_tenant_empleado_fecha', 'unicidad evaluaciones por tenant+empleado+fecha')
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
    VALUES ('vacantes'), ('candidatos'), ('solicitudes'), ('evaluaciones')
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
    SELECT tenant_id, upper(btrim(titulo)) AS titulo_norm, upper(btrim(puesto_solicitado)) AS puesto_norm, COUNT(*) AS cnt
    FROM public.vacantes
    WHERE tenant_id IS NOT NULL
      AND titulo IS NOT NULL
      AND btrim(titulo) <> ''
      AND puesto_solicitado IS NOT NULL
      AND btrim(puesto_solicitado) <> ''
      AND estado IN ('activa', 'pausada', 'borrador')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(titulo)), upper(btrim(puesto_solicitado))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_vacantes_tenant_titulo_puesto'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, id_vacante, lower(btrim(email)) AS email_norm, COUNT(*) AS cnt
    FROM public.candidatos
    WHERE tenant_id IS NOT NULL
      AND id_vacante IS NOT NULL
      AND email IS NOT NULL
      AND btrim(email) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_vacante, lower(btrim(email))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_candidatos_tenant_vacante_email'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, id_empleado, lower(btrim(tipo)) AS tipo_norm, fecha_inicio, fecha_fin, COUNT(*) AS cnt
    FROM public.solicitudes
    WHERE tenant_id IS NOT NULL
      AND id_empleado IS NOT NULL
      AND tipo IS NOT NULL
      AND btrim(tipo) <> ''
      AND fecha_inicio IS NOT NULL
      AND fecha_fin IS NOT NULL
      AND estado IN ('pendiente', 'aprobada')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_empleado, lower(btrim(tipo)), fecha_inicio, fecha_fin
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_solicitudes_tenant_empleado_tipo_rango'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, id_empleado, fecha_evaluacion, COUNT(*) AS cnt
    FROM public.evaluaciones
    WHERE tenant_id IS NOT NULL
      AND id_empleado IS NOT NULL
      AND fecha_evaluacion IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_empleado, fecha_evaluacion
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_evaluaciones_tenant_empleado_fecha'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  -- Filas invalidas por reglas de negocio
  SELECT COUNT(*)
  INTO v_count
  FROM public.vacantes v
  WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    AND (
      v.salario_minimo < 0
      OR v.salario_maximo < 0
      OR v.salario_maximo < v.salario_minimo
      OR v.salario_min < 0
      OR v.salario_max < 0
      OR v.salario_max < v.salario_min
      OR v.estado NOT IN ('activa', 'pausada', 'cerrada', 'cancelada', 'borrador')
      OR v.tipo_contrato NOT IN ('tiempo_completo', 'medio_tiempo', 'contrato', 'pasantia', 'freelance')
      OR (v.fecha_publicacion IS NOT NULL AND v.fecha_limite IS NOT NULL AND v.fecha_limite < v.fecha_publicacion)
      OR (v.fecha_publicacion IS NOT NULL AND v.fecha_cierre IS NOT NULL AND v.fecha_cierre < v.fecha_publicacion)
    );
  RETURN QUERY SELECT 'vacantes_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.candidatos c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      c.experiencia_anos < 0
      OR c.pretension_salarial < 0
      OR c.puntuacion_cv < 0
      OR c.puntuacion_cv > 100
      OR c.estado NOT IN ('postulante', 'entrevista', 'seleccionado', 'rechazado', 'contratado', 'descartado')
      OR c.modalidad_trabajo_preferida NOT IN ('presencial', 'remoto', 'hibrido')
      OR (c.email IS NOT NULL AND position('@' IN c.email) <= 1)
    );
  RETURN QUERY SELECT 'candidatos_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.solicitudes s
  WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
    AND (
      s.dias < 0
      OR s.estado NOT IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')
      OR s.tipo NOT IN ('vacaciones', 'licencia', 'permiso', 'descanso_medico', 'compensacion', 'otro')
      OR (s.fecha_inicio IS NOT NULL AND s.fecha_fin IS NOT NULL AND s.fecha_fin < s.fecha_inicio)
      OR (s.estado IN ('aprobada', 'rechazada') AND s.fecha_aprobacion IS NULL)
    );
  RETURN QUERY SELECT 'solicitudes_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.evaluaciones e
  WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
    AND (
      e.puntaje_total < 0
      OR e.puntaje_total > 100
      OR e.estado NOT IN ('borrador', 'programada', 'completada', 'aprobada', 'rechazada')
      OR e.tipo NOT IN ('desempeno', 'periodica', 'prueba', '360', 'objetivos', 'otro')
      OR (e.proxima_evaluacion IS NOT NULL AND e.fecha_evaluacion IS NOT NULL AND e.proxima_evaluacion < e.fecha_evaluacion)
    );
  RETURN QUERY SELECT 'evaluaciones_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  -- Mismatch tenant por relaciones
  SELECT COUNT(*)
  INTO v_count
  FROM public.vacantes v
  LEFT JOIN public.departamentos d ON d.id = v.departamento_id
  WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    AND d.id IS NOT NULL
    AND d.tenant_id IS NOT NULL
    AND v.tenant_id <> d.tenant_id;
  RETURN QUERY SELECT 'vacantes_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.candidatos c
  LEFT JOIN public.vacantes v ON v.id = c.id_vacante
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND v.id IS NOT NULL
    AND v.tenant_id IS NOT NULL
    AND c.tenant_id <> v.tenant_id;
  RETURN QUERY SELECT 'candidatos_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.solicitudes s
  LEFT JOIN public.empleados e ON e.id = s.id_empleado
  LEFT JOIN public.usuarios_sistema u ON u.id = s.aprobado_por
  WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
    AND (
      (e.id IS NOT NULL AND e.tenant_id IS NOT NULL AND s.tenant_id <> e.tenant_id)
      OR (u.id IS NOT NULL AND u.tenant_id IS NOT NULL AND s.tenant_id <> u.tenant_id)
    );
  RETURN QUERY SELECT 'solicitudes_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.evaluaciones ev
  LEFT JOIN public.empleados e ON e.id = ev.id_empleado
  LEFT JOIN public.usuarios_sistema u ON u.id = ev.evaluador_id
  WHERE (p_tenant_id IS NULL OR ev.tenant_id = p_tenant_id)
    AND (
      (e.id IS NOT NULL AND e.tenant_id IS NOT NULL AND ev.tenant_id <> e.tenant_id)
      OR (u.id IS NOT NULL AND u.tenant_id IS NOT NULL AND ev.tenant_id <> u.tenant_id)
    );
  RETURN QUERY SELECT 'evaluaciones_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  -- Huerfanos por relaciones clave
  SELECT COUNT(*)
  INTO v_count
  FROM public.candidatos c
  LEFT JOIN public.vacantes v ON v.id = c.id_vacante
  WHERE c.id_vacante IS NOT NULL
    AND v.id IS NULL
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'candidatos_orphans_vacante'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.solicitudes s
  LEFT JOIN public.empleados e ON e.id = s.id_empleado
  WHERE s.id_empleado IS NOT NULL
    AND e.id IS NULL
    AND (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'solicitudes_orphans_empleado'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.evaluaciones ev
  LEFT JOIN public.empleados e ON e.id = ev.id_empleado
  WHERE ev.id_empleado IS NOT NULL
    AND e.id IS NULL
    AND (p_tenant_id IS NULL OR ev.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'evaluaciones_orphans_empleado'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_talento_runtime_status_actual AS
SELECT *
FROM public.validar_rrhh_talento_runtime(app.current_tenant_id());

COMMIT;
