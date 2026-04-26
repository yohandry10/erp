-- ============================================================================
-- 176__pos_inventory_aux_runtime_alignment.sql
-- Alineacion runtime para POS + inventario auxiliar:
-- configuracion_caja, detalle_ventas_pos, producto_existencias, eventos_pos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- configuracion_caja
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.configuracion_caja
  ADD COLUMN IF NOT EXISTS retiro_max_sin_autorizacion numeric(10,2) DEFAULT 500,
  ADD COLUMN IF NOT EXISTS saldo_minimo_operativo numeric(10,2) DEFAULT 50,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE IF EXISTS public.configuracion_caja
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(caja_id::text, '')),
  ALTER COLUMN updated_by TYPE uuid USING app.to_uuid_or_null(COALESCE(updated_by::text, '')),
  ALTER COLUMN monto_apertura_min TYPE numeric(10,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(monto_apertura_min::text, '0')), 0),
  ALTER COLUMN monto_apertura_max TYPE numeric(10,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(monto_apertura_max::text, '50000')), 0),
  ALTER COLUMN tolerancia_diferencia_cierre TYPE numeric(10,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(tolerancia_diferencia_cierre::text, '10')), 0),
  ALTER COLUMN retiro_max_sin_autorizacion TYPE numeric(10,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(retiro_max_sin_autorizacion::text, '500')), 0),
  ALTER COLUMN saldo_minimo_operativo TYPE numeric(10,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(saldo_minimo_operativo::text, '50')), 0),
  ALTER COLUMN moneda TYPE text USING upper(COALESCE(NULLIF(btrim(moneda), ''), 'PEN')),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(
    CASE WHEN metadata IS NULL THEN '{}'::jsonb
         WHEN jsonb_typeof(metadata) = 'object' THEN metadata
         ELSE '{}'::jsonb END,
    '{}'::jsonb
  ),
  ALTER COLUMN monto_apertura_min SET DEFAULT 0,
  ALTER COLUMN monto_apertura_max SET DEFAULT 50000,
  ALTER COLUMN tolerancia_diferencia_cierre SET DEFAULT 10,
  ALTER COLUMN retiro_max_sin_autorizacion SET DEFAULT 500,
  ALTER COLUMN saldo_minimo_operativo SET DEFAULT 50,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN estado SET DEFAULT 'ACTIVO',
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.configuracion_caja c
SET
  monto_apertura_min = GREATEST(COALESCE(c.monto_apertura_min, 0), 0),
  monto_apertura_max = GREATEST(COALESCE(c.monto_apertura_max, 50000), GREATEST(COALESCE(c.monto_apertura_min, 0), 0) + 1),
  tolerancia_diferencia_cierre = GREATEST(COALESCE(c.tolerancia_diferencia_cierre, 10), 0),
  retiro_max_sin_autorizacion = GREATEST(COALESCE(c.retiro_max_sin_autorizacion, 500), 0),
  saldo_minimo_operativo = GREATEST(COALESCE(c.saldo_minimo_operativo, 50), 0),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(c.moneda, ''))), ''), 'PEN'),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'BLOQUEADA')
      THEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO'))
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO')) IN ('ENABLED', 'OPEN') THEN 'ACTIVO'
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO')) IN ('DISABLED', 'CLOSED') THEN 'INACTIVO'
    ELSE 'ACTIVO'
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO')) IN ('INACTIVO', 'BLOQUEADA', 'DISABLED', 'CLOSED') THEN false
    ELSE COALESCE(c.activo, true)
  END,
  metadata = COALESCE(c.metadata, '{}'::jsonb),
  updated_at = now()
WHERE c.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_configuracion_caja_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.caja_id := app.to_uuid_or_null(COALESCE(NEW.caja_id::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, ''));
  NEW.monto_apertura_min := GREATEST(COALESCE(NEW.monto_apertura_min, 0), 0);
  NEW.monto_apertura_max := GREATEST(COALESCE(NEW.monto_apertura_max, 50000), NEW.monto_apertura_min + 1);
  NEW.tolerancia_diferencia_cierre := GREATEST(COALESCE(NEW.tolerancia_diferencia_cierre, 10), 0);
  NEW.retiro_max_sin_autorizacion := GREATEST(COALESCE(NEW.retiro_max_sin_autorizacion, 500), 0);
  NEW.saldo_minimo_operativo := GREATEST(COALESCE(NEW.saldo_minimo_operativo, 50), 0);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado NOT IN ('ACTIVO', 'INACTIVO', 'BLOQUEADA') THEN
    IF NEW.estado IN ('ENABLED', 'OPEN') THEN
      NEW.estado := 'ACTIVO';
    ELSIF NEW.estado IN ('DISABLED', 'CLOSED') THEN
      NEW.estado := 'INACTIVO';
    ELSE
      NEW.estado := 'ACTIVO';
    END IF;
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'ACTIVO');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_configuracion_caja_row ON public.configuracion_caja;
CREATE TRIGGER trg_normalize_configuracion_caja_row
BEFORE INSERT OR UPDATE ON public.configuracion_caja
FOR EACH ROW
EXECUTE FUNCTION app.normalize_configuracion_caja_row();

-- ----------------------------------------------------------------------------
-- detalle_ventas_pos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.detalle_ventas_pos
  ADD COLUMN IF NOT EXISTS venta_pos_id uuid,
  ADD COLUMN IF NOT EXISTS item_index integer,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impuesto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nombre_producto text,
  ADD COLUMN IF NOT EXISTS codigo_producto text,
  ADD COLUMN IF NOT EXISTS unidad_medida text;

ALTER TABLE IF EXISTS public.detalle_ventas_pos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN venta_id TYPE uuid USING app.to_uuid_or_null(COALESCE(venta_id::text, '')),
  ALTER COLUMN venta_pos_id TYPE uuid USING app.to_uuid_or_null(COALESCE(venta_pos_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN item_index TYPE integer USING CASE WHEN item_index IS NULL THEN NULL ELSE GREATEST(app.to_int_or_zero(item_index::text), 1) END,
  ALTER COLUMN cantidad TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(cantidad::text, '1')), 0),
  ALTER COLUMN precio_unitario TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(precio_unitario::text, '0')), 0),
  ALTER COLUMN descuento TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(descuento::text, '0')), 0),
  ALTER COLUMN impuesto TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(impuesto::text, '0')), 0),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(subtotal::text, '0')), 0),
  ALTER COLUMN total TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(total::text, '0')), 0),
  ALTER COLUMN nombre_producto TYPE text USING NULLIF(btrim(COALESCE(nombre_producto, '')), ''),
  ALTER COLUMN codigo_producto TYPE text USING NULLIF(upper(btrim(COALESCE(codigo_producto, ''))), ''),
  ALTER COLUMN unidad_medida TYPE text USING NULLIF(upper(btrim(COALESCE(unidad_medida, ''))), ''),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')),
  ALTER COLUMN cantidad SET DEFAULT 1,
  ALTER COLUMN precio_unitario SET DEFAULT 0,
  ALTER COLUMN descuento SET DEFAULT 0,
  ALTER COLUMN impuesto SET DEFAULT 0,
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'ACTIVO',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.detalle_ventas_pos d
SET
  venta_pos_id = COALESCE(d.venta_pos_id, d.venta_id),
  venta_id = COALESCE(d.venta_id, d.venta_pos_id),
  item_index = COALESCE(d.item_index, 1),
  cantidad = GREATEST(COALESCE(d.cantidad, 1), 0),
  precio_unitario = GREATEST(COALESCE(d.precio_unitario, 0), 0),
  descuento = GREATEST(COALESCE(d.descuento, 0), 0),
  impuesto = GREATEST(COALESCE(d.impuesto, 0), 0),
  subtotal = GREATEST(COALESCE(NULLIF(d.subtotal, 0), COALESCE(d.cantidad, 0) * COALESCE(d.precio_unitario, 0) - COALESCE(d.descuento, 0)), 0),
  total = GREATEST(COALESCE(NULLIF(d.total, 0), COALESCE(NULLIF(d.subtotal, 0), COALESCE(d.cantidad, 0) * COALESCE(d.precio_unitario, 0)) + COALESCE(d.impuesto, 0) - COALESCE(d.descuento, 0)), 0),
  nombre_producto = NULLIF(btrim(COALESCE(d.nombre_producto, '')), ''),
  codigo_producto = NULLIF(upper(btrim(COALESCE(d.codigo_producto, ''))), ''),
  unidad_medida = COALESCE(NULLIF(upper(btrim(COALESCE(d.unidad_medida, ''))), ''), 'UND'),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'CONFIRMADO', 'ANULADO', 'DEVUELTO')
      THEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'ACTIVO'))
    ELSE 'ACTIVO'
  END,
  metadata = COALESCE(d.metadata, '{}'::jsonb),
  updated_at = now()
WHERE d.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_detalle_ventas_pos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.venta_pos_id := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.venta_pos_id::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.venta_id::text, ''))
  );
  NEW.venta_id := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.venta_id::text, '')),
    NEW.venta_pos_id
  );
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.item_index := CASE WHEN NEW.item_index IS NULL THEN NULL ELSE GREATEST(NEW.item_index, 1) END;
  NEW.cantidad := GREATEST(COALESCE(NEW.cantidad, 1), 0);
  NEW.precio_unitario := GREATEST(COALESCE(NEW.precio_unitario, 0), 0);
  NEW.descuento := GREATEST(COALESCE(NEW.descuento, 0), 0);
  NEW.impuesto := GREATEST(COALESCE(NEW.impuesto, 0), 0);
  NEW.subtotal := GREATEST(COALESCE(NULLIF(NEW.subtotal, 0), NEW.cantidad * NEW.precio_unitario - NEW.descuento), 0);
  NEW.total := GREATEST(COALESCE(NULLIF(NEW.total, 0), NEW.subtotal + NEW.impuesto - NEW.descuento), 0);
  NEW.nombre_producto := NULLIF(btrim(COALESCE(NEW.nombre_producto, '')), '');
  NEW.codigo_producto := NULLIF(upper(btrim(COALESCE(NEW.codigo_producto, ''))), '');
  NEW.unidad_medida := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.unidad_medida, ''))), ''), 'UND');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado NOT IN ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'CONFIRMADO', 'ANULADO', 'DEVUELTO') THEN
    NEW.estado := 'ACTIVO';
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_detalle_ventas_pos_row ON public.detalle_ventas_pos;
CREATE TRIGGER trg_normalize_detalle_ventas_pos_row
BEFORE INSERT OR UPDATE ON public.detalle_ventas_pos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_detalle_ventas_pos_row();

-- ----------------------------------------------------------------------------
-- producto_existencias
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.producto_existencias
  ADD COLUMN IF NOT EXISTS stock_minimo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_promedio numeric(14,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_movimiento_at timestamptz;

ALTER TABLE IF EXISTS public.producto_existencias
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN almacen_id TYPE uuid USING app.to_uuid_or_null(COALESCE(almacen_id::text, '')),
  ALTER COLUMN ubicacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(ubicacion_id::text, '')),
  ALTER COLUMN lote TYPE text USING NULLIF(upper(btrim(COALESCE(lote, ''))), ''),
  ALTER COLUMN fecha_expiracion TYPE date USING app.to_date_or_null(COALESCE(fecha_expiracion::text, '')),
  ALTER COLUMN stock_actual TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(stock_actual::text, '0')), 0),
  ALTER COLUMN stock_reservado TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(stock_reservado::text, '0')), 0),
  ALTER COLUMN stock_danado TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(stock_danado::text, '0')), 0),
  ALTER COLUMN stock_minimo TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(stock_minimo::text, '0')), 0),
  ALTER COLUMN costo_promedio TYPE numeric(14,6) USING GREATEST(app.to_numeric_or_zero(COALESCE(costo_promedio::text, '0')), 0),
  ALTER COLUMN ultimo_movimiento_at TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(ultimo_movimiento_at::text, '')),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')),
  ALTER COLUMN stock_actual SET DEFAULT 0,
  ALTER COLUMN stock_reservado SET DEFAULT 0,
  ALTER COLUMN stock_danado SET DEFAULT 0,
  ALTER COLUMN stock_minimo SET DEFAULT 0,
  ALTER COLUMN costo_promedio SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'ACTIVO',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.producto_existencias pe
SET
  stock_actual = GREATEST(COALESCE(pe.stock_actual, 0), 0),
  stock_reservado = GREATEST(COALESCE(pe.stock_reservado, 0), 0),
  stock_danado = GREATEST(COALESCE(pe.stock_danado, 0), 0),
  stock_minimo = GREATEST(COALESCE(pe.stock_minimo, 0), 0),
  costo_promedio = GREATEST(COALESCE(pe.costo_promedio, 0), 0),
  lote = NULLIF(upper(btrim(COALESCE(pe.lote, ''))), ''),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(pe.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO')
      THEN upper(COALESCE(NULLIF(btrim(pe.estado), ''), 'ACTIVO'))
    ELSE 'ACTIVO'
  END,
  metadata = COALESCE(pe.metadata, '{}'::jsonb),
  updated_at = now()
WHERE pe.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_producto_existencias_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));
  NEW.ubicacion_id := app.to_uuid_or_null(COALESCE(NEW.ubicacion_id::text, ''));
  NEW.lote := NULLIF(upper(btrim(COALESCE(NEW.lote, ''))), '');
  NEW.fecha_expiracion := app.to_date_or_null(COALESCE(NEW.fecha_expiracion::text, ''));
  NEW.stock_actual := GREATEST(COALESCE(NEW.stock_actual, 0), 0);
  NEW.stock_reservado := GREATEST(COALESCE(NEW.stock_reservado, 0), 0);
  NEW.stock_danado := GREATEST(COALESCE(NEW.stock_danado, 0), 0);
  NEW.stock_minimo := GREATEST(COALESCE(NEW.stock_minimo, 0), 0);
  NEW.costo_promedio := GREATEST(COALESCE(NEW.costo_promedio, 0), 0);
  NEW.ultimo_movimiento_at := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.ultimo_movimiento_at::text, '')), NEW.updated_at, NEW.created_at, now());
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado NOT IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO') THEN
    NEW.estado := 'ACTIVO';
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_producto_existencias_row ON public.producto_existencias;
CREATE TRIGGER trg_normalize_producto_existencias_row
BEFORE INSERT OR UPDATE ON public.producto_existencias
FOR EACH ROW
EXECUTE FUNCTION app.normalize_producto_existencias_row();

-- ----------------------------------------------------------------------------
-- eventos_pos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.eventos_pos
  ADD COLUMN IF NOT EXISTS riesgo_nivel text DEFAULT 'BAJO',
  ADD COLUMN IF NOT EXISTS procesado_alerta boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS alertado_en timestamptz;

ALTER TABLE IF EXISTS public.eventos_pos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN sesion_caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(sesion_caja_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN venta_id TYPE uuid USING app.to_uuid_or_null(COALESCE(venta_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN supervisor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(supervisor_id::text, '')),
  ALTER COLUMN item_index TYPE integer USING CASE WHEN item_index IS NULL THEN NULL ELSE GREATEST(app.to_int_or_zero(item_index::text), 0) END,
  ALTER COLUMN tipo_evento TYPE text USING upper(NULLIF(btrim(COALESCE(tipo_evento, '')), '')),
  ALTER COLUMN subtipo TYPE text USING upper(NULLIF(btrim(COALESCE(subtipo, '')), '')),
  ALTER COLUMN datos TYPE jsonb USING COALESCE(
    CASE WHEN datos IS NULL THEN '{}'::jsonb
         WHEN jsonb_typeof(datos) = 'object' THEN datos
         ELSE jsonb_build_object('legacy', datos)
    END,
    '{}'::jsonb
  ),
  ALTER COLUMN ip_address TYPE inet USING app.to_inet_or_null(COALESCE(ip_address::text, '')),
  ALTER COLUMN dispositivo TYPE text USING NULLIF(btrim(COALESCE(dispositivo, '')), ''),
  ALTER COLUMN user_agent TYPE text USING NULLIF(btrim(COALESCE(user_agent, '')), ''),
  ALTER COLUMN justificacion TYPE text USING NULLIF(btrim(COALESCE(justificacion, '')), ''),
  ALTER COLUMN "timestamp" TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE("timestamp"::text, '')),
  ALTER COLUMN riesgo_nivel TYPE text USING upper(COALESCE(NULLIF(btrim(riesgo_nivel), ''), 'BAJO')),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')),
  ALTER COLUMN requiere_supervisor SET DEFAULT false,
  ALTER COLUMN riesgo_nivel SET DEFAULT 'BAJO',
  ALTER COLUMN procesado_alerta SET DEFAULT false,
  ALTER COLUMN estado SET DEFAULT 'ACTIVO',
  ALTER COLUMN datos SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.eventos_pos e
SET
  tipo_evento = COALESCE(NULLIF(upper(btrim(COALESCE(e.tipo_evento, ''))), ''), 'INICIO_VENTA'),
  subtipo = NULLIF(upper(btrim(COALESCE(e.subtipo, ''))), ''),
  item_index = CASE WHEN e.item_index IS NULL THEN NULL ELSE GREATEST(e.item_index, 0) END,
  datos = COALESCE(
    CASE WHEN e.datos IS NULL THEN '{}'::jsonb
         WHEN jsonb_typeof(e.datos) = 'object' THEN e.datos
         ELSE jsonb_build_object('legacy', e.datos)
    END,
    '{}'::jsonb
  ),
  "timestamp" = COALESCE(e."timestamp", e.created_at, now()),
  riesgo_nivel = CASE
    WHEN upper(COALESCE(NULLIF(btrim(e.riesgo_nivel), ''), 'BAJO')) IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO')
      THEN upper(COALESCE(NULLIF(btrim(e.riesgo_nivel), ''), 'BAJO'))
    ELSE 'BAJO'
  END,
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(e.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'ANULADO')
      THEN upper(COALESCE(NULLIF(btrim(e.estado), ''), 'ACTIVO'))
    ELSE 'ACTIVO'
  END,
  procesado_alerta = COALESCE(e.procesado_alerta, false),
  alertado_en = COALESCE(e.alertado_en, CASE WHEN COALESCE(e.procesado_alerta, false) THEN e.updated_at ELSE NULL END),
  metadata = COALESCE(e.metadata, '{}'::jsonb),
  updated_at = now()
WHERE e.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_eventos_pos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.venta_id := app.to_uuid_or_null(COALESCE(NEW.venta_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.supervisor_id := app.to_uuid_or_null(COALESCE(NEW.supervisor_id::text, ''));
  NEW.item_index := CASE WHEN NEW.item_index IS NULL THEN NULL ELSE GREATEST(NEW.item_index, 0) END;
  NEW.tipo_evento := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.tipo_evento, ''))), ''), 'INICIO_VENTA');
  NEW.subtipo := NULLIF(upper(btrim(COALESCE(NEW.subtipo, ''))), '');
  NEW.datos := COALESCE(
    CASE WHEN NEW.datos IS NULL THEN '{}'::jsonb
         WHEN jsonb_typeof(NEW.datos) = 'object' THEN NEW.datos
         ELSE jsonb_build_object('legacy', NEW.datos)
    END,
    '{}'::jsonb
  );
  NEW.ip_address := app.to_inet_or_null(COALESCE(NEW.ip_address::text, ''));
  NEW.dispositivo := NULLIF(btrim(COALESCE(NEW.dispositivo, '')), '');
  NEW.user_agent := NULLIF(btrim(COALESCE(NEW.user_agent, '')), '');
  NEW.justificacion := NULLIF(btrim(COALESCE(NEW.justificacion, '')), '');
  NEW."timestamp" := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW."timestamp"::text, '')), NEW.created_at, now());
  NEW.riesgo_nivel := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.riesgo_nivel, '')), ''), 'BAJO'));
  IF NEW.riesgo_nivel NOT IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO') THEN
    NEW.riesgo_nivel := 'BAJO';
  END IF;
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado NOT IN ('ACTIVO', 'INACTIVO', 'ANULADO') THEN
    NEW.estado := 'ACTIVO';
  END IF;
  NEW.procesado_alerta := COALESCE(NEW.procesado_alerta, false);
  IF NEW.procesado_alerta AND NEW.alertado_en IS NULL THEN
    NEW.alertado_en := COALESCE(NEW.updated_at, now());
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_eventos_pos_row ON public.eventos_pos;
CREATE TRIGGER trg_normalize_eventos_pos_row
BEFORE INSERT OR UPDATE ON public.eventos_pos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_eventos_pos_row();

-- ----------------------------------------------------------------------------
-- Indices runtime
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_configuracion_caja_tenant_caja_estado_runtime
ON public.configuracion_caja (tenant_id, caja_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_configuracion_caja_tenant_default_runtime
ON public.configuracion_caja (tenant_id, updated_at DESC)
WHERE caja_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_detalle_ventas_pos_tenant_venta_runtime
ON public.detalle_ventas_pos (tenant_id, venta_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_ventas_pos_tenant_producto_runtime
ON public.detalle_ventas_pos (tenant_id, producto_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_ventas_pos_tenant_venta_pos_runtime
ON public.detalle_ventas_pos (tenant_id, venta_pos_id);

CREATE INDEX IF NOT EXISTS idx_producto_existencias_tenant_almacen_stock_runtime
ON public.producto_existencias (tenant_id, almacen_id, stock_actual DESC);

CREATE INDEX IF NOT EXISTS idx_producto_existencias_tenant_producto_stock_runtime
ON public.producto_existencias (tenant_id, producto_id, stock_actual DESC);

CREATE INDEX IF NOT EXISTS idx_producto_existencias_tenant_stock_minimo_runtime
ON public.producto_existencias (tenant_id, stock_actual, stock_minimo);

CREATE INDEX IF NOT EXISTS idx_eventos_pos_tenant_tipo_timestamp_runtime
ON public.eventos_pos (tenant_id, tipo_evento, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_pos_tenant_sesion_timestamp_runtime
ON public.eventos_pos (tenant_id, sesion_caja_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_pos_tenant_supervisor_runtime
ON public.eventos_pos (tenant_id, requiere_supervisor, supervisor_id, "timestamp" DESC);

COMMIT;
