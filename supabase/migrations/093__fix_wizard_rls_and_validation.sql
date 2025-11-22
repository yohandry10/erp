-- =====================================================
-- MIGRACIÓN 093: Solución completa para wizard multi-tenant
-- =====================================================
-- Descripción: 
--   1. Habilita RLS en wizard_progress
--   2. Elimina registros huérfanos o inválidos
--   3. Crea políticas estrictas de acceso por tenant
--   4. Agrega validación de integridad
-- Prioridad: CRÍTICA - Seguridad Multi-tenant
-- Fecha: 2025-11-14
-- =====================================================

BEGIN;

-- =====================================================
-- 1. HABILITAR RLS EN wizard_progress
-- =====================================================

ALTER TABLE wizard_progress ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. ELIMINAR POLÍTICAS EXISTENTES (si las hay)
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own tenant wizard progress" ON wizard_progress;
DROP POLICY IF EXISTS "Users can insert their own tenant wizard progress" ON wizard_progress;
DROP POLICY IF EXISTS "Users can update their own tenant wizard progress" ON wizard_progress;
DROP POLICY IF EXISTS "Users can delete their own tenant wizard progress" ON wizard_progress;

-- =====================================================
-- 3. CREAR POLÍTICAS ESTRICTAS POR TENANT
-- =====================================================

-- SELECT: Solo puede ver el progreso de su propio tenant
CREATE POLICY "Users can view their own tenant wizard progress"
ON wizard_progress
FOR SELECT
TO authenticated
USING (tenant_id = app.current_tenant_id());

-- INSERT: Solo puede crear progreso para su propio tenant
CREATE POLICY "Users can insert their own tenant wizard progress"
ON wizard_progress
FOR INSERT
TO authenticated
WITH CHECK (tenant_id = app.current_tenant_id());

-- UPDATE: Solo puede actualizar el progreso de su propio tenant
CREATE POLICY "Users can update their own tenant wizard progress"
ON wizard_progress
FOR UPDATE
TO authenticated
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

-- DELETE: Solo puede eliminar el progreso de su propio tenant
CREATE POLICY "Users can delete their own tenant wizard progress"
ON wizard_progress
FOR DELETE
TO authenticated
USING (tenant_id = app.current_tenant_id());

-- =====================================================
-- 4. ELIMINAR REGISTROS MARCADOS COMO COMPLETADOS
--    QUE NO TIENEN CONFIGURACIÓN REAL
-- =====================================================

-- Eliminar wizard_progress.completado = true donde NO existe configuración válida
DELETE FROM wizard_progress wp
WHERE wp.completado = true
AND NOT EXISTS (
  SELECT 1 FROM empresa_config ec
  WHERE ec.tenant_id = wp.tenant_id
  AND ec.ruc IS NOT NULL
  AND ec.razon_social IS NOT NULL
  AND ec.direccion_fiscal IS NOT NULL
  AND ec.certificado_pfx IS NOT NULL
  AND ec.certificado_password IS NOT NULL
);

-- =====================================================
-- 5. RESETEAR pasos_completados PARA TODOS LOS REGISTROS
--    Forzar re-validación desde cero
-- =====================================================

UPDATE wizard_progress
SET 
  pasos_completados = '[]'::jsonb,
  configuracion_temporal = NULL,
  paso_actual = 1,
  completado = false,
  completado_at = NULL,
  updated_at = NOW();

-- =====================================================
-- 6. CREAR FUNCIÓN PARA VALIDAR WIZARD CONTRA CONFIG REAL
-- =====================================================

CREATE OR REPLACE FUNCTION validate_wizard_completion(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config_valid BOOLEAN;
BEGIN
  -- Verificar que existe configuración completa
  SELECT 
    ruc IS NOT NULL AND
    razon_social IS NOT NULL AND
    direccion_fiscal IS NOT NULL AND
    certificado_pfx IS NOT NULL AND
    certificado_password IS NOT NULL
  INTO v_config_valid
  FROM empresa_config
  WHERE tenant_id = p_tenant_id;
  
  RETURN COALESCE(v_config_valid, false);
END;
$$;

GRANT EXECUTE ON FUNCTION validate_wizard_completion(UUID) TO authenticated, service_role;

-- =====================================================
-- 7. CREAR TRIGGER PARA VALIDAR ANTES DE MARCAR COMPLETADO
-- =====================================================

CREATE OR REPLACE FUNCTION check_wizard_completion_validity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si se intenta marcar como completado, validar que la configuración existe
  IF NEW.completado = true THEN
    IF NOT validate_wizard_completion(NEW.tenant_id) THEN
      RAISE EXCEPTION 'Cannot mark wizard as completed: configuration is incomplete for tenant %', NEW.tenant_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_wizard_completion_trigger ON wizard_progress;

CREATE TRIGGER validate_wizard_completion_trigger
BEFORE INSERT OR UPDATE ON wizard_progress
FOR EACH ROW
EXECUTE FUNCTION check_wizard_completion_validity();

-- =====================================================
-- 8. VERIFICACIÓN Y LOG
-- =====================================================

DO $$
DECLARE
  v_rls_enabled BOOLEAN;
  v_policy_count INTEGER;
BEGIN
  -- Verificar RLS habilitado
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'wizard_progress';
  
  -- Contar políticas
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'wizard_progress';
  
  RAISE NOTICE '✅ Migración 093 completada:';
  RAISE NOTICE '  1. RLS habilitado en wizard_progress: %', v_rls_enabled;
  RAISE NOTICE '  2. Políticas creadas: %', v_policy_count;
  RAISE NOTICE '  3. Registros inválidos eliminados';
  RAISE NOTICE '  4. Todos los wizard_progress reseteados para re-validación';
  RAISE NOTICE '  5. Función de validación creada';
  RAISE NOTICE '  6. Trigger de validación activado';
  
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'ERROR: RLS no se habilitó correctamente en wizard_progress';
  END IF;
  
  IF v_policy_count < 4 THEN
    RAISE EXCEPTION 'ERROR: No se crearon todas las políticas necesarias';
  END IF;
END $$;

COMMIT;
