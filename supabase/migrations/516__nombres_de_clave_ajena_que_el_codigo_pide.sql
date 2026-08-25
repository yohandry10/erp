-- Migracion 516: las claves ajenas se llaman como el codigo las nombra.
--
-- Esta migracion existe porque la 515 rompio produccion, y conviene que quede
-- escrito por que.
--
-- Al quitar las claves ajenas duplicadas, la 515 conservo una de cada par
-- eligiendo el nombre canonico de PostgreSQL. Lo que no mire es que **hay
-- consultas que nombran la restriccion** para desambiguar el embed
-- (`ordenes_compra!recepciones_orden_id_fkey_runtime`), y siete de ellas
-- nombraban justamente la que se retiro. El resultado, en produccion y en
-- caliente: «Could not find a relationship between 'recepciones' and
-- 'ordenes_compra' in the schema cache», o sea el listado de recepciones caido.
--
-- Se corrige renombrando la superviviente al nombre que el codigo pide, que
-- mantiene una sola relacion por par --sin ambiguedad-- y no obliga a tocar seis
-- ficheros. Los nombres no son bonitos (`_runtime`, `_v2`), pero son los que
-- estan escritos y renombrar el esquema para que encaje con el codigo cuesta
-- menos que lo contrario.
--
-- Lo que impide que vuelva a pasar no es esta migracion: es el verificador 516,
-- que comprueba que **toda restriccion nombrada en el codigo existe**.

BEGIN;

DO $migracion$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.compras',               'compras_proveedor_id_fkey_runtime',  'fk_compras_proveedor_id'),
      ('public.orden_compra_detalles', 'fk_orden_compra_detalles_producto_id','orden_compra_detalles_producto_id_fkey_runtime'),
      ('public.recepcion_items',       'fk_recepcion_items_detalle_id_v2',   'recepcion_items_detalle_id_fkey_runtime'),
      ('public.recepcion_items',       'fk_recepcion_items_producto_id',     'recepcion_items_producto_id_fkey_runtime'),
      ('public.recepcion_items',       'fk_recepcion_items_recepcion_id',    'recepcion_items_recepcion_id_fkey_runtime'),
      ('public.recepciones',           'fk_recepciones_orden_id',            'recepciones_orden_id_fkey_runtime')
    ) AS t(tabla, actual, deseado)
  LOOP
    -- Idempotente en los dos sentidos: si ya se llama como toca no hace nada, y
    -- si el nombre de partida no existe tampoco falla. La 515 y esta se aplicaron
    -- a mano sobre produccion en distinto orden que en un entorno nuevo.
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.deseado
                 AND conrelid = r.tabla::regclass) THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.actual
                 AND conrelid = r.tabla::regclass) THEN
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tabla, r.actual, r.deseado);
    END IF;
  END LOOP;
END;
$migracion$;

COMMIT;
NOTIFY pgrst, 'reload schema';
