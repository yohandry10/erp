-- Migration: Fix vista_pos_productos infinite recursion
-- La vista actual se referencia a sí misma causando recursión infinita
-- Recreamos la vista para que lea de la tabla productos

-- Primero eliminamos la vista corrupta
DROP VIEW IF EXISTS public.vista_pos_productos CASCADE;

-- Recreamos la vista correctamente leyendo de la tabla productos
CREATE OR REPLACE VIEW public.vista_pos_productos AS
SELECT 
    p.id,
    p.tenant_id,
    p.codigo,
    p.codigo_barras,
    p.nombre,
    p.descripcion,
    COALESCE(p.categoria, 'Sin categoría') AS categoria,
    NULL::varchar AS subcategoria,
    NULL::varchar AS marca,
    COALESCE(p.precio_venta, p.precio, 0) AS precio_venta,
    COALESCE(p.precio_mayorista, p.precio_venta, p.precio, 0) AS precio_mayorista,
    COALESCE(p.precio_especial, p.precio_venta, p.precio, 0) AS precio_especial,
    COALESCE(p.stock, 0)::numeric AS stock_actual,
    COALESCE(p.stock_minimo, 0)::numeric AS stock_minimo,
    COALESCE(p.stock_reservado, 0)::numeric AS stock_reservado,
    GREATEST(COALESCE(p.stock, 0) - COALESCE(p.stock_reservado, 0), 0)::numeric AS stock_disponible,
    COALESCE(p.impuesto, 18)::numeric AS impuesto,
    COALESCE(p.precio_compra, 0) AS precio_compra,
    p.imagen_url,
    COALESCE(p.activo, true) AS activo,
    COALESCE(p.es_servicio, false) AS es_servicio,
    COALESCE(p.controla_stock, true) AS controla_stock,
    COALESCE(p.afectacion_igv, '10') AS afectacion_igv,
    COALESCE(p.tipo_operacion, '0101') AS tipo_operacion,
    p.clasificador_sunat,
    COALESCE(p.favorito, false) AS favorito,
    p.created_at,
    p.created_at AS updated_at
FROM productos p
WHERE p.activo = true
  OR p.activo IS NULL;

-- Agregar comentario
COMMENT ON VIEW public.vista_pos_productos IS 'Vista de productos/servicios para POS con precios y stock. Filtra solo productos activos.';

-- Habilitar RLS en la vista (si es necesario)
-- Las vistas heredan RLS de las tablas subyacentes

-- Crear índices en la tabla productos para optimizar la vista
CREATE INDEX IF NOT EXISTS idx_productos_activo_tenant 
    ON productos(tenant_id, activo);
CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras 
    ON productos(codigo_barras) WHERE codigo_barras IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_productos_nombre_search 
    ON productos USING gin(to_tsvector('spanish', nombre));
