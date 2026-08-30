\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_473_SOLO_ERP_E2E:%', current_database();
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'PROD',
    project_ref = 'wypnbcptofqdmoynlonq',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

CREATE OR REPLACE FUNCTION app.verify_473_fail_late_detail()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF NEW.concepto = 'VERIFY_473_LATE_FAILURE' THEN
    RAISE EXCEPTION 'VERIFY_473_LATE_DETAIL_FAILURE';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_verify_473_fail_late_detail ON public.detalle_asientos;
CREATE TRIGGER trg_verify_473_fail_late_detail
BEFORE INSERT ON public.detalle_asientos
FOR EACH ROW EXECUTE FUNCTION app.verify_473_fail_late_detail();

CREATE OR REPLACE FUNCTION app.verify_473_fail_template_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF OLD.nombre = 'VERIFY_473_FAIL_DELETE' THEN
    RAISE EXCEPTION 'VERIFY_473_TEMPLATE_DELETE_FAILURE';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_verify_473_fail_template_delete ON public.plantillas_asientos;
CREATE TRIGGER trg_verify_473_fail_template_delete
BEFORE DELETE ON public.plantillas_asientos
FOR EACH ROW EXECUTE FUNCTION app.verify_473_fail_template_delete();

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_other_actor uuid := gen_random_uuid();
  v_run uuid := gen_random_uuid();
  v_other_run uuid := gen_random_uuid();
  v_customer jsonb;
  v_customer_retry jsonb;
  v_supplier jsonb;
  v_supplier_retry jsonb;
  v_cxc jsonb;
  v_cxc_retry jsonb;
  v_cxp jsonb;
  v_cxp_retry jsonb;
  v_cpe jsonb;
  v_cpe_retry jsonb;
  v_balance jsonb;
  v_balance_retry jsonb;
  v_account_debit uuid := gen_random_uuid();
  v_account_credit uuid := gen_random_uuid();
  v_real_cpe uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_warehouse uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_stock jsonb;
  v_stock_retry jsonb;
  v_template jsonb;
  v_template_delete jsonb;
  v_template_fail jsonb;
  v_failed boolean;
  v_before_headers bigint;
  v_before_operations bigint;
  v_details jsonb;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, descripcion, pais, plan, activo, estado)
  VALUES
    (v_tenant, 'VERIFY-473-' || left(v_tenant::text, 8), 'Tenant verify 473',
     'Fixture local de importacion', 'PE', 'test', true, 'ACTIVO'),
    (v_other_tenant, 'VERIFY-473-' || left(v_other_tenant::text, 8),
     'Tenant ajeno verify 473', 'Fixture aislamiento', 'PE', 'test', true, 'ACTIVO');

  -- Los writers maestros posteriores a 526 leen el país desde la configuración
  -- tributaria del tenant. La importación histórica sigue siendo PE, pero su
  -- fixture debe representar un tenant operativo completo.
  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado,
    configuracion_completa, is_demo
  ) VALUES
    (v_tenant, '20604730019', 'Empresa verify 473', 'PE', 'PEN', 'ACTIVO', true, false),
    (v_other_tenant, '20604730027', 'Empresa ajena verify 473', 'PE', 'PEN', 'ACTIVO', true, false);

  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES
    (v_actor, v_tenant, 'Actor', 'Verify 473',
     'actor-473-' || left(v_actor::text, 8) || '@local.invalid',
     'actor473', 'unused-local-hash', true, 'ACTIVO'),
    (v_other_actor, v_other_tenant, 'Ajeno', 'Verify 473',
     'foreign-473-' || left(v_other_actor::text, 8) || '@local.invalid',
     'foreign473', 'unused-local-hash', true, 'ACTIVO');

  INSERT INTO public.migration_runs (
    id, tenant_id, run_type, status, total_rows, started_by, source_filename
  ) VALUES
    (v_run, v_tenant, 'clientes', 'in_progress', 10, v_actor, 'verify-473.csv'),
    (v_other_run, v_other_tenant, 'clientes', 'in_progress', 1, v_other_actor,
     'verify-473-foreign.csv');

  INSERT INTO public.plan_cuentas (
    id, tenant_id, codigo, nombre, estado, activo, acepta_movimiento, tipo, tipo_cuenta
  ) VALUES
    (v_account_debit, v_tenant, '10473', 'Cuenta debe verify 473',
     'ACTIVO', true, true, 'ACTIVO', 'ACTIVO'),
    (v_account_credit, v_tenant, '50473', 'Cuenta haber verify 473',
     'ACTIVO', true, true, 'PATRIMONIO', 'PATRIMONIO');

  INSERT INTO public.productos (
    id, tenant_id, codigo, nombre, estado, activo, es_servicio,
    controla_stock, stock_actual, stock, stock_reservado, external_id
  ) VALUES (
    v_product, v_tenant, 'PROD-473', 'Producto stock verify 473',
    'ACTIVO', true, false, true, 0, 0, 0, 'PROD-LEGACY-473'
  );
  INSERT INTO public.almacenes (
    id, tenant_id, codigo, nombre, estado, activo, es_principal
  ) VALUES (
    v_warehouse, v_tenant, 'ALM-473', 'Almacen verify 473',
    'ACTIVO', true, true
  );
  INSERT INTO public.sucursales (id, tenant_id, codigo, nombre, estado)
  VALUES (v_branch, v_tenant, 'SUC-473', 'Sucursal verify 473', 'ACTIVO');

  -- Guardado y borrado de plantillas exigen actor y preservan el agregado.
  v_template := public.guardar_plantilla_contable_tx_473(
    v_tenant, v_actor, NULL,
    jsonb_build_object(
      'nombre', 'VERIFY_473_DELETE_OK', 'concepto', 'Plantilla eliminable',
      'periodicidad', 'NINGUNA', 'crear_en_estado', 'BORRADOR', 'activa', true
    ),
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_account_debit, 'debe', 10, 'haber', 0),
      jsonb_build_object('cuenta_id', v_account_credit, 'debe', 0, 'haber', 10)
    )
  );
  v_failed := false;
  BEGIN
    PERFORM public.eliminar_plantilla_contable_tx_473(
      v_tenant, v_other_actor, (v_template->>'id')::uuid
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_473_TEMPLATE_CROSS_ACTOR_ACCEPTED'; END IF;

  v_template_delete := public.eliminar_plantilla_contable_tx_473(
    v_tenant, v_actor, (v_template->>'id')::uuid
  );
  IF v_template_delete->>'action' <> 'DELETED'
     OR EXISTS (SELECT 1 FROM public.plantillas_asientos
                WHERE id = (v_template->>'id')::uuid)
     OR EXISTS (SELECT 1 FROM public.plantillas_asientos_detalle
                WHERE plantilla_id = (v_template->>'id')::uuid)
     OR (public.eliminar_plantilla_contable_tx_473(
           v_tenant, v_actor, (v_template->>'id')::uuid
         )->>'action') <> 'IDEMPOTENT' THEN
    RAISE EXCEPTION 'VERIFY_473_TEMPLATE_DELETE_NOT_ATOMIC_OR_IDEMPOTENT';
  END IF;

  v_template_fail := public.guardar_plantilla_contable_tx_473(
    v_tenant, v_actor, NULL,
    jsonb_build_object(
      'nombre', 'VERIFY_473_FAIL_DELETE', 'concepto', 'Falla inducida',
      'periodicidad', 'NINGUNA', 'crear_en_estado', 'BORRADOR', 'activa', true
    ),
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_account_debit, 'debe', 20, 'haber', 0),
      jsonb_build_object('cuenta_id', v_account_credit, 'debe', 0, 'haber', 20)
    )
  );
  v_failed := false;
  BEGIN
    PERFORM public.eliminar_plantilla_contable_tx_473(
      v_tenant, v_actor, (v_template_fail->>'id')::uuid
    );
  EXCEPTION WHEN raise_exception THEN v_failed := true;
  END;
  IF NOT v_failed
     OR NOT EXISTS (SELECT 1 FROM public.plantillas_asientos
                    WHERE id = (v_template_fail->>'id')::uuid)
     OR (SELECT count(*) FROM public.plantillas_asientos_detalle
         WHERE plantilla_id = (v_template_fail->>'id')::uuid) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_473_TEMPLATE_LATE_FAILURE_DID_NOT_ROLLBACK';
  END IF;

  -- RBAC y pertenencia del run se validan antes de cualquier writer.
  v_failed := false;
  BEGIN
    PERFORM public.importar_cliente_historico_tx(
      v_tenant, v_other_actor, NULL, 'CLI-INVALID-ACTOR',
      jsonb_build_object(
        'tipo', 'EMPRESA', 'documento_tipo', 'RUC',
        'documento_identidad', '20604730001', 'razon_social', 'Actor ajeno'
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_473_CROSS_TENANT_ACTOR_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.importar_cliente_historico_tx(
      v_tenant, v_actor, v_other_run, 'CLI-INVALID-RUN',
      jsonb_build_object(
        'tipo', 'EMPRESA', 'documento_tipo', 'RUC',
        'documento_identidad', '20604730002', 'razon_social', 'Run ajeno'
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_473_CROSS_TENANT_RUN_ACCEPTED'; END IF;

  v_customer := public.importar_cliente_historico_tx(
    v_tenant, v_actor, v_run, 'CLI-LEGACY-473',
    jsonb_build_object(
      'tipo', 'EMPRESA', 'documento_tipo', 'RUC',
      'documento_identidad', '20604730003', 'razon_social', 'Cliente historico 473',
      'email', 'CLIENTE473@EXAMPLE.COM', 'limite_credito', 800, 'pais', 'PE'
    )
  );
  v_customer_retry := public.importar_cliente_historico_tx(
    v_tenant, v_actor, v_run, 'CLI-LEGACY-473',
    jsonb_build_object(
      'tipo', 'EMPRESA', 'documento_tipo', 'RUC',
      'documento_identidad', '20604730003', 'razon_social', 'Cliente historico 473',
      'email', 'CLIENTE473@EXAMPLE.COM', 'limite_credito', 800, 'pais', 'PE'
    )
  );
  IF v_customer->>'action' <> 'CREATED'
     OR v_customer_retry->>'action' <> 'IDEMPOTENT'
     OR v_customer_retry->>'id' IS DISTINCT FROM v_customer->>'id'
     OR (SELECT external_id FROM public.clientes WHERE id = (v_customer->>'id')::uuid)
        <> 'CLI-LEGACY-473'
     OR (SELECT email FROM public.clientes WHERE id = (v_customer->>'id')::uuid)
        <> 'cliente473@example.com' THEN
    RAISE EXCEPTION 'VERIFY_473_CUSTOMER_IMPORT_INVALID:%:%', v_customer, v_customer_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.importar_cliente_historico_tx(
      v_tenant, v_actor, v_run, 'CLI-LEGACY-473',
      jsonb_build_object(
        'tipo', 'EMPRESA', 'documento_tipo', 'RUC',
        'documento_identidad', '20604730003', 'razon_social', 'Payload distinto',
        'email', 'cliente473@example.com', 'limite_credito', 800, 'pais', 'PE'
      )
    );
  EXCEPTION WHEN data_exception THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_473_CUSTOMER_KEY_REUSE_ACCEPTED'; END IF;

  v_supplier := public.importar_proveedor_historico_tx(
    v_tenant, v_actor, NULL, 'PRV-LEGACY-473',
    jsonb_build_object(
      'documento_tipo', 'RUC', 'documento_identidad', '20104730004',
      'razon_social', 'Proveedor historico 473', 'email', 'PROV473@EXAMPLE.COM',
      'condiciones_pago', 'CREDITO_30', 'limite_credito', 1200,
      'dias_credito', 30, 'sujeto_detraccion', true, 'detraccion_tasa', 12
    )
  );
  v_supplier_retry := public.importar_proveedor_historico_tx(
    v_tenant, v_actor, NULL, 'PRV-LEGACY-473',
    jsonb_build_object(
      'documento_tipo', 'RUC', 'documento_identidad', '20104730004',
      'razon_social', 'Proveedor historico 473', 'email', 'PROV473@EXAMPLE.COM',
      'condiciones_pago', 'CREDITO_30', 'limite_credito', 1200,
      'dias_credito', 30, 'sujeto_detraccion', true, 'detraccion_tasa', 12
    )
  );
  IF v_supplier->>'action' <> 'CREATED'
     OR v_supplier_retry->>'action' <> 'IDEMPOTENT'
     OR v_supplier_retry->>'id' IS DISTINCT FROM v_supplier->>'id'
     OR NOT COALESCE((SELECT (metadata->>'sujeto_detraccion')::boolean
                      FROM public.proveedores
                      WHERE id = (v_supplier->>'id')::uuid), false) THEN
    RAISE EXCEPTION 'VERIFY_473_SUPPLIER_IMPORT_INVALID:%:%', v_supplier, v_supplier_retry;
  END IF;

  v_cxc := public.importar_cxc_apertura_tx(
    v_tenant, v_actor, NULL, 'CXC-LEGACY-473',
    jsonb_build_object(
      'cliente_id', v_customer->>'id', 'tipo_documento', 'FACTURA',
      'serie', 'F473', 'numero', '00000001', 'fecha_emision', '2026-01-01',
      'fecha_vencimiento', '2026-02-01', 'moneda', 'PEN',
      'monto_total', 118, 'saldo_pendiente', 80, 'fecha_corte', '2026-01-31'
    )
  );
  UPDATE public.cuentas_por_cobrar
  SET saldo = 30, saldo_pendiente = 30, monto_pendiente = 30, estado = 'PARCIAL'
  WHERE id = (v_cxc->>'id')::uuid;
  v_cxc_retry := public.importar_cxc_apertura_tx(
    v_tenant, v_actor, NULL, 'CXC-LEGACY-473',
    jsonb_build_object(
      'cliente_id', v_customer->>'id', 'tipo_documento', 'FACTURA',
      'serie', 'F473', 'numero', '00000001', 'fecha_emision', '2026-01-01',
      'fecha_vencimiento', '2026-02-01', 'moneda', 'PEN',
      'monto_total', 118, 'saldo_pendiente', 80, 'fecha_corte', '2026-01-31'
    )
  );
  IF v_cxc->>'action' <> 'CREATED' OR v_cxc_retry->>'action' <> 'IDEMPOTENT'
     OR (SELECT saldo_pendiente FROM public.cuentas_por_cobrar
         WHERE id = (v_cxc->>'id')::uuid) <> 30 THEN
    RAISE EXCEPTION 'VERIFY_473_CXC_REPLAY_OVERWROTE_COLLECTION:%', v_cxc_retry;
  END IF;

  v_cxp := public.importar_cxp_apertura_tx(
    v_tenant, v_actor, NULL, 'CXP-LEGACY-473',
    jsonb_build_object(
      'proveedor_id', v_supplier->>'id', 'tipo_documento', 'FACTURA',
      'serie', 'E473', 'numero', '00000001', 'fecha_emision', '2026-01-01',
      'fecha_vencimiento', '2026-02-01', 'moneda', 'PEN',
      'monto_total', 236, 'saldo_pendiente', 150, 'fecha_corte', '2026-01-31'
    )
  );
  UPDATE public.cuentas_por_pagar
  SET saldo = 75, saldo_pendiente = 75, estado = 'PARCIAL'
  WHERE id = (v_cxp->>'id')::uuid;
  v_cxp_retry := public.importar_cxp_apertura_tx(
    v_tenant, v_actor, NULL, 'CXP-LEGACY-473',
    jsonb_build_object(
      'proveedor_id', v_supplier->>'id', 'tipo_documento', 'FACTURA',
      'serie', 'E473', 'numero', '00000001', 'fecha_emision', '2026-01-01',
      'fecha_vencimiento', '2026-02-01', 'moneda', 'PEN',
      'monto_total', 236, 'saldo_pendiente', 150, 'fecha_corte', '2026-01-31'
    )
  );
  IF v_cxp->>'action' <> 'CREATED' OR v_cxp_retry->>'action' <> 'IDEMPOTENT'
     OR (SELECT saldo_pendiente FROM public.cuentas_por_pagar
         WHERE id = (v_cxp->>'id')::uuid) <> 75 THEN
    RAISE EXCEPTION 'VERIFY_473_CXP_REPLAY_OVERWROTE_PAYMENT:%', v_cxp_retry;
  END IF;

  v_stock := public.importar_stock_inicial_tx(
    v_tenant, v_actor, NULL,
    'stock:PROD-LEGACY-473:' || v_warehouse::text || ':2026-01-31',
    jsonb_build_object(
      'producto_id', v_product, 'almacen_id', v_warehouse,
      'sucursal_id', v_branch, 'fecha_corte', '2026-01-31',
      'cantidad', 12, 'costo_unitario', 5,
      'external_id_producto', 'PROD-LEGACY-473'
    )
  );
  v_stock_retry := public.importar_stock_inicial_tx(
    v_tenant, v_actor, NULL,
    'stock:PROD-LEGACY-473:' || v_warehouse::text || ':2026-01-31',
    jsonb_build_object(
      'producto_id', v_product, 'almacen_id', v_warehouse,
      'sucursal_id', v_branch, 'fecha_corte', '2026-01-31',
      'cantidad', 12, 'costo_unitario', 5,
      'external_id_producto', 'PROD-LEGACY-473'
    )
  );
  IF v_stock->>'action' <> 'CREATED' OR v_stock_retry->>'action' <> 'IDEMPOTENT'
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id = v_tenant AND producto_id = v_product
           AND almacen_id = v_warehouse
           AND referencia_tipo = 'MIGRACION_APERTURA_2026-01-31') <> 1
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant AND producto_id = v_product
           AND almacen_id = v_warehouse) <> 12 THEN
    RAISE EXCEPTION 'VERIFY_473_STOCK_REPLAY_INVALID:%:%', v_stock, v_stock_retry;
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.importar_stock_inicial_tx(
      v_tenant, v_actor, NULL,
      'stock:PROD-LEGACY-473:' || v_warehouse::text || ':2026-01-31',
      jsonb_build_object(
        'producto_id', v_product, 'almacen_id', v_warehouse,
        'sucursal_id', v_branch, 'fecha_corte', '2026-01-31',
        'cantidad', 13, 'costo_unitario', 5,
        'external_id_producto', 'PROD-LEGACY-473'
      )
    );
  EXCEPTION WHEN data_exception THEN v_failed := true;
  END;
  IF NOT v_failed
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant AND producto_id = v_product
           AND almacen_id = v_warehouse) <> 12 THEN
    RAISE EXCEPTION 'VERIFY_473_STOCK_CHANGED_REPLAY_ACCEPTED';
  END IF;

  v_cpe := public.importar_cpe_historico_tx(
    v_tenant, v_actor, NULL, 'CPE-LEGACY-473',
    jsonb_build_object(
      'tipo_documento', 'FACTURA', 'serie', 'H473', 'numero', '1',
      'fecha_emision', '2025-12-31', 'cliente_id', v_customer->>'id',
      'moneda', 'PEN', 'subtotal', 100, 'igv', 18, 'total', 118
    )
  );
  v_cpe_retry := public.importar_cpe_historico_tx(
    v_tenant, v_actor, NULL, 'CPE-LEGACY-473',
    jsonb_build_object(
      'tipo_documento', 'FACTURA', 'serie', 'H473', 'numero', '1',
      'fecha_emision', '2025-12-31', 'cliente_id', v_customer->>'id',
      'moneda', 'PEN', 'subtotal', 100, 'igv', 18, 'total', 118
    )
  );
  IF v_cpe->>'action' <> 'CREATED' OR v_cpe_retry->>'action' <> 'IDEMPOTENT'
     OR lower((SELECT estado::text FROM public.cpe WHERE id = (v_cpe->>'id')::uuid)) <> 'migrado'
     OR (SELECT tipo_documento FROM public.cpe WHERE id = (v_cpe->>'id')::uuid) <> '01'
     OR lower((SELECT sunat_status::text FROM public.cpe WHERE id = (v_cpe->>'id')::uuid)) <> 'not_sent'
     OR NOT COALESCE((SELECT (metadata->>'no_sunat')::boolean FROM public.cpe
                      WHERE id = (v_cpe->>'id')::uuid), false)
     OR NOT COALESCE((SELECT (metadata->>'solo_lectura')::boolean FROM public.cpe
                      WHERE id = (v_cpe->>'id')::uuid), false) THEN
    RAISE EXCEPTION 'VERIFY_473_HISTORICAL_CPE_INVALID:%:%', v_cpe_retry,
      (SELECT to_jsonb(c) FROM public.cpe c WHERE c.id = (v_cpe->>'id')::uuid);
  END IF;

  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero, numero_comprobante,
    fecha_emision, moneda, cliente_id, total_gravadas, total_igv,
    total_venta, total, estado, sunat_status, activo, created_by
  ) VALUES (
    v_real_cpe, v_tenant, '01', 'R473', '2', 2,
    '2026-01-02', 'PEN', (v_customer->>'id')::uuid, 100, 18,
    118, 118, 'BORRADOR', 'not_sent', true, v_actor
  );
  v_failed := false;
  BEGIN
    PERFORM public.importar_cpe_historico_tx(
      v_tenant, v_actor, NULL, 'CPE-COLLISION-473',
      jsonb_build_object(
        'tipo_documento', 'FACTURA', 'serie', 'R473', 'numero', '00000002',
        'fecha_emision', '2026-01-02', 'cliente_id', v_customer->>'id',
        'moneda', 'PEN', 'subtotal', 100, 'igv', 18, 'total', 118
      )
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed
     OR lower((SELECT estado::text FROM public.cpe WHERE id = v_real_cpe)) <> 'borrador' THEN
    RAISE EXCEPTION 'VERIFY_473_REAL_CPE_WAS_NOT_PROTECTED';
  END IF;

  v_details := jsonb_build_array(
    jsonb_build_object(
      'cuenta_id', v_account_debit, 'debe', 100, 'haber', 0,
      'concepto', 'Apertura debe verify 473'
    ),
    jsonb_build_object(
      'cuenta_id', v_account_credit, 'debe', 0, 'haber', 100,
      'concepto', 'Apertura haber verify 473'
    )
  );
  v_balance := public.importar_balance_apertura_tx(
    v_tenant, v_actor, NULL, '2026-01-31', v_details
  );
  v_balance_retry := public.importar_balance_apertura_tx(
    v_tenant, v_actor, NULL, '2026-01-31', v_details
  );
  IF v_balance->>'action' <> 'CREATED' OR v_balance_retry->>'action' <> 'IDEMPOTENT'
     OR v_balance_retry->>'id' IS DISTINCT FROM v_balance->>'id'
     OR (SELECT count(*) FROM public.detalle_asientos
         WHERE asiento_id = (v_balance->>'id')::uuid) <> 2
     OR (SELECT external_id FROM public.asientos_contables
         WHERE id = (v_balance->>'id')::uuid) <> 'APERTURA-2026-01-31' THEN
    RAISE EXCEPTION 'VERIFY_473_OPENING_BALANCE_INVALID:%:%', v_balance, v_balance_retry;
  END IF;

  -- Una falla al insertar detalles debe revertir cabecera e intencion durable.
  SELECT count(*) INTO v_before_headers
  FROM public.asientos_contables WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_operations
  FROM public.migration_row_operations WHERE tenant_id = v_tenant;
  v_failed := false;
  BEGIN
    PERFORM public.importar_balance_apertura_tx(
      v_tenant, v_actor, NULL, '2026-02-28',
      jsonb_build_array(
        jsonb_build_object(
          'cuenta_id', v_account_debit, 'debe', 50, 'haber', 0,
          'concepto', 'VERIFY_473_LATE_FAILURE'
        ),
        jsonb_build_object(
          'cuenta_id', v_account_credit, 'debe', 0, 'haber', 50,
          'concepto', 'VERIFY_473_LATE_FAILURE'
        )
      )
    );
  EXCEPTION WHEN raise_exception THEN v_failed := true;
  END;
  IF NOT v_failed
     OR (SELECT count(*) FROM public.asientos_contables WHERE tenant_id = v_tenant)
        <> v_before_headers
     OR (SELECT count(*) FROM public.migration_row_operations WHERE tenant_id = v_tenant)
        <> v_before_operations THEN
    RAISE EXCEPTION 'VERIFY_473_LATE_FAILURE_DID_NOT_ROLLBACK';
  END IF;

  IF NOT (SELECT relrowsecurity AND relforcerowsecurity
          FROM pg_class WHERE oid = 'public.migration_row_operations'::regclass)
     OR has_table_privilege('authenticated', 'public.migration_row_operations', 'INSERT')
     OR has_table_privilege('service_role', 'public.migration_row_operations', 'INSERT')
     OR has_table_privilege('service_role', 'public.migration_row_operations', 'UPDATE')
     OR has_table_privilege('service_role', 'public.migration_row_operations', 'DELETE')
     OR NOT has_table_privilege('service_role', 'public.migration_row_operations', 'SELECT')
     OR has_function_privilege('service_role',
       'app.register_migration_operation_473(uuid,text,text,text,text,uuid,text,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.importar_cliente_historico_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.importar_balance_apertura_tx(uuid,uuid,uuid,date,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.eliminar_plantilla_contable_tx_473(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.importar_stock_inicial_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.importar_cxp_apertura_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_473_RLS_OR_ACL_INVALID';
  END IF;

  IF (SELECT count(*) FROM public.migration_row_operations
      WHERE tenant_id = v_tenant) <> 7 THEN
    RAISE EXCEPTION 'VERIFY_473_OPERATION_LEDGER_CARDINALITY_INVALID';
  END IF;
END;
$verify$;

ROLLBACK;
