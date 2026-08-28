-- 521: el detalle del documento guarda su afectacion del IGV.
--
-- `crear_nota_referenciada_legacy_494` clasifica cada linea de una nota de
-- credito o debito leyendo `documento_detalles.metadata->>'afectacion_igv'`, y
-- si no esta cae a un respaldo:
--
--     CASE WHEN v_line_igv > 0 THEN '10' ELSE '20' END
--
-- El camino del POS escribia en ese metadata solo `source` y un fingerprint
-- --la afectacion viajaba en `cpe.items`, no ahi--, asi que el respaldo
-- disparaba siempre. Lo gravado y lo exonerado salian bien por casualidad: uno
-- paga IGV y el otro no. Pero **inafecto (30) y exportacion (40) tambien tienen
-- IGV cero**, de modo que una nota sobre una venta con esos items los declaraba
-- como exonerados, con esquema 9997/E en vez de 9998/O o 9995.
--
-- Comprobado el 2026-08-28 sobre una venta real: el metadata de la linea traia
-- unicamente {"source":"pos.atomic.476","pos_finalization_fingerprint":"..."}.
--
-- Se arregla en el productor y no en la nota porque el dato ya esta ahi
-- --`v_item.item->>'afectacion_igv'`, normalizado por la 476-- y porque
-- recrear la nota son 604 lineas frente a 282.
--
-- La migracion 461 ya escribia la afectacion en ese metadata para su camino;
-- esto pone al POS a la par.
--
-- La funcion se reproduce **literal** de la 476 con un unico cambio: el
-- `jsonb_build_object` del metadata del detalle. Todo lo demas es identico.

CREATE OR REPLACE FUNCTION public.finalizar_cpe_pos_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_venta_id uuid,
  p_cpe jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_venta public.ventas_pos;
  v_document public.documentos;
  v_cpe public.cpe;
  v_items jsonb;
  v_passed_items jsonb;
  v_item record;
  v_existing_detail public.documento_detalles;
  v_count integer;
  v_subtotal numeric;
  v_igv numeric;
  v_isc numeric;
  v_total numeric;
  v_fp text;
  v_event_id uuid;
  v_outbox public.outbox_events;
  v_repaired boolean := false;
  v_tipo text;
  v_serie text;
  v_numero text;
BEGIN
  PERFORM app.assert_cpe_actor_476(p_tenant_id, p_actor_id, 'WORKER');
  IF length(coalesce(v_key, '')) NOT BETWEEN 8 AND 255
     OR jsonb_typeof(coalesce(p_cpe, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'POS_CPE_FINALIZE_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':pos:cpe:' || p_venta_id::text, 476)
  );

  SELECT * INTO v_venta
  FROM public.ventas_pos v
  WHERE v.id = p_venta_id AND v.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SALE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF upper(coalesce(v_venta.estado, '')) <> 'PAGADA'
     OR coalesce(v_venta.tipo_emision, '') = 'TICKET'
     OR v_venta.documento_id IS NULL OR v_venta.cpe_data IS NULL
     OR v_venta.accounting_event_id IS NULL OR v_venta.atomic_result IS NULL THEN
    RAISE EXCEPTION 'POS_SALE_NOT_READY_FOR_CPE' USING ERRCODE = '23514';
  END IF;
  IF p_actor_id IS DISTINCT FROM v_venta.usuario_id THEN
    RAISE EXCEPTION 'POS_CPE_ACTOR_MUST_OWN_SALE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_document
  FROM public.documentos d
  WHERE d.id = v_venta.documento_id AND d.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_RESERVED_DOCUMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_tipo := upper(btrim(coalesce(v_venta.cpe_data->>'tipo_documento', '')));
  v_serie := upper(btrim(coalesce(v_venta.cpe_data->>'serie', '')));
  v_numero := lpad(btrim(coalesce(v_venta.cpe_data->>'numero', '')), 8, '0');
  v_items := app.cpe_pos_items_476(v_venta.cpe_data->'items');
  v_passed_items := app.cpe_pos_items_476(p_cpe->'items');
  SELECT count(*), coalesce(round(sum((e->>'valor_venta')::numeric), 2), 0),
         coalesce(round(sum((e->>'impuesto_igv')::numeric), 2), 0),
         coalesce(round(sum((e->>'impuesto_isc')::numeric), 2), 0),
         coalesce(round(sum((e->>'total_item')::numeric), 2), 0)
    INTO v_count, v_subtotal, v_igv, v_isc, v_total
  FROM jsonb_array_elements(v_items) e;

  IF v_tipo NOT IN ('01', '03') OR v_serie = '' OR v_numero !~ '^[0-9]{8}$'
     OR v_count < 1 OR v_items IS DISTINCT FROM v_passed_items
     OR v_venta.cpe_data->>'documento_id' IS DISTINCT FROM v_document.id::text
     OR v_venta.cpe_data->>'venta_pos_id' IS DISTINCT FROM v_venta.id::text
     OR v_venta.cpe_data->>'idempotency_key' IS DISTINCT FROM v_key
     OR upper(btrim(coalesce(p_cpe->>'tipo_documento', ''))) IS DISTINCT FROM v_tipo
     OR upper(btrim(coalesce(p_cpe->>'serie', ''))) IS DISTINCT FROM v_serie
     OR lpad(btrim(coalesce(p_cpe->>'numero', '')), 8, '0') IS DISTINCT FROM v_numero
     OR btrim(coalesce(p_cpe->>'documento_receptor', ''))
        IS DISTINCT FROM btrim(coalesce(v_venta.cliente_documento, ''))
     OR abs(app.to_numeric_or_zero(p_cpe->>'total_venta') - coalesce(v_venta.total, 0)) > 0.01
     OR abs(v_total - coalesce(v_venta.total, 0)) > 0.01
     OR abs(v_igv - coalesce(v_venta.impuestos, 0)) > 0.01
     OR abs(v_subtotal - coalesce(v_document.subtotal, 0)) > 0.01
     OR NOT app.cpe_xml_hash_matches_476(p_cpe->>'xml_firmado', coalesce(p_cpe->>'hash_firma', p_cpe->>'hash')) THEN
    RAISE EXCEPTION 'POS_CPE_SNAPSHOT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) e
    WHERE btrim(coalesce(e->>'descripcion', '')) = ''
       OR (e->>'cantidad')::numeric <= 0
       OR least((e->>'precio_unitario')::numeric, (e->>'valor_venta')::numeric,
                (e->>'impuesto_igv')::numeric, (e->>'impuesto_isc')::numeric,
                (e->>'total_item')::numeric) < 0
       OR abs((e->>'total_item')::numeric - ((e->>'valor_venta')::numeric
          + (e->>'impuesto_igv')::numeric + (e->>'impuesto_isc')::numeric)) > 0.01
       OR (nullif(e->>'producto_id', '') IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.productos p
          WHERE p.id = (e->>'producto_id')::uuid AND p.tenant_id = p_tenant_id
       ))
  ) THEN
    RAISE EXCEPTION 'POS_CPE_ITEMS_INVALID' USING ERRCODE = '23514';
  END IF;

  v_fp := app.cpe_fingerprint_476(jsonb_build_object(
    'venta_id', v_venta.id, 'documento_id', v_document.id, 'key', v_key,
    'tipo', v_tipo, 'serie', v_serie, 'numero', v_numero,
    'receptor', btrim(coalesce(v_venta.cliente_documento, '')),
    'moneda', v_venta.moneda, 'subtotal', v_subtotal, 'igv', v_igv,
    'isc', v_isc, 'total', v_total, 'items', v_items,
    'xml_sha256', encode(extensions.digest(convert_to(p_cpe->>'xml_firmado', 'UTF8'), 'sha256'), 'hex')
  ));

  IF v_venta.cpe_id IS NOT NULL THEN
    SELECT * INTO v_cpe FROM public.cpe c
    WHERE c.id = v_venta.cpe_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  ELSE
    SELECT * INTO v_cpe FROM public.cpe c
    WHERE c.tenant_id = p_tenant_id AND c.idempotency_key = v_key FOR UPDATE;
  END IF;

  IF FOUND THEN
    IF v_cpe.documento_id IS DISTINCT FROM v_document.id
       OR upper(coalesce(v_cpe.tipo_documento, '')) IS DISTINCT FROM v_tipo
       OR upper(coalesce(v_cpe.serie, '')) IS DISTINCT FROM v_serie
       OR lpad(btrim(coalesce(v_cpe.numero, '')), 8, '0') IS DISTINCT FROM v_numero
       OR v_cpe.idempotency_key IS DISTINCT FROM v_key
       OR coalesce(v_cpe.metadata->>'pos_finalization_fingerprint', v_fp) IS DISTINCT FROM v_fp
       OR v_cpe.xml_firmado IS DISTINCT FROM p_cpe->>'xml_firmado' THEN
      RAISE EXCEPTION 'POS_CPE_EXISTING_COLLISION' USING ERRCODE = '23505';
    END IF;
    v_repaired := v_venta.cpe_id IS NULL OR coalesce(v_venta.cpe_pendiente, false);
  ELSE
    v_event_id := gen_random_uuid();
    INSERT INTO public.cpe (
      tenant_id, documento_id, tipo_documento, serie, numero, numero_comprobante,
      ruc_emisor, razon_social_emisor, direccion_emisor,
      tipo_documento_receptor, documento_receptor, razon_social_receptor,
      direccion_receptor, cliente_id, moneda,
      total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
      total_igv, total_venta, total, items, fecha_emision, fecha_vencimiento,
      idempotency_key, event_id, estado, estado_sunat, sunat_status,
      hash, hash_firma, xml_firmado, created_by, activo, metadata,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, v_document.id, v_tipo, v_serie, v_numero, v_numero::integer,
      p_cpe->>'ruc_emisor', p_cpe->>'razon_social_emisor', p_cpe->>'direccion_emisor',
      p_cpe->>'tipo_documento_receptor', p_cpe->>'documento_receptor',
      p_cpe->>'razon_social_receptor', p_cpe->>'direccion_receptor',
      v_venta.cliente_id, upper(coalesce(nullif(p_cpe->>'moneda', ''), v_venta.moneda)),
      app.to_numeric_or_zero(p_cpe->>'total_gravadas'),
      app.to_numeric_or_zero(p_cpe->>'total_exoneradas'),
      app.to_numeric_or_zero(p_cpe->>'total_inafectas'),
      app.to_numeric_or_zero(p_cpe->>'total_exportacion'),
      v_igv, v_total, v_total, p_cpe->'items',
      coalesce(nullif(p_cpe->>'fecha_emision', '')::timestamptz, v_document.fecha_emision),
      coalesce(nullif(p_cpe->>'fecha_vencimiento', '')::date, v_document.fecha_vencimiento::date),
      v_key, v_event_id, 'FIRMADO', 'PENDIENTE', 'READY',
      coalesce(p_cpe->>'hash', p_cpe->>'hash_firma'),
      coalesce(p_cpe->>'hash_firma', p_cpe->>'hash'), p_cpe->>'xml_firmado',
      p_actor_id, true, jsonb_build_object(
        'source', 'pos.atomic.476', 'venta_pos_id', v_venta.id,
        'pos_finalization_fingerprint', v_fp, 'atomic_rpc', 'finalizar_cpe_pos_tx',
        'schema_version', 476
      ), now(), now()
    ) RETURNING * INTO v_cpe;
  END IF;

  FOR v_item IN SELECT e AS item FROM jsonb_array_elements(v_items) e
  LOOP
    SELECT * INTO v_existing_detail
    FROM public.documento_detalles dd
    WHERE dd.documento_id = v_document.id AND dd.orden = (v_item.item->>'orden')::integer
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing_detail.producto_id IS DISTINCT FROM nullif(v_item.item->>'producto_id', '')::uuid
         OR btrim(coalesce(v_existing_detail.descripcion, '')) IS DISTINCT FROM v_item.item->>'descripcion'
         OR abs(coalesce(v_existing_detail.cantidad, 0) - (v_item.item->>'cantidad')::numeric) > 0.0001
         OR abs(coalesce(v_existing_detail.valor_venta, 0) - (v_item.item->>'valor_venta')::numeric) > 0.01
         OR abs(coalesce(v_existing_detail.impuesto_igv, 0) - (v_item.item->>'impuesto_igv')::numeric) > 0.01
         OR abs(coalesce(v_existing_detail.total_item, 0) - (v_item.item->>'total_item')::numeric) > 0.01 THEN
        RAISE EXCEPTION 'POS_DOCUMENT_DETAIL_COLLISION' USING ERRCODE = '23505';
      END IF;
    ELSE
      INSERT INTO public.documento_detalles (
        tenant_id, documento_id, orden, producto_id, codigo_producto,
        descripcion, unidad_medida, cantidad, precio_unitario,
        descuento_unitario, valor_venta, impuesto_igv, impuesto_isc,
        total_item, metadata, created_at, updated_at
      ) VALUES (
        p_tenant_id, v_document.id, (v_item.item->>'orden')::integer,
        nullif(v_item.item->>'producto_id', '')::uuid,
        v_item.item->>'codigo_producto', v_item.item->>'descripcion',
        v_item.item->>'unidad_medida', (v_item.item->>'cantidad')::numeric,
        (v_item.item->>'precio_unitario')::numeric,
        (v_item.item->>'descuento_unitario')::numeric,
        (v_item.item->>'valor_venta')::numeric,
        (v_item.item->>'impuesto_igv')::numeric,
        (v_item.item->>'impuesto_isc')::numeric,
        (v_item.item->>'total_item')::numeric,
        jsonb_build_object('source', 'pos.atomic.476', 'pos_finalization_fingerprint', v_fp,
          'afectacion_igv', coalesce(nullif(v_item.item->>'afectacion_igv', ''), '10')),
        now(), now()
      );
      v_repaired := true;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.documento_detalles dd WHERE dd.documento_id = v_document.id) <> v_count THEN
    RAISE EXCEPTION 'POS_DOCUMENT_DETAIL_COUNT_COLLISION' USING ERRCODE = '23505';
  END IF;

  UPDATE public.documentos
  SET estado = 'EMITIDO', estado_sunat = 'PENDIENTE',
      xml_content = p_cpe->>'xml_firmado', codigo_hash = coalesce(p_cpe->>'hash_firma', p_cpe->>'hash'),
      error_sunat = NULL, updated_by = p_actor_id, updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'pos.atomic.476', 'venta_pos_id', v_venta.id, 'cpe_id', v_cpe.id,
        'cpe_pendiente', false, 'pos_finalization_fingerprint', v_fp,
        'atomic_rpc', 'finalizar_cpe_pos_tx', 'schema_version', 476
      )
  WHERE id = v_document.id AND tenant_id = p_tenant_id
  RETURNING * INTO v_document;

  UPDATE public.ventas_pos
  SET cpe_id = v_cpe.id, cpe_pendiente = false, error_facturacion = NULL,
      ultimo_intento_facturacion = now(), updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'cpe_finalized_by', 'finalizar_cpe_pos_tx', 'cpe_finalization_fingerprint', v_fp,
        'cpe_finalized_at', now(), 'schema_version', 476
      )
  WHERE id = v_venta.id AND tenant_id = p_tenant_id
  RETURNING * INTO v_venta;

  SELECT * INTO v_outbox
  FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id AND o.event_type = 'comprobante.creado'
    AND o.idempotency_key = 'cpe.creado:' || p_tenant_id || ':' || v_cpe.id
  FOR UPDATE;
  IF FOUND THEN
    IF v_outbox.aggregate_id IS DISTINCT FROM v_cpe.id::text
       OR v_outbox.payload->>'ventaId' IS DISTINCT FROM v_venta.id::text
       OR v_outbox.payload->>'facturaId' IS DISTINCT FROM v_document.id::text THEN
      RAISE EXCEPTION 'POS_CPE_OUTBOX_COLLISION' USING ERRCODE = '23505';
    END IF;
  ELSE
    v_event_id := coalesce(v_cpe.event_id, gen_random_uuid());
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, 'cpe', v_cpe.id::text, 'comprobante.creado',
      jsonb_build_object(
        'eventId', v_event_id, 'tenantId', p_tenant_id,
        'idempotencyKey', 'cpe.creado:' || p_tenant_id || ':' || v_cpe.id,
        'cpeId', v_cpe.id, 'facturaId', v_document.id,
        'tipoDocumento', v_tipo, 'serie', v_serie, 'numero', v_numero::integer,
        'clienteId', coalesce(v_venta.cliente_id::text, v_venta.cliente_documento),
        'total', v_total, 'esCredito', v_venta.credito_monto > 0,
        'ventaId', v_venta.id, 'requiereTransporte', false,
        'moneda', v_venta.moneda, 'source', 'pos.atomic.476'
      ),
      'pending', 0, 'cpe.creado:' || p_tenant_id || ':' || v_cpe.id,
      v_event_id, now(), now(), now()
    );
  END IF;

  RETURN jsonb_build_object(
    'cpe', to_jsonb(v_cpe), 'cpe_id', v_cpe.id,
    'documento_id', v_document.id, 'venta', to_jsonb(v_venta),
    'idempotent', NOT v_repaired, 'repaired', v_repaired
  );
END;
$function$;

-- Documentos ya emitidos: se rellena la afectacion desde los items del CPE, que
-- si la traen. Sin esto una nota sobre una venta anterior seguiria clasificando
-- mal, y son justo las que ya pueden estar aceptadas por SUNAT.
--
-- Se empareja por producto y, si no lo hay, por codigo. Y el codigo hay que
-- buscarlo en las dos claves: el normalizador de la 476 escribe
-- `codigo_producto`, pero la RPC de venta del POS (451) escribe `codigo`. Con
-- una sola de las dos se quedaban sin rellenar justamente las boletas del POS,
-- que son las que originan el problema.
UPDATE public.documento_detalles dd
SET metadata = coalesce(dd.metadata, '{}'::jsonb)
             || jsonb_build_object('afectacion_igv', it.afectacion),
    updated_at = now()
FROM (
  SELECT c.documento_id,
         nullif(btrim(i->>'producto_id'), '') AS producto_id,
         coalesce(nullif(btrim(i->>'codigo_producto'), ''),
                  nullif(btrim(i->>'codigo'), '')) AS codigo,
         coalesce(nullif(btrim(i->>'afectacion_igv'), ''),
                  nullif(btrim(i->>'tipo_afectacion_igv'), '')) AS afectacion
  FROM public.cpe c
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.items) = 'array' THEN c.items ELSE '[]'::jsonb END
  ) AS i
  WHERE c.documento_id IS NOT NULL
) it
WHERE dd.documento_id = it.documento_id
  AND (
    (dd.producto_id IS NOT NULL AND dd.producto_id::text = it.producto_id)
    OR (it.producto_id IS NULL AND dd.codigo_producto = it.codigo)
  )
  AND it.afectacion IS NOT NULL
  AND coalesce(dd.metadata->>'afectacion_igv', '') = '';

DO $seguridad$
BEGIN
  -- El GRANT no se toca: recrear la funcion conserva los privilegios, pero se
  -- reafirma para que un despliegue parcial no deje el POS sin poder emitir.
  REVOKE ALL ON FUNCTION public.finalizar_cpe_pos_tx(uuid, uuid, uuid, jsonb, text)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.finalizar_cpe_pos_tx(uuid, uuid, uuid, jsonb, text)
    TO service_role;
END
$seguridad$;
