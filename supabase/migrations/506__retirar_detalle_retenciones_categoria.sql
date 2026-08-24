-- 506__retirar_detalle_retenciones_categoria.sql
--
-- `public.detalle_retenciones_categoria` existe desde el esqueleto 002 y nunca
-- se uso. Comprobado antes de retirarla, y no de oido:
--
--   * Cero `.from('detalle_retenciones_categoria')` en todo el TypeScript.
--   * Cero migraciones posteriores a la 002 que la nombren: ni una columna
--     anadida, ni un indice, ni una funcion. Las unicas menciones son los bucles
--     genericos que aplican RLS y el trigger de `updated_at` a toda tabla con
--     `tenant_id`.
--   * Cero filas en produccion.
--
-- Es el mismo patron que tenia `sucursales` antes de la 503 y que tenia el par
-- `permissions`/`role_permissions` antes de la 502: una tabla que parece que
-- guarda algo, que aparece en los inventarios de esquema, y que no participa en
-- ningun flujo. El coste no es el espacio: es que la proxima persona que audite
-- retenciones por categoria la encuentre, suponga que ahi estan los datos, y
-- construya sobre un sitio muerto.
--
-- Lo que si esta vivo se deja intacto y conviene no confundirlo:
--
--   * `libro_retenciones` la lee `planilla-electronica-peru.service.ts` para la
--     cuarta categoria del T-Registro. Esta vacia porque nadie la escribe
--     todavia --la retencion del 8% no se calcula-- pero es el destino correcto
--     cuando se implemente, no una tabla muerta.
--   * `configuracion_retenciones` tiene 130 filas en produccion y su propia
--     migracion de alineacion (086).
--
-- Se retira con `DROP TABLE` **sin CASCADE** a proposito, igual que en la 502:
-- si algo dependiera de ella sin que lo hayamos localizado, es preferible que
-- reviente en el cluster efimero del gate a que caiga en silencio.

BEGIN;

DO $$
DECLARE
  v_filas bigint;
BEGIN
  IF to_regclass('public.detalle_retenciones_categoria') IS NULL THEN
    RETURN;
  END IF;

  -- Si alguien empezo a usarla entre la auditoria y esta migracion, no se
  -- retira nada: se para y se avisa.
  EXECUTE 'SELECT count(*) FROM public.detalle_retenciones_categoria' INTO v_filas;
  IF v_filas > 0 THEN
    RAISE EXCEPTION
      'RETENCIONES: detalle_retenciones_categoria tiene % filas; dejo de ser una tabla muerta y no se retira', v_filas;
  END IF;
END
$$;

DROP TABLE IF EXISTS public.detalle_retenciones_categoria;

COMMIT;
