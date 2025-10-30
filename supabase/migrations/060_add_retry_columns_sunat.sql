-- ============================================
-- MIGRACIÓN: Agregar columnas de reintento a CPE y GRE
-- ============================================
-- Objetivo: Agregar soporte para reintentos automáticos con backoff exponencial
--           cuando falla comunicación con SUNAT por errores técnicos
-- ============================================

-- Agregar columnas de reintento a tabla cpe
DO $$ 
BEGIN
  -- Agregar retry_count si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cpe' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE cpe ADD COLUMN retry_count INTEGER DEFAULT 0;
    COMMENT ON COLUMN cpe.retry_count IS 'Número de reintentos realizados para envío a SUNAT';
  END IF;

  -- Agregar next_retry_at si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cpe' AND column_name = 'next_retry_at'
  ) THEN
    ALTER TABLE cpe ADD COLUMN next_retry_at TIMESTAMPTZ;
    COMMENT ON COLUMN cpe.next_retry_at IS 'Fecha y hora del siguiente reintento programado (backoff exponencial)';
  END IF;

  -- Crear índice para consultas de reintentos
  CREATE INDEX IF NOT EXISTS idx_cpe_retry_pending ON cpe(estado, retry_count, next_retry_at) 
    WHERE estado = 'RECHAZADO' AND retry_count < 5;
END $$;

-- Agregar columnas de reintento a tabla gre_guias
DO $$ 
BEGIN
  -- Agregar retry_count si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gre_guias' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE gre_guias ADD COLUMN retry_count INTEGER DEFAULT 0;
    COMMENT ON COLUMN gre_guias.retry_count IS 'Número de reintentos realizados para envío a SUNAT';
  END IF;

  -- Agregar next_retry_at si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gre_guias' AND column_name = 'next_retry_at'
  ) THEN
    ALTER TABLE gre_guias ADD COLUMN next_retry_at TIMESTAMPTZ;
    COMMENT ON COLUMN gre_guias.next_retry_at IS 'Fecha y hora del siguiente reintento programado (backoff exponencial)';
  END IF;

  -- Crear índice para consultas de reintentos
  CREATE INDEX IF NOT EXISTS idx_gre_retry_pending ON gre_guias(estado, retry_count, next_retry_at) 
    WHERE estado = 'RECHAZADO' AND retry_count < 5;
END $$;

-- Comentarios finales
COMMENT ON TABLE cpe IS 'Comprobantes de Pago Electrónicos. Soporta reintentos automáticos con backoff exponencial para errores técnicos.';
COMMENT ON TABLE gre_guias IS 'Guías de Remisión Electrónicas. Soporta reintentos automáticos con backoff exponencial para errores técnicos.';

