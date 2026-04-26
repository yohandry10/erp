-- ============================================================================
-- 256__rrhh_talento_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en RRHH talento.
-- Tablas foco:
--   public.vacantes
--   public.candidatos
--   public.solicitudes
--   public.evaluaciones
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_talento_estado_case_insensitive_runtime(
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
      ('vacantes', 'estado', 'vacantes.estado usa citext'),
      ('candidatos', 'estado', 'candidatos.estado usa citext'),
      ('solicitudes', 'estado', 'solicitudes.estado usa citext'),
      ('evaluaciones', 'estado', 'evaluaciones.estado usa citext')
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
      ('normalize_vacantes_estado_254', 'helper vacantes'),
      ('normalize_candidatos_estado_254', 'helper candidatos'),
      ('normalize_solicitudes_estado_254', 'helper solicitudes'),
      ('normalize_evaluaciones_estado_254', 'helper evaluaciones')
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
      ('vacantes', 'trg_normalize_vacantes_row', 'normalizacion vacantes'),
      ('candidatos', 'trg_normalize_candidatos_row', 'normalizacion candidatos'),
      ('solicitudes', 'trg_normalize_solicitudes_row', 'normalizacion solicitudes'),
      ('evaluaciones', 'trg_normalize_evaluaciones_row', 'normalizacion evaluaciones'),
      ('vacantes', 'trg_enforce_vacantes_tenant_consistency', 'consistencia tenant vacantes'),
      ('candidatos', 'trg_enforce_candidatos_tenant_consistency', 'consistencia tenant candidatos'),
      ('solicitudes', 'trg_enforce_solicitudes_tenant_consistency', 'consistencia tenant solicitudes'),
      ('evaluaciones', 'trg_enforce_evaluaciones_tenant_consistency', 'consistencia tenant evaluaciones')
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
      ('vacantes', 'ck_vacantes_estado_runtime', 'constraint estado vacantes'),
      ('candidatos', 'ck_candidatos_estado_runtime', 'constraint estado candidatos'),
      ('solicitudes', 'ck_solicitudes_estado_runtime', 'constraint estado solicitudes'),
      ('evaluaciones', 'ck_evaluaciones_estado_runtime', 'constraint estado evaluaciones')
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
      ('vacantes', 'idx_vacantes_tenant_estado_ci_runtime_254', 'indice CI vacantes'),
      ('candidatos', 'idx_candidatos_tenant_estado_ci_runtime_254', 'indice CI candidatos'),
      ('solicitudes', 'idx_solicitudes_tenant_estado_ci_runtime_254', 'indice CI solicitudes'),
      ('evaluaciones', 'idx_evaluaciones_tenant_estado_ci_runtime_254', 'indice CI evaluaciones'),
      ('vacantes', 'ux_vacantes_tenant_titulo_puesto_activo', 'unicidad vacantes activo'),
      ('candidatos', 'ux_candidatos_tenant_vacante_email', 'unicidad candidatos vacante+email'),
      ('solicitudes', 'ux_solicitudes_tenant_empleado_tipo_rango', 'unicidad solicitudes activas'),
      ('evaluaciones', 'ux_evaluaciones_tenant_empleado_fecha', 'unicidad evaluaciones fecha')
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
    ),
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.vacantes v
       WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id) AND v.estado = 'ACTIVA')
    - (SELECT COUNT(*) FROM public.vacantes v
       WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id) AND v.estado = 'activa')
  ) INTO v_delta;
  RETURN QUERY SELECT 'vacantes_estado_case_insensitive_activa'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.candidatos c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'POSTULANTE')
    - (SELECT COUNT(*) FROM public.candidatos c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id) AND c.estado = 'postulante')
  ) INTO v_delta;
  RETURN QUERY SELECT 'candidatos_estado_case_insensitive_postulante'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.solicitudes s
       WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id) AND s.estado = 'APROBADA')
    - (SELECT COUNT(*) FROM public.solicitudes s
       WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id) AND s.estado = 'aprobada')
  ) INTO v_delta;
  RETURN QUERY SELECT 'solicitudes_estado_case_insensitive_aprobada'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.evaluaciones e
       WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id) AND e.estado = 'PROGRAMADA')
    - (SELECT COUNT(*) FROM public.evaluaciones e
       WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id) AND e.estado = 'programada')
  ) INTO v_delta;
  RETURN QUERY SELECT 'evaluaciones_estado_case_insensitive_programada'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

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
      AND lower(estado::text) IN ('activa', 'pausada', 'borrador')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(titulo)), upper(btrim(puesto_solicitado))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_vacantes_tenant_titulo_puesto_activo'::text, (v_count = 0), format('duplicados=%s', v_count)::text;

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
  RETURN QUERY SELECT 'dup_candidatos_tenant_vacante_email'::text, (v_count = 0), format('duplicados=%s', v_count)::text;

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
      AND lower(estado::text) IN ('pendiente', 'aprobada')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_empleado, lower(btrim(tipo)), fecha_inicio, fecha_fin
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_solicitudes_tenant_empleado_tipo_rango'::text, (v_count = 0), format('duplicados=%s', v_count)::text;

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
  RETURN QUERY SELECT 'dup_evaluaciones_tenant_empleado_fecha'::text, (v_count = 0), format('duplicados=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.vacantes v
  WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    AND (v.estado IS NULL OR lower(v.estado::text) NOT IN ('activa', 'pausada', 'cerrada', 'cancelada', 'borrador'));
  RETURN QUERY SELECT 'vacantes_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.candidatos c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (c.estado IS NULL OR lower(c.estado::text) NOT IN ('postulante', 'entrevista', 'seleccionado', 'rechazado', 'contratado', 'descartado'));
  RETURN QUERY SELECT 'candidatos_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.solicitudes s
  WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
    AND (s.estado IS NULL OR lower(s.estado::text) NOT IN ('pendiente', 'aprobada', 'rechazada', 'cancelada'));
  RETURN QUERY SELECT 'solicitudes_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.evaluaciones e
  WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
    AND (e.estado IS NULL OR lower(e.estado::text) NOT IN ('borrador', 'programada', 'completada', 'aprobada', 'rechazada'));
  RETURN QUERY SELECT 'evaluaciones_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_talento_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_rrhh_talento_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
