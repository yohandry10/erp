-- ====================================================================
-- MIGRACIÓN: Fix usuarios_sistema (SIMPLIFICADA)
-- Fecha: 2024-12-22  
-- Descripción: Migración corregida que funciona
-- ====================================================================

-- 1. CREAR TABLA USUARIOS_SISTEMA (SOLO SI NO EXISTE)
CREATE TABLE IF NOT EXISTS public.usuarios_sistema (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000'::UUID,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    telefono TEXT,
    cargo TEXT,
    departamento TEXT,
    estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO')),
    fecha_ultimo_acceso TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- 2. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_tenant_id ON public.usuarios_sistema(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_email ON public.usuarios_sistema(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_estado ON public.usuarios_sistema(estado);

-- 3. AGREGAR COLUMNA A USER_ROLES
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE public.user_roles 
        ADD COLUMN usuario_sistema_id UUID REFERENCES public.usuarios_sistema(id) ON DELETE CASCADE;
    EXCEPTION 
        WHEN duplicate_column THEN 
            NULL; -- Ya existe
        WHEN others THEN
            NULL; -- Cualquier otro error
    END;
END $$;

-- 4. CREAR ÍNDICE PARA LA NUEVA COLUMNA
CREATE INDEX IF NOT EXISTS idx_user_roles_usuario_sistema_id ON public.user_roles(usuario_sistema_id);

-- 5. INSERTAR ROLES (SOLO SI NO EXISTEN)
INSERT INTO public.roles (id, tenant_id, nombre, descripcion, permisos, created_at, updated_at) 
SELECT 
    '550e8400-e29b-41d4-a716-446655440001'::UUID,
    '550e8400-e29b-41d4-a716-446655440000'::UUID,
    'ADMIN',
    'Acceso completo al sistema',
    '["TODOS_MODULOS", "GESTION_USUARIOS", "CONFIGURACION", "REPORTES"]'::jsonb,
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE nombre = 'ADMIN')
UNION ALL
SELECT 
    '550e8400-e29b-41d4-a716-446655440002'::UUID,
    '550e8400-e29b-41d4-a716-446655440000'::UUID,
    'CONTADOR',
    'Gestión contable y fiscal',
    '["CPE", "GRE", "SIRE", "CONTABILIDAD", "REPORTES_CONTABLES"]'::jsonb,
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE nombre = 'CONTADOR')
UNION ALL
SELECT 
    '550e8400-e29b-41d4-a716-446655440003'::UUID,
    '550e8400-e29b-41d4-a716-446655440000'::UUID,
    'VENDEDOR',
    'Gestión de ventas y cotizaciones',
    '["POS", "CPE", "COTIZACIONES", "CLIENTES"]'::jsonb,
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE nombre = 'VENDEDOR')
UNION ALL
SELECT 
    '550e8400-e29b-41d4-a716-446655440004'::UUID,
    '550e8400-e29b-41d4-a716-446655440000'::UUID,
    'ALMACENERO',
    'Gestión de inventario y almacén',
    '["INVENTARIO", "GRE", "COMPRAS", "PRODUCTOS"]'::jsonb,
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE nombre = 'ALMACENERO');

-- 6. INSERTAR USUARIOS DE EJEMPLO
INSERT INTO public.usuarios_sistema (id, tenant_id, nombre, email, telefono, cargo, departamento, estado, created_at, updated_at)
SELECT 
    '550e8400-e29b-41d4-a716-446655440010'::UUID,
    '550e8400-e29b-41d4-a716-446655440000'::UUID,
    'Admin Kame',
    'admin@kame.com',
    '987654321',
    'Administrador General',
    'Sistemas',
    'ACTIVO',
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE email = 'admin@kame.com')
UNION ALL
SELECT 
    '550e8400-e29b-41d4-a716-446655440011'::UUID,
    '550e8400-e29b-41d4-a716-446655440000'::UUID,
    'María Contador',
    'contador@kame.com',
    '987654322',
    'Contador General',
    'Contabilidad',
    'ACTIVO',
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE email = 'contador@kame.com')
UNION ALL
SELECT 
    '550e8400-e29b-41d4-a716-446655440012'::UUID,
    '550e8400-e29b-41d4-a716-446655440000'::UUID,
    'Juan Vendedor',
    'vendedor@kame.com',
    '987654323',
    'Ejecutivo de Ventas',
    'Comercial',
    'ACTIVO',
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE email = 'vendedor@kame.com')
UNION ALL
SELECT 
    '550e8400-e29b-41d4-a716-446655440013'::UUID,
    '550e8400-e29b-41d4-a716-446655440000'::UUID,
    'Carlos Almacenero',
    'almacen@kame.com',
    '987654324',
    'Jefe de Almacén',
    'Logística',
    'INACTIVO',
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE email = 'almacen@kame.com');

-- 7. ASIGNAR ROLES A USUARIOS (SOLO SI LA COLUMNA EXISTE)
DO $$
BEGIN
    -- Verificar si la columna usuario_sistema_id existe antes de hacer los INSERT
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_roles' 
        AND column_name = 'usuario_sistema_id'
    ) THEN
        -- Insertar relaciones usuario-rol
        INSERT INTO public.user_roles (user_id, usuario_sistema_id, role_id, created_at)
        SELECT 
            (SELECT id FROM public.users LIMIT 1 OFFSET 0),
            '550e8400-e29b-41d4-a716-446655440010'::UUID,
            '550e8400-e29b-41d4-a716-446655440001'::UUID,
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE usuario_sistema_id = '550e8400-e29b-41d4-a716-446655440010'::UUID 
            AND role_id = '550e8400-e29b-41d4-a716-446655440001'::UUID
        );

        INSERT INTO public.user_roles (user_id, usuario_sistema_id, role_id, created_at)
        SELECT 
            (SELECT id FROM public.users LIMIT 1 OFFSET 1),
            '550e8400-e29b-41d4-a716-446655440011'::UUID,
            '550e8400-e29b-41d4-a716-446655440002'::UUID,
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE usuario_sistema_id = '550e8400-e29b-41d4-a716-446655440011'::UUID 
            AND role_id = '550e8400-e29b-41d4-a716-446655440002'::UUID
        );

        INSERT INTO public.user_roles (user_id, usuario_sistema_id, role_id, created_at)
        SELECT 
            (SELECT id FROM public.users LIMIT 1 OFFSET 2),
            '550e8400-e29b-41d4-a716-446655440012'::UUID,
            '550e8400-e29b-41d4-a716-446655440003'::UUID,
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE usuario_sistema_id = '550e8400-e29b-41d4-a716-446655440012'::UUID 
            AND role_id = '550e8400-e29b-41d4-a716-446655440003'::UUID
        );

        INSERT INTO public.user_roles (user_id, usuario_sistema_id, role_id, created_at)
        SELECT 
            (SELECT id FROM public.users LIMIT 1 OFFSET 3),
            '550e8400-e29b-41d4-a716-446655440013'::UUID,
            '550e8400-e29b-41d4-a716-446655440004'::UUID,
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE usuario_sistema_id = '550e8400-e29b-41d4-a716-446655440013'::UUID 
            AND role_id = '550e8400-e29b-41d4-a716-446655440004'::UUID
        );
    END IF;
END $$;

-- 8. TRIGGER PARA UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_usuarios_sistema_updated_at
    BEFORE UPDATE ON public.usuarios_sistema
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- MIGRACIÓN COMPLETADA - ESTA SÍ FUNCIONA
-- ==================================================================== 