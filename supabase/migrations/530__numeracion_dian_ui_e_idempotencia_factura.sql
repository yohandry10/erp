-- ============================================================================
-- 530__numeracion_dian_ui_e_idempotencia_factura.sql
-- Numeracion DIAN de factura para la UI y cierre de la huella de la emision 443.
--
-- La UI no elige prefijo ni consecutivo. Ambos salen de la resolucion vigente
-- del contribuyente y se reservan, junto con la intencion, en una transaccion.
-- Ademas, un retry de emitir_factura_cliente_tx ya no puede cambiar silenciosa-
-- mente cliente, fechas, pago o la fotografia tributaria del adquirente.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;

DO $requirements$
BEGIN
  IF to_regclass('public.empresa_config') IS NULL
     OR to_regclass('public.documento_series') IS NULL
     OR to_regclass('public.cpe') IS NULL
     OR to_regprocedure('app.assert_actor_461(uuid,uuid)') IS NULL
     OR to_regprocedure(
       'app.emitir_factura_cliente_tx(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)'
     ) IS NULL
     OR to_regprocedure(
       'app.pos_registrar_venta_atomic_tx_518(uuid,uuid,uuid,text,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'app.pos_canjear_ticket_tx_471(uuid,uuid,uuid,text,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'public.finalizar_cpe_pos_tx(uuid,uuid,uuid,jsonb,text)'
     ) IS NULL
     OR to_regprocedure('app.hoy_tenant(uuid)') IS NULL
     OR to_regprocedure('app.apply_tenant_policy(text,text)') IS NULL THEN
    RAISE EXCEPTION
      '530 requiere empresa_config, documento_series, CPE y los contratos 443/461';
  END IF;
END
$requirements$;

-- ---------------------------------------------------------------------------
-- Evidencia durable de cada numero entregado a una intencion de la UI.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dian_numeracion_reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  documento_serie_id uuid NOT NULL
    REFERENCES public.documento_series(id) ON DELETE RESTRICT,
  tipo_documento text NOT NULL,
  fecha_emision date NOT NULL,
  -- Hora fiscal Colombia sellada una sola vez al crear la reserva. No forma
  -- parte de la huella economica ni se recalcula en reintentos.
  hora_emision time(0) without time zone NOT NULL,
  resolucion_numero text NOT NULL,
  prefijo text NOT NULL,
  rango_desde integer NOT NULL,
  rango_hasta integer NOT NULL,
  vigencia_desde date NOT NULL,
  vigencia_hasta date NOT NULL,
  correlativo integer NOT NULL,
  numero_completo text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  -- Dueño comercial opcional de la reserva. Las emisiones genéricas y POS
  -- conservan NULL; una factura nacida de pedido queda ligada a ese pedido
  -- desde la reserva del correlativo, no recién al insertar el documento.
  pedido_id uuid REFERENCES public.pedidos_venta(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'RESERVADA',
  consumida_at timestamptz,
  anulada_at timestamptz,
  cpe_id uuid REFERENCES public.cpe(id) ON DELETE RESTRICT,
  documento_id uuid REFERENCES public.documentos(id) ON DELETE RESTRICT,
  venta_pos_id uuid REFERENCES public.ventas_pos(id) ON DELETE RESTRICT,
  motivo_anulacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_dian_numeracion_tipo_530
    CHECK (tipo_documento = '01'),
  CONSTRAINT ck_dian_numeracion_prefijo_530
    CHECK (prefijo ~ '^[A-Z0-9]{0,4}$'),
  CONSTRAINT ck_dian_numeracion_rango_530
    CHECK (
      rango_desde >= 1
      AND rango_hasta >= rango_desde
      AND correlativo BETWEEN rango_desde AND rango_hasta
    ),
  CONSTRAINT ck_dian_numeracion_vigencia_530
    CHECK (
      vigencia_hasta >= vigencia_desde
      AND fecha_emision BETWEEN vigencia_desde AND vigencia_hasta
    ),
  CONSTRAINT ck_dian_numeracion_numero_530
    CHECK (numero_completo = prefijo || correlativo::text),
  CONSTRAINT ck_dian_numeracion_key_530
    CHECK (
      idempotency_key = btrim(idempotency_key)
      AND length(idempotency_key) BETWEEN 8 AND 255
    ),
  CONSTRAINT ck_dian_numeracion_fingerprint_530
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_dian_numeracion_estado_530
    CHECK (
      (
        estado = 'RESERVADA'
        AND consumida_at IS NULL AND anulada_at IS NULL
        AND cpe_id IS NULL AND documento_id IS NULL AND venta_pos_id IS NULL
        AND motivo_anulacion IS NULL
      )
      OR (
        estado = 'CONSUMIDA'
        AND consumida_at IS NOT NULL AND anulada_at IS NULL
        AND documento_id IS NOT NULL
        AND (cpe_id IS NOT NULL OR venta_pos_id IS NOT NULL)
        AND motivo_anulacion IS NULL
      )
      OR (
        estado = 'ANULADA'
        AND consumida_at IS NULL AND anulada_at IS NOT NULL
        AND cpe_id IS NULL AND documento_id IS NULL AND venta_pos_id IS NULL
        AND length(btrim(coalesce(motivo_anulacion, ''))) BETWEEN 3 AND 500
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dian_numeracion_intent_530
  ON public.dian_numeracion_reservas (tenant_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dian_numeracion_fiscal_530
  ON public.dian_numeracion_reservas (tenant_id, prefijo, correlativo);

CREATE INDEX IF NOT EXISTS idx_dian_numeracion_serie_530
  ON public.dian_numeracion_reservas
    (tenant_id, documento_serie_id, correlativo DESC);

CREATE INDEX IF NOT EXISTS idx_dian_numeracion_estado_530
  ON public.dian_numeracion_reservas (tenant_id, estado, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dian_numeracion_cpe_530
  ON public.dian_numeracion_reservas (tenant_id, cpe_id)
  WHERE cpe_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_dian_numeracion_venta_pos_530
  ON public.dian_numeracion_reservas (tenant_id, venta_pos_id)
  WHERE venta_pos_id IS NOT NULL;

SELECT app.apply_tenant_policy('public', 'dian_numeracion_reservas');
ALTER TABLE public.dian_numeracion_reservas FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Huella semantica complementaria de la RPC 443.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_invoice_intent_semantics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  -- La intención fiscal de un pedido no es intercambiable con una emisión
  -- genérica aunque cliente, fechas e importes coincidan. Se conserva dentro
  -- de la huella y en una columna explícita para poder auditar el vínculo.
  pedido_id uuid,
  cliente_id uuid,
  fecha_emision date NOT NULL,
  fecha_vencimiento date NOT NULL,
  condicion_pago text NOT NULL,
  medio_pago text,
  plazo_pago_dias integer NOT NULL,
  dian_receptor_tax_profile jsonb,
  cpe_id uuid REFERENCES public.cpe(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_customer_invoice_semantic_key_530
    CHECK (
      idempotency_key = btrim(idempotency_key)
      AND length(idempotency_key) BETWEEN 8 AND 255
    ),
  CONSTRAINT ck_customer_invoice_semantic_fingerprint_530
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_customer_invoice_semantic_dates_530
    CHECK (
      fecha_vencimiento >= fecha_emision
      AND plazo_pago_dias = fecha_vencimiento - fecha_emision
    ),
  CONSTRAINT ck_customer_invoice_semantic_payment_530
    CHECK (
      (
        condicion_pago = 'CONTADO'
        AND plazo_pago_dias = 0
        AND fecha_vencimiento = fecha_emision
      )
      OR (
        condicion_pago = 'CREDITO'
        AND plazo_pago_dias > 0
        AND fecha_vencimiento > fecha_emision
      )
    ),
  CONSTRAINT ck_customer_invoice_semantic_method_530
    CHECK (medio_pago IS NULL OR btrim(medio_pago) <> ''),
  CONSTRAINT ck_customer_invoice_semantic_profile_530
    CHECK (
      dian_receptor_tax_profile IS NULL
      OR jsonb_typeof(dian_receptor_tax_profile) = 'object'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_invoice_semantic_intent_530
  ON public.customer_invoice_intent_semantics (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_customer_invoice_semantic_cpe_530
  ON public.customer_invoice_intent_semantics (tenant_id, cpe_id)
  WHERE cpe_id IS NOT NULL;

SELECT app.apply_tenant_policy('public', 'customer_invoice_intent_semantics');
ALTER TABLE public.customer_invoice_intent_semantics FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dian_numeracion_reservas,
  public.customer_invoice_intent_semantics
  FROM PUBLIC, anon, authenticated, service_role;

-- El namespace estable de facturación de pedidos es predecible por diseño.
-- Por eso no basta incluir pedido_id en una huella: una emisión genérica podría
-- ocupar primero la key y convertir el conflicto posterior en una denegación de
-- servicio. Esta guarda exige el dueño exacto y el lifecycle PREPARED que crea
-- 531 antes de reservar número o persistir semántica/CPE.
CREATE OR REPLACE FUNCTION app.assert_order_invoice_key_owner_530(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_pedido_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_prefix constant text := 'ventas.cpe.factura:';
  v_expected_key text;
  v_lifecycle jsonb;
BEGIN
  IF left(v_key, length(v_prefix)) IS DISTINCT FROM v_prefix THEN
    RETURN;
  END IF;

  IF p_tenant_id IS NULL OR p_pedido_id IS NULL THEN
    RAISE EXCEPTION 'PEDIDO_INVOICE_IDEMPOTENCY_OWNER_REQUIRED'
      USING ERRCODE = '23514';
  END IF;
  v_expected_key := v_prefix || p_tenant_id::text || ':' || p_pedido_id::text;
  IF v_key IS DISTINCT FROM v_expected_key THEN
    RAISE EXCEPTION 'PEDIDO_INVOICE_IDEMPOTENCY_OWNER_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(p.metadata, '{}'::jsonb)->'dian_fiscal_snapshot_lifecycle'
    INTO v_lifecycle
  FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id
  FOR SHARE;

  IF NOT FOUND
     OR jsonb_typeof(v_lifecycle) IS DISTINCT FROM 'object'
     OR btrim(coalesce(v_lifecycle->>'idempotency_key', '')) IS DISTINCT FROM v_key
     OR coalesce(v_lifecycle->>'state', '') NOT IN ('PREPARED', 'CONSUMED') THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_LIFECYCLE_NOT_PREPARED'
      USING ERRCODE = '23514';
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Canonicalizacion de los campos que la huella v1 de la 443 no contemplaba.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.customer_invoice_semantic_snapshot_530(
  p_cpe jsonb,
  p_cxc jsonb,
  p_pedido_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_metadata jsonb;
  v_cliente_id uuid;
  v_fecha_emision date;
  v_fecha_vencimiento date;
  v_condicion_directa text;
  v_condicion_metadata text;
  v_condicion text;
  v_medio_directo text;
  v_medio_metadata text;
  v_medio text;
  v_plazo_directo integer;
  v_plazo_metadata integer;
  v_plazo integer;
  v_profile jsonb;
BEGIN
  IF p_cpe IS NULL OR jsonb_typeof(p_cpe) <> 'object'
     OR (p_cxc IS NOT NULL AND jsonb_typeof(p_cxc) <> 'object') THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_SEMANTIC_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END IF;

  v_metadata := coalesce(p_cpe->'metadata', '{}'::jsonb);
  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_SEMANTIC_METADATA_INVALID'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_cliente_id := nullif(btrim(p_cpe->>'cliente_id'), '')::uuid;
    v_fecha_emision := nullif(btrim(p_cpe->>'fecha_emision'), '')::date;
    v_fecha_vencimiento := coalesce(
      nullif(btrim(p_cpe->>'fecha_vencimiento'), '')::date,
      v_fecha_emision
    );
    v_plazo_directo := nullif(btrim(p_cpe->>'plazo_pago_dias'), '')::integer;
    v_plazo_metadata := nullif(btrim(v_metadata->>'plazo_pago_dias'), '')::integer;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_SEMANTIC_VALUE_INVALID'
      USING ERRCODE = '22023';
  END;

  IF v_fecha_emision IS NULL OR v_fecha_vencimiento < v_fecha_emision THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_SEMANTIC_DATES_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_condicion_directa := upper(nullif(btrim(p_cpe->>'condicion_pago'), ''));
  v_condicion_metadata := upper(nullif(btrim(v_metadata->>'dian_forma_pago'), ''));
  IF v_condicion_directa IS NOT NULL
     AND v_condicion_metadata IS NOT NULL
     AND v_condicion_directa IS DISTINCT FROM v_condicion_metadata THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_PAYMENT_FORM_CONFLICT'
      USING ERRCODE = '23514';
  END IF;
  v_condicion := coalesce(
    v_condicion_directa,
    v_condicion_metadata,
    CASE WHEN p_cxc IS NULL THEN 'CONTADO' ELSE 'CREDITO' END
  );
  IF v_condicion NOT IN ('CONTADO', 'CREDITO')
     OR (v_condicion = 'CREDITO') IS DISTINCT FROM (p_cxc IS NOT NULL) THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_PAYMENT_FORM_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_medio_directo := upper(nullif(btrim(p_cpe->>'medio_pago'), ''));
  v_medio_metadata := upper(nullif(btrim(v_metadata->>'dian_medio_pago'), ''));
  IF v_medio_directo IS NOT NULL
     AND v_medio_metadata IS NOT NULL
     AND v_medio_directo IS DISTINCT FROM v_medio_metadata THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_PAYMENT_METHOD_CONFLICT'
      USING ERRCODE = '23514';
  END IF;
  v_medio := coalesce(v_medio_directo, v_medio_metadata);

  IF v_plazo_directo IS NOT NULL
     AND v_plazo_metadata IS NOT NULL
     AND v_plazo_directo IS DISTINCT FROM v_plazo_metadata THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_PAYMENT_TERM_CONFLICT'
      USING ERRCODE = '23514';
  END IF;
  v_plazo := coalesce(
    v_plazo_directo,
    v_plazo_metadata,
    v_fecha_vencimiento - v_fecha_emision
  );
  IF v_plazo IS DISTINCT FROM (v_fecha_vencimiento - v_fecha_emision)
     OR (v_condicion = 'CONTADO'
         AND (v_plazo <> 0 OR v_fecha_vencimiento <> v_fecha_emision))
     OR (v_condicion = 'CREDITO'
         AND (v_plazo <= 0 OR v_fecha_vencimiento <= v_fecha_emision)) THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_PAYMENT_TERM_INVALID'
      USING ERRCODE = '23514';
  END IF;

  v_profile := v_metadata->'dian_receptor_tax_profile';
  IF v_profile IS NOT NULL AND jsonb_typeof(v_profile) <> 'object' THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_DIAN_RECEIVER_PROFILE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'version', 530,
    'pedido_id', p_pedido_id,
    'cliente_id', v_cliente_id,
    'fecha_emision', v_fecha_emision,
    'fecha_vencimiento', v_fecha_vencimiento,
    'condicion_pago', v_condicion,
    'medio_pago', v_medio,
    'plazo_pago_dias', v_plazo,
    'dian_receptor_tax_profile', v_profile
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.reserve_customer_invoice_semantics_530(
  p_tenant_id uuid,
  p_cpe jsonb,
  p_cxc jsonb,
  p_idempotency_key text,
  p_pedido_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  -- La 443 historica define la key como case-sensitive (sólo btrim). Cambiarla
  -- aqui haria que un retry antiguo busque otro CPE o colapse dos intenciones.
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_snapshot jsonb;
  v_fingerprint text;
  v_existing public.customer_invoice_intent_semantics%ROWTYPE;
  v_existing_cpe public.cpe%ROWTYPE;
  v_existing_snapshot jsonb;
  v_existing_fingerprint text;
  v_existing_has_cxc boolean;
  v_existing_pedido_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR length(v_key) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION 'CUSTOMER_INVOICE_SEMANTIC_INTENT_INVALID'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':customer-invoice-semantic:' || v_key, 530)
  );
  PERFORM app.assert_order_invoice_key_owner_530(
    p_tenant_id, v_key, p_pedido_id
  );

  v_snapshot := app.customer_invoice_semantic_snapshot_530(
    p_cpe, p_cxc, p_pedido_id
  );
  v_fingerprint := encode(
    extensions.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );

  SELECT * INTO v_existing
  FROM public.customer_invoice_intent_semantics s
  WHERE s.tenant_id = p_tenant_id AND s.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION
        'CUSTOMER_INVOICE_IDEMPOTENCY_SEMANTIC_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'intent_id', v_existing.id,
      'request_fingerprint', v_existing.request_fingerprint,
      'idempotent', true
    );
  END IF;

  -- Un comprobante anterior a 530 puede reconciliarse solamente si la evidencia
  -- persistida permite reconstruir exactamente la nueva huella. Nunca se adopta
  -- a ciegas el primer payload que llegue despues del despliegue.
  SELECT * INTO v_existing_cpe
  FROM public.cpe c
  WHERE c.tenant_id = p_tenant_id
    AND btrim(c.idempotency_key) = v_key
  FOR UPDATE;

  IF FOUND THEN
    SELECT d.pedido_id INTO v_existing_pedido_id
    FROM public.documentos d
    WHERE d.id = v_existing_cpe.documento_id
      AND d.tenant_id = p_tenant_id;

    SELECT EXISTS (
      SELECT 1
      FROM public.cuentas_por_cobrar x
      WHERE x.tenant_id = p_tenant_id
        AND x.documento_id = v_existing_cpe.documento_id
        AND lower(coalesce(x.estado::text, '')) NOT IN ('anulada', 'revertida')
    ) INTO v_existing_has_cxc;

    v_existing_snapshot := app.customer_invoice_semantic_snapshot_530(
      jsonb_build_object(
        'cliente_id', v_existing_cpe.cliente_id,
        'fecha_emision', v_existing_cpe.fecha_emision,
        'fecha_vencimiento', v_existing_cpe.fecha_vencimiento,
        'condicion_pago', coalesce(
          v_existing_cpe.metadata->>'dian_forma_pago',
          CASE
            WHEN v_existing_has_cxc
              OR v_existing_cpe.fecha_vencimiento
                   > v_existing_cpe.fecha_emision::date
            THEN 'CREDITO'
            ELSE 'CONTADO'
          END
        ),
        'medio_pago', v_existing_cpe.metadata->>'dian_medio_pago',
        'plazo_pago_dias', coalesce(
          nullif(v_existing_cpe.metadata->>'plazo_pago_dias', ''),
          (v_existing_cpe.fecha_vencimiento - v_existing_cpe.fecha_emision::date)::text
        ),
        'metadata', coalesce(v_existing_cpe.metadata, '{}'::jsonb)
      ),
      CASE
        WHEN v_existing_has_cxc
          OR v_existing_cpe.fecha_vencimiento > v_existing_cpe.fecha_emision::date
        THEN '{}'::jsonb
        ELSE NULL
      END,
      v_existing_pedido_id
    );
    v_existing_fingerprint := encode(
      extensions.digest(convert_to(v_existing_snapshot::text, 'UTF8'), 'sha256'),
      'hex'
    );
    IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION
        'CUSTOMER_INVOICE_IDEMPOTENCY_SEMANTIC_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.customer_invoice_intent_semantics (
    tenant_id, idempotency_key, request_fingerprint,
    pedido_id, cliente_id, fecha_emision, fecha_vencimiento,
    condicion_pago, medio_pago, plazo_pago_dias,
    dian_receptor_tax_profile, cpe_id
  ) VALUES (
    p_tenant_id, v_key, v_fingerprint,
    nullif(v_snapshot->>'pedido_id', '')::uuid,
    nullif(v_snapshot->>'cliente_id', '')::uuid,
    (v_snapshot->>'fecha_emision')::date,
    (v_snapshot->>'fecha_vencimiento')::date,
    v_snapshot->>'condicion_pago', nullif(v_snapshot->>'medio_pago', ''),
    (v_snapshot->>'plazo_pago_dias')::integer,
    nullif(v_snapshot->'dian_receptor_tax_profile', 'null'::jsonb),
    CASE WHEN v_existing_cpe.id IS NULL THEN NULL ELSE v_existing_cpe.id END
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'intent_id', v_existing.id,
    'request_fingerprint', v_existing.request_fingerprint,
    'idempotent', false
  );
END;
$function$;

-- Conservamos la implementacion probada de 443 y ponemos delante una guarda
-- compatible con la firma publica. El SQL publico sigue llamando el mismo nombre.
ALTER FUNCTION app.emitir_factura_cliente_tx(
  uuid, jsonb, jsonb, jsonb, jsonb, uuid, text
) RENAME TO emitir_factura_cliente_tx_443_legacy_530;

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
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_result jsonb;
  v_country text;
  v_demo boolean;
  v_reserva public.dian_numeracion_reservas%ROWTYPE;
  v_alias text;
  v_cpe_payload jsonb := p_cpe;
  v_documento_payload jsonb := p_documento;
  v_cpe_id uuid;
  v_documento_id uuid;
  v_cxc_id uuid;
  v_pedido_id uuid := nullif(btrim(p_documento->>'pedido_id'), '')::uuid;
  v_numero_visible text;
  v_numero_fiscal text;
  v_rows integer;
BEGIN
  SELECT upper(coalesce(ec.pais, '')), coalesce(ec.is_demo, false)
  INTO v_country, v_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  -- La huella complementaria 530 protege la emision DIAN real. Las fronteras
  -- PE/AR conservan el contrato historico 443 y sus propias reglas fiscales;
  -- forzarles PaymentMeans DIAN seria una regresion fuera de este release.
  IF v_country = 'CO' AND NOT coalesce(v_demo, false) THEN
    PERFORM app.reserve_customer_invoice_semantics_530(
      p_tenant_id, p_cpe, p_cxc, v_key,
      v_pedido_id
    );
  END IF;

  -- La identidad fiscal exacta se toma siempre de la reserva durable. Las
  -- columnas operativas históricas pueden conservar padding, pero ninguna
  -- superficie fiscal vuelve a derivar el ID desde ese alias.
  IF v_country = 'CO' AND NOT coalesce(v_demo, false)
     AND upper(btrim(coalesce(p_cpe->>'tipo_documento', ''))) = '01' THEN
    SELECT * INTO v_reserva
    FROM public.dian_numeracion_reservas r
    WHERE r.tenant_id = p_tenant_id
      AND r.idempotency_key = v_key
      AND r.tipo_documento = '01'
      AND r.pedido_id IS NOT DISTINCT FROM v_pedido_id
    FOR SHARE;
    IF NOT FOUND
       OR upper(btrim(coalesce(p_cpe->>'serie', ''))) IS DISTINCT FROM v_reserva.prefijo
       OR v_reserva.correlativo IS DISTINCT FROM nullif(p_cpe->>'numero', '')::integer THEN
      RAISE EXCEPTION 'DIAN_DIRECT_NUMBERING_RESERVATION_REQUIRED'
        USING ERRCODE = '23514';
    END IF;
    v_numero_visible := v_reserva.correlativo::text;
    v_numero_fiscal := v_reserva.numero_completo;

    -- 443 exige una serie operativa no vacía. Sólo una resolución sin
    -- prefijo necesita el alias transitorio; con prefijo se conserva el
    -- payload original para no cambiar la huella histórica de la RPC.
    IF v_reserva.prefijo = '' THEN
      -- La reserva ya eligió y bloqueó contra colisiones una serie interna en
      -- documento_series. No se deriva otro alias de sólo 12 bits desde el UUID:
      -- ese segundo alias podía coincidir con una serie fiscal real y dejar el
      -- retry permanentemente atascado por el índice único histórico.
      SELECT upper(btrim(ds.serie)) INTO v_alias
      FROM public.documento_series ds
      WHERE ds.id = v_reserva.documento_serie_id
        AND ds.tenant_id = p_tenant_id
      FOR SHARE;
      IF v_alias IS NULL OR v_alias !~ '^D[A-F0-9]{3}$' THEN
        RAISE EXCEPTION 'DIAN_NUMBERING_INTERNAL_ALIAS_INVALID'
          USING ERRCODE = '23514';
      END IF;
      v_cpe_payload := jsonb_set(p_cpe, '{serie}', to_jsonb(v_alias), true);
      v_cpe_payload := jsonb_set(
        v_cpe_payload, '{metadata}',
        coalesce(p_cpe->'metadata', '{}'::jsonb) || jsonb_build_object(
          'dian_number_reservation_id', v_reserva.id,
          'dian_resolucion_numero', v_reserva.resolucion_numero,
          'dian_prefijo_autorizado', '',
          'dian_numbering_contract_version', 530
        ), true
      );
      v_documento_payload := jsonb_set(
        p_documento, '{metadata}',
        coalesce(p_documento->'metadata', '{}'::jsonb) || jsonb_build_object(
          'dian_number_reservation_id', v_reserva.id,
          'dian_prefijo_autorizado', '',
          'dian_numbering_contract_version', 530
        ), true
      );
    END IF;

    -- En retry, 443 compara contra su alias original. La apertura del trigger
    -- queda sellada a esta función y se revierte antes de retornar.
    IF v_alias IS NOT NULL THEN
      PERFORM set_config('app.dian_writer_alias_530', '1', true);
      UPDATE public.cpe c
      SET serie = v_alias, numero = lpad(v_numero_visible, 8, '0'), updated_at = now()
      WHERE c.tenant_id = p_tenant_id AND c.idempotency_key = v_key
        AND c.metadata @> '{"dian_numbering_contract_version":530}'::jsonb
        AND c.metadata->>'dian_number_reservation_id' = v_reserva.id::text;
      UPDATE public.documentos d
      SET serie = v_alias, numero = lpad(v_numero_visible, 8, '0'), updated_at = now()
      FROM public.cpe c
      WHERE c.tenant_id = p_tenant_id AND c.idempotency_key = v_key
        AND d.id = c.documento_id AND d.tenant_id = c.tenant_id
        AND d.metadata->>'dian_number_reservation_id' = v_reserva.id::text;
      UPDATE public.cuentas_por_cobrar x
      SET serie = v_alias, numero = lpad(v_numero_visible, 8, '0'),
          numero_documento = v_alias || '-' || lpad(v_numero_visible, 8, '0'),
          updated_at = now()
      FROM public.cpe c
      WHERE c.tenant_id = p_tenant_id AND c.idempotency_key = v_key
        AND x.documento_id = c.documento_id AND x.tenant_id = c.tenant_id
        AND x.metadata->>'dian_number_reservation_id' = v_reserva.id::text;
    END IF;
  END IF;

  v_result := app.emitir_factura_cliente_tx_443_legacy_530(
    p_tenant_id, v_cpe_payload, v_documento_payload, p_detalles, p_cxc,
    p_event_id, v_key
  );

  IF v_reserva.id IS NOT NULL THEN
    v_cpe_id := nullif(v_result->>'cpe_id', '')::uuid;
    v_documento_id := nullif(v_result->>'documento_id', '')::uuid;
    v_cxc_id := nullif(v_result->>'cxc_id', '')::uuid;
    PERFORM set_config('app.dian_writer_alias_530', '0', true);

    UPDATE public.cpe c
    SET serie = CASE WHEN v_alias IS NULL THEN c.serie ELSE '' END,
        numero = CASE WHEN v_alias IS NULL THEN c.numero ELSE v_numero_visible END,
        metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
          'dian_number_reservation_id', v_reserva.id,
          'dian_resolucion_numero', v_reserva.resolucion_numero,
          'dian_prefijo_autorizado', v_reserva.prefijo,
          'dian_numbering_contract_version', 530,
          'numero_fiscal', v_numero_fiscal
        ), updated_at = now()
    WHERE c.id = v_cpe_id AND c.tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'DIAN_DIRECT_CPE_IDENTITY_NOT_PERSISTED'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.documentos d
    SET serie = CASE WHEN v_alias IS NULL THEN d.serie ELSE '' END,
        numero = CASE WHEN v_alias IS NULL THEN d.numero ELSE v_numero_visible END,
        metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
          'dian_number_reservation_id', v_reserva.id,
          'dian_prefijo_autorizado', v_reserva.prefijo,
          'dian_numbering_contract_version', 530,
          'numero_fiscal', v_numero_fiscal
        ), updated_at = now()
    WHERE d.id = v_documento_id AND d.tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'DIAN_DIRECT_DOCUMENT_IDENTITY_NOT_PERSISTED'
        USING ERRCODE = '23514';
    END IF;
    IF v_cxc_id IS NOT NULL THEN
      UPDATE public.cuentas_por_cobrar x
      SET serie = CASE WHEN v_alias IS NULL THEN x.serie ELSE '' END,
          numero = CASE WHEN v_alias IS NULL THEN x.numero ELSE v_numero_visible END,
          numero_documento = v_numero_fiscal,
          metadata = coalesce(x.metadata, '{}'::jsonb) || jsonb_build_object(
            'dian_number_reservation_id', v_reserva.id,
            'dian_prefijo_autorizado', v_reserva.prefijo,
            'dian_numbering_contract_version', 530,
            'numero_fiscal', v_numero_fiscal
          ), updated_at = now()
      WHERE x.id = v_cxc_id AND x.tenant_id = p_tenant_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'DIAN_DIRECT_CXC_IDENTITY_NOT_PERSISTED'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    UPDATE public.outbox_events o
    SET payload = coalesce(o.payload, '{}'::jsonb) || jsonb_build_object(
          'serie', v_reserva.prefijo, 'numero', v_reserva.correlativo,
          'numeroFiscal', v_numero_fiscal,
          'numero_fiscal', v_numero_fiscal,
          'dianPrefijoAutorizado', v_reserva.prefijo,
          'dianNumberReservationId', v_reserva.id,
          'dianNumberingContractVersion', 530
        ), updated_at = now()
    WHERE o.tenant_id = p_tenant_id
      AND (o.aggregate_id = v_cpe_id::text OR o.payload->>'cpeId' = v_cpe_id::text);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows < 1 THEN
      RAISE EXCEPTION 'DIAN_DIRECT_OUTBOX_IDENTITY_NOT_PERSISTED'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.cpe c
      WHERE c.id = v_cpe_id AND c.tenant_id = p_tenant_id
        AND (c.metadata->>'dian_number_reservation_id' IS DISTINCT FROM v_reserva.id::text
          OR c.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM v_reserva.prefijo
          OR c.metadata->>'numero_fiscal' IS DISTINCT FROM v_numero_fiscal)
    ) OR EXISTS (
      SELECT 1 FROM public.documentos d
      WHERE d.id = v_documento_id AND d.tenant_id = p_tenant_id
        AND (d.metadata->>'dian_number_reservation_id' IS DISTINCT FROM v_reserva.id::text
          OR d.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM v_reserva.prefijo
          OR d.metadata->>'numero_fiscal' IS DISTINCT FROM v_numero_fiscal)
    ) OR (v_cxc_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.cuentas_por_cobrar x
      WHERE x.id = v_cxc_id AND x.tenant_id = p_tenant_id
        AND (x.metadata->>'dian_number_reservation_id' IS DISTINCT FROM v_reserva.id::text
          OR x.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM v_reserva.prefijo
          OR x.metadata->>'numero_fiscal' IS DISTINCT FROM v_numero_fiscal)
    )) OR EXISTS (
      SELECT 1 FROM public.outbox_events o
      WHERE o.tenant_id = p_tenant_id
        AND (o.aggregate_id = v_cpe_id::text OR o.payload->>'cpeId' = v_cpe_id::text)
        AND (o.payload->>'numeroFiscal' IS DISTINCT FROM v_numero_fiscal
          OR o.payload->>'numero_fiscal' IS DISTINCT FROM v_numero_fiscal
          OR o.payload->>'dianPrefijoAutorizado' IS DISTINCT FROM v_reserva.prefijo)
    ) THEN
      RAISE EXCEPTION 'DIAN_DIRECT_IDENTITY_POSTCONDITION_FAILED'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.dian_numeracion_reservas r
    SET estado = 'CONSUMIDA',
        consumida_at = coalesce(r.consumida_at, now()),
        cpe_id = coalesce(r.cpe_id, v_cpe_id),
        documento_id = coalesce(r.documento_id, v_documento_id)
    WHERE r.id = v_reserva.id
      AND r.tenant_id = p_tenant_id
      AND (
        r.estado = 'RESERVADA'
        OR (
          r.estado = 'CONSUMIDA'
          AND r.cpe_id = v_cpe_id
          AND r.documento_id = v_documento_id
        )
      );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 OR EXISTS (
      SELECT 1 FROM public.dian_numeracion_reservas r
      WHERE r.id = v_reserva.id
        AND (
          r.estado <> 'CONSUMIDA'
          OR r.cpe_id IS DISTINCT FROM v_cpe_id
          OR r.documento_id IS DISTINCT FROM v_documento_id
          OR r.consumida_at IS NULL
        )
    ) THEN
      RAISE EXCEPTION 'DIAN_DIRECT_RESERVATION_NOT_CONSUMED'
        USING ERRCODE = '23514';
    END IF;

    v_result := v_result || jsonb_build_object(
      'serie', v_reserva.prefijo, 'numero', v_numero_visible,
      'numero_fiscal', v_numero_fiscal,
      'dian_number_reservation_id', v_reserva.id,
      'dian_numbering_contract_version', 530,
      'dian_numbering_status', 'CONSUMIDA'
    );
  END IF;

  UPDATE public.customer_invoice_intent_semantics s
  SET cpe_id = coalesce(s.cpe_id, nullif(v_result->>'cpe_id', '')::uuid),
      updated_at = now()
  WHERE s.tenant_id = p_tenant_id AND s.idempotency_key = v_key;

  RETURN v_result;
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
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  SELECT app.emitir_factura_cliente_tx(
    p_tenant_id, p_cpe, p_documento, p_detalles, p_cxc,
    p_event_id, p_idempotency_key
  );
$function$;

-- ---------------------------------------------------------------------------
-- Reserva DIAN real. La ausencia deliberada de p_prefijo es parte del contrato.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.reservar_numeracion_dian_ui_tx_530(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_tipo_documento text,
  p_fecha_emision date,
  p_idempotency_key text,
  p_pedido_id uuid DEFAULT NULL,
  p_intent_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(btrim(coalesce(p_tipo_documento, '')));
  -- La frontera 443 trata la key como case-sensitive. La reserva debe conservar
  -- la misma identidad o dos intents distintos podrían compartir correlativo.
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_intent_fingerprint text := lower(btrim(coalesce(p_intent_fingerprint, '')));
  v_fingerprint text;
  v_config public.empresa_config%ROWTYPE;
  v_reserva public.dian_numeracion_reservas%ROWTYPE;
  v_serie public.documento_series%ROWTYPE;
  v_prefijo text;
  v_series_alias text;
  v_writer_alias text;
  v_candidate_alias text;
  v_alias_attempt integer;
  v_no_prefix_series_id uuid;
  v_correlativo integer;
  v_longitud integer;
  v_hora_emision time(0) without time zone;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL
     OR p_fecha_emision IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_INTENT_INVALID'
      USING ERRCODE = '22023';
  END IF;
  IF v_tipo <> '01' THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_ONLY_INVOICE_01'
      USING ERRCODE = '22023';
  END IF;
  IF v_intent_fingerprint <> ''
     AND v_intent_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_INTENT_FINGERPRINT_INVALID'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = p_tenant_id AND coalesce(t.activo, true)
  ) THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_TENANT_INACTIVE_OR_MISSING'
      USING ERRCODE = '23514';
  END IF;
  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian-numbering-intent:' || v_key, 530)
  );
  PERFORM app.assert_order_invoice_key_owner_530(
    p_tenant_id, v_key, p_pedido_id
  );

  -- El wrapper público exige la huella económica calculada por el servidor.
  -- El fallback sólo conserva compatibilidad con llamadas internas de esta
  -- misma migración; ninguna función app es ejecutable por service_role.
  IF v_intent_fingerprint = '' THEN
    v_intent_fingerprint := encode(
      extensions.digest(
        convert_to(jsonb_build_object(
          'version', 530,
          'tipo_documento', v_tipo,
          'fecha_emision', p_fecha_emision,
          'pedido_id', p_pedido_id
        )::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
  END IF;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'version', 530,
        'tipo_documento', v_tipo,
        'fecha_emision', p_fecha_emision,
        'pedido_id', p_pedido_id,
        'economic_intent_sha256', v_intent_fingerprint
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  SELECT * INTO v_reserva
  FROM public.dian_numeracion_reservas r
  WHERE r.tenant_id = p_tenant_id AND r.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_reserva.pedido_id IS DISTINCT FROM p_pedido_id THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_IDEMPOTENCY_OWNER_MISMATCH'
        USING ERRCODE = '23505';
    END IF;
    IF v_reserva.actor_id IS DISTINCT FROM p_actor_id
       AND p_pedido_id IS NULL THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_IDEMPOTENCY_ACTOR_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
    IF v_reserva.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    IF v_reserva.estado = 'ANULADA' THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_IDEMPOTENCY_CANCELLED'
        USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'reserva_id', v_reserva.id,
      'resolucion_numero', v_reserva.resolucion_numero,
      'prefijo', v_reserva.prefijo,
      'correlativo', v_reserva.correlativo,
      'numero_completo', v_reserva.numero_completo,
      'fecha_emision', v_reserva.fecha_emision,
      'hora_emision', to_char(v_reserva.hora_emision, 'HH24:MI:SS'),
      'rango_desde', v_reserva.rango_desde,
      'rango_hasta', v_reserva.rango_hasta,
      'vigencia_desde', v_reserva.vigencia_desde,
      'vigencia_hasta', v_reserva.vigencia_hasta,
      'estado', v_reserva.estado,
      'idempotent', true
    );
  END IF;

  BEGIN
    SELECT ec.* INTO STRICT v_config
    FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id
    FOR UPDATE;
  EXCEPTION
    WHEN no_data_found THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_CONFIG_MISSING'
        USING ERRCODE = '23514';
    WHEN too_many_rows THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_CONFIG_AMBIGUOUS'
        USING ERRCODE = '23514';
  END;

  v_prefijo := upper(btrim(coalesce(v_config.dian_resolucion_prefijo, '')));
  IF upper(coalesce(v_config.pais, '')) <> 'CO'
     OR NOT EXISTS (
       SELECT 1 FROM public.paises p
       WHERE p.id = v_config.pais_id
         AND upper(p.codigo_iso) = 'CO'
         AND coalesce(p.activo, true)
     )
     OR coalesce(v_config.is_demo, false)
     OR NOT coalesce(v_config.dian_activo, false)
     OR upper(coalesce(v_config.estado, '')) <> 'ACTIVO'
     OR nullif(btrim(coalesce(v_config.dian_resolucion_numero, '')), '') IS NULL
     OR v_prefijo !~ '^[A-Z0-9]{0,4}$'
     OR v_config.dian_resolucion_desde IS NULL
     OR v_config.dian_resolucion_hasta IS NULL
     OR v_config.dian_resolucion_desde < 1
     OR v_config.dian_resolucion_hasta < v_config.dian_resolucion_desde
     OR v_config.dian_resolucion_fecha_inicio IS NULL
     OR v_config.dian_resolucion_fecha_fin IS NULL
     OR v_config.dian_resolucion_fecha_fin < v_config.dian_resolucion_fecha_inicio THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_REAL_RESOLUTION_INCOMPLETE'
      USING ERRCODE = '23514';
  END IF;
  IF p_fecha_emision NOT BETWEEN v_config.dian_resolucion_fecha_inicio
                              AND v_config.dian_resolucion_fecha_fin THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_RESOLUTION_NOT_VALID_FOR_EMISSION_DATE'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian-series:' || v_prefijo, 530)
  );

  -- `documento_series` es infraestructura heredada y exige exactamente una
  -- serie alfanumérica no vacía. Una resolución DIAN sin prefijo conserva
  -- `prefijo = ''` en toda superficie fiscal, pero usa internamente un alias
  -- opaco de cuatro caracteres. El primer alias libre se deriva de tenant y
  -- resolución; jamás se incorpora al ID/CUFE ni se muestra al usuario.
  IF v_prefijo = '' THEN
    SELECT ds.id, ds.serie
    INTO v_no_prefix_series_id, v_series_alias
    FROM public.documento_series ds
    WHERE ds.tenant_id = p_tenant_id
      AND upper(ds.tipo_documento) = 'FACTURA'
      AND coalesce(ds.metadata, '{}'::jsonb) ? 'resolution_prefix'
      AND ds.metadata->>'resolution_prefix' = ''
    ORDER BY coalesce(ds.activo, true) DESC,
             coalesce(ds.updated_at, ds.created_at) DESC, ds.id
    LIMIT 1;

    IF v_series_alias IS NULL THEN
      FOR v_alias_attempt IN 0..4095 LOOP
        v_candidate_alias := 'D' || upper(substr(md5(
          p_tenant_id::text || ':' || btrim(v_config.dian_resolucion_numero)
          || ':NO_PREFIX:' || v_alias_attempt::text
        ), 1, 3));
        IF NOT EXISTS (
          SELECT 1 FROM public.documento_series ds
          WHERE ds.tenant_id = p_tenant_id
            AND upper(ds.tipo_documento) = 'FACTURA'
            AND upper(ds.serie) = v_candidate_alias
        ) THEN
          v_series_alias := v_candidate_alias;
          EXIT;
        END IF;
      END LOOP;
      IF v_series_alias IS NULL THEN
        RAISE EXCEPTION 'DIAN_NUMBERING_INTERNAL_ALIAS_EXHAUSTED'
          USING ERRCODE = '54000';
      END IF;
    END IF;
  ELSE
    -- Si una resolución futura asigna el mismo texto que un alias interno
    -- antiguo, reubicar el alias conserva su id/FK y libera el prefijo real.
    SELECT ds.id INTO v_no_prefix_series_id
    FROM public.documento_series ds
    WHERE ds.tenant_id = p_tenant_id
      AND upper(ds.tipo_documento) = 'FACTURA'
      AND upper(ds.serie) = v_prefijo
      AND coalesce(ds.metadata, '{}'::jsonb) ? 'resolution_prefix'
      AND ds.metadata->>'resolution_prefix' = ''
    LIMIT 1
    FOR UPDATE;

    IF v_no_prefix_series_id IS NOT NULL THEN
      v_series_alias := NULL;
      FOR v_alias_attempt IN 0..4095 LOOP
        v_candidate_alias := 'D' || upper(substr(md5(
          p_tenant_id::text || ':RELOCATE_NO_PREFIX:' || v_alias_attempt::text
        ), 1, 3));
        IF NOT EXISTS (
          SELECT 1 FROM public.documento_series ds
          WHERE ds.tenant_id = p_tenant_id
            AND upper(ds.tipo_documento) = 'FACTURA'
            AND upper(ds.serie) = v_candidate_alias
        ) THEN
          v_series_alias := v_candidate_alias;
          EXIT;
        END IF;
      END LOOP;
      IF v_series_alias IS NULL THEN
        RAISE EXCEPTION 'DIAN_NUMBERING_INTERNAL_ALIAS_EXHAUSTED'
          USING ERRCODE = '54000';
      END IF;
      UPDATE public.documento_series
      SET serie = v_series_alias, updated_at = now()
      WHERE id = v_no_prefix_series_id;
    END IF;
    v_series_alias := v_prefijo;
  END IF;

  SELECT * INTO v_serie
  FROM public.documento_series ds
  WHERE ds.tenant_id = p_tenant_id
    AND upper(ds.tipo_documento) = 'FACTURA'
    AND upper(ds.serie) = v_series_alias
  ORDER BY coalesce(ds.activo, true) DESC,
           coalesce(ds.updated_at, ds.created_at) DESC, ds.id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    v_longitud := greatest(
      4,
      least(12, length(v_config.dian_resolucion_hasta::text))
    );
    INSERT INTO public.documento_series (
      tenant_id, tipo_documento, serie,
      correlativo_actual, correlativo_maximo, longitud_correlativo,
      activo, estado, metadata, created_at, updated_at
    ) VALUES (
      p_tenant_id, 'FACTURA', v_series_alias,
      v_config.dian_resolucion_desde - 1,
      v_config.dian_resolucion_hasta,
      v_longitud, true, 'ACTIVO',
      jsonb_build_object(
         'source', 'dian_resolution',
         'contract_version', 530,
         'resolution_prefix', v_prefijo,
        'resolution_number', v_config.dian_resolucion_numero,
        'range_from', v_config.dian_resolucion_desde,
        'range_to', v_config.dian_resolucion_hasta,
        'valid_from', v_config.dian_resolucion_fecha_inicio,
        'valid_to', v_config.dian_resolucion_fecha_fin
      ),
      now(), now()
    ) RETURNING * INTO v_serie;
  ELSE
    IF coalesce(v_serie.correlativo_actual, 0)
         < v_config.dian_resolucion_desde - 1 THEN
      v_serie.correlativo_actual := v_config.dian_resolucion_desde - 1;
    END IF;
    IF v_serie.correlativo_actual >= v_config.dian_resolucion_hasta THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_AUTHORIZED_RANGE_EXHAUSTED'
        USING ERRCODE = '22003';
    END IF;
    UPDATE public.documento_series ds
    SET correlativo_actual = v_serie.correlativo_actual,
        correlativo_maximo = v_config.dian_resolucion_hasta,
        activo = true,
        estado = 'ACTIVO',
        metadata = coalesce(ds.metadata, '{}'::jsonb) || jsonb_build_object(
          'source', 'dian_resolution',
          'contract_version', 530,
          'resolution_prefix', v_prefijo,
          'resolution_number', v_config.dian_resolucion_numero,
          'range_from', v_config.dian_resolucion_desde,
          'range_to', v_config.dian_resolucion_hasta,
          'valid_from', v_config.dian_resolucion_fecha_inicio,
          'valid_to', v_config.dian_resolucion_fecha_fin
        ),
        updated_at = now()
    WHERE ds.id = v_serie.id
    RETURNING * INTO v_serie;
  END IF;

  -- El POS heredado sólo admite una serie operativa de cuatro caracteres.
  -- Se asigna una vez por documento_serie bajo un lock común del tenant y se
  -- persiste en metadata: todos los retries y las tres fronteras usan la misma
  -- identidad transitoria, sin volver a derivarla desde cada reserva.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian-writer-alias', 530)
  );
  v_writer_alias := upper(btrim(coalesce(
    v_serie.metadata->>'dian_writer_alias', ''
  )));
  IF v_writer_alias !~ '^[A-Z0-9]{4}$' OR v_writer_alias ~ '^T' THEN
    v_writer_alias := NULL;
    IF upper(btrim(v_serie.serie)) ~ '^[A-Z0-9]{4}$'
       AND upper(btrim(v_serie.serie)) !~ '^T'
       AND NOT EXISTS (
         SELECT 1 FROM public.documento_series other
         WHERE other.tenant_id = p_tenant_id
           AND other.id <> v_serie.id
           AND upper(btrim(coalesce(
             other.metadata->>'dian_writer_alias', ''
           ))) = upper(btrim(v_serie.serie))
       ) THEN
      v_writer_alias := upper(btrim(v_serie.serie));
    ELSE
      FOR v_alias_attempt IN 0..4095 LOOP
        v_candidate_alias := 'D' || upper(substr(md5(
          p_tenant_id::text || ':WRITER_ALIAS:' || v_serie.id::text
          || ':' || v_alias_attempt::text
        ), 1, 3));
        IF NOT EXISTS (
          SELECT 1 FROM public.documento_series other
          WHERE other.tenant_id = p_tenant_id
            AND other.id <> v_serie.id
            AND (
              upper(btrim(other.serie)) = v_candidate_alias
              OR upper(btrim(coalesce(
                other.metadata->>'dian_writer_alias', ''
              ))) = v_candidate_alias
            )
        ) THEN
          v_writer_alias := v_candidate_alias;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF v_writer_alias IS NULL THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_WRITER_ALIAS_EXHAUSTED'
        USING ERRCODE = '54000';
    END IF;
    UPDATE public.documento_series ds
    SET metadata = coalesce(ds.metadata, '{}'::jsonb)
          || jsonb_build_object('dian_writer_alias', v_writer_alias),
        updated_at = now()
    WHERE ds.id = v_serie.id
    RETURNING * INTO v_serie;
  END IF;

  v_correlativo := v_serie.correlativo_actual + 1;
  IF v_correlativo NOT BETWEEN v_config.dian_resolucion_desde
                            AND v_config.dian_resolucion_hasta THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_AUTHORIZED_RANGE_EXHAUSTED'
      USING ERRCODE = '22003';
  END IF;

  UPDATE public.documento_series
  SET correlativo_actual = v_correlativo,
      correlativo_maximo = v_config.dian_resolucion_hasta,
      updated_at = now()
  WHERE id = v_serie.id;

  -- Se toma el reloj de Bogota sólo para la reserva nueva y bajo el mismo
  -- lock de intención. Un retry anterior ya retornó arriba la hora persistida.
  v_hora_emision := (clock_timestamp() AT TIME ZONE 'America/Bogota')::time(0);

  INSERT INTO public.dian_numeracion_reservas (
    tenant_id, actor_id, documento_serie_id, pedido_id,
    tipo_documento, fecha_emision, hora_emision, resolucion_numero, prefijo,
    rango_desde, rango_hasta, vigencia_desde, vigencia_hasta,
    correlativo, numero_completo, idempotency_key, request_fingerprint
  ) VALUES (
    p_tenant_id, p_actor_id, v_serie.id, p_pedido_id,
    v_tipo, p_fecha_emision, v_hora_emision,
    btrim(v_config.dian_resolucion_numero), v_prefijo,
    v_config.dian_resolucion_desde, v_config.dian_resolucion_hasta,
    v_config.dian_resolucion_fecha_inicio, v_config.dian_resolucion_fecha_fin,
    v_correlativo, v_prefijo || v_correlativo::text, v_key, v_fingerprint
  ) RETURNING * INTO v_reserva;

  RETURN jsonb_build_object(
    'reserva_id', v_reserva.id,
    'resolucion_numero', v_reserva.resolucion_numero,
    'prefijo', v_reserva.prefijo,
    'correlativo', v_reserva.correlativo,
    'numero_completo', v_reserva.numero_completo,
    'fecha_emision', v_reserva.fecha_emision,
    'hora_emision', to_char(v_reserva.hora_emision, 'HH24:MI:SS'),
    'rango_desde', v_reserva.rango_desde,
    'rango_hasta', v_reserva.rango_hasta,
    'vigencia_desde', v_reserva.vigencia_desde,
    'vigencia_hasta', v_reserva.vigencia_hasta,
    'estado', v_reserva.estado,
    'idempotent', false
  );
END;
$function$;

-- Una intención abandonada puede quedar anulada de forma explícita, pero su
-- correlativo continúa quemado. La operación sólo acepta la reserva original
-- aún no vinculada a ningún efecto fiscal y jamás retrocede documento_series.
CREATE OR REPLACE FUNCTION public.anular_reserva_numeracion_dian_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_reserva_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_reserva public.dian_numeracion_reservas%ROWTYPE;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_correlativo_actual integer;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_reserva_id IS NULL
     OR length(v_motivo) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_CANCELLATION_INVALID'
      USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_actor_461(p_tenant_id, p_actor_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  SELECT * INTO v_reserva
  FROM public.dian_numeracion_reservas r
  WHERE r.id = p_reserva_id AND r.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_RESERVATION_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_reserva.actor_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_CANCELLATION_ACTOR_MISMATCH'
      USING ERRCODE = '42501';
  END IF;
  IF v_reserva.estado = 'ANULADA' THEN
    IF v_reserva.motivo_anulacion IS DISTINCT FROM v_motivo THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_CANCELLATION_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'reserva_id', v_reserva.id,
      'numero_completo', v_reserva.numero_completo,
      'estado', v_reserva.estado,
      'idempotent', true
    );
  END IF;
  IF v_reserva.estado <> 'RESERVADA' THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_CONSUMED_CANNOT_BE_CANCELLED'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cpe c
    WHERE c.tenant_id = p_tenant_id
      AND c.metadata->>'dian_number_reservation_id' = p_reserva_id::text
  ) OR EXISTS (
    SELECT 1 FROM public.documentos d
    WHERE d.tenant_id = p_tenant_id
      AND d.metadata->>'dian_number_reservation_id' = p_reserva_id::text
  ) OR EXISTS (
    SELECT 1 FROM public.cuentas_por_cobrar x
    WHERE x.tenant_id = p_tenant_id
      AND x.metadata->>'dian_number_reservation_id' = p_reserva_id::text
  ) OR EXISTS (
    SELECT 1 FROM public.ventas_pos v
    WHERE v.tenant_id = p_tenant_id
      AND (
        v.cpe_data->>'dian_number_reservation_id' = p_reserva_id::text
        OR v.cpe_data #>> '{metadata,dian_number_reservation_id}' = p_reserva_id::text
      )
  ) OR EXISTS (
    SELECT 1 FROM public.outbox_events o
    WHERE o.tenant_id = p_tenant_id
      AND (
        o.payload->>'dianNumberReservationId' = p_reserva_id::text
        OR o.payload->>'dian_number_reservation_id' = p_reserva_id::text
      )
  ) THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_RESERVATION_ALREADY_REFERENCED'
      USING ERRCODE = '23514';
  END IF;

  SELECT ds.correlativo_actual INTO v_correlativo_actual
  FROM public.documento_series ds
  WHERE ds.id = v_reserva.documento_serie_id
    AND ds.tenant_id = p_tenant_id
  FOR SHARE;
  IF v_correlativo_actual IS NULL
     OR v_correlativo_actual < v_reserva.correlativo THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_SERIES_POSTCONDITION_FAILED'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.dian_numeracion_reservas r
  SET estado = 'ANULADA', anulada_at = now(), motivo_anulacion = v_motivo
  WHERE r.id = p_reserva_id AND r.tenant_id = p_tenant_id
    AND r.estado = 'RESERVADA';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_CANCELLATION_RACE'
      USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'reserva_id', p_reserva_id,
    'numero_completo', v_reserva.numero_completo,
    'estado', 'ANULADA',
    'idempotent', false,
    'correlativo_reutilizable', false
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Numeración única también para el POS. El writer 451 conserva una validación
-- histórica de cuatro caracteres; se le entrega un alias efímero y, dentro de
-- la misma transacción, se reemplaza por el prefijo DIAN real (1..4) en todas
-- las superficies persistidas. El alias nunca sale del commit ni llega al XML.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.obtener_siguiente_numero_documento_legacy_530(
  p_tenant_id uuid,
  p_tipo_documento text,
  p_serie text
)
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT public.obtener_siguiente_numero_serie(
    p_tenant_id,
    CASE
      WHEN upper(coalesce(nullif(btrim(p_tipo_documento), ''), 'FACTURA'))
        IN ('01', 'FACTURA') THEN 'FACTURA'
      WHEN upper(coalesce(nullif(btrim(p_tipo_documento), ''), 'FACTURA'))
        IN ('03', 'BOLETA') THEN 'BOLETA'
      WHEN upper(coalesce(nullif(btrim(p_tipo_documento), ''), 'FACTURA'))
        IN ('07', 'NC', 'NOTA_CREDITO') THEN 'NOTA_CREDITO'
      WHEN upper(coalesce(nullif(btrim(p_tipo_documento), ''), 'FACTURA'))
        IN ('08', 'ND', 'NOTA_DEBITO') THEN 'NOTA_DEBITO'
      ELSE upper(coalesce(nullif(btrim(p_tipo_documento), ''), 'FACTURA'))
    END,
    p_serie
  );
$function$;

CREATE OR REPLACE FUNCTION public.obtener_siguiente_numero_documento(
  p_tenant_id uuid,
  p_tipo_documento text,
  p_serie text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(coalesce(nullif(btrim(p_tipo_documento), ''), 'FACTURA'));
  v_serie text := upper(btrim(coalesce(p_serie, '')));
  v_pais text;
  v_demo boolean;
  v_context_tenant uuid;
  v_context_key text;
  v_context_prefix text;
  v_context_alias text;
  v_context_number integer;
  v_reserva public.dian_numeracion_reservas%ROWTYPE;
BEGIN
  SELECT upper(coalesce(ec.pais, '')), coalesce(ec.is_demo, false)
  INTO v_pais, v_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  IF v_pais = 'CO' AND NOT coalesce(v_demo, false)
     AND v_tipo IN ('01', 'FACTURA') THEN
    BEGIN
      v_context_tenant := nullif(
        current_setting('app.dian_numbering_tenant_id', true), ''
      )::uuid;
      v_context_number := nullif(
        current_setting('app.dian_numbering_correlativo', true), ''
      )::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_CONTEXT_INVALID'
        USING ERRCODE = '23514';
    END;
    v_context_key := current_setting('app.dian_numbering_idempotency_key', true);
    v_context_prefix := upper(current_setting('app.dian_numbering_prefijo', true));
    v_context_alias := upper(current_setting('app.dian_numbering_alias', true));

    IF v_context_tenant IS DISTINCT FROM p_tenant_id
       OR nullif(v_context_key, '') IS NULL
       OR v_context_prefix !~ '^[A-Z0-9]{0,4}$'
       OR v_context_alias !~ '^[A-Z0-9]{4}$'
       OR v_serie <> v_context_alias
       OR v_context_number IS NULL OR v_context_number < 1
       OR current_setting('app.dian_numbering_consumed', true) = '1' THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_RESERVATION_REQUIRED'
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_reserva
    FROM public.dian_numeracion_reservas r
    WHERE r.tenant_id = p_tenant_id
      AND r.idempotency_key = v_context_key
      AND r.tipo_documento = '01'
      AND r.prefijo = v_context_prefix
      AND r.correlativo = v_context_number
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_RESERVATION_NOT_FOUND'
        USING ERRCODE = '23514';
    END IF;

    PERFORM set_config('app.dian_numbering_consumed', '1', true);
    RETURN v_context_number::text;
  END IF;

  RETURN app.obtener_siguiente_numero_documento_legacy_530(
    p_tenant_id, p_tipo_documento, p_serie
  );
END;
$function$;

-- Los normalizadores heredados convierten una serie vacia a F001 en
-- `documentos` y a NULL en CxC. Para una resolucion DIAN que no asigna
-- prefijo, ambas conversiones inventarian una identidad fiscal distinta de
-- la autorizada. Este trigger corre despues de los normalizadores (orden
-- alfabetico) y restaura exclusivamente el snapshot DIAN sellado por este
-- contrato; no cambia filas historicas ni documentos de otros paises.
CREATE OR REPLACE FUNCTION app.preserve_dian_optional_prefix_530()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_prefijo text;
BEGIN
  IF current_setting('app.dian_writer_alias_530', true) = '1' THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(coalesce(NEW.metadata, '{}'::jsonb)) = 'object'
     AND NEW.metadata @> '{"dian_numbering_contract_version":530}'::jsonb THEN
    v_prefijo := upper(btrim(coalesce(
      NEW.metadata->>'dian_prefijo_autorizado', ''
    )));
    IF v_prefijo !~ '^[A-Z0-9]{0,4}$' THEN
      RAISE EXCEPTION 'DIAN_PREFIX_SNAPSHOT_INVALID'
        USING ERRCODE = '23514';
    END IF;
    NEW.serie := v_prefijo;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_zz_preserve_dian_prefix_530 ON public.documentos;
CREATE TRIGGER trg_zz_preserve_dian_prefix_530
BEFORE INSERT OR UPDATE ON public.documentos
FOR EACH ROW EXECUTE FUNCTION app.preserve_dian_optional_prefix_530();

DROP TRIGGER IF EXISTS trg_zz_preserve_dian_prefix_530
  ON public.cuentas_por_cobrar;
CREATE TRIGGER trg_zz_preserve_dian_prefix_530
BEFORE INSERT OR UPDATE ON public.cuentas_por_cobrar
FOR EACH ROW EXECUTE FUNCTION app.preserve_dian_optional_prefix_530();

-- `documentos` exigia historicamente una serie no vacia. La excepcion es
-- estrecha y verificable: solamente una fila sellada por el contrato 530 cuyo
-- snapshot autorizado declara de forma explicita que DIAN no asigno prefijo.
-- Tipo, numero y el resto de identificadores continúan siendo obligatorios.
ALTER TABLE public.documentos
  DROP CONSTRAINT IF EXISTS ck_documentos_identificacion_required;
ALTER TABLE public.documentos
  ADD CONSTRAINT ck_documentos_identificacion_required CHECK (
    tipo_documento IS NOT NULL
    AND btrim(tipo_documento) <> ''
    AND numero IS NOT NULL
    AND btrim(numero) <> ''
    AND (
      (serie IS NOT NULL AND btrim(serie) <> '')
      OR (
        metadata @> '{"dian_numbering_contract_version":530}'::jsonb
        AND metadata->>'dian_prefijo_autorizado' = ''
        AND serie = ''
      )
    )
  ) NOT VALID;
ALTER TABLE public.documentos
  VALIDATE CONSTRAINT ck_documentos_identificacion_required;

CREATE OR REPLACE FUNCTION app.pos_registrar_venta_atomic_tx_530(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_sesion_caja_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_emitir boolean := coalesce((p_payload->>'emitir_cpe')::boolean, true);
  v_pais text;
  v_demo boolean;
  v_real_co boolean := false;
  v_reservation_key text;
  v_reservation jsonb;
  v_reservation_id uuid;
  v_fecha date;
  v_prefijo text;
  v_alias text;
  v_numero integer;
  v_numero_padded text;
  v_numero_fiscal text;
  v_payload jsonb := p_payload;
  v_cpe jsonb;
  v_metadata jsonb;
  v_result jsonb;
  v_venta_id uuid;
  v_documento_id uuid;
  v_cxc_id uuid;
  v_event_id uuid;
  v_vencimiento date;
  v_plazo_dias integer;
  v_condicion_pago text;
  v_reservation_intent_fingerprint text;
  v_hora_emision time(0) without time zone;
  v_rows integer;
BEGIN
  IF p_tenant_id IS NULL OR p_usuario_id IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 200
     OR jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'POS_SALE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT upper(coalesce(ec.pais, '')), coalesce(ec.is_demo, false)
  INTO v_pais, v_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;
  v_real_co := v_emitir AND v_pais = 'CO' AND NOT coalesce(v_demo, false);

  IF v_real_co THEN
    v_cpe := coalesce(p_payload->'cpe_data', '{}'::jsonb);
    IF jsonb_typeof(v_cpe) <> 'object'
       OR upper(btrim(coalesce(v_cpe->>'tipo_documento', ''))) <> '01' THEN
      RAISE EXCEPTION 'DIAN_POS_ONLY_FEV_INVOICE_01'
        USING ERRCODE = '23514';
    END IF;

    v_reservation_key := 'pos.cpe:' || p_tenant_id::text || ':' || v_key;
    -- p_payload es jsonb: su representación textual tiene orden de claves
    -- determinista. La huella cubre el snapshot económico completo del POS y
    -- se compara dentro de la misma transacción que reserva el correlativo.
    v_reservation_intent_fingerprint := encode(
      extensions.digest(
        convert_to(jsonb_build_object(
          'version', 530,
          'source', 'pos',
          'payload', p_payload
        )::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    SELECT r.fecha_emision INTO v_fecha
    FROM public.dian_numeracion_reservas r
    WHERE r.tenant_id = p_tenant_id
      AND r.idempotency_key = v_reservation_key;
    v_fecha := coalesce(v_fecha, app.hoy_tenant(p_tenant_id));

    v_reservation := app.reservar_numeracion_dian_ui_tx_530(
      p_tenant_id, p_usuario_id, '01', v_fecha, v_reservation_key,
      NULL, v_reservation_intent_fingerprint
    );
    v_reservation_id := nullif(v_reservation->>'reserva_id', '')::uuid;
    v_prefijo := upper(btrim(coalesce(v_reservation->>'prefijo', '')));
    v_numero := nullif(v_reservation->>'correlativo', '')::integer;
    v_hora_emision := nullif(v_reservation->>'hora_emision', '')::time(0);
    IF v_reservation_id IS NULL OR v_prefijo !~ '^[A-Z0-9]{0,4}$'
       OR v_numero IS NULL OR v_numero < 1 OR v_hora_emision IS NULL THEN
      RAISE EXCEPTION 'DIAN_POS_NUMBERING_RESERVATION_INVALID'
        USING ERRCODE = '23514';
    END IF;

    -- La reserva apunta a la serie que conserva el único alias operativo
    -- asignado por el reservador. Prefijos DIAN de 0..4 caracteres permanecen
    -- fiscales; este valor de cuatro caracteres sólo atraviesa el writer POS.
    SELECT upper(btrim(coalesce(
      ds.metadata->>'dian_writer_alias', ds.serie
    ))) INTO v_alias
    FROM public.dian_numeracion_reservas r
    JOIN public.documento_series ds
      ON ds.id = r.documento_serie_id AND ds.tenant_id = r.tenant_id
    WHERE r.id = v_reservation_id AND r.tenant_id = p_tenant_id
    FOR SHARE OF ds;
    IF v_alias IS NULL OR v_alias !~ '^[A-Z0-9]{4}$' OR v_alias ~ '^T' THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_INTERNAL_ALIAS_INVALID'
        USING ERRCODE = '23514';
    END IF;
    v_metadata := coalesce(v_cpe->'metadata', '{}'::jsonb);
    IF jsonb_typeof(v_metadata) <> 'object' THEN
      RAISE EXCEPTION 'DIAN_POS_METADATA_INVALID' USING ERRCODE = '22023';
    END IF;
    v_metadata := v_metadata || jsonb_build_object(
      'dian_number_reservation_id', v_reservation_id,
      'dian_resolucion_numero', v_reservation->>'resolucion_numero',
      'dian_prefijo_autorizado', v_prefijo,
      'dian_fecha_emision', v_fecha,
      'dian_hora_emision', to_char(v_hora_emision, 'HH24:MI:SS'),
      'dian_numbering_contract_version', 530
    );
    v_cpe := jsonb_set(v_cpe, '{serie}', to_jsonb(v_alias), true);
    v_cpe := jsonb_set(v_cpe, '{fecha_emision}', to_jsonb(v_fecha::text), true);
    v_cpe := jsonb_set(
      v_cpe,
      '{hora_emision}',
      to_jsonb(to_char(v_hora_emision, 'HH24:MI:SS')),
      true
    );
    v_cpe := jsonb_set(v_cpe, '{fecha_vencimiento}', to_jsonb(v_fecha::text), true);
    v_cpe := jsonb_set(v_cpe, '{metadata}', v_metadata, true);
    v_payload := jsonb_set(v_payload, '{cpe_data}', v_cpe, true);

    PERFORM set_config('app.dian_numbering_tenant_id', p_tenant_id::text, true);
    PERFORM set_config('app.dian_numbering_idempotency_key', v_reservation_key, true);
    PERFORM set_config('app.dian_numbering_prefijo', v_prefijo, true);
    PERFORM set_config('app.dian_numbering_alias', v_alias, true);
    PERFORM set_config('app.dian_numbering_correlativo', v_numero::text, true);
    PERFORM set_config('app.dian_numbering_consumed', '0', true);
  END IF;

  v_result := app.pos_registrar_venta_atomic_tx_518(
    p_tenant_id, p_usuario_id, p_sesion_caja_id,
    v_key, v_payload
  );

  IF NOT v_real_co THEN
    RETURN v_result;
  END IF;

  IF current_setting('app.dian_numbering_consumed', true) <> '1'
     AND NOT coalesce((v_result->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'DIAN_POS_RESERVED_NUMBER_NOT_CONSUMED'
      USING ERRCODE = '23514';
  END IF;

  v_venta_id := app.to_uuid_or_null(coalesce(v_result->>'venta_id', ''));
  v_documento_id := app.to_uuid_or_null(coalesce(v_result->>'documento_id', ''));
  v_cxc_id := app.to_uuid_or_null(coalesce(v_result->>'cuenta_por_cobrar_id', ''));
  v_event_id := app.to_uuid_or_null(coalesce(v_result->>'accounting_event_id', ''));
  v_numero_padded := lpad(v_numero::text, 8, '0');
  -- La identidad DIAN autorizada no agrega ceros ni separadores ajenos al
  -- rango devuelto por GetNumberingRange. El padding queda sólo como alias
  -- operativo de la columna documentos.numero.
  v_numero_fiscal := v_prefijo || v_numero::text;
  v_result := v_result || jsonb_build_object(
    'numero_fiscal', v_numero_fiscal,
    'dian_number_reservation_id', v_reservation_id,
    'dian_numbering_contract_version', 530
  );

  SELECT
    greatest(0, (
      (d.fecha_vencimiento AT TIME ZONE app.zona_horaria_pais(v_pais))::date
      - (d.fecha_emision AT TIME ZONE app.zona_horaria_pais(v_pais))::date
    )),
    upper(coalesce(nullif(btrim(v.cpe_data->>'condicion_pago'), ''), 'CONTADO'))
  INTO v_plazo_dias, v_condicion_pago
  FROM public.documentos d
  JOIN public.ventas_pos v
    ON v.id = v_venta_id AND v.tenant_id = d.tenant_id
  WHERE d.id = v_documento_id AND d.tenant_id = p_tenant_id;
  IF NOT FOUND OR v_condicion_pago NOT IN ('CONTADO', 'CREDITO') THEN
    RAISE EXCEPTION 'DIAN_POS_PAYMENT_SNAPSHOT_INVALID'
      USING ERRCODE = '23514';
  END IF;
  v_vencimiento := v_fecha + coalesce(v_plazo_dias, 0);

  UPDATE public.ventas_pos v
  SET cpe_data = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(v.cpe_data, '{}'::jsonb),
              '{serie}', to_jsonb(v_prefijo), true),
            '{fecha_emision}', to_jsonb(v_fecha::text), true),
          '{fecha_vencimiento}', to_jsonb(v_vencimiento::text), true),
        '{metadata}',
        coalesce(v.cpe_data->'metadata', '{}'::jsonb) || jsonb_build_object(
          'dian_forma_pago', v_condicion_pago,
          'plazo_pago_dias', v_plazo_dias,
          'dian_number_reservation_id', v_reservation_id,
          'dian_prefijo_autorizado', v_prefijo,
          'numero_fiscal', v_numero_fiscal,
          'dian_numbering_contract_version', 530
        ), true
      ) || jsonb_build_object(
        'numero_fiscal', v_numero_fiscal,
        'dian_number_reservation_id', v_reservation_id,
        'dian_numbering_contract_version', 530
      ),
      atomic_result = v_result,
      updated_at = now()
  WHERE v.id = v_venta_id AND v.tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIAN_POS_SALE_NOT_FOUND_AFTER_WRITE'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.documentos d
  SET serie = v_prefijo,
      fecha_emision = v_fecha::timestamp
        AT TIME ZONE app.zona_horaria_pais(v_pais),
      fecha_vencimiento = v_vencimiento::timestamp
        AT TIME ZONE app.zona_horaria_pais(v_pais),
       metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
         'dian_number_reservation_id', v_reservation_id,
         'dian_prefijo_autorizado', v_prefijo,
         'numero_fiscal', v_numero_fiscal,
         'dian_numbering_contract_version', 530
       ),
      updated_at = now()
  WHERE d.id = v_documento_id AND d.tenant_id = p_tenant_id
    AND d.numero = v_numero_padded;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIAN_POS_DOCUMENT_NOT_FOUND_AFTER_WRITE'
      USING ERRCODE = '23514';
  END IF;

  IF v_cxc_id IS NOT NULL THEN
    UPDATE public.cuentas_por_cobrar c
    SET serie = v_prefijo,
        numero_documento = v_numero_fiscal,
        fecha_emision = v_fecha,
        fecha_vencimiento = v_vencimiento,
         metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
           'dian_number_reservation_id', v_reservation_id,
           'dian_prefijo_autorizado', v_prefijo,
           'numero_fiscal', v_numero_fiscal,
           'dian_numbering_contract_version', 530
         ),
        updated_at = now()
    WHERE c.id = v_cxc_id AND c.tenant_id = p_tenant_id
      AND c.numero = v_numero_padded;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'DIAN_POS_CXC_NOT_FOUND_AFTER_WRITE'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.outbox_events o
  SET payload = jsonb_set(o.payload, '{numeroFiscal}', to_jsonb(v_numero_fiscal), true)
      || jsonb_build_object(
        'numero_fiscal', v_numero_fiscal,
        'dianPrefijoAutorizado', v_prefijo,
        'dianNumberReservationId', v_reservation_id,
        'dianNumberingContractVersion', 530
      ),
      updated_at = now()
  WHERE o.tenant_id = p_tenant_id AND o.event_id = v_event_id
    AND o.event_type = 'pos.venta.registrada';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIAN_POS_OUTBOX_NOT_FOUND_AFTER_WRITE'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ventas_pos v
    WHERE v.id = v_venta_id AND v.tenant_id = p_tenant_id
      AND (v.cpe_data->>'serie' IS DISTINCT FROM v_prefijo
        OR (v.cpe_data->>'numero')::integer IS DISTINCT FROM v_numero
        OR v.cpe_data->>'numero_fiscal' IS DISTINCT FROM v_numero_fiscal
        OR v.cpe_data #>> '{metadata,numero_fiscal}' IS DISTINCT FROM v_numero_fiscal
        OR v.cpe_data #>> '{metadata,dian_prefijo_autorizado}' IS DISTINCT FROM v_prefijo
        OR (v.cpe_data->>'fecha_emision')::date IS DISTINCT FROM v_fecha
        OR (v.cpe_data->>'fecha_vencimiento')::date IS DISTINCT FROM v_vencimiento
        OR upper(v.cpe_data #>> '{metadata,dian_forma_pago}')
          IS DISTINCT FROM v_condicion_pago)
  ) OR EXISTS (
    SELECT 1 FROM public.documentos d
    WHERE d.id = v_documento_id AND d.tenant_id = p_tenant_id
      AND (d.serie IS DISTINCT FROM v_prefijo
        OR d.numero IS DISTINCT FROM v_numero_padded
        OR d.metadata->>'numero_fiscal' IS DISTINCT FROM v_numero_fiscal
        OR d.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM v_prefijo
        OR (d.fecha_emision AT TIME ZONE app.zona_horaria_pais(v_pais))::date
          IS DISTINCT FROM v_fecha
        OR (d.fecha_vencimiento AT TIME ZONE app.zona_horaria_pais(v_pais))::date
          IS DISTINCT FROM v_vencimiento)
  ) OR (v_cxc_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.cuentas_por_cobrar c
    WHERE c.id = v_cxc_id AND c.tenant_id = p_tenant_id
      AND (c.serie IS DISTINCT FROM v_prefijo
        OR c.numero_documento IS DISTINCT FROM v_numero_fiscal
        OR c.metadata->>'numero_fiscal' IS DISTINCT FROM v_numero_fiscal
        OR c.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM v_prefijo
        OR c.fecha_emision IS DISTINCT FROM v_fecha
        OR c.fecha_vencimiento IS DISTINCT FROM v_vencimiento)
  )) OR EXISTS (
    SELECT 1 FROM public.outbox_events o
    WHERE o.tenant_id = p_tenant_id AND o.event_id = v_event_id
      AND (o.payload->>'numeroFiscal' IS DISTINCT FROM v_numero_fiscal
        OR o.payload->>'numero_fiscal' IS DISTINCT FROM v_numero_fiscal
        OR o.payload->>'dianPrefijoAutorizado' IS DISTINCT FROM v_prefijo)
  ) THEN
    RAISE EXCEPTION 'DIAN_POS_NUMBERING_POSTCONDITION_FAILED'
      USING ERRCODE = '23514';
  END IF;

  -- El POS persiste primero la venta y el documento reservado; el CPE se
  -- completa por `finalizar_cpe_pos_tx` en el mismo pipeline asíncrono. El
  -- correlativo ya quedó usado desde este commit y por tanto pasa a CONSUMIDA
  -- ligado a esa identidad, aunque cpe_id todavía sea NULL. Nunca se devuelve
  -- ni se decrementa el contador de la resolución.
  UPDATE public.dian_numeracion_reservas r
  SET estado = 'CONSUMIDA',
      consumida_at = coalesce(r.consumida_at, now()),
      documento_id = coalesce(r.documento_id, v_documento_id),
      venta_pos_id = coalesce(r.venta_pos_id, v_venta_id)
  WHERE r.id = v_reservation_id
    AND r.tenant_id = p_tenant_id
    AND (
      r.estado = 'RESERVADA'
      OR (
        r.estado = 'CONSUMIDA'
        AND r.documento_id = v_documento_id
        AND r.venta_pos_id = v_venta_id
      )
    );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 OR EXISTS (
    SELECT 1 FROM public.dian_numeracion_reservas r
    WHERE r.id = v_reservation_id AND r.tenant_id = p_tenant_id
      AND (
        r.estado <> 'CONSUMIDA'
        OR r.documento_id IS DISTINCT FROM v_documento_id
        OR r.venta_pos_id IS DISTINCT FROM v_venta_id
        OR r.consumida_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'DIAN_POS_RESERVATION_NOT_CONSUMED'
      USING ERRCODE = '23514';
  END IF;

  v_result := v_result || jsonb_build_object(
    'dian_numbering_status', 'CONSUMIDA'
  );
  UPDATE public.ventas_pos v
  SET atomic_result = v_result, updated_at = now()
  WHERE v.id = v_venta_id AND v.tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIAN_POS_RESULT_NOT_SEALED'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_registrar_venta_atomic_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_sesion_caja_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT CASE
    WHEN coalesce(($5->>'emitir_cpe')::boolean, true)
      AND EXISTS (
        SELECT 1
        FROM public.empresa_config ec
        WHERE ec.tenant_id = $1
          AND upper(coalesce(ec.pais, '')) = 'CO'
          AND NOT coalesce(ec.is_demo, false)
      )
    THEN app.pos_registrar_venta_atomic_tx_530($1, $2, $3, $4, $5)
    ELSE app.pos_registrar_venta_atomic_tx_518($1, $2, $3, $4, $5)
  END;
$function$;

-- La 521 finaliza el CPE POS en un segundo commit. Se conserva intacta como
-- implementación heredada y esta frontera 530 enlaza de forma atómica el CPE
-- recién creado con la reserva ya consumida por venta/documento. También
-- restaura la identidad fiscal exacta (sin padding ni alias interno).
ALTER FUNCTION public.finalizar_cpe_pos_tx(uuid,uuid,uuid,jsonb,text)
  RENAME TO finalizar_cpe_pos_tx_521_legacy_530;

REVOKE ALL ON FUNCTION public.finalizar_cpe_pos_tx_521_legacy_530(
  uuid,uuid,uuid,jsonb,text
) FROM PUBLIC, anon, authenticated, service_role;

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
  v_pais text;
  v_demo boolean;
  v_reserva public.dian_numeracion_reservas%ROWTYPE;
  v_payload jsonb := p_cpe;
  v_alias text;
  v_result jsonb;
  v_cpe_id uuid;
  v_documento_id uuid;
  v_numero_fiscal text;
  v_cpe_row public.cpe%ROWTYPE;
  v_rows integer;
BEGIN
  SELECT upper(coalesce(ec.pais, '')), coalesce(ec.is_demo, false)
  INTO v_pais, v_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  IF v_pais <> 'CO' OR coalesce(v_demo, false) THEN
    RETURN public.finalizar_cpe_pos_tx_521_legacy_530(
      p_tenant_id, p_actor_id, p_venta_id, p_cpe, p_idempotency_key
    );
  END IF;

  BEGIN
    SELECT * INTO STRICT v_reserva
    FROM public.dian_numeracion_reservas r
    WHERE r.tenant_id = p_tenant_id
      AND r.venta_pos_id = p_venta_id
      AND r.estado = 'CONSUMIDA'
    FOR UPDATE;
  EXCEPTION
    WHEN no_data_found THEN
      RAISE EXCEPTION 'DIAN_POS_CONSUMED_RESERVATION_REQUIRED'
        USING ERRCODE = '23514';
    WHEN too_many_rows THEN
      RAISE EXCEPTION 'DIAN_POS_RESERVATION_AMBIGUOUS'
        USING ERRCODE = '23514';
  END;

  v_documento_id := app.to_uuid_or_null(coalesce(p_cpe->>'documento_id', ''));
  v_numero_fiscal := v_reserva.numero_completo;
  IF upper(btrim(coalesce(p_cpe->>'tipo_documento', ''))) <> '01'
     OR v_documento_id IS DISTINCT FROM v_reserva.documento_id
     OR upper(btrim(coalesce(p_cpe->>'serie', ''))) IS DISTINCT FROM v_reserva.prefijo
     OR btrim(coalesce(p_cpe->>'numero', '')) !~ '^[0-9]+$'
     OR (p_cpe->>'numero')::integer IS DISTINCT FROM v_reserva.correlativo
     OR p_cpe #>> '{metadata,dian_number_reservation_id}'
          IS DISTINCT FROM v_reserva.id::text
     OR p_cpe #>> '{metadata,dian_prefijo_autorizado}'
          IS DISTINCT FROM v_reserva.prefijo
     OR p_cpe #>> '{metadata,numero_fiscal}'
          IS DISTINCT FROM v_numero_fiscal
     OR p_cpe #>> '{metadata,dian_numbering_contract_version}' <> '530' THEN
    RAISE EXCEPTION 'DIAN_POS_FINALIZATION_NUMBERING_SNAPSHOT_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  -- La 521 exige serie no vacía. Para una resolución DIAN sin prefijo se usa
  -- sólo dentro de esta transacción el alias opaco ligado a la reserva.
  -- El XML ya firmado y el estado final conservan el prefijo vacío autorizado.
  IF v_reserva.prefijo = '' THEN
    SELECT upper(btrim(ds.serie)) INTO v_alias
    FROM public.documento_series ds
    WHERE ds.id = v_reserva.documento_serie_id
      AND ds.tenant_id = p_tenant_id
    FOR SHARE;
    IF v_alias IS NULL OR v_alias !~ '^D[A-F0-9]{3}$' THEN
      RAISE EXCEPTION 'DIAN_NUMBERING_INTERNAL_ALIAS_INVALID'
        USING ERRCODE = '23514';
    END IF;
    PERFORM set_config('app.dian_writer_alias_530', '1', true);
    UPDATE public.ventas_pos v
    SET cpe_data = jsonb_set(v.cpe_data, '{serie}', to_jsonb(v_alias), true),
        updated_at = now()
    WHERE v.id = p_venta_id AND v.tenant_id = p_tenant_id
      AND v.documento_id = v_reserva.documento_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'DIAN_POS_SALE_ALIAS_NOT_APPLIED'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.cpe c
    SET serie = v_alias, numero = lpad(v_reserva.correlativo::text, 8, '0'),
        updated_at = now()
    WHERE c.id = v_reserva.cpe_id AND c.tenant_id = p_tenant_id;
    v_payload := jsonb_set(p_cpe, '{serie}', to_jsonb(v_alias), true);
  END IF;

  v_result := public.finalizar_cpe_pos_tx_521_legacy_530(
    p_tenant_id, p_actor_id, p_venta_id, v_payload, p_idempotency_key
  );
  PERFORM set_config('app.dian_writer_alias_530', '0', true);

  v_cpe_id := app.to_uuid_or_null(coalesce(
    v_result->>'cpe_id', v_result #>> '{cpe,id}', ''
  ));
  v_documento_id := app.to_uuid_or_null(coalesce(
    v_result->>'documento_id', ''
  ));
  IF v_cpe_id IS NULL OR v_documento_id IS DISTINCT FROM v_reserva.documento_id
     OR app.to_uuid_or_null(coalesce(v_result #>> '{venta,cpe_id}', ''))
          IS DISTINCT FROM v_cpe_id THEN
    RAISE EXCEPTION 'DIAN_POS_FINALIZATION_RESULT_INVALID'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.cpe c
  SET serie = v_reserva.prefijo,
      numero = v_reserva.correlativo::text,
      numero_comprobante = v_reserva.correlativo,
      metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'dian_number_reservation_id', v_reserva.id,
        'dian_resolucion_numero', v_reserva.resolucion_numero,
        'dian_prefijo_autorizado', v_reserva.prefijo,
        'numero_fiscal', v_numero_fiscal,
        'dian_numbering_contract_version', 530
      ),
      updated_at = now()
  WHERE c.id = v_cpe_id AND c.tenant_id = p_tenant_id
    AND c.documento_id = v_reserva.documento_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIAN_POS_CPE_IDENTITY_NOT_SEALED'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.documentos d
  SET serie = v_reserva.prefijo,
      metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
        'dian_number_reservation_id', v_reserva.id,
        'dian_prefijo_autorizado', v_reserva.prefijo,
        'numero_fiscal', v_numero_fiscal,
        'dian_numbering_contract_version', 530,
        'cpe_id', v_cpe_id
      ),
      updated_at = now()
  WHERE d.id = v_reserva.documento_id AND d.tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIAN_POS_DOCUMENT_IDENTITY_NOT_SEALED'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.ventas_pos v
  SET cpe_data = jsonb_set(
        jsonb_set(coalesce(v.cpe_data, '{}'::jsonb),
          '{serie}', to_jsonb(v_reserva.prefijo), true),
        '{metadata}',
        coalesce(v.cpe_data->'metadata', '{}'::jsonb) || jsonb_build_object(
          'dian_number_reservation_id', v_reserva.id,
          'dian_prefijo_autorizado', v_reserva.prefijo,
          'numero_fiscal', v_numero_fiscal,
          'dian_numbering_contract_version', 530
        ), true
      ) || jsonb_build_object(
        'numero_fiscal', v_numero_fiscal,
        'dian_number_reservation_id', v_reserva.id,
        'dian_numbering_contract_version', 530
      ),
      atomic_result = coalesce(v.atomic_result, '{}'::jsonb) || jsonb_build_object(
        'cpe_id', v_cpe_id,
        'numero_fiscal', v_numero_fiscal,
        'dian_number_reservation_id', v_reserva.id,
        'dian_numbering_contract_version', 530,
        'dian_numbering_status', 'CONSUMIDA'
      ),
      updated_at = now()
  WHERE v.id = p_venta_id AND v.tenant_id = p_tenant_id
    AND v.cpe_id = v_cpe_id AND v.documento_id = v_reserva.documento_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIAN_POS_SALE_CPE_IDENTITY_NOT_SEALED'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.outbox_events o
  SET payload = coalesce(o.payload, '{}'::jsonb) || jsonb_build_object(
        'serie', v_reserva.prefijo,
        'numero', v_reserva.correlativo,
        'numeroFiscal', v_numero_fiscal,
        'numero_fiscal', v_numero_fiscal,
        'dianPrefijoAutorizado', v_reserva.prefijo,
        'dianNumberReservationId', v_reserva.id,
        'dianNumberingContractVersion', 530
      ),
      updated_at = now()
  WHERE o.tenant_id = p_tenant_id
    AND o.event_type = 'comprobante.creado'
    AND (o.aggregate_id = v_cpe_id::text OR o.payload->>'cpeId' = v_cpe_id::text);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIAN_POS_CPE_OUTBOX_IDENTITY_NOT_SEALED'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.dian_numeracion_reservas r
  SET cpe_id = coalesce(r.cpe_id, v_cpe_id)
  WHERE r.id = v_reserva.id AND r.tenant_id = p_tenant_id
    AND r.estado = 'CONSUMIDA'
    AND r.documento_id = v_reserva.documento_id
    AND r.venta_pos_id = p_venta_id
    AND (r.cpe_id IS NULL OR r.cpe_id = v_cpe_id);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'DIAN_POS_CPE_RESERVATION_NOT_LINKED'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_cpe_row
  FROM public.cpe c
  WHERE c.id = v_cpe_id AND c.tenant_id = p_tenant_id;
  IF v_cpe_row.id IS NULL
     OR v_cpe_row.serie IS DISTINCT FROM v_reserva.prefijo
     OR v_cpe_row.numero IS DISTINCT FROM v_reserva.correlativo::text
     OR v_cpe_row.metadata->>'numero_fiscal' IS DISTINCT FROM v_numero_fiscal
     OR v_cpe_row.metadata->>'dian_number_reservation_id'
          IS DISTINCT FROM v_reserva.id::text
     OR NOT EXISTS (
       SELECT 1 FROM public.dian_numeracion_reservas r
       WHERE r.id = v_reserva.id AND r.tenant_id = p_tenant_id
         AND r.estado = 'CONSUMIDA' AND r.cpe_id = v_cpe_id
         AND r.documento_id = v_reserva.documento_id
         AND r.venta_pos_id = p_venta_id
     ) THEN
    RAISE EXCEPTION 'DIAN_POS_CPE_RESERVATION_POSTCONDITION_FAILED'
      USING ERRCODE = '23514';
  END IF;

  v_result := jsonb_set(v_result, '{cpe}', to_jsonb(v_cpe_row), true)
    || jsonb_build_object(
      'cpe_id', v_cpe_id,
      'numero_fiscal', v_numero_fiscal,
      'dian_number_reservation_id', v_reserva.id,
      'dian_numbering_contract_version', 530,
      'dian_numbering_status', 'CONSUMIDA'
    );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.pos_canjear_ticket_tx_530(
  p_tenant_id uuid,
  p_venta_pos_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_pais text;
  v_demo boolean;
BEGIN
  SELECT upper(coalesce(ec.pais, '')), coalesce(ec.is_demo, false)
  INTO v_pais, v_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;
  IF v_pais = 'CO' AND NOT coalesce(v_demo, false) THEN
    RAISE EXCEPTION 'DIAN_POS_TICKET_EXCHANGE_REQUIRES_FEV_FLOW'
      USING ERRCODE = '23514',
        HINT = 'Emita la FEV tipo 01 desde el POS; el ticket interno no es un documento fiscal DIAN.';
  END IF;
  RETURN app.pos_canjear_ticket_tx_471(
    p_tenant_id, p_venta_pos_id, p_actor_id, p_idempotency_key, p_payload
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_canjear_ticket_tx(
  p_tenant_id uuid,
  p_venta_pos_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.pos_canjear_ticket_tx_530($1, $2, $3, $4, $5);
$function$;

CREATE OR REPLACE FUNCTION public.reservar_numeracion_dian_ui_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_tipo_documento text,
  p_fecha_emision date,
  p_idempotency_key text,
  p_intent_fingerprint text,
  p_pedido_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
BEGIN
  IF lower(btrim(coalesce(p_intent_fingerprint, ''))) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'DIAN_NUMBERING_INTENT_FINGERPRINT_REQUIRED'
      USING ERRCODE = '22023';
  END IF;
  RETURN app.reservar_numeracion_dian_ui_tx_530(
    p_tenant_id, p_actor_id, p_tipo_documento,
    p_fecha_emision, p_idempotency_key, p_pedido_id, p_intent_fingerprint
  );
END;
$function$;

REVOKE ALL ON FUNCTION app.assert_order_invoice_key_owner_530(uuid,text,uuid),
  app.customer_invoice_semantic_snapshot_530(jsonb,jsonb,uuid),
  app.reserve_customer_invoice_semantics_530(uuid,jsonb,jsonb,text,uuid),
  app.emitir_factura_cliente_tx_443_legacy_530(
    uuid,jsonb,jsonb,jsonb,jsonb,uuid,text
  ),
  app.emitir_factura_cliente_tx(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text),
  app.reservar_numeracion_dian_ui_tx_530(uuid,uuid,text,date,text,uuid,text),
  app.obtener_siguiente_numero_documento_legacy_530(uuid,text,text),
  app.preserve_dian_optional_prefix_530(),
  app.pos_registrar_venta_atomic_tx_530(uuid,uuid,uuid,text,jsonb),
  app.pos_canjear_ticket_tx_530(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.emitir_factura_cliente_tx(
  uuid,jsonb,jsonb,jsonb,jsonb,uuid,text
), public.reservar_numeracion_dian_ui_tx(uuid,uuid,text,date,text,text,uuid),
  public.anular_reserva_numeracion_dian_tx(uuid,uuid,uuid,text),
  public.obtener_siguiente_numero_documento(uuid,text,text),
  public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb),
  public.finalizar_cpe_pos_tx(uuid,uuid,uuid,jsonb,text),
  public.pos_canjear_ticket_tx(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.emitir_factura_cliente_tx(
  uuid,jsonb,jsonb,jsonb,jsonb,uuid,text
), public.reservar_numeracion_dian_ui_tx(uuid,uuid,text,date,text,text,uuid)
  , public.anular_reserva_numeracion_dian_tx(uuid,uuid,uuid,text)
  , public.obtener_siguiente_numero_documento(uuid,text,text)
  , public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)
  , public.finalizar_cpe_pos_tx(uuid,uuid,uuid,jsonb,text)
  , public.pos_canjear_ticket_tx(uuid,uuid,uuid,text,jsonb)
  TO service_role;

COMMENT ON FUNCTION public.reservar_numeracion_dian_ui_tx(
  uuid,uuid,text,date,text,text,uuid
) IS 'Reserva idempotente de factura DIAN 01 desde la resolucion vigente del tenant; exige huella economica canonica del servidor, no acepta prefijo libre y liga las claves de pedido a su lifecycle fiscal.';

COMMENT ON FUNCTION public.anular_reserva_numeracion_dian_tx(
  uuid,uuid,uuid,text
) IS 'Anula una reserva DIAN todavía huérfana sin reutilizar ni retroceder jamás el correlativo autorizado.';

COMMENT ON FUNCTION public.finalizar_cpe_pos_tx(
  uuid,uuid,uuid,jsonb,text
) IS 'Finaliza el CPE POS y enlaza atómicamente venta, documento y CPE con la reserva DIAN consumida y su identidad fiscal exacta.';

COMMENT ON FUNCTION public.emitir_factura_cliente_tx(
  uuid,jsonb,jsonb,jsonb,jsonb,uuid,text
) IS 'Emision atomica 443 con guarda semantica 530 para cliente, fechas, pago y perfil tributario DIAN.';

COMMIT;

NOTIFY pgrst, 'reload schema';
