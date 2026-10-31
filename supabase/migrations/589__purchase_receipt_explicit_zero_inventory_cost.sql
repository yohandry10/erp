-- La OC ya congela el precio unitario de la compra. Un cero contractual no
-- significa "costo ausente": debe llegar como cero confirmado al writer de
-- inventario, sin recurrir al costo/precio de compra actual del catálogo.
-- Sólo modifica la función de cierre. Sin backfill ni cambios de ACL/RLS.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30s';

DO $purchase_zero_cost$
DECLARE
  v_def text;
  v_from text := '            ''costo_unitario'', coalesce(v_detalle.precio_unitario, 0)';
  v_to text := '            ''costo_unitario'', coalesce(v_detalle.precio_unitario, 0),' || chr(10)
    || '            ''costo_cero_confirmado'', coalesce(v_detalle.precio_unitario = 0, false)';
BEGIN
  v_def := replace(pg_get_functiondef(
    'public.cerrar_recepcion_tx(uuid,uuid,text,text)'::regprocedure), chr(13), '');
  IF (length(v_def)-length(replace(v_def,v_from,'')))/length(v_from) <> 1
     OR position('''costo_cero_confirmado''' IN v_def) <> 0 THEN
    RAISE EXCEPTION 'MIGRATION_576_PURCHASE_RECEIPT_COST_SOURCE_CHANGED';
  END IF;
  -- CREATE OR REPLACE conserva firma, propietario, SECURITY DEFINER,
  -- search_path y permisos; la definición completa proviene del catálogo.
  EXECUTE replace(v_def,v_from,v_to);
END;
$purchase_zero_cost$;
COMMIT;
