-- Migration 036: Agregar campo monto_aprobacion_compras a empresa_config
-- Fecha: 2025-10-25
-- Descripción: Agrega el campo para configurar el monto mínimo que requiere aprobación en órdenes de compra

-- =====================================================
-- AGREGAR COLUMNA monto_aprobacion_compras
-- =====================================================

DO $$ 
BEGIN
  -- Agregar monto_aprobacion_compras si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='empresa_config' AND column_name='monto_aprobacion_compras') THEN
    ALTER TABLE empresa_config 
    ADD COLUMN monto_aprobacion_compras NUMERIC(12,2) DEFAULT 0 
    CHECK (monto_aprobacion_compras >= 0);
    
    RAISE NOTICE '✅ Columna monto_aprobacion_compras agregada a empresa_config';
  ELSE
    RAISE NOTICE 'ℹ️  Columna monto_aprobacion_compras ya existe en empresa_config';
  END IF;
END $$;

-- =====================================================
-- COMENTARIOS
-- =====================================================

COMMENT ON COLUMN empresa_config.monto_aprobacion_compras IS 
  'Monto mínimo (en moneda local) que requiere aprobación para órdenes de compra. Si el total de la OC excede este monto, el estado inicial será APROBACION. Si es 0 o NULL, no se requiere aprobación.';

-- =====================================================
-- ÍNDICE PARA CONSULTAS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_empresa_config_monto_aprobacion 
  ON empresa_config(monto_aprobacion_compras) 
  WHERE monto_aprobacion_compras > 0;

COMMENT ON INDEX idx_empresa_config_monto_aprobacion IS 
  'Índice para consultas de configuración de aprobación de compras';

-- =====================================================
-- FINALIZACIÓN
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 036 completada exitosamente';
  RAISE NOTICE '📋 Campo agregado: monto_aprobacion_compras en empresa_config';
  RAISE NOTICE '⚙️  Configuración: Establece el monto mínimo para requerir aprobación en OC';
  RAISE NOTICE '💡 Uso: Si total_oc > monto_aprobacion_compras, estado inicial = APROBACION';
END $$;
