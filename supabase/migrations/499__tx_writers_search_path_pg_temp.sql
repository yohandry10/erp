-- 499__tx_writers_search_path_pg_temp.sql
--
-- Diez escritores atómicos de contabilidad e inventario fijan su `search_path`
-- pero no nombran `pg_temp`. Postgres, cuando el esquema temporal no aparece
-- nombrado en la ruta, lo busca **el primero** para resolver nombres de tabla.
-- En una función `SECURITY DEFINER` eso es el vector clásico de secuestro: quien
-- pueda crear una tabla temporal en la sesión consigue que la función escriba
-- sobre su tabla en vez de sobre la real, con los privilegios del propietario.
--
-- Las diez tocan tablas que importan: asientos_contables, detalle_asientos,
-- plan_cuentas, centros_costo, productos, activos_fijos, diferidos y
-- conciliaciones_partidas.
--
-- Hoy no es alcanzable desde el API: un cliente de PostgREST no ejecuta SQL
-- arbitrario y no puede crear tablas temporales. Se corrige igual, porque es una
-- desviación de la protección que ya siguen las otras 274 funciones `_tx` del
-- esquema, y porque «no alcanzable desde la superficie actual» deja de ser cierto
-- en cuanto algo más se conecte a la base.
--
-- El cambio es `ALTER FUNCTION ... SET search_path`: no toca el cuerpo, no cambia
-- comportamiento y no requiere recrear nada. Se añade `pg_temp` al final, que es
-- la forma recomendada — nombrarlo explícitamente en último lugar impide que se
-- busque antes que los esquemas reales.

BEGIN;

ALTER FUNCTION public.actualizar_asiento_borrador_tx(uuid, uuid, jsonb, jsonb)
  SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp';

ALTER FUNCTION public.asignar_distribucion_analitica_tx(uuid, uuid, text, jsonb, text)
  SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp';

ALTER FUNCTION public.conciliar_partidas_tx(uuid, uuid, text, numeric, date, text, text, jsonb)
  SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp';

ALTER FUNCTION public.crear_asiento_con_detalles_tx(uuid, jsonb, jsonb)
  SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp';

ALTER FUNCTION public.crear_producto_inventario_tx(uuid, jsonb, uuid, numeric, numeric, jsonb)
  SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp';

ALTER FUNCTION public.dar_baja_activo_tx(uuid, uuid, jsonb, jsonb, jsonb)
  SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp';

ALTER FUNCTION public.desconciliar_partidas_tx(uuid, uuid)
  SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp';

ALTER FUNCTION public.devengar_diferidos_tx(uuid, jsonb, jsonb, jsonb)
  SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp';

ALTER FUNCTION public.guardar_plantilla_con_detalles_tx(uuid, text, uuid, jsonb, jsonb)
  SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp';

ALTER FUNCTION public.transicionar_asiento_borrador_tx(uuid, uuid, text, text, text)
  SET search_path TO 'pg_catalog', 'public', 'app', 'pg_temp';

COMMIT;
