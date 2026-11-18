\set ON_ERROR_STOP on
BEGIN;
DO $verify$
BEGIN
  -- cxp.anulada pertenece al worker contable y a las guardas de período.
  IF NOT app.is_accounting_owned_outbox_event_492('cxp.anulada') OR NOT app.is_accounting_event_458('cxp.anulada') THEN
    RAISE EXCEPTION 'VERIFY_620_CLASSIFIER_MISSING';
  END IF;
  -- La 615 sigue clasificada y nada más cambió de dueño.
  IF NOT app.is_accounting_owned_outbox_event_492('recepcion.revertida') OR app.is_accounting_owned_outbox_event_492('cxp.creada.inexistente') THEN
    RAISE EXCEPTION 'VERIFY_620_CLASSIFIER_DRIFT';
  END IF;

  -- Sólo service_role ejecuta la contabilización, siempre con claim.
  IF NOT has_function_privilege('service_role', 'public.contabilizar_anulacion_cxp_620(uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.contabilizar_anulacion_cxp_620(uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.contabilizar_anulacion_cxp_620(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_620_PRIVILEGES';
  END IF;
  BEGIN
    PERFORM public.contabilizar_anulacion_cxp_620(gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
    RAISE EXCEPTION 'VERIFY_620_CLAIM_NOT_ENFORCED';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'CXP_CANCEL_ACCOUNTING_CLAIM_INVALID' THEN RAISE; END IF;
  END;

  -- Toda anulación ya contabilizada tiene su contraasiento enlazado y espejo.
  IF EXISTS (
    SELECT 1 FROM public.asientos_contables c
      JOIN public.asientos_contables o ON o.id=c.reversion_de_asiento_id
     WHERE c.origen='CXP_ANULACION'
       AND (c.total_debe<>o.total_haber OR c.total_haber<>o.total_debe OR c.estado<>'CONFIRMADO')
  ) THEN
    RAISE EXCEPTION 'VERIFY_620_COUNTER_JOURNAL_MISMATCH';
  END IF;
END;
$verify$;
SELECT 'PASS620: cxp.anulada es contable, la contabilización exige claim y los contraasientos existentes son espejo';
ROLLBACK;
