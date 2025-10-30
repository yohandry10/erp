-- Script para marcar la configuración como completa y ocultar el banner
-- Ejecutar este script para los tenants que ya completaron la configuración

-- Ver el estado actual de configuracion_completa
SELECT 
  tenant_id,
  razon_social,
  ruc,
  configuracion_completa,
  created_at
FROM empresa_config
WHERE estado = 'ACTIVO'
ORDER BY razon_social;

-- Actualizar configuracion_completa a true para todos los tenants activos
-- (Esto ocultará el banner de configuración)
UPDATE empresa_config
SET configuracion_completa = true
WHERE estado = 'ACTIVO'
  AND configuracion_completa = false;

-- Verificar el cambio
SELECT 
  tenant_id,
  razon_social,
  configuracion_completa,
  'Banner ocultado' as estado_banner
FROM empresa_config
WHERE estado = 'ACTIVO'
ORDER BY razon_social;
