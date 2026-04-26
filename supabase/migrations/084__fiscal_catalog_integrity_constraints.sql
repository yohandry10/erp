-- ============================================================================
-- 084__fiscal_catalog_integrity_constraints.sql
-- Integridad de catálogos fiscales para evitar ambigüedad en lecturas `.single()`.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Integridad referencial con catálogo de países.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible(
  'configuracion_fiscal',
  'pais_id',
  'paises',
  'id',
  'fk_configuracion_fiscal_pais_id'
);

SELECT app.add_fk_if_possible(
  'tipos_documentos_fiscales',
  'pais_id',
  'paises',
  'id',
  'fk_tipos_documentos_fiscales_pais_id'
);

SELECT app.add_fk_if_possible(
  'tipos_impuestos',
  'pais_id',
  'paises',
  'id',
  'fk_tipos_impuestos_pais_id'
);

-- ----------------------------------------------------------------------------
-- Constraints de calidad en catálogos fiscales.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.configuracion_fiscal') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_configuracion_fiscal_pais_positive'
        AND conrelid = 'public.configuracion_fiscal'::regclass
    ) THEN
      ALTER TABLE public.configuracion_fiscal
      ADD CONSTRAINT ck_configuracion_fiscal_pais_positive
      CHECK (pais_id IS NULL OR pais_id > 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_configuracion_fiscal_estado_valid'
        AND conrelid = 'public.configuracion_fiscal'::regclass
    ) THEN
      ALTER TABLE public.configuracion_fiscal
      ADD CONSTRAINT ck_configuracion_fiscal_estado_valid
      CHECK (estado IN ('ACTIVO', 'INACTIVO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_configuracion_fiscal_rates_range'
        AND conrelid = 'public.configuracion_fiscal'::regclass
    ) THEN
      ALTER TABLE public.configuracion_fiscal
      ADD CONSTRAINT ck_configuracion_fiscal_rates_range
      CHECK (
        impuesto_principal_porcentaje BETWEEN 0 AND 1
        AND tasa_igv BETWEEN 0 AND 1
        AND retencion_renta_porcentaje BETWEEN 0 AND 1
        AND retencion_iva_porcentaje BETWEEN 0 AND 1
        AND percepcion_porcentaje BETWEEN 0 AND 1
        AND detraccion_porcentaje BETWEEN 0 AND 1
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_configuracion_fiscal_documento_len_positive'
        AND conrelid = 'public.configuracion_fiscal'::regclass
    ) THEN
      ALTER TABLE public.configuracion_fiscal
      ADD CONSTRAINT ck_configuracion_fiscal_documento_len_positive
      CHECK (longitud_documento_empresa >= 1);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_configuracion_fiscal_items_limit_positive'
        AND conrelid = 'public.configuracion_fiscal'::regclass
    ) THEN
      ALTER TABLE public.configuracion_fiscal
      ADD CONSTRAINT ck_configuracion_fiscal_items_limit_positive
      CHECK (max_items_por_documento >= 1 AND monto_maximo_documento > 0);
    END IF;
  END IF;

  IF to_regclass('public.tipos_documentos_fiscales') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_tipos_documentos_fiscales_codigo_nonempty'
        AND conrelid = 'public.tipos_documentos_fiscales'::regclass
    ) THEN
      ALTER TABLE public.tipos_documentos_fiscales
      ADD CONSTRAINT ck_tipos_documentos_fiscales_codigo_nonempty
      CHECK (codigo IS NULL OR btrim(codigo) <> '');
    END IF;
  END IF;

  IF to_regclass('public.tipos_impuestos') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_tipos_impuestos_codigo_nonempty'
        AND conrelid = 'public.tipos_impuestos'::regclass
    ) THEN
      ALTER TABLE public.tipos_impuestos
      ADD CONSTRAINT ck_tipos_impuestos_codigo_nonempty
      CHECK (codigo IS NULL OR btrim(codigo) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_tipos_impuestos_porcentaje_range'
        AND conrelid = 'public.tipos_impuestos'::regclass
    ) THEN
      ALTER TABLE public.tipos_impuestos
      ADD CONSTRAINT ck_tipos_impuestos_porcentaje_range
      CHECK (porcentaje >= 0 AND porcentaje <= 100);
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.configuracion_fiscal
  VALIDATE CONSTRAINT ck_configuracion_fiscal_pais_positive;
ALTER TABLE IF EXISTS public.configuracion_fiscal
  VALIDATE CONSTRAINT ck_configuracion_fiscal_estado_valid;
ALTER TABLE IF EXISTS public.configuracion_fiscal
  VALIDATE CONSTRAINT ck_configuracion_fiscal_rates_range;
ALTER TABLE IF EXISTS public.configuracion_fiscal
  VALIDATE CONSTRAINT ck_configuracion_fiscal_documento_len_positive;
ALTER TABLE IF EXISTS public.configuracion_fiscal
  VALIDATE CONSTRAINT ck_configuracion_fiscal_items_limit_positive;

ALTER TABLE IF EXISTS public.tipos_documentos_fiscales
  VALIDATE CONSTRAINT ck_tipos_documentos_fiscales_codigo_nonempty;
ALTER TABLE IF EXISTS public.tipos_impuestos
  VALIDATE CONSTRAINT ck_tipos_impuestos_codigo_nonempty;
ALTER TABLE IF EXISTS public.tipos_impuestos
  VALIDATE CONSTRAINT ck_tipos_impuestos_porcentaje_range;

-- ----------------------------------------------------------------------------
-- Dedupe de filas activas para asegurar lecturas determinísticas por país.
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
    AND COALESCE(activo, true) = true
)
UPDATE public.configuracion_fiscal cf
SET
  activo = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked r
WHERE cf.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY pais_id, upper(codigo)
      ORDER BY
        (tenant_id IS NULL) DESC,
        COALESCE(updated_at, created_at, now()) DESC,
        id::text DESC
    ) AS rn
  FROM public.tipos_documentos_fiscales
  WHERE pais_id IS NOT NULL
    AND codigo IS NOT NULL
    AND btrim(codigo) <> ''
    AND COALESCE(activo, true) = true
)
UPDATE public.tipos_documentos_fiscales t
SET
  activo = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY pais_id, upper(codigo)
      ORDER BY
        (tenant_id IS NULL) DESC,
        COALESCE(updated_at, created_at, now()) DESC,
        id::text DESC
    ) AS rn
  FROM public.tipos_impuestos
  WHERE pais_id IS NOT NULL
    AND codigo IS NOT NULL
    AND btrim(codigo) <> ''
    AND COALESCE(activo, true) = true
)
UPDATE public.tipos_impuestos t
SET
  activo = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Unicidad para evitar errores de PostgREST `.single()` y duplicados activos.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracion_fiscal_active_single_by_pais
ON public.configuracion_fiscal (pais_id)
WHERE pais_id IS NOT NULL
  AND COALESCE(activo, true) = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tipos_documentos_fiscales_active_pais_codigo
ON public.tipos_documentos_fiscales (pais_id, upper(codigo))
WHERE pais_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND COALESCE(activo, true) = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tipos_impuestos_active_pais_codigo
ON public.tipos_impuestos (pais_id, upper(codigo))
WHERE pais_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND COALESCE(activo, true) = true;

COMMIT;
