\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_468_SOLO_ERP_E2E:%', current_database();
  END IF;
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_468_REQUIERE_POSTGRESQL_16';
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'producto_imagenes'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'producto_imagen_operaciones'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'VERIFY_468_RLS_FORCE_MISSING';
  END IF;

  IF has_function_privilege('anon', 'public.reservar_imagen_producto_tx(uuid,uuid,uuid,text,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reservar_imagen_producto_tx(uuid,uuid,uuid,text,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.finalizar_imagen_producto_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finalizar_imagen_producto_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reservar_borrado_imagen_producto_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finalizar_borrado_imagen_producto_tx(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_468_CLIENT_RPC_EXPOSURE';
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.buckets b
      WHERE b.id = 'product-images' AND b.name = 'product-images' AND b.public
        AND b.file_size_limit = 5242880
        AND b.allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    ) THEN
      RAISE EXCEPTION 'VERIFY_468_STORAGE_BUCKET_CONFIG_INVALID';
    END IF;
    IF (
      SELECT count(*) FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage' AND c.relname = 'objects'
        AND p.polname LIKE 'product_images_backend_only_%_468'
        AND NOT p.polpermissive
    ) <> 4 THEN
      RAISE EXCEPTION 'VERIFY_468_STORAGE_RESTRICTIVE_POLICIES_MISSING';
    END IF;
  END IF;
END;
$catalog$;

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_peer_actor uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_other_actor uuid := gen_random_uuid();
  v_category jsonb;
  v_product jsonb;
  v_reserve_1 jsonb;
  v_reserve_1_replay jsonb;
  v_finish_1 jsonb;
  v_reserve_2 jsonb;
  v_finish_2 jsonb;
  v_cleanup jsonb;
  v_delete jsonb;
  v_delete_replay jsonb;
  v_deleted jsonb;
  v_failed boolean;
  v_url_1 text;
  v_url_2 text;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, pais, plan, activo, estado) VALUES
    (v_tenant, 'VERIFY-468-' || left(v_tenant::text, 8), 'Verify Images 468', 'PE', 'free', true, 'ACTIVO'),
    (v_other_tenant, 'VERIFY-468-' || left(v_other_tenant::text, 8), 'Other Images 468', 'PE', 'free', true, 'ACTIVO');
  INSERT INTO public.usuarios_sistema (id, tenant_id, email, nombre, activo, estado) VALUES
    (v_actor, v_tenant, 'actor-' || v_actor::text || '@verify-468.local', 'Actor 468', true, 'ACTIVO'),
    (v_peer_actor, v_tenant, 'actor-' || v_peer_actor::text || '@verify-468.local', 'Peer 468', true, 'ACTIVO'),
    (v_other_actor, v_other_tenant, 'actor-' || v_other_actor::text || '@verify-468.local', 'Other 468', true, 'ACTIVO');

  v_category := public.crear_categoria_producto_maestro_tx(
    v_tenant, v_actor, 'verify-468-category-create',
    jsonb_build_object('nombre', 'Imágenes 468', 'codigo', 'IMG-468')
  );
  v_product := public.crear_producto_maestro_tx(
    v_tenant, v_actor, 'verify-468-product-create',
    jsonb_build_object(
      'codigo', 'SKU-IMG-468', 'nombre', 'Producto con imagen',
      'categoria', 'IMG-468', 'precio_venta', 10, 'precio_compra', 5,
      'stock_inicial', 0, 'stock_reservado', 0, 'impuesto', 18
    )
  );

  v_failed := false;
  BEGIN
    UPDATE public.productos
    SET imagen_url = 'https://attacker.invalid/product.jpg'
    WHERE id = (v_product->>'id')::uuid;
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%DIRECT_URL_FORBIDDEN%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_468_DIRECT_URL_WRITER_ACCEPTED'; END IF;

  v_reserve_1 := public.reservar_imagen_producto_tx(
    v_tenant, v_actor, (v_product->>'id')::uuid, 'verify-468-upload-one',
    repeat('a', 64), 'image/png', 1200
  );
  v_reserve_1_replay := public.reservar_imagen_producto_tx(
    v_tenant, v_actor, (v_product->>'id')::uuid, 'verify-468-upload-one',
    repeat('a', 64), 'image/png', 1200
  );
  IF v_reserve_1->>'operation_id' IS DISTINCT FROM v_reserve_1_replay->>'operation_id'
     OR v_reserve_1->>'imagen_id' IS DISTINCT FROM v_reserve_1_replay->>'imagen_id'
     OR COALESCE((v_reserve_1_replay->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.producto_imagenes i
         WHERE i.tenant_id = v_tenant AND i.producto_id = (v_product->>'id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_468_UPLOAD_REPLAY_DUPLICATED';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.reservar_imagen_producto_tx(
      v_tenant, v_peer_actor, (v_product->>'id')::uuid, 'verify-468-upload-one',
      repeat('a', 64), 'image/png', 1200
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%ACTOR_MISMATCH%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_468_UPLOAD_ACTOR_TAKEOVER_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.reservar_imagen_producto_tx(
      v_tenant, v_actor, (v_product->>'id')::uuid, 'verify-468-upload-one',
      repeat('b', 64), 'image/png', 1200
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := SQLERRM LIKE '%DIFFERENT_PAYLOAD%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_468_UPLOAD_KEY_COLLISION_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.reservar_imagen_producto_tx(
      v_tenant, v_actor, (v_product->>'id')::uuid, 'verify-468-upload-svg',
      repeat('c', 64), 'image/svg+xml', 1200
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM LIKE '%MIME_INVALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_468_UNSAFE_MIME_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.reservar_imagen_producto_tx(
      v_other_tenant, v_other_actor, (v_product->>'id')::uuid, 'verify-468-cross-tenant',
      repeat('d', 64), 'image/jpeg', 1200
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_failed := SQLERRM LIKE '%NOT_FOUND%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_468_CROSS_TENANT_PRODUCT_ACCEPTED'; END IF;

  v_url_1 := 'https://verify.invalid/storage/v1/object/public/product-images/' ||
    (v_reserve_1->>'object_path');
  v_finish_1 := public.finalizar_imagen_producto_tx(
    v_tenant, v_actor, (v_reserve_1->>'operation_id')::uuid, v_url_1
  );
  IF (SELECT p.imagen_url FROM public.productos p WHERE p.id = (v_product->>'id')::uuid)
       IS DISTINCT FROM v_url_1
     OR (SELECT count(*) FROM public.producto_imagenes i
         WHERE i.tenant_id = v_tenant AND i.producto_id = (v_product->>'id')::uuid
           AND i.estado = 'ACTIVA' AND i.public_url = v_url_1) <> 1
     OR COALESCE((v_finish_1->>'completed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_468_FIRST_ACTIVATION_INCOMPLETE';
  END IF;

  v_reserve_2 := public.reservar_imagen_producto_tx(
    v_tenant, v_actor, (v_product->>'id')::uuid, 'verify-468-upload-two',
    repeat('e', 64), 'image/webp', 2400
  );
  v_url_2 := 'https://verify.invalid/storage/v1/object/public/product-images/' ||
    (v_reserve_2->>'object_path');
  v_finish_2 := public.finalizar_imagen_producto_tx(
    v_tenant, v_actor, (v_reserve_2->>'operation_id')::uuid, v_url_2
  );
  IF v_finish_2#>>'{cleanup,imagen_id}' IS DISTINCT FROM v_finish_1->>'imagen_id'
     OR (SELECT p.imagen_url FROM public.productos p WHERE p.id = (v_product->>'id')::uuid)
       IS DISTINCT FROM v_url_2
     OR (SELECT count(*) FROM public.producto_imagenes i
         WHERE i.tenant_id = v_tenant AND i.producto_id = (v_product->>'id')::uuid
           AND i.estado = 'ACTIVA') <> 1
     OR (SELECT estado FROM public.producto_imagenes i
         WHERE i.id = (v_finish_1->>'imagen_id')::uuid) <> 'PENDIENTE_BORRADO' THEN
    RAISE EXCEPTION 'VERIFY_468_REPLACEMENT_NOT_ATOMIC';
  END IF;

  v_cleanup := public.confirmar_limpieza_imagen_producto_tx(
    v_tenant, v_actor, (v_finish_1->>'imagen_id')::uuid
  );
  IF v_cleanup->>'estado' <> 'BORRADA'
     OR (public.confirmar_limpieza_imagen_producto_tx(
          v_tenant, v_actor, (v_finish_1->>'imagen_id')::uuid
        )->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_468_REPLACEMENT_CLEANUP_NOT_IDEMPOTENT';
  END IF;

  v_delete := public.reservar_borrado_imagen_producto_tx(
    v_tenant, v_actor, (v_product->>'id')::uuid, 'verify-468-delete-current'
  );
  v_delete_replay := public.reservar_borrado_imagen_producto_tx(
    v_tenant, v_actor, (v_product->>'id')::uuid, 'verify-468-delete-current'
  );
  IF v_delete->>'operation_id' IS DISTINCT FROM v_delete_replay->>'operation_id'
     OR NULLIF((SELECT p.imagen_url FROM public.productos p
                WHERE p.id = (v_product->>'id')::uuid), '') IS NOT NULL
     OR (SELECT estado FROM public.producto_imagenes i
         WHERE i.id = (v_finish_2->>'imagen_id')::uuid) <> 'PENDIENTE_BORRADO' THEN
    RAISE EXCEPTION 'VERIFY_468_DELETE_RESERVATION_INCONSISTENT';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.reservar_borrado_imagen_producto_tx(
      v_tenant, v_peer_actor, (v_product->>'id')::uuid, 'verify-468-delete-current'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%ACTOR_MISMATCH%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_468_DELETE_ACTOR_TAKEOVER_ACCEPTED'; END IF;
  v_deleted := public.finalizar_borrado_imagen_producto_tx(
    v_tenant, v_actor, (v_delete->>'operation_id')::uuid
  );
  IF v_deleted->>'estado' <> 'BORRADA'
     OR (public.finalizar_borrado_imagen_producto_tx(
          v_tenant, v_actor, (v_delete->>'operation_id')::uuid
        )->>'idempotent')::boolean IS NOT TRUE
     OR EXISTS (
       SELECT 1 FROM public.producto_imagenes i
       WHERE i.tenant_id = v_tenant AND i.producto_id = (v_product->>'id')::uuid
         AND i.estado IN ('ACTIVA', 'PENDIENTE_BORRADO')
     ) THEN
    RAISE EXCEPTION 'VERIFY_468_DELETE_FINALIZATION_NOT_IDEMPOTENT';
  END IF;
END;
$verify$;

ROLLBACK;
