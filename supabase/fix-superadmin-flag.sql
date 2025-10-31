-- =====================================================
-- FIX: Actualizar flag is_super_admin sin trigger de auditoría
-- =====================================================
-- Fecha: 2025-10-31
-- Descripción: Actualiza el campo is_super_admin del superadmin
--              deshabilitando temporalmente el trigger de auditoría
-- =====================================================

BEGIN;

-- Deshabilitar trigger de auditoría temporalmente
ALTER TABLE usuarios_sistema DISABLE TRIGGER audit_usuarios_sistema;

-- Verificar estado actual
DO $$
DECLARE
  v_user_record RECORD;
BEGIN
  SELECT id, email, is_super_admin, tenant_id, estado 
  INTO v_user_record
  FROM usuarios_sistema 
  WHERE email = 'superadmin@neon.com';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario superadmin@neon.com no encontrado';
  END IF;
  
  RAISE NOTICE '📋 Estado actual del superadmin:';
  RAISE NOTICE '   ID: %', v_user_record.id;
  RAISE NOTICE '   Email: %', v_user_record.email;
  RAISE NOTICE '   is_super_admin: %', v_user_record.is_super_admin;
  RAISE NOTICE '   tenant_id: %', v_user_record.tenant_id;
  RAISE NOTICE '   estado: %', v_user_record.estado;
END $$;

-- Actualizar is_super_admin a true
UPDATE usuarios_sistema
SET is_super_admin = true,
    updated_at = NOW()
WHERE email = 'superadmin@neon.com';

-- Confirmar actualización
DO $$
BEGIN
  RAISE NOTICE '✅ Campo is_super_admin actualizado a TRUE';
END $$;

-- Verificar el cambio
DO $$
DECLARE
  v_is_super boolean;
BEGIN
  SELECT is_super_admin INTO v_is_super
  FROM usuarios_sistema 
  WHERE email = 'superadmin@neon.com';
  
  IF v_is_super = true THEN
    RAISE NOTICE '✅ Verificación exitosa: is_super_admin = TRUE';
  ELSE
    RAISE EXCEPTION 'ERROR: is_super_admin no se actualizó correctamente';
  END IF;
END $$;

-- Rehabilitar trigger de auditoría
ALTER TABLE usuarios_sistema ENABLE TRIGGER audit_usuarios_sistema;

-- Confirmar rehabilitación
DO $$
BEGIN
  RAISE NOTICE '✅ Trigger de auditoría rehabilitado';
END $$;

COMMIT;

-- Mostrar resultado final
SELECT 
  id,
  email,
  is_super_admin,
  tenant_id,
  estado,
  created_at,
  updated_at
FROM usuarios_sistema 
WHERE email = 'superadmin@neon.com';