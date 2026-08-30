\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_526') THEN
    RAISE EXCEPTION 'VERIFY_526_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contracts$
DECLARE
  v_create text;
  v_update text;
  v_trigger text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('dian_perfil_fiscal'), ('dian_responsabilidad_fiscal'),
      ('dian_responsabilidad_list_name'), ('dian_tributo_id'), ('dian_tributo_nombre')
    ) expected(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'clientes'
        AND c.column_name = expected.name
    )
  ) THEN RAISE EXCEPTION 'VERIFY_526_CLIENT_COLUMNS_MISSING'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_clientes_dian_perfil_526')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_clientes_dian_b2b_nit_526')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_cpe_dian_receiver_snapshot_526') THEN
    RAISE EXCEPTION 'VERIFY_526_PROFILE_CONSTRAINTS_MISSING';
  END IF;
  IF to_regprocedure('app.snapshot_dian_receiver_profile_526()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_snapshot_dian_receiver_profile_526') THEN
    RAISE EXCEPTION 'VERIFY_526_CPE_SNAPSHOT_MISSING';
  END IF;

  SELECT pg_get_functiondef('public.crear_cliente_maestro_tx(uuid,uuid,jsonb)'::regprocedure)
  INTO v_create;
  SELECT pg_get_functiondef('public.actualizar_cliente_maestro_tx(uuid,uuid,uuid,jsonb)'::regprocedure)
  INTO v_update;
  SELECT pg_get_functiondef('app.snapshot_dian_receiver_profile_526()'::regprocedure)
  INTO v_trigger;
  IF strpos(v_create, 'DIAN_RECEIVER_TAX_PROFILE_REQUIRED') = 0
     OR strpos(v_create, 'app.demo_hydration_country_524') = 0
     OR strpos(v_update, 'DIAN_RECEIVER_TAX_PROFILE_REQUIRED') = 0 THEN
    RAISE EXCEPTION 'VERIFY_526_FAIL_CLOSED_WRITER_MISSING';
  END IF;
  IF strpos(v_trigger, 'WHERE id = NEW.cliente_id AND tenant_id = NEW.tenant_id') = 0
     OR strpos(v_trigger, 'dian_receptor_tax_profile') = 0
     OR strpos(v_trigger, 'DIAN_RECEIVER_PROFILE_IMMUTABLE') = 0
     OR strpos(v_trigger, 'DIAN_RECEIVER_TAX_PROFILE_REQUIRED') = 0 THEN
    RAISE EXCEPTION 'VERIFY_526_TENANT_SNAPSHOT_DIVERGED';
  END IF;

  IF has_function_privilege('anon', 'public.crear_cliente_maestro_tx(uuid,uuid,jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crear_cliente_maestro_tx(uuid,uuid,jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'public.crear_cliente_maestro_tx_524_legacy_526(uuid,uuid,jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'app.snapshot_dian_receiver_profile_526()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_526_INTERNAL_WRITER_EXPOSED';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.crear_cliente_maestro_tx(uuid,uuid,jsonb)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.actualizar_cliente_maestro_tx(uuid,uuid,uuid,jsonb)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_526_SERVICE_ROLE_GRANT_MISSING';
  END IF;
END;
$contracts$;

DO $behavior$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_other_client uuid := gen_random_uuid();
  v_cpe uuid := gen_random_uuid();
  v_missing_profile_cpe uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_rejected boolean;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;
  INSERT INTO public.tenants (id, codigo, nombre, pais, plan, activo, estado)
  VALUES (
    v_tenant, 'VERIFY-526-' || left(v_tenant::text, 8),
    'Tenant verify 526', 'CO', 'test', true, 'ACTIVO'
  );
  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, direccion_fiscal, pais, moneda_defecto,
    estado, configuracion_completa, is_demo
  ) VALUES (
    v_tenant, '9001234568', 'Emisor verify 526', 'Bogotá D.C.', 'CO',
    'COP', 'ACTIVO', false, false
  );
  INSERT INTO public.clientes (
    id, tenant_id, nombre, razon_social, documento_tipo,
    dian_perfil_fiscal, dian_responsabilidad_fiscal,
    dian_responsabilidad_list_name, dian_tributo_id, dian_tributo_nombre
  ) VALUES
    (
      v_client, v_tenant, 'Adquirente verify 526', 'Adquirente verify 526', 'NIT',
      'ADQUIRIENTE_NIT_B2B', 'O-99', '04', '01', 'IVA'
    ),
    (
      v_other_client, v_tenant, 'Otro adquirente verify 526',
      'Otro adquirente verify 526', 'NIT',
      'ADQUIRIENTE_NIT_B2B', 'O-99', '04', '01', 'IVA'
    );

  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero,
    ruc_emisor, razon_social_emisor, tipo_documento_receptor,
    documento_receptor, razon_social_receptor, cliente_id, moneda,
    total_gravadas, total_igv, total_venta, total, items,
    fecha_emision, idempotency_key, estado, estado_sunat,
    sunat_status, metadata, activo
  ) VALUES (
    v_cpe, v_tenant, '01', 'FV526', '00000001',
    '9001234568', 'Emisor verify 526', '31',
    '9001082813', 'Adquirente verify 526', v_client, 'COP',
    100, 19, 119, 119,
    '[{"codigo":"P526","descripcion":"Perfil 526","cantidad":1,"valor_venta":100,"igv":19,"total":119}]'::jsonb,
    now(), 'verify.cpe.526.profile', 'FIRMADO', 'PENDIENTE',
    'READY', jsonb_build_object('source', 'verify.526'), true
  );
  SELECT metadata->'dian_receptor_tax_profile' INTO v_snapshot
  FROM public.cpe WHERE id = v_cpe;
  IF v_snapshot IS DISTINCT FROM jsonb_build_object(
    'profile', 'ADQUIRIENTE_NIT_B2B', 'taxLevelCode', 'O-99',
    'taxLevelListName', '04', 'taxSchemeId', '01', 'taxSchemeName', 'IVA'
  ) THEN
    RAISE EXCEPTION 'VERIFY_526_RECEIVER_SNAPSHOT_INVALID:%', v_snapshot;
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET metadata = jsonb_set(
      metadata, '{dian_receptor_tax_profile,taxLevelCode}', '"R-99-PN"'::jsonb
    )
    WHERE id = v_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_RECEIVER_PROFILE_IMMUTABLE' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_526_RECEIVER_SNAPSHOT_MUTATION_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe SET cliente_id = v_other_client WHERE id = v_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_RECEIVER_PROFILE_IMMUTABLE' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_526_RECEIVER_CLIENT_MUTATION_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.cpe (
      id, tenant_id, tipo_documento, serie, numero,
      ruc_emisor, razon_social_emisor, tipo_documento_receptor,
      documento_receptor, razon_social_receptor, moneda,
      total_gravadas, total_igv, total_venta, total, items,
      fecha_emision, idempotency_key, estado, estado_sunat,
      sunat_status, metadata, activo
    ) VALUES (
      v_missing_profile_cpe, v_tenant, '01', 'FV526', '00000002',
      '9001234568', 'Emisor verify 526', '13',
      '1020304050', 'Receptor sin perfil', 'COP',
      100, 19, 119, 119,
      '[{"codigo":"M526","descripcion":"Sin perfil 526","cantidad":1,"valor_venta":100,"igv":19,"total":119}]'::jsonb,
      now(), 'verify.cpe.526.missing-profile', 'FIRMADO', 'PENDIENTE',
      'READY', '{}'::jsonb, true
    );
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_RECEIVER_TAX_PROFILE_REQUIRED' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected OR EXISTS (SELECT 1 FROM public.cpe WHERE id = v_missing_profile_cpe) THEN
    RAISE EXCEPTION 'VERIFY_526_REAL_CPE_WITHOUT_PROFILE_ACCEPTED';
  END IF;
END;
$behavior$;

ROLLBACK;
