-- Migration 020: Finanzas - Crear/Actualizar tablas de finanzas
-- Fecha: 2025-10-25
-- Descripción: Crea o actualiza las tablas necesarias para el módulo de finanzas

-- =====================================================
-- ENUMS NECESARIOS
-- =====================================================

-- Enum para estados de cuentas por pagar
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_cxp') THEN
    CREATE TYPE estado_cxp AS ENUM (
      'PENDIENTE',
      'PARCIAL',
      'PAGADA',
      'VENCIDA',
      'ANULADA'
    );
  END IF;
END $$;

-- Enum para tipos de movimientos bancarios
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_movimiento_bancario') THEN
    CREATE TYPE tipo_movimiento_bancario AS ENUM (
      'ABONO',
      'CARGO'
    );
  END IF;
END $$;

-- =====================================================
-- TABLA: cuentas_bancarias
-- =====================================================

CREATE TABLE IF NOT EXISTS cuentas_bancarias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  banco VARCHAR(255) NOT NULL,
  numero_cuenta VARCHAR(50) NOT NULL,
  tipo_cuenta VARCHAR(50) DEFAULT 'CORRIENTE',
  moneda VARCHAR(3) DEFAULT 'PEN',
  saldo NUMERIC(12,2) DEFAULT 0 CHECK (saldo >= 0 OR permite_sobregiro = true),
  permite_sobregiro BOOLEAN DEFAULT false,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, numero_cuenta)
);

COMMENT ON TABLE cuentas_bancarias IS 'Cuentas bancarias de la empresa';
COMMENT ON COLUMN cuentas_bancarias.nombre IS 'Nombre descriptivo de la cuenta';
COMMENT ON COLUMN cuentas_bancarias.banco IS 'Nombre del banco';
COMMENT ON COLUMN cuentas_bancarias.numero_cuenta IS 'Número de cuenta bancaria';
COMMENT ON COLUMN cuentas_bancarias.tipo_cuenta IS 'Tipo de cuenta (CORRIENTE, AHORROS, etc.)';
COMMENT ON COLUMN cuentas_bancarias.saldo IS 'Saldo actual de la cuenta. CHECK constraint: saldo >= 0 OR permite_sobregiro = true';
COMMENT ON COLUMN cuentas_bancarias.permite_sobregiro IS 'Si la cuenta permite saldo negativo (configurable). Cuando es false, el saldo no puede ser negativo';

-- Índices para cuentas_bancarias
CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_tenant ON cuentas_bancarias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_activa ON cuentas_bancarias(tenant_id, activa);

-- RLS para cuentas_bancarias
ALTER TABLE cuentas_bancarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cuentas_bancarias_tenant_isolation" ON cuentas_bancarias;
CREATE POLICY "cuentas_bancarias_tenant_isolation"
  ON cuentas_bancarias FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: movimientos_bancarios
-- =====================================================

CREATE TABLE IF NOT EXISTS movimientos_bancarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  cuenta_bancaria_id UUID NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT,
  tipo tipo_movimiento_bancario NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha DATE NOT NULL,
  descripcion TEXT,
  referencia VARCHAR(100),
  metodo_pago VARCHAR(50),
  cxp_id UUID REFERENCES cuentas_por_pagar(id) ON DELETE SET NULL,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  conciliado BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT movimientos_bancarios_tipo_check CHECK (tipo IN ('ABONO', 'CARGO'))
);

COMMENT ON TABLE movimientos_bancarios IS 'Movimientos bancarios de ingresos y egresos';
COMMENT ON COLUMN movimientos_bancarios.tipo IS 'Tipo de movimiento: ABONO (ingreso) o CARGO (egreso)';
COMMENT ON COLUMN movimientos_bancarios.monto IS 'Monto del movimiento';
COMMENT ON COLUMN movimientos_bancarios.fecha IS 'Fecha del movimiento';
COMMENT ON COLUMN movimientos_bancarios.referencia IS 'Número de referencia u operación';
COMMENT ON COLUMN movimientos_bancarios.cxp_id IS 'Cuenta por pagar relacionada (si aplica)';
COMMENT ON COLUMN movimientos_bancarios.conciliado IS 'Si el movimiento ha sido conciliado';

-- Índices para movimientos_bancarios
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant ON movimientos_bancarios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_cuenta ON movimientos_bancarios(cuenta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_fecha ON movimientos_bancarios(tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_cxp ON movimientos_bancarios(cxp_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_conciliado ON movimientos_bancarios(tenant_id, conciliado);

-- RLS para movimientos_bancarios
ALTER TABLE movimientos_bancarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimientos_bancarios_tenant_isolation" ON movimientos_bancarios;
CREATE POLICY "movimientos_bancarios_tenant_isolation"
  ON movimientos_bancarios FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: cuentas_por_pagar (ACTUALIZAR SI EXISTE)
-- =====================================================

-- Agregar columnas faltantes a cuentas_por_pagar si no existen
DO $$ 
BEGIN
  -- Agregar recepcion_id si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='cuentas_por_pagar' AND column_name='recepcion_id') THEN
    ALTER TABLE cuentas_por_pagar ADD COLUMN recepcion_id UUID REFERENCES recepciones(id) ON DELETE RESTRICT;
  END IF;
  
  -- Agregar condiciones_pago si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='cuentas_por_pagar' AND column_name='condiciones_pago') THEN
    ALTER TABLE cuentas_por_pagar ADD COLUMN condiciones_pago VARCHAR(50);
  END IF;
  
  -- Agregar dias_credito si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='cuentas_por_pagar' AND column_name='dias_credito') THEN
    ALTER TABLE cuentas_por_pagar ADD COLUMN dias_credito INTEGER DEFAULT 0;
  END IF;
  
  -- Agregar subtotal si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='cuentas_por_pagar' AND column_name='subtotal') THEN
    ALTER TABLE cuentas_por_pagar ADD COLUMN subtotal NUMERIC(12,2) DEFAULT 0 CHECK (subtotal >= 0);
  END IF;
  
  -- Agregar igv si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='cuentas_por_pagar' AND column_name='igv') THEN
    ALTER TABLE cuentas_por_pagar ADD COLUMN igv NUMERIC(12,2) DEFAULT 0 CHECK (igv >= 0);
  END IF;
  
  -- Agregar observaciones si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='cuentas_por_pagar' AND column_name='observaciones') THEN
    ALTER TABLE cuentas_por_pagar ADD COLUMN observaciones TEXT;
  END IF;
  
  -- Agregar created_by si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='cuentas_por_pagar' AND column_name='created_by') THEN
    ALTER TABLE cuentas_por_pagar ADD COLUMN created_by UUID;
  END IF;
  
  -- Agregar anulado_at si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='cuentas_por_pagar' AND column_name='anulado_at') THEN
    ALTER TABLE cuentas_por_pagar ADD COLUMN anulado_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Agregar anulado_by si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='cuentas_por_pagar' AND column_name='anulado_by') THEN
    ALTER TABLE cuentas_por_pagar ADD COLUMN anulado_by UUID;
  END IF;
  
  -- Agregar motivo_anulacion si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='cuentas_por_pagar' AND column_name='motivo_anulacion') THEN
    ALTER TABLE cuentas_por_pagar ADD COLUMN motivo_anulacion TEXT;
  END IF;
  
END $$;

-- Índices adicionales para cuentas_por_pagar
CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_recepcion ON cuentas_por_pagar(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_numero_documento ON cuentas_por_pagar(tenant_id, numero_documento);

-- RLS para cuentas_por_pagar (asegurar que esté habilitado)
ALTER TABLE cuentas_por_pagar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cuentas_por_pagar_tenant_isolation" ON cuentas_por_pagar;
CREATE POLICY "cuentas_por_pagar_tenant_isolation"
  ON cuentas_por_pagar FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());
