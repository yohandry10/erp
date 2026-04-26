-- ============================================================================
-- 036__contabilidad_refresh_hardening.sql
-- Endurece RPC de refresh de materialized views contables.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.refrescar_estados_financieros(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_anio IS NULL OR p_anio < 1900 OR p_anio > 2100 THEN
    RAISE EXCEPTION 'Año inválido para refresco: %', p_anio;
  END IF;

  IF p_mes IS NULL OR p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'Mes inválido para refresco: %', p_mes;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(
      format(
        'refresh_estados_financieros:%s:%s:%s',
        COALESCE(p_tenant_id::text, 'all'),
        p_anio,
        p_mes
      )
    )
  );

  BEGIN
    REFRESH MATERIALIZED VIEW public.mv_balance_comprobacion;
  EXCEPTION WHEN undefined_table THEN
    RAISE EXCEPTION 'No existe mv_balance_comprobacion';
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW public.mv_estado_resultados;
  EXCEPTION WHEN undefined_table THEN
    RAISE EXCEPTION 'No existe mv_estado_resultados';
  END;

  BEGIN
    REFRESH MATERIALIZED VIEW public.mv_balance_general;
  EXCEPTION WHEN undefined_table THEN
    RAISE EXCEPTION 'No existe mv_balance_general';
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_materialized_view(
  view_name text,
  tenant_id uuid DEFAULT NULL,
  p_anio integer DEFAULT NULL,
  p_mes integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF view_name IS NULL OR btrim(view_name) = '' THEN
    RAISE EXCEPTION 'view_name es requerido';
  END IF;

  IF p_anio IS NOT NULL AND (p_anio < 1900 OR p_anio > 2100) THEN
    RAISE EXCEPTION 'Año inválido para refresh_materialized_view: %', p_anio;
  END IF;

  IF p_mes IS NOT NULL AND (p_mes < 1 OR p_mes > 12) THEN
    RAISE EXCEPTION 'Mes inválido para refresh_materialized_view: %', p_mes;
  END IF;

  IF view_name NOT IN ('mv_balance_comprobacion', 'mv_estado_resultados', 'mv_balance_general') THEN
    RAISE EXCEPTION 'Vista materializada no permitida: %', view_name;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(
      format(
        'refresh_materialized_view:%s:%s:%s:%s',
        view_name,
        COALESCE(tenant_id::text, 'all'),
        COALESCE(p_anio::text, 'all'),
        COALESCE(p_mes::text, 'all')
      )
    )
  );

  EXECUTE format('REFRESH MATERIALIZED VIEW public.%I', view_name);
  RETURN true;
END;
$$;

-- Estado básico de materialized views contables
CREATE OR REPLACE VIEW public.v_contabilidad_materialized_views_status AS
SELECT
  m.matviewname AS view_name,
  m.schemaname,
  m.ispopulated,
  pg_total_relation_size(format('%I.%I', m.schemaname, m.matviewname)) AS bytes_total,
  CASE
    WHEN m.matviewname = 'mv_balance_comprobacion' THEN
      (SELECT max(generated_at) FROM public.mv_balance_comprobacion)
    WHEN m.matviewname = 'mv_estado_resultados' THEN
      (SELECT max(generated_at) FROM public.mv_estado_resultados)
    WHEN m.matviewname = 'mv_balance_general' THEN
      (SELECT max(generated_at) FROM public.mv_balance_general)
    ELSE NULL
  END AS last_generated_at
FROM pg_catalog.pg_matviews m
WHERE m.schemaname = 'public'
  AND m.matviewname IN ('mv_balance_comprobacion', 'mv_estado_resultados', 'mv_balance_general')
ORDER BY m.matviewname;

COMMIT;
