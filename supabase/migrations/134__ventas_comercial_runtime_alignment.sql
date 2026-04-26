-- ============================================================================
-- 134__ventas_comercial_runtime_alignment.sql
-- Alineación runtime para ventas comercial.
-- Tablas: cotizaciones, cotizacion_detalles, pedidos_venta, pedidos_venta_detalle.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas runtime: cotizaciones.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cotizaciones
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS fecha_cotizacion date,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS vendedor text,
  ADD COLUMN IF NOT EXISTS probabilidad numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items jsonb,
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS aprobado_por uuid,
  ADD COLUMN IF NOT EXISTS rechazado_por uuid,
  ADD COLUMN IF NOT EXISTS convertido_por uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.cotizaciones
  ALTER COLUMN cliente_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cliente_id::text, '')),
  ALTER COLUMN pedido_id TYPE uuid USING app.to_uuid_or_null(COALESCE(pedido_id::text, '')),
  ALTER COLUMN aprobado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(aprobado_por::text, '')),
  ALTER COLUMN rechazado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(rechazado_por::text, '')),
  ALTER COLUMN convertido_por TYPE uuid USING app.to_uuid_or_null(COALESCE(convertido_por::text, '')),
  ALTER COLUMN created_by TYPE uuid USING app.to_uuid_or_null(COALESCE(created_by::text, '')),
  ALTER COLUMN numero TYPE text USING NULLIF(upper(btrim(COALESCE(numero::text, ''))), ''),
  ALTER COLUMN fecha TYPE date USING CASE WHEN fecha IS NULL OR btrim(fecha::text) = '' THEN NULL ELSE fecha::date END,
  ALTER COLUMN fecha_cotizacion TYPE date USING CASE WHEN fecha_cotizacion IS NULL OR btrim(fecha_cotizacion::text) = '' THEN NULL ELSE fecha_cotizacion::date END,
  ALTER COLUMN fecha_vencimiento TYPE date USING CASE WHEN fecha_vencimiento IS NULL OR btrim(fecha_vencimiento::text) = '' THEN NULL ELSE fecha_vencimiento::date END,
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN vendedor TYPE text USING NULLIF(btrim(COALESCE(vendedor, '')), ''),
  ALTER COLUMN probabilidad TYPE numeric(5,2) USING app.to_numeric_or_zero(probabilidad::text),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_documento, ''))), ''),
  ALTER COLUMN notas TYPE text USING NULLIF(btrim(COALESCE(notas, '')), ''),
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN igv SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN probabilidad SET DEFAULT 0,
  ALTER COLUMN items SET DEFAULT '[]'::jsonb,
  ALTER COLUMN activo SET DEFAULT true;

-- ----------------------------------------------------------------------------
-- Columnas runtime: cotizacion_detalles.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cotizacion_detalles
  ADD COLUMN IF NOT EXISTS cotizacion_id uuid,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_porcentaje numeric(7,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orden integer DEFAULT 1;

ALTER TABLE IF EXISTS public.cotizacion_detalles
  ALTER COLUMN cotizacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cotizacion_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN cantidad TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad::text),
  ALTER COLUMN precio_unitario TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_unitario::text),
  ALTER COLUMN descuento_porcentaje TYPE numeric(7,4) USING app.to_numeric_or_zero(descuento_porcentaje::text),
  ALTER COLUMN descuento_monto TYPE numeric(14,2) USING app.to_numeric_or_zero(descuento_monto::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN orden TYPE integer USING GREATEST(app.to_int_or_zero(orden::text), 0),
  ALTER COLUMN cantidad SET DEFAULT 0,
  ALTER COLUMN precio_unitario SET DEFAULT 0,
  ALTER COLUMN descuento_porcentaje SET DEFAULT 0,
  ALTER COLUMN descuento_monto SET DEFAULT 0,
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN orden SET DEFAULT 1;

-- ----------------------------------------------------------------------------
-- Columnas runtime: pedidos_venta.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pedidos_venta
  ADD COLUMN IF NOT EXISTS cotizacion_id uuid,
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS fecha_pedido date,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS factura_id uuid,
  ADD COLUMN IF NOT EXISTS gre_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS requiere_aprobacion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_requiere_aprobacion text,
  ADD COLUMN IF NOT EXISTS aprobado_por uuid,
  ADD COLUMN IF NOT EXISTS aprobado_en timestamptz,
  ADD COLUMN IF NOT EXISTS estado_credito text DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS tracking_estado text DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS tracking_actualizado_en timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_notas text;

ALTER TABLE IF EXISTS public.pedidos_venta
  ALTER COLUMN cotizacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cotizacion_id::text, '')),
  ALTER COLUMN cliente_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cliente_id::text, '')),
  ALTER COLUMN numero TYPE text USING NULLIF(upper(btrim(COALESCE(numero::text, ''))), ''),
  ALTER COLUMN fecha TYPE date USING CASE WHEN fecha IS NULL OR btrim(fecha::text) = '' THEN NULL ELSE fecha::date END,
  ALTER COLUMN fecha_pedido TYPE date USING CASE WHEN fecha_pedido IS NULL OR btrim(fecha_pedido::text) = '' THEN NULL ELSE fecha_pedido::date END,
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado, ''))), ''),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN notas TYPE text USING NULLIF(btrim(COALESCE(notas, '')), ''),
  ALTER COLUMN factura_id TYPE uuid USING app.to_uuid_or_null(COALESCE(factura_id::text, '')),
  ALTER COLUMN gre_id TYPE uuid USING app.to_uuid_or_null(COALESCE(gre_id::text, '')),
  ALTER COLUMN created_by TYPE uuid USING app.to_uuid_or_null(COALESCE(created_by::text, '')),
  ALTER COLUMN requiere_aprobacion TYPE boolean USING CASE
    WHEN requiere_aprobacion IS NULL THEN false
    WHEN lower(btrim(requiere_aprobacion::text)) IN ('t','true','1','si','yes') THEN true
    ELSE false
  END,
  ALTER COLUMN motivo_requiere_aprobacion TYPE text USING NULLIF(btrim(COALESCE(motivo_requiere_aprobacion, '')), ''),
  ALTER COLUMN aprobado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(aprobado_por::text, '')),
  ALTER COLUMN aprobado_en TYPE timestamptz USING CASE WHEN aprobado_en IS NULL OR btrim(aprobado_en::text) = '' THEN NULL ELSE aprobado_en::timestamptz END,
  ALTER COLUMN estado_credito TYPE text USING NULLIF(upper(btrim(COALESCE(estado_credito, ''))), ''),
  ALTER COLUMN tracking_estado TYPE text USING NULLIF(upper(btrim(COALESCE(tracking_estado, ''))), ''),
  ALTER COLUMN tracking_actualizado_en TYPE timestamptz USING CASE WHEN tracking_actualizado_en IS NULL OR btrim(tracking_actualizado_en::text) = '' THEN NULL ELSE tracking_actualizado_en::timestamptz END,
  ALTER COLUMN tracking_notas TYPE text USING NULLIF(btrim(COALESCE(tracking_notas, '')), ''),
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN igv SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN requiere_aprobacion SET DEFAULT false,
  ALTER COLUMN estado_credito SET DEFAULT 'PENDIENTE',
  ALTER COLUMN tracking_estado SET DEFAULT 'PENDIENTE';

-- ----------------------------------------------------------------------------
-- Columnas runtime: pedidos_venta_detalle.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pedidos_venta_detalle
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_despachada numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_facturada numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado_item text DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS referencia_tipo text,
  ADD COLUMN IF NOT EXISTS referencia_id uuid;

ALTER TABLE IF EXISTS public.pedidos_venta_detalle
  ALTER COLUMN pedido_id TYPE uuid USING app.to_uuid_or_null(COALESCE(pedido_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN cantidad TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad::text),
  ALTER COLUMN precio_unitario TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_unitario::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN cantidad_despachada TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_despachada::text),
  ALTER COLUMN cantidad_facturada TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_facturada::text),
  ALTER COLUMN estado_item TYPE text USING NULLIF(upper(btrim(COALESCE(estado_item, ''))), ''),
  ALTER COLUMN referencia_tipo TYPE text USING NULLIF(upper(btrim(COALESCE(referencia_tipo, ''))), ''),
  ALTER COLUMN referencia_id TYPE uuid USING app.to_uuid_or_null(COALESCE(referencia_id::text, '')),
  ALTER COLUMN cantidad SET DEFAULT 0,
  ALTER COLUMN precio_unitario SET DEFAULT 0,
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN cantidad_despachada SET DEFAULT 0,
  ALTER COLUMN cantidad_facturada SET DEFAULT 0,
  ALTER COLUMN estado_item SET DEFAULT 'PENDIENTE';

-- ----------------------------------------------------------------------------
-- Normalización runtime.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cotizaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
  v_next integer;
BEGIN
  NEW.numero := upper(NULLIF(btrim(COALESCE(NEW.numero::text, '')), ''));
  IF NEW.numero IS NULL THEN
    SELECT COALESCE(MAX(app.to_int_or_zero(COALESCE(substring(c.numero FROM '([0-9]+)$'), '0'))), 0) + 1
    INTO v_next
    FROM public.cotizaciones c
    WHERE c.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
      AND c.numero LIKE format('COT-%s-%%', to_char(current_date, 'YYYY'));
    NEW.numero := format('COT-%s-%s', to_char(current_date, 'YYYY'), lpad(v_next::text, 4, '0'));
  END IF;
  NEW.fecha_cotizacion := COALESCE(NEW.fecha_cotizacion, NEW.fecha, current_date);
  NEW.fecha := COALESCE(NEW.fecha, NEW.fecha_cotizacion, current_date);
  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  NEW.igv := GREATEST(COALESCE(NEW.igv, 0), 0);
  NEW.total := round(GREATEST(COALESCE(NEW.total, NEW.subtotal + NEW.igv, 0), 0)::numeric, 2);
  NEW.probabilidad := round(GREATEST(LEAST(COALESCE(NEW.probabilidad, 0), 100), 0)::numeric, 2);
  NEW.items := COALESCE(NEW.items, '[]'::jsonb);
  IF jsonb_typeof(NEW.items) <> 'array' THEN NEW.items := '[]'::jsonb; END IF;
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, NEW.notas, '')), '');
  NEW.notas := COALESCE(NULLIF(btrim(COALESCE(NEW.notas, '')), ''), NEW.observaciones);
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'BORRADOR'));
  IF v_estado = 'PENDIENTE' THEN v_estado := 'ENVIADA'; END IF;
  IF v_estado = 'ACEPTADA' OR v_estado = 'APROBADO' THEN v_estado := 'APROBADA'; END IF;
  IF v_estado = 'RECHAZADO' THEN v_estado := 'RECHAZADA'; END IF;
  IF v_estado = 'CONVERTIDO' THEN v_estado := 'CONVERTIDA'; END IF;
  IF v_estado = 'VENCIDO' THEN v_estado := 'VENCIDA'; END IF;
  IF v_estado NOT IN ('BORRADOR','ENVIADA','APROBADA','RECHAZADA','CONVERTIDA','VENCIDA') THEN v_estado := 'BORRADOR'; END IF;
  NEW.estado := v_estado;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cotizaciones_row ON public.cotizaciones;
CREATE TRIGGER trg_normalize_cotizaciones_row
BEFORE INSERT OR UPDATE ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION app.normalize_cotizaciones_row();

CREATE OR REPLACE FUNCTION app.normalize_cotizacion_detalles_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_next_orden integer;
BEGIN
  IF NEW.cotizacion_id IS NOT NULL AND NEW.tenant_id IS NULL THEN
    SELECT c.tenant_id INTO v_tenant FROM public.cotizaciones c WHERE c.id = NEW.cotizacion_id;
    NEW.tenant_id := v_tenant;
  END IF;
  NEW.descripcion := COALESCE(NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''), 'ITEM');
  NEW.cantidad := round(GREATEST(COALESCE(NEW.cantidad, 0), 0)::numeric, 2);
  NEW.precio_unitario := round(GREATEST(COALESCE(NEW.precio_unitario, 0), 0)::numeric, 2);
  NEW.descuento_porcentaje := round(GREATEST(LEAST(COALESCE(NEW.descuento_porcentaje, 0), 100), 0)::numeric, 4);
  NEW.descuento_monto := round(GREATEST(COALESCE(NEW.descuento_monto, 0), 0)::numeric, 2);
  NEW.subtotal := round(GREATEST((NEW.cantidad * NEW.precio_unitario) - NEW.descuento_monto, 0)::numeric, 2);
  IF NEW.orden IS NULL OR NEW.orden <= 0 THEN
    SELECT COALESCE(MAX(cd.orden), 0) + 1
    INTO v_next_orden
    FROM public.cotizacion_detalles cd
    WHERE cd.cotizacion_id = NEW.cotizacion_id
      AND (NEW.id IS NULL OR cd.id <> NEW.id);
    NEW.orden := COALESCE(v_next_orden, 1);
  END IF;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cotizacion_detalles_row ON public.cotizacion_detalles;
CREATE TRIGGER trg_normalize_cotizacion_detalles_row
BEFORE INSERT OR UPDATE ON public.cotizacion_detalles
FOR EACH ROW EXECUTE FUNCTION app.normalize_cotizacion_detalles_row();

CREATE OR REPLACE FUNCTION app.normalize_pedidos_venta_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
  v_next integer;
BEGIN
  NEW.numero := upper(NULLIF(btrim(COALESCE(NEW.numero::text, '')), ''));
  IF NEW.numero IS NULL THEN
    SELECT COALESCE(MAX(app.to_int_or_zero(COALESCE(substring(p.numero FROM '([0-9]+)$'), '0'))), 0) + 1
    INTO v_next
    FROM public.pedidos_venta p
    WHERE p.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
      AND (p.numero LIKE format('PV-%s-%%', to_char(current_date, 'YYYY')) OR p.numero LIKE format('PED-%s-%%', to_char(current_date, 'YYYY')));
    NEW.numero := format('PV-%s-%s', to_char(current_date, 'YYYY'), lpad(v_next::text, 4, '0'));
  END IF;
  NEW.fecha_pedido := COALESCE(NEW.fecha_pedido, NEW.fecha, current_date);
  NEW.fecha := COALESCE(NEW.fecha, NEW.fecha_pedido, current_date);
  NEW.subtotal := round(GREATEST(COALESCE(NEW.subtotal, 0), 0)::numeric, 2);
  NEW.igv := round(GREATEST(COALESCE(NEW.igv, 0), 0)::numeric, 2);
  NEW.total := round(GREATEST(COALESCE(NEW.total, NEW.subtotal + NEW.igv, 0), 0)::numeric, 2);
  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, NEW.notas, '')), '');
  NEW.notas := COALESCE(NULLIF(btrim(COALESCE(NEW.notas, '')), ''), NEW.observaciones);
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'BORRADOR' THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado = 'APROBADO' THEN v_estado := 'CONFIRMADO'; END IF;
  IF v_estado IN ('RECHAZADO','ANULADO') THEN v_estado := 'CANCELADO'; END IF;
  IF v_estado = 'DESPACHADO' THEN v_estado := 'LISTO_FACTURAR'; END IF;
  IF v_estado = 'COMPLETO' THEN v_estado := 'COMPLETADO'; END IF;
  IF v_estado NOT IN ('PENDIENTE','PENDIENTE_APROBACION','CONFIRMADO','EN_PREPARACION','LISTO_DESPACHO','DESPACHO_PARCIAL','LISTO_FACTURAR','FACTURADO','COMPLETADO','COMPLETADO_CON_GRE','CANCELADO') THEN v_estado := 'PENDIENTE'; END IF;
  NEW.estado := v_estado;
  NEW.requiere_aprobacion := COALESCE(NEW.requiere_aprobacion, NEW.estado = 'PENDIENTE_APROBACION');
  NEW.estado_credito := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado_credito, '')), ''), 'PENDIENTE'));
  NEW.tracking_estado := COALESCE(upper(NULLIF(btrim(COALESCE(NEW.tracking_estado, '')), '')), 'PENDIENTE');
  NEW.tracking_actualizado_en := COALESCE(NEW.tracking_actualizado_en, now());
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pedidos_venta_row ON public.pedidos_venta;
CREATE TRIGGER trg_normalize_pedidos_venta_row
BEFORE INSERT OR UPDATE ON public.pedidos_venta
FOR EACH ROW EXECUTE FUNCTION app.normalize_pedidos_venta_row();

CREATE OR REPLACE FUNCTION app.normalize_pedidos_venta_detalle_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF NEW.pedido_id IS NOT NULL AND NEW.tenant_id IS NULL THEN
    SELECT p.tenant_id INTO v_tenant FROM public.pedidos_venta p WHERE p.id = NEW.pedido_id;
    NEW.tenant_id := v_tenant;
  END IF;
  NEW.descripcion := COALESCE(NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''), 'ITEM');
  NEW.cantidad := round(GREATEST(COALESCE(NEW.cantidad, 0), 0)::numeric, 2);
  NEW.precio_unitario := round(GREATEST(COALESCE(NEW.precio_unitario, 0), 0)::numeric, 2);
  NEW.subtotal := round((NEW.cantidad * NEW.precio_unitario)::numeric, 2);
  NEW.cantidad_despachada := LEAST(round(GREATEST(COALESCE(NEW.cantidad_despachada, 0), 0)::numeric, 2), NEW.cantidad);
  NEW.cantidad_facturada := LEAST(round(GREATEST(COALESCE(NEW.cantidad_facturada, 0), 0)::numeric, 2), NEW.cantidad);
  IF NEW.cantidad_facturada >= NEW.cantidad AND NEW.cantidad > 0 THEN
    NEW.estado_item := 'FACTURADO';
  ELSIF NEW.cantidad_despachada >= NEW.cantidad AND NEW.cantidad > 0 THEN
    NEW.estado_item := 'DESPACHADO';
  ELSIF NEW.cantidad_despachada > 0 OR NEW.cantidad_facturada > 0 THEN
    NEW.estado_item := 'PARCIAL';
  ELSE
    NEW.estado_item := 'PENDIENTE';
  END IF;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pedidos_venta_detalle_row ON public.pedidos_venta_detalle;
CREATE TRIGGER trg_normalize_pedidos_venta_detalle_row
BEFORE INSERT OR UPDATE ON public.pedidos_venta_detalle
FOR EACH ROW EXECUTE FUNCTION app.normalize_pedidos_venta_detalle_row();

-- ----------------------------------------------------------------------------
-- Backfill defensivo + índices runtime.
-- ----------------------------------------------------------------------------
UPDATE public.cotizaciones SET updated_at = COALESCE(updated_at, now()) WHERE true;
UPDATE public.cotizacion_detalles SET updated_at = COALESCE(updated_at, now()) WHERE true;
UPDATE public.pedidos_venta SET updated_at = COALESCE(updated_at, now()) WHERE true;
UPDATE public.pedidos_venta_detalle SET updated_at = COALESCE(updated_at, now()) WHERE true;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_estado_fecha_runtime
ON public.cotizaciones (tenant_id, estado, fecha_cotizacion DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_numero_runtime
ON public.cotizaciones (tenant_id, upper(numero))
WHERE numero IS NOT NULL AND btrim(numero) <> '';
CREATE INDEX IF NOT EXISTS idx_cotizacion_detalles_tenant_cotizacion_runtime
ON public.cotizacion_detalles (tenant_id, cotizacion_id, orden, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_tenant_estado_fecha_runtime
ON public.pedidos_venta (tenant_id, estado, fecha_pedido DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_tenant_numero_runtime
ON public.pedidos_venta (tenant_id, upper(numero))
WHERE numero IS NOT NULL AND btrim(numero) <> '';
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_tenant_tracking_runtime
ON public.pedidos_venta (tenant_id, tracking_estado, tracking_actualizado_en DESC)
WHERE tracking_estado IS NOT NULL AND btrim(tracking_estado) <> '';
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_detalle_tenant_pedido_runtime
ON public.pedidos_venta_detalle (tenant_id, pedido_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_detalle_tenant_estado_item_runtime
ON public.pedidos_venta_detalle (tenant_id, estado_item, pedido_id);

COMMIT;
