-- Migración simple para agregar campos SUNAT a gre_guias existente
-- Fecha: 2024-12-25
-- Descripción: Agregar campos necesarios para integración SUNAT (preparación)

-- Agregar campos SUNAT a tabla gre_guias existente
ALTER TABLE gre_guias 
ADD COLUMN IF NOT EXISTS numero_sunat VARCHAR(50),
ADD COLUMN IF NOT EXISTS hash_gre VARCHAR(255),
ADD COLUMN IF NOT EXISTS xml_firmado TEXT,
ADD COLUMN IF NOT EXISTS cdr_sunat TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS cpe_relacionado UUID;

-- Crear índices para performance (opcional pero recomendado)
CREATE INDEX IF NOT EXISTS idx_gre_guias_numero_sunat ON gre_guias(numero_sunat);
CREATE INDEX IF NOT EXISTS idx_gre_guias_cpe_relacionado ON gre_guias(cpe_relacionado);
CREATE INDEX IF NOT EXISTS idx_gre_guias_estado ON gre_guias(estado);

-- Comentarios para documentación
COMMENT ON COLUMN gre_guias.numero_sunat IS 'Número de comprobante asignado por SUNAT (cuando se implemente)';
COMMENT ON COLUMN gre_guias.hash_gre IS 'Hash del XML firmado digitalmente';
COMMENT ON COLUMN gre_guias.xml_firmado IS 'XML UBL generado y firmado (listo para SUNAT)';
COMMENT ON COLUMN gre_guias.cdr_sunat IS 'Constancia de Recepción de SUNAT (cuando se active)';
COMMENT ON COLUMN gre_guias.error_message IS 'Mensajes de error en validaciones';
COMMENT ON COLUMN gre_guias.cpe_relacionado IS 'CPE que origina esta guía de remisión';

-- Log de migración
DO $$
BEGIN
    RAISE NOTICE 'Campos SUNAT agregados a gre_guias exitosamente';
    RAISE NOTICE 'Sistema listo para integración SUNAT cuando se active';
    RAISE NOTICE 'Campos: numero_sunat, hash_gre, xml_firmado, cdr_sunat, error_message, cpe_relacionado';
END $$; 