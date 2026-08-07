\set ON_ERROR_STOP on

DO $verify$
DECLARE
  v_missing text;
  v_rpc regprocedure;
BEGIN
  SELECT string_agg(version, ', ' ORDER BY version)
    INTO v_missing
  FROM (SELECT lpad(n::text, 3, '0') version FROM generate_series(412, 432) n) expected
  WHERE NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations m
    WHERE m.version = expected.version
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migraciones 412-432 no registradas: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'telefono'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_clientes_telefono_runtime_416'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'Contrato de teléfono de clientes incompleto';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.plan_cuentas pc
      WHERE pc.tenant_id = t.id AND pc.codigo = '4699'
    )
  ) THEN
    RAISE EXCEPTION 'Existe un tenant sin la cuenta PCGE 4699';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_demo_tenant') <> 1 THEN
    RAISE EXCEPTION 'create_demo_tenant conserva sobrecargas ambiguas';
  END IF;

  FOREACH v_rpc IN ARRAY ARRAY[
    'public.hydrate_demo_business_sample_tx(uuid,uuid)'::regprocedure,
    'public.hydrate_demo_hr_sample_tx(uuid)'::regprocedure,
    'public.reiniciar_datos_tenant(uuid)'::regprocedure,
    'public.completar_conversion_demo(uuid,text,text,text,text,text,text,boolean,uuid,text,text)'::regprocedure,
    'public.liberar_stock_cotizacion(uuid,uuid)'::regprocedure,
    'public.convertir_cotizacion_a_pedido(uuid,uuid,uuid,text)'::regprocedure,
    'public.guardar_calculo_planilla_tx(uuid,uuid,jsonb)'::regprocedure,
    'public.pagar_planilla_completa_tx(uuid,uuid,text,text)'::regprocedure,
    'public.confirmar_liquidacion_tx(uuid,uuid,uuid)'::regprocedure,
    'public.crear_asiento_contable_tx(uuid,timestamptz,text,text,text,uuid,uuid,text,jsonb)'::regprocedure,
    'public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)'::regprocedure,
    'public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)'::regprocedure
  ]
  LOOP
    IF has_function_privilege('anon', v_rpc, 'EXECUTE')
       OR has_function_privilege('authenticated', v_rpc, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_rpc, 'EXECUTE') THEN
      RAISE EXCEPTION 'Privilegios incorrectos para %', v_rpc;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_promover_admin_al_convertir_demo' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_normalizar_identidad_conversion_demo' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Triggers de conversión demo incompletos';
  END IF;
END;
$verify$;

SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version BETWEEN '412' AND '432'
ORDER BY version;
