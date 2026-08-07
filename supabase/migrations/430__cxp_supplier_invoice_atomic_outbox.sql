-- ============================================================================
-- 430__cxp_supplier_invoice_atomic_outbox.sql
-- Registra la factura del proveedor y su evento contable durable en la misma
-- transaccion. La recepcion fisica no genera CxP ni credito fiscal.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION app.crear_factura_proveedor_tx(
  p_tenant_id uuid,
  p_cxp jsonb,
  p_event_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_cxp record;
  v_numero text := btrim(COALESCE(p_cxp->>'numero_documento', ''));
  v_proveedor_id uuid := NULLIF(p_cxp->>'proveedor_id', '')::uuid;
  v_orden_id uuid := NULLIF(p_cxp->>'orden_id', '')::uuid;
  v_recepcion_id uuid := NULLIF(p_cxp->>'recepcion_id', '')::uuid;
  v_tipo text := upper(btrim(COALESCE(p_cxp->>'tipo_documento', 'FACTURA')));
  v_moneda text := upper(btrim(COALESCE(p_cxp->>'moneda', 'PEN')));
  v_fiscal jsonb := COALESCE(p_cxp->'fiscal_metadata', '{}'::jsonb);
  v_subtotal numeric(14,2) := round(COALESCE((p_cxp->>'subtotal')::numeric, 0), 2);
  v_igv numeric(14,2) := round(COALESCE((p_cxp->>'igv')::numeric, 0), 2);
  v_total numeric(14,2) := round(COALESCE((p_cxp->>'total')::numeric, 0), 2);
  v_saldo numeric(14,2) := round(COALESCE((p_cxp->>'saldo')::numeric, 0), 2);
BEGIN
  IF p_tenant_id IS NULL OR p_event_id IS NULL
     OR NULLIF(btrim(COALESCE(p_idempotency_key, '')), '') IS NULL
     OR v_proveedor_id IS NULL OR v_numero = '' THEN
    RAISE EXCEPTION 'tenant, proveedor, numero, event_id e idempotency_key son obligatorios'
      USING ERRCODE = '22023';
  END IF;

  -- cuentas_por_pagar usa FORCE RLS. El RPC es exclusivo de service_role y
  -- fija el tenant recibido para que lecturas idempotentes y escritura vean
  -- exactamente el mismo ámbito durante esta transacción.
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  IF NOT EXISTS (
    SELECT 1 FROM public.proveedores
    WHERE id = v_proveedor_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Proveedor no pertenece al tenant' USING ERRCODE = '23514';
  END IF;
  IF v_orden_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ordenes_compra
    WHERE id = v_orden_id AND tenant_id = p_tenant_id AND proveedor_id = v_proveedor_id
  ) THEN
    RAISE EXCEPTION 'Orden no pertenece al tenant o proveedor' USING ERRCODE = '23514';
  END IF;
  IF v_recepcion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.recepciones
    WHERE id = v_recepcion_id AND tenant_id = p_tenant_id
      AND (v_orden_id IS NULL OR orden_id = v_orden_id)
  ) THEN
    RAISE EXCEPTION 'Recepcion no pertenece al tenant u orden' USING ERRCODE = '23514';
  END IF;
  IF v_tipo NOT IN ('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'RECIBO_HONORARIOS') THEN
    RAISE EXCEPTION 'Tipo de documento de compra no soportado: %', v_tipo USING ERRCODE = '22023';
  END IF;
  IF v_moneda !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Moneda invalida: %', v_moneda USING ERRCODE = '22023';
  END IF;
  IF v_moneda <> 'PEN'
     AND COALESCE((v_fiscal->>'tipo_cambio')::numeric, 0) <= 0 THEN
    RAISE EXCEPTION 'Tipo de cambio obligatorio para moneda extranjera' USING ERRCODE = '23514';
  END IF;
  IF v_tipo = 'NOTA_CREDITO' AND (
    NULLIF(v_fiscal->>'documento_referencia_tipo', '') IS NULL
    OR NULLIF(v_fiscal->>'documento_referencia_serie', '') IS NULL
    OR NULLIF(v_fiscal->>'documento_referencia_numero', '') IS NULL
    OR NULLIF(v_fiscal->>'documento_referencia_fecha', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Nota de credito sin comprobante modificado completo' USING ERRCODE = '23514';
  END IF;
  IF v_total <= 0 OR abs(v_total - round(v_subtotal + v_igv, 2)) > 0.01
     OR v_saldo < 0 OR v_saldo > v_total THEN
    RAISE EXCEPTION 'Montos de factura o saldo invalidos' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, orden_id, recepcion_id, numero, numero_documento,
    fecha_emision, fecha_vencimiento, condiciones_pago, dias_credito,
    subtotal, igv, total, saldo, saldo_pendiente,
    retencion_total, percepcion_total, detraccion_total, anticipo_total,
    moneda, tipo_documento, referencia_tipo, referencia_id, fiscal_metadata,
    estado, estado_comparacion, discrepancias, observaciones, created_by,
    event_id, idempotency_key
  ) VALUES (
    p_tenant_id, v_proveedor_id, v_orden_id, v_recepcion_id,
    NULLIF(p_cxp->>'numero', ''), v_numero,
    (p_cxp->>'fecha_emision')::date, (p_cxp->>'fecha_vencimiento')::date,
    p_cxp->>'condiciones_pago', COALESCE((p_cxp->>'dias_credito')::integer, 0),
    v_subtotal, v_igv, v_total, v_saldo, v_saldo,
    COALESCE((p_cxp->>'retencion_total')::numeric, 0),
    COALESCE((p_cxp->>'percepcion_total')::numeric, 0),
    COALESCE((p_cxp->>'detraccion_total')::numeric, 0),
    COALESCE((p_cxp->>'anticipo_total')::numeric, 0),
    v_moneda, v_tipo, NULLIF(p_cxp->>'referencia_tipo', ''),
    NULLIF(p_cxp->>'referencia_id', '')::uuid, v_fiscal,
    p_cxp->>'estado', COALESCE(NULLIF(p_cxp->>'estado_comparacion', ''), 'OK'),
    COALESCE(p_cxp->'discrepancias', '[]'::jsonb), NULLIF(p_cxp->>'observaciones', ''),
    NULLIF(p_cxp->>'created_by', '')::uuid, p_event_id, p_idempotency_key
  )
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET updated_at = public.cuentas_por_pagar.updated_at
  RETURNING *, (xmax <> 0) AS idempotent INTO v_cxp;

  IF v_cxp.idempotent THEN
    RETURN to_jsonb(v_cxp);
  END IF;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'factura_proveedor', v_cxp.id::text, 'factura.proveedor.registrada',
    jsonb_build_object(
      'eventId', p_event_id,
      'tenantId', p_tenant_id,
      'idempotencyKey', p_idempotency_key,
      'facturaProvId', v_cxp.id,
      'numeroDocumento', v_cxp.numero_documento,
      'serie', v_fiscal->>'serie',
      'ordenId', v_cxp.orden_id,
      'recepcionId', v_cxp.recepcion_id,
      'proveedorId', v_cxp.proveedor_id,
      'subtotal', v_cxp.subtotal,
      'igv', v_cxp.igv,
      'total', v_cxp.total,
      'retencion', v_cxp.retencion_total,
      'percepcion', v_cxp.percepcion_total,
      'detraccion', v_cxp.detraccion_total,
      'anticipo', v_cxp.anticipo_total,
      'moneda', v_cxp.moneda,
      'tipoCambio', v_fiscal->'tipo_cambio',
      'fechaEmision', v_cxp.fecha_emision,
      'fechaVencimiento', v_cxp.fecha_vencimiento,
      'estadoComparacion', v_cxp.estado_comparacion,
      'emittedAt', clock_timestamp()
    ),
    'pending', 0, p_idempotency_key, p_event_id, clock_timestamp()
  );

  RETURN to_jsonb(v_cxp);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_factura_proveedor_tx(
  p_tenant_id uuid,
  p_cxp jsonb,
  p_event_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.crear_factura_proveedor_tx(p_tenant_id, p_cxp, p_event_id, p_idempotency_key);
$function$;

REVOKE ALL ON FUNCTION app.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)
TO service_role;

COMMENT ON FUNCTION public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text) IS
  'Registra factura/CxP de proveedor y publica su evento contable durable en una sola transaccion.';

COMMIT;

NOTIFY pgrst, 'reload schema';
