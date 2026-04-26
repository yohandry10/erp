-- Añade columnas para almacenar certificados cifrados (PFX) y contraseña cifrada
ALTER TABLE IF EXISTS empresa_config
ADD COLUMN IF NOT EXISTS pfx_encrypted text,
ADD COLUMN IF NOT EXISTS pfx_password_encrypted text;

COMMENT ON COLUMN empresa_config.pfx_encrypted IS 'Certificado PFX cifrado con AES-256-GCM (base64)';
COMMENT ON COLUMN empresa_config.pfx_password_encrypted IS 'Contraseña del PFX cifrada con AES-256-GCM (base64)';
