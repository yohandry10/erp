-- ============================================================================
-- 149__compras_cotizaciones_devoluciones_runtime_alignment.sql
-- Runtime alignment para cotizaciones de compra, aprobaciones y devoluciones.
-- Tablas: cotizaciones_compra, cotizacion_compra_detalles, oc_aprobaciones,
--         devoluciones_proveedor, devolucion_items.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- cotizaciones_compra: shape runtime real consumido por repository/service
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cotizaciones_compra
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE IF EXISTS public.cotizaciones_compra
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero::text, '')), ''),
  ALTER COLUMN proveedor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(proveedor_id::text, '')),
  ALTER COLUMN orden_compra_id TYPE uuid USING app.to_uuid_or_null(COALESCE(orden_compra_id::text, '')),
  ALTER COLUMN cotizacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cotizacion_id::text, '')),
  ALTER COLUMN created_by TYPE uuid USING app.to_uuid_or_null(COALESCE(created_by::text, '')),
  ALTER COLUMN updated_by TYPE uuid USING app.to_uuid_or_null(COALESCE(updated_by::text, '')),
  ALTER COLUMN fecha_cotizacion TYPE date USING CASE
    WHEN fecha_cotizacion IS NULL OR btrim(fecha_cotizacion::text) = '' THEN NULL
    ELSE fecha_cotizacion::date
  END,
  ALTER COLUMN fecha_vencimiento TYPE date USING CASE
    WHEN fecha_vencimiento IS NULL OR btrim(fecha_vencimiento::text) = '' THEN NULL
    ELSE fecha_vencimiento::date
  END,
  ALTER COLUMN validez_dias TYPE integer USING GREATEST(app.to_int_or_zero(validez_dias::text), 0),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'BORRADOR')),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
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
  ALTER COLUMN validez_dias SET DEFAULT 30,
  ALTER COLUMN estado SET DEFAULT 'BORRADOR',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.cotizaciones_compra
SET
  numero = COALESCE(
    NULLIF(btrim(COALESCE(numero, '')), ''),
    NULLIF(btrim(COALESCE(codigo, '')), ''),
    'COT-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' || right(replace(id::text, '-', ''), 6)
  ),
  fecha_cotizacion = COALESCE(fecha_cotizacion, COALESCE(created_at, now())::date),
  validez_dias = CASE WHEN COALESCE(validez_dias, 0) < 1 THEN 30 ELSE validez_dias END,
  fecha_vencimiento = COALESCE(
    fecha_vencimiento,
    COALESCE(fecha_cotizacion, COALESCE(created_at, now())::date) + (CASE WHEN COALESCE(validez_dias, 0) < 1 THEN 30 ELSE validez_dias END)
  ),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR')) IN ('ACTIVO', 'DRAFT') THEN 'BORRADOR'
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'BORRADOR')) IN ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA') THEN upper(estado)
    ELSE 'BORRADOR'
  END,
  subtotal = COALESCE(subtotal, 0),
  igv = COALESCE(igv, 0),
  total = COALESCE(NULLIF(total, 0), COALESCE(subtotal, 0) + COALESCE(igv, 0)),
  metadata = COALESCE(metadata, '{}'::jsonb)
WHERE id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_cotizaciones_compra_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.orden_compra_id := app.to_uuid_or_null(COALESCE(NEW.orden_compra_id::text, ''));
  NEW.cotizacion_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_id::text, ''));
  NEW.created_by := app.to_uuid_or_null(COALESCE(NEW.created_by::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, ''));

  NEW.numero := COALESCE(
    NULLIF(btrim(COALESCE(NEW.numero, '')), ''),
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'COT-' || to_char(now(), 'YYYY') || '-' || right(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 6)
  );

  NEW.fecha_cotizacion := COALESCE(NEW.fecha_cotizacion, COALESCE(NEW.created_at, now())::date);
  NEW.validez_dias := CASE WHEN COALESCE(NEW.validez_dias, 0) < 1 THEN 30 ELSE NEW.validez_dias END;
  NEW.fecha_vencimiento := COALESCE(NEW.fecha_vencimiento, NEW.fecha_cotizacion + NEW.validez_dias);

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'BORRADOR'));
  IF v_estado IN ('ACTIVO', 'DRAFT') THEN v_estado := 'BORRADOR'; END IF;
  IF v_estado NOT IN ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA') THEN v_estado := 'BORRADOR'; END IF;
  NEW.estado := v_estado;

  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  NEW.igv := GREATEST(COALESCE(NEW.igv, 0), 0);
  NEW.total := GREATEST(COALESCE(NEW.total, NEW.subtotal + NEW.igv, 0), 0);
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cotizaciones_compra_row ON public.cotizaciones_compra;
CREATE TRIGGER trg_normalize_cotizaciones_compra_row
BEFORE INSERT OR UPDATE ON public.cotizaciones_compra
FOR EACH ROW EXECUTE FUNCTION app.normalize_cotizaciones_compra_row();

-- ----------------------------------------------------------------------------
-- cotizacion_compra_detalles: shape runtime
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cotizacion_compra_detalles
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.cotizacion_compra_detalles
  ALTER COLUMN cotizacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cotizacion_id::text, '')),
  ALTER COLUMN orden_compra_id TYPE uuid USING app.to_uuid_or_null(COALESCE(orden_compra_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN cantidad TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad::text),
  ALTER COLUMN precio_unitario TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_unitario::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN cantidad SET DEFAULT 0,
  ALTER COLUMN precio_unitario SET DEFAULT 0;

UPDATE public.cotizacion_compra_detalles
SET
  cantidad = COALESCE(cantidad, 0),
  precio_unitario = COALESCE(precio_unitario, 0),
  subtotal = COALESCE(NULLIF(subtotal, 0), COALESCE(cantidad, 0) * COALESCE(precio_unitario, 0))
WHERE id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_cotizacion_compra_detalles_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cotizacion_id := app.to_uuid_or_null(COALESCE(NEW.cotizacion_id::text, ''));
  NEW.orden_compra_id := app.to_uuid_or_null(COALESCE(NEW.orden_compra_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.cantidad := GREATEST(COALESCE(NEW.cantidad, 0), 0);
  NEW.precio_unitario := GREATEST(COALESCE(NEW.precio_unitario, 0), 0);
  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, NEW.cantidad * NEW.precio_unitario, 0), 0);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cotizacion_compra_detalles_row ON public.cotizacion_compra_detalles;
CREATE TRIGGER trg_normalize_cotizacion_compra_detalles_row
BEFORE INSERT OR UPDATE ON public.cotizacion_compra_detalles
FOR EACH ROW EXECUTE FUNCTION app.normalize_cotizacion_compra_detalles_row();

-- ----------------------------------------------------------------------------
-- oc_aprobaciones: compatibilidad con aprobador_id string (uuid o SYSTEM)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.oc_aprobaciones
  ADD COLUMN IF NOT EXISTS aprobador_nombre text,
  ADD COLUMN IF NOT EXISTS fecha_aprobacion timestamptz,
  ADD COLUMN IF NOT EXISTS comentarios text;

ALTER TABLE IF EXISTS public.oc_aprobaciones
  ALTER COLUMN orden_id TYPE uuid USING app.to_uuid_or_null(COALESCE(orden_id::text, '')),
  ALTER COLUMN aprobador_id TYPE text USING NULLIF(btrim(COALESCE(aprobador_id::text, '')), ''),
  ALTER COLUMN nivel TYPE integer USING GREATEST(app.to_int_or_zero(nivel::text), 0),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'PENDIENTE')),
  ALTER COLUMN aprobador_nombre TYPE text USING NULLIF(btrim(COALESCE(aprobador_nombre, '')), ''),
  ALTER COLUMN comentarios TYPE text USING NULLIF(btrim(COALESCE(comentarios, '')), ''),
  ALTER COLUMN fecha_aprobacion TYPE timestamptz USING CASE
    WHEN fecha_aprobacion IS NULL OR btrim(fecha_aprobacion::text) = '' THEN NULL
    ELSE fecha_aprobacion::timestamptz
  END,
  ALTER COLUMN nivel SET DEFAULT 1,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE';

UPDATE public.oc_aprobaciones
SET
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')) IN ('ACTIVO', 'BORRADOR') THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')) IN ('PENDIENTE', 'APROBADA', 'RECHAZADA') THEN upper(estado)
    ELSE 'PENDIENTE'
  END,
  nivel = CASE WHEN COALESCE(nivel, 0) < 1 THEN 1 ELSE nivel END,
  aprobador_id = COALESCE(NULLIF(btrim(COALESCE(aprobador_id, '')), ''), 'SYSTEM'),
  aprobador_nombre = COALESCE(NULLIF(btrim(COALESCE(aprobador_nombre, '')), ''), 'Sistema')
WHERE id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_oc_aprobaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.orden_id := app.to_uuid_or_null(COALESCE(NEW.orden_id::text, ''));
  NEW.aprobador_id := COALESCE(NULLIF(btrim(COALESCE(NEW.aprobador_id, '')), ''), 'SYSTEM');
  NEW.aprobador_nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.aprobador_nombre, '')), ''), 'Sistema');
  NEW.comentarios := NULLIF(btrim(COALESCE(NEW.comentarios, '')), '');
  NEW.nivel := CASE WHEN COALESCE(NEW.nivel, 0) < 1 THEN 1 ELSE NEW.nivel END;

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF v_estado IN ('ACTIVO', 'BORRADOR') THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado NOT IN ('PENDIENTE', 'APROBADA', 'RECHAZADA') THEN v_estado := 'PENDIENTE'; END IF;
  NEW.estado := v_estado;

  IF NEW.estado IN ('APROBADA', 'RECHAZADA') THEN
    NEW.fecha_aprobacion := COALESCE(NEW.fecha_aprobacion, now());
  END IF;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_oc_aprobaciones_row ON public.oc_aprobaciones;
CREATE TRIGGER trg_normalize_oc_aprobaciones_row
BEFORE INSERT OR UPDATE ON public.oc_aprobaciones
FOR EACH ROW EXECUTE FUNCTION app.normalize_oc_aprobaciones_row();

-- ----------------------------------------------------------------------------
-- devoluciones_proveedor: shape runtime real del módulo devoluciones
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.devoluciones_proveedor
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS emitido_por uuid,
  ADD COLUMN IF NOT EXISTS emitido_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE IF EXISTS public.devoluciones_proveedor
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero::text, '')), ''),
  ALTER COLUMN recepcion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(recepcion_id::text, '')),
  ALTER COLUMN orden_id TYPE uuid USING app.to_uuid_or_null(COALESCE(orden_id::text, '')),
  ALTER COLUMN proveedor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(proveedor_id::text, '')),
  ALTER COLUMN created_by TYPE uuid USING app.to_uuid_or_null(COALESCE(created_by::text, '')),
  ALTER COLUMN emitido_por TYPE uuid USING app.to_uuid_or_null(COALESCE(emitido_por::text, '')),
  ALTER COLUMN updated_by TYPE uuid USING app.to_uuid_or_null(COALESCE(updated_by::text, '')),
  ALTER COLUMN fecha_devolucion TYPE date USING CASE
    WHEN fecha_devolucion IS NULL OR btrim(fecha_devolucion::text) = '' THEN NULL
    ELSE fecha_devolucion::date
  END,
  ALTER COLUMN emitido_at TYPE timestamptz USING CASE
    WHEN emitido_at IS NULL OR btrim(emitido_at::text) = '' THEN NULL
    ELSE emitido_at::timestamptz
  END,
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'PENDIENTE')),
  ALTER COLUMN motivo TYPE text USING NULLIF(btrim(COALESCE(motivo, '')), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN moneda TYPE text USING upper(COALESCE(NULLIF(btrim(moneda::text), ''), 'PEN')),
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN igv SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN moneda SET DEFAULT 'PEN';

UPDATE public.devoluciones_proveedor
SET
  numero = COALESCE(
    NULLIF(btrim(COALESCE(numero, '')), ''),
    NULLIF(btrim(COALESCE(codigo, '')), ''),
    'DEV-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' || right(replace(id::text, '-', ''), 6)
  ),
  fecha_devolucion = COALESCE(fecha_devolucion, COALESCE(created_at, now())::date),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')) IN ('ACTIVO', 'BORRADOR') THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')) IN ('PENDIENTE', 'EMITIDA', 'ANULADA', 'RECHAZADA') THEN upper(estado)
    ELSE 'PENDIENTE'
  END,
  subtotal = COALESCE(subtotal, 0),
  igv = COALESCE(igv, 0),
  total = COALESCE(NULLIF(total, 0), COALESCE(subtotal, 0) + COALESCE(igv, 0)),
  moneda = COALESCE(NULLIF(upper(btrim(moneda)), ''), 'PEN')
WHERE id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_devoluciones_proveedor_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.orden_id := app.to_uuid_or_null(COALESCE(NEW.orden_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.recepcion_id := app.to_uuid_or_null(COALESCE(NEW.recepcion_id::text, ''));
  NEW.created_by := app.to_uuid_or_null(COALESCE(NEW.created_by::text, ''));
  NEW.emitido_por := app.to_uuid_or_null(COALESCE(NEW.emitido_por::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, ''));

  NEW.numero := COALESCE(
    NULLIF(btrim(COALESCE(NEW.numero, '')), ''),
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'DEV-' || to_char(now(), 'YYYY') || '-' || right(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 6)
  );
  NEW.fecha_devolucion := COALESCE(NEW.fecha_devolucion, COALESCE(NEW.created_at, now())::date);

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF v_estado IN ('ACTIVO', 'BORRADOR') THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado NOT IN ('PENDIENTE', 'EMITIDA', 'ANULADA', 'RECHAZADA') THEN v_estado := 'PENDIENTE'; END IF;
  NEW.estado := v_estado;

  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  NEW.igv := GREATEST(COALESCE(NEW.igv, 0), 0);
  NEW.total := GREATEST(COALESCE(NEW.total, NEW.subtotal + NEW.igv, 0), 0);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.motivo := NULLIF(btrim(COALESCE(NEW.motivo, '')), '');
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  IF NEW.estado = 'EMITIDA' THEN
    NEW.emitido_at := COALESCE(NEW.emitido_at, now());
  END IF;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_devoluciones_proveedor_row ON public.devoluciones_proveedor;
CREATE TRIGGER trg_normalize_devoluciones_proveedor_row
BEFORE INSERT OR UPDATE ON public.devoluciones_proveedor
FOR EACH ROW EXECUTE FUNCTION app.normalize_devoluciones_proveedor_row();

-- ----------------------------------------------------------------------------
-- devolucion_items: shape runtime real
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.devolucion_items
  ADD COLUMN IF NOT EXISTS devolucion_id uuid,
  ADD COLUMN IF NOT EXISTS recepcion_item_id uuid,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS almacen_id uuid,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS motivo_detalle text;

ALTER TABLE IF EXISTS public.devolucion_items
  ALTER COLUMN devolucion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(devolucion_id::text, '')),
  ALTER COLUMN recepcion_item_id TYPE uuid USING app.to_uuid_or_null(COALESCE(recepcion_item_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN almacen_id TYPE uuid USING app.to_uuid_or_null(COALESCE(almacen_id::text, '')),
  ALTER COLUMN cantidad TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad::text),
  ALTER COLUMN precio_unitario TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_unitario::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN lote TYPE text USING NULLIF(btrim(COALESCE(lote, '')), ''),
  ALTER COLUMN serie TYPE text USING NULLIF(btrim(COALESCE(serie, '')), ''),
  ALTER COLUMN motivo_detalle TYPE text USING NULLIF(btrim(COALESCE(motivo_detalle, '')), ''),
  ALTER COLUMN cantidad SET DEFAULT 0,
  ALTER COLUMN precio_unitario SET DEFAULT 0,
  ALTER COLUMN subtotal SET DEFAULT 0;

UPDATE public.devolucion_items
SET subtotal = COALESCE(NULLIF(subtotal, 0), COALESCE(cantidad, 0) * COALESCE(precio_unitario, 0))
WHERE id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_devolucion_items_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.devolucion_id := app.to_uuid_or_null(COALESCE(NEW.devolucion_id::text, ''));
  NEW.recepcion_item_id := app.to_uuid_or_null(COALESCE(NEW.recepcion_item_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));

  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.lote := NULLIF(btrim(COALESCE(NEW.lote, '')), '');
  NEW.serie := NULLIF(btrim(COALESCE(NEW.serie, '')), '');
  NEW.motivo_detalle := NULLIF(btrim(COALESCE(NEW.motivo_detalle, '')), '');

  NEW.cantidad := GREATEST(COALESCE(NEW.cantidad, 0), 0);
  NEW.precio_unitario := GREATEST(COALESCE(NEW.precio_unitario, 0), 0);
  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, NEW.cantidad * NEW.precio_unitario, 0), 0);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_devolucion_items_row ON public.devolucion_items;
CREATE TRIGGER trg_normalize_devolucion_items_row
BEFORE INSERT OR UPDATE ON public.devolucion_items
FOR EACH ROW EXECUTE FUNCTION app.normalize_devolucion_items_row();

-- ----------------------------------------------------------------------------
-- Índices runtime para patrones de consulta reales.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cotizaciones_compra_tenant_estado_fecha_runtime
ON public.cotizaciones_compra (tenant_id, estado, fecha_cotizacion DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_compra_tenant_proveedor_fecha_runtime
ON public.cotizaciones_compra (tenant_id, proveedor_id, fecha_cotizacion DESC)
WHERE tenant_id IS NOT NULL AND proveedor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cotizacion_compra_detalles_tenant_cotizacion_runtime
ON public.cotizacion_compra_detalles (tenant_id, cotizacion_id)
WHERE tenant_id IS NOT NULL AND cotizacion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oc_aprobaciones_orden_nivel_estado_runtime
ON public.oc_aprobaciones (orden_id, nivel, estado)
WHERE orden_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oc_aprobaciones_tenant_aprobador_estado_runtime
ON public.oc_aprobaciones (tenant_id, aprobador_id, estado)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_tenant_estado_fecha_runtime
ON public.devoluciones_proveedor (tenant_id, estado, fecha_devolucion DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_devolucion_items_tenant_devolucion_runtime
ON public.devolucion_items (tenant_id, devolucion_id)
WHERE tenant_id IS NOT NULL AND devolucion_id IS NOT NULL;

COMMIT;
