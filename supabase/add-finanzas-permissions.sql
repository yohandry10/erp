-- Script para agregar permisos del módulo Finanzas a todos los tenants
-- Fecha: 2025-10-23
-- Descripción: Agrega los permisos de Cuentas por Cobrar (CxC) a todos los tenants existentes
--              y los asigna automáticamente al rol ADMIN de cada tenant
--              INCLUYE el tenant plantilla VIERDES para que los nuevos tenants también los tengan

BEGIN;

-- Mostrar tenants que serán procesados
SELECT 
  tenant_id,
  razon_social,
  nombre_comercial,
  CASE 
    WHEN tenant_id = '25593ea2-5129-42f3-a9d0-f4da8d59dc1a' THEN '⭐ PLANTILLA'
    ELSE ''
  END as tipo
FROM empresa_config 
WHERE estado = 'ACTIVO'
ORDER BY razon_social;

-- =====================================================
-- INSERTAR PERMISOS DE FINANZAS EN TODOS LOS TENANTS
-- =====================================================

-- Obtener todos los tenant_ids activos
DO $$
DECLARE
  tenant_record RECORD;
  permiso_ver_id UUID;
  permiso_gestionar_id UUID;
  admin_role_id UUID;
BEGIN
  -- Iterar sobre cada tenant
  FOR tenant_record IN 
    SELECT DISTINCT tenant_id 
    FROM empresa_config 
    WHERE estado = 'ACTIVO'
  LOOP
    RAISE NOTICE 'Procesando tenant: %', tenant_record.tenant_id;
    
    -- Verificar si ya existen los permisos de finanzas para este tenant
    IF NOT EXISTS (
      SELECT 1 FROM permisos 
      WHERE tenant_id = tenant_record.tenant_id 
        AND modulo = 'finanzas' 
        AND recurso = 'cxc'
    ) THEN
      -- Insertar permiso: Ver CxC
      INSERT INTO permisos (
        tenant_id,
        modulo,
        accion,
        recurso,
        descripcion,
        activo,
        created_at
      ) VALUES (
        tenant_record.tenant_id,
        'finanzas',
        'ver',
        'cxc',
        'Ver bandejas y detalle de cuentas por cobrar',
        true,
        NOW()
      ) RETURNING id INTO permiso_ver_id;
      
      RAISE NOTICE '  ✓ Permiso "ver" creado: %', permiso_ver_id;
      
      -- Insertar permiso: Gestionar CxC
      INSERT INTO permisos (
        tenant_id,
        modulo,
        accion,
        recurso,
        descripcion,
        activo,
        created_at
      ) VALUES (
        tenant_record.tenant_id,
        'finanzas',
        'gestionar',
        'cxc',
        'Registrar pagos parciales, anticipos y actualizar estados de CxC',
        true,
        NOW()
      ) RETURNING id INTO permiso_gestionar_id;
      
      RAISE NOTICE '  ✓ Permiso "gestionar" creado: %', permiso_gestionar_id;
      
      -- Buscar el rol ADMIN del tenant
      SELECT id INTO admin_role_id
      FROM roles
      WHERE tenant_id = tenant_record.tenant_id
        AND nombre = 'ADMIN'
      LIMIT 1;
      
      IF admin_role_id IS NOT NULL THEN
        -- Establecer el contexto del tenant para el trigger de auditoría
        PERFORM set_config('app.current_tenant_id', tenant_record.tenant_id::text, false);
        
        -- Asignar permiso "ver" al rol ADMIN
        INSERT INTO rol_permisos (role_id, permiso_id, concedido, created_at)
        VALUES (admin_role_id, permiso_ver_id, true, NOW())
        ON CONFLICT DO NOTHING;
        
        -- Asignar permiso "gestionar" al rol ADMIN
        INSERT INTO rol_permisos (role_id, permiso_id, concedido, created_at)
        VALUES (admin_role_id, permiso_gestionar_id, true, NOW())
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE '  ✓ Permisos asignados al rol ADMIN: %', admin_role_id;
      ELSE
        RAISE WARNING '  ⚠ No se encontró rol ADMIN para tenant: %', tenant_record.tenant_id;
      END IF;
      
    ELSE
      RAISE NOTICE '  → Permisos de finanzas ya existen para este tenant';
    END IF;
    
  END LOOP;
  
  RAISE NOTICE '✅ Proceso completado';
END $$;

COMMIT;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- Mostrar resumen de permisos de finanzas por tenant
SELECT 
  ec.razon_social,
  ec.tenant_id,
  COUNT(p.id) as permisos_finanzas,
  STRING_AGG(p.accion, ', ' ORDER BY p.accion) as acciones
FROM empresa_config ec
LEFT JOIN permisos p ON p.tenant_id = ec.tenant_id 
  AND p.modulo = 'finanzas' 
  AND p.recurso = 'cxc'
WHERE ec.estado = 'ACTIVO'
GROUP BY ec.razon_social, ec.tenant_id
ORDER BY ec.razon_social;
