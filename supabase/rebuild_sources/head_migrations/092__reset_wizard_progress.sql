-- =====================================================
-- MIGRACIÓN 092: Resetear progreso del wizard
-- =====================================================
-- Descripción: Elimina todos los registros de wizard_progress
--              para forzar que todos los tenants completen
--              el wizard correctamente con validaciones estrictas
-- Prioridad: CRÍTICA
-- Fecha: 2025-11-14
-- =====================================================

BEGIN;

-- Eliminar TODOS los registros de wizard_progress
-- Esto forzará a todos los tenants a volver a completar el wizard
DELETE FROM wizard_progress;

-- Log de la operación
DO $$
BEGIN
  RAISE NOTICE '✅ Migración 092 completada:';
  RAISE NOTICE '  1. Todos los registros de wizard_progress han sido eliminados';
  RAISE NOTICE '  2. Los tenants deberán completar el wizard nuevamente';
  RAISE NOTICE '  3. Las validaciones ahora son estrictas y verifican datos reales';
END $$;

COMMIT;
