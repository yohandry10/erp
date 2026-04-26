-- =====================================================
-- MIGRACIÓN: Notificaciones por Rol
-- Fecha: 2025-11-29
-- Descripción: Agregar soporte para notificaciones dirigidas a roles específicos
-- =====================================================

-- Agregar columna para roles destinatarios (array de UUIDs de roles)
ALTER TABLE notificaciones 
ADD COLUMN IF NOT EXISTS roles_destinatarios UUID[] DEFAULT NULL;

-- Comentario explicativo
COMMENT ON COLUMN notificaciones.roles_destinatarios IS 
  'Array de role_ids a los que va dirigida la notificación. NULL = todos los usuarios del tenant o usuario específico';

-- Índice GIN para búsquedas eficientes en el array de roles
CREATE INDEX IF NOT EXISTS idx_notificaciones_roles 
  ON notificaciones USING GIN (roles_destinatarios) 
  WHERE roles_destinatarios IS NOT NULL;

-- =====================================================
-- TABLA DE MAPEO: Tipo de Notificación → Roles por defecto
-- Sin foreign key a tenants para evitar problemas con vistas
-- =====================================================
CREATE TABLE IF NOT EXISTS notificacion_tipo_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tipo_notificacion VARCHAR(100) NOT NULL,
  rol_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, tipo_notificacion, rol_id)
);

-- Índices para la tabla de mapeo
CREATE INDEX IF NOT EXISTS idx_notificacion_tipo_roles_tenant 
  ON notificacion_tipo_roles(tenant_id);

CREATE INDEX IF NOT EXISTS idx_notificacion_tipo_roles_tipo 
  ON notificacion_tipo_roles(tipo_notificacion);

-- RLS para la tabla de mapeo
ALTER TABLE notificacion_tipo_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificacion_tipo_roles_tenant_policy" ON notificacion_tipo_roles;
CREATE POLICY "notificacion_tipo_roles_tenant_policy" ON notificacion_tipo_roles
  FOR ALL
  USING (
    tenant_id = COALESCE(
      current_setting('app.tenant_id', true)::UUID,
      '00000000-0000-0000-0000-000000000000'::UUID
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON notificacion_tipo_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notificacion_tipo_roles TO service_role;

-- =====================================================
-- FUNCIÓN: Obtener roles de un usuario
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_role_ids(p_usuario_id UUID)
RETURNS UUID[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT ur.role_id 
    FROM user_roles ur 
    WHERE ur.usuario_sistema_id = p_usuario_id
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- FUNCIÓN: Verificar si usuario puede ver notificación
-- =====================================================
CREATE OR REPLACE FUNCTION puede_ver_notificacion(
  p_notificacion_id UUID,
  p_usuario_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_notif RECORD;
  v_user_roles UUID[];
BEGIN
  -- Obtener la notificación
  SELECT usuario_id, roles_destinatarios 
  INTO v_notif
  FROM notificaciones 
  WHERE id = p_notificacion_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Caso 1: Notificación para usuario específico
  IF v_notif.usuario_id IS NOT NULL THEN
    RETURN v_notif.usuario_id = p_usuario_id;
  END IF;
  
  -- Caso 2: Notificación global (sin usuario ni roles)
  IF v_notif.roles_destinatarios IS NULL OR array_length(v_notif.roles_destinatarios, 1) IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Caso 3: Notificación por roles
  v_user_roles := get_user_role_ids(p_usuario_id);
  RETURN v_notif.roles_destinatarios && v_user_roles; -- Operador && = overlap (intersección)
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- COMENTARIOS
-- =====================================================
COMMENT ON TABLE notificacion_tipo_roles IS 
  'Mapeo de tipos de notificación a roles por defecto. Permite configurar qué roles reciben qué tipos de notificaciones.';

COMMENT ON FUNCTION get_user_role_ids IS 
  'Retorna array de role_ids asignados a un usuario';

COMMENT ON FUNCTION puede_ver_notificacion IS 
  'Verifica si un usuario puede ver una notificación basado en: usuario_id directo, roles_destinatarios, o si es global';
