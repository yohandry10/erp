-- ============================================================================
-- 212__compras_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados del vertical Compras:
-- ordenes_compra, recepciones, compras (alias), cotizaciones_compra,
-- oc_aprobaciones, devoluciones_proveedor.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

DROP VIEW IF EXISTS public.vista_registro_compras;
DROP VIEW IF EXISTS public.orden_compra;
DROP VIEW IF EXISTS public.vw_kardex_valorizado;
DROP VIEW IF EXISTS public.vw_inventario_recepciones;
DROP TRIGGER IF EXISTS trg_enforce_oc_aprobaciones_tenant_consistency ON public.oc_aprobaciones;

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

CREATE TRIGGER trg_enforce_oc_aprobaciones_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, orden_id, aprobador_id, nivel, estado
ON public.oc_aprobaciones
FOR EACH ROW
EXECUTE FUNCTION app.enforce_oc_aprobaciones_tenant_consistency();

CREATE OR REPLACE VIEW public.orden_compra AS
SELECT
  oc.id,
  oc.tenant_id,
  oc.proveedor_id,
  oc.fecha,
  oc.fecha_orden,
  oc.estado::text AS estado,
  COALESCE(oc.subtotal, 0)::numeric(14,2) AS subtotal,
  COALESCE(oc.igv, 0)::numeric(14,2) AS igv,
  COALESCE(oc.total, 0)::numeric(14,2) AS total,
  COALESCE(NULLIF(btrim(oc.moneda), ''), 'PEN') AS moneda,
  oc.created_at,
  oc.updated_at
FROM public.ordenes_compra oc;

CREATE OR REPLACE VIEW public.vista_registro_compras AS
SELECT
  oc.id AS orden_compra_id,
  oc.tenant_id,
  oc.estado::text AS estado,
  oc.total,
  p.nombre AS proveedor_nombre
FROM public.ordenes_compra oc
LEFT JOIN public.proveedores p ON p.id = oc.proveedor_id;

CREATE OR REPLACE VIEW public.vw_inventario_recepciones AS
WITH item_totals AS (
  SELECT
    ri.recepcion_id,
    COUNT(ri.id)::bigint AS total_items,
    COALESCE(SUM(app.to_numeric_or_zero(COALESCE(ri.cantidad_recibida, 0)::text)), 0)::numeric(14,2) AS cantidad_total,
    COALESCE(
      SUM(
        app.to_numeric_or_zero(COALESCE(ri.cantidad_recibida, 0)::text)
        * COALESCE(
            app.to_numeric_or_zero(ocd.precio_unitario::text),
            app.to_numeric_or_zero(prod.precio_compra::text),
            0
          )
      ),
      0
    )::numeric(14,2) AS valor_total,
    MAX(COALESCE(NULLIF(btrim(ocd.moneda), ''), NULLIF(btrim(ri.moneda), ''), 'PEN')) AS moneda
  FROM public.recepcion_items ri
  LEFT JOIN public.orden_compra_detalles ocd ON ocd.id = ri.detalle_id
  LEFT JOIN public.productos prod ON prod.id = ri.producto_id
  GROUP BY ri.recepcion_id
)
SELECT
  r.id AS recepcion_id,
  COALESCE(r.tenant_id, oc.tenant_id) AS tenant_id,
  COALESCE(NULLIF(btrim(r.numero::text), ''), NULLIF(btrim(r.codigo), ''), r.id::text) AS numero,
  COALESCE(r.fecha_recepcion, r.created_at) AS fecha_recepcion,
  COALESCE(r.estado::text, 'PENDIENTE') AS estado,
  r.observaciones,
  COALESCE(r.gre_proveedor, r.metadata->>'gre_proveedor', oc.metadata->>'gre_proveedor') AS gre_proveedor,
  oc.id AS orden_id,
  COALESCE(
    NULLIF(btrim(oc.numero::text), ''),
    NULLIF(btrim(oc.numero_orden::text), ''),
    NULLIF(btrim(oc.codigo), '')
  ) AS numero_orden,
  p.id AS proveedor_id,
  COALESCE(NULLIF(btrim(p.razon_social), ''), NULLIF(btrim(p.nombre_comercial), ''), NULLIF(btrim(p.nombre), '')) AS proveedor_nombre,
  COALESCE(
    NULLIF(btrim(p.documento_numero), ''),
    NULLIF(btrim(p.ruc), ''),
    CASE WHEN p.numero_documento IS NOT NULL THEN p.numero_documento::text ELSE NULL END
  ) AS proveedor_ruc,
  COALESCE(it.total_items, 0)::bigint AS total_items,
  COALESCE(it.cantidad_total, 0)::numeric(14,2) AS cantidad_total,
  COALESCE(it.valor_total, 0)::numeric(14,2) AS valor_total,
  COALESCE(NULLIF(btrim(it.moneda), ''), NULLIF(btrim(oc.moneda), ''), 'PEN') AS moneda,
  r.created_at,
  r.updated_at
FROM public.recepciones r
LEFT JOIN public.ordenes_compra oc ON oc.id = r.orden_id
LEFT JOIN public.proveedores p ON p.id = oc.proveedor_id
LEFT JOIN item_totals it ON it.recepcion_id = r.id;

CREATE OR REPLACE VIEW public.vw_kardex_valorizado AS
WITH items AS (
  SELECT
    ri.*,
    app.to_numeric_or_zero(COALESCE(ri.cantidad_recibida, 0)::text)::numeric(14,2) AS cantidad_recibida_num
  FROM public.recepcion_items ri
)
SELECT
  it.id AS recepcion_item_id,
  it.recepcion_id,
  COALESCE(r.tenant_id, it.tenant_id, oc.tenant_id) AS tenant_id,
  COALESCE(NULLIF(btrim(r.numero::text), ''), NULLIF(btrim(r.codigo), ''), r.id::text) AS recepcion_numero,
  COALESCE(r.fecha_recepcion, it.created_at) AS fecha_recepcion,
  COALESCE(r.estado::text, 'PENDIENTE') AS recepcion_estado,
  it.producto_id,
  COALESCE(NULLIF(btrim(prod.codigo), ''), NULLIF(btrim(prod.sku), ''), it.producto_id::text) AS producto_codigo,
  COALESCE(NULLIF(btrim(prod.nombre), ''), 'Producto') AS producto_nombre,
  NULLIF(btrim(prod.sku), '') AS producto_sku,
  it.cantidad_recibida_num AS cantidad_recibida,
  costo.costo_unitario,
  (it.cantidad_recibida_num * costo.costo_unitario)::numeric(14,2) AS valor_total,
  it.almacen_id,
  al.nombre AS almacen_nombre,
  it.ubicacion_id,
  au.codigo AS ubicacion_codigo,
  it.lote,
  it.serie,
  it.fecha_expiracion,
  COALESCE(
    NULLIF(btrim(ocd.moneda), ''),
    NULLIF(btrim(it.moneda), ''),
    NULLIF(btrim(oc.moneda), ''),
    'PEN'
  ) AS moneda_detalle
FROM items it
LEFT JOIN public.recepciones r ON r.id = it.recepcion_id
LEFT JOIN public.orden_compra_detalles ocd ON ocd.id = it.detalle_id
LEFT JOIN public.ordenes_compra oc ON oc.id = COALESCE(r.orden_id, ocd.orden_id)
LEFT JOIN public.productos prod ON prod.id = it.producto_id
LEFT JOIN public.almacenes al ON al.id = it.almacen_id
LEFT JOIN public.almacen_ubicaciones au ON au.id = it.ubicacion_id
LEFT JOIN LATERAL (
  SELECT COALESCE(
    app.to_numeric_or_zero(ocd.precio_unitario::text),
    app.to_numeric_or_zero(prod.precio_compra::text),
    0
  )::numeric(14,2) AS costo_unitario
) costo ON true;

COMMIT;
