\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_459_SOLO_ERP_E2E:%', current_database();
  END IF;
END;
$guard$;

-- 464 bloquea correctamente cualquier alta demo cuando el entorno no está
-- declarado. Este verifier es autocontenido, sólo corre en `erp_e2e` y
-- revierte esta marca junto con los fixtures.
UPDATE app.deployment_environment
SET environment = 'DEV',
    project_ref = 'localqaerpephemeralx',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

DO $verify$
DECLARE
  v_demo jsonb;
  v_other_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_other_tenant uuid;
  v_other_actor uuid;
  v_customer jsonb;
  v_customer_retry jsonb;
  v_customer_other jsonb;
  v_customer_updated jsonb;
  v_supplier jsonb;
  v_supplier_retry jsonb;
  v_supplier_updated jsonb;
  v_failed boolean;
BEGIN
  v_demo := public.create_demo_tenant('VERIFY PARTIES 459', 1, 'PE');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  v_other_demo := public.create_demo_tenant('VERIFY PARTIES OTHER 459', 1, 'PE');
  v_other_tenant := (v_other_demo->>'tenant_id')::uuid;
  v_other_actor := (v_other_demo->>'user_id')::uuid;

  v_customer := public.crear_cliente_maestro_tx(
    v_tenant, v_actor,
    jsonb_build_object(
      'tipo', 'EMPRESA', 'documento_tipo', 'RUC',
      'documento_numero', '20600900006', 'razon_social', 'Cliente Verify 459',
      'nombre_comercial', 'Cliente 459', 'email', 'CLIENTE@EXAMPLE.COM',
      'telefono', '999999999'
    )
  );
  v_customer_retry := public.crear_cliente_maestro_tx(
    v_tenant, v_actor,
    jsonb_build_object(
      'tipo', 'EMPRESA', 'documento_tipo', 'RUC',
      'documento_numero', '20600900006', 'razon_social', 'Cliente Verify 459',
      'nombre_comercial', 'Cliente 459', 'email', 'CLIENTE@EXAMPLE.COM',
      'telefono', '999999999'
    )
  );
  IF v_customer->>'id' IS DISTINCT FROM v_customer_retry->>'id'
     OR COALESCE((v_customer_retry->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_459_CUSTOMER_RETRY_DUPLICO';
  END IF;
  IF (SELECT documento_identidad FROM public.clientes WHERE id = (v_customer->>'id')::uuid) <> '20600900006' THEN
    RAISE EXCEPTION 'VERIFY_459_CUSTOMER_IDENTITY_NOT_TEXT';
  END IF;
  IF (SELECT email FROM public.clientes WHERE id = (v_customer->>'id')::uuid) <> 'cliente@example.com' THEN
    RAISE EXCEPTION 'VERIFY_459_CUSTOMER_EMAIL_NOT_NORMALIZED';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_cliente_maestro_tx(
      v_tenant, v_actor,
      jsonb_build_object(
        'tipo', 'EMPRESA', 'documento_tipo', 'RUC',
        'documento_numero', '20600900006', 'razon_social', 'Payload distinto'
      )
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_459_CUSTOMER_KEY_REUSE_NOT_REJECTED'; END IF;

  v_customer_other := public.crear_cliente_maestro_tx(
    v_other_tenant, v_other_actor,
    jsonb_build_object(
      'tipo', 'EMPRESA', 'documento_tipo', 'RUC',
      'documento_numero', '20600900006', 'razon_social', 'Misma identidad otro tenant'
    )
  );
  IF v_customer_other->>'id' = v_customer->>'id' THEN
    RAISE EXCEPTION 'VERIFY_459_CUSTOMER_CROSS_TENANT_COLLISION';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.actualizar_cliente_maestro_tx(
      (v_customer->>'id')::uuid, v_tenant, v_other_actor,
      jsonb_build_object('razon_social', 'Ataque cross tenant')
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_459_CUSTOMER_CROSS_ACTOR_ACCEPTED'; END IF;

  v_customer_updated := public.actualizar_cliente_maestro_tx(
    (v_customer->>'id')::uuid, v_tenant, v_actor,
    jsonb_build_object('razon_social', 'Cliente Editado 459', 'telefono', '988888888')
  );
  IF v_customer_updated->>'razon_social' <> 'Cliente Editado 459'
     OR v_customer_updated->>'telefono' <> '988888888' THEN
    RAISE EXCEPTION 'VERIFY_459_CUSTOMER_UPDATE_FAILED';
  END IF;

  PERFORM public.desactivar_cliente_maestro_tx((v_customer->>'id')::uuid, v_tenant, v_actor);
  IF COALESCE((public.desactivar_cliente_maestro_tx((v_customer->>'id')::uuid, v_tenant, v_actor)->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT activo FROM public.clientes WHERE id = (v_customer->>'id')::uuid) THEN
    RAISE EXCEPTION 'VERIFY_459_CUSTOMER_SOFT_DELETE_NOT_IDEMPOTENT';
  END IF;
  v_customer_retry := public.crear_cliente_maestro_tx(
    v_tenant, v_actor,
    jsonb_build_object(
      'tipo', 'EMPRESA', 'documento_tipo', 'RUC',
      'documento_numero', '20600900006', 'razon_social', 'Cliente Verify 459',
      'nombre_comercial', 'Cliente 459', 'email', 'CLIENTE@EXAMPLE.COM',
      'telefono', '999999999'
    )
  );
  IF v_customer_retry->>'id' IS DISTINCT FROM v_customer->>'id'
     OR COALESCE((v_customer_retry->>'reactivated')::boolean, false) IS NOT TRUE
     OR NOT (SELECT activo FROM public.clientes WHERE id = (v_customer->>'id')::uuid) THEN
    RAISE EXCEPTION 'VERIFY_459_CUSTOMER_REACTIVATION_FAILED';
  END IF;

  v_supplier := public.crear_proveedor_maestro_tx(
    v_tenant, v_actor,
    jsonb_build_object(
      'ruc', '20100070970', 'documento_tipo', 'RUC',
      'razon_social', 'Proveedor Verify 459', 'email', 'PROVEEDOR@EXAMPLE.COM',
      'condiciones_pago', 'CREDITO_30', 'limite_credito', 5000, 'dias_credito', 30
    )
  );
  v_supplier_retry := public.crear_proveedor_maestro_tx(
    v_tenant, v_actor,
    jsonb_build_object(
      'ruc', '20100070970', 'documento_tipo', 'RUC',
      'razon_social', 'Proveedor Verify 459', 'email', 'PROVEEDOR@EXAMPLE.COM',
      'condiciones_pago', 'CREDITO_30', 'limite_credito', 5000, 'dias_credito', 30
    )
  );
  IF v_supplier->>'id' IS DISTINCT FROM v_supplier_retry->>'id'
     OR COALESCE((v_supplier_retry->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_459_SUPPLIER_RETRY_DUPLICO';
  END IF;

  v_supplier_updated := public.actualizar_proveedor_maestro_tx(
    (v_supplier->>'id')::uuid, v_tenant, v_actor,
    jsonb_build_object('razon_social', 'Proveedor Editado 459', 'limite_credito', 7500)
  );
  IF v_supplier_updated->>'razon_social' <> 'Proveedor Editado 459'
     OR (v_supplier_updated->>'limite_credito')::numeric <> 7500 THEN
    RAISE EXCEPTION 'VERIFY_459_SUPPLIER_UPDATE_FAILED';
  END IF;
  PERFORM public.desactivar_proveedor_maestro_tx((v_supplier->>'id')::uuid, v_tenant, v_actor);
  IF COALESCE((public.desactivar_proveedor_maestro_tx((v_supplier->>'id')::uuid, v_tenant, v_actor)->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_459_SUPPLIER_SOFT_DELETE_NOT_IDEMPOTENT';
  END IF;
  v_supplier_retry := public.crear_proveedor_maestro_tx(
    v_tenant, v_actor,
    jsonb_build_object(
      'ruc', '20100070970', 'documento_tipo', 'RUC',
      'razon_social', 'Proveedor Verify 459', 'email', 'PROVEEDOR@EXAMPLE.COM',
      'condiciones_pago', 'CREDITO_30', 'limite_credito', 5000, 'dias_credito', 30
    )
  );
  IF v_supplier_retry->>'id' IS DISTINCT FROM v_supplier->>'id'
     OR COALESCE((v_supplier_retry->>'reactivated')::boolean, false) IS NOT TRUE
     OR NOT (SELECT activo FROM public.proveedores WHERE id = (v_supplier->>'id')::uuid) THEN
    RAISE EXCEPTION 'VERIFY_459_SUPPLIER_REACTIVATION_FAILED';
  END IF;

  IF (SELECT count(*) FROM public.audit_log a
      WHERE a.tenant_id = v_tenant AND a.table_name IN ('clientes', 'proveedores')
        AND a.record_id IN (v_customer->>'id', v_supplier->>'id')) < 8 THEN
    RAISE EXCEPTION 'VERIFY_459_ATOMIC_AUDIT_MISSING';
  END IF;

  IF has_table_privilege('authenticated', 'public.clientes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.proveedores', 'UPDATE')
     OR has_function_privilege('authenticated', 'public.crear_cliente_maestro_tx(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crear_proveedor_maestro_tx(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_459_CLIENT_ROLE_MUTATION_EXPOSED';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.crear_cliente_maestro_tx(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.crear_proveedor_maestro_tx(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_table_privilege('service_role', 'public.clientes', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.proveedores', 'SELECT') THEN
    RAISE EXCEPTION 'VERIFY_459_BACKEND_CONTRACT_MISSING';
  END IF;
  IF has_table_privilege('service_role', 'public.clientes', 'INSERT')
     OR has_table_privilege('service_role', 'public.clientes', 'UPDATE')
     OR has_table_privilege('service_role', 'public.clientes', 'DELETE')
     OR has_table_privilege('service_role', 'public.proveedores', 'INSERT')
     OR has_table_privilege('service_role', 'public.proveedores', 'UPDATE')
     OR has_table_privilege('service_role', 'public.proveedores', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_459_SERVICE_ROLE_DIRECT_DML_EXPOSED';
  END IF;
  IF has_function_privilege('service_role', 'app.assert_actor_comercial_459(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.auditar_comercial_459(uuid,uuid,text,text,uuid,jsonb,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_459_INTERNAL_HELPER_EXPOSED';
  END IF;
END;
$verify$;

ROLLBACK;
