-- Script para agregar permisos faltantes
-- Ejecutar directamente en Supabase SQL Editor

BEGIN;

-- Establecer contexto de tenant para el trigger de auditoría
SELECT set_config('app.current_tenant_id', '2635846d-237d-4323-a0e6-59daeb39ac3a', false);

-- Insertar permisos para tenant 2635846d-237d-4323-a0e6-59daeb39ac3a
INSERT INTO permisos (tenant_id, modulo, accion, recurso, descripcion, activo) 
VALUES 
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'inventario', 'read', 'stats', 'Ver resumen', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'inventario', 'read', 'almacenes', 'Ver almacenes', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'inventario', 'write', 'almacenes', 'Editar almacenes', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'inventario', 'read', 'ingresos', 'Ver recepciones', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'inventario', 'write', 'ingresos', 'Crear recepciones', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'compras', 'ver', 'ordenes', 'Ver órdenes de compra', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'compras', 'aprobar', 'ordenes', 'Aprobar/rechazar órdenes de compra', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'compras', 'write', 'ordenes', 'Crear/editar órdenes de compra', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'compras', 'ver', 'recepciones', 'Ver recepciones de compra', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'compras', 'write', 'recepciones', 'Crear/cerrar recepciones de compra', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'finanzas', 'ver', 'cxp', 'Ver cuentas por pagar', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'finanzas', 'write', 'cxp', 'Gestionar cuentas por pagar', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'ventas', 'read', 'clientes', 'Ver clientes', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'ventas', 'write', 'clientes', 'Editar clientes', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'ventas', 'read', 'cotizaciones', 'Ver cotizaciones', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'ventas', 'write', 'cotizaciones', 'Editar cotizaciones', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'ventas', 'read', 'pedidos', 'Ver pedidos', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'ventas', 'write', 'pedidos', 'Editar pedidos', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'ventas', 'ver', 'aprobaciones', 'Ver aprobaciones', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'ventas', 'aprobar', 'aprobaciones', 'Aprobar pedidos', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'finanzas', 'ver', 'cxc', 'Ver CxC', true),
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'finanzas', 'write', 'cxc', 'Gestionar CxC', true)
ON CONFLICT DO NOTHING;

-- Paso 3: Asignar todos los permisos al rol ADMIN
INSERT INTO rol_permisos (role_id, permiso_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.tenant_id = '2635846d-237d-4323-a0e6-59daeb39ac3a'
  AND r.nombre = 'ADMIN'
  AND p.tenant_id = '2635846d-237d-4323-a0e6-59daeb39ac3a'
ON CONFLICT DO NOTHING;

COMMIT;

-- Verificar
SELECT COUNT(*) as total_permisos 
FROM permisos 
WHERE tenant_id = '2635846d-237d-4323-a0e6-59daeb39ac3a';

SELECT COUNT(*) as permisos_asignados_admin
FROM rol_permisos rp
INNER JOIN roles r ON r.id = rp.role_id
WHERE r.tenant_id = '2635846d-237d-4323-a0e6-59daeb39ac3a'
  AND r.nombre = 'ADMIN';
