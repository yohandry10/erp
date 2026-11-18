BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Cierra los dead_letter que sólo existen porque el worker no conocía un
-- suscriptor: eventos que sus RPC atómicos emiten como constancia y que el
-- runtime declara en EVENTOS_SIN_SUSCRIPTOR (apps/erp-api/src/shared/outbox/
-- eventos-sin-suscriptor.ts). Para ellos el worker no despacha nada: sólo marca
-- el evento completado. Esta migración hace ese mismo cierre.
--
-- No los reencola. Volverían a `pending` con su created_at original (agosto y
-- noviembre), outbox_runtime_health_492 los vería como el claimable más antiguo
-- muy por encima de 900 s y /api/health/ready —el health check de Render—
-- quedaría no listo hasta que el worker pasara. El ensayo sobre el respaldo del
-- 2026-11-17 lo comprobó: el lote abortó con PROMOCION_NO_LISTA.
--
-- En PROD eran dieciséis: siete `configuracion.empresa.actualizada` de agosto y
-- nueve de RMA, cancelación de pedido, canje POS, aprobación de OC y GRE de
-- noviembre. Sólo toca filas dead_letter cuyo error es exactamente el handler
-- ausente de su propio tipo; cualquier otro dead_letter sigue a la vista. El
-- error original queda en el payload. Rollback: devolver a dead_letter, con el
-- error guardado, las filas cuyo payload cita esta migración.
DO $close619$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.outbox_events o
     SET status = 'completed', processed_at = clock_timestamp(),
         error_message = NULL, next_retry_at = NULL,
         claim_token = NULL, last_heartbeat_at = clock_timestamp(),
         payload = coalesce(o.payload, '{}'::jsonb) || jsonb_build_object(
           'closed_reason', 'CONSTANCIA_SIN_SUSCRIPTOR_DECLARADA',
           'closed_from_status', 'dead_letter',
           'closed_from_error', o.error_message,
           'source_migration', '619__outbox_close_declared_constancias'),
         updated_at = clock_timestamp()
   WHERE lower(o.status::text) = 'dead_letter'
     AND o.error_message = 'OUTBOX_HANDLER_NOT_REGISTERED:' || o.event_type
     AND o.event_type IN (
       'configuracion.empresa.actualizada',
       'rma.creada', 'rma.decidida', 'rma.recepcionada', 'rma.recepcion.revertida',
       'pedido.cancelado', 'pos.ticket.canje.reservado',
       'orden.compra.aprobada', 'gre.creada');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Con RLS forzado, un rol sin BYPASSRLS actualizaría cero filas sin error.
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
    RAISE EXCEPTION 'OUTBOX_619_CLOSE_NOT_APPLIED';
  END IF;
  RAISE NOTICE 'OUTBOX_619_CLOSED %', v_count;
END;
$close619$;

COMMIT;
