-- ============================================================================
-- 212__compras_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados del vertical Compras:
-- ordenes_compra, recepciones, compras (alias), cotizaciones_compra,
-- oc_aprobaciones, devoluciones_proveedor.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estados por tabla.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_ordenes_compra_estado_212(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'PENDIENTE'));
BEGIN
  IF v IN ('BORRADOR', 'PENDIENTE', 'APROBACION', 'APROBADA', 'PARCIAL', 'RECIBIDA', 'ANULADA', 'RECHAZADA', 'ENTREGADO', 'ENTREGADA') THEN
    RETURN v::citext;
  END IF;

  IF v IN ('ACTIVO', 'ABIERTA', 'ABIERTO', 'CREADA') THEN
    RETURN 'PENDIENTE'::citext;
  END IF;

  IF v IN ('CERRADA', 'CERRADO', 'COMPLETADA', 'COMPLETADO') THEN
    RETURN 'ENTREGADA'::citext;
  END IF;

  IF v IN ('CANCELADA', 'CANCELADO') THEN
    RETURN 'ANULADA'::citext;
  END IF;

  RETURN 'PENDIENTE'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_recepciones_estado_212(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'BORRADOR'));
BEGIN
  IF v IN ('BORRADOR', 'EN_PROCESO', 'CERRADA', 'ANULADA') THEN
    RETURN v::citext;
  END IF;

  IF v IN ('ACTIVO', 'ABIERTA', 'ABIERTO') THEN
    RETURN 'BORRADOR'::citext;
  END IF;

  IF v IN ('CERRADO', 'COMPLETADO', 'ENTREGADA', 'RECIBIDA') THEN
    RETURN 'CERRADA'::citext;
  END IF;

  IF v IN ('CANCELADA', 'CANCELADO', 'RECHAZADA') THEN
    RETURN 'ANULADA'::citext;
  END IF;

  RETURN 'BORRADOR'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_compras_estado_212(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'PENDIENTE'));
BEGIN
  IF v IN ('PENDIENTE', 'ENTREGADA', 'ANULADA') THEN
    RETURN v::citext;
  END IF;

  IF v IN ('ACTIVO', 'BORRADOR', 'APROBADA', 'PARCIAL') THEN
    RETURN 'PENDIENTE'::citext;
  END IF;

  IF v IN ('RECIBIDA', 'ENTREGADO', 'CERRADA', 'CERRADO', 'COMPLETADA') THEN
    RETURN 'ENTREGADA'::citext;
  END IF;

  IF v IN ('CANCELADA', 'CANCELADO', 'RECHAZADA') THEN
    RETURN 'ANULADA'::citext;
  END IF;

  RETURN 'PENDIENTE'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_cotizaciones_compra_estado_212(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'BORRADOR'));
BEGIN
  IF v IN ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA') THEN
    RETURN v::citext;
  END IF;

  IF v IN ('ACTIVO', 'DRAFT') THEN
    RETURN 'BORRADOR'::citext;
  END IF;

  IF v IN ('CANCELADA', 'CANCELADO') THEN
    RETURN 'RECHAZADA'::citext;
  END IF;

  RETURN 'BORRADOR'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_oc_aprobaciones_estado_212(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'PENDIENTE'));
BEGIN
  IF v IN ('PENDIENTE', 'APROBADA', 'RECHAZADA') THEN
    RETURN v::citext;
  END IF;

  IF v IN ('ACTIVO', 'BORRADOR') THEN
    RETURN 'PENDIENTE'::citext;
  END IF;

  RETURN 'PENDIENTE'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_devoluciones_proveedor_estado_212(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'PENDIENTE'));
BEGIN
  IF v IN ('PENDIENTE', 'EMITIDA', 'ANULADA', 'RECHAZADA') THEN
    RETURN v::citext;
  END IF;

  IF v IN ('ACTIVO', 'BORRADOR') THEN
    RETURN 'PENDIENTE'::citext;
  END IF;

  IF v IN ('CANCELADA', 'CANCELADO') THEN
    RETURN 'ANULADA'::citext;
  END IF;

  RETURN 'PENDIENTE'::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Conversión de columnas estado a citext (contrato case-insensitive).
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ordenes_compra
  ALTER COLUMN estado TYPE citext USING app.normalize_ordenes_compra_estado_212(estado::text),
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE'::citext;

ALTER TABLE IF EXISTS public.recepciones
  ALTER COLUMN estado TYPE citext USING app.normalize_recepciones_estado_212(estado::text),
  ALTER COLUMN estado SET DEFAULT 'BORRADOR'::citext;

ALTER TABLE IF EXISTS public.compras
  ALTER COLUMN estado TYPE citext USING app.normalize_compras_estado_212(estado::text),
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE'::citext;

ALTER TABLE IF EXISTS public.cotizaciones_compra
  ALTER COLUMN estado TYPE citext USING app.normalize_cotizaciones_compra_estado_212(estado::text),
  ALTER COLUMN estado SET DEFAULT 'BORRADOR'::citext;

ALTER TABLE IF EXISTS public.oc_aprobaciones
  ALTER COLUMN estado TYPE citext USING app.normalize_oc_aprobaciones_estado_212(estado::text),
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE'::citext;

ALTER TABLE IF EXISTS public.devoluciones_proveedor
  ALTER COLUMN estado TYPE citext USING app.normalize_devoluciones_proveedor_estado_212(estado::text),
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.ordenes_compra t
SET estado = app.normalize_ordenes_compra_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.recepciones t
SET estado = app.normalize_recepciones_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.compras t
SET estado = app.normalize_compras_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.cotizaciones_compra t
SET estado = app.normalize_cotizaciones_compra_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.oc_aprobaciones t
SET estado = app.normalize_oc_aprobaciones_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

UPDATE public.devoluciones_proveedor t
SET estado = app.normalize_devoluciones_proveedor_estado_212(t.estado::text),
    updated_at = now()
WHERE t.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Normalización runtime adicional para tablas sin trigger de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_ordenes_compra_estado_row_212()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_ordenes_compra_estado_212(NEW.estado::text);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_ordenes_compra_estado_row_212 ON public.ordenes_compra;
CREATE TRIGGER trg_normalize_ordenes_compra_estado_row_212
BEFORE INSERT OR UPDATE OF estado
ON public.ordenes_compra
FOR EACH ROW
EXECUTE FUNCTION app.normalize_ordenes_compra_estado_row_212();

CREATE OR REPLACE FUNCTION app.normalize_recepciones_estado_row_212()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_recepciones_estado_212(NEW.estado::text);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_recepciones_estado_row_212 ON public.recepciones;
CREATE TRIGGER trg_normalize_recepciones_estado_row_212
BEFORE INSERT OR UPDATE OF estado
ON public.recepciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_recepciones_estado_row_212();

-- ----------------------------------------------------------------------------
-- Índices runtime por estado (case-insensitive via citext).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_tenant_estado_ci_runtime_212
ON public.ordenes_compra (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recepciones_tenant_estado_ci_runtime_212
ON public.recepciones (tenant_id, estado, fecha_recepcion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_compras_tenant_estado_ci_runtime_212
ON public.compras (tenant_id, estado, fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_compra_tenant_estado_ci_runtime_212
ON public.cotizaciones_compra (tenant_id, estado, fecha_cotizacion DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oc_aprobaciones_tenant_estado_ci_runtime_212
ON public.oc_aprobaciones (tenant_id, estado, nivel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_tenant_estado_ci_runtime_212
ON public.devoluciones_proveedor (tenant_id, estado, fecha_devolucion DESC, created_at DESC);

COMMIT;
