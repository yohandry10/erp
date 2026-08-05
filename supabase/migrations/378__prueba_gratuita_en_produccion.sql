-- ============================================================================
-- 378__prueba_gratuita_en_produccion.sql
-- La 346 puso una frontera entre DEV y PROD para que los fixtures de desarrollo
-- no ensuciaran producción, y la cerró con llave: un CHECK que hacía imposible
-- que PROD aceptara datos de demo aunque alguien lo pidiera a propósito.
--
-- Pero la prueba gratuita no es un fixture de desarrollo: es un cliente real
-- probando el sistema, y su cuenta tiene que nacer donde vivirá cuando pague,
-- para que al activarla conserve lo que cargó. Con la llave puesta, el embudo
-- entero —probar, transferir, activar— era irrealizable en producción.
--
-- Se quita la llave y se deja el interruptor: `allow_demo_data` sigue en false
-- por defecto y sigue siendo lo que consultan los triggers de la 346, así que
-- una base que no lo encienda a mano rechaza igual cualquier tenant DEMO/QA.
-- Tabla foco:
--   app.deployment_environment
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

ALTER TABLE app.deployment_environment
  DROP CONSTRAINT IF EXISTS ck_deployment_environment_prod_no_demo;

COMMENT ON COLUMN app.deployment_environment.allow_demo_data IS
  'Habilita cuentas de prueba en esta base. En PROD se enciende solo si el '
  'producto ofrece prueba gratuita; apagado, los triggers de la 346 rechazan '
  'todo tenant con identidad DEMO/QA. Se configura fuera de las migraciones.';

COMMIT;
