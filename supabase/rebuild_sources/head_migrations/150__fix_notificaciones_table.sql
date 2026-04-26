-- =====================================================
-- MIGRACIÓN: Fix tabla notificaciones
-- Fecha: 2025-11-29
-- Descripción: Asegurar que la tabla notificaciones tenga todos los campos
-- =====================================================

-- Crear tabla si no existe
CREATE TABLE IF NOT EXISTS notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  tipo VARCHAR(100) NOT NULL,
  severidad VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severidad IN ('info', 'warning', 'error')),
  titulo TEXT NOT NULL,
  mensaje TEXT,
  action_url TEXT,
  action_label VARCHAR(100),
  leida BOOLEAN DEFAULT FALSE,
  leida_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar columnas faltantes si no existen
DO $$
BEGIN
  -- titulo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'notificaciones' AND column_name = 'titulo') THEN
    ALTER TABLE notificaciones ADD COLUMN titulo TEXT NOT NULL DEFAULT 'Notificación';
  END IF;

  -- mensaje
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'notificaciones' AND column_name = 'mensaje') THEN
    ALTER TABLE notificaciones ADD COLUMN mensaje TEXT;
  END IF;

  -- tipo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'notificaciones' AND column_name = 'tipo') THEN
    ALTER TABLE notificaciones ADD COLUMN tipo VARCHAR(100) NOT NULL DEFAULT 'info';
  END IF;

  -- severidad
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'notificaciones' AND column_name = 'severidad') THEN
    ALTER TABLE notificaciones ADD COLUMN severidad VARCHAR(20) NOT NULL DEFAULT 'info';
  END IF;

  -- action_url
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'notificaciones' AND column_name = 'action_url') THEN
    ALTER TABLE notificaciones ADD COLUMN action_url TEXT;
  END IF;

  -- action_label
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'notificaciones' AND column_name = 'action_label') THEN
    ALTER TABLE notificaciones ADD COLUMN action_label VARCHAR(100);
  END IF;

  -- leida_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'notificaciones' AND column_name = 'leida_at') THEN
    ALTER TABLE notificaciones ADD COLUMN leida_at TIMESTAMPTZ;
  END IF;
END $$;

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_leida 
  ON notificaciones(tenant_id, leida);

CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_created 
  ON notificaciones(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario 
  ON notificaciones(usuario_id) WHERE usuario_id IS NOT NULL;

-- RLS
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- Política de lectura
DROP POLICY IF EXISTS "notificaciones_select_policy" ON notificaciones;
CREATE POLICY "notificaciones_select_policy" ON notificaciones
  FOR SELECT
  USING (
    tenant_id = COALESCE(
      current_setting('app.tenant_id', true)::UUID,
      '00000000-0000-0000-0000-000000000000'::UUID
    )
  );

-- Política de inserción
DROP POLICY IF EXISTS "notificaciones_insert_policy" ON notificaciones;
CREATE POLICY "notificaciones_insert_policy" ON notificaciones
  FOR INSERT
  WITH CHECK (
    tenant_id = COALESCE(
      current_setting('app.tenant_id', true)::UUID,
      '00000000-0000-0000-0000-000000000000'::UUID
    )
  );

-- Política de actualización
DROP POLICY IF EXISTS "notificaciones_update_policy" ON notificaciones;
CREATE POLICY "notificaciones_update_policy" ON notificaciones
  FOR UPDATE
  USING (
    tenant_id = COALESCE(
      current_setting('app.tenant_id', true)::UUID,
      '00000000-0000-0000-0000-000000000000'::UUID
    )
  );

-- Política de eliminación
DROP POLICY IF EXISTS "notificaciones_delete_policy" ON notificaciones;
CREATE POLICY "notificaciones_delete_policy" ON notificaciones
  FOR DELETE
  USING (
    tenant_id = COALESCE(
      current_setting('app.tenant_id', true)::UUID,
      '00000000-0000-0000-0000-000000000000'::UUID
    )
  );

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON notificaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notificaciones TO service_role;

-- Comentarios
COMMENT ON TABLE notificaciones IS 'Notificaciones del sistema para usuarios';
COMMENT ON COLUMN notificaciones.tipo IS 'Tipo de notificación (certificate_expiring, stock_bajo, etc.)';
COMMENT ON COLUMN notificaciones.severidad IS 'Nivel de severidad: info, warning, error';
COMMENT ON COLUMN notificaciones.titulo IS 'Título de la notificación';
COMMENT ON COLUMN notificaciones.mensaje IS 'Mensaje detallado de la notificación';
