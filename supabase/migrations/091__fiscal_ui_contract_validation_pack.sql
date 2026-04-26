-- ============================================================================
-- 091__fiscal_ui_contract_validation_pack.sql
-- Pack de validación runtime para contrato UI de país/fiscal.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_fiscal_ui_contract_runtime(
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
    'trigger_normalize_tipos_documentos_fiscales_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'tipos_documentos_fiscales'
        AND t.tgname = 'trg_normalize_tipos_documentos_fiscales_row'
        AND NOT t.tgisinternal
    ),
    'normalización de tipos_documentos_fiscales';

  RETURN QUERY
  SELECT
    'trigger_normalize_tipos_impuestos_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'tipos_impuestos'
        AND t.tgname = 'trg_normalize_tipos_impuestos_row'
        AND NOT t.tgisinternal
    ),
    'normalización de tipos_impuestos';

  RETURN QUERY
  SELECT
    'configuracion_fiscal_ui_columns_present'::text,
    (
      SELECT COUNT(*) = 5
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'configuracion_fiscal'
        AND c.column_name IN (
          'requiere_registro_compras',
          'requiere_registro_ventas',
          'permite_multiples_monedas',
          'requiere_autorizacion_sunat',
          'url_webservice'
        )
    ),
    'columnas UI en configuracion_fiscal';

  RETURN QUERY
  SELECT
    'tipos_documentos_ui_columns_present'::text,
    (
      SELECT COUNT(*) = 3
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'tipos_documentos_fiscales'
        AND c.column_name IN ('longitud_minima', 'longitud_maxima', 'patron_validacion')
    ),
    'columnas UI en tipos_documentos_fiscales';

  RETURN QUERY
  SELECT
    'tipos_impuestos_ui_columns_present'::text,
    (
      SELECT COUNT(*) = 2
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'tipos_impuestos'
        AND c.column_name IN ('tasa_porcentaje', 'es_retencion')
    ),
    'columnas UI en tipos_impuestos';

  SELECT COUNT(*)
  INTO v_count
  FROM public.tipos_documentos_fiscales t
  WHERE (
      t.longitud_minima < 1
      OR t.longitud_maxima < 1
      OR t.longitud_minima > t.longitud_maxima
    )
    AND (
      p_tenant_id IS NULL
      OR t.tenant_id IS NULL
      OR t.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'tipos_documentos_invalid_longitud_range'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.tipos_documentos_fiscales t
  WHERE (
      t.patron_validacion IS NULL
      OR btrim(t.patron_validacion) = ''
    )
    AND (
      p_tenant_id IS NULL
      OR t.tenant_id IS NULL
      OR t.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'tipos_documentos_missing_patron_validacion'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.tipos_impuestos t
  WHERE (
      t.tasa_porcentaje < 0
      OR t.tasa_porcentaje > 100
      OR abs(COALESCE(t.tasa_porcentaje, 0) - COALESCE(t.porcentaje, 0)) > 0.0001
    )
    AND (
      p_tenant_id IS NULL
      OR t.tenant_id IS NULL
      OR t.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'tipos_impuestos_invalid_or_desynced_tasa'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_fiscal cf
  WHERE (
      cf.requiere_registro_compras IS NULL
      OR cf.requiere_registro_ventas IS NULL
      OR cf.permite_multiples_monedas IS NULL
      OR cf.requiere_autorizacion_sunat IS NULL
    )
    AND (
      p_tenant_id IS NULL
      OR cf.tenant_id IS NULL
      OR cf.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'configuracion_fiscal_missing_ui_flags'::text,
    (v_count = 0),
    format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_fiscal_ui_contract_runtime_status_actual AS
SELECT *
FROM public.validar_fiscal_ui_contract_runtime(app.resolve_request_tenant_id());

COMMIT;
