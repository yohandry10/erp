-- Script para debuggear el problema de RLS en clientes

-- 1. Verificar si RLS está habilitado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'clientes';

-- 2. Ver las políticas RLS activas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'clientes';

-- 3. Contar clientes en la tabla (sin RLS - como superuser)
SELECT COUNT(*) as total_clientes FROM clientes;

-- 4. Ver los últimos 5 clientes creados
SELECT id, tenant_id, razon_social, documento_tipo, numero_documento, created_at
FROM clientes
ORDER BY created_at DESC
LIMIT 5;

-- 5. Verificar si hay clientes para un tenant específico
-- Reemplaza 'TU_TENANT_ID' con el tenant_id real
SELECT id, razon_social, documento_tipo, numero_documento
FROM clientes
WHERE tenant_id = 'TU_TENANT_ID'
ORDER BY created_at DESC;
