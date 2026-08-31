-- Pedido -> CPE Colombia: la intención comercial y su snapshot fiscal deben
-- compartir la misma transacción que create/update/convert. El congelamiento
-- usa un lock de fila; `updated_at` no es un token de concurrencia fiscal.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION app.normalizar_intencion_pago_pedido_531(
  p_input jsonb,
  p_existing jsonb DEFAULT NULL,
  p_fecha_emision date DEFAULT NULL,
  p_congelar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_input jsonb := coalesce(p_input, '{}'::jsonb);
  v_existing jsonb := coalesce(p_existing, '{}'::jsonb);
  v_supplied_condition boolean;
  v_condition text;
  v_existing_condition text;
  v_means text;
  v_term_text text;
  v_term integer;
  v_due_text text;
  v_due date;
BEGIN
  IF jsonb_typeof(v_input) <> 'object' OR jsonb_typeof(v_existing) <> 'object' THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INVALID' USING ERRCODE = '22023';
  END IF;

  v_supplied_condition := v_input ? 'condicion_pago'
    AND nullif(btrim(v_input->>'condicion_pago'), '') IS NOT NULL;
  v_existing_condition := upper(nullif(btrim(v_existing->>'condicion_pago'), ''));
  v_condition := upper(coalesce(
    nullif(btrim(v_input->>'condicion_pago'), ''),
    nullif(btrim(v_existing->>'condicion_pago'), '')
  ));
  IF v_condition = 'CRÉDITO' THEN v_condition := 'CREDITO'; END IF;
  IF v_condition IS NOT NULL AND v_condition NOT IN ('CONTADO', 'CREDITO') THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INVALID: condicion_pago'
      USING ERRCODE = '22023';
  END IF;

  v_means := upper(coalesce(
    nullif(btrim(v_input->>'medio_pago'), ''),
    nullif(btrim(v_existing->>'medio_pago'), '')
  ));
  IF v_means IS NOT NULL AND v_means !~ '^(?:[0-9]{1,3}|ZZZ)$' THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INVALID: medio_pago'
      USING ERRCODE = '22023';
  END IF;

  v_term_text := coalesce(
    nullif(btrim(v_input->>'plazo_pago_dias'), ''),
    nullif(btrim(v_existing->>'plazo_pago_dias'), '')
  );
  IF v_term_text IS NOT NULL THEN
    IF v_term_text !~ '^[0-9]+$' OR v_term_text::numeric > 2147483647 THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INVALID: plazo_pago_dias'
        USING ERRCODE = '22023';
    END IF;
    v_term := v_term_text::integer;
  END IF;

  v_due_text := coalesce(
    nullif(btrim(v_input->>'fecha_vencimiento'), ''),
    nullif(btrim(v_existing->>'fecha_vencimiento'), '')
  );
  IF v_due_text IS NOT NULL THEN
    IF v_due_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR to_char(to_date(v_due_text, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> v_due_text THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INVALID: fecha_vencimiento'
        USING ERRCODE = '22023';
    END IF;
    v_due := v_due_text::date;
  END IF;

  -- Cambiar explícitamente de crédito a contado no arrastra plazo/vencimiento
  -- históricos salvo que el mismo patch los vuelva a declarar.
  IF v_supplied_condition AND v_condition = 'CONTADO'
     AND v_existing_condition IS DISTINCT FROM 'CONTADO' THEN
    v_term := CASE WHEN v_input ? 'plazo_pago_dias'
      THEN nullif(btrim(v_input->>'plazo_pago_dias'), '')::integer ELSE 0 END;
    v_due := CASE WHEN v_input ? 'fecha_vencimiento'
      THEN nullif(btrim(v_input->>'fecha_vencimiento'), '')::date ELSE NULL END;
  END IF;

  IF v_condition IS NULL AND (
    v_means IS NOT NULL OR v_term IS NOT NULL OR v_due IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INCOMPLETE: condicion_pago'
      USING ERRCODE = '23514';
  END IF;

  IF NOT p_congelar THEN
    IF v_condition = 'CONTADO' AND coalesce(v_term, 0) <> 0 THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INCONSISTENT: contado con plazo'
        USING ERRCODE = '23514';
    END IF;
    IF v_condition = 'CREDITO' AND v_term IS NULL AND v_due IS NULL THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INCOMPLETE: credito sin plazo'
        USING ERRCODE = '23514';
    END IF;
    IF v_condition IS NULL THEN RETURN NULL; END IF;
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'condicion_pago', v_condition,
      'medio_pago', v_means,
      'plazo_pago_dias', v_term,
      'fecha_vencimiento', CASE WHEN v_due IS NULL THEN NULL ELSE v_due::text END
    ));
  END IF;

  IF p_fecha_emision IS NULL THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INVALID: fecha_emision'
      USING ERRCODE = '22023';
  END IF;
  v_condition := coalesce(v_condition, 'CONTADO');
  IF v_condition = 'CONTADO' THEN
    v_term := coalesce(v_term, 0);
    v_due := coalesce(v_due, p_fecha_emision);
    IF v_term <> 0 OR v_due <> p_fecha_emision THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INCONSISTENT: contado'
        USING ERRCODE = '23514';
    END IF;
    v_means := coalesce(v_means, '10');
  ELSE
    IF v_term IS NULL AND v_due IS NULL THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INCOMPLETE: credito'
        USING ERRCODE = '23514';
    END IF;
    IF v_due IS NULL THEN v_due := p_fecha_emision + v_term; END IF;
    IF v_term IS NULL THEN v_term := v_due - p_fecha_emision; END IF;
    IF v_term < 1 OR v_due - p_fecha_emision <> v_term THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_INCONSISTENT: credito'
        USING ERRCODE = '23514';
    END IF;
    v_means := coalesce(v_means, '1');
  END IF;

  RETURN jsonb_build_object(
    'condicion_pago', v_condition,
    'medio_pago', v_means,
    'plazo_pago_dias', v_term,
    'fecha_emision', p_fecha_emision::text,
    'fecha_vencimiento', v_due::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_pedido_comercial_pago_tx_531(
  p_pedido jsonb,
  p_detalle jsonb,
  p_payment_intent jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := nullif(p_pedido->>'tenant_id', '')::uuid;
  v_pais text;
  v_intent jsonb;
  v_result jsonb;
  v_pedido_id uuid;
BEGIN
  IF p_payment_intent IS NOT NULL THEN
    SELECT upper(coalesce(ec.pais, '')) INTO v_pais
    FROM public.empresa_config ec WHERE ec.tenant_id = v_tenant_id;
    IF v_pais IS DISTINCT FROM 'CO' THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_ONLY_CO' USING ERRCODE = '23514';
    END IF;
    v_intent := app.normalizar_intencion_pago_pedido_531(p_payment_intent);
  END IF;
  v_result := public.crear_pedido_comercial_tx(p_pedido, p_detalle);
  v_pedido_id := nullif(v_result->>'pedido_id', '')::uuid;
  IF v_intent IS NOT NULL THEN
    UPDATE public.pedidos_venta
    SET metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('dian_payment_intent', v_intent),
      updated_at = now()
    WHERE id = v_pedido_id AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_pedido_comercial_pago_tx_531(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_patch jsonb,
  p_detalle jsonb,
  p_payment_intent jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_venta%ROWTYPE;
  v_pais text;
  v_intent jsonb;
  v_result jsonb;
BEGIN
  SELECT p.* INTO v_pedido FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002'; END IF;
  -- El snapshot no congela sólo la forma de pago: identifica el contrato fiscal
  -- completo que se está convirtiendo en CPE. Permitir cambiar cliente, líneas o
  -- totales sin reenviar campos de pago dejaría pedido y factura divergentes.
  IF coalesce(v_pedido.metadata, '{}'::jsonb) ? 'dian_payment_snapshot' THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_FROZEN' USING ERRCODE = '23514';
  END IF;
  IF p_payment_intent IS NOT NULL THEN
    SELECT upper(coalesce(ec.pais, '')) INTO v_pais
    FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id;
    IF v_pais IS DISTINCT FROM 'CO' THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_ONLY_CO' USING ERRCODE = '23514';
    END IF;
    v_intent := app.normalizar_intencion_pago_pedido_531(
      p_payment_intent,
      coalesce(v_pedido.metadata, '{}'::jsonb)->'dian_payment_intent'
    );
  END IF;
  v_result := public.actualizar_pedido_comercial_tx(
    p_pedido_id, p_tenant_id, p_patch, p_detalle
  );
  IF v_intent IS NOT NULL THEN
    UPDATE public.pedidos_venta
    SET metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('dian_payment_intent', v_intent),
      updated_at = now()
    WHERE id = p_pedido_id AND tenant_id = p_tenant_id;
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.convertir_cotizacion_comercial_a_pedido_pago_tx_531(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_notas text DEFAULT NULL,
  p_payment_intent jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_pais text;
  v_intent jsonb;
  v_result jsonb;
  v_pedido_id uuid;
BEGIN
  IF p_payment_intent IS NOT NULL THEN
    SELECT upper(coalesce(ec.pais, '')) INTO v_pais
    FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id;
    IF v_pais IS DISTINCT FROM 'CO' THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_ONLY_CO' USING ERRCODE = '23514';
    END IF;
    v_intent := app.normalizar_intencion_pago_pedido_531(p_payment_intent);
  END IF;
  v_result := public.convertir_cotizacion_comercial_a_pedido_tx(
    p_cotizacion_id, p_tenant_id, p_user_id, p_notas
  );
  v_pedido_id := nullif(v_result->>'pedido_id', '')::uuid;
  IF v_intent IS NOT NULL THEN
    UPDATE public.pedidos_venta
    SET metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('dian_payment_intent', v_intent),
      updated_at = now()
    WHERE id = v_pedido_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.congelar_pago_dian_pedido_tx_531(
  p_tenant_id uuid,
  p_pedido_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_venta%ROWTYPE;
  v_empresa public.empresa_config%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_metadata jsonb;
  v_existing jsonb;
  v_snapshot jsonb;
  v_detalle jsonb;
  v_productos jsonb;
  v_fiscal_snapshot jsonb;
  v_fiscal_sha256 text;
  v_lifecycle jsonb;
  v_lifecycle_history jsonb;
  v_lifecycle_at timestamptz;
  v_documento_tipo text;
  v_receiver_profile text;
  v_detail_count integer;
  v_product_count integer;
BEGIN
  IF p_tenant_id IS NULL OR p_pedido_id IS NULL
     OR length(btrim(coalesce(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_IDEMPOTENCY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT p.* INTO v_pedido FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002'; END IF;

  -- La configuracion que decide el pais y los datos impresos pertenece al
  -- mismo corte transaccional que pedido, cliente, lineas y productos.
  SELECT ec.* INTO v_empresa
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuracion de empresa no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF upper(coalesce(v_empresa.pais, '')) IS DISTINCT FROM 'CO' THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_ONLY_CO' USING ERRCODE = '23514';
  END IF;

  v_metadata := coalesce(v_pedido.metadata, '{}'::jsonb);
  v_existing := v_metadata->'dian_payment_snapshot';
  IF v_existing IS NOT NULL THEN
    IF jsonb_typeof(v_existing) <> 'object'
       OR btrim(coalesce(v_existing->>'idempotency_key', ''))
          IS DISTINCT FROM btrim(p_idempotency_key) THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23514';
    END IF;
    v_fiscal_snapshot := v_metadata->'dian_fiscal_snapshot';
    IF jsonb_typeof(v_fiscal_snapshot) IS DISTINCT FROM 'object'
       OR coalesce(v_fiscal_snapshot->>'sha256', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_FISCAL_SNAPSHOT_MISSING' USING ERRCODE = '23514';
    END IF;
    v_fiscal_sha256 := encode(extensions.digest(
      convert_to((v_fiscal_snapshot - 'sha256')::text, 'UTF8'), 'sha256'
    ), 'hex');
    IF v_fiscal_snapshot->>'sha256' IS DISTINCT FROM v_fiscal_sha256 THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_FISCAL_SNAPSHOT_CORRUPT' USING ERRCODE = '23514';
    END IF;
    IF v_existing IS DISTINCT FROM v_fiscal_snapshot->'payment_snapshot' THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_FISCAL_SNAPSHOT_CORRUPT' USING ERRCODE = '23514';
    END IF;
    v_lifecycle := v_metadata->'dian_fiscal_snapshot_lifecycle';
    IF v_lifecycle IS NULL THEN
      -- Compatibilidad para un snapshot 531 creado durante el despliegue antes
      -- de que existiera el lifecycle. No se libera ni se reconstruye el corte.
      v_lifecycle_at := clock_timestamp();
      v_lifecycle := jsonb_build_object(
        'version', 1,
        'state', 'PREPARED',
        'idempotency_key', btrim(p_idempotency_key),
        'prepared_at', v_lifecycle_at,
        'consumed_at', NULL,
        'aborted_at', NULL,
        'cpe_id', NULL,
        'history', jsonb_build_array(jsonb_build_object(
          'state', 'PREPARED', 'at', v_lifecycle_at,
          'reason', 'LEGACY_531_SNAPSHOT_ADOPTED'
        ))
      );
      v_metadata := v_metadata || jsonb_build_object(
        'dian_fiscal_snapshot_lifecycle', v_lifecycle
      );
      UPDATE public.pedidos_venta
      SET metadata = v_metadata, updated_at = now()
      WHERE id = p_pedido_id AND tenant_id = p_tenant_id;
    ELSIF jsonb_typeof(v_lifecycle) <> 'object'
       OR coalesce(v_lifecycle->>'state', '') NOT IN ('PREPARED', 'CONSUMED')
       OR btrim(coalesce(v_lifecycle->>'idempotency_key', ''))
          IS DISTINCT FROM btrim(p_idempotency_key)
       OR jsonb_typeof(coalesce(v_lifecycle->'history', 'null'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_FISCAL_LIFECYCLE_CORRUPT' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'metadata', v_metadata,
      'fiscal_snapshot', v_fiscal_snapshot,
      'fiscal_snapshot_canonical', (v_fiscal_snapshot - 'sha256')::text,
      'lifecycle', v_lifecycle,
      'idempotent', true
    );
  END IF;

  v_snapshot := app.normalizar_intencion_pago_pedido_531(
    NULL,
    v_metadata->'dian_payment_intent',
    app.hoy_tenant(p_tenant_id),
    true
  ) || jsonb_build_object(
    'version', 1,
    'idempotency_key', btrim(p_idempotency_key)
  );

  -- Todos los writers comerciales toman primero el lock del pedido. Una vez
  -- obtenido, se fijan las lineas en orden estable y luego sus maestros. Asi,
  -- una actualizacion que termino antes del lock aparece completa en el corte;
  -- una posterior queda bloqueada y, al reanudarse, ve el pedido congelado.
  PERFORM d.id
  FROM public.pedidos_venta_detalle d
  WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
  ORDER BY d.id
  FOR SHARE OF d;

  SELECT count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id,
           'pedido_id', d.pedido_id,
           'producto_id', d.producto_id,
           'descripcion', d.descripcion,
           'cantidad', d.cantidad,
           'precio_unitario', d.precio_unitario,
           'subtotal', d.subtotal,
           'cantidad_despachada', d.cantidad_despachada,
           'cantidad_facturada', d.cantidad_facturada,
           'estado_item', d.estado_item,
           'created_at', d.created_at,
           'updated_at', d.updated_at
         ) ORDER BY d.id), '[]'::jsonb)
  INTO v_detail_count, v_detalle
  FROM public.pedidos_venta_detalle d
  WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id;
  IF v_detail_count NOT BETWEEN 1 AND 999 THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_ITEMS_INVALID:%', v_detail_count USING ERRCODE = '23514';
  END IF;

  SELECT c.* INTO v_cliente
  FROM public.clientes c
  WHERE c.id = v_pedido.cliente_id AND c.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado' USING ERRCODE = 'P0002';
  END IF;

  PERFORM p.id
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND EXISTS (
      SELECT 1
      FROM public.pedidos_venta_detalle d
      WHERE d.pedido_id = p_pedido_id
        AND d.tenant_id = p_tenant_id
        AND d.producto_id = p.id
    )
  ORDER BY p.id
  FOR SHARE OF p;

  SELECT count(*)::integer,
         coalesce(jsonb_object_agg(p.id::text, jsonb_build_object(
           'id', p.id,
           'codigo', p.codigo,
           'afectacion_igv', p.afectacion_igv
         )), '{}'::jsonb)
  INTO v_product_count, v_productos
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND EXISTS (
      SELECT 1
      FROM public.pedidos_venta_detalle d
      WHERE d.pedido_id = p_pedido_id
        AND d.tenant_id = p_tenant_id
        AND d.producto_id = p.id
    );
  IF v_product_count IS DISTINCT FROM (
    SELECT count(DISTINCT d.producto_id)::integer
    FROM public.pedidos_venta_detalle d
    WHERE d.pedido_id = p_pedido_id AND d.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_PRODUCT_SNAPSHOT_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  -- Los demos conservan sus datos ilustrativos. En un contribuyente real CO,
  -- el snapshot sólo puede nacer con maestros DIAN completos y coherentes.
  -- Esta comprobación ocurre después de tomar los locks de líneas, cliente y
  -- productos: no hay una ventana entre validar y persistir el corte fiscal.
  IF NOT coalesce(v_empresa.is_demo, false) THEN
    IF EXISTS (
      SELECT 1
      FROM public.pedidos_venta_detalle d
      LEFT JOIN public.productos p
        ON p.id = d.producto_id AND p.tenant_id = d.tenant_id
      WHERE d.pedido_id = p_pedido_id
        AND d.tenant_id = p_tenant_id
        AND (
          d.producto_id IS NULL
          OR p.id IS NULL
          OR btrim(coalesce(p.afectacion_igv, '')) NOT IN ('10', '20', '30')
        )
    ) THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_PRODUCT_TAX_PROFILE_INVALID'
        USING ERRCODE = '23514';
    END IF;

    v_documento_tipo := upper(btrim(coalesce(
      v_cliente.documento_tipo, v_cliente.tipo_documento, ''
    )));
    v_receiver_profile := concat_ws('|',
      nullif(btrim(coalesce(v_cliente.dian_perfil_fiscal, '')), ''),
      nullif(btrim(coalesce(v_cliente.dian_responsabilidad_fiscal, '')), ''),
      nullif(btrim(coalesce(v_cliente.dian_responsabilidad_list_name, '')), ''),
      nullif(btrim(coalesce(v_cliente.dian_tributo_id, '')), ''),
      nullif(btrim(coalesce(v_cliente.dian_tributo_nombre, '')), '')
    );
    IF length(btrim(coalesce(
         v_cliente.ruc, v_cliente.documento_identidad,
         v_cliente.numero_documento::text, v_cliente.documento_numero::text,
         v_cliente.codigo, ''
       ))) = 0
       OR NOT (
         (
           v_documento_tipo = 'NIT'
           AND v_receiver_profile = 'ADQUIRIENTE_NIT_B2B|O-99|04|01|IVA'
         )
         OR (
           v_documento_tipo <> 'NIT'
           AND v_receiver_profile = 'CONSUMIDOR_FINAL|R-99-PN|49|ZY|No causa'
         )
       ) THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_RECEIVER_PROFILE_INVALID'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_fiscal_snapshot := jsonb_build_object(
    'version', 1,
    'pedido', jsonb_build_object(
      'id', v_pedido.id,
      'tenant_id', v_pedido.tenant_id,
      'numero', v_pedido.numero,
      'cotizacion_id', v_pedido.cotizacion_id,
      'cliente_id', v_pedido.cliente_id,
      'fecha_pedido', coalesce(v_pedido.fecha_pedido, v_pedido.fecha),
      'estado', v_pedido.estado,
      'subtotal', v_pedido.subtotal,
      'igv', v_pedido.igv,
      'total', v_pedido.total,
      'moneda', v_pedido.moneda,
      'observaciones', v_pedido.observaciones,
      'created_at', v_pedido.created_at,
      'updated_at', v_pedido.updated_at
    ),
    'detalle', v_detalle,
    'cliente', jsonb_build_object(
      'id', v_cliente.id,
      'tenant_id', v_cliente.tenant_id,
      'documento_tipo', coalesce(v_cliente.documento_tipo, v_cliente.tipo_documento),
      'documento_numero', coalesce(v_cliente.ruc, v_cliente.documento_identidad,
        v_cliente.numero_documento::text, v_cliente.documento_numero::text,
        v_cliente.codigo),
      'ruc', v_cliente.ruc,
      'codigo', v_cliente.codigo,
      'razon_social', v_cliente.razon_social,
      'nombre_comercial', v_cliente.nombre_comercial,
      'direccion', v_cliente.direccion,
      'email', v_cliente.email,
      'dian_perfil_fiscal', v_cliente.dian_perfil_fiscal,
      'dian_responsabilidad_fiscal', v_cliente.dian_responsabilidad_fiscal,
      'dian_responsabilidad_list_name', v_cliente.dian_responsabilidad_list_name,
      'dian_tributo_id', v_cliente.dian_tributo_id,
      'dian_tributo_nombre', v_cliente.dian_tributo_nombre
    ),
    'empresa', jsonb_build_object(
      'ruc', v_empresa.ruc,
      'razon_social', v_empresa.razon_social,
      'serie_factura', v_empresa.serie_factura,
      'serie_boleta', v_empresa.serie_boleta,
      'moneda_defecto', coalesce(nullif(v_empresa.moneda_defecto, ''), v_empresa.moneda),
      'pais', v_empresa.pais,
      'pais_id', v_empresa.pais_id,
      'is_demo', v_empresa.is_demo,
      'dian_resolucion_prefijo', v_empresa.dian_resolucion_prefijo
    ),
    'productos', v_productos,
    'tasa_impuesto', app.tasa_impuesto_tenant(p_tenant_id),
    'payment_snapshot', v_snapshot,
    'idempotency_key', btrim(p_idempotency_key)
  );
  v_fiscal_sha256 := encode(extensions.digest(
    convert_to(v_fiscal_snapshot::text, 'UTF8'), 'sha256'
  ), 'hex');
  v_fiscal_snapshot := v_fiscal_snapshot || jsonb_build_object('sha256', v_fiscal_sha256);
  v_lifecycle := v_metadata->'dian_fiscal_snapshot_lifecycle';
  IF v_lifecycle IS NOT NULL
     AND (
       jsonb_typeof(v_lifecycle) <> 'object'
       OR coalesce(v_lifecycle->>'state', '') <> 'ABORTED'
       OR jsonb_typeof(coalesce(v_lifecycle->'history', 'null'::jsonb)) <> 'array'
     ) THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_FISCAL_LIFECYCLE_CORRUPT' USING ERRCODE = '23514';
  END IF;
  v_lifecycle_history := CASE
    WHEN jsonb_typeof(v_lifecycle->'history') = 'array'
      THEN v_lifecycle->'history'
    ELSE '[]'::jsonb
  END;
  v_lifecycle_at := clock_timestamp();
  v_lifecycle := jsonb_build_object(
    'version', 1,
    'state', 'PREPARED',
    'idempotency_key', btrim(p_idempotency_key),
    'prepared_at', v_lifecycle_at,
    'consumed_at', NULL,
    'aborted_at', NULL,
    'cpe_id', NULL,
    'history', v_lifecycle_history || jsonb_build_array(jsonb_build_object(
      'state', 'PREPARED', 'at', v_lifecycle_at, 'reason', 'SNAPSHOT_CREATED'
    ))
  );
  v_metadata := v_metadata || jsonb_build_object(
    'dian_payment_snapshot', v_snapshot,
    'dian_fiscal_snapshot', v_fiscal_snapshot,
    'dian_fiscal_snapshot_lifecycle', v_lifecycle
  );
  UPDATE public.pedidos_venta
  SET metadata = v_metadata, updated_at = now()
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object(
    'metadata', v_metadata,
    'fiscal_snapshot', v_fiscal_snapshot,
    'fiscal_snapshot_canonical', (v_fiscal_snapshot - 'sha256')::text,
    'lifecycle', v_lifecycle,
    'idempotent', false
  );
END;
$$;

-- Sella el snapshot solamente después de que la intención produjo el CPE y su
-- outbox atómico. En CO real también exige que la reserva DIAN ya esté consumida
-- por ese mismo CPE; una respuesta parcial jamás se promociona a CONSUMED.
CREATE OR REPLACE FUNCTION public.consumir_snapshot_dian_pedido_tx_531(
  p_tenant_id uuid,
  p_pedido_id uuid,
  p_idempotency_key text,
  p_cpe_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_venta%ROWTYPE;
  v_empresa public.empresa_config%ROWTYPE;
  v_metadata jsonb;
  v_lifecycle jsonb;
  v_history jsonb;
  v_at timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR p_pedido_id IS NULL OR p_cpe_id IS NULL
     OR length(btrim(coalesce(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_LIFECYCLE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_pedido
  FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;
  SELECT ec.* INTO v_empresa
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND OR upper(coalesce(v_empresa.pais, '')) IS DISTINCT FROM 'CO' THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_PAYMENT_ONLY_CO' USING ERRCODE = '23514';
  END IF;

  v_metadata := coalesce(v_pedido.metadata, '{}'::jsonb);
  v_lifecycle := v_metadata->'dian_fiscal_snapshot_lifecycle';
  IF jsonb_typeof(v_metadata->'dian_payment_snapshot') IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_metadata->'dian_fiscal_snapshot') IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_lifecycle) IS DISTINCT FROM 'object'
     OR btrim(coalesce(v_lifecycle->>'idempotency_key', ''))
        IS DISTINCT FROM btrim(p_idempotency_key)
     OR jsonb_typeof(coalesce(v_lifecycle->'history', 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_FISCAL_LIFECYCLE_CORRUPT' USING ERRCODE = '23514';
  END IF;

  IF v_lifecycle->>'state' = 'CONSUMED' THEN
    IF nullif(v_lifecycle->>'cpe_id', '')::uuid IS DISTINCT FROM p_cpe_id THEN
      RAISE EXCEPTION 'PEDIDO_DIAN_LIFECYCLE_CPE_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('state', 'CONSUMED', 'idempotent', true, 'lifecycle', v_lifecycle);
  ELSIF v_lifecycle->>'state' IS DISTINCT FROM 'PREPARED' THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_LIFECYCLE_NOT_PREPARED' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cpe c
    JOIN public.documentos d
      ON d.id = c.documento_id
     AND d.tenant_id = c.tenant_id
    WHERE c.id = p_cpe_id
      AND c.tenant_id = p_tenant_id
      AND c.idempotency_key = btrim(p_idempotency_key)
      AND d.pedido_id = p_pedido_id
      AND v_pedido.factura_id = p_cpe_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.outbox_events o
    WHERE o.tenant_id = p_tenant_id
      AND o.event_type = 'factura.emitida'
      AND o.idempotency_key = btrim(p_idempotency_key)
  ) THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_LIFECYCLE_FISCAL_ARTIFACTS_MISSING'
      USING ERRCODE = '23514';
  END IF;
  IF NOT coalesce(v_empresa.is_demo, false) AND NOT EXISTS (
    SELECT 1 FROM public.dian_numeracion_reservas r
    WHERE r.tenant_id = p_tenant_id
      AND r.idempotency_key = btrim(p_idempotency_key)
      AND r.estado = 'CONSUMIDA'
      AND r.cpe_id = p_cpe_id
  ) THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_LIFECYCLE_RESERVATION_NOT_CONSUMED'
      USING ERRCODE = '23514';
  END IF;

  v_at := clock_timestamp();
  v_history := v_lifecycle->'history' || jsonb_build_array(jsonb_build_object(
    'state', 'CONSUMED', 'at', v_at, 'reason', 'CPE_PERSISTED', 'cpe_id', p_cpe_id
  ));
  v_lifecycle := v_lifecycle || jsonb_build_object(
    'state', 'CONSUMED', 'consumed_at', v_at, 'aborted_at', NULL,
    'cpe_id', p_cpe_id, 'history', v_history
  );
  UPDATE public.pedidos_venta
  SET metadata = v_metadata || jsonb_build_object(
        'dian_fiscal_snapshot_lifecycle', v_lifecycle
      ),
      updated_at = now()
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('state', 'CONSUMED', 'idempotent', false, 'lifecycle', v_lifecycle);
END;
$$;

-- Un fallo anterior a cualquier efecto fiscal puede liberar el pedido para
-- corregirlo. Si ya hay CPE, reserva o outbox, el número y el snapshot quedan
-- intactos en PREPARED para un retry; esta función nunca elimina un correlativo.
CREATE OR REPLACE FUNCTION public.abortar_snapshot_dian_pedido_tx_531(
  p_tenant_id uuid,
  p_pedido_id uuid,
  p_idempotency_key text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_venta%ROWTYPE;
  v_metadata jsonb;
  v_lifecycle jsonb;
  v_history jsonb;
  v_at timestamptz;
  v_has_cpe boolean;
  v_has_reservation boolean;
  v_has_outbox boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_pedido_id IS NULL
     OR length(btrim(coalesce(p_idempotency_key, ''))) NOT BETWEEN 8 AND 200
     OR length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_LIFECYCLE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Mismo orden que el writer 530. Un emisor concurrente que aún no ha creado
  -- filas termina primero; al despertar, esta función verá su evidencia.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':customer-invoice-semantic:'
      || btrim(p_idempotency_key), 530)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':dian-numbering-intent:'
      || btrim(p_idempotency_key), 530)
  );

  SELECT p.* INTO v_pedido
  FROM public.pedidos_venta p
  WHERE p.id = p_pedido_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;
  v_metadata := coalesce(v_pedido.metadata, '{}'::jsonb);
  v_lifecycle := v_metadata->'dian_fiscal_snapshot_lifecycle';
  IF jsonb_typeof(v_lifecycle) IS DISTINCT FROM 'object'
     OR btrim(coalesce(v_lifecycle->>'idempotency_key', ''))
        IS DISTINCT FROM btrim(p_idempotency_key)
     OR jsonb_typeof(coalesce(v_lifecycle->'history', 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_FISCAL_LIFECYCLE_CORRUPT' USING ERRCODE = '23514';
  END IF;
  IF v_lifecycle->>'state' = 'ABORTED' THEN
    RETURN jsonb_build_object('state', 'ABORTED', 'released', true,
      'idempotent', true, 'lifecycle', v_lifecycle);
  ELSIF v_lifecycle->>'state' = 'CONSUMED' THEN
    RETURN jsonb_build_object('state', 'CONSUMED', 'released', false,
      'idempotent', true, 'reason', 'ALREADY_CONSUMED', 'lifecycle', v_lifecycle);
  ELSIF v_lifecycle->>'state' IS DISTINCT FROM 'PREPARED' THEN
    RAISE EXCEPTION 'PEDIDO_DIAN_LIFECYCLE_NOT_PREPARED' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.cpe c
    WHERE c.tenant_id = p_tenant_id
      AND c.idempotency_key = btrim(p_idempotency_key)
  ), EXISTS (
    SELECT 1 FROM public.dian_numeracion_reservas r
    WHERE r.tenant_id = p_tenant_id
      AND r.idempotency_key = btrim(p_idempotency_key)
  ), EXISTS (
    SELECT 1 FROM public.outbox_events o
    WHERE o.tenant_id = p_tenant_id
      AND o.idempotency_key = btrim(p_idempotency_key)
  ) INTO v_has_cpe, v_has_reservation, v_has_outbox;

  IF v_has_cpe OR v_has_reservation OR v_has_outbox THEN
    RETURN jsonb_build_object(
      'state', 'PREPARED', 'released', false, 'idempotent', true,
      'reason', 'FISCAL_ARTIFACT_EXISTS',
      'artifacts', jsonb_build_object(
        'cpe', v_has_cpe, 'reservation', v_has_reservation, 'outbox', v_has_outbox
      ),
      'lifecycle', v_lifecycle
    );
  END IF;

  v_at := clock_timestamp();
  v_history := v_lifecycle->'history' || jsonb_build_array(jsonb_build_object(
    'state', 'ABORTED', 'at', v_at, 'reason', btrim(p_reason)
  ));
  v_lifecycle := v_lifecycle || jsonb_build_object(
    'state', 'ABORTED', 'aborted_at', v_at, 'consumed_at', NULL,
    'cpe_id', NULL, 'history', v_history
  );
  v_metadata := (v_metadata - 'dian_payment_snapshot' - 'dian_fiscal_snapshot')
    || jsonb_build_object('dian_fiscal_snapshot_lifecycle', v_lifecycle);
  UPDATE public.pedidos_venta
  SET metadata = v_metadata, updated_at = now()
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('state', 'ABORTED', 'released', true,
    'idempotent', false, 'lifecycle', v_lifecycle);
END;
$$;

REVOKE ALL ON FUNCTION app.normalizar_intencion_pago_pedido_531(jsonb,jsonb,date,boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_pedido_comercial_pago_tx_531(jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_pedido_comercial_pago_tx_531(uuid,uuid,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convertir_cotizacion_comercial_a_pedido_pago_tx_531(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.congelar_pago_dian_pedido_tx_531(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consumir_snapshot_dian_pedido_tx_531(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abortar_snapshot_dian_pedido_tx_531(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;

-- Una instancia API anterior no debe poder saltarse el guard de congelamiento
-- llamando directamente a los writers que 531 envuelve. El wrapper SECURITY
-- DEFINER conserva acceso como owner y es el único writer público del runtime.
REVOKE EXECUTE ON FUNCTION public.actualizar_pedido_comercial_tx(uuid,uuid,jsonb,jsonb)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.actualizar_pedido_venta_tx(uuid,uuid,jsonb,jsonb)
  FROM service_role;

GRANT EXECUTE ON FUNCTION public.crear_pedido_comercial_pago_tx_531(jsonb,jsonb,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_pedido_comercial_pago_tx_531(uuid,uuid,jsonb,jsonb,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.convertir_cotizacion_comercial_a_pedido_pago_tx_531(uuid,uuid,uuid,text,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.congelar_pago_dian_pedido_tx_531(uuid,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.consumir_snapshot_dian_pedido_tx_531(uuid,uuid,text,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.abortar_snapshot_dian_pedido_tx_531(uuid,uuid,text,text)
  TO service_role;

COMMIT;
