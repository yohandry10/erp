-- =============================================
-- MIGRACIÓN: Implementar RLS y RBAC Granular
-- Fecha: 2025-01-27
-- Descripción: Row Level Security y Control de Acceso Basado en Roles
-- =============================================

-- 1. CREAR TABLA DE PERMISOS GRANULARES
CREATE TABLE IF NOT EXISTS public.permisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000',
    modulo TEXT NOT NULL, -- ventas, compras, contabilidad, rrhh, inventario
    accion TEXT NOT NULL, -- create, read, update, delete, export, import
    recurso TEXT NOT NULL, -- clientes, productos, facturas, empleados, etc
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CREAR TABLA DE PERMISOS POR ROL
CREATE TABLE IF NOT EXISTS public.rol_permisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL,
    permiso_id UUID REFERENCES public.permisos(id) ON DELETE CASCADE,
    concedido BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permiso_id)
);

-- 3. CREAR TABLA DE SESIONES DE USUARIO
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    usuario_sistema_id UUID REFERENCES public.usuarios_sistema(id),
    tenant_id UUID NOT NULL,
    ip_address INET,
    user_agent TEXT,
    session_token TEXT UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. FUNCIÓN PARA OBTENER TENANT_ID DEL USUARIO ACTUAL
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
    -- Intentar obtener tenant_id desde configuración de sesión
    RETURN COALESCE(
        current_setting('app.current_tenant_id', true)::UUID,
        '550e8400-e29b-41d4-a716-446655440000'::UUID -- tenant por defecto
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN '550e8400-e29b-41d4-a716-446655440000'::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. FUNCIÓN PARA OBTENER USER_ID ACTUAL
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN COALESCE(
        current_setting('app.current_user_id', true)::UUID,
        auth.uid()
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. FUNCIÓN PARA VERIFICAR PERMISOS
CREATE OR REPLACE FUNCTION user_has_permission(
    p_modulo TEXT,
    p_accion TEXT,
    p_recurso TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_tenant_id UUID;
    v_has_permission BOOLEAN := false;
BEGIN
    v_user_id := get_current_user_id();
    v_tenant_id := get_current_tenant_id();
    
    -- Si no hay usuario, denegar acceso
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Verificar si el usuario tiene el permiso a través de sus roles
    SELECT EXISTS(
        SELECT 1
        FROM public.user_roles ur
        JOIN public.rol_permisos rp ON ur.role_id = rp.role_id
        JOIN public.permisos p ON rp.permiso_id = p.id
        WHERE ur.user_id = v_user_id
        AND p.tenant_id = v_tenant_id
        AND p.modulo = p_modulo
        AND p.accion = p_accion
        AND p.recurso = p_recurso
        AND p.activo = true
        AND rp.concedido = true
    ) INTO v_has_permission;
    
    RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. HABILITAR RLS EN TABLAS PRINCIPALES
ALTER TABLE public.usuarios_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asientos_contables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_permisos ENABLE ROW LEVEL SECURITY;

-- 8. POLÍTICAS RLS PARA AISLAMIENTO POR TENANT

-- Política para usuarios_sistema
CREATE POLICY "usuarios_sistema_tenant_isolation" ON public.usuarios_sistema
    FOR ALL
    USING (tenant_id = get_current_tenant_id());

-- Política para clientes
CREATE POLICY "clientes_tenant_isolation" ON public.clientes
    FOR ALL
    USING (tenant_id = get_current_tenant_id());

-- Política para productos
CREATE POLICY "productos_tenant_isolation" ON public.productos
    FOR ALL
    USING (tenant_id = get_current_tenant_id());

-- Política para ventas
CREATE POLICY "ventas_tenant_isolation" ON public.ventas
    FOR ALL
    USING (tenant_id = get_current_tenant_id());

-- Política para cotizaciones
CREATE POLICY "cotizaciones_tenant_isolation" ON public.cotizaciones
    FOR ALL
    USING (tenant_id = get_current_tenant_id());

-- Política para empleados
CREATE POLICY "empleados_tenant_isolation" ON public.empleados
    FOR ALL
    USING (
        EXISTS(
            SELECT 1 FROM public.usuarios_sistema us
            WHERE us.id = (SELECT usuario_sistema_id FROM public.user_roles WHERE user_id = get_current_user_id() LIMIT 1)
            AND us.tenant_id = get_current_tenant_id()
        )
    );

-- Política para órdenes de compra
CREATE POLICY "ordenes_compra_tenant_isolation" ON public.ordenes_compra
    FOR ALL
    USING (tenant_id = get_current_tenant_id());

-- Política para asientos contables
CREATE POLICY "asientos_contables_tenant_isolation" ON public.asientos_contables
    FOR ALL
    USING (
        user_has_permission('contabilidad', 'read', 'asientos_contables')
    );

-- 9. POLÍTICAS RBAC GRANULARES

-- Política para lectura de clientes (requiere permiso)
CREATE POLICY "clientes_read_permission" ON public.clientes
    FOR SELECT
    USING (
        tenant_id = get_current_tenant_id() AND
        user_has_permission('ventas', 'read', 'clientes')
    );

-- Política para escritura de clientes (requiere permiso)
CREATE POLICY "clientes_write_permission" ON public.clientes
    FOR INSERT
    WITH CHECK (
        tenant_id = get_current_tenant_id() AND
        user_has_permission('ventas', 'create', 'clientes')
    );

CREATE POLICY "clientes_update_permission" ON public.clientes
    FOR UPDATE
    USING (
        tenant_id = get_current_tenant_id() AND
        user_has_permission('ventas', 'update', 'clientes')
    );

CREATE POLICY "clientes_delete_permission" ON public.clientes
    FOR DELETE
    USING (
        tenant_id = get_current_tenant_id() AND
        user_has_permission('ventas', 'delete', 'clientes')
    );

-- Política para productos
CREATE POLICY "productos_read_permission" ON public.productos
    FOR SELECT
    USING (
        tenant_id = get_current_tenant_id() AND
        user_has_permission('inventario', 'read', 'productos')
    );

-- 10. INSERTAR PERMISOS BÁSICOS
INSERT INTO public.permisos (id, tenant_id, modulo, accion, recurso, descripcion) VALUES
-- Permisos de Ventas
('550e8400-e29b-41d4-a716-446655440100'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'ventas', 'read', 'clientes', 'Ver clientes'),
('550e8400-e29b-41d4-a716-446655440101'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'ventas', 'create', 'clientes', 'Crear clientes'),
('550e8400-e29b-41d4-a716-446655440102'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'ventas', 'update', 'clientes', 'Actualizar clientes'),
('550e8400-e29b-41d4-a716-446655440103'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'ventas', 'delete', 'clientes', 'Eliminar clientes'),
('550e8400-e29b-41d4-a716-446655440104'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'ventas', 'read', 'ventas', 'Ver ventas'),
('550e8400-e29b-41d4-a716-446655440105'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'ventas', 'create', 'ventas', 'Crear ventas'),

-- Permisos de Inventario
('550e8400-e29b-41d4-a716-446655440110'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'inventario', 'read', 'productos', 'Ver productos'),
('550e8400-e29b-41d4-a716-446655440111'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'inventario', 'create', 'productos', 'Crear productos'),
('550e8400-e29b-41d4-a716-446655440112'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'inventario', 'update', 'productos', 'Actualizar productos'),

-- Permisos de Contabilidad
('550e8400-e29b-41d4-a716-446655440120'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'contabilidad', 'read', 'asientos_contables', 'Ver asientos contables'),
('550e8400-e29b-41d4-a716-446655440121'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'contabilidad', 'create', 'asientos_contables', 'Crear asientos contables'),

-- Permisos de RRHH
('550e8400-e29b-41d4-a716-446655440130'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'rrhh', 'read', 'empleados', 'Ver empleados'),
('550e8400-e29b-41d4-a716-446655440131'::UUID, '550e8400-e29b-41d4-a716-446655440000'::UUID, 'rrhh', 'create', 'empleados', 'Crear empleados')
ON CONFLICT (id) DO NOTHING;

-- 11. ASIGNAR PERMISOS A ROLES

-- ADMIN: Todos los permisos
INSERT INTO public.rol_permisos (role_id, permiso_id, concedido) 
SELECT 
    '550e8400-e29b-41d4-a716-446655440001'::UUID, -- ADMIN
    p.id,
    true
FROM public.permisos p
WHERE p.tenant_id = '550e8400-e29b-41d4-a716-446655440000'::UUID
ON CONFLICT (role_id, permiso_id) DO NOTHING;

-- VENDEDOR: Solo permisos de ventas
INSERT INTO public.rol_permisos (role_id, permiso_id, concedido) 
SELECT 
    '550e8400-e29b-41d4-a716-446655440003'::UUID, -- VENDEDOR
    p.id,
    true
FROM public.permisos p
WHERE p.modulo = 'ventas' AND p.tenant_id = '550e8400-e29b-41d4-a716-446655440000'::UUID
ON CONFLICT (role_id, permiso_id) DO NOTHING;

-- CONTADOR: Permisos de contabilidad
INSERT INTO public.rol_permisos (role_id, permiso_id, concedido) 
SELECT 
    '550e8400-e29b-41d4-a716-446655440002'::UUID, -- CONTADOR
    p.id,
    true
FROM public.permisos p
WHERE p.modulo = 'contabilidad' AND p.tenant_id = '550e8400-e29b-41d4-a716-446655440000'::UUID
ON CONFLICT (role_id, permiso_id) DO NOTHING;

-- ALMACENERO: Permisos de inventario
INSERT INTO public.rol_permisos (role_id, permiso_id, concedido) 
SELECT 
    '550e8400-e29b-41d4-a716-446655440004'::UUID, -- ALMACENERO
    p.id,
    true
FROM public.permisos p
WHERE p.modulo = 'inventario' AND p.tenant_id = '550e8400-e29b-41d4-a716-446655440000'::UUID
ON CONFLICT (role_id, permiso_id) DO NOTHING;

-- 12. CREAR ÍNDICES PARA OPTIMIZACIÓN
CREATE INDEX IF NOT EXISTS idx_permisos_modulo_accion_recurso ON public.permisos(modulo, accion, recurso);
CREATE INDEX IF NOT EXISTS idx_rol_permisos_role_id ON public.rol_permisos(role_id);
CREATE INDEX IF NOT EXISTS idx_rol_permisos_permiso_id ON public.rol_permisos(permiso_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON public.user_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON public.user_sessions(expires_at);

-- 13. FUNCIÓN PARA LIMPIAR SESIONES EXPIRADAS
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.user_sessions 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 14. TRIGGER PARA AUDITORÍA DE CAMBIOS EN PERMISOS
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    old_values JSONB,
    new_values JSONB,
    user_id UUID,
    tenant_id UUID,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_log (table_name, operation, old_values, user_id, tenant_id)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD), get_current_user_id(), get_current_tenant_id());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_log (table_name, operation, old_values, new_values, user_id, tenant_id)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD), row_to_json(NEW), get_current_user_id(), get_current_tenant_id());
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (table_name, operation, new_values, user_id, tenant_id)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(NEW), get_current_user_id(), get_current_tenant_id());
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger de auditoría a tablas críticas
CREATE TRIGGER audit_usuarios_sistema AFTER INSERT OR UPDATE OR DELETE ON public.usuarios_sistema
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_rol_permisos AFTER INSERT OR UPDATE OR DELETE ON public.rol_permisos
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- 15. COMENTARIOS Y DOCUMENTACIÓN
COMMENT ON TABLE public.permisos IS 'Permisos granulares del sistema por módulo, acción y recurso';
COMMENT ON TABLE public.rol_permisos IS 'Asignación de permisos a roles';
COMMENT ON TABLE public.user_sessions IS 'Sesiones activas de usuarios para control de acceso';
COMMENT ON TABLE public.audit_log IS 'Log de auditoría para cambios en datos críticos';

COMMENT ON FUNCTION get_current_tenant_id() IS 'Obtiene el tenant_id del contexto actual';
COMMENT ON FUNCTION get_current_user_id() IS 'Obtiene el user_id del contexto actual';
COMMENT ON FUNCTION user_has_permission(TEXT, TEXT, TEXT) IS 'Verifica si el usuario actual tiene un permiso específico';

-- =============================================
-- RESUMEN DE IMPLEMENTACIÓN RLS/RBAC:
-- ✅ Permisos granulares por módulo/acción/recurso
-- ✅ Row Level Security habilitado en tablas principales
-- ✅ Políticas de aislamiento por tenant
-- ✅ Políticas RBAC granulares
-- ✅ Funciones de verificación de permisos
-- ✅ Sistema de auditoría
-- ✅ Gestión de sesiones
-- ✅ Índices optimizados
-- =============================================

-- VERIFICACIÓN FINAL
SELECT 
    'permisos' as tabla,
    COUNT(*) as registros
FROM public.permisos
UNION ALL
SELECT 
    'rol_permisos' as tabla,
    COUNT(*) as registros
FROM public.rol_permisos;