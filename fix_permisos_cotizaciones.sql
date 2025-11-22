-- Agregar permisos faltantes para eliminar cotizaciones
-- Ejecutar en Supabase SQL Editor

BEGIN;

-- Establecer contexto de tenant
SELECT set_config('app.current_tenant_id', '2635846d-237d-4323-a0e6-59daeb39ac3a', false);

-- Insertar permiso de eliminar cotizaciones
INSERT INTO permisos (tenant_id, modulo, accion, recurso, descripcion, activo) 
VALUES 
  ('2635846d-237d-4323-a0e6-59daeb39ac3a', 'ventas', 'delete', 'cotizaciones', 'Eliminar cotizaciones', true)
ON CONFLICT DO NOTHING;

-- Asignar el permiso al rol ADMIN
INSERT INTO rol_permisos (role_id, permiso_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.tenant_id = '2635846d-237d-4323-a0e6-59daeb39ac3a'
  AND r.nombre = 'ADMIN'
  AND p.tenant_id = '2635846d-237d-4323-a0e6-59daeb39ac3a'
  AND p.modulo = 'ventas'
  AND p.accion = 'delete'
  AND p.recurso = 'cotizaciones'
ON CONFLICT DO NOTHING;

COMMIT;

-- Verificar
SELECT 
  p.modulo,
  p.accion,
  p.recurso,
  p.descripcion
FROM permisos p
WHERE p.tenant_id = '2635846d-237d-4323-a0e6-59daeb39ac3a'
  AND p.recurso = 'cotizaciones'
ORDER BY p.accion;
