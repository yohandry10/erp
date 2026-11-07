-- Un colaborador no puede tener dos ausencias vigentes en el mismo día: dos
-- vacaciones aprobadas que se cruzan descuentan dos veces el mismo saldo.
--
-- La regla vive en la base y no en el API porque debe respetar la idempotencia
-- del writer 475: un reintento exacto devuelve la respuesta guardada sin volver
-- a insertar, así que este trigger no lo ve y no lo confunde con un cruce. Una
-- validación previa en el API sí lo confundía (la solicitud ya creada se
-- encontraba a sí misma) y no cubría dos altas concurrentes.
--
-- Al crear se compara contra pendientes y aprobadas; al aprobar, sólo contra
-- aprobadas (otra pendiente todavía puede rechazarse). Rechazar o cancelar nunca
-- se bloquea. No valida filas históricas: sólo las altas y cambios posteriores.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION app.rrhh_solicitud_sin_cruce_610()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
DECLARE
 v_estado text:=lower(coalesce(NEW.estado,''));
 v_estados text[];
 v_cruce record;
BEGIN
 IF NOT coalesce(NEW.activo,true) OR NEW.id_empleado IS NULL
    OR NEW.fecha_inicio IS NULL OR NEW.fecha_fin IS NULL THEN
  RETURN NULL;
 END IF;
 IF v_estado='pendiente' THEN
  v_estados:=ARRAY['pendiente','aprobada'];
 ELSIF v_estado='aprobada' THEN
  v_estados:=ARRAY['aprobada'];
 ELSE
  RETURN NULL;
 END IF;
 IF TG_OP='UPDATE'
    AND lower(coalesce(OLD.estado,''))=v_estado
    AND OLD.id_empleado IS NOT DISTINCT FROM NEW.id_empleado
    AND OLD.fecha_inicio IS NOT DISTINCT FROM NEW.fecha_inicio
    AND OLD.fecha_fin IS NOT DISTINCT FROM NEW.fecha_fin
    AND coalesce(OLD.activo,true) THEN
  RETURN NULL;
 END IF;
 -- Serializa las altas y aprobaciones del mismo colaborador; la consulta
 -- siguiente ve lo que otra transacción confirmó mientras se esperaba.
 PERFORM pg_advisory_xact_lock(hashtextextended(
  NEW.tenant_id::text||':rrhh:solicitudes:'||NEW.id_empleado::text,610));
 SELECT s.estado,s.tipo,s.fecha_inicio,s.fecha_fin INTO v_cruce
 FROM public.solicitudes s
 WHERE s.tenant_id=NEW.tenant_id AND s.id_empleado=NEW.id_empleado AND s.id<>NEW.id
   AND coalesce(s.activo,true) AND lower(s.estado)=ANY(v_estados)
   AND s.fecha_inicio<=NEW.fecha_fin AND s.fecha_fin>=NEW.fecha_inicio
 ORDER BY s.fecha_inicio,s.id
 LIMIT 1;
 IF FOUND THEN
  RAISE EXCEPTION 'RRHH_REQUEST_OVERLAP: estado=% tipo=% desde=% hasta=%',
   lower(v_cruce.estado),v_cruce.tipo,v_cruce.fecha_inicio,v_cruce.fecha_fin
   USING ERRCODE='23P01';
 END IF;
 RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION app.rrhh_solicitud_sin_cruce_610() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS trg_solicitudes_sin_cruce_610 ON public.solicitudes;
CREATE TRIGGER trg_solicitudes_sin_cruce_610
AFTER INSERT OR UPDATE OF estado,id_empleado,fecha_inicio,fecha_fin,activo ON public.solicitudes
FOR EACH ROW EXECUTE FUNCTION app.rrhh_solicitud_sin_cruce_610();

COMMENT ON FUNCTION app.rrhh_solicitud_sin_cruce_610() IS
 '610: impide ausencias vigentes que se cruzan para el mismo colaborador; no toca reintentos idempotentes ni filas históricas.';
-- Rollback: detener el binario que exige 610 y desplegar el anterior; luego
-- DROP TRIGGER trg_solicitudes_sin_cruce_610 ON public.solicitudes y
-- DROP FUNCTION app.rrhh_solicitud_sin_cruce_610(). Sin datos que revertir.
COMMIT;
