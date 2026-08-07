-- 370: Atributos dinámicos por categoría y catálogo de categorías de producto
-- Fecha: 2026-08-05
-- Motivo: Permitir campos específicos por tipo de producto (talla/color para ropa,
--         lote/vencimiento para farmacia, marca/modelo/serie para electrónica, etc.)
--         y gestión de categorías personalizables por tenant.

BEGIN;

-- 1. Columna JSONB para atributos dinámicos en productos
ALTER TABLE public.productos
ADD COLUMN IF NOT EXISTS atributos_extra jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.productos.atributos_extra IS
  'Atributos dinámicos según categoría: talla, color, lote, vencimiento, marca, modelo, serie, garantia, etc.';

-- 2. Tabla de categorías de producto por tenant
CREATE TABLE IF NOT EXISTS public.categorias_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  codigo text,
  descripcion text,
  campos_extra jsonb DEFAULT '[]'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, nombre)
);

COMMENT ON TABLE public.categorias_producto IS
  'Catálogo de categorías de producto por tenant con definición de campos dinámicos.';

COMMENT ON COLUMN public.categorias_producto.campos_extra IS
  'Definición de campos adicionales para esta categoría. Array de objetos: [{key, label, tipo, requerido, opciones}]. '
  'Tipos soportados: text, number, date, select.';

-- RLS
ALTER TABLE public.categorias_producto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categorias_producto_tenant_isolation ON public.categorias_producto;
DROP POLICY IF EXISTS categorias_producto_insert ON public.categorias_producto;
DROP POLICY IF EXISTS categorias_producto_update ON public.categorias_producto;
DROP POLICY IF EXISTS categorias_producto_delete ON public.categorias_producto;

CREATE POLICY categorias_producto_tenant_isolation ON public.categorias_producto
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY categorias_producto_insert ON public.categorias_producto
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY categorias_producto_update ON public.categorias_producto
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY categorias_producto_delete ON public.categorias_producto
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Índice para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_categorias_producto_tenant
  ON public.categorias_producto(tenant_id, activo, orden);

-- 3. Seed de categorías predefinidas para tenants existentes
-- Se insertan al ejecutar la migración para los tenants que ya existen.
-- Los nuevos tenants las recibirán vía el seed/demo de alta.
INSERT INTO public.categorias_producto (tenant_id, nombre, codigo, descripcion, campos_extra, orden)
SELECT
  t.id,
  cat.nombre,
  cat.codigo,
  cat.descripcion,
  cat.campos_extra::jsonb,
  cat.orden
FROM public.tenants t
CROSS JOIN (VALUES
  ('ELECTRONICA', 'ELEC', 'Productos electrónicos y tecnología',
   '[{"key":"marca","label":"Marca","tipo":"text","requerido":false},{"key":"modelo","label":"Modelo","tipo":"text","requerido":false},{"key":"numero_serie","label":"Número de serie","tipo":"text","requerido":false},{"key":"garantia_meses","label":"Garantía (meses)","tipo":"number","requerido":false}]',
   1),
  ('ROPA', 'ROPA', 'Ropa, calzado y textiles',
   '[{"key":"talla","label":"Talla","tipo":"select","requerido":false,"opciones":["XS","S","M","L","XL","XXL"]},{"key":"color","label":"Color","tipo":"text","requerido":false},{"key":"material","label":"Material","tipo":"text","requerido":false},{"key":"genero","label":"Género","tipo":"select","requerido":false,"opciones":["Hombre","Mujer","Unisex","Niño","Niña"]}]',
   2),
  ('FARMACIA', 'FARM', 'Productos farmacéuticos y de salud',
   '[{"key":"lote","label":"Lote","tipo":"text","requerido":true},{"key":"fecha_vencimiento","label":"Fecha de vencimiento","tipo":"date","requerido":true},{"key":"registro_sanitario","label":"Registro sanitario","tipo":"text","requerido":false},{"key":"principio_activo","label":"Principio activo","tipo":"text","requerido":false}]',
   3),
  ('ALIMENTOS', 'ALIM', 'Alimentos y bebidas',
   '[{"key":"lote","label":"Lote","tipo":"text","requerido":false},{"key":"fecha_vencimiento","label":"Fecha de vencimiento","tipo":"date","requerido":false},{"key":"registro_sanitario","label":"Registro sanitario","tipo":"text","requerido":false}]',
   4),
  ('HOGAR', 'HOGR', 'Productos para el hogar',
   '[{"key":"marca","label":"Marca","tipo":"text","requerido":false},{"key":"modelo","label":"Modelo","tipo":"text","requerido":false},{"key":"dimensiones","label":"Dimensiones","tipo":"text","requerido":false},{"key":"material","label":"Material","tipo":"text","requerido":false}]',
   5),
  ('OFICINA', 'OFIC', 'Material de oficina y papelería',
   '[{"key":"marca","label":"Marca","tipo":"text","requerido":false},{"key":"modelo","label":"Modelo","tipo":"text","requerido":false}]',
   6),
  ('OTROS', 'OTRO', 'Otros productos', '[]', 7)
) AS cat(nombre, codigo, descripcion, campos_extra, orden)
ON CONFLICT (tenant_id, nombre) DO NOTHING;

COMMIT;
