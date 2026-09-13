-- El alta canónica funciona, pero su listado no puede leer la categoría en una
-- reconstrucción limpia. El backend ya filtra tenant y permiso de inventario.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
GRANT SELECT ON TABLE public.categorias_producto TO service_role;
-- Sin DML, backfill, modificación de RLS ni permisos nuevos al navegador.
-- Rollback: restaurar la ACL previa del respaldo; no revocar concesiones que
-- pudieran existir antes de esta migración.
COMMIT;
