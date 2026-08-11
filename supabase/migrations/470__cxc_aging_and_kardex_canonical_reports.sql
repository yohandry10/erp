-- ============================================================================
-- 470__cxc_aging_and_kardex_canonical_reports.sql
--
-- Reportes financieros/operativos sin sumas nominales entre monedas:
-- - aging CxC al corte local del tenant, sin perder saldos por fecha "desde";
-- - kardex único sobre movimientos_inventario, con signo físico explícito;
-- - costo, moneda y tipo de cambio congelados por movimiento. Si falta una
--   pieza de la valuación, el reporte la marca pendiente en vez de inventarla.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('public.cuentas_por_cobrar') IS NULL
     OR to_regclass('public.cxc_pagos') IS NULL
     OR to_regclass('public.movimientos_inventario') IS NULL
     OR to_regclass('public.saldos_favor_clientes') IS NULL
     OR to_regclass('public.saldos_favor_movimientos') IS NULL
     OR to_regclass('public.productos') IS NULL
     OR to_regclass('public.almacenes') IS NULL
     OR to_regclass('public.empresa_config') IS NULL
     OR to_regprocedure('app.hoy_tenant(uuid)') IS NULL THEN
    RAISE EXCEPTION '470 requiere CxC, ledger de inventario, configuración y fecha local del tenant';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Snapshot durable de valorización del movimiento.
-- ---------------------------------------------------------------------------
ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS kardex_moneda text,
  ADD COLUMN IF NOT EXISTS kardex_moneda_base text,
  ADD COLUMN IF NOT EXISTS kardex_tipo_cambio numeric(18,6),
  ADD COLUMN IF NOT EXISTS kardex_costo_unitario numeric(18,6),
  ADD COLUMN IF NOT EXISTS kardex_valor_total numeric(18,2),
  ADD COLUMN IF NOT EXISTS kardex_valuacion_estado text;

-- Permite reejecutar esta migración en una base efímera conservando exactamente
-- la versión vigente de sus propias invariantes.
ALTER TABLE public.movimientos_inventario
  DROP CONSTRAINT IF EXISTS ck_mov_inv_kardex_currency_470,
  DROP CONSTRAINT IF EXISTS ck_mov_inv_kardex_rate_470,
  DROP CONSTRAINT IF EXISTS ck_mov_inv_kardex_cost_470,
  DROP CONSTRAINT IF EXISTS ck_mov_inv_kardex_state_470,
  DROP CONSTRAINT IF EXISTS ck_mov_inv_kardex_payload_470;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos_inventario'::regclass
      AND conname = 'ck_mov_inv_kardex_currency_470'
  ) THEN
    ALTER TABLE public.movimientos_inventario
      ADD CONSTRAINT ck_mov_inv_kardex_currency_470
      CHECK (
        (kardex_moneda IS NULL OR kardex_moneda ~ '^[A-Z]{3}$')
        AND (kardex_moneda_base IS NULL OR kardex_moneda_base ~ '^[A-Z]{3}$')
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos_inventario'::regclass
      AND conname = 'ck_mov_inv_kardex_rate_470'
  ) THEN
    ALTER TABLE public.movimientos_inventario
      ADD CONSTRAINT ck_mov_inv_kardex_rate_470
      CHECK (kardex_tipo_cambio IS NULL OR kardex_tipo_cambio > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos_inventario'::regclass
      AND conname = 'ck_mov_inv_kardex_cost_470'
  ) THEN
    ALTER TABLE public.movimientos_inventario
      ADD CONSTRAINT ck_mov_inv_kardex_cost_470
      CHECK (
        (kardex_costo_unitario IS NULL AND kardex_valor_total IS NULL)
        OR (
          kardex_costo_unitario IS NOT NULL AND kardex_valor_total IS NOT NULL
          AND kardex_costo_unitario >= 0 AND kardex_valor_total >= 0
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos_inventario'::regclass
      AND conname = 'ck_mov_inv_kardex_state_470'
  ) THEN
    ALTER TABLE public.movimientos_inventario
      ADD CONSTRAINT ck_mov_inv_kardex_state_470
      CHECK (
        kardex_valuacion_estado IS NULL OR kardex_valuacion_estado IN (
          'CONFIRMADA', 'PENDIENTE_COSTO', 'PENDIENTE_MONEDA',
          'PENDIENTE_MONEDA_BASE', 'PENDIENTE_TIPO_CAMBIO'
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos_inventario'::regclass
      AND conname = 'ck_mov_inv_kardex_payload_470'
  ) THEN
    ALTER TABLE public.movimientos_inventario
      ADD CONSTRAINT ck_mov_inv_kardex_payload_470
      CHECK (
        kardex_valuacion_estado IS NULL
        OR (
          kardex_valuacion_estado = 'CONFIRMADA'
          AND kardex_moneda IS NOT NULL AND kardex_moneda_base IS NOT NULL
          AND kardex_tipo_cambio IS NOT NULL
          AND kardex_costo_unitario IS NOT NULL AND kardex_valor_total IS NOT NULL
        )
        OR (
          kardex_valuacion_estado = 'PENDIENTE_COSTO'
          AND kardex_costo_unitario IS NULL AND kardex_valor_total IS NULL
        )
        OR (
          kardex_valuacion_estado = 'PENDIENTE_MONEDA'
          AND kardex_moneda IS NULL
          AND kardex_costo_unitario IS NOT NULL AND kardex_valor_total IS NOT NULL
        )
        OR (
          kardex_valuacion_estado = 'PENDIENTE_MONEDA_BASE'
          AND kardex_moneda_base IS NULL
          AND kardex_costo_unitario IS NOT NULL AND kardex_valor_total IS NOT NULL
        )
        OR (
          kardex_valuacion_estado = 'PENDIENTE_TIPO_CAMBIO'
          AND kardex_moneda IS NOT NULL AND kardex_moneda_base IS NOT NULL
          AND kardex_tipo_cambio IS NULL
          AND kardex_costo_unitario IS NOT NULL AND kardex_valor_total IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END;
$constraints$;

CREATE OR REPLACE FUNCTION app.freeze_inventory_valuation_470()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_tipo text := upper(coalesce(NULLIF(btrim(NEW.tipo), ''), NULLIF(btrim(NEW.tipo_movimiento), ''), ''));
  v_base_currency text;
  v_currency text;
  v_cost_text text;
  v_rate_text text;
  v_cost numeric;
  v_rate numeric;
  v_receipt_id uuid;
  v_supplier_return_item_id uuid;
BEGIN
  IF v_tipo NOT IN ('ENTRADA', 'SALIDA', 'AJUSTE', 'DEVOLUCION') THEN
    RETURN NEW;
  END IF;

  -- La conciliación de esta migración escribe un snapshot ya calculado. Sin
  -- esta salida, el propio trigger volvería a inferirlo con la configuración
  -- actual del tenant y derrotaría el backfill fail-closed.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.inventory_valuation_repair_470', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Una valuación ya confirmada es evidencia histórica. Una actualización de
  -- notas/stock posterior no puede recalcularla con el catálogo de hoy.
  IF TG_OP = 'UPDATE'
     AND OLD.kardex_valuacion_estado = 'CONFIRMADA'
     AND coalesce(current_setting('app.inventory_valuation_repair_470', true), '') <> 'on' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.producto_id IS DISTINCT FROM OLD.producto_id
       OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.tipo_movimiento IS DISTINCT FROM OLD.tipo_movimiento
       OR NEW.cantidad IS DISTINCT FROM OLD.cantidad
       OR NEW.almacen_id IS DISTINCT FROM OLD.almacen_id
       OR NEW.ubicacion_id IS DISTINCT FROM OLD.ubicacion_id
       OR NEW.lote IS DISTINCT FROM OLD.lote
       OR NEW.fecha_expiracion IS DISTINCT FROM OLD.fecha_expiracion
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.referencia_tipo IS DISTINCT FROM OLD.referencia_tipo
       OR NEW.referencia_id IS DISTINCT FROM OLD.referencia_id
       OR NEW.metadata->>'business_movement_type'
          IS DISTINCT FROM OLD.metadata->>'business_movement_type'
       OR NEW.metadata->>'sentido' IS DISTINCT FROM OLD.metadata->>'sentido'
       OR NEW.metadata->>'direccion' IS DISTINCT FROM OLD.metadata->>'direccion'
       OR NEW.metadata->>'delta' IS DISTINCT FROM OLD.metadata->>'delta'
       OR NEW.metadata->>'costo_unitario' IS DISTINCT FROM OLD.metadata->>'costo_unitario'
       OR NEW.metadata->>'costo_cero_confirmado'
          IS DISTINCT FROM OLD.metadata->>'costo_cero_confirmado'
       OR NEW.metadata->>'moneda_valorizacion'
          IS DISTINCT FROM OLD.metadata->>'moneda_valorizacion'
       OR NEW.metadata->>'moneda' IS DISTINCT FROM OLD.metadata->>'moneda'
       OR NEW.metadata->>'moneda_base_valorizacion'
          IS DISTINCT FROM OLD.metadata->>'moneda_base_valorizacion'
       OR NEW.metadata->>'moneda_base' IS DISTINCT FROM OLD.metadata->>'moneda_base'
       OR NEW.metadata->>'moneda_local' IS DISTINCT FROM OLD.metadata->>'moneda_local'
       OR NEW.metadata->>'tipo_cambio_valorizacion'
          IS DISTINCT FROM OLD.metadata->>'tipo_cambio_valorizacion'
       OR NEW.metadata->>'tipo_cambio' IS DISTINCT FROM OLD.metadata->>'tipo_cambio'
       OR NEW.metadata->>'tipo_cambio_origen'
          IS DISTINCT FROM OLD.metadata->>'tipo_cambio_origen'
       OR NEW.metadata->>'metodo_costeo' IS DISTINCT FROM OLD.metadata->>'metodo_costeo'
       OR NEW.metadata->>'recepcion_id' IS DISTINCT FROM OLD.metadata->>'recepcion_id'
       OR NEW.metadata->>'recepcion_item_id'
          IS DISTINCT FROM OLD.metadata->>'recepcion_item_id' THEN
      RAISE EXCEPTION 'KARDEX_CONFIRMED_MOVEMENT_IMMUTABLE:%', OLD.id
        USING ERRCODE = '23514';
    END IF;
    NEW.kardex_moneda := OLD.kardex_moneda;
    NEW.kardex_moneda_base := OLD.kardex_moneda_base;
    NEW.kardex_tipo_cambio := OLD.kardex_tipo_cambio;
    NEW.kardex_costo_unitario := OLD.kardex_costo_unitario;
    NEW.kardex_valor_total := OLD.kardex_valor_total;
    NEW.kardex_valuacion_estado := OLD.kardex_valuacion_estado;
    RETURN NEW;
  END IF;

  SELECT upper(NULLIF(btrim(ec.moneda_defecto), ''))
    INTO v_base_currency
  FROM public.empresa_config ec
  WHERE ec.tenant_id = NEW.tenant_id
  LIMIT 1;
  IF v_base_currency !~ '^[A-Z]{3}$' THEN
    v_base_currency := NULL;
  END IF;

  v_currency := upper(coalesce(
    NULLIF(btrim(NEW.metadata->>'moneda_valorizacion'), ''),
    NULLIF(btrim(NEW.metadata->>'moneda'), '')
  ));

  IF v_currency IS NULL THEN
    v_receipt_id := app.to_uuid_or_null(coalesce(NEW.metadata->>'recepcion_id', ''));
    IF v_receipt_id IS NULL AND upper(coalesce(NEW.referencia_tipo, '')) = 'RECEPCION' THEN
      v_receipt_id := NEW.referencia_id;
    END IF;
    IF v_receipt_id IS NOT NULL THEN
      SELECT upper(NULLIF(btrim(oc.moneda), ''))
        INTO v_currency
      FROM public.recepciones r
      JOIN public.ordenes_compra oc
        ON oc.id = r.orden_id AND oc.tenant_id = r.tenant_id
      WHERE r.id = v_receipt_id AND r.tenant_id = NEW.tenant_id
      LIMIT 1;
    END IF;
  END IF;
  IF v_currency IS NULL
     AND upper(coalesce(NEW.referencia_tipo, '')) = 'DEVOLUCION_PROVEEDOR_ITEM' THEN
    v_supplier_return_item_id := NEW.referencia_id;
    IF v_supplier_return_item_id IS NOT NULL THEN
      SELECT upper(NULLIF(btrim(dp.moneda), ''))
        INTO v_currency
      FROM public.devolucion_items di
      JOIN public.devoluciones_proveedor dp
        ON dp.id = di.devolucion_id AND dp.tenant_id = di.tenant_id
      WHERE di.id = v_supplier_return_item_id
        AND di.tenant_id = NEW.tenant_id
      LIMIT 1;
    END IF;
  END IF;
  v_currency := coalesce(v_currency, v_base_currency);
  IF v_currency !~ '^[A-Z]{3}$' THEN
    v_currency := NULL;
  END IF;

  v_cost_text := NULLIF(btrim(NEW.metadata->>'costo_unitario'), '');
  IF v_cost_text ~ '^[+]?[0-9]+([.][0-9]+)?$' THEN
    v_cost := v_cost_text::numeric;
  END IF;
  -- Cero sólo es un costo confirmado cuando el writer lo declara de forma
  -- explícita. Los writers legacy rellenaban 0 cuando el catálogo no tenía
  -- costo; convertir ese fallback en inventario valorizado sería inventarlo.
  IF v_cost = 0
     AND lower(coalesce(NEW.metadata->>'costo_cero_confirmado', 'false')) <> 'true' THEN
    v_cost := NULL;
  END IF;

  v_rate_text := coalesce(
    NULLIF(btrim(NEW.metadata->>'tipo_cambio_valorizacion'), ''),
    NULLIF(btrim(NEW.metadata->>'tipo_cambio'), ''),
    NULLIF(btrim(NEW.metadata->>'tipo_cambio_origen'), '')
  );
  IF v_currency = v_base_currency THEN
    v_rate := 1;
  ELSIF v_rate_text ~ '^[+]?[0-9]+([.][0-9]+)?$' AND v_rate_text::numeric > 0 THEN
    v_rate := v_rate_text::numeric;
  END IF;

  NEW.kardex_moneda := v_currency;
  NEW.kardex_moneda_base := v_base_currency;
  NEW.kardex_tipo_cambio := v_rate;
  NEW.kardex_costo_unitario := v_cost;
  NEW.kardex_valor_total := CASE
    WHEN v_cost IS NULL THEN NULL
    ELSE round(abs(coalesce(NEW.cantidad, 0)) * v_cost, 2)
  END;
  NEW.kardex_valuacion_estado := CASE
    WHEN v_cost IS NULL THEN 'PENDIENTE_COSTO'
    WHEN v_currency IS NULL THEN 'PENDIENTE_MONEDA'
    WHEN v_base_currency IS NULL THEN 'PENDIENTE_MONEDA_BASE'
    WHEN v_currency <> v_base_currency AND v_rate IS NULL THEN 'PENDIENTE_TIPO_CAMBIO'
    ELSE 'CONFIRMADA'
  END;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_freeze_inventory_valuation_470
  ON public.movimientos_inventario;
CREATE TRIGGER trg_freeze_inventory_valuation_470
BEFORE INSERT OR UPDATE OF
  tenant_id, producto_id, almacen_id, tipo, tipo_movimiento, cantidad,
  ubicacion_id, lote, fecha_expiracion, created_at,
  referencia_tipo, referencia_id, metadata,
  kardex_moneda, kardex_moneda_base, kardex_tipo_cambio,
  kardex_costo_unitario, kardex_valor_total, kardex_valuacion_estado
ON public.movimientos_inventario
FOR EACH ROW
EXECUTE FUNCTION app.freeze_inventory_valuation_470();

-- Backfill trazable: sólo completa filas aún no clasificadas y sólo usa el
-- costo/monedas persistidos en la evidencia histórica. No toma la moneda base
-- actual del tenant para relabelar movimientos antiguos; si el writer no dejó
-- snapshot suficiente, el movimiento queda pendiente para conciliación.
SELECT set_config('app.inventory_valuation_repair_470', 'on', true);
WITH candidates AS (
  SELECT
    mi.id,
    CASE WHEN upper(coalesce(
        NULLIF(btrim(mi.metadata->>'moneda_base_valorizacion'), ''),
        NULLIF(btrim(mi.metadata->>'moneda_base'), ''),
        NULLIF(btrim(mi.metadata->>'moneda_local'), '')
      )) ~ '^[A-Z]{3}$'
      THEN upper(coalesce(
        NULLIF(btrim(mi.metadata->>'moneda_base_valorizacion'), ''),
        NULLIF(btrim(mi.metadata->>'moneda_base'), ''),
        NULLIF(btrim(mi.metadata->>'moneda_local'), '')
      )) ELSE NULL END AS base_currency,
    upper(coalesce(
      NULLIF(btrim(mi.metadata->>'moneda_valorizacion'), ''),
      NULLIF(btrim(mi.metadata->>'moneda'), ''),
      NULLIF(btrim(oc.moneda), ''),
      NULLIF(btrim(dp.moneda), ''),
      NULLIF(btrim(mi.metadata->>'moneda_base_valorizacion'), ''),
      NULLIF(btrim(mi.metadata->>'moneda_base'), ''),
      NULLIF(btrim(mi.metadata->>'moneda_local'), '')
    )) AS currency,
    NULLIF(btrim(mi.metadata->>'costo_unitario'), '') AS cost_text,
    lower(coalesce(mi.metadata->>'costo_cero_confirmado', 'false')) = 'true'
      AS zero_cost_confirmed,
    coalesce(
      NULLIF(btrim(mi.metadata->>'tipo_cambio_valorizacion'), ''),
      NULLIF(btrim(mi.metadata->>'tipo_cambio'), ''),
      NULLIF(btrim(mi.metadata->>'tipo_cambio_origen'), '')
    ) AS rate_text,
    abs(coalesce(mi.cantidad, 0)) AS quantity
  FROM public.movimientos_inventario mi
  LEFT JOIN public.recepciones r
    ON r.tenant_id = mi.tenant_id
   AND r.id = coalesce(
     app.to_uuid_or_null(coalesce(mi.metadata->>'recepcion_id', '')),
     CASE WHEN upper(coalesce(mi.referencia_tipo, '')) = 'RECEPCION'
       THEN mi.referencia_id ELSE NULL END
   )
  LEFT JOIN public.ordenes_compra oc
    ON oc.id = r.orden_id AND oc.tenant_id = r.tenant_id
  LEFT JOIN public.devolucion_items di
    ON di.id = mi.referencia_id AND di.tenant_id = mi.tenant_id
   AND upper(coalesce(mi.referencia_tipo, '')) = 'DEVOLUCION_PROVEEDOR_ITEM'
  LEFT JOIN public.devoluciones_proveedor dp
    ON dp.id = di.devolucion_id AND dp.tenant_id = di.tenant_id
  WHERE mi.kardex_valuacion_estado IS NULL
    AND upper(coalesce(
      NULLIF(btrim(mi.tipo), ''), NULLIF(btrim(mi.tipo_movimiento), ''), ''
    )) IN (
    'ENTRADA', 'SALIDA', 'AJUSTE', 'DEVOLUCION'
  )
), normalized AS (
  SELECT
    c.*,
    CASE WHEN c.cost_text ~ '^[+]?[0-9]+([.][0-9]+)?$'
                   AND (c.cost_text::numeric > 0 OR c.zero_cost_confirmed)
      THEN c.cost_text::numeric ELSE NULL END AS cost,
    CASE
      WHEN c.currency = c.base_currency THEN 1::numeric
      WHEN c.rate_text ~ '^[+]?[0-9]+([.][0-9]+)?$'
           AND c.rate_text::numeric > 0 THEN c.rate_text::numeric
      ELSE NULL
    END AS rate
  FROM candidates c
)
UPDATE public.movimientos_inventario mi
SET kardex_moneda = CASE WHEN n.currency ~ '^[A-Z]{3}$' THEN n.currency ELSE NULL END,
    kardex_moneda_base = n.base_currency,
    kardex_tipo_cambio = n.rate,
    kardex_costo_unitario = n.cost,
    kardex_valor_total = CASE WHEN n.cost IS NULL THEN NULL
      ELSE round(n.quantity * n.cost, 2) END,
    kardex_valuacion_estado = CASE
      WHEN n.cost IS NULL THEN 'PENDIENTE_COSTO'
      WHEN n.currency IS NULL OR n.currency !~ '^[A-Z]{3}$' THEN 'PENDIENTE_MONEDA'
      WHEN n.base_currency IS NULL THEN 'PENDIENTE_MONEDA_BASE'
      WHEN n.currency <> n.base_currency AND n.rate IS NULL
        THEN 'PENDIENTE_TIPO_CAMBIO'
      ELSE 'CONFIRMADA'
    END
FROM normalized n
WHERE mi.id = n.id;

ALTER TABLE public.movimientos_inventario
  VALIDATE CONSTRAINT ck_mov_inv_kardex_currency_470;
ALTER TABLE public.movimientos_inventario
  VALIDATE CONSTRAINT ck_mov_inv_kardex_rate_470;
ALTER TABLE public.movimientos_inventario
  VALIDATE CONSTRAINT ck_mov_inv_kardex_cost_470;
ALTER TABLE public.movimientos_inventario
  VALIDATE CONSTRAINT ck_mov_inv_kardex_state_470;
ALTER TABLE public.movimientos_inventario
  VALIDATE CONSTRAINT ck_mov_inv_kardex_payload_470;

-- ---------------------------------------------------------------------------
-- 2. Proyección única del kardex. Conserva las primeras columnas históricas de
--    la vista para no romper consumidores, y añade semántica firmada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_kardex_valorizado
WITH (security_invoker = true) AS
WITH source AS (
  SELECT
    mov.*,
    upper(coalesce(
      NULLIF(btrim(mov.tipo), ''), NULLIF(btrim(mov.tipo_movimiento), ''), ''
    )) AS raw_type
  FROM public.movimientos_inventario mov
  WHERE upper(coalesce(
    NULLIF(btrim(mov.tipo), ''), NULLIF(btrim(mov.tipo_movimiento), ''), ''
  )) IN ('ENTRADA', 'SALIDA', 'AJUSTE', 'DEVOLUCION')
), raw AS (
  SELECT
    source.*,
    CASE
      WHEN upper(coalesce(source.metadata->>'business_movement_type', '')) = 'AJUSTE'
        OR source.raw_type = 'AJUSTE' THEN 'AJUSTE'
      WHEN source.raw_type = 'DEVOLUCION'
        OR upper(coalesce(source.referencia_tipo, '')) LIKE '%DEVOLUCION%'
        OR upper(coalesce(source.referencia_tipo, '')) LIKE 'RMA_%'
        OR upper(coalesce(source.metadata->>'business_movement_type', '')) LIKE 'RMA_RETURN%'
        THEN 'DEVOLUCION'
      ELSE source.raw_type
    END AS business_type,
    CASE
      WHEN source.raw_type = 'ENTRADA' THEN 1
      WHEN source.raw_type = 'SALIDA' THEN -1
      WHEN source.raw_type = 'DEVOLUCION'
           AND upper(coalesce(source.metadata->>'sentido', source.metadata->>'direccion', ''))
              IN ('ENTRADA', 'IN') THEN 1
      WHEN source.raw_type = 'DEVOLUCION'
           AND upper(coalesce(source.metadata->>'sentido', source.metadata->>'direccion', ''))
              IN ('SALIDA', 'OUT') THEN -1
      WHEN source.raw_type = 'DEVOLUCION'
           AND upper(coalesce(source.referencia_tipo, '')) LIKE 'RMA_%' THEN 1
      WHEN source.raw_type = 'DEVOLUCION'
           AND upper(coalesce(source.referencia_tipo, '')) LIKE '%PROVEEDOR%' THEN -1
      WHEN source.raw_type = 'AJUSTE'
           AND NULLIF(btrim(source.metadata->>'delta'), '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
        THEN sign((source.metadata->>'delta')::numeric)::integer
      WHEN source.raw_type = 'AJUSTE'
           AND coalesce(source.cantidad, 0) < 0 THEN -1
      ELSE NULL
    END AS direction
  FROM source
), enriched AS (
  SELECT
    raw.*,
    CASE
      WHEN raw.direction IS NULL THEN NULL
      WHEN raw.raw_type = 'AJUSTE'
           AND NULLIF(btrim(raw.metadata->>'delta'), '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
        THEN (raw.metadata->>'delta')::numeric
      ELSE raw.direction * abs(coalesce(raw.cantidad, 0))
    END::numeric AS signed_quantity,
    CASE WHEN raw.direction = 1 THEN 'ENTRADA'
      WHEN raw.direction = -1 THEN 'SALIDA'
      ELSE 'PENDIENTE' END AS direction_name
  FROM raw
), refs AS (
  SELECT
    e.*,
    CASE WHEN upper(coalesce(e.referencia_tipo, '')) = 'RECEPCION'
      THEN coalesce(app.to_uuid_or_null(e.metadata->>'recepcion_id'), e.referencia_id)
      ELSE app.to_uuid_or_null(e.metadata->>'recepcion_id') END AS reception_id
  FROM enriched e
)
SELECT
  coalesce(app.to_uuid_or_null(refs.metadata->>'recepcion_item_id'), refs.id)
    AS recepcion_item_id,
  refs.reception_id AS recepcion_id,
  refs.tenant_id,
  coalesce(NULLIF(btrim(rec.numero), ''), NULLIF(btrim(rec.codigo), ''),
    NULLIF(btrim(refs.referencia_tipo), ''), 'MOVIMIENTO') AS recepcion_numero,
  refs.created_at AS fecha_recepcion,
  coalesce(NULLIF(btrim(rec.estado::text), ''), NULLIF(btrim(refs.estado), ''), 'REGISTRADO')
    AS recepcion_estado,
  refs.producto_id,
  coalesce(NULLIF(btrim(prod.codigo), ''), NULLIF(btrim(prod.sku), ''), refs.producto_id::text)
    AS producto_codigo,
  coalesce(NULLIF(btrim(prod.nombre), ''), 'Producto') AS producto_nombre,
  NULLIF(btrim(prod.sku), '') AS producto_sku,
  abs(coalesce(refs.cantidad, 0))::numeric(14,2) AS cantidad_recibida,
  refs.kardex_costo_unitario::numeric(14,2) AS costo_unitario,
  refs.kardex_valor_total::numeric(14,2) AS valor_total,
  refs.almacen_id,
  alm.nombre AS almacen_nombre,
  refs.ubicacion_id,
  ubi.codigo AS ubicacion_codigo,
  refs.lote,
  NULL::text AS serie,
  refs.fecha_expiracion::date AS fecha_expiracion,
  refs.kardex_moneda AS moneda_detalle,
  refs.id AS movimiento_id,
  refs.business_type AS tipo,
  refs.direction_name AS sentido,
  abs(coalesce(refs.cantidad, 0))::numeric(14,2) AS cantidad_movimiento,
  refs.signed_quantity::numeric(14,2) AS cantidad_firmada,
  CASE WHEN refs.direction IS NULL OR refs.kardex_valor_total IS NULL THEN NULL
    ELSE refs.direction * refs.kardex_valor_total END::numeric(18,2) AS valor_firmado,
  refs.kardex_tipo_cambio AS tipo_cambio,
  CASE WHEN refs.kardex_valuacion_estado = 'CONFIRMADA'
    THEN round(refs.kardex_valor_total * refs.kardex_tipo_cambio, 2)
    ELSE NULL END::numeric(18,2) AS valor_total_base,
  CASE WHEN refs.direction IS NOT NULL AND refs.kardex_valuacion_estado = 'CONFIRMADA'
    THEN round(refs.direction * refs.kardex_valor_total * refs.kardex_tipo_cambio, 2)
    ELSE NULL END::numeric(18,2) AS valor_firmado_base,
  refs.kardex_valuacion_estado AS valuacion_estado,
  NULLIF(btrim(refs.metadata->>'metodo_costeo'), '') AS metodo_costeo,
  refs.kardex_moneda_base AS moneda_base,
  refs.referencia_tipo,
  refs.referencia_id,
  coalesce(NULLIF(btrim(refs.notas), ''), NULLIF(btrim(refs.motivo), '')) AS notas,
  refs.created_at
FROM refs
LEFT JOIN public.recepciones rec
  ON rec.id = refs.reception_id AND rec.tenant_id = refs.tenant_id
LEFT JOIN public.productos prod
  ON prod.id = refs.producto_id AND prod.tenant_id = refs.tenant_id
LEFT JOIN public.almacenes alm
  ON alm.id = refs.almacen_id AND alm.tenant_id = refs.tenant_id
LEFT JOIN public.almacen_ubicaciones ubi
  ON ubi.id = refs.ubicacion_id AND ubi.tenant_id = refs.tenant_id;

REVOKE ALL ON TABLE public.vw_kardex_valorizado FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_kardex_valorizado TO service_role;

CREATE OR REPLACE FUNCTION public.reporte_kardex_valorizado_470(
  p_tenant_id uuid,
  p_producto_id uuid DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_limit integer DEFAULT 250
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 500));
  v_tenant_base_currency text;
  v_timezone text;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'KARDEX_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_desde IS NOT NULL AND p_hasta IS NOT NULL AND p_desde > p_hasta THEN
    RAISE EXCEPTION 'KARDEX_DATE_RANGE_INVALID' USING ERRCODE = '22007';
  END IF;

  SELECT upper(NULLIF(btrim(ec.moneda_defecto), '')),
         app.zona_horaria_pais(t.pais)
    INTO v_tenant_base_currency, v_timezone
  FROM public.tenants t
  LEFT JOIN public.empresa_config ec ON ec.tenant_id = t.id
  WHERE t.id = p_tenant_id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KARDEX_TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT k.*
    FROM public.vw_kardex_valorizado k
    WHERE k.tenant_id = p_tenant_id
      AND (p_producto_id IS NULL OR k.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR k.almacen_id = p_almacen_id)
      AND (p_desde IS NULL OR (k.fecha_recepcion AT TIME ZONE v_timezone)::date >= p_desde)
      AND (p_hasta IS NULL OR (k.fecha_recepcion AT TIME ZONE v_timezone)::date <= p_hasta)
  ), details AS (
    SELECT * FROM filtered
    ORDER BY fecha_recepcion DESC, movimiento_id DESC
    LIMIT v_limit
  ), currency_totals AS (
    SELECT moneda_detalle AS moneda, round(sum(valor_firmado), 2) AS total
    FROM filtered
    WHERE moneda_detalle IS NOT NULL AND valor_firmado IS NOT NULL
    GROUP BY moneda_detalle
  ), base_currency_totals AS (
    SELECT moneda_base AS moneda, round(sum(valor_firmado_base), 2) AS total
    FROM filtered
    WHERE moneda_base IS NOT NULL AND valor_firmado_base IS NOT NULL
    GROUP BY moneda_base
  ), detail_json AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', movimiento_id,
      'tipo', tipo,
      'sentido', sentido,
      'fecha', fecha_recepcion,
      'documento', recepcion_numero,
      'estado', recepcion_estado,
      'cantidad', cantidad_movimiento,
      'cantidadFirmada', cantidad_firmada,
      'costoUnitario', costo_unitario,
      'valorTotal', valor_total,
      'valorFirmado', valor_firmado,
      'moneda', moneda_detalle,
      'monedaBase', moneda_base,
      'tipoCambio', tipo_cambio,
      'valorTotalBase', valor_total_base,
      'valorFirmadoBase', valor_firmado_base,
      'valuacionEstado', valuacion_estado,
      'metodoCosteo', metodo_costeo,
      'producto', jsonb_build_object('id', producto_id, 'nombre', producto_nombre,
        'codigo', producto_codigo, 'sku', producto_sku),
      'almacen', CASE WHEN almacen_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', almacen_id, 'nombre', almacen_nombre) END,
      'ubicacion', CASE WHEN ubicacion_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ubicacion_id, 'codigo', ubicacion_codigo) END,
      'lote', lote, 'serie', serie, 'fechaExpiracion', fecha_expiracion,
      'recepcionId', recepcion_id, 'referenciaTipo', referencia_tipo,
      'referenciaId', referencia_id, 'motivo', notas
    ) ORDER BY fecha_recepcion DESC, movimiento_id DESC), '[]'::jsonb) AS data
    FROM details
  )
  SELECT jsonb_build_object(
    'success', true,
    'data', (SELECT data FROM detail_json),
    'resumen', jsonb_build_object(
      'totalMovimientos', count(*),
      'totalEntradas', round(coalesce(sum(greatest(cantidad_firmada, 0)), 0), 2),
      'totalSalidas', round(coalesce(sum(abs(least(cantidad_firmada, 0))), 0), 2),
      'totalAjustes', round(coalesce(sum(cantidad_firmada) FILTER (WHERE tipo = 'AJUSTE'), 0), 2),
      'totalDevoluciones', round(coalesce(sum(cantidad_firmada) FILTER (WHERE tipo = 'DEVOLUCION'), 0), 2),
      'saldoCantidad', CASE WHEN count(*) FILTER (WHERE cantidad_firmada IS NULL) > 0 THEN NULL
        ELSE round(coalesce(sum(cantidad_firmada), 0), 2) END,
      'valorEntradasBase', CASE
        WHEN count(*) > 0 AND count(DISTINCT moneda_base) <> 1 THEN NULL
        WHEN count(*) FILTER (
          WHERE cantidad_firmada > 0 AND valor_firmado_base IS NULL) > 0 THEN NULL
        ELSE round(coalesce(sum(greatest(valor_firmado_base, 0)), 0), 2) END,
      'valorSalidasBase', CASE
        WHEN count(*) > 0 AND count(DISTINCT moneda_base) <> 1 THEN NULL
        WHEN count(*) FILTER (
          WHERE cantidad_firmada < 0 AND valor_firmado_base IS NULL) > 0 THEN NULL
        ELSE round(coalesce(sum(abs(least(valor_firmado_base, 0))), 0), 2) END,
      'saldoValorizadoBase', CASE
        WHEN count(*) > 0 AND count(DISTINCT moneda_base) <> 1 THEN NULL
        WHEN count(*) FILTER (
          WHERE cantidad_firmada IS NULL OR valor_firmado_base IS NULL) > 0 THEN NULL
        ELSE round(coalesce(sum(valor_firmado_base), 0), 2) END,
      'monedaBase', CASE WHEN count(*) = 0 THEN v_tenant_base_currency
        WHEN count(DISTINCT moneda_base) = 1 THEN max(moneda_base) ELSE NULL END,
      'pendientesValorizacion', count(*) FILTER (
        WHERE valuacion_estado IS DISTINCT FROM 'CONFIRMADA'),
      'pendientesSentido', count(*) FILTER (WHERE cantidad_firmada IS NULL),
      'multiplesMonedasBase', count(DISTINCT moneda_base) > 1,
      'resumenConfiable', count(*) FILTER (
        WHERE valuacion_estado IS DISTINCT FROM 'CONFIRMADA' OR cantidad_firmada IS NULL) = 0
        AND (count(*) = 0 OR count(DISTINCT moneda_base) = 1),
      'valorPorMoneda', coalesce((SELECT jsonb_object_agg(moneda, total ORDER BY moneda)
        FROM currency_totals), '{}'::jsonb),
      'valorBasePorMoneda', coalesce((SELECT jsonb_object_agg(moneda, total ORDER BY moneda)
        FROM base_currency_totals), '{}'::jsonb),
      'limiteDetalle', v_limit
    )
  ) INTO v_result
  FROM filtered;

  RETURN coalesce(v_result, jsonb_build_object('success', true, 'data', '[]'::jsonb,
    'resumen', jsonb_build_object('totalMovimientos', 0,
      'monedaBase', v_tenant_base_currency)));
END;
$fn$;

REVOKE ALL ON FUNCTION public.reporte_kardex_valorizado_470(
  uuid, uuid, uuid, date, date, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_kardex_valorizado_470(
  uuid, uuid, uuid, date, date, integer
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Aging CxC al corte. El corte por defecto siempre es la fecha local del
--    tenant. Para un corte pasado se reconstruye desde monto_original y el
--    ledger cxc_pagos; un tipo desconocido deja el saldo pendiente de revisión.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reporte_cxc_aging_470(
  p_tenant_id uuid,
  p_fecha_corte date DEFAULT NULL,
  p_cliente_filtro text DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_hoy date;
  v_corte date;
  v_tenant_found uuid;
  v_base_currency text;
  v_timezone text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 1000));
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'CXC_AGING_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  v_hoy := app.hoy_tenant(p_tenant_id);
  v_corte := coalesce(p_fecha_corte, v_hoy);

  SELECT
    t.id,
    upper(NULLIF(btrim(ec.moneda_defecto), '')),
    app.zona_horaria_pais(t.pais)
  INTO v_tenant_found, v_base_currency, v_timezone
  FROM public.tenants t
  LEFT JOIN public.empresa_config ec ON ec.tenant_id = t.id
  WHERE t.id = p_tenant_id
  LIMIT 1;
  IF v_tenant_found IS NULL THEN
    RAISE EXCEPTION 'CXC_AGING_TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_base_currency !~ '^[A-Z]{3}$' THEN
    v_base_currency := NULL;
  END IF;

  WITH payment_raw AS (
    SELECT
      cp.cuenta_id,
      upper(coalesce(NULLIF(btrim(cp.tipo), ''), 'PAGO')) AS tipo,
      upper(NULLIF(btrim(cp.moneda), '')) AS moneda,
      coalesce(cp.monto, 0)::numeric AS monto,
      coalesce(cp.activo, lower(coalesce(cp.estado, 'activo')) NOT IN (
        'inactivo', 'revertido', 'anulado'
      )) AS activo_actual,
      app.to_timestamptz_or_null(coalesce(cp.metadata->>'revertido_en', ''))
        AS revertido_en
    FROM public.cxc_pagos cp
    WHERE cp.tenant_id = p_tenant_id
      AND cp.fecha_pago <= v_corte
  ), payment_effective AS (
    SELECT
      pr.*,
      CASE
        WHEN pr.activo_actual THEN true
        WHEN pr.revertido_en IS NOT NULL
          THEN (pr.revertido_en AT TIME ZONE v_timezone)::date > v_corte
        ELSE false
      END AS vigente_al_corte,
      pr.activo_actual OR pr.revertido_en IS NOT NULL AS estado_temporal_conocido
    FROM payment_raw pr
  ), payment_totals AS (
    SELECT
      cuenta_id,
      bool_and(
        estado_temporal_conocido
        AND (
          NOT vigente_al_corte
          OR (
            tipo IN ('PAGO', 'RETENCION', 'DETRACCION', 'ANTICIPO',
              'NOTA_CREDITO', 'PERCEPCION')
            AND monto > 0 AND moneda ~ '^[A-Z]{3}$'
          )
        )
      ) AS ledger_confiable,
      min(moneda) FILTER (WHERE vigente_al_corte) AS moneda_min,
      max(moneda) FILTER (WHERE vigente_al_corte) AS moneda_max,
      coalesce(sum(monto) FILTER (WHERE vigente_al_corte AND tipo = 'PERCEPCION'), 0) AS aumentos,
      coalesce(sum(monto) FILTER (WHERE vigente_al_corte AND tipo IN (
        'PAGO', 'RETENCION', 'DETRACCION', 'ANTICIPO', 'NOTA_CREDITO'
      )), 0) AS reducciones
    FROM payment_effective
    GROUP BY cuenta_id
  ), credit_application_totals AS (
    SELECT sfm.cxc_id AS cuenta_id, sum(sfm.monto)::numeric AS reducciones,
      min(sfc.moneda) AS moneda_min, max(sfc.moneda) AS moneda_max
    FROM public.saldos_favor_movimientos sfm
    JOIN public.saldos_favor_clientes sfc
      ON sfc.id = sfm.saldo_favor_id AND sfc.tenant_id = sfm.tenant_id
    WHERE sfm.tenant_id = p_tenant_id
      AND sfm.tipo = 'APLICACION_CXC'
      AND sfm.cxc_id IS NOT NULL
      AND (sfm.created_at AT TIME ZONE v_timezone)::date <= v_corte
    GROUP BY sfm.cxc_id
  ), cartera_source AS MATERIALIZED (
    SELECT
      c.id,
      c.cliente_id,
      coalesce(NULLIF(btrim(cl.razon_social), ''), NULLIF(btrim(cl.nombre_comercial), ''),
        'Cliente sin razón social') AS cliente,
      coalesce(NULLIF(btrim(cl.codigo::text), ''), NULLIF(btrim(cl.documento_numero::text), '')) AS cliente_documento,
      coalesce(NULLIF(btrim(c.serie), ''), '') AS serie,
      coalesce(NULLIF(btrim(c.numero::text), ''), NULLIF(btrim(c.numero_documento), ''), c.id::text) AS numero,
      c.fecha_emision,
      c.fecha_vencimiento,
      upper(c.estado::text) AS estado_actual,
      upper(NULLIF(btrim(c.moneda), '')) AS moneda,
      coalesce(NULLIF(c.tipo_cambio_origen, 0), CASE
        WHEN upper(NULLIF(btrim(d.moneda), '')) = upper(NULLIF(btrim(c.moneda), ''))
          THEN NULLIF(d.tipo_cambio, 0) ELSE NULL END)
        AS tipo_cambio_origen,
      coalesce(NULLIF(c.monto_original, 0),
        NULLIF(coalesce(c.monto_total, c.total, 0) - coalesce(c.percepcion_total, 0), 0),
        coalesce(c.monto_total, c.total, 0))::numeric AS monto_referencia,
      CASE
        WHEN v_corte >= v_hoy THEN coalesce(c.monto_pendiente, c.saldo_pendiente, c.saldo, 0)
        WHEN coalesce(pt.ledger_confiable, true)
             AND (pt.moneda_min IS NULL OR (
               pt.moneda_min = upper(NULLIF(btrim(c.moneda), ''))
               AND pt.moneda_max = upper(NULLIF(btrim(c.moneda), ''))
             ))
             AND (cat.moneda_min IS NULL OR (
               cat.moneda_min = upper(NULLIF(btrim(c.moneda), ''))
               AND cat.moneda_max = upper(NULLIF(btrim(c.moneda), ''))
             )) THEN greatest(
          coalesce(NULLIF(c.monto_original, 0),
            NULLIF(coalesce(c.monto_total, c.total, 0) - coalesce(c.percepcion_total, 0), 0),
            coalesce(c.monto_total, c.total, 0))
          + coalesce(pt.aumentos, 0) - coalesce(pt.reducciones, 0)
          - coalesce(cat.reducciones, 0), 0)
        ELSE NULL
      END::numeric AS saldo_origen,
      CASE WHEN v_corte < v_hoy AND (
        coalesce(pt.ledger_confiable, true)
        AND (pt.moneda_min IS NULL OR (
          pt.moneda_min = upper(NULLIF(btrim(c.moneda), ''))
          AND pt.moneda_max = upper(NULLIF(btrim(c.moneda), ''))
        ))
        AND (cat.moneda_min IS NULL OR (
          cat.moneda_min = upper(NULLIF(btrim(c.moneda), ''))
          AND cat.moneda_max = upper(NULLIF(btrim(c.moneda), ''))
        ))
      ) IS NOT TRUE
        THEN 'PENDIENTE_RECONSTRUCCION' ELSE 'RECONSTRUIDA' END AS reconstruccion_estado
    FROM public.cuentas_por_cobrar c
    JOIN public.clientes cl ON cl.id = c.cliente_id AND cl.tenant_id = c.tenant_id
    LEFT JOIN public.documentos d ON d.id = c.documento_id AND d.tenant_id = c.tenant_id
    LEFT JOIN payment_totals pt ON pt.cuenta_id = c.id
    LEFT JOIN credit_application_totals cat ON cat.cuenta_id = c.id
    WHERE c.tenant_id = p_tenant_id
      AND c.fecha_emision <= v_corte
      AND (
        (coalesce(c.activo, true)
          AND lower(c.estado::text) NOT IN ('anulada', 'revertida'))
        OR (
          v_corte < v_hoy
          AND (c.updated_at AT TIME ZONE v_timezone)::date > v_corte
          AND (NOT coalesce(c.activo, true)
            OR lower(c.estado::text) IN ('anulada', 'revertida'))
        )
      )
      AND (
        p_cliente_filtro IS NULL OR btrim(p_cliente_filtro) = ''
        OR cl.razon_social ILIKE '%' || btrim(p_cliente_filtro) || '%'
        OR cl.nombre_comercial ILIKE '%' || btrim(p_cliente_filtro) || '%'
        OR cl.codigo::text ILIKE '%' || btrim(p_cliente_filtro) || '%'
        OR cl.documento_numero::text ILIKE '%' || btrim(p_cliente_filtro) || '%'
      )
  ), cartera AS MATERIALIZED (
    SELECT
      s.*,
      greatest(v_corte - coalesce(s.fecha_vencimiento, s.fecha_emision, v_corte), 0) AS dias_mora,
      CASE WHEN v_corte <= coalesce(s.fecha_vencimiento, s.fecha_emision, v_corte) THEN 'corriente'
        WHEN v_corte - coalesce(s.fecha_vencimiento, s.fecha_emision, v_corte) <= 30 THEN 'b30'
        WHEN v_corte - coalesce(s.fecha_vencimiento, s.fecha_emision, v_corte) <= 60 THEN 'b60'
        WHEN v_corte - coalesce(s.fecha_vencimiento, s.fecha_emision, v_corte) <= 90 THEN 'b90'
        ELSE 'b120' END AS bucket_id,
      CASE
        WHEN s.saldo_origen IS NULL THEN 'PENDIENTE_RECONSTRUCCION'
        WHEN v_corte > coalesce(s.fecha_vencimiento, s.fecha_emision, v_corte) THEN 'VENCIDA'
        WHEN s.saldo_origen < s.monto_referencia - 0.009 THEN 'PARCIAL'
        ELSE 'PENDIENTE'
      END AS estado_al_corte,
      CASE
        WHEN s.reconstruccion_estado = 'PENDIENTE_RECONSTRUCCION' THEN NULL
        WHEN v_base_currency IS NULL THEN NULL
        WHEN s.moneda = v_base_currency THEN 1::numeric
        WHEN s.tipo_cambio_origen > 0 THEN s.tipo_cambio_origen
        ELSE NULL
      END AS tipo_cambio,
      CASE
        WHEN s.reconstruccion_estado = 'PENDIENTE_RECONSTRUCCION' THEN 'PENDIENTE_RECONSTRUCCION'
        WHEN s.moneda IS NULL OR s.moneda !~ '^[A-Z]{3}$' THEN 'PENDIENTE_MONEDA'
        WHEN v_base_currency IS NULL THEN 'PENDIENTE_MONEDA_BASE'
        WHEN s.moneda <> v_base_currency AND coalesce(s.tipo_cambio_origen, 0) <= 0
          THEN 'PENDIENTE_TIPO_CAMBIO'
        ELSE 'CONFIRMADA'
      END AS valuacion_estado
    FROM cartera_source s
    WHERE s.saldo_origen IS NULL OR s.saldo_origen > 0.009
  ), cartera_valued AS MATERIALIZED (
    SELECT c.*,
      CASE WHEN c.tipo_cambio IS NULL OR c.saldo_origen IS NULL THEN NULL
        ELSE round(c.saldo_origen * c.tipo_cambio, 2) END AS saldo_base
    FROM cartera c
  ), bucket_defs(id, nombre, rango, orden) AS (
    VALUES ('corriente','Al día','≤ 0 días',1), ('b30','1 - 30 días','1 a 30 días',2),
      ('b60','31 - 60 días','31 a 60 días',3), ('b90','61 - 90 días','61 a 90 días',4),
      ('b120','Más de 90 días','> 90 días',5)
  ), currency_totals AS (
    SELECT moneda, round(sum(saldo_origen), 2) AS total
    FROM cartera_valued
    WHERE saldo_origen IS NOT NULL AND moneda ~ '^[A-Z]{3}$'
    GROUP BY moneda
  ), bucket_currency AS (
    SELECT bucket_id, moneda, round(sum(saldo_origen), 2) AS total
    FROM cartera_valued
    WHERE saldo_origen IS NOT NULL AND moneda ~ '^[A-Z]{3}$'
    GROUP BY bucket_id, moneda
  ), buckets AS (
    SELECT d.id, d.nombre, d.rango, d.orden,
      count(c.id) AS cuentas,
      round(coalesce(sum(c.saldo_base), 0), 2) AS monto_base,
      count(c.id) FILTER (WHERE c.saldo_base IS NULL) AS sin_valuacion,
      coalesce((SELECT jsonb_object_agg(bc.moneda, bc.total ORDER BY bc.moneda)
        FROM bucket_currency bc WHERE bc.bucket_id = d.id), '{}'::jsonb) AS por_moneda
    FROM bucket_defs d
    LEFT JOIN cartera_valued c ON c.bucket_id = d.id
    GROUP BY d.id, d.nombre, d.rango, d.orden
  ), clients AS (
    SELECT cliente_id, max(cliente) AS cliente, max(cliente_documento) AS cliente_documento,
      round(coalesce(sum(saldo_base), 0), 2) AS monto_base,
      sum(sin_valuacion) AS sin_valuacion,
      coalesce(jsonb_object_agg(moneda, total ORDER BY moneda)
        FILTER (WHERE moneda ~ '^[A-Z]{3}$'), '{}'::jsonb) AS por_moneda
    FROM (
      SELECT cliente_id, max(cliente) AS cliente, max(cliente_documento) AS cliente_documento,
        moneda, sum(saldo_origen) AS total, sum(saldo_base) AS saldo_base,
        count(*) FILTER (WHERE saldo_base IS NULL) AS sin_valuacion
      FROM cartera_valued
      GROUP BY cliente_id, moneda
    ) grouped
    GROUP BY cliente_id
  ), critical AS (
    SELECT * FROM cartera_valued
    WHERE dias_mora > 0
    ORDER BY saldo_base DESC NULLS LAST, saldo_origen DESC NULLS LAST, id
    LIMIT 15
  ), details AS (
    SELECT * FROM cartera_valued
    ORDER BY dias_mora DESC, saldo_base DESC NULLS LAST, id
    LIMIT v_limit
  )
  SELECT jsonb_build_object(
    'fechaCorte', v_corte,
    'monedaBase', v_base_currency,
    'resumen', jsonb_build_object(
      'totalPendienteBase', round(coalesce(sum(saldo_base), 0), 2),
      'totalVencidoBase', round(coalesce(sum(saldo_base) FILTER (WHERE dias_mora > 0), 0), 2),
      'porcentajeVencidoBase', CASE WHEN coalesce(sum(saldo_base), 0) = 0 THEN 0
        ELSE round(100 * coalesce(sum(saldo_base) FILTER (WHERE dias_mora > 0), 0)
          / sum(saldo_base), 2) END,
      'cuentasAnalizadas', count(*),
      'cuentasSinValuacion', count(*) FILTER (WHERE saldo_base IS NULL),
      'cuentasSinReconstruir', count(*) FILTER (WHERE saldo_origen IS NULL),
      'totalPendientePorMoneda', coalesce((SELECT jsonb_object_agg(moneda, total ORDER BY moneda)
        FROM currency_totals), '{}'::jsonb)
    ),
    'buckets', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', b.id, 'nombre', b.nombre, 'rango', b.rango, 'cuentas', b.cuentas,
      'montoBase', b.monto_base, 'sinValuacion', b.sin_valuacion,
      'porMoneda', b.por_moneda,
      'porcentajeBase', CASE WHEN coalesce((SELECT sum(saldo_base) FROM cartera_valued), 0) = 0
        THEN 0 ELSE round(100 * b.monto_base / (SELECT sum(saldo_base) FROM cartera_valued), 2) END
    ) ORDER BY b.orden) FROM buckets b), '[]'::jsonb),
    'saldoPorCliente', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'clienteId', c.cliente_id, 'cliente', c.cliente,
      'clienteDocumento', c.cliente_documento, 'montoBase', c.monto_base,
      'sinValuacion', c.sin_valuacion, 'porMoneda', c.por_moneda
    ) ORDER BY c.monto_base DESC, c.cliente) FROM clients c), '[]'::jsonb),
    'cuentasCriticas', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'clienteId', c.cliente_id, 'cliente', c.cliente,
      'clienteDocumento', c.cliente_documento,
      'documento', concat_ws('-', NULLIF(c.serie, ''), c.numero),
      'fechaEmision', c.fecha_emision, 'fechaVencimiento', c.fecha_vencimiento,
      'diasMora', c.dias_mora, 'estado', c.estado_al_corte,
      'moneda', c.moneda, 'montoOrigen', c.saldo_origen,
      'monedaBase', v_base_currency, 'tipoCambio', c.tipo_cambio,
      'montoBase', c.saldo_base, 'valuacionEstado', c.valuacion_estado
    ) ORDER BY c.saldo_base DESC NULLS LAST, c.saldo_origen DESC NULLS LAST)
      FROM critical c), '[]'::jsonb),
    'detalle', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'clienteId', c.cliente_id, 'cliente', c.cliente,
      'clienteDocumento', c.cliente_documento,
      'documento', concat_ws('-', NULLIF(c.serie, ''), c.numero),
      'fechaEmision', c.fecha_emision, 'fechaVencimiento', c.fecha_vencimiento,
      'diasMora', c.dias_mora, 'estado', c.estado_al_corte,
      'moneda', c.moneda, 'montoOrigen', c.saldo_origen,
      'monedaBase', v_base_currency, 'tipoCambio', c.tipo_cambio,
      'montoBase', c.saldo_base, 'valuacionEstado', c.valuacion_estado
    ) ORDER BY c.dias_mora DESC, c.saldo_base DESC NULLS LAST, c.id)
      FROM details c), '[]'::jsonb)
  ) INTO v_result
  FROM cartera_valued;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.reporte_cxc_aging_470(uuid, date, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_cxc_aging_470(uuid, date, text, integer)
  TO service_role;

-- SECURITY INVOKER exige que el único caller autorizado pueda leer sus
-- relaciones base. No se concede acceso a anon/authenticated ni escritura.
GRANT SELECT ON TABLE
  public.tenants,
  public.empresa_config,
  public.cuentas_por_cobrar,
  public.cxc_pagos,
  public.saldos_favor_clientes,
  public.saldos_favor_movimientos,
  public.clientes,
  public.documentos
TO service_role;

COMMENT ON VIEW public.vw_kardex_valorizado IS
  'Kardex canónico de todos los movimientos físicos, con signo, costo/moneda congelados y valuación fail-closed; security_invoker y service-only.';
COMMENT ON FUNCTION public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer) IS
  'Detalle limitado y resumen completo del kardex, sin truncar agregados ni sumar monedas nominalmente.';
COMMENT ON FUNCTION public.reporte_cxc_aging_470(uuid,date,text,integer) IS
  'Cartera CxC al corte local del tenant, reconstruible por ledger y con totales separados por moneda/base.';

COMMIT;
