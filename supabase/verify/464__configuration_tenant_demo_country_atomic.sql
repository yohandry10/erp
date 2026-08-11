\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_464_SOLO_ERP_E2E:%', current_database();
  END IF;
END;
$guard$;

-- El verifier es autocontenido y nunca depende de la configuración residual
-- de otra suite. La marca local se revierte junto con todos los fixtures.
UPDATE app.deployment_environment
SET environment = 'DEV', project_ref = 'localqaerpephemeralx',
    allow_demo_data = true, configured_at = now(), updated_at = now()
WHERE singleton = true;

CREATE OR REPLACE FUNCTION app.verify_fail_configuration_audit_464()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF NEW.metadata->>'idempotency_key' = 'verify-config-fail-464' THEN
    RAISE EXCEPTION 'VERIFY_464_FORCED_LATE_AUDIT_FAILURE';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_verify_fail_configuration_audit_464
BEFORE INSERT ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION app.verify_fail_configuration_audit_464();

DO $acl$
DECLARE
  v_rls boolean;
  v_force boolean;
BEGIN
  SELECT c.relrowsecurity, c.relforcerowsecurity INTO v_rls, v_force
  FROM pg_catalog.pg_class c
  WHERE c.oid = 'public.configuration_operation_intents'::regclass;
  IF NOT COALESCE(v_rls, false) OR NOT COALESCE(v_force, false) THEN
    RAISE EXCEPTION 'VERIFY_464_INTENTS_RLS_NOT_FORCED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.configuration_operation_intents'::regclass
      AND p.polname <> 'service_only_no_direct_access_485'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.configuration_operation_intents'::regclass
      AND p.polname = 'service_only_no_direct_access_485'
      AND pg_get_expr(p.polqual,p.polrelid) = 'false'
      AND pg_get_expr(p.polwithcheck,p.polrelid) = 'false'
  ) THEN
    RAISE EXCEPTION 'VERIFY_464_INTENTS_POLICY_NOT_EXPLICIT_DENY';
  END IF;

  IF has_function_privilege('anon',
       'public.create_demo_tenant_ready_tx(character varying,integer,character varying,text,bytea,text,timestamp with time zone)',
       'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.create_demo_tenant_ready_tx(character varying,integer,character varying,text,bytea,text,timestamp with time zone)',
       'EXECUTE')
     OR has_function_privilege('anon',
       'public.actualizar_empresa_config_tx(uuid,uuid,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.configurar_demo_tenant_tx(uuid,uuid,text,boolean,integer,text,text,text,jsonb)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_464_CLIENT_EXECUTE_GRANT_PRESENT';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.create_demo_tenant_ready_tx(character varying,integer,character varying,text,bytea,text,timestamp with time zone)',
       'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.actualizar_empresa_config_tx(uuid,uuid,text,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.configurar_demo_tenant_tx(uuid,uuid,text,boolean,integer,text,text,text,jsonb)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_464_SERVICE_ROLE_EXECUTE_MISSING';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.configuration_operation_intents', 'SELECT')
     OR has_table_privilege('service_role', 'public.configuration_operation_intents', 'INSERT')
     OR has_table_privilege('service_role', 'public.configuration_operation_intents', 'UPDATE')
     OR has_table_privilege('service_role', 'public.configuration_operation_intents', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_464_INTENTS_SERVICE_ROLE_ACL_INVALID';
  END IF;
  IF has_function_privilege('service_role', 'app.assert_configuration_actor_464(uuid,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.configuration_intent_finish_464(uuid,text,text,text,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_464_INTERNAL_HELPER_EXPOSED';
  END IF;
END;
$acl$;

DO $verify$
DECLARE
  v_pe jsonb;
  v_pe_retry jsonb;
  v_ar jsonb;
  v_co jsonb;
  v_tenant_pe uuid;
  v_tenant_ar uuid;
  v_tenant_co uuid;
  v_user_pe uuid;
  v_user_ar uuid;
  v_user_co uuid;
  v_created jsonb;
  v_created_retry jsonb;
  v_created_tenant uuid := '46400000-0000-4000-8000-000000000001';
  v_retry_tenant uuid := '46400000-0000-4000-8000-000000000002';
  v_created_admin uuid;
  v_result jsonb;
  v_failed boolean;
  v_original_name text;
BEGIN
  v_pe := public.create_demo_tenant_ready_tx(
    'VERIFY DEMO PE 464', 14, 'PE', 'verify-demo-pe-464', NULL, NULL, NULL
  );
  v_ar := public.create_demo_tenant_ready_tx(
    'VERIFY DEMO AR 464', 14, 'AR', 'verify-demo-ar-464', NULL, NULL, NULL
  );
  v_co := public.create_demo_tenant_ready_tx(
    'VERIFY DEMO CO 464', 14, 'CO', 'verify-demo-co-464', NULL, NULL, NULL
  );
  v_tenant_pe := (v_pe->>'tenant_id')::uuid;
  v_tenant_ar := (v_ar->>'tenant_id')::uuid;
  v_tenant_co := (v_co->>'tenant_id')::uuid;
  v_user_pe := (v_pe->>'user_id')::uuid;
  v_user_ar := (v_ar->>'user_id')::uuid;
  v_user_co := (v_co->>'user_id')::uuid;

  IF COALESCE((v_pe->>'ready')::boolean, false) IS NOT TRUE
     OR COALESCE((v_ar->>'ready')::boolean, false) IS NOT TRUE
     OR COALESCE((v_co->>'ready')::boolean, false) IS NOT TRUE
     OR (SELECT upper(pais) || ':' || upper(moneda_defecto)
         FROM public.empresa_config WHERE tenant_id = v_tenant_pe) <> 'PE:PEN'
     OR (SELECT upper(pais) || ':' || upper(moneda_defecto)
         FROM public.empresa_config WHERE tenant_id = v_tenant_ar) <> 'AR:ARS'
     OR (SELECT upper(pais) || ':' || upper(moneda_defecto)
         FROM public.empresa_config WHERE tenant_id = v_tenant_co) <> 'CO:COP'
     OR (SELECT count(*) FROM public.productos WHERE tenant_id = v_tenant_ar) < 6
     OR (SELECT count(*) FROM public.productos WHERE tenant_id = v_tenant_co) < 6
     OR (SELECT count(*) FROM public.user_roles WHERE tenant_id = v_tenant_pe) < 2 THEN
    RAISE EXCEPTION 'VERIFY_464_DEMO_FOUNDATION_OR_COUNTRY_FAILED';
  END IF;

  v_pe_retry := public.create_demo_tenant_ready_tx(
    'VERIFY DEMO PE 464', 14, 'PE', 'verify-demo-pe-464', NULL, NULL, NULL
  );
  IF v_pe_retry->>'tenant_id' IS DISTINCT FROM v_pe->>'tenant_id'
     OR COALESCE((v_pe_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.configuration_operation_intents
         WHERE scope_type = 'DEMO' AND scope_id = 'public-create'
           AND operation = 'DEMO_CREATE_READY' AND idempotency_key = 'verify-demo-pe-464') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_464_DEMO_RETRY_DUPLICATED';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.create_demo_tenant_ready_tx(
      'VERIFY DEMO PE ALTERADA 464', 14, 'PE', 'verify-demo-pe-464', NULL, NULL, NULL
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_464_DEMO_KEY_REUSE_ACCEPTED'; END IF;

  v_result := public.actualizar_empresa_config_tx(
    v_tenant_ar, v_user_ar, 'verify-config-ar-464', 'EMPRESA',
    jsonb_build_object('sitio_web', 'https://verify.example', 'dian_password', 'ciphertext-only')
  );
  IF v_result->'configuracion'->>'sitio_web' <> 'https://verify.example'
     OR v_result->'configuracion' ? 'dian_password'
     OR EXISTS (
       SELECT 1 FROM public.audit_log a
       WHERE a.tenant_id = v_tenant_ar
         AND a.metadata->>'idempotency_key' = 'verify-config-ar-464'
         AND (a.old_values ? 'dian_password' OR a.new_values ? 'dian_password')
     ) THEN
    RAISE EXCEPTION 'VERIFY_464_CONFIG_SAFE_AUDIT_FAILED';
  END IF;
  v_result := public.actualizar_empresa_config_tx(
    v_tenant_ar, v_user_ar, 'verify-config-ar-464', 'EMPRESA',
    jsonb_build_object('sitio_web', 'https://verify.example', 'dian_password', 'ciphertext-only')
  );
  IF COALESCE((v_result->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_464_CONFIG_REPLAY_FAILED';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.actualizar_empresa_config_tx(
      v_tenant_ar, v_user_co, 'verify-config-cross-464', 'EMPRESA',
      jsonb_build_object('sitio_web', 'https://attack.example')
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_464_CROSS_TENANT_ACTOR_ACCEPTED'; END IF;

  SELECT razon_social INTO v_original_name
  FROM public.empresa_config WHERE tenant_id = v_tenant_ar;
  v_failed := false;
  BEGIN
    PERFORM public.actualizar_empresa_config_tx(
      v_tenant_ar, v_user_ar, 'verify-config-fail-464', 'EMPRESA',
      jsonb_build_object('razon_social', 'NO DEBE PERSISTIR 464')
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%VERIFY_464_FORCED_LATE_AUDIT_FAILURE%' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  IF NOT v_failed
     OR (SELECT razon_social FROM public.empresa_config WHERE tenant_id = v_tenant_ar) <> v_original_name
     OR EXISTS (
       SELECT 1 FROM public.configuration_operation_intents
       WHERE idempotency_key = 'verify-config-fail-464'
     )
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE idempotency_key = 'config-464:verify-config-fail-464'
     ) THEN
    RAISE EXCEPTION 'VERIFY_464_LATE_FAILURE_DID_NOT_ROLL_BACK';
  END IF;

  v_result := public.guardar_paso_wizard_config_tx(
    v_tenant_co, v_user_co, 'verify-wizard-step-464', 3,
    jsonb_build_object('origen', 'verify-464')
  );
  v_result := public.completar_wizard_config_tx(
    v_tenant_co, v_user_co, 'verify-wizard-complete-464',
    jsonb_build_object('razon_social', 'VERIFY CO CONFIG COMPLETA')
  );
  IF COALESCE((v_result->'progress'->>'completado')::boolean, false) IS NOT TRUE
     OR (SELECT configuracion_completa FROM public.empresa_config WHERE tenant_id = v_tenant_co) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_464_WIZARD_COMPLETE_NOT_ATOMIC';
  END IF;
  PERFORM public.resetear_wizard_config_tx(
    v_tenant_co, v_user_co, 'verify-wizard-reset-464'
  );
  IF (SELECT completado FROM public.wizard_progress WHERE tenant_id = v_tenant_co)
     OR (SELECT configuracion_completa FROM public.empresa_config WHERE tenant_id = v_tenant_co) THEN
    RAISE EXCEPTION 'VERIFY_464_WIZARD_RESET_NOT_ATOMIC';
  END IF;

  PERFORM public.actualizar_preferencia_pais_tx(
    v_user_ar, v_user_ar, 'verify-country-preference-464',
    jsonb_build_object('pais_preferido_id', 5, 'idioma', 'es-ar', 'zona_horaria', 'America/Argentina/Buenos_Aires')
  );
  IF (SELECT pais_preferido_id FROM public.usuario_configuracion WHERE usuario_id = v_user_ar) <> 5 THEN
    RAISE EXCEPTION 'VERIFY_464_COUNTRY_PREFERENCE_FAILED';
  END IF;

  v_result := public.actualizar_serie_documento_tx(
    v_tenant_pe, v_user_pe, 'verify-series-create-464', 'FACTURA', 'F464', 1000, true
  );
  IF (v_result->'serie'->>'correlativo_maximo')::integer <> 1000 THEN
    RAISE EXCEPTION 'VERIFY_464_SERIES_CREATE_COMPAT_FAILED';
  END IF;
  v_result := public.actualizar_serie_documento_tx(
    v_tenant_pe, v_user_pe, 'verify-series-update-464', 'FACTURA', 'F464', 2000, true
  );
  IF (v_result->'serie'->>'correlativo_maximo')::integer <> 2000 THEN
    RAISE EXCEPTION 'VERIFY_464_SERIES_UPDATE_FAILED';
  END IF;

  UPDATE public.usuarios_sistema SET is_super_admin = true WHERE id = v_user_pe;
  v_created := public.crear_tenant_empresa_admin_tx(
    v_user_pe, 'verify-tenant-create-464', v_created_tenant,
    jsonb_build_object(
      'razon_social', 'VERIFY TENANT 464 SAC', 'nombre_comercial', 'VERIFY 464',
      'ruc', '20999999464', 'email', 'tenant-verify-464@example.test',
      'pais', 'PE', 'pais_id', 1, 'moneda_defecto', 'PEN'
    ),
    jsonb_build_object(
      'email', 'admin-verify-464@example.test', 'nombre', 'Admin Verify',
      'password_hash', '$2b$12$verify464hash'
    )
  );
  v_created_admin := (v_created->'adminUser'->>'id')::uuid;
  v_created_retry := public.crear_tenant_empresa_admin_tx(
    v_user_pe, 'verify-tenant-create-464', v_retry_tenant,
    jsonb_build_object(
      'razon_social', 'VERIFY TENANT 464 SAC', 'nombre_comercial', 'VERIFY 464',
      'ruc', '20999999464', 'email', 'tenant-verify-464@example.test',
      'pais', 'PE', 'pais_id', 1, 'moneda_defecto', 'PEN'
    ),
    jsonb_build_object(
      'email', 'admin-verify-464@example.test', 'nombre', 'Admin Verify',
      'password_hash', '$2b$12$differentSaltSameRetry'
    )
  );
  IF v_created->'tenant'->>'tenant_id' IS DISTINCT FROM v_created_retry->'tenant'->>'tenant_id'
     OR COALESCE((v_created_retry->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.empresa_config WHERE ruc = '20999999464') <> 1
     OR (SELECT count(*) FROM public.user_roles WHERE usuario_sistema_id = v_created_admin) < 1 THEN
    RAISE EXCEPTION 'VERIFY_464_TENANT_CREATE_OR_REPLAY_FAILED';
  END IF;

  INSERT INTO public.user_sessions (
    tenant_id, usuario_sistema_id, session_token, estado, expires_at, last_activity
  ) VALUES (
    v_created_tenant, v_created_admin, 'verify-tenant-session-464',
    'ACTIVO', now() + interval '1 hour', now()
  );
  PERFORM public.cambiar_estado_tenant_tx(
    v_created_tenant, v_user_pe, 'verify-tenant-deactivate-464', 'INACTIVO'
  );
  IF (SELECT estado FROM public.empresa_config WHERE tenant_id = v_created_tenant) <> 'INACTIVO'
     OR (SELECT revoked_at FROM public.user_sessions WHERE session_token = 'verify-tenant-session-464') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_464_TENANT_DEACTIVATE_OR_SESSION_REVOKE_FAILED';
  END IF;
  PERFORM public.cambiar_estado_tenant_tx(
    v_created_tenant, v_user_pe, 'verify-tenant-activate-464', 'ACTIVO'
  );

  v_result := public.configurar_demo_tenant_tx(
    v_created_tenant, v_user_pe, 'verify-existing-demo-activate-464', true, 20,
    'tenant-demo-user-464@example.test', '$2b$12$demoHash464', 'plain-password-fingerprint-464',
    jsonb_build_object('nombre', 'Demo Verify', 'apellido', '464')
  );
  IF COALESCE((v_result->>'is_demo')::boolean, false) IS NOT TRUE
     OR v_result->'user'->>'id' IS NULL THEN
    RAISE EXCEPTION 'VERIFY_464_EXISTING_TENANT_DEMO_ACTIVATE_FAILED';
  END IF;
  v_result := public.configurar_demo_tenant_tx(
    v_created_tenant, v_user_pe, 'verify-existing-demo-activate-464', true, 20,
    'tenant-demo-user-464@example.test', '$2b$12$differentBcryptHash', 'plain-password-fingerprint-464',
    jsonb_build_object('nombre', 'Demo Verify', 'apellido', '464')
  );
  IF COALESCE((v_result->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_464_EXISTING_TENANT_DEMO_REPLAY_FAILED';
  END IF;
  PERFORM public.configurar_demo_tenant_tx(
    v_created_tenant, v_user_pe, 'verify-existing-demo-deactivate-464', false,
    NULL, NULL, NULL, NULL, '{}'::jsonb
  );
  IF (SELECT is_demo FROM public.empresa_config WHERE tenant_id = v_created_tenant)
     OR EXISTS (
       SELECT 1 FROM public.usuarios_sistema
       WHERE tenant_id = v_created_tenant AND COALESCE(is_demo_user, false)
     ) THEN
    RAISE EXCEPTION 'VERIFY_464_EXISTING_TENANT_DEMO_DEACTIVATE_FAILED';
  END IF;
END;
$verify$;

ROLLBACK;

SELECT 'VERIFY_464_OK' AS resultado;
