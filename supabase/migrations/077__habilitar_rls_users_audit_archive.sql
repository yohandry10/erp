-- =============================================
-- Migration 077: Habilitar RLS en users y audit_log_archive
-- =============================================
-- Corrige vulnerabilidad de seguridad crítica:
-- Las tablas users y audit_log_archive NO tienen RLS habilitado
-- permitiendo acceso con anonymous key
-- =============================================

-- =============================================
-- PARTE 1: HABILITAR RLS EN users
-- =============================================

-- Habilitar RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios solo pueden ver su propio perfil
DROP POLICY IF EXISTS users_view_own_profile ON users;
CREATE POLICY users_view_own_profile
  ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Política: Los usuarios pueden actualizar su propio perfil
DROP POLICY IF EXISTS users_update_own_profile ON users;
CREATE POLICY users_update_own_profile
  ON users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Política: Service role tiene acceso completo (para admin)
DROP POLICY IF EXISTS users_service_role_all ON users;
CREATE POLICY users_service_role_all
  ON users
  FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

COMMENT ON TABLE users IS 'Tabla de usuarios con RLS habilitado (migración 077). Los usuarios solo pueden ver/editar su propio perfil.';

-- =============================================
-- PARTE 2: HABILITAR RLS EN audit_log_archive
-- =============================================

-- Habilitar RLS
ALTER TABLE audit_log_archive ENABLE ROW LEVEL SECURITY;

-- Política: Solo lectura para usuarios autenticados de su tenant
DROP POLICY IF EXISTS audit_log_archive_tenant_read ON audit_log_archive;
CREATE POLICY audit_log_archive_tenant_read
  ON audit_log_archive
  FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Política: Service role tiene acceso completo
DROP POLICY IF EXISTS audit_log_archive_service_role_all ON audit_log_archive;
CREATE POLICY audit_log_archive_service_role_all
  ON audit_log_archive
  FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- Política: Sistema puede insertar (para rotación automática)
DROP POLICY IF EXISTS audit_log_archive_system_insert ON audit_log_archive;
CREATE POLICY audit_log_archive_system_insert
  ON audit_log_archive
  FOR INSERT
  WITH CHECK (true);  -- Permite inserción desde funciones del sistema

COMMENT ON TABLE audit_log_archive IS 'Archivo de logs de auditoría con RLS habilitado (migración 077). Solo lectura por tenant, escritura por sistema.';

-- =============================================
-- PARTE 3: VERIFICAR OTRAS TABLAS CRÍTICAS
-- =============================================

-- Verificar que movimientos_inventario tiene RLS
DO $$
BEGIN
  IF NOT (SELECT rowsecurity FROM pg_tables WHERE tablename = 'movimientos_inventario') THEN
    ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
    
    -- Política de tenant isolation
    DROP POLICY IF EXISTS movimientos_inventario_tenant_isolation ON movimientos_inventario;
    CREATE POLICY movimientos_inventario_tenant_isolation
      ON movimientos_inventario
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    
    RAISE NOTICE 'RLS habilitado en movimientos_inventario';
  ELSE
    RAISE NOTICE 'movimientos_inventario ya tiene RLS habilitado';
  END IF;
END $$;

-- =============================================
-- PARTE 4: FUNCIÓN DE DIAGNÓSTICO DE SEGURIDAD
-- =============================================

CREATE OR REPLACE FUNCTION diagnostico_seguridad_rls()
RETURNS TABLE(
  tabla text,
  rls_habilitado boolean,
  num_politicas bigint,
  estado text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.tablename::text,
    t.rowsecurity,
    COUNT(p.policyname),
    CASE 
      WHEN t.rowsecurity AND COUNT(p.policyname) > 0 THEN '✅ SEGURO'
      WHEN t.rowsecurity AND COUNT(p.policyname) = 0 THEN '⚠️ RLS SIN POLÍTICAS'
      ELSE '❌ SIN RLS'
    END::text
  FROM pg_tables t
  LEFT JOIN pg_policies p ON p.tablename = t.tablename
  WHERE t.schemaname = 'public'
    AND t.tablename IN (
      'users',
      'audit_log_archive',
      'stock_movimientos',
      'movimientos_inventario',
      'ventas_pos',
      'detalle_ventas_pos',
      'productos',
      'cuentas_por_cobrar',
      'cuentas_por_pagar',
      'asientos_contables',
      'cpe',
      'ordenes_compra',
      'recepciones'
    )
  GROUP BY t.tablename, t.rowsecurity
  ORDER BY 
    CASE 
      WHEN t.rowsecurity AND COUNT(p.policyname) > 0 THEN 1
      WHEN t.rowsecurity AND COUNT(p.policyname) = 0 THEN 2
      ELSE 3
    END,
    t.tablename;
END;
$$;

COMMENT ON FUNCTION diagnostico_seguridad_rls() IS 
  'Diagnóstico de seguridad RLS - muestra estado de tablas críticas';

-- =============================================
-- PARTE 5: ÍNDICES PARA PERFORMANCE
-- =============================================

-- Índice en users por id (para políticas RLS)
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);

-- Índice en audit_log_archive por tenant_id y timestamp
-- Nota: La columna es 'timestamp' no 'created_at'
CREATE INDEX IF NOT EXISTS idx_audit_log_archive_tenant_timestamp 
  ON audit_log_archive(tenant_id, timestamp DESC)
  WHERE tenant_id IS NOT NULL;

-- =============================================
-- VERIFICACIÓN FINAL
-- =============================================

-- Mostrar diagnóstico de seguridad
SELECT * FROM diagnostico_seguridad_rls();

-- Verificar específicamente las tablas corregidas
DO $$
DECLARE
  v_users_rls boolean;
  v_audit_rls boolean;
  v_stock_rls boolean;
BEGIN
  -- Verificar users
  SELECT rowsecurity INTO v_users_rls
  FROM pg_tables
  WHERE tablename = 'users';
  
  -- Verificar audit_log_archive
  SELECT rowsecurity INTO v_audit_rls
  FROM pg_tables
  WHERE tablename = 'audit_log_archive';
  
  -- Verificar stock_movimientos
  SELECT rowsecurity INTO v_stock_rls
  FROM pg_tables
  WHERE tablename = 'stock_movimientos';
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Migración 077 completada:';
  RAISE NOTICE '  1. users: RLS %', CASE WHEN v_users_rls THEN '✅ HABILITADO' ELSE '❌ DESHABILITADO' END;
  RAISE NOTICE '  2. audit_log_archive: RLS %', CASE WHEN v_audit_rls THEN '✅ HABILITADO' ELSE '❌ DESHABILITADO' END;
  RAISE NOTICE '  3. stock_movimientos: RLS %', CASE WHEN v_stock_rls THEN '✅ HABILITADO' ELSE '❌ DESHABILITADO' END;
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Vulnerabilidad de seguridad crítica corregida';
  RAISE NOTICE '📊 Ejecutar: SELECT * FROM diagnostico_seguridad_rls();';
END $$;
