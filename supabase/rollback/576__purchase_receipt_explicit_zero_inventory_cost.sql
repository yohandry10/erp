-- Reversión sólo del código en una copia local, nunca de filas históricas.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30s';
DO $rollback$
DECLARE
  v_def text;
  v_to text := '            ''costo_unitario'', coalesce(v_detalle.precio_unitario, 0)';
  v_from text := '            ''costo_unitario'', coalesce(v_detalle.precio_unitario, 0),' || chr(10)
    || '            ''costo_cero_confirmado'', coalesce(v_detalle.precio_unitario = 0, false)';
BEGIN
  IF current_database()<>'erp_e2e' OR NOT EXISTS (
    SELECT 1 FROM app.deployment_environment
    WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
    RAISE EXCEPTION 'ROLLBACK_576_LOCAL_ONLY';
  END IF;
  v_def := replace(pg_get_functiondef(
    'public.cerrar_recepcion_tx(uuid,uuid,text,text)'::regprocedure), chr(13), '');
  IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from) <> 1 THEN
    RAISE EXCEPTION 'ROLLBACK_576_PURCHASE_RECEIPT_COST_SOURCE_CHANGED';
  END IF;
  EXECUTE replace(v_def,v_from,v_to);
END;
$rollback$;
COMMIT;
