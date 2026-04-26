-- ============================================================================
-- 031__inventario_pos_schema_alignment.sql
-- Alinea columnas base para inventario/POS y compatibilidad operativa.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Productos: columnas esperadas por POS/web
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.productos
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS subcategoria text,
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS codigo_barras text,
  ADD COLUMN IF NOT EXISTS precio_mayorista numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_especial numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impuesto numeric(8,4) DEFAULT 0.18,
  ADD COLUMN IF NOT EXISTS imagen_url text,
  ADD COLUMN IF NOT EXISTS es_servicio boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS controla_stock boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS afectacion_igv text,
  ADD COLUMN IF NOT EXISTS tipo_operacion text,
  ADD COLUMN IF NOT EXISTS clasificador_sunat text,
  ADD COLUMN IF NOT EXISTS favorito boolean DEFAULT false;

ALTER TABLE IF EXISTS public.productos
  ALTER COLUMN precio_unitario TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_unitario::text),
  ALTER COLUMN precio_mayorista TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_mayorista::text),
  ALTER COLUMN precio_especial TYPE numeric(14,2) USING app.to_numeric_or_zero(precio_especial::text),
  ALTER COLUMN impuesto TYPE numeric(8,4) USING app.to_numeric_or_zero(impuesto::text),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN es_servicio SET DEFAULT false,
  ALTER COLUMN controla_stock SET DEFAULT true,
  ALTER COLUMN favorito SET DEFAULT false;

UPDATE public.productos
SET
  activo = COALESCE(activo, true),
  es_servicio = COALESCE(es_servicio, false),
  controla_stock = COALESCE(controla_stock, NOT COALESCE(es_servicio, false)),
  favorito = COALESCE(favorito, false),
  impuesto = COALESCE(impuesto, 0.18),
  precio_mayorista = COALESCE(precio_mayorista, precio_venta, precio, precio_unitario, 0),
  precio_especial = COALESCE(precio_especial, precio_venta, precio, precio_unitario, 0)
WHERE
  activo IS NULL
  OR es_servicio IS NULL
  OR controla_stock IS NULL
  OR favorito IS NULL
  OR impuesto IS NULL
  OR precio_mayorista IS NULL
  OR precio_especial IS NULL;

-- ----------------------------------------------------------------------------
-- Proveedores: aliases de documento usados por backend
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.proveedores
  ADD COLUMN IF NOT EXISTS documento_tipo text,
  ADD COLUMN IF NOT EXISTS documento_numero text;

UPDATE public.proveedores
SET
  documento_numero = COALESCE(
    NULLIF(btrim(documento_numero), ''),
    NULLIF(btrim(ruc), ''),
    CASE WHEN numero_documento IS NOT NULL THEN numero_documento::text ELSE NULL END
  ),
  documento_tipo = COALESCE(
    NULLIF(btrim(documento_tipo), ''),
    CASE
      WHEN COALESCE(
        NULLIF(btrim(documento_numero), ''),
        NULLIF(btrim(ruc), ''),
        CASE WHEN numero_documento IS NOT NULL THEN numero_documento::text ELSE '' END
      ) ~ '^[0-9]{11}$' THEN 'RUC'
      WHEN COALESCE(
        NULLIF(btrim(documento_numero), ''),
        NULLIF(btrim(ruc), ''),
        CASE WHEN numero_documento IS NOT NULL THEN numero_documento::text ELSE '' END
      ) ~ '^[0-9]{8}$' THEN 'DNI'
      ELSE 'OTROS'
    END
  )
WHERE
  documento_numero IS NULL
  OR btrim(documento_numero) = ''
  OR documento_tipo IS NULL
  OR btrim(documento_tipo) = '';

-- ----------------------------------------------------------------------------
-- Recepciones / ítems: columnas esperadas por inventario
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.recepciones
  ADD COLUMN IF NOT EXISTS gre_proveedor text;

ALTER TABLE IF EXISTS public.recepcion_items
  ADD COLUMN IF NOT EXISTS ubicacion_id uuid,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS fecha_expiracion date,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN';

ALTER TABLE IF EXISTS public.recepcion_items
  ALTER COLUMN cantidad_recibida TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_recibida::text),
  ALTER COLUMN moneda SET DEFAULT 'PEN';

ALTER TABLE IF EXISTS public.almacen_ubicaciones
  ADD COLUMN IF NOT EXISTS descripcion text;

SELECT app.add_fk_if_possible('recepcion_items', 'almacen_id', 'almacenes', 'id', 'fk_recepcion_items_almacen_id_v2');
SELECT app.add_fk_if_possible('recepcion_items', 'ubicacion_id', 'almacen_ubicaciones', 'id', 'fk_recepcion_items_ubicacion_id_v2');
SELECT app.add_fk_if_possible('recepcion_items', 'detalle_id', 'orden_compra_detalles', 'id', 'fk_recepcion_items_detalle_id_v2');

-- ----------------------------------------------------------------------------
-- Índices de soporte para consultas runtime
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF app.column_exists('productos', 'tenant_id')
     AND app.column_exists('productos', 'activo')
     AND app.column_exists('productos', 'nombre') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_productos_tenant_activo_nombre_pos ON public.productos (tenant_id, activo, nombre)';
  END IF;

  IF app.column_exists('proveedores', 'tenant_id')
     AND app.column_exists('proveedores', 'documento_numero') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_proveedores_tenant_documento_numero ON public.proveedores (tenant_id, documento_numero)';
  END IF;

  IF app.column_exists('recepciones', 'tenant_id')
     AND app.column_exists('recepciones', 'fecha_recepcion') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recepciones_tenant_fecha_recepcion ON public.recepciones (tenant_id, fecha_recepcion DESC)';
  END IF;

  IF app.column_exists('recepciones', 'tenant_id')
     AND app.column_exists('recepciones', 'estado') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recepciones_tenant_estado ON public.recepciones (tenant_id, estado)';
  END IF;

  IF app.column_exists('recepcion_items', 'tenant_id')
     AND app.column_exists('recepcion_items', 'recepcion_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recepcion_items_tenant_recepcion ON public.recepcion_items (tenant_id, recepcion_id)';
  END IF;

  IF app.column_exists('recepcion_items', 'tenant_id')
     AND app.column_exists('recepcion_items', 'producto_id')
     AND app.column_exists('recepcion_items', 'almacen_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recepcion_items_tenant_producto_almacen ON public.recepcion_items (tenant_id, producto_id, almacen_id)';
  END IF;
END
$$;

COMMIT;
