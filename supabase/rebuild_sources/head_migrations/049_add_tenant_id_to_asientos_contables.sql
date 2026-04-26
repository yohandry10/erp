-- =====================================================
-- MIGRACIÓN 049: Agregar tenant_id a asientos_contables
-- =====================================================
-- Descripción: Agrega la columna tenant_id a la tabla asientos_contables
--              para permitir el filtrado por tenant en las vistas materializadas
-- Fecha: 2025-10-27
-- =====================================================

-- Agregar columna tenant_id a asientos_contables (nullable inicialmente)
ALTER TABLE asientos_contables 
ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Actualizar registros existentes con tenant_id desde usuario_id
-- Asumiendo que usuario_id tiene relación con tenant
UPDATE asientos_contables ac
SET tenant_id = u.tenant_id
FROM usuarios u
WHERE ac.usuario_id = u.id
  AND ac.tenant_id IS NULL;

-- Si hay registros sin usuario_id, intentar obtener tenant desde detalle_asientos
-- (esto requeriría una lógica más compleja, por ahora los dejamos NULL)

-- Hacer la columna NOT NULL después de poblar datos
-- NOTA: Comentado para evitar errores si hay registros sin tenant_id
-- ALTER TABLE asientos_contables ALTER COLUMN tenant_id SET NOT NULL;

-- Crear índice para tenant_id
CREATE INDEX IF NOT EXISTS idx_asientos_contables_tenant 
  ON asientos_contables(tenant_id);

-- Crear índice compuesto para consultas por tenant y fecha
CREATE INDEX IF NOT EXISTS idx_asientos_contables_tenant_fecha 
  ON asientos_contables(tenant_id, fecha);

-- Crear índice compuesto para consultas por tenant y estado
CREATE INDEX IF NOT EXISTS idx_asientos_contables_tenant_estado 
  ON asientos_contables(tenant_id, estado);

COMMENT ON COLUMN asientos_contables.tenant_id IS 
  'ID del tenant al que pertenece el asiento contable';

-- =====================================================
-- Habilitar RLS en asientos_contables
-- =====================================================

-- Habilitar RLS si no está habilitado
ALTER TABLE asientos_contables ENABLE ROW LEVEL SECURITY;

-- Eliminar política existente si existe
DROP POLICY IF EXISTS "asientos_contables_tenant_isolation" ON asientos_contables;

-- Crear política de aislamiento por tenant
CREATE POLICY "asientos_contables_tenant_isolation"
  ON asientos_contables FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- FIN DE MIGRACIÓN 049
-- =====================================================
