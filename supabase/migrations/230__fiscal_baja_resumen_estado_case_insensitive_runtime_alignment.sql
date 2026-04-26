-- ============================================================================
-- 230__fiscal_baja_resumen_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados del flujo fiscal RA/RC.
-- Tablas foco:
--   public.comunicaciones_baja
--   public.resumenes_diarios
--   public.detalle_comunicacion_baja
--   public.detalle_resumen_diario
--   public.validaciones_sunat
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_fiscal_baja_estado_230(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'ACTIVO' THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado = 'INACTIVO' THEN v_estado := 'ANULADO'; END IF;
  IF v_estado IN ('COMPLETADO', 'PROCESADO', 'OK') THEN v_estado := 'ACEPTADO'; END IF;
  IF v_estado IN ('FAILED') THEN v_estado := 'ERROR'; END IF;

  IF v_estado NOT IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ERROR', 'ANULADO') THEN
    v_estado := 'PENDIENTE';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_fiscal_baja_detalle_estado_230(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'ACTIVO' THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado = 'INACTIVO' THEN v_estado := 'ANULADO'; END IF;
  IF v_estado = 'ERROR' THEN v_estado := 'RECHAZADO'; END IF;

  IF v_estado NOT IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO', 'ANULADO') THEN
    v_estado := 'PENDIENTE';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_validaciones_sunat_estado_230(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'ACTIVO' THEN v_estado := 'VALIDO'; END IF;
  IF v_estado = 'INACTIVO' THEN v_estado := 'INVALIDO'; END IF;
  IF v_estado = 'ACEPTADO' THEN v_estado := 'VALIDO'; END IF;
  IF v_estado = 'RECHAZADO' THEN v_estado := 'INVALIDO'; END IF;
  IF v_estado IN ('FAILED') THEN v_estado := 'ERROR'; END IF;

  IF v_estado NOT IN ('PENDIENTE', 'VALIDO', 'INVALIDO', 'ERROR', 'VENCIDO') THEN
    v_estado := 'PENDIENTE';
  END IF;
  RETURN v_estado::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion a citext para filtros case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.comunicaciones_baja
  ALTER COLUMN estado TYPE citext
  USING app.normalize_fiscal_baja_estado_230(estado::text);

ALTER TABLE public.resumenes_diarios
  ALTER COLUMN estado TYPE citext
  USING app.normalize_fiscal_baja_estado_230(estado::text);

ALTER TABLE public.detalle_comunicacion_baja
  ALTER COLUMN estado TYPE citext
  USING app.normalize_fiscal_baja_detalle_estado_230(estado::text);

ALTER TABLE public.detalle_resumen_diario
  ALTER COLUMN estado TYPE citext
  USING app.normalize_fiscal_baja_detalle_estado_230(estado::text);

ALTER TABLE public.validaciones_sunat
  ALTER COLUMN estado TYPE citext
  USING app.normalize_validaciones_sunat_estado_230(estado::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.comunicaciones_baja cb
SET
  estado = app.normalize_fiscal_baja_estado_230(cb.estado::text),
  updated_at = now()
WHERE cb.id IS NOT NULL;

UPDATE public.resumenes_diarios r
SET
  estado = app.normalize_fiscal_baja_estado_230(r.estado::text),
  updated_at = now()
WHERE r.id IS NOT NULL;

UPDATE public.detalle_comunicacion_baja d
SET
  estado = app.normalize_fiscal_baja_detalle_estado_230(d.estado::text),
  updated_at = now()
WHERE d.id IS NOT NULL;

UPDATE public.detalle_resumen_diario d
SET
  estado = app.normalize_fiscal_baja_detalle_estado_230(d.estado::text),
  updated_at = now()
WHERE d.id IS NOT NULL;

UPDATE public.validaciones_sunat v
SET
  estado = app.normalize_validaciones_sunat_estado_230(v.estado::text),
  updated_at = now()
WHERE v.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_comunicaciones_baja_tenant_estado_ci_runtime_230
ON public.comunicaciones_baja (tenant_id, estado, fecha_generacion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resumenes_diarios_tenant_estado_ci_runtime_230
ON public.resumenes_diarios (tenant_id, estado, fecha_generacion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_comunicacion_baja_tenant_estado_ci_runtime_230
ON public.detalle_comunicacion_baja (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_resumen_diario_tenant_estado_ci_runtime_230
ON public.detalle_resumen_diario (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validaciones_sunat_tenant_estado_ci_runtime_230
ON public.validaciones_sunat (tenant_id, estado, validado_en DESC, created_at DESC);

COMMIT;
