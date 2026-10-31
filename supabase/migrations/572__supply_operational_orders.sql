-- F01: vínculo completo de pedidos pendientes con programaciones, sin crear
-- reservas ni saltar las políticas de confirmación. Sin backfill de pedidos.
-- Locks: pedido antes de contrato. Rollback operativo: retirar la superficie;
-- conservar vínculos e impedir editar compromisos que sigan vigentes.
BEGIN;
SET LOCAL lock_timeout='10s';
CREATE TABLE public.suministro_pedidos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 contrato_id uuid NOT NULL, pedido_id uuid NOT NULL REFERENCES public.pedidos_venta(id) ON DELETE RESTRICT,
 estado text NOT NULL DEFAULT 'VINCULADO' CHECK (estado IN ('VINCULADO','DESVINCULADO')),
 actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,contrato_id) REFERENCES public.suministro_contratos(tenant_id,id),
 UNIQUE(tenant_id,contrato_id,id)
);
CREATE UNIQUE INDEX suministro_pedido_vigente_572 ON public.suministro_pedidos(pedido_id) WHERE estado='VINCULADO';
CREATE TABLE public.suministro_pedido_lineas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, contrato_id uuid NOT NULL,
 vinculo_id uuid NOT NULL, pedido_detalle_id uuid NOT NULL, entrega_id uuid NOT NULL REFERENCES public.suministro_entregas_programadas(id),
 cantidad numeric(18,4) NOT NULL CHECK(cantidad>0), precio_unitario numeric(18,6) NOT NULL CHECK(precio_unitario>=0),
 producto_id uuid NOT NULL, descripcion text NOT NULL,
 -- El ID de detalle es una referencia histórica validada al vincular. No lleva
 -- FK para permitir reemplazar detalles después de desvincular el borrador.
 FOREIGN KEY(tenant_id,contrato_id,vinculo_id) REFERENCES public.suministro_pedidos(tenant_id,contrato_id,id),
 UNIQUE(vinculo_id,pedido_detalle_id)
);
CREATE INDEX suministro_pedido_entrega_572 ON public.suministro_pedido_lineas(entrega_id,vinculo_id);
DO $secure$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['suministro_pedidos','suministro_pedido_lineas'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('CREATE POLICY suministro_private_572 ON public.%I USING(false) WITH CHECK(false)',t);
 END LOOP;
END $secure$;

CREATE FUNCTION app.suministro_pedido_snapshot_572(t uuid,p uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
 SELECT to_jsonb(pv)||jsonb_build_object('detalle',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id)
  FROM public.pedidos_venta_detalle d WHERE d.pedido_id=pv.id AND d.tenant_id=t),'[]'::jsonb))
 FROM public.pedidos_venta pv WHERE pv.tenant_id=t AND pv.id=p;
$fn$;
CREATE FUNCTION app.suministro_asignado_572(t uuid,e uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
 SELECT coalesce(sum(l.cantidad),0) FROM public.suministro_pedido_lineas l
 JOIN public.suministro_pedidos v ON v.id=l.vinculo_id AND v.tenant_id=l.tenant_id
 JOIN public.pedidos_venta p ON p.id=v.pedido_id AND p.tenant_id=v.tenant_id
 WHERE l.tenant_id=t AND l.entrega_id=e AND v.estado='VINCULADO' AND upper(p.estado)<>'CANCELADO';
$fn$;

CREATE FUNCTION public.consultar_suministro_pedidos_572(p_tenant_id uuid,p_actor_id uuid,p_contrato_id uuid,
 p_accion text,p_id uuid DEFAULT NULL,p_busqueda text DEFAULT '',p_pagina integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,app,extensions,pg_temp AS $fn$
DECLARE c public.suministro_contratos; d jsonb; q text:=btrim(coalesce(p_busqueda,''));
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.ver');
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.pedidos.ver');
 SELECT * INTO c FROM public.suministro_contratos WHERE id=p_contrato_id AND tenant_id=p_tenant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF p_pagina IS NULL OR p_pagina NOT BETWEEN 1 AND 100000 OR length(q)>120 THEN RAISE EXCEPTION 'SUPPLY_QUERY_INVALID' USING ERRCODE='22023'; END IF;
 IF p_accion='LISTAR' THEN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(v)||jsonb_build_object('numero',p.numero,'pedido_estado',p.estado,
    'lineas',(SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object('cantidad_despachada',coalesce(pd.cantidad_despachada,0),
       'cantidad_facturada',coalesce(pd.cantidad_facturada,0)) ORDER BY l.id)
      FROM public.suministro_pedido_lineas l LEFT JOIN public.pedidos_venta_detalle pd ON pd.id=l.pedido_detalle_id AND pd.tenant_id=l.tenant_id
      WHERE l.vinculo_id=v.id)) ORDER BY v.created_at,v.id)
    FROM public.suministro_pedidos v JOIN public.pedidos_venta p ON p.id=v.pedido_id AND p.tenant_id=v.tenant_id
    WHERE v.tenant_id=p_tenant_id AND v.contrato_id=c.id),'[]'::jsonb);
 ELSIF p_accion='CANDIDATOS' THEN
  q:=replace(replace(replace(q,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (
    SELECT p.id,p.numero,p.estado,p.moneda,p.fecha_pedido FROM public.pedidos_venta p WHERE p.tenant_id=p_tenant_id
    AND p.cliente_id=c.cliente_id AND p.moneda=c.moneda AND upper(p.estado)='PENDIENTE' AND p.numero ILIKE '%'||q||'%'
    AND NOT EXISTS(SELECT 1 FROM public.suministro_pedidos v WHERE v.pedido_id=p.id AND v.estado='VINCULADO')
    ORDER BY p.created_at DESC,p.id LIMIT 25 OFFSET (p_pagina-1)*25) s),'[]'::jsonb);
 ELSIF p_accion='CANDIDATO' THEN
  d:=app.suministro_pedido_snapshot_572(p_tenant_id,p_id);
  IF d IS NULL OR d->>'cliente_id'<>c.cliente_id::text OR d->>'moneda'<>c.moneda THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  RETURN d||jsonb_build_object('fingerprint',encode(extensions.digest(convert_to(d::text,'UTF8'),'sha256'),'hex'));
 END IF;
 RAISE EXCEPTION 'SUPPLY_ACTION_INVALID' USING ERRCODE='22023';
END $fn$;

CREATE FUNCTION public.operar_suministro_pedidos_572(p_tenant_id uuid,p_actor_id uuid,p_contrato_id uuid,p_accion text,
 p_pedido_id uuid,p_payload jsonb,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp AS $fn$
DECLARE c public.suministro_contratos; p public.pedidos_venta; v public.suministro_pedidos;
 op public.suministro_operaciones; e public.suministro_entregas_programadas; ol public.suministro_orden_lineas;
 cl public.suministro_contrato_lineas; d public.pedidos_venta_detalle; v_row jsonb; snap jsonb; result jsonb;
 k text:=btrim(coalesce(p_idempotency_key,'')); h text; reason text:=btrim(p_payload->>'motivo'); ids uuid[]:=ARRAY[]::uuid[];
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.gestionar');
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.pedidos.ver');
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.pedidos.editar');
 IF p_accion IS NULL OR p_accion NOT IN ('VINCULAR_PEDIDO','DESVINCULAR_PEDIDO') OR length(k) NOT BETWEEN 8 AND 180
  OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR coalesce(length(reason),0) NOT BETWEEN 5 AND 1000 THEN
  RAISE EXCEPTION 'SUPPLY_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 h:=encode(extensions.digest(convert_to(jsonb_build_object('accion',p_accion,'contrato',p_contrato_id,'id',p_pedido_id,'payload',p_payload)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':suministro:'||k,570));
 SELECT * INTO op FROM public.suministro_operaciones WHERE tenant_id=p_tenant_id AND idempotency_key=k;
 IF FOUND THEN
  IF op.actor_id IS DISTINCT FROM p_actor_id OR op.fingerprint IS DISTINCT FROM h THEN RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN op.resultado||'{"idempotent":true}'::jsonb;
 END IF;
 SELECT * INTO p FROM public.pedidos_venta WHERE tenant_id=p_tenant_id AND id=p_pedido_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO c FROM public.suministro_contratos WHERE tenant_id=p_tenant_id AND id=p_contrato_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF c.estado<>'ACTIVO' OR upper(p.estado)<>'PENDIENTE' THEN RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p.cliente_id<>c.cliente_id OR p.moneda<>c.moneda THEN RAISE EXCEPTION 'SUPPLY_ORDER_MISMATCH' USING ERRCODE='23514'; END IF;
 IF p.factura_id IS NOT NULL OR p.gre_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.pedidos_venta_detalle executed_line
  WHERE executed_line.pedido_id=p.id AND executed_line.tenant_id=p_tenant_id
   AND (coalesce(executed_line.cantidad_despachada,0)>0 OR coalesce(executed_line.cantidad_facturada,0)>0)) THEN
  RAISE EXCEPTION 'SUPPLY_ORDER_MISMATCH' USING ERRCODE='23514'; END IF;
 IF p_accion='VINCULAR_PEDIDO' THEN
  snap:=app.suministro_pedido_snapshot_572(p_tenant_id,p.id);
  IF p_payload->>'fingerprint' IS DISTINCT FROM encode(extensions.digest(convert_to(snap::text,'UTF8'),'sha256'),'hex') THEN
   RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
  IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'SUPPLY_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
  INSERT INTO public.suministro_pedidos(tenant_id,contrato_id,pedido_id,actor_id) VALUES(p_tenant_id,c.id,p.id,p_actor_id) RETURNING * INTO v;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
   SELECT * INTO d FROM public.pedidos_venta_detalle WHERE tenant_id=p_tenant_id AND pedido_id=p.id AND id=(v_row->>'pedido_detalle_id')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_LINE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   IF d.id=ANY(ids) OR d.cantidad<=0 OR d.cantidad<>round(d.cantidad,4) THEN RAISE EXCEPTION 'SUPPLY_ORDER_MISMATCH' USING ERRCODE='23514'; END IF;
   ids:=array_append(ids,d.id);
   SELECT * INTO e FROM public.suministro_entregas_programadas WHERE tenant_id=p_tenant_id AND contrato_id=c.id AND id=(v_row->>'entrega_id')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_LINE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   SELECT * INTO ol FROM public.suministro_orden_lineas WHERE tenant_id=p_tenant_id AND id=e.orden_linea_id;
   SELECT * INTO cl FROM public.suministro_contrato_lineas WHERE tenant_id=p_tenant_id AND id=ol.contrato_linea_id;
   IF e.estado<>'PROGRAMADA' OR NOT EXISTS(SELECT 1 FROM public.suministro_ordenes_cliente WHERE id=ol.orden_cliente_id AND tenant_id=p_tenant_id AND estado='ACTIVA')
    OR d.producto_id<>cl.producto_id OR d.precio_unitario<>ol.precio_unitario OR coalesce(d.cantidad_despachada,0)>0
    OR coalesce(d.cantidad_facturada,0)>0 THEN RAISE EXCEPTION 'SUPPLY_ORDER_MISMATCH' USING ERRCODE='23514'; END IF;
   -- La suma incluye las líneas previas de este mismo pedido en esta transacción.
   IF app.suministro_asignado_572(p_tenant_id,e.id)+d.cantidad>e.cantidad THEN
    RAISE EXCEPTION 'SUPPLY_ORDER_EXCEEDS_SCHEDULE' USING ERRCODE='23514'; END IF;
   INSERT INTO public.suministro_pedido_lineas(tenant_id,contrato_id,vinculo_id,pedido_detalle_id,entrega_id,cantidad,precio_unitario,producto_id,descripcion)
    VALUES(p_tenant_id,c.id,v.id,d.id,e.id,d.cantidad,d.precio_unitario,d.producto_id,d.descripcion);
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.pedidos_venta_detalle WHERE pedido_id=p.id AND tenant_id=p_tenant_id AND NOT(id=ANY(ids))) THEN
   RAISE EXCEPTION 'SUPPLY_ORDER_MAPPING_INCOMPLETE' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO v FROM public.suministro_pedidos WHERE tenant_id=p_tenant_id AND contrato_id=c.id AND pedido_id=p.id AND estado='VINCULADO';
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  UPDATE public.suministro_pedidos SET estado='DESVINCULADO' WHERE id=v.id;
 END IF;
 snap:=to_jsonb(v)||jsonb_build_object('lineas',(SELECT jsonb_agg(to_jsonb(l)) FROM public.suministro_pedido_lineas l WHERE vinculo_id=v.id),
  'estado',CASE WHEN p_accion='VINCULAR_PEDIDO' THEN 'VINCULADO' ELSE 'DESVINCULADO' END,'pedido_numero',p.numero);
 INSERT INTO public.suministro_historial(tenant_id,contrato_id,recurso_id,accion,actual,motivo,actor_id)
 VALUES(p_tenant_id,c.id,v.id,p_accion,snap,reason,p_actor_id);
 INSERT INTO public.audit_log(tenant_id,user_id,table_name,operation,record_id,new_values,metadata)
 VALUES(p_tenant_id,p_actor_id,'suministro_pedidos','UPDATE',v.id::text,snap,jsonb_build_object('source','operar_suministro_pedidos_572','accion',p_accion));
 result:=jsonb_build_object('id',v.id,'contrato_id',c.id,'accion',p_accion,'idempotent',false);
 INSERT INTO public.suministro_operaciones(tenant_id,idempotency_key,actor_id,fingerprint,resultado) VALUES(p_tenant_id,k,p_actor_id,h,result);
 RETURN result;
END $fn$;

-- Integridad aun si el pedido se modifica desde sus writers canónicos o DML
-- autorizado. Se mantienen libres los campos de logística/facturación.
CREATE FUNCTION app.proteger_pedido_suministro_572() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE p uuid; t uuid; c uuid;
BEGIN
 IF TG_TABLE_NAME='pedidos_venta_detalle' THEN
  IF TG_OP='UPDATE' THEN
   IF (NEW.pedido_id,NEW.tenant_id) IS DISTINCT FROM (OLD.pedido_id,OLD.tenant_id) THEN
    -- Mover una línea desde un pedido libre a uno vinculado también es una
    -- modificación del destino. Bloquear ambos padres en orden consistente.
    PERFORM 1 FROM public.pedidos_venta pv
     WHERE (pv.id,pv.tenant_id) IN ((OLD.pedido_id,OLD.tenant_id),(NEW.pedido_id,NEW.tenant_id))
     ORDER BY pv.tenant_id,pv.id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM public.suministro_pedidos v WHERE v.estado='VINCULADO'
     AND (v.pedido_id,v.tenant_id) IN ((OLD.pedido_id,OLD.tenant_id),(NEW.pedido_id,NEW.tenant_id))) THEN
     RAISE EXCEPTION 'SUPPLY_LINKED_ORDER_IMMUTABLE' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='pedidos_venta' THEN p:=OLD.id;
 ELSIF TG_OP='INSERT' THEN p:=NEW.pedido_id;
 ELSE p:=OLD.pedido_id; END IF;
 t:=CASE WHEN TG_OP='INSERT' THEN NEW.tenant_id ELSE OLD.tenant_id END;
 PERFORM 1 FROM public.pedidos_venta WHERE id=p AND tenant_id=t FOR UPDATE;
 SELECT contrato_id INTO c FROM public.suministro_pedidos WHERE pedido_id=p AND tenant_id=t AND estado='VINCULADO';
 IF c IS NOT NULL THEN
  PERFORM 1 FROM public.suministro_contratos WHERE id=c AND tenant_id=t FOR UPDATE;
  IF TG_TABLE_NAME='pedidos_venta' THEN
   IF TG_OP='DELETE' OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.moneda IS DISTINCT FROM OLD.moneda
     OR (NEW.subtotal,NEW.igv,NEW.total) IS DISTINCT FROM (OLD.subtotal,OLD.igv,OLD.total)
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.numero IS DISTINCT FROM OLD.numero
     OR (upper(OLD.estado)='CANCELADO' AND upper(NEW.estado)<>'CANCELADO')
     OR (upper(OLD.estado) NOT IN ('PENDIENTE','PENDIENTE_APROBACION') AND upper(NEW.estado) IN ('PENDIENTE','PENDIENTE_APROBACION')) THEN
    RAISE EXCEPTION 'SUPPLY_LINKED_ORDER_IMMUTABLE' USING ERRCODE='23514'; END IF;
  ELSIF TG_OP IN ('INSERT','DELETE') THEN
   RAISE EXCEPTION 'SUPPLY_LINKED_ORDER_IMMUTABLE' USING ERRCODE='23514';
  ELSIF (NEW.tenant_id,NEW.pedido_id,NEW.id,NEW.producto_id,NEW.descripcion,NEW.cantidad,NEW.precio_unitario,NEW.subtotal)
    IS DISTINCT FROM (OLD.tenant_id,OLD.pedido_id,OLD.id,OLD.producto_id,OLD.descripcion,OLD.cantidad,OLD.precio_unitario,OLD.subtotal) THEN
   RAISE EXCEPTION 'SUPPLY_LINKED_ORDER_IMMUTABLE' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $fn$;
CREATE TRIGGER proteger_pedido_suministro_572 BEFORE UPDATE OR DELETE ON public.pedidos_venta FOR EACH ROW EXECUTE FUNCTION app.proteger_pedido_suministro_572();
CREATE TRIGGER proteger_detalle_suministro_572 BEFORE INSERT OR UPDATE OR DELETE ON public.pedidos_venta_detalle FOR EACH ROW EXECUTE FUNCTION app.proteger_pedido_suministro_572();
CREATE FUNCTION app.proteger_programacion_suministro_572() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $fn$
BEGIN
 IF (NEW.estado,NEW.fecha_programada,NEW.destino,NEW.cantidad,NEW.orden_linea_id,NEW.contrato_id,NEW.tenant_id,NEW.id)
  IS DISTINCT FROM (OLD.estado,OLD.fecha_programada,OLD.destino,OLD.cantidad,OLD.orden_linea_id,OLD.contrato_id,OLD.tenant_id,OLD.id)
  AND app.suministro_asignado_572(OLD.tenant_id,OLD.id)>0 THEN
  RAISE EXCEPTION 'SUPPLY_SCHEDULE_HAS_ORDERS' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER proteger_programacion_suministro_572 BEFORE UPDATE ON public.suministro_entregas_programadas FOR EACH ROW EXECUTE FUNCTION app.proteger_programacion_suministro_572();
CREATE FUNCTION public.consultar_origen_suministro_572(p_tenant_id uuid,p_actor_id uuid,p_pedido_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.ver');
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.pedidos.ver');
 IF NOT EXISTS(SELECT 1 FROM public.pedidos_venta WHERE tenant_id=p_tenant_id AND id=p_pedido_id) THEN
  RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'contrato_id',c.id,'contrato_numero',c.numero,'estado',v.estado,
  'lineas',(SELECT jsonb_agg(jsonb_build_object('id',l.id,'descripcion',l.descripcion,'cantidad',l.cantidad,'oc_numero',oc.numero,
    'fecha_programada',e.fecha_programada,'destino',e.destino) ORDER BY l.id)
   FROM public.suministro_pedido_lineas l JOIN public.suministro_entregas_programadas e ON e.id=l.entrega_id AND e.tenant_id=l.tenant_id
   JOIN public.suministro_orden_lineas ol ON ol.id=e.orden_linea_id AND ol.tenant_id=e.tenant_id
   JOIN public.suministro_ordenes_cliente oc ON oc.id=ol.orden_cliente_id AND oc.tenant_id=ol.tenant_id WHERE l.vinculo_id=v.id)) ORDER BY v.created_at,v.id)
  FROM public.suministro_pedidos v JOIN public.suministro_contratos c ON c.id=v.contrato_id AND c.tenant_id=v.tenant_id
  WHERE v.tenant_id=p_tenant_id AND v.pedido_id=p_pedido_id),'[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.consultar_origen_suministro_572(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_origen_suministro_572(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION app.suministro_pedido_snapshot_572(uuid,uuid),app.suministro_asignado_572(uuid,uuid),
 app.proteger_pedido_suministro_572(),app.proteger_programacion_suministro_572() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.consultar_suministro_pedidos_572(uuid,uuid,uuid,text,uuid,text,integer),
 public.operar_suministro_pedidos_572(uuid,uuid,uuid,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_suministro_pedidos_572(uuid,uuid,uuid,text,uuid,text,integer),
 public.operar_suministro_pedidos_572(uuid,uuid,uuid,text,uuid,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
