-- ============================================================================
-- 146__compras_operational_runtime_alignment.sql
-- Runtime alignment para compras operativo + alias legacy compras.
-- Tablas: ordenes_compra, orden_compra_detalles, recepciones, compras.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ordenes_compra: shape real consumido por API de compras
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ordenes_compra
  ADD COLUMN IF NOT EXISTS cotizacion_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_entrega_esperada date,
  ADD COLUMN IF NOT EXISTS condiciones_pago text,
  ADD COLUMN IF NOT EXISTS dias_credito integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS almacen_destino_id uuid,
  ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz,
  ADD COLUMN IF NOT EXISTS aprobado_by uuid,
  ADD COLUMN IF NOT EXISTS rechazado_at timestamptz,
  ADD COLUMN IF NOT EXISTS rechazado_by uuid,
  ADD COLUMN IF NOT EXISTS motivo_rechazo text,
  ADD COLUMN IF NOT EXISTS cancelado_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_by uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

DROP VIEW IF EXISTS public.vw_inventario_recepciones;
DROP VIEW IF EXISTS public.vw_kardex_valorizado;
DROP VIEW IF EXISTS public.orden_compra;
DROP VIEW IF EXISTS public.vista_registro_compras;

ALTER TABLE IF EXISTS public.ordenes_compra
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero::text, '')), ''),
  ALTER COLUMN numero_orden TYPE text USING NULLIF(btrim(COALESCE(numero_orden::text, '')), ''),
  ALTER COLUMN fecha TYPE date USING CASE WHEN fecha IS NULL THEN NULL ELSE fecha::date END,
  ALTER COLUMN fecha_orden TYPE date USING CASE WHEN fecha_orden IS NULL THEN NULL ELSE fecha_orden::date END,
  ALTER COLUMN fecha_entrega TYPE date USING CASE WHEN fecha_entrega IS NULL THEN NULL ELSE fecha_entrega::date END,
  ALTER COLUMN fecha_requerida TYPE date USING CASE WHEN fecha_requerida IS NULL THEN NULL ELSE fecha_requerida::date END,
  ALTER COLUMN fecha_entrega_esperada TYPE date USING CASE WHEN fecha_entrega_esperada IS NULL THEN NULL ELSE fecha_entrega_esperada::date END,
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN dias_credito TYPE integer USING GREATEST(app.to_int_or_zero(dias_credito::text), 0),
  ALTER COLUMN cotizacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cotizacion_id::text, '')),
  ALTER COLUMN almacen_destino_id TYPE uuid USING app.to_uuid_or_null(COALESCE(almacen_destino_id::text, '')),
  ALTER COLUMN created_by TYPE uuid USING app.to_uuid_or_null(COALESCE(created_by::text, '')),
  ALTER COLUMN updated_by TYPE uuid USING app.to_uuid_or_null(COALESCE(updated_by::text, '')),
  ALTER COLUMN aprobado_by TYPE uuid USING app.to_uuid_or_null(COALESCE(aprobado_by::text, '')),
  ALTER COLUMN rechazado_by TYPE uuid USING app.to_uuid_or_null(COALESCE(rechazado_by::text, '')),
  ALTER COLUMN cancelado_by TYPE uuid USING app.to_uuid_or_null(COALESCE(cancelado_by::text, '')),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'PENDIENTE')),
  ALTER COLUMN moneda TYPE text USING upper(COALESCE(NULLIF(btrim(moneda::text), ''), 'PEN')),
  ALTER COLUMN items TYPE jsonb USING COALESCE(
    CASE
      WHEN items IS NULL THEN '[]'::jsonb
      WHEN jsonb_typeof(items) = 'array' THEN items
      WHEN jsonb_typeof(items) = 'object' THEN jsonb_build_array(items)
      ELSE '[]'::jsonb
    END,
    '[]'::jsonb
  ),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(
    CASE
      WHEN metadata IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(metadata) = 'object' THEN metadata
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  ),
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN igv SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN dias_credito SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN items SET DEFAULT '[]'::jsonb,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.ordenes_compra
SET
  numero = COALESCE(
    NULLIF(btrim(COALESCE(numero, '')), ''),
    NULLIF(btrim(COALESCE(numero_orden, '')), ''),
    NULLIF(btrim(COALESCE(codigo, '')), ''),
    'OC-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' || right(replace(id::text, '-', ''), 6)
  ),
  numero_orden = COALESCE(NULLIF(btrim(COALESCE(numero_orden, '')), ''), NULLIF(btrim(COALESCE(numero, '')), '')),
  fecha_orden = COALESCE(fecha_orden, fecha, COALESCE(created_at, now())::date),
  fecha = COALESCE(fecha, fecha_orden, COALESCE(created_at, now())::date),
  fecha_entrega_esperada = COALESCE(fecha_entrega_esperada, fecha_entrega),
  fecha_entrega = COALESCE(fecha_entrega, fecha_entrega_esperada),
  estado = upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')),
  moneda = upper(COALESCE(NULLIF(btrim(moneda), ''), 'PEN')),
  subtotal = COALESCE(subtotal, 0),
  igv = COALESCE(igv, 0),
  total = COALESCE(NULLIF(total, 0), COALESCE(subtotal, 0) + COALESCE(igv, 0)),
  items = COALESCE(items, '[]'::jsonb),
  metadata = COALESCE(metadata, '{}'::jsonb)
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- orden_compra_detalles: compatibilidad create/update del módulo
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.orden_compra_detalles
  ADD COLUMN IF NOT EXISTS cantidad_pendiente numeric(14,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.orden_compra_detalles
  ALTER COLUMN orden_id TYPE uuid USING app.to_uuid_or_null(COALESCE(orden_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN cantidad TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad::text),
  ALTER COLUMN cantidad_recibida TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_recibida::text),
  ALTER COLUMN precio_unitario TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_unitario::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN cantidad_pendiente TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_pendiente::text),
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN cantidad SET DEFAULT 0,
  ALTER COLUMN cantidad_recibida SET DEFAULT 0,
  ALTER COLUMN cantidad_pendiente SET DEFAULT 0,
  ALTER COLUMN precio_unitario SET DEFAULT 0;

UPDATE public.orden_compra_detalles
SET cantidad_pendiente = GREATEST(COALESCE(cantidad, 0) - COALESCE(cantidad_recibida, 0), 0)
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- recepciones: numero textual + users uuid
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.recepciones
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE IF EXISTS public.recepciones
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero::text, '')), ''),
  ALTER COLUMN orden_id TYPE uuid USING app.to_uuid_or_null(COALESCE(orden_id::text, '')),
  ALTER COLUMN created_by TYPE uuid USING app.to_uuid_or_null(COALESCE(created_by::text, '')),
  ALTER COLUMN updated_by TYPE uuid USING app.to_uuid_or_null(COALESCE(updated_by::text, '')),
  ALTER COLUMN fecha_recepcion TYPE timestamptz USING CASE
    WHEN fecha_recepcion IS NULL OR btrim(fecha_recepcion::text) = '' THEN NULL
    ELSE fecha_recepcion::timestamptz
  END,
  ALTER COLUMN cerrado_at TYPE timestamptz USING CASE
    WHEN cerrado_at IS NULL OR btrim(cerrado_at::text) = '' THEN NULL
    ELSE cerrado_at::timestamptz
  END,
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'BORRADOR')),
  ALTER COLUMN estado SET DEFAULT 'BORRADOR';

UPDATE public.recepciones
SET
  numero = COALESCE(
    NULLIF(btrim(COALESCE(numero, '')), ''),
    'REC-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' || right(replace(id::text, '-', ''), 6)
  ),
  fecha_recepcion = COALESCE(fecha_recepcion, created_at, now()),
  estado = upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR'))
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- compras (legacy): shape esperado por AccountingReportsService
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.compras
  ADD COLUMN IF NOT EXISTS fecha date;

ALTER TABLE IF EXISTS public.compras
  ALTER COLUMN proveedor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(proveedor_id::text, '')),
  ALTER COLUMN fecha TYPE date USING CASE WHEN fecha IS NULL THEN NULL ELSE fecha::date END,
  ALTER COLUMN tipo_documento TYPE text USING upper(COALESCE(NULLIF(btrim(tipo_documento::text), ''), 'OC')),
  ALTER COLUMN numero_documento TYPE text USING NULLIF(btrim(COALESCE(numero_documento::text, '')), ''),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN moneda TYPE text USING upper(COALESCE(NULLIF(btrim(moneda::text), ''), 'PEN')),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'PENDIENTE')),
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN igv SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN tipo_documento SET DEFAULT 'OC';

UPDATE public.compras
SET
  fecha = COALESCE(fecha, COALESCE(created_at, now())::date),
  tipo_documento = COALESCE(NULLIF(upper(btrim(tipo_documento)), ''), 'OC'),
  numero_documento = COALESCE(NULLIF(btrim(COALESCE(numero_documento, '')), ''), NULLIF(btrim(COALESCE(codigo, '')), ''), id::text),
  estado = upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')),
  moneda = upper(COALESCE(NULLIF(btrim(moneda), ''), 'PEN')),
  subtotal = COALESCE(subtotal, 0),
  igv = COALESCE(igv, 0),
  total = COALESCE(NULLIF(total, 0), COALESCE(subtotal, 0) + COALESCE(igv, 0))
WHERE id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- mapeo estados canónico <-> legacy
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.map_ordenes_compra_to_compras_estado(p_estado text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
BEGIN
  IF v IN ('RECIBIDA', 'ENTREGADO', 'ENTREGADA', 'COMPLETADA', 'CERRADA') THEN RETURN 'ENTREGADA'; END IF;
  IF v IN ('ANULADA', 'RECHAZADA', 'CANCELADA') THEN RETURN 'ANULADA'; END IF;
  RETURN 'PENDIENTE';
END;
$$;

CREATE OR REPLACE FUNCTION app.map_compras_to_ordenes_compra_estado(p_estado text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
BEGIN
  IF v IN ('ENTREGADA', 'ENTREGADO', 'RECIBIDA', 'COMPLETADA', 'CERRADA') THEN RETURN 'RECIBIDA'; END IF;
  IF v IN ('ANULADA', 'CANCELADA') THEN RETURN 'ANULADA'; END IF;
  IF v IN ('RECHAZADA') THEN RETURN 'RECHAZADA'; END IF;
  IF v IN ('BORRADOR', 'PENDIENTE', 'APROBACION', 'APROBADA', 'PARCIAL') THEN RETURN v; END IF;
  RETURN 'PENDIENTE';
END;
$$;

-- ----------------------------------------------------------------------------
-- normalización + sync bidireccional ordenes_compra <-> compras
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_compras_legacy_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.estado := app.map_ordenes_compra_to_compras_estado(NEW.estado);
  NEW.fecha := COALESCE(NEW.fecha, COALESCE(NEW.created_at, now())::date);
  NEW.tipo_documento := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.tipo_documento, ''))), ''), 'OC');
  NEW.numero_documento := COALESCE(NULLIF(btrim(COALESCE(NEW.numero_documento, '')), ''), NULLIF(btrim(COALESCE(NEW.codigo, '')), ''), NEW.id::text);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  NEW.igv := GREATEST(COALESCE(NEW.igv, 0), 0);
  NEW.total := GREATEST(COALESCE(NEW.total, NEW.subtotal + NEW.igv, 0), 0);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_compras_legacy_row ON public.compras;
CREATE TRIGGER trg_normalize_compras_legacy_row
BEFORE INSERT OR UPDATE ON public.compras
FOR EACH ROW EXECUTE FUNCTION app.normalize_compras_legacy_row();

CREATE OR REPLACE FUNCTION app.sync_compras_from_ordenes_compra()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_num text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.compras WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  v_num := COALESCE(NULLIF(btrim(COALESCE(NEW.numero, '')), ''), NULLIF(btrim(COALESCE(NEW.numero_orden, '')), ''), NEW.id::text);

  INSERT INTO public.compras (
    id, tenant_id, nombre, codigo, estado, metadata, created_at, updated_at,
    fecha, proveedor_id, tipo_documento, numero_documento, subtotal, igv, total, moneda
  )
  VALUES (
    NEW.id, NEW.tenant_id,
    COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'COMPRA ' || v_num),
    COALESCE(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''), v_num),
    app.map_ordenes_compra_to_compras_estado(NEW.estado),
    COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'ordenes_compra'),
    COALESCE(NEW.created_at, now()), now(),
    COALESCE(NEW.fecha_orden, NEW.fecha, COALESCE(NEW.created_at, now())::date),
    NEW.proveedor_id, 'OC', v_num,
    COALESCE(NEW.subtotal, 0), COALESCE(NEW.igv, 0), COALESCE(NEW.total, COALESCE(NEW.subtotal, 0) + COALESCE(NEW.igv, 0), 0),
    COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    nombre = EXCLUDED.nombre,
    codigo = EXCLUDED.codigo,
    estado = EXCLUDED.estado,
    metadata = COALESCE(public.compras.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    fecha = EXCLUDED.fecha,
    proveedor_id = EXCLUDED.proveedor_id,
    tipo_documento = EXCLUDED.tipo_documento,
    numero_documento = EXCLUDED.numero_documento,
    subtotal = EXCLUDED.subtotal,
    igv = EXCLUDED.igv,
    total = EXCLUDED.total,
    moneda = EXCLUDED.moneda,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_compras_from_ordenes_compra ON public.ordenes_compra;
CREATE TRIGGER trg_sync_compras_from_ordenes_compra
AFTER INSERT OR UPDATE OR DELETE ON public.ordenes_compra
FOR EACH ROW EXECUTE FUNCTION app.sync_compras_from_ordenes_compra();

CREATE OR REPLACE FUNCTION app.sync_ordenes_compra_from_compras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_num text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- no borrar canónico desde alias legacy
    RETURN OLD;
  END IF;

  v_num := COALESCE(NULLIF(btrim(COALESCE(NEW.numero_documento, '')), ''), NULLIF(btrim(COALESCE(NEW.codigo, '')), ''), NEW.id::text);

  INSERT INTO public.ordenes_compra (
    id, tenant_id, nombre, codigo, estado, metadata, created_at, updated_at,
    numero, numero_orden, fecha, fecha_orden, proveedor_id, subtotal, igv, total, moneda
  )
  VALUES (
    NEW.id, NEW.tenant_id,
    COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'ORDEN ' || v_num),
    COALESCE(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''), v_num),
    app.map_compras_to_ordenes_compra_estado(NEW.estado),
    COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'compras'),
    COALESCE(NEW.created_at, now()), now(),
    v_num, v_num,
    COALESCE(NEW.fecha, COALESCE(NEW.created_at, now())::date),
    COALESCE(NEW.fecha, COALESCE(NEW.created_at, now())::date),
    NEW.proveedor_id,
    COALESCE(NEW.subtotal, 0), COALESCE(NEW.igv, 0), COALESCE(NEW.total, COALESCE(NEW.subtotal, 0) + COALESCE(NEW.igv, 0), 0),
    COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    nombre = EXCLUDED.nombre,
    codigo = EXCLUDED.codigo,
    estado = EXCLUDED.estado,
    metadata = COALESCE(public.ordenes_compra.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    numero = EXCLUDED.numero,
    numero_orden = EXCLUDED.numero_orden,
    fecha = EXCLUDED.fecha,
    fecha_orden = EXCLUDED.fecha_orden,
    proveedor_id = EXCLUDED.proveedor_id,
    subtotal = EXCLUDED.subtotal,
    igv = EXCLUDED.igv,
    total = EXCLUDED.total,
    moneda = EXCLUDED.moneda,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ordenes_compra_from_compras ON public.compras;
CREATE TRIGGER trg_sync_ordenes_compra_from_compras
AFTER INSERT OR UPDATE OR DELETE ON public.compras
FOR EACH ROW EXECUTE FUNCTION app.sync_ordenes_compra_from_compras();

-- backfill inicial de alias
INSERT INTO public.compras (
  id, tenant_id, nombre, codigo, estado, metadata, created_at, updated_at, fecha,
  proveedor_id, tipo_documento, numero_documento, subtotal, igv, total, moneda
)
SELECT
  oc.id, oc.tenant_id,
  COALESCE(NULLIF(btrim(COALESCE(oc.nombre, '')), ''), 'COMPRA ' || COALESCE(NULLIF(btrim(COALESCE(oc.numero, '')), ''), oc.id::text)),
  COALESCE(NULLIF(btrim(COALESCE(oc.codigo, '')), ''), COALESCE(NULLIF(btrim(COALESCE(oc.numero, '')), ''), oc.id::text)),
  app.map_ordenes_compra_to_compras_estado(oc.estado),
  COALESCE(oc.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'ordenes_compra_backfill'),
  COALESCE(oc.created_at, now()), COALESCE(oc.updated_at, now()),
  COALESCE(oc.fecha_orden, oc.fecha, COALESCE(oc.created_at, now())::date),
  oc.proveedor_id, 'OC',
  COALESCE(NULLIF(btrim(COALESCE(oc.numero, '')), ''), NULLIF(btrim(COALESCE(oc.numero_orden, '')), ''), oc.id::text),
  COALESCE(oc.subtotal, 0), COALESCE(oc.igv, 0), COALESCE(oc.total, COALESCE(oc.subtotal, 0) + COALESCE(oc.igv, 0), 0),
  COALESCE(NULLIF(upper(btrim(COALESCE(oc.moneda, ''))), ''), 'PEN')
FROM public.ordenes_compra oc
ON CONFLICT (id) DO NOTHING;

-- soporte de consultas runtime
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_tenant_fecha_estado_runtime
ON public.ordenes_compra (tenant_id, fecha_orden DESC, estado)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orden_compra_detalles_tenant_orden_runtime
ON public.orden_compra_detalles (tenant_id, orden_id)
WHERE tenant_id IS NOT NULL AND orden_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recepciones_tenant_numero_runtime
ON public.recepciones (tenant_id, numero)
WHERE tenant_id IS NOT NULL AND numero IS NOT NULL AND btrim(numero) <> '';

CREATE INDEX IF NOT EXISTS idx_compras_tenant_numero_documento_runtime
ON public.compras (tenant_id, upper(numero_documento))
WHERE tenant_id IS NOT NULL AND numero_documento IS NOT NULL AND btrim(numero_documento) <> '';

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
  COALESCE(r.estado, 'PENDIENTE') AS estado,
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
  COALESCE(r.estado, 'PENDIENTE') AS recepcion_estado,
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

CREATE OR REPLACE VIEW public.orden_compra AS
SELECT
  oc.id,
  oc.tenant_id,
  oc.proveedor_id,
  oc.fecha,
  oc.fecha_orden,
  oc.estado,
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
  oc.estado,
  oc.total,
  p.nombre AS proveedor_nombre
FROM public.ordenes_compra oc
LEFT JOIN public.proveedores p ON p.id = oc.proveedor_id;

COMMIT;
