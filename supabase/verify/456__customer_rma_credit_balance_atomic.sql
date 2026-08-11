\set ON_ERROR_STOP on

BEGIN;

UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 456 solo puede ejecutarse en la base efimera erp_e2e';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.verify_456_fail_late_outbox()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF current_setting('app.verify_456_fail_outbox', true) = 'on'
     AND NEW.event_type IN ('rma.recepcionada', 'nota_credito.emitida') THEN
    RAISE EXCEPTION 'VERIFY_456_LATE_OUTBOX_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_456_fail_late_outbox ON public.outbox_events;
CREATE TRIGGER trg_verify_456_fail_late_outbox
BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.verify_456_fail_late_outbox();

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_creator uuid := gen_random_uuid();
  v_approver uuid := gen_random_uuid();
  v_foreign_actor uuid := gen_random_uuid();
  v_cliente uuid;
  v_warehouse uuid;
  v_stock_product uuid;
  v_extra_product uuid;
  v_service uuid;
  v_no_stock uuid;
  v_order uuid;
  v_order_stock_1 uuid;
  v_order_stock_2 uuid;
  v_order_service uuid;
  v_order_no_stock uuid;
  v_order_extra uuid;
  v_document uuid;
  v_cpe uuid := gen_random_uuid();
  v_source_event uuid := gen_random_uuid();
  v_original_asiento uuid;
  v_cxc uuid;
  v_future_document uuid;
  v_future_cxc uuid;
  v_rma uuid;
  v_second_rma uuid;
  v_item_stock_1 uuid;
  v_item_stock_2 uuid;
  v_item_service uuid;
  v_item_no_stock uuid;
  v_result jsonb;
  v_retry jsonb;
  v_saldo uuid;
  v_credit_note uuid;
  v_credit_note_cpe uuid;
  v_bank uuid;
  v_cashbox uuid;
  v_session uuid;
  v_failed boolean;
  v_before numeric;
  v_count bigint;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, descripcion, pais, plan, activo, estado)
  VALUES
    (v_tenant, 'VERIFY-456-' || left(v_tenant::text, 8), 'Tenant verify 456',
     'Fixture local transaccional', 'PE', 'test', true, 'ACTIVO'),
    (v_other_tenant, 'VERIFY-456-' || left(v_other_tenant::text, 8),
     'Tenant ajeno verify 456', 'Fixture de aislamiento', 'PE', 'test', true, 'ACTIVO');

  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado,
    configuracion_completa, habilitar_rma, dias_maximos_rma,
    rma_requiere_control_calidad, serie_nota_credito
  ) VALUES (
    v_tenant, '20600000456', 'Empresa verify 456', 'PE', 'PEN', 'ACTIVO',
    true, true, 30, false, 'FC01'
  );

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES
    (v_creator, v_tenant, 'Creador', 'Verify 456',
     'creator-456-' || left(v_creator::text, 8) || '@local.invalid',
     'creator456', 'unused-local-hash', true, 'ACTIVO'),
    (v_approver, v_tenant, 'Aprobador', 'Verify 456',
     'approver-456-' || left(v_approver::text, 8) || '@local.invalid',
     'approver456', 'unused-local-hash', true, 'ACTIVO'),
    (v_foreign_actor, v_other_tenant, 'Ajeno', 'Verify 456',
     'foreign-456-' || left(v_foreign_actor::text, 8) || '@local.invalid',
     'foreign456', 'unused-local-hash', true, 'ACTIVO');

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant, 'CLI-456', 'Cliente verify 456', 'Cliente verify 456',
    'RUC', '20123456789', true
  ) RETURNING id INTO v_cliente;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant, 'ALM-456', 'Almacen verify 456', 'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_warehouse;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'codigo', 'PROD-456', 'nombre', 'Producto fisico doble linea 456',
      'categoria', 'VERIFICACION', 'precio_venta', 118,
      'precio_compra', 10, 'afectacion_igv', '10'
    ),
    v_warehouse, 10, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_stock_product;

  INSERT INTO public.productos (
    tenant_id, codigo, nombre, estado, activo, es_servicio, controla_stock,
    precio_venta, precio_compra, afectacion_igv, stock, stock_actual,
    stock_reservado
  ) VALUES
    (v_tenant, 'EXTRA-456', 'Producto no devuelto 456', 'ACTIVO', true,
     false, true, 118, 40, '10', 0, 0, 0),
    (v_tenant, 'SERV-456', 'Servicio retornable logico 456', 'ACTIVO', true,
     true, false, 47.20, 0, '10', 0, 0, 0),
    (v_tenant, 'NOSTOCK-456', 'Producto sin control de stock 456', 'ACTIVO', true,
     false, false, 23.60, 0, '10', 0, 0, 0);
  SELECT id INTO v_extra_product FROM public.productos
    WHERE tenant_id = v_tenant AND codigo = 'EXTRA-456';
  SELECT id INTO v_service FROM public.productos
    WHERE tenant_id = v_tenant AND codigo = 'SERV-456';
  SELECT id INTO v_no_stock FROM public.productos
    WHERE tenant_id = v_tenant AND codigo = 'NOSTOCK-456';

  INSERT INTO public.pedidos_venta (
    tenant_id, cliente_id, numero, fecha, fecha_pedido, estado,
    subtotal, igv, total, moneda, created_by
  ) VALUES (
    v_tenant, v_cliente, 'PV-456-1', current_date, current_date,
    'FACTURADO', 410, 73.80, 483.80, 'PEN', v_creator
  ) RETURNING id INTO v_order;

  INSERT INTO public.pedidos_venta_detalle (
    tenant_id, pedido_id, producto_id, descripcion, cantidad,
    precio_unitario, subtotal, estado_item, cantidad_despachada,
    cantidad_facturada, created_at
  ) VALUES
    (v_tenant, v_order, v_stock_product, 'Fisico doble A', 2, 118, 236,
     'FACTURADO', 2, 2, now() - interval '5 seconds'),
    (v_tenant, v_order, v_stock_product, 'Fisico doble B', 1, 59, 59,
     'FACTURADO', 1, 1, now() - interval '4 seconds'),
    (v_tenant, v_order, v_service, 'Servicio logico', 1, 47.20, 47.20,
     'FACTURADO', 0, 1, now() - interval '3 seconds'),
    (v_tenant, v_order, v_no_stock, 'No stock logico', 1, 23.60, 23.60,
     'FACTURADO', 0, 1, now() - interval '2 seconds'),
    (v_tenant, v_order, v_extra_product, 'Producto que permanece vendido', 1, 118, 118,
     'FACTURADO', 1, 1, now() - interval '1 second');
  SELECT id INTO v_order_stock_1 FROM public.pedidos_venta_detalle
    WHERE tenant_id = v_tenant AND pedido_id = v_order AND descripcion = 'Fisico doble A';
  SELECT id INTO v_order_stock_2 FROM public.pedidos_venta_detalle
    WHERE tenant_id = v_tenant AND pedido_id = v_order AND descripcion = 'Fisico doble B';
  SELECT id INTO v_order_service FROM public.pedidos_venta_detalle
    WHERE tenant_id = v_tenant AND pedido_id = v_order AND descripcion = 'Servicio logico';
  SELECT id INTO v_order_no_stock FROM public.pedidos_venta_detalle
    WHERE tenant_id = v_tenant AND pedido_id = v_order AND descripcion = 'No stock logico';
  SELECT id INTO v_order_extra FROM public.pedidos_venta_detalle
    WHERE tenant_id = v_tenant AND pedido_id = v_order AND descripcion = 'Producto que permanece vendido';

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, pedido_id, cliente_id, created_by,
    emisor_ruc, emisor_razon_social, emisor_direccion,
    receptor_tipo_doc, receptor_numero_doc, receptor_documento,
    receptor_razon_social, receptor_nombre, receptor_direccion
  ) VALUES (
    v_tenant, 'FACTURA', 'F456', '00000001', 'EMITIDO', now(),
    now() + interval '30 days', 'PEN', 1, 410, 73.80, 483.80,
    410, 0, 0, 0, v_order, v_cliente, v_creator,
    '20600000456', 'Empresa verify 456', 'Lima', '6', '20123456789',
    '20123456789', 'Cliente verify 456', 'Cliente verify 456', 'Lima'
  ) RETURNING id INTO v_document;

  INSERT INTO public.documento_detalles (
    tenant_id, documento_id, orden, producto_id, codigo_producto,
    descripcion, unidad_medida, cantidad, precio_unitario,
    descuento_unitario, valor_venta, impuesto_igv, impuesto_isc,
    total_item, metadata
  ) VALUES
    (v_tenant, v_document, 1, v_stock_product, 'PROD-456', 'Fisico doble A',
     'NIU', 2, 118, 0, 200, 36, 0, 236, jsonb_build_object('afectacion_igv','10')),
    (v_tenant, v_document, 2, v_stock_product, 'PROD-456', 'Fisico doble B',
     'NIU', 1, 59, 0, 50, 9, 0, 59, jsonb_build_object('afectacion_igv','10')),
    (v_tenant, v_document, 3, v_service, 'SERV-456', 'Servicio logico',
     'ZZ', 1, 47.20, 0, 40, 7.20, 0, 47.20, jsonb_build_object('afectacion_igv','10')),
    (v_tenant, v_document, 4, v_no_stock, 'NOSTOCK-456', 'No stock logico',
     'NIU', 1, 23.60, 0, 20, 3.60, 0, 23.60, jsonb_build_object('afectacion_igv','10')),
    (v_tenant, v_document, 5, v_extra_product, 'EXTRA-456', 'Producto que permanece vendido',
     'NIU', 1, 118, 0, 100, 18, 0, 118, jsonb_build_object('afectacion_igv','10'));

  INSERT INTO public.cpe (
    id, tenant_id, documento_id, tipo_documento, serie, numero,
    numero_comprobante, ruc_emisor, razon_social_emisor, direccion_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    direccion_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, created_by, event_id, activo
  ) VALUES (
    v_cpe, v_tenant, v_document, '01', 'F456', '00000001', 1,
    '20600000456', 'Empresa verify 456', 'Lima', '6', '20123456789',
    'Cliente verify 456', 'Lima', v_cliente, 'PEN', 410, 0, 0, 0,
    73.80, 483.80, 483.80,
    jsonb_build_array(
      jsonb_build_object('producto_id',v_stock_product,'codigo','PROD-456','cantidad',2,'valor_venta',200,'igv',36),
      jsonb_build_object('producto_id',v_stock_product,'codigo','PROD-456','cantidad',1,'valor_venta',50,'igv',9),
      jsonb_build_object('producto_id',v_service,'codigo','SERV-456','cantidad',1,'valor_venta',40,'igv',7.20),
      jsonb_build_object('producto_id',v_no_stock,'codigo','NOSTOCK-456','cantidad',1,'valor_venta',20,'igv',3.60),
      jsonb_build_object('producto_id',v_extra_product,'codigo','EXTRA-456','cantidad',1,'valor_venta',100,'igv',18)
    ),
    now(), current_date + 30, 'ACEPTADO', 'ACEPTADO', 'ACCEPTED',
    v_creator, v_source_event, true
  );

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, pedido_id, estado,
    monto_total, monto_original, monto_pendiente, saldo, saldo_pendiente,
    total, fecha_emision, fecha_vencimiento, moneda, numero_documento,
    tipo_documento, idempotency_key, event_source, tipo_cambio_origen,
    metadata
  ) VALUES (
    v_tenant, v_cliente, v_document, v_order, 'PARCIAL',
    483.80, 483.80, 100, 100, 100, 483.80, current_date,
    current_date + 30, 'PEN', 'F456-00000001', 'FACTURA',
    'verify-456-source-cxc', 'verify.456', 1,
    jsonb_build_object('origen','verify_local')
  ) RETURNING id INTO v_cxc;

  UPDATE public.pedidos_venta SET factura_id = v_cpe
  WHERE tenant_id = v_tenant AND id = v_order;

  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant, p_producto_id := v_stock_product,
    p_almacen_id := v_warehouse, p_tipo := 'SALIDA', p_cantidad := 3,
    p_referencia_tipo := 'PEDIDO_FACTURA_456', p_referencia_id := v_order,
    p_notas := 'Salida original verify 456', p_created_by := v_creator::text,
    p_metadata := jsonb_build_object('source','verify.456')
  );
  IF (SELECT stock_actual FROM public.producto_existencias
      WHERE tenant_id = v_tenant AND producto_id = v_stock_product
        AND almacen_id = v_warehouse) <> 7 THEN
    RAISE EXCEPTION 'VERIFY_456_SOURCE_STOCK_INVALID';
  END IF;

  SELECT public.crear_rma_tx(
    v_tenant, v_creator,
    jsonb_build_object(
      'pedido_id', v_order, 'documento_origen_id', v_document,
      'almacen_retorno_id', v_warehouse, 'motivo_general', 'Devolucion parcial de factura',
      'items', jsonb_build_array(
        jsonb_build_object('detalle_id',v_order_stock_1,'cantidad',2,'motivo_item','Falla A'),
        jsonb_build_object('detalle_id',v_order_stock_2,'cantidad',1,'motivo_item','Falla B'),
        jsonb_build_object('detalle_id',v_order_service,'cantidad',1,'motivo_item','Servicio no conforme'),
        jsonb_build_object('detalle_id',v_order_no_stock,'cantidad',1,'motivo_item','No stock no conforme')
      )
    ),
    'verify:456:create:main'
  ) INTO v_result;
  v_rma := (v_result->>'rma_id')::uuid;
  IF v_rma IS NULL OR v_result->>'numero' !~ '^RMA-[0-9]{4}-00001$'
     OR (SELECT count(*) FROM public.rma_items WHERE tenant_id=v_tenant AND rma_id=v_rma) <> 4
     OR (SELECT count(DISTINCT documento_detalle_id) FROM public.rma_items
         WHERE tenant_id=v_tenant AND rma_id=v_rma) <> 4 THEN
    RAISE EXCEPTION 'VERIFY_456_CREATE_OR_DOUBLE_SKU_MAPPING_FAILED: %', v_result;
  END IF;

  SELECT public.crear_rma_tx(
    v_tenant, v_creator,
    jsonb_build_object(
      'pedido_id', v_order, 'documento_origen_id', v_document,
      'almacen_retorno_id', v_warehouse, 'motivo_general', 'Devolucion parcial de factura',
      'items', jsonb_build_array(
        jsonb_build_object('detalle_id',v_order_stock_1,'cantidad',2,'motivo_item','Falla A'),
        jsonb_build_object('detalle_id',v_order_stock_2,'cantidad',1,'motivo_item','Falla B'),
        jsonb_build_object('detalle_id',v_order_service,'cantidad',1,'motivo_item','Servicio no conforme'),
        jsonb_build_object('detalle_id',v_order_no_stock,'cantidad',1,'motivo_item','No stock no conforme')
      )
    ),
    'verify:456:create:main'
  ) INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean OR (v_retry->>'rma_id')::uuid <> v_rma
     OR (SELECT count(*) FROM public.rma_operaciones
         WHERE tenant_id=v_tenant AND tipo='CREAR' AND idempotency_key='verify:456:create:main') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_456_CREATE_RETRY_FAILED: %', v_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_rma_tx(
      v_tenant, v_creator,
      jsonb_build_object('pedido_id',v_order,'documento_origen_id',v_document,
        'motivo_general','Payload distinto','items',jsonb_build_array(
          jsonb_build_object('detalle_id',v_order_stock_1,'cantidad',1))),
      'verify:456:create:main');
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_456_CREATE_COLLISION_NOT_REJECTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_rma_tx(
      v_tenant, v_foreign_actor,
      jsonb_build_object('pedido_id',v_order,'documento_origen_id',v_document,
        'motivo_general','Actor ajeno','items',jsonb_build_array(
          jsonb_build_object('detalle_id',v_order_extra,'cantidad',1))),
      'verify:456:create:foreign');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_456_FOREIGN_ACTOR_NOT_REJECTED'; END IF;

  SELECT public.crear_rma_tx(
    v_tenant, v_creator,
    jsonb_build_object('pedido_id',v_order,'documento_origen_id',v_document,
      'motivo_general','Segunda RMA para correlativo','items',jsonb_build_array(
        jsonb_build_object('detalle_id',v_order_extra,'cantidad',1))),
    'verify:456:create:second'
  ) INTO v_result;
  v_second_rma := (v_result->>'rma_id')::uuid;
  IF v_result->>'numero' !~ '^RMA-[0-9]{4}-00002$'
     OR (SELECT count(DISTINCT numero) FROM public.rma_solicitudes
         WHERE tenant_id=v_tenant) <> 2 THEN
    RAISE EXCEPTION 'VERIFY_456_CORRELATIVE_SERIALIZATION_FAILED: %', v_result;
  END IF;
  PERFORM public.decidir_rma_tx(v_tenant,v_creator,v_second_rma,false,
    'No procede','verify:456:reject:second');

  SELECT id INTO v_item_stock_1 FROM public.rma_items
    WHERE tenant_id=v_tenant AND rma_id=v_rma AND detalle_id=v_order_stock_1;
  SELECT id INTO v_item_stock_2 FROM public.rma_items
    WHERE tenant_id=v_tenant AND rma_id=v_rma AND detalle_id=v_order_stock_2;
  SELECT id INTO v_item_service FROM public.rma_items
    WHERE tenant_id=v_tenant AND rma_id=v_rma AND detalle_id=v_order_service;
  SELECT id INTO v_item_no_stock FROM public.rma_items
    WHERE tenant_id=v_tenant AND rma_id=v_rma AND detalle_id=v_order_no_stock;

  IF (SELECT metadata->>'classification_snapshot' FROM public.rma_items
      WHERE id=v_item_service) <> 'SERVICIO'
     OR (SELECT metadata->>'classification_snapshot' FROM public.rma_items
      WHERE id=v_item_no_stock) <> 'NO_STOCK' THEN
    RAISE EXCEPTION 'VERIFY_456_CLASSIFICATION_SNAPSHOT_NOT_PERSISTED';
  END IF;
  -- Simula una edición posterior del maestro. La recepción debe consumir el
  -- snapshot y no convertir retroactivamente estas líneas en movimientos.
  UPDATE public.productos
  SET es_servicio=false, controla_stock=true, updated_at=now()
  WHERE tenant_id=v_tenant AND id IN (v_service,v_no_stock);

  v_failed := false;
  BEGIN
    PERFORM public.recepcionar_rma_tx(v_tenant,v_approver,v_rma,
      jsonb_build_object('items',jsonb_build_array(
        jsonb_build_object('rma_item_id',v_item_stock_1,'cantidad_recibida',1))),
      'verify:456:receive:created');
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_456_CREATED_RECEIPT_NOT_REJECTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.decidir_rma_tx(v_tenant,v_creator,v_rma,true,NULL,
      'verify:456:approve:self');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_456_SELF_APPROVAL_NOT_REJECTED'; END IF;

  PERFORM public.decidir_rma_tx(v_tenant,v_approver,v_rma,true,
    'Aprobacion segregada','verify:456:approve:main');
  IF (SELECT estado FROM public.rma_solicitudes WHERE id=v_rma) <> 'APROBADA'
     OR (SELECT aprobado_por FROM public.rma_solicitudes WHERE id=v_rma) <> v_approver THEN
    RAISE EXCEPTION 'VERIFY_456_SEGREGATED_APPROVAL_FAILED';
  END IF;

  v_before := (SELECT stock_actual FROM public.producto_existencias
    WHERE tenant_id=v_tenant AND producto_id=v_stock_product AND almacen_id=v_warehouse);
  PERFORM set_config('app.verify_456_fail_outbox','on',true);
  v_failed := false;
  BEGIN
    PERFORM public.recepcionar_rma_tx(v_tenant,v_approver,v_rma,
      jsonb_build_object('almacen_id',v_warehouse,'items',jsonb_build_array(
        jsonb_build_object('rma_item_id',v_item_stock_1,'cantidad_recibida',0.5))),
      'verify:456:receive:late-failure');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'VERIFY_456_LATE_OUTBOX_FAILURE' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  PERFORM set_config('app.verify_456_fail_outbox','off',true);
  IF NOT v_failed
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id=v_tenant AND producto_id=v_stock_product AND almacen_id=v_warehouse) <> v_before
     OR (SELECT cantidad_devuelta FROM public.rma_items WHERE id=v_item_stock_1) <> 0
     OR EXISTS (SELECT 1 FROM public.rma_operaciones
         WHERE tenant_id=v_tenant AND idempotency_key='verify:456:receive:late-failure') THEN
    RAISE EXCEPTION 'VERIFY_456_RECEIPT_LATE_FAILURE_DID_NOT_ROLL_BACK';
  END IF;

  SELECT public.recepcionar_rma_tx(v_tenant,v_approver,v_rma,
    jsonb_build_object('almacen_id',v_warehouse,'items',jsonb_build_array(
      jsonb_build_object('rma_item_id',v_item_stock_1,'cantidad_recibida',1),
      jsonb_build_object('rma_item_id',v_item_service,'cantidad_recibida',1))),
    'verify:456:receive:partial-1') INTO v_result;
  IF v_result->>'estado' <> 'PARCIAL'
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id=v_tenant AND referencia_tipo='RMA_RECEPCION'
           AND metadata->>'rma_id'=v_rma::text) <> 1
     OR EXISTS (SELECT 1 FROM public.movimientos_inventario
         WHERE tenant_id=v_tenant AND referencia_tipo='RMA_RECEPCION'
           AND producto_id=v_service) THEN
    RAISE EXCEPTION 'VERIFY_456_PARTIAL_OR_SERVICE_RECEIPT_FAILED: %', v_result;
  END IF;
  SELECT public.recepcionar_rma_tx(v_tenant,v_approver,v_rma,
    jsonb_build_object('almacen_id',v_warehouse,'items',jsonb_build_array(
      jsonb_build_object('rma_item_id',v_item_stock_1,'cantidad_recibida',1),
      jsonb_build_object('rma_item_id',v_item_service,'cantidad_recibida',1))),
    'verify:456:receive:partial-1') INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id=v_tenant AND referencia_tipo='RMA_RECEPCION'
           AND metadata->>'rma_id'=v_rma::text) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_456_RECEIPT_RETRY_DUPLICATED_STOCK';
  END IF;

  SELECT public.recepcionar_rma_tx(v_tenant,v_approver,v_rma,
    jsonb_build_object('almacen_id',v_warehouse,'items',jsonb_build_array(
      jsonb_build_object('rma_item_id',v_item_stock_1,'cantidad_recibida',1),
      jsonb_build_object('rma_item_id',v_item_stock_2,'cantidad_recibida',1),
      jsonb_build_object('rma_item_id',v_item_no_stock,'cantidad_recibida',1))),
    'verify:456:receive:complete-1') INTO v_result;
  IF v_result->>'estado' <> 'RECIBIDA'
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id=v_tenant AND referencia_tipo='RMA_RECEPCION'
           AND metadata->>'rma_id'=v_rma::text) <> 3
     OR EXISTS (SELECT 1 FROM public.movimientos_inventario
         WHERE tenant_id=v_tenant AND referencia_tipo='RMA_RECEPCION'
           AND producto_id=v_no_stock)
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id=v_tenant AND producto_id=v_stock_product AND almacen_id=v_warehouse) <> 10 THEN
    RAISE EXCEPTION 'VERIFY_456_DOUBLE_SKU_OR_NO_STOCK_COMPLETE_FAILED: %', v_result;
  END IF;

  SELECT public.revertir_recepcion_rma_tx(v_tenant,v_approver,v_rma,
    'Inspeccion invalida','verify:456:reverse:receipt') INTO v_result;
  IF v_result->>'estado' <> 'APROBADA'
     OR jsonb_array_length(v_result->'movimientos_reversa') <> 3
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id=v_tenant AND producto_id=v_stock_product AND almacen_id=v_warehouse) <> 7
     OR EXISTS (SELECT 1 FROM public.rma_items
         WHERE tenant_id=v_tenant AND rma_id=v_rma AND cantidad_devuelta <> 0) THEN
    RAISE EXCEPTION 'VERIFY_456_RECEIPT_REVERSAL_FAILED: %', v_result;
  END IF;
  SELECT public.revertir_recepcion_rma_tx(v_tenant,v_approver,v_rma,
    'Inspeccion invalida','verify:456:reverse:receipt') INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id=v_tenant AND referencia_tipo='RMA_RECEPCION_REVERSA'
           AND metadata->>'rma_id'=v_rma::text) <> 3 THEN
    RAISE EXCEPTION 'VERIFY_456_REVERSAL_RETRY_DUPLICATED_STOCK';
  END IF;

  PERFORM public.recepcionar_rma_tx(v_tenant,v_approver,v_rma,
    jsonb_build_object('almacen_id',v_warehouse,'items',jsonb_build_array(
      jsonb_build_object('rma_item_id',v_item_stock_1,'cantidad_recibida',2),
      jsonb_build_object('rma_item_id',v_item_stock_2,'cantidad_recibida',1),
      jsonb_build_object('rma_item_id',v_item_service,'cantidad_recibida',1),
      jsonb_build_object('rma_item_id',v_item_no_stock,'cantidad_recibida',1))),
    'verify:456:receive:after-reversal');

  -- 448 se reutiliza sólo como guard contable. Mientras no exista el asiento
  -- original, la misma intención queda reintentable y no crea NC/CxC/saldo.
  v_failed := false;
  BEGIN
    PERFORM public.emitir_nota_credito_rma_tx(v_tenant,v_approver,v_rma,
      jsonb_build_object('motivo','Devolucion por items','tipo_nota_credito','07'),
      'verify:456:nc:main');
  EXCEPTION WHEN SQLSTATE '40001' THEN v_failed := true;
  END;
  IF NOT v_failed
     OR EXISTS (SELECT 1 FROM public.documentos
       WHERE tenant_id=v_tenant AND metadata->>'rma_id'=v_rma::text)
     OR EXISTS (SELECT 1 FROM public.rma_operaciones
       WHERE tenant_id=v_tenant AND idempotency_key='verify:456:nc:main') THEN
    RAISE EXCEPTION 'VERIFY_456_ORIGINAL_ACCOUNTING_GUARD_NOT_ATOMIC';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.emitir_nota_credito_rma_tx(v_tenant,v_approver,v_rma,
      jsonb_build_object('motivo','Devolucion por items','tipo_nota_credito','07',
        'serie','BC56'), 'verify:456:nc:incompatible-series');
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_456_INCOMPATIBLE_CREDIT_NOTE_SERIES_ACCEPTED';
  END IF;

  INSERT INTO public.asientos_contables (
    tenant_id, fecha, concepto, descripcion, referencia, total_debe,
    total_haber, estado, origen, source_event_id, usuario_id, created_by
  ) VALUES (
    v_tenant, now(), 'Venta original verify 456', 'Venta original verify 456',
    'F456-00000001', 483.80, 483.80, 'CONFIRMADO', 'VERIFY_456',
    v_source_event, v_creator, v_creator::text
  ) RETURNING id INTO v_original_asiento;
  INSERT INTO public.detalle_asientos (
    tenant_id, asiento_id, nombre, concepto, debe, haber
  ) VALUES
    (v_tenant,v_original_asiento,'Clientes','Clientes',483.80,0),
    (v_tenant,v_original_asiento,'Venta e IGV','Venta e IGV',0,483.80);

  PERFORM set_config('app.verify_456_fail_outbox','on',true);
  v_failed := false;
  BEGIN
    PERFORM public.emitir_nota_credito_rma_tx(v_tenant,v_approver,v_rma,
      jsonb_build_object('motivo','Devolucion por items','tipo_nota_credito','07'),
      'verify:456:nc:late-failure');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'VERIFY_456_LATE_OUTBOX_FAILURE' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  PERFORM set_config('app.verify_456_fail_outbox','off',true);
  IF NOT v_failed
     OR (SELECT estado FROM public.rma_solicitudes WHERE id=v_rma) <> 'RECIBIDA'
     OR EXISTS (SELECT 1 FROM public.documentos
         WHERE tenant_id=v_tenant AND metadata->>'idempotency_key'='verify:456:nc:late-failure')
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id=v_cxc) <> 100 THEN
    RAISE EXCEPTION 'VERIFY_456_NC_LATE_FAILURE_DID_NOT_ROLL_BACK';
  END IF;

  SELECT public.emitir_nota_credito_rma_tx(v_tenant,v_approver,v_rma,
    jsonb_build_object('motivo','Devolucion por items','tipo_nota_credito','07'),
    'verify:456:nc:main') INTO v_result;
  v_credit_note := (v_result->>'nota_credito_documento_id')::uuid;
  v_credit_note_cpe := (v_result->>'nota_credito_cpe_id')::uuid;
  v_saldo := (v_result->>'saldo_favor_id')::uuid;
  IF v_result->>'estado' <> 'CERRADA'
     OR (v_result->>'total')::numeric <> 365.80
     OR (v_result->>'cxc_reduction')::numeric <> 100
     OR (v_result->>'saldo_favor')::numeric <> 265.80
     OR (SELECT estado FROM public.documentos WHERE id=v_document) <> 'EMITIDO'
     OR (SELECT estado::text FROM public.cpe WHERE id=v_cpe) <> 'ACEPTADO'
     OR (SELECT nota_credito_id FROM public.cpe WHERE id=v_cpe) IS NOT NULL
     OR (SELECT tipo_documento FROM public.cpe WHERE id=v_credit_note_cpe) <> '07'
     OR (SELECT serie FROM public.cpe WHERE id=v_credit_note_cpe) <> 'FC56'
     OR (SELECT estado::text FROM public.cpe WHERE id=v_credit_note_cpe) <> 'BORRADOR'
     OR (SELECT count(*) FROM public.documento_detalles WHERE documento_id=v_credit_note) <> 4
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id=v_cxc) <> 0
     OR (SELECT monto_disponible FROM public.saldos_favor_clientes WHERE id=v_saldo) <> 265.80
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id=v_tenant AND event_type='nota_credito.emitida'
           AND aggregate_id=v_credit_note::text) <> 1
     OR (SELECT (payload->>'monto_pendiente')::numeric
         + (payload->>'customerCreditBalance')::numeric
         FROM public.outbox_events WHERE tenant_id=v_tenant
           AND event_type='nota_credito.emitida' AND aggregate_id=v_credit_note::text) <> 365.80
     OR (SELECT (payload->>'costo_ventas')::numeric
         FROM public.outbox_events WHERE tenant_id=v_tenant
           AND event_type='nota_credito.emitida' AND aggregate_id=v_credit_note::text) <> 30 THEN
    RAISE EXCEPTION 'VERIFY_456_NC_CPE_CXC_CREDIT_ACCOUNTING_FAILED: %', v_result;
  END IF;

  SELECT public.emitir_nota_credito_rma_tx(v_tenant,v_approver,v_rma,
    jsonb_build_object('motivo','Devolucion por items','tipo_nota_credito','07'),
    'verify:456:nc:main') INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (v_retry->>'nota_credito_documento_id')::uuid <> v_credit_note
     OR (SELECT count(*) FROM public.cpe
         WHERE tenant_id=v_tenant AND tipo_documento='07') <> 1
     OR (SELECT count(*) FROM public.cxc_pagos
         WHERE tenant_id=v_tenant AND source='rma.nota_credito.atomic') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_456_NC_RETRY_DUPLICATED_PROJECTIONS: %', v_retry;
  END IF;

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, cliente_id, created_by
  ) VALUES (
    v_tenant, 'FACTURA', 'F456', '00000002', 'EMITIDO', now(),
    now() + interval '30 days', 'PEN', 1, 80, 0, 80, 80, 0, 0, 0,
    v_cliente, v_creator
  ) RETURNING id INTO v_future_document;

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, estado, monto_total, monto_original,
    monto_pendiente, saldo, saldo_pendiente, total, fecha_emision,
    fecha_vencimiento, moneda, numero_documento, tipo_documento,
    idempotency_key, event_source, tipo_cambio_origen, metadata
  ) VALUES (
    v_tenant, v_cliente, v_future_document, 'PENDIENTE', 80, 80, 80, 80, 80, 80,
    current_date, current_date + 30, 'PEN', 'F456-FUTURA', 'FACTURA',
    'verify-456-future-cxc', 'verify.456', 1,
    jsonb_build_object('origen','verify_local')
  ) RETURNING id INTO v_future_cxc;

  SELECT public.aplicar_saldo_favor_cxc_tx(v_tenant,v_approver,v_saldo,
    v_future_cxc,60,'verify:456:credit:apply') INTO v_result;
  IF (v_result->>'saldo_disponible')::numeric <> 205.80
     OR (v_result->>'cxc_saldo_pendiente')::numeric <> 20
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id=v_tenant AND event_type='saldo_favor.aplicado') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_456_CUSTOMER_CREDIT_APPLICATION_FAILED: %', v_result;
  END IF;
  SELECT public.aplicar_saldo_favor_cxc_tx(v_tenant,v_approver,v_saldo,
    v_future_cxc,60,'verify:456:credit:apply') INTO v_retry;
  IF NOT (v_retry->>'idempotent')::boolean
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id=v_future_cxc) <> 20 THEN
    RAISE EXCEPTION 'VERIFY_456_CUSTOMER_CREDIT_APPLICATION_RETRY_FAILED';
  END IF;

  INSERT INTO public.cuentas_bancarias (
    tenant_id, nombre, codigo, banco, numero_cuenta, tipo_cuenta,
    moneda, saldo, saldo_actual, saldo_contable, activa, activo,
    estado, permite_sobregiro
  ) VALUES (
    v_tenant, 'Banco PEN 456', 'BANK-PEN-456', 'Banco local', '456-PEN',
    'CORRIENTE', 'PEN', 500, 500, 500, true, true, 'ACTIVO', false
  ) RETURNING id INTO v_bank;

  SELECT public.reembolsar_saldo_favor_tx(v_tenant,v_approver,v_saldo,
    jsonb_build_object('monto',25,'medio','BANCO','cuenta_bancaria_id',v_bank,
      'referencia','REF-456-BANK'), 'verify:456:credit:refund-bank') INTO v_result;
  IF (v_result->>'saldo_disponible')::numeric <> 180.80
     OR (SELECT saldo FROM public.cuentas_bancarias WHERE id=v_bank) <> 475
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id=v_tenant AND event_type='saldo_favor.reembolsado') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_456_CUSTOMER_CREDIT_BANK_REFUND_FAILED: %', v_result;
  END IF;

  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (
    v_tenant, 'CAJA-456', 'Caja verify 456', 'ACTIVO', v_warehouse,
    'MOSTRADOR', v_approver
  ) RETURNING id INTO v_cashbox;
  INSERT INTO public.sesiones_caja (
    tenant_id, caja_id, cajero_id, usuario_id, abierto_por,
    usuario_apertura, estado, hora_apertura, fecha_apertura,
    monto_inicial, monto_inicio, monto_esperado, monto_contado,
    monto_cierre, total_efectivo, total_tarjeta, moneda
  ) VALUES (
    v_tenant, v_cashbox, v_approver, v_approver, v_approver, v_approver,
    'ABIERTA', now(), now(), 500, 500, 500, 0, 0, 0, 0, 'PEN'
  ) RETURNING id INTO v_session;

  SELECT public.reembolsar_saldo_favor_tx(v_tenant,v_approver,v_saldo,
    jsonb_build_object('monto',20,'medio','CAJA','sesion_caja_id',v_session),
    'verify:456:credit:refund-cash') INTO v_result;
  IF (v_result->>'saldo_disponible')::numeric <> 160.80
     OR (v_result->>'movimiento_caja_id') IS NULL
     OR (SELECT count(*) FROM public.saldos_favor_movimientos
         WHERE tenant_id=v_tenant AND saldo_favor_id=v_saldo) <> 4
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id=v_tenant AND event_type='saldo_favor.reembolsado') <> 2 THEN
    RAISE EXCEPTION 'VERIFY_456_CUSTOMER_CREDIT_CASH_REFUND_FAILED: %', v_result;
  END IF;

  -- Superficie publica cerrada: el navegador nunca escribe tablas ni invoca RPC.
  SELECT count(*) INTO v_count
  FROM (VALUES
    ('public.crear_rma_tx(uuid,uuid,jsonb,text)'::regprocedure),
    ('public.decidir_rma_tx(uuid,uuid,uuid,boolean,text,text)'::regprocedure),
    ('public.recepcionar_rma_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure),
    ('public.revertir_recepcion_rma_tx(uuid,uuid,uuid,text,text)'::regprocedure),
    ('public.emitir_nota_credito_rma_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure),
    ('public.aplicar_saldo_favor_cxc_tx(uuid,uuid,uuid,uuid,numeric,text)'::regprocedure),
    ('public.reembolsar_saldo_favor_tx(uuid,uuid,uuid,jsonb,text)'::regprocedure)
  ) AS f(oid)
  WHERE has_function_privilege('service_role', oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', oid, 'EXECUTE');
  IF v_count <> 7
     OR has_table_privilege('authenticated','public.rma_solicitudes','INSERT')
     OR has_table_privilege('authenticated','public.rma_items','UPDATE')
     OR has_table_privilege('authenticated','public.saldos_favor_clientes','UPDATE')
     OR has_table_privilege('anon','public.saldos_favor_movimientos','INSERT') THEN
    RAISE EXCEPTION 'VERIFY_456_SERVICE_ROLE_ONLY_ACL_FAILED';
  END IF;
END;
$$;

ROLLBACK;
