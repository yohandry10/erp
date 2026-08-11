-- ============================================================================
-- 443__customer_invoice_document_cxc_atomic_outbox.sql
-- Factura/boleta de cliente: documento, líneas, CPE, CxC y ambos eventos
-- durables se confirman o revierten juntos. No envía a SUNAT/OSE: el cliente
-- aporta sus credenciales y el envío continúa siendo una acción posterior.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, pg_temp;

DO $$
DECLARE
  v_duplicates integer;
BEGIN
  SELECT count(*) INTO v_duplicates
  FROM (
    SELECT tenant_id, upper(tipo_documento), upper(serie),
           lpad(btrim(numero), 8, '0')
    FROM public.cpe
    WHERE tenant_id IS NOT NULL AND tipo_documento IS NOT NULL
      AND serie IS NOT NULL AND numero IS NOT NULL
    GROUP BY 1, 2, 3, 4 HAVING count(*) > 1
  ) d;
  IF v_duplicates > 0 THEN
    RAISE EXCEPTION 'CPE_DUPLICATE_FISCAL_NUMBERS_PREVENT_443: groups=%', v_duplicates;
  END IF;

  SELECT count(*) INTO v_duplicates
  FROM (
    SELECT tenant_id, documento_id
    FROM public.cpe WHERE tenant_id IS NOT NULL AND documento_id IS NOT NULL
    GROUP BY 1, 2 HAVING count(*) > 1
  ) d;
  IF v_duplicates > 0 THEN
    RAISE EXCEPTION 'CPE_DUPLICATE_DOCUMENT_LINKS_PREVENT_443: groups=%', v_duplicates;
  END IF;

  SELECT count(*) INTO v_duplicates
  FROM (
    SELECT tenant_id, event_id
    FROM public.cpe WHERE tenant_id IS NOT NULL AND event_id IS NOT NULL
    GROUP BY 1, 2 HAVING count(*) > 1
  ) d;
  IF v_duplicates > 0 THEN
    RAISE EXCEPTION 'CPE_DUPLICATE_EVENT_LINKS_PREVENT_443: groups=%', v_duplicates;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cpe_tenant_fiscal_number_443
  ON public.cpe (
    tenant_id,
    upper(tipo_documento),
    upper(serie),
    lpad(btrim(numero), 8, '0')
  )
  WHERE tenant_id IS NOT NULL AND tipo_documento IS NOT NULL
    AND serie IS NOT NULL AND numero IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cpe_tenant_documento_443
  ON public.cpe (tenant_id, documento_id)
  WHERE tenant_id IS NOT NULL AND documento_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cpe_tenant_event_443
  ON public.cpe (tenant_id, event_id)
  WHERE tenant_id IS NOT NULL AND event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.emitir_factura_cliente_tx(
  p_tenant_id uuid,
  p_cpe jsonb,
  p_documento jsonb,
  p_detalles jsonb,
  p_cxc jsonb,
  p_event_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_tipo text := upper(btrim(coalesce(p_cpe->>'tipo_documento', '')));
  v_tipo_documento text;
  v_serie text := upper(btrim(coalesce(p_cpe->>'serie', '')));
  v_numero text := lpad(btrim(coalesce(p_cpe->>'numero', '')), 8, '0');
  v_moneda text := upper(btrim(coalesce(p_cpe->>'moneda', 'PEN')));
  v_cliente_id uuid := nullif(p_cpe->>'cliente_id', '')::uuid;
  v_actor_id uuid := nullif(p_cpe->>'created_by', '')::uuid;
  v_pedido_id uuid := nullif(p_documento->>'pedido_id', '')::uuid;
  v_total_gravadas numeric(14,2) := round(coalesce((p_cpe->>'total_gravadas')::numeric, 0), 2);
  v_total_exoneradas numeric(14,2) := round(coalesce((p_cpe->>'total_exoneradas')::numeric, 0), 2);
  v_total_inafectas numeric(14,2) := round(coalesce((p_cpe->>'total_inafectas')::numeric, 0), 2);
  v_total_exportacion numeric(14,2) := round(coalesce((p_cpe->>'total_exportacion')::numeric, 0), 2);
  v_subtotal numeric(14,2);
  v_igv numeric(14,2) := round(coalesce((p_cpe->>'total_igv')::numeric, 0), 2);
  v_isc numeric(14,2) := round(coalesce((p_documento->>'impuesto_isc')::numeric, 0), 2);
  v_total numeric(14,2) := round(coalesce((p_cpe->>'total_venta')::numeric, 0), 2);
  v_tipo_cambio numeric(14,6) := coalesce((p_documento->>'tipo_cambio')::numeric, 1);
  v_fecha_emision timestamptz := (p_cpe->>'fecha_emision')::timestamptz;
  v_fecha_vencimiento date := coalesce(
    nullif(p_cpe->>'fecha_vencimiento', '')::date,
    (p_cpe->>'fecha_emision')::date
  );
  v_detalles_canon jsonb;
  v_detail record;
  v_detail_existing public.documento_detalles;
  v_detail_count integer;
  v_detail_orders integer;
  v_detail_subtotal numeric(14,2);
  v_detail_igv numeric(14,2);
  v_detail_isc numeric(14,2);
  v_detail_total numeric(14,2);
  v_fingerprint text;
  v_cpe public.cpe;
  v_cpe_found boolean := false;
  v_documento public.documentos;
  v_documento_found boolean := false;
  v_event_id uuid := p_event_id;
  v_comprobante_event_id uuid;
  v_cxc public.cuentas_por_cobrar;
  v_cxc_found boolean := false;
  v_cxc_cliente_id uuid;
  v_cxc_total numeric(14,2);
  v_cxc_pendiente numeric(14,2);
  v_retencion numeric(14,2);
  v_percepcion numeric(14,2);
  v_detraccion numeric(14,2);
  v_anticipo numeric(14,2);
  v_ajuste record;
  v_factura_payload jsonb;
  v_comprobante_payload jsonb;
  v_outbox public.outbox_events;
  v_repaired boolean := false;
BEGIN
  IF p_tenant_id IS NULL OR p_event_id IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 255
     OR p_cpe IS NULL OR jsonb_typeof(p_cpe) <> 'object'
     OR p_documento IS NULL OR jsonb_typeof(p_documento) <> 'object'
     OR p_detalles IS NULL OR jsonb_typeof(p_detalles) <> 'array'
     OR (p_cxc IS NOT NULL AND jsonb_typeof(p_cxc) <> 'object') THEN
    RAISE EXCEPTION 'tenant, event_id, key y payloads válidos son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  IF v_tipo NOT IN ('01', '03') THEN
    RAISE EXCEPTION 'CPE_CUSTOMER_INVOICE_TYPE_UNSUPPORTED: %', v_tipo
      USING ERRCODE = '22023';
  END IF;
  v_tipo_documento := CASE WHEN v_tipo = '01' THEN 'FACTURA' ELSE 'BOLETA' END;
  IF v_serie = '' OR v_numero !~ '^[0-9]{8}$'
     OR v_moneda !~ '^[A-Z]{3}$' OR v_actor_id IS NULL
     OR btrim(coalesce(p_cpe->>'xml_firmado', '')) = ''
     OR btrim(coalesce(p_cpe->>'hash_firma', p_cpe->>'hash', '')) = ''
     OR upper(coalesce(p_cpe->>'estado', '')) <> 'FIRMADO'
     OR upper(coalesce(p_cpe->>'sunat_status', '')) <> 'READY' THEN
    RAISE EXCEPTION 'CPE_CUSTOMER_INVOICE_NOT_READY_OR_INCOMPLETE'
      USING ERRCODE = '23514';
  END IF;
  IF v_moneda = 'PEN' THEN
    v_tipo_cambio := 1;
  ELSIF v_tipo_cambio <= 0 THEN
    RAISE EXCEPTION 'Tipo de cambio obligatorio para moneda extranjera'
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':factura-cliente:' || v_key, 443)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_actor_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El emisor interno no pertenece al tenant o está inactivo'
      USING ERRCODE = '23514';
  END IF;
  IF v_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = v_cliente_id AND c.tenant_id = p_tenant_id
      AND coalesce(c.activo, true)
  ) THEN
    RAISE EXCEPTION 'El cliente no pertenece al tenant o está inactivo'
      USING ERRCODE = '23514';
  END IF;
  IF v_pedido_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pedidos_venta p
    WHERE p.id = v_pedido_id AND p.tenant_id = p_tenant_id
      AND (v_cliente_id IS NULL OR p.cliente_id = v_cliente_id)
  ) THEN
    RAISE EXCEPTION 'El pedido no pertenece al tenant/cliente'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*), count(DISTINCT (e->>'orden')::integer),
         coalesce(round(sum((e->>'valor_venta')::numeric), 2), 0),
         coalesce(round(sum((e->>'impuesto_igv')::numeric), 2), 0),
         coalesce(round(sum(coalesce((e->>'impuesto_isc')::numeric, 0)), 2), 0),
         coalesce(round(sum((e->>'total_item')::numeric), 2), 0),
         coalesce(jsonb_agg(e ORDER BY (e->>'orden')::integer), '[]'::jsonb)
    INTO v_detail_count, v_detail_orders, v_detail_subtotal,
         v_detail_igv, v_detail_isc, v_detail_total, v_detalles_canon
  FROM jsonb_array_elements(p_detalles) e;

  IF v_detail_count NOT BETWEEN 1 AND 999 OR v_detail_count <> v_detail_orders
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_detalles) e
       WHERE jsonb_typeof(e) <> 'object'
          OR coalesce((e->>'orden')::integer, 0) < 1
          OR coalesce((e->>'cantidad')::numeric, 0) <= 0
          OR coalesce((e->>'precio_unitario')::numeric, -1) < 0
          OR coalesce((e->>'valor_venta')::numeric, -1) < 0
          OR coalesce((e->>'impuesto_igv')::numeric, -1) < 0
          OR coalesce((e->>'impuesto_isc')::numeric, 0) < 0
          OR coalesce((e->>'total_item')::numeric, -1) < 0
          OR btrim(coalesce(e->>'descripcion', '')) = ''
          OR abs(round(coalesce((e->>'total_item')::numeric, 0), 2)
              - round(coalesce((e->>'valor_venta')::numeric, 0)
                    + coalesce((e->>'impuesto_igv')::numeric, 0)
                    + coalesce((e->>'impuesto_isc')::numeric, 0), 2)) > 0.01
     ) THEN
    RAISE EXCEPTION 'Detalle de factura inválido o inconsistente'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_detalles) e
    LEFT JOIN public.productos p
      ON p.id = nullif(e->>'producto_id', '')::uuid
     AND p.tenant_id = p_tenant_id
    WHERE nullif(e->>'producto_id', '') IS NOT NULL AND p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'El detalle contiene un producto ajeno al tenant'
      USING ERRCODE = '23514';
  END IF;

  v_subtotal := round(v_total_gravadas + v_total_exoneradas
    + v_total_inafectas + v_total_exportacion, 2);
  IF v_total <= 0
     OR abs(v_subtotal - v_detail_subtotal) > 0.01
     OR abs(v_igv - v_detail_igv) > 0.01
     OR abs(v_isc - v_detail_isc) > 0.01
     OR abs(v_total - v_detail_total) > 0.01
     OR abs(v_total - round(v_subtotal + v_igv + v_isc, 2)) > 0.01
     OR abs(round(coalesce((p_documento->>'subtotal')::numeric, 0), 2) - v_subtotal) > 0.01
     OR abs(round(coalesce((p_documento->>'impuesto_igv')::numeric, 0), 2) - v_igv) > 0.01
     OR abs(round(coalesce((p_documento->>'total')::numeric, 0), 2) - v_total) > 0.01 THEN
    RAISE EXCEPTION 'Los totales de CPE, documento y detalle no coinciden'
      USING ERRCODE = '23514';
  END IF;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'tipo', v_tipo, 'serie', v_serie, 'numero', v_numero,
        'receptor', btrim(coalesce(p_cpe->>'documento_receptor', '')),
        'moneda', v_moneda, 'tipo_cambio', v_tipo_cambio,
        'subtotal', v_subtotal, 'igv', v_igv, 'isc', v_isc,
        'total', v_total, 'detalles', v_detalles_canon,
        'es_credito', p_cxc IS NOT NULL
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  SELECT * INTO v_cpe
  FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id AND c.idempotency_key = v_key
  FOR UPDATE;
  v_cpe_found := FOUND;

  IF v_cpe_found THEN
    IF upper(coalesce(v_cpe.tipo_documento, '')) <> v_tipo
       OR upper(coalesce(v_cpe.serie, '')) <> v_serie
       OR lpad(btrim(coalesce(v_cpe.numero, '')), 8, '0') <> v_numero
       OR btrim(coalesce(v_cpe.documento_receptor, ''))
          <> btrim(coalesce(p_cpe->>'documento_receptor', ''))
       OR upper(coalesce(v_cpe.moneda, 'PEN')) <> v_moneda
       OR abs(coalesce(v_cpe.total_venta, 0) - v_total) > 0.01
       OR (
         nullif(v_cpe.metadata->>'emission_fingerprint', '') IS NOT NULL
         AND v_cpe.metadata->>'emission_fingerprint' <> v_fingerprint
       )
       OR (
         nullif(v_cpe.metadata->>'emission_fingerprint', '') IS NULL
         AND coalesce(v_cpe.items, '[]'::jsonb) <> coalesce(p_cpe->'items', '[]'::jsonb)
       ) THEN
      RAISE EXCEPTION 'CPE_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    IF lower(v_cpe.estado::text) IN ('rechazado', 'anulado', 'error')
       OR lower(v_cpe.sunat_status::text) IN ('rejected', 'error') THEN
      RAISE EXCEPTION 'Un CPE rechazado/anulado no puede reconocer una factura'
        USING ERRCODE = '23514';
    END IF;
    IF v_cpe.event_id IS NOT NULL THEN
      v_event_id := v_cpe.event_id;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.cpe c
    WHERE c.tenant_id = p_tenant_id
      AND upper(c.tipo_documento) = v_tipo
      AND upper(c.serie) = v_serie
      AND lpad(btrim(c.numero), 8, '0') = v_numero
  ) THEN
    RAISE EXCEPTION 'El número fiscal ya pertenece a otra intención idempotente'
      USING ERRCODE = '23505';
  END IF;

  IF v_cpe_found AND v_cpe.documento_id IS NOT NULL THEN
    SELECT * INTO v_documento
    FROM public.documentos d
    WHERE d.id = v_cpe.documento_id AND d.tenant_id = p_tenant_id
    FOR UPDATE;
    v_documento_found := FOUND;
  END IF;
  IF NOT v_documento_found THEN
    SELECT * INTO v_documento
    FROM public.documentos d
    WHERE d.tenant_id = p_tenant_id
      AND upper(d.tipo_documento) = v_tipo_documento
      AND upper(d.serie) = v_serie
      AND upper(d.numero) = v_numero
    FOR UPDATE;
    v_documento_found := FOUND;
  END IF;

  IF v_documento_found THEN
    IF abs(coalesce(v_documento.total, 0) - v_total) > 0.01
       OR btrim(coalesce(v_documento.receptor_numero_doc,
                         v_documento.receptor_documento, ''))
          <> btrim(coalesce(p_cpe->>'documento_receptor', ''))
       OR (
         nullif(v_documento.metadata->>'emission_fingerprint', '') IS NOT NULL
         AND v_documento.metadata->>'emission_fingerprint' <> v_fingerprint
       ) THEN
      RAISE EXCEPTION 'El documento fiscal existente no coincide con el CPE'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    INSERT INTO public.documentos (
      tenant_id, tipo_documento, serie, numero, fecha_emision,
      fecha_vencimiento, moneda, tipo_cambio, subtotal, descuentos,
      impuesto_igv, impuesto_isc, otros_impuestos, total,
      total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
      emisor_ruc, emisor_razon_social, emisor_direccion,
      receptor_tipo_doc, receptor_numero_doc, receptor_documento,
      receptor_razon_social, receptor_nombre, receptor_direccion,
      pedido_id, cliente_id, metodo_pago, estado, estado_sunat,
      xml_content, codigo_hash, observaciones, created_by, updated_by,
      metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_tipo_documento, v_serie, v_numero, v_fecha_emision,
      v_fecha_vencimiento::timestamptz, v_moneda, v_tipo_cambio, v_subtotal, 0,
      v_igv, v_isc, 0, v_total,
      v_total_gravadas, v_total_exoneradas, v_total_inafectas, v_total_exportacion,
      p_cpe->>'ruc_emisor', p_cpe->>'razon_social_emisor', p_cpe->>'direccion_emisor',
      p_cpe->>'tipo_documento_receptor', p_cpe->>'documento_receptor',
      p_cpe->>'documento_receptor', p_cpe->>'razon_social_receptor',
      p_cpe->>'razon_social_receptor', p_cpe->>'direccion_receptor',
      v_pedido_id, v_cliente_id,
      CASE WHEN p_cxc IS NULL THEN 'CONTADO' ELSE 'CREDITO' END,
      'EMITIDO', 'PENDIENTE', p_cpe->>'xml_firmado',
      coalesce(p_cpe->>'hash_firma', p_cpe->>'hash'),
      'Documento generado atómicamente desde CPE ' || v_serie || '-' || v_numero,
      v_actor_id, v_actor_id,
      coalesce(p_documento->'metadata', '{}'::jsonb) || jsonb_build_object(
        'emission_fingerprint', v_fingerprint,
        'fingerprint_version', 1,
        'atomic_rpc', 'emitir_factura_cliente_tx'
      ),
      now(), now()
    ) RETURNING * INTO v_documento;
  END IF;

  FOR v_detail IN
    SELECT e AS item FROM jsonb_array_elements(v_detalles_canon) e
    ORDER BY (e->>'orden')::integer
  LOOP
    SELECT * INTO v_detail_existing
    FROM public.documento_detalles dd
    WHERE dd.documento_id = v_documento.id
      AND dd.orden = (v_detail.item->>'orden')::integer
    FOR UPDATE;

    IF FOUND THEN
      IF btrim(coalesce(v_detail_existing.descripcion, ''))
           IS DISTINCT FROM btrim(coalesce(v_detail.item->>'descripcion', ''))
         OR v_detail_existing.producto_id IS DISTINCT FROM nullif(v_detail.item->>'producto_id', '')::uuid
         OR abs(coalesce(v_detail_existing.cantidad, 0) - (v_detail.item->>'cantidad')::numeric) > 0.0001
         OR abs(coalesce(v_detail_existing.valor_venta, 0) - (v_detail.item->>'valor_venta')::numeric) > 0.01
         OR abs(coalesce(v_detail_existing.impuesto_igv, 0) - (v_detail.item->>'impuesto_igv')::numeric) > 0.01
         OR abs(coalesce(v_detail_existing.impuesto_isc, 0) - coalesce((v_detail.item->>'impuesto_isc')::numeric, 0)) > 0.01
         OR abs(coalesce(v_detail_existing.total_item, 0) - (v_detail.item->>'total_item')::numeric) > 0.01 THEN
        RAISE EXCEPTION 'El detalle fiscal existente no coincide en orden %', v_detail.item->>'orden'
          USING ERRCODE = '23505';
      END IF;
    ELSE
      INSERT INTO public.documento_detalles (
        tenant_id, documento_id, orden, producto_id, codigo_producto,
        descripcion, unidad_medida, cantidad, precio_unitario,
        descuento_unitario, valor_venta, impuesto_igv, impuesto_isc,
        total_item, metadata, created_at, updated_at
      ) VALUES (
        p_tenant_id, v_documento.id, (v_detail.item->>'orden')::integer,
        nullif(v_detail.item->>'producto_id', '')::uuid,
        coalesce(nullif(v_detail.item->>'codigo_producto', ''),
                 nullif(v_detail.item->>'producto_id', ''),
                 'ITEM-' || (v_detail.item->>'orden')),
        v_detail.item->>'descripcion',
        upper(coalesce(nullif(v_detail.item->>'unidad_medida', ''), 'NIU')),
        (v_detail.item->>'cantidad')::numeric,
        (v_detail.item->>'precio_unitario')::numeric,
        coalesce((v_detail.item->>'descuento_unitario')::numeric, 0),
        (v_detail.item->>'valor_venta')::numeric,
        (v_detail.item->>'impuesto_igv')::numeric,
        coalesce((v_detail.item->>'impuesto_isc')::numeric, 0),
        (v_detail.item->>'total_item')::numeric,
        jsonb_build_object(
          'afectacion_igv', coalesce(v_detail.item->>'afectacion_igv', '10'),
          'emission_fingerprint', v_fingerprint,
          'atomic_rpc', 'emitir_factura_cliente_tx'
        ),
        now(), now()
      );
      v_repaired := v_repaired OR v_cpe_found OR v_documento_found;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.documento_detalles dd
      WHERE dd.documento_id = v_documento.id) <> v_detail_count THEN
    RAISE EXCEPTION 'El documento contiene líneas adicionales o faltantes'
      USING ERRCODE = '23514';
  END IF;

  IF NOT v_cpe_found THEN
    INSERT INTO public.cpe (
      tenant_id, documento_id, tipo_documento, serie, numero,
      numero_comprobante, ruc_emisor, razon_social_emisor, direccion_emisor,
      tipo_documento_receptor, documento_receptor, razon_social_receptor,
      direccion_receptor, cliente_id, moneda,
      total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
      total_igv, total_venta, total, items, fecha_emision, fecha_vencimiento,
      idempotency_key, event_id, estado, estado_sunat, sunat_status,
      hash, hash_firma, xml_firmado, created_by, activo, metadata,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, v_documento.id, v_tipo, v_serie, v_numero,
      v_numero::integer, p_cpe->>'ruc_emisor', p_cpe->>'razon_social_emisor',
      p_cpe->>'direccion_emisor', p_cpe->>'tipo_documento_receptor',
      p_cpe->>'documento_receptor', p_cpe->>'razon_social_receptor',
      p_cpe->>'direccion_receptor', v_cliente_id, v_moneda,
      v_total_gravadas, v_total_exoneradas, v_total_inafectas, v_total_exportacion,
      v_igv, v_total, v_total, coalesce(p_cpe->'items', '[]'::jsonb),
      v_fecha_emision, v_fecha_vencimiento, v_key, v_event_id,
      'FIRMADO', 'PENDIENTE', 'READY',
      coalesce(p_cpe->>'hash', p_cpe->>'hash_firma'),
      coalesce(p_cpe->>'hash_firma', p_cpe->>'hash'),
      p_cpe->>'xml_firmado', v_actor_id, true,
      coalesce(p_cpe->'metadata', '{}'::jsonb) || jsonb_build_object(
        'emission_fingerprint', v_fingerprint,
        'fingerprint_version', 1,
        'atomic_rpc', 'emitir_factura_cliente_tx'
      ),
      now(), now()
    ) RETURNING * INTO v_cpe;
  ELSE
    UPDATE public.cpe c
    SET documento_id = v_documento.id,
        event_id = coalesce(c.event_id, v_event_id),
        created_by = coalesce(c.created_by, v_actor_id),
        metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
          'emission_fingerprint', v_fingerprint,
          'fingerprint_version', 1,
          'atomic_rpc', 'emitir_factura_cliente_tx'
        ),
        updated_at = now()
    WHERE c.id = v_cpe.id
    RETURNING * INTO v_cpe;
    v_repaired := true;
  END IF;
  v_event_id := v_cpe.event_id;

  IF p_cxc IS NOT NULL THEN
    v_cxc_cliente_id := nullif(p_cxc->>'cliente_id', '')::uuid;
    v_cxc_total := round(coalesce((p_cxc->>'monto_total')::numeric, 0), 2);
    v_cxc_pendiente := round(coalesce((p_cxc->>'monto_pendiente')::numeric, 0), 2);
    v_retencion := round(coalesce((p_cxc->>'retencion_total')::numeric, 0), 2);
    v_percepcion := round(coalesce((p_cxc->>'percepcion_total')::numeric, 0), 2);
    v_detraccion := round(coalesce((p_cxc->>'detraccion_total')::numeric, 0), 2);
    v_anticipo := round(coalesce((p_cxc->>'anticipo_total')::numeric, 0), 2);

    IF v_cxc_cliente_id IS NULL OR v_cxc_cliente_id IS DISTINCT FROM v_cliente_id
       OR NOT EXISTS (
         SELECT 1 FROM public.clientes c
         WHERE c.id = v_cxc_cliente_id AND c.tenant_id = p_tenant_id
           AND coalesce(c.activo, true)
       )
       OR abs(v_cxc_total - v_total) > 0.01
       OR least(v_retencion, v_percepcion, v_detraccion, v_anticipo, v_cxc_pendiente) < 0
       OR abs(v_cxc_pendiente
          - round(v_total - v_retencion - v_detraccion - v_anticipo + v_percepcion, 2)) > 0.01 THEN
      RAISE EXCEPTION 'Payload de cuenta por cobrar inválido o no pertenece al cliente'
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_cxc
    FROM public.cuentas_por_cobrar c
    WHERE c.tenant_id = p_tenant_id AND c.documento_id = v_documento.id
      AND lower(c.estado::text) NOT IN ('anulada', 'revertida')
    FOR UPDATE;
    v_cxc_found := FOUND;

    IF v_cxc_found THEN
      IF v_cxc.idempotency_key IS DISTINCT FROM lower(v_key)
         OR v_cxc.cliente_id IS DISTINCT FROM v_cxc_cliente_id
         OR abs(coalesce(v_cxc.monto_total, 0) - v_cxc_total) > 0.01
         OR abs(coalesce(v_cxc.monto_pendiente, 0) - v_cxc_pendiente) > 0.01 THEN
        RAISE EXCEPTION 'La CxC existente no coincide con la factura'
          USING ERRCODE = '23505';
      END IF;
    ELSE
      INSERT INTO public.cuentas_por_cobrar (
        tenant_id, cliente_id, pedido_id, documento_id,
        serie, numero, numero_documento, tipo_documento,
        fecha_emision, fecha_vencimiento, moneda, tipo_cambio_origen,
        monto_total, monto_original, total, monto_pendiente, saldo,
        saldo_pendiente, estado, dias_mora,
        retencion_total, percepcion_total, detraccion_total, anticipo_total,
        event_id, idempotency_key, event_source, activo, metadata,
        created_at, updated_at
      ) VALUES (
        p_tenant_id, v_cxc_cliente_id, v_pedido_id, v_documento.id,
        v_serie, v_numero, v_serie || '-' || v_numero, v_tipo_documento,
        v_fecha_emision::date, v_fecha_vencimiento, v_moneda,
        CASE WHEN v_moneda = 'PEN' THEN 1 ELSE v_tipo_cambio END,
        v_cxc_total, v_cxc_total, v_cxc_total, v_cxc_pendiente,
        v_cxc_pendiente, v_cxc_pendiente,
        CASE
          WHEN v_cxc_pendiente <= 0 THEN 'CANCELADO'
          WHEN v_retencion > 0 OR v_detraccion > 0 OR v_anticipo > 0 THEN 'PARCIAL'
          ELSE 'PENDIENTE'
        END,
        0, v_retencion, v_percepcion, v_detraccion, v_anticipo,
        v_event_id, v_key, 'cpe.api.atomic', true,
        jsonb_build_object(
          'cpe_id', v_cpe.id,
          'emission_fingerprint', v_fingerprint,
          'atomic_rpc', 'emitir_factura_cliente_tx'
        ),
        now(), now()
      ) RETURNING * INTO v_cxc;
    END IF;

    FOR v_ajuste IN
      SELECT * FROM jsonb_to_recordset(jsonb_build_array(
        jsonb_build_object('tipo', 'RETENCION', 'monto', v_retencion,
          'metodo', 'RETENCION', 'aplica', true, 'referencia', 'RETENCION'),
        jsonb_build_object('tipo', 'DETRACCION', 'monto', v_detraccion,
          'metodo', 'DETRACCION', 'aplica', false,
          'referencia', coalesce(p_cxc->>'detraccion_codigo', 'DETRACCION')),
        jsonb_build_object('tipo', 'ANTICIPO', 'monto', v_anticipo,
          'metodo', 'ANTICIPO', 'aplica', false, 'referencia', 'ANTICIPO')
      )) AS a(tipo text, monto numeric, metodo text, aplica boolean, referencia text)
      WHERE a.monto > 0
    LOOP
      INSERT INTO public.cxc_pagos (
        tenant_id, cuenta_id, pedido_id, documento_id, tipo, monto,
        moneda, fecha_pago, metodo_pago, referencia, aplica_retencion,
        retencion_monto, idempotency_key, event_id, source,
        estado, activo, metadata, created_at, updated_at
      ) VALUES (
        p_tenant_id, v_cxc.id, v_pedido_id, v_documento.id,
        v_ajuste.tipo, v_ajuste.monto, v_moneda, v_fecha_emision::date,
        v_ajuste.metodo, v_ajuste.referencia, v_ajuste.aplica,
        CASE WHEN v_ajuste.aplica THEN v_ajuste.monto ELSE 0 END,
        lower(v_key || ':' || v_ajuste.tipo), gen_random_uuid(),
        'cpe.api.atomic', 'ACTIVO', true,
        jsonb_build_object('automatico', true, 'cpe_id', v_cpe.id),
        now(), now()
      )
      ON CONFLICT (tenant_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL
      DO NOTHING;
    END LOOP;
  END IF;

  v_factura_payload := jsonb_build_object(
    'eventId', v_event_id,
    'tenantId', p_tenant_id,
    'idempotencyKey', v_key,
    'pedidoId', v_pedido_id,
    'cpeId', v_cpe.id,
    'facturaId', v_documento.id,
    'serie', v_serie,
    'numero', v_numero,
    'clienteId', coalesce(v_cliente_id::text, p_cpe->>'documento_receptor'),
    'subtotal', v_subtotal,
    'impuestos', v_igv + v_isc,
    'total', v_total,
    'moneda', v_moneda,
    'tipoCambio', v_tipo_cambio,
    'fechaEmision', v_fecha_emision,
    'fechaVencimiento', v_fecha_vencimiento,
    'source', 'cpe.api.atomic',
    'esCredito', p_cxc IS NOT NULL,
    'sunatStatus', upper(v_cpe.sunat_status::text),
    'hashFirma', v_cpe.hash_firma,
    'hash', v_cpe.hash,
    'costoVentas', round(coalesce((p_cpe->>'costo_ventas')::numeric, 0), 2),
    'ajustes', jsonb_build_object(
      'retencion', coalesce(v_retencion, 0),
      'percepcion', coalesce(v_percepcion, 0),
      'detraccion', coalesce(v_detraccion, 0),
      'anticipo', coalesce(v_anticipo, 0)
    )
  );

  SELECT * INTO v_outbox
  FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id AND o.event_type = 'factura.emitida'
    AND o.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_outbox.event_id IS DISTINCT FROM v_event_id
       OR v_outbox.aggregate_id IS DISTINCT FROM v_documento.id::text
       OR v_outbox.payload->>'cpeId' IS DISTINCT FROM v_cpe.id::text
       OR abs(coalesce((v_outbox.payload->>'total')::numeric, 0) - v_total) > 0.01 THEN
      RAISE EXCEPTION 'El outbox factura.emitida existente es incompatible'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, 'ventas', v_documento.id::text, 'factura.emitida',
      v_factura_payload, 'pending', 0, v_key, v_event_id,
      now(), now(), now()
    );
  END IF;

  SELECT * INTO v_outbox
  FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id AND o.event_type = 'comprobante.creado'
    AND o.idempotency_key = 'cpe.creado:' || p_tenant_id || ':' || v_cpe.id
  FOR UPDATE;
  IF FOUND THEN
    v_comprobante_event_id := v_outbox.event_id;
    IF v_outbox.aggregate_id IS DISTINCT FROM v_cpe.id::text
       OR v_outbox.payload->>'facturaId' IS DISTINCT FROM v_documento.id::text THEN
      RAISE EXCEPTION 'El outbox comprobante.creado existente es incompatible'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    v_comprobante_event_id := gen_random_uuid();
    v_comprobante_payload := jsonb_build_object(
      'eventId', v_comprobante_event_id,
      'tenantId', p_tenant_id,
      'idempotencyKey', 'cpe.creado:' || p_tenant_id || ':' || v_cpe.id,
      'cpeId', v_cpe.id,
      'facturaId', v_documento.id,
      'tipoDocumento', v_tipo,
      'serie', v_serie,
      'numero', v_numero::integer,
      'clienteId', coalesce(v_cliente_id::text, p_cpe->>'documento_receptor'),
      'total', v_total,
      'esCredito', p_cxc IS NOT NULL,
      'ventaId', v_pedido_id,
      'requiereTransporte', coalesce((p_cpe->>'requiere_transporte')::boolean, false),
      'moneda', v_moneda
    );
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at,
      created_at, updated_at
    ) VALUES (
      p_tenant_id, 'cpe', v_cpe.id::text, 'comprobante.creado',
      v_comprobante_payload, 'pending', 0,
      'cpe.creado:' || p_tenant_id || ':' || v_cpe.id,
      v_comprobante_event_id, now(), now(), now()
    );
  END IF;

  RETURN jsonb_build_object(
    'cpe', to_jsonb(v_cpe),
    'cpe_id', v_cpe.id,
    'documento_id', v_documento.id,
    'cxc_id', CASE WHEN p_cxc IS NULL THEN NULL ELSE v_cxc.id END,
    'factura_event_id', v_event_id,
    'comprobante_event_id', v_comprobante_event_id,
    'idempotent', v_cpe_found,
    'repaired', v_repaired
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.emitir_factura_cliente_tx(
  p_tenant_id uuid,
  p_cpe jsonb,
  p_documento jsonb,
  p_detalles jsonb,
  p_cxc jsonb,
  p_event_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.emitir_factura_cliente_tx(
    p_tenant_id, p_cpe, p_documento, p_detalles, p_cxc,
    p_event_id, p_idempotency_key
  );
$function$;

REVOKE ALL ON FUNCTION app.emitir_factura_cliente_tx(
  uuid, jsonb, jsonb, jsonb, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emitir_factura_cliente_tx(
  uuid, jsonb, jsonb, jsonb, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_factura_cliente_tx(
  uuid, jsonb, jsonb, jsonb, jsonb, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.emitir_factura_cliente_tx(
  uuid, jsonb, jsonb, jsonb, jsonb, uuid, text
) IS 'Persiste/repara factura o boleta, documento, líneas, CxC y outbox en una sola transacción; no realiza envío legal externo.';

COMMIT;

NOTIFY pgrst, 'reload schema';
