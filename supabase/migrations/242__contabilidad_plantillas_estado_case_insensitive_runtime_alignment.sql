-- ============================================================================
-- 242__contabilidad_plantillas_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en plantillas contables.
-- Tablas foco:
--   public.plantillas_asientos
--   public.plantillas_asientos_detalle
--   public.plantillas_asientos_historial
--   public.plantillas_asientos_ventas
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_plantilla_estado_242(
  p_input text,
  p_default text DEFAULT 'ACTIVO'
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
BEGIN
  RETURN app.normalize_plantilla_estado(p_input, p_default)::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_plantillas_asientos_historial_estado_242(
  p_estado text
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'GENERADO'));
  IF v_estado = 'ACTIVO' THEN v_estado := 'GENERADO'; END IF;
  IF v_estado = 'INACTIVO' THEN v_estado := 'ANULADO'; END IF;
  IF v_estado NOT IN ('GENERADO', 'ERROR', 'PENDIENTE', 'ANULADO') THEN
    v_estado := 'GENERADO';
  END IF;
  RETURN v_estado::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.plantillas_asientos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_plantilla_estado_242(estado::text, 'ACTIVO');

ALTER TABLE public.plantillas_asientos_detalle
  ALTER COLUMN estado TYPE citext
  USING app.normalize_plantilla_estado_242(estado::text, 'ACTIVO');

ALTER TABLE public.plantillas_asientos_historial
  ALTER COLUMN estado TYPE citext
  USING app.normalize_plantillas_asientos_historial_estado_242(estado::text);

ALTER TABLE public.plantillas_asientos_ventas
  ALTER COLUMN estado TYPE citext
  USING app.normalize_plantilla_estado_242(estado::text, 'ACTIVO');

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.plantillas_asientos p
SET estado = app.normalize_plantilla_estado_242(p.estado::text, 'ACTIVO')
WHERE p.id IS NOT NULL;

UPDATE public.plantillas_asientos_detalle d
SET estado = app.normalize_plantilla_estado_242(d.estado::text, 'ACTIVO')
WHERE d.id IS NOT NULL;

UPDATE public.plantillas_asientos_historial h
SET estado = app.normalize_plantillas_asientos_historial_estado_242(h.estado::text)
WHERE h.id IS NOT NULL;

UPDATE public.plantillas_asientos_ventas pv
SET estado = app.normalize_plantilla_estado_242(pv.estado::text, 'ACTIVO')
WHERE pv.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado (CI).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_tenant_estado_ci_runtime_242
ON public.plantillas_asientos (tenant_id, estado, modulo, tipo_origen);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_detalle_tenant_estado_ci_runtime_242
ON public.plantillas_asientos_detalle (tenant_id, estado, plantilla_id, orden);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_historial_tenant_estado_ci_runtime_242
ON public.plantillas_asientos_historial (tenant_id, estado, fecha_generacion DESC);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_ventas_estado_ci_runtime_242
ON public.plantillas_asientos_ventas (pais_id, tipo_documento, estado, tenant_id, prioridad);

COMMIT;
