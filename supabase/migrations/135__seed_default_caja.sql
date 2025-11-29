-- Migration 135: Crear caja por defecto para cada tenant
-- Asegura que cada tenant tenga al menos una caja para usar el POS

-- Insertar caja por defecto para todos los tenants que no tienen cajas
INSERT INTO cajas (tenant_id, codigo, nombre, ubicacion, estado, monto_inicial, activa, categoria)
SELECT 
  t.id as tenant_id,
  'CAJA-' || SUBSTRING(t.id::text, 1, 8) as codigo,
  'Caja Principal' as nombre,
  'Principal' as ubicacion,
  'ACTIVO' as estado,
  0 as monto_inicial,
  true as activa,
  'TIENDA' as categoria
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM cajas c WHERE c.tenant_id = t.id
);
