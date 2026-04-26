-- ============================================================================
-- 284__rma_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive de estado en flujo RMA.
-- Tablas foco:
--   public.rma_solicitudes
--   public.rma_items
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helper canonico de normalizacion de estado por tabla del vertical RMA.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_rma_estado_284(
  p_table text,
  p_estado text,
  p_cantidad_autorizada numeric DEFAULT NULL,
  p_cantidad_devuelta numeric DEFAULT NULL
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_table text;
  v text;
  v_aut numeric;
  v_dev numeric;
BEGIN
  v_table := lower(COALESCE(NULLIF(btrim(COALESCE(p_table, '')), ''), ''));
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), ''));

  v_aut := GREATEST(COALESCE(p_cantidad_autorizada, 0), 0);
  v_dev := GREATEST(COALESCE(p_cantidad_devuelta, 0), 0);
  IF v_aut > 0 AND v_dev > v_aut THEN
    v_dev := v_aut;
  END IF;

  IF v IN ('ACTIVO', 'ABIERTA', 'ABIERTO') THEN
    v := 'CREADA';
  END IF;
  IF v IN ('INACTIVO', 'ANULADO', 'ANULADA') THEN
    v := 'CANCELADA';
  END IF;
  IF v IN ('APROBADO') THEN
    v := 'APROBADA';
  END IF;
  IF v IN ('RECHAZADO') THEN
    v := 'RECHAZADA';
  END IF;
  IF v IN ('COMPLETADA', 'COMPLETADO') THEN
    v := 'CERRADA';
  END IF;

  IF v_table = 'rma_solicitudes' THEN
    IF v = '' THEN
      v := 'CREADA';
    END IF;

    IF v NOT IN ('CREADA', 'APROBADA', 'RECHAZADA', 'PARCIAL', 'RECIBIDA', 'CERRADA', 'CANCELADA', 'INACTIVO') THEN
      v := 'CREADA';
    END IF;

    RETURN v::citext;
  END IF;

  IF v_table = 'rma_items' THEN
    IF v_aut > 0 AND v_dev >= v_aut THEN
      RETURN 'CERRADO'::citext;
    END IF;
    IF v_dev > 0 THEN
      RETURN 'PARCIAL'::citext;
    END IF;

    IF v IN ('ACTIVO', 'APROBADA', 'APROBADO') THEN
      v := 'CREADA';
    END IF;
    IF v IN ('RECHAZADA') THEN
      v := 'RECHAZADO';
    END IF;
    IF v IN ('RECIBIDA', 'RECIBIDO', 'CERRADA') THEN
      v := 'CERRADO';
    END IF;
    IF v IN ('CANCELADA', 'ANULADA') THEN
      v := 'INACTIVO';
    END IF;

    IF v = '' THEN
      v := 'CREADA';
    END IF;

    IF v NOT IN ('CREADA', 'PARCIAL', 'CERRADO', 'RECHAZADO', 'INACTIVO') THEN
      v := 'CREADA';
    END IF;

    RETURN v::citext;
  END IF;

  RETURN COALESCE(NULLIF(v, ''), 'CREADA')::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Garantizar columnas de contrato para normalizacion/diagnostico.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.rma_solicitudes
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'CREADA',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.rma_items
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'CREADA',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- Normalizadores runtime (reemplazo compatible de funciones existentes).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_rma_solicitudes_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_fallback_id text;
BEGIN
  v_fallback_id := upper(substr(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 1, 8));

  NEW.tipo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'DEVOLUCION'));
  NEW.estado := app.normalize_rma_estado_284('rma_solicitudes', NEW.estado::text, NULL, NULL);
  NEW.numero := COALESCE(
    NULLIF(btrim(COALESCE(NEW.numero, '')), ''),
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    format('RMA-%s-%s', to_char(COALESCE(NEW.created_at, now()), 'YYYY'), v_fallback_id)
  );
  NEW.codigo := COALESCE(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''), NEW.numero);
  NEW.motivo_general := NULLIF(btrim(COALESCE(NEW.motivo_general, '')), '');
  NEW.notas := NULLIF(btrim(COALESCE(NEW.notas, '')), '');
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_rma_items_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.motivo_item := COALESCE(
    NULLIF(btrim(COALESCE(NEW.motivo_item, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'DEVOLUCION'
  );
  NEW.cantidad_autorizada := GREATEST(COALESCE(NEW.cantidad_autorizada, 0), 0);
  NEW.cantidad_devuelta := GREATEST(COALESCE(NEW.cantidad_devuelta, 0), 0);

  IF NEW.cantidad_autorizada > 0 AND NEW.cantidad_devuelta > NEW.cantidad_autorizada THEN
    NEW.cantidad_devuelta := NEW.cantidad_autorizada;
  END IF;

  NEW.estado := app.normalize_rma_estado_284(
    'rma_items',
    NEW.estado::text,
    NEW.cantidad_autorizada,
    NEW.cantidad_devuelta
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_rma_solicitudes_row ON public.rma_solicitudes;
CREATE TRIGGER trg_normalize_rma_solicitudes_row
BEFORE INSERT OR UPDATE ON public.rma_solicitudes
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rma_solicitudes_row();

DROP TRIGGER IF EXISTS trg_normalize_rma_items_row ON public.rma_items;
CREATE TRIGGER trg_normalize_rma_items_row
BEFORE INSERT OR UPDATE ON public.rma_items
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rma_items_row();

-- ----------------------------------------------------------------------------
-- Migracion de estado a citext + defaults canonicos.
-- ----------------------------------------------------------------------------
ALTER TABLE public.rma_solicitudes
  ALTER COLUMN estado TYPE citext
  USING app.normalize_rma_estado_284('rma_solicitudes', estado::text, NULL, NULL),
  ALTER COLUMN estado SET DEFAULT 'CREADA'::citext;

ALTER TABLE public.rma_items
  ALTER COLUMN estado TYPE citext
  USING app.normalize_rma_estado_284('rma_items', estado::text, cantidad_autorizada, cantidad_devuelta),
  ALTER COLUMN estado SET DEFAULT 'CREADA'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo y alineacion de dominio case-insensitive.
-- ----------------------------------------------------------------------------
UPDATE public.rma_solicitudes
SET
  estado = app.normalize_rma_estado_284('rma_solicitudes', estado::text, NULL, NULL),
  updated_at = COALESCE(updated_at, now());

UPDATE public.rma_items
SET
  cantidad_autorizada = GREATEST(COALESCE(cantidad_autorizada, 0), 0),
  cantidad_devuelta = GREATEST(COALESCE(cantidad_devuelta, 0), 0),
  estado = app.normalize_rma_estado_284(
    'rma_items',
    estado::text,
    GREATEST(COALESCE(cantidad_autorizada, 0), 0),
    GREATEST(COALESCE(cantidad_devuelta, 0), 0)
  ),
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rma_solicitudes_tenant_estado_ci_runtime_284
ON public.rma_solicitudes (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rma_items_tenant_estado_ci_runtime_284
ON public.rma_items (tenant_id, estado, updated_at DESC);

COMMIT;
