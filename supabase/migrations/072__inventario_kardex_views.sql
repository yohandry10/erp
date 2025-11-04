-- 072__inventario_kardex_views.sql
-- Refuerza vistas operativas para Inventario (kardex valorizado y recepciones)

BEGIN;

-- Agregar columna gre_proveedor a recepciones si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recepciones' AND column_name = 'gre_proveedor'
  ) THEN
    ALTER TABLE recepciones ADD COLUMN gre_proveedor VARCHAR(100);
    COMMENT ON COLUMN recepciones.gre_proveedor IS 'Número de guía de remisión del proveedor.';
  END IF;
END $$;

CREATE OR REPLACE VIEW vw_inventario_recepciones AS
SELECT
  r.id AS recepcion_id,
  r.tenant_id,
  r.numero,
  r.fecha_recepcion,
  r.estado,
  r.observaciones,
  r.gre_proveedor,
  r.orden_id,
  oc.numero AS numero_orden,
  r.created_at,
  r.updated_at,
  p.id AS proveedor_id,
  p.razon_social AS proveedor_nombre,
  p.ruc AS proveedor_ruc,
  COUNT(ri.id) AS total_items,
  COALESCE(SUM(ri.cantidad_recibida), 0)::numeric(18,6) AS cantidad_total,
  COALESCE(
    SUM(
      COALESCE(ocd.precio_unitario, prod.precio_compra, 0) * ri.cantidad_recibida
    ),
    0
  )::numeric(18,6) AS valor_total
FROM recepciones r
LEFT JOIN ordenes_compra oc ON oc.id = r.orden_id
LEFT JOIN proveedores p ON p.id = oc.proveedor_id
LEFT JOIN recepcion_items ri ON ri.recepcion_id = r.id
LEFT JOIN orden_compra_detalles ocd ON ocd.id = ri.detalle_id
LEFT JOIN productos prod ON prod.id = ri.producto_id
GROUP BY
  r.id,
  r.tenant_id,
  r.numero,
  r.fecha_recepcion,
  r.estado,
  r.observaciones,
  r.orden_id,
  oc.numero,
  r.created_at,
  r.updated_at,
  p.id,
  p.razon_social,
  p.ruc;

COMMENT ON VIEW vw_inventario_recepciones IS
  'Recepciones de inventario con totales valorizados por tenant. Alimenta los dashboards de logística y CxP.';

CREATE OR REPLACE VIEW vw_inventario_kardex_resumen AS
SELECT
  tenant_id,
  producto_id,
  producto_codigo,
  producto_nombre,
  almacen_id,
  almacen_nombre,
  SUM(cantidad_recibida)::numeric(18,6) AS total_cantidad,
  SUM(valor_total)::numeric(18,6) AS total_valor
FROM vw_kardex_valorizado
GROUP BY
  tenant_id,
  producto_id,
  producto_codigo,
  producto_nombre,
  almacen_id,
  almacen_nombre;

COMMENT ON VIEW vw_inventario_kardex_resumen IS
  'Resumen valorizado por producto y almacén. Base para dashboards y control contable.';

COMMIT;
