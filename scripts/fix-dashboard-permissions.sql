-- Script para asignar permisos de dashboard al rol ADMIN
-- Ejecutar este script en Supabase SQL Editor

-- 1. Verificar si existen los permisos de dashboard
INSERT INTO permissions (modulo, accion, recurso, descripcion)
VALUES 
  ('dashboard', 'read', 'stats', 'Ver estadísticas del dashboard'),
  ('dashboard', 'read', 'activities', 'Ver actividades recientes del dashboard')
ON CONFLICT (modulo, accion, recurso) DO NOTHING;

-- 2. Asignar permisos al rol ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id as role_id,
  p.id as permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.nombre = 'ADMIN'
  AND p.modulo = 'dashboard'
  AND p.accion = 'read'
  AND p.recurso IN ('stats', 'activities')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Verificar que se asignaron correctamente
SELECT 
  r.nombre as rol,
  p.modulo,
  p.accion,
  p.recurso,
  p.descripcion
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.nombre = 'ADMIN'
  AND p.modulo = 'dashboard'
ORDER BY p.modulo, p.recurso, p.accion;
