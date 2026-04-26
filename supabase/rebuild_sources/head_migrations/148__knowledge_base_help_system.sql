-- =====================================================
-- MIGRACIÓN: Sistema de Base de Conocimiento para Bot de Ayuda
-- Fecha: 2025-11-29
-- Descripción: Tabla y funciones para búsqueda de ayuda contextual
-- =====================================================

-- 1. Tabla principal de conocimiento
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = global
  categoria VARCHAR(50) NOT NULL,    -- 'pos', 'ventas', 'inventario', etc.
  rol VARCHAR(50),                   -- 'cajero', 'vendedor', 'admin', NULL = todos
  pregunta TEXT NOT NULL,
  palabras_clave TEXT[] NOT NULL DEFAULT '{}',
  respuesta TEXT NOT NULL,
  pasos JSONB,                       -- [{paso: 1, texto: "..."}]
  url_modulo VARCHAR(255),
  orden INT DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índice full-text para búsqueda rápida (español)
CREATE INDEX IF NOT EXISTS idx_kb_fulltext_search ON knowledge_base 
USING GIN (to_tsvector('spanish', pregunta || ' ' || array_to_string(palabras_clave, ' ')));

-- 3. Índices adicionales
CREATE INDEX IF NOT EXISTS idx_kb_categoria ON knowledge_base(categoria);
CREATE INDEX IF NOT EXISTS idx_kb_rol ON knowledge_base(rol);
CREATE INDEX IF NOT EXISTS idx_kb_tenant ON knowledge_base(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kb_activo ON knowledge_base(activo);

-- 4. Función de búsqueda de ayuda
CREATE OR REPLACE FUNCTION buscar_ayuda(
  p_query TEXT,
  p_rol VARCHAR DEFAULT NULL,
  p_categoria VARCHAR DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL,
  p_limite INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  pregunta TEXT,
  respuesta TEXT,
  pasos JSONB,
  url_modulo VARCHAR,
  categoria VARCHAR,
  relevancia FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kb.id,
    kb.pregunta,
    kb.respuesta,
    kb.pasos,
    kb.url_modulo,
    kb.categoria,
    ts_rank(
      to_tsvector('spanish', kb.pregunta || ' ' || array_to_string(kb.palabras_clave, ' ')),
      plainto_tsquery('spanish', p_query)
    ) as relevancia
  FROM knowledge_base kb
  WHERE 
    kb.activo = true
    AND (
      to_tsvector('spanish', kb.pregunta || ' ' || array_to_string(kb.palabras_clave, ' ')) 
      @@ plainto_tsquery('spanish', p_query)
      OR kb.pregunta ILIKE '%' || p_query || '%'
      OR EXISTS (
        SELECT 1 FROM unnest(kb.palabras_clave) kw 
        WHERE kw ILIKE '%' || p_query || '%'
      )
    )
    AND (p_rol IS NULL OR kb.rol IS NULL OR kb.rol = p_rol)
    AND (p_categoria IS NULL OR kb.categoria = p_categoria)
    AND (p_tenant_id IS NULL OR kb.tenant_id IS NULL OR kb.tenant_id = p_tenant_id)
  ORDER BY relevancia DESC, kb.orden ASC
  LIMIT p_limite;
END;
$$ LANGUAGE plpgsql STABLE;

-- 5. Función para obtener sugerencias por rol
CREATE OR REPLACE FUNCTION obtener_sugerencias_ayuda(
  p_rol VARCHAR DEFAULT NULL,
  p_categoria VARCHAR DEFAULT NULL,
  p_limite INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  pregunta TEXT,
  categoria VARCHAR,
  url_modulo VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kb.id,
    kb.pregunta,
    kb.categoria,
    kb.url_modulo
  FROM knowledge_base kb
  WHERE 
    kb.activo = true
    AND (p_rol IS NULL OR kb.rol IS NULL OR kb.rol = p_rol)
    AND (p_categoria IS NULL OR kb.categoria = p_categoria)
    AND kb.tenant_id IS NULL  -- Solo sugerencias globales
  ORDER BY kb.orden ASC, kb.created_at DESC
  LIMIT p_limite;
END;
$$ LANGUAGE plpgsql STABLE;

-- 6. Trigger para updated_at
CREATE OR REPLACE FUNCTION update_knowledge_base_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_base_updated ON knowledge_base;
CREATE TRIGGER trg_knowledge_base_updated
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_base_timestamp();

-- 7. Permisos RLS
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Política: Todos pueden leer entradas globales o de su tenant
CREATE POLICY kb_select_policy ON knowledge_base
  FOR SELECT
  USING (
    tenant_id IS NULL 
    OR tenant_id = current_setting('app.tenant_id', true)::UUID
  );

-- Política: Solo admins pueden insertar/actualizar
CREATE POLICY kb_insert_policy ON knowledge_base
  FOR INSERT
  WITH CHECK (
    current_setting('app.user_role', true) IN ('ADMIN', 'SUPERADMIN')
  );

CREATE POLICY kb_update_policy ON knowledge_base
  FOR UPDATE
  USING (
    current_setting('app.user_role', true) IN ('ADMIN', 'SUPERADMIN')
  );

-- 8. Grants
GRANT SELECT ON knowledge_base TO authenticated;
GRANT INSERT, UPDATE, DELETE ON knowledge_base TO service_role;
GRANT EXECUTE ON FUNCTION buscar_ayuda TO authenticated;
GRANT EXECUTE ON FUNCTION obtener_sugerencias_ayuda TO authenticated;

-- 9. Comentarios
COMMENT ON TABLE knowledge_base IS 'Base de conocimiento para el bot de ayuda del ERP';
COMMENT ON FUNCTION buscar_ayuda IS 'Busca respuestas en la base de conocimiento usando full-text search';
COMMENT ON FUNCTION obtener_sugerencias_ayuda IS 'Obtiene preguntas sugeridas según rol y categoría';
