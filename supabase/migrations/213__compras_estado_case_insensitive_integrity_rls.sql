-- ============================================================================
-- 213__compras_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive del vertical Compras.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.ordenes_compra t
SET estado = app.normalize_ordenes_compra_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.recepciones t
SET estado = app.normalize_recepciones_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.compras t
SET estado = app.normalize_compras_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.cotizaciones_compra t
SET estado = app.normalize_cotizaciones_compra_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.oc_aprobaciones t
SET estado = app.normalize_oc_aprobaciones_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.devoluciones_proveedor t
SET estado = app.normalize_devoluciones_proveedor_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints de dominio (con lower(...) para contrato case-insensitive).
-- ----------------------------------------------------------------------------
ALTER TABLE public.ordenes_compra DROP CONSTRAINT IF EXISTS ck_ordenes_compra_estado_valid;
ALTER TABLE public.ordenes_compra
  ADD CONSTRAINT ck_ordenes_compra_estado_valid
  CHECK (lower(estado::text) IN ('borrador','pendiente','aprobacion','aprobada','parcial','recibida','anulada','rechazada','entregado','entregada'));

ALTER TABLE public.recepciones DROP CONSTRAINT IF EXISTS ck_recepciones_estado_valid;
ALTER TABLE public.recepciones
  ADD CONSTRAINT ck_recepciones_estado_valid
  CHECK (lower(estado::text) IN ('borrador','en_proceso','cerrada','anulada'));

ALTER TABLE public.compras DROP CONSTRAINT IF EXISTS ck_compras_estado_valid;
ALTER TABLE public.compras
  ADD CONSTRAINT ck_compras_estado_valid
  CHECK (lower(estado::text) IN ('pendiente','entregada','anulada'));

ALTER TABLE public.cotizaciones_compra DROP CONSTRAINT IF EXISTS ck_cotizaciones_compra_estado_valid;
ALTER TABLE public.cotizaciones_compra
  ADD CONSTRAINT ck_cotizaciones_compra_estado_valid
  CHECK (lower(estado::text) IN ('borrador', 'enviada', 'aprobada', 'rechazada', 'vencida'));

ALTER TABLE public.oc_aprobaciones DROP CONSTRAINT IF EXISTS ck_oc_aprobaciones_estado_valid;
ALTER TABLE public.oc_aprobaciones
  ADD CONSTRAINT ck_oc_aprobaciones_estado_valid
  CHECK (lower(estado::text) IN ('pendiente', 'aprobada', 'rechazada'));

ALTER TABLE public.oc_aprobaciones DROP CONSTRAINT IF EXISTS ck_oc_aprobaciones_fecha_consistency;
ALTER TABLE public.oc_aprobaciones
  ADD CONSTRAINT ck_oc_aprobaciones_fecha_consistency
  CHECK (lower(estado::text) = 'pendiente' OR fecha_aprobacion IS NOT NULL);

ALTER TABLE public.devoluciones_proveedor DROP CONSTRAINT IF EXISTS ck_devoluciones_proveedor_estado_valid;
ALTER TABLE public.devoluciones_proveedor
  ADD CONSTRAINT ck_devoluciones_proveedor_estado_valid
  CHECK (lower(estado::text) IN ('pendiente', 'emitida', 'anulada', 'rechazada'));

ALTER TABLE public.ordenes_compra
  ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.recepciones
  ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.compras
  ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.cotizaciones_compra
  ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.oc_aprobaciones
  ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.devoluciones_proveedor
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.ordenes_compra VALIDATE CONSTRAINT ck_ordenes_compra_estado_valid;
ALTER TABLE public.recepciones VALIDATE CONSTRAINT ck_recepciones_estado_valid;
ALTER TABLE public.compras VALIDATE CONSTRAINT ck_compras_estado_valid;
ALTER TABLE public.cotizaciones_compra VALIDATE CONSTRAINT ck_cotizaciones_compra_estado_valid;
ALTER TABLE public.oc_aprobaciones VALIDATE CONSTRAINT ck_oc_aprobaciones_estado_valid;
ALTER TABLE public.oc_aprobaciones VALIDATE CONSTRAINT ck_oc_aprobaciones_fecha_consistency;
ALTER TABLE public.devoluciones_proveedor VALIDATE CONSTRAINT ck_devoluciones_proveedor_estado_valid;

-- ----------------------------------------------------------------------------
-- Índice parcial pending en aprobaciones con predicado case-insensitive.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_oc_aprobaciones_pending_scope_runtime;
CREATE UNIQUE INDEX ux_oc_aprobaciones_pending_scope_runtime
ON public.oc_aprobaciones (tenant_id, orden_id, nivel, upper(aprobador_id))
WHERE tenant_id IS NOT NULL
  AND orden_id IS NOT NULL
  AND aprobador_id IS NOT NULL
  AND btrim(aprobador_id) <> ''
  AND lower(estado::text) = 'pendiente';

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'ordenes_compra');
SELECT app.apply_tenant_policy('public', 'recepciones');
SELECT app.apply_tenant_policy('public', 'compras');
SELECT app.apply_tenant_policy('public', 'cotizaciones_compra');
SELECT app.apply_tenant_policy('public', 'oc_aprobaciones');
SELECT app.apply_tenant_policy('public', 'devoluciones_proveedor');

COMMIT;
