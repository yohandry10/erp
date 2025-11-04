-- Migration 039: Conciliaciones Bancarias - Columnas Adicionales
-- Fecha: 2025-10-25
-- Descripción: Agrega columnas adicionales a la tabla conciliaciones_bancarias (fecha_desde, fecha_hasta, created_by, cerrado_at, cerrado_by)
-- Nota: La tabla base se crea en la migración 038b

-- =====================================================
-- ENUMS NECESARIOS
-- =====================================================

-- Enum para estados de conciliación
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_conciliacion') THEN
    CREATE TYPE estado_conciliacion AS ENUM (
      'ABIERTA',
      'EN_PROCESO',
      'CERRADA'
    );
  END IF;
END $$;

-- =====================================================
-- TABLA: conciliaciones_bancarias - COLUMNAS ADICIONALES
-- =====================================================

-- Agregar columnas adicionales a la tabla conciliaciones_bancarias (creada en migración 038b)
DO $$ 
BEGIN
  -- Agregar fecha_desde si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='conciliaciones_bancarias' AND column_name='fecha_desde') THEN
    ALTER TABLE conciliaciones_bancarias ADD COLUMN fecha_desde DATE;
  END IF;
  
  -- Agregar fecha_hasta si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='conciliaciones_bancarias' AND column_name='fecha_hasta') THEN
    ALTER TABLE conciliaciones_bancarias ADD COLUMN fecha_hasta DATE;
  END IF;
  
  -- Agregar created_by si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='conciliaciones_bancarias' AND column_name='created_by') THEN
    ALTER TABLE conciliaciones_bancarias ADD COLUMN created_by UUID;
  END IF;
  
  -- Agregar cerrado_at si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='conciliaciones_bancarias' AND column_name='cerrado_at') THEN
    ALTER TABLE conciliaciones_bancarias ADD COLUMN cerrado_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Agregar cerrado_by si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='conciliaciones_bancarias' AND column_name='cerrado_by') THEN
    ALTER TABLE conciliaciones_bancarias ADD COLUMN cerrado_by UUID;
  END IF;
END $$;

COMMENT ON TABLE conciliaciones_bancarias IS 'Conciliaciones bancarias por período';
COMMENT ON COLUMN conciliaciones_bancarias.periodo IS 'Período en formato YYYY-MM (ej: 2025-10)';
COMMENT ON COLUMN conciliaciones_bancarias.saldo_libro IS 'Saldo según los libros contables del sistema';
COMMENT ON COLUMN conciliaciones_bancarias.saldo_banco IS 'Saldo según el extracto bancario';
COMMENT ON COLUMN conciliaciones_bancarias.diferencia IS 'Diferencia entre saldo_libro y saldo_banco';
COMMENT ON COLUMN conciliaciones_bancarias.estado IS 'Estado de la conciliación: ABIERTA, EN_PROCESO, CERRADA';

-- Índices para conciliaciones_bancarias
CREATE INDEX IF NOT EXISTS idx_conciliaciones_bancarias_tenant ON conciliaciones_bancarias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conciliaciones_bancarias_cuenta ON conciliaciones_bancarias(cuenta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_conciliaciones_bancarias_periodo ON conciliaciones_bancarias(tenant_id, periodo);
CREATE INDEX IF NOT EXISTS idx_conciliaciones_bancarias_estado ON conciliaciones_bancarias(tenant_id, estado);

-- RLS para conciliaciones_bancarias
ALTER TABLE conciliaciones_bancarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conciliaciones_bancarias_tenant_isolation" ON conciliaciones_bancarias;
CREATE POLICY "conciliaciones_bancarias_tenant_isolation"
  ON conciliaciones_bancarias FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());
