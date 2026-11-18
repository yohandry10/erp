\set ON_ERROR_STOP on
BEGIN;
DO $verify$
BEGIN
  -- Ninguna constancia declarada queda en dead_letter por falta de handler.
  IF EXISTS (
    SELECT 1 FROM public.outbox_events o
     WHERE lower(o.status::text) = 'dead_letter'
       AND o.error_message = 'OUTBOX_HANDLER_NOT_REGISTERED:' || o.event_type
       AND o.event_type IN (
         'configuracion.empresa.actualizada',
         'rma.creada', 'rma.decidida', 'rma.recepcionada', 'rma.recepcion.revertida',
         'pedido.cancelado', 'pos.ticket.canje.reservado',
         'orden.compra.aprobada', 'gre.creada')
  ) THEN
    RAISE EXCEPTION 'VERIFY_619_DECLARED_DEAD_LETTER_REMAINS';
  END IF;

  -- La 619 sólo cerró esos tipos, como completados y con el error original.
  IF EXISTS (
    SELECT 1 FROM public.outbox_events o
     WHERE o.payload->>'source_migration' = '619__outbox_close_declared_constancias'
       AND (o.event_type NOT IN (
              'configuracion.empresa.actualizada',
              'rma.creada', 'rma.decidida', 'rma.recepcionada', 'rma.recepcion.revertida',
              'pedido.cancelado', 'pos.ticket.canje.reservado',
              'orden.compra.aprobada', 'gre.creada')
         OR o.payload->>'closed_from_error' IS DISTINCT FROM 'OUTBOX_HANDLER_NOT_REGISTERED:' || o.event_type
         OR lower(o.status::text) <> 'completed'
         OR o.processed_at IS NULL
         OR o.claim_token IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'VERIFY_619_CLOSE_SCOPE_OR_STATE';
  END IF;
END;
$verify$;
SELECT 'PASS619: constancias declaradas sin dead_letter por handler ausente; cierre acotado y trazable';
ROLLBACK;
