\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_530') THEN
    RAISE EXCEPTION 'VERIFY_530_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contracts$
DECLARE
  v_definition text;
  v_arguments text;
  v_constraint text;
  v_proc regprocedure;
BEGIN
  IF to_regclass('public.dian_numeracion_reservas') IS NULL
     OR to_regclass('public.customer_invoice_intent_semantics') IS NULL
     OR to_regprocedure(
       'public.reservar_numeracion_dian_ui_tx(uuid,uuid,text,date,text,text,uuid)'
     ) IS NULL
     OR to_regprocedure(
       'app.reservar_numeracion_dian_ui_tx_530(uuid,uuid,text,date,text,uuid,text)'
     ) IS NULL
     OR to_regprocedure(
       'app.assert_order_invoice_key_owner_530(uuid,text,uuid)'
     ) IS NULL
     OR to_regprocedure(
       'app.emitir_factura_cliente_tx_443_legacy_530(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)'
     ) IS NULL
     OR to_regprocedure(
       'app.pos_registrar_venta_atomic_tx_530(uuid,uuid,uuid,text,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'public.obtener_siguiente_numero_documento(uuid,text,text)'
     ) IS NULL
     OR to_regprocedure(
       'app.pos_canjear_ticket_tx_530(uuid,uuid,uuid,text,jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'app.preserve_dian_optional_prefix_530()'
     ) IS NULL
     OR to_regprocedure(
       'public.anular_reserva_numeracion_dian_tx(uuid,uuid,uuid,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.finalizar_cpe_pos_tx(uuid,uuid,uuid,jsonb,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.finalizar_cpe_pos_tx_521_legacy_530(uuid,uuid,uuid,jsonb,text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'VERIFY_530_CANONICAL_OBJECT_MISSING';
  END IF;

  SELECT pg_get_function_arguments(
    'public.reservar_numeracion_dian_ui_tx(uuid,uuid,text,date,text,text,uuid)'::regprocedure
  ) INTO v_arguments;
  IF v_arguments <> 'p_tenant_id uuid, p_actor_id uuid, p_tipo_documento text, p_fecha_emision date, p_idempotency_key text, p_intent_fingerprint text, p_pedido_id uuid DEFAULT NULL::uuid'
     OR strpos(v_arguments, 'prefijo') > 0 THEN
    RAISE EXCEPTION 'VERIFY_530_NUMBERING_SIGNATURE_DIVERGED:%', v_arguments;
  END IF;

  SELECT pg_get_functiondef(
    'app.reservar_numeracion_dian_ui_tx_530(uuid,uuid,text,date,text,uuid,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'SECURITY DEFINER') = 0
     OR strpos(v_definition, 'dian_resolucion_numero') = 0
     OR strpos(v_definition, 'dian_resolucion_prefijo') = 0
     OR strpos(v_definition, 'dian_resolucion_desde') = 0
     OR strpos(v_definition, 'dian_resolucion_hasta') = 0
     OR strpos(v_definition, 'dian_resolucion_fecha_inicio') = 0
     OR strpos(v_definition, 'dian_resolucion_fecha_fin') = 0
     OR strpos(v_definition, 'is_demo') = 0
     OR strpos(v_definition, 'p_fecha_emision NOT BETWEEN') = 0
     OR strpos(v_definition, 'pg_advisory_xact_lock') = 0
     OR strpos(v_definition, 'FOR UPDATE') = 0
     OR strpos(v_definition, 'documento_series') = 0
     OR strpos(v_definition, 'dian_writer_alias') = 0
     OR strpos(v_definition, 'DIAN_NUMBERING_IDEMPOTENCY_ACTOR_MISMATCH') = 0
     OR strpos(v_definition, 'assert_order_invoice_key_owner_530') = 0
     OR strpos(v_definition, 'DIAN_NUMBERING_IDEMPOTENCY_CONFLICT') = 0
     OR strpos(v_definition, 'economic_intent_sha256') = 0
     OR strpos(v_definition, 'DIAN_NUMBERING_INTENT_FINGERPRINT_INVALID') = 0
     OR strpos(v_definition, 'DIAN_NUMBERING_AUTHORIZED_RANGE_EXHAUSTED') = 0
     OR strpos(v_definition, 'v_key text := btrim') = 0
     OR strpos(lower(v_definition), 'v_key text := lower(btrim') > 0
     OR strpos(lower(v_definition), 'current_date') > 0 THEN
    RAISE EXCEPTION 'VERIFY_530_NUMBERING_DEFINITION_DIVERGED:%', v_definition;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dian_numeracion_reservas'
      AND column_name = 'pedido_id'
      AND udt_name = 'uuid'
  ) THEN
    RAISE EXCEPTION 'VERIFY_530_NUMBERING_ORDER_OWNER_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dian_numeracion_reservas'
      AND column_name = 'hora_emision'
      AND data_type = 'time without time zone'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_530_STABLE_ISSUE_TIME_MISSING';
  END IF;

  SELECT pg_get_functiondef(
    'app.emitir_factura_cliente_tx(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'reserve_customer_invoice_semantics_530') = 0
     OR strpos(v_definition, 'emitir_factura_cliente_tx_443_legacy_530') = 0
     OR strpos(v_definition, 'v_reserva.documento_serie_id') = 0
     OR strpos(v_definition, 'DIAN_NUMBERING_INTERNAL_ALIAS_INVALID') = 0 THEN
    RAISE EXCEPTION 'VERIFY_530_CUSTOMER_INVOICE_WRAPPER_DIVERGED:%', v_definition;
  END IF;

  SELECT pg_get_functiondef(
    'public.obtener_siguiente_numero_documento(uuid,text,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'SECURITY DEFINER') = 0
     OR strpos(v_definition, 'DIAN_NUMBERING_RESERVATION_REQUIRED') = 0
     OR strpos(v_definition, 'dian_numeracion_reservas') = 0
     OR strpos(v_definition, 'dian_numbering_consumed') = 0
     OR strpos(v_definition, 'obtener_siguiente_numero_documento_legacy_530') = 0 THEN
    RAISE EXCEPTION 'VERIFY_530_GLOBAL_NUMBERING_GATE_DIVERGED:%', v_definition;
  END IF;

  SELECT pg_get_functiondef(
    'app.pos_registrar_venta_atomic_tx_530(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'reservar_numeracion_dian_ui_tx_530') = 0
     OR strpos(v_definition, 'app.hoy_tenant') = 0
     OR strpos(v_definition, 'pos_registrar_venta_atomic_tx_518') = 0
     OR strpos(v_definition, 'dian_numbering_alias') = 0
     OR strpos(v_definition, 'dian_writer_alias') = 0
     OR strpos(v_definition, 'DIAN_POS_NUMBERING_POSTCONDITION_FAILED') = 0
     OR strpos(v_definition, 'DIAN_POS_RESERVATION_NOT_CONSUMED') = 0
     OR strpos(v_definition, 'r.documento_serie_id') = 0
     OR strpos(v_definition, 'DIAN_NUMBERING_INTERNAL_ALIAS_INVALID') = 0
     OR strpos(v_definition, 'venta_pos_id') = 0
     OR strpos(v_definition, 'outbox_events') = 0 THEN
    RAISE EXCEPTION 'VERIFY_530_POS_NUMBERING_WRAPPER_DIVERGED:%', v_definition;
  END IF;

  SELECT pg_get_functiondef(
    'public.finalizar_cpe_pos_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'finalizar_cpe_pos_tx_521_legacy_530') = 0
     OR strpos(v_definition, 'DIAN_POS_CONSUMED_RESERVATION_REQUIRED') = 0
     OR strpos(v_definition, 'DIAN_POS_CPE_RESERVATION_NOT_LINKED') = 0
     OR strpos(v_definition, 'dian_number_reservation_id') = 0
     OR strpos(v_definition, 'v_reserva.documento_serie_id') = 0
     OR strpos(v_definition, 'DIAN_NUMBERING_INTERNAL_ALIAS_INVALID') = 0
     OR strpos(v_definition, 'numero_fiscal') = 0 THEN
    RAISE EXCEPTION 'VERIFY_530_POS_FINALIZER_DIVERGED:%', v_definition;
  END IF;

  SELECT pg_get_functiondef(
    'public.anular_reserva_numeracion_dian_tx(uuid,uuid,uuid,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'DIAN_NUMBERING_CONSUMED_CANNOT_BE_CANCELLED') = 0
     OR strpos(v_definition, 'DIAN_NUMBERING_RESERVATION_ALREADY_REFERENCED') = 0
     OR strpos(v_definition, 'correlativo_reutilizable') = 0 THEN
    RAISE EXCEPTION 'VERIFY_530_RESERVATION_CANCELLATION_DIVERGED:%', v_definition;
  END IF;

  SELECT pg_get_functiondef(
    'app.pos_canjear_ticket_tx_530(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'DIAN_POS_TICKET_EXCHANGE_REQUIRES_FEV_FLOW') = 0
     OR strpos(v_definition, 'pos_canjear_ticket_tx_471') = 0 THEN
    RAISE EXCEPTION 'VERIFY_530_POS_EXCHANGE_GATE_DIVERGED:%', v_definition;
  END IF;

  SELECT pg_get_functiondef(
    'app.customer_invoice_semantic_snapshot_530(jsonb,jsonb,uuid)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, '''cliente_id''') = 0
     OR strpos(v_definition, '''fecha_emision''') = 0
     OR strpos(v_definition, '''fecha_vencimiento''') = 0
     OR strpos(v_definition, '''condicion_pago''') = 0
     OR strpos(v_definition, '''medio_pago''') = 0
     OR strpos(v_definition, '''plazo_pago_dias''') = 0
     OR strpos(v_definition, '''pedido_id''') = 0
     OR strpos(v_definition, 'v_plazo IS DISTINCT FROM') = 0
     OR strpos(v_definition, 'CUSTOMER_INVOICE_PAYMENT_TERM_INVALID') = 0
     OR strpos(v_definition, '''dian_receptor_tax_profile''') = 0 THEN
    RAISE EXCEPTION 'VERIFY_530_SEMANTIC_SNAPSHOT_DIVERGED:%', v_definition;
  END IF;

  SELECT pg_get_functiondef(
    'app.reserve_customer_invoice_semantics_530(uuid,jsonb,jsonb,text,uuid)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL
     OR strpos(v_definition, 'v_key text := btrim') = 0
     OR strpos(lower(v_definition), 'v_key text := lower(btrim') > 0 THEN
    RAISE EXCEPTION 'VERIFY_530_INVOICE_KEY_CASE_COMPATIBILITY_DIVERGED:%', v_definition;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.customer_invoice_intent_semantics'::regclass
      AND attname = 'pedido_id'
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'VERIFY_530_ORDER_BOUND_INTENT_COLUMN_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.dian_numeracion_reservas'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.customer_invoice_intent_semantics'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'VERIFY_530_RLS_NOT_FORCED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'dian_numeracion_reservas'
      AND indexname = 'ux_dian_numeracion_intent_530'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'dian_numeracion_reservas'
       AND indexname = 'ux_dian_numeracion_fiscal_530'
       AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'dian_numeracion_reservas'
      AND indexname = 'ux_dian_numeracion_venta_pos_530'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'customer_invoice_intent_semantics'
      AND indexname = 'ux_customer_invoice_semantic_intent_530'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  ) THEN
    RAISE EXCEPTION 'VERIFY_530_UNIQUE_INTENT_OR_NUMBER_MISSING';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.dian_numeracion_reservas'::regclass
    AND conname = 'ck_dian_numeracion_prefijo_530';
  IF v_constraint IS NULL OR strpos(v_constraint, '{0,4}') = 0 THEN
    RAISE EXCEPTION 'VERIFY_530_DIAN_PREFIX_CONSTRAINT_DIVERGED:%', v_constraint;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.dian_numeracion_reservas'::regclass
    AND conname = 'ck_dian_numeracion_estado_530';
  IF v_constraint IS NULL
     OR strpos(v_constraint, 'RESERVADA') = 0
     OR strpos(v_constraint, 'CONSUMIDA') = 0
     OR strpos(v_constraint, 'ANULADA') = 0
     OR strpos(v_constraint, 'venta_pos_id') = 0 THEN
    RAISE EXCEPTION 'VERIFY_530_RESERVATION_STATE_CONSTRAINT_DIVERGED:%',
      v_constraint;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.documentos'::regclass
    AND conname = 'ck_documentos_identificacion_required';
  IF v_constraint IS NULL
     OR strpos(v_constraint, 'dian_numbering_contract_version') = 0
     OR strpos(v_constraint, 'dian_prefijo_autorizado') = 0 THEN
    RAISE EXCEPTION 'VERIFY_530_DOCUMENT_OPTIONAL_PREFIX_CONSTRAINT_DIVERGED:%',
      v_constraint;
  END IF;

  IF (SELECT count(*)
      FROM pg_trigger t
      WHERE NOT t.tgisinternal
        AND t.tgname = 'trg_zz_preserve_dian_prefix_530'
        AND t.tgrelid IN (
          'public.documentos'::regclass,
          'public.cuentas_por_cobrar'::regclass
        )
        AND t.tgenabled <> 'D') <> 2 THEN
    RAISE EXCEPTION 'VERIFY_530_OPTIONAL_PREFIX_TRIGGER_MISSING';
  END IF;

  IF NOT has_function_privilege(
       'service_role',
       'public.reservar_numeracion_dian_ui_tx(uuid,uuid,text,date,text,text,uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.emitir_factura_cliente_tx(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.obtener_siguiente_numero_documento(uuid,text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.pos_canjear_ticket_tx(uuid,uuid,uuid,text,jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.finalizar_cpe_pos_tx(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.anular_reserva_numeracion_dian_tx(uuid,uuid,uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.reservar_numeracion_dian_ui_tx_530(uuid,uuid,text,date,text,uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.reserve_customer_invoice_semantics_530(uuid,jsonb,jsonb,text,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.assert_order_invoice_key_owner_530(uuid,text,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.emitir_factura_cliente_tx_443_legacy_530(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.pos_registrar_venta_atomic_tx_530(uuid,uuid,uuid,text,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.pos_canjear_ticket_tx_530(uuid,uuid,uuid,text,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.preserve_dian_optional_prefix_530()', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.finalizar_cpe_pos_tx_521_legacy_530(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon', 'app.preserve_dian_optional_prefix_530()', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'app.preserve_dian_optional_prefix_530()', 'EXECUTE'
     )
     OR has_table_privilege(
       'service_role', 'public.dian_numeracion_reservas', 'SELECT,INSERT,UPDATE,DELETE'
     )
     OR has_table_privilege(
       'service_role', 'public.customer_invoice_intent_semantics', 'SELECT,INSERT,UPDATE,DELETE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_530_PRIVILEGE_BOUNDARY_DIVERGED';
  END IF;

  FOREACH v_proc IN ARRAY ARRAY[
    'public.emitir_factura_cliente_tx(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text)'::regprocedure,
    'public.reservar_numeracion_dian_ui_tx(uuid,uuid,text,date,text,text,uuid)'::regprocedure,
    'public.obtener_siguiente_numero_documento(uuid,text,text)'::regprocedure,
    'public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)'::regprocedure,
    'public.finalizar_cpe_pos_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure,
    'public.anular_reserva_numeracion_dian_tx(uuid,uuid,uuid,text)'::regprocedure,
    'public.pos_canjear_ticket_tx(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ]::regprocedure[] LOOP
    IF has_function_privilege('anon', v_proc, 'EXECUTE')
       OR has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'VERIFY_530_PUBLIC_WRAPPER_LEAKED:%', v_proc;
    END IF;
  END LOOP;
  IF has_table_privilege(
       'anon', 'public.dian_numeracion_reservas', 'SELECT,INSERT,UPDATE,DELETE'
     ) OR has_table_privilege(
       'authenticated', 'public.dian_numeracion_reservas', 'SELECT,INSERT,UPDATE,DELETE'
     ) OR has_table_privilege(
       'anon', 'public.customer_invoice_intent_semantics', 'SELECT,INSERT,UPDATE,DELETE'
     ) OR has_table_privilege(
       'authenticated', 'public.customer_invoice_intent_semantics', 'SELECT,INSERT,UPDATE,DELETE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_530_PRIVATE_TABLE_LEAKED';
  END IF;
END;
$contracts$;

DO $behavior$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_actor_a uuid := gen_random_uuid();
  v_actor_a_second uuid := gen_random_uuid();
  v_actor_b uuid := gen_random_uuid();
  v_client_a uuid := gen_random_uuid();
  v_client_b uuid := gen_random_uuid();
  v_pedido_intent_a uuid := gen_random_uuid();
  v_pedido_intent_b uuid := gen_random_uuid();
  v_country_id integer;
  v_first jsonb;
  v_retry jsonb;
  v_result jsonb;
  v_cpe jsonb;
  v_cxc jsonb;
  v_contado jsonb;
  v_profile jsonb := jsonb_build_object(
    'profile', 'ADQUIRIENTE_NIT_B2B',
    'taxLevelCode', 'O-99',
    'taxLevelListName', '04',
    'taxSchemeId', '01',
    'taxSchemeName', 'IVA'
  );
  v_rejected boolean;
BEGIN
  SELECT id INTO STRICT v_country_id
  FROM public.paises
  WHERE upper(codigo_iso) = 'CO' AND coalesce(activo, true);

  UPDATE app.deployment_environment
  SET environment = 'PROD',
      project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true,
      configured_at = now(),
      updated_at = now()
  WHERE singleton = true;

  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado
  ) VALUES
    (v_tenant_a, 'VERIFY-530-A-' || left(v_tenant_a::text, 8),
     'Tenant CO A verify 530', 'Fixture local', 'CO', 'test', true, 'ACTIVO'),
    (v_tenant_b, 'VERIFY-530-B-' || left(v_tenant_b::text, 8),
     'Tenant CO B verify 530', 'Fixture local', 'CO', 'test', true, 'ACTIVO');

  INSERT INTO public.empresa_config (
    tenant_id, pais_id, ruc, razon_social, direccion_fiscal,
    pais, moneda_defecto, estado, configuracion_completa, is_demo,
    dian_activo, dian_resolucion_numero, dian_resolucion_prefijo,
    dian_resolucion_desde, dian_resolucion_hasta,
    dian_resolucion_fecha_inicio, dian_resolucion_fecha_fin
  ) VALUES
    (v_tenant_a, v_country_id, '9015300007', 'Emisor A verify 530',
     'Bogota A', 'CO', 'COP', 'ACTIVO', true, false,
     true, '187640530-A', 'F530', 100, 102,
     DATE '2026-08-01', DATE '2026-08-31'),
    (v_tenant_b, v_country_id, '9015300015', 'Emisor B verify 530',
     'Bogota B', 'CO', 'COP', 'ACTIVO', true, false,
     true, '187640530-B', 'F530', 100, 102,
     DATE '2026-08-01', DATE '2026-08-31');

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, email, nombre, activo, estado
  ) VALUES
    (v_actor_a, v_tenant_a,
     'verify-530-a-' || left(v_actor_a::text, 8) || '@local.invalid',
     'Actor A 530', true, 'ACTIVO'),
    (v_actor_a_second, v_tenant_a,
     'verify-530-a-second-' || left(v_actor_a_second::text, 8) || '@local.invalid',
     'Actor A second 530', true, 'ACTIVO'),
    (v_actor_b, v_tenant_b,
     'verify-530-b-' || left(v_actor_b::text, 8) || '@local.invalid',
     'Actor B 530', true, 'ACTIVO');

  -- Una serie ajena no puede convertirse en prefijo libre de la UI. Una
  -- serie exacta inactiva debe reactivarse en lugar de chocar con el indice
  -- historico no parcial de tenant/tipo/serie.
  INSERT INTO public.documento_series (
    tenant_id, tipo_documento, serie, correlativo_actual,
    correlativo_maximo, longitud_correlativo, activo, estado
  ) VALUES
    (v_tenant_a, 'FACTURA', 'FREE530', 900, 999,
     4, true, 'ACTIVO'),
    (v_tenant_a, 'FACTURA', 'F530', 0, 999,
     4, false, 'INACTIVO');

  -- El namespace predecible de pedidos se rechaza antes de tocar la serie. No
  -- alcanza con detectar el conflicto al emitir: para entonces el correlativo
  -- ya habría quedado reservado por la llamada genérica.
  v_rejected := false;
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant_a, v_actor_a, '01', DATE '2026-08-15',
      'ventas.cpe.factura:' || v_tenant_a::text || ':' || v_pedido_intent_a::text,
      NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%PEDIDO_INVOICE_IDEMPOTENCY_OWNER_REQUIRED%';
  END;
  IF NOT v_rejected
     OR EXISTS (
       SELECT 1 FROM public.dian_numeracion_reservas r
       WHERE r.tenant_id = v_tenant_a
         AND r.idempotency_key = 'ventas.cpe.factura:' || v_tenant_a::text
           || ':' || v_pedido_intent_a::text
     )
     OR (SELECT correlativo_actual FROM public.documento_series
         WHERE tenant_id = v_tenant_a AND serie = 'F530'
           AND tipo_documento = 'FACTURA') <> 0 THEN
    RAISE EXCEPTION 'VERIFY_530_GENERIC_ORDER_NAMESPACE_RESERVED_NUMBER';
  END IF;

  v_first := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant_a, v_actor_a, '01', DATE '2026-08-15', 'verify-530-number-1'
  );
  IF (v_first->>'prefijo') <> 'F530'
     OR (v_first->>'correlativo')::integer <> 100
     OR (v_first->>'numero_completo') <> 'F530100'
     OR (v_first->>'hora_emision') !~ '^\d{2}:\d{2}:\d{2}$'
     OR (v_first->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'VERIFY_530_FIRST_NUMBER_INVALID:%', v_first;
  END IF;

  v_retry := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant_a, v_actor_a, '01', DATE '2026-08-15', 'verify-530-number-1'
  );
  IF (v_retry->>'reserva_id') IS DISTINCT FROM (v_first->>'reserva_id')
     OR (v_retry->>'correlativo')::integer <> 100
     OR (v_retry->>'hora_emision') IS DISTINCT FROM (v_first->>'hora_emision')
     OR NOT (v_retry->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.dian_numeracion_reservas
         WHERE tenant_id = v_tenant_a) <> 1
     OR (SELECT correlativo_actual FROM public.documento_series
         WHERE tenant_id = v_tenant_a AND serie = 'F530'
           AND tipo_documento = 'FACTURA' AND activo) <> 100 THEN
    RAISE EXCEPTION 'VERIFY_530_RETRY_NOT_IDEMPOTENT:%/%', v_first, v_retry;
  END IF;

  -- La key no puede apropiarse del número ya reservado para otra intención
  -- económica aunque actor, tipo, fecha y dueño comercial sigan iguales.
  v_rejected := false;
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant_a, v_actor_a, '01', DATE '2026-08-15',
      'verify-530-number-1', NULL, repeat('b', 64)
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected := SQLERRM LIKE '%DIAN_NUMBERING_IDEMPOTENCY_CONFLICT%';
  END;
  IF NOT v_rejected
     OR (SELECT count(*) FROM public.dian_numeracion_reservas
         WHERE tenant_id = v_tenant_a
           AND idempotency_key = 'verify-530-number-1') <> 1
     OR (SELECT correlativo_actual FROM public.documento_series
         WHERE tenant_id = v_tenant_a AND serie = 'F530'
           AND tipo_documento = 'FACTURA' AND activo) <> 100 THEN
    RAISE EXCEPTION 'VERIFY_530_DIVERGENT_ECONOMIC_RETRY_ACCEPTED';
  END IF;

  -- La clave idempotente pertenece tambien al actor que creo la intencion. Un
  -- segundo actor activo del mismo tenant no puede recuperar su correlativo.
  v_rejected := false;
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant_a, v_actor_a_second, '01', DATE '2026-08-15',
      'verify-530-number-1'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_rejected := SQLERRM LIKE '%DIAN_NUMBERING_IDEMPOTENCY_ACTOR_MISMATCH%';
  END;
  IF NOT v_rejected
     OR (SELECT count(*) FROM public.dian_numeracion_reservas
         WHERE tenant_id = v_tenant_a
           AND idempotency_key = 'verify-530-number-1') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_530_SAME_TENANT_DIFFERENT_ACTOR_RETRY_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant_a, v_actor_a, '01', DATE '2026-08-16', 'verify-530-number-1'
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected := SQLERRM LIKE '%DIAN_NUMBERING_IDEMPOTENCY_CONFLICT%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_CHANGED_DATE_REUSED_KEY_ACCEPTED';
  END IF;

  v_result := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant_a, v_actor_a, '01', DATE '2026-08-15', 'verify-530-number-2'
  );
  IF (v_result->>'correlativo')::integer <> 101 THEN
    RAISE EXCEPTION 'VERIFY_530_SECOND_NUMBER_INVALID:%', v_result;
  END IF;
  v_retry := public.anular_reserva_numeracion_dian_tx(
    v_tenant_a, v_actor_a, (v_result->>'reserva_id')::uuid,
    'Intención de prueba abandonada antes de persistir documento'
  );
  IF v_retry->>'estado' IS DISTINCT FROM 'ANULADA'
     OR coalesce((v_retry->>'correlativo_reutilizable')::boolean, true)
     OR (SELECT correlativo_actual FROM public.documento_series
         WHERE tenant_id = v_tenant_a AND serie = 'F530'
           AND tipo_documento = 'FACTURA' AND activo) <> 101 THEN
    RAISE EXCEPTION 'VERIFY_530_CANCELLATION_REUSED_NUMBER:%', v_retry;
  END IF;
  v_retry := public.anular_reserva_numeracion_dian_tx(
    v_tenant_a, v_actor_a, (v_result->>'reserva_id')::uuid,
    'Intención de prueba abandonada antes de persistir documento'
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'VERIFY_530_CANCELLATION_NOT_IDEMPOTENT:%', v_retry;
  END IF;
  v_rejected := false;
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant_a, v_actor_a, '01', DATE '2026-08-15', 'verify-530-number-2'
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%DIAN_NUMBERING_IDEMPOTENCY_CANCELLED%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_CANCELLED_INTENT_REOPENED';
  END IF;
  v_result := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant_a, v_actor_a, '01', DATE '2026-08-15', 'verify-530-number-3'
  );
  IF (v_result->>'correlativo')::integer <> 102 THEN
    RAISE EXCEPTION 'VERIFY_530_RANGE_END_INVALID:%', v_result;
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant_a, v_actor_a, '01', DATE '2026-08-15', 'verify-530-number-4'
    );
  EXCEPTION WHEN numeric_value_out_of_range THEN
    v_rejected := SQLERRM LIKE '%DIAN_NUMBERING_AUTHORIZED_RANGE_EXHAUSTED%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_RANGE_EXHAUSTION_NOT_ENFORCED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant_b, v_actor_a, '01', DATE '2026-08-15', 'verify-530-cross-actor'
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%DOCUMENT_FLOW_ACTOR_NOT_IN_TENANT%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_CROSS_TENANT_ACTOR_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant_b, v_actor_b, '03', DATE '2026-08-15', 'verify-530-type-03'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_rejected := SQLERRM LIKE '%DIAN_NUMBERING_ONLY_INVOICE_01%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_NON_INVOICE_TYPE_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant_b, v_actor_b, '01', DATE '2026-09-01', 'verify-530-bad-date'
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%DIAN_NUMBERING_RESOLUTION_NOT_VALID_FOR_EMISSION_DATE%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_OUTSIDE_VALIDITY_ACCEPTED';
  END IF;

  -- La misma key y el mismo prefijo pueden existir en otro tenant sin fuga.
  v_result := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant_b, v_actor_b, '01', DATE '2026-08-15', 'verify-530-number-1'
  );
  IF (v_result->>'correlativo')::integer <> 100
     OR (v_result->>'prefijo') <> 'F530' THEN
    RAISE EXCEPTION 'VERIFY_530_TENANT_ISOLATION_INVALID:%', v_result;
  END IF;

  -- La reserva comparte la semántica case-sensitive de la frontera 443: dos
  -- intents que sólo difieren por mayúsculas reciben números distintos.
  v_first := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant_b, v_actor_b, '01', DATE '2026-08-15', 'Verify-530-Number-Case'
  );
  v_retry := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant_b, v_actor_b, '01', DATE '2026-08-15', 'verify-530-number-case'
  );
  IF (v_first->>'correlativo')::integer <> 101
     OR (v_retry->>'correlativo')::integer <> 102
     OR (v_first->>'reserva_id') IS NOT DISTINCT FROM (v_retry->>'reserva_id')
     OR (SELECT count(*) FROM public.dian_numeracion_reservas
         WHERE tenant_id = v_tenant_b
           AND lower(idempotency_key) = 'verify-530-number-case') <> 2 THEN
    RAISE EXCEPTION 'VERIFY_530_NUMBERING_KEY_CASE_COLLAPSED:%/%', v_first, v_retry;
  END IF;

  -- Ningún generador histórico puede entregar una factura CO real fuera del
  -- contexto de una reserva 530, ni el canje de ticket fingir una FEV.
  v_rejected := false;
  BEGIN
    PERFORM public.obtener_siguiente_numero_documento(v_tenant_b, '01', 'F530');
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%DIAN_NUMBERING_RESERVATION_REQUIRED%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_RAW_CO_NUMBERING_BYPASS_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.pos_canjear_ticket_tx_530(
      v_tenant_b, gen_random_uuid(), v_actor_b,
      'verify-530-co-exchange', '{}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%DIAN_POS_TICKET_EXCHANGE_REQUIRES_FEV_FLOW%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_CO_TICKET_EXCHANGE_ACCEPTED';
  END IF;

  -- DIAN permite una resolución sin prefijo. La reserva conserva cadena vacía
  -- y el número fiscal exacto es sólo el consecutivo; `documento_series` usa
  -- un alias interno de cuatro caracteres que nunca sale a la superficie.
  UPDATE public.empresa_config
  SET dian_resolucion_numero = '187640530-NO-PREFIX',
      dian_resolucion_prefijo = '',
      dian_resolucion_desde = 200,
      dian_resolucion_hasta = 202
  WHERE tenant_id = v_tenant_b;
  v_first := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant_b, v_actor_b, '01', DATE '2026-08-15',
    'verify-530-no-prefix'
  );
  v_retry := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant_b, v_actor_b, '01', DATE '2026-08-15',
    'verify-530-no-prefix'
  );
  IF (v_first->>'prefijo') IS DISTINCT FROM ''
     OR (v_first->>'correlativo')::integer <> 200
     OR (v_first->>'numero_completo') IS DISTINCT FROM '200'
     OR (v_first->>'idempotent')::boolean
     OR NOT (v_retry->>'idempotent')::boolean
     OR (v_retry->>'reserva_id') IS DISTINCT FROM (v_first->>'reserva_id')
     OR NOT EXISTS (
       SELECT 1
       FROM public.dian_numeracion_reservas r
       JOIN public.documento_series ds ON ds.id = r.documento_serie_id
       WHERE r.tenant_id = v_tenant_b
         AND r.idempotency_key = 'verify-530-no-prefix'
         AND r.prefijo = ''
         AND r.numero_completo = '200'
         AND ds.serie ~ '^D[A-F0-9]{3}$'
         AND ds.metadata->>'resolution_prefix' = ''
         AND ds.metadata->>'dian_writer_alias' = upper(ds.serie)
     ) THEN
    RAISE EXCEPTION 'VERIFY_530_OPTIONAL_PREFIX_INVALID:%/%', v_first, v_retry;
  END IF;

  UPDATE public.empresa_config
  SET dian_activo = false
  WHERE tenant_id = v_tenant_b;
  v_retry := app.reservar_numeracion_dian_ui_tx_530(
    v_tenant_b, v_actor_b, '01', DATE '2026-08-15', 'verify-530-number-1'
  );
  IF (v_retry->>'correlativo')::integer <> 100
     OR NOT (v_retry->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'VERIFY_530_DURABLE_RETRY_DEPENDS_ON_CURRENT_CONFIG:%', v_retry;
  END IF;
  v_rejected := false;
  BEGIN
    PERFORM app.reservar_numeracion_dian_ui_tx_530(
      v_tenant_b, v_actor_b, '01', DATE '2026-08-15', 'verify-530-demo'
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%DIAN_NUMBERING_REAL_RESOLUTION_INCOMPLETE%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_INACTIVE_DIAN_NUMBERING_ACCEPTED';
  END IF;

  -- Guarda de la emision 443: mismo payload reconcilia; cada cambio semantico
  -- relevante reutilizando la key debe fallar cerrado antes del escritor legado.
  v_cpe := jsonb_build_object(
    'cliente_id', v_client_a,
    'fecha_emision', '2026-08-15T00:00:00Z',
    'fecha_vencimiento', '2026-09-14',
    'condicion_pago', 'CREDITO',
    'medio_pago', '10',
    'plazo_pago_dias', 30,
    'metadata', jsonb_build_object(
      'dian_forma_pago', 'CREDITO',
      'dian_medio_pago', '10',
      'plazo_pago_dias', 30,
      'dian_receptor_tax_profile', v_profile
    )
  );
  v_cxc := jsonb_build_object('cliente_id', v_client_a);
  v_contado := jsonb_build_object(
    'cliente_id', v_client_a,
    'fecha_emision', '2026-08-15T00:00:00Z',
    'fecha_vencimiento', '2026-08-15',
    'condicion_pago', 'CONTADO',
    'medio_pago', '10',
    'plazo_pago_dias', 0,
    'metadata', jsonb_build_object(
      'dian_forma_pago', 'CONTADO',
      'dian_medio_pago', '10',
      'plazo_pago_dias', 0,
      'dian_receptor_tax_profile', v_profile
    )
  );

  v_result := app.customer_invoice_semantic_snapshot_530(v_contado, NULL);
  IF v_result->>'condicion_pago' IS DISTINCT FROM 'CONTADO'
     OR (v_result->>'plazo_pago_dias')::integer <> 0
     OR (v_result->>'fecha_vencimiento')::date
        IS DISTINCT FROM (v_result->>'fecha_emision')::date THEN
    RAISE EXCEPTION 'VERIFY_530_VALID_CASH_SEMANTICS_DIVERGED:%', v_result;
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.customer_invoice_semantic_snapshot_530(
      jsonb_build_object(
        'cliente_id', v_client_a,
        'fecha_emision', '2026-08-15',
        'fecha_vencimiento', '2026-09-14',
        'condicion_pago', 'CONTADO',
        'plazo_pago_dias', 30,
        'metadata', jsonb_build_object(
          'dian_forma_pago', 'CONTADO', 'plazo_pago_dias', 30
        )
      ),
      NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_PAYMENT_TERM_INVALID%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_CASH_WITH_TERM_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.customer_invoice_semantic_snapshot_530(
      jsonb_set(
        jsonb_set(
          jsonb_set(v_cpe, '{fecha_vencimiento}', '"2026-08-15"'::jsonb),
          '{plazo_pago_dias}', '0'::jsonb
        ),
        '{metadata,plazo_pago_dias}', '0'::jsonb
      ),
      v_cxc
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_PAYMENT_TERM_INVALID%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_CREDIT_WITH_ZERO_TERM_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.customer_invoice_semantic_snapshot_530(
      jsonb_set(
        jsonb_set(v_cpe, '{plazo_pago_dias}', '29'::jsonb),
        '{metadata,plazo_pago_dias}', '29'::jsonb
      ),
      v_cxc
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_PAYMENT_TERM_INVALID%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_CREDIT_TERM_DATE_MISMATCH_ACCEPTED';
  END IF;

  v_first := app.reserve_customer_invoice_semantics_530(
    v_tenant_a, v_cpe, v_cxc, 'verify-530-invoice-intent'
  );
  v_retry := app.reserve_customer_invoice_semantics_530(
    v_tenant_a, v_cpe, v_cxc, 'verify-530-invoice-intent'
  );
  IF (v_first->>'idempotent')::boolean
     OR NOT (v_retry->>'idempotent')::boolean
     OR (v_first->>'intent_id') IS DISTINCT FROM (v_retry->>'intent_id') THEN
    RAISE EXCEPTION 'VERIFY_530_SEMANTIC_RETRY_INVALID:%/%', v_first, v_retry;
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reserve_customer_invoice_semantics_530(
      v_tenant_a, jsonb_set(v_cpe, '{cliente_id}', to_jsonb(v_client_b::text)),
      v_cxc, 'verify-530-invoice-intent'
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_IDEMPOTENCY_SEMANTIC_CONFLICT%';
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'VERIFY_530_CLIENT_CHANGE_ACCEPTED'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reserve_customer_invoice_semantics_530(
      v_tenant_a,
      jsonb_set(
        jsonb_set(v_cpe, '{fecha_emision}', '"2026-08-16T00:00:00Z"'::jsonb),
        '{fecha_vencimiento}', '"2026-09-15"'::jsonb
      ),
      v_cxc, 'verify-530-invoice-intent'
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_IDEMPOTENCY_SEMANTIC_CONFLICT%';
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'VERIFY_530_ISSUE_DATE_CHANGE_ACCEPTED'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reserve_customer_invoice_semantics_530(
      v_tenant_a,
      jsonb_set(
        jsonb_set(
          jsonb_set(
            v_cpe, '{fecha_vencimiento}', '"2026-09-15"'::jsonb
          ),
          '{plazo_pago_dias}', '31'::jsonb
        ),
        '{metadata,plazo_pago_dias}', '31'::jsonb
      ),
      v_cxc, 'verify-530-invoice-intent'
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_IDEMPOTENCY_SEMANTIC_CONFLICT%';
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'VERIFY_530_DUE_DATE_CHANGE_ACCEPTED'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reserve_customer_invoice_semantics_530(
      v_tenant_a,
      jsonb_set(
        jsonb_set(v_cpe, '{medio_pago}', '"42"'::jsonb),
        '{metadata,dian_medio_pago}', '"42"'::jsonb
      ), v_cxc, 'verify-530-invoice-intent'
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_IDEMPOTENCY_SEMANTIC_CONFLICT%';
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'VERIFY_530_PAYMENT_METHOD_CHANGE_ACCEPTED'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reserve_customer_invoice_semantics_530(
      v_tenant_a,
      jsonb_set(
        jsonb_set(
          jsonb_set(v_cpe, '{fecha_vencimiento}', '"2026-09-15"'::jsonb),
          '{plazo_pago_dias}', '31'::jsonb
        ),
        '{metadata,plazo_pago_dias}', '31'::jsonb
      ), v_cxc, 'verify-530-invoice-intent'
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_IDEMPOTENCY_SEMANTIC_CONFLICT%';
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'VERIFY_530_PAYMENT_TERM_CHANGE_ACCEPTED'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reserve_customer_invoice_semantics_530(
      v_tenant_a,
      jsonb_set(
        v_cpe, '{metadata,dian_receptor_tax_profile,profile}',
        '"CONSUMIDOR_FINAL"'::jsonb
      ), v_cxc, 'verify-530-invoice-intent'
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_IDEMPOTENCY_SEMANTIC_CONFLICT%';
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'VERIFY_530_DIAN_PROFILE_CHANGE_ACCEPTED'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reserve_customer_invoice_semantics_530(
      v_tenant_a,
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(v_cpe, '{condicion_pago}', '"CONTADO"'::jsonb),
            '{fecha_vencimiento}', '"2026-08-15"'::jsonb
          ),
          '{plazo_pago_dias}', '0'::jsonb
        ),
        '{metadata}',
        (v_cpe->'metadata') || jsonb_build_object(
          'dian_forma_pago', 'CONTADO', 'plazo_pago_dias', 0
        )
      ),
      NULL,
      'verify-530-invoice-intent'
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_IDEMPOTENCY_SEMANTIC_CONFLICT%';
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'VERIFY_530_PAYMENT_FORM_CHANGE_ACCEPTED'; END IF;

  IF (SELECT count(*) FROM public.customer_invoice_intent_semantics
      WHERE tenant_id = v_tenant_a
        AND idempotency_key = 'verify-530-invoice-intent') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_530_SEMANTIC_INTENT_DUPLICATED';
  END IF;

  -- Una clave de facturación de pedido no puede ser pre-ocupada por una
  -- emisión genérica ni reutilizada para otro pedido del mismo tenant/actor.
  -- Los demás campos son idénticos para demostrar que el vínculo del pedido
  -- forma parte real de la huella, no que el rechazo sea accidental.
  v_first := app.reserve_customer_invoice_semantics_530(
    v_tenant_a, v_cpe, v_cxc, 'verify-530-order-bound', v_pedido_intent_a
  );
  v_retry := app.reserve_customer_invoice_semantics_530(
    v_tenant_a, v_cpe, v_cxc, 'verify-530-order-bound', v_pedido_intent_a
  );
  IF (v_first->>'idempotent')::boolean
     OR NOT (v_retry->>'idempotent')::boolean
     OR (SELECT pedido_id
         FROM public.customer_invoice_intent_semantics
         WHERE tenant_id = v_tenant_a
           AND idempotency_key = 'verify-530-order-bound')
        IS DISTINCT FROM v_pedido_intent_a THEN
    RAISE EXCEPTION 'VERIFY_530_ORDER_BOUND_RETRY_INVALID:%/%', v_first, v_retry;
  END IF;
  v_rejected := false;
  BEGIN
    PERFORM app.reserve_customer_invoice_semantics_530(
      v_tenant_a, v_cpe, v_cxc, 'verify-530-order-bound', v_pedido_intent_b
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected := SQLERRM LIKE '%CUSTOMER_INVOICE_IDEMPOTENCY_SEMANTIC_CONFLICT%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_CROSS_ORDER_IDEMPOTENCY_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM app.reserve_customer_invoice_semantics_530(
      v_tenant_a, v_cpe, v_cxc,
      'ventas.cpe.factura:' || v_tenant_a::text || ':' || v_pedido_intent_a::text,
      NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%PEDIDO_INVOICE_IDEMPOTENCY_OWNER_REQUIRED%';
  END;
  IF NOT v_rejected OR EXISTS (
    SELECT 1 FROM public.customer_invoice_intent_semantics s
    WHERE s.tenant_id = v_tenant_a
      AND s.idempotency_key = 'ventas.cpe.factura:' || v_tenant_a::text
        || ':' || v_pedido_intent_a::text
  ) THEN
    RAISE EXCEPTION 'VERIFY_530_GENERIC_PRECLAIM_CREATED_ORDER_INTENT';
  END IF;

  -- La 443 historica trata la key como case-sensitive. 530 debe ampliar el
  -- fingerprint sin convertir dos intents previamente distintos en uno solo.
  v_first := app.reserve_customer_invoice_semantics_530(
    v_tenant_a, v_cpe, v_cxc, 'Verify-530-Case-Key'
  );
  v_retry := app.reserve_customer_invoice_semantics_530(
    v_tenant_a, v_cpe, v_cxc, 'verify-530-case-key'
  );
  IF (v_first->>'idempotent')::boolean
     OR (v_retry->>'idempotent')::boolean
     OR (v_first->>'intent_id') IS NOT DISTINCT FROM (v_retry->>'intent_id')
     OR (SELECT count(*) FROM public.customer_invoice_intent_semantics
         WHERE tenant_id = v_tenant_a
           AND lower(idempotency_key) = 'verify-530-case-key') <> 2 THEN
    RAISE EXCEPTION 'VERIFY_530_INVOICE_KEY_CASE_COLLAPSED:%/%', v_first, v_retry;
  END IF;
END;
$behavior$;

DO $pos_behavior$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_cliente uuid;
  v_almacen uuid;
  v_caja uuid;
  v_sesion uuid;
  v_producto uuid;
  v_metodo_credito uuid;
  v_country_id integer;
  v_fecha date;
  v_result jsonb;
  v_retry jsonb;
  v_request jsonb;
  v_payload jsonb;
  v_venta uuid;
  v_documento uuid;
  v_cxc uuid;
  v_event uuid;
  v_direct_event uuid := gen_random_uuid();
  v_direct_reservation jsonb;
  v_direct_cpe jsonb;
  v_direct_result jsonb;
  v_direct_retry jsonb;
  v_direct_cpe_id uuid;
  v_direct_documento_id uuid;
  v_pos_cpe jsonb;
  v_pos_xml text := '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>VERIFY-530</ID></Invoice>';
  v_pos_hash text;
  v_finalized jsonb;
  v_finalized_retry jsonb;
  v_finalized_cpe_id uuid;
  v_rejected boolean;
BEGIN
  -- Fixture de escritura completa: venta, documento, CxC y outbox. Todo ocurre
  -- dentro de esta base efímera y se revierte al final del verificador.
  UPDATE app.deployment_environment
  SET environment = 'DEV', project_ref = 'localdianposverifyxx',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY DIAN POS 530', 1, 'CO') INTO v_demo;
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  SELECT id INTO STRICT v_country_id
  FROM public.paises WHERE upper(codigo_iso) = 'CO' AND coalesce(activo, true);
  UPDATE public.tenants SET pais = 'CO' WHERE id = v_tenant;
  v_fecha := app.hoy_tenant(v_tenant);
  UPDATE public.empresa_config
  SET pais_id = v_country_id,
      pais = 'CO', moneda_defecto = 'COP',
      ruc = '9015300007', razon_social = 'Emisor DIAN POS verify 530',
      direccion_fiscal = 'Carrera 7 # 72-41', departamento = 'Bogota D.C.',
      provincia = 'Bogota D.C.', ubigeo = '11001',
      estado = 'ACTIVO', configuracion_completa = true, is_demo = false,
      demo_extended = false, demo_expires_at = NULL,
      dian_activo = true, dian_resolucion_numero = '187640530-POS',
      dian_resolucion_prefijo = '',
      dian_resolucion_desde = 200, dian_resolucion_hasta = 205,
      dian_resolucion_fecha_inicio = v_fecha - 1,
      dian_resolucion_fecha_fin = v_fecha + 30,
      igv_porcentaje = 19, aplicar_limite_credito = true,
      dias_vencimiento_factura = 30
  WHERE tenant_id = v_tenant;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-CO-530', 'Almacen DIAN POS 530',
    'ACTIVO', true, true, 'CO'
  ) RETURNING id INTO v_almacen;
  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (
    v_tenant, 'CAJA-CO-530', 'Caja DIAN POS 530',
    'ACTIVO', v_almacen, 'MOSTRADOR', v_actor
  ) RETURNING id INTO v_caja;
  SELECT (public.abrir_caja_tx(
    v_tenant, v_caja, v_actor,
    jsonb_build_object(
      'cajero_id', v_actor, 'monto_inicio', 100000,
      'moneda', 'COP', 'dispositivo', 'TERM-CO-530',
      'denominaciones_apertura', '{}'::jsonb
    )
  )->>'id')::uuid INTO v_sesion;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc,
    estado, activo, limite_credito, permite_morosidad
  ) VALUES (
    v_tenant, 'CLI-CO-530', 'Cliente DIAN POS 530', 'Cliente DIAN POS 530',
    'NIT', '9003739121', 'ACTIVO', true, 10000, false
  ) RETURNING id INTO v_cliente;
  UPDATE public.clientes
  SET dian_perfil_fiscal = 'ADQUIRIENTE_NIT_B2B',
      dian_responsabilidad_fiscal = 'O-99',
      dian_responsabilidad_list_name = '04',
      dian_tributo_id = '01', dian_tributo_nombre = 'IVA'
  WHERE id = v_cliente AND tenant_id = v_tenant;

  SELECT (public.crear_producto_inventario_tx(v_tenant, jsonb_build_object(
    'codigo', 'PROD-CO-530', 'nombre', 'Producto DIAN POS 530',
    'categoria', 'VERIFY', 'precio_venta', 100, 'precio_compra', 40,
    'afectacion_igv', '10', 'es_servicio', false, 'controla_stock', true
  ), v_almacen, 5, 0, '[]'::jsonb)->>'id')::uuid INTO v_producto;
  SELECT id INTO STRICT v_metodo_credito
  FROM public.metodos_pago
  WHERE tenant_id IS NULL AND lower(btrim(codigo)) = 'credito'
    AND upper(coalesce(tipo, '')) = 'CREDITO'
    AND coalesce(activo, true)
  ORDER BY id LIMIT 1;

  v_request := jsonb_build_object(
    'emitir_cpe', true,
    'cliente_id', v_cliente,
    'cliente_documento', '9003739121',
    'cliente_tipo_documento', '31',
    'cliente_nombre', 'Cliente DIAN POS 530',
    'moneda', 'COP', 'ticket_serie', 'T530',
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto, 'cantidad', 1,
      'precio_unitario', 100, 'precio_original', 100,
      'descuento_monto', 0, 'subtotal', 100, 'igv', 19
    )),
    'pagos', jsonb_build_array(jsonb_build_object(
      'metodo_pago_id', v_metodo_credito, 'codigo', 'credito',
      'monto', 119, 'moneda', 'COP'
    )),
    'cpe_data', jsonb_build_object(
      'tipo_documento', '01', 'serie', 'HACK',
      'ruc_emisor', '9015300007',
      'razon_social_emisor', 'Emisor DIAN POS verify 530',
      'tipo_documento_receptor', '31',
      'documento_receptor', '9003739121',
      'razon_social_receptor', 'Cliente DIAN POS 530',
      'moneda', 'COP', 'total_gravadas', 100,
      'total_exoneradas', 0, 'total_inafectas', 0,
      'total_exportacion', 0, 'total_igv', 19, 'total_venta', 119,
      'condicion_pago', 'CONTADO', 'medio_pago', '42',
      'metadata', jsonb_build_object('dian_forma_pago', 'CONTADO')
    )
  );

  v_result := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion, 'verify-dian-pos-530-sale', v_request
  );
  v_venta := (v_result->>'venta_id')::uuid;
  v_documento := (v_result->>'documento_id')::uuid;
  v_cxc := (v_result->>'cuenta_por_cobrar_id')::uuid;
  v_event := (v_result->>'accounting_event_id')::uuid;
  IF v_venta IS NULL OR v_documento IS NULL OR v_cxc IS NULL OR v_event IS NULL
     OR v_result->>'numero_fiscal' <> '200'
     OR v_result->>'dian_numbering_status' <> 'CONSUMIDA'
     OR (v_result->>'credito_monto')::numeric <> 119
     OR coalesce((v_result->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'VERIFY_530_CO_POS_RESULT_INVALID:%', v_result;
  END IF;

  SELECT o.payload INTO STRICT v_payload
  FROM public.outbox_events o
  WHERE o.tenant_id = v_tenant AND o.event_id = v_event
    AND o.event_type = 'pos.venta.registrada';
  IF (SELECT count(*) FROM public.dian_numeracion_reservas r
      WHERE r.tenant_id = v_tenant
        AND r.idempotency_key = 'pos.cpe:' || v_tenant::text || ':verify-dian-pos-530-sale'
        AND r.prefijo = '' AND r.correlativo = 200
        AND r.numero_completo = '200' AND r.fecha_emision = v_fecha
        AND r.estado = 'CONSUMIDA' AND r.consumida_at IS NOT NULL
        AND r.venta_pos_id = v_venta AND r.documento_id = v_documento
        AND r.cpe_id IS NULL) <> 1
     OR EXISTS (
       SELECT 1 FROM public.ventas_pos v
       WHERE v.id = v_venta AND (
         v.cpe_data->>'serie' IS DISTINCT FROM ''
         OR (v.cpe_data->>'numero')::integer IS DISTINCT FROM 200
         OR v.cpe_data->>'numero_fiscal' IS DISTINCT FROM '200'
         OR v.cpe_data #>> '{metadata,numero_fiscal}' IS DISTINCT FROM '200'
         OR v.cpe_data #>> '{metadata,dian_prefijo_autorizado}' IS DISTINCT FROM ''
         OR (v.cpe_data->>'fecha_emision')::date IS DISTINCT FROM v_fecha
         OR (v.cpe_data->>'fecha_vencimiento')::date IS DISTINCT FROM v_fecha + 30
         OR v.cpe_data->>'condicion_pago' IS DISTINCT FROM 'CREDITO'
         OR v.cpe_data #>> '{metadata,dian_forma_pago}' IS DISTINCT FROM 'CREDITO'
       )
     ) OR EXISTS (
       SELECT 1 FROM public.documentos d
       WHERE d.id = v_documento AND (
         d.serie IS DISTINCT FROM '' OR d.numero IS DISTINCT FROM '00000200'
         OR d.metadata->>'numero_fiscal' IS DISTINCT FROM '200'
         OR d.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM ''
         OR (d.fecha_emision AT TIME ZONE 'America/Bogota')::date IS DISTINCT FROM v_fecha
         OR (d.fecha_vencimiento AT TIME ZONE 'America/Bogota')::date IS DISTINCT FROM v_fecha + 30
       )
     ) OR EXISTS (
       SELECT 1 FROM public.cuentas_por_cobrar c
       WHERE c.id = v_cxc AND (
         c.serie IS DISTINCT FROM '' OR c.numero IS DISTINCT FROM '00000200'
         OR c.numero_documento IS DISTINCT FROM '200'
         OR c.metadata->>'numero_fiscal' IS DISTINCT FROM '200'
         OR c.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM ''
         OR c.fecha_emision IS DISTINCT FROM v_fecha
         OR c.fecha_vencimiento IS DISTINCT FROM v_fecha + 30
       )
     ) OR v_payload->>'numeroFiscal' IS DISTINCT FROM '200'
     OR v_payload->>'numero_fiscal' IS DISTINCT FROM '200'
     OR v_payload->>'dianPrefijoAutorizado' IS DISTINCT FROM ''
     OR v_payload->>'dianNumberReservationId' IS NULL THEN
    RAISE EXCEPTION 'VERIFY_530_CO_POS_DURABLE_SURFACES_DIVERGED:%', v_payload;
  END IF;

  BEGIN
    UPDATE public.documentos d
    SET serie = '',
        metadata = coalesce(d.metadata, '{}'::jsonb)
          - 'dian_numbering_contract_version'
          - 'dian_prefijo_autorizado'
    WHERE d.id = v_documento;
    IF EXISTS (
      SELECT 1 FROM public.documentos d
      WHERE d.id = v_documento AND d.serie = ''
    ) THEN
      RAISE EXCEPTION 'VERIFY_530_EMPTY_DOCUMENT_PREFIX_WAS_NOT_NARROW';
    END IF;
    -- Fuerza el rollback de esta subtransaccion para no mutar la fila que el
    -- reintento idempotente comprueba a continuacion.
    RAISE EXCEPTION 'VERIFY_530_OPTIONAL_PREFIX_ROLLBACK_SENTINEL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'VERIFY_530_OPTIONAL_PREFIX_ROLLBACK_SENTINEL' THEN
      RAISE;
    END IF;
  END;

  v_retry := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion, 'verify-dian-pos-530-sale', v_request
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR (v_retry->>'venta_id')::uuid IS DISTINCT FROM v_venta
     OR v_retry->>'numero_fiscal' IS DISTINCT FROM '200'
     OR v_retry->>'dian_numbering_status' IS DISTINCT FROM 'CONSUMIDA'
     OR (SELECT count(*) FROM public.ventas_pos
         WHERE tenant_id = v_tenant AND idempotency_key = 'verify-dian-pos-530-sale') <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant AND event_id = v_event) <> 1
     OR (SELECT count(*) FROM public.dian_numeracion_reservas
         WHERE tenant_id = v_tenant) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_530_CO_POS_RETRY_MUTATED:%', v_retry;
  END IF;

  -- El segundo commit POS crea el CPE y debe completar la misma reserva, no
  -- abrir otra ni perder la identidad cuando la resolución no tiene prefijo.
  SELECT v.cpe_data INTO STRICT v_pos_cpe
  FROM public.ventas_pos v
  WHERE v.id = v_venta AND v.tenant_id = v_tenant;
  v_pos_hash := upper(substr(encode(
    extensions.digest(convert_to(v_pos_xml, 'UTF8'), 'sha256'), 'hex'
  ), 1, 32));
  v_pos_cpe := v_pos_cpe || jsonb_build_object(
    'documento_id', v_documento,
    'venta_pos_id', v_venta,
    'xml_firmado', v_pos_xml,
    'hash', v_pos_hash,
    'hash_firma', v_pos_hash,
    'fecha_emision', v_fecha,
    'fecha_vencimiento', v_fecha + 30
  );
  v_finalized := public.finalizar_cpe_pos_tx(
    v_tenant, v_actor, v_venta, v_pos_cpe,
    'pos.cpe:' || v_tenant::text || ':verify-dian-pos-530-sale'
  );
  v_finalized_retry := public.finalizar_cpe_pos_tx(
    v_tenant, v_actor, v_venta, v_pos_cpe,
    'pos.cpe:' || v_tenant::text || ':verify-dian-pos-530-sale'
  );
  v_finalized_cpe_id := (v_finalized->>'cpe_id')::uuid;
  IF v_finalized_cpe_id IS NULL
     OR (v_finalized_retry->>'cpe_id')::uuid IS DISTINCT FROM v_finalized_cpe_id
     OR v_finalized->>'numero_fiscal' IS DISTINCT FROM '200'
     OR v_finalized->>'dian_numbering_status' IS DISTINCT FROM 'CONSUMIDA'
     OR EXISTS (
       SELECT 1 FROM public.cpe c
       WHERE c.id = v_finalized_cpe_id AND c.tenant_id = v_tenant
         AND (
           c.serie IS DISTINCT FROM ''
           OR c.numero IS DISTINCT FROM '200'
           OR c.metadata->>'numero_fiscal' IS DISTINCT FROM '200'
           OR c.metadata->>'dian_number_reservation_id'
                IS DISTINCT FROM v_result->>'dian_number_reservation_id'
         )
     ) OR NOT EXISTS (
       SELECT 1 FROM public.dian_numeracion_reservas r
       WHERE r.tenant_id = v_tenant
         AND r.idempotency_key = 'pos.cpe:' || v_tenant::text
           || ':verify-dian-pos-530-sale'
         AND r.estado = 'CONSUMIDA' AND r.cpe_id = v_finalized_cpe_id
         AND r.venta_pos_id = v_venta AND r.documento_id = v_documento
     ) OR (SELECT count(*) FROM public.cpe c
           WHERE c.tenant_id = v_tenant
             AND c.idempotency_key = 'pos.cpe:' || v_tenant::text
               || ':verify-dian-pos-530-sale') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_530_POS_FINALIZATION_LIFECYCLE_DIVERGED:%/%',
      v_finalized, v_finalized_retry;
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.anular_reserva_numeracion_dian_tx(
      v_tenant, v_actor,
      (v_result->>'dian_number_reservation_id')::uuid,
      'No debe poder anularse después del documento POS'
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM LIKE '%DIAN_NUMBERING_CONSUMED_CANNOT_BE_CANCELLED%';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_530_CONSUMED_POS_RESERVATION_CANCELLED';
  END IF;

  -- La misma frontera POS debe sellar también una resolución con prefijo sin
  -- convertir FV300 en FV00000300 ni dejar el alias Dxxx en metadata/outbox.
  UPDATE public.empresa_config
  SET dian_resolucion_numero = '187640530-POS-FV',
      dian_resolucion_prefijo = 'FV',
      dian_resolucion_desde = 300,
      dian_resolucion_hasta = 305
  WHERE tenant_id = v_tenant;
  v_result := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion, 'verify-dian-pos-530-prefixed', v_request
  );
  v_venta := (v_result->>'venta_id')::uuid;
  v_documento := (v_result->>'documento_id')::uuid;
  v_cxc := (v_result->>'cuenta_por_cobrar_id')::uuid;
  v_event := (v_result->>'accounting_event_id')::uuid;
  SELECT o.payload INTO STRICT v_payload
  FROM public.outbox_events o
  WHERE o.tenant_id = v_tenant AND o.event_id = v_event
    AND o.event_type = 'pos.venta.registrada';
  IF v_result->>'numero_fiscal' IS DISTINCT FROM 'FV300'
     OR EXISTS (
       SELECT 1 FROM public.ventas_pos v WHERE v.id = v_venta AND (
         v.cpe_data->>'serie' IS DISTINCT FROM 'FV'
         OR v.cpe_data->>'numero_fiscal' IS DISTINCT FROM 'FV300'
         OR v.cpe_data #>> '{metadata,numero_fiscal}' IS DISTINCT FROM 'FV300'
         OR v.cpe_data #>> '{metadata,dian_prefijo_autorizado}' IS DISTINCT FROM 'FV'
       )
     ) OR EXISTS (
       SELECT 1 FROM public.documentos d WHERE d.id = v_documento AND (
         d.serie IS DISTINCT FROM 'FV'
         OR d.metadata->>'numero_fiscal' IS DISTINCT FROM 'FV300'
         OR d.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM 'FV'
       )
     ) OR EXISTS (
       SELECT 1 FROM public.cuentas_por_cobrar c WHERE c.id = v_cxc AND (
         c.serie IS DISTINCT FROM 'FV'
         OR c.numero_documento IS DISTINCT FROM 'FV300'
         OR c.metadata->>'numero_fiscal' IS DISTINCT FROM 'FV300'
         OR c.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM 'FV'
       )
     ) OR v_payload->>'numeroFiscal' IS DISTINCT FROM 'FV300'
     OR v_payload->>'numero_fiscal' IS DISTINCT FROM 'FV300'
     OR v_payload->>'dianPrefijoAutorizado' IS DISTINCT FROM 'FV' THEN
    RAISE EXCEPTION 'VERIFY_530_CO_POS_PREFIXED_IDENTITY_DIVERGED:%/%',
      v_result, v_payload;
  END IF;
  v_retry := public.pos_registrar_venta_atomic_tx(
    v_tenant, v_actor, v_sesion, 'verify-dian-pos-530-prefixed', v_request
  );
  IF NOT coalesce((v_retry->>'idempotent')::boolean, false)
     OR v_retry->>'numero_fiscal' IS DISTINCT FROM 'FV300'
     OR (SELECT count(*) FROM public.dian_numeracion_reservas
         WHERE tenant_id = v_tenant
           AND idempotency_key = 'pos.cpe:' || v_tenant::text
             || ':verify-dian-pos-530-prefixed'
           AND numero_completo = 'FV300') <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.dian_numeracion_reservas r
       JOIN public.documento_series ds ON ds.id = r.documento_serie_id
       WHERE r.tenant_id = v_tenant
         AND r.idempotency_key = 'pos.cpe:' || v_tenant::text
           || ':verify-dian-pos-530-prefixed'
         AND ds.metadata->>'dian_writer_alias' ~ '^[A-Z0-9]{4}$'
         AND ds.metadata->>'dian_writer_alias' !~ '^T'
     ) THEN
    RAISE EXCEPTION 'VERIFY_530_CO_POS_PREFIXED_RETRY_MUTATED:%', v_retry;
  END IF;

  UPDATE public.empresa_config
  SET dian_resolucion_numero = '187640530-POS',
      dian_resolucion_prefijo = '',
      dian_resolucion_desde = 200,
      dian_resolucion_hasta = 205
  WHERE tenant_id = v_tenant;

  -- Emisión CPE directa (no POS) con resolución sin prefijo. Esta llamada
  -- atraviesa el writer real 443 adaptado por 530 y prueba también su retry.
  v_direct_reservation := public.reservar_numeracion_dian_ui_tx(
    v_tenant, v_actor, '01', v_fecha, 'verify-dian-direct-530',
    repeat('d', 64)
  );
  IF v_direct_reservation->>'prefijo' IS DISTINCT FROM ''
     OR (v_direct_reservation->>'correlativo')::integer IS DISTINCT FROM 201 THEN
    RAISE EXCEPTION 'VERIFY_530_DIRECT_RESERVATION_DIVERGED:%', v_direct_reservation;
  END IF;
  v_direct_cpe := jsonb_build_object(
    'tipo_documento', '01', 'serie', '', 'numero', 201,
    'ruc_emisor', '9015300007', 'razon_social_emisor', 'Emisor DIAN POS verify 530',
    'direccion_emisor', 'Carrera 7 # 72-41',
    'tipo_documento_receptor', '31', 'documento_receptor', '9015300098',
    'razon_social_receptor', 'Cliente DIAN POS 530', 'cliente_id', v_cliente,
    'moneda', 'COP', 'total_gravadas', 100, 'total_exoneradas', 0,
    'total_inafectas', 0, 'total_exportacion', 0, 'total_igv', 19,
    'total_venta', 119, 'items', '[]'::jsonb,
    'fecha_emision', v_fecha, 'fecha_vencimiento', v_fecha,
    'estado', 'FIRMADO', 'sunat_status', 'READY',
    'hash', repeat('a', 64), 'hash_firma', repeat('a', 64),
    'xml_firmado', '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>',
    'created_by', v_actor,
    'metadata', jsonb_build_object('pais', 'CO', 'dian_forma_pago', 'CONTADO')
  );
  v_direct_result := public.emitir_factura_cliente_tx(
    v_tenant, v_direct_cpe,
    jsonb_build_object(
      'subtotal', 100, 'impuesto_igv', 19, 'impuesto_isc', 0,
      'total', 119, 'tipo_cambio', 1,
      'metadata', jsonb_build_object('source', 'cpe.api.atomic', 'pais', 'CO')
    ),
    jsonb_build_array(jsonb_build_object(
      'orden', 1, 'codigo_producto', 'VERIFY-DIRECT-530',
      'descripcion', 'Servicio verificador DIAN directo', 'unidad_medida', 'NIU',
      'cantidad', 1, 'precio_unitario', 100, 'descuento_unitario', 0,
      'valor_venta', 100, 'impuesto_igv', 19, 'impuesto_isc', 0,
      'total_item', 119, 'afectacion_igv', '10'
    )), NULL, v_direct_event, 'verify-dian-direct-530'
  );
  v_direct_cpe_id := (v_direct_result->>'cpe_id')::uuid;
  v_direct_documento_id := (v_direct_result->>'documento_id')::uuid;

  IF v_direct_result->>'numero_fiscal' IS DISTINCT FROM '201'
     OR v_direct_result->>'serie' IS DISTINCT FROM ''
     OR v_direct_result->>'dian_numbering_status' IS DISTINCT FROM 'CONSUMIDA'
     OR EXISTS (
       SELECT 1 FROM public.cpe c WHERE c.id = v_direct_cpe_id AND (
         c.serie IS DISTINCT FROM '' OR c.numero IS DISTINCT FROM '201'
         OR c.metadata->>'numero_fiscal' IS DISTINCT FROM '201'
         OR c.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM ''
       )
     ) OR EXISTS (
       SELECT 1 FROM public.documentos d WHERE d.id = v_direct_documento_id AND (
         d.serie IS DISTINCT FROM '' OR d.numero IS DISTINCT FROM '201'
         OR d.metadata->>'numero_fiscal' IS DISTINCT FROM '201'
         OR d.metadata->>'dian_prefijo_autorizado' IS DISTINCT FROM ''
       )
     ) OR EXISTS (
       SELECT 1 FROM public.outbox_events o
       WHERE o.tenant_id = v_tenant
         AND (o.aggregate_id = v_direct_cpe_id::text OR o.payload->>'cpeId' = v_direct_cpe_id::text)
         AND (o.payload->>'serie' IS DISTINCT FROM ''
           OR o.payload->>'numeroFiscal' IS DISTINCT FROM '201'
           OR o.payload->>'numero_fiscal' IS DISTINCT FROM '201'
           OR o.payload->>'dianPrefijoAutorizado' IS DISTINCT FROM '')
     ) THEN
    RAISE EXCEPTION 'VERIFY_530_DIRECT_IDENTITY_DIVERGED:%', v_direct_result;
  END IF;

  v_direct_retry := public.emitir_factura_cliente_tx(
    v_tenant, v_direct_cpe,
    jsonb_build_object(
      'subtotal', 100, 'impuesto_igv', 19, 'impuesto_isc', 0,
      'total', 119, 'tipo_cambio', 1,
      'metadata', jsonb_build_object('source', 'cpe.api.atomic', 'pais', 'CO')
    ),
    jsonb_build_array(jsonb_build_object(
      'orden', 1, 'codigo_producto', 'VERIFY-DIRECT-530',
      'descripcion', 'Servicio verificador DIAN directo', 'unidad_medida', 'NIU',
      'cantidad', 1, 'precio_unitario', 100, 'descuento_unitario', 0,
      'valor_venta', 100, 'impuesto_igv', 19, 'impuesto_isc', 0,
      'total_item', 119, 'afectacion_igv', '10'
    )), NULL, v_direct_event, 'verify-dian-direct-530'
  );
  IF NOT coalesce((v_direct_retry->>'idempotent')::boolean, false)
     OR (v_direct_retry->>'cpe_id')::uuid IS DISTINCT FROM v_direct_cpe_id
     OR (v_direct_retry->>'documento_id')::uuid IS DISTINCT FROM v_direct_documento_id
     OR v_direct_retry->>'numero_fiscal' IS DISTINCT FROM '201'
     OR EXISTS (
       SELECT 1 FROM public.cpe c WHERE c.id = v_direct_cpe_id
         AND c.metadata->>'numero_fiscal' IS DISTINCT FROM '201'
     )
     OR (SELECT count(*) FROM public.cpe
         WHERE tenant_id = v_tenant AND idempotency_key = 'verify-dian-direct-530') <> 1
     OR (SELECT count(*) FROM public.dian_numeracion_reservas
         WHERE tenant_id = v_tenant AND idempotency_key = 'verify-dian-direct-530'
           AND estado = 'CONSUMIDA' AND cpe_id = v_direct_cpe_id
           AND documento_id = v_direct_documento_id
           AND venta_pos_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_530_DIRECT_RETRY_MUTATED:%', v_direct_retry;
  END IF;
END;
$pos_behavior$;

ROLLBACK;
