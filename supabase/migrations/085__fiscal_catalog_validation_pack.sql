-- ============================================================================
-- 085__fiscal_catalog_validation_pack.sql
-- Pack de validación runtime para catálogos fiscales por país.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_fiscal_catalog_runtime(
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
  RETURN QUERY
  SELECT
    'trigger_normalize_configuracion_fiscal_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'configuracion_fiscal'
        AND t.tgname = 'trg_normalize_configuracion_fiscal_row'
        AND NOT t.tgisinternal
    ),
    'normalización fiscal activa';

  RETURN QUERY
  SELECT
    'configuracion_fiscal_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 6
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'configuracion_fiscal'
        AND c.column_name IN (
          'tasa_igv',
          'moneda_principal',
          'retencion_renta_porcentaje',
          'retencion_iva_porcentaje',
          'percepcion_porcentaje',
          'detraccion_porcentaje'
        )
    ),
    'columnas requeridas por controllers/services';

  RETURN QUERY
  SELECT
    'paises_alias_columns_present'::text,
    (
      SELECT COUNT(*) = 3
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'paises'
        AND c.column_name IN ('codigo_fiscal', 'moneda_principal', 'zona_horaria')
    ),
    'aliases de país para UI dinámica';

  RETURN QUERY
  SELECT
    'fk_configuracion_fiscal_pais_id_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_configuracion_fiscal_pais_id'
        AND conrelid = 'public.configuracion_fiscal'::regclass
    ),
    'integridad configuracion_fiscal -> paises';

  RETURN QUERY
  SELECT
    'ux_configuracion_fiscal_active_single_by_pais_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'configuracion_fiscal'
        AND indexname = 'ux_configuracion_fiscal_active_single_by_pais'
    ),
    'evita ambigüedad de `.single()` por país';

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT pais_id, COUNT(*) AS c
    FROM public.configuracion_fiscal
    WHERE pais_id IS NOT NULL
      AND COALESCE(activo, true) = true
      AND (
        p_tenant_id IS NULL
        OR tenant_id IS NULL
        OR tenant_id = p_tenant_id
      )
    GROUP BY pais_id
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'configuracion_fiscal_active_duplicates_by_pais'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_fiscal cf
  LEFT JOIN public.paises p
    ON p.id = cf.pais_id
  WHERE cf.pais_id IS NOT NULL
    AND p.id IS NULL
    AND (
      p_tenant_id IS NULL
      OR cf.tenant_id IS NULL
      OR cf.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'configuracion_fiscal_rows_without_valid_pais'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_fiscal cf
  WHERE (
      cf.moneda_principal IS NULL
      OR btrim(cf.moneda_principal) = ''
    )
    AND (
      p_tenant_id IS NULL
      OR cf.tenant_id IS NULL
      OR cf.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'configuracion_fiscal_missing_moneda_principal'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_fiscal cf
  WHERE
    cf.impuesto_principal_porcentaje NOT BETWEEN 0 AND 1
    OR cf.tasa_igv NOT BETWEEN 0 AND 1
    OR cf.retencion_renta_porcentaje NOT BETWEEN 0 AND 1
    OR cf.retencion_iva_porcentaje NOT BETWEEN 0 AND 1
    OR cf.percepcion_porcentaje NOT BETWEEN 0 AND 1
    OR cf.detraccion_porcentaje NOT BETWEEN 0 AND 1;

  RETURN QUERY
  SELECT
    'configuracion_fiscal_invalid_rate_ranges'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT pais_id, upper(codigo), COUNT(*) AS c
    FROM public.tipos_documentos_fiscales
    WHERE pais_id IS NOT NULL
      AND codigo IS NOT NULL
      AND btrim(codigo) <> ''
      AND COALESCE(activo, true) = true
    GROUP BY pais_id, upper(codigo)
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'tipos_documentos_fiscales_active_duplicates'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT pais_id, upper(codigo), COUNT(*) AS c
    FROM public.tipos_impuestos
    WHERE pais_id IS NOT NULL
      AND codigo IS NOT NULL
      AND btrim(codigo) <> ''
      AND COALESCE(activo, true) = true
    GROUP BY pais_id, upper(codigo)
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'tipos_impuestos_active_duplicates'::text,
    (v_count = 0),
    format('groups=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_fiscal_catalog_runtime_status_actual AS
SELECT *
FROM public.validar_fiscal_catalog_runtime(app.resolve_request_tenant_id());

COMMIT;
