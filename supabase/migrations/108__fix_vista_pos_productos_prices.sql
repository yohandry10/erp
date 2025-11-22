-- Reconstruye vista_pos_productos
DROP VIEW IF EXISTS vista_pos_productos;
CREATE OR REPLACE VIEW vista_pos_productos AS
SELECT
  p.id,
  p.tenant_id,
  COALESCE(p.codigo, '')::varchar         AS codigo,
  COALESCE(p.codigo_barras, '')::varchar  AS codigo_barras,
  COALESCE(p.nombre, '')::varchar         AS nombre,
  COALESCE(p.descripcion, '')::text       AS descripcion,
  COALESCE(p.categoria, '')::varchar      AS categoria,
  ''::varchar                             AS subcategoria,
  ''::varchar                             AS marca,
  COALESCE(p.precio_venta, p.precio, 0)::numeric(18,2) AS precio_venta,
  COALESCE(p.precio_mayorista, 0)::numeric(18,2)       AS precio_mayorista,
  COALESCE(p.precio_especial, 0)::numeric(18,2)        AS precio_especial,
  COALESCE(p.stock, 0)::numeric(18,2)                  AS stock_actual,
  COALESCE(p.stock_minimo, 0)::numeric(18,2)           AS stock_minimo,
  COALESCE(p.stock_reservado, 0)::numeric(18,2)        AS stock_reservado,
  COALESCE(p.stock, 0)::numeric(18,2) - COALESCE(p.stock_reservado, 0)::numeric(18,2) AS stock_disponible,
  COALESCE(p.impuesto, 0)::numeric(18,6)               AS impuesto,
  COALESCE(p.precio_compra, 0)::numeric(18,6)          AS precio_compra,
  COALESCE(p.imagen_url, '')::text                     AS imagen_url,
  COALESCE(p.activo, true)                             AS activo,
  p.created_at,
  p.created_at AS updated_at
FROM productos p
WHERE COALESCE(p.activo, true) = true;
COMMENT ON VIEW vista_pos_productos IS 'Vista de productos para POS con precios reales (precio_venta) y stock disponible.';
