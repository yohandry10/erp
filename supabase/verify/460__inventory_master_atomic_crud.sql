\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_460_SOLO_ERP_E2E:%', current_database();
  END IF;
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_460_REQUIERE_POSTGRESQL_16';
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'DEV', project_ref = 'localqaerpephemeralx',
    allow_demo_data = true, configured_at = now(), updated_at = now()
WHERE singleton = true;

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_other_actor uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_almacen_role uuid := gen_random_uuid();
  v_compras uuid := gen_random_uuid();
  v_category jsonb;
  v_category_replay jsonb;
  v_product jsonb;
  v_product_replay jsonb;
  v_warehouse_1 jsonb;
  v_warehouse_2 jsonb;
  v_location_1 jsonb;
  v_location_2 jsonb;
  v_failed boolean;
  v_message text;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, pais, plan, activo, estado)
  VALUES (v_tenant, 'VERIFY-460-' || left(v_tenant::text, 8), 'Verify Inventory 460', 'PE', 'free', true, 'ACTIVO');
  INSERT INTO public.usuarios_sistema (id, tenant_id, email, nombre, activo, estado)
  VALUES (v_actor, v_tenant, 'actor-' || v_actor::text || '@verify-460.local', 'Actor 460', true, 'ACTIVO');
  INSERT INTO public.usuarios_sistema (id, tenant_id, email, nombre, activo, estado)
  VALUES (v_other_actor, v_tenant, 'inactive-' || v_other_actor::text || '@verify-460.local', 'Actor inactivo', false, 'INACTIVO');

  INSERT INTO public.roles (id, tenant_id, nombre, activo) VALUES
    (v_admin, v_tenant, 'ADMIN', true),
    (v_almacen_role, v_tenant, 'ALMACEN', true),
    (v_compras, v_tenant, 'COMPRAS', true);
  IF (SELECT count(*) FROM public.permisos p
      WHERE p.tenant_id = v_tenant
        AND p.codigo IN (
          'inventario.almacenes.create', 'inventario.almacenes.update', 'inventario.almacenes.delete',
          'inventario.ubicaciones.read', 'inventario.ubicaciones.create',
          'inventario.ubicaciones.update', 'inventario.ubicaciones.delete'
        )) <> 7 THEN
    RAISE EXCEPTION 'VERIFY_460_RBAC_PERMISSION_SEED_INCOMPLETE';
  END IF;
  IF (SELECT count(*) FROM public.rol_permisos rp
      JOIN public.permisos p ON p.id = rp.permiso_id
      WHERE rp.role_id = v_admin AND rp.concedido
        AND p.codigo LIKE 'inventario.%') < 7
     OR (SELECT count(*) FROM public.rol_permisos rp
         JOIN public.permisos p ON p.id = rp.permiso_id
         WHERE rp.role_id = v_almacen_role AND rp.concedido
           AND p.codigo IN (
             'inventario.almacenes.create', 'inventario.almacenes.update', 'inventario.almacenes.delete',
             'inventario.ubicaciones.read', 'inventario.ubicaciones.create',
             'inventario.ubicaciones.update', 'inventario.ubicaciones.delete'
           )) <> 7
     OR (SELECT count(*) FROM public.rol_permisos rp
         JOIN public.permisos p ON p.id = rp.permiso_id
         WHERE rp.role_id = v_compras AND rp.concedido
           AND p.codigo = 'inventario.ubicaciones.read') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_460_RBAC_ROLE_GRANTS_INCOMPLETE';
  END IF;

  v_category := public.crear_categoria_producto_maestro_tx(
    v_tenant, v_actor, 'verify-460-category-create',
    jsonb_build_object(
      'nombre', 'Repuestos 460', 'codigo', 'REP-460',
      'campos_extra', jsonb_build_array(jsonb_build_object(
        'key', 'serie', 'label', 'Serie', 'tipo', 'text', 'requerido', false
      ))
    )
  );
  v_category_replay := public.crear_categoria_producto_maestro_tx(
    v_tenant, v_actor, 'verify-460-category-create',
    jsonb_build_object(
      'nombre', 'Repuestos 460', 'codigo', 'REP-460',
      'campos_extra', jsonb_build_array(jsonb_build_object(
        'key', 'serie', 'label', 'Serie', 'tipo', 'text', 'requerido', false
      ))
    )
  );
  IF v_category->>'id' IS DISTINCT FROM v_category_replay->>'id'
     OR COALESCE((v_category_replay->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_460_CATEGORY_REPLAY_DUPLICATED';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_categoria_producto_maestro_tx(
      v_tenant, v_actor, 'verify-460-category-create',
      jsonb_build_object('nombre', 'Payload diferente', 'codigo', 'DIFF-460')
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := SQLERRM LIKE '%DIFFERENT_PAYLOAD%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_460_FINGERPRINT_REUSE_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_categoria_producto_maestro_tx(
      v_tenant, v_other_actor, 'verify-460-inactive-actor',
      jsonb_build_object('nombre', 'Actor invalido', 'codigo', 'BAD-ACTOR')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%ACTOR_INVALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_460_INACTIVE_ACTOR_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_categoria_producto_maestro_tx(
      v_tenant, v_actor, 'verify-460-category-duplicate',
      jsonb_build_object('nombre', '  repuestos 460  ', 'codigo', 'OTHER-460')
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_460_CATEGORY_CI_UNIQUENESS_MISSING'; END IF;

  v_warehouse_1 := public.crear_almacen_maestro_tx(
    v_tenant, v_actor, 'verify-460-warehouse-one',
    jsonb_build_object('codigo', 'WH-460-A', 'nombre', 'Principal 460', 'es_principal', true)
  );
  v_warehouse_2 := public.crear_almacen_maestro_tx(
    v_tenant, v_actor, 'verify-460-warehouse-two',
    jsonb_build_object('codigo', 'WH-460-B', 'nombre', 'Secundario 460')
  );
  IF (SELECT count(*) FROM public.almacenes a
      WHERE a.tenant_id = v_tenant AND a.activo AND a.es_principal) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_460_WAREHOUSE_PRINCIPAL_NOT_UNIQUE';
  END IF;

  v_location_1 := public.crear_ubicacion_almacen_maestro_tx(
    v_tenant, v_actor, (v_warehouse_1->>'id')::uuid, 'verify-460-location-one',
    jsonb_build_object('codigo', 'RACK-01', 'nombre', 'Rack principal', 'tipo', 'RACK')
  );
  v_location_2 := public.crear_ubicacion_almacen_maestro_tx(
    v_tenant, v_actor, (v_warehouse_2->>'id')::uuid, 'verify-460-location-two',
    jsonb_build_object('codigo', 'RACK-01', 'nombre', 'Rack secundario', 'tipo', 'RACK')
  );

  v_failed := false;
  BEGIN
    PERFORM public.crear_ubicacion_almacen_maestro_tx(
      v_tenant, v_actor, (v_warehouse_1->>'id')::uuid, 'verify-460-location-duplicate',
      jsonb_build_object('codigo', ' rack-01 ', 'nombre', 'Duplicada', 'tipo', 'RACK')
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_460_LOCATION_CI_UNIQUENESS_MISSING'; END IF;

  v_product := public.crear_producto_maestro_tx(
    v_tenant, v_actor, 'verify-460-product-create',
    jsonb_build_object(
      'codigo', 'SKU-460', 'nombre', 'Producto verify 460', 'categoria', 'REP-460',
      'precio_venta', 120.50, 'precio_compra', 80, 'stock_inicial', 10.5,
      'stock_reservado', 2.25, 'stock_minimo', 1, 'impuesto', 18,
      'almacen_id', v_warehouse_1->>'id'
    )
  );
  v_product_replay := public.crear_producto_maestro_tx(
    v_tenant, v_actor, 'verify-460-product-create',
    jsonb_build_object(
      'codigo', 'SKU-460', 'nombre', 'Producto verify 460', 'categoria', 'REP-460',
      'precio_venta', 120.50, 'precio_compra', 80, 'stock_inicial', 10.5,
      'stock_reservado', 2.25, 'stock_minimo', 1, 'impuesto', 18,
      'almacen_id', v_warehouse_1->>'id'
    )
  );
  IF v_product->>'id' IS DISTINCT FROM v_product_replay->>'id'
     OR COALESCE((v_product_replay->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.productos p
         WHERE p.tenant_id = v_tenant AND lower(p.codigo) = 'sku-460') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_460_PRODUCT_REPLAY_DUPLICATED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.producto_existencias pe
    WHERE pe.tenant_id = v_tenant AND pe.producto_id = (v_product->>'id')::uuid
      AND pe.almacen_id = (v_warehouse_1->>'id')::uuid
      AND pe.stock_actual = 10.5 AND pe.stock_reservado = 2.25
  ) THEN
    RAISE EXCEPTION 'VERIFY_460_PRODUCT_INITIAL_LEDGER_NOT_ATOMIC';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.actualizar_producto_maestro_tx(
      v_tenant, v_actor, (v_product->>'id')::uuid, 'verify-460-direct-stock-update',
      jsonb_build_object('stock_actual', 99)
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM LIKE '%STOCK_DIRECT_UPDATE_FORBIDDEN%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_460_DIRECT_STOCK_UPDATE_ACCEPTED'; END IF;

  UPDATE public.producto_existencias
  SET ubicacion_id = (v_location_1->>'id')::uuid
  WHERE tenant_id = v_tenant AND producto_id = (v_product->>'id')::uuid;
  v_failed := false;
  BEGIN
    UPDATE public.producto_existencias
    SET ubicacion_id = (v_location_2->>'id')::uuid
    WHERE tenant_id = v_tenant AND producto_id = (v_product->>'id')::uuid;
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_460_CROSS_WAREHOUSE_LOCATION_ACCEPTED'; END IF;

  FOREACH v_message IN ARRAY ARRAY[
    'product', 'category', 'location', 'warehouse'
  ] LOOP
    v_failed := false;
    BEGIN
      CASE v_message
        WHEN 'product' THEN
          PERFORM public.desactivar_producto_maestro_tx(v_tenant, v_actor, (v_product->>'id')::uuid, 'verify-460-product-blocked');
        WHEN 'category' THEN
          PERFORM public.desactivar_categoria_producto_maestro_tx(v_tenant, v_actor, (v_category->>'id')::uuid, 'verify-460-category-blocked');
        WHEN 'location' THEN
          PERFORM public.desactivar_ubicacion_almacen_maestro_tx(v_tenant, v_actor, (v_warehouse_1->>'id')::uuid, (v_location_1->>'id')::uuid, 'verify-460-location-blocked');
        WHEN 'warehouse' THEN
          PERFORM public.desactivar_almacen_maestro_tx(v_tenant, v_actor, (v_warehouse_1->>'id')::uuid, 'verify-460-warehouse-blocked');
      END CASE;
    EXCEPTION WHEN check_violation THEN v_failed := true;
    END;
    IF NOT v_failed THEN
      RAISE EXCEPTION 'VERIFY_460_UNSAFE_DEACTIVATION_ACCEPTED:%', v_message;
    END IF;
  END LOOP;

  PERFORM public.actualizar_categoria_producto_maestro_tx(
    v_tenant, v_actor, (v_category->>'id')::uuid, 'verify-460-category-rename',
    jsonb_build_object('nombre', 'REPUESTOS RENOMBRADOS 460')
  );
  IF (SELECT categoria FROM public.productos WHERE id = (v_product->>'id')::uuid)
     <> 'REPUESTOS RENOMBRADOS 460' THEN
    RAISE EXCEPTION 'VERIFY_460_CATEGORY_RENAME_FRAGMENTED';
  END IF;

  UPDATE public.producto_existencias
  SET stock_actual = 0, stock_reservado = 0, stock_danado = 0
  WHERE tenant_id = v_tenant AND producto_id = (v_product->>'id')::uuid;
  PERFORM public.desactivar_producto_maestro_tx(
    v_tenant, v_actor, (v_product->>'id')::uuid, 'verify-460-product-deactivate'
  );
  PERFORM public.desactivar_categoria_producto_maestro_tx(
    v_tenant, v_actor, (v_category->>'id')::uuid, 'verify-460-category-deactivate'
  );
  PERFORM public.desactivar_ubicacion_almacen_maestro_tx(
    v_tenant, v_actor, (v_warehouse_1->>'id')::uuid, (v_location_1->>'id')::uuid,
    'verify-460-location-deactivate'
  );
  PERFORM public.actualizar_almacen_maestro_tx(
    v_tenant, v_actor, (v_warehouse_2->>'id')::uuid, 'verify-460-promote-secondary',
    jsonb_build_object('es_principal', true)
  );
  PERFORM public.desactivar_almacen_maestro_tx(
    v_tenant, v_actor, (v_warehouse_1->>'id')::uuid, 'verify-460-warehouse-deactivate'
  );
  IF (SELECT count(*) FROM public.almacenes a
      WHERE a.tenant_id = v_tenant AND a.activo AND a.es_principal) <> 1
     OR (SELECT activo FROM public.productos WHERE id = (v_product->>'id')::uuid)
     OR (SELECT activo FROM public.categorias_producto WHERE id = (v_category->>'id')::uuid)
     OR (SELECT lower(estado::text) = 'activo' FROM public.almacen_ubicaciones
         WHERE id = (v_location_1->>'id')::uuid) THEN
    RAISE EXCEPTION 'VERIFY_460_SAFE_DEACTIVATION_FINAL_STATE_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventario_maestro_operaciones o
    WHERE o.tenant_id = v_tenant AND (o.response IS NULL OR o.completed_at IS NULL)
  ) OR (SELECT count(*) FROM public.audit_log a
        WHERE a.tenant_id = v_tenant AND a.user_id = v_actor
          AND a.metadata->>'source' = 'inventory_master_460') < 10 THEN
    RAISE EXCEPTION 'VERIFY_460_DURABLE_OPERATION_OR_AUDIT_MISSING';
  END IF;

  IF has_table_privilege('authenticated', 'public.productos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.categorias_producto', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.almacenes', 'DELETE')
     OR has_table_privilege('authenticated', 'public.almacen_ubicaciones', 'INSERT')
     OR has_function_privilege('authenticated', 'public.crear_producto_maestro_tx(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crear_almacen_maestro_tx(uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_460_CLIENT_MUTATION_EXPOSED';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.crear_producto_maestro_tx(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.actualizar_categoria_producto_maestro_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.desactivar_almacen_maestro_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.crear_ubicacion_almacen_maestro_tx(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.inventory_master_fingerprint_460(jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.claim_inventory_master_operation_460(uuid,uuid,text,text,text,text)', 'EXECUTE')
     OR has_table_privilege('service_role', 'public.inventario_maestro_operaciones', 'INSERT')
     OR has_table_privilege('service_role', 'public.inventario_maestro_operaciones', 'UPDATE')
     OR has_table_privilege('service_role', 'public.inventario_maestro_operaciones', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_460_SERVICE_ROLE_CONTRACT_MISSING';
  END IF;
END;
$verify$;

SET CONSTRAINTS trg_assert_warehouse_principal_460 IMMEDIATE;

ROLLBACK;
