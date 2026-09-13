-- Lecturas ausentes detectadas con API/DB reales: líneas de cotización,
-- vacaciones aprobadas para planilla e ítems/eventos del detalle RMA.
-- Sin escritores ni cambios de datos/RLS.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

GRANT SELECT ON TABLE public.cotizacion_detalles, public.solicitudes,
  public.rma_items, public.rma_eventos TO service_role;

-- Sin backfill. Rollback: restaurar las ACL del respaldo de esquema previo,
-- después de detener el runtime incompatible; no revocar concesiones a ciegas.
COMMIT;
