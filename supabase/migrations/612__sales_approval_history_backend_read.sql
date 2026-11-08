BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

-- La cadena protege las escrituras directas. El backend consulta el historial
-- para distinguir un replay exacto de una decisión incompatible (409), además
-- de mostrarlo al actor autorizado. No depender de default privileges del host
-- ni de un GRANT añadido por un fixture. Las escrituras siguen detrás de441.
GRANT SELECT ON TABLE public.pedido_aprobaciones TO service_role;

-- Sin DML, cambio de RLS, políticas, owner ni permisos de clientes. Rollback:
-- restaurar la ACL capturada antes del despliegue; revocar SELECT al servidor
-- sólo si no lo tenía antes. No retirar concesiones anteriores por rutina.
COMMIT;
