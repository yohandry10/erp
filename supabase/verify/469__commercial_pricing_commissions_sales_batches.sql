\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_469_SOLO_ERP_E2E:%', current_database();
  END IF;
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_469_REQUIERE_POSTGRESQL_16';
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

DO $catalog$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'listas_precios_venta','lista_precios_venta_detalles',
    'reglas_comisiones_venta','comisiones_venta_movimientos',
    'ventas_consolidados','ventas_consolidado_detalles','operaciones_comerciales_469'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table
        AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'VERIFY_469_RLS_FORCE_MISSING:%', v_table;
    END IF;
    IF NOT has_table_privilege('service_role', format('public.%I', v_table), 'SELECT')
       OR has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('service_role', format('public.%I', v_table), 'DELETE') THEN
      RAISE EXCEPTION 'VERIFY_469_SERVICE_ROLE_TABLE_ACL_INVALID:%', v_table;
    END IF;
  END LOOP;

  IF has_function_privilege('anon',
       'public.registrar_lista_precios_venta_tx(uuid,uuid,text,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.registrar_lista_precios_venta_tx(uuid,uuid,text,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.registrar_regla_comision_venta_tx(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.reintentar_venta_pos_comercial_tx(uuid,uuid,text,jsonb,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.reintentar_venta_pos_comercial_tx(uuid,uuid,text,jsonb,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_469_RPC_ACL_INVALID';
  END IF;

  IF has_function_privilege('service_role',
       'app.devengar_comision_linea_469(uuid,text,uuid,uuid,uuid,uuid,numeric,text,date)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'app.revertir_comisiones_fuente_469(uuid,text,uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_469_INTERNAL_HELPER_ACL_INVALID';
  END IF;

  IF position('es_precio_pos_comercial_valido_469' IN pg_get_functiondef(
       'app.pos_registrar_venta_atomic_tx_451(uuid,uuid,uuid,text,jsonb)'::regprocedure)) = 0
     OR position($fragment$'marca', NULLIF(btrim(COALESCE(p_payload->>'marca', '')), '')$fragment$ IN pg_get_functiondef(
       'public.crear_producto_maestro_tx(uuid,uuid,text,jsonb)'::regprocedure)) = 0
     OR position($fragment$marca = CASE WHEN p_cambios ? 'marca'$fragment$ IN pg_get_functiondef(
       'public.actualizar_producto_maestro_tx(uuid,uuid,uuid,text,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'VERIFY_469_CANONICAL_WRITER_HOOK_MISSING';
  END IF;

  IF position('FOR UPDATE' IN pg_get_functiondef(
       'app.revertir_comision_parcial_469(uuid,uuid,uuid,uuid,numeric,text)'::regprocedure)) = 0
     OR position('FOR UPDATE' IN pg_get_functiondef(
       'app.revertir_comisiones_fuente_469(uuid,text,uuid,text,uuid)'::regprocedure)) = 0
     OR position('FOR UPDATE' IN pg_get_functiondef(
       'app.reintegrar_comisiones_por_trigger_469(uuid,text,uuid,text,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'VERIFY_469_COMMISSION_CONCURRENCY_LOCK_MISSING';
  END IF;

  IF has_table_privilege('authenticated', 'public.operaciones_comerciales_469', 'SELECT')
     OR has_table_privilege('authenticated', 'public.comisiones_venta_movimientos', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.comisiones_venta_movimientos', 'SELECT') THEN
    RAISE EXCEPTION 'VERIFY_469_TABLE_ACL_INVALID';
  END IF;
END;
$catalog$;

DO $verify$
DECLARE
  v_demo jsonb;
  v_other_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_other_tenant uuid;
  v_other_actor uuid;
  v_cliente uuid;
  v_almacen uuid;
  v_caja uuid;
  v_sesion uuid;
  v_producto uuid;
  v_categoria jsonb;
  v_producto_alta jsonb;
  v_hoy date;
  v_brand_list jsonb;
  v_specific_list jsonb;
  v_usd_list jsonb;
  v_retry jsonb;
  v_resolved jsonb;
  v_pos_intencion jsonb;
  v_pos_sale jsonb;
  v_pos_retry jsonb;
  v_quote jsonb;
  v_quote_id uuid;
  v_order jsonb;
  v_order_id uuid;
  v_direct_order jsonb;
  v_direct_order_id uuid;
  v_brand_doc uuid;
  v_standalone_doc uuid;
  v_doc uuid;
  v_doc_line uuid;
  v_nc uuid;
  v_nc2 uuid;
  v_discount_doc uuid;
  v_pos uuid;
  v_draft_pos uuid;
  v_sources jsonb := '[]'::jsonb;
  v_batch jsonb;
  v_batch_retry jsonb;
  v_discount_batch jsonb;
  v_candidates jsonb;
  v_failed boolean;
  v_outbox_before bigint;
  v_outbox_after bigint;
  i integer;
BEGIN
  v_demo := public.create_demo_tenant('VERIFY COMMERCIAL 469', 1, 'PE');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  v_other_demo := public.create_demo_tenant('VERIFY COMMERCIAL OTHER 469', 1, 'PE');
  v_other_tenant := (v_other_demo->>'tenant_id')::uuid;
  v_other_actor := (v_other_demo->>'user_id')::uuid;
  v_hoy := app.hoy_tenant(v_tenant);

  IF NOT EXISTS (SELECT 1 FROM public.usuarios u
      WHERE u.id = v_actor AND u.tenant_id = v_tenant AND u.activo) THEN
    RAISE EXCEPTION 'VERIFY_469_DEMO_ACTOR_NOT_RUNTIME_USER';
  END IF;

  INSERT INTO public.clientes(
    tenant_id,codigo,nombre,razon_social,documento_tipo,ruc,activo
  ) VALUES (
    v_tenant,'CLI-469','Cliente 469','Cliente 469 S.A.C.','RUC','20600900469',true
  ) RETURNING id INTO v_cliente;

  INSERT INTO public.almacenes(
    tenant_id,codigo,nombre,estado,activo,es_principal,pais
  ) VALUES (
    v_tenant,'ALM-469','Almacén 469','ACTIVO',true,true,'PE'
  ) RETURNING id INTO v_almacen;

  v_categoria := public.crear_categoria_producto_maestro_tx(
    v_tenant,v_actor,'verify-469-category-brand',
    jsonb_build_object('codigo','CAT-469','nombre','Categoría Comercial 469')
  );
  v_producto_alta := public.crear_producto_maestro_tx(
    v_tenant,v_actor,'verify-469-product-brand-create',
    jsonb_build_object(
      'codigo','PROD-469','nombre','Producto Comercial 469','categoria','CAT-469',
      'marca','MARCA-ALTA-469','precio_venta',120,'precio_compra',50,
      'afectacion_igv','10','almacen_id',v_almacen,'stock_inicial',100
    )
  );
  v_producto := (v_producto_alta->>'id')::uuid;
  IF v_producto_alta->>'marca' <> 'MARCA-ALTA-469'
     OR (SELECT marca FROM public.productos WHERE id=v_producto) <> 'MARCA-ALTA-469' THEN
    RAISE EXCEPTION 'VERIFY_469_PRODUCT_BRAND_CREATE_NOT_PERSISTED:%',v_producto_alta;
  END IF;
  v_retry := public.actualizar_producto_maestro_tx(
    v_tenant,v_actor,v_producto,'verify-469-product-brand-update',
    jsonb_build_object('marca','MARCA-469')
  );
  IF v_retry->>'marca' <> 'MARCA-469'
     OR (SELECT marca FROM public.productos WHERE id=v_producto) <> 'MARCA-469' THEN
    RAISE EXCEPTION 'VERIFY_469_PRODUCT_BRAND_UPDATE_NOT_PERSISTED:%',v_retry;
  END IF;

  UPDATE public.empresa_config
  SET ruc='20600900469',razon_social='Empresa Comercial 469',moneda_defecto='PEN',
      igv_porcentaje=18,requiere_aprobacion_descuento=false
  WHERE tenant_id=v_tenant;
  INSERT INTO public.cajas(tenant_id,codigo,nombre,estado,almacen_id,tipo,creado_por)
  VALUES(v_tenant,'CAJA-469','Caja Comercial 469','ACTIVO',v_almacen,'MOSTRADOR',v_actor)
  RETURNING id INTO v_caja;
  v_retry := public.abrir_caja_tx(v_tenant,v_caja,v_actor,jsonb_build_object(
    'cajero_id',v_actor,'monto_inicio',100,'moneda','PEN','dispositivo','TERM-469'));
  v_sesion := (v_retry->>'id')::uuid;
  IF v_sesion IS NULL THEN RAISE EXCEPTION 'VERIFY_469_CASH_SESSION_NOT_OPENED'; END IF;

  v_brand_list := public.registrar_lista_precios_venta_tx(
    v_tenant,v_actor,'verify-469-price-brand',
    jsonb_build_object(
      'codigo','MARCA469','nombre','Lista por marca PEN','moneda','PEN',
      'prioridad',500,'vigencia_desde',v_hoy-1
    ),
    jsonb_build_array(jsonb_build_object(
      'marca','MARCA-469','cantidad_minima',1,'precio_unitario',90
    ))
  );
  v_specific_list := public.registrar_lista_precios_venta_tx(
    v_tenant,v_actor,'verify-469-price-specific',
    jsonb_build_object(
      'codigo','ESP469','nombre','Lista vendedor cliente producto','moneda','PEN',
      'prioridad',1,'vendedor_id',v_actor,'cliente_id',v_cliente,
      'vigencia_desde',v_hoy-1
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto,'cantidad_minima',1,'precio_unitario',70
    ))
  );
  v_usd_list := public.registrar_lista_precios_venta_tx(
    v_tenant,v_actor,'verify-469-price-usd',
    jsonb_build_object(
      'codigo','USD469','nombre','Lista exacta USD','moneda','USD',
      'prioridad',9999,'vendedor_id',v_actor,'cliente_id',v_cliente,
      'vigencia_desde',v_hoy-1
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto,'cantidad_minima',1,'precio_unitario',1
    ))
  );

  v_retry := public.registrar_lista_precios_venta_tx(
    v_tenant,v_actor,'verify-469-price-specific',
    jsonb_build_object(
      'codigo','ESP469','nombre','Lista vendedor cliente producto','moneda','PEN',
      'prioridad',1,'vendedor_id',v_actor,'cliente_id',v_cliente,
      'vigencia_desde',v_hoy-1
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto,'cantidad_minima',1,'precio_unitario',70
    ))
  );
  IF v_retry#>>'{lista,id}' IS DISTINCT FROM v_specific_list#>>'{lista,id}'
     OR coalesce((v_retry->>'idempotent')::boolean,false) IS NOT TRUE
     OR (SELECT count(*) FROM public.listas_precios_venta WHERE tenant_id=v_tenant) <> 3 THEN
    RAISE EXCEPTION 'VERIFY_469_PRICE_LIST_RETRY_DUPLICATED';
  END IF;

  v_resolved := public.resolver_precios_venta_tx(
    v_tenant,v_actor,v_cliente,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto,'cantidad',2,'precio_unitario',999
    )),v_hoy,'PEN'
  );
  IF (v_resolved#>>'{0,precio_unitario}')::numeric <> 70
     OR v_resolved#>>'{0,precio_regla_snapshot,lista_id}' IS DISTINCT FROM v_specific_list#>>'{lista,id}'
     OR v_resolved#>>'{0,precio_regla_snapshot,moneda}' <> 'PEN' THEN
    RAISE EXCEPTION 'VERIFY_469_PRICE_PRECEDENCE_OR_CURRENCY_INVALID:%', v_resolved;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.resolver_precios_venta_tx(
      v_tenant,v_actor,v_cliente,
      jsonb_build_array(
        jsonb_build_object('producto_id',v_producto,'cantidad',1,'precio_unitario',70),
        jsonb_build_object('producto_id',v_producto,'cantidad',1,'precio_unitario',70)
      ),v_hoy,'PEN'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_failed := SQLERRM LIKE '%DUPLICATE_PRODUCT_LINE%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_469_AMBIGUOUS_DUPLICATE_PRODUCT_ACCEPTED'; END IF;

  v_resolved := public.resolver_precios_venta_tx(
    v_tenant,v_actor,v_cliente,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto,'cantidad',2,'precio_unitario',120,
      'descuento_monto',0,'subtotal',140,'igv',25.2
    )),v_hoy,'PEN'
  );
  v_pos_intencion := jsonb_build_object(
    'cliente_id',v_cliente,'cliente_documento','20600900469',
    'cliente_nombre','Cliente 469','moneda','PEN','emitir_cpe',true,
    'comprobante',jsonb_build_object('tipo','03','serie','B001'),
    'metodo_pago','efectivo',
    'items',jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto,'cantidad',2,'precio_unitario',120
    ))
  );
  v_pos_sale := public.pos_registrar_venta_comercial_tx(
    v_tenant,v_actor,v_sesion,'verify-469-pos-commercial-price',
    jsonb_build_object(
      'emitir_cpe',true,'commercial_request',v_pos_intencion,
      'cliente_id',v_cliente,'cliente_documento','20600900469',
      'cliente_nombre','Cliente 469','moneda','PEN','ticket_serie','T001',
      'items',jsonb_build_array((v_resolved->0) || jsonb_build_object(
        'descuento_monto',0,'subtotal',140,'igv',25.2)),
      'pagos',jsonb_build_array(jsonb_build_object(
        'codigo','efectivo','monto',165.2,'moneda','PEN')),
      'cpe_data',jsonb_build_object(
        'tipo_documento','03','serie','B001','ruc_emisor','20600900469',
        'razon_social_emisor','Empresa Comercial 469','tipo_documento_receptor','6',
        'documento_receptor','20600900469','razon_social_receptor','Cliente 469',
        'moneda','PEN','total_gravadas',140,'total_exoneradas',0,
        'total_inafectas',0,'total_igv',25.2,'total_venta',165.2)
    )
  );
  IF (v_pos_sale->>'total')::numeric <> 165.2
     OR (SELECT precio_unitario FROM public.detalle_ventas_pos
         WHERE venta_pos_id=(v_pos_sale->>'venta_id')::uuid) <> 70
     OR (SELECT lista_precio_id FROM public.detalle_ventas_pos
         WHERE venta_pos_id=(v_pos_sale->>'venta_id')::uuid)
        IS DISTINCT FROM (v_specific_list#>>'{lista,id}')::uuid THEN
    RAISE EXCEPTION 'VERIFY_469_FISCAL_POS_DID_NOT_ACCEPT_VERIFIED_LIST_PRICE:%',v_pos_sale;
  END IF;

  v_quote := public.crear_cotizacion_comercial_tx(
    v_tenant,v_actor,v_cliente,v_hoy+7,'Precio congelado','Vendedor 469','PEN',
    1998,359.64,2357.64,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto,'descripcion','Producto cotizado','cantidad',2,
      'precio_unitario',999,'orden',1
    ))
  );
  v_quote_id := (v_quote#>>'{cotizacion,id}')::uuid;
  IF (SELECT precio_unitario FROM public.cotizacion_detalles WHERE cotizacion_id=v_quote_id) <> 70
     OR (SELECT subtotal FROM public.cotizaciones WHERE id=v_quote_id) <> 140
     OR (SELECT lista_precio_id FROM public.cotizacion_detalles WHERE cotizacion_id=v_quote_id)
        IS DISTINCT FROM (v_specific_list#>>'{lista,id}')::uuid THEN
    RAISE EXCEPTION 'VERIFY_469_QUOTE_PRICE_SNAPSHOT_MISSING:%', v_quote;
  END IF;

  v_retry := public.cambiar_estado_regla_comercial_tx(
    v_tenant,v_actor,'LISTA_PRECIOS',(v_specific_list#>>'{lista,id}')::uuid,false,
    'verify-469-disable-specific'
  );
  IF (v_retry#>>'{registro,activo}')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'VERIFY_469_PRICE_LIST_DISABLE_FAILED';
  END IF;
  IF coalesce((public.cambiar_estado_regla_comercial_tx(
      v_tenant,v_actor,'LISTA_PRECIOS',(v_specific_list#>>'{lista,id}')::uuid,false,
      'verify-469-disable-specific')->>'idempotent')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_469_STATUS_RETRY_NOT_IDEMPOTENT';
  END IF;

  v_pos_retry := public.reintentar_venta_pos_comercial_tx(
    v_tenant,v_actor,'verify-469-pos-commercial-price',v_pos_intencion,v_sesion);
  IF v_pos_retry->>'venta_id' IS DISTINCT FROM v_pos_sale->>'venta_id'
     OR coalesce((v_pos_retry->>'idempotent')::boolean,false) IS NOT TRUE
     OR (SELECT count(*) FROM public.ventas_pos
         WHERE tenant_id=v_tenant AND idempotency_key='verify-469-pos-commercial-price') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_469_POS_RETRY_AFTER_PRICE_LIST_CHANGE_INVALID:%',v_pos_retry;
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.reintentar_venta_pos_comercial_tx(
      v_tenant,v_actor,'verify-469-pos-commercial-price',
      v_pos_intencion || jsonb_build_object('metodo_pago_id','otro-medio'),v_sesion);
  EXCEPTION WHEN unique_violation THEN
    v_failed := SQLERRM LIKE '%IDEMPOTENCY_PAYLOAD_MISMATCH%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_469_POS_RETRY_ACCEPTED_DIFFERENT_PAYMENT_INTENT';
  END IF;

  v_resolved := public.resolver_precios_venta_tx(
    v_tenant,v_actor,v_cliente,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto,'cantidad',2,'precio_unitario',999
    )),v_hoy,'PEN'
  );
  IF (v_resolved#>>'{0,precio_unitario}')::numeric <> 90
     OR v_resolved#>>'{0,precio_regla_snapshot,lista_id}' IS DISTINCT FROM v_brand_list#>>'{lista,id}' THEN
    RAISE EXCEPTION 'VERIFY_469_INACTIVE_RULE_STILL_SELECTED:%', v_resolved;
  END IF;
  v_resolved := public.resolver_precios_venta_tx(
    v_tenant,v_actor,v_cliente,
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto,'cantidad',1,'precio_unitario',999
    )),v_hoy,'USD'
  );
  IF (v_resolved#>>'{0,precio_unitario}')::numeric <> 1
     OR v_resolved#>>'{0,precio_regla_snapshot,lista_id}' IS DISTINCT FROM v_usd_list#>>'{lista,id}' THEN
    RAISE EXCEPTION 'VERIFY_469_CURRENCY_SPECIFIC_RULE_NOT_SELECTED:%', v_resolved;
  END IF;

  v_order := public.convertir_cotizacion_comercial_a_pedido_tx(
    v_quote_id,v_tenant,v_actor,'Pedido desde cotización congelada'
  );
  v_order_id := (v_order->>'pedido_id')::uuid;
  IF (SELECT precio_unitario FROM public.pedidos_venta_detalle WHERE pedido_id=v_order_id) <> 70
     OR (SELECT lista_precio_id FROM public.pedidos_venta_detalle WHERE pedido_id=v_order_id)
       IS DISTINCT FROM (v_specific_list#>>'{lista,id}')::uuid
     OR coalesce((v_order->>'pricing_snapshot_inherited')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_469_QUOTE_TO_ORDER_REPRICED_HISTORY:%', v_order;
  END IF;

  v_direct_order := public.crear_pedido_comercial_tx(
    jsonb_build_object(
      'tenant_id',v_tenant,'cliente_id',v_cliente,'created_by',v_actor,
      'moneda','PEN','observaciones','Pedido directo 469'
    ),
    jsonb_build_array(jsonb_build_object(
      'producto_id',v_producto,'descripcion','Producto directo','cantidad',1,'precio_unitario',999
    ))
  );
  v_direct_order_id := (v_direct_order->>'pedido_id')::uuid;
  IF (SELECT precio_unitario FROM public.pedidos_venta_detalle WHERE pedido_id=v_direct_order_id) <> 90
     OR (SELECT lista_precio_id FROM public.pedidos_venta_detalle WHERE pedido_id=v_direct_order_id)
       IS DISTINCT FROM (v_brand_list#>>'{lista,id}')::uuid THEN
    RAISE EXCEPTION 'VERIFY_469_DIRECT_ORDER_DID_NOT_USE_CURRENT_RULE:%', v_direct_order;
  END IF;

  PERFORM public.registrar_regla_comision_venta_tx(
    v_tenant,v_actor,'verify-469-commission-brand',
    jsonb_build_object(
      'codigo','COM-MARCA-469','nombre','Comisión marca','marca','MARCA-469',
      'porcentaje',2,'prioridad',500,'vigencia_desde',v_hoy-1
    )
  );

  v_retry := public.actualizar_producto_maestro_tx(
    v_tenant,v_actor,v_producto,'verify-469-product-brand-after-order',
    jsonb_build_object('marca','MARCA-MUTADA-469')
  );
  INSERT INTO public.documentos(
    tenant_id,tipo_documento,serie,numero,fecha_emision,moneda,tipo_cambio,
    subtotal,descuentos,impuesto_igv,impuesto_isc,otros_impuestos,total,
    estado,pedido_id,cliente_id,created_by
  ) VALUES (
    v_tenant,'BOLETA','B469','00000999',now(),'PEN',1,
    100,0,18,0,0,118,'EMITIDO',v_direct_order_id,v_cliente,v_actor
  ) RETURNING id INTO v_brand_doc;
  INSERT INTO public.documento_detalles(
    tenant_id,documento_id,orden,producto_id,descripcion,unidad_medida,
    cantidad,precio_unitario,descuento_unitario,valor_venta,impuesto_igv,
    impuesto_isc,total_item
  ) VALUES (
    v_tenant,v_brand_doc,1,v_producto,'Comisión por marca histórica','NIU',
    1,100,0,100,18,0,118
  );
  IF (SELECT count(*) FROM public.comisiones_venta_movimientos
      WHERE tenant_id=v_tenant AND source_id=v_brand_doc AND tipo='DEVENGO') <> 1
     OR (SELECT monto FROM public.comisiones_venta_movimientos
         WHERE tenant_id=v_tenant AND source_id=v_brand_doc AND tipo='DEVENGO') <> 2
     OR (SELECT marca FROM public.comisiones_venta_movimientos
         WHERE tenant_id=v_tenant AND source_id=v_brand_doc AND tipo='DEVENGO') <> 'MARCA-469'
     OR (SELECT snapshot->>'marca_origen' FROM public.comisiones_venta_movimientos
         WHERE tenant_id=v_tenant AND source_id=v_brand_doc AND tipo='DEVENGO') <> 'SNAPSHOT_VENTA' THEN
    RAISE EXCEPTION 'VERIFY_469_BRAND_COMMISSION_DID_NOT_USE_SALE_SNAPSHOT';
  END IF;
  UPDATE public.documentos SET estado='ANULADO' WHERE id=v_brand_doc;
  IF (SELECT round(coalesce(sum(monto),0),2) FROM public.comisiones_venta_movimientos
      WHERE tenant_id=v_tenant AND source_id=v_brand_doc) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_469_BRAND_COMMISSION_CANCELLATION_NOT_REVERSED';
  END IF;

  PERFORM public.registrar_regla_comision_venta_tx(
    v_tenant,v_actor,'verify-469-commission-product',
    jsonb_build_object(
      'codigo','COM-PROD-469','nombre','Comisión vendedor producto','vendedor_id',v_actor,
      'producto_id',v_producto,'porcentaje',5,'prioridad',1,'vigencia_desde',v_hoy-1
    )
  );

  -- Una factura válida creada sin pedido también tiene vendedor canónico
  -- (`documentos.created_by`) y debe devengar/revertir sin depender de una
  -- cabecera de pedido inexistente.
  INSERT INTO public.documentos(
    tenant_id,tipo_documento,serie,numero,fecha_emision,moneda,tipo_cambio,
    subtotal,descuentos,impuesto_igv,impuesto_isc,otros_impuestos,total,
    estado,cliente_id,created_by
  ) VALUES (
    v_tenant,'FACTURA','F469','00000003',now(),'PEN',1,
    100,0,18,0,0,118,'EMITIDO',v_cliente,v_actor
  ) RETURNING id INTO v_standalone_doc;
  INSERT INTO public.documento_detalles(
    tenant_id,documento_id,orden,producto_id,descripcion,unidad_medida,
    cantidad,precio_unitario,descuento_unitario,valor_venta,impuesto_igv,
    impuesto_isc,total_item
  ) VALUES (
    v_tenant,v_standalone_doc,1,v_producto,'Factura directa','NIU',
    1,100,0,100,18,0,118
  );
  IF (SELECT count(*) FROM public.comisiones_venta_movimientos
      WHERE tenant_id=v_tenant AND source_id=v_standalone_doc AND tipo='DEVENGO') <> 1
     OR (SELECT sum(monto) FROM public.comisiones_venta_movimientos
         WHERE tenant_id=v_tenant AND source_id=v_standalone_doc) <> 5 THEN
    RAISE EXCEPTION 'VERIFY_469_STANDALONE_INVOICE_COMMISSION_NOT_ACCRUED';
  END IF;
  UPDATE public.documentos SET estado='ANULADO' WHERE id=v_standalone_doc;
  IF (SELECT round(coalesce(sum(monto),0),2) FROM public.comisiones_venta_movimientos
      WHERE tenant_id=v_tenant AND source_id=v_standalone_doc) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_469_STANDALONE_INVOICE_COMMISSION_NOT_REVERSED';
  END IF;

  INSERT INTO public.documentos(
    tenant_id,tipo_documento,serie,numero,fecha_emision,moneda,tipo_cambio,
    subtotal,descuentos,impuesto_igv,impuesto_isc,otros_impuestos,total,
    estado,pedido_id,cliente_id,created_by
  ) VALUES (
    v_tenant,'FACTURA','F469','00000001',now(),'PEN',1,
    100,0,18,0,0,118,'BORRADOR',v_direct_order_id,v_cliente,v_actor
  ) RETURNING id INTO v_doc;
  INSERT INTO public.documento_detalles(
    tenant_id,documento_id,orden,producto_id,descripcion,unidad_medida,
    cantidad,precio_unitario,descuento_unitario,valor_venta,impuesto_igv,
    impuesto_isc,total_item
  ) VALUES (
    v_tenant,v_doc,1,v_producto,'Producto factura','NIU',1,100,0,100,18,0,118
  ) RETURNING id INTO v_doc_line;
  IF EXISTS (SELECT 1 FROM public.comisiones_venta_movimientos WHERE source_id=v_doc) THEN
    RAISE EXCEPTION 'VERIFY_469_DRAFT_DOCUMENT_ACCRUED_COMMISSION';
  END IF;
  UPDATE public.documentos SET estado='EMITIDO' WHERE id=v_doc;
  IF (SELECT count(*) FROM public.comisiones_venta_movimientos
      WHERE tenant_id=v_tenant AND source_id=v_doc AND tipo='DEVENGO') <> 1
     OR (SELECT sum(monto) FROM public.comisiones_venta_movimientos
         WHERE tenant_id=v_tenant AND source_id=v_doc) <> 5 THEN
    RAISE EXCEPTION 'VERIFY_469_VALID_DOCUMENT_COMMISSION_NOT_ACCRUED';
  END IF;

  INSERT INTO public.documentos(
    tenant_id,tipo_documento,serie,numero,fecha_emision,moneda,tipo_cambio,
    subtotal,descuentos,impuesto_igv,impuesto_isc,otros_impuestos,total,
    estado,cliente_id,created_by
  ) VALUES (
    v_tenant,'NOTA_CREDITO','FC69','00000001',now(),'PEN',1,
    40,0,7.2,0,0,47.2,'BORRADOR',v_cliente,v_actor
  ) RETURNING id INTO v_nc;
  INSERT INTO public.documento_detalles(
    tenant_id,documento_id,orden,producto_id,descripcion,unidad_medida,
    cantidad,precio_unitario,descuento_unitario,valor_venta,impuesto_igv,
    impuesto_isc,total_item,metadata
  ) VALUES (
    v_tenant,v_nc,1,v_producto,'NC parcial','NIU',1,40,0,40,7.2,0,47.2,
    jsonb_build_object('source_document_line_id',v_doc_line)
  );
  IF (SELECT sum(monto) FROM public.comisiones_venta_movimientos
      WHERE tenant_id=v_tenant AND source_id=v_doc) <> 5 THEN
    RAISE EXCEPTION 'VERIFY_469_DRAFT_CREDIT_NOTE_REVERSED_COMMISSION';
  END IF;
  UPDATE public.documentos SET estado='EMITIDO' WHERE id=v_nc;
  IF (SELECT sum(monto) FROM public.comisiones_venta_movimientos
      WHERE tenant_id=v_tenant AND source_id=v_doc) <> 3 THEN
    RAISE EXCEPTION 'VERIFY_469_CREDIT_NOTE_DID_NOT_REVERSE_PARTIAL_COMMISSION';
  END IF;
  UPDATE public.documentos SET estado='ANULADO' WHERE id=v_nc;
  IF (SELECT sum(monto) FROM public.comisiones_venta_movimientos
      WHERE tenant_id=v_tenant AND source_id=v_doc) <> 5
     OR NOT EXISTS (SELECT 1 FROM public.comisiones_venta_movimientos
       WHERE tenant_id=v_tenant AND source_id=v_doc AND tipo='REINTEGRO' AND trigger_id=v_nc) THEN
    RAISE EXCEPTION 'VERIFY_469_CREDIT_NOTE_CANCELLATION_DID_NOT_REINSTATE_COMMISSION';
  END IF;

  INSERT INTO public.documentos(
    tenant_id,tipo_documento,serie,numero,fecha_emision,moneda,tipo_cambio,
    subtotal,descuentos,impuesto_igv,impuesto_isc,otros_impuestos,total,
    estado,cliente_id,created_by
  ) VALUES (
    v_tenant,'NOTA_CREDITO','FC69','00000002',now(),'PEN',1,
    40,0,7.2,0,0,47.2,'EMITIDO',v_cliente,v_actor
  ) RETURNING id INTO v_nc2;
  INSERT INTO public.documento_detalles(
    tenant_id,documento_id,orden,producto_id,descripcion,unidad_medida,
    cantidad,precio_unitario,descuento_unitario,valor_venta,impuesto_igv,
    impuesto_isc,total_item,metadata
  ) VALUES (
    v_tenant,v_nc2,1,v_producto,'NC parcial activa','NIU',1,40,0,40,7.2,0,47.2,
    jsonb_build_object('source_document_line_id',v_doc_line)
  );
  UPDATE public.documentos SET estado='ANULADO' WHERE id=v_doc;
  UPDATE public.documentos SET estado='ANULADO' WHERE id=v_doc;
  IF (SELECT round(coalesce(sum(monto),0),2) FROM public.comisiones_venta_movimientos
      WHERE tenant_id=v_tenant AND source_id=v_doc) <> 0
     OR (SELECT count(*) FROM public.comisiones_venta_movimientos
         WHERE tenant_id=v_tenant AND source_id=v_doc AND trigger_type='ANULACION_DOCUMENTO') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_469_DOCUMENT_CANCELLATION_NOT_NET_ZERO_OR_NOT_IDEMPOTENT';
  END IF;

  v_failed := false;
  BEGIN
    UPDATE public.comisiones_venta_movimientos SET monto=999
    WHERE tenant_id=v_tenant AND source_id=v_doc;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_failed := SQLERRM LIKE '%LEDGER_IMMUTABLE%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_469_COMMISSION_LEDGER_MUTABLE'; END IF;

  FOR i IN 1..10 LOOP
    INSERT INTO public.ventas_pos(
      tenant_id,numero_ticket,numero_venta,serie,correlativo,fecha,estado,
      cliente_id,cliente_documento,cliente_nombre,usuario_id,moneda,
      subtotal,impuestos,total,idempotency_key
    ) VALUES (
      v_tenant,'T469-'||lpad(i::text,8,'0'),469000+i,'T469',lpad(i::text,8,'0'),
      now()-(i||' minutes')::interval,'PAGADA',v_cliente,'20600900469','Cliente 469',
      v_actor,'PEN',10,1.8,11.8,'verify-469-pos-'||i
    ) RETURNING id INTO v_pos;
    INSERT INTO public.detalle_ventas_pos(
      tenant_id,venta_id,venta_pos_id,item_index,producto_id,cantidad,
      precio_unitario,descuento,impuesto,subtotal,total,nombre_producto,
      codigo_producto,unidad_medida,es_servicio,controla_stock,costo_unitario,afectacion_igv
    ) VALUES (
      v_tenant,v_pos,v_pos,1,v_producto,1,10,0,1.8,10,11.8,
      'Producto Comercial 469','PROD-469','NIU',false,true,5,'10'
    );
    v_sources := v_sources || jsonb_build_array(jsonb_build_object('tipo','POS','id',v_pos));
  END LOOP;

  INSERT INTO public.ventas_pos(
    tenant_id,numero_ticket,numero_venta,serie,correlativo,fecha,estado,
    cliente_id,cliente_documento,cliente_nombre,usuario_id,moneda,
    subtotal,impuestos,total,idempotency_key
  ) VALUES (
    v_tenant,'T469-99999999',469999,'T469','99999999',now(),'BORRADOR',
    v_cliente,'20600900469','Cliente 469',v_actor,'PEN',10,1.8,11.8,'verify-469-pos-draft'
  ) RETURNING id INTO v_draft_pos;
  INSERT INTO public.detalle_ventas_pos(
    tenant_id,venta_id,venta_pos_id,item_index,producto_id,cantidad,
    precio_unitario,descuento,impuesto,subtotal,total,nombre_producto,
    codigo_producto,unidad_medida,es_servicio,controla_stock,costo_unitario,afectacion_igv
  ) VALUES (
    v_tenant,v_draft_pos,v_draft_pos,1,v_producto,1,10,0,1.8,10,11.8,
    'Producto Comercial 469','PROD-469','NIU',false,true,5,'10'
  );

  INSERT INTO public.documentos(
    tenant_id,tipo_documento,serie,numero,fecha_emision,moneda,tipo_cambio,
    subtotal,descuentos,impuesto_igv,impuesto_isc,otros_impuestos,total,
    estado,cliente_id,created_by
  ) VALUES (
    v_tenant,'BOLETA','B469','00000001',now(),'PEN',1,
    100,10,16.2,0,0,106.2,'EMITIDO',v_cliente,v_actor
  ) RETURNING id INTO v_discount_doc;
  INSERT INTO public.documento_detalles(
    tenant_id,documento_id,orden,producto_id,descripcion,unidad_medida,
    cantidad,precio_unitario,descuento_unitario,valor_venta,impuesto_igv,
    impuesto_isc,total_item
  ) VALUES (
    v_tenant,v_discount_doc,1,v_producto,'Boleta con descuento','NIU',1,100,10,90,16.2,0,106.2
  );

  v_candidates := public.listar_ventas_consolidables_469(v_tenant,100);
  IF jsonb_array_length(v_candidates) <> 12
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_candidates) c
       WHERE c->>'source_id'=v_draft_pos::text)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_candidates) c
       WHERE c->>'source_id'=v_discount_doc::text AND (c->>'subtotal')::numeric=90) THEN
    RAISE EXCEPTION 'VERIFY_469_CONSOLIDABLE_FILTER_OR_DISCOUNT_NET_INVALID:%',v_candidates;
  END IF;

  SELECT count(*) INTO v_outbox_before FROM public.outbox_events WHERE tenant_id=v_tenant;
  v_batch := public.crear_consolidado_ventas_tx(
    v_tenant,v_actor,'verify-469-batch-ten',v_sources,'Bloque exacto de diez ventas'
  );
  v_batch_retry := public.crear_consolidado_ventas_tx(
    v_tenant,v_actor,'verify-469-batch-ten',v_sources,'Bloque exacto de diez ventas'
  );
  IF (v_batch#>>'{consolidado,cantidad_fuentes}')::integer <> 10
     OR (v_batch#>>'{consolidado,total}')::numeric <> 118
     OR jsonb_array_length(v_batch->'detalles') <> 10
     OR coalesce((v_batch_retry->>'idempotent')::boolean,false) IS NOT TRUE
     OR v_batch_retry#>>'{consolidado,id}' IS DISTINCT FROM v_batch#>>'{consolidado,id}'
     OR (v_batch->>'accounting_events_created')::integer <> 0 THEN
    RAISE EXCEPTION 'VERIFY_469_TEN_SALE_BATCH_INVALID:% / %',v_batch,v_batch_retry;
  END IF;

  v_discount_batch := public.crear_consolidado_ventas_tx(
    v_tenant,v_actor,'verify-469-batch-discount',
    jsonb_build_array(jsonb_build_object('tipo','DOCUMENTO','id',v_discount_doc)),
    'Documento con descuento neteado'
  );
  IF (v_discount_batch#>>'{consolidado,subtotal}')::numeric <> 90
     OR (v_discount_batch#>>'{consolidado,impuestos}')::numeric <> 16.2
     OR (v_discount_batch#>>'{consolidado,total}')::numeric <> 106.2 THEN
    RAISE EXCEPTION 'VERIFY_469_DISCOUNTED_DOCUMENT_BATCH_INVALID:%',v_discount_batch;
  END IF;
  SELECT count(*) INTO v_outbox_after FROM public.outbox_events WHERE tenant_id=v_tenant;
  IF v_outbox_after <> v_outbox_before THEN
    RAISE EXCEPTION 'VERIFY_469_BATCH_CREATED_ACCOUNTING_OR_OUTBOX:%->%',v_outbox_before,v_outbox_after;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_consolidado_ventas_tx(
      v_tenant,v_actor,'verify-469-batch-other-key',v_sources,'Mismas ventas'
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := SQLERRM LIKE '%ALREADY_CONSOLIDATED%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_469_SALE_CONSOLIDATED_TWICE'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_consolidado_ventas_tx(
      v_other_tenant,v_other_actor,'verify-469-cross-tenant',
      jsonb_build_array(jsonb_build_object('tipo','POS','id',(v_sources#>>'{0,id}')::uuid)),
      'Ataque cross tenant'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM LIKE '%POS_NOT_VALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_469_CROSS_TENANT_SOURCE_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    UPDATE public.ventas_consolidados SET total=0
    WHERE id=(v_batch#>>'{consolidado,id}')::uuid;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_failed := SQLERRM LIKE '%LEDGER_IMMUTABLE%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_469_BATCH_HEADER_MUTABLE'; END IF;

  IF (SELECT count(*) FROM public.ventas_consolidados WHERE tenant_id=v_tenant) <> 2
     OR (SELECT count(*) FROM public.ventas_consolidado_detalles WHERE tenant_id=v_tenant) <> 11
     OR EXISTS (SELECT 1 FROM public.ventas_consolidado_detalles
       WHERE tenant_id=v_tenant AND source_id=v_draft_pos) THEN
    RAISE EXCEPTION 'VERIFY_469_BATCH_FINAL_CARDINALITY_INVALID';
  END IF;
END;
$verify$;

ROLLBACK;

SELECT '469 commercial pricing, commissions and immutable sales batches verified' AS verify_result;
