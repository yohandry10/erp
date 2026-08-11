\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_488_SOLO_ERP_E2E:%', current_database();
  END IF;
END $$;

UPDATE app.deployment_environment
SET environment = 'DEV', project_ref = 'localerpephemeralqax',
    allow_demo_data = true, configured_at = clock_timestamp(), updated_at = clock_timestamp()
WHERE singleton = true;

DO $verify$
DECLARE
  v_tenant uuid := '48800000-0000-4000-8000-000000000001';
  v_legacy uuid := '48800000-0000-4000-8000-000000000002';
  v_user uuid := '48800000-0000-4000-8000-000000000003';
  v_conversion uuid := '48800000-0000-4000-8000-000000000004';
  v_start timestamptz := now();
  v_company public.empresa_config;
  v_session jsonb;
  v_validation jsonb;
BEGIN
  INSERT INTO public.tenants(id, codigo, nombre, descripcion, pais, plan, activo, estado)
  VALUES
    (v_tenant, 'VERIFY-488-NEW', 'Tenant Plan 488', 'Fixture', 'PE', 'basico', true, 'ACTIVO'),
    (v_legacy, 'VERIFY-488-LEG', 'Tenant Legacy 488', 'Fixture', 'PE', 'basico', true, 'ACTIVO');

  INSERT INTO public.empresa_config(
    tenant_id, razon_social, pais, moneda_defecto, estado, plan, is_demo, demo_expires_at
  ) VALUES
    (v_tenant, 'Empresa Plan 488', 'PE', 'PEN', 'ACTIVO', 'BASICO', true, now() + interval '14 days'),
    (v_legacy, 'Empresa Legacy 488', 'PE', 'PEN', 'ACTIVO', 'BASICO', true, now() + interval '14 days');

  INSERT INTO public.usuarios_sistema(
    id, tenant_id, email, password_hash, nombre, activo, estado, is_demo_user
  ) VALUES (
    v_user, v_tenant, 'verify-488@example.invalid', 'hash-no-usado-en-verify',
    'Verify 488', true, 'ACTIVO', false
  );

  INSERT INTO public.demo_conversiones_pendientes(
    id, tenant_id, email, password_hash, razon_social, ruc, plan_id, periodo,
    checkout_provider, monto, moneda, meses_pagados, meses_bonificados,
    meses_servicio, oferta_version, oferta_snapshot, estado
  ) VALUES (
    v_conversion, v_tenant, 'verify-488@example.invalid', 'hash',
    'Empresa Plan 488', '20123456786', 'basico', 'semestral',
    'TRANSFERENCIA', 594, 'PEN', 6, 3, 9, 1,
    jsonb_build_object('plan_id','basico','periodo','semestral','monto',594,'moneda','PEN'),
    'PENDIENTE'
  );

  UPDATE public.demo_conversiones_pendientes
  SET estado = 'COMPLETADA', completed_at = v_start
  WHERE id = v_conversion;

  SELECT * INTO v_company FROM public.empresa_config WHERE tenant_id = v_tenant;
  IF v_company.plan_periodo <> 'semestral'
     OR v_company.plan_meses_pagados <> 6
     OR v_company.plan_meses_bonificados <> 3
     OR v_company.plan_meses_servicio <> 9
     OR v_company.plan_estado <> 'ACTIVO'
     OR v_company.plan_inicia_at <> v_start
     OR v_company.plan_vence_at <> v_start + interval '9 months' THEN
    RAISE EXCEPTION 'VERIFY_488_PLAN_ACTIVATION_FAILED:%', to_jsonb(v_company);
  END IF;

  v_session := public.crear_sesion_login_auth_tx(
    v_user, 'verify-488-session-active', now() + interval '1 hour'
  );
  IF NULLIF(v_session->>'session_id','') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_488_ACTIVE_PLAN_LOGIN_FAILED:%', v_session;
  END IF;

  UPDATE public.empresa_config
  SET plan_inicia_at = now() - interval '10 months',
      plan_vence_at = now() - interval '1 month'
  WHERE tenant_id = v_tenant;
  v_validation := public.validar_sesion_auth_tx('verify-488-session-active');
  IF COALESCE((v_validation->>'valid')::boolean, true)
     OR v_validation->>'reason' <> 'TENANT_INACTIVE_OR_PLAN_EXPIRED'
     OR NOT EXISTS (
       SELECT 1 FROM public.user_sessions
       WHERE session_token = 'verify-488-session-active'
         AND revoked_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'VERIFY_488_ACTIVE_SESSION_NOT_REVOKED:%', v_validation;
  END IF;
  BEGIN
    PERFORM public.crear_sesion_login_auth_tx(
      v_user, 'verify-488-session-expired', now() + interval '1 hour'
    );
    RAISE EXCEPTION 'VERIFY_488_EXPIRED_PLAN_LOGIN_WAS_ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%AUTH_TENANT_INACTIVE_OR_PLAN_EXPIRED%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    INSERT INTO public.demo_conversiones_pendientes(
      tenant_id, email, password_hash, razon_social, ruc, plan_id, periodo,
      checkout_provider, monto, moneda, meses_pagados, meses_bonificados,
      meses_servicio, oferta_version, oferta_snapshot, estado
    ) VALUES (
      v_tenant, 'invalid-488@example.invalid', 'hash', 'Invalida', '20123456786',
      'basico', 'anual', 'TRANSFERENCIA', 990, 'PEN', 12, 3, 15, 1, '{}'::jsonb, 'PENDIENTE'
    );
    RAISE EXCEPTION 'VERIFY_488_INVALID_PROMOTION_WAS_ALLOWED';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN unique_violation THEN
      -- La unicidad por tenant también es una defensa válida, pero se prueba la
      -- forma en el tenant legacy libre para no depender de ese orden.
      BEGIN
        INSERT INTO public.demo_conversiones_pendientes(
          tenant_id, email, password_hash, razon_social, ruc, plan_id, periodo,
          checkout_provider, monto, moneda, meses_pagados, meses_bonificados,
          meses_servicio, oferta_version, oferta_snapshot, estado
        ) VALUES (
          v_legacy, 'invalid-legacy-488@example.invalid', 'hash', 'Invalida', '20123456786',
          'basico', 'anual', 'TRANSFERENCIA', 990, 'PEN', 12, 3, 15, 1, '{}'::jsonb, 'PENDIENTE'
        );
        RAISE EXCEPTION 'VERIFY_488_INVALID_PROMOTION_WAS_ALLOWED';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
  END;

  INSERT INTO public.demo_conversiones_pendientes(
    tenant_id, email, password_hash, razon_social, ruc, plan_id, periodo,
    checkout_provider, monto, moneda, estado
  ) VALUES (
    v_legacy, 'legacy-488@example.invalid', 'hash', 'Empresa Legacy 488',
    '20123456786', 'basico', 'mensual', 'TRANSFERENCIA', 99, 'PEN', 'PENDIENTE'
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    email = excluded.email, periodo = excluded.periodo, oferta_version = 0,
    meses_pagados = 1, meses_bonificados = 0, meses_servicio = 1,
    estado = 'PENDIENTE';

  UPDATE public.demo_conversiones_pendientes
  SET estado = 'COMPLETADA', completed_at = v_start
  WHERE tenant_id = v_legacy;

  IF EXISTS (
    SELECT 1 FROM public.empresa_config
    WHERE tenant_id = v_legacy AND plan_estado IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'VERIFY_488_LEGACY_PLAN_WAS_EXPIRED_RETROACTIVELY';
  END IF;

  IF has_function_privilege('service_role', 'app.activar_plan_conversion_demo_488()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crear_sesion_login_auth_tx(uuid,text,timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.crear_sesion_login_auth_tx(uuid,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.validar_sesion_auth_tx(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.validar_sesion_auth_tx(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_488_ACL_FAILED';
  END IF;
END
$verify$;

ROLLBACK;
