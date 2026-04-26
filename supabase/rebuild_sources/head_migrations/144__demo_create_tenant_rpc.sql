-- =====================================================
-- Migración 144: RPC para Crear Tenant Demo
-- =====================================================
-- Esta función crea un tenant demo completo con usuario
-- Usa SECURITY DEFINER para bypass de triggers de auditoría

CREATE OR REPLACE FUNCTION create_demo_tenant(
  p_nombre VARCHAR DEFAULT 'DEMO COMERCIAL SAC',
  p_dias_duracion INTEGER DEFAULT 14
)
RETURNS JSONB AS $$
DECLARE
  v_tenant_id UUID := gen_random_uuid();
  v_user_id UUID := gen_random_uuid();
  v_demo_email VARCHAR;
  v_demo_password VARCHAR;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_demo_email := 'demo-' || LEFT(v_tenant_id::text, 8) || '@temp.local';
  v_demo_password := UPPER(LEFT(md5(random()::text), 8));
  v_expires_at := NOW() + (p_dias_duracion || ' days')::INTERVAL;

  -- Establecer contexto para triggers de auditoría
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, false);
  PERFORM set_config('app.current_user_id', v_user_id::text, false);

  -- 1. Crear usuario primero (el audit necesita user_id válido)
  INSERT INTO usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, is_demo_user, demo_email_temp, activo, estado
  ) VALUES (
    v_user_id, v_tenant_id, 'Usuario', 'Demo', v_demo_email, 'demo',
    crypt(v_demo_password, gen_salt('bf', 10)), true, v_demo_email, true, 'ACTIVO'
  );

  -- 2. Crear empresa_config
  INSERT INTO empresa_config (
    tenant_id, razon_social, nombre_comercial, ruc, pais, moneda_defecto,
    is_demo, demo_created_at, demo_expires_at, demo_extended, 
    demo_conversion_attempted, estado, plan
  ) VALUES (
    v_tenant_id, p_nombre, p_nombre, 
    '20' || LPAD(FLOOR(RANDOM() * 1000000000)::TEXT, 9, '0'),
    'PE', 'PEN', true, NOW(), v_expires_at, false, false, 'PRUEBA', 'BASICO'
  );

  -- 3. Seed de datos demo (opcional)
  BEGIN
    PERFORM seed_demo_tenant(v_tenant_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Seed parcial: %', SQLERRM;
  END;

  -- 4. Crear roles y permisos del tenant
  BEGIN
    PERFORM seed_permisos_tenant(v_tenant_id);
    PERFORM seed_roles_tenant(v_tenant_id);
    PERFORM seed_rol_permisos_tenant(v_tenant_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Seed roles/permisos: %', SQLERRM;
  END;

  -- 5. CRÍTICO: Asignar rol ADMIN al usuario creado
  BEGIN
    INSERT INTO user_roles (usuario_sistema_id, role_id, created_at)
    SELECT v_user_id, r.id, NOW()
    FROM roles r
    WHERE r.tenant_id = v_tenant_id AND r.nombre = 'ADMIN'
    ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'Rol ADMIN asignado al usuario demo %', v_user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error asignando rol ADMIN: %', SQLERRM;
  END;

  -- Limpiar contexto
  PERFORM set_config('app.current_tenant_id', '', false);
  PERFORM set_config('app.current_user_id', '', false);

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'user_id', v_user_id,
    'email', v_demo_email,
    'password', v_demo_password,
    'expires_at', v_expires_at,
    'dias_restantes', p_dias_duracion
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentarios
COMMENT ON FUNCTION create_demo_tenant(VARCHAR, INTEGER) IS 
  'Crea un tenant demo completo con usuario y datos seed. Retorna credenciales.';

-- Grants
GRANT EXECUTE ON FUNCTION create_demo_tenant(VARCHAR, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION create_demo_tenant(VARCHAR, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION create_demo_tenant(VARCHAR, INTEGER) TO service_role;
