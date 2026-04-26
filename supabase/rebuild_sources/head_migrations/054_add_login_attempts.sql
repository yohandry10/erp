-- =====================================================
-- A5: Tabla para registro de intentos de login
-- Migración: 054_add_login_attempts.sql
-- =====================================================

-- Crear tabla auth_login_attempts
CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failed_reason TEXT,
  tenant_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON auth_login_attempts(user_email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON auth_login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_tenant ON auth_login_attempts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON auth_login_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created ON auth_login_attempts(user_email, created_at DESC);

-- RLS: Habilitar Row Level Security
ALTER TABLE auth_login_attempts ENABLE ROW LEVEL SECURITY;

-- Política de aislamiento por tenant
DROP POLICY IF EXISTS "auth_login_attempts_tenant_isolation" ON auth_login_attempts;
CREATE POLICY "auth_login_attempts_tenant_isolation" ON auth_login_attempts
  FOR ALL USING (
    tenant_id IS NULL 
    OR tenant_id = app.current_tenant_id_safe() 
    OR app.is_superadmin()
  );

-- Permitir inserción sin tenant_id para intentos fallidos antes de identificar usuario
DROP POLICY IF EXISTS "auth_login_attempts_insert" ON auth_login_attempts;
CREATE POLICY "auth_login_attempts_insert" ON auth_login_attempts
  FOR INSERT WITH CHECK (true);

-- Comentarios de documentación
COMMENT ON TABLE auth_login_attempts IS 'Registro de intentos de login (exitosos y fallidos) para auditoría y seguridad';
COMMENT ON COLUMN auth_login_attempts.user_email IS 'Email del usuario que intentó iniciar sesión';
COMMENT ON COLUMN auth_login_attempts.ip_address IS 'Dirección IP desde donde se realizó el intento';
COMMENT ON COLUMN auth_login_attempts.user_agent IS 'User agent del navegador/cliente';
COMMENT ON COLUMN auth_login_attempts.success IS 'TRUE si el login fue exitoso, FALSE si falló';
COMMENT ON COLUMN auth_login_attempts.failed_reason IS 'Razón del fallo (credenciales inválidas, cuenta bloqueada, etc.)';
COMMENT ON COLUMN auth_login_attempts.tenant_id IS 'Tenant del usuario (si se identificó)';

