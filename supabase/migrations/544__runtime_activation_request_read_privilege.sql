BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
-- La API proyecta columnas explícitas y exige SuperAdminGuard para el listado.
-- No se concede DML ni lectura directa al navegador; RLS permanece intacto.
GRANT SELECT ON public.demo_conversiones_pendientes TO service_role;
-- Sin backfill ni bloqueo de filas. Rollback con runtime compatible detenido:
-- REVOKE SELECT ON public.demo_conversiones_pendientes FROM service_role;
COMMIT;
