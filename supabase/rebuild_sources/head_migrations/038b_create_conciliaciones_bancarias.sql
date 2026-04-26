-- Migration 038b: Crear tabla conciliaciones_bancarias
-- Fecha: 2025-11-02
-- Descripción: Crea la tabla base de conciliaciones bancarias que faltaba en las migraciones
-- Nota: Esta migración debe ejecutarse ANTES de la 039 que agrega columnas adicionales

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
-- TABLA: conciliaciones_bancarias
-- =====================================================

CREATE TABLE IF NOT EXISTS conciliaciones_bancarias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  cuenta_bancaria_id UUID NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT,
  periodo VARCHAR(7) NOT NULL, -- Formato: YYYY-MM (ej: 2025-10)
  estado estado_conciliacion NOT NULL DEFAULT 'ABIERTA',
  saldo_libro NUMERIC(12,2) DEFAULT 0,
  saldo_banco NUMERIC(12,2) DEFAULT 0,
  diferencia NUMERIC(12,2) DEFAULT 0,
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, cuenta_bancaria_id, periodo)
);

-- Comentarios de la tabla
COMMENT ON TABLE conciliaciones_bancarias IS 'Conciliaciones bancarias por período';
COMMENT ON COLUMN conciliaciones_bancarias.tenant_id IS 'ID del tenant propietario';
COMMENT ON COLUMN conciliaciones_bancarias.cuenta_bancaria_id IS 'Cuenta bancaria a conciliar';
COMMENT ON COLUMN conciliaciones_bancarias.periodo IS 'Período en formato YYYY-MM (ej: 2025-10)';
COMMENT ON COLUMN conciliaciones_bancarias.estado IS 'Estado de la conciliación: ABIERTA, EN_PROCESO, CERRADA';
COMMENT ON COLUMN conciliaciones_bancarias.saldo_libro IS 'Saldo según los libros contables del sistema';
COMMENT ON COLUMN conciliaciones_bancarias.saldo_banco IS 'Saldo según el extracto bancario';
COMMENT ON COLUMN conciliaciones_bancarias.diferencia IS 'Diferencia entre saldo_libro y saldo_banco';
COMMENT ON COLUMN conciliaciones_bancarias.observaciones IS 'Observaciones o notas sobre la conciliación';

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

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_conciliaciones_bancarias_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conciliaciones_bancarias_updated_at ON conciliaciones_bancarias;
CREATE TRIGGER trigger_update_conciliaciones_bancarias_updated_at
  BEFORE UPDATE ON conciliaciones_bancarias
  FOR EACH ROW
  EXECUTE FUNCTION update_conciliaciones_bancarias_updated_at();
