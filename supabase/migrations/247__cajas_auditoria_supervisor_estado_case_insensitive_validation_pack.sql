-- ============================================================================
-- 247__cajas_auditoria_supervisor_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en:
--   public.caja_audit_log
--   public.supervisor_pins
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_cajas_auditoria_supervisor_estado_case_insensitive_runtime(
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
      ('caja_audit_log', 'estado', 'caja_audit_log.estado usa citext'),
      ('supervisor_pins', 'estado', 'supervisor_pins.estado usa citext')
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
      ('normalize_caja_audit_estado_245', 'helper estado caja_audit_log'),
      ('normalize_supervisor_pin_estado_245', 'helper estado supervisor_pins')
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
      ('caja_audit_log', 'trg_normalize_caja_audit_log_row', 'trigger normalizacion caja_audit_log'),
      ('supervisor_pins', 'trg_normalize_supervisor_pins_row', 'trigger normalizacion supervisor_pins'),
      ('caja_audit_log', 'trg_enforce_caja_audit_log_tenant_consistency', 'trigger consistencia tenant caja_audit_log'),
      ('supervisor_pins', 'trg_enforce_supervisor_pins_tenant_consistency', 'trigger consistencia tenant supervisor_pins')
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
      ('caja_audit_log', 'ck_caja_audit_log_runtime', 'constraint runtime caja_audit_log'),
      ('supervisor_pins', 'ck_supervisor_pins_runtime', 'constraint runtime supervisor_pins')
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
      ('caja_audit_log', 'idx_caja_audit_log_tenant_evento_timestamp_runtime', 'indice runtime evento'),
      ('caja_audit_log', 'idx_caja_audit_log_tenant_riesgo_timestamp_runtime', 'indice runtime riesgo'),
      ('caja_audit_log', 'idx_caja_audit_log_tenant_estado_ci_runtime_245', 'indice runtime estado CI'),
      ('supervisor_pins', 'idx_supervisor_pins_tenant_usuario_estado_runtime', 'indice runtime supervisor estado'),
      ('supervisor_pins', 'idx_supervisor_pins_tenant_estado_ci_runtime_245', 'indice runtime supervisor estado CI'),
      ('supervisor_pins', 'ux_supervisor_pins_tenant_usuario_activo_runtime', 'unicidad pin activo por tenant+usuario')
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
      ('caja_audit_log'),
      ('supervisor_pins')
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
      (SELECT COUNT(*) FROM public.caja_audit_log c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
         AND c.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.caja_audit_log c
       WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
         AND c.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'caja_audit_log_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.supervisor_pins sp
       WHERE (p_tenant_id IS NULL OR sp.tenant_id = p_tenant_id)
         AND sp.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.supervisor_pins sp
       WHERE (p_tenant_id IS NULL OR sp.tenant_id = p_tenant_id)
         AND sp.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'supervisor_pins_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.supervisor_pins sp
       WHERE (p_tenant_id IS NULL OR sp.tenant_id = p_tenant_id)
         AND sp.estado = 'BLOQUEADO')
    - (SELECT COUNT(*) FROM public.supervisor_pins sp
       WHERE (p_tenant_id IS NULL OR sp.tenant_id = p_tenant_id)
         AND sp.estado = 'bloqueado')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'supervisor_pins_estado_case_insensitive_bloqueado'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, usuario_id, COUNT(*)
    FROM public.supervisor_pins
    WHERE tenant_id IS NOT NULL
      AND usuario_id IS NOT NULL
      AND COALESCE(activo, true) = true
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, usuario_id
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY
  SELECT 'supervisor_pins_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.caja_audit_log c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      c.tenant_id IS NULL
      OR c.evento IS NULL
      OR btrim(c.evento) = ''
      OR c."timestamp" IS NULL
      OR c.riesgo NOT IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO')
      OR c.estado IS NULL
      OR lower(c.estado::text) NOT IN ('activo', 'inactivo', 'archivado')
    );
  RETURN QUERY
  SELECT 'caja_audit_log_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.supervisor_pins sp
  WHERE (p_tenant_id IS NULL OR sp.tenant_id = p_tenant_id)
    AND (
      sp.tenant_id IS NULL
      OR sp.usuario_id IS NULL
      OR sp.estado IS NULL
      OR lower(sp.estado::text) NOT IN ('activo', 'inactivo', 'bloqueado', 'revocado')
      OR sp.intentos_fallidos < 0
      OR sp.intentos_fallidos > 100
      OR sp.pin_version < 1
      OR (
        COALESCE(sp.activo, false) = true
        AND (sp.hash_pin IS NULL OR btrim(sp.hash_pin) = '')
      )
    );
  RETURN QUERY
  SELECT 'supervisor_pins_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_cajas_auditoria_supervisor_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_cajas_auditoria_supervisor_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
