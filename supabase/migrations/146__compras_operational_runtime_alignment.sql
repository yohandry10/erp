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

COMMIT;
