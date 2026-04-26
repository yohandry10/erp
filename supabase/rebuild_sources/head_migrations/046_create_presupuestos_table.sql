-- Migration 046: Crear tabla presupuestos
-- Fecha: 2025-10-27
-- Descripción: Tabla para gestionar presupuestos por centro de costo, cuenta contable y período
-- Módulo: Contabilidad - Fase 4

BEGIN;

-- =====================================================
-- TABLA: presupuestos
-- =====================================================
-- Descripción: Almacena presupuestos asignados por centro de costo,
--              cuenta contable y período contable para control presupuestario
-- Uso: Permite comparar gastos reales vs presupuestados por centro de costo

CREATE TABLE IF NOT EXISTS presupuestos (
  -- Identificación
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Referencias
  centro_costo_id UUID NOT NULL,
  cuenta_id UUID NOT NULL,
  periodo_contable_id UUID NOT NULL,
  
  -- Montos presupuestarios
  monto_presupuestado DECIMAL(15, 2) NOT NULL CHECK (monto_presupuestado >= 0),
  monto_ejecutado DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (monto_ejecutado >= 0),
  monto_comprometido DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (monto_comprometido >= 0),
  monto_disponible DECIMAL(15, 2) GENERATED ALWAYS AS (
    monto_presupuestado - monto_ejecutado - monto_comprometido
  ) STORED,
  
  -- Porcentaje de ejecución
  porcentaje_ejecutado DECIMAL(5, 2) GENERATED ALWAYS AS (
    CASE 
      WHEN monto_presupuestado > 0 THEN 
        ROUND((monto_ejecutado / monto_presupuestado) * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Metadata
  notas TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'BLOQUEADO', 'CERRADO')),
  
  -- Auditoría
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  
  -- Constraints
  CONSTRAINT presupuestos_unique_centro_cuenta_periodo 
    UNIQUE (tenant_id, centro_costo_id, cuenta_id, periodo_contable_id)
);

-- =====================================================
-- ÍNDICES
-- =====================================================

-- Índice para aislamiento multi-tenant (requerido para RLS)
CREATE INDEX IF NOT EXISTS presupuestos_tenant_id_idx 
  ON presupuestos(tenant_id);

-- Índice para búsquedas por centro de costo
CREATE INDEX IF NOT EXISTS presupuestos_centro_costo_id_idx 
  ON presupuestos(centro_costo_id);

-- Índice para búsquedas por cuenta contable
CREATE INDEX IF NOT EXISTS presupuestos_cuenta_id_idx 
  ON presupuestos(cuenta_id);

-- Índice para búsquedas por período contable
CREATE INDEX IF NOT EXISTS presupuestos_periodo_contable_id_idx 
  ON presupuestos(periodo_contable_id);

-- Índice compuesto para consultas frecuentes
CREATE INDEX IF NOT EXISTS presupuestos_tenant_periodo_idx 
  ON presupuestos(tenant_id, periodo_contable_id);

-- Índice para búsquedas por estado
CREATE INDEX IF NOT EXISTS presupuestos_estado_idx 
  ON presupuestos(estado) WHERE estado = 'ACTIVO';

-- =====================================================
-- FOREIGN KEYS
-- =====================================================

-- Nota: Las FK se agregarán cuando las tablas referenciadas existan
-- Por ahora se documentan para referencia futura:
-- 
-- ALTER TABLE presupuestos 
--   ADD CONSTRAINT fk_presupuestos_centro_costo 
--   FOREIGN KEY (centro_costo_id) REFERENCES centros_costo(id) ON DELETE RESTRICT;
--
-- ALTER TABLE presupuestos 
--   ADD CONSTRAINT fk_presupuestos_cuenta 
--   FOREIGN KEY (cuenta_id) REFERENCES plan_cuentas(id) ON DELETE RESTRICT;
--
-- ALTER TABLE presupuestos 
--   ADD CONSTRAINT fk_presupuestos_periodo 
--   FOREIGN KEY (periodo_contable_id) REFERENCES periodos_contables(id) ON DELETE RESTRICT;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS en la tabla
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;

-- Política de aislamiento por tenant
-- Permite todas las operaciones (SELECT, INSERT, UPDATE, DELETE) 
-- solo para registros del mismo tenant
CREATE POLICY presupuestos_tenant_isolation ON presupuestos
  FOR ALL
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- =====================================================
-- TRIGGER: updated_at
-- =====================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_presupuestos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger que ejecuta la función antes de cada UPDATE
CREATE TRIGGER trigger_presupuestos_updated_at
  BEFORE UPDATE ON presupuestos
  FOR EACH ROW
  EXECUTE FUNCTION update_presupuestos_updated_at();

-- =====================================================
-- COMENTARIOS
-- =====================================================

COMMENT ON TABLE presupuestos IS 
  'Presupuestos por centro de costo, cuenta contable y período - RLS habilitado';

COMMENT ON COLUMN presupuestos.id IS 
  'Identificador único del presupuesto';

COMMENT ON COLUMN presupuestos.tenant_id IS 
  'ID del tenant para aislamiento multi-tenant';

COMMENT ON COLUMN presupuestos.centro_costo_id IS 
  'ID del centro de costo al que pertenece el presupuesto';

COMMENT ON COLUMN presupuestos.cuenta_id IS 
  'ID de la cuenta contable del plan de cuentas';

COMMENT ON COLUMN presupuestos.periodo_contable_id IS 
  'ID del período contable (año/mes)';

COMMENT ON COLUMN presupuestos.monto_presupuestado IS 
  'Monto total presupuestado para el período';

COMMENT ON COLUMN presupuestos.monto_ejecutado IS 
  'Monto real ejecutado (gastos registrados)';

COMMENT ON COLUMN presupuestos.monto_comprometido IS 
  'Monto comprometido (órdenes de compra aprobadas pendientes)';

COMMENT ON COLUMN presupuestos.monto_disponible IS 
  'Monto disponible calculado (presupuestado - ejecutado - comprometido)';

COMMENT ON COLUMN presupuestos.porcentaje_ejecutado IS 
  'Porcentaje de ejecución del presupuesto';

COMMENT ON COLUMN presupuestos.estado IS 
  'Estado del presupuesto: ACTIVO, BLOQUEADO, CERRADO';

COMMENT ON COLUMN presupuestos.notas IS 
  'Notas o comentarios adicionales sobre el presupuesto';

-- =====================================================
-- VALIDACIÓN
-- =====================================================

DO $$
BEGIN
  -- Verificar que la tabla fue creada
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'presupuestos'
  ) THEN
    RAISE NOTICE '✓ Tabla presupuestos creada exitosamente';
  ELSE
    RAISE EXCEPTION 'ERROR: Tabla presupuestos no fue creada';
  END IF;
  
  -- Verificar que RLS está habilitado
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename = 'presupuestos' 
      AND rowsecurity = true
  ) THEN
    RAISE NOTICE '✓ RLS habilitado en tabla presupuestos';
  ELSE
    RAISE WARNING 'ATENCIÓN: RLS NO está habilitado en presupuestos';
  END IF;
  
  -- Verificar que la política existe
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'presupuestos' 
      AND policyname = 'presupuestos_tenant_isolation'
  ) THEN
    RAISE NOTICE '✓ Política tenant_isolation creada en presupuestos';
  ELSE
    RAISE WARNING 'ATENCIÓN: Política tenant_isolation NO existe en presupuestos';
  END IF;
  
  -- Verificar índices
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'presupuestos' 
      AND indexname = 'presupuestos_tenant_id_idx'
  ) THEN
    RAISE NOTICE '✓ Índice tenant_id creado en presupuestos';
  ELSE
    RAISE WARNING 'ATENCIÓN: Índice tenant_id NO existe en presupuestos';
  END IF;
  
  RAISE NOTICE '=== MIGRACIÓN 046 COMPLETADA ===';
END $$;

COMMIT;
