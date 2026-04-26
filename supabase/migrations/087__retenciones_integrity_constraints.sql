-- ============================================================================
-- 087__retenciones_integrity_constraints.sql
-- Integridad y unicidad runtime de configuración de retenciones.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Constraints de calidad para configuración de retenciones.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.configuracion_retenciones') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_configuracion_retenciones_categoria_valid'
        AND conrelid = 'public.configuracion_retenciones'::regclass
    ) THEN
      ALTER TABLE public.configuracion_retenciones
      ADD CONSTRAINT ck_configuracion_retenciones_categoria_valid
      CHECK (categoria IN ('CUARTA', 'QUINTA'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_configuracion_retenciones_tasa_range'
        AND conrelid = 'public.configuracion_retenciones'::regclass
    ) THEN
      ALTER TABLE public.configuracion_retenciones
      ADD CONSTRAINT ck_configuracion_retenciones_tasa_range
      CHECK (tasa_porcentaje >= 0 AND tasa_porcentaje <= 100);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_configuracion_retenciones_monto_minimo_nonnegative'
        AND conrelid = 'public.configuracion_retenciones'::regclass
    ) THEN
      ALTER TABLE public.configuracion_retenciones
      ADD CONSTRAINT ck_configuracion_retenciones_monto_minimo_nonnegative
      CHECK (monto_minimo >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_configuracion_retenciones_estado_valid'
        AND conrelid = 'public.configuracion_retenciones'::regclass
    ) THEN
      ALTER TABLE public.configuracion_retenciones
      ADD CONSTRAINT ck_configuracion_retenciones_estado_valid
      CHECK (estado IN ('ACTIVO', 'INACTIVO'));
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.configuracion_retenciones
  VALIDATE CONSTRAINT ck_configuracion_retenciones_categoria_valid;
ALTER TABLE IF EXISTS public.configuracion_retenciones
  VALIDATE CONSTRAINT ck_configuracion_retenciones_tasa_range;
ALTER TABLE IF EXISTS public.configuracion_retenciones
  VALIDATE CONSTRAINT ck_configuracion_retenciones_monto_minimo_nonnegative;
ALTER TABLE IF EXISTS public.configuracion_retenciones
  VALIDATE CONSTRAINT ck_configuracion_retenciones_estado_valid;

-- ----------------------------------------------------------------------------
-- Dedupe por tenant/categoria para soportar consultas `.single()` del servicio.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, upper(categoria)
      ORDER BY
        COALESCE(updated_at, created_at, now()) DESC,
        id::text DESC
    ) AS rn
  FROM public.configuracion_retenciones
  WHERE tenant_id IS NOT NULL
    AND categoria IS NOT NULL
    AND COALESCE(activo, true) = true
)
UPDATE public.configuracion_retenciones cr
SET
  activo = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked r
WHERE cr.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Unicidad activa por tenant/categoria.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_retenciones_tenant_categoria_activa
ON public.configuracion_retenciones (tenant_id, upper(categoria))
WHERE tenant_id IS NOT NULL
  AND categoria IS NOT NULL
  AND COALESCE(activo, true) = true;

-- ----------------------------------------------------------------------------
-- RLS explícito (idempotente) para tabla tenant-scoped.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'configuracion_retenciones');

COMMIT;
