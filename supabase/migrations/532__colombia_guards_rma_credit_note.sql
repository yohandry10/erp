BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- El writer RMA 456 es deliberadamente SUNAT: acepta 01/03, deriva FC/BC y
-- crea una nota 07 con efecto financiero inmediato. En Colombia ese contrato
-- sería fiscalmente falso (la NC es 91 y la CxC sólo cambia tras aceptación
-- DIAN). Argentina tampoco puede usarlo: sus notas requieren referencia ARCA y
-- CAE antes del efecto financiero. Conservamos el writer probado sólo para PE,
-- pero lo hacemos inaccesible
-- al runtime y publicamos una única puerta con guard de jurisdicción.
ALTER FUNCTION public.emitir_nota_credito_rma_tx(
  uuid, uuid, uuid, jsonb, text
) RENAME TO emitir_nota_credito_rma_legacy_532;

REVOKE ALL ON FUNCTION public.emitir_nota_credito_rma_legacy_532(
  uuid, uuid, uuid, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.emitir_nota_credito_rma_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_rma_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_country text;
BEGIN
  SELECT upper(nullif(btrim(ec.pais), ''))
  INTO v_country
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'RMA_FISCAL_COUNTRY_UNAVAILABLE'
      USING ERRCODE = '23514';
  END IF;
  IF v_country = 'CO' THEN
    RAISE EXCEPTION 'RMA_DIAN_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW'
      USING ERRCODE = '23514',
        DETAIL = 'Use Nota Crédito DIAN 91; el efecto financiero espera aceptación DIAN.';
  END IF;
  IF v_country = 'AR' THEN
    RAISE EXCEPTION 'RMA_ARCA_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW'
      USING ERRCODE = '23514',
        DETAIL = 'Use la nota ARCA referenciada; el efecto financiero espera CAE.';
  END IF;
  IF v_country <> 'PE' THEN
    RAISE EXCEPTION 'RMA_FISCAL_COUNTRY_UNSUPPORTED:%', v_country
      USING ERRCODE = '23514';
  END IF;

  RETURN public.emitir_nota_credito_rma_legacy_532(
    p_tenant_id,
    p_actor_id,
    p_rma_id,
    p_payload,
    p_idempotency_key
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.emitir_nota_credito_rma_tx(
  uuid, uuid, uuid, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_nota_credito_rma_tx(
  uuid, uuid, uuid, jsonb, text
) TO service_role;

COMMENT ON FUNCTION public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)
IS 'Puerta RMA por jurisdicción: preserva writer 456 sólo para PE; bloquea CO/AR antes de cualquier escritura y los dirige a DIAN/ARCA referenciados.';

COMMENT ON FUNCTION public.emitir_nota_credito_rma_legacy_532(uuid,uuid,uuid,jsonb,text)
IS 'Writer SUNAT heredado de 456; privado al runtime y accesible únicamente desde la puerta jurisdiccional 532.';

COMMIT;
