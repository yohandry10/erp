BEGIN;
SET LOCAL search_path = pg_catalog, public, app, pg_temp;

-- El saldo inicial precede a las operaciones que lo consumen si now() asignó
-- el mismo timestamp a toda la transacción. Otros empates conservan su orden.
-- Parche sobre la definición vigente: preserva precisión 583, seguridad y ACL.
-- No cambia filas, stock, importes, fechas ni permisos. Sin backfill.
DO $patch$
DECLARE
  definition text;
  forward_old text := 'ORDER BY fecha_recepcion, movimiento_id';
  reverse_old text := 'ORDER BY fecha_recepcion DESC, movimiento_id DESC';
  forward_new text := 'ORDER BY fecha_recepcion, CASE WHEN upper(referencia_tipo) = ''PRODUCTO_STOCK_INICIAL'' THEN 0 ELSE 1 END, movimiento_id';
  reverse_new text := 'ORDER BY fecha_recepcion DESC, CASE WHEN upper(referencia_tipo) = ''PRODUCTO_STOCK_INICIAL'' THEN 0 ELSE 1 END DESC, movimiento_id DESC';
BEGIN
  IF to_regprocedure('public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)') IS NULL THEN
    RAISE EXCEPTION 'KARDEX_594_REQUIERE_REPORTE_VIGENTE';
  END IF;
  definition := pg_get_functiondef('public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer)'::regprocedure);
  IF strpos(definition, forward_new) > 0 AND strpos(definition, reverse_new) > 0
     AND strpos(definition, forward_old) = 0 AND strpos(definition, reverse_old) = 0 THEN RETURN; END IF;
  IF (length(definition)-length(replace(definition,forward_old,'')))/length(forward_old) <> 2
     OR (length(definition)-length(replace(definition,reverse_old,'')))/length(reverse_old) <> 2 THEN
    RAISE EXCEPTION 'KARDEX_594_DEFINICION_INESPERADA';
  END IF;
  EXECUTE replace(replace(definition,forward_old,forward_new),reverse_old,reverse_new);
END;
$patch$;
COMMIT;
