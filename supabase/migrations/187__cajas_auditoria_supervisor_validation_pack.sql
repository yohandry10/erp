-- ============================================================================
-- 187__cajas_auditoria_supervisor_validation_pack.sql
-- Runtime validation pack for:
-- - caja_audit_log
-- - supervisor_pins
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_cajas_auditoria_supervisor_runtime(
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
  -- Normalize triggers.
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('caja_audit_log', 'trg_normalize_caja_audit_log_row', 'normalize caja_audit_log'),
      ('supervisor_pins', 'trg_normalize_supervisor_pins_row', 'normalize supervisor_pins')
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

  -- Enforce triggers.
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('caja_audit_log', 'trg_enforce_caja_audit_log_tenant_consistency', 'tenant consistency caja_audit_log'),
      ('supervisor_pins', 'trg_enforce_supervisor_pins_tenant_consistency', 'tenant consistency supervisor_pins')
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

  -- Runtime column shape.
  RETURN QUERY
  SELECT
    'caja_audit_log_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'caja_audit_log'
        AND column_name IN ('tenant_id', 'sesion_caja_id', 'usuario_id', 'evento', 'ip_address', 'user_agent', 'parametros', 'resultado', 'riesgo', 'timestamp')
    ),
    'runtime shape caja_audit_log'::text;

  RETURN QUERY
  SELECT
    'supervisor_pins_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 11
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'supervisor_pins'
        AND column_name IN ('tenant_id', 'usuario_id', 'hash_pin', 'salt', 'algoritmo', 'pin_version', 'intentos_fallidos', 'ultimo_intento_at', 'bloqueado_hasta', 'ultimo_cambio_at', 'activo')
    ),
    'runtime shape supervisor_pins'::text;

  -- FKs.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('caja_audit_log', 'caja_audit_log_sesion_caja_id_fkey_runtime', 'FK caja_audit_log -> sesiones_caja'),
      ('caja_audit_log', 'caja_audit_log_usuario_id_fkey_runtime', 'FK caja_audit_log -> usuarios_sistema'),
      ('supervisor_pins', 'supervisor_pins_usuario_id_fkey_runtime', 'FK supervisor_pins -> usuarios_sistema')
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
    ),
    e.detail::text
  FROM expected e;

  -- Indexes / unique indexes.
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('caja_audit_log', 'idx_caja_audit_log_tenant_evento_timestamp_runtime', 'runtime index by evento'),
      ('caja_audit_log', 'idx_caja_audit_log_tenant_usuario_timestamp_runtime', 'runtime index by usuario'),
      ('caja_audit_log', 'idx_caja_audit_log_tenant_sesion_timestamp_runtime', 'runtime index by sesion'),
      ('caja_audit_log', 'idx_caja_audit_log_tenant_riesgo_timestamp_runtime', 'runtime index by riesgo'),
      ('supervisor_pins', 'idx_supervisor_pins_tenant_usuario_estado_runtime', 'runtime index supervisor by state'),
      ('supervisor_pins', 'idx_supervisor_pins_bloqueado_hasta_runtime', 'runtime index supervisor bloqueo'),
      ('supervisor_pins', 'ux_supervisor_pins_tenant_usuario_activo_runtime', 'unique active supervisor pin by tenant+usuario')
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

  -- RLS enabled + forced.
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

  -- Duplicate checks.
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

  -- Invalid row checks.
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
      OR c.estado NOT IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO')
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
      OR sp.estado NOT IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO', 'REVOCADO')
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

  -- Tenant mismatch checks.
  SELECT COUNT(*)
  INTO v_count
  FROM public.caja_audit_log c
  LEFT JOIN public.sesiones_caja s ON s.id = c.sesion_caja_id
  LEFT JOIN public.usuarios_sistema u ON u.id = c.usuario_id
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      (s.id IS NOT NULL AND c.tenant_id IS DISTINCT FROM s.tenant_id)
      OR (u.id IS NOT NULL AND c.tenant_id IS DISTINCT FROM u.tenant_id)
    );
  RETURN QUERY
  SELECT 'caja_audit_log_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.supervisor_pins sp
  JOIN public.usuarios_sistema u ON u.id = sp.usuario_id
  WHERE (p_tenant_id IS NULL OR sp.tenant_id = p_tenant_id)
    AND sp.tenant_id IS DISTINCT FROM u.tenant_id;
  RETURN QUERY
  SELECT 'supervisor_pins_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  -- Operational coverage check for active cajas audit logging.
  RETURN QUERY
  SELECT
    'caja_audit_log_has_events_last_365d_or_empty'::text,
    (
      SELECT
        (COUNT(*) = 0)
        OR EXISTS (
          SELECT 1
          FROM public.caja_audit_log c2
          WHERE (p_tenant_id IS NULL OR c2.tenant_id = p_tenant_id)
            AND c2."timestamp" >= (now() - interval '365 days')
        )
      FROM public.caja_audit_log c1
      WHERE (p_tenant_id IS NULL OR c1.tenant_id = p_tenant_id)
    ),
    'if there are rows, at least one recent event in last 365d';
END;
$$;

CREATE OR REPLACE VIEW public.v_cajas_auditoria_supervisor_runtime_status_actual AS
SELECT *
FROM public.validar_cajas_auditoria_supervisor_runtime(NULL);

COMMIT;
