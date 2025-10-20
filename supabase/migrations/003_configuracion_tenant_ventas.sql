-- Migration 003: Agregar campos de configuración de ventas a empresa_config
-- Fecha: 2025-01-18
-- Descripción: Agrega campos para configurar flujo logístico y GRE por tenant

-- =====================================================
-- AGREGAR CAMPOS DE CONFIGURACIÓN A empresa_config
-- =====================================================

DO $$ 
BEGIN
  -- Campo: tipo_empresa
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='empresa_config' AND column_name='tipo_empresa'
  ) THEN
    ALTER TABLE empresa_config 
    ADD COLUMN tipo_empresa VARCHAR(20) DEFAULT 'MICRO' 
    CHECK (tipo_empresa IN ('MICRO', 'PEQUEÑA', 'MEDIANA', 'GRANDE'));
    
    RAISE NOTICE 'Campo tipo_empresa agregado';
  END IF;
  
  -- Campo: usar_flujo_logistica
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='empresa_config' AND column_name='usar_flujo_logistica'
  ) THEN
    ALTER TABLE empresa_config 
    ADD COLUMN usar_flujo_logistica BOOLEAN DEFAULT false NOT NULL;
    
    RAISE NOTICE 'Campo usar_flujo_logistica agregado';
  END IF;
  
  -- Campo: gre_obligatorio
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='empresa_config' AND column_name='gre_obligatorio'
  ) THEN
    ALTER TABLE empresa_config 
    ADD COLUMN gre_obligatorio BOOLEAN DEFAULT false NOT NULL;
    
    RAISE NOTICE 'Campo gre_obligatorio agregado';
  END IF;
  
  -- Campo: gre_automatico_habilitado
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='empresa_config' AND column_name='gre_automatico_habilitado'
  ) THEN
    ALTER TABLE empresa_config 
    ADD COLUMN gre_automatico_habilitado BOOLEAN DEFAULT true NOT NULL;
    
    RAISE NOTICE 'Campo gre_automatico_habilitado agregado';
  END IF;
  
  -- Campo: umbral_gre_automatico
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='empresa_config' AND column_name='umbral_gre_automatico'
  ) THEN
    ALTER TABLE empresa_config 
    ADD COLUMN umbral_gre_automatico NUMERIC(12,2) DEFAULT 700.00 NOT NULL;
    
    RAISE NOTICE 'Campo umbral_gre_automatico agregado';
  END IF;
  
END $$;

-- Comentarios explicativos
COMMENT ON COLUMN empresa_config.tipo_empresa IS 'Tipo de empresa: MICRO, PEQUEÑA, MEDIANA o GRANDE. Determina configuración por defecto';
COMMENT ON COLUMN empresa_config.usar_flujo_logistica IS 'Si true, usa flujo completo con preparación y despacho. Si false, flujo simplificado directo a facturación';
COMMENT ON COLUMN empresa_config.gre_obligatorio IS 'Si true, exige GRE para todas las ventas. Si false, es opcional';
COMMENT ON COLUMN empresa_config.gre_automatico_habilitado IS 'Si true, sugiere GRE automáticamente cuando se supera el umbral';
COMMENT ON COLUMN empresa_config.umbral_gre_automatico IS 'Monto en soles a partir del cual se sugiere generar GRE automáticamente (default: S/ 700)';
