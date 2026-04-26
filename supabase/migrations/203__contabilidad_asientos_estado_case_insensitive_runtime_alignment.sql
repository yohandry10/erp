-- ============================================================================
-- 203__contabilidad_asientos_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime para estados de asientos contables:
-- `asientos_contables` con contrato case-insensitive para filtros de reportes.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Normalizador canonico de estado para asientos contables.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_asientos_contables_estado(p_estado text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'BORRADOR'));
BEGIN
  IF v IN ('CONFIRMADO', 'APROBADO', 'POSTEADO', 'PUBLICADO', 'ACTIVO', 'VALIDADO') THEN
    RETURN 'CONFIRMADO';
  END IF;

  IF v IN ('ANULADO', 'CANCELADO', 'REVERSADO', 'REVERSA', 'RECHAZADO', 'INACTIVO', 'ELIMINADO') THEN
    RETURN 'ANULADO';
  END IF;

  IF v IN ('BORRADOR', 'PENDIENTE', 'DRAFT', 'GENERADO', 'REGISTRADO') THEN
    RETURN 'BORRADOR';
  END IF;

  RETURN 'BORRADOR';
END;
$$;

-- ----------------------------------------------------------------------------
-- asientos_contables: tipado/normalizacion de estado + montos.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.asientos_contables
  ALTER COLUMN total_debe TYPE numeric(14,2) USING app.to_numeric_or_zero(total_debe::text),
  ALTER COLUMN total_haber TYPE numeric(14,2) USING app.to_numeric_or_zero(total_haber::text),
  ALTER COLUMN estado TYPE citext USING app.normalize_asientos_contables_estado(estado::text)::citext,
  ALTER COLUMN total_debe SET DEFAULT 0,
  ALTER COLUMN total_haber SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'BORRADOR'::citext;

UPDATE public.asientos_contables a
SET
  total_debe = GREATEST(COALESCE(a.total_debe, 0), 0),
  total_haber = GREATEST(COALESCE(a.total_haber, 0), 0),
  estado = app.normalize_asientos_contables_estado(a.estado::text)::citext,
  fecha = COALESCE(a.fecha, a.created_at, now()),
  updated_at = now()
WHERE a.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_asientos_contables_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, app, pg_temp
AS $$
BEGIN
  NEW.total_debe := GREATEST(app.to_numeric_or_zero(NEW.total_debe::text), 0);
  NEW.total_haber := GREATEST(app.to_numeric_or_zero(NEW.total_haber::text), 0);
  NEW.estado := app.normalize_asientos_contables_estado(NEW.estado::text)::citext;
  NEW.fecha := COALESCE(NEW.fecha, NEW.created_at, now());
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_asientos_contables_row ON public.asientos_contables;
CREATE TRIGGER trg_normalize_asientos_contables_row
BEFORE INSERT OR UPDATE OF estado, total_debe, total_haber, fecha
ON public.asientos_contables
FOR EACH ROW
EXECUTE FUNCTION app.normalize_asientos_contables_row();

CREATE INDEX IF NOT EXISTS idx_asientos_contables_tenant_estado_ci_runtime_203
ON public.asientos_contables (tenant_id, estado, fecha DESC, created_at DESC);

COMMIT;
