-- Seed: Datos iniciales para módulo de ventas
-- Fecha: 2025-01-18
-- Descripción: Inserta datos iniciales necesarios para el funcionamiento del módulo

-- =====================================================
-- PERMISOS DEL MÓDULO DE VENTAS
-- =====================================================

INSERT INTO permisos (codigo, nombre, descripcion, modulo, recurso, accion)
VALUES
  -- Clientes
  ('ventas.clientes.ver', 'Ver clientes', 'Permite ver la lista y detalle de clientes', 'ventas', 'clientes', 'ver'),
  ('ventas.clientes.crear', 'Crear clientes', 'Permite crear nuevos clientes', 'ventas', 'clientes', 'crear'),
  ('ventas.clientes.editar', 'Editar clientes', 'Permite editar clientes existentes', 'ventas', 'clientes', 'editar'),
  ('ventas.clientes.eliminar', 'Eliminar clientes', 'Permite eliminar clientes', 'ventas', 'clientes', 'eliminar'),
  
  -- Cotizaciones
  ('ventas.cotizaciones.ver', 'Ver cotizaciones', 'Permite ver cotizaciones', 'ventas', 'cotizaciones', 'ver'),
  ('ventas.cotizaciones.crear', 'Crear cotizaciones', 'Permite crear cotizaciones', 'ventas', 'cotizaciones', 'crear'),
  ('ventas.cotizaciones.editar', 'Editar cotizaciones', 'Permite editar cotizaciones', 'ventas', 'cotizaciones', 'editar'),
  ('ventas.cotizaciones.eliminar', 'Eliminar cotizaciones', 'Permite eliminar cotizaciones', 'ventas', 'cotizaciones', 'eliminar'),
  ('ventas.cotizaciones.convertir_pedido', 'Convertir a pedido', 'Permite convertir cotizaciones a pedidos', 'ventas', 'cotizaciones', 'convertir_pedido'),
  
  -- Pedidos
  ('ventas.pedidos.ver', 'Ver pedidos', 'Permite ver pedidos de venta', 'ventas', 'pedidos', 'ver'),
  ('ventas.pedidos.crear', 'Crear pedidos', 'Permite crear pedidos de venta', 'ventas', 'pedidos', 'crear'),
  ('ventas.pedidos.editar', 'Editar pedidos', 'Permite editar pedidos de venta', 'ventas', 'pedidos', 'editar'),
  ('ventas.pedidos.confirmar', 'Confirmar pedidos', 'Permite confirmar pedidos (reserva stock)', 'ventas', 'pedidos', 'confirmar'),
  ('ventas.pedidos.cancelar', 'Cancelar pedidos', 'Permite cancelar pedidos', 'ventas', 'pedidos', 'cancelar'),
  ('ventas.pedidos.generar_factura', 'Generar factura', 'Permite generar facturas desde pedidos', 'ventas', 'pedidos', 'generar_factura'),
  
  -- Logística
  ('inventario.logistica.ver', 'Ver logística', 'Permite ver órdenes de logística', 'inventario', 'logistica', 'ver'),
  ('inventario.logistica.preparar', 'Preparar pedidos', 'Permite preparar pedidos en almacén', 'inventario', 'logistica', 'preparar'),
  ('inventario.logistica.despachar', 'Despachar pedidos', 'Permite confirmar despacho de pedidos', 'inventario', 'logistica', 'despachar')
ON CONFLICT (codigo) DO NOTHING;

-- =====================================================
-- ASIGNAR PERMISOS AL ROL ADMIN
-- =====================================================

DO $$
DECLARE
  v_admin_role_id UUID;
  v_permiso_id UUID;
BEGIN
  -- Obtener ID del rol admin
  SELECT id INTO v_admin_role_id FROM roles WHERE nombre = 'admin' LIMIT 1;
  
  IF v_admin_role_id IS NOT NULL THEN
    -- Asignar todos los permisos de ventas al admin
    FOR v_permiso_id IN 
      SELECT id FROM permisos WHERE modulo IN ('ventas', 'inventario') AND codigo LIKE '%ventas%' OR codigo LIKE '%logistica%'
    LOOP
      INSERT INTO rol_permisos (rol_id, permiso_id)
      VALUES (v_admin_role_id, v_permiso_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
    
    RAISE NOTICE 'Permisos de ventas asignados al rol admin';
  END IF;
END $$;

RAISE NOTICE 'Seed de datos iniciales completado';
