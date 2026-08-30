\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_cpe_525') THEN
    RAISE EXCEPTION 'VERIFY_525_SOLO_BASE_LOCAL_EFIMERA:%', current_database();
  END IF;
END;
$guard$;

DO $contracts$
DECLARE
  v_definition text;
  v_trigger_count integer;
  v_rls boolean;
  v_force_rls boolean;
  v_lock_function regprocedure;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO v_definition
  FROM pg_constraint
  WHERE conrelid = 'public.empresa_config'::regclass
    AND conname = 'ck_empresa_config_dian_ultima_prueba_estado';
  IF v_definition IS NULL
     OR strpos(v_definition, 'LISTA_PARA_TESTSET') = 0
     OR strpos(v_definition, 'VALIDADA') = 0 THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_TEST_STATE_CONSTRAINT_DIVERGED:%', v_definition;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'empresa_config'
      AND column_name = 'dian_habilitacion_estado'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'empresa_config'
      AND column_name = 'dian_habilitacion_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'empresa_config'
      AND column_name = 'dian_habilitacion_evidencia' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_PORTAL_APPROVAL_COLUMNS_MISSING';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.empresa_config'::regclass
    AND tgname = 'trg_invalidate_dian_habilitacion_525'
    AND NOT tgisinternal;
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_PORTAL_APPROVAL_TRIGGER_MISSING:%', v_trigger_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cpe'
      AND column_name = 'simulated_origin' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cpe'
      AND column_name = 'issuer_snapshot' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cpe'
      AND column_name = 'fiscal_authority_evidence' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_525_PROVENANCE_COLUMNS_MISSING';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.cpe'::regclass
    AND tgname = 'trg_cpe_provenance_guard_525'
    AND NOT tgisinternal;
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_525_PROVENANCE_TRIGGER_MISSING:%', v_trigger_count;
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.cpe_operaciones'::regclass
    AND tgname = 'trg_cpe_operation_country_guard_525'
    AND NOT tgisinternal;
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_525_OPERATION_COUNTRY_TRIGGER_MISSING:%', v_trigger_count;
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.empresa_config'::regclass
    AND tgname = 'trg_empresa_country_guard_525'
    AND NOT tgisinternal;
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_525_EMPRESA_COUNTRY_TRIGGER_MISSING:%', v_trigger_count;
  END IF;

  SELECT relrowsecurity, relforcerowsecurity
  INTO v_rls, v_force_rls
  FROM pg_class
  WHERE oid = 'public.dian_package_counters'::regclass;
  IF v_rls IS NOT TRUE OR v_force_rls IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_PACKAGE_COUNTER_RLS_MISSING';
  END IF;
  IF has_table_privilege('anon', 'public.dian_package_counters', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.dian_package_counters', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('service_role', 'public.dian_package_counters', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_PACKAGE_COUNTER_DIRECT_ACCESS_EXPOSED';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.reservar_paquete_dian_tx(uuid,uuid,uuid,integer,text)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.reservar_paquete_dian_tx(uuid,uuid,uuid,integer,text)'::regprocedure,
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.reservar_paquete_dian_tx(uuid,uuid,uuid,integer,text)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.sellar_envio_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.sellar_envio_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure,
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.sellar_envio_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.registrar_habilitacion_dian_tx(uuid,uuid,text,text)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.registrar_habilitacion_dian_tx(uuid,uuid,text,text)'::regprocedure,
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.registrar_habilitacion_dian_tx(uuid,uuid,text,text)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_PUBLIC_RPC_PRIVILEGES_INVALID';
  END IF;

  IF has_function_privilege('anon', 'app.cpe_provenance_guard_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.cpe_provenance_guard_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'app.cpe_provenance_guard_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'app.cpe_operation_country_guard_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.cpe_operation_country_guard_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'app.cpe_operation_country_guard_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'app.empresa_country_guard_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.empresa_country_guard_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'app.empresa_country_guard_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'app.invalidate_dian_habilitacion_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'app.invalidate_dian_habilitacion_525()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'app.invalidate_dian_habilitacion_525()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_525_INTERNAL_GUARD_EXPOSED';
  END IF;

  SELECT pg_get_functiondef('public.registrar_habilitacion_dian_tx(uuid,uuid,text,text)'::regprocedure)
  INTO v_definition;
  IF strpos(v_definition, 'DIAN_PORTAL_HABILITACION') = 0
     OR strpos(v_definition, 'numberingValidated') = 0
     OR strpos(v_definition, 'authorityTrust') = 0
     OR strpos(v_definition, 'authorizedRanges') = 0
     OR strpos(v_definition, 'test_set_id_sha256') = 0
     OR strpos(v_definition, 'cpe_operaciones') > 0 THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_PORTAL_APPROVAL_CONTRACT_DIVERGED';
  END IF;

  SELECT pg_get_functiondef('app.cpe_provenance_guard_525()'::regprocedure)
  INTO v_definition;
  IF strpos(v_definition, 'dianEvidenceKind') = 0
     OR strpos(v_definition, 'dianUniqueCode') = 0
     OR strpos(v_definition, '^[0-9A-F]{96}$') = 0
     OR strpos(v_definition, 'DIAN_ACCEPTED_OPERATION') = 0
     OR strpos(v_definition, 'NEW.hash') > 0
     OR strpos(v_definition, 'OLD.hash') > 0 THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_EVIDENCE_CONTRACT_DIVERGED';
  END IF;

  -- El advisory tenant+ancla debe preceder cualquier row lock en todos los
  -- pasos del envío/recuperación. Esto evita ciclos CPE -> operación frente a
  -- operación -> CPE cuando dos RPC separados compiten por la misma intención.
  FOREACH v_lock_function IN ARRAY ARRAY[
    'public.reservar_paquete_dian_tx(uuid,uuid,uuid,integer,text)'::regprocedure,
    'public.sellar_envio_dian_tx(uuid,uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure,
    'public.reservar_recuperacion_dian_tx(uuid,uuid,uuid,text,text)'::regprocedure,
    'public.finalizar_recuperacion_dian_tx(uuid,uuid,uuid,text,text,text,text,jsonb)'::regprocedure
  ] LOOP
    v_definition := pg_get_functiondef(v_lock_function);
    IF strpos(v_definition, ':dian:anchor:') = 0
       OR strpos(v_definition, 'pg_advisory_xact_lock') = 0
       OR strpos(v_definition, 'FOR UPDATE') = 0
       OR strpos(v_definition, 'pg_advisory_xact_lock') > strpos(v_definition, 'FOR UPDATE') THEN
      RAISE EXCEPTION 'VERIFY_525_DIAN_ANCHOR_LOCK_ORDER_DIVERGED:%', v_lock_function;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.cpe
    WHERE simulated_origin IS NULL
       OR issuer_snapshot IS NULL
       OR fiscal_authority_evidence IS NULL
       OR issuer_snapshot->>'contract_version' <> '525'
       OR fiscal_authority_evidence->>'contract_version' <> '525'
  ) THEN
    RAISE EXCEPTION 'VERIFY_525_BACKFILL_INCOMPLETE';
  END IF;

  -- Toda fila que existía al aplicar 525 debe quedar fail-safe: la migración no
  -- puede deducir retroactivamente que un hash XML era una aceptación fiscal.
  IF EXISTS (
    SELECT 1 FROM public.cpe
    WHERE issuer_snapshot->>'source' LIKE 'LEGACY_BACKFILL%'
      AND (
        simulated_origin IS NOT TRUE
        OR fiscal_authority_evidence->>'status' <> 'LEGACY_UNVERIFIED'
      )
  ) THEN
    RAISE EXCEPTION 'VERIFY_525_LEGACY_NOT_FAIL_SAFE';
  END IF;
END;
$contracts$;

DO $behavior$
DECLARE
  v_demo_tenant uuid := gen_random_uuid();
  v_real_tenant uuid := gen_random_uuid();
  v_demo_actor uuid := gen_random_uuid();
  v_real_actor uuid := gen_random_uuid();
  v_demo_client uuid := gen_random_uuid();
  v_real_client uuid := gen_random_uuid();
  v_demo_admin_role uuid;
  v_demo_cpe uuid := gen_random_uuid();
  v_real_cpe uuid := gen_random_uuid();
  v_cude_cpe uuid := gen_random_uuid();
  v_rejected_cpe uuid := gen_random_uuid();
  v_operation uuid := gen_random_uuid();
  v_cude_operation uuid := gen_random_uuid();
  v_prepare_cpe uuid := gen_random_uuid();
  v_prepare_operation uuid := gen_random_uuid();
  v_prepare_claim uuid := gen_random_uuid();
  v_query_operation uuid;
  v_query_claim uuid;
  v_demo_origin boolean;
  v_demo_snapshot jsonb;
  v_demo_evidence jsonb;
  v_real_snapshot jsonb;
  v_real_evidence jsonb;
  v_rejected boolean;
  v_state_before_fault text;
  v_cufe text := repeat('A', 96);
  v_cude text := repeat('B', 96);
  v_cufe_response text;
  v_cude_response text;
  v_prepared_response text;
  v_prepared_cufe text := repeat('C', 96);
  v_zip_key text := repeat('D', 96);
  v_result jsonb;
  v_package_year integer := extract(year FROM current_timestamp AT TIME ZONE 'America/Bogota')::integer;
BEGIN
  v_cufe_response := '<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" '
    || 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" '
    || 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" '
    || 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:Signature/>'
    || '<cac:DocumentResponse><cac:Response><cbc:ResponseCode>02</cbc:ResponseCode></cac:Response>'
    || '<cac:DocumentReference><cbc:UUID>' || v_cufe
    || '</cbc:UUID></cac:DocumentReference></cac:DocumentResponse></ApplicationResponse>';
  v_cude_response := replace(v_cufe_response, v_cufe, v_cude);
  v_prepared_response := replace(v_cufe_response, v_cufe, v_prepared_cufe);

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
    (
      v_demo_tenant, 'VERIFY-525-DEMO-' || left(v_demo_tenant::text, 8),
      'Tenant demo verify 525', 'Fixture local transaccional',
      'CO', 'test', true, 'ACTIVO'
    ),
    (
      v_real_tenant, 'VERIFY-525-REAL-' || left(v_real_tenant::text, 8),
      'Tenant real verify 525', 'Fixture local transaccional',
      'CO', 'test', true, 'ACTIVO'
    );

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, direccion_fiscal, pais, moneda_defecto,
    estado, configuracion_completa, is_demo, dian_activo,
    dian_resolucion_numero, dian_resolucion_prefijo,
    dian_resolucion_desde, dian_resolucion_hasta,
    dian_resolucion_fecha_inicio, dian_resolucion_fecha_fin,
    dian_software_id, dian_tipo_contribuyente, dian_regimen_fiscal,
    dian_url, dian_software_pin, dian_test_set_id, dian_environment,
    certificado_pfx, certificado_password,
    dian_ultima_prueba_at, dian_ultima_prueba_estado, dian_ultima_prueba_detalle
  ) VALUES
    (
      v_demo_tenant, '9015250001', 'Emisor demo verify 525',
      'Dirección demo inicial', 'CO', 'COP', 'ACTIVO', false, true, false,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, 'HOMOLOGACION', NULL, NULL,
      NULL, 'SIMULADA', '{}'::jsonb
    ),
    (
      v_real_tenant, '9015250002', 'Emisor real verify 525',
      'Dirección real verify 525', 'CO', 'COP', 'ACTIVO', true, false, true,
      '187640525', 'FV525', 1, 999999,
      current_date - 30, current_date + 365,
      'SOFTWARE-VERIFY-525', 'PERSONA_JURIDICA', 'RESPONSABLE_IVA',
      'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
      'PIN-CIFRADO-VERIFY-525', 'TESTSET-VERIFY-525', 'PRODUCCION',
      decode('00', 'hex'), 'ENC:VERIFY-525',
      now(), 'INCOMPLETA', jsonb_build_object(
        'reachable', true,
        'numberingValidated', true,
        'authorityTrust', jsonb_build_object('ready', true),
        'environment', 'PRODUCCION',
        'authorizedRanges', jsonb_build_array(jsonb_build_object(
          'resolution', '187640525',
          'prefix', 'FV525',
          'from', 1,
          'to', 999999,
          'validFrom', (current_date - 30)::text,
          'validTo', (current_date + 365)::text
        )),
        'blocker', 'DIAN_TEST_SET_APPROVAL_EVIDENCE_REQUIRED'
      )
    );

  INSERT INTO public.roles (
    tenant_id, nombre, descripcion, is_system_role, activo
  ) VALUES (
    v_demo_tenant, 'ADMIN', 'Administrador real para promoción verify 525',
    true, true
  ) ON CONFLICT DO NOTHING;
  SELECT id INTO STRICT v_demo_admin_role
  FROM public.roles
  WHERE tenant_id = v_demo_tenant AND upper(nombre) = 'ADMIN';

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado, is_super_admin
  ) VALUES (
    v_demo_actor, v_demo_tenant, 'Actor', 'Verify 525',
    'actor-525-' || left(v_demo_actor::text, 8) || '@local.invalid',
    'actor525-' || left(v_demo_actor::text, 8),
    'unused-local-hash', true, 'ACTIVO', false
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado, is_super_admin
  ) VALUES (
    v_real_actor, v_real_tenant, 'Actor real', 'Verify 525',
    'actor-real-525-' || left(v_real_actor::text, 8) || '@local.invalid',
    'actorreal525-' || left(v_real_actor::text, 8),
    'unused-local-hash', true, 'ACTIVO', false
  );

  v_result := public.registrar_habilitacion_dian_tx(
    v_real_tenant, v_real_actor, 'verify-dian-habilitacion-525',
    'Portal DIAN: software Habilitado, evidencia verify 525'
  );
  IF v_result->>'estado' <> 'HABILITADO'
     OR (SELECT dian_habilitacion_estado FROM public.empresa_config
         WHERE tenant_id = v_real_tenant) <> 'HABILITADO'
     OR (SELECT dian_habilitacion_evidencia->>'source' FROM public.empresa_config
         WHERE tenant_id = v_real_tenant) <> 'DIAN_PORTAL_HABILITACION'
     OR (SELECT dian_habilitacion_evidencia->>'test_set_id_sha256' FROM public.empresa_config
         WHERE tenant_id = v_real_tenant) <> encode(
           extensions.digest(convert_to('TESTSET-VERIFY-525', 'UTF8'), 'sha256'), 'hex'
         ) THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_PORTAL_APPROVAL_NOT_PERSISTED:%', v_result;
  END IF;

  -- Cambiar la identidad habilitada invalida tanto la constancia del portal
  -- como la prueba técnica; un resultado antiguo jamás desbloquea producción.
  UPDATE public.empresa_config
  SET dian_software_id = 'SOFTWARE-VERIFY-525-CHANGED'
  WHERE tenant_id = v_real_tenant;
  IF (SELECT dian_habilitacion_estado IS NOT NULL
          OR dian_habilitacion_evidencia <> '{}'::jsonb
          OR dian_ultima_prueba_estado <> 'INCOMPLETA'
          OR dian_ultima_prueba_at IS NOT NULL
      FROM public.empresa_config WHERE tenant_id = v_real_tenant) THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_PORTAL_APPROVAL_NOT_INVALIDATED';
  END IF;

  -- La 526 exige que todo CPE CO real fotografíe el perfil tributario del
  -- receptor. Esta fixture de 525 se ejecuta sobre el esquema más reciente,
  -- por lo que también debe representar ese contrato posterior.
  INSERT INTO public.clientes (
    id, tenant_id, nombre, razon_social, documento_tipo,
    dian_perfil_fiscal, dian_responsabilidad_fiscal,
    dian_responsabilidad_list_name, dian_tributo_id, dian_tributo_nombre
  ) VALUES
    (
      v_demo_client, v_demo_tenant, 'Receptor demo verify 525',
      'Receptor demo verify 525', 'NIT',
      'ADQUIRIENTE_NIT_B2B', 'O-99', '04', '01', 'IVA'
    ),
    (
      v_real_client, v_real_tenant, 'Receptor real verify 525',
      'Receptor real verify 525', 'NIT',
      'ADQUIRIENTE_NIT_B2B', 'O-99', '04', '01', 'IVA'
    );

  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero,
    ruc_emisor, razon_social_emisor, tipo_documento_receptor,
    documento_receptor, razon_social_receptor, cliente_id, moneda,
    total_gravadas, total_igv, total_venta, total, items,
    fecha_emision, idempotency_key, estado, estado_sunat,
    sunat_status, metadata, activo
  ) VALUES
    (
      v_demo_cpe, v_demo_tenant, '01', 'FV525D', '00000001',
      '9015250001', 'Emisor demo verify 525', '31',
      '9005250001', 'Receptor demo verify 525', v_demo_client, 'COP',
      100, 19, 119, 119,
      '[{"codigo":"D525","descripcion":"Demo 525","cantidad":1,"valor_venta":100,"igv":19,"total":119}]'::jsonb,
      now(), 'verify.cpe.525.demo', 'FIRMADO', 'PENDIENTE',
      'READY', jsonb_build_object('source', 'verify.525.demo'), true
    ),
    (
      v_real_cpe, v_real_tenant, '01', 'FV525R', '00000001',
      '9015250002', 'Emisor real verify 525', '31',
      '9005250002', 'Receptor real verify 525', v_real_client, 'COP',
      100, 19, 119, 119,
      '[{"codigo":"R525","descripcion":"Real 525","cantidad":1,"valor_venta":100,"igv":19,"total":119}]'::jsonb,
      now(), 'verify.cpe.525.real', 'FIRMADO', 'PENDIENTE',
      'READY', jsonb_build_object('source', 'verify.525.real'), true
    );

  SELECT simulated_origin, issuer_snapshot, fiscal_authority_evidence
  INTO v_demo_origin, v_demo_snapshot, v_demo_evidence
  FROM public.cpe
  WHERE id = v_demo_cpe;

  IF v_demo_origin IS NOT TRUE
     OR v_demo_snapshot->>'contract_version' <> '525'
     OR v_demo_snapshot->>'country_code' <> 'CO'
     OR v_demo_snapshot->>'tax_id' <> '9015250001'
     OR v_demo_snapshot->>'legal_name' <> 'Emisor demo verify 525'
     OR v_demo_snapshot->>'source' <> 'CPE_CREATION'
     OR v_demo_evidence->>'authority' <> 'DIAN'
     OR v_demo_evidence->>'status' <> 'SIMULATED'
     OR v_demo_evidence->>'source' <> 'CPE_CREATION' THEN
    RAISE EXCEPTION 'VERIFY_525_DEMO_INSERT_PROVENANCE_INVALID snapshot=% evidence=%',
      v_demo_snapshot, v_demo_evidence;
  END IF;

  SELECT issuer_snapshot, fiscal_authority_evidence
  INTO v_real_snapshot, v_real_evidence
  FROM public.cpe
  WHERE id = v_real_cpe;

  IF (SELECT simulated_origin FROM public.cpe WHERE id = v_real_cpe) IS NOT FALSE
     OR v_real_snapshot->>'country_code' <> 'CO'
     OR v_real_snapshot->>'tax_id' <> '9015250002'
     OR v_real_evidence->>'authority' <> 'DIAN'
     OR v_real_evidence->>'status' <> 'PENDING'
     OR v_real_evidence->>'source' <> 'CPE_CREATION' THEN
    RAISE EXCEPTION 'VERIFY_525_REAL_INSERT_PROVENANCE_INVALID snapshot=% evidence=%',
      v_real_snapshot, v_real_evidence;
  END IF;

  -- Un tenant con CPE real no puede mutar de autoridad fiscal debajo de sus
  -- comprobantes. La operación debe fallar completa, antes de reservar/envíar.
  v_rejected := false;
  BEGIN
    UPDATE public.empresa_config SET pais = 'AR' WHERE tenant_id = v_real_tenant;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'EMPRESA_FISCAL_COUNTRY_IMMUTABLE_WITH_REAL_CPE' THEN
      RAISE;
    END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR (SELECT pais FROM public.empresa_config WHERE tenant_id = v_real_tenant) <> 'CO' THEN
    RAISE EXCEPTION 'VERIFY_525_REAL_TENANT_COUNTRY_MUTATION_NOT_REJECTED';
  END IF;

  -- Promover el tenant demo no reescribe la procedencia histórica del CPE.
  UPDATE public.empresa_config
  SET is_demo = false,
      ruc = '9015250999',
      razon_social = 'Emisor promovido verify 525',
      direccion_fiscal = 'Dirección real posterior'
  WHERE tenant_id = v_demo_tenant;
  UPDATE public.cpe
  SET nombre = 'CPE histórico tras promoción demo a real'
  WHERE id = v_demo_cpe;

  IF (SELECT simulated_origin FROM public.cpe WHERE id = v_demo_cpe) IS DISTINCT FROM v_demo_origin
     OR (SELECT issuer_snapshot FROM public.cpe WHERE id = v_demo_cpe) IS DISTINCT FROM v_demo_snapshot
     OR (SELECT fiscal_authority_evidence FROM public.cpe WHERE id = v_demo_cpe) IS DISTINCT FROM v_demo_evidence THEN
    RAISE EXCEPTION 'VERIFY_525_DEMO_PROMOTION_REWROTE_PROVENANCE';
  END IF;

  -- Ninguna de las tres piezas de procedencia admite mutación directa.
  v_rejected := false;
  BEGIN
    UPDATE public.cpe SET simulated_origin = false WHERE id = v_demo_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'CPE_FISCAL_PROVENANCE_IMMUTABLE' THEN
      RAISE;
    END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_525_DIRECT_ORIGIN_MUTATION_WAS_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET issuer_snapshot = issuer_snapshot || '{"tax_id":"MUTATED"}'::jsonb
    WHERE id = v_demo_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'CPE_FISCAL_PROVENANCE_IMMUTABLE' THEN
      RAISE;
    END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_525_DIRECT_SNAPSHOT_MUTATION_WAS_ACCEPTED';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET fiscal_authority_evidence = jsonb_build_object(
      'contract_version', 525, 'status', 'ACCEPTED'
    )
    WHERE id = v_demo_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'CPE_FISCAL_PROVENANCE_IMMUTABLE' THEN
      RAISE;
    END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'VERIFY_525_DIRECT_EVIDENCE_MUTATION_WAS_ACCEPTED';
  END IF;

  -- Un CPE colombiano real tampoco puede nacer falsamente aceptado.
  v_rejected := false;
  BEGIN
    INSERT INTO public.cpe (
      id, tenant_id, tipo_documento, serie, numero,
      ruc_emisor, razon_social_emisor, moneda, fecha_emision,
      idempotency_key, estado, estado_sunat, sunat_status, cdr_sunat
    ) VALUES (
      v_rejected_cpe, v_real_tenant, '01', 'FV525X', '00000001',
      '9015250002', 'Emisor real verify 525', 'COP', now(),
      'verify.cpe.525.rejected-insert', 'ACEPTADO', 'ACEPTADO',
      'ACCEPTED', '<ApplicationResponse>fabricado</ApplicationResponse>'
    );
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'CPE_DIAN_ACCEPTANCE_REQUIRES_CANONICAL_FINALIZATION' THEN
      RAISE;
    END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected OR EXISTS (SELECT 1 FROM public.cpe WHERE id = v_rejected_cpe) THEN
    RAISE EXCEPTION 'VERIFY_525_ACCEPTED_REAL_INSERT_WAS_NOT_REJECTED_ATOMICALLY';
  END IF;

  -- Una transición a aceptado sin operación canónica no deja estado parcial.
  v_rejected := false;
  BEGIN
    UPDATE public.cpe
    SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
        sunat_status = 'ACCEPTED',
        cdr_sunat = '<ApplicationResponse>sin operación</ApplicationResponse>'
    WHERE id = v_real_cpe;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_ACCEPTANCE_EVIDENCE_OPERATION_MISSING' THEN
      RAISE;
    END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR (SELECT upper(estado::text) FROM public.cpe WHERE id = v_real_cpe) <> 'FIRMADO'
     OR (SELECT fiscal_authority_evidence->>'status' FROM public.cpe WHERE id = v_real_cpe) <> 'PENDING' THEN
    RAISE EXCEPTION 'VERIFY_525_ACCEPTANCE_WITHOUT_OPERATION_NOT_ATOMIC';
  END IF;

  INSERT INTO public.cpe_operaciones (
    id, tenant_id, cpe_id, action, idempotency_key,
    request_fingerprint, state, lease_expires_at, attempt, origin,
    request_summary, response_summary, result_kind, response_code,
    terminal_fingerprint, completed_at
  ) VALUES (
    v_operation, v_real_tenant, v_real_cpe, 'SEND',
    'verify.cpe.525.accepted.cufe', repeat('a', 64),
    'COMPLETED', NULL, 1, 'SYSTEM',
    jsonb_build_object(
      'source', 'verify.525',
      'country_code', 'CO',
      'dian_evidence_kind', 'CUFE',
      'dian_unique_code', v_cufe,
      'authorization', jsonb_build_object(
        'source', 'DIAN_GET_NUMBERING_RANGE',
        'environment_id', '2',
        'software_id', 'SOFTWARE-VERIFY-525',
        'number', '187640525',
        'prefix', 'FV525',
        'range_from', 1,
        'range_to', 999999,
        'valid_from', (current_date - 30)::text,
        'valid_to', (current_date + 365)::text,
        'technical_key_sha256', repeat('e', 64)
      ),
      'issuer_tax_profile', jsonb_build_object(
        'contributor_type', 'PERSONA_JURIDICA',
        'fiscal_regime', 'RESPONSABLE_IVA'
      )
    ),
    jsonb_build_object(
      'countryCode', 'CO', 'success', true, 'resultKind', 'ACCEPTED',
      'dianEvidenceKind', 'CUFE', 'dianUniqueCode', v_cufe,
      'authority', 'DIAN', 'dianAcceptanceContractVersion', 528,
      'authorityStatusCode', '00', 'authoritySignatureTrusted', true,
      'authorityDocumentKey', v_cufe, 'expectedDianUniqueCode', v_cufe,
      'hasCdr', true, 'authorityResponseCount', 1,
      'authorityResponseRoot', 'ApplicationResponse',
      'authorityResponseRootNamespace', 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
      'authorityResponseSignatureCount', 1,
      'authorityResponseDocumentKey', v_cufe,
      'authorityApplicationResponseCode', '02',
      'authorityResponse', v_cufe_response,
      'authorityResponseSha256', encode(
        extensions.digest(convert_to(v_cufe_response, 'UTF8'), 'sha256'), 'hex'
      ),
      'cdrSha256', encode(
        extensions.digest(convert_to(v_cufe_response, 'UTF8'), 'sha256'), 'hex'
      )
    ),
    'ACCEPTED', '00', repeat('c', 64), now()
  );

  -- La aceptación debe materializar lo sellado en la operación, no releer una
  -- configuración mutable luego de haber enviado el XML.
  UPDATE public.empresa_config
  SET dian_resolucion_numero = 'MUTATED-AFTER-SEND',
      dian_resolucion_prefijo = 'MUT',
      dian_tipo_contribuyente = 'MUTATED',
      dian_regimen_fiscal = 'MUTATED'
  WHERE tenant_id = v_real_tenant;

  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
      sunat_status = 'ACCEPTED',
      cdr_sunat = v_cufe_response,
      metadata = metadata || jsonb_build_object(
        'last_delivery_operation_id', v_operation::text
      )
  WHERE id = v_real_cpe;

  SELECT fiscal_authority_evidence INTO v_real_evidence
  FROM public.cpe WHERE id = v_real_cpe;
  IF v_real_evidence->>'status' <> 'ACCEPTED'
     OR v_real_evidence->>'authority' <> 'DIAN'
     OR v_real_evidence->>'country_code' <> 'CO'
     OR v_real_evidence->>'code_kind' <> 'CUFE'
     OR v_real_evidence->>'unique_code' <> v_cufe
     OR v_real_evidence->>'operation_id' <> v_operation::text
     OR v_real_evidence->>'source' NOT IN (
       'DIAN_ACCEPTED_OPERATION', 'DIAN_ACCEPTED_OPERATION_528'
     )
     OR v_real_evidence#>>'{authorization,number}' <> '187640525'
     OR v_real_evidence#>>'{authorization,prefix}' <> 'FV525'
     OR v_real_evidence#>>'{authorization,software_id}' <> 'SOFTWARE-VERIFY-525'
     OR v_real_evidence#>>'{issuer_tax_profile,contributor_type}' <> 'PERSONA_JURIDICA'
     OR v_real_evidence#>>'{issuer_tax_profile,fiscal_regime}' <> 'RESPONSABLE_IVA'
     OR (SELECT issuer_snapshot FROM public.cpe WHERE id = v_real_cpe) IS DISTINCT FROM v_real_snapshot THEN
    RAISE EXCEPTION 'VERIFY_525_CANONICAL_CUFE_EVIDENCE_INVALID:%', v_real_evidence;
  END IF;

  -- CUDE recorre el mismo camino terminal y demuestra que no está limitado a CUFE.
  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero,
    ruc_emisor, razon_social_emisor, tipo_documento_receptor,
    documento_receptor, razon_social_receptor, cliente_id, moneda,
    fecha_emision, idempotency_key, estado, estado_sunat,
    sunat_status, metadata, activo
  ) VALUES (
    v_cude_cpe, v_real_tenant, '91', 'ND525', '00000001',
    '9015250002', 'Emisor real verify 525', '31',
    '9005250002', 'Receptor real verify 525', v_real_client, 'COP', now(),
    'verify.cpe.525.real.cude', 'FIRMADO', 'PENDIENTE',
    'READY', jsonb_build_object('source', 'verify.525.cude'), true
  );
  INSERT INTO public.cpe_operaciones (
    id, tenant_id, cpe_id, action, idempotency_key,
    request_fingerprint, state, lease_expires_at, attempt, origin,
    request_summary, response_summary, result_kind, response_code,
    terminal_fingerprint, completed_at
  ) VALUES (
    v_cude_operation, v_real_tenant, v_cude_cpe, 'SEND',
    'verify.cpe.525.accepted.cude', repeat('b', 64),
    'COMPLETED', NULL, 1, 'SYSTEM', jsonb_build_object(
      'country_code', 'CO',
      'dian_evidence_kind', 'CUDE',
      'dian_unique_code', v_cude,
      'authorization', jsonb_build_object(
        'source', 'DIAN_SOFTWARE_CATALOG',
        'environment_id', '2',
        'software_id', 'SOFTWARE-VERIFY-525',
        'document_series', 'ND525'
      ),
      'issuer_tax_profile', jsonb_build_object(
        'contributor_type', 'PERSONA_JURIDICA',
        'fiscal_regime', 'RESPONSABLE_IVA'
      )
    ),
    jsonb_build_object(
      'countryCode', 'CO', 'success', true, 'resultKind', 'ACCEPTED',
      'dianEvidenceKind', 'CUDE', 'dianUniqueCode', v_cude,
      'authority', 'DIAN', 'dianAcceptanceContractVersion', 528,
      'authorityStatusCode', '00', 'authoritySignatureTrusted', true,
      'authorityDocumentKey', v_cude, 'expectedDianUniqueCode', v_cude,
      'hasCdr', true, 'authorityResponseCount', 1,
      'authorityResponseRoot', 'ApplicationResponse',
      'authorityResponseRootNamespace', 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
      'authorityResponseSignatureCount', 1,
      'authorityResponseDocumentKey', v_cude,
      'authorityApplicationResponseCode', '02',
      'authorityResponse', v_cude_response,
      'authorityResponseSha256', encode(
        extensions.digest(convert_to(v_cude_response, 'UTF8'), 'sha256'), 'hex'
      ),
      'cdrSha256', encode(
        extensions.digest(convert_to(v_cude_response, 'UTF8'), 'sha256'), 'hex'
      )
    ),
    'ACCEPTED', '00', repeat('d', 64), now()
  );
  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
      sunat_status = 'ACCEPTED',
      cdr_sunat = v_cude_response,
      metadata = metadata || jsonb_build_object(
        'last_delivery_operation_id', v_cude_operation::text
      )
  WHERE id = v_cude_cpe;

  IF (SELECT fiscal_authority_evidence->>'status' FROM public.cpe WHERE id = v_cude_cpe) <> 'ACCEPTED'
     OR (SELECT fiscal_authority_evidence->>'code_kind' FROM public.cpe WHERE id = v_cude_cpe) <> 'CUDE'
     OR (SELECT fiscal_authority_evidence->>'unique_code' FROM public.cpe WHERE id = v_cude_cpe) <> v_cude
     OR (SELECT fiscal_authority_evidence->>'source' FROM public.cpe WHERE id = v_cude_cpe)
          NOT IN ('DIAN_ACCEPTED_OPERATION', 'DIAN_ACCEPTED_OPERATION_528') THEN
    RAISE EXCEPTION 'VERIFY_525_CANONICAL_CUDE_EVIDENCE_INVALID';
  END IF;

  -- Reserva anual e inmutable del paquete, sellado previo al I/O y recuperación
  -- segura por consulta antes de permitir cualquier reenvío.
  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero,
    ruc_emisor, razon_social_emisor, tipo_documento_receptor,
    documento_receptor, razon_social_receptor, cliente_id, moneda,
    total_gravadas, total_igv, total_venta, total, items,
    fecha_emision, idempotency_key, estado, estado_sunat,
    sunat_status, xml_firmado, hash_firma, metadata, activo
  ) VALUES (
    v_prepare_cpe, v_real_tenant, '01', 'FV525', '00000042',
    '9015250002', 'Emisor real verify 525', '31',
    '9005250002', 'Receptor real verify 525', v_real_client, 'COP',
    100, 19, 119, 119,
    '[{"codigo":"P525","descripcion":"Preparado 525","cantidad":1,"valor_venta":100,"igv":19,"total":119}]'::jsonb,
    now(), 'verify.cpe.525.prepare', 'FIRMADO', 'PENDIENTE',
    'READY', '<Invoice>placeholder-before-reserve</Invoice>',
    encode(extensions.digest(convert_to('<Invoice>placeholder-before-reserve</Invoice>', 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('source', 'verify.525.prepare'), true
  );

  INSERT INTO public.cpe_operaciones (
    id, tenant_id, cpe_id, action, idempotency_key,
    request_fingerprint, state, claim_token, lease_expires_at,
    attempt, origin, request_summary
  ) VALUES (
    v_prepare_operation, v_real_tenant, v_prepare_cpe, 'SEND',
    'verify.cpe.525.prepare.send', repeat('f', 64), 'CLAIMED',
    v_prepare_claim, now() + interval '5 minutes', 1, 'SYSTEM',
    jsonb_build_object('source', 'verify.525.prepare')
  );

  v_result := public.reservar_paquete_dian_tx(
    v_real_tenant, v_prepare_operation, v_prepare_claim, v_package_year, '000'
  );
  IF coalesce((v_result->>'reserved')::boolean, false) IS NOT TRUE
     OR coalesce((v_result->>'idempotent')::boolean, true) IS NOT FALSE
     OR (v_result->>'package_sequence')::bigint <> 1
     OR v_result->>'package_sequence_hex' <> '00000001' THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_PACKAGE_FIRST_RESERVATION_INVALID:%', v_result;
  END IF;

  v_result := public.reservar_paquete_dian_tx(
    v_real_tenant, v_prepare_operation, v_prepare_claim, v_package_year, '000'
  );
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_result->>'package_sequence')::bigint <> 1
     OR (SELECT last_sequence FROM public.dian_package_counters
         WHERE tenant_id = v_real_tenant AND package_year = v_package_year) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_PACKAGE_IDEMPOTENCY_INVALID:%', v_result;
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.sellar_envio_dian_tx(
      v_real_tenant, v_prepare_operation, v_prepare_claim,
      '<Invoice>signed-wrong-range</Invoice>', 'CUFE', v_prepared_cufe,
      jsonb_build_object(
        'source', 'DIAN_GET_NUMBERING_RANGE',
        'environment_id', '2',
        'software_id', 'SOFTWARE-VERIFY-525',
        'number', '187640525',
        'prefix', 'WRONG',
        'range_from', 1,
        'range_to', 999999,
        'valid_from', (current_date - 30)::text,
        'valid_to', (current_date + 365)::text,
        'technical_key_sha256', encode(
          extensions.digest(convert_to('RAW-TECHNICAL-KEY-525', 'UTF8'), 'sha256'), 'hex'
        )
      ),
      jsonb_build_object('contributor_type', 'PERSONA_JURIDICA')
    );
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DIAN_NUMBERING_RANGE_MISMATCH' THEN
      RAISE;
    END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR (SELECT xml_firmado FROM public.cpe WHERE id = v_prepare_cpe)
          <> '<Invoice>placeholder-before-reserve</Invoice>' THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_INVALID_SEAL_NOT_ATOMIC';
  END IF;

  v_result := public.sellar_envio_dian_tx(
    v_real_tenant, v_prepare_operation, v_prepare_claim,
    '<Invoice>signed-and-sealed-525</Invoice>', 'CUFE', v_prepared_cufe,
    jsonb_build_object(
      'source', 'DIAN_GET_NUMBERING_RANGE',
      'environment_id', '2',
      'software_id', 'SOFTWARE-VERIFY-525',
      'number', '187640525',
      'prefix', 'FV525',
      'range_from', 1,
      'range_to', 999999,
      'valid_from', (current_date - 30)::text,
      'valid_to', (current_date + 365)::text,
      'technical_key_sha256', encode(
        extensions.digest(convert_to('RAW-TECHNICAL-KEY-525', 'UTF8'), 'sha256'), 'hex'
      )
    ),
    jsonb_build_object(
      'contributor_type', 'PERSONA_JURIDICA',
      'fiscal_regime', 'RESPONSABLE_IVA'
    )
  );
  IF coalesce((v_result->>'sealed')::boolean, false) IS NOT TRUE
     OR (SELECT xml_firmado FROM public.cpe WHERE id = v_prepare_cpe)
          <> '<Invoice>signed-and-sealed-525</Invoice>'
     OR (SELECT request_summary#>>'{authorization,technical_key_sha256}'
         FROM public.cpe_operaciones WHERE id = v_prepare_operation)
          <> encode(extensions.digest(convert_to('RAW-TECHNICAL-KEY-525', 'UTF8'), 'sha256'), 'hex')
     OR (SELECT request_summary::text FROM public.cpe_operaciones WHERE id = v_prepare_operation)
          LIKE '%RAW-TECHNICAL-KEY-525%'
     OR (SELECT request_summary->>'dian_package_sequence_hex'
         FROM public.cpe_operaciones WHERE id = v_prepare_operation) <> '00000001' THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_SEALED_REQUEST_INVALID:%', v_result;
  END IF;

  UPDATE public.cpe_operaciones
  SET state = 'TECHNICAL_ERROR', result_kind = 'TECHNICAL_ERROR',
      response_code = 'TIMEOUT', error_message = 'Respuesta incierta',
      response_summary = jsonb_build_object(
        'countryCode', 'CO', 'success', false,
        'dianQueryKind', 'CUFE_CUDE', 'dianQueryKey', v_prepared_cufe
      ),
      lease_expires_at = NULL, next_retry_at = now() - interval '1 minute',
      completed_at = now(), updated_at = now()
  WHERE id = v_prepare_operation;
  UPDATE public.cpe
  SET estado = 'ERROR', estado_sunat = 'ERROR', sunat_status = 'ERROR',
      error_message = 'Respuesta incierta', next_retry_at = now() - interval '1 minute'
  WHERE id = v_prepare_cpe;

  v_result := public.reservar_recuperacion_dian_tx(
    v_real_tenant, NULL, v_prepare_cpe,
    'verify.cpe.525.prepare.query.not-found', 'SYSTEM'
  );
  v_query_operation := (v_result#>>'{operation,id}')::uuid;
  v_query_claim := (v_result#>>'{operation,claim_token}')::uuid;
  IF coalesce((v_result->>'claimed')::boolean, false) IS NOT TRUE
     OR v_result->>'dian_unique_code' <> v_prepared_cufe
     OR v_result->>'dian_query_kind' <> 'CUFE_CUDE'
     OR v_result->>'dian_query_key' <> v_prepared_cufe THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_RECOVERY_NOT_RESERVED:%', v_result;
  END IF;

  -- Un SOAP Fault puede incluir el texto "no encontrado", pero no es una
  -- respuesta autoritativa DIAN y jamás debe habilitar el reenvío.
  SELECT upper(estado::text) INTO v_state_before_fault
  FROM public.cpe WHERE id = v_prepare_cpe;
  v_rejected := false;
  BEGIN
    PERFORM public.finalizar_recuperacion_dian_tx(
      v_real_tenant, v_query_operation, v_query_claim, 'NOT_FOUND',
      'DIAN_NOT_FOUND', 'SOAP Fault: TrackId no encontrado temporalmente', NULL,
      jsonb_build_object(
        'countryCode', 'CO', 'success', false, 'resultKind', 'NOT_FOUND',
        'explicitNotFound', true, 'authorityStatusCode', '66',
        'authorityResponse', false, 'technical', true, 'uncertain', false,
        'dianQueryKind', 'CUFE_CUDE', 'dianQueryKey', v_prepared_cufe
      )
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM <> 'DIAN_NOT_FOUND_EVIDENCE_INVALID' THEN RAISE; END IF;
    v_rejected := true;
  END;
  IF NOT v_rejected
     OR (SELECT state FROM public.cpe_operaciones WHERE id = v_query_operation) <> 'CLAIMED'
     OR (SELECT upper(estado::text) FROM public.cpe WHERE id = v_prepare_cpe)
          IS DISTINCT FROM v_state_before_fault THEN
    RAISE EXCEPTION 'VERIFY_525_SOAP_FAULT_AUTHORIZED_RESEND rejected=% operation=% cpe=%',
      v_rejected,
      (SELECT state FROM public.cpe_operaciones WHERE id = v_query_operation),
      (SELECT upper(estado::text) FROM public.cpe WHERE id = v_prepare_cpe);
  END IF;

  v_result := public.finalizar_recuperacion_dian_tx(
    v_real_tenant, v_query_operation, v_query_claim, 'NOT_FOUND',
    'DIAN_NOT_FOUND', 'DIAN confirmó que el CUFE no existe', NULL,
    jsonb_build_object(
      'countryCode', 'CO', 'success', false, 'resultKind', 'NOT_FOUND',
      'explicitNotFound', true,
      'authorityStatusCode', '66',
      'authorityResponse', true, 'technical', false, 'uncertain', false,
      'dianQueryKind', 'CUFE_CUDE', 'dianQueryKey', v_prepared_cufe
    )
  );
  IF (SELECT upper(estado::text) FROM public.cpe WHERE id = v_prepare_cpe) <> 'FIRMADO'
     OR (SELECT upper(sunat_status::text) FROM public.cpe WHERE id = v_prepare_cpe) <> 'READY'
     OR (SELECT metadata->>'dian_resubmit_authorized_from_query'
         FROM public.cpe WHERE id = v_prepare_cpe) <> 'true' THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_EXPLICIT_NOT_FOUND_DID_NOT_AUTHORIZE_RESUBMIT:%', v_result;
  END IF;

  v_result := public.reservar_envio_cpe_tx(
    v_real_tenant, NULL, v_prepare_cpe,
    'verify.cpe.525.prepare.send', 'SYSTEM'
  );
  v_prepare_claim := (v_result#>>'{operation,claim_token}')::uuid;
  IF coalesce((v_result->>'claimed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_RESUBMIT_NOT_RECLAIMED:%', v_result;
  END IF;
  v_result := public.reservar_paquete_dian_tx(
    v_real_tenant, v_prepare_operation, v_prepare_claim, v_package_year, '000'
  );
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE
     OR (v_result->>'package_sequence')::bigint <> 1
     OR (SELECT last_sequence FROM public.dian_package_counters
         WHERE tenant_id = v_real_tenant AND package_year = v_package_year) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_RESUBMIT_CHANGED_PACKAGE:%', v_result;
  END IF;

  -- Una segunda respuesta incierta se resuelve por consulta aceptada y reutiliza
  -- exactamente el CUFE/autorización/XML sellados, sin un tercer envío a ciegas.
  UPDATE public.cpe_operaciones
  SET state = 'TECHNICAL_ERROR', result_kind = 'TECHNICAL_ERROR',
      response_code = 'CONNECTION_RESET', error_message = 'Respuesta incierta 2',
      response_summary = jsonb_build_object(
        'countryCode', 'CO', 'success', true, 'resultKind', 'PENDING',
        'dianQueryKind', 'ZIP_TRACK_ID', 'dianQueryKey', v_zip_key
      ),
      lease_expires_at = NULL, next_retry_at = now() - interval '1 minute',
      completed_at = now(), updated_at = now()
  WHERE id = v_prepare_operation;
  UPDATE public.cpe
  SET estado = 'ERROR', estado_sunat = 'ERROR', sunat_status = 'ERROR',
      error_message = 'Respuesta incierta 2', next_retry_at = now() - interval '1 minute'
  WHERE id = v_prepare_cpe;

  v_result := public.reservar_recuperacion_dian_tx(
    v_real_tenant, NULL, v_prepare_cpe,
    'verify.cpe.525.prepare.query.accepted', 'SYSTEM'
  );
  v_query_operation := (v_result#>>'{operation,id}')::uuid;
  v_query_claim := (v_result#>>'{operation,claim_token}')::uuid;
  IF v_result->>'dian_query_kind' <> 'ZIP_TRACK_ID'
     OR v_result->>'dian_query_key' <> v_zip_key
     OR v_result#>>'{operation,request_summary,dian_query_kind}' <> 'ZIP_TRACK_ID'
     OR v_result#>>'{operation,request_summary,dian_query_key}' <> v_zip_key THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_ZIP_RECOVERY_NOT_RESERVED:%', v_result;
  END IF;
  v_result := public.finalizar_recuperacion_dian_tx(
    v_real_tenant, v_query_operation, v_query_claim, 'ACCEPTED',
    '00', 'Documento encontrado y aceptado por DIAN',
    v_prepared_response,
    jsonb_build_object(
      'countryCode', 'CO', 'success', true, 'resultKind', 'ACCEPTED',
      'dianEvidenceKind', 'CUFE', 'dianUniqueCode', v_prepared_cufe,
      'dianQueryKind', 'ZIP_TRACK_ID', 'dianQueryKey', v_zip_key,
      'authority', 'DIAN', 'dianAcceptanceContractVersion', 528,
      'authorityStatusCode', '00', 'authoritySignatureTrusted', true,
      'authorityDocumentKey', v_prepared_cufe,
      'expectedDianUniqueCode', v_prepared_cufe,
      'hasCdr', true, 'authorityResponseCount', 1,
      'authorityResponseRoot', 'ApplicationResponse',
      'authorityResponseRootNamespace', 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
      'authorityResponseSignatureCount', 1,
      'authorityResponseDocumentKey', v_prepared_cufe,
      'authorityApplicationResponseCode', '02',
      'authorityResponse', v_prepared_response,
      'authorityResponseSha256', encode(
        extensions.digest(convert_to(v_prepared_response, 'UTF8'), 'sha256'), 'hex'
      ),
      'cdrSha256', encode(
        extensions.digest(convert_to(v_prepared_response, 'UTF8'), 'sha256'), 'hex'
      )
    )
  );
  IF (SELECT fiscal_authority_evidence->>'status' FROM public.cpe WHERE id = v_prepare_cpe) <> 'ACCEPTED'
     OR (SELECT fiscal_authority_evidence->>'unique_code' FROM public.cpe WHERE id = v_prepare_cpe) <> v_prepared_cufe
     OR (SELECT request_summary->>'dian_package_sequence_hex'
         FROM public.cpe_operaciones WHERE id = v_prepare_operation) <> '00000001'
     OR (SELECT last_sequence FROM public.dian_package_counters
         WHERE tenant_id = v_real_tenant AND package_year = v_package_year) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_525_DIAN_ACCEPTED_RECOVERY_INVALID:%', v_result;
  END IF;
END;
$behavior$;

ROLLBACK;

\echo 'VERIFY_525_OK'
