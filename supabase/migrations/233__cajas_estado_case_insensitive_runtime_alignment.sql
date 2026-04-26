-- ============================================================================
-- 233__cajas_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en Cajas.
-- Tablas foco:
--   public.cajas
--   public.sesiones_caja
--   public.retiros_caja (estado_conciliacion)
--   public.cambios_turno
--   public.autorizaciones_caja
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cajas_estado_233(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ACTIVO'));
  IF v_estado IN ('CERRADA', 'DISABLED') THEN v_estado := 'INACTIVO'; END IF;
  IF v_estado NOT IN ('ACTIVO', 'INACTIVO', 'MANTENIMIENTO', 'BLOQUEADA') THEN
    v_estado := 'ACTIVO';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_sesiones_caja_estado_233(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ABIERTA'));
  IF v_estado IN ('ACTIVO', 'OPEN') THEN v_estado := 'ABIERTA'; END IF;
  IF v_estado IN ('INACTIVO', 'CLOSED', 'CERRADO') THEN v_estado := 'CERRADA'; END IF;
  IF v_estado NOT IN ('ABIERTA', 'CERRADA', 'PAUSADA', 'ANULADA') THEN
    v_estado := 'ABIERTA';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_retiros_caja_estado_conciliacion_233(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
  IF v_estado NOT IN ('PENDIENTE', 'CONCILIADO', 'RECHAZADO') THEN
    v_estado := 'PENDIENTE';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_cambios_turno_estado_233(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'EN_PROCESO'));
  IF v_estado IN ('ACTIVO', 'BORRADOR', 'PENDIENTE') THEN v_estado := 'EN_PROCESO'; END IF;
  IF v_estado IN ('FINALIZADO') THEN v_estado := 'COMPLETADO'; END IF;
  IF v_estado IN ('ANULADO') THEN v_estado := 'CANCELADO'; END IF;
  IF v_estado NOT IN ('EN_PROCESO', 'COMPLETADO', 'CANCELADO') THEN
    v_estado := 'EN_PROCESO';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_autorizaciones_caja_estado_233(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'APROBADA' THEN v_estado := 'APROBADO'; END IF;
  IF v_estado = 'RECHAZADA' THEN v_estado := 'RECHAZADO'; END IF;
  IF v_estado NOT IN ('APROBADO', 'RECHAZADO', 'PENDIENTE') THEN
    v_estado := 'PENDIENTE';
  END IF;
  RETURN v_estado::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.cajas
  ALTER COLUMN estado TYPE citext
  USING app.normalize_cajas_estado_233(estado::text);

ALTER TABLE public.sesiones_caja
  ALTER COLUMN estado TYPE citext
  USING app.normalize_sesiones_caja_estado_233(estado::text);

ALTER TABLE public.retiros_caja
  ALTER COLUMN estado_conciliacion TYPE citext
  USING app.normalize_retiros_caja_estado_conciliacion_233(estado_conciliacion::text);

ALTER TABLE public.cambios_turno
  ALTER COLUMN estado TYPE citext
  USING app.normalize_cambios_turno_estado_233(estado::text);

ALTER TABLE public.autorizaciones_caja
  ALTER COLUMN estado TYPE citext
  USING app.normalize_autorizaciones_caja_estado_233(estado::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.cajas c
SET estado = app.normalize_cajas_estado_233(c.estado::text)
WHERE c.id IS NOT NULL;

UPDATE public.sesiones_caja s
SET estado = app.normalize_sesiones_caja_estado_233(s.estado::text)
WHERE s.id IS NOT NULL;

UPDATE public.retiros_caja r
SET estado_conciliacion = app.normalize_retiros_caja_estado_conciliacion_233(r.estado_conciliacion::text)
WHERE r.id IS NOT NULL;

UPDATE public.cambios_turno ct
SET estado = app.normalize_cambios_turno_estado_233(ct.estado::text)
WHERE ct.id IS NOT NULL;

UPDATE public.autorizaciones_caja a
SET estado = app.normalize_autorizaciones_caja_estado_233(a.estado::text)
WHERE a.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado (CI).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cajas_tenant_estado_ci_runtime_233
ON public.cajas (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_tenant_estado_apertura_ci_runtime_233
ON public.sesiones_caja (tenant_id, estado, hora_apertura DESC);

CREATE INDEX IF NOT EXISTS idx_retiros_caja_tenant_estado_conciliacion_ci_runtime_233
ON public.retiros_caja (tenant_id, estado_conciliacion, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cambios_turno_tenant_sesion_estado_ci_runtime_233
ON public.cambios_turno (tenant_id, sesion_caja_id, estado, timestamp_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_autorizaciones_caja_tenant_sesion_estado_ci_runtime_233
ON public.autorizaciones_caja (tenant_id, sesion_caja_id, estado, created_at DESC);

COMMIT;
