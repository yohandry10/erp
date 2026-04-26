-- ============================================================================
-- 282__fiscal_retenciones_proveedores_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estado case-insensitive en
-- fiscal/retenciones/proveedores.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo de estado/flags antes de constraints.
-- ----------------------------------------------------------------------------
UPDATE public.configuracion_fiscal
SET
  activo = COALESCE(
    activo,
    lower(app.normalize_fiscal_retenciones_proveedores_estado_281('configuracion_fiscal', estado::text, true)::text) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      activo,
      lower(app.normalize_fiscal_retenciones_proveedores_estado_281('configuracion_fiscal', estado::text, true)::text) = 'activo'
    ) THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.configuracion_retenciones
SET
  activo = COALESCE(
    activo,
    lower(app.normalize_fiscal_retenciones_proveedores_estado_281('configuracion_retenciones', estado::text, true)::text) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      activo,
      lower(app.normalize_fiscal_retenciones_proveedores_estado_281('configuracion_retenciones', estado::text, true)::text) = 'activo'
    ) THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.proveedores
SET
  activo = COALESCE(
    activo,
    lower(app.normalize_fiscal_retenciones_proveedores_estado_281('proveedores', estado::text, true)::text) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      activo,
      lower(app.normalize_fiscal_retenciones_proveedores_estado_281('proveedores', estado::text, true)::text) = 'activo'
    ) THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.proveedores_cuarta_categoria
SET
  activo = COALESCE(
    activo,
    lower(
      app.normalize_fiscal_retenciones_proveedores_estado_281(
        'proveedores_cuarta_categoria',
        estado::text,
        true
      )::text
    ) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      activo,
      lower(app.normalize_fiscal_retenciones_proveedores_estado_281('proveedores_cuarta_categoria', estado::text, true)::text) = 'activo'
    ) THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

UPDATE public.libro_retenciones
SET
  estado = app.normalize_fiscal_retenciones_proveedores_estado_281('libro_retenciones', estado::text, NULL),
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Dedupe para unicidades activas reforzadas por estado case-insensitive.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY pais_id
      ORDER BY
        (tenant_id IS NULL) DESC,
        COALESCE(updated_at, created_at, now()) DESC,
        id::text DESC
    ) AS rn
  FROM public.configuracion_fiscal
  WHERE pais_id IS NOT NULL
    AND lower(estado::text) = 'activo'
)
UPDATE public.configuracion_fiscal cf
SET
  activo = false,
  estado = 'INACTIVO'::citext,
  updated_at = now()
FROM ranked r
WHERE cf.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, upper(categoria)
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.configuracion_retenciones
  WHERE tenant_id IS NOT NULL
    AND categoria IS NOT NULL
    AND lower(estado::text) = 'activo'
)
UPDATE public.configuracion_retenciones cr
SET
  activo = false,
  estado = 'INACTIVO'::citext,
  updated_at = now()
FROM ranked r
WHERE cr.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, lower(btrim(ruc))
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.proveedores
  WHERE tenant_id IS NOT NULL
    AND NULLIF(btrim(COALESCE(ruc, '')), '') IS NOT NULL
    AND lower(estado::text) = 'activo'
)
UPDATE public.proveedores p
SET
  activo = false,
  estado = 'INACTIVO'::citext,
  updated_at = now()
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, proveedor_id
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.proveedores_cuarta_categoria
  WHERE tenant_id IS NOT NULL
    AND proveedor_id IS NOT NULL
    AND lower(estado::text) = 'activo'
)
UPDATE public.proveedores_cuarta_categoria pc
SET
  activo = false,
  estado = 'INACTIVO'::citext,
  updated_at = now()
FROM ranked r
WHERE pc.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de dominio/consistencia case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.configuracion_fiscal DROP CONSTRAINT IF EXISTS ck_configuracion_fiscal_estado_valid;
ALTER TABLE public.configuracion_fiscal
  ADD CONSTRAINT ck_configuracion_fiscal_estado_valid
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.configuracion_fiscal DROP CONSTRAINT IF EXISTS ck_configuracion_fiscal_estado_activo_sync_281;
ALTER TABLE public.configuracion_fiscal
  ADD CONSTRAINT ck_configuracion_fiscal_estado_activo_sync_281
  CHECK (
    (activo = true AND lower(estado::text) = 'activo')
    OR (activo = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.configuracion_retenciones DROP CONSTRAINT IF EXISTS ck_configuracion_retenciones_estado_valid;
ALTER TABLE public.configuracion_retenciones
  ADD CONSTRAINT ck_configuracion_retenciones_estado_valid
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.configuracion_retenciones DROP CONSTRAINT IF EXISTS ck_configuracion_retenciones_estado_activo_sync_281;
ALTER TABLE public.configuracion_retenciones
  ADD CONSTRAINT ck_configuracion_retenciones_estado_activo_sync_281
  CHECK (
    (activo = true AND lower(estado::text) = 'activo')
    OR (activo = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.proveedores DROP CONSTRAINT IF EXISTS ck_proveedores_estado_valid;
ALTER TABLE public.proveedores
  ADD CONSTRAINT ck_proveedores_estado_valid
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.proveedores DROP CONSTRAINT IF EXISTS ck_proveedores_estado_activo_sync_281;
ALTER TABLE public.proveedores
  ADD CONSTRAINT ck_proveedores_estado_activo_sync_281
  CHECK (
    (activo = true AND lower(estado::text) = 'activo')
    OR (activo = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.proveedores_cuarta_categoria DROP CONSTRAINT IF EXISTS ck_proveedores_cuarta_estado_valid;
ALTER TABLE public.proveedores_cuarta_categoria
  ADD CONSTRAINT ck_proveedores_cuarta_estado_valid
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.proveedores_cuarta_categoria DROP CONSTRAINT IF EXISTS ck_proveedores_cuarta_estado_activo_sync_281;
ALTER TABLE public.proveedores_cuarta_categoria
  ADD CONSTRAINT ck_proveedores_cuarta_estado_activo_sync_281
  CHECK (
    (activo = true AND lower(estado::text) = 'activo')
    OR (activo = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

ALTER TABLE public.libro_retenciones DROP CONSTRAINT IF EXISTS ck_libro_retenciones_estado_valid;
ALTER TABLE public.libro_retenciones
  ADD CONSTRAINT ck_libro_retenciones_estado_valid
  CHECK (lower(estado::text) IN ('activo', 'anulado', 'pendiente', 'procesada')) NOT VALID;

-- ----------------------------------------------------------------------------
-- Contrato NOT NULL para columnas de estado/activo.
-- ----------------------------------------------------------------------------
ALTER TABLE public.configuracion_fiscal ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.configuracion_fiscal ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.configuracion_retenciones ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.configuracion_retenciones ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.proveedores ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.proveedores ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.proveedores_cuarta_categoria ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.proveedores_cuarta_categoria ALTER COLUMN activo SET NOT NULL;

ALTER TABLE public.libro_retenciones ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.configuracion_fiscal VALIDATE CONSTRAINT ck_configuracion_fiscal_estado_valid;
ALTER TABLE public.configuracion_fiscal VALIDATE CONSTRAINT ck_configuracion_fiscal_estado_activo_sync_281;

ALTER TABLE public.configuracion_retenciones VALIDATE CONSTRAINT ck_configuracion_retenciones_estado_valid;
ALTER TABLE public.configuracion_retenciones VALIDATE CONSTRAINT ck_configuracion_retenciones_estado_activo_sync_281;

ALTER TABLE public.proveedores VALIDATE CONSTRAINT ck_proveedores_estado_valid;
ALTER TABLE public.proveedores VALIDATE CONSTRAINT ck_proveedores_estado_activo_sync_281;

ALTER TABLE public.proveedores_cuarta_categoria VALIDATE CONSTRAINT ck_proveedores_cuarta_estado_valid;
ALTER TABLE public.proveedores_cuarta_categoria VALIDATE CONSTRAINT ck_proveedores_cuarta_estado_activo_sync_281;

ALTER TABLE public.libro_retenciones VALIDATE CONSTRAINT ck_libro_retenciones_estado_valid;

-- ----------------------------------------------------------------------------
-- Unicidades activas con predicados case-insensitive.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_configuracion_fiscal_active_single_by_pais;
CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_fiscal_active_single_by_pais
ON public.configuracion_fiscal (pais_id)
WHERE pais_id IS NOT NULL
  AND lower(estado::text) = 'activo';

DROP INDEX IF EXISTS public.ux_configuracion_retenciones_tenant_categoria_activa;
CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_retenciones_tenant_categoria_activa
ON public.configuracion_retenciones (tenant_id, upper(categoria))
WHERE tenant_id IS NOT NULL
  AND categoria IS NOT NULL
  AND lower(estado::text) = 'activo';

DROP INDEX IF EXISTS public.ux_proveedores_tenant_ruc_activo;
CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_tenant_ruc_activo
ON public.proveedores (tenant_id, lower(btrim(ruc)))
WHERE tenant_id IS NOT NULL
  AND NULLIF(btrim(COALESCE(ruc, '')), '') IS NOT NULL
  AND lower(estado::text) = 'activo';

DROP INDEX IF EXISTS public.ux_proveedores_cuarta_tenant_proveedor_activo;
CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_cuarta_tenant_proveedor_activo
ON public.proveedores_cuarta_categoria (tenant_id, proveedor_id)
WHERE tenant_id IS NOT NULL
  AND proveedor_id IS NOT NULL
  AND lower(estado::text) = 'activo';

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_global_or_tenant_policy('public', 'configuracion_fiscal');
SELECT app.apply_tenant_policy('public', 'configuracion_retenciones');
SELECT app.apply_tenant_policy('public', 'proveedores');
SELECT app.apply_tenant_policy('public', 'proveedores_cuarta_categoria');
SELECT app.apply_tenant_policy('public', 'libro_retenciones');

COMMIT;
