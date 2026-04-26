-- ============================================================================
-- 040__contabilidad_rpc_estadisticas_asientos_alignment.sql
-- Alinea RPC get_asientos_por_tipo con contrato runtime (tipo/cantidad).
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_asientos_por_tipo(uuid);

CREATE OR REPLACE FUNCTION public.get_asientos_por_tipo(
  p_tenant_id uuid
)
RETURNS TABLE (
  tipo text,
  cantidad bigint,
  total_debe numeric,
  total_haber numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      COALESCE(
        NULLIF(btrim(oe.event_type), ''),
        NULLIF(btrim(ac.tipo_asiento), ''),
        'Manual'
      ) AS tipo,
      COALESCE(app.to_numeric_or_zero(ac.total_debe::text), 0)::numeric(14,2) AS total_debe,
      COALESCE(app.to_numeric_or_zero(ac.total_haber::text), 0)::numeric(14,2) AS total_haber
    FROM public.asientos_contables ac
    LEFT JOIN public.outbox_events oe ON oe.id = ac.source_event_id
    WHERE ac.tenant_id = p_tenant_id
  )
  SELECT
    b.tipo,
    COUNT(*)::bigint AS cantidad,
    COALESCE(SUM(b.total_debe), 0)::numeric(14,2) AS total_debe,
    COALESCE(SUM(b.total_haber), 0)::numeric(14,2) AS total_haber
  FROM base b
  GROUP BY b.tipo
  ORDER BY cantidad DESC, b.tipo;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_asientos_contables_tenant_tipo_asiento
ON public.asientos_contables (tenant_id, tipo_asiento);

CREATE INDEX IF NOT EXISTS idx_asientos_contables_source_event_id
ON public.asientos_contables (source_event_id)
WHERE source_event_id IS NOT NULL;

COMMIT;

