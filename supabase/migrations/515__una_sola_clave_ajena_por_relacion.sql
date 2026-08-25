-- Migracion 515: una sola clave ajena por relacion.
--
-- En produccion hay 45 pares de tablas con la **misma** clave ajena declarada
-- dos veces (a veces tres): la misma columna, hacia la misma tabla, con el mismo
-- destino. No es solo ruido, aunque tambien lo sea --cada insercion paga dos
-- comprobaciones identicas--: PostgREST **no puede resolver un embed cuando hay
-- mas de una relacion** entre dos tablas, y responde 400 con
-- `PGRST201: Could not embed because more than one relationship was found`.
--
-- Eso es lo que rompe hoy la pantalla de devoluciones: `/ventas/rma/candidatos`
-- no puede listar los pedidos, asi que **no se puede crear un RMA**. Y hay 13
-- consultas mas escritas de la misma forma, entre ellas las de pedidos,
-- movimientos bancarios, recepciones y logistica. Quien se topo con esto antes
-- lo sorteo nombrando la restriccion (`plan_cuentas!fk_detalle_asientos_cuenta_id`)
-- en los libros electronicos; esta migracion quita la necesidad de hacerlo.
--
-- **Solo se retiran las duplicadas que se comportan igual.** Hay otro grupo
-- --las de `tenant_id`-- donde una dice `ON DELETE CASCADE` y la otra
-- `NO ACTION`; con las dos puestas manda la estricta, y quitar una cambiaria lo
-- que ocurre al borrar un contribuyente. Eso es una decision de producto, no una
-- limpieza, y se deja como esta a proposito. La condicion que lo garantiza esta
-- escrita abajo, no confiada al criterio de quien ejecuta.

BEGIN;

DO $migracion$
DECLARE
  r record;
  v_retiradas integer := 0;
BEGIN
  FOR r IN
    SELECT c.oid,
           c.conname,
           c.conrelid::regclass::text AS tabla
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      -- hay otra igual en todo: columnas, destino y acciones
      AND EXISTS (
        SELECT 1 FROM pg_constraint o
        WHERE o.contype = 'f' AND o.conrelid = c.conrelid AND o.confrelid = c.confrelid
          AND o.conkey = c.conkey AND o.confkey = c.confkey
          AND o.confdeltype = c.confdeltype AND o.confupdtype = c.confupdtype
          AND o.oid <> c.oid
      )
      -- y ninguna del grupo difiere en acciones: si alguna difiere, el grupo
      -- entero se deja intacto
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint o
        WHERE o.contype = 'f' AND o.conrelid = c.conrelid AND o.confrelid = c.confrelid
          AND o.conkey = c.conkey AND o.confkey = c.confkey
          AND (o.confdeltype <> c.confdeltype OR o.confupdtype <> c.confupdtype)
      )
      -- se conserva una por grupo: la de nombre canonico de PostgreSQL
      -- (`tabla_columna_fkey`) si la hay, y si no la primera por orden
      AND c.oid <> (
        SELECT o.oid FROM pg_constraint o
        WHERE o.contype = 'f' AND o.conrelid = c.conrelid AND o.confrelid = c.confrelid
          AND o.conkey = c.conkey AND o.confkey = c.confkey
          AND o.confdeltype = c.confdeltype AND o.confupdtype = c.confupdtype
        ORDER BY (o.conname LIKE '%\_fkey') DESC, o.conname
        LIMIT 1
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.conname);
    v_retiradas := v_retiradas + 1;
  END LOOP;

  RAISE NOTICE 'Migracion 515: % claves ajenas duplicadas retiradas', v_retiradas;
END;
$migracion$;

COMMIT;
NOTIFY pgrst, 'reload schema';
