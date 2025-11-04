-- 071__inventario_kardex_valorizado.sql
-- Crea una vista centralizada para kardex valorizado basada en recepciones.

BEGIN;

-- Agregar columna precio_compra a productos si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'productos' AND column_name = 'precio_compra'
  ) THEN
    ALTER TABLE productos ADD COLUMN precio_compra NUMERIC(18,6) DEFAULT 0;
    COMMENT ON COLUMN productos.precio_compra IS 'Precio de compra del producto para cálculo de costos de inventario.';
  END IF;
END $$;

CREATE OR REPLACE VIEW vw_kardex_valorizado AS
SELECT 
  ri.id AS recepcion_item_id,
  r.id AS recepcion_id,
  r.tenant_id,
  r.numero AS recepcion_numero,
  r.fecha_recepcion,
  r.estado AS recepcion_estado,
  ri.producto_id,
  prod.codigo AS producto_codigo,
  prod.nombre AS producto_nombre,
  prod.codigo AS producto_sku,
  ri.cantidad_recibida,
  COALESCE(ocd.precio_unitario, prod.precio_compra, 0)::numeric(18,6) AS costo_unitario,
  (COALESCE(ocd.precio_unitario, prod.precio_compra, 0) * ri.cantidad_recibida)::numeric(18,6) AS valor_total,
  ri.almacen_id,
  alm.nombre AS almacen_nombre,
  ri.ubicacion_id,
  ub.codigo AS ubicacion_codigo,
  ri.lote,
  ri.serie,
  ri.fecha_expiracion,
  oc.moneda AS moneda_detalle
FROM recepcion_items ri
JOIN recepciones r ON r.id = ri.recepcion_id
LEFT JOIN orden_compra_detalles ocd ON ocd.id = ri.detalle_id
LEFT JOIN ordenes_compra oc ON oc.id = r.orden_id
LEFT JOIN productos prod ON prod.id = ri.producto_id
LEFT JOIN almacenes alm ON alm.id = ri.almacen_id
LEFT JOIN almacen_ubicaciones ub ON ub.id = ri.ubicacion_id;

COMMENT ON VIEW vw_kardex_valorizado IS 'Vista de movimientos valorizados de inventario derivados de recepciones. Usa el tenant_id de recepciones para mantener RLS.';

COMMIT;
