-- ============================================================================
-- 285__rma_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estado case-insensitive en flujo RMA.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo previo a constraints.
-- ----------------------------------------------------------------------------
UPDATE public.rma_solicitudes
SET
  estado = app.normalize_rma_estado_284('rma_solicitudes', estado::text, NULL, NULL),
  updated_at = COALESCE(updated_at, now());

UPDATE public.rma_items
SET
  cantidad_autorizada = GREATEST(COALESCE(cantidad_autorizada, 0), 0),
  cantidad_devuelta = GREATEST(COALESCE(cantidad_devuelta, 0), 0),
  estado = app.normalize_rma_estado_284(
    'rma_items',
    estado::text,
    GREATEST(COALESCE(cantidad_autorizada, 0), 0),
    GREATEST(COALESCE(cantidad_devuelta, 0), 0)
  ),
  updated_at = COALESCE(updated_at, now());

UPDATE public.rma_items
SET
  cantidad_devuelta = LEAST(cantidad_devuelta, cantidad_autorizada),
  estado = app.normalize_rma_estado_284(
    'rma_items',
    estado::text,
    cantidad_autorizada,
    LEAST(cantidad_devuelta, cantidad_autorizada)
  ),
  updated_at = now()
WHERE cantidad_autorizada >= 0
  AND cantidad_devuelta > cantidad_autorizada;

-- ----------------------------------------------------------------------------
-- Dedupe de items activos por (rma_id, detalle_id) con predicado CI.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY rma_id, detalle_id
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.rma_items
  WHERE rma_id IS NOT NULL
    AND detalle_id IS NOT NULL
    AND lower(COALESCE(estado::text, 'creada')) NOT IN ('rechazado', 'inactivo')
)
UPDATE public.rma_items i
SET
  estado = 'INACTIVO'::citext,
  updated_at = now(),
  metadata = COALESCE(i.metadata, '{}'::jsonb) || jsonb_build_object('dedupe_migration', '285__rma_estado_case_insensitive_integrity_rls')
FROM ranked r
WHERE i.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de dominio case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.rma_solicitudes DROP CONSTRAINT IF EXISTS ck_rma_solicitudes_estado_valid;
ALTER TABLE public.rma_solicitudes
  ADD CONSTRAINT ck_rma_solicitudes_estado_valid
  CHECK (
    lower(estado::text) IN ('creada', 'aprobada', 'rechazada', 'parcial', 'recibida', 'cerrada', 'cancelada', 'inactivo')
  ) NOT VALID;

ALTER TABLE public.rma_items DROP CONSTRAINT IF EXISTS ck_rma_items_estado_runtime_285;
ALTER TABLE public.rma_items
  ADD CONSTRAINT ck_rma_items_estado_runtime_285
  CHECK (
    lower(estado::text) IN ('creada', 'parcial', 'cerrado', 'rechazado', 'inactivo')
  ) NOT VALID;

-- ----------------------------------------------------------------------------
-- Contrato NOT NULL para estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.rma_solicitudes ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.rma_items ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.rma_solicitudes VALIDATE CONSTRAINT ck_rma_solicitudes_estado_valid;
ALTER TABLE public.rma_items VALIDATE CONSTRAINT ck_rma_items_estado_runtime_285;

-- ----------------------------------------------------------------------------
-- Reforzar índice único de items activos con predicado case-insensitive.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_rma_items_rma_detalle_activo;
CREATE UNIQUE INDEX IF NOT EXISTS ux_rma_items_rma_detalle_activo
ON public.rma_items (rma_id, detalle_id)
WHERE detalle_id IS NOT NULL
  AND lower(COALESCE(estado::text, 'creada')) NOT IN ('rechazado', 'inactivo');

-- ----------------------------------------------------------------------------
-- Reaplicacion explícita de RLS en tablas RMA.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'rma_solicitudes');
SELECT app.apply_tenant_policy('public', 'rma_items');
SELECT app.apply_tenant_policy('public', 'rma_eventos');

COMMIT;
