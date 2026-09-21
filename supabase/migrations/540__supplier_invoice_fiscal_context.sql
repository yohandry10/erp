-- El DTO ya recibe estos datos, pero el writer 465 no los insertaba. Guardarlos
-- dentro de la misma transacción de factura/outbox y protegerlos al reintentar.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.crear_factura_proveedor_tx(
  p_tenant_id uuid, p_cxp jsonb, p_event_id uuid, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_result jsonb;
  v_invoice public.cuentas_por_pagar%ROWTYPE;
  v_destination text := upper(btrim(coalesce(p_cxp->>'destino_credito_fiscal', 'GRAVADAS')));
  v_code text := nullif(btrim(p_cxp->>'codigo_detraccion'), '');
  v_rate numeric(18,6);
  v_context jsonb;
  v_saved_context jsonb;
BEGIN
  IF v_destination NOT IN ('GRAVADAS','NO_GRAVADAS','COMUN')
     OR length(v_code) > 10 THEN
    RAISE EXCEPTION 'SUPPLIER_INVOICE_FISCAL_CONTEXT_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_code ~ '^[0-9]{1,3}$' THEN v_code := lpad(v_code, 3, '0'); END IF;
  v_rate := CASE WHEN upper(btrim(coalesce(p_cxp->>'moneda','PEN')))='PEN' THEN 1
    ELSE nullif(p_cxp->'fiscal_metadata'->>'tipo_cambio','')::numeric END;
  IF v_rate IS NULL OR v_rate <= 0 OR (
    nullif(p_cxp->>'tipo_cambio_origen','') IS NOT NULL
    AND (p_cxp->>'tipo_cambio_origen')::numeric IS DISTINCT FROM v_rate
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_INVOICE_EXCHANGE_RATE_INCONSISTENT' USING ERRCODE='22023';
  END IF;
  v_context := jsonb_build_object(
    'destino_credito_fiscal',v_destination, 'codigo_detraccion',v_code,
    'tipo_cambio_origen',v_rate,
    'fecha_emision',(p_cxp->>'fecha_emision')::date,
    'serie',nullif(btrim(p_cxp->'fiscal_metadata'->>'serie'),''),
    'documento_referencia_tipo',nullif(btrim(p_cxp->'fiscal_metadata'->>'documento_referencia_tipo'),''),
    'documento_referencia_serie',nullif(btrim(p_cxp->'fiscal_metadata'->>'documento_referencia_serie'),''),
    'documento_referencia_numero',nullif(btrim(p_cxp->'fiscal_metadata'->>'documento_referencia_numero'),''),
    'documento_referencia_fecha',nullif(p_cxp->'fiscal_metadata'->>'documento_referencia_fecha','')::date
  );

  -- El writer vigente conserva actor, tenant, locks, huella monetaria,
  -- anticipos, ajustes, factura y outbox; cualquier fallo posterior revierte todo.
  v_result := app.crear_factura_proveedor_tx(p_tenant_id,p_cxp,p_event_id,p_idempotency_key);
  SELECT * INTO STRICT v_invoice FROM public.cuentas_por_pagar
  WHERE tenant_id=p_tenant_id AND id=(v_result->>'id')::uuid FOR UPDATE;
  IF coalesce((v_result->>'idempotent')::boolean,false) THEN
    v_saved_context := v_invoice.fiscal_metadata->'request_context_540';
    IF v_saved_context IS NULL THEN
      -- Compatibilidad con facturas previas: sólo se admite lo que la fila
      -- histórica acredita. No adivinar su destino ni corregirla por reintento.
      v_saved_context := jsonb_build_object(
        'destino_credito_fiscal',v_invoice.destino_credito_fiscal,
        'codigo_detraccion',v_invoice.codigo_detraccion,
        'tipo_cambio_origen',coalesce(v_invoice.tipo_cambio_origen,
          (v_invoice.fiscal_metadata->>'tipo_cambio')::numeric,
          CASE WHEN v_invoice.moneda='PEN' THEN 1 END),
        'fecha_emision',v_invoice.fecha_emision::date,
        'serie',nullif(btrim(v_invoice.fiscal_metadata->>'serie'),''),
        'documento_referencia_tipo',nullif(btrim(v_invoice.fiscal_metadata->>'documento_referencia_tipo'),''),
        'documento_referencia_serie',nullif(btrim(v_invoice.fiscal_metadata->>'documento_referencia_serie'),''),
        'documento_referencia_numero',nullif(btrim(v_invoice.fiscal_metadata->>'documento_referencia_numero'),''),
        'documento_referencia_fecha',nullif(v_invoice.fiscal_metadata->>'documento_referencia_fecha','')::date
      );
    END IF;
    IF v_saved_context IS DISTINCT FROM v_context THEN
      RAISE EXCEPTION 'SUPPLIER_INVOICE_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FISCAL_CONTEXT'
        USING ERRCODE='23505';
    END IF;
    RETURN v_result;
  END IF;

  UPDATE public.cuentas_por_pagar
  SET destino_credito_fiscal=v_destination, codigo_detraccion=v_code,
      tipo_cambio_origen=v_rate,
      fiscal_metadata=coalesce(fiscal_metadata,'{}'::jsonb)
        || jsonb_build_object('request_context_540',v_context)
  WHERE tenant_id=p_tenant_id AND id=v_invoice.id
  RETURNING * INTO v_invoice;
  RETURN to_jsonb(v_invoice) || jsonb_build_object('idempotent',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)
TO service_role;

-- Sin backfill: las elecciones históricas que se perdieron no son inferibles.
-- Rollback de código: restaurar el wrapper SQL anterior que llama al writer
-- app.crear_factura_proveedor_tx; conservar columnas y valores ya registrados.
-- No cambia ACL de tablas, RLS ni permite editar documentos por un reintento.
COMMIT;
