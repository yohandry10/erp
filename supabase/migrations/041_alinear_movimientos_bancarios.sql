-- Migration 041: Alinear estructura de movimientos_bancarios
-- Fecha: 2025-10-26
-- Descripción: Renombra y ajusta columnas de movimientos_bancarios para alinear con estructura estándar

DO $$
BEGIN
  -- Renombrar fecha_operacion a fecha
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name='movimientos_bancarios' AND column_name='fecha_operacion') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='movimientos_bancarios' AND column_name='fecha') THEN
      ALTER TABLE movimientos_bancarios RENAME COLUMN fecha_operacion TO fecha;
      RAISE NOTICE 'Renombrado: fecha_operacion → fecha';
    END IF;
  END IF;

  -- Renombrar concepto a descripcion
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name='movimientos_bancarios' AND column_name='concepto') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='movimientos_bancarios' AND column_name='descripcion') THEN
      ALTER TABLE movimientos_bancarios RENAME COLUMN concepto TO descripcion;
      RAISE NOTICE 'Renombrado: concepto → descripcion';
    END IF;
  END IF;

  -- Renombrar tipo_operacion a tipo (y cambiar a ENUM después)
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name='movimientos_bancarios' AND column_name='tipo_operacion') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='movimientos_bancarios' AND column_name='tipo') THEN
      ALTER TABLE movimientos_bancarios RENAME COLUMN tipo_operacion TO tipo;
      RAISE NOTICE 'Renombrado: tipo_operacion → tipo';
    END IF;
  END IF;

  -- Renombrar usuario_id a created_by (y cambiar tipo después)
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name='movimientos_bancarios' AND column_name='usuario_id') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='movimientos_bancarios' AND column_name='created_by') THEN
      ALTER TABLE movimientos_bancarios RENAME COLUMN usuario_id TO created_by;
      RAISE NOTICE 'Renombrado: usuario_id → created_by';
    END IF;
  END IF;

  -- Agregar tenant_id si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='tenant_id') THEN
    ALTER TABLE movimientos_bancarios ADD COLUMN tenant_id UUID NOT NULL DEFAULT '9f40367f-a717-4a70-b59f-e719b29b29b2';
    RAISE NOTICE 'Agregado: tenant_id';
  END IF;

  -- Agregar metodo_pago si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='metodo_pago') THEN
    ALTER TABLE movimientos_bancarios ADD COLUMN metodo_pago VARCHAR(50);
    RAISE NOTICE 'Agregado: metodo_pago';
  END IF;

  -- Agregar proveedor_id si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='proveedor_id') THEN
    ALTER TABLE movimientos_bancarios ADD COLUMN proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL;
    RAISE NOTICE 'Agregado: proveedor_id';
  END IF;

  -- Agregar cxp_id si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='cxp_id') THEN
    ALTER TABLE movimientos_bancarios ADD COLUMN cxp_id UUID REFERENCES cuentas_por_pagar(id) ON DELETE SET NULL;
    RAISE NOTICE 'Agregado: cxp_id';
  END IF;

  -- Agregar conciliado si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='movimientos_bancarios' AND column_name='conciliado') THEN
    ALTER TABLE movimientos_bancarios ADD COLUMN conciliado BOOLEAN DEFAULT false;
    RAISE NOTICE 'Agregado: conciliado';
  END IF;

  -- Nota: saldo_anterior y saldo_nuevo se mantienen por ahora para no perder datos
  -- Pueden ser útiles para auditoría

  RAISE NOTICE '✓ Migración 041 completada: movimientos_bancarios alineado';
  
END $$;

-- Actualizar comentarios
COMMENT ON COLUMN movimientos_bancarios.fecha IS 'Fecha del movimiento bancario';
COMMENT ON COLUMN movimientos_bancarios.descripcion IS 'Descripción o concepto del movimiento';
COMMENT ON COLUMN movimientos_bancarios.tipo IS 'Tipo de movimiento: ABONO (ingreso) o CARGO (egreso)';
COMMENT ON COLUMN movimientos_bancarios.conciliado IS 'Indica si el movimiento ha sido conciliado';
COMMENT ON COLUMN movimientos_bancarios.saldo_anterior IS 'Saldo antes del movimiento (para auditoría)';
COMMENT ON COLUMN movimientos_bancarios.saldo_nuevo IS 'Saldo después del movimiento (para auditoría)';

-- Crear índices faltantes si no existen
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant ON movimientos_bancarios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_cuenta ON movimientos_bancarios(cuenta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_fecha ON movimientos_bancarios(tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_conciliado ON movimientos_bancarios(tenant_id, conciliado);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_proveedor ON movimientos_bancarios(proveedor_id);
