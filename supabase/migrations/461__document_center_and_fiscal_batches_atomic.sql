-- ============================================================================
-- 461__document_center_and_fiscal_batches_atomic.sql
-- Centro de Documentos manual + lotes SUNAT RA/RC:
-- - el borrador manual, sus lineas, correlativo y auditoria nacen juntos;
-- - el XML fiscal se firma por CPE y la 443 adopta/finaliza el borrador;
-- - RA/RC reservan cabecera+detalle en un commit y conservan retry/ticket durable;
-- - RA/RC sólo confirman la baja fiscal después de la reversa comercial 448;
--   nunca duplican CxC/asiento/stock ni dejan una baja fiscal incoherente.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS intent_fingerprint text,
  ADD COLUMN IF NOT EXISTS last_update_key text,
  ADD COLUMN IF NOT EXISTS last_update_fingerprint text;

ALTER TABLE public.documento_series
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS intent_fingerprint text;

ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS ck_documentos_estado_valid;
ALTER TABLE public.documentos
  ADD CONSTRAINT ck_documentos_estado_valid CHECK (
    lower(estado::text) = ANY (ARRAY[
      'borrador','emitido','enviado_sunat','aceptado','observado',
      'rechazado','anulado'
    ])
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_documentos_tenant_idempotency_461
  ON public.documentos (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_documentos_tenant_update_key_461
  ON public.documentos (tenant_id, last_update_key)
  WHERE last_update_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_documento_series_tenant_key_461
  ON public.documento_series (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_documentos_tenant_fiscal_number_461
  ON public.documentos (
    tenant_id,
    upper(tipo_documento),
    upper(serie),
    lpad(btrim(numero), 8, '0')
  )
  WHERE tenant_id IS NOT NULL AND tipo_documento IS NOT NULL
    AND serie IS NOT NULL AND numero IS NOT NULL;

ALTER TABLE public.comunicaciones_baja
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS envio_token uuid,
  ADD COLUMN IF NOT EXISTS envio_idempotency_key text,
  ADD COLUMN IF NOT EXISTS ultimo_intento_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminal_result text,
  ADD COLUMN IF NOT EXISTS terminal_fingerprint text;

ALTER TABLE public.resumenes_diarios
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS envio_token uuid,
  ADD COLUMN IF NOT EXISTS envio_idempotency_key text,
  ADD COLUMN IF NOT EXISTS ultimo_intento_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminal_result text,
  ADD COLUMN IF NOT EXISTS terminal_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicaciones_baja_tenant_key_461
  ON public.comunicaciones_baja (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_resumenes_diarios_tenant_key_461
  ON public.resumenes_diarios (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comunicaciones_baja_retry_461
  ON public.comunicaciones_baja (tenant_id, estado, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_resumenes_diarios_retry_461
  ON public.resumenes_diarios (tenant_id, estado, next_retry_at);

CREATE OR REPLACE FUNCTION app.assert_actor_461(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'DOCUMENT_FLOW_ACTOR_NOT_IN_TENANT'
      USING ERRCODE = '23514';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.crear_serie_documento_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_tipo_documento text,
  p_serie text,
  p_correlativo_maximo integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo_documento, '')));
  v_serie text := upper(btrim(coalesce(p_serie, '')));
  v_maximo integer := coalesce(p_correlativo_maximo, 99999999);
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_fingerprint text;
  v_row public.documento_series;
BEGIN
  IF p_tenant_id IS NULL OR v_tipo NOT IN ('FACTURA','BOLETA','CONTRATO')
     OR v_serie !~ '^[A-Z0-9]{1,10}$'
     OR v_maximo NOT BETWEEN 1 AND 99999999
     OR length(v_key) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION 'DOCUMENT_SERIES_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':document-series:' || v_key, 461)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':document-series-scope:' || v_tipo || ':' || v_serie, 461)
  );
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tipo_documento', v_tipo,
    'serie', v_serie,
    'correlativo_maximo', v_maximo
  )::text, 'UTF8'), 'sha256'), 'hex');

  SELECT * INTO v_row
  FROM public.documento_series ds
  WHERE ds.tenant_id = p_tenant_id AND ds.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_row.intent_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'DOCUMENT_SERIES_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('serie', to_jsonb(v_row), 'idempotent', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.documento_series ds
    WHERE ds.tenant_id = p_tenant_id
      AND upper(ds.tipo_documento) = v_tipo
      AND upper(ds.serie) = v_serie
  ) THEN
    RAISE EXCEPTION 'DOCUMENT_SERIES_ALREADY_EXISTS_OR_INACTIVE' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.documento_series (
    tenant_id, tipo_documento, serie, correlativo_actual, correlativo_maximo,
    longitud_correlativo, activo, estado, idempotency_key, intent_fingerprint,
    metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_tipo, v_serie, 0, v_maximo, 8, true, 'ACTIVO',
    v_key, v_fingerprint,
    jsonb_build_object(
      'created_by', p_actor_id,
      'source', 'documentos.series.atomic',
      'fingerprint_version', 1,
      'atomic_rpc', 'crear_serie_documento_tx'
    ),
    now(), now()
  ) RETURNING * INTO v_row;

  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id,
    old_values, new_values, changed_fields, metadata
  ) VALUES (
    p_tenant_id, p_actor_id, 'documento_series', 'INSERT', v_row.id::text,
    NULL, to_jsonb(v_row), NULL,
    jsonb_build_object(
      'accion', 'CREAR_SERIE_DOCUMENTO',
      'source', 'documentos_461',
      'idempotency_key', v_key,
      'fingerprint', v_fingerprint
    )
  );

  RETURN jsonb_build_object('serie', to_jsonb(v_row), 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.calcular_documento_manual_461(
  p_tenant_id uuid,
  p_detalles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tasa numeric(10,8);
  v_items jsonb;
  v_subtotal numeric(14,2);
  v_descuentos numeric(14,2);
  v_igv numeric(14,2);
  v_total numeric(14,2);
  v_gravadas numeric(14,2);
  v_exoneradas numeric(14,2);
  v_inafectas numeric(14,2);
  v_exportacion numeric(14,2);
BEGIN
  IF p_tenant_id IS NULL OR p_detalles IS NULL
     OR jsonb_typeof(p_detalles) <> 'array'
     OR jsonb_array_length(p_detalles) NOT BETWEEN 1 AND 999 THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_ITEMS_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  SELECT greatest(coalesce(ec.igv_porcentaje, 18), 0) / 100
    INTO v_tasa
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  ORDER BY ec.updated_at DESC NULLS LAST, ec.id
  LIMIT 1;
  v_tasa := coalesce(v_tasa, 0.18);

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_detalles) e
    WHERE jsonb_typeof(e) <> 'object'
       OR btrim(coalesce(e->>'descripcion', '')) = ''
       OR btrim(coalesce(e->>'unidad_medida', '')) !~ '^[A-Za-z0-9]{2,5}$'
       OR app.to_numeric_or_zero(e->>'cantidad') <= 0
       OR app.to_numeric_or_zero(e->>'precio_unitario') < 0
       OR app.to_numeric_or_zero(e->>'descuento_unitario') < 0
       OR app.to_numeric_or_zero(e->>'descuento_unitario')
          > app.to_numeric_or_zero(e->>'precio_unitario')
       OR coalesce(nullif(btrim(e->>'afectacion_igv'), ''), '10')
          !~ '^(10|11|12|13|14|15|16|17|20|21|30|31|32|33|34|35|36|40)$'
  ) THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_ITEM_INVALID'
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
    RAISE EXCEPTION 'DOCUMENT_MANUAL_PRODUCT_NOT_IN_TENANT'
      USING ERRCODE = '23514';
  END IF;

  WITH raw AS (
    SELECT
      ordinality::integer AS orden,
      nullif(e->>'producto_id', '')::uuid AS producto_id,
      coalesce(nullif(btrim(e->>'codigo_producto'), ''), 'ITEM-' || ordinality) AS codigo_producto,
      btrim(e->>'descripcion') AS descripcion,
      upper(btrim(e->>'unidad_medida')) AS unidad_medida,
      app.to_numeric_or_zero(e->>'cantidad') AS cantidad,
      app.to_numeric_or_zero(e->>'precio_unitario') AS precio_unitario,
      app.to_numeric_or_zero(e->>'descuento_unitario') AS descuento_unitario,
      coalesce(nullif(btrim(e->>'afectacion_igv'), ''), '10') AS afectacion_igv
    FROM jsonb_array_elements(p_detalles) WITH ORDINALITY AS d(e, ordinality)
  ), calc AS (
    SELECT *,
      round(cantidad * (precio_unitario - descuento_unitario), 2) AS valor_venta,
      round(cantidad * descuento_unitario, 2) AS descuento_total
    FROM raw
  ), taxed AS (
    SELECT *,
      CASE WHEN left(afectacion_igv, 1) = '1'
        THEN round(valor_venta * v_tasa, 2) ELSE 0::numeric END AS impuesto_igv
    FROM calc
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'orden', orden,
      'producto_id', producto_id,
      'codigo_producto', codigo_producto,
      'descripcion', descripcion,
      'unidad_medida', unidad_medida,
      'cantidad', cantidad,
      'precio_unitario', precio_unitario,
      'descuento_unitario', descuento_unitario,
      'valor_venta', valor_venta,
      'impuesto_igv', impuesto_igv,
      'impuesto_isc', 0,
      'total_item', round(valor_venta + impuesto_igv, 2),
      'afectacion_igv', afectacion_igv
    ) ORDER BY orden),
    round(sum(valor_venta), 2),
    round(sum(descuento_total), 2),
    round(sum(impuesto_igv), 2),
    round(sum(valor_venta + impuesto_igv), 2),
    round(sum(CASE WHEN left(afectacion_igv, 1) = '1' THEN valor_venta ELSE 0 END), 2),
    round(sum(CASE WHEN afectacion_igv IN ('20','21') THEN valor_venta ELSE 0 END), 2),
    round(sum(CASE WHEN left(afectacion_igv, 1) = '3' THEN valor_venta ELSE 0 END), 2),
    round(sum(CASE WHEN afectacion_igv = '40' THEN valor_venta ELSE 0 END), 2)
  INTO v_items, v_subtotal, v_descuentos, v_igv, v_total,
       v_gravadas, v_exoneradas, v_inafectas, v_exportacion
  FROM taxed;

  IF coalesce(v_total, 0) <= 0 THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_TOTAL_MUST_BE_POSITIVE'
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'items', v_items,
    'subtotal', v_subtotal,
    'descuentos', v_descuentos,
    'igv', v_igv,
    'total', v_total,
    'gravadas', v_gravadas,
    'exoneradas', v_exoneradas,
    'inafectas', v_inafectas,
    'exportacion', v_exportacion,
    'tasa_igv', v_tasa
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.crear_documento_manual_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_detalles jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_tipo text := upper(btrim(coalesce(p_payload->>'tipo_documento', '')));
  v_pais text;
  v_serie text;
  v_numero text;
  v_moneda text := upper(btrim(coalesce(p_payload->>'moneda', 'PEN')));
  v_tipo_cambio numeric(14,6) := coalesce(nullif(p_payload->>'tipo_cambio', '')::numeric, 1);
  v_condicion text := upper(btrim(coalesce(p_payload->>'condicion_pago', 'CONTADO')));
  v_fecha date := nullif(p_payload->>'fecha_emision', '')::date;
  v_vencimiento date := nullif(p_payload->>'fecha_vencimiento', '')::date;
  v_cliente_id uuid := nullif(p_payload->>'cliente_id', '')::uuid;
  v_receptor_doc text := upper(regexp_replace(btrim(coalesce(p_payload->>'receptor_numero_doc', '')), '[^0-9A-Z]', '', 'g'));
  v_calc jsonb;
  v_items jsonb;
  v_fingerprint text;
  v_documento public.documentos;
  v_actor_fk uuid;
  v_empresa record;
  v_item jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 255
     OR v_tipo NOT IN ('FACTURA', 'BOLETA', 'CONTRATO')
     OR v_moneda !~ '^[A-Z]{3}$'
     OR v_condicion NOT IN ('CONTADO', 'CREDITO')
     OR v_fecha IS NULL
     OR (v_vencimiento IS NOT NULL AND v_vencimiento < v_fecha)
     OR v_receptor_doc = ''
     OR btrim(coalesce(p_payload->>'receptor_razon_social', '')) = '' THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_HEADER_INVALID'
      USING ERRCODE = '22023';
  END IF;
  IF v_moneda = 'PEN' THEN
    v_tipo_cambio := 1;
  ELSIF v_tipo_cambio <= 0 THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_FX_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':doc-manual:' || v_key, 461));

  SELECT
    upper(coalesce(nullif(ec.pais, ''), nullif(t.pais, ''), 'PE')) AS pais,
    coalesce(nullif(ec.ruc, ''), nullif(t.ruc, '')) AS ruc,
    coalesce(nullif(ec.razon_social, ''), nullif(t.nombre, '')) AS razon_social,
    coalesce(nullif(ec.direccion_fiscal, ''), '') AS direccion,
    ec.serie_factura,
    ec.serie_boleta
  INTO v_empresa
  FROM public.tenants t
  LEFT JOIN public.empresa_config ec ON ec.tenant_id = t.id
  WHERE t.id = p_tenant_id
  ORDER BY ec.updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  v_pais := coalesce(v_empresa.pais, 'PE');
  IF v_tipo <> 'CONTRATO' AND (
    btrim(coalesce(v_empresa.ruc, '')) = '' OR btrim(coalesce(v_empresa.razon_social, '')) = ''
  ) THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_COMPANY_PROFILE_INCOMPLETE'
      USING ERRCODE = '23514';
  END IF;

  v_serie := upper(btrim(coalesce(nullif(p_payload->>'serie', ''),
    CASE
      WHEN v_tipo = 'FACTURA' THEN coalesce(nullif(v_empresa.serie_factura, ''), CASE WHEN v_pais = 'CO' THEN 'FE' ELSE 'F001' END)
      WHEN v_tipo = 'BOLETA' THEN coalesce(nullif(v_empresa.serie_boleta, ''), CASE WHEN v_pais = 'CO' THEN 'FE' ELSE 'B001' END)
      ELSE 'C001'
    END
  )));
  IF v_serie !~ '^[A-Z0-9]{1,10}$'
     OR (v_pais = 'PE' AND v_tipo = 'FACTURA' AND left(v_serie, 1) <> 'F')
     OR (v_pais = 'PE' AND v_tipo = 'BOLETA' AND left(v_serie, 1) <> 'B') THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_SERIES_INVALID_FOR_TYPE'
      USING ERRCODE = '23514';
  END IF;

  -- `obtener_siguiente_numero_documento` conserva compatibilidad legacy y
  -- auto-crea series. El Centro de Documentos no puede usar ese atajo: crear
  -- una serie requiere el permiso/RPC específico y su propia auditoría 461.
  PERFORM 1
  FROM public.documento_series ds
  WHERE ds.tenant_id = p_tenant_id
    AND upper(ds.tipo_documento) = v_tipo
    AND upper(ds.serie) = v_serie
    AND coalesce(ds.activo, true)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_SERIES_NOT_CONFIGURED: %/%', v_tipo, v_serie
      USING ERRCODE = '23514';
  END IF;

  IF v_cliente_id IS NULL THEN
    SELECT c.id INTO v_cliente_id
    FROM public.clientes c
    WHERE c.tenant_id = p_tenant_id
      AND coalesce(c.activo, true)
      AND upper(regexp_replace(coalesce(
        nullif(c.ruc, ''), nullif(c.documento_identidad, ''),
        nullif(c.numero_documento::text, ''), nullif(c.documento_numero::text, ''), ''
      ), '[^0-9A-Z]', '', 'g')) = v_receptor_doc
    ORDER BY c.updated_at DESC NULLS LAST, c.id
    LIMIT 1;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = v_cliente_id AND c.tenant_id = p_tenant_id AND coalesce(c.activo, true)
  ) THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_CLIENT_NOT_IN_TENANT'
      USING ERRCODE = '23514';
  END IF;
  IF v_condicion = 'CREDITO' AND v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_CREDIT_REQUIRES_CLIENT_MASTER'
      USING ERRCODE = '23514';
  END IF;

  v_calc := app.calcular_documento_manual_461(p_tenant_id, p_detalles);
  v_items := v_calc->'items';
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tipo', v_tipo, 'serie', v_serie, 'fecha', v_fecha,
    'vencimiento', v_vencimiento, 'moneda', v_moneda,
    'tipo_cambio', v_tipo_cambio, 'condicion', v_condicion,
    'cliente_id', v_cliente_id, 'receptor_tipo', upper(btrim(coalesce(p_payload->>'receptor_tipo_doc', ''))),
    'receptor_documento', v_receptor_doc,
    'receptor_nombre', btrim(p_payload->>'receptor_razon_social'),
    'receptor_direccion', btrim(coalesce(p_payload->>'receptor_direccion', '')),
    'items', v_items
  )::text, 'UTF8'), 'sha256'), 'hex');

  SELECT * INTO v_documento
  FROM public.documentos d
  WHERE d.tenant_id = p_tenant_id AND d.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_documento.intent_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'DOCUMENT_MANUAL_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'documento', to_jsonb(v_documento),
      'detalles', (SELECT coalesce(jsonb_agg(to_jsonb(dd) ORDER BY dd.orden), '[]'::jsonb)
        FROM public.documento_detalles dd WHERE dd.documento_id = v_documento.id),
      'idempotent', true
    );
  END IF;

  v_numero := public.obtener_siguiente_numero_documento(p_tenant_id, v_tipo, v_serie);
  SELECT p_actor_id INTO v_actor_fk
  WHERE EXISTS (SELECT 1 FROM public.usuarios_sistema us WHERE us.id = p_actor_id AND us.tenant_id = p_tenant_id);

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
    moneda, tipo_cambio, subtotal, descuentos, impuesto_igv, impuesto_isc,
    otros_impuestos, total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, emisor_ruc, emisor_razon_social, emisor_direccion,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, receptor_direccion, receptor_email,
    cliente_id, metodo_pago, estado, estado_sunat, observaciones,
    created_by, updated_by, idempotency_key, intent_fingerprint, metadata,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, v_tipo, v_serie, v_numero, v_fecha::timestamptz, v_vencimiento::timestamptz,
    v_moneda, v_tipo_cambio, (v_calc->>'subtotal')::numeric,
    (v_calc->>'descuentos')::numeric, (v_calc->>'igv')::numeric, 0, 0,
    (v_calc->>'total')::numeric, (v_calc->>'gravadas')::numeric,
    (v_calc->>'exoneradas')::numeric, (v_calc->>'inafectas')::numeric,
    (v_calc->>'exportacion')::numeric, v_empresa.ruc, v_empresa.razon_social,
    v_empresa.direccion, upper(btrim(coalesce(p_payload->>'receptor_tipo_doc', ''))),
    v_receptor_doc, v_receptor_doc, btrim(p_payload->>'receptor_razon_social'),
    btrim(p_payload->>'receptor_razon_social'), nullif(btrim(p_payload->>'receptor_direccion'), ''),
    nullif(lower(btrim(p_payload->>'receptor_email')), ''), v_cliente_id,
    v_condicion, 'BORRADOR', 'NO_ENVIADO', nullif(btrim(p_payload->>'observaciones'), ''),
    v_actor_fk, v_actor_fk, v_key, v_fingerprint,
    jsonb_build_object(
      'source', 'documentos.manual.atomic', 'actor_id', p_actor_id,
      'draft_fingerprint', v_fingerprint, 'fingerprint_version', 1,
      'condicion_pago', v_condicion, 'atomic_rpc', 'crear_documento_manual_tx'
    ), now(), now()
  ) RETURNING * INTO v_documento;

  FOR v_item IN SELECT e FROM jsonb_array_elements(v_items) e LOOP
    INSERT INTO public.documento_detalles (
      tenant_id, documento_id, orden, producto_id, codigo_producto, descripcion,
      unidad_medida, cantidad, precio_unitario, descuento_unitario, valor_venta,
      impuesto_igv, impuesto_isc, total_item, metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_documento.id, (v_item->>'orden')::integer,
      nullif(v_item->>'producto_id', '')::uuid, v_item->>'codigo_producto',
      v_item->>'descripcion', v_item->>'unidad_medida', (v_item->>'cantidad')::numeric,
      (v_item->>'precio_unitario')::numeric, (v_item->>'descuento_unitario')::numeric,
      (v_item->>'valor_venta')::numeric, (v_item->>'impuesto_igv')::numeric,
      0, (v_item->>'total_item')::numeric,
      jsonb_build_object('afectacion_igv', v_item->>'afectacion_igv',
        'draft_fingerprint', v_fingerprint, 'atomic_rpc', 'crear_documento_manual_tx'),
      now(), now()
    );
  END LOOP;

  INSERT INTO public.documento_auditoria (
    tenant_id, documento_id, accion, usuario_id, detalles_cambio, "timestamp", metadata
  ) VALUES (
    p_tenant_id, v_documento.id, 'CREADO', p_actor_id,
    'Borrador manual creado de forma atómica', now(),
    jsonb_build_object('idempotency_key', v_key, 'fingerprint', v_fingerprint,
      'atomic_rpc', 'crear_documento_manual_tx')
  );

  RETURN jsonb_build_object(
    'documento', to_jsonb(v_documento), 'detalles', v_items,
    'idempotent', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.actualizar_documento_manual_tx(
  p_documento_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_detalles jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_documento public.documentos;
  v_calc jsonb;
  v_items jsonb;
  v_fingerprint text;
  v_cliente_id uuid := nullif(p_payload->>'cliente_id', '')::uuid;
  v_condicion text := upper(btrim(coalesce(p_payload->>'condicion_pago', 'CONTADO')));
  v_receptor_doc text := upper(regexp_replace(btrim(coalesce(p_payload->>'receptor_numero_doc', '')), '[^0-9A-Z]', '', 'g'));
  v_moneda text := upper(btrim(coalesce(p_payload->>'moneda', 'PEN')));
  v_tipo_cambio numeric(14,6) := coalesce(nullif(p_payload->>'tipo_cambio', '')::numeric, 1);
  v_fecha date := nullif(p_payload->>'fecha_emision', '')::date;
  v_vencimiento date := nullif(p_payload->>'fecha_vencimiento', '')::date;
  v_actor_fk uuid;
  v_item jsonb;
BEGIN
  IF p_documento_id IS NULL OR p_tenant_id IS NULL OR length(v_key) NOT BETWEEN 8 AND 255
     OR v_condicion NOT IN ('CONTADO','CREDITO') OR v_moneda !~ '^[A-Z]{3}$'
     OR v_fecha IS NULL OR (v_vencimiento IS NOT NULL AND v_vencimiento < v_fecha)
     OR v_receptor_doc = '' OR btrim(coalesce(p_payload->>'receptor_razon_social', '')) = '' THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_UPDATE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_moneda = 'PEN' THEN v_tipo_cambio := 1; END IF;
  IF v_tipo_cambio <= 0 THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_FX_REQUIRED' USING ERRCODE = '23514';
  END IF;
  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':doc-manual-update:' || p_documento_id::text, 461));

  SELECT * INTO v_documento
  FROM public.documentos d
  WHERE d.id = p_documento_id AND d.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_MANUAL_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF upper(v_documento.estado::text) <> 'BORRADOR'
     OR upper(v_documento.tipo_documento) NOT IN ('FACTURA','BOLETA','CONTRATO')
     OR EXISTS (SELECT 1 FROM public.cpe c WHERE c.tenant_id = p_tenant_id AND c.documento_id = p_documento_id) THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_ONLY_UNLINKED_DRAFT_IS_EDITABLE'
      USING ERRCODE = '23514';
  END IF;
  IF upper(btrim(coalesce(p_payload->>'tipo_documento', ''))) <> upper(v_documento.tipo_documento)
     OR (
       nullif(btrim(p_payload->>'serie'), '') IS NOT NULL
       AND upper(btrim(p_payload->>'serie')) <> upper(v_documento.serie)
     ) THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_TYPE_AND_NUMBER_ARE_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;

  IF v_cliente_id IS NULL THEN
    SELECT c.id INTO v_cliente_id
    FROM public.clientes c
    WHERE c.tenant_id = p_tenant_id AND coalesce(c.activo, true)
      AND upper(regexp_replace(coalesce(nullif(c.ruc, ''), nullif(c.documento_identidad, ''),
        nullif(c.numero_documento::text, ''), nullif(c.documento_numero::text, ''), ''),
        '[^0-9A-Z]', '', 'g')) = v_receptor_doc
    ORDER BY c.updated_at DESC NULLS LAST, c.id LIMIT 1;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id = v_cliente_id
      AND c.tenant_id = p_tenant_id AND coalesce(c.activo, true)
  ) THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_CLIENT_NOT_IN_TENANT' USING ERRCODE = '23514';
  END IF;
  IF v_condicion = 'CREDITO' AND v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'DOCUMENT_MANUAL_CREDIT_REQUIRES_CLIENT_MASTER' USING ERRCODE = '23514';
  END IF;

  v_calc := app.calcular_documento_manual_461(p_tenant_id, p_detalles);
  v_items := v_calc->'items';
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'documento_id', p_documento_id, 'fecha', v_fecha, 'vencimiento', v_vencimiento,
    'moneda', v_moneda, 'tipo_cambio', v_tipo_cambio, 'condicion', v_condicion,
    'cliente_id', v_cliente_id, 'receptor_documento', v_receptor_doc,
    'receptor_nombre', btrim(p_payload->>'receptor_razon_social'), 'items', v_items
  )::text, 'UTF8'), 'sha256'), 'hex');

  IF v_documento.last_update_key = v_key THEN
    IF v_documento.last_update_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'DOCUMENT_MANUAL_UPDATE_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('documento', to_jsonb(v_documento), 'detalles', v_items, 'idempotent', true);
  END IF;

  SELECT p_actor_id INTO v_actor_fk
  WHERE EXISTS (SELECT 1 FROM public.usuarios_sistema us WHERE us.id = p_actor_id AND us.tenant_id = p_tenant_id);
  UPDATE public.documentos d
  SET fecha_emision = v_fecha::timestamptz,
      fecha_vencimiento = v_vencimiento::timestamptz,
      moneda = v_moneda,
      tipo_cambio = v_tipo_cambio,
      subtotal = (v_calc->>'subtotal')::numeric,
      descuentos = (v_calc->>'descuentos')::numeric,
      impuesto_igv = (v_calc->>'igv')::numeric,
      total = (v_calc->>'total')::numeric,
      total_gravadas = (v_calc->>'gravadas')::numeric,
      total_exoneradas = (v_calc->>'exoneradas')::numeric,
      total_inafectas = (v_calc->>'inafectas')::numeric,
      total_exportacion = (v_calc->>'exportacion')::numeric,
      receptor_tipo_doc = upper(btrim(coalesce(p_payload->>'receptor_tipo_doc', ''))),
      receptor_numero_doc = v_receptor_doc,
      receptor_documento = v_receptor_doc,
      receptor_razon_social = btrim(p_payload->>'receptor_razon_social'),
      receptor_nombre = btrim(p_payload->>'receptor_razon_social'),
      receptor_direccion = nullif(btrim(p_payload->>'receptor_direccion'), ''),
      receptor_email = nullif(lower(btrim(p_payload->>'receptor_email')), ''),
      cliente_id = v_cliente_id,
      metodo_pago = v_condicion,
      observaciones = nullif(btrim(p_payload->>'observaciones'), ''),
      updated_by = coalesce(v_actor_fk, d.updated_by),
      last_update_key = v_key,
      last_update_fingerprint = v_fingerprint,
      metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
        'last_update_actor_id', p_actor_id, 'last_update_fingerprint', v_fingerprint,
        'condicion_pago', v_condicion, 'atomic_rpc', 'actualizar_documento_manual_tx'
      ),
      updated_at = now()
  WHERE d.id = p_documento_id
  RETURNING * INTO v_documento;

  DELETE FROM public.documento_detalles dd
  WHERE dd.documento_id = p_documento_id AND dd.tenant_id = p_tenant_id;
  FOR v_item IN SELECT e FROM jsonb_array_elements(v_items) e LOOP
    INSERT INTO public.documento_detalles (
      tenant_id, documento_id, orden, producto_id, codigo_producto, descripcion,
      unidad_medida, cantidad, precio_unitario, descuento_unitario, valor_venta,
      impuesto_igv, impuesto_isc, total_item, metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, p_documento_id, (v_item->>'orden')::integer,
      nullif(v_item->>'producto_id', '')::uuid, v_item->>'codigo_producto',
      v_item->>'descripcion', v_item->>'unidad_medida', (v_item->>'cantidad')::numeric,
      (v_item->>'precio_unitario')::numeric, (v_item->>'descuento_unitario')::numeric,
      (v_item->>'valor_venta')::numeric, (v_item->>'impuesto_igv')::numeric,
      0, (v_item->>'total_item')::numeric,
      jsonb_build_object('afectacion_igv', v_item->>'afectacion_igv',
        'update_fingerprint', v_fingerprint, 'atomic_rpc', 'actualizar_documento_manual_tx'),
      now(), now()
    );
  END LOOP;

  INSERT INTO public.documento_auditoria (
    tenant_id, documento_id, accion, usuario_id, detalles_cambio, "timestamp", metadata
  ) VALUES (
    p_tenant_id, p_documento_id, 'MODIFICADO', p_actor_id,
    'Borrador manual reemplazado de forma atómica', now(),
    jsonb_build_object('idempotency_key', v_key, 'fingerprint', v_fingerprint,
      'atomic_rpc', 'actualizar_documento_manual_tx')
  );

  RETURN jsonb_build_object('documento', to_jsonb(v_documento), 'detalles', v_items, 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.anular_documento_borrador_tx(
  p_documento_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_motivo text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_documento public.documentos;
  v_fingerprint text;
BEGIN
  IF p_documento_id IS NULL OR p_tenant_id IS NULL OR length(v_key) NOT BETWEEN 8 AND 255
     OR length(v_motivo) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'DOCUMENT_DRAFT_CANCELLATION_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':doc-draft-cancel:' || p_documento_id::text, 461));
  SELECT * INTO v_documento FROM public.documentos d
  WHERE d.id = p_documento_id AND d.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_MANUAL_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.cpe c WHERE c.tenant_id = p_tenant_id AND c.documento_id = p_documento_id) THEN
    RAISE EXCEPTION 'DOCUMENT_DRAFT_HAS_CPE_USE_CANCELLATION_448' USING ERRCODE = '23514';
  END IF;
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'documento_id', p_documento_id, 'motivo', v_motivo
  )::text, 'UTF8'), 'sha256'), 'hex');
  IF upper(v_documento.estado::text) = 'ANULADO' THEN
    IF v_documento.metadata->>'draft_cancellation_key' IS DISTINCT FROM v_key
       OR v_documento.metadata->>'draft_cancellation_fingerprint' IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'DOCUMENT_DRAFT_CANCELLATION_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('documento_id', p_documento_id, 'estado', 'ANULADO', 'idempotent', true);
  END IF;
  IF upper(v_documento.estado::text) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'DOCUMENT_ONLY_DRAFT_CAN_BE_LOCALLY_CANCELLED' USING ERRCODE = '23514';
  END IF;
  UPDATE public.documentos d
  SET estado = 'ANULADO', motivo_anulacion = v_motivo,
      metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
        'draft_cancellation_key', v_key,
        'draft_cancellation_fingerprint', v_fingerprint,
        'draft_cancelled_by', p_actor_id,
        'atomic_rpc', 'anular_documento_borrador_tx'
      ), updated_at = now()
  WHERE d.id = p_documento_id;
  INSERT INTO public.documento_auditoria (
    tenant_id, documento_id, accion, usuario_id, detalles_cambio, "timestamp", metadata
  ) VALUES (
    p_tenant_id, p_documento_id, 'ANULADO', p_actor_id, v_motivo, now(),
    jsonb_build_object('idempotency_key', v_key, 'fingerprint', v_fingerprint,
      'atomic_rpc', 'anular_documento_borrador_tx')
  );
  RETURN jsonb_build_object('documento_id', p_documento_id, 'estado', 'ANULADO', 'idempotent', false);
END;
$function$;

-- 448 es el dueño de la reversa comercial. Cuando su finalización marca el CPE
-- original como ANULADO, se congela una señal inequívoca que RA/RC pueden exigir
-- sin repetir CxC, stock, pedido ni asientos.
CREATE OR REPLACE FUNCTION app.marcar_reversa_comercial_cpe_461()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF upper(coalesce(NEW.estado::text, '')) = 'ANULADO'
     AND NEW.metadata->>'atomic_rpc' = 'finalizar_anulacion_cpe_tx'
     AND nullif(NEW.metadata->>'cancellation_finalization_key', '') IS NOT NULL THEN
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'commercial_reversal_handled', true,
      'commercial_reversal_owner', 'finalizar_anulacion_cpe_tx',
      'commercial_reversal_confirmed_at', coalesce(NEW.anulado_at, now())
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_marcar_reversa_comercial_cpe_461 ON public.cpe;
CREATE TRIGGER trg_marcar_reversa_comercial_cpe_461
BEFORE UPDATE OF estado, metadata ON public.cpe
FOR EACH ROW EXECUTE FUNCTION app.marcar_reversa_comercial_cpe_461();

-- La 443 adopta el documento manual por tipo/serie/numero. Este trigger corre
-- dentro de la misma transaccion que inserta el CPE y evita dejar el borrador
-- en BORRADOR tras haber creado CPE/CxC/outbox.
CREATE OR REPLACE FUNCTION app.sync_documento_manual_desde_cpe_461()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_updated integer;
  v_estado_documento text;
  v_estado_fiscal text;
  v_accion text;
BEGIN
  IF NEW.documento_id IS NULL OR upper(coalesce(NEW.tipo_documento, '')) NOT IN ('01','03') THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(NEW.estado::text, '')) = 'ANULADO' THEN
    v_estado_documento := 'ANULADO';
    v_estado_fiscal := 'ANULADO';
    v_accion := 'ANULADO_COMERCIAL';
  ELSIF upper(coalesce(NEW.estado::text, '')) = 'ACEPTADO'
     OR upper(coalesce(NEW.sunat_status::text, '')) = 'ACCEPTED' THEN
    v_estado_documento := 'ACEPTADO';
    v_estado_fiscal := 'ACEPTADO';
    v_accion := 'ACEPTADO_FISCAL';
  ELSIF upper(coalesce(NEW.sunat_status::text, '')) = 'ERROR' THEN
    -- Un fallo técnico no invalida el comprobante firmado. Vuelve a EMITIDO
    -- para que la misma intención pueda reintentarse desde la pantalla.
    v_estado_documento := 'EMITIDO';
    v_estado_fiscal := 'ERROR_REINTENTABLE';
    v_accion := 'ERROR_ENVIO_REINTENTABLE';
  ELSIF upper(coalesce(NEW.estado::text, '')) IN ('RECHAZADO','ERROR')
     OR upper(coalesce(NEW.sunat_status::text, '')) = 'REJECTED' THEN
    v_estado_documento := 'RECHAZADO';
    v_estado_fiscal := 'RECHAZADO';
    v_accion := 'RECHAZADO_FISCAL';
  ELSIF upper(coalesce(NEW.estado::text, '')) = 'ENVIADO'
     OR upper(coalesce(NEW.sunat_status::text, '')) = 'SENDING' THEN
    v_estado_documento := 'ENVIADO_SUNAT';
    v_estado_fiscal := 'ENVIADO';
    v_accion := 'ENVIADO_SUNAT';
  ELSE
    v_estado_documento := 'EMITIDO';
    v_estado_fiscal := 'PENDIENTE';
    v_accion := 'XML_FIRMADO';
  END IF;

  UPDATE public.documentos d
  SET estado = v_estado_documento, estado_sunat = v_estado_fiscal,
      xml_content = NEW.xml_firmado,
      codigo_hash = coalesce(NEW.hash_firma, NEW.hash),
      metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
        'cpe_id', NEW.id,
        'emission_fingerprint', NEW.metadata->>'emission_fingerprint',
        'emitted_by', NEW.created_by,
        'commercial_reversal_handled', coalesce(
          lower(NEW.metadata->>'commercial_reversal_handled') = 'true', false
        ),
        'atomic_rpc', CASE WHEN v_accion = 'ANULADO_COMERCIAL'
          THEN 'finalizar_anulacion_cpe_tx' ELSE 'emitir_factura_cliente_tx' END,
        'sync_trigger', 'sync_documento_manual_desde_cpe_461'
      ),
      updated_at = now()
  WHERE d.id = NEW.documento_id AND d.tenant_id = NEW.tenant_id
    AND d.metadata->>'source' = 'documentos.manual.atomic'
    AND (
      upper(d.estado::text) IS DISTINCT FROM v_estado_documento
      OR upper(coalesce(d.estado_sunat::text, '')) IS DISTINCT FROM v_estado_fiscal
      OR d.xml_content IS DISTINCT FROM NEW.xml_firmado
      OR d.codigo_hash IS DISTINCT FROM coalesce(NEW.hash_firma, NEW.hash)
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 1 THEN
    INSERT INTO public.documento_auditoria (
      tenant_id, documento_id, accion, usuario_id, detalles_cambio, "timestamp", metadata
    ) VALUES (
      NEW.tenant_id, NEW.documento_id, v_accion, NEW.created_by,
      CASE v_accion
        WHEN 'XML_FIRMADO' THEN 'CPE firmado y documento emitido atómicamente'
        WHEN 'ENVIADO_SUNAT' THEN 'CPE enviado al proveedor fiscal'
        WHEN 'ACEPTADO_FISCAL' THEN 'CPE aceptado por la autoridad fiscal'
        WHEN 'ERROR_ENVIO_REINTENTABLE' THEN 'Fallo técnico de envío; el CPE firmado conserva reintento'
        WHEN 'ANULADO_COMERCIAL' THEN 'Reversa comercial finalizada por el flujo CPE/448'
        ELSE 'CPE rechazado por la autoridad fiscal'
      END,
      now(),
      jsonb_build_object('cpe_id', NEW.id, 'idempotency_key', NEW.idempotency_key,
        'atomic_rpc', CASE WHEN v_accion = 'ANULADO_COMERCIAL'
          THEN 'finalizar_anulacion_cpe_tx' ELSE 'emitir_factura_cliente_tx' END,
        'sunat_status', NEW.sunat_status)
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_documento_manual_desde_cpe_461 ON public.cpe;
CREATE TRIGGER trg_sync_documento_manual_desde_cpe_461
AFTER INSERT OR UPDATE OF documento_id, xml_firmado, estado, sunat_status ON public.cpe
FOR EACH ROW EXECUTE FUNCTION app.sync_documento_manual_desde_cpe_461();

CREATE OR REPLACE FUNCTION app.crear_comunicacion_baja_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_comprobantes_ids uuid[],
  p_motivo text,
  p_fecha_comunicacion date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_fecha date := coalesce(p_fecha_comunicacion, app.hoy_tenant(p_tenant_id));
  v_hoy date := app.hoy_tenant(p_tenant_id);
  v_ids uuid[];
  v_count integer;
  v_fingerprint text;
  v_row public.comunicaciones_baja;
  v_numero text;
BEGIN
  IF p_tenant_id IS NULL OR p_comprobantes_ids IS NULL
     OR cardinality(p_comprobantes_ids) NOT BETWEEN 1 AND 500
     OR length(v_key) NOT BETWEEN 8 AND 255 OR length(v_motivo) NOT BETWEEN 3 AND 500
     OR v_fecha > v_hoy THEN
    RAISE EXCEPTION 'RA_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(x ORDER BY x) INTO v_ids FROM (SELECT DISTINCT unnest(p_comprobantes_ids) x) s;
  IF cardinality(v_ids) <> cardinality(p_comprobantes_ids) THEN
    RAISE EXCEPTION 'RA_DUPLICATE_CPE_IDS' USING ERRCODE = '23514';
  END IF;
  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  IF coalesce((SELECT upper(coalesce(nullif(ec.pais,''),'PE')) FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id ORDER BY ec.updated_at DESC NULLS LAST LIMIT 1), 'PE') <> 'PE' THEN
    RAISE EXCEPTION 'RA_ONLY_AVAILABLE_FOR_PE' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':ra:' || v_key, 461));
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tipo', 'RA', 'ids', to_jsonb(v_ids), 'motivo', v_motivo, 'fecha', v_fecha
  )::text, 'UTF8'), 'sha256'), 'hex');
  SELECT * INTO v_row FROM public.comunicaciones_baja b
  WHERE b.tenant_id = p_tenant_id AND b.idempotency_key = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_row.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'RA_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('lote', to_jsonb(v_row), 'idempotent', true);
  END IF;
  -- Todas las claves que compiten por el mismo CPE serializan sobre las mismas
  -- filas, no sobre la key del request. Así dos keys distintas no reservan dos
  -- lotes activos para el mismo comprobante.
  PERFORM c.id FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids)
  ORDER BY c.id
  FOR UPDATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'RA_CPE_SET_NOT_FOUND_OR_CROSS_TENANT' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_count FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids)
    AND upper(c.tipo_documento) = '01'
    AND upper(c.estado::text) = 'ANULADO'
    AND upper(coalesce(c.estado_sunat::text, '')) = 'ANULADO'
    AND lower(coalesce(c.metadata->>'commercial_reversal_handled', 'false')) = 'true'
    AND nullif(c.metadata->>'cancellation_finalization_key', '') IS NOT NULL;
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'RA_CPE_SET_NOT_ELIGIBLE_OR_CROSS_TENANT' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.detalle_comunicacion_baja d
    JOIN public.comunicaciones_baja b ON b.id = d.comunicacion_id AND b.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant_id AND d.cpe_id = ANY(v_ids)
      AND lower(b.estado::text) NOT IN ('rechazado','anulado','error')
  ) THEN
    RAISE EXCEPTION 'RA_CPE_ALREADY_IN_ACTIVE_BATCH' USING ERRCODE = '23505';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':ra-number:' || v_hoy::text, 461));
  v_numero := public.generar_numero_comunicacion_baja(p_tenant_id, v_hoy);
  INSERT INTO public.comunicaciones_baja (
    tenant_id, numero_comunicacion, fecha_generacion, fecha_comunicacion,
    comprobantes_ids, cantidad_comprobantes, motivo_baja, estado, generado_por,
    idempotency_key, request_fingerprint, metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_numero, v_hoy, v_fecha, v_ids, cardinality(v_ids), v_motivo,
    'PENDIENTE', p_actor_id, v_key, v_fingerprint,
    jsonb_build_object('actor_id', p_actor_id, 'atomic_rpc', 'crear_comunicacion_baja_tx',
      'fingerprint_version', 1), now(), now()
  ) RETURNING * INTO v_row;
  INSERT INTO public.detalle_comunicacion_baja (
    tenant_id, comunicacion_id, cpe_id, tipo_documento, serie, numero,
    motivo_baja, orden, estado, metadata, created_at, updated_at
  )
  SELECT p_tenant_id, v_row.id, c.id, c.tipo_documento, c.serie, c.numero,
    v_motivo, row_number() OVER (ORDER BY c.serie, lpad(c.numero, 8, '0'), c.id),
    'PENDIENTE', jsonb_build_object('batch_fingerprint', v_fingerprint), now(), now()
  FROM public.cpe c WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids);
  RETURN jsonb_build_object('lote', to_jsonb(v_row), 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.crear_resumen_diario_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_comprobantes_ids uuid[],
  p_fecha_referencia date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_hoy date := app.hoy_tenant(p_tenant_id);
  v_ids uuid[];
  v_count integer;
  v_fingerprint text;
  v_row public.resumenes_diarios;
  v_numero text;
BEGIN
  IF p_tenant_id IS NULL OR p_comprobantes_ids IS NULL
     OR cardinality(p_comprobantes_ids) NOT BETWEEN 1 AND 500
     OR length(v_key) NOT BETWEEN 8 AND 255
     OR p_fecha_referencia IS NULL OR p_fecha_referencia > v_hoy THEN
    RAISE EXCEPTION 'RC_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(x ORDER BY x) INTO v_ids FROM (SELECT DISTINCT unnest(p_comprobantes_ids) x) s;
  IF cardinality(v_ids) <> cardinality(p_comprobantes_ids) THEN
    RAISE EXCEPTION 'RC_DUPLICATE_CPE_IDS' USING ERRCODE = '23514';
  END IF;
  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  IF coalesce((SELECT upper(coalesce(nullif(ec.pais,''),'PE')) FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id ORDER BY ec.updated_at DESC NULLS LAST LIMIT 1), 'PE') <> 'PE' THEN
    RAISE EXCEPTION 'RC_ONLY_AVAILABLE_FOR_PE' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':rc:' || v_key, 461));
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tipo', 'RC', 'ids', to_jsonb(v_ids), 'fecha_referencia', p_fecha_referencia
  )::text, 'UTF8'), 'sha256'), 'hex');
  SELECT * INTO v_row FROM public.resumenes_diarios b
  WHERE b.tenant_id = p_tenant_id AND b.idempotency_key = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_row.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'RC_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('lote', to_jsonb(v_row), 'idempotent', true);
  END IF;
  PERFORM c.id FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids)
  ORDER BY c.id
  FOR UPDATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'RC_CPE_SET_NOT_FOUND_OR_CROSS_TENANT' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_count FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids)
    AND upper(c.tipo_documento) = '03'
    AND c.fecha_emision::date = p_fecha_referencia
    AND upper(c.estado::text) = 'ANULADO'
    AND upper(coalesce(c.estado_sunat::text, '')) = 'ANULADO'
    AND lower(coalesce(c.metadata->>'commercial_reversal_handled', 'false')) = 'true'
    AND nullif(c.metadata->>'cancellation_finalization_key', '') IS NOT NULL;
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'RC_CPE_SET_NOT_ELIGIBLE_DATE_OR_CROSS_TENANT' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.detalle_resumen_diario d
    JOIN public.resumenes_diarios b ON b.id = d.resumen_id AND b.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant_id AND d.cpe_id = ANY(v_ids)
      AND lower(b.estado::text) NOT IN ('rechazado','anulado','error')
  ) THEN
    RAISE EXCEPTION 'RC_CPE_ALREADY_IN_ACTIVE_BATCH' USING ERRCODE = '23505';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':rc-number:' || v_hoy::text, 461));
  v_numero := public.generar_numero_resumen_diario(p_tenant_id, v_hoy);
  INSERT INTO public.resumenes_diarios (
    tenant_id, numero_resumen, fecha_generacion, fecha_referencia,
    comprobantes_ids, cantidad_comprobantes, total_gravadas, total_exoneradas,
    total_inafectas, total_igv, total_general, estado, generado_por,
    idempotency_key, request_fingerprint, metadata, created_at, updated_at
  )
  SELECT p_tenant_id, v_numero, v_hoy, p_fecha_referencia, v_ids, cardinality(v_ids),
    round(sum(coalesce(c.total_gravadas, 0)), 2),
    round(sum(coalesce(c.total_exoneradas, 0)), 2),
    round(sum(coalesce(c.total_inafectas, 0)), 2),
    round(sum(coalesce(c.total_igv, 0)), 2),
    round(sum(coalesce(c.total_venta, c.total, 0)), 2),
    'PENDIENTE', p_actor_id, v_key, v_fingerprint,
    jsonb_build_object('actor_id', p_actor_id, 'atomic_rpc', 'crear_resumen_diario_tx',
      'fingerprint_version', 1), now(), now()
  FROM public.cpe c WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids)
  RETURNING * INTO v_row;
  INSERT INTO public.detalle_resumen_diario (
    tenant_id, resumen_id, cpe_id, tipo_documento, serie, numero,
    tipo_operacion, total_gravadas, total_exoneradas, total_inafectas,
    total_igv, total, orden, estado, metadata, created_at, updated_at
  )
  SELECT p_tenant_id, v_row.id, c.id, c.tipo_documento, c.serie, c.numero, '3',
    coalesce(c.total_gravadas, 0), coalesce(c.total_exoneradas, 0),
    coalesce(c.total_inafectas, 0), coalesce(c.total_igv, 0),
    coalesce(c.total_venta, c.total, 0),
    row_number() OVER (ORDER BY c.serie, lpad(c.numero, 8, '0'), c.id),
    'PENDIENTE', jsonb_build_object('batch_fingerprint', v_fingerprint), now(), now()
  FROM public.cpe c WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids);
  RETURN jsonb_build_object('lote', to_jsonb(v_row), 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.marcar_resumen_fiscal_generado_tx(
  p_tipo text,
  p_lote_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_xml_generado text,
  p_xml_firmado text,
  p_hash_xml text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_fingerprint text;
  v_row jsonb;
  v_estado text;
  v_existing_hash text;
BEGIN
  IF v_tipo NOT IN ('RA','RC') OR p_lote_id IS NULL OR p_tenant_id IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 255
     OR btrim(coalesce(p_xml_generado, '')) = ''
     OR btrim(coalesce(p_xml_firmado, '')) = ''
     OR lower(btrim(coalesce(p_hash_xml, ''))) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'FISCAL_BATCH_GENERATION_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':batch-generate:' || v_tipo || ':' || p_lote_id::text, 461));
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tipo', v_tipo, 'lote_id', p_lote_id, 'hash_xml', lower(p_hash_xml)
  )::text, 'UTF8'), 'sha256'), 'hex');
  IF v_tipo = 'RA' THEN
    SELECT lower(b.estado::text), b.hash_xml INTO v_estado, v_existing_hash
    FROM public.comunicaciones_baja b WHERE b.id = p_lote_id AND b.tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RA_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF v_estado = 'generado' THEN
      IF lower(coalesce(v_existing_hash, '')) <> lower(p_hash_xml)
         OR (SELECT metadata->>'generation_key' FROM public.comunicaciones_baja WHERE id = p_lote_id) IS DISTINCT FROM v_key THEN
        RAISE EXCEPTION 'RA_GENERATION_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
      END IF;
    ELSIF v_estado <> 'pendiente' THEN
      RAISE EXCEPTION 'RA_GENERATION_STATE_INVALID: %', v_estado USING ERRCODE = '23514';
    ELSE
      UPDATE public.comunicaciones_baja b SET xml_generado = p_xml_generado,
        xml_firmado = p_xml_firmado, hash_xml = lower(p_hash_xml), estado = 'GENERADO',
        codigo_hash = lower(p_hash_xml), metadata = coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object(
          'generation_key', v_key, 'generation_fingerprint', v_fingerprint,
          'generated_by', p_actor_id, 'atomic_rpc', 'marcar_resumen_fiscal_generado_tx'
        ), updated_at = now() WHERE b.id = p_lote_id;
    END IF;
    SELECT to_jsonb(b) INTO v_row FROM public.comunicaciones_baja b WHERE b.id = p_lote_id;
  ELSE
    SELECT lower(b.estado::text), b.hash_xml INTO v_estado, v_existing_hash
    FROM public.resumenes_diarios b WHERE b.id = p_lote_id AND b.tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RC_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF v_estado = 'generado' THEN
      IF lower(coalesce(v_existing_hash, '')) <> lower(p_hash_xml)
         OR (SELECT metadata->>'generation_key' FROM public.resumenes_diarios WHERE id = p_lote_id) IS DISTINCT FROM v_key THEN
        RAISE EXCEPTION 'RC_GENERATION_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
      END IF;
    ELSIF v_estado <> 'pendiente' THEN
      RAISE EXCEPTION 'RC_GENERATION_STATE_INVALID: %', v_estado USING ERRCODE = '23514';
    ELSE
      UPDATE public.resumenes_diarios b SET xml_generado = p_xml_generado,
        xml_firmado = p_xml_firmado, hash_xml = lower(p_hash_xml), estado = 'GENERADO',
        codigo_hash = lower(p_hash_xml), metadata = coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object(
          'generation_key', v_key, 'generation_fingerprint', v_fingerprint,
          'generated_by', p_actor_id, 'atomic_rpc', 'marcar_resumen_fiscal_generado_tx'
        ), updated_at = now() WHERE b.id = p_lote_id;
    END IF;
    SELECT to_jsonb(b) INTO v_row FROM public.resumenes_diarios b WHERE b.id = p_lote_id;
  END IF;
  RETURN jsonb_build_object('lote', v_row, 'idempotent', v_estado = 'generado');
END;
$function$;

CREATE OR REPLACE FUNCTION app.preparar_envio_resumen_fiscal_tx(
  p_tipo text,
  p_lote_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_estado text;
  v_ticket text;
  v_existing_key text;
  v_retry timestamptz;
  v_token uuid;
  v_row jsonb;
BEGIN
  IF v_tipo NOT IN ('RA','RC') OR p_lote_id IS NULL OR p_tenant_id IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION 'FISCAL_BATCH_SEND_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':batch-send:' || v_tipo || ':' || p_lote_id::text, 461));
  IF v_tipo = 'RA' THEN
    SELECT lower(b.estado::text), b.ticket_sunat, b.envio_idempotency_key, b.next_retry_at
      INTO v_estado, v_ticket, v_existing_key, v_retry
    FROM public.comunicaciones_baja b WHERE b.id = p_lote_id AND b.tenant_id = p_tenant_id FOR UPDATE;
  ELSE
    SELECT lower(b.estado::text), b.ticket_sunat, b.envio_idempotency_key, b.next_retry_at
      INTO v_estado, v_ticket, v_existing_key, v_retry
    FROM public.resumenes_diarios b WHERE b.id = p_lote_id AND b.tenant_id = p_tenant_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_BATCH_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_estado = 'aceptado' OR (v_estado = 'enviado' AND v_ticket IS NOT NULL) THEN
    IF v_existing_key IS NOT NULL AND v_existing_key IS DISTINCT FROM v_key THEN
      RAISE EXCEPTION 'FISCAL_BATCH_SEND_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF v_tipo = 'RA' THEN SELECT to_jsonb(b) INTO v_row FROM public.comunicaciones_baja b WHERE b.id = p_lote_id;
    ELSE SELECT to_jsonb(b) INTO v_row FROM public.resumenes_diarios b WHERE b.id = p_lote_id; END IF;
    RETURN jsonb_build_object('lote', v_row, 'should_send', false, 'idempotent', true);
  END IF;
  IF v_estado = 'enviado' AND v_ticket IS NULL AND coalesce(v_retry, now() + interval '1 minute') > now() THEN
    RAISE EXCEPTION 'FISCAL_BATCH_SEND_IN_PROGRESS' USING ERRCODE = '55P03';
  END IF;
  IF v_estado NOT IN ('generado','enviado') THEN
    RAISE EXCEPTION 'FISCAL_BATCH_SEND_STATE_INVALID: %', v_estado USING ERRCODE = '23514';
  END IF;
  v_token := gen_random_uuid();
  IF v_tipo = 'RA' THEN
    UPDATE public.comunicaciones_baja b SET estado = 'ENVIADO', envio_token = v_token,
      envio_idempotency_key = v_key, intentos_envio = coalesce(b.intentos_envio, 0) + 1,
      ultimo_intento_at = now(), next_retry_at = now() + interval '5 minutes',
      enviado_por = p_actor_id, fecha_envio = coalesce(b.fecha_envio, now()),
      ultimo_error = NULL, updated_at = now() WHERE b.id = p_lote_id;
    SELECT to_jsonb(b) INTO v_row FROM public.comunicaciones_baja b WHERE b.id = p_lote_id;
  ELSE
    UPDATE public.resumenes_diarios b SET estado = 'ENVIADO', envio_token = v_token,
      envio_idempotency_key = v_key, intentos_envio = coalesce(b.intentos_envio, 0) + 1,
      ultimo_intento_at = now(), next_retry_at = now() + interval '5 minutes',
      enviado_por = p_actor_id, fecha_envio = coalesce(b.fecha_envio, now()),
      ultimo_error = NULL, updated_at = now() WHERE b.id = p_lote_id;
    SELECT to_jsonb(b) INTO v_row FROM public.resumenes_diarios b WHERE b.id = p_lote_id;
  END IF;
  RETURN jsonb_build_object('lote', v_row, 'send_token', v_token, 'should_send', true, 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.finalizar_envio_resumen_fiscal_tx(
  p_tipo text,
  p_lote_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_envio_token uuid,
  p_resultado text,
  p_ticket text,
  p_codigo text,
  p_descripcion text,
  p_cdr text,
  p_next_retry_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_resultado text := upper(btrim(coalesce(p_resultado, '')));
  v_ids uuid[];
  v_stored_token uuid;
  v_estado_actual text;
  v_ticket_actual text;
  v_ticket_efectivo text;
  v_terminal_result text;
  v_terminal_fingerprint text;
  v_result_fingerprint text;
  v_count integer;
  v_row jsonb;
BEGIN
  IF v_tipo NOT IN ('RA','RC') OR v_resultado NOT IN ('TICKET','ACEPTADO','PENDIENTE','RETRY','RECHAZADO')
     OR p_lote_id IS NULL OR p_tenant_id IS NULL OR p_envio_token IS NULL THEN
    RAISE EXCEPTION 'FISCAL_BATCH_RESULT_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  IF v_tipo = 'RA' THEN
    SELECT b.envio_token, b.comprobantes_ids, lower(b.estado::text),
           nullif(btrim(b.ticket_sunat), ''), b.terminal_result,
           b.terminal_fingerprint
      INTO v_stored_token, v_ids, v_estado_actual, v_ticket_actual,
           v_terminal_result, v_terminal_fingerprint
    FROM public.comunicaciones_baja b WHERE b.id = p_lote_id AND b.tenant_id = p_tenant_id FOR UPDATE;
  ELSE
    SELECT b.envio_token, b.comprobantes_ids, lower(b.estado::text),
           nullif(btrim(b.ticket_sunat), ''), b.terminal_result,
           b.terminal_fingerprint
      INTO v_stored_token, v_ids, v_estado_actual, v_ticket_actual,
           v_terminal_result, v_terminal_fingerprint
    FROM public.resumenes_diarios b WHERE b.id = p_lote_id AND b.tenant_id = p_tenant_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_BATCH_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_stored_token IS DISTINCT FROM p_envio_token THEN
    RAISE EXCEPTION 'FISCAL_BATCH_STALE_SEND_TOKEN' USING ERRCODE = '40001';
  END IF;

  v_ticket_efectivo := coalesce(nullif(btrim(p_ticket), ''), v_ticket_actual);
  IF v_resultado = 'TICKET' AND v_ticket_efectivo IS NULL THEN
    RAISE EXCEPTION 'FISCAL_BATCH_TICKET_EVIDENCE_REQUIRED' USING ERRCODE = '23514';
  ELSIF v_resultado = 'ACEPTADO' AND (
    v_ticket_efectivo IS NULL
    OR nullif(btrim(p_codigo), '') IS NULL
    OR nullif(btrim(p_cdr), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'FISCAL_BATCH_ACCEPTED_EVIDENCE_REQUIRED' USING ERRCODE = '23514';
  ELSIF v_resultado = 'RECHAZADO' AND (
    nullif(btrim(p_codigo), '') IS NULL
    OR nullif(btrim(p_descripcion), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'FISCAL_BATCH_REJECTED_EVIDENCE_REQUIRED' USING ERRCODE = '23514';
  ELSIF v_resultado IN ('PENDIENTE','RETRY')
    AND coalesce(nullif(btrim(p_codigo), ''), nullif(btrim(p_descripcion), '')) IS NULL THEN
    RAISE EXCEPTION 'FISCAL_BATCH_NON_TERMINAL_DIAGNOSTIC_REQUIRED' USING ERRCODE = '23514';
  END IF;

  -- La huella del callback terminal congela la evidencia, no solo la etiqueta.
  -- El mismo token puede transicionar TICKET -> ACEPTADO/RECHAZADO, pero una vez
  -- terminal sólo el replay byte-equivalente es válido.
  IF v_resultado IN ('ACEPTADO','RECHAZADO') THEN
    v_result_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
      'tipo', v_tipo,
      'lote_id', p_lote_id,
      'envio_token', p_envio_token,
      'resultado', v_resultado,
      'ticket', v_ticket_efectivo,
      'codigo', nullif(btrim(p_codigo), ''),
      'descripcion', nullif(btrim(p_descripcion), ''),
      'cdr', nullif(btrim(p_cdr), '')
    )::text, 'UTF8'), 'sha256'), 'hex');
  END IF;

  IF nullif(btrim(coalesce(v_terminal_result, '')), '') IS NOT NULL THEN
    IF upper(v_terminal_result) IS DISTINCT FROM v_resultado
       OR v_resultado NOT IN ('ACEPTADO','RECHAZADO')
       OR v_terminal_fingerprint IS DISTINCT FROM v_result_fingerprint THEN
      RAISE EXCEPTION 'FISCAL_BATCH_TERMINAL_RESULT_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF v_tipo = 'RA' THEN
      SELECT to_jsonb(b) INTO v_row FROM public.comunicaciones_baja b
      WHERE b.id = p_lote_id AND b.tenant_id = p_tenant_id;
    ELSE
      SELECT to_jsonb(b) INTO v_row FROM public.resumenes_diarios b
      WHERE b.id = p_lote_id AND b.tenant_id = p_tenant_id;
    END IF;
    RETURN jsonb_build_object(
      'lote', v_row, 'resultado', v_resultado, 'idempotent', true
    );
  END IF;

  IF v_estado_actual NOT IN ('enviado','generado') THEN
    RAISE EXCEPTION 'FISCAL_BATCH_RESULT_STATE_INVALID: %', v_estado_actual USING ERRCODE = '23514';
  END IF;

  IF v_resultado = 'ACEPTADO' THEN
    -- El lote fiscal sólo confirma la baja administrativa. La reversa comercial
    -- (CxC/asiento/stock/pedido) debe haber sido cerrada antes por 448.
    PERFORM c.id FROM public.cpe c
    WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids)
    ORDER BY c.id
    FOR UPDATE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'FISCAL_BATCH_CPE_SET_NOT_FOUND_OR_CROSS_TENANT' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) INTO v_count FROM public.cpe c
    WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids)
      AND upper(c.estado::text) = 'ANULADO'
      AND upper(coalesce(c.estado_sunat::text, '')) = 'ANULADO'
      AND lower(coalesce(c.metadata->>'commercial_reversal_handled', 'false')) = 'true'
      AND nullif(c.metadata->>'cancellation_finalization_key', '') IS NOT NULL;
    IF v_count <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'FISCAL_BATCH_COMMERCIAL_REVERSAL_NOT_CONFIRMED' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_tipo = 'RA' THEN
    UPDATE public.comunicaciones_baja b SET
      estado = CASE v_resultado WHEN 'ACEPTADO' THEN 'ACEPTADO' WHEN 'RECHAZADO' THEN 'RECHAZADO'
        WHEN 'RETRY' THEN 'GENERADO' ELSE 'ENVIADO' END,
      ticket_sunat = v_ticket_efectivo,
      codigo_respuesta = nullif(btrim(p_codigo), ''),
      descripcion_respuesta = nullif(btrim(p_descripcion), ''),
      cdr_sunat = CASE WHEN v_resultado = 'ACEPTADO' THEN p_cdr ELSE b.cdr_sunat END,
      fecha_respuesta = CASE WHEN v_resultado IN ('ACEPTADO','RECHAZADO') THEN now() ELSE b.fecha_respuesta END,
      respondido_en = CASE WHEN v_resultado IN ('ACEPTADO','RECHAZADO') THEN now() ELSE b.respondido_en END,
      ultimo_error = CASE WHEN v_resultado IN ('RETRY','RECHAZADO') THEN p_descripcion ELSE NULL END,
      next_retry_at = CASE WHEN v_resultado = 'RETRY' THEN coalesce(p_next_retry_at, now() + interval '5 minutes') ELSE NULL END,
      terminal_result = CASE WHEN v_resultado IN ('ACEPTADO','RECHAZADO') THEN v_resultado ELSE NULL END,
      terminal_fingerprint = CASE WHEN v_resultado IN ('ACEPTADO','RECHAZADO') THEN v_result_fingerprint ELSE NULL END,
      metadata = coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object(
        'last_transport_result', v_resultado, 'last_transport_actor_id', p_actor_id,
        'terminal_fingerprint', v_result_fingerprint,
        'atomic_rpc', 'finalizar_envio_resumen_fiscal_tx'
      ), updated_at = now()
    WHERE b.id = p_lote_id;
    IF v_resultado = 'ACEPTADO' THEN
      UPDATE public.detalle_comunicacion_baja d SET estado = 'ANULADO', updated_at = now()
      WHERE d.tenant_id = p_tenant_id AND d.comunicacion_id = p_lote_id;
    ELSIF v_resultado = 'RECHAZADO' THEN
      UPDATE public.detalle_comunicacion_baja d SET estado = 'RECHAZADO', updated_at = now()
      WHERE d.tenant_id = p_tenant_id AND d.comunicacion_id = p_lote_id;
    END IF;
    SELECT to_jsonb(b) INTO v_row FROM public.comunicaciones_baja b WHERE b.id = p_lote_id;
  ELSE
    UPDATE public.resumenes_diarios b SET
      estado = CASE v_resultado WHEN 'ACEPTADO' THEN 'ACEPTADO' WHEN 'RECHAZADO' THEN 'RECHAZADO'
        WHEN 'RETRY' THEN 'GENERADO' ELSE 'ENVIADO' END,
      ticket_sunat = v_ticket_efectivo,
      codigo_respuesta = nullif(btrim(p_codigo), ''),
      descripcion_respuesta = nullif(btrim(p_descripcion), ''),
      cdr_sunat = CASE WHEN v_resultado = 'ACEPTADO' THEN p_cdr ELSE b.cdr_sunat END,
      fecha_respuesta = CASE WHEN v_resultado IN ('ACEPTADO','RECHAZADO') THEN now() ELSE b.fecha_respuesta END,
      respondido_en = CASE WHEN v_resultado IN ('ACEPTADO','RECHAZADO') THEN now() ELSE b.respondido_en END,
      ultimo_error = CASE WHEN v_resultado IN ('RETRY','RECHAZADO') THEN p_descripcion ELSE NULL END,
      next_retry_at = CASE WHEN v_resultado = 'RETRY' THEN coalesce(p_next_retry_at, now() + interval '5 minutes') ELSE NULL END,
      terminal_result = CASE WHEN v_resultado IN ('ACEPTADO','RECHAZADO') THEN v_resultado ELSE NULL END,
      terminal_fingerprint = CASE WHEN v_resultado IN ('ACEPTADO','RECHAZADO') THEN v_result_fingerprint ELSE NULL END,
      metadata = coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object(
        'last_transport_result', v_resultado, 'last_transport_actor_id', p_actor_id,
        'terminal_fingerprint', v_result_fingerprint,
        'atomic_rpc', 'finalizar_envio_resumen_fiscal_tx'
      ), updated_at = now()
    WHERE b.id = p_lote_id;
    IF v_resultado = 'ACEPTADO' THEN
      UPDATE public.detalle_resumen_diario d SET estado = 'ANULADO', updated_at = now()
      WHERE d.tenant_id = p_tenant_id AND d.resumen_id = p_lote_id;
    ELSIF v_resultado = 'RECHAZADO' THEN
      UPDATE public.detalle_resumen_diario d SET estado = 'RECHAZADO', updated_at = now()
      WHERE d.tenant_id = p_tenant_id AND d.resumen_id = p_lote_id;
    END IF;
    SELECT to_jsonb(b) INTO v_row FROM public.resumenes_diarios b WHERE b.id = p_lote_id;
  END IF;

  IF v_resultado = 'ACEPTADO' THEN
    UPDATE public.cpe c SET estado_sunat = 'ANULADO',
      metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'fiscal_cancellation_batch_type', v_tipo,
        'fiscal_cancellation_batch_id', p_lote_id,
        'fiscal_cancellation_accepted_at', now(),
        'commercial_reversal_handled', true,
        'commercial_reversal_owner', c.metadata->>'commercial_reversal_owner',
        'fiscal_terminal_fingerprint', v_result_fingerprint
      ), updated_at = now()
    WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids);
    UPDATE public.documentos d SET estado_sunat = 'ANULADO_' || v_tipo,
      metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
        'fiscal_cancellation_batch_type', v_tipo,
        'fiscal_cancellation_batch_id', p_lote_id,
        'commercial_reversal_handled', true,
        'fiscal_terminal_fingerprint', v_result_fingerprint
      ), updated_at = now()
    FROM public.cpe c
    WHERE c.tenant_id = p_tenant_id AND c.id = ANY(v_ids)
      AND d.tenant_id = p_tenant_id AND d.id = c.documento_id;
  END IF;

  RETURN jsonb_build_object('lote', v_row, 'resultado', v_resultado, 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_documento_manual_tx(uuid,uuid,jsonb,jsonb,text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.crear_documento_manual_tx($1,$2,$3,$4,$5) $$;

CREATE OR REPLACE FUNCTION public.crear_serie_documento_tx(uuid,uuid,text,text,integer,text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.crear_serie_documento_tx($1,$2,$3,$4,$5,$6) $$;

CREATE OR REPLACE FUNCTION public.actualizar_documento_manual_tx(uuid,uuid,uuid,jsonb,jsonb,text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.actualizar_documento_manual_tx($1,$2,$3,$4,$5,$6) $$;

CREATE OR REPLACE FUNCTION public.anular_documento_borrador_tx(uuid,uuid,uuid,text,text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.anular_documento_borrador_tx($1,$2,$3,$4,$5) $$;

CREATE OR REPLACE FUNCTION public.crear_comunicacion_baja_tx(uuid,uuid,uuid[],text,date,text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.crear_comunicacion_baja_tx($1,$2,$3,$4,$5,$6) $$;

CREATE OR REPLACE FUNCTION public.crear_resumen_diario_tx(uuid,uuid,uuid[],date,text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.crear_resumen_diario_tx($1,$2,$3,$4,$5) $$;

CREATE OR REPLACE FUNCTION public.marcar_resumen_fiscal_generado_tx(text,uuid,uuid,uuid,text,text,text,text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.marcar_resumen_fiscal_generado_tx($1,$2,$3,$4,$5,$6,$7,$8) $$;

CREATE OR REPLACE FUNCTION public.preparar_envio_resumen_fiscal_tx(text,uuid,uuid,uuid,text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.preparar_envio_resumen_fiscal_tx($1,$2,$3,$4,$5) $$;

CREATE OR REPLACE FUNCTION public.finalizar_envio_resumen_fiscal_tx(text,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$ SELECT app.finalizar_envio_resumen_fiscal_tx($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) $$;

REVOKE ALL ON FUNCTION app.assert_actor_461(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.calcular_documento_manual_461(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.marcar_reversa_comercial_cpe_461() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.crear_serie_documento_tx(uuid,uuid,text,text,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.crear_documento_manual_tx(uuid,uuid,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.actualizar_documento_manual_tx(uuid,uuid,uuid,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.anular_documento_borrador_tx(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.crear_comunicacion_baja_tx(uuid,uuid,uuid[],text,date,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.crear_resumen_diario_tx(uuid,uuid,uuid[],date,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.marcar_resumen_fiscal_generado_tx(text,uuid,uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.preparar_envio_resumen_fiscal_tx(text,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.finalizar_envio_resumen_fiscal_tx(text,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.crear_documento_manual_tx(uuid,uuid,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_serie_documento_tx(uuid,uuid,text,text,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_documento_manual_tx(uuid,uuid,uuid,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.anular_documento_borrador_tx(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_comunicacion_baja_tx(uuid,uuid,uuid[],text,date,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_resumen_diario_tx(uuid,uuid,uuid[],date,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marcar_resumen_fiscal_generado_tx(text,uuid,uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preparar_envio_resumen_fiscal_tx(text,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalizar_envio_resumen_fiscal_tx(text,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_documento_manual_tx(uuid,uuid,jsonb,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_serie_documento_tx(uuid,uuid,text,text,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_documento_manual_tx(uuid,uuid,uuid,jsonb,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.anular_documento_borrador_tx(uuid,uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_comunicacion_baja_tx(uuid,uuid,uuid[],text,date,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_resumen_diario_tx(uuid,uuid,uuid[],date,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marcar_resumen_fiscal_generado_tx(text,uuid,uuid,uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.preparar_envio_resumen_fiscal_tx(text,uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalizar_envio_resumen_fiscal_tx(text,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz) TO service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.documentos, public.documento_detalles,
  public.documento_auditoria, public.comunicaciones_baja,
  public.detalle_comunicacion_baja, public.resumenes_diarios,
  public.detalle_resumen_diario, public.documento_series FROM anon, authenticated;

COMMENT ON FUNCTION public.crear_documento_manual_tx(uuid,uuid,jsonb,jsonb,text)
IS 'Reserva correlativo y crea borrador, lineas y auditoria con totales recalculados; no firma ni transmite.';
COMMENT ON FUNCTION public.crear_serie_documento_tx(uuid,uuid,text,text,integer,text)
IS 'Crea una serie de documentos con actor, lock, fingerprint, idempotencia y audit_log en un solo commit.';
COMMENT ON FUNCTION public.marcar_resumen_fiscal_generado_tx(text,uuid,uuid,uuid,text,text,text,text)
IS 'Congela XML generado/firmado de RA o RC; la firma usa exclusivamente credenciales del tenant.';
COMMENT ON FUNCTION public.finalizar_envio_resumen_fiscal_tx(text,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz)
IS 'Finaliza ticket/retry/aceptacion RA/RC con evidencia y resultado terminal inmutable; sólo confirma CPE ya revertidos por 448.';

COMMIT;

NOTIFY pgrst, 'reload schema';
