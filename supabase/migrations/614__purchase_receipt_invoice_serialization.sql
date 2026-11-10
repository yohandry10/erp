-- Facturar y anular una recepción deben competir por la misma fila de origen.
-- No modifica documentos históricos ni sus importes, permisos o RLS.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE FUNCTION app.validate_supplier_invoice_receipt_614(p_invoice public.cuentas_por_pagar,p_require_closed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE v_receipt_id uuid; v_receipt public.recepciones; v_supplier uuid;
BEGIN
  v_receipt_id:=p_invoice.recepcion_id;
  IF v_receipt_id IS NOT NULL AND p_invoice.referencia_id IS NOT NULL AND p_invoice.referencia_id<>v_receipt_id
    AND (upper(coalesce(p_invoice.referencia_tipo,''))='RECEPCION'
      OR EXISTS(SELECT 1 FROM public.recepciones WHERE id=p_invoice.referencia_id)) THEN
    RAISE EXCEPTION 'SUPPLIER_INVOICE_RECEIPT_REFERENCE_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF v_receipt_id IS NULL AND (upper(coalesce(p_invoice.referencia_tipo,''))='RECEPCION'
    OR EXISTS(SELECT 1 FROM public.recepciones WHERE id=p_invoice.referencia_id)) THEN
    v_receipt_id:=p_invoice.referencia_id;
  END IF;
  IF v_receipt_id IS NULL THEN
    IF upper(coalesce(p_invoice.referencia_tipo,''))='RECEPCION' THEN
      RAISE EXCEPTION 'SUPPLIER_INVOICE_RECEIPT_NOT_FOUND' USING ERRCODE='23503';
    END IF;
    RETURN;
  END IF;
  SELECT * INTO v_receipt FROM public.recepciones
    WHERE id=v_receipt_id AND tenant_id=p_invoice.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_INVOICE_RECEIPT_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF upper(v_receipt.estado::text)<>'CERRADA' AND (p_require_closed OR upper(v_receipt.estado::text)<>'BORRADOR') THEN
    RAISE EXCEPTION 'SUPPLIER_INVOICE_RECEIPT_NOT_CLOSED' USING ERRCODE='23514';
  END IF;
  SELECT proveedor_id INTO v_supplier FROM public.ordenes_compra
    WHERE tenant_id=p_invoice.tenant_id AND id=v_receipt.orden_id;
  IF NOT FOUND OR v_supplier IS DISTINCT FROM p_invoice.proveedor_id
    OR (p_invoice.orden_id IS NOT NULL AND p_invoice.orden_id IS DISTINCT FROM v_receipt.orden_id) THEN
    RAISE EXCEPTION 'SUPPLIER_INVOICE_RECEIPT_ORDER_MISMATCH' USING ERRCODE='23514';
  END IF;
END $fn$;
CREATE FUNCTION app.guard_supplier_invoice_receipt_614()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
BEGIN
  -- Pagos y ajustes de una deuda existente no cambian su vínculo de origen.
  IF TG_OP='UPDATE' AND ROW(NEW.tenant_id,NEW.recepcion_id,NEW.orden_id,NEW.proveedor_id,NEW.referencia_id,NEW.referencia_tipo)
    IS NOT DISTINCT FROM ROW(OLD.tenant_id,OLD.recepcion_id,OLD.orden_id,OLD.proveedor_id,OLD.referencia_id,OLD.referencia_tipo) THEN
    RETURN NEW;
  END IF;
  PERFORM app.validate_supplier_invoice_receipt_614(NEW,false);
  RETURN NEW;
END $fn$;
CREATE TRIGGER zzz_guard_supplier_invoice_receipt_614
BEFORE INSERT OR UPDATE ON public.cuentas_por_pagar
FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_invoice_receipt_614();
REVOKE ALL ON FUNCTION app.guard_supplier_invoice_receipt_614() FROM PUBLIC,anon,authenticated,service_role;

-- La fábrica canónica termina una recepción legacy mediante una restricción
-- diferida. Su deuda no puede escapar sin que ese mismo commit cierre el origen.
CREATE FUNCTION app.assert_supplier_invoice_receipt_closed_614()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE v_current public.cuentas_por_pagar;
BEGIN
  IF TG_OP='UPDATE' AND ROW(NEW.tenant_id,NEW.recepcion_id,NEW.orden_id,NEW.proveedor_id,NEW.referencia_id,NEW.referencia_tipo)
    IS NOT DISTINCT FROM ROW(OLD.tenant_id,OLD.recepcion_id,OLD.orden_id,OLD.proveedor_id,OLD.referencia_id,OLD.referencia_tipo) THEN RETURN NULL; END IF;
  SELECT * INTO v_current FROM public.cuentas_por_pagar WHERE id=NEW.id;
  IF FOUND THEN PERFORM app.validate_supplier_invoice_receipt_614(v_current,true); END IF;
  RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER zzz_assert_supplier_invoice_receipt_closed_614
AFTER INSERT OR UPDATE ON public.cuentas_por_pagar DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_supplier_invoice_receipt_closed_614();
REVOKE ALL ON FUNCTION app.assert_supplier_invoice_receipt_closed_614() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.validate_supplier_invoice_receipt_614(public.cuentas_por_pagar,boolean) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
