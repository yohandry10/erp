BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regprocedure('public.crear_rma_tx(uuid,uuid,jsonb,text)') IS NULL
     OR to_regprocedure('public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)') IS NULL
     OR to_regprocedure('app.crear_nota_referenciada_co_529(uuid,uuid,uuid,text,text,text,numeric,text,jsonb,boolean)') IS NULL
     OR to_regprocedure('app.aplicar_efecto_nota_dian_529(uuid,uuid)') IS NULL
     OR to_regprocedure('app.rma_insert_event_456(uuid,uuid,uuid,text,text,jsonb)') IS NULL
     OR to_regclass('public.rma_solicitudes') IS NULL
     OR to_regclass('public.rma_items') IS NULL
     OR to_regclass('public.rma_operaciones') IS NULL THEN
    RAISE EXCEPTION '534 requiere los contratos RMA 456/532 y DIAN 529';
  END IF;
END;
$preflight$;

-- En un tenant Colombia real una devolución sólo puede nacer de una factura
-- 01 aceptada por DIAN. La demo conserva el flujo físico para demostración,
-- pero nunca se convierte en evidencia fiscal ni en una nota 91 aceptable.
ALTER FUNCTION public.crear_rma_tx(uuid, uuid, jsonb, text)
  RENAME TO crear_rma_legacy_534;

REVOKE ALL ON FUNCTION public.crear_rma_legacy_534(uuid,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crear_rma_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_country text;
  v_is_demo boolean;
  v_document_id uuid;
  v_rma_id uuid;
  v_overdrawn_line_id uuid;
  v_source public.cpe%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT upper(nullif(btrim(ec.pais), '')), ec.is_demo
  INTO v_country, v_is_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR SHARE;

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'RMA_FISCAL_COUNTRY_UNAVAILABLE' USING ERRCODE = '23514';
  END IF;

  IF v_country = 'CO' AND v_is_demo IS NULL THEN
    RAISE EXCEPTION 'RMA_FISCAL_DEMO_STATE_UNAVAILABLE'
      USING ERRCODE = '23514';
  END IF;

  IF v_country = 'CO' AND v_is_demo IS FALSE THEN
    IF (CASE WHEN jsonb_typeof(p_payload->'items') = 'array'
         THEN jsonb_array_length(p_payload->'items') > 100
         ELSE false END) THEN
      RAISE EXCEPTION 'RMA_DIAN_LINE_LIMIT_EXCEEDED: max=100'
        USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_document_id := nullif(p_payload->>'documento_origen_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'RMA_DIAN_SOURCE_DOCUMENT_INVALID' USING ERRCODE = '22023';
    END;
    IF v_document_id IS NULL THEN
      RAISE EXCEPTION 'RMA_DIAN_REQUIRES_ACCEPTED_REAL_INVOICE'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_result := public.crear_rma_legacy_534(
    p_tenant_id, p_actor_id, p_payload, p_idempotency_key
  );

  -- El writer 456 toma pedido -> documento -> CPE. Se revalida después de
  -- delegar para usar ese mismo lock y evitar tanto TOCTOU como inversión de
  -- locks; un replay exacto conserva su respuesta sellada sin exigir el estado
  -- fiscal mutable actual.
  IF v_country = 'CO' AND v_is_demo IS FALSE
     AND NOT coalesce((v_result->>'idempotent')::boolean, false) THEN
    SELECT c.* INTO v_source
    FROM public.rma_solicitudes r
    JOIN public.cpe c
      ON c.id = r.cpe_origen_id
     AND c.tenant_id = r.tenant_id
     AND c.documento_id = r.documento_origen_id
    WHERE r.id = nullif(v_result->>'rma_id', '')::uuid
      AND r.tenant_id = p_tenant_id
      AND r.documento_origen_id = v_document_id
      AND upper(coalesce(c.tipo_documento, '')) = '01'
    FOR UPDATE OF c;
    IF NOT FOUND
       OR upper(v_source.estado::text) <> 'ACEPTADO'
       OR upper(coalesce(v_source.estado_sunat::text, '')) <> 'ACEPTADO'
       OR upper(coalesce(v_source.sunat_status::text, '')) <> 'ACCEPTED'
       OR v_source.simulated_origin IS DISTINCT FROM false
       OR upper(coalesce(v_source.issuer_snapshot->>'country_code', '')) <> 'CO'
       OR upper(coalesce(v_source.fiscal_authority_evidence->>'authority', '')) <> 'DIAN'
       OR upper(coalesce(v_source.fiscal_authority_evidence->>'status', '')) <> 'ACCEPTED'
       OR upper(coalesce(v_source.fiscal_authority_evidence->>'code_kind', '')) <> 'CUFE'
       OR upper(coalesce(v_source.fiscal_authority_evidence->>'unique_code', ''))
            !~ '^[0-9A-F]{96}$' THEN
      RAISE EXCEPTION 'RMA_DIAN_REQUIRES_ACCEPTED_REAL_INVOICE'
        USING ERRCODE = '23514';
    END IF;

    v_rma_id := nullif(v_result->>'rma_id', '')::uuid;

    -- Una nota 91 pendiente o aceptada ya consumió saldo fiscal aunque no
    -- haya nacido de RMA. La RMA se rechaza en su creación para no permitir
    -- que avance hasta RECIBIDA y recién entonces quede imposible de abonar.
    -- El documento y su CPE origen siguen bloqueados por el writer legado;
    -- ése es el mismo orden que usa el writer 529, por lo que una NC
    -- concurrente termina antes de esta lectura o espera a que la RMA cierre.
    IF abs(
      coalesce((
        SELECT round(sum(n.total), 2)
        FROM public.documentos n
        WHERE n.tenant_id = p_tenant_id
          AND n.tipo_documento = 'NOTA_CREDITO'
          AND (
            n.documento_origen_id = v_document_id
            OR n.metadata->>'source_document_id' = v_document_id::text
          )
          AND upper(n.estado::text) NOT IN ('RECHAZADO', 'ANULADO')
      ), 0)
      - coalesce((
        SELECT round(sum(nd.total_item), 2)
        FROM public.documentos n
        JOIN public.documento_detalles nd
          ON nd.tenant_id = n.tenant_id AND nd.documento_id = n.id
        JOIN public.documento_detalles source_line
          ON source_line.tenant_id = p_tenant_id
         AND source_line.documento_id = v_document_id
         AND nd.metadata->>'source_document_line_id' = source_line.id::text
        WHERE n.tenant_id = p_tenant_id
          AND n.tipo_documento = 'NOTA_CREDITO'
          AND (
            n.documento_origen_id = v_document_id
            OR n.metadata->>'source_document_id' = v_document_id::text
          )
          AND upper(n.estado::text) NOT IN ('RECHAZADO', 'ANULADO')
      ), 0)
    ) > 0.01 THEN
      RAISE EXCEPTION 'RMA_DIAN_FISCAL_LINE_BALANCE_UNVERIFIABLE'
        USING ERRCODE = '23514';
    END IF;

    SELECT ri.documento_detalle_id
    INTO v_overdrawn_line_id
    FROM public.rma_items ri
    JOIN public.documento_detalles dd
      ON dd.id = ri.documento_detalle_id
     AND dd.tenant_id = ri.tenant_id
     AND dd.documento_id = v_document_id
    LEFT JOIN LATERAL (
      SELECT
        coalesce(sum(CASE
          WHEN nd.metadata->>'codigo_motivo' IN ('1', '2') THEN nd.cantidad
          ELSE 0 END), 0) AS quantity,
        coalesce(sum(nd.valor_venta), 0) AS base,
        coalesce(sum(nd.impuesto_igv), 0) AS igv,
        coalesce(sum(nd.impuesto_isc), 0) AS isc,
        coalesce(sum(nd.total_item), 0) AS total
      FROM public.documentos n
      JOIN public.documento_detalles nd
        ON nd.tenant_id = n.tenant_id AND nd.documento_id = n.id
      WHERE n.tenant_id = p_tenant_id
        AND n.tipo_documento = 'NOTA_CREDITO'
        AND (
          n.documento_origen_id = v_document_id
          OR n.metadata->>'source_document_id' = v_document_id::text
        )
        AND upper(n.estado::text) NOT IN ('RECHAZADO', 'ANULADO')
        AND nd.metadata->>'source_document_line_id' = dd.id::text
    ) used ON true
    WHERE ri.tenant_id = p_tenant_id
      AND ri.rma_id = v_rma_id
      AND lower(ri.estado::text) NOT IN ('rechazado', 'inactivo')
      AND (
        round(ri.cantidad_autorizada, 6)
          - round(dd.cantidad - used.quantity, 6) > 0.000001
        OR round(dd.valor_venta * ri.cantidad_autorizada
             / nullif(dd.cantidad, 0), 2)
          - round(dd.valor_venta - used.base, 2) > 0.01
        OR round(coalesce(dd.impuesto_igv, 0) * ri.cantidad_autorizada
             / nullif(dd.cantidad, 0), 2)
          - round(coalesce(dd.impuesto_igv, 0) - used.igv, 2) > 0.01
        OR round(coalesce(dd.impuesto_isc, 0) * ri.cantidad_autorizada
             / nullif(dd.cantidad, 0), 2)
          - round(coalesce(dd.impuesto_isc, 0) - used.isc, 2) > 0.01
        OR round(dd.total_item * ri.cantidad_autorizada
             / nullif(dd.cantidad, 0), 2)
          - round(dd.total_item - used.total, 2) > 0.01
      )
    ORDER BY ri.documento_detalle_id
    LIMIT 1;

    IF v_overdrawn_line_id IS NOT NULL THEN
      RAISE EXCEPTION 'RMA_DIAN_FISCAL_LINE_BALANCE_EXCEEDED:%',
        v_overdrawn_line_id USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN v_result;
END;
$function$;

-- Crea la 91 desde la RMA recibida. El navegador sólo aporta el motivo: las
-- líneas, cantidades, bases e impuestos se reconstruyen y validan en servidor.
CREATE OR REPLACE FUNCTION app.crear_nota_credito_rma_dian_534(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_rma_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(nullif(btrim(coalesce(p_idempotency_key, '')), ''));
  v_motivo text := nullif(btrim(coalesce(p_payload->>'motivo', '')), '');
  v_country text;
  v_is_demo boolean;
  v_rma public.rma_solicitudes%ROWTYPE;
  v_origin public.documentos%ROWTYPE;
  v_source public.cpe%ROWTYPE;
  v_lineas jsonb := '[]'::jsonb;
  v_line_count integer := 0;
  v_active_item_count integer := 0;
  v_total numeric(14,2) := 0;
  v_canonical jsonb;
  v_fingerprint text;
  v_note_key text;
  v_operation public.rma_operaciones%ROWTYPE;
  v_note jsonb;
  v_note_document_id uuid;
  v_note_cpe_id uuid;
  v_event_id uuid;
  v_updated_count integer;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rma_actor_456(p_tenant_id, p_actor_id);
  IF p_rma_id IS NULL
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200
     OR v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT upper(nullif(btrim(ec.pais), '')), ec.is_demo
  INTO v_country, v_is_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR SHARE;
  IF v_country IS DISTINCT FROM 'CO' THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_COUNTRY_INVALID' USING ERRCODE = '23514';
  END IF;
  IF v_is_demo IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'RMA_DIAN_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW'
      USING ERRCODE = '23514',
        DETAIL = 'Una demo Colombia no puede fingir una aceptación DIAN real.';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:RMA:DIAN-91:%s', p_tenant_id, p_rma_id), 534
  ));

  -- Un replay exacto no vuelve a consultar ni a bloquear el estado mutable de
  -- la RMA. Sólo la identidad aportada por el cliente forma parte del replay;
  -- las líneas se derivaron en servidor y quedaron selladas en la operación.
  SELECT * INTO v_operation
  FROM public.rma_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo = 'EMITIR_NOTA_CREDITO'
    AND lower(o.idempotency_key) = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.rma_id IS DISTINCT FROM p_rma_id
       OR v_operation.actor_id IS DISTINCT FROM p_actor_id
       OR v_operation.payload->>'version' IS DISTINCT FROM '534'
       OR v_operation.payload->>'motivo' IS DISTINCT FROM v_motivo THEN
      RAISE EXCEPTION 'RMA_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operation.resultado || jsonb_build_object('idempotent', true);
  END IF;

  -- La aceptación toma origen/documento -> CPE origen -> RMA. La creación usa
  -- el mismo orden para no formar el ciclo RMA -> CPE / CPE -> RMA.
  SELECT * INTO v_rma
  FROM public.rma_solicitudes r
  WHERE r.id = p_rma_id AND r.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_REQUIRES_RECEIVED_STATE'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_origin
  FROM public.documentos d
  WHERE d.id = v_rma.documento_origen_id
    AND d.tenant_id = p_tenant_id
    AND d.tipo_documento = 'FACTURA'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RMA_DIAN_REQUIRES_ACCEPTED_REAL_INVOICE'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_source
  FROM public.cpe c
  WHERE c.id = v_rma.cpe_origen_id
    AND c.tenant_id = p_tenant_id
    AND c.documento_id = v_origin.id
    AND upper(coalesce(c.tipo_documento, '')) = '01'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RMA_DIAN_REQUIRES_ACCEPTED_REAL_INVOICE'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_rma
  FROM public.rma_solicitudes r
  WHERE r.id = p_rma_id AND r.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_rma.documento_origen_id IS DISTINCT FROM v_origin.id
     OR v_rma.cpe_origen_id IS DISTINCT FROM v_source.id THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_REQUIRES_RECEIVED_STATE'
      USING ERRCODE = '23514';
  END IF;

  IF upper(v_rma.estado::text) <> 'RECIBIDA' THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_REQUIRES_RECEIVED_STATE'
      USING ERRCODE = '23514';
  END IF;
  IF v_rma.nota_credito_documento_id IS NOT NULL
     OR v_rma.nota_credito_cpe_id IS NOT NULL THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_ALREADY_LINKED' USING ERRCODE = '23505';
  END IF;

  IF upper(v_source.estado::text) <> 'ACEPTADO'
     OR upper(coalesce(v_source.estado_sunat::text, '')) <> 'ACEPTADO'
     OR upper(coalesce(v_source.sunat_status::text, '')) <> 'ACCEPTED'
     OR v_source.simulated_origin IS DISTINCT FROM false
     OR upper(coalesce(v_source.issuer_snapshot->>'country_code', '')) <> 'CO'
     OR upper(coalesce(v_source.fiscal_authority_evidence->>'authority', '')) <> 'DIAN'
     OR upper(coalesce(v_source.fiscal_authority_evidence->>'status', '')) <> 'ACCEPTED'
     OR upper(coalesce(v_source.fiscal_authority_evidence->>'code_kind', '')) <> 'CUFE'
     OR upper(coalesce(v_source.fiscal_authority_evidence->>'unique_code', ''))
          !~ '^[0-9A-F]{96}$' THEN
    RAISE EXCEPTION 'RMA_DIAN_REQUIRES_ACCEPTED_REAL_INVOICE'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO v_active_item_count
  FROM public.rma_items ri
  WHERE ri.tenant_id = p_tenant_id
    AND ri.rma_id = p_rma_id
    AND lower(ri.estado::text) NOT IN ('rechazado', 'inactivo');

  IF v_active_item_count > 100 THEN
    RAISE EXCEPTION 'RMA_DIAN_LINE_LIMIT_EXCEEDED: max=100'
      USING ERRCODE = '22023';
  END IF;

  IF v_active_item_count < 1 OR EXISTS (
    SELECT 1
    FROM public.rma_items ri
    WHERE ri.tenant_id = p_tenant_id
      AND ri.rma_id = p_rma_id
      AND lower(ri.estado::text) NOT IN ('rechazado', 'inactivo')
      AND (
        ri.documento_detalle_id IS NULL
        OR coalesce(ri.cantidad_devuelta, 0) <= 0
        OR abs(round(coalesce(ri.cantidad_devuelta, 0), 6)
          - round(coalesce(ri.cantidad_autorizada, 0), 6)) > 0.000001
      )
  ) THEN
    RAISE EXCEPTION 'RMA_DIAN_LINES_NOT_FULLY_RECEIVED'
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'source_document_line_id', x.source_document_line_id,
      'cantidad', x.quantity,
      'base', x.base,
      'impuesto', x.tax,
      'total', x.total
    ) ORDER BY x.source_document_line_id::text), '[]'::jsonb),
    count(*)::integer,
    round(coalesce(sum(x.total), 0), 2)
  INTO v_lineas, v_line_count, v_total
  FROM (
    SELECT dd.id AS source_document_line_id,
      round(ri.cantidad_devuelta, 6) AS quantity,
      round(dd.valor_venta * ri.cantidad_devuelta / nullif(dd.cantidad, 0), 2) AS base,
      round((coalesce(dd.impuesto_igv, 0) + coalesce(dd.impuesto_isc, 0))
        * ri.cantidad_devuelta / nullif(dd.cantidad, 0), 2) AS tax,
      round((dd.valor_venta + coalesce(dd.impuesto_igv, 0)
        + coalesce(dd.impuesto_isc, 0)) * ri.cantidad_devuelta
        / nullif(dd.cantidad, 0), 2) AS total
    FROM public.rma_items ri
    JOIN public.documento_detalles dd
      ON dd.id = ri.documento_detalle_id
     AND dd.tenant_id = ri.tenant_id
     AND dd.documento_id = v_rma.documento_origen_id
    WHERE ri.tenant_id = p_tenant_id
      AND ri.rma_id = p_rma_id
      AND lower(ri.estado::text) NOT IN ('rechazado', 'inactivo')
      AND dd.cantidad > 0
      AND dd.valor_venta > 0
  ) x;
  IF v_line_count <> v_active_item_count OR v_total <= 0 OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_lineas) AS x(
      source_document_line_id uuid, cantidad numeric,
      base numeric, impuesto numeric, total numeric
    )
    WHERE x.cantidad <= 0 OR x.base <= 0 OR x.impuesto < 0 OR x.total <= 0
       OR abs(round(x.base + x.impuesto, 2) - x.total) > 0.01
  ) THEN
    RAISE EXCEPTION 'RMA_DIAN_LINE_ALLOCATION_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_canonical := jsonb_build_object(
    'version', 534,
    'rma_id', p_rma_id,
    'documento_origen_id', v_rma.documento_origen_id,
    'cpe_origen_id', v_rma.cpe_origen_id,
    'motivo', v_motivo,
    'lineas', v_lineas,
    'monto_total', v_total
  );
  v_fingerprint := app.rma_fingerprint_456(v_canonical);
  -- La clave externa pertenece al contrato RMA. El writer 529 usa un espacio
  -- interno para que una nota comercial con la misma clave no pueda ser
  -- adoptada accidentalmente por esta devolución.
  v_note_key := 'rma534:' || app.rma_fingerprint_456(jsonb_build_object(
    'tenant_id', p_tenant_id, 'rma_id', p_rma_id,
    'external_idempotency_key', v_key
  ));

  v_note := app.crear_nota_referenciada_co_529(
    p_tenant_id, p_actor_id, v_rma.documento_origen_id,
    '91', '1', v_motivo, v_total, v_note_key, v_lineas, false
  );
  v_note_document_id := nullif(v_note->>'documento_id', '')::uuid;
  v_note_cpe_id := nullif(v_note->>'cpe_id', '')::uuid;
  IF v_note_document_id IS NULL OR v_note_cpe_id IS NULL
     OR v_note->>'financial_effect_status' IS DISTINCT FROM
          'PENDING_FISCAL_ACCEPTANCE' THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_CREATION_INCOMPLETE'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.documentos d
  SET metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
        'rma_id', p_rma_id,
        'rma_dian_contract_version', 534,
        'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE'
      ),
      updated_at = now()
  WHERE d.id = v_note_document_id AND d.tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_DOCUMENT_CORRELATION_MISSING'
      USING ERRCODE = '40001';
  END IF;
  UPDATE public.cpe c
  SET metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'rma_id', p_rma_id,
        'rma_dian_contract_version', 534,
        'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE'
      ),
      updated_at = now()
  WHERE c.id = v_note_cpe_id AND c.tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_CPE_CORRELATION_MISSING'
      USING ERRCODE = '40001';
  END IF;
  UPDATE public.notas_referenciadas_operaciones o
  SET payload = coalesce(o.payload, '{}'::jsonb) || jsonb_build_object(
        'rma_id', p_rma_id,
        'rma_link_status', 'PENDING',
        'rma_contract_version', 534
      ),
      resultado = coalesce(o.resultado, '{}'::jsonb) || jsonb_build_object(
        'rma_id', p_rma_id,
        'estado_rma', 'RECIBIDA',
        'rma_link_status', 'PENDING'
      )
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo_operacion = 'CREAR'
    AND lower(o.idempotency_key) = v_note_key
    AND o.nota_documento_id = v_note_document_id
    AND o.nota_cpe_id = v_note_cpe_id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_OPERATION_CORRELATION_MISSING'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.rma_solicitudes r
  SET nota_credito_documento_id = v_note_document_id,
      nota_credito_cpe_id = v_note_cpe_id,
      metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
        'dian_note_status', 'PENDIENTE_ACEPTACION',
        'dian_note_contract_version', 534,
        'dian_note_created_at', clock_timestamp(),
        'dian_note_fingerprint', v_fingerprint
      ),
      updated_at = now()
  WHERE r.id = p_rma_id AND r.tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'RMA_DIAN_NOTE_RMA_CORRELATION_MISSING'
      USING ERRCODE = '40001';
  END IF;

  v_event_id := app.rma_insert_event_456(
    p_tenant_id, p_rma_id, p_actor_id,
    'NOTA_DIAN_PENDIENTE',
    'Nota Crédito DIAN 91 creada; efecto financiero pendiente de aceptación',
    jsonb_build_object(
      'documento_id', v_note_document_id,
      'cpe_id', v_note_cpe_id,
      'monto', v_total,
      'line_count', v_line_count,
      'fingerprint', v_fingerprint,
      'idempotency_key', v_key
    )
  );

  v_result := v_note || jsonb_build_object(
    'success', true,
    'rma_id', p_rma_id,
    'estado_rma', 'RECIBIDA',
    'tipo_documento', '91',
    'financial_effect_status', 'PENDING_FISCAL_ACCEPTANCE',
    'idempotent', false
  );
  INSERT INTO public.rma_operaciones (
    tenant_id, rma_id, tipo, idempotency_key, fingerprint,
    actor_id, payload, resultado, event_id
  ) VALUES (
    p_tenant_id, p_rma_id, 'EMITIR_NOTA_CREDITO', v_key,
    v_fingerprint, p_actor_id, v_canonical, v_result, v_event_id
  );
  RETURN v_result;
END;
$function$;

-- Mantiene la única puerta pública RMA. PE conserva el writer 456 privado,
-- Argentina sigue bloqueada hasta CAE y Colombia real entra al contrato 534.
CREATE OR REPLACE FUNCTION public.emitir_nota_credito_rma_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_rma_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_country text;
  v_is_demo boolean;
BEGIN
  SELECT upper(nullif(btrim(ec.pais), '')), ec.is_demo
  INTO v_country, v_is_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR SHARE;

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'RMA_FISCAL_COUNTRY_UNAVAILABLE'
      USING ERRCODE = '23514';
  END IF;
  IF v_country = 'CO' THEN
    IF v_is_demo IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'RMA_DIAN_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW'
        USING ERRCODE = '23514',
          DETAIL = 'Una demo Colombia no puede fingir una aceptación DIAN real.';
    END IF;
    RETURN app.crear_nota_credito_rma_dian_534(
      p_tenant_id, p_actor_id, p_rma_id, p_payload, p_idempotency_key
    );
  END IF;
  IF v_country = 'AR' THEN
    RAISE EXCEPTION 'RMA_ARCA_CREDIT_NOTE_REQUIRES_REFERENCED_NOTE_FLOW'
      USING ERRCODE = '23514',
        DETAIL = 'Use la nota ARCA referenciada; el efecto financiero espera CAE.';
  END IF;
  IF v_country <> 'PE' THEN
    RAISE EXCEPTION 'RMA_FISCAL_COUNTRY_UNSUPPORTED:%', v_country
      USING ERRCODE = '23514';
  END IF;
  RETURN public.emitir_nota_credito_rma_legacy_532(
    p_tenant_id, p_actor_id, p_rma_id, p_payload, p_idempotency_key
  );
END;
$function$;

-- Amplía el efecto 529 sin alterar el núcleo financiero probado: primero se
-- materializa una sola vez el efecto 494/529 y después, dentro de la misma
-- transacción, se correlacionan RMA, pago, saldo y outbox.
CREATE OR REPLACE FUNCTION app.aplicar_efecto_nota_dian_529(
  p_tenant_id uuid,
  p_cpe_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_type text;
  v_mapped_type text;
  v_document_id uuid;
  v_cpe_source_document_id uuid;
  v_note_source_document_id uuid;
  v_result jsonb;
  v_note_metadata jsonb;
  v_rma public.rma_solicitudes%ROWTYPE;
  v_actor uuid;
  v_fingerprint text;
  v_updated_count integer;
BEGIN
  SELECT upper(c.tipo_documento), c.documento_id, c.documento_referencia_id
  INTO v_type, v_document_id, v_cpe_source_document_id
  FROM public.cpe c
  WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_type NOT IN ('91', '92') THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_ACCEPTANCE_TYPE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_mapped_type := CASE v_type WHEN '91' THEN '07' ELSE '08' END;
  UPDATE public.cpe
  SET tipo_documento = v_mapped_type
  WHERE id = p_cpe_id AND tenant_id = p_tenant_id;

  v_result := app.aplicar_efecto_nota_aceptada_494(p_tenant_id, p_cpe_id);

  UPDATE public.cpe
  SET tipo_documento = v_type,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_contract_version', 529,
        'financial_effect_document_type', v_type
      ),
      updated_at = now()
  WHERE id = p_cpe_id AND tenant_id = p_tenant_id;
  UPDATE public.documentos
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_contract_version', 529,
        'financial_effect_document_type', v_type
      ),
      updated_at = now()
  WHERE id = v_document_id AND tenant_id = p_tenant_id
  RETURNING metadata, documento_origen_id
  INTO v_note_metadata, v_note_source_document_id;
  IF NOT FOUND
     OR v_cpe_source_document_id IS NULL
     OR v_note_source_document_id IS DISTINCT FROM v_cpe_source_document_id THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_SOURCE_CORRELATION_INVALID'
      USING ERRCODE = '23514';
  END IF;
  UPDATE public.outbox_events
  SET payload = jsonb_set(payload, '{tipoDocumento}', to_jsonb(v_type), true),
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND aggregate_id = v_document_id::text
    AND event_type = CASE WHEN v_type = '91'
      THEN 'nota_credito.emitida' ELSE 'nota_debito.emitida' END;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'DIAN_REFERENCED_NOTE_OUTBOX_CORRELATION_MISSING'
      USING ERRCODE = '40001';
  END IF;

  IF v_type = '91' AND nullif(v_note_metadata->>'rma_id', '') IS NOT NULL THEN
    BEGIN
      SELECT * INTO v_rma
      FROM public.rma_solicitudes r
      WHERE r.id = (v_note_metadata->>'rma_id')::uuid
        AND r.tenant_id = p_tenant_id
        AND r.nota_credito_documento_id = v_document_id
        AND r.nota_credito_cpe_id = p_cpe_id
        AND r.documento_origen_id = v_cpe_source_document_id
        AND EXISTS (
          SELECT 1
          FROM public.cpe source_cpe
          WHERE source_cpe.id = r.cpe_origen_id
            AND source_cpe.tenant_id = r.tenant_id
            AND source_cpe.documento_id = r.documento_origen_id
            AND upper(coalesce(source_cpe.tipo_documento, '')) = '01'
        )
      FOR UPDATE;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_CORRELATION_INVALID'
        USING ERRCODE = '23514';
    END;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_CORRELATION_MISSING'
        USING ERRCODE = '23514';
    END IF;
    IF upper(v_rma.estado::text) = 'CERRADA' THEN
      RETURN v_result || jsonb_build_object(
        'rma_id', v_rma.id, 'estado_rma', 'CERRADA', 'idempotent', true
      );
    END IF;
    IF upper(v_rma.estado::text) <> 'RECIBIDA' THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_STATE_INVALID'
        USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(o.actor_id, c.created_by, v_rma.recibido_por, v_rma.created_by)
    INTO v_actor
    FROM public.cpe c
    LEFT JOIN LATERAL (
      SELECT op.actor_id
      FROM public.cpe_operaciones op
      WHERE op.tenant_id = p_tenant_id
        AND op.cpe_id = p_cpe_id
        AND op.result_kind = 'ACCEPTED'
      ORDER BY op.completed_at DESC NULLS LAST, op.created_at DESC
      LIMIT 1
    ) o ON true
    WHERE c.id = p_cpe_id AND c.tenant_id = p_tenant_id;
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_ACTOR_INVALID'
        USING ERRCODE = '42501';
    END IF;
    v_fingerprint := app.rma_fingerprint_456(jsonb_build_object(
      'version', 534, 'rma_id', v_rma.id, 'cpe_id', p_cpe_id,
      'documento_id', v_document_id, 'financial_result', v_result
    ));

    UPDATE public.cxc_pagos p
    SET metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
          'rma_id', v_rma.id,
          'rma_dian_contract_version', 534
        ),
        updated_at = now()
    WHERE p.tenant_id = p_tenant_id
      AND p.documento_id = v_document_id
      AND p.metadata->>'nota_credito_cpe_id' = p_cpe_id::text
      AND p.metadata->>'source_document_id' = v_rma.documento_origen_id::text;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> (CASE
         WHEN coalesce((v_result->>'cxc_reduction')::numeric, 0) > 0 THEN 1
         ELSE 0 END) THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_PAYMENT_CORRELATION_MISSING'
        USING ERRCODE = '40001';
    END IF;
    UPDATE public.saldos_favor_clientes s
    SET rma_id = v_rma.id,
        metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
          'rma_dian_contract_version', 534
        ),
        updated_at = now()
    WHERE s.tenant_id = p_tenant_id
      AND s.nota_credito_documento_id = v_document_id
      AND s.nota_credito_cpe_id = p_cpe_id
      AND s.documento_origen_id = v_rma.documento_origen_id
      AND s.rma_id IS NULL;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> (CASE
         WHEN nullif(v_result->>'saldo_favor_id', '') IS NOT NULL THEN 1
         ELSE 0 END) THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_BALANCE_CORRELATION_MISSING'
        USING ERRCODE = '40001';
    END IF;
    UPDATE public.saldos_favor_movimientos m
    SET metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
          'rma_id', v_rma.id,
          'rma_dian_contract_version', 534
        )
    WHERE m.tenant_id = p_tenant_id
      AND m.metadata->>'nota_credito_cpe_id' = p_cpe_id::text
      AND m.metadata->>'source_document_id' = v_rma.documento_origen_id::text;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> (CASE
         WHEN nullif(v_result->>'saldo_favor_id', '') IS NOT NULL THEN 1
         ELSE 0 END) THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_BALANCE_MOVEMENT_CORRELATION_MISSING'
        USING ERRCODE = '40001';
    END IF;
    UPDATE public.outbox_events o
    SET payload = jsonb_set(o.payload, '{rmaId}', to_jsonb(v_rma.id), true),
        updated_at = now()
    WHERE o.tenant_id = p_tenant_id
      AND o.aggregate_id = v_document_id::text
      AND o.event_type = 'nota_credito.emitida'
      AND o.payload->>'documentoOrigenId' = v_rma.documento_origen_id::text
      AND o.payload->>'cpeOrigenId' = v_rma.cpe_origen_id::text;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_OUTBOX_CORRELATION_MISSING'
        USING ERRCODE = '40001';
    END IF;

    IF (SELECT count(*)
        FROM public.notas_referenciadas_operaciones o
        WHERE o.tenant_id = p_tenant_id
          AND o.nota_cpe_id = p_cpe_id
          AND o.documento_origen_id = v_rma.documento_origen_id
          AND o.tipo_operacion IN ('CREAR', 'APLICAR_ACEPTACION')) <> 2
       OR (SELECT count(*)
           FROM public.rma_operaciones o
           WHERE o.tenant_id = p_tenant_id
             AND o.rma_id = v_rma.id
             AND o.tipo = 'EMITIR_NOTA_CREDITO'
             AND o.resultado->>'cpe_id' = p_cpe_id::text) <> 1 THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_OPERATION_CORRELATION_MISSING'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.rma_solicitudes r
    SET estado = 'CERRADA',
        metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
          'dian_note_status', 'ACEPTADA',
          'dian_note_contract_version', 534,
          'dian_note_accepted_at', clock_timestamp(),
          'dian_note_acceptance_fingerprint', v_fingerprint
        ),
        updated_at = now()
    WHERE r.id = v_rma.id AND r.tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_RMA_CORRELATION_MISSING'
        USING ERRCODE = '40001';
    END IF;

    PERFORM app.rma_insert_event_456(
      p_tenant_id, v_rma.id, v_actor,
      'NOTA_DIAN_ACEPTADA',
      'Nota Crédito DIAN 91 aceptada; efecto financiero aplicado y RMA cerrada',
      jsonb_build_object(
        'documento_id', v_document_id, 'cpe_id', p_cpe_id,
        'cxc_reduction', v_result->'cxc_reduction',
        'saldo_favor_id', v_result->'saldo_favor_id',
        'fingerprint', v_fingerprint
      )
    );
    UPDATE public.notas_referenciadas_operaciones o
    SET payload = coalesce(o.payload, '{}'::jsonb) || jsonb_build_object(
          'rma_id', v_rma.id,
          'rma_link_status', CASE WHEN o.tipo_operacion = 'CREAR'
            THEN 'ACCEPTED' ELSE coalesce(o.payload->>'rma_link_status', 'ACCEPTED') END,
          'rma_contract_version', 534
        ),
        resultado = coalesce(o.resultado, '{}'::jsonb) || jsonb_build_object(
          'rma_id', v_rma.id, 'estado_rma', 'CERRADA',
          'rma_link_status', 'ACCEPTED'
        )
    WHERE o.tenant_id = p_tenant_id
      AND o.nota_cpe_id = p_cpe_id
      AND o.documento_origen_id = v_rma.documento_origen_id
      AND o.tipo_operacion IN ('CREAR', 'APLICAR_ACEPTACION');
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 2 THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_NOTE_OPERATION_CORRELATION_MISSING'
        USING ERRCODE = '40001';
    END IF;
    UPDATE public.rma_operaciones o
    SET resultado = coalesce(o.resultado, '{}'::jsonb) || jsonb_build_object(
          'estado_rma', 'CERRADA',
          'financial_effect_status', 'APPLIED_ON_FISCAL_ACCEPTANCE',
          'rma_link_status', 'ACCEPTED'
        ),
        updated_at = now()
    WHERE o.tenant_id = p_tenant_id
      AND o.rma_id = v_rma.id
      AND o.tipo = 'EMITIR_NOTA_CREDITO'
      AND o.resultado->>'cpe_id' = p_cpe_id::text;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'RMA_DIAN_ACCEPTANCE_RMA_OPERATION_CORRELATION_MISSING'
        USING ERRCODE = '40001';
    END IF;
    v_result := v_result || jsonb_build_object(
      'rma_id', v_rma.id, 'estado_rma', 'CERRADA'
    );
  END IF;

  RETURN v_result || jsonb_build_object('tipo_documento', v_type);
END;
$function$;

-- Un rechazo antes del efecto libera la RMA para corregir y reintentar, pero
-- conserva la relación histórica en CPE/documento/eventos. Después del efecto
-- el rechazo continúa prohibido por el contrato 494/529.
CREATE OR REPLACE FUNCTION app.enforce_nota_fiscal_effect_494()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_rma public.rma_solicitudes%ROWTYPE;
  v_actor uuid;
  v_fingerprint text;
  v_updated_count integer;
BEGIN
  IF upper(coalesce(NEW.tipo_documento, '')) NOT IN ('07', '08', '91', '92') THEN
    RETURN NEW;
  END IF;
  IF upper(NEW.tipo_documento) IN ('91', '92')
     AND NOT EXISTS (
       SELECT 1
       FROM public.notas_referenciadas_operaciones o
       WHERE o.tenant_id = NEW.tenant_id
         AND o.nota_cpe_id = NEW.id
         AND o.tipo_operacion = 'CREAR'
         AND o.payload->>'version' = '529'
         AND coalesce(
           NEW.metadata->>'financial_effect_contract_version', ''
         ) = '529'
      ) THEN
    RETURN NEW;
  END IF;

  IF upper(NEW.estado::text) = 'ACEPTADO'
     AND upper(coalesce(NEW.sunat_status::text, '')) = 'ACCEPTED'
     AND (
       upper(coalesce(OLD.estado::text, '')) <> 'ACEPTADO'
       OR upper(coalesce(OLD.sunat_status::text, '')) <> 'ACCEPTED'
     ) THEN
    IF upper(NEW.tipo_documento) IN ('91', '92') THEN
      PERFORM app.aplicar_efecto_nota_dian_529(NEW.tenant_id, NEW.id);
    ELSE
      PERFORM app.aplicar_efecto_nota_aceptada_494(NEW.tenant_id, NEW.id);
    END IF;
  ELSIF upper(NEW.estado::text) = 'RECHAZADO'
     AND upper(coalesce(OLD.estado::text, '')) <> 'RECHAZADO' THEN
    IF EXISTS (
      SELECT 1 FROM public.notas_referenciadas_operaciones o
      WHERE o.tenant_id = NEW.tenant_id
        AND o.nota_cpe_id = NEW.id
        AND o.tipo_operacion = 'APLICAR_ACEPTACION'
    ) OR EXISTS (
      SELECT 1 FROM public.outbox_events o
      WHERE o.tenant_id = NEW.tenant_id
        AND o.aggregate_id = NEW.documento_id::text
        AND o.event_type IN ('nota_credito.emitida', 'nota_debito.emitida')
    ) THEN
      RAISE EXCEPTION 'REFERENCED_NOTE_REJECTION_HAS_FINANCIAL_EFFECT'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.cpe SET
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'REJECTED_NO_FINANCIAL_EFFECT',
        'financial_effect_contract_version', 529
      ), updated_at = now()
    WHERE id = NEW.id AND tenant_id = NEW.tenant_id;
    UPDATE public.documentos SET
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'financial_effect_status', 'REJECTED_NO_FINANCIAL_EFFECT',
        'financial_effect_contract_version', 529
      ), updated_at = now()
    WHERE id = NEW.documento_id AND tenant_id = NEW.tenant_id;

    IF upper(NEW.tipo_documento) = '91'
       AND nullif(NEW.metadata->>'rma_id', '') IS NOT NULL THEN
      BEGIN
        SELECT * INTO v_rma
        FROM public.rma_solicitudes r
        WHERE r.id = (NEW.metadata->>'rma_id')::uuid
          AND r.tenant_id = NEW.tenant_id
          AND r.nota_credito_documento_id = NEW.documento_id
          AND r.nota_credito_cpe_id = NEW.id
          AND r.documento_origen_id = NEW.documento_referencia_id
          AND EXISTS (
            SELECT 1
            FROM public.documentos note_document
            WHERE note_document.id = NEW.documento_id
              AND note_document.tenant_id = NEW.tenant_id
              AND note_document.documento_origen_id = r.documento_origen_id
          )
          AND EXISTS (
            SELECT 1
            FROM public.cpe source_cpe
            WHERE source_cpe.id = r.cpe_origen_id
              AND source_cpe.tenant_id = r.tenant_id
              AND source_cpe.documento_id = r.documento_origen_id
              AND upper(coalesce(source_cpe.tipo_documento, '')) = '01'
          )
        FOR UPDATE;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'RMA_DIAN_REJECTION_CORRELATION_INVALID'
          USING ERRCODE = '23514';
      END;
      IF NOT FOUND OR upper(v_rma.estado::text) <> 'RECIBIDA' THEN
        RAISE EXCEPTION 'RMA_DIAN_REJECTION_CORRELATION_MISSING'
          USING ERRCODE = '23514';
      END IF;
      v_actor := coalesce(NEW.created_by, v_rma.recibido_por, v_rma.created_by);
      IF v_actor IS NULL THEN
        RAISE EXCEPTION 'RMA_DIAN_REJECTION_ACTOR_INVALID'
          USING ERRCODE = '42501';
      END IF;
      v_fingerprint := app.rma_fingerprint_456(jsonb_build_object(
        'version', 534, 'rma_id', v_rma.id,
        'rejected_cpe_id', NEW.id, 'rejected_documento_id', NEW.documento_id
      ));
      UPDATE public.rma_solicitudes r
      SET nota_credito_documento_id = NULL,
          nota_credito_cpe_id = NULL,
          metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
            'dian_note_status', 'RECHAZADA',
            'dian_note_contract_version', 534,
            'last_rejected_dian_note_document_id', NEW.documento_id,
            'last_rejected_dian_note_cpe_id', NEW.id,
            'dian_note_rejected_at', clock_timestamp()
          ),
          updated_at = now()
      WHERE r.id = v_rma.id AND r.tenant_id = NEW.tenant_id;
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      IF v_updated_count <> 1 THEN
        RAISE EXCEPTION 'RMA_DIAN_REJECTION_RMA_CORRELATION_MISSING'
          USING ERRCODE = '40001';
      END IF;
      UPDATE public.notas_referenciadas_operaciones o
      SET payload = coalesce(o.payload, '{}'::jsonb) || jsonb_build_object(
            'rma_id', v_rma.id,
            'rma_link_status', 'REJECTED',
            'rma_contract_version', 534
          ),
          resultado = coalesce(o.resultado, '{}'::jsonb) || jsonb_build_object(
            'rma_id', v_rma.id,
            'estado_rma', 'RECIBIDA',
            'rma_link_status', 'REJECTED',
            'financial_effect_status', 'REJECTED_NO_FINANCIAL_EFFECT'
          )
      WHERE o.tenant_id = NEW.tenant_id
        AND o.nota_cpe_id = NEW.id
        AND o.tipo_operacion = 'CREAR';
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      IF v_updated_count <> 1 THEN
        RAISE EXCEPTION 'RMA_DIAN_REJECTION_NOTE_OPERATION_CORRELATION_MISSING'
          USING ERRCODE = '40001';
      END IF;
      UPDATE public.rma_operaciones o
      SET resultado = coalesce(o.resultado, '{}'::jsonb) || jsonb_build_object(
            'estado_rma', 'RECIBIDA',
            'financial_effect_status', 'REJECTED_NO_FINANCIAL_EFFECT',
            'rma_link_status', 'REJECTED'
          ),
          updated_at = now()
      WHERE o.tenant_id = NEW.tenant_id
        AND o.rma_id = v_rma.id
        AND o.tipo = 'EMITIR_NOTA_CREDITO'
        AND o.resultado->>'cpe_id' = NEW.id::text;
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      IF v_updated_count <> 1 THEN
        RAISE EXCEPTION 'RMA_DIAN_REJECTION_RMA_OPERATION_CORRELATION_MISSING'
          USING ERRCODE = '40001';
      END IF;
      PERFORM app.rma_insert_event_456(
        NEW.tenant_id, v_rma.id, v_actor,
        'NOTA_DIAN_RECHAZADA',
        'Nota Crédito DIAN 91 rechazada sin efecto financiero; RMA habilitada para corrección',
        jsonb_build_object(
          'documento_id', NEW.documento_id, 'cpe_id', NEW.id,
          'fingerprint', v_fingerprint
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_rma_tx(uuid,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_rma_tx(uuid,uuid,jsonb,text)
  TO service_role;
REVOKE ALL ON FUNCTION app.crear_nota_credito_rma_dian_534(
  uuid,uuid,uuid,jsonb,text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.emitir_nota_credito_rma_tx(
  uuid,uuid,uuid,jsonb,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_nota_credito_rma_tx(
  uuid,uuid,uuid,jsonb,text
) TO service_role;
REVOKE ALL ON FUNCTION app.aplicar_efecto_nota_dian_529(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.enforce_nota_fiscal_effect_494()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.crear_rma_tx(uuid,uuid,jsonb,text)
IS 'Crea RMA con contrato 456 y exige en Colombia real una factura 01 aceptada por DIAN; la demo sólo conserva el flujo físico.';
COMMENT ON FUNCTION app.crear_nota_credito_rma_dian_534(uuid,uuid,uuid,jsonb,text)
IS 'Crea y enlaza una Nota Crédito DIAN 91 desde cantidades RMA recibidas calculadas en servidor, sin efecto financiero antes de aceptación.';
COMMENT ON FUNCTION public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)
IS 'Puerta RMA por jurisdicción: PE usa 456, CO real usa DIAN 91 atómica 534 y AR exige su flujo ARCA.';
COMMENT ON FUNCTION app.aplicar_efecto_nota_dian_529(uuid,uuid)
IS 'Aplica una sola vez el efecto 529 y cierra atómicamente la RMA DIAN 91 correlacionada, asociando pago, saldo y outbox.';

COMMIT;

NOTIFY pgrst, 'reload schema';
