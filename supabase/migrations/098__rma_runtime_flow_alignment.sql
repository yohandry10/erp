-- ============================================================================
-- 098__rma_runtime_flow_alignment.sql
-- Alineación runtime del flujo RMA (solicitudes, items y eventos).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas faltantes usadas por servicios RMA.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.rma_solicitudes
  ADD COLUMN IF NOT EXISTS numero text;

ALTER TABLE IF EXISTS public.rma_items
  ADD COLUMN IF NOT EXISTS motivo_item text,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS fecha_expiracion date;

ALTER TABLE IF EXISTS public.rma_eventos
  ADD COLUMN IF NOT EXISTS usuario_id uuid;

-- ----------------------------------------------------------------------------
-- Normalización de rma_solicitudes.
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
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'CREADA'));
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

DROP TRIGGER IF EXISTS trg_normalize_rma_solicitudes_row ON public.rma_solicitudes;
CREATE TRIGGER trg_normalize_rma_solicitudes_row
BEFORE INSERT OR UPDATE ON public.rma_solicitudes
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rma_solicitudes_row();

-- ----------------------------------------------------------------------------
-- Normalización de rma_items.
-- ----------------------------------------------------------------------------
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

  NEW.estado := CASE
    WHEN NEW.cantidad_autorizada > 0 AND NEW.cantidad_devuelta >= NEW.cantidad_autorizada THEN 'CERRADO'
    WHEN NEW.cantidad_devuelta > 0 THEN 'PARCIAL'
    ELSE upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'CREADA'))
  END;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_rma_items_row ON public.rma_items;
CREATE TRIGGER trg_normalize_rma_items_row
BEFORE INSERT OR UPDATE ON public.rma_items
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rma_items_row();

-- ----------------------------------------------------------------------------
-- Normalización de rma_eventos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_rma_eventos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tipo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'EVENTO'));
  NEW.descripcion := COALESCE(
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('Evento %s', NEW.tipo)
  );
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_rma_eventos_row ON public.rma_eventos;
CREATE TRIGGER trg_normalize_rma_eventos_row
BEFORE INSERT OR UPDATE ON public.rma_eventos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rma_eventos_row();

-- ----------------------------------------------------------------------------
-- Backfill de normalización.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    r.id,
    row_number() OVER (
      PARTITION BY r.tenant_id, to_char(COALESCE(r.created_at, now()), 'YYYY')
      ORDER BY COALESCE(r.created_at, now()), r.id::text
    ) AS rn
  FROM public.rma_solicitudes r
  WHERE r.numero IS NULL OR btrim(r.numero) = ''
)
UPDATE public.rma_solicitudes r
SET
  numero = format('RMA-%s-%s', to_char(COALESCE(r.created_at, now()), 'YYYY'), lpad(ranked.rn::text, 5, '0')),
  updated_at = now()
FROM ranked
WHERE r.id = ranked.id;

UPDATE public.rma_solicitudes
SET
  codigo = COALESCE(NULLIF(btrim(COALESCE(codigo, '')), ''), numero),
  updated_at = now()
WHERE codigo IS NULL OR btrim(codigo) = '';

UPDATE public.rma_items
SET updated_at = now()
WHERE
  motivo_item IS NULL
  OR btrim(COALESCE(motivo_item, '')) = ''
  OR cantidad_autorizada IS NULL
  OR cantidad_autorizada < 0
  OR cantidad_devuelta IS NULL
  OR cantidad_devuelta < 0
  OR estado IS NULL
  OR btrim(COALESCE(estado, '')) = '';

UPDATE public.rma_eventos
SET updated_at = now()
WHERE
  tipo IS NULL
  OR btrim(COALESCE(tipo, '')) = ''
  OR descripcion IS NULL
  OR btrim(COALESCE(descripcion, '')) = '';

-- ----------------------------------------------------------------------------
-- Índices runtime para consultas del módulo RMA.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rma_solicitudes_tenant_estado_created_runtime
ON public.rma_solicitudes (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rma_solicitudes_tenant_pedido_runtime
ON public.rma_solicitudes (tenant_id, pedido_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rma_solicitudes_tenant_numero_runtime
ON public.rma_solicitudes (tenant_id, numero);

CREATE INDEX IF NOT EXISTS idx_rma_items_tenant_rma_runtime
ON public.rma_items (tenant_id, rma_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_rma_items_tenant_detalle_runtime
ON public.rma_items (tenant_id, detalle_id);

CREATE INDEX IF NOT EXISTS idx_rma_items_tenant_producto_runtime
ON public.rma_items (tenant_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_rma_eventos_tenant_rma_created_runtime
ON public.rma_eventos (tenant_id, rma_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rma_eventos_tenant_tipo_created_runtime
ON public.rma_eventos (tenant_id, tipo, created_at DESC);

COMMIT;
