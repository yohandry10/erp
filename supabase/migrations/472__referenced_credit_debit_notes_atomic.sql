BEGIN;

SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

DO $preflight$
BEGIN
  IF to_regclass('public.cpe') IS NULL
     OR to_regclass('public.documentos') IS NULL
     OR to_regclass('public.documento_detalles') IS NULL
     OR to_regclass('public.cuentas_por_cobrar') IS NULL
     OR to_regclass('public.cxc_pagos') IS NULL
     OR to_regclass('public.saldos_favor_clientes') IS NULL
     OR to_regclass('public.saldos_favor_movimientos') IS NULL
     OR to_regclass('public.outbox_events') IS NULL THEN
    RAISE EXCEPTION '472 requiere CPE, documentos, CxC, saldos a favor y outbox';
  END IF;
  IF to_regprocedure('public.obtener_siguiente_numero_documento(uuid,text,text)') IS NULL
     OR to_regprocedure('app.validar_contabilidad_origen_anulacion_cpe_448(uuid,uuid)') IS NULL
     OR to_regprocedure('app.hoy_tenant(uuid)') IS NULL
     OR to_regprocedure('app.apply_tenant_policy(text,text)') IS NULL THEN
    RAISE EXCEPTION '472 requiere numeracion, validacion contable 448 y helpers tenant';
  END IF;
END
$preflight$;

-- Notas de crédito/débito referenciadas. La operación comercial y contable
-- queda confirmada sin depender de certificado u OSE; la firma fiscal es una
-- segunda transición idempotente cuando el cliente configura sus credenciales.

ALTER TABLE public.cpe
  ADD COLUMN IF NOT EXISTS documento_referencia_id uuid;
ALTER TABLE public.cpe
  ADD COLUMN IF NOT EXISTS tipo_nota_debito text;
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS documento_origen_id uuid;

ALTER TABLE public.cpe
  DROP CONSTRAINT IF EXISTS fk_cpe_documento_referencia_472;
ALTER TABLE public.cpe
  ADD CONSTRAINT fk_cpe_documento_referencia_472
  FOREIGN KEY (documento_referencia_id) REFERENCES public.documentos(id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.documentos
  DROP CONSTRAINT IF EXISTS fk_documentos_origen_472;
ALTER TABLE public.documentos
  ADD CONSTRAINT fk_documentos_origen_472
  FOREIGN KEY (documento_origen_id) REFERENCES public.documentos(id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.cpe VALIDATE CONSTRAINT fk_cpe_documento_referencia_472;
ALTER TABLE public.documentos VALIDATE CONSTRAINT fk_documentos_origen_472;

CREATE INDEX IF NOT EXISTS ix_cpe_documento_referencia_472
  ON public.cpe (tenant_id, documento_referencia_id, created_at DESC)
  WHERE documento_referencia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_documentos_origen_472
  ON public.documentos (tenant_id, documento_origen_id, tipo_documento, created_at DESC)
  WHERE documento_origen_id IS NOT NULL;

-- Un saldo a favor también puede nacer de una NC comercial sin devolución
-- física. RMA sigue siendo obligatorio para motivos que reingresan inventario.
ALTER TABLE public.saldos_favor_clientes
  ALTER COLUMN rma_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_saldo_favor_nota_documento_472
  ON public.saldos_favor_clientes (tenant_id, nota_credito_documento_id);

CREATE TABLE IF NOT EXISTS public.notas_referenciadas_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  tipo_operacion text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  documento_origen_id uuid REFERENCES public.documentos(id) ON DELETE RESTRICT,
  nota_documento_id uuid REFERENCES public.documentos(id) ON DELETE RESTRICT,
  nota_cpe_id uuid REFERENCES public.cpe(id) ON DELETE RESTRICT,
  event_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_nota_ref_operacion_tipo_472 CHECK (
    tipo_operacion IN ('CREAR', 'FIRMAR')
  ),
  CONSTRAINT ck_nota_ref_operacion_key_472 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 200
  ),
  CONSTRAINT ck_nota_ref_operacion_fingerprint_472 CHECK (
    fingerprint ~ '^[0-9a-f]{64}$'
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_nota_ref_operacion_key_472
  ON public.notas_referenciadas_operaciones (
    tenant_id, tipo_operacion, lower(idempotency_key)
  );
CREATE INDEX IF NOT EXISTS ix_nota_ref_operacion_origen_472
  ON public.notas_referenciadas_operaciones (
    tenant_id, documento_origen_id, created_at DESC
  );
CREATE INDEX IF NOT EXISTS ix_nota_ref_operacion_cpe_472
  ON public.notas_referenciadas_operaciones (
    tenant_id, nota_cpe_id, created_at DESC
  );
CREATE UNIQUE INDEX IF NOT EXISTS ux_nota_ref_signature_cpe_472
  ON public.notas_referenciadas_operaciones (tenant_id, nota_cpe_id)
  WHERE tipo_operacion = 'FIRMAR' AND nota_cpe_id IS NOT NULL;

SELECT app.apply_tenant_policy('public', 'notas_referenciadas_operaciones');

CREATE OR REPLACE FUNCTION app.assert_nota_actor_472(
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
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND u.activo
      AND lower(u.estado::text) = 'activo'
  ) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ACTOR_INVALID'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.nota_fingerprint_472(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(coalesce(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION app.insert_nota_outbox_472(
  p_tenant_id uuid,
  p_aggregate_id uuid,
  p_event_type text,
  p_event_id uuid,
  p_idempotency_key text,
  p_fingerprint text,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_row public.outbox_events%ROWTYPE;
BEGIN
  IF p_event_type NOT IN ('nota_credito.emitida', 'nota_debito.emitida') THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_EVENT_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, 'nota_referenciada', p_aggregate_id::text, p_event_type,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'operationFingerprint', p_fingerprint,
      'accountingHandledByOutbox', true
    ),
    'pending', 0, p_idempotency_key, p_event_id, clock_timestamp(), now(), now()
  )
  ON CONFLICT (tenant_id, event_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING;

  SELECT * INTO v_row
  FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id
    AND o.event_type = p_event_type
    AND o.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF NOT FOUND
     OR v_row.event_id IS DISTINCT FROM p_event_id
     OR v_row.aggregate_id IS DISTINCT FROM p_aggregate_id::text
     OR v_row.payload->>'operationFingerprint' IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_OUTBOX_CONFLICT'
      USING ERRCODE = '23505';
  END IF;
  RETURN v_row.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_nota_referenciada_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_documento_origen_id uuid,
  p_tipo_documento text,
  p_codigo_motivo text,
  p_motivo text,
  p_monto_total numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo_documento, '')));
  v_codigo text := btrim(coalesce(p_codigo_motivo, ''));
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_monto numeric(14,2) := round(coalesce(p_monto_total, 0), 2);
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.notas_referenciadas_operaciones%ROWTYPE;
  v_origen public.documentos%ROWTYPE;
  v_origen_cpe public.cpe%ROWTYPE;
  v_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_nota_cxc public.cuentas_por_cobrar%ROWTYPE;
  v_nota public.documentos%ROWTYPE;
  v_nota_cpe public.cpe%ROWTYPE;
  v_saldo public.saldos_favor_clientes%ROWTYPE;
  v_line record;
  v_source_count integer;
  v_source_base numeric(14,2);
  v_source_igv numeric(14,2);
  v_source_isc numeric(14,2);
  v_source_total numeric(14,2);
  v_ratio numeric(24,12);
  v_target_base numeric(14,2);
  v_target_igv numeric(14,2);
  v_target_isc numeric(14,2);
  v_alloc_base numeric(14,2) := 0;
  v_alloc_igv numeric(14,2) := 0;
  v_alloc_isc numeric(14,2) := 0;
  v_line_base numeric(14,2);
  v_line_igv numeric(14,2);
  v_line_isc numeric(14,2);
  v_line_total numeric(14,2);
  v_afectacion text;
  v_order integer := 0;
  v_gravadas numeric(14,2) := 0;
  v_exoneradas numeric(14,2) := 0;
  v_inafectas numeric(14,2) := 0;
  v_exportacion numeric(14,2) := 0;
  v_details jsonb := '[]'::jsonb;
  v_cpe_items jsonb := '[]'::jsonb;
  v_credited numeric(14,2) := 0;
  v_pending numeric(14,2) := 0;
  v_reduction numeric(14,2) := 0;
  v_excess numeric(14,2) := 0;
  v_pending_new numeric(14,2) := 0;
  v_serie text;
  v_numero text;
  v_digits text;
  v_event_id uuid := gen_random_uuid();
  v_event_type text;
  v_event_key text;
  v_tipo_cambio numeric(18,6);
  v_local_base numeric(14,2);
  v_local_igv numeric(14,2);
  v_local_total numeric(14,2);
  v_result jsonb;
BEGIN
  PERFORM app.assert_nota_actor_472(p_tenant_id, p_actor_id);

  IF p_documento_origen_id IS NULL
     OR v_tipo NOT IN ('07', '08')
     OR length(v_motivo) NOT BETWEEN 3 AND 500
     OR length(v_key) NOT BETWEEN 8 AND 200
     OR v_monto <= 0 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF (v_tipo = '07' AND v_codigo NOT IN ('04','05','08','09','10','11','12','13'))
     OR (v_tipo = '08' AND v_codigo NOT IN ('01','02','03')) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_REASON_NOT_SUPPORTED:%', v_codigo
      USING ERRCODE = '22023';
  END IF;

  v_canonical := jsonb_build_object(
    'version', 1,
    'actor_id', p_actor_id,
    'documento_origen_id', p_documento_origen_id,
    'tipo_documento', v_tipo,
    'codigo_motivo', v_codigo,
    'motivo', v_motivo,
    'monto_total', v_monto
  );
  v_fingerprint := app.nota_fingerprint_472(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:NOTA-REFERENCIADA:%s', p_tenant_id, v_key), 472));

  SELECT * INTO v_operacion
  FROM public.notas_referenciadas_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo_operacion = 'CREAR'
    AND lower(o.idempotency_key) = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.actor_id IS DISTINCT FROM p_actor_id
       OR v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:NOTA-ORIGEN:%s', p_tenant_id, p_documento_origen_id), 472));
  SELECT * INTO v_origen
  FROM public.documentos d
  WHERE d.id = p_documento_origen_id
    AND d.tenant_id = p_tenant_id
    AND d.tipo_documento IN ('FACTURA', 'BOLETA')
  FOR UPDATE;
  IF NOT FOUND
     OR v_origen.cliente_id IS NULL
     OR coalesce(v_origen.total, 0) <= 0
     OR upper(v_origen.estado::text) IN ('BORRADOR','RECHAZADO','ANULADO') THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_DOCUMENT_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = v_origen.cliente_id AND c.tenant_id = p_tenant_id
      AND coalesce(c.activo, true)
  ) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_CUSTOMER_INVALID'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_origen_cpe
  FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id
    AND c.documento_id = v_origen.id
    AND upper(c.tipo_documento) IN ('01','03')
  FOR UPDATE;
  IF NOT FOUND
     OR upper(v_origen_cpe.estado::text) IN ('BORRADOR','RECHAZADO','ANULADO','ERROR')
     OR v_origen_cpe.nota_credito_id IS NOT NULL
     OR v_origen_cpe.cliente_id IS DISTINCT FROM v_origen.cliente_id
     OR upper(coalesce(v_origen_cpe.moneda, 'PEN')) IS DISTINCT FROM upper(coalesce(v_origen.moneda, 'PEN')) THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_CPE_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF (upper(v_origen_cpe.tipo_documento) = '01' AND upper(v_origen_cpe.serie) !~ '^F[A-Z0-9]{3}$')
     OR (upper(v_origen_cpe.tipo_documento) = '03' AND upper(v_origen_cpe.serie) !~ '^B[A-Z0-9]{3}$') THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_SERIES_INVALID'
      USING ERRCODE = '23514';
  END IF;

  -- La nota no debe reconocer una reversa ni un ingreso adicional antes de
  -- que exista el asiento único de la venta origen. La ausencia es reintentable.
  BEGIN
    PERFORM app.validar_contabilidad_origen_anulacion_cpe_448(
      p_tenant_id, v_origen_cpe.id
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ORIGINAL_ACCOUNTING_PENDING_RETRY'
      USING ERRCODE = '40001', DETAIL = SQLERRM;
  END;

  PERFORM 1
  FROM public.documento_detalles dd
  WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origen.id
  ORDER BY dd.orden, dd.id
  FOR UPDATE;

  SELECT count(*)::integer,
         round(coalesce(sum(dd.valor_venta), 0), 2),
         round(coalesce(sum(dd.impuesto_igv), 0), 2),
         round(coalesce(sum(dd.impuesto_isc), 0), 2),
         round(coalesce(sum(dd.total_item), 0), 2)
  INTO v_source_count, v_source_base, v_source_igv, v_source_isc, v_source_total
  FROM public.documento_detalles dd
  WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origen.id;

  IF v_source_count < 1 OR v_source_total <= 0
     OR abs(v_source_total - round(coalesce(v_origen.total, 0), 2)) > 0.01 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SOURCE_LINES_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF v_tipo = '07' THEN
    SELECT round(coalesce(sum(d.total), 0), 2)
    INTO v_credited
    FROM public.documentos d
    WHERE d.tenant_id = p_tenant_id
      AND d.tipo_documento = 'NOTA_CREDITO'
      AND (
        d.documento_origen_id = v_origen.id
        OR d.metadata->>'source_document_id' = v_origen.id::text
      )
      AND upper(d.estado::text) NOT IN ('RECHAZADO','ANULADO');
    IF round(v_credited + v_monto, 2) - v_source_total > 0.01 THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_EXCEEDS_SOURCE_BALANCE: available=% requested=%',
        round(v_source_total - v_credited, 2), v_monto
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_ratio := v_monto / v_source_total;
  v_target_base := round(v_source_base * v_ratio, 2);
  v_target_igv := round(v_source_igv * v_ratio, 2);
  v_target_isc := round(v_source_isc * v_ratio, 2);
  v_target_base := round(v_target_base + (v_monto - v_target_base - v_target_igv - v_target_isc), 2);
  IF least(v_target_base, v_target_igv, v_target_isc) < 0
     OR abs(v_monto - v_target_base - v_target_igv - v_target_isc) > 0.01 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ALLOCATION_INVALID'
      USING ERRCODE = '23514';
  END IF;

  FOR v_line IN
    SELECT dd.*,
      row_number() OVER (ORDER BY dd.orden, dd.id) AS rn,
      count(*) OVER () AS n
    FROM public.documento_detalles dd
    WHERE dd.tenant_id = p_tenant_id AND dd.documento_id = v_origen.id
    ORDER BY dd.orden, dd.id
  LOOP
    IF v_line.rn = v_line.n THEN
      v_line_base := round(v_target_base - v_alloc_base, 2);
      v_line_igv := round(v_target_igv - v_alloc_igv, 2);
      v_line_isc := round(v_target_isc - v_alloc_isc, 2);
    ELSE
      v_line_base := round(coalesce(v_line.valor_venta, 0) * v_ratio, 2);
      v_line_igv := round(coalesce(v_line.impuesto_igv, 0) * v_ratio, 2);
      v_line_isc := round(coalesce(v_line.impuesto_isc, 0) * v_ratio, 2);
    END IF;
    v_line_total := round(v_line_base + v_line_igv + v_line_isc, 2);
    v_alloc_base := round(v_alloc_base + v_line_base, 2);
    v_alloc_igv := round(v_alloc_igv + v_line_igv, 2);
    v_alloc_isc := round(v_alloc_isc + v_line_isc, 2);
    IF v_line_total <= 0 THEN CONTINUE; END IF;
    IF least(v_line_base, v_line_igv, v_line_isc) < 0 THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_LINE_ALLOCATION_INVALID'
        USING ERRCODE = '23514';
    END IF;

    v_order := v_order + 1;
    v_afectacion := coalesce(nullif(v_line.metadata->>'afectacion_igv', ''),
      CASE WHEN v_line_igv > 0 THEN '10' ELSE '20' END);
    IF v_afectacion LIKE '10%' THEN v_gravadas := round(v_gravadas + v_line_base, 2);
    ELSIF v_afectacion LIKE '20%' THEN v_exoneradas := round(v_exoneradas + v_line_base, 2);
    ELSIF v_afectacion LIKE '40%' THEN v_exportacion := round(v_exportacion + v_line_base, 2);
    ELSE v_inafectas := round(v_inafectas + v_line_base, 2);
    END IF;

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'orden', v_order,
      'producto_id', v_line.producto_id,
      'codigo_producto', v_line.codigo_producto,
      'descripcion', v_line.descripcion,
      'unidad_medida', coalesce(v_line.unidad_medida, 'NIU'),
      'cantidad', v_line.cantidad,
      'precio_unitario', round(v_line_base / nullif(v_line.cantidad, 0), 6),
      'valor_venta', v_line_base,
      'impuesto_igv', v_line_igv,
      'impuesto_isc', v_line_isc,
      'total_item', v_line_total,
      'afectacion_igv', v_afectacion,
      'source_document_line_id', v_line.id
    ));
    v_cpe_items := v_cpe_items || jsonb_build_array(jsonb_build_object(
      'item', v_order,
      'producto_id', v_line.producto_id,
      'codigo', v_line.codigo_producto,
      'descripcion', v_line.descripcion,
      'unidad_medida', coalesce(v_line.unidad_medida, 'NIU'),
      'cantidad', v_line.cantidad,
      'precio_unitario', round(v_line_base / nullif(v_line.cantidad, 0), 6),
      'valor_unitario', round(v_line_base / nullif(v_line.cantidad, 0), 6),
      'valor_venta', v_line_base,
      'igv', v_line_igv,
      'impuesto_igv', v_line_igv,
      'isc', v_line_isc,
      'impuesto_isc', v_line_isc,
      'total', v_line_total,
      'afectacion_igv', v_afectacion
    ));
  END LOOP;

  IF v_order < 1 OR abs(v_monto - v_alloc_base - v_alloc_igv - v_alloc_isc) > 0.01 THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_FINAL_ALLOCATION_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_digits := regexp_replace(upper(v_origen_cpe.serie), '[^0-9]', '', 'g');
  v_serie := CASE
    WHEN v_tipo = '07' AND upper(v_origen_cpe.tipo_documento) = '01' THEN 'FC'
    WHEN v_tipo = '07' THEN 'BC'
    WHEN upper(v_origen_cpe.tipo_documento) = '01' THEN 'FD'
    ELSE 'BD'
  END || right(lpad(coalesce(nullif(v_digits, ''), '1'), 2, '0'), 2);
  IF v_serie !~ '^(FC|BC|FD|BD)[0-9]{2}$' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SERIES_INVALID' USING ERRCODE = '23514';
  END IF;
  v_numero := btrim(public.obtener_siguiente_numero_documento(
    p_tenant_id,
    CASE WHEN v_tipo = '07' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END,
    v_serie
  ));
  IF v_numero !~ '^[0-9]{1,8}$' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_NUMBER_INVALID' USING ERRCODE = '40001';
  END IF;
  v_numero := lpad(v_numero, 8, '0');

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
    moneda, tipo_cambio, subtotal, descuentos, impuesto_igv, impuesto_isc,
    otros_impuestos, total, total_gravadas, total_exoneradas,
    total_inafectas, total_exportacion, emisor_ruc, emisor_razon_social,
    emisor_direccion, receptor_tipo_doc, receptor_numero_doc,
    receptor_documento, receptor_razon_social, receptor_nombre,
    receptor_direccion, pedido_id, cliente_id, metodo_pago, estado,
    estado_sunat, observaciones, created_by, updated_by, documento_origen_id,
    idempotency_key, intent_fingerprint, metadata, created_at, updated_at
  ) VALUES (
    p_tenant_id,
    CASE WHEN v_tipo = '07' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END,
    v_serie, v_numero, clock_timestamp(),
    (app.hoy_tenant(p_tenant_id) + 30)::timestamptz,
    upper(coalesce(v_origen.moneda, 'PEN')),
    coalesce(nullif(v_origen.tipo_cambio, 0), 1),
    v_target_base, 0, v_target_igv, v_target_isc, 0, v_monto,
    v_gravadas, v_exoneradas, v_inafectas, v_exportacion,
    v_origen.emisor_ruc, v_origen.emisor_razon_social, v_origen.emisor_direccion,
    v_origen.receptor_tipo_doc,
    coalesce(v_origen.receptor_numero_doc, v_origen.receptor_documento),
    coalesce(v_origen.receptor_documento, v_origen.receptor_numero_doc),
    coalesce(v_origen.receptor_razon_social, v_origen.receptor_nombre),
    coalesce(v_origen.receptor_nombre, v_origen.receptor_razon_social),
    v_origen.receptor_direccion, v_origen.pedido_id, v_origen.cliente_id,
    CASE WHEN v_tipo = '07' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END,
    'EMITIDO', 'PENDIENTE', v_motivo, p_actor_id, p_actor_id,
    v_origen.id, format('nota-ref-doc:%s:%s', p_tenant_id, v_key),
    v_fingerprint,
    jsonb_build_object(
      'source_document_id', v_origen.id,
      'source_cpe_id', v_origen_cpe.id,
      'codigo_motivo', v_codigo,
      'motivo_nota', v_motivo,
      'emission_fingerprint', v_fingerprint,
      'idempotency_key', v_key,
      'inventory_effect', 'NONE',
      'atomic_rpc', 'crear_nota_referenciada_tx'
    ), now(), now()
  ) RETURNING * INTO v_nota;

  INSERT INTO public.documento_detalles (
    tenant_id, documento_id, orden, producto_id, codigo_producto,
    descripcion, unidad_medida, cantidad, precio_unitario, descuento_unitario,
    valor_venta, impuesto_igv, impuesto_isc, total_item, metadata,
    created_at, updated_at
  )
  SELECT p_tenant_id, v_nota.id, (e->>'orden')::integer,
    nullif(e->>'producto_id', '')::uuid, e->>'codigo_producto',
    e->>'descripcion', e->>'unidad_medida', (e->>'cantidad')::numeric,
    (e->>'precio_unitario')::numeric, 0, (e->>'valor_venta')::numeric,
    (e->>'impuesto_igv')::numeric, (e->>'impuesto_isc')::numeric,
    (e->>'total_item')::numeric,
    jsonb_build_object(
      'afectacion_igv', e->>'afectacion_igv',
      'source_document_line_id', e->>'source_document_line_id',
      'inventory_effect', 'NONE',
      'emission_fingerprint', v_fingerprint
    ), now(), now()
  FROM jsonb_array_elements(v_details) e;

  INSERT INTO public.cpe (
    tenant_id, documento_id, documento_referencia_id, tipo_documento,
    serie, numero, numero_comprobante, ruc_emisor, razon_social_emisor,
    direccion_emisor, tipo_documento_receptor, documento_receptor,
    razon_social_receptor, direccion_receptor, cliente_id, moneda,
    total_gravadas, total_exoneradas, total_inafectas, total_exportacion,
    total_igv, total_venta, total, items, fecha_emision, fecha_vencimiento,
    idempotency_key, event_id, estado, estado_sunat, sunat_status,
    created_by, activo, documento_referencia_tipo,
    documento_referencia_serie, documento_referencia_numero,
    tipo_nota_credito, tipo_nota_debito, motivo_nota, metadata,
    created_at, updated_at
  ) VALUES (
    p_tenant_id, v_nota.id, v_origen.id, v_tipo, v_serie, v_numero,
    v_numero::integer, v_origen_cpe.ruc_emisor, v_origen_cpe.razon_social_emisor,
    v_origen_cpe.direccion_emisor, v_origen_cpe.tipo_documento_receptor,
    v_origen_cpe.documento_receptor, v_origen_cpe.razon_social_receptor,
    v_origen_cpe.direccion_receptor, v_origen.cliente_id,
    upper(coalesce(v_origen.moneda, 'PEN')), v_gravadas, v_exoneradas,
    v_inafectas, v_exportacion, v_target_igv, v_monto, v_monto, v_cpe_items,
    clock_timestamp(), app.hoy_tenant(p_tenant_id) + 30,
    format('nota-ref-cpe:%s:%s', p_tenant_id, v_key), v_event_id,
    'BORRADOR', 'PENDIENTE', 'NOT_SENT', p_actor_id, true,
    upper(v_origen_cpe.tipo_documento), upper(v_origen_cpe.serie),
    lpad(btrim(v_origen_cpe.numero), 8, '0'),
    CASE WHEN v_tipo = '07' THEN v_codigo ELSE NULL END,
    CASE WHEN v_tipo = '08' THEN v_codigo ELSE NULL END,
    v_motivo,
    jsonb_build_object(
      'source_document_id', v_origen.id,
      'source_cpe_id', v_origen_cpe.id,
      'codigo_motivo', v_codigo,
      'emission_fingerprint', v_fingerprint,
      'inventory_effect', 'NONE',
      'atomic_rpc', 'crear_nota_referenciada_tx',
      'legal_transmission_status', 'PENDING_CUSTOMER_CREDENTIALS_OR_SIGNATURE'
    ), now(), now()
  ) RETURNING * INTO v_nota_cpe;

  SELECT * INTO v_cxc
  FROM public.cuentas_por_cobrar c
  WHERE c.tenant_id = p_tenant_id
    AND c.documento_id = v_origen.id
    AND lower(c.estado::text) NOT IN ('anulada','revertida')
  FOR UPDATE;

  IF v_tipo = '07' THEN
    v_pending := CASE WHEN v_cxc.id IS NULL THEN 0 ELSE round(coalesce(
      v_cxc.monto_pendiente, v_cxc.saldo_pendiente, v_cxc.saldo, 0), 2) END;
    v_reduction := least(v_monto, v_pending);
    v_excess := round(v_monto - v_reduction, 2);
    v_pending_new := round(v_pending - v_reduction, 2);

    IF v_reduction > 0 THEN
      INSERT INTO public.cxc_pagos (
        tenant_id, cuenta_id, pedido_id, documento_id, tipo, monto, moneda,
        fecha_pago, metodo_pago, referencia, usuario_id, event_id,
        idempotency_key, source, estado, activo, metadata, created_at, updated_at
      ) VALUES (
        p_tenant_id, v_cxc.id, v_origen.pedido_id, v_nota.id, 'NOTA_CREDITO',
        v_reduction, upper(coalesce(v_cxc.moneda, v_origen.moneda, 'PEN')),
        app.hoy_tenant(p_tenant_id), 'NOTA_CREDITO', v_serie || '-' || v_numero,
        p_actor_id, v_event_id, format('nota-ref-cxc:%s:%s', p_tenant_id, v_key),
        'cpe.nota_referenciada.atomic', 'ACTIVO', true,
        jsonb_build_object(
          'nota_credito_documento_id', v_nota.id,
          'nota_credito_cpe_id', v_nota_cpe.id,
          'source_document_id', v_origen.id,
          'accountingOwner', 'nota_credito.emitida',
          'request_fingerprint', v_fingerprint
        ), now(), now()
      );
      UPDATE public.cuentas_por_cobrar
      SET monto_pendiente = v_pending_new,
          saldo_pendiente = v_pending_new,
          saldo = v_pending_new,
          estado = CASE WHEN v_pending_new <= 0.009 THEN 'CANCELADO' ELSE 'PARCIAL' END,
          dias_mora = CASE WHEN v_pending_new > 0 THEN greatest(
            app.hoy_tenant(p_tenant_id) - coalesce(fecha_vencimiento, app.hoy_tenant(p_tenant_id)), 0
          ) ELSE 0 END,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'last_credit_note_id', v_nota.id,
            'last_credit_note_amount', v_reduction,
            'last_credit_note_fingerprint', v_fingerprint
          ),
          updated_at = now()
      WHERE id = v_cxc.id AND tenant_id = p_tenant_id
      RETURNING * INTO v_cxc;
    END IF;

    IF v_excess > 0 THEN
      INSERT INTO public.saldos_favor_clientes (
        tenant_id, cliente_id, rma_id, documento_origen_id,
        nota_credito_documento_id, nota_credito_cpe_id, moneda,
        tipo_cambio_origen, monto_original, monto_disponible,
        monto_local_original, monto_local_disponible,
        estado, created_by, metadata
      ) VALUES (
        p_tenant_id, v_origen.cliente_id, NULL, v_origen.id,
        v_nota.id, v_nota_cpe.id, upper(coalesce(v_origen.moneda, 'PEN')),
        coalesce(nullif(v_origen.tipo_cambio, 0), 1), v_excess, v_excess,
        round(v_excess * coalesce(nullif(v_origen.tipo_cambio, 0), 1), 2),
        round(v_excess * coalesce(nullif(v_origen.tipo_cambio, 0), 1), 2),
        'DISPONIBLE', p_actor_id,
        jsonb_build_object(
          'source', 'cpe.nota_referenciada.atomic',
          'fingerprint', v_fingerprint,
          'account_code', '122'
        )
      ) RETURNING * INTO v_saldo;
      INSERT INTO public.saldos_favor_movimientos (
        tenant_id, saldo_favor_id, tipo, monto, actor_id, idempotency_key,
        event_id, metadata
      ) VALUES (
        p_tenant_id, v_saldo.id, 'ORIGEN_NC', v_excess, p_actor_id,
        format('nota-ref-balance:%s:%s', p_tenant_id, v_key), v_event_id,
        jsonb_build_object(
          'nota_credito_documento_id', v_nota.id,
          'nota_credito_cpe_id', v_nota_cpe.id,
          'source_document_id', v_origen.id,
          'request_fingerprint', v_fingerprint
        )
      );
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
      p_tenant_id, v_origen.cliente_id, v_origen.pedido_id, v_nota.id,
      v_serie, v_numero, v_serie || '-' || v_numero, 'NOTA_DEBITO',
      app.hoy_tenant(p_tenant_id), app.hoy_tenant(p_tenant_id) + 30,
      upper(coalesce(v_origen.moneda, 'PEN')),
      coalesce(nullif(v_origen.tipo_cambio, 0), 1),
      v_monto, v_monto, v_monto, v_monto, v_monto, v_monto,
      'PENDIENTE', 0, 0, 0, 0, 0, v_event_id,
      format('nota-ref-debit-cxc:%s:%s', p_tenant_id, v_key),
      'cpe.nota_debito.atomic', true,
      jsonb_build_object(
        'cpe_id', v_nota_cpe.id,
        'source_document_id', v_origen.id,
        'emission_fingerprint', v_fingerprint,
        'atomic_rpc', 'crear_nota_referenciada_tx'
      ), now(), now()
    ) RETURNING * INTO v_nota_cxc;
  END IF;

  v_tipo_cambio := coalesce(nullif(v_origen.tipo_cambio, 0), 1);
  v_local_base := round(v_target_base * v_tipo_cambio, 2);
  v_local_igv := round((v_target_igv + v_target_isc) * v_tipo_cambio, 2);
  v_local_total := round(v_monto * v_tipo_cambio, 2);
  v_event_type := CASE WHEN v_tipo = '07'
    THEN 'nota_credito.emitida' ELSE 'nota_debito.emitida' END;
  v_event_key := format('%s:%s:%s', v_event_type, p_tenant_id, v_nota.id);
  PERFORM app.insert_nota_outbox_472(
    p_tenant_id, v_nota.id, v_event_type, v_event_id, v_event_key, v_fingerprint,
    jsonb_build_object(
      'eventId', v_event_id,
      'tenantId', p_tenant_id,
      'idempotencyKey', v_event_key,
      'notaDocumentoId', v_nota.id,
      'cpeId', v_nota_cpe.id,
      'documentoOrigenId', v_origen.id,
      'cpeOrigenId', v_origen_cpe.id,
      'cxcId', CASE WHEN v_tipo = '07' THEN v_cxc.id ELSE v_nota_cxc.id END,
      'saldoFavorId', v_saldo.id,
      'tipoDocumento', v_tipo,
      'codigoMotivo', v_codigo,
      'motivo', v_motivo,
      'serie', v_serie,
      'numero', v_numero,
      'fechaEmision', clock_timestamp(),
      'moneda', upper(coalesce(v_origen.moneda, 'PEN')),
      'tipoCambio', v_tipo_cambio,
      'base_imponible', v_local_base,
      'subtotal', v_local_base,
      'igv', v_local_igv,
      'impuestos', v_local_igv,
      'total', v_local_total,
      'monto_pendiente', CASE WHEN v_tipo = '07'
        THEN round(v_reduction * v_tipo_cambio, 2) ELSE v_local_total END,
      'cxcReduction', round(v_reduction * v_tipo_cambio, 2),
      'customerCreditBalance', round(v_excess * v_tipo_cambio, 2),
      'costo_ventas', 0,
      'inventoryEffect', 'NONE',
      'source', 'cpe.nota_referenciada.atomic',
      'accountingOwner', v_event_type,
      'actorId', p_actor_id
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'documento_id', v_nota.id,
    'cpe_id', v_nota_cpe.id,
    'documento_origen_id', v_origen.id,
    'tipo_documento', v_tipo,
    'serie', v_serie,
    'numero', v_numero,
    'total', v_monto,
    'estado', 'BORRADOR',
    'requiere_firma', true,
    'cxc_id', CASE WHEN v_tipo = '07' THEN v_cxc.id ELSE v_nota_cxc.id END,
    'cxc_reduction', v_reduction,
    'saldo_favor_id', v_saldo.id,
    'saldo_favor', v_excess,
    'event_id', v_event_id,
    'idempotent', false
  );
  INSERT INTO public.notas_referenciadas_operaciones (
    tenant_id, actor_id, tipo_operacion, idempotency_key, fingerprint,
    documento_origen_id, nota_documento_id, nota_cpe_id, event_id,
    payload, resultado
  ) VALUES (
    p_tenant_id, p_actor_id, 'CREAR', v_key, v_fingerprint,
    v_origen.id, v_nota.id, v_nota_cpe.id, v_event_id,
    v_canonical, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.firmar_nota_referenciada_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cpe_id uuid,
  p_xml_firmado text,
  p_hash_firma text,
  p_xml_sha256 text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_xml_sha text := lower(btrim(coalesce(p_xml_sha256, '')));
  v_actual_sha text;
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.notas_referenciadas_operaciones%ROWTYPE;
  v_cpe public.cpe%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_nota_actor_472(p_tenant_id, p_actor_id);
  IF p_cpe_id IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR length(btrim(coalesce(p_xml_firmado, ''))) < 100
     OR length(btrim(coalesce(p_hash_firma, ''))) < 8
     OR v_xml_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_SIGNATURE_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END IF;
  v_actual_sha := encode(extensions.digest(convert_to(p_xml_firmado, 'UTF8'), 'sha256'), 'hex');
  IF v_actual_sha IS DISTINCT FROM v_xml_sha THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_XML_HASH_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  v_canonical := jsonb_build_object(
    'version', 1, 'actor_id', p_actor_id, 'cpe_id', p_cpe_id,
    'xml_sha256', v_xml_sha, 'hash_firma', p_hash_firma
  );
  v_fingerprint := app.nota_fingerprint_472(v_canonical);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:FIRMAR-NOTA:%s', p_tenant_id, p_cpe_id), 472));

  SELECT * INTO v_operacion
  FROM public.notas_referenciadas_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo_operacion = 'FIRMAR'
    AND lower(o.idempotency_key) = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.actor_id IS DISTINCT FROM p_actor_id
       OR v_operacion.fingerprint IS DISTINCT FROM v_fingerprint
       OR v_operacion.nota_cpe_id IS DISTINCT FROM p_cpe_id THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_SIGNATURE_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_cpe
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id
    AND upper(c.tipo_documento) IN ('07','08')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_CPE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF upper(v_cpe.estado::text) NOT IN ('BORRADOR','FIRMADO')
     OR upper(coalesce(v_cpe.documento_referencia_tipo, '')) NOT IN ('01','03')
     OR coalesce(v_cpe.documento_referencia_serie, '') = ''
     OR coalesce(v_cpe.documento_referencia_numero, '') = '' THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_CPE_NOT_SIGNABLE'
      USING ERRCODE = '23514';
  END IF;
  IF upper(v_cpe.estado::text) = 'FIRMADO'
     AND v_cpe.metadata->>'signed_xml_sha256' IS DISTINCT FROM v_xml_sha THEN
    RAISE EXCEPTION 'REFERENCED_NOTE_ALREADY_SIGNED_WITH_DIFFERENT_XML'
      USING ERRCODE = '23505';
  END IF;

  -- Una firma es una sola transición por CPE, incluso si el cliente pierde la
  -- respuesta y accidentalmente cambia la llave. Se devuelve el resultado
  -- persistido sólo si actor y huella coinciden; nunca se re-firma distinto.
  SELECT * INTO v_operacion
  FROM public.notas_referenciadas_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo_operacion = 'FIRMAR'
    AND o.nota_cpe_id = p_cpe_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.actor_id IS DISTINCT FROM p_actor_id
       OR v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_ALREADY_SIGNED_BY_DIFFERENT_INTENT'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;

  UPDATE public.cpe
  SET xml_firmado = p_xml_firmado,
      hash = p_hash_firma,
      hash_firma = p_hash_firma,
      estado = 'FIRMADO',
      estado_sunat = 'PENDIENTE',
      sunat_status = 'READY',
      error_message = NULL,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'signed_xml_sha256', v_xml_sha,
        'signature_fingerprint', v_fingerprint,
        'signed_by', p_actor_id,
        'signed_at', clock_timestamp(),
        'legal_transmission_status', 'READY_FOR_CUSTOMER_TRANSMISSION',
        'signature_rpc', 'firmar_nota_referenciada_tx'
      ),
      updated_at = now()
  WHERE id = p_cpe_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_cpe;

  IF v_cpe.documento_id IS NOT NULL THEN
    UPDATE public.documentos
    SET xml_content = p_xml_firmado,
        codigo_hash = p_hash_firma,
        estado_sunat = 'PENDIENTE',
        updated_by = p_actor_id,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'signed_xml_sha256', v_xml_sha,
          'signature_fingerprint', v_fingerprint,
          'signed_by', p_actor_id,
          'signature_rpc', 'firmar_nota_referenciada_tx'
        ),
        updated_at = now()
    WHERE id = v_cpe.documento_id AND tenant_id = p_tenant_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true, 'cpe_id', v_cpe.id, 'documento_id', v_cpe.documento_id,
    'estado', 'FIRMADO', 'sunat_status', 'READY',
    'xml_sha256', v_xml_sha, 'idempotent', false
  );
  INSERT INTO public.notas_referenciadas_operaciones (
    tenant_id, actor_id, tipo_operacion, idempotency_key, fingerprint,
    documento_origen_id, nota_documento_id, nota_cpe_id, payload, resultado
  ) VALUES (
    p_tenant_id, p_actor_id, 'FIRMAR', v_key, v_fingerprint,
    coalesce(v_cpe.documento_referencia_id,
      nullif(v_cpe.metadata->>'source_document_id', '')::uuid),
    v_cpe.documento_id, v_cpe.id, v_canonical, v_result
  );
  RETURN v_result;
END;
$function$;

-- Sincroniza la lista SQL que protege períodos con el ownership real del
-- worker contable y agrega la nota de débito.
CREATE OR REPLACE FUNCTION app.is_accounting_event_458(p_event_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT lower(COALESCE(btrim(p_event_type), '')) = ANY (ARRAY[
    'venta.procesada','ventafacturada','pos.venta.registrada','caja.cerrada',
    'banco.movimiento.registrado','banco.transferencia.registrada',
    'cobro.registrado','cobroregistrado','cobro.revertido',
    'cxc.ajuste.registrado','cxcajusteregistrado','cxc.ajuste.revertido',
    'cxp.ajuste.registrado','nota_credito.emitida','nota_debito.emitida',
    'saldo_favor.aplicado','saldo_favor.reembolsado',
    'saldo_favor.reembolso_revertido','recepcion.registrada',
    'recepcionregistrada','factura.proveedor.registrada',
    'facturaproveedorregistrada','devolucion.proveedor.registrada',
    'devolucionproveedoremitida','cxc.creada','cuentaporcobrarcreada',
    'pago.proveedor.registrado','pagoproveedorregistrado',
    'ajuste.inventario.aplicado','ajusteinventarioaplicado',
    'planilla.liquidada','planillaliquidada','planilla.pagada','planillapagada',
    'liquidacion.aprobada','liquidacion.pagada','liquidacion.pago.revertido',
    'cts.depositado','depreciacion.generada','depreciaciongenerada',
    'cpe.anulado','cpeanulado','factura.emitida','facturaemitida'
  ]::text[])
$function$;

REVOKE ALL ON TABLE public.notas_referenciadas_operaciones
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.notas_referenciadas_operaciones
  TO service_role;

REVOKE ALL ON FUNCTION app.assert_nota_actor_472(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.nota_fingerprint_472(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.insert_nota_outbox_472(uuid, uuid, text, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crear_nota_referenciada_tx(uuid, uuid, uuid, text, text, text, numeric, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.firmar_nota_referenciada_tx(uuid, uuid, uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_nota_referenciada_tx(uuid, uuid, uuid, text, text, text, numeric, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.firmar_nota_referenciada_tx(uuid, uuid, uuid, text, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.crear_nota_referenciada_tx(uuid, uuid, uuid, text, text, text, numeric, text)
IS 'Crea NC/ND referenciada, documento, líneas, CxC/saldo y outbox en una transacción; no mueve inventario ni exige certificado.';
COMMENT ON FUNCTION public.firmar_nota_referenciada_tx(uuid, uuid, uuid, text, text, text, text)
IS 'Persiste de forma idempotente la firma XML de una nota 07/08 cuando el tenant configura certificado; no reconoce nuevamente el efecto financiero.';

COMMIT;
