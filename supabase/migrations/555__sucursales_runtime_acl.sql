-- El API usa service_role para el CRUD de sucursales y sus asignaciones.
-- La 503 creó las tablas sin ACL explícita; en una instalación limpia la
-- primera empresa no puede crear su primer establecimiento anexo.
BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

GRANT SELECT, INSERT, UPDATE ON public.sucursales TO service_role;
GRANT SELECT, INSERT, DELETE ON public.usuario_sucursales TO service_role;

COMMIT;
