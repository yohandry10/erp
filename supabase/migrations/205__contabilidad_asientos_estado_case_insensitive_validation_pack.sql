-- ============================================================================
-- 205__contabilidad_asientos_estado_case_insensitive_validation_pack.sql
-- Validacion runtime del contrato case-insensitive de asientos contables.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_contabilidad_asientos_estado_runtime(
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
BEGIN
  -- Extensión citext.
  RETURN QUERY
  SELECT
    'extension_citext_installed'::text,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext'),
    'Extension citext instalada'::text;

  -- Tipo esperado para asientos_contables.estado.
  RETURN QUERY
  SELECT
    'column_asientos_contables_estado_is_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'asientos_contables'
        AND c.column_name = 'estado'
        AND c.data_type = 'USER-DEFINED'
        AND c.udt_name = 'citext'
    ) AS ok,
    'tipo citext en asientos_contables.estado'::text;

  -- Funciones esperadas.
  RETURN QUERY
  WITH expected(func_name, detail) AS (
    VALUES
      ('normalize_asientos_contables_estado', 'helper de normalización de estado de asientos'),
      ('normalize_asientos_contables_row', 'trigger function de normalización de asientos'),
      ('enforce_detalle_asientos_tenant_consistency_203', 'trigger function de consistencia tenant en detalle_asientos')
  )
  SELECT
    format('function_%s_exists', e.func_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = e.func_name
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Triggers esperados.
  RETURN QUERY
  WITH expected(tablename, triggername, detail) AS (
    VALUES
      ('asientos_contables', 'trg_normalize_asientos_contables_row', 'normalización de asientos_contables'),
      ('detalle_asientos', 'trg_enforce_detalle_asientos_tenant_consistency_203', 'consistencia tenant de detalle_asientos')
  )
  SELECT
    format('trigger_%s_exists', e.triggername)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.tablename
        AND tg.tgname = e.triggername
        AND NOT tg.tgisinternal
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Constraints esperadas.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('asientos_contables', 'ck_asientos_contables_estado_runtime_203', 'dominio de estado en asientos_contables'),
      ('asientos_contables', 'ck_asientos_contables_montos_runtime_203', 'montos no negativos en asientos_contables'),
      ('asientos_contables', 'ck_asientos_contables_cuadre_confirmado_runtime_203', 'cuadre para asientos confirmados')
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
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Índices esperados.
  RETURN QUERY
  SELECT
    'index_idx_asientos_contables_tenant_estado_ci_runtime_203_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = 'asientos_contables'
        AND i.indexname = 'idx_asientos_contables_tenant_estado_ci_runtime_203'
    ) AS ok,
    'índice runtime por tenant/estado/fecha en asientos_contables'::text;

  -- RLS enabled + forced.
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('asientos_contables'),
      ('detalle_asientos')
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

  -- Contrato de filtros case-insensitive.
  SELECT ABS(x.upper_count - x.lower_count)::bigint
  INTO v_count
  FROM (
    SELECT
      (
        SELECT COUNT(*)
        FROM public.asientos_contables a
        WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
          AND a.estado = 'CONFIRMADO'
      ) AS upper_count,
      (
        SELECT COUNT(*)
        FROM public.asientos_contables a
        WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
          AND a.estado = 'confirmado'
      ) AS lower_count
  ) x;

  RETURN QUERY
  SELECT
    'asientos_contables_estado_case_insensitive_filter_contract'::text,
    (v_count = 0),
    format('delta=%s', v_count)::text;

  -- Filas inválidas y reglas de cuadre.
  SELECT COUNT(*) INTO v_count
  FROM public.asientos_contables a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      a.estado IS NULL
      OR lower(a.estado::text) NOT IN ('borrador', 'confirmado', 'anulado')
    );

  RETURN QUERY
  SELECT
    'asientos_contables_invalid_estado_rows'::text,
    (v_count = 0),
    format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.asientos_contables a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND lower(a.estado::text) = 'confirmado'
    AND abs(COALESCE(a.total_debe, 0) - COALESCE(a.total_haber, 0)) > 0.01;

  RETURN QUERY
  SELECT
    'asientos_contables_confirmado_unbalanced_rows'::text,
    (v_count = 0),
    format('filas desbalanceadas: %s', v_count)::text;

  -- Consistencia tenant detalle_asientos -> asiento/cuenta.
  SELECT COUNT(*) INTO v_count
  FROM public.detalle_asientos d
  LEFT JOIN public.asientos_contables a ON a.id = d.asiento_id
  LEFT JOIN public.plan_cuentas pc ON pc.id = d.cuenta_id
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      d.asiento_id IS NULL
      OR a.id IS NULL
      OR d.tenant_id IS NULL
      OR d.tenant_id IS DISTINCT FROM a.tenant_id
      OR (pc.id IS NOT NULL AND pc.tenant_id IS NOT NULL AND d.tenant_id IS DISTINCT FROM pc.tenant_id)
    );

  RETURN QUERY
  SELECT
    'detalle_asientos_tenant_integrity_rows'::text,
    (v_count = 0),
    format('filas inconsistentes: %s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_contabilidad_asientos_estado_runtime_status_actual AS
SELECT *
FROM public.validar_contabilidad_asientos_estado_runtime(app.current_tenant_id());

COMMIT;
