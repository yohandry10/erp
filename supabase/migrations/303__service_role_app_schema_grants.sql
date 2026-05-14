-- 303: Permisos runtime para service_role sobre helpers app usados por RLS/triggers
-- Fecha: 2026-05-08
-- Motivo: PostgREST service_role necesita ejecutar helpers del schema app al insertar
-- sesiones de auth y otras operaciones backend con políticas/triggers multi-tenant.

GRANT USAGE ON SCHEMA app TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO service_role;
