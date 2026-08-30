\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_523_SOLO_ERP_E2E:%', current_database();
  END IF;
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'VERIFY_523_REQUIERE_POSTGRESQL_16';
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
    allow_demo_data = true, configured_at = now(), updated_at = now()
WHERE singleton = true;

DO $catalog$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'empresa_logo_assets'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'empresa_logo_operaciones'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'VERIFY_523_RLS_FORCE_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = 'public'
      AND i.tablename = 'empresa_logo_assets'
      AND i.indexname = 'ux_empresa_logo_pending_payload_523'
      AND i.indexdef LIKE '%WHERE (estado = ''PENDIENTE''%'
  ) THEN
    RAISE EXCEPTION 'VERIFY_523_PENDING_PAYLOAD_UNIQUENESS_MISSING';
  END IF;

  IF has_function_privilege('anon', 'public.reservar_logo_empresa_tx(uuid,uuid,text,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reservar_logo_empresa_tx(uuid,uuid,text,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.finalizar_logo_empresa_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finalizar_logo_empresa_tx(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.confirmar_limpieza_logo_empresa_tx(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.confirmar_limpieza_logo_empresa_tx(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.listar_limpiezas_logo_empresa_tx(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.listar_limpiezas_logo_empresa_tx(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reservar_borrado_logo_empresa_tx(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reservar_borrado_logo_empresa_tx(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.finalizar_borrado_logo_empresa_tx(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finalizar_borrado_logo_empresa_tx(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY_523_CLIENT_RPC_EXPOSURE';
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.buckets b
      WHERE b.id = 'company-assets' AND b.name = 'company-assets' AND b.public
        AND b.file_size_limit = 2097152
        AND b.allowed_mime_types @> ARRAY['image/jpeg', 'image/png']::text[]
        AND cardinality(b.allowed_mime_types) = 2
    ) THEN
      RAISE EXCEPTION 'VERIFY_523_STORAGE_BUCKET_CONFIG_INVALID';
    END IF;
    IF (
      SELECT count(*) FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage' AND c.relname = 'objects'
        AND p.polname LIKE 'company_assets_backend_only_%_523'
        AND NOT p.polpermissive
    ) <> 4 THEN
      RAISE EXCEPTION 'VERIFY_523_STORAGE_RESTRICTIVE_POLICIES_MISSING';
    END IF;
  END IF;
END;
$catalog$;

DO $verify$
DECLARE
  v_demo jsonb;
  v_other_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_peer_actor uuid := gen_random_uuid();
  v_other_tenant uuid;
  v_other_actor uuid;
  v_reserve_1 jsonb;
  v_replay_1 jsonb;
  v_adopt_1 jsonb;
  v_completed_alias jsonb;
  v_finish_1 jsonb;
  v_reserve_2 jsonb;
  v_finish_2 jsonb;
  v_cleanup jsonb;
  v_pending jsonb;
  v_delete jsonb;
  v_delete_replay jsonb;
  v_delete_new_key jsonb;
  v_deleted jsonb;
  v_legacy_delete jsonb;
  v_failed boolean;
  v_url_1 text;
  v_url_2 text;
BEGIN
  v_demo := public.create_demo_tenant_ready_tx(
    'VERIFY LOGO 523', 14, 'PE', 'verify-logo-523-' || gen_random_uuid()::text
  );
  v_other_demo := public.create_demo_tenant_ready_tx(
    'VERIFY LOGO OTHER 523', 14, 'PE', 'verify-logo-other-523-' || gen_random_uuid()::text
  );
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;
  v_other_tenant := (v_other_demo->>'tenant_id')::uuid;
  v_other_actor := (v_other_demo->>'user_id')::uuid;
  INSERT INTO public.usuarios_sistema (id, tenant_id, email, nombre, activo, estado)
  VALUES (
    v_peer_actor, v_tenant, 'peer-' || v_peer_actor::text || '@verify-523.local',
    'Peer Logo 523', true, 'ACTIVO'
  );

  -- Una URL anterior a 523 no bloquea la instalacion y el endpoint dedicado
  -- dispone de una ruta segura para sanearla aun sin metadata de Storage.
  EXECUTE 'ALTER TABLE public.empresa_config DISABLE TRIGGER trg_guard_empresa_logo_url_523';
  UPDATE public.empresa_config
  SET logo_url = 'https://legacy.example/logo.png'
  WHERE tenant_id = v_other_tenant;
  EXECUTE 'ALTER TABLE public.empresa_config ENABLE TRIGGER trg_guard_empresa_logo_url_523';
  v_legacy_delete := public.reservar_borrado_logo_empresa_tx(
    v_other_tenant, v_other_actor, 'verify-523-delete-legacy'
  );
  IF v_legacy_delete->>'estado' <> 'SIN_OBJETO'
     OR COALESCE((v_legacy_delete->>'completed')::boolean, false) IS NOT TRUE
     OR (SELECT ec.logo_url FROM public.empresa_config ec
         WHERE ec.tenant_id = v_other_tenant) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_523_LEGACY_LOGO_NOT_SANITIZED';
  END IF;

  v_failed := false;
  BEGIN
    UPDATE public.empresa_config
    SET logo_url = 'data:image/png;base64,AAAA'
    WHERE tenant_id = v_tenant;
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%COMPANY_LOGO_DIRECT_URL_FORBIDDEN%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_523_DATA_URL_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    INSERT INTO public.empresa_config (tenant_id, logo_url)
    VALUES (v_tenant, 'https://attacker.invalid/logo.png');
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%COMPANY_LOGO_DIRECT_URL_FORBIDDEN%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_523_INSERT_URL_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    UPDATE public.empresa_config
    SET logo_url = 'https://attacker.invalid/storage/v1/object/public/company-assets/'
      || v_tenant::text || '/logos/52300000-0000-4000-8000-000000000001.png'
    WHERE tenant_id = v_tenant;
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%COMPANY_LOGO_DIRECT_URL_FORBIDDEN%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_523_UNBACKED_URL_ACCEPTED'; END IF;

  v_reserve_1 := public.reservar_logo_empresa_tx(
    v_tenant, v_actor, 'verify-523-upload-one', repeat('a', 64), 'image/png', 1200
  );
  v_replay_1 := public.reservar_logo_empresa_tx(
    v_tenant, v_actor, 'verify-523-upload-one', repeat('a', 64), 'image/png', 1200
  );
  IF v_reserve_1->>'operation_id' IS DISTINCT FROM v_replay_1->>'operation_id'
     OR v_reserve_1->>'asset_id' IS DISTINCT FROM v_replay_1->>'asset_id'
     OR COALESCE((v_replay_1->>'idempotent')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.empresa_logo_assets a
         WHERE a.tenant_id = v_tenant) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_523_UPLOAD_REPLAY_DUPLICATED';
  END IF;

  -- Una recarga puede generar una clave nueva. El mismo actor y payload deben
  -- adoptar la reserva existente, incluso si el objeto ya alcanzó Storage.
  v_adopt_1 := public.reservar_logo_empresa_tx(
    v_tenant, v_actor, 'verify-523-upload-one-after-reload',
    repeat('a', 64), 'image/png', 1200
  );
  IF v_adopt_1->>'operation_id' = v_reserve_1->>'operation_id'
     OR v_adopt_1->>'asset_id' IS DISTINCT FROM v_reserve_1->>'asset_id'
     OR v_adopt_1->>'object_path' IS DISTINCT FROM v_reserve_1->>'object_path'
     OR v_adopt_1->>'adopted_from_operation_id' IS DISTINCT FROM v_reserve_1->>'operation_id'
     OR (SELECT count(*) FROM public.empresa_logo_assets a
         WHERE a.tenant_id = v_tenant AND a.estado = 'PENDIENTE') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_523_UPLOAD_NEW_KEY_DID_NOT_ADOPT_PENDING_ASSET';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.reservar_logo_empresa_tx(
      v_tenant, v_peer_actor, 'verify-523-upload-one', repeat('a', 64), 'image/png', 1200
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%ACTOR_MISMATCH%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_523_UPLOAD_ACTOR_TAKEOVER_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.reservar_logo_empresa_tx(
      v_tenant, v_actor, 'verify-523-upload-one', repeat('b', 64), 'image/png', 1200
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := SQLERRM LIKE '%DIFFERENT_PAYLOAD%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_523_UPLOAD_KEY_COLLISION_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.reservar_logo_empresa_tx(
      v_tenant, v_actor, 'verify-523-upload-svg', repeat('c', 64), 'image/svg+xml', 1200
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM LIKE '%MIME_INVALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_523_UNSAFE_MIME_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.reservar_logo_empresa_tx(
      v_other_tenant, v_actor, 'verify-523-cross-tenant', repeat('d', 64), 'image/jpeg', 1200
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%ACTOR_INVALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_523_CROSS_TENANT_ACTOR_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.finalizar_logo_empresa_tx(
      v_tenant, v_actor, (v_reserve_1->>'operation_id')::uuid,
      'https://verify.invalid/storage/v1/object/public/company-assets/'
        || (v_reserve_1->>'object_path')
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := SQLERRM LIKE '%PUBLIC_URL_INVALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_523_UNCONTROLLED_ORIGIN_ACCEPTED'; END IF;

  v_url_1 := 'https://wypnbcptofqdmoynlonq.supabase.co/storage/v1/object/public/company-assets/'
    || (v_reserve_1->>'object_path');
  v_finish_1 := public.finalizar_logo_empresa_tx(
    v_tenant, v_actor, (v_reserve_1->>'operation_id')::uuid, v_url_1
  );
  IF (SELECT ec.logo_url FROM public.empresa_config ec WHERE ec.tenant_id = v_tenant)
       IS DISTINCT FROM v_url_1
     OR (SELECT count(*) FROM public.empresa_logo_assets a
         WHERE a.tenant_id = v_tenant AND a.estado = 'ACTIVA'
           AND a.public_url = v_url_1) <> 1
     OR COALESCE((v_finish_1->>'completed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_523_FIRST_ACTIVATION_INCOMPLETE';
  END IF;
  IF COALESCE((public.reservar_logo_empresa_tx(
       v_tenant, v_actor, 'verify-523-upload-one-after-reload',
       repeat('a', 64), 'image/png', 1200
     )->>'completed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_523_ADOPTED_OPERATION_NOT_COMPLETED_WITH_ORIGINAL';
  END IF;

  -- Si finalizar confirmó la transacción pero se perdió la respuesta HTTP, la
  -- siguiente clave queda completada sobre el asset activo y no lo reemplaza.
  v_completed_alias := public.reservar_logo_empresa_tx(
    v_tenant, v_actor, 'verify-523-upload-one-after-response-loss',
    repeat('a', 64), 'image/png', 1200
  );
  IF COALESCE((v_completed_alias->>'completed')::boolean, false) IS NOT TRUE
     OR v_completed_alias->>'asset_id' IS DISTINCT FROM v_finish_1->>'asset_id'
     OR (SELECT count(*) FROM public.empresa_logo_assets a
         WHERE a.tenant_id = v_tenant) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_523_COMPLETED_UPLOAD_RESPONSE_LOSS_DUPLICATED_ASSET';
  END IF;

  v_reserve_2 := public.reservar_logo_empresa_tx(
    v_tenant, v_actor, 'verify-523-upload-two', repeat('e', 64), 'image/jpeg', 2400
  );
  v_url_2 := 'https://wypnbcptofqdmoynlonq.supabase.co/storage/v1/object/public/company-assets/'
    || (v_reserve_2->>'object_path');
  v_finish_2 := public.finalizar_logo_empresa_tx(
    v_tenant, v_actor, (v_reserve_2->>'operation_id')::uuid, v_url_2
  );
  IF v_finish_2#>>'{cleanup,asset_id}' IS DISTINCT FROM v_finish_1->>'asset_id'
     OR (SELECT ec.logo_url FROM public.empresa_config ec WHERE ec.tenant_id = v_tenant)
       IS DISTINCT FROM v_url_2
     OR (SELECT count(*) FROM public.empresa_logo_assets a
         WHERE a.tenant_id = v_tenant AND a.estado = 'ACTIVA') <> 1
     OR (SELECT estado FROM public.empresa_logo_assets a
         WHERE a.id = (v_finish_1->>'asset_id')::uuid) <> 'PENDIENTE_BORRADO' THEN
    RAISE EXCEPTION 'VERIFY_523_REPLACEMENT_NOT_ATOMIC';
  END IF;

  v_pending := public.listar_limpiezas_logo_empresa_tx(v_tenant, v_actor);
  IF jsonb_array_length(COALESCE(v_pending->'cleanup', '[]'::jsonb)) <> 1
     OR v_pending#>>'{cleanup,0,asset_id}' IS DISTINCT FROM v_finish_1->>'asset_id' THEN
    RAISE EXCEPTION 'VERIFY_523_PENDING_CLEANUP_LIST_INCOMPLETE';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.listar_limpiezas_logo_empresa_tx(v_tenant, v_other_actor);
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%ACTOR_INVALID%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_523_CLEANUP_CROSS_TENANT_ACTOR_ACCEPTED'; END IF;
  IF jsonb_array_length(COALESCE(
       public.listar_limpiezas_logo_empresa_tx(v_other_tenant, v_other_actor)->'cleanup',
       '[]'::jsonb
     )) <> 0 THEN
    RAISE EXCEPTION 'VERIFY_523_CLEANUP_LIST_CROSSED_TENANT';
  END IF;

  v_cleanup := public.confirmar_limpieza_logo_empresa_tx(
    v_tenant, v_actor, (v_finish_1->>'asset_id')::uuid
  );
  IF v_cleanup->>'estado' <> 'BORRADA'
     OR (public.confirmar_limpieza_logo_empresa_tx(
          v_tenant, v_actor, (v_finish_1->>'asset_id')::uuid
        )->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY_523_REPLACEMENT_CLEANUP_NOT_IDEMPOTENT';
  END IF;

  v_delete := public.reservar_borrado_logo_empresa_tx(
    v_tenant, v_actor, 'verify-523-delete-current'
  );
  v_delete_replay := public.reservar_borrado_logo_empresa_tx(
    v_tenant, v_actor, 'verify-523-delete-current'
  );
  IF v_delete->>'operation_id' IS DISTINCT FROM v_delete_replay->>'operation_id'
     OR (SELECT ec.logo_url FROM public.empresa_config ec WHERE ec.tenant_id = v_tenant) IS NOT NULL
     OR (SELECT estado FROM public.empresa_logo_assets a
         WHERE a.id = (v_finish_2->>'asset_id')::uuid) <> 'PENDIENTE_BORRADO' THEN
    RAISE EXCEPTION 'VERIFY_523_DELETE_RESERVATION_INCONSISTENT';
  END IF;
  -- Una recarga del navegador genera una clave nueva. Debe recuperar el mismo
  -- objeto pendiente, no declarar falsamente que ya no hay nada que borrar.
  v_delete_new_key := public.reservar_borrado_logo_empresa_tx(
    v_tenant, v_actor, 'verify-523-delete-after-reload'
  );
  IF v_delete_new_key->>'asset_id' IS DISTINCT FROM v_delete->>'asset_id'
     OR COALESCE((v_delete_new_key->>'completed')::boolean, false) IS TRUE
     OR v_delete_new_key->>'estado' IS DISTINCT FROM 'PENDIENTE_BORRADO' THEN
    RAISE EXCEPTION 'VERIFY_523_DELETE_NEW_KEY_DID_NOT_RECOVER_PENDING_ASSET';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.reservar_borrado_logo_empresa_tx(
      v_tenant, v_peer_actor, 'verify-523-delete-current'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := SQLERRM LIKE '%ACTOR_MISMATCH%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_523_DELETE_ACTOR_TAKEOVER_ACCEPTED'; END IF;

  v_deleted := public.finalizar_borrado_logo_empresa_tx(
    v_tenant, v_actor, (v_delete_new_key->>'operation_id')::uuid
  );
  IF v_deleted->>'estado' <> 'BORRADA'
     OR (public.finalizar_borrado_logo_empresa_tx(
          v_tenant, v_actor, (v_delete->>'operation_id')::uuid
        )->>'idempotent')::boolean IS NOT TRUE
     OR EXISTS (
       SELECT 1 FROM public.empresa_logo_assets a
       WHERE a.tenant_id = v_tenant AND a.estado IN ('ACTIVA', 'PENDIENTE_BORRADO')
     ) THEN
    RAISE EXCEPTION 'VERIFY_523_DELETE_FINALIZATION_NOT_IDEMPOTENT';
  END IF;

  -- Control positivo: el actor válido del otro tenant puede operar en el suyo.
  IF public.reservar_logo_empresa_tx(
    v_other_tenant, v_other_actor, 'verify-523-other-upload', repeat('f', 64),
    'image/png', 100
  )->>'object_path' NOT LIKE v_other_tenant::text || '/logos/%' THEN
    RAISE EXCEPTION 'VERIFY_523_TENANT_PATH_NOT_SCOPED';
  END IF;
END;
$verify$;

ROLLBACK;

SELECT 'VERIFY_523_OK' AS resultado;
