-- ============================================================
-- Migration 106: Ajustar productos.stock/stock_reservado a NUMERIC(14,2)
-- Incluye drop/rebuild de vistas dependientes (vista_pos_productos)
-- ============================================================

-- Guardar definición de la vista para recrearla (drop con CASCADE por dependencias previas)
DROP VIEW IF EXISTS vista_pos_productos CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'productos'
      AND column_name = 'stock'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE public.productos
      ALTER COLUMN stock TYPE NUMERIC(14,2)
      USING COALESCE(stock, 0)::NUMERIC(14,2);
    RAISE NOTICE '✅ Columna productos.stock convertida a NUMERIC(14,2)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'productos'
      AND column_name = 'stock_reservado'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE public.productos
      ALTER COLUMN stock_reservado TYPE NUMERIC(14,2)
      USING COALESCE(stock_reservado, 0)::NUMERIC(14,2);
    RAISE NOTICE '✅ Columna productos.stock_reservado convertida a NUMERIC(14,2)';
  END IF;
END $$;

-- Recrear vista_pos_productos (definición mínima con columnas existentes)
CREATE OR REPLACE VIEW vista_pos_productos AS
SELECT
  p.id,
  p.tenant_id,
  p.codigo,
  p.nombre,
  p.descripcion,
  p.categoria,
  p.precio AS precio,
  p.stock AS stock,
  p.impuesto,
  p.activo,
  p.codigo_barras,
  p.created_at,
  p.created_at AS updated_at,
  p.stock_reservado,
  COALESCE(p.stock, 0) - COALESCE(p.stock_reservado, 0) AS stock_disponible,
  p.precio_compra,
  p.imagen_url,
  p.tenant_id AS company_id
FROM productos p;

COMMENT ON VIEW vista_pos_productos IS 'Vista de productos para POS. Usa stock (NUMERIC) y stock_reservado para calcular stock_disponible.';
