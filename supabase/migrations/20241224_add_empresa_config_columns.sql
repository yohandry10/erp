-- Agregar columnas faltantes a la tabla empresa_config
ALTER TABLE public.empresa_config 
ADD COLUMN IF NOT EXISTS razon_social VARCHAR(255),
ADD COLUMN IF NOT EXISTS ruc VARCHAR(11),
ADD COLUMN IF NOT EXISTS direccion_fiscal TEXT,
ADD COLUMN IF NOT EXISTS telefono VARCHAR(20),
ADD COLUMN IF NOT EXISTS email VARCHAR(100),
ADD COLUMN IF NOT EXISTS sitio_web VARCHAR(255),
ADD COLUMN IF NOT EXISTS representante_legal VARCHAR(255),
ADD COLUMN IF NOT EXISTS igv_porcentaje DECIMAL(5,2) DEFAULT 18.00,
ADD COLUMN IF NOT EXISTS retencion_renta_porcentaje DECIMAL(5,2) DEFAULT 3.00;

-- Comentarios para documentar las nuevas columnas
COMMENT ON COLUMN public.empresa_config.razon_social IS 'Razón social de la empresa';
COMMENT ON COLUMN public.empresa_config.ruc IS 'RUC de la empresa';
COMMENT ON COLUMN public.empresa_config.direccion_fiscal IS 'Dirección fiscal de la empresa';
COMMENT ON COLUMN public.empresa_config.telefono IS 'Teléfono de contacto de la empresa';
COMMENT ON COLUMN public.empresa_config.email IS 'Email de contacto de la empresa';
COMMENT ON COLUMN public.empresa_config.sitio_web IS 'Sitio web de la empresa';
COMMENT ON COLUMN public.empresa_config.representante_legal IS 'Representante legal de la empresa';
COMMENT ON COLUMN public.empresa_config.igv_porcentaje IS 'Porcentaje de IGV aplicado';
COMMENT ON COLUMN public.empresa_config.retencion_renta_porcentaje IS 'Porcentaje de retención de renta aplicado'; 