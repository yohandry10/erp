-- Lecturas del historial y los pendientes logísticos verificadas con PostgREST.
-- Las escrituras siguen exclusivamente en las operaciones atómicas 442/550.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

GRANT SELECT ON TABLE public.logistica_eventos, public.pedido_backorders TO service_role;

-- Sin backfill ni cambios en RLS o permisos del navegador.
-- Rollback: restaurar ACL del respaldo previo tras detener el runtime
-- incompatible; no revocar concesiones preexistentes a ciegas.
COMMIT;
