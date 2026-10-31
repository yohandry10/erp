-- F01: contratos de suministro, OC recibidas y cronogramas. Sin efectos de stock,
-- fiscales ni contables. Sin backfill comercial. Rollback: deshabilitar la nueva
-- superficie y conservar sus registros; no reconstruir ni borrar datos existentes.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

CREATE TABLE public.suministro_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  numero text NOT NULL CHECK (numero = upper(btrim(numero)) AND length(numero) BETWEEN 1 AND 80),
  asunto text NOT NULL CHECK (length(btrim(asunto)) BETWEEN 3 AND 200),
  moneda text NOT NULL CHECK (moneda IN ('PEN', 'USD', 'EUR', 'COP', 'ARS')),
  vigencia_desde date NOT NULL,
  vigencia_hasta date NOT NULL CHECK (vigencia_hasta >= vigencia_desde),
  responsable_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  observaciones text CHECK (length(observaciones) <= 2000),
  estado text NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'ACTIVO', 'ANULADO')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, numero), UNIQUE (tenant_id, id)
);
CREATE TABLE public.suministro_contrato_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  codigo_producto text NOT NULL,
  descripcion text NOT NULL,
  unidad_medida text NOT NULL,
  cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric(18,6) NOT NULL CHECK (precio_unitario >= 0),
  orden integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (tenant_id, contrato_id) REFERENCES public.suministro_contratos(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, contrato_id, id), UNIQUE (contrato_id, orden)
);
CREATE TABLE public.suministro_ordenes_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  numero text NOT NULL CHECK (numero = upper(btrim(numero)) AND length(numero) BETWEEN 1 AND 80),
  fecha_emision date NOT NULL,
  created_by uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, contrato_id) REFERENCES public.suministro_contratos(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, contrato_id, numero), UNIQUE (tenant_id, contrato_id, id)
);
CREATE TABLE public.suministro_orden_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  orden_cliente_id uuid NOT NULL,
  contrato_linea_id uuid NOT NULL,
  cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0),
  FOREIGN KEY (tenant_id, contrato_id, orden_cliente_id)
    REFERENCES public.suministro_ordenes_cliente(tenant_id, contrato_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, contrato_id, contrato_linea_id)
    REFERENCES public.suministro_contrato_lineas(tenant_id, contrato_id, id) ON DELETE RESTRICT,
  UNIQUE (orden_cliente_id, contrato_linea_id), UNIQUE (tenant_id, contrato_id, id)
);
CREATE TABLE public.suministro_entregas_programadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  orden_linea_id uuid NOT NULL,
  cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0),
  fecha_original date NOT NULL,
  fecha_programada date NOT NULL,
  destino text NOT NULL CHECK (length(btrim(destino)) BETWEEN 3 AND 300),
  estado text NOT NULL DEFAULT 'PROGRAMADA' CHECK (estado IN ('PROGRAMADA', 'ANULADA')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, contrato_id, orden_linea_id)
    REFERENCES public.suministro_orden_lineas(tenant_id, contrato_id, id) ON DELETE RESTRICT
);
CREATE INDEX suministro_entregas_fecha_570 ON public.suministro_entregas_programadas(tenant_id, fecha_programada)
  WHERE estado = 'PROGRAMADA';
CREATE INDEX suministro_entregas_linea_570 ON public.suministro_entregas_programadas(orden_linea_id);
CREATE INDEX suministro_orden_lineas_contrato_570 ON public.suministro_orden_lineas(contrato_linea_id);
CREATE TABLE public.suministro_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  recurso_id uuid NOT NULL,
  accion text NOT NULL,
  anterior jsonb,
  actual jsonb NOT NULL,
  motivo text CHECK (length(motivo) <= 1000),
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, contrato_id) REFERENCES public.suministro_contratos(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX suministro_historial_contrato_570 ON public.suministro_historial(tenant_id, contrato_id, created_at, id);
CREATE TABLE public.suministro_operaciones (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 180),
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  fingerprint text NOT NULL,
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

-- Ningún rol de aplicación tiene DML ni SELECT directo. Las lecturas también
-- pasan por RPCs que comprueban actor y permiso, antes de resolver el recurso.
DO $secure$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['suministro_contratos','suministro_contrato_lineas','suministro_ordenes_cliente',
    'suministro_orden_lineas','suministro_entregas_programadas','suministro_historial','suministro_operaciones'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('CREATE POLICY suministro_private_570 ON public.%I USING (false) WITH CHECK (false)', t);
  END LOOP;
END $secure$;

CREATE FUNCTION app.suministro_detalle_570(p_tenant_id uuid, p_id uuid)
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
        WHERE ol.tenant_id=l.tenant_id AND ol.contrato_linea_id=l.id),0)) ORDER BY l.orden)
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

CREATE FUNCTION public.consultar_suministro_570(
  p_tenant_id uuid, p_actor_id uuid, p_accion text, p_id uuid DEFAULT NULL,
  p_busqueda text DEFAULT '', p_pagina integer DEFAULT 1, p_limite integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE v_result jsonb; v_q text := btrim(coalesce(p_busqueda,''));
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.ver');
  IF p_pagina IS NULL OR p_pagina < 1 OR p_pagina > 100000 OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100
    OR length(v_q)>120 THEN RAISE EXCEPTION 'SUPPLY_QUERY_INVALID' USING ERRCODE='22023'; END IF;
  -- Búsqueda literal; % y _ no amplían el alcance del filtro.
  v_q := replace(replace(replace(v_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  IF p_accion='DETALLE' THEN
    v_result := app.suministro_detalle_570(p_tenant_id,p_id);
    IF v_result IS NULL THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    RETURN v_result;
  ELSIF p_accion='LISTAR' THEN
    SELECT jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC,s.id),'[]'::jsonb),
      'total', (SELECT count(*) FROM public.suministro_contratos c WHERE c.tenant_id=p_tenant_id
        AND (c.numero ILIKE '%'||v_q||'%' OR c.asunto ILIKE '%'||v_q||'%')),
      'pagina',p_pagina,'limite',p_limite) INTO v_result FROM (
      SELECT c.*, cl.razon_social AS cliente_nombre FROM public.suministro_contratos c
      JOIN public.clientes cl ON cl.id=c.cliente_id AND cl.tenant_id=c.tenant_id
      WHERE c.tenant_id=p_tenant_id AND (c.numero ILIKE '%'||v_q||'%' OR c.asunto ILIKE '%'||v_q||'%')
      ORDER BY c.created_at DESC,c.id LIMIT p_limite OFFSET (p_pagina-1)*p_limite) s;
    RETURN v_result;
  ELSIF p_accion IN ('CLIENTES','PRODUCTOS','RESPONSABLES') THEN
    IF p_accion='CLIENTES' THEN
      SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) INTO v_result FROM (
        SELECT id,coalesce(razon_social,nombre) AS nombre,codigo FROM public.clientes
        WHERE tenant_id=p_tenant_id AND activo AND (coalesce(razon_social,nombre) ILIKE '%'||v_q||'%' OR codigo ILIKE '%'||v_q||'%')
        ORDER BY coalesce(razon_social,nombre),id LIMIT p_limite OFFSET (p_pagina-1)*p_limite) s;
    ELSIF p_accion='PRODUCTOS' THEN
      SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) INTO v_result FROM (
        SELECT id,nombre,codigo,unidad_medida FROM public.productos
        WHERE tenant_id=p_tenant_id AND activo AND (nombre ILIKE '%'||v_q||'%' OR codigo ILIKE '%'||v_q||'%')
        ORDER BY nombre,id LIMIT p_limite OFFSET (p_pagina-1)*p_limite) s;
    ELSE
      SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) INTO v_result FROM (
        SELECT id,concat_ws(' ',nombre,apellido) AS nombre FROM public.usuarios_sistema
        WHERE tenant_id=p_tenant_id AND activo AND lower(estado::text)='activo'
          AND concat_ws(' ',nombre,apellido) ILIKE '%'||v_q||'%'
        ORDER BY nombre,id LIMIT p_limite OFFSET (p_pagina-1)*p_limite) s;
    END IF;
    RETURN jsonb_build_object('items',v_result,'pagina',p_pagina,'limite',p_limite);
  END IF;
  RAISE EXCEPTION 'SUPPLY_ACTION_INVALID' USING ERRCODE='22023';
END $fn$;

CREATE FUNCTION public.operar_suministro_570(
  p_tenant_id uuid, p_actor_id uuid, p_accion text, p_id uuid, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key,'')); v_hash text; v_op public.suministro_operaciones;
  v_c public.suministro_contratos; v_oc public.suministro_ordenes_cliente;
  v_l public.suministro_contrato_lineas; v_ol public.suministro_orden_lineas;
  v_e public.suministro_entregas_programadas; v_contrato_id uuid; v_id uuid;
  v_row jsonb; v_old jsonb; v_new jsonb; v_result jsonb; v_index integer := 0;
  v_cantidad numeric; v_precio numeric; v_total numeric; v_fecha date; v_desde date; v_hasta date;
  v_motivo text := nullif(btrim(p_payload->>'motivo'),''); v_producto public.productos;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.gestionar');
  IF length(v_key) NOT BETWEEN 8 AND 180 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR p_accion IS NULL OR p_accion NOT IN ('CREAR_CONTRATO','EDITAR_BORRADOR','ACTIVAR','ANULAR_BORRADOR',
      'CREAR_OC','PROGRAMAR','REPROGRAMAR','ANULAR_ENTREGA') THEN
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
    IF p_accion='CREAR_OC' THEN
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
        SELECT coalesce(sum(cantidad),0) INTO v_total FROM public.suministro_orden_lineas WHERE tenant_id=p_tenant_id AND contrato_linea_id=v_l.id;
        IF v_total+v_cantidad>v_l.cantidad THEN RAISE EXCEPTION 'SUPPLY_OC_EXCEEDS_CONTRACT' USING ERRCODE='23514'; END IF;
        INSERT INTO public.suministro_orden_lineas(tenant_id,contrato_id,orden_cliente_id,contrato_linea_id,cantidad)
          VALUES(p_tenant_id,v_c.id,v_oc.id,v_l.id,v_cantidad);
      END LOOP;
      v_id:=v_oc.id;
      v_new:=to_jsonb(v_oc)||jsonb_build_object('lineas',p_payload->'lineas');
    ELSIF p_accion='PROGRAMAR' THEN
      SELECT * INTO v_ol FROM public.suministro_orden_lineas WHERE tenant_id=p_tenant_id AND contrato_id=v_c.id AND id=(p_payload->>'orden_linea_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_LINE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      SELECT * INTO v_oc FROM public.suministro_ordenes_cliente WHERE tenant_id=p_tenant_id AND id=v_ol.orden_cliente_id;
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
  INSERT INTO public.suministro_historial(tenant_id,contrato_id,recurso_id,accion,anterior,actual,motivo,actor_id)
    VALUES(p_tenant_id,v_contrato_id,v_id,p_accion,v_old,v_new,v_motivo,p_actor_id);
  INSERT INTO public.audit_log(tenant_id,user_id,table_name,operation,record_id,old_values,new_values,metadata)
    VALUES(p_tenant_id,p_actor_id,'suministro_contratos','UPDATE',v_contrato_id::text,v_old,v_new,
      jsonb_build_object('source','operar_suministro_570','accion',p_accion,'idempotency_key',v_key));
  v_result:=jsonb_build_object('id',v_id,'contrato_id',v_contrato_id,'accion',p_accion,'idempotent',false);
  INSERT INTO public.suministro_operaciones(tenant_id,idempotency_key,actor_id,fingerprint,resultado)
    VALUES(p_tenant_id,v_key,p_actor_id,v_hash,v_result);
  RETURN v_result;
END $fn$;

CREATE FUNCTION app.seed_suministro_permissions_570(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.permisos(tenant_id,modulo,recurso,accion,codigo,descripcion,activo)
  SELECT p_tenant_id,'ventas','contratos',s.accion,'ventas.contratos.'||s.accion,s.descripcion,true
  FROM (VALUES ('ver','Consultar contratos de suministro, OC del cliente y cronogramas'),
    ('gestionar','Gestionar contratos de suministro, OC del cliente y cronogramas')) s(accion,descripcion)
  WHERE NOT EXISTS (SELECT 1 FROM public.permisos p WHERE p.tenant_id=p_tenant_id AND p.codigo='ventas.contratos.'||s.accion);
  INSERT INTO public.rol_permisos(role_id,permiso_id,concedido)
  SELECT r.id,p.id,true FROM public.roles r JOIN public.permisos p ON p.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant_id AND r.activo AND p.activo AND p.codigo IN ('ventas.contratos.ver','ventas.contratos.gestionar')
    AND (upper(r.nombre) IN ('ADMIN','ADMIN_DEMO','GERENCIA')
      OR (upper(r.nombre) IN ('VENDEDOR','AUDITOR','CONTADOR') AND p.codigo='ventas.contratos.ver'))
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id=r.id AND rp.permiso_id=p.id);
END $fn$;
CREATE FUNCTION app.seed_suministro_role_570() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN PERFORM app.seed_suministro_permissions_570(NEW.tenant_id); RETURN NEW; END $fn$;
CREATE TRIGGER seed_suministro_role_570 AFTER INSERT OR UPDATE OF nombre,activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_suministro_role_570();
DO $seed$ DECLARE t uuid; BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP PERFORM app.seed_suministro_permissions_570(t); END LOOP;
END $seed$;

REVOKE ALL ON FUNCTION app.suministro_detalle_570(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.seed_suministro_permissions_570(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.seed_suministro_role_570() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.consultar_suministro_570(uuid,uuid,text,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.operar_suministro_570(uuid,uuid,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_suministro_570(uuid,uuid,text,uuid,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.operar_suministro_570(uuid,uuid,text,uuid,jsonb,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
