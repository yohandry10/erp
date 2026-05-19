-- Reconcile historical outbox rows created by the previous accounting listener.
-- The listener used to mark non-accounting domain events as dead_letter. Current
-- workers route those event types through their owning modules, so the old
-- dead_letter rows are operational noise, not pending accounting work.

BEGIN;

UPDATE public.outbox_events
   SET status = 'completed',
       processed_at = COALESCE(processed_at, updated_at, now()),
       error_message = NULL,
       next_retry_at = NULL,
       updated_at = now()
 WHERE lower(status::text) = 'dead_letter'
   AND event_type IN (
     'factura.proveedor.registrada',
     'compra.entregada',
     'orden.compra.aprobada',
     'venta_pos.registrada',
     'factura.emitida',
     'comprobante.creado',
     'CuentaPorPagarAjustadaPorDevolucionProveedor',
     'MovimientoBancarioRegistrado',
     'gre.creada'
   )
   AND error_message ILIKE 'Tipo de evento no manejado:%';

WITH reconciliable AS (
  SELECT oe.id AS outbox_id,
         oe.event_id AS outbox_event_id,
         oe.payload->>'eventId' AS payload_event_id,
         ac.id AS asiento_id
    FROM public.outbox_events oe
    JOIN public.asientos_contables ac
      ON ac.tenant_id = oe.tenant_id
     AND ac.source_event_id = (oe.payload->>'eventId')::uuid
   WHERE lower(oe.status::text) = 'dead_letter'
     AND oe.event_type = 'cxc.creada'
     AND oe.payload ? 'eventId'
     AND oe.payload->>'eventId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND abs(COALESCE(ac.total_debe, 0) - COALESCE(ac.total_haber, 0)) <= 0.01
     AND NOT EXISTS (
       SELECT 1
         FROM public.asientos_contables existing
        WHERE existing.tenant_id = oe.tenant_id
          AND existing.source_event_id = oe.event_id
     )
),
single_reconciliable AS (
  SELECT outbox_id,
         outbox_event_id,
         payload_event_id,
         asiento_id
    FROM (
      SELECT r.*,
             count(*) OVER (PARTITION BY outbox_id) AS matches
        FROM reconciliable r
    ) ranked
   WHERE matches = 1
)
UPDATE public.asientos_contables ac
   SET source_event_id = sr.outbox_event_id,
       updated_at = now()
  FROM single_reconciliable sr
 WHERE ac.id = sr.asiento_id;

WITH completed_cxc AS (
  SELECT oe.id
    FROM public.outbox_events oe
    JOIN public.asientos_contables ac
      ON ac.tenant_id = oe.tenant_id
     AND ac.source_event_id = oe.event_id
   WHERE lower(oe.status::text) = 'dead_letter'
     AND oe.event_type = 'cxc.creada'
     AND abs(COALESCE(ac.total_debe, 0) - COALESCE(ac.total_haber, 0)) <= 0.01
)
UPDATE public.outbox_events oe
   SET status = 'completed',
       processed_at = COALESCE(processed_at, updated_at, now()),
       error_message = NULL,
       next_retry_at = NULL,
       updated_at = now()
  FROM completed_cxc c
 WHERE oe.id = c.id;

UPDATE public.outbox_events oe
   SET status = 'pending',
       retry_count = 0,
       next_retry_at = NULL,
       error_message = NULL,
       processed_at = NULL,
       updated_at = now()
 WHERE lower(oe.status::text) = 'dead_letter'
   AND oe.event_type = 'planilla.liquidada'
   AND oe.error_message ILIKE 'No se encontraron las siguientes cuentas:%'
   AND EXISTS (
     SELECT 1
       FROM public.plan_cuentas pc
      WHERE pc.tenant_id = oe.tenant_id
        AND pc.codigo IN ('621', '403', '411')
      GROUP BY pc.tenant_id
     HAVING count(DISTINCT pc.codigo) = 3
   );

COMMIT;
