-- =====================================================
-- Script: Verificar y crear tenant del super-admin
-- Ejecutar en: Supabase SQL Editor
-- =====================================================

-- 1. Verificar si existe el tenant del super-admin
SELECT 
  id, 
  nombre, 
  ruc, 
  email, 
  estado, 
  pais,
  created_at
FROM empresa_config 
WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- 2. Si no existe, crearlo (ejecutar solo si el SELECT anterior no devuelve resultados)
INSERT INTO empresa_config (
  id, 
  nombre, 
  ruc, 
  email, 
  pais, 
  moneda, 
  estado, 
  plan, 
  fecha_inicio, 
  created_at, 
  updated_at,
  razon_social,
  nombre_comercial
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Sistema Central',
  '00000000000',
  'admin@sistema.com',
  'PE',
  'PEN',
  'ACTIVO',
  'ENTERPRISE',
  NOW(),
  NOW(),
  NOW(),
  'Sistema Central ERP',
  'Sistema Central'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Verificar que se creó correctamente
SELECT 
  id, 
  nombre, 
  ruc, 
  email, 
  estado, 
  pais,
  plan,
  created_at
FROM empresa_config 
WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- 4. Verificar que el usuario super-admin existe y está asociado a este tenant
SELECT 
  id,
  email,
  nombre,
  apellido,
  tenant_id,
  is_super_admin,
  estado
FROM usuarios_sistema
WHERE email = 'superadmin@neon.com';

-- 5. Si el tenant_id del super-admin no coincide, actualizarlo
UPDATE usuarios_sistema
SET tenant_id = '550e8400-e29b-41d4-a716-446655440000'
WHERE email = 'superadmin@neon.com' 
  AND tenant_id != '550e8400-e29b-41d4-a716-446655440000';

-- 6. Verificación final
SELECT 
  u.email,
  u.nombre,
  u.is_super_admin,
  u.tenant_id,
  e.nombre as tenant_nombre,
  e.estado as tenant_estado
FROM usuarios_sistema u
LEFT JOIN empresa_config e ON u.tenant_id = e.id
WHERE u.email = 'superadmin@neon.com';
