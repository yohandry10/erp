-- ============================================================================
-- 048__dashboard_recent_activity_rpc.sql
-- RPC consolidada de actividad reciente del dashboard por tenant.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_dashboard_recent_activity();
DROP FUNCTION IF EXISTS public.get_dashboard_recent_activity(uuid, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity(
  p_tenant_id uuid,
  p_since timestamptz DEFAULT (now() - interval '24 hours'),
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id text,
  activity_type text,
  description text,
  amount numeric,
  event_date timestamptz,
  status text,
  source_table text
)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  WITH base AS (
    SELECT
      ('venta-' || v.id::text) AS id,
      'VENTA'::text AS activity_type,
      ('Venta ' || COALESCE(v.numero_ticket::text, 'S/T'))::text AS description,
      app.to_numeric_or_zero(v.total::text)::numeric(14,2) AS amount,
      COALESCE(v.fecha::timestamptz, v.created_at) AS event_date,
      COALESCE(v.estado, 'PENDIENTE')::text AS status,
      'ventas_pos'::text AS source_table
    FROM public.ventas_pos v
    WHERE v.tenant_id = p_tenant_id
      AND COALESCE(v.created_at, v.fecha::timestamptz) >= COALESCE(p_since, now() - interval '24 hours')

    UNION ALL

    SELECT
      ('compra-' || oc.id::text) AS id,
      'COMPRA'::text AS activity_type,
      ('Orden de Compra ' || COALESCE(oc.numero::text, 'S/N'))::text AS description,
      app.to_numeric_or_zero(oc.total::text)::numeric(14,2) AS amount,
      COALESCE(oc.fecha_orden::timestamptz, oc.created_at) AS event_date,
      COALESCE(oc.estado, 'PENDIENTE')::text AS status,
      'ordenes_compra'::text AS source_table
    FROM public.ordenes_compra oc
    WHERE oc.tenant_id = p_tenant_id
      AND COALESCE(oc.created_at, oc.fecha_orden::timestamptz) >= COALESCE(p_since, now() - interval '24 hours')

    UNION ALL

    SELECT
      ('cotizacion-' || c.id::text) AS id,
      'COTIZACION'::text AS activity_type,
      ('Cotización ' || COALESCE(c.numero::text, 'S/N'))::text AS description,
      app.to_numeric_or_zero(c.total::text)::numeric(14,2) AS amount,
      COALESCE(c.fecha_cotizacion::timestamptz, c.created_at) AS event_date,
      COALESCE(c.estado, 'PENDIENTE')::text AS status,
      'cotizaciones'::text AS source_table
    FROM public.cotizaciones c
    WHERE c.tenant_id = p_tenant_id
      AND COALESCE(c.created_at, c.fecha_cotizacion::timestamptz) >= COALESCE(p_since, now() - interval '24 hours')

    UNION ALL

    SELECT
      ('cpe-' || c.id::text) AS id,
      'CPE'::text AS activity_type,
      ('CPE ' || COALESCE(c.numero_comprobante::text, c.numero::text, 'S/N'))::text AS description,
      app.to_numeric_or_zero(COALESCE(c.total_venta, c.total)::text)::numeric(14,2) AS amount,
      COALESCE(c.fecha_emision::timestamptz, c.created_at) AS event_date,
      COALESCE(c.estado_sunat, c.sunat_status, c.estado, 'PENDIENTE')::text AS status,
      'cpe'::text AS source_table
    FROM public.cpe c
    WHERE c.tenant_id = p_tenant_id
      AND COALESCE(c.created_at, c.fecha_emision::timestamptz) >= COALESCE(p_since, now() - interval '24 hours')

    UNION ALL

    SELECT
      ('gre-' || g.id::text) AS id,
      'GRE'::text AS activity_type,
      ('GRE ' || COALESCE(g.numero::text, 'S/N'))::text AS description,
      NULL::numeric AS amount,
      COALESCE(g.fecha_emision::timestamptz, g.created_at) AS event_date,
      COALESCE(g.estado, 'PENDIENTE')::text AS status,
      'gre'::text AS source_table
    FROM public.gre g
    WHERE g.tenant_id = p_tenant_id
      AND COALESCE(g.created_at, g.fecha_emision::timestamptz) >= COALESCE(p_since, now() - interval '24 hours')
  )
  SELECT
    b.id,
    b.activity_type,
    b.description,
    b.amount,
    b.event_date,
    b.status,
    b.source_table
  FROM base b
  ORDER BY b.event_date DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity()
RETURNS TABLE (
  id text,
  activity_type text,
  description text,
  amount numeric,
  event_date timestamptz,
  status text,
  source_table text
)
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT *
  FROM public.get_dashboard_recent_activity(app.resolve_request_tenant_id(), now() - interval '24 hours', 20);
$$;

COMMIT;

