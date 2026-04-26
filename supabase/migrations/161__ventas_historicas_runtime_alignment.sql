-- ============================================================================
-- 161__ventas_historicas_runtime_alignment.sql
-- Alineacion runtime para ventas historicas y pagos legacy.
-- Tablas: ventas, venta_detalles, pagos_ventas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ventas
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ventas
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS numero_documento text,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS vendedor_id uuid,
  ADD COLUMN IF NOT EXISTS sucursal_id uuid,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS descuento numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS cuenta_por_cobrar_id uuid,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.ventas
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN cliente_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cliente_id::text, '')),
  ALTER COLUMN vendedor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(vendedor_id::text, '')),
  ALTER COLUMN sucursal_id TYPE uuid USING app.to_uuid_or_null(COALESCE(sucursal_id::text, '')),
  ALTER COLUMN cuenta_por_cobrar_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cuenta_por_cobrar_id::text, '')),
  ALTER COLUMN event_id TYPE uuid USING app.to_uuid_or_null(COALESCE(event_id::text, '')),
  ALTER COLUMN fecha TYPE date USING app.to_date_or_null(COALESCE(fecha::text, '')),
  ALTER COLUMN numero_documento TYPE text USING NULLIF(upper(btrim(COALESCE(numero_documento, ''))), ''),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_documento, ''))), ''),
  ALTER COLUMN metodo_pago TYPE text USING NULLIF(upper(btrim(COALESCE(metodo_pago, ''))), ''),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN descuento TYPE numeric(14,2) USING app.to_numeric_or_zero(descuento::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN referencia TYPE text USING NULLIF(upper(btrim(COALESCE(referencia, ''))), ''),
  ALTER COLUMN idempotency_key TYPE text USING NULLIF(lower(btrim(COALESCE(idempotency_key, ''))), ''),
  ALTER COLUMN descuento SET DEFAULT 0,
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN igv SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.ventas v
SET
  fecha = COALESCE(v.fecha, v.created_at::date, current_date),
  tipo_documento = CASE
    WHEN upper(COALESCE(NULLIF(btrim(v.tipo_documento), ''), 'FACTURA')) IN ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'TICKET', 'GUIA')
      THEN upper(COALESCE(NULLIF(btrim(v.tipo_documento), ''), 'FACTURA'))
    ELSE 'FACTURA'
  END,
  numero_documento = COALESCE(NULLIF(upper(btrim(COALESCE(v.numero_documento, ''))), ''), format('VTA-%s', upper(left(replace(v.id::text, '-', ''), 8)))),
  metodo_pago = COALESCE(NULLIF(upper(btrim(COALESCE(v.metodo_pago, ''))), ''), 'EFECTIVO'),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(v.moneda, ''))), ''), 'PEN'),
  descuento = GREATEST(COALESCE(v.descuento, 0), 0),
  subtotal = GREATEST(COALESCE(v.subtotal, 0), 0),
  igv = GREATEST(COALESCE(v.igv, 0), 0),
  total = CASE
    WHEN COALESCE(v.total, 0) > 0 THEN GREATEST(v.total, 0)
    ELSE GREATEST(round(GREATEST(COALESCE(v.subtotal, 0) - COALESCE(v.descuento, 0), 0) + COALESCE(v.igv, 0), 2), 0)
  END,
  referencia = NULLIF(upper(btrim(COALESCE(v.referencia, ''))), ''),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(v.estado), ''), 'BORRADOR')) IN ('BORRADOR', 'EMITIDA', 'PAGADA', 'CONFIRMADA', 'ANULADA')
      THEN upper(COALESCE(NULLIF(btrim(v.estado), ''), 'BORRADOR'))
    WHEN upper(COALESCE(NULLIF(btrim(v.estado), ''), 'BORRADOR')) IN ('ACTIVO', 'CERRADA') THEN 'CONFIRMADA'
    WHEN upper(COALESCE(NULLIF(btrim(v.estado), ''), 'BORRADOR')) IN ('INACTIVO', 'CANCELADA') THEN 'ANULADA'
    ELSE 'BORRADOR'
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(v.estado), ''), 'BORRADOR')) IN ('ANULADA', 'INACTIVO', 'CANCELADA') THEN false
    ELSE COALESCE(v.activo, true)
  END,
  idempotency_key = COALESCE(NULLIF(lower(btrim(COALESCE(v.idempotency_key, ''))), ''),
    CASE WHEN v.event_id IS NOT NULL THEN format('venta.event:%s', v.event_id::text) ELSE NULL END),
  metadata = COALESCE(v.metadata, '{}'::jsonb)
WHERE v.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_ventas_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.vendedor_id := app.to_uuid_or_null(COALESCE(NEW.vendedor_id::text, ''));
  NEW.sucursal_id := app.to_uuid_or_null(COALESCE(NEW.sucursal_id::text, ''));
  NEW.cuenta_por_cobrar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_cobrar_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), current_date);
  NEW.tipo_documento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), 'FACTURA'));
  IF NEW.tipo_documento NOT IN ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'TICKET', 'GUIA') THEN
    NEW.tipo_documento := 'FACTURA';
  END IF;

  NEW.numero_documento := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.numero_documento, ''))), ''),
    format('VTA-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );

  NEW.metodo_pago := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'EFECTIVO'));
  IF NEW.metodo_pago NOT IN ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO', 'MIXTO', 'OTRO') THEN
    NEW.metodo_pago := 'OTRO';
  END IF;

  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.descuento := GREATEST(COALESCE(NEW.descuento, 0), 0);
  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  NEW.igv := GREATEST(COALESCE(NEW.igv, 0), 0);
  NEW.total := GREATEST(COALESCE(NEW.total, 0), 0);
  IF NEW.total = 0 THEN
    NEW.total := round(GREATEST(NEW.subtotal - NEW.descuento, 0) + NEW.igv, 2);
  END IF;

  NEW.referencia := NULLIF(upper(btrim(COALESCE(NEW.referencia, ''))), '');

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'BORRADOR'));
  IF v_estado IN ('ACTIVO', 'CERRADA') THEN
    v_estado := 'CONFIRMADA';
  ELSIF v_estado IN ('INACTIVO', 'CANCELADA') THEN
    v_estado := 'ANULADA';
  END IF;
  IF v_estado NOT IN ('BORRADOR', 'EMITIDA', 'PAGADA', 'CONFIRMADA', 'ANULADA') THEN
    v_estado := 'BORRADOR';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADA');
  IF NEW.estado = 'ANULADA' THEN
    NEW.activo := false;
  END IF;

  NEW.idempotency_key := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.idempotency_key, ''))), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('venta.event:%s', NEW.event_id::text)
      ELSE format('venta:%s:%s', COALESCE(NEW.tenant_id::text, 'no-tenant'), replace(gen_random_uuid()::text, '-', ''))
    END
  );

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('%s %s', NEW.tipo_documento, NEW.numero_documento)
  );
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('VTA-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_ventas_row ON public.ventas;
CREATE TRIGGER trg_normalize_ventas_row
BEFORE INSERT OR UPDATE ON public.ventas
FOR EACH ROW
EXECUTE FUNCTION app.normalize_ventas_row();

-- ----------------------------------------------------------------------------
-- venta_detalles
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.venta_detalles
  ADD COLUMN IF NOT EXISTS venta_id uuid,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_linea numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidad_medida text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.venta_detalles
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN venta_id TYPE uuid USING app.to_uuid_or_null(COALESCE(venta_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN cantidad TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad::text),
  ALTER COLUMN precio_unitario TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_unitario::text),
  ALTER COLUMN descuento TYPE numeric(14,2) USING app.to_numeric_or_zero(descuento::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total_linea TYPE numeric(14,2) USING app.to_numeric_or_zero(total_linea::text),
  ALTER COLUMN unidad_medida TYPE text USING NULLIF(upper(btrim(COALESCE(unidad_medida, ''))), ''),
  ALTER COLUMN cantidad SET DEFAULT 1,
  ALTER COLUMN precio_unitario SET DEFAULT 0,
  ALTER COLUMN descuento SET DEFAULT 0,
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN igv SET DEFAULT 0,
  ALTER COLUMN total_linea SET DEFAULT 0,
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.venta_detalles vd
SET
  cantidad = GREATEST(COALESCE(vd.cantidad, 0), 1),
  precio_unitario = GREATEST(COALESCE(vd.precio_unitario, 0), 0),
  descuento = GREATEST(COALESCE(vd.descuento, 0), 0),
  subtotal = CASE
    WHEN COALESCE(vd.subtotal, 0) > 0 THEN GREATEST(vd.subtotal, 0)
    ELSE round(GREATEST(COALESCE(vd.cantidad, 1), 1) * GREATEST(COALESCE(vd.precio_unitario, 0), 0) - GREATEST(COALESCE(vd.descuento, 0), 0), 2)
  END,
  igv = GREATEST(COALESCE(vd.igv, 0), 0),
  total_linea = CASE
    WHEN COALESCE(vd.total_linea, 0) > 0 THEN GREATEST(vd.total_linea, 0)
    ELSE round(
      (CASE WHEN COALESCE(vd.subtotal, 0) > 0 THEN GREATEST(vd.subtotal, 0)
            ELSE GREATEST(COALESCE(vd.cantidad, 1), 1) * GREATEST(COALESCE(vd.precio_unitario, 0), 0) - GREATEST(COALESCE(vd.descuento, 0), 0)
       END) + GREATEST(COALESCE(vd.igv, 0), 0),
      2
    )
  END,
  unidad_medida = COALESCE(NULLIF(upper(btrim(COALESCE(vd.unidad_medida, ''))), ''), 'UND'),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(vd.estado), ''), 'REGISTRADO')) IN ('REGISTRADO', 'ANULADO')
      THEN upper(COALESCE(NULLIF(btrim(vd.estado), ''), 'REGISTRADO'))
    WHEN upper(COALESCE(NULLIF(btrim(vd.estado), ''), 'REGISTRADO')) IN ('ACTIVO') THEN 'REGISTRADO'
    WHEN upper(COALESCE(NULLIF(btrim(vd.estado), ''), 'REGISTRADO')) IN ('INACTIVO', 'CANCELADO') THEN 'ANULADO'
    ELSE 'REGISTRADO'
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(vd.estado), ''), 'REGISTRADO')) IN ('ANULADO', 'INACTIVO', 'CANCELADO') THEN false
    ELSE COALESCE(vd.activo, true)
  END,
  metadata = COALESCE(vd.metadata, '{}'::jsonb)
WHERE vd.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_venta_detalles_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.venta_id := app.to_uuid_or_null(COALESCE(NEW.venta_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));

  NEW.cantidad := GREATEST(COALESCE(NEW.cantidad, 0), 1);
  NEW.precio_unitario := GREATEST(COALESCE(NEW.precio_unitario, 0), 0);
  NEW.descuento := GREATEST(COALESCE(NEW.descuento, 0), 0);
  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  IF NEW.subtotal = 0 THEN
    NEW.subtotal := round(GREATEST(NEW.cantidad * NEW.precio_unitario - NEW.descuento, 0), 2);
  END IF;
  NEW.igv := GREATEST(COALESCE(NEW.igv, 0), 0);
  NEW.total_linea := GREATEST(COALESCE(NEW.total_linea, 0), 0);
  IF NEW.total_linea = 0 THEN
    NEW.total_linea := round(NEW.subtotal + NEW.igv, 2);
  END IF;

  NEW.unidad_medida := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.unidad_medida, '')), ''), 'UND'));
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'REGISTRADO'));
  v_estado := NEW.estado;
  IF v_estado IN ('ACTIVO') THEN
    v_estado := 'REGISTRADO';
  ELSIF v_estado IN ('INACTIVO', 'CANCELADO') THEN
    v_estado := 'ANULADO';
  END IF;
  IF v_estado NOT IN ('REGISTRADO', 'ANULADO') THEN
    v_estado := 'REGISTRADO';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADO');
  IF NEW.estado = 'ANULADO' THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), format('DETALLE %s', COALESCE(NEW.producto_id::text, 'ITEM')));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('VD-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_venta_detalles_row ON public.venta_detalles;
CREATE TRIGGER trg_normalize_venta_detalles_row
BEFORE INSERT OR UPDATE ON public.venta_detalles
FOR EACH ROW
EXECUTE FUNCTION app.normalize_venta_detalles_row();

-- ----------------------------------------------------------------------------
-- pagos_ventas
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pagos_ventas
  ADD COLUMN IF NOT EXISTS venta_id uuid,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS numero_operacion text,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS aplicado_en timestamptz,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.pagos_ventas
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN venta_id TYPE uuid USING app.to_uuid_or_null(COALESCE(venta_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN event_id TYPE uuid USING app.to_uuid_or_null(COALESCE(event_id::text, '')),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN metodo_pago TYPE text USING NULLIF(upper(btrim(COALESCE(metodo_pago, ''))), ''),
  ALTER COLUMN fecha_pago TYPE date USING app.to_date_or_null(COALESCE(fecha_pago::text, '')),
  ALTER COLUMN referencia TYPE text USING NULLIF(upper(btrim(COALESCE(referencia, ''))), ''),
  ALTER COLUMN numero_operacion TYPE text USING NULLIF(upper(btrim(COALESCE(numero_operacion, ''))), ''),
  ALTER COLUMN idempotency_key TYPE text USING NULLIF(lower(btrim(COALESCE(idempotency_key, ''))), ''),
  ALTER COLUMN aplicado_en TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(aplicado_en::text, '')),
  ALTER COLUMN monto SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.pagos_ventas pv
SET
  fecha_pago = COALESCE(pv.fecha_pago, pv.created_at::date, current_date),
  monto = GREATEST(COALESCE(pv.monto, 0), 0),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(pv.moneda, ''))), ''), 'PEN'),
  metodo_pago = COALESCE(NULLIF(upper(btrim(COALESCE(pv.metodo_pago, ''))), ''), 'EFECTIVO'),
  referencia = NULLIF(upper(btrim(COALESCE(pv.referencia, ''))), ''),
  numero_operacion = NULLIF(upper(btrim(COALESCE(pv.numero_operacion, ''))), ''),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(pv.estado), ''), 'APLICADO')) IN ('REGISTRADO', 'APLICADO', 'ANULADO')
      THEN upper(COALESCE(NULLIF(btrim(pv.estado), ''), 'APLICADO'))
    WHEN upper(COALESCE(NULLIF(btrim(pv.estado), ''), 'APLICADO')) IN ('ACTIVO', 'PAGADO') THEN 'APLICADO'
    WHEN upper(COALESCE(NULLIF(btrim(pv.estado), ''), 'APLICADO')) IN ('INACTIVO', 'CANCELADO') THEN 'ANULADO'
    ELSE 'APLICADO'
  END,
  aplicado_en = CASE
    WHEN upper(COALESCE(NULLIF(btrim(pv.estado), ''), 'APLICADO')) IN ('APLICADO', 'PAGADO', 'ACTIVO') THEN COALESCE(pv.aplicado_en, now())
    ELSE pv.aplicado_en
  END,
  idempotency_key = COALESCE(NULLIF(lower(btrim(COALESCE(pv.idempotency_key, ''))), ''),
    CASE WHEN pv.event_id IS NOT NULL THEN format('pv.event:%s', pv.event_id::text) ELSE NULL END),
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(pv.estado), ''), 'APLICADO')) IN ('ANULADO', 'INACTIVO', 'CANCELADO') THEN false
    ELSE COALESCE(pv.activo, true)
  END,
  metadata = COALESCE(pv.metadata, '{}'::jsonb)
WHERE pv.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_pagos_ventas_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.venta_id := app.to_uuid_or_null(COALESCE(NEW.venta_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.metodo_pago := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'EFECTIVO'));
  IF NEW.metodo_pago NOT IN ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO', 'MIXTO', 'OTRO') THEN
    NEW.metodo_pago := 'OTRO';
  END IF;

  NEW.fecha_pago := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_pago::text, '')), current_date);
  NEW.referencia := NULLIF(upper(btrim(COALESCE(NEW.referencia, ''))), '');
  NEW.numero_operacion := NULLIF(upper(btrim(COALESCE(NEW.numero_operacion, ''))), '');

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'APLICADO'));
  IF v_estado IN ('ACTIVO', 'PAGADO') THEN
    v_estado := 'APLICADO';
  ELSIF v_estado IN ('INACTIVO', 'CANCELADO') THEN
    v_estado := 'ANULADO';
  END IF;
  IF v_estado NOT IN ('REGISTRADO', 'APLICADO', 'ANULADO') THEN
    v_estado := 'APLICADO';
  END IF;
  NEW.estado := v_estado;

  IF NEW.estado = 'APLICADO' THEN
    NEW.aplicado_en := COALESCE(NEW.aplicado_en, now());
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADO');
  IF NEW.estado = 'ANULADO' THEN
    NEW.activo := false;
  END IF;

  NEW.idempotency_key := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.idempotency_key, ''))), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('pv.event:%s', NEW.event_id::text)
      ELSE format('pv:%s:%s', COALESCE(NEW.tenant_id::text, 'no-tenant'), replace(gen_random_uuid()::text, '-', ''))
    END
  );

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), format('PAGO VENTA %s', to_char(NEW.fecha_pago, 'YYYY-MM-DD')));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('PV-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pagos_ventas_row ON public.pagos_ventas;
CREATE TRIGGER trg_normalize_pagos_ventas_row
BEFORE INSERT OR UPDATE ON public.pagos_ventas
FOR EACH ROW
EXECUTE FUNCTION app.normalize_pagos_ventas_row();

-- ----------------------------------------------------------------------------
-- Backfill defensivo de timestamps.
-- ----------------------------------------------------------------------------
UPDATE public.ventas
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.venta_detalles
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.pagos_ventas
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Indices runtime.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ventas_tenant_estado_fecha_runtime
ON public.ventas (tenant_id, estado, fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ventas_tenant_documento_runtime
ON public.ventas (tenant_id, tipo_documento, numero_documento, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_ventas_tenant_cliente_fecha_runtime
ON public.ventas (tenant_id, cliente_id, fecha DESC)
WHERE cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venta_detalles_tenant_venta_runtime
ON public.venta_detalles (tenant_id, venta_id, created_at DESC)
WHERE venta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venta_detalles_tenant_producto_runtime
ON public.venta_detalles (tenant_id, producto_id, created_at DESC)
WHERE producto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_ventas_tenant_venta_fecha_runtime
ON public.pagos_ventas (tenant_id, venta_id, fecha_pago DESC, created_at DESC)
WHERE venta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_ventas_tenant_metodo_fecha_runtime
ON public.pagos_ventas (tenant_id, metodo_pago, fecha_pago DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_ventas_tenant_event_id
ON public.pagos_ventas (tenant_id, event_id)
WHERE tenant_id IS NOT NULL
  AND event_id IS NOT NULL;

COMMIT;
