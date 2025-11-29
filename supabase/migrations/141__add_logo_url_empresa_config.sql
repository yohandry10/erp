-- Migración: Agregar columna logo_url a empresa_config
-- Descripción: Permite a cada tenant configurar su propio logo para facturas, boletas y tickets
-- Fecha: 2025-11-28

-- Agregar columna logo_url si no existe
ALTER TABLE IF EXISTS empresa_config
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Comentario descriptivo
COMMENT ON COLUMN empresa_config.logo_url IS 'URL o base64 del logo de la empresa para impresión en facturas, boletas y tickets (multi-tenant)';

-- Índice para búsquedas rápidas (opcional, solo si se necesita filtrar por logo)
-- CREATE INDEX IF NOT EXISTS idx_empresa_config_logo_url ON empresa_config(logo_url) WHERE logo_url IS NOT NULL;
