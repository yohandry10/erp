-- ============================================================================
-- 260__ventas_historicas_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en ventas historicas.
-- Tablas foco:
--   public.ventas
--   public.venta_detalles
--   public.pagos_ventas
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado por dominio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_ventas_estado_260(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'BORRADOR'));
  IF v IN ('ACTIVO', 'CERRADA') THEN v := 'CONFIRMADA'; END IF;
  IF v IN ('INACTIVO', 'CANCELADA', 'CANCELADO') THEN v := 'ANULADA'; END IF;
  IF v NOT IN ('BORRADOR', 'EMITIDA', 'PAGADA', 'CONFIRMADA', 'ANULADA') THEN
    v := 'BORRADOR';
  END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_venta_detalles_estado_260(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'REGISTRADO'));
  IF v = 'ACTIVO' THEN v := 'REGISTRADO'; END IF;
  IF v IN ('INACTIVO', 'CANCELADO', 'CANCELADA') THEN v := 'ANULADO'; END IF;
  IF v NOT IN ('REGISTRADO', 'ANULADO') THEN
    v := 'REGISTRADO';
  END IF;
  RETURN v::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_pagos_ventas_estado_260(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'APLICADO'));
  IF v IN ('ACTIVO', 'PAGADO') THEN v := 'APLICADO'; END IF;
  IF v IN ('INACTIVO', 'CANCELADO', 'CANCELADA') THEN v := 'ANULADO'; END IF;
  IF v NOT IN ('REGISTRADO', 'APLICADO', 'ANULADO') THEN
    v := 'APLICADO';
  END IF;
  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ventas
  ALTER COLUMN estado TYPE citext
  USING app.normalize_ventas_estado_260(estado::text);

ALTER TABLE public.venta_detalles
  ALTER COLUMN estado TYPE citext
  USING app.normalize_venta_detalles_estado_260(estado::text);

ALTER TABLE public.pagos_ventas
  ALTER COLUMN estado TYPE citext
  USING app.normalize_pagos_ventas_estado_260(estado::text);

-- Defaults explicitos de estado.
ALTER TABLE public.ventas ALTER COLUMN estado SET DEFAULT 'BORRADOR'::citext;
ALTER TABLE public.venta_detalles ALTER COLUMN estado SET DEFAULT 'REGISTRADO'::citext;
ALTER TABLE public.pagos_ventas ALTER COLUMN estado SET DEFAULT 'APLICADO'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.ventas
SET estado = app.normalize_ventas_estado_260(estado::text)
WHERE id IS NOT NULL;

UPDATE public.venta_detalles
SET estado = app.normalize_venta_detalles_estado_260(estado::text)
WHERE id IS NOT NULL;

UPDATE public.pagos_ventas
SET estado = app.normalize_pagos_ventas_estado_260(estado::text)
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ventas_tenant_estado_ci_runtime_260
ON public.ventas (tenant_id, estado, fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venta_detalles_tenant_estado_ci_runtime_260
ON public.venta_detalles (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pagos_ventas_tenant_estado_ci_runtime_260
ON public.pagos_ventas (tenant_id, estado, fecha_pago DESC, created_at DESC);

COMMIT;
