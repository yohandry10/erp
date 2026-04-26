-- ============================================================================
-- 124__contabilidad_presupuestal_validation_pack.sql
-- Pack de validación runtime para contabilidad presupuestal.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_contabilidad_presupuestal_runtime(
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
  -- Triggers
  RETURN QUERY
  SELECT
    'trigger_normalize_periodos_contables_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'periodos_contables'
        AND t.tgname = 'trg_normalize_periodos_contables_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de periodos_contables';

  RETURN QUERY
  SELECT
    'trigger_normalize_centros_costo_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'centros_costo'
        AND t.tgname = 'trg_normalize_centros_costo_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de centros_costo';

  RETURN QUERY
  SELECT
    'trigger_normalize_presupuestos_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'presupuestos'
        AND t.tgname = 'trg_normalize_presupuestos_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de presupuestos';

  RETURN QUERY
  SELECT
    'trigger_enforce_presupuestos_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'presupuestos'
        AND t.tgname = 'trg_enforce_presupuestos_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en presupuestos';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'periodos_contables_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'periodos_contables'
        AND c.column_name IN (
          'tenant_id', 'anio', 'mes', 'estado',
          'fecha_cierre', 'cerrado_por', 'created_at', 'updated_at'
        )
    ),
    'columnas runtime de periodos_contables';

  RETURN QUERY
  SELECT
    'centros_costo_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 7
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'centros_costo'
        AND c.column_name IN (
          'tenant_id', 'codigo', 'nombre', 'descripcion',
          'activo', 'created_at', 'updated_at'
        )
    ),
    'columnas runtime de centros_costo';

  RETURN QUERY
  SELECT
    'presupuestos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 15
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'presupuestos'
        AND c.column_name IN (
          'tenant_id', 'centro_costo_id', 'cuenta_id', 'periodo_contable_id',
          'monto_presupuestado', 'monto_ejecutado', 'monto_comprometido',
          'monto_disponible', 'porcentaje_ejecutado', 'estado', 'notas',
          'created_by', 'updated_by', 'created_at', 'updated_at'
        )
    ),
    'columnas runtime de presupuestos';

  -- Índices de soporte
  RETURN QUERY
  SELECT
    'ux_periodos_contables_tenant_anio_mes_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'periodos_contables'
        AND indexname = 'ux_periodos_contables_tenant_anio_mes'
    ),
    'unicidad tenant+anio+mes en periodos_contables';

  RETURN QUERY
  SELECT
    'ux_centros_costo_tenant_codigo_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'centros_costo'
        AND indexname = 'ux_centros_costo_tenant_codigo'
    ),
    'unicidad tenant+codigo en centros_costo';

  RETURN QUERY
  SELECT
    'ux_presupuestos_tenant_scope_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'presupuestos'
        AND indexname = 'ux_presupuestos_tenant_scope'
    ),
    'unicidad tenant+centro+cuenta+periodo en presupuestos';

  RETURN QUERY
  SELECT
    'idx_presupuestos_tenant_periodo_estado_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'presupuestos'
        AND indexname = 'idx_presupuestos_tenant_periodo_estado_runtime'
    ),
    'índice por tenant+periodo+estado en presupuestos';

  -- RLS
  RETURN QUERY
  SELECT
    'rls_periodos_contables_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'periodos_contables'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en periodos_contables';

  RETURN QUERY
  SELECT
    'rls_centros_costo_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'centros_costo'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en centros_costo';

  RETURN QUERY
  SELECT
    'rls_presupuestos_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'presupuestos'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en presupuestos';

  -- Duplicados operativos
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, anio, mes, COUNT(*) AS cnt
    FROM public.periodos_contables
    WHERE anio IS NOT NULL
      AND mes IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, anio, mes
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'periodos_contables_duplicate_scope'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(codigo) AS codigo_norm, COUNT(*) AS cnt
    FROM public.centros_costo
    WHERE codigo IS NOT NULL
      AND btrim(codigo) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(codigo)
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'centros_costo_duplicate_codigo'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, centro_costo_id, cuenta_id, periodo_contable_id, COUNT(*) AS cnt
    FROM public.presupuestos
    WHERE centro_costo_id IS NOT NULL
      AND cuenta_id IS NOT NULL
      AND periodo_contable_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, centro_costo_id, cuenta_id, periodo_contable_id
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'presupuestos_duplicate_scope'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  -- Filas inválidas por reglas de negocio
  SELECT COUNT(*)
  INTO v_count
  FROM public.periodos_contables p
  WHERE (
      p.anio IS NULL
      OR p.anio < 2000
      OR p.anio > 2100
      OR p.mes IS NULL
      OR p.mes < 1
      OR p.mes > 12
      OR p.estado IS NULL
      OR p.estado NOT IN ('ABIERTO', 'CERRADO', 'BLOQUEADO')
      OR (p.estado = 'CERRADO' AND p.fecha_cierre IS NULL)
      OR (p.estado <> 'CERRADO' AND (p.fecha_cierre IS NOT NULL OR p.cerrado_por IS NOT NULL))
    )
    AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'periodos_contables_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.centros_costo c
  WHERE (
      c.codigo IS NULL OR btrim(c.codigo) = ''
      OR c.nombre IS NULL OR btrim(c.nombre) = ''
      OR c.estado IS NULL
      OR c.estado NOT IN ('ACTIVO', 'INACTIVO')
      OR COALESCE(c.activo, false) <> (c.estado = 'ACTIVO')
    )
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'centros_costo_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.presupuestos p
  WHERE (
      p.centro_costo_id IS NULL
      OR p.cuenta_id IS NULL
      OR p.periodo_contable_id IS NULL
      OR p.estado IS NULL
      OR p.estado NOT IN ('ACTIVO', 'BLOQUEADO', 'CERRADO')
      OR p.monto_presupuestado IS NULL
      OR p.monto_ejecutado IS NULL
      OR p.monto_comprometido IS NULL
      OR p.monto_disponible IS NULL
      OR p.porcentaje_ejecutado IS NULL
      OR p.monto_presupuestado < 0
      OR p.monto_ejecutado < 0
      OR p.monto_comprometido < 0
      OR p.porcentaje_ejecutado < 0
      OR p.monto_disponible <> (p.monto_presupuestado - p.monto_ejecutado - p.monto_comprometido)
      OR p.porcentaje_ejecutado <> CASE
        WHEN p.monto_presupuestado > 0
          THEN ROUND(((p.monto_ejecutado / p.monto_presupuestado) * 100)::numeric, 2)
        ELSE 0
      END
    )
    AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'presupuestos_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_contabilidad_presupuestal_runtime_status_actual AS
SELECT *
FROM public.validar_contabilidad_presupuestal_runtime(app.resolve_request_tenant_id());

COMMIT;
