-- ============================================================================
-- 032__views_pos_inventario_runtime_alignment.sql
-- Reemplaza vistas operativas de POS e inventario con shape real de runtime.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Vista POS productos (shape esperado por web + API)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vista_pos_productos AS
WITH base AS (
  SELECT
    p.*,
    COALESCE(p.es_servicio, lower(COALESCE(p.tipo, '')) = 'servicio') AS es_servicio_calc,
    app.to_numeric_or_zero(COALESCE(p.stock_actual, 0)::text)::numeric(14,2) AS stock_actual_num,
    app.to_numeric_or_zero(COALESCE(p.stock_reservado, 0)::text)::numeric(14,2) AS stock_reservado_num,
    app.to_numeric_or_zero(COALESCE(p.stock_minimo, 0)::text)::numeric(14,2) AS stock_minimo_num
  FROM public.productos p
)
SELECT
  b.id,
  b.tenant_id,
  COALESCE(NULLIF(btrim(b.codigo), ''), NULLIF(btrim(b.sku), ''), left(b.id::text, 8)) AS codigo,
  NULLIF(btrim(b.codigo_barras), '') AS codigo_barras,
  COALESCE(NULLIF(btrim(b.nombre), ''), 'Producto') AS nombre,
  NULLIF(btrim(b.descripcion), '') AS descripcion,
  COALESCE(NULLIF(btrim(b.categoria), ''), 'GENERAL') AS categoria,
  NULLIF(btrim(b.subcategoria), '') AS subcategoria,
  NULLIF(btrim(b.marca), '') AS marca,
  ROUND(COALESCE(b.precio_venta, b.precio, b.precio_unitario, 0)::numeric, 2) AS precio_venta,
  ROUND(COALESCE(b.precio_mayorista, b.precio_venta, b.precio, b.precio_unitario, 0)::numeric, 2) AS precio_mayorista,
  ROUND(COALESCE(b.precio_especial, b.precio_venta, b.precio, b.precio_unitario, 0)::numeric, 2) AS precio_especial,
  b.stock_actual_num AS stock_actual,
  b.stock_minimo_num AS stock_minimo,
  b.stock_reservado_num AS stock_reservado,
  CASE
    WHEN b.es_servicio_calc THEN NULL::numeric(14,2)
    ELSE GREATEST(b.stock_actual_num - b.stock_reservado_num, 0)
  END AS stock_disponible,
  ROUND(COALESCE(b.impuesto, 0.18)::numeric, 4) AS impuesto,
  b.imagen_url,
  b.es_servicio_calc AS es_servicio,
  COALESCE(b.controla_stock, NOT b.es_servicio_calc) AS controla_stock,
  COALESCE(NULLIF(btrim(b.afectacion_igv), ''), '10') AS afectacion_igv,
  NULLIF(btrim(b.tipo_operacion), '') AS tipo_operacion,
  NULLIF(btrim(b.clasificador_sunat), '') AS clasificador_sunat,
  COALESCE(b.favorito, false) AS favorito,
  COALESCE(b.activo, true) AS activo
FROM base b;

-- ----------------------------------------------------------------------------
-- Recepciones consolidadas para inventario
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Kardex valorizado por recepciones (shape usado por backend)
-- ----------------------------------------------------------------------------
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

COMMIT;
