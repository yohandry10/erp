\set ON_ERROR_STOP on

DO $guard$
DECLARE
  v_environment text;
  v_project_ref text;
  v_row record;
  v_existing_name text;
BEGIN
  SELECT environment, project_ref
    INTO v_environment, v_project_ref
  FROM app.deployment_environment
  WHERE singleton = true;

  IF v_environment <> 'PROD' OR v_project_ref <> 'wypnbcptofqdmoynlonq' THEN
    RAISE EXCEPTION 'Registro 412-432 rechazado: la base no es PROD autorizada';
  END IF;

  FOR v_row IN
    SELECT * FROM (VALUES
      ('412', '_demo_business_sample_all_or_nothing'),
      ('413', '_demo_rrhh_departments_and_payments'),
      ('414', '_demo_conversion_atomic_reset'),
      ('415', '_demo_conversion_identity_cleanup'),
      ('416', '_clientes_telefono_runtime_contract'),
      ('417', '_pos_cost_of_sales_accounting_reconciliation'),
      ('418', '_quote_reservation_and_order_cogs_reconciliation'),
      ('419', '_converted_demo_admin_role_cleanup'),
      ('420', '_demo_payroll_accounting_closure'),
      ('421', '_demo_accounting_finance_logistics_samples'),
      ('422', '_demo_operational_accounting_closure'),
      ('423', '_demo_procurement_sire_audit_samples'),
      ('424', '_demo_sire_visible_period_contract'),
      ('425', '_rrhh_planilla_calculation_atomic'),
      ('426', '_rrhh_planilla_payment_atomic_outbox'),
      ('427', '_rrhh_liquidacion_confirmation_atomic'),
      ('428', '_pcge_mercaderias_recibidas_por_facturar'),
      ('429', '_contabilidad_asiento_atomic'),
      ('430', '_cxp_supplier_invoice_atomic_outbox'),
      ('431', '_cxp_payment_bank_atomic_outbox'),
      ('432', '_demo_create_rpc_unambiguous')
    ) expected(version, name)
  LOOP
    SELECT name INTO v_existing_name
    FROM supabase_migrations.schema_migrations
    WHERE version = v_row.version;

    IF v_existing_name IS NOT NULL AND v_existing_name <> v_row.name THEN
      RAISE EXCEPTION 'La version % ya pertenece a %', v_row.version, v_existing_name;
    END IF;
    v_existing_name := NULL;
  END LOOP;

  IF to_regprocedure('public.guardar_calculo_planilla_tx(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.pagar_planilla_completa_tx(uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.confirmar_liquidacion_tx(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.crear_asiento_contable_tx(uuid,timestamptz,text,text,text,uuid,uuid,text,jsonb)') IS NULL
     OR to_regprocedure('public.crear_factura_proveedor_tx(uuid,jsonb,uuid,text)') IS NULL
     OR to_regprocedure('public.aplicar_pago_cxp_tx(uuid,uuid,jsonb,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Registro 412-432 rechazado: falta al menos un RPC atómico';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_demo_tenant') <> 1 THEN
    RAISE EXCEPTION 'Registro 412-432 rechazado: create_demo_tenant conserva sobrecargas ambiguas';
  END IF;
END;
$guard$;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
SELECT version,
       ARRAY['Aplicada desde supabase/migrations/' || version || '_' || name || '.sql'],
       name
FROM (VALUES
  ('412', '_demo_business_sample_all_or_nothing'),
  ('413', '_demo_rrhh_departments_and_payments'),
  ('414', '_demo_conversion_atomic_reset'),
  ('415', '_demo_conversion_identity_cleanup'),
  ('416', '_clientes_telefono_runtime_contract'),
  ('417', '_pos_cost_of_sales_accounting_reconciliation'),
  ('418', '_quote_reservation_and_order_cogs_reconciliation'),
  ('419', '_converted_demo_admin_role_cleanup'),
  ('420', '_demo_payroll_accounting_closure'),
  ('421', '_demo_accounting_finance_logistics_samples'),
  ('422', '_demo_operational_accounting_closure'),
  ('423', '_demo_procurement_sire_audit_samples'),
  ('424', '_demo_sire_visible_period_contract'),
  ('425', '_rrhh_planilla_calculation_atomic'),
  ('426', '_rrhh_planilla_payment_atomic_outbox'),
  ('427', '_rrhh_liquidacion_confirmation_atomic'),
  ('428', '_pcge_mercaderias_recibidas_por_facturar'),
  ('429', '_contabilidad_asiento_atomic'),
  ('430', '_cxp_supplier_invoice_atomic_outbox'),
  ('431', '_cxp_payment_bank_atomic_outbox'),
  ('432', '_demo_create_rpc_unambiguous')
) expected(version, name)
ON CONFLICT (version) DO NOTHING;
