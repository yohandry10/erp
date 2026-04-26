-- ============================================================================
-- 037__contabilidad_materialized_views_validation_pack.sql
-- Pack de validación forense de materialized views contables.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_materialized_views_contabilidad(
  p_tenant_id uuid DEFAULT NULL,
  p_anio integer DEFAULT NULL,
  p_mes integer DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  status text,
  detail jsonb,
  checked_at timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_exists_bc boolean;
  v_exists_er boolean;
  v_exists_bg boolean;
  v_rows_bc bigint := 0;
  v_rows_er bigint := 0;
  v_rows_bg bigint := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'mv_balance_comprobacion'
  ) INTO v_exists_bc;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'mv_estado_resultados'
  ) INTO v_exists_er;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'mv_balance_general'
  ) INTO v_exists_bg;

  RETURN QUERY
  SELECT
    'matview_exists.mv_balance_comprobacion'::text,
    CASE WHEN v_exists_bc THEN 'ok' ELSE 'missing' END::text,
    jsonb_build_object('exists', v_exists_bc),
    now();

  RETURN QUERY
  SELECT
    'matview_exists.mv_estado_resultados'::text,
    CASE WHEN v_exists_er THEN 'ok' ELSE 'missing' END::text,
    jsonb_build_object('exists', v_exists_er),
    now();

  RETURN QUERY
  SELECT
    'matview_exists.mv_balance_general'::text,
    CASE WHEN v_exists_bg THEN 'ok' ELSE 'missing' END::text,
    jsonb_build_object('exists', v_exists_bg),
    now();

  IF v_exists_bc THEN
    EXECUTE format(
      'SELECT COUNT(*) FROM public.mv_balance_comprobacion %s',
      CASE
        WHEN p_tenant_id IS NOT NULL AND p_anio IS NOT NULL AND p_mes IS NOT NULL THEN
          format('WHERE tenant_id = %L::uuid AND anio = %s AND mes = %s', p_tenant_id::text, p_anio, p_mes)
        WHEN p_tenant_id IS NOT NULL THEN
          format('WHERE tenant_id = %L::uuid', p_tenant_id::text)
        ELSE
          ''
      END
    ) INTO v_rows_bc;

    RETURN QUERY
    SELECT
      'rows.mv_balance_comprobacion'::text,
      CASE WHEN v_rows_bc > 0 THEN 'ok' ELSE 'empty' END::text,
      jsonb_build_object(
        'rows', v_rows_bc,
        'tenant_id', p_tenant_id,
        'anio', p_anio,
        'mes', p_mes
      ),
      now();
  END IF;

  IF v_exists_er THEN
    EXECUTE format(
      'SELECT COUNT(*) FROM public.mv_estado_resultados %s',
      CASE
        WHEN p_tenant_id IS NOT NULL AND p_anio IS NOT NULL AND p_mes IS NOT NULL THEN
          format('WHERE tenant_id = %L::uuid AND anio = %s AND mes = %s', p_tenant_id::text, p_anio, p_mes)
        WHEN p_tenant_id IS NOT NULL THEN
          format('WHERE tenant_id = %L::uuid', p_tenant_id::text)
        ELSE
          ''
      END
    ) INTO v_rows_er;

    RETURN QUERY
    SELECT
      'rows.mv_estado_resultados'::text,
      CASE WHEN v_rows_er > 0 THEN 'ok' ELSE 'empty' END::text,
      jsonb_build_object(
        'rows', v_rows_er,
        'tenant_id', p_tenant_id,
        'anio', p_anio,
        'mes', p_mes
      ),
      now();
  END IF;

  IF v_exists_bg THEN
    EXECUTE format(
      'SELECT COUNT(*) FROM public.mv_balance_general %s',
      CASE
        WHEN p_tenant_id IS NOT NULL AND p_anio IS NOT NULL AND p_mes IS NOT NULL THEN
          format('WHERE tenant_id = %L::uuid AND anio = %s AND mes = %s', p_tenant_id::text, p_anio, p_mes)
        WHEN p_tenant_id IS NOT NULL THEN
          format('WHERE tenant_id = %L::uuid', p_tenant_id::text)
        ELSE
          ''
      END
    ) INTO v_rows_bg;

    RETURN QUERY
    SELECT
      'rows.mv_balance_general'::text,
      CASE WHEN v_rows_bg > 0 THEN 'ok' ELSE 'empty' END::text,
      jsonb_build_object(
        'rows', v_rows_bg,
        'tenant_id', p_tenant_id,
        'anio', p_anio,
        'mes', p_mes
      ),
      now();
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.v_contabilidad_materialized_views_validacion_actual AS
SELECT *
FROM public.validar_materialized_views_contabilidad(
  app.current_tenant_id(),
  EXTRACT(YEAR FROM now())::integer,
  EXTRACT(MONTH FROM now())::integer
);

COMMIT;
