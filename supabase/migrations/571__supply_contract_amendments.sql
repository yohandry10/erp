-- F01 segundo incremento: adendas, modificación/anulación de OC y precios
-- congelados. Conserva la RPC 570 para compatibilidad; reemplazo explícito del
-- writer para compartir el mismo lock de contrato e intención idempotente.
-- Backfill: 570 no permite cambiar precios activos, por lo que el precio vigente
-- coincide con el de registro de cada OC. No modifica stock ni contabilidad.
-- Rollback operativo: deshabilitar estas acciones; conservar estado e historial.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;
ALTER TABLE public.suministro_ordenes_cliente
  ADD COLUMN estado text NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA','ANULADA')),
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version>0);
ALTER TABLE public.suministro_orden_lineas ADD COLUMN precio_unitario numeric(18,6);
UPDATE public.suministro_orden_lineas ol SET precio_unitario=cl.precio_unitario
  FROM public.suministro_contrato_lineas cl WHERE cl.id=ol.contrato_linea_id AND cl.tenant_id=ol.tenant_id;
ALTER TABLE public.suministro_orden_lineas ALTER COLUMN precio_unitario SET NOT NULL;
ALTER TABLE public.suministro_orden_lineas ADD CHECK (precio_unitario>=0);
ALTER TABLE public.suministro_historial ADD COLUMN referencia text
  CHECK (referencia=upper(btrim(referencia)) AND length(referencia) BETWEEN 1 AND 80);
CREATE UNIQUE INDEX suministro_revision_referencia_571
  ON public.suministro_historial(tenant_id,recurso_id,accion,referencia) WHERE referencia IS NOT NULL;

CREATE OR REPLACE FUNCTION app.suministro_detalle_570(p_tenant_id uuid, p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
  SELECT to_jsonb(c) || jsonb_build_object(
    'cliente_nombre', (SELECT coalesce(cl.razon_social, cl.nombre) FROM public.clientes cl
      WHERE cl.id=c.cliente_id AND cl.tenant_id=c.tenant_id),
    'responsable_nombre', (SELECT concat_ws(' ',u.nombre,u.apellido) FROM public.usuarios_sistema u
      WHERE u.id=c.responsable_id AND u.tenant_id=c.tenant_id),
    'lineas', coalesce((SELECT jsonb_agg(to_jsonb(l) || jsonb_build_object(
      'cantidad_en_oc', coalesce((SELECT sum(ol.cantidad) FROM public.suministro_orden_lineas ol
        JOIN public.suministro_ordenes_cliente oc ON oc.id=ol.orden_cliente_id AND oc.tenant_id=ol.tenant_id
        WHERE ol.tenant_id=l.tenant_id AND ol.contrato_linea_id=l.id AND oc.estado='ACTIVA'),0)) ORDER BY l.orden)
      FROM public.suministro_contrato_lineas l WHERE l.tenant_id=c.tenant_id AND l.contrato_id=c.id),'[]'::jsonb),
    'ordenes', coalesce((SELECT jsonb_agg(to_jsonb(o) || jsonb_build_object('lineas', coalesce((
      SELECT jsonb_agg(to_jsonb(ol) || jsonb_build_object('cantidad_programada', coalesce((
        SELECT sum(e.cantidad) FROM public.suministro_entregas_programadas e
        WHERE e.tenant_id=ol.tenant_id AND e.orden_linea_id=ol.id AND e.estado='PROGRAMADA'),0)) ORDER BY ol.id)
      FROM public.suministro_orden_lineas ol WHERE ol.tenant_id=o.tenant_id AND ol.orden_cliente_id=o.id),'[]'::jsonb))
      ORDER BY o.created_at,o.id) FROM public.suministro_ordenes_cliente o
      WHERE o.tenant_id=c.tenant_id AND o.contrato_id=c.id),'[]'::jsonb),
    'entregas', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.fecha_programada,e.id)
      FROM public.suministro_entregas_programadas e WHERE e.tenant_id=c.tenant_id AND e.contrato_id=c.id),'[]'::jsonb),
    'historial', coalesce((SELECT jsonb_agg(to_jsonb(h) || jsonb_build_object('actor_nombre',
      (SELECT concat_ws(' ',u.nombre,u.apellido) FROM public.usuarios_sistema u
        WHERE u.id=h.actor_id AND u.tenant_id=h.tenant_id)) ORDER BY h.created_at,h.id)
      FROM public.suministro_historial h WHERE h.tenant_id=c.tenant_id AND h.contrato_id=c.id),'[]'::jsonb))
  FROM public.suministro_contratos c WHERE c.tenant_id=p_tenant_id AND c.id=p_id;
$fn$;

CREATE OR REPLACE FUNCTION public.operar_suministro_570(
  p_tenant_id uuid, p_actor_id uuid, p_accion text, p_id uuid, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key,'')); v_hash text; v_op public.suministro_operaciones;
  v_c public.suministro_contratos; v_oc public.suministro_ordenes_cliente;
  v_l public.suministro_contrato_lineas; v_ol public.suministro_orden_lineas;
  v_e public.suministro_entregas_programadas; v_contrato_id uuid; v_id uuid;
  v_row jsonb; v_old jsonb; v_new jsonb; v_result jsonb; v_index integer := 0; v_seen uuid[] := ARRAY[]::uuid[];
  v_referencia text := nullif(upper(btrim(p_payload->>'referencia')),'');
  v_cantidad numeric; v_precio numeric; v_total numeric; v_fecha date; v_desde date; v_hasta date;
  v_motivo text := nullif(btrim(p_payload->>'motivo'),''); v_producto public.productos;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.gestionar');
  IF length(v_key) NOT BETWEEN 8 AND 180 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR p_accion IS NULL OR p_accion NOT IN ('CREAR_CONTRATO','EDITAR_BORRADOR','ACTIVAR','ANULAR_BORRADOR',
      'CREAR_OC','PROGRAMAR','REPROGRAMAR','ANULAR_ENTREGA','ADENDAR','MODIFICAR_OC','ANULAR_OC') THEN
    RAISE EXCEPTION 'SUPPLY_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('accion',p_accion,'id',p_id,'payload',p_payload)::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':suministro:'||v_key,570));
  SELECT * INTO v_op FROM public.suministro_operaciones WHERE tenant_id=p_tenant_id AND idempotency_key=v_key;
  IF FOUND THEN
    IF v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.fingerprint IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN v_op.resultado || jsonb_build_object('idempotent',true);
  END IF;

  IF p_accion='CREAR_CONTRATO' THEN
    IF p_id IS NOT NULL THEN RAISE EXCEPTION 'SUPPLY_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  ELSE
    v_contrato_id := CASE WHEN p_accion IN ('REPROGRAMAR','ANULAR_ENTREGA') THEN (
      SELECT contrato_id FROM public.suministro_entregas_programadas WHERE tenant_id=p_tenant_id AND id=p_id)
      WHEN p_accion IN ('MODIFICAR_OC','ANULAR_OC') THEN (
      SELECT contrato_id FROM public.suministro_ordenes_cliente WHERE tenant_id=p_tenant_id AND id=p_id)
      ELSE p_id END;
    SELECT * INTO v_c FROM public.suministro_contratos WHERE tenant_id=p_tenant_id AND id=v_contrato_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    v_old := to_jsonb(v_c);
  END IF;

  IF p_accion IN ('CREAR_CONTRATO','EDITAR_BORRADOR') THEN
    IF p_accion='EDITAR_BORRADOR' AND (v_c.estado<>'BORRADOR' OR v_c.version IS DISTINCT FROM (p_payload->>'version')::integer) THEN
      RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
    IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
    IF jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE tenant_id=p_tenant_id AND id=(p_payload->>'cliente_id')::uuid AND activo)
      OR NOT EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE tenant_id=p_tenant_id
        AND id=(p_payload->>'responsable_id')::uuid AND activo AND lower(estado::text)='activo') THEN
      RAISE EXCEPTION 'SUPPLY_PARTY_INVALID' USING ERRCODE='23514'; END IF;
    v_desde := (p_payload->>'vigencia_desde')::date; v_hasta := (p_payload->>'vigencia_hasta')::date;
    IF p_accion='CREAR_CONTRATO' THEN
      INSERT INTO public.suministro_contratos(tenant_id,cliente_id,numero,asunto,moneda,vigencia_desde,vigencia_hasta,responsable_id,observaciones,created_by)
      VALUES(p_tenant_id,(p_payload->>'cliente_id')::uuid,upper(btrim(p_payload->>'numero')),btrim(p_payload->>'asunto'),
        p_payload->>'moneda',v_desde,v_hasta,(p_payload->>'responsable_id')::uuid,nullif(btrim(p_payload->>'observaciones'),''),p_actor_id)
      RETURNING * INTO v_c;
      v_contrato_id := v_c.id;
    ELSE
      v_old := app.suministro_detalle_570(p_tenant_id,v_c.id) - 'historial';
      DELETE FROM public.suministro_contrato_lineas WHERE tenant_id=p_tenant_id AND contrato_id=v_c.id;
      UPDATE public.suministro_contratos SET cliente_id=(p_payload->>'cliente_id')::uuid,
        numero=upper(btrim(p_payload->>'numero')),asunto=btrim(p_payload->>'asunto'),moneda=p_payload->>'moneda',
        vigencia_desde=v_desde,vigencia_hasta=v_hasta,responsable_id=(p_payload->>'responsable_id')::uuid,
        observaciones=nullif(btrim(p_payload->>'observaciones'),''),version=version+1,updated_at=now()
      WHERE id=v_c.id RETURNING * INTO v_c;
    END IF;
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
      v_index := v_index+1; v_cantidad := (v_row->>'cantidad')::numeric; v_precio := (v_row->>'precio_unitario')::numeric;
      IF v_cantidad IS NULL OR v_cantidad::text !~ '^[0-9]+([.][0-9]+)?$' OR v_cantidad<=0 OR v_cantidad<>round(v_cantidad,4)
        OR v_precio IS NULL OR v_precio::text !~ '^[0-9]+([.][0-9]+)?$' OR v_precio<0 OR v_precio<>round(v_precio,6) THEN
        RAISE EXCEPTION 'SUPPLY_QUANTITY_INVALID' USING ERRCODE='23514'; END IF;
      SELECT * INTO v_producto FROM public.productos WHERE tenant_id=p_tenant_id AND id=(v_row->>'producto_id')::uuid AND activo;
      IF NOT FOUND OR nullif(btrim(v_producto.unidad_medida),'') IS NULL THEN
        RAISE EXCEPTION 'SUPPLY_PRODUCT_INVALID' USING ERRCODE='23514'; END IF;
      INSERT INTO public.suministro_contrato_lineas(tenant_id,contrato_id,producto_id,codigo_producto,descripcion,unidad_medida,cantidad,precio_unitario,orden)
      VALUES(p_tenant_id,v_c.id,v_producto.id,v_producto.codigo,v_producto.nombre,v_producto.unidad_medida,v_cantidad,v_precio,v_index);
    END LOOP;
    v_id := v_c.id; v_new := app.suministro_detalle_570(p_tenant_id,v_id) - 'historial';
  ELSIF p_accion IN ('ACTIVAR','ANULAR_BORRADOR') THEN
    IF v_c.estado<>'BORRADOR' OR v_c.version IS DISTINCT FROM (p_payload->>'version')::integer THEN
      RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
    IF p_accion='ANULAR_BORRADOR' AND coalesce(length(v_motivo),0) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'SUPPLY_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
    UPDATE public.suministro_contratos SET estado=CASE WHEN p_accion='ACTIVAR' THEN 'ACTIVO' ELSE 'ANULADO' END,
      version=version+1,updated_at=now() WHERE id=v_c.id RETURNING to_jsonb(suministro_contratos.*) INTO v_new;
    v_id := v_c.id;
  ELSE
    IF v_c.estado<>'ACTIVO' THEN RAISE EXCEPTION 'SUPPLY_CONTRACT_NOT_ACTIVE' USING ERRCODE='23505'; END IF;
    IF p_accion IN ('ADENDAR','MODIFICAR_OC','ANULAR_OC') THEN
      IF coalesce(length(v_motivo),0) NOT BETWEEN 5 AND 1000
        OR coalesce(length(v_referencia),0) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'SUPPLY_REVISION_REQUIRED' USING ERRCODE='22023'; END IF;
      IF p_accion='ADENDAR' THEN
        IF v_c.version IS DISTINCT FROM (p_payload->>'version')::integer THEN
          RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
        IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
        IF jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 200 THEN
          RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
        v_hasta := (p_payload->>'vigencia_hasta')::date;
        IF v_hasta IS NULL OR v_hasta<v_c.vigencia_desde OR EXISTS (
          SELECT 1 FROM public.suministro_ordenes_cliente WHERE tenant_id=p_tenant_id AND contrato_id=v_c.id
            AND estado='ACTIVA' AND fecha_emision>v_hasta) OR EXISTS (
          SELECT 1 FROM public.suministro_entregas_programadas WHERE tenant_id=p_tenant_id AND contrato_id=v_c.id
            AND estado='PROGRAMADA' AND fecha_programada>v_hasta) THEN
          RAISE EXCEPTION 'SUPPLY_REVISION_DATE_CONFLICT' USING ERRCODE='23514'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE tenant_id=p_tenant_id
          AND id=(p_payload->>'responsable_id')::uuid AND activo AND lower(estado::text)='activo') THEN
          RAISE EXCEPTION 'SUPPLY_PARTY_INVALID' USING ERRCODE='23514'; END IF;
        v_old := app.suministro_detalle_570(p_tenant_id,v_c.id) - 'historial';
        SELECT coalesce(max(orden),0) INTO v_index FROM public.suministro_contrato_lineas WHERE contrato_id=v_c.id;
        FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
          v_cantidad := (v_row->>'cantidad')::numeric; v_precio := (v_row->>'precio_unitario')::numeric;
          IF v_cantidad IS NULL OR v_cantidad::text !~ '^[0-9]+([.][0-9]+)?$' OR v_cantidad<=0 OR v_cantidad<>round(v_cantidad,4)
            OR v_precio IS NULL OR v_precio::text !~ '^[0-9]+([.][0-9]+)?$' OR v_precio<0 OR v_precio<>round(v_precio,6) THEN
            RAISE EXCEPTION 'SUPPLY_QUANTITY_INVALID' USING ERRCODE='23514'; END IF;
          IF nullif(v_row->>'id','') IS NOT NULL THEN
            SELECT * INTO v_l FROM public.suministro_contrato_lineas WHERE tenant_id=p_tenant_id
              AND contrato_id=v_c.id AND id=(v_row->>'id')::uuid;
            IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_LINE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
            IF v_l.id=ANY(v_seen) OR v_l.producto_id IS DISTINCT FROM (v_row->>'producto_id')::uuid THEN
              RAISE EXCEPTION 'SUPPLY_REVISION_LINE_CONFLICT' USING ERRCODE='23514'; END IF;
            SELECT coalesce(sum(ol.cantidad),0) INTO v_total FROM public.suministro_orden_lineas ol
              JOIN public.suministro_ordenes_cliente oc ON oc.id=ol.orden_cliente_id AND oc.tenant_id=ol.tenant_id
              WHERE ol.tenant_id=p_tenant_id AND ol.contrato_linea_id=v_l.id AND oc.estado='ACTIVA';
            IF v_cantidad<v_total THEN RAISE EXCEPTION 'SUPPLY_OC_EXCEEDS_CONTRACT' USING ERRCODE='23514'; END IF;
            UPDATE public.suministro_contrato_lineas SET cantidad=v_cantidad,precio_unitario=v_precio WHERE id=v_l.id;
          ELSE
            SELECT * INTO v_producto FROM public.productos WHERE tenant_id=p_tenant_id AND id=(v_row->>'producto_id')::uuid AND activo;
            IF NOT FOUND OR nullif(btrim(v_producto.unidad_medida),'') IS NULL THEN
              RAISE EXCEPTION 'SUPPLY_PRODUCT_INVALID' USING ERRCODE='23514'; END IF;
            v_index:=v_index+1;
            INSERT INTO public.suministro_contrato_lineas(tenant_id,contrato_id,producto_id,codigo_producto,descripcion,unidad_medida,cantidad,precio_unitario,orden)
              VALUES(p_tenant_id,v_c.id,v_producto.id,v_producto.codigo,v_producto.nombre,v_producto.unidad_medida,v_cantidad,v_precio,v_index)
              RETURNING * INTO v_l;
          END IF;
          v_seen := array_append(v_seen,v_l.id);
        END LOOP;
        -- Las líneas con cualquier OC histórica se conservan, incluso si fue anulada.
        IF EXISTS (SELECT 1 FROM public.suministro_contrato_lineas cl JOIN public.suministro_orden_lineas ol ON ol.contrato_linea_id=cl.id
          WHERE cl.tenant_id=p_tenant_id AND cl.contrato_id=v_c.id AND NOT(cl.id=ANY(v_seen))) THEN
          RAISE EXCEPTION 'SUPPLY_REFERENCED_LINE' USING ERRCODE='23514'; END IF;
        DELETE FROM public.suministro_contrato_lineas WHERE tenant_id=p_tenant_id AND contrato_id=v_c.id AND NOT(id=ANY(v_seen));
        UPDATE public.suministro_contratos SET asunto=btrim(p_payload->>'asunto'),vigencia_hasta=v_hasta,
          responsable_id=(p_payload->>'responsable_id')::uuid,observaciones=nullif(btrim(p_payload->>'observaciones'),''),
          version=version+1,updated_at=now() WHERE id=v_c.id;
        v_id:=v_c.id; v_new:=app.suministro_detalle_570(p_tenant_id,v_c.id) - 'historial';
      ELSE
        SELECT * INTO v_oc FROM public.suministro_ordenes_cliente WHERE tenant_id=p_tenant_id AND id=p_id;
        IF v_oc.estado<>'ACTIVA' OR v_oc.version IS DISTINCT FROM (p_payload->>'version')::integer THEN
          RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
        v_old := (SELECT o FROM jsonb_array_elements(app.suministro_detalle_570(p_tenant_id,v_c.id)->'ordenes') o WHERE o->>'id'=v_oc.id::text);
        IF p_accion='ANULAR_OC' THEN
          IF EXISTS (SELECT 1 FROM public.suministro_entregas_programadas e JOIN public.suministro_orden_lineas ol ON ol.id=e.orden_linea_id
            WHERE e.tenant_id=p_tenant_id AND ol.orden_cliente_id=v_oc.id AND e.estado='PROGRAMADA') THEN
            RAISE EXCEPTION 'SUPPLY_OC_HAS_SCHEDULES' USING ERRCODE='23514'; END IF;
          UPDATE public.suministro_ordenes_cliente SET estado='ANULADA',version=version+1 WHERE id=v_oc.id;
        ELSE
          IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
          IF jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
          v_fecha := (p_payload->>'fecha_emision')::date;
          IF v_fecha IS NULL OR v_fecha NOT BETWEEN v_c.vigencia_desde AND v_c.vigencia_hasta OR EXISTS (
            SELECT 1 FROM public.suministro_entregas_programadas e JOIN public.suministro_orden_lineas ol ON ol.id=e.orden_linea_id
            WHERE e.tenant_id=p_tenant_id AND ol.orden_cliente_id=v_oc.id AND e.estado='PROGRAMADA' AND e.fecha_programada<v_fecha) THEN
            RAISE EXCEPTION 'SUPPLY_REVISION_DATE_CONFLICT' USING ERRCODE='23514'; END IF;
          FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
            SELECT * INTO v_l FROM public.suministro_contrato_lineas WHERE tenant_id=p_tenant_id
              AND contrato_id=v_c.id AND id=(v_row->>'contrato_linea_id')::uuid;
            IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_LINE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
            IF v_l.id=ANY(v_seen) THEN RAISE EXCEPTION 'SUPPLY_REVISION_LINE_CONFLICT' USING ERRCODE='23514'; END IF;
            v_seen:=array_append(v_seen,v_l.id);
            v_cantidad := (v_row->>'cantidad')::numeric;
            IF v_cantidad IS NULL OR v_cantidad::text !~ '^[0-9]+([.][0-9]+)?$' OR v_cantidad<=0 OR v_cantidad<>round(v_cantidad,4) THEN
              RAISE EXCEPTION 'SUPPLY_QUANTITY_INVALID' USING ERRCODE='23514'; END IF;
            SELECT coalesce(sum(ol.cantidad),0) INTO v_total FROM public.suministro_orden_lineas ol
              JOIN public.suministro_ordenes_cliente oc ON oc.id=ol.orden_cliente_id AND oc.tenant_id=ol.tenant_id
              WHERE ol.tenant_id=p_tenant_id AND ol.contrato_linea_id=v_l.id AND oc.estado='ACTIVA' AND oc.id<>v_oc.id;
            IF v_total+v_cantidad>v_l.cantidad THEN RAISE EXCEPTION 'SUPPLY_OC_EXCEEDS_CONTRACT' USING ERRCODE='23514'; END IF;
            SELECT * INTO v_ol FROM public.suministro_orden_lineas WHERE tenant_id=p_tenant_id AND orden_cliente_id=v_oc.id AND contrato_linea_id=v_l.id;
            IF FOUND THEN
              SELECT coalesce(sum(cantidad),0) INTO v_total FROM public.suministro_entregas_programadas
                WHERE tenant_id=p_tenant_id AND orden_linea_id=v_ol.id AND estado='PROGRAMADA';
              IF v_cantidad<v_total THEN RAISE EXCEPTION 'SUPPLY_SCHEDULE_EXCEEDS_OC' USING ERRCODE='23514'; END IF;
              UPDATE public.suministro_orden_lineas SET cantidad=v_cantidad WHERE id=v_ol.id;
            ELSE
              INSERT INTO public.suministro_orden_lineas(tenant_id,contrato_id,orden_cliente_id,contrato_linea_id,cantidad,precio_unitario)
                VALUES(p_tenant_id,v_c.id,v_oc.id,v_l.id,v_cantidad,v_l.precio_unitario);
            END IF;
          END LOOP;
          IF EXISTS (SELECT 1 FROM public.suministro_orden_lineas ol JOIN public.suministro_entregas_programadas e ON e.orden_linea_id=ol.id
            WHERE ol.tenant_id=p_tenant_id AND ol.orden_cliente_id=v_oc.id AND NOT(ol.contrato_linea_id=ANY(v_seen))) THEN
            RAISE EXCEPTION 'SUPPLY_REFERENCED_LINE' USING ERRCODE='23514'; END IF;
          DELETE FROM public.suministro_orden_lineas WHERE tenant_id=p_tenant_id AND orden_cliente_id=v_oc.id AND NOT(contrato_linea_id=ANY(v_seen));
          UPDATE public.suministro_ordenes_cliente SET numero=upper(btrim(p_payload->>'numero')),fecha_emision=v_fecha,version=version+1 WHERE id=v_oc.id;
        END IF;
        v_id:=v_oc.id;
        v_new := (SELECT o FROM jsonb_array_elements(app.suministro_detalle_570(p_tenant_id,v_c.id)->'ordenes') o WHERE o->>'id'=v_oc.id::text);
      END IF;
    ELSIF p_accion='CREAR_OC' THEN
      IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
      IF jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
      v_fecha := (p_payload->>'fecha_emision')::date;
      IF v_fecha IS NULL OR v_fecha NOT BETWEEN v_c.vigencia_desde AND v_c.vigencia_hasta THEN
        RAISE EXCEPTION 'SUPPLY_DATE_OUTSIDE_CONTRACT' USING ERRCODE='23514'; END IF;
      INSERT INTO public.suministro_ordenes_cliente(tenant_id,contrato_id,numero,fecha_emision,created_by)
      VALUES(p_tenant_id,v_c.id,upper(btrim(p_payload->>'numero')),v_fecha,p_actor_id) RETURNING * INTO v_oc;
      FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
        SELECT * INTO v_l FROM public.suministro_contrato_lineas
          WHERE tenant_id=p_tenant_id AND contrato_id=v_c.id AND id=(v_row->>'contrato_linea_id')::uuid;
        IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_LINE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
        v_cantidad := (v_row->>'cantidad')::numeric;
        IF v_cantidad IS NULL OR v_cantidad::text !~ '^[0-9]+([.][0-9]+)?$' OR v_cantidad<=0 OR v_cantidad<>round(v_cantidad,4) THEN
          RAISE EXCEPTION 'SUPPLY_QUANTITY_INVALID' USING ERRCODE='23514'; END IF;
        SELECT coalesce(sum(ol.cantidad),0) INTO v_total FROM public.suministro_orden_lineas ol
          JOIN public.suministro_ordenes_cliente oc ON oc.id=ol.orden_cliente_id AND oc.tenant_id=ol.tenant_id
          WHERE ol.tenant_id=p_tenant_id AND ol.contrato_linea_id=v_l.id AND oc.estado='ACTIVA';
        IF v_total+v_cantidad>v_l.cantidad THEN RAISE EXCEPTION 'SUPPLY_OC_EXCEEDS_CONTRACT' USING ERRCODE='23514'; END IF;
        INSERT INTO public.suministro_orden_lineas(tenant_id,contrato_id,orden_cliente_id,contrato_linea_id,cantidad,precio_unitario)
          VALUES(p_tenant_id,v_c.id,v_oc.id,v_l.id,v_cantidad,v_l.precio_unitario);
      END LOOP;
      v_id:=v_oc.id;
      v_new := (SELECT o FROM jsonb_array_elements(app.suministro_detalle_570(p_tenant_id,v_c.id)->'ordenes') o WHERE o->>'id'=v_oc.id::text);
    ELSIF p_accion='PROGRAMAR' THEN
      SELECT * INTO v_ol FROM public.suministro_orden_lineas WHERE tenant_id=p_tenant_id AND contrato_id=v_c.id AND id=(p_payload->>'orden_linea_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_LINE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      SELECT * INTO v_oc FROM public.suministro_ordenes_cliente WHERE tenant_id=p_tenant_id AND id=v_ol.orden_cliente_id;
      IF v_oc.estado<>'ACTIVA' THEN RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
      v_cantidad:=(p_payload->>'cantidad')::numeric; v_fecha:=(p_payload->>'fecha_programada')::date;
      IF v_cantidad IS NULL OR v_cantidad::text !~ '^[0-9]+([.][0-9]+)?$' OR v_cantidad<=0 OR v_cantidad<>round(v_cantidad,4) THEN
        RAISE EXCEPTION 'SUPPLY_QUANTITY_INVALID' USING ERRCODE='23514'; END IF;
      IF v_fecha IS NULL OR v_fecha<v_oc.fecha_emision OR v_fecha NOT BETWEEN v_c.vigencia_desde AND v_c.vigencia_hasta THEN
        RAISE EXCEPTION 'SUPPLY_DATE_OUTSIDE_CONTRACT' USING ERRCODE='23514'; END IF;
      SELECT coalesce(sum(cantidad),0) INTO v_total FROM public.suministro_entregas_programadas
        WHERE tenant_id=p_tenant_id AND orden_linea_id=v_ol.id AND estado='PROGRAMADA';
      IF v_total+v_cantidad>v_ol.cantidad THEN RAISE EXCEPTION 'SUPPLY_SCHEDULE_EXCEEDS_OC' USING ERRCODE='23514'; END IF;
      INSERT INTO public.suministro_entregas_programadas(tenant_id,contrato_id,orden_linea_id,cantidad,fecha_original,fecha_programada,destino,created_by)
        VALUES(p_tenant_id,v_c.id,v_ol.id,v_cantidad,v_fecha,v_fecha,btrim(p_payload->>'destino'),p_actor_id)
        RETURNING * INTO v_e;
      v_id:=v_e.id; v_new:=to_jsonb(v_e); v_old:=NULL;
    ELSE
      SELECT * INTO v_e FROM public.suministro_entregas_programadas WHERE tenant_id=p_tenant_id AND id=p_id FOR UPDATE;
      IF v_e.estado<>'PROGRAMADA' OR v_e.version IS DISTINCT FROM (p_payload->>'version')::integer THEN
        RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
      IF coalesce(length(v_motivo),0) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'SUPPLY_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
      v_old:=to_jsonb(v_e);
      IF p_accion='REPROGRAMAR' THEN
        v_fecha:=(p_payload->>'fecha_programada')::date;
        SELECT o.* INTO v_oc FROM public.suministro_ordenes_cliente o JOIN public.suministro_orden_lineas ol ON ol.orden_cliente_id=o.id
          WHERE ol.id=v_e.orden_linea_id AND ol.tenant_id=p_tenant_id AND o.tenant_id=p_tenant_id;
        IF v_fecha IS NULL OR v_fecha<v_oc.fecha_emision OR v_fecha NOT BETWEEN v_c.vigencia_desde AND v_c.vigencia_hasta THEN
          RAISE EXCEPTION 'SUPPLY_DATE_OUTSIDE_CONTRACT' USING ERRCODE='23514'; END IF;
        UPDATE public.suministro_entregas_programadas SET fecha_programada=v_fecha,destino=btrim(p_payload->>'destino'),version=version+1,updated_at=now()
          WHERE id=v_e.id RETURNING * INTO v_e;
      ELSE
        UPDATE public.suministro_entregas_programadas SET estado='ANULADA',version=version+1,updated_at=now()
          WHERE id=v_e.id RETURNING * INTO v_e;
      END IF;
      v_id:=v_e.id; v_new:=to_jsonb(v_e);
    END IF;
  END IF;
  INSERT INTO public.suministro_historial(tenant_id,contrato_id,recurso_id,accion,anterior,actual,motivo,actor_id,referencia)
    VALUES(p_tenant_id,v_contrato_id,v_id,p_accion,v_old,v_new,v_motivo,p_actor_id,v_referencia);
  INSERT INTO public.audit_log(tenant_id,user_id,table_name,operation,record_id,old_values,new_values,metadata)
    VALUES(p_tenant_id,p_actor_id,'suministro_contratos','UPDATE',v_contrato_id::text,v_old,v_new,
      jsonb_build_object('source','operar_suministro_570','accion',p_accion,'idempotency_key',v_key));
  v_result:=jsonb_build_object('id',v_id,'contrato_id',v_contrato_id,'accion',p_accion,'idempotent',false);
  INSERT INTO public.suministro_operaciones(tenant_id,idempotency_key,actor_id,fingerprint,resultado)
    VALUES(p_tenant_id,v_key,p_actor_id,v_hash,v_result);
  RETURN v_result;
END $fn$;

COMMIT;
