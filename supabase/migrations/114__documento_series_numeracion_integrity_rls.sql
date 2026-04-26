-- ============================================================================
-- 114__documento_series_numeracion_integrity_rls.sql
-- Integridad, dedupe y hardening RLS para correlativos fiscales.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Dedupe de series activas por tenant/tipo/serie.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    ds.id,
    first_value(ds.id) OVER (
      PARTITION BY
        COALESCE(ds.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        upper(COALESCE(NULLIF(btrim(ds.tipo_documento), ''), '01')),
        upper(COALESCE(NULLIF(btrim(ds.serie), ''), 'F001'))
      ORDER BY
        COALESCE(ds.correlativo_actual, 0) DESC,
        COALESCE(ds.updated_at, ds.created_at, now()) DESC,
        ds.id::text DESC
    ) AS kept_id,
    row_number() OVER (
      PARTITION BY
        COALESCE(ds.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        upper(COALESCE(NULLIF(btrim(ds.tipo_documento), ''), '01')),
        upper(COALESCE(NULLIF(btrim(ds.serie), ''), 'F001'))
      ORDER BY
        COALESCE(ds.correlativo_actual, 0) DESC,
        COALESCE(ds.updated_at, ds.created_at, now()) DESC,
        ds.id::text DESC
    ) AS rn
  FROM public.documento_series ds
  WHERE COALESCE(ds.activo, true) = true
)
UPDATE public.documento_series ds
SET
  activo = false,
  estado = 'INACTIVO',
  metadata = COALESCE(ds.metadata, '{}'::jsonb) || jsonb_build_object(
    'dedupe_migration',
    '114__documento_series_numeracion_integrity_rls',
    'dedupe_kept_id',
    r.kept_id::text
  ),
  updated_at = now()
FROM ranked r
WHERE ds.id = r.id
  AND r.rn > 1;

-- Filas activas sin tenant no deben operar.
UPDATE public.documento_series
SET
  activo = false,
  estado = 'INACTIVO',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'normalized_by',
    '114__documento_series_numeracion_integrity_rls',
    'reason',
    'ACTIVE_WITHOUT_TENANT'
  ),
  updated_at = now()
WHERE COALESCE(activo, true) = true
  AND tenant_id IS NULL;

-- ----------------------------------------------------------------------------
-- Constraints de calidad.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.documento_series') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_series_tipo_nonempty'
      AND conrelid = 'public.documento_series'::regclass
  ) THEN
    ALTER TABLE public.documento_series
    ADD CONSTRAINT ck_documento_series_tipo_nonempty
    CHECK (tipo_documento IS NOT NULL AND btrim(tipo_documento) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_series_serie_shape'
      AND conrelid = 'public.documento_series'::regclass
  ) THEN
    ALTER TABLE public.documento_series
    ADD CONSTRAINT ck_documento_series_serie_shape
    CHECK (serie IS NOT NULL AND serie ~ '^[A-Z0-9]{1,10}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_series_correlativo_nonnegative'
      AND conrelid = 'public.documento_series'::regclass
  ) THEN
    ALTER TABLE public.documento_series
    ADD CONSTRAINT ck_documento_series_correlativo_nonnegative
    CHECK (correlativo_actual >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_series_correlativo_max_valid'
      AND conrelid = 'public.documento_series'::regclass
  ) THEN
    ALTER TABLE public.documento_series
    ADD CONSTRAINT ck_documento_series_correlativo_max_valid
    CHECK (correlativo_maximo >= GREATEST(correlativo_actual, 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_series_longitud_range'
      AND conrelid = 'public.documento_series'::regclass
  ) THEN
    ALTER TABLE public.documento_series
    ADD CONSTRAINT ck_documento_series_longitud_range
    CHECK (longitud_correlativo BETWEEN 4 AND 12);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_series_tenant_required_when_active'
      AND conrelid = 'public.documento_series'::regclass
  ) THEN
    ALTER TABLE public.documento_series
    ADD CONSTRAINT ck_documento_series_tenant_required_when_active
    CHECK (COALESCE(activo, false) = false OR tenant_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_documento_series_activo_estado_consistency'
      AND conrelid = 'public.documento_series'::regclass
  ) THEN
    ALTER TABLE public.documento_series
    ADD CONSTRAINT ck_documento_series_activo_estado_consistency
    CHECK (COALESCE(activo, false) = false OR upper(COALESCE(estado, '')) = 'ACTIVO');
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Unicidad operativa y rendimiento.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_documento_series_scope_active_upper
ON public.documento_series (
  tenant_id,
  upper(tipo_documento),
  upper(serie)
)
WHERE COALESCE(activo, true) = true
  AND tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documento_series_tenant_serie_active_runtime
ON public.documento_series (tenant_id, serie, activo, updated_at DESC);

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'documento_series');

COMMIT;
