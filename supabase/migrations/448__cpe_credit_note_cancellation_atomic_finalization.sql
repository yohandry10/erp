-- ============================================================================
-- 448__cpe_credit_note_cancellation_atomic_finalization.sql
-- Solicitud de nota de credito y cierre operativo de anulacion CPE atomicos.
-- El envio fiscal permanece fuera de la transaccion: este limite solo finaliza
-- los efectos internos despues de que la nota 07 tenga estado ACEPTADO y CDR.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, pg_temp;

DO $preflight$
BEGIN
  IF to_regclass('public.cpe') IS NULL
     OR to_regclass('public.comprobantes_electronicos') IS NULL
     OR to_regclass('public.documentos') IS NULL
     OR to_regclass('public.cuentas_por_cobrar') IS NULL
     OR to_regclass('public.pedidos_venta') IS NULL
     OR to_regclass('public.pedidos_venta_detalle') IS NULL
     OR to_regclass('public.ventas_pos') IS NULL
     OR to_regclass('public.movimientos_caja') IS NULL
     OR to_regclass('public.sesiones_caja') IS NULL
     OR to_regclass('public.movimientos_inventario') IS NULL
     OR to_regclass('public.producto_existencias') IS NULL
     OR to_regclass('public.productos') IS NULL
     OR to_regclass('public.usuarios') IS NULL
     OR to_regclass('public.asientos_contables') IS NULL
     OR to_regclass('public.detalle_asientos') IS NULL
     OR to_regclass('public.outbox_events') IS NULL THEN
    RAISE EXCEPTION '448 requiere CPE, ventas, caja, CxC, inventario, contabilidad y outbox';
  END IF;
  IF to_regprocedure('public.obtener_siguiente_numero_documento(uuid,text,text)') IS NULL
     OR to_regprocedure('public.aplicar_movimiento_inventario_tx(uuid,uuid,uuid,text,numeric,text,uuid,text,uuid,text,date,text,jsonb,boolean)') IS NULL
     OR to_regprocedure('public.registrar_movimiento_caja(uuid,character varying,numeric,character varying,character varying,text,uuid,uuid,inet,jsonb)') IS NULL THEN
    RAISE EXCEPTION '448 requiere los writers canonicos de numeracion, inventario y caja';
  END IF;
END;
$preflight$;

-- CpeDeliveryService ya persiste estos dos campos al recibir la respuesta del
-- adaptador fiscal. Sin las columnas, PostgREST rechazaba toda la actualizacion
-- y una nota nunca podia demostrar ACEPTADO + CDR ante el cierre interno.
ALTER TABLE public.cpe
  ADD COLUMN IF NOT EXISTS cdr_sunat text,
  ADD COLUMN IF NOT EXISTS numero_comprobante_sunat text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cpe_tenant_id_448
  ON public.cpe (tenant_id, id);

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cpe'::regclass
      AND conname = 'fk_cpe_tenant_nota_credito_448'
  ) THEN
    ALTER TABLE public.cpe
      ADD CONSTRAINT fk_cpe_tenant_nota_credito_448
      FOREIGN KEY (tenant_id, nota_credito_id)
      REFERENCES public.cpe(tenant_id, id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$constraint$;

DO $duplicates$
DECLARE
  v_duplicates integer;
BEGIN
  SELECT count(*) INTO v_duplicates
  FROM (
    SELECT tenant_id, nota_credito_id
    FROM public.cpe
    WHERE tenant_id IS NOT NULL AND nota_credito_id IS NOT NULL
    GROUP BY tenant_id, nota_credito_id
    HAVING count(*) > 1
  ) d;
  IF v_duplicates > 0 THEN
    RAISE EXCEPTION 'CPE_CREDIT_NOTE_LINK_DUPLICATES_PREVENT_448: groups=%', v_duplicates;
  END IF;
END;
$duplicates$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cpe_tenant_credit_note_link_448
  ON public.cpe (tenant_id, nota_credito_id)
  WHERE tenant_id IS NOT NULL AND nota_credito_id IS NOT NULL;

DO $cash_duplicates$
DECLARE
  v_duplicates integer;
BEGIN
  SELECT count(*) INTO v_duplicates
  FROM (
    SELECT tenant_id, referencia_documento
    FROM public.movimientos_caja
    WHERE lower(coalesce(referencia_tipo, '')) = 'reverso_venta_pos'
      AND referencia_documento IS NOT NULL
    GROUP BY tenant_id, referencia_documento
    HAVING count(*) > 1
  ) d;
  IF v_duplicates > 0 THEN
    RAISE EXCEPTION 'POS_CASH_REVERSAL_DUPLICATES_PREVENT_448: groups=%', v_duplicates;
  END IF;
END;
$cash_duplicates$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_caja_cpe_reversal_448
  ON public.movimientos_caja (tenant_id, lower(referencia_tipo), referencia_documento)
  WHERE lower(coalesce(referencia_tipo, '')) = 'reverso_venta_pos'
    AND referencia_documento IS NOT NULL;

CREATE OR REPLACE FUNCTION app.validar_contabilidad_origen_anulacion_cpe_448(
  p_tenant_id uuid,
  p_cpe_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_cpe public.cpe;
  v_asiento_id uuid;
  v_asientos integer;
  v_serie text;
  v_numero text;
  v_numero_corto text;
BEGIN
  SELECT c.* INTO v_cpe
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE_ORIGINAL_NOT_FOUND_IN_TENANT' USING ERRCODE = 'P0002';
  END IF;
  IF v_cpe.event_id IS NULL THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_ORIGINAL_ACCOUNTING_EVENT_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*), (array_agg(a.id ORDER BY a.id))[1]
    INTO v_asientos, v_asiento_id
  FROM public.asientos_contables a
  WHERE a.tenant_id = p_tenant_id
    AND a.source_event_id = v_cpe.event_id;

  IF v_asientos = 0 THEN
    v_serie := upper(btrim(coalesce(v_cpe.serie, '')));
    v_numero := lpad(btrim(coalesce(v_cpe.numero, '')), 8, '0');
    v_numero_corto := coalesce(nullif(ltrim(v_numero, '0'), ''), '0');
    SELECT count(*), (array_agg(a.id ORDER BY a.id))[1]
      INTO v_asientos, v_asiento_id
    FROM public.asientos_contables a
    WHERE a.tenant_id = p_tenant_id
      AND upper(btrim(coalesce(a.referencia, ''))) IN (
        v_serie || '-' || v_numero,
        v_serie || '-' || v_numero_corto
      );
  END IF;

  IF v_asientos <> 1 OR v_asiento_id IS NULL THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_EXPECTED_ONE_ORIGINAL_ENTRY: found=%', v_asientos
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.detalle_asientos d
    WHERE d.tenant_id = p_tenant_id AND d.asiento_id = v_asiento_id
  ) THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_ORIGINAL_ENTRY_WITHOUT_DETAILS'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_asiento_id;
END;
$function$;

CREATE OR REPLACE FUNCTION app.solicitar_anulacion_cpe_tx(
  p_cpe_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_motivo text,
  p_tipo_nota text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_tipo_nota text := lpad(btrim(coalesce(p_tipo_nota, '01')), 2, '0');
  v_original public.cpe;
  v_nota public.cpe;
  v_serie_original text;
  v_serie_nota text;
  v_numero_nota text;
  v_digitos text;
  v_items jsonb;
  v_fingerprint text;
  v_stored_key text;
  v_stored_fingerprint text;
BEGIN
  IF p_cpe_id IS NULL OR p_tenant_id IS NULL OR p_actor_id IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 255
     OR length(v_motivo) NOT BETWEEN 3 AND 500
     OR v_tipo_nota !~ '^[0-9]{2}$' THEN
    RAISE EXCEPTION 'CPE, tenant, actor, motivo, tipo de nota y key validos son obligatorios'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':cpe-cancel-request:' || p_cpe_id::text, 448)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_ACTOR_NOT_IN_TENANT'
      USING ERRCODE = '23514';
  END IF;

  SELECT c.* INTO v_original
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE_ORIGINAL_NOT_FOUND_IN_TENANT' USING ERRCODE = 'P0002';
  END IF;
  IF upper(btrim(coalesce(v_original.tipo_documento, ''))) NOT IN ('01', '03') THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_ONLY_INVOICE_OR_RECEIPT'
      USING ERRCODE = '23514';
  END IF;

  v_serie_original := upper(btrim(coalesce(v_original.serie, '')));
  v_digitos := regexp_replace(v_serie_original, '[^0-9]', '', 'g');
  v_serie_nota := CASE
    WHEN v_serie_original LIKE 'F%' THEN 'FC'
    WHEN v_serie_original LIKE 'B%' THEN 'BC'
    ELSE 'NC'
  END || right(lpad(coalesce(nullif(v_digitos, ''), '0'), 2, '0'), 2);

  v_items := coalesce(v_original.items, '[]'::jsonb);
  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'producto_id', d.producto_id,
      'codigo', d.codigo_producto,
      'descripcion', d.descripcion,
      'unidad', d.unidad_medida,
      'cantidad', d.cantidad,
      'precio_unitario', d.precio_unitario,
      'valor_venta', d.valor_venta,
      'impuesto_igv', d.impuesto_igv,
      'igv', d.impuesto_igv,
      'precio_venta', d.total_item,
      'afectacion_igv', coalesce(d.metadata->>'afectacion_igv', '10')
    ) ORDER BY d.orden), '[]'::jsonb)
      INTO v_items
    FROM public.documento_detalles d
    WHERE d.tenant_id = p_tenant_id
      AND d.documento_id = v_original.documento_id;
  END IF;
  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_ORIGINAL_ITEMS_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'key', v_key,
    'original_id', v_original.id,
    'actor_id', p_actor_id,
    'motivo', v_motivo,
    'tipo_nota', v_tipo_nota,
    'serie_nota', v_serie_nota,
    'tipo_original', upper(v_original.tipo_documento),
    'serie_original', v_serie_original,
    'numero_original', lpad(btrim(v_original.numero), 8, '0'),
    'moneda', upper(coalesce(v_original.moneda, 'PEN')),
    'total', abs(coalesce(v_original.total_venta, v_original.total, 0)),
    'items', v_items
  )::text, 'UTF8'), 'sha256'), 'hex');

  IF v_original.nota_credito_id IS NOT NULL THEN
    SELECT c.* INTO v_nota
    FROM public.cpe c
    WHERE c.id = v_original.nota_credito_id
      AND c.tenant_id = p_tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CPE_CANCELLATION_LINK_POINTS_TO_MISSING_NOTE'
        USING ERRCODE = '23514';
    END IF;
    v_stored_key := coalesce(
      v_original.metadata->>'cancellation_request_key',
      v_nota.metadata->>'cancellation_request_key',
      v_nota.idempotency_key
    );
    v_stored_fingerprint := coalesce(
      v_original.metadata->>'cancellation_request_fingerprint',
      v_nota.metadata->>'cancellation_request_fingerprint'
    );
    IF v_stored_key IS DISTINCT FROM v_key
       OR v_stored_fingerprint IS DISTINCT FROM v_fingerprint
       OR upper(coalesce(v_nota.tipo_documento, '')) <> '07'
       OR v_nota.documento_referencia_tipo IS DISTINCT FROM v_original.tipo_documento
       OR upper(coalesce(v_nota.documento_referencia_serie, '')) <> v_serie_original
       OR lpad(btrim(coalesce(v_nota.documento_referencia_numero, '')), 8, '0')
          <> lpad(btrim(coalesce(v_original.numero, '')), 8, '0') THEN
      RAISE EXCEPTION 'CPE_CANCELLATION_IDEMPOTENCY_KEY_OR_PAYLOAD_CONFLICT'
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Solicitud de anulacion ya registrada.',
      'idempotent', true,
      'request_fingerprint', v_fingerprint,
      'cpe_anulado', jsonb_build_object(
        'id', v_original.id, 'serie', v_original.serie,
        'numero', v_original.numero, 'estado', v_original.estado,
        'anulacion_estado', CASE WHEN upper(v_original.estado::text) = 'ANULADO'
          THEN 'ANULADO' ELSE 'PENDIENTE_CDR' END
      ),
      'nota_credito', jsonb_build_object(
        'id', v_nota.id, 'serie', v_nota.serie,
        'numero', v_nota.numero, 'estado', v_nota.estado
      )
    );
  END IF;

  IF upper(v_original.estado::text) NOT IN ('FIRMADO', 'ENVIADO', 'ACEPTADO') THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_STATE_NOT_ALLOWED: %', v_original.estado
      USING ERRCODE = '23514';
  END IF;

  PERFORM app.validar_contabilidad_origen_anulacion_cpe_448(p_tenant_id, p_cpe_id);

  IF EXISTS (
    SELECT 1 FROM public.cpe c
    WHERE c.tenant_id = p_tenant_id AND c.idempotency_key = v_key
  ) THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_KEY_ALREADY_USED_BY_ANOTHER_CPE'
      USING ERRCODE = '23505';
  END IF;

  v_numero_nota := public.obtener_siguiente_numero_documento(
    p_tenant_id, 'NOTA_CREDITO', v_serie_nota
  );

  INSERT INTO public.cpe (
    tenant_id, tipo_documento, serie, numero, numero_comprobante,
    ruc_emisor, razon_social_emisor, direccion_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    direccion_receptor, cliente_id, moneda,
    total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
    total_igv, total_venta, total, items, fecha_emision, fecha_vencimiento,
    documento_referencia_tipo, documento_referencia_serie,
    documento_referencia_numero, tipo_nota_credito, motivo_nota,
    idempotency_key, estado, estado_sunat, sunat_status,
    created_by, activo, metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id, '07', v_serie_nota, v_numero_nota,
    v_numero_nota::integer,
    v_original.ruc_emisor, v_original.razon_social_emisor,
    v_original.direccion_emisor, v_original.tipo_documento_receptor,
    v_original.documento_receptor, v_original.razon_social_receptor,
    v_original.direccion_receptor, v_original.cliente_id,
    upper(coalesce(v_original.moneda, 'PEN')),
    abs(coalesce(v_original.total_gravadas, 0)),
    abs(coalesce(v_original.total_exoneradas, 0)),
    abs(coalesce(v_original.total_inafectas, 0)),
    abs(coalesce(v_original.total_exportacion, 0)),
    abs(coalesce(v_original.total_igv, 0)),
    abs(coalesce(v_original.total_venta, v_original.total, 0)),
    abs(coalesce(v_original.total_venta, v_original.total, 0)),
    v_items, now(), app.hoy_tenant(p_tenant_id),
    v_original.tipo_documento, v_original.serie, v_original.numero,
    v_tipo_nota, v_motivo, v_key, 'BORRADOR', 'PENDIENTE', 'NOT_SENT',
    p_actor_id, true, jsonb_build_object(
      'source', 'cpe.cancellation.atomic',
      'atomic_rpc', 'solicitar_anulacion_cpe_tx',
      'original_cpe_id', v_original.id,
      'cancellation_request_key', v_key,
      'cancellation_request_fingerprint', v_fingerprint,
      'fingerprint_version', 1
    ), now(), now()
  ) RETURNING * INTO v_nota;

  UPDATE public.cpe c
  SET nota_credito_id = v_nota.id,
      motivo_anulacion = v_motivo,
      metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancellation_request_key', v_key,
        'cancellation_request_fingerprint', v_fingerprint,
        'cancellation_requested_by', p_actor_id,
        'cancellation_requested_at', now(),
        'atomic_rpc', 'solicitar_anulacion_cpe_tx'
      ),
      updated_at = now()
  WHERE c.id = v_original.id AND c.tenant_id = p_tenant_id
  RETURNING c.* INTO v_original;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Nota de credito creada; la anulacion espera CDR aceptado.',
    'idempotent', false,
    'request_fingerprint', v_fingerprint,
    'cpe_anulado', jsonb_build_object(
      'id', v_original.id, 'serie', v_original.serie,
      'numero', v_original.numero, 'estado', v_original.estado,
      'anulacion_estado', 'PENDIENTE_CDR'
    ),
    'nota_credito', jsonb_build_object(
      'id', v_nota.id, 'serie', v_nota.serie,
      'numero', v_nota.numero, 'estado', v_nota.estado
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.finalizar_anulacion_cpe_tx(
  p_nota_credito_id uuid,
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
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_actor_id uuid := p_actor_id;
  v_nota public.cpe;
  v_original public.cpe;
  v_documento public.documentos;
  v_cxc public.cuentas_por_cobrar;
  v_pedido public.pedidos_venta;
  v_pos public.ventas_pos;
  v_cash public.movimientos_caja;
  v_sesion_id uuid;
  v_asiento_id uuid;
  v_documento_id uuid;
  v_cxc_id uuid;
  v_pedido_id uuid;
  v_pos_id uuid;
  v_cash_id uuid;
  v_documentos integer := 0;
  v_cuentas integer := 0;
  v_pedidos integer := 0;
  v_pos_count integer := 0;
  v_cash_count integer := 0;
  v_fingerprint text;
  v_request_fingerprint text;
  v_stored_key text;
  v_stored_fingerprint text;
  v_motivo text;
  v_anulado_at timestamptz := now();
  v_outbox public.outbox_events;
  v_outbox_event_id uuid;
  v_stock record;
  v_movimiento_id uuid;
  v_movimientos jsonb := '[]'::jsonb;
  v_costo_ventas numeric(14,2) := 0;
  v_base numeric(14,2);
  v_total numeric(14,2);
  v_payload jsonb;
BEGIN
  IF p_nota_credito_id IS NULL OR p_tenant_id IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION 'Nota, tenant y key validos son obligatorios'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':cpe-cancel-final:' || p_nota_credito_id::text, 448)
  );

  SELECT c.* INTO v_nota
  FROM public.cpe c
  WHERE c.id = p_nota_credito_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR upper(btrim(coalesce(v_nota.tipo_documento, ''))) <> '07' THEN
    RETURN jsonb_build_object('participa', false);
  END IF;

  SELECT c.* INTO v_original
  FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id AND c.nota_credito_id = v_nota.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('participa', false);
  END IF;

  v_actor_id := coalesce(v_actor_id, v_nota.created_by);
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_actor_id AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_ACTOR_NOT_IN_TENANT'
      USING ERRCODE = '23514';
  END IF;

  v_request_fingerprint := coalesce(
    v_original.metadata->>'cancellation_request_fingerprint',
    v_nota.metadata->>'cancellation_request_fingerprint'
  );
  IF v_request_fingerprint IS NULL
     OR v_nota.documento_referencia_tipo IS DISTINCT FROM v_original.tipo_documento
     OR upper(coalesce(v_nota.documento_referencia_serie, ''))
        <> upper(coalesce(v_original.serie, ''))
     OR lpad(btrim(coalesce(v_nota.documento_referencia_numero, '')), 8, '0')
        <> lpad(btrim(coalesce(v_original.numero, '')), 8, '0') THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_NOTE_LINK_OR_REFERENCE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'key', v_key,
    'original_id', v_original.id,
    'nota_id', v_nota.id,
    'request_fingerprint', v_request_fingerprint,
    'motivo', coalesce(v_original.motivo_anulacion, v_nota.motivo_nota, '')
  )::text, 'UTF8'), 'sha256'), 'hex');

  IF upper(v_original.estado::text) = 'ANULADO' THEN
    v_stored_key := v_original.metadata->>'cancellation_finalization_key';
    v_stored_fingerprint := v_original.metadata->>'cancellation_finalization_fingerprint';
    IF v_stored_key IS DISTINCT FROM v_key
       OR v_stored_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'CPE_CANCELLATION_FINALIZATION_KEY_OR_PAYLOAD_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    SELECT o.* INTO v_outbox
    FROM public.outbox_events o
    WHERE o.tenant_id = p_tenant_id AND o.event_type = 'cpe.anulado'
      AND o.idempotency_key = v_key
    FOR UPDATE;
    IF NOT FOUND OR v_outbox.payload->>'finalization_fingerprint' IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'CPE_CANCELLATION_FINALIZATION_OUTBOX_MISSING_OR_CONFLICTING'
        USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'success', true, 'participa', true, 'estado', 'ANULADO',
      'cpe_id', v_original.id, 'nota_credito_id', v_nota.id,
      'outbox_event_id', v_outbox.event_id, 'idempotent', true
    );
  END IF;

  IF upper(v_nota.estado::text) <> 'ACEPTADO'
     OR nullif(btrim(coalesce(v_nota.cdr_sunat, '')), '') IS NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'participa', true, 'estado', 'PENDIENTE_CDR',
      'nota_credito_id', v_nota.id, 'idempotent', true
    );
  END IF;

  v_asiento_id := app.validar_contabilidad_origen_anulacion_cpe_448(
    p_tenant_id, v_original.id
  );

  IF v_original.documento_id IS NOT NULL THEN
    SELECT d.* INTO v_documento
    FROM public.documentos d
    WHERE d.id = v_original.documento_id AND d.tenant_id = p_tenant_id
    FOR UPDATE;
    IF FOUND THEN
      v_documentos := 1;
      v_documento_id := v_documento.id;
    END IF;
  ELSE
    SELECT count(*), (array_agg(d.id ORDER BY d.created_at DESC, d.id))[1]
      INTO v_documentos, v_documento_id
    FROM public.documentos d
    WHERE d.tenant_id = p_tenant_id
      AND upper(d.serie) = upper(v_original.serie)
      AND lpad(btrim(d.numero), 8, '0') = lpad(btrim(v_original.numero), 8, '0')
      AND d.tipo_documento = CASE upper(v_original.tipo_documento)
        WHEN '01' THEN 'FACTURA' ELSE 'BOLETA' END;
    IF v_documentos = 1 THEN
      SELECT d.* INTO v_documento FROM public.documentos d
      WHERE d.id = v_documento_id AND d.tenant_id = p_tenant_id FOR UPDATE;
    END IF;
  END IF;
  IF v_original.documento_id IS NOT NULL AND v_documentos = 0 THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_OPERATIONAL_DOCUMENT_NOT_IN_TENANT'
      USING ERRCODE = '23514';
  END IF;
  IF v_documentos > 1 THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_AMBIGUOUS_OPERATIONAL_DOCUMENT'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT p.id), (array_agg(DISTINCT p.id))[1]
    INTO v_pedidos, v_pedido_id
  FROM public.pedidos_venta p
  WHERE p.tenant_id = p_tenant_id
    AND (p.factura_id = v_original.id
      OR (v_documento.id IS NOT NULL AND p.id = v_documento.pedido_id));
  IF v_documento.id IS NOT NULL AND v_documento.pedido_id IS NOT NULL
     AND v_pedidos = 0 THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_SALES_ORDER_NOT_IN_TENANT'
      USING ERRCODE = '23514';
  END IF;
  IF v_pedidos > 1 THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_AMBIGUOUS_SALES_ORDER'
      USING ERRCODE = '23514';
  ELSIF v_pedidos = 1 THEN
    SELECT p.* INTO v_pedido FROM public.pedidos_venta p
    WHERE p.id = v_pedido_id AND p.tenant_id = p_tenant_id
    FOR UPDATE;
  END IF;

  SELECT count(*), (array_agg(v.id ORDER BY v.created_at DESC, v.id))[1]
    INTO v_pos_count, v_pos_id
  FROM public.ventas_pos v
  WHERE v.tenant_id = p_tenant_id AND v.cpe_id = v_original.id;
  IF v_pos_count > 1 OR (v_pos_count = 1 AND v_pedidos = 1) THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_AMBIGUOUS_SALES_ORIGIN'
      USING ERRCODE = '23514';
  ELSIF v_pos_count = 1 THEN
    SELECT v.* INTO v_pos FROM public.ventas_pos v
    WHERE v.id = v_pos_id AND v.tenant_id = p_tenant_id
    FOR UPDATE;
  END IF;

  IF v_pos.id IS NOT NULL AND v_pos.cuenta_por_cobrar_id IS NOT NULL THEN
    SELECT c.* INTO v_cxc FROM public.cuentas_por_cobrar c
    WHERE c.id = v_pos.cuenta_por_cobrar_id AND c.tenant_id = p_tenant_id
    FOR UPDATE;
    IF FOUND THEN
      v_cuentas := 1;
      v_cxc_id := v_cxc.id;
    ELSE
      RAISE EXCEPTION 'CPE_CANCELLATION_POS_RECEIVABLE_NOT_IN_TENANT'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_documento.id IS NOT NULL THEN
    SELECT count(*), (array_agg(c.id ORDER BY
      (upper(c.estado::text) NOT IN ('ANULADA', 'REVERTIDA')) DESC,
      c.created_at DESC, c.id))[1]
      INTO v_cuentas, v_cxc_id
    FROM public.cuentas_por_cobrar c
    WHERE c.tenant_id = p_tenant_id AND c.documento_id = v_documento.id;
    IF v_cuentas > 1 THEN
      RAISE EXCEPTION 'CPE_CANCELLATION_AMBIGUOUS_RECEIVABLE'
        USING ERRCODE = '23514';
    ELSIF v_cuentas = 1 THEN
      SELECT c.* INTO v_cxc FROM public.cuentas_por_cobrar c
      WHERE c.id = v_cxc_id AND c.tenant_id = p_tenant_id
      FOR UPDATE;
    END IF;
  END IF;

  -- Una anulacion no puede borrar economicamente una cuenta que ya recibio
  -- cobros. La reversa de CxC debe devolver tambien banco/caja y conservar la
  -- trazabilidad del medio original; hasta que ese flujo exista, se falla
  -- cerrado en lugar de dejar un reembolso fuera del sistema.
  IF v_cxc.id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.cxc_pagos cp
    WHERE cp.tenant_id = p_tenant_id
      AND cp.cuenta_id = v_cxc.id
      AND coalesce(cp.activo, true)
      AND upper(coalesce(cp.estado, 'ACTIVO')) NOT IN ('ANULADO', 'REVERTIDO')
      AND coalesce(cp.monto, 0) > 0
  ) THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_REFUND_REQUIRED_FOR_APPLIED_RECEIVABLE'
      USING ERRCODE = '23514';
  END IF;

  -- En POS el efectivo puede devolverse porque existe una evidencia unica en
  -- movimientos_caja. Tarjetas, transferencias y ventas mixtas requieren su
  -- propia reversa de adquirente/banco; no se anulan silenciosamente.
  IF v_pos.id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.ventas_pos_pagos vp
    WHERE vp.tenant_id = p_tenant_id
      AND vp.venta_pos_id = v_pos.id
      AND coalesce(vp.monto, 0) > 0
      AND upper(btrim(coalesce(vp.metodo_pago_codigo, vp.metodo_pago_tipo, 'EFECTIVO')))
          NOT IN ('EFECTIVO', 'CASH')
  ) THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_REFUND_REQUIRED_FOR_NON_CASH_POS_PAYMENT'
      USING ERRCODE = '23514';
  END IF;

  -- Valida la caja antes de la primera mutacion. Si el turno original cerro, el
  -- egreso se registra en la sesion abierta vigente y conserva ambas referencias.
  IF v_pos.id IS NOT NULL THEN
    SELECT count(*), (array_agg(mc.id ORDER BY mc.created_at DESC, mc.id))[1]
      INTO v_cash_count, v_cash_id
    FROM public.movimientos_caja mc
    WHERE mc.tenant_id = p_tenant_id
      AND lower(coalesce(mc.referencia_tipo, '')) = 'venta_pos'
      AND mc.referencia_documento = v_pos.id::text
      AND upper(coalesce(mc.tipo_movimiento, '')) = 'VENTA'
      AND coalesce(mc.monto, 0) > 0;

    IF v_cash_count > 1 THEN
      RAISE EXCEPTION 'CPE_CANCELLATION_AMBIGUOUS_POS_CASH_MOVEMENT'
        USING ERRCODE = '23514';
    ELSIF v_cash_count = 1 THEN
      SELECT mc.* INTO v_cash
      FROM public.movimientos_caja mc
      WHERE mc.id = v_cash_id AND mc.tenant_id = p_tenant_id
      FOR UPDATE;
    END IF;

    IF v_cash.id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.movimientos_caja mc
        WHERE mc.tenant_id = p_tenant_id
          AND lower(coalesce(mc.referencia_tipo, '')) = 'reverso_venta_pos'
          AND mc.referencia_documento = v_nota.id::text
      ) THEN
        RAISE EXCEPTION 'CPE_CANCELLATION_PARTIAL_CASH_REVERSAL_ALREADY_EXISTS'
          USING ERRCODE = '23514';
      END IF;

      SELECT s.id INTO v_sesion_id
      FROM public.sesiones_caja s
      WHERE s.id = v_cash.sesion_caja_id AND s.tenant_id = p_tenant_id
        AND upper(s.estado::text) = 'ABIERTA'
        AND s.hora_cierre IS NULL AND s.fecha_cierre IS NULL
      FOR UPDATE;
      IF v_sesion_id IS NULL THEN
        SELECT s.id INTO v_sesion_id
        FROM public.sesiones_caja s
        WHERE s.tenant_id = p_tenant_id
          AND upper(s.estado::text) = 'ABIERTA'
          AND s.hora_cierre IS NULL AND s.fecha_cierre IS NULL
        ORDER BY s.hora_apertura DESC NULLS LAST, s.created_at DESC, s.id
        LIMIT 1
        FOR UPDATE;
      END IF;
      IF v_sesion_id IS NULL THEN
        RAISE EXCEPTION 'CPE_CANCELLATION_OPEN_CASH_SESSION_REQUIRED'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id AND mi.referencia_id = v_nota.id
      AND mi.tipo = 'ENTRADA' AND mi.referencia_tipo = 'REVERSO_VENTA_CPE_448'
  ) OR EXISTS (
    SELECT 1 FROM public.outbox_events o
    WHERE o.tenant_id = p_tenant_id AND o.event_type = 'cpe.anulado'
      AND (o.aggregate_id = v_original.id::text OR o.idempotency_key = v_key)
  ) OR (v_documento.id IS NOT NULL AND upper(v_documento.estado::text) = 'ANULADO')
    OR (v_cxc.id IS NOT NULL AND upper(v_cxc.estado::text) IN ('ANULADA', 'REVERTIDA'))
    OR (v_pedido.id IS NOT NULL AND upper(v_pedido.estado::text) = 'CANCELADO')
    OR (v_pos.id IS NOT NULL AND upper(v_pos.estado::text) = 'ANULADA')
  THEN
    RAISE EXCEPTION 'CPE_CANCELLATION_PARTIAL_EFFECTS_ALREADY_EXIST'
      USING ERRCODE = '23514';
  END IF;

  -- Bloquea las salidas fisicas en orden determinista antes de ejecutar el writer.
  PERFORM mi.id
  FROM public.movimientos_inventario mi
  JOIN public.productos p ON p.id = mi.producto_id AND p.tenant_id = mi.tenant_id
  WHERE mi.tenant_id = p_tenant_id AND mi.tipo = 'SALIDA'
    AND NOT coalesce(p.es_servicio, false) AND coalesce(p.controla_stock, true)
    AND (
      (v_pos.id IS NOT NULL AND mi.referencia_id = v_pos.id
        AND upper(coalesce(mi.referencia_tipo, '')) = 'VENTA_POS')
      OR
      (v_pedido.id IS NOT NULL AND mi.referencia_id = v_pedido.id
        AND (upper(coalesce(mi.referencia_tipo, '')) = 'PEDIDO_FACTURA_446'
          OR upper(coalesce(mi.referencia_tipo, '')) LIKE 'PEDIDO_DESP_%'
          OR upper(coalesce(mi.referencia_tipo, '')) IN ('PEDIDO', 'PEDIDO_VENTA', 'DESPACHO'))
    ))
  ORDER BY mi.producto_id, mi.almacen_id, mi.id
  FOR UPDATE OF mi;

  v_motivo := coalesce(nullif(btrim(v_original.motivo_anulacion), ''),
    nullif(btrim(v_nota.motivo_nota), ''), 'Anulacion con nota de credito aceptada');

  IF v_documento.id IS NOT NULL THEN
    UPDATE public.documentos d
    SET estado = 'ANULADO', motivo_anulacion = v_motivo,
        metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
          'cpe_anulado_id', v_original.id, 'nota_credito_id', v_nota.id,
          'cancellation_finalization_key', v_key,
      'atomic_rpc', 'finalizar_anulacion_cpe_tx'
        ),
        updated_at = v_anulado_at
    WHERE d.id = v_documento.id AND d.tenant_id = p_tenant_id;
  END IF;

  IF v_cxc.id IS NOT NULL
     AND upper(v_cxc.estado::text) NOT IN ('ANULADA', 'REVERTIDA') THEN
    UPDATE public.cuentas_por_cobrar c
    SET estado = 'ANULADA', monto_pendiente = 0, saldo = 0,
        saldo_pendiente = 0,
        observaciones = concat_ws(E'\n', nullif(c.observaciones, ''),
          'REVERTIDA por CPE ' || v_original.serie || '-' || v_original.numero ||
          ' con NC ' || v_nota.serie || '-' || v_nota.numero || '. Motivo: ' || v_motivo),
        metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
          'cpe_anulado_id', v_original.id, 'nota_credito_id', v_nota.id,
          'saldo_antes_anulacion', v_cxc.monto_pendiente,
          'atomic_rpc', 'finalizar_anulacion_cpe_tx'
        ),
        updated_at = v_anulado_at
    WHERE c.id = v_cxc.id AND c.tenant_id = p_tenant_id;
  END IF;

  IF v_pedido.id IS NOT NULL THEN
    UPDATE public.pedidos_venta p
    SET estado = 'CANCELADO',
        metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
          'factura_anulada_id', v_original.id, 'nota_credito_id', v_nota.id,
          'motivo_anulacion', v_motivo,
          'cancellation_finalization_key', v_key,
          'atomic_rpc', 'finalizar_anulacion_cpe_tx'
        ),
        updated_at = v_anulado_at
    WHERE p.id = v_pedido.id AND p.tenant_id = p_tenant_id;

    UPDATE public.pedidos_venta_detalle d
    SET cantidad_facturada = 0,
        estado_item = CASE
          WHEN coalesce(d.cantidad_despachada, 0) >= d.cantidad THEN 'DESPACHADO'
          WHEN coalesce(d.cantidad_despachada, 0) > 0 THEN 'PARCIAL'
          ELSE 'PENDIENTE'
        END,
        updated_at = v_anulado_at
    WHERE d.pedido_id = v_pedido.id AND d.tenant_id = p_tenant_id;
  END IF;

  IF v_pos.id IS NOT NULL THEN
    UPDATE public.ventas_pos v
    SET estado = 'ANULADA',
        metadata = coalesce(v.metadata, '{}'::jsonb) || jsonb_build_object(
          'cpe_anulado_id', v_original.id, 'nota_credito_id', v_nota.id,
          'motivo_anulacion', v_motivo,
          'cancellation_finalization_key', v_key,
          'atomic_rpc', 'finalizar_anulacion_cpe_tx'
        ),
        updated_at = v_anulado_at
    WHERE v.id = v_pos.id AND v.tenant_id = p_tenant_id;
  END IF;

  IF v_cash.id IS NOT NULL THEN
    PERFORM public.registrar_movimiento_caja(
      p_sesion_caja_id := v_sesion_id,
      p_tipo_movimiento := 'AJUSTE',
      p_monto := -abs(v_cash.monto),
      p_referencia_documento := v_nota.id::text,
      p_referencia_tipo := 'reverso_venta_pos',
      p_motivo := 'Reverso POS ' || v_original.serie || '-' || v_original.numero || ': ' || v_motivo,
      p_usuario_id := v_actor_id,
      p_metadata := jsonb_build_object(
        'cpe_id', v_original.id, 'nota_credito_id', v_nota.id,
        'venta_pos_id', v_pos.id, 'sesion_caja_venta', v_cash.sesion_caja_id,
        'reverso_en_otra_sesion', v_sesion_id IS DISTINCT FROM v_cash.sesion_caja_id,
        'cancellation_finalization_key', v_key,
        'atomic_rpc', 'finalizar_anulacion_cpe_tx'
      )
    );
  END IF;

  FOR v_stock IN
    SELECT mi.producto_id, mi.almacen_id, round(sum(mi.cantidad), 2) AS cantidad,
           round(sum(coalesce(
             nullif(app.to_numeric_or_zero(mi.metadata->>'valor_total'), 0),
             mi.cantidad * coalesce(
               nullif(app.to_numeric_or_zero(mi.metadata->>'costo_unitario'), 0),
               nullif(p.precio_compra, 0), nullif(p.costo, 0), 0
             )
           )), 2) AS costo_total,
           round(sum(coalesce(
             nullif(app.to_numeric_or_zero(mi.metadata->>'valor_total'), 0),
             mi.cantidad * coalesce(
               nullif(app.to_numeric_or_zero(mi.metadata->>'costo_unitario'), 0),
               nullif(p.precio_compra, 0), nullif(p.costo, 0), 0
             )
           )) / nullif(sum(mi.cantidad), 0), 6) AS costo_unitario
    FROM public.movimientos_inventario mi
    JOIN public.productos p ON p.id = mi.producto_id AND p.tenant_id = mi.tenant_id
    WHERE mi.tenant_id = p_tenant_id AND mi.tipo = 'SALIDA'
      AND NOT coalesce(p.es_servicio, false) AND coalesce(p.controla_stock, true)
      AND (
        (v_pos.id IS NOT NULL AND mi.referencia_id = v_pos.id
          AND upper(coalesce(mi.referencia_tipo, '')) = 'VENTA_POS')
        OR
        (v_pedido.id IS NOT NULL AND mi.referencia_id = v_pedido.id
          AND (upper(coalesce(mi.referencia_tipo, '')) = 'PEDIDO_FACTURA_446'
            OR upper(coalesce(mi.referencia_tipo, '')) LIKE 'PEDIDO_DESP_%'
            OR upper(coalesce(mi.referencia_tipo, '')) IN ('PEDIDO', 'PEDIDO_VENTA', 'DESPACHO'))
      ))
    GROUP BY mi.producto_id, mi.almacen_id
    ORDER BY mi.producto_id, mi.almacen_id
  LOOP
    IF v_stock.almacen_id IS NULL OR v_stock.cantidad <= 0 THEN
      RAISE EXCEPTION 'CPE_CANCELLATION_ORIGINAL_STOCK_MOVEMENT_INVALID'
        USING ERRCODE = '23514';
    END IF;
    v_movimiento_id := public.aplicar_movimiento_inventario_tx(
      p_tenant_id := p_tenant_id,
      p_producto_id := v_stock.producto_id,
      p_almacen_id := v_stock.almacen_id,
      p_tipo := 'ENTRADA',
      p_cantidad := v_stock.cantidad,
      p_referencia_tipo := 'REVERSO_VENTA_CPE_448',
      p_referencia_id := v_nota.id,
      p_notas := 'Entrada por NC ' || v_nota.serie || '-' || v_nota.numero || ': ' || v_motivo,
      p_created_by := v_actor_id::text,
      p_metadata := jsonb_build_object(
        'source', CASE WHEN v_pos.id IS NOT NULL THEN 'POS' ELSE 'PEDIDO' END,
        'cpe_id', v_original.id, 'nota_credito_id', v_nota.id,
        'venta_origen_id', coalesce(v_pos.id, v_pedido.id),
        'costo_unitario', v_stock.costo_unitario,
        'costo_total_origen', v_stock.costo_total,
        'cancellation_finalization_key', v_key,
        'atomic_rpc', 'finalizar_anulacion_cpe_tx'
      )
    );
    v_costo_ventas := round(v_costo_ventas + v_stock.costo_total, 2);
    v_movimientos := v_movimientos || jsonb_build_array(jsonb_build_object(
      'movimiento_id', v_movimiento_id,
      'producto_id', v_stock.producto_id,
      'almacen_id', v_stock.almacen_id,
      'cantidad', v_stock.cantidad,
      'costo_total', v_stock.costo_total
    ));
  END LOOP;

  UPDATE public.cpe c
  SET estado = 'ANULADO', estado_sunat = 'ANULADO', anulado_por = v_actor_id,
      anulado_at = v_anulado_at,
      metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancellation_finalization_key', v_key,
        'cancellation_finalization_fingerprint', v_fingerprint,
        'cancellation_finalized_by', v_actor_id,
        'cancellation_finalized_at', v_anulado_at,
        'atomic_rpc', 'finalizar_anulacion_cpe_tx'
      ),
      updated_at = v_anulado_at
  WHERE c.id = v_original.id AND c.tenant_id = p_tenant_id
  RETURNING c.* INTO v_original;

  UPDATE public.cpe c
  SET metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancellation_finalization_key', v_key,
        'cancellation_finalization_fingerprint', v_fingerprint,
        'original_cpe_anulado_id', v_original.id,
        'cancellation_finalized_at', v_anulado_at,
        'atomic_rpc', 'finalizar_anulacion_cpe_tx'
      ),
      updated_at = v_anulado_at
  WHERE c.id = v_nota.id AND c.tenant_id = p_tenant_id
  RETURNING c.* INTO v_nota;

  v_total := abs(coalesce(v_original.total_venta, v_original.total, 0));
  v_base := round(abs(coalesce(v_original.total_gravadas, 0))
    + abs(coalesce(v_original.total_exoneradas, 0))
    + abs(coalesce(v_original.total_inafectas, 0))
    + abs(coalesce(v_original.total_exportacion, 0)), 2);
  v_outbox_event_id := gen_random_uuid();
  v_payload := jsonb_build_object(
    'eventId', v_outbox_event_id,
    'tenantId', p_tenant_id,
    'tenant_id', p_tenant_id,
    'idempotencyKey', v_key,
    'cpeId', v_original.id,
    'cpe_id', v_original.id,
    'notaCreditoId', v_nota.id,
    'nota_credito_id', v_nota.id,
    'serie', v_original.serie,
    'numero', v_original.numero,
    'total', v_total,
    'base_imponible', v_base,
    'igv', abs(coalesce(v_original.total_igv, 0)),
    'costo_ventas', v_costo_ventas,
    'motivo', v_motivo,
    'anulado_por', v_actor_id,
    'anulado_at', v_anulado_at,
    'cdr_confirmado', true,
    'source_event_id', v_original.event_id,
    'asiento_original_id', v_asiento_id,
    'source', CASE WHEN v_pos.id IS NOT NULL THEN 'POS'
      WHEN v_pedido.id IS NOT NULL THEN 'PEDIDO' ELSE 'CPE' END,
    'venta_pos_id', v_pos.id,
    'pedido_id', v_pedido.id,
    'documento_id', v_documento.id,
    'cxc_id', v_cxc.id,
    'ajustes', jsonb_build_object(
      'retencion', coalesce(v_cxc.retencion_total, 0),
      'percepcion', coalesce(v_cxc.percepcion_total, 0),
      'detraccion', coalesce(v_cxc.detraccion_total, 0),
      'anticipo', coalesce(v_cxc.anticipo_total, 0)
    ),
    'movimientos_stock', v_movimientos,
    'finalization_fingerprint', v_fingerprint,
    'fingerprint_version', 1,
    'atomic_rpc', 'finalizar_anulacion_cpe_tx'
  );

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, 'cpe', v_original.id::text, 'cpe.anulado', v_payload,
    'pending', 0, v_key, v_outbox_event_id, v_anulado_at,
    v_anulado_at, v_anulado_at
  ) RETURNING * INTO v_outbox;

  RETURN jsonb_build_object(
    'success', true, 'participa', true, 'estado', 'ANULADO',
    'cpe_id', v_original.id, 'nota_credito_id', v_nota.id,
    'documento_id', v_documento.id, 'cxc_id', v_cxc.id,
    'pedido_id', v_pedido.id, 'venta_pos_id', v_pos.id,
    'outbox_event_id', v_outbox.event_id,
    'movimientos_stock', v_movimientos,
    'costo_ventas', v_costo_ventas,
    'idempotent', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.solicitar_anulacion_cpe_tx(
  p_cpe_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_motivo text,
  p_tipo_nota text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $wrapper$
  SELECT app.solicitar_anulacion_cpe_tx(
    p_cpe_id, p_tenant_id, p_actor_id, p_motivo, p_tipo_nota,
    p_idempotency_key
  );
$wrapper$;

CREATE OR REPLACE FUNCTION public.finalizar_anulacion_cpe_tx(
  p_nota_credito_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $wrapper$
  SELECT app.finalizar_anulacion_cpe_tx(
    p_nota_credito_id, p_tenant_id, p_actor_id, p_idempotency_key
  );
$wrapper$;

REVOKE ALL ON FUNCTION app.validar_contabilidad_origen_anulacion_cpe_448(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.solicitar_anulacion_cpe_tx(uuid,uuid,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.finalizar_anulacion_cpe_tx(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.solicitar_anulacion_cpe_tx(uuid,uuid,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalizar_anulacion_cpe_tx(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_anulacion_cpe_tx(uuid,uuid,uuid,text,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalizar_anulacion_cpe_tx(uuid,uuid,uuid,text)
  TO service_role;

-- Las reglas tenant de estas tablas no sustituyen la frontera de comando: un
-- usuario autenticado no debe poder saltarse locks, estados ni outbox con DML.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.cpe,
           public.comprobantes_electronicos,
           public.documentos,
           public.cuentas_por_cobrar,
           public.pedidos_venta,
           public.pedidos_venta_detalle,
           public.ventas_pos,
           public.movimientos_caja,
           public.movimientos_inventario,
           public.producto_existencias,
           public.outbox_events
  FROM anon, authenticated;

COMMENT ON FUNCTION public.solicitar_anulacion_cpe_tx(uuid,uuid,uuid,text,text,text)
IS 'Crea y vincula de forma atomica e idempotente una nota 07; no realiza envio fiscal.';

COMMENT ON FUNCTION public.finalizar_anulacion_cpe_tx(uuid,uuid,uuid,text)
IS 'Tras ACEPTADO+CDR, anula documento/CxC/origen, revierte caja/stock y publica cpe.anulado en un solo commit.';

COMMIT;

NOTIFY pgrst, 'reload schema';
