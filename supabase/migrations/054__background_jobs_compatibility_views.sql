-- ============================================================================
-- 054__background_jobs_compatibility_views.sql
-- Crea aliases SQL usados por BackgroundJobs para evitar fallas por nombres legacy.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Alias para consultas de métricas en BackgroundJobsService
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.cpe_documentos AS
SELECT
  c.id,
  c.tenant_id,
  c.tipo_documento,
  c.serie,
  c.numero,
  c.estado,
  c.fecha_emision,
  COALESCE(c.total_venta, 0)::numeric(14,2) AS total,
  c.created_at,
  c.updated_at
FROM public.cpe c;

CREATE OR REPLACE VIEW public.gre_documentos AS
SELECT
  g.id,
  g.tenant_id,
  g.serie,
  g.numero,
  COALESCE(NULLIF(btrim(g.estado), ''), 'BORRADOR') AS estado,
  g.fecha_emision,
  COALESCE(g.total, 0)::numeric(14,2) AS total,
  g.created_at,
  g.updated_at
FROM public.gre_guias g;

CREATE OR REPLACE VIEW public.orden_compra AS
SELECT
  oc.id,
  oc.tenant_id,
  oc.proveedor_id,
  oc.fecha,
  oc.fecha_orden,
  oc.estado,
  COALESCE(oc.subtotal, 0)::numeric(14,2) AS subtotal,
  COALESCE(oc.igv, 0)::numeric(14,2) AS igv,
  COALESCE(oc.total, 0)::numeric(14,2) AS total,
  COALESCE(NULLIF(btrim(oc.moneda), ''), 'PEN') AS moneda,
  oc.created_at,
  oc.updated_at
FROM public.ordenes_compra oc;

COMMIT;
