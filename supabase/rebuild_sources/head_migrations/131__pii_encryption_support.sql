-- =====================================================
-- MIGRACIÓN 131: Soporte para Encriptación de PII
-- =====================================================
-- Q58: Agrega campos hash para búsqueda de datos encriptados
-- =====================================================

-- 1. Agregar campos hash a tabla clientes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clientes' AND column_name = 'email_hash'
  ) THEN
    ALTER TABLE clientes ADD COLUMN email_hash VARCHAR(32);
    CREATE INDEX IF NOT EXISTS idx_clientes_email_hash ON clientes(email_hash);
    COMMENT ON COLUMN clientes.email_hash IS 'Hash de búsqueda para email encriptado (Q58)';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clientes' AND column_name = 'documento_hash'
  ) THEN
    ALTER TABLE clientes ADD COLUMN documento_hash VARCHAR(32);
    CREATE INDEX IF NOT EXISTS idx_clientes_documento_hash ON clientes(documento_hash);
    COMMENT ON COLUMN clientes.documento_hash IS 'Hash de búsqueda para documento encriptado (Q58)';
  END IF;
END $$;

-- 2. Agregar campos hash a tabla empleados
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'empleados') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'empleados' AND column_name = 'email_hash'
    ) THEN
      ALTER TABLE empleados ADD COLUMN email_hash VARCHAR(32);
      CREATE INDEX IF NOT EXISTS idx_empleados_email_hash ON empleados(email_hash);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'empleados' AND column_name = 'documento_hash'
    ) THEN
      ALTER TABLE empleados ADD COLUMN documento_hash VARCHAR(32);
      CREATE INDEX IF NOT EXISTS idx_empleados_documento_hash ON empleados(documento_hash);
    END IF;
  END IF;
END $$;

-- 3. Agregar campos hash a tabla proveedores
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proveedores') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proveedores' AND column_name = 'email_hash'
    ) THEN
      ALTER TABLE proveedores ADD COLUMN email_hash VARCHAR(32);
      CREATE INDEX IF NOT EXISTS idx_proveedores_email_hash ON proveedores(email_hash);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proveedores' AND column_name = 'ruc_hash'
    ) THEN
      ALTER TABLE proveedores ADD COLUMN ruc_hash VARCHAR(32);
      CREATE INDEX IF NOT EXISTS idx_proveedores_ruc_hash ON proveedores(ruc_hash);
    END IF;
  END IF;
END $$;

-- 4. Tabla de registro de datos encriptados (para auditoría y re-encriptación)
CREATE TABLE IF NOT EXISTS pii_encryption_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  encrypted_at TIMESTAMPTZ DEFAULT NOW(),
  encryption_key_version INTEGER DEFAULT 1,
  tenant_id UUID
);

CREATE INDEX IF NOT EXISTS idx_pii_log_table ON pii_encryption_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_pii_log_key_version ON pii_encryption_log(encryption_key_version);

-- 5. Función para buscar por hash
CREATE OR REPLACE FUNCTION buscar_por_pii_hash(
  p_table_name TEXT,
  p_hash_field TEXT,
  p_hash_value TEXT,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (id UUID) AS $$
BEGIN
  RETURN QUERY EXECUTE format(
    'SELECT id FROM %I WHERE %I = $1 AND ($2 IS NULL OR tenant_id = $2)',
    p_table_name,
    p_hash_field
  ) USING p_hash_value, p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Comentarios
COMMENT ON TABLE pii_encryption_log IS 'Registro de campos PII encriptados para auditoría y rotación de claves (Q58)';
COMMENT ON FUNCTION buscar_por_pii_hash IS 'Busca registros por hash de PII sin exponer datos sensibles';

DO $$
BEGIN
  RAISE NOTICE '✅ Migración 131: Soporte para Encriptación de PII completada';
END $$;
