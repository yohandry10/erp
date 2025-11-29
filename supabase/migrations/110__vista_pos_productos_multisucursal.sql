-- Rebuild vista_pos_productos para incluir servicios, afectación IGV, precios por sucursal y stock agregado.
-- Nota: si existe precio por sucursal se toma el último actualizado; de lo contrario se usa precio_venta/precio base del producto.

DROP VIEW IF EXISTS vista_pos_productos;

CREATE OR REPLACE VIEW vista_pos_productos AS
SELECT
  p.id,
  p.tenant_id,
  COALESCE(p.codigo, '')::varchar AS codigo,
  COALESCE(p.codigo_barras, '')::varchar AS codigo_barras,
  COALESCE(p.nombre, '')::varchar AS nombre,
  COALESCE(p.descripcion, '')::text AS descripcion,
  COALESCE(p.categoria, '')::varchar AS categoria,
  ''::varchar AS subcategoria,
  ''::varchar AS marca,
  COALESCE(ps.precio, p.precio_venta, p.precio, 0)::numeric(18,2) AS precio_venta,
  COALESCE(p.precio_mayorista, 0)::numeric(18,2) AS precio_mayorista,
  COALESCE(p.precio_especial, 0)::numeric(18,2) AS precio_especial,
  COALESCE(st.stock, p.stock, 0)::numeric(18,2)        AS stock_actual,
  COALESCE(p.stock_minimo, st.minimo, 0)::numeric(18,2)           AS stock_minimo,
  COALESCE(p.stock_reservado, st.reservado, 0)::numeric(18,2)     AS stock_reservado,
  COALESCE(st.stock, p.stock, 0)::numeric(18,2) - COALESCE(st.reservado, p.stock_reservado, 0)::numeric(18,2) AS stock_disponible,
  COALESCE(p.impuesto, p.afectacion_igv::numeric, 0)::numeric(18,6) AS impuesto,
  COALESCE(p.precio_compra, 0)::numeric(18,6)          AS precio_compra,
  COALESCE(p.imagen_url, '')::text                     AS imagen_url,
  COALESCE(p.activo, true)                             AS activo,
  COALESCE(p.es_servicio, false)                       AS es_servicio,
  COALESCE(p.controla_stock, true)                     AS controla_stock,
  COALESCE(p.afectacion_igv, '10')::varchar            AS afectacion_igv,
  COALESCE(p.tipo_operacion, '')::varchar              AS tipo_operacion,
  COALESCE(p.clasificador_sunat, '')::varchar          AS clasificador_sunat,
  COALESCE(p.favorito, false)                          AS favorito,
  p.created_at,
  p.created_at AS updated_at
FROM productos p
LEFT JOIN LATERAL (
  SELECT precio
  FROM producto_precios_sucursal pps
  WHERE pps.producto_id = p.id
  ORDER BY pps.updated_at DESC
  LIMIT 1
) ps ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COALESCE(SUM(stock), 0)      AS stock,
    COALESCE(SUM(reservado), 0)  AS reservado,
    COALESCE(SUM(minimo), 0)     AS minimo
  FROM producto_stock_sucursal pss
  WHERE pss.producto_id = p.id
) st ON TRUE
WHERE COALESCE(p.activo, true) = true;

COMMENT ON VIEW vista_pos_productos IS 'Vista de productos/servicios para POS con precios y stock agregados por sucursal/almacén.';
