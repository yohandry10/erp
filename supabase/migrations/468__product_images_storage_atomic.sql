-- Imágenes de producto en Supabase Storage.
-- El objeto se escribe/borrar exclusivamente mediante Storage API desde el backend;
-- PostgreSQL conserva la intención, metadata, aislamiento tenant e idempotencia.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

CREATE TABLE IF NOT EXISTS public.producto_imagenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  bucket_id text NOT NULL DEFAULT 'product-images',
  object_path text NOT NULL,
  public_url text,
  mime_type text NOT NULL,
  bytes integer NOT NULL,
  sha256 text NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  reemplaza_imagen_id uuid REFERENCES public.producto_imagenes(id) ON DELETE SET NULL,
  reemplazada_por_imagen_id uuid REFERENCES public.producto_imagenes(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  deleted_by uuid REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT ck_producto_imagen_bucket_468 CHECK (bucket_id = 'product-images'),
  CONSTRAINT ck_producto_imagen_mime_468
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT ck_producto_imagen_bytes_468 CHECK (bytes BETWEEN 1 AND 5242880),
  CONSTRAINT ck_producto_imagen_sha_468 CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_producto_imagen_path_468 CHECK (
    object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  ),
  CONSTRAINT ck_producto_imagen_estado_468 CHECK (
    estado IN ('PENDIENTE', 'ACTIVA', 'PENDIENTE_BORRADO', 'BORRADA')
  ),
  CONSTRAINT ck_producto_imagen_activation_468 CHECK (
    estado <> 'ACTIVA' OR (public_url IS NOT NULL AND activated_at IS NOT NULL)
  ),
  CONSTRAINT ck_producto_imagen_deletion_468 CHECK (
    estado <> 'BORRADA' OR deleted_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_imagen_object_468
  ON public.producto_imagenes (bucket_id, object_path);
CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_imagen_activa_468
  ON public.producto_imagenes (tenant_id, producto_id)
  WHERE estado = 'ACTIVA';
CREATE INDEX IF NOT EXISTS idx_producto_imagen_producto_468
  ON public.producto_imagenes (tenant_id, producto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_producto_imagen_cleanup_468
  ON public.producto_imagenes (tenant_id, deletion_requested_at)
  WHERE estado = 'PENDIENTE_BORRADO';

CREATE TABLE IF NOT EXISTS public.producto_imagen_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  imagen_id uuid REFERENCES public.producto_imagenes(id) ON DELETE RESTRICT,
  accion text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  estado text NOT NULL DEFAULT 'RESERVADA',
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ck_producto_imagen_operacion_accion_468 CHECK (accion IN ('SUBIR', 'ELIMINAR')),
  CONSTRAINT ck_producto_imagen_operacion_key_468
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 180),
  CONSTRAINT ck_producto_imagen_operacion_fingerprint_468
    CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_producto_imagen_operacion_estado_468
    CHECK (estado IN ('RESERVADA', 'COMPLETADA')),
  CONSTRAINT ck_producto_imagen_operacion_completion_468 CHECK (
    (estado = 'RESERVADA' AND completed_at IS NULL)
    OR (estado = 'COMPLETADA' AND completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_imagen_operacion_intent_468
  ON public.producto_imagen_operaciones (tenant_id, accion, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_producto_imagen_operacion_producto_468
  ON public.producto_imagen_operaciones (tenant_id, producto_id, created_at DESC);

SELECT app.apply_tenant_policy('public', 'producto_imagenes');
SELECT app.apply_tenant_policy('public', 'producto_imagen_operaciones');
ALTER TABLE public.producto_imagenes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.producto_imagen_operaciones FORCE ROW LEVEL SECURITY;

-- Las URL de producto sólo pueden cambiar junto con la metadata Storage. Se
-- preservan URL legacy sin tocarlas hasta que el usuario las cambie o elimine.
CREATE OR REPLACE FUNCTION app.guard_product_image_url_468()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF current_setting('app.product_image_writer', true) IS DISTINCT FROM '468' THEN
    IF TG_OP = 'INSERT' AND NULLIF(btrim(COALESCE(NEW.imagen_url, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'PRODUCT_IMAGE_DIRECT_URL_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.imagen_url IS DISTINCT FROM OLD.imagen_url THEN
      RAISE EXCEPTION 'PRODUCT_IMAGE_DIRECT_URL_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_product_image_url_468 ON public.productos;
CREATE TRIGGER trg_guard_product_image_url_468
BEFORE INSERT OR UPDATE OF imagen_url ON public.productos
FOR EACH ROW EXECUTE FUNCTION app.guard_product_image_url_468();

CREATE OR REPLACE FUNCTION public.reservar_imagen_producto_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_producto_id uuid,
  p_idempotency_key text,
  p_sha256 text,
  p_mime_type text,
  p_bytes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_mime text := lower(btrim(COALESCE(p_mime_type, '')));
  v_sha text := lower(btrim(COALESCE(p_sha256, '')));
  v_extension text;
  v_fingerprint text;
  v_existing public.producto_imagen_operaciones%ROWTYPE;
  v_producto public.productos%ROWTYPE;
  v_image_id uuid := gen_random_uuid();
  v_operation_id uuid := gen_random_uuid();
  v_path text;
  v_response jsonb;
BEGIN
  PERFORM app.assert_inventory_master_actor_460(p_tenant_id, p_actor_id);
  IF p_producto_id IS NULL OR length(v_key) NOT BETWEEN 8 AND 180 THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_INTENT_INVALID' USING ERRCODE = '23514';
  END IF;
  IF v_sha !~ '^[0-9a-f]{64}$' OR p_bytes NOT BETWEEN 1 AND 5242880 THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_FILE_INVALID' USING ERRCODE = '23514';
  END IF;
  v_extension := CASE v_mime
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp'
    ELSE NULL
  END;
  IF v_extension IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_MIME_INVALID' USING ERRCODE = '23514';
  END IF;

  SELECT p.* INTO v_producto
  FROM public.productos p
  WHERE p.id = p_producto_id
    AND p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, false)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_PRODUCT_NOT_FOUND_OR_INACTIVE' USING ERRCODE = '23503';
  END IF;

  v_fingerprint := app.inventory_master_fingerprint_460(jsonb_build_object(
    'producto_id', p_producto_id,
    'sha256', v_sha,
    'mime_type', v_mime,
    'bytes', p_bytes
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':PRODUCT_IMAGE:SUBIR:' || v_key,
    468
  ));

  SELECT o.* INTO v_existing
  FROM public.producto_imagen_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.accion = 'SUBIR'
    AND o.idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'PRODUCT_IMAGE_IDEMPOTENCY_ACTOR_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
    IF v_existing.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'PRODUCT_IMAGE_IDEMPOTENCY_KEY_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.response || jsonb_build_object(
      'operation_id', v_existing.id,
      'idempotent', true,
      'completed', v_existing.estado = 'COMPLETADA'
    );
  END IF;

  v_path := p_tenant_id::text || '/' || p_producto_id::text || '/' ||
    v_image_id::text || '.' || v_extension;

  INSERT INTO public.producto_imagenes (
    id, tenant_id, producto_id, object_path, mime_type, bytes, sha256, uploaded_by
  ) VALUES (
    v_image_id, p_tenant_id, p_producto_id, v_path, v_mime, p_bytes, v_sha, p_actor_id
  );

  v_response := jsonb_build_object(
    'operation_id', v_operation_id,
    'producto_id', p_producto_id,
    'imagen_id', v_image_id,
    'bucket_id', 'product-images',
    'object_path', v_path,
    'sha256', v_sha,
    'mime_type', v_mime,
    'bytes', p_bytes,
    'estado', 'RESERVADA',
    'completed', false,
    'idempotent', false
  );
  INSERT INTO public.producto_imagen_operaciones (
    id, tenant_id, actor_id, producto_id, imagen_id, accion,
    idempotency_key, fingerprint, response
  ) VALUES (
    v_operation_id, p_tenant_id, p_actor_id, p_producto_id, v_image_id, 'SUBIR',
    v_key, v_fingerprint, v_response
  );

  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'producto_imagenes', 'INSERT', v_image_id,
    NULL, (SELECT to_jsonb(i) FROM public.producto_imagenes i WHERE i.id = v_image_id),
    'RESERVAR_IMAGEN_PRODUCTO', v_operation_id
  );
  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_imagen_producto_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_operation_id uuid,
  p_public_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_operation public.producto_imagen_operaciones%ROWTYPE;
  v_image_old public.producto_imagenes%ROWTYPE;
  v_image_new public.producto_imagenes%ROWTYPE;
  v_previous public.producto_imagenes%ROWTYPE;
  v_product_old public.productos%ROWTYPE;
  v_product_new public.productos%ROWTYPE;
  v_url text := btrim(COALESCE(p_public_url, ''));
  v_expected_suffix text;
  v_cleanup jsonb := NULL;
  v_response jsonb;
BEGIN
  PERFORM app.assert_inventory_master_actor_460(p_tenant_id, p_actor_id);
  SELECT o.* INTO v_operation
  FROM public.producto_imagen_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.actor_id = p_actor_id
    AND o.accion = 'SUBIR'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_UPLOAD_OPERATION_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF v_operation.estado = 'COMPLETADA' THEN
    RETURN v_operation.response || jsonb_build_object('idempotent', true, 'completed', true);
  END IF;

  SELECT i.* INTO v_image_old
  FROM public.producto_imagenes i
  WHERE i.id = v_operation.imagen_id
    AND i.tenant_id = p_tenant_id
    AND i.producto_id = v_operation.producto_id
  FOR UPDATE;
  IF NOT FOUND OR v_image_old.estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_RESERVATION_INVALID' USING ERRCODE = '23514';
  END IF;

  v_expected_suffix := '/storage/v1/object/public/product-images/' || v_image_old.object_path;
  IF v_url = '' OR length(v_url) > 3000
     OR right(v_url, length(v_expected_suffix)) IS DISTINCT FROM v_expected_suffix
     OR v_url !~ '^https?://' THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_PUBLIC_URL_INVALID' USING ERRCODE = '23514';
  END IF;

  SELECT p.* INTO v_product_old
  FROM public.productos p
  WHERE p.id = v_operation.producto_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(v_product_old.activo, false) THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_PRODUCT_NOT_FOUND_OR_INACTIVE' USING ERRCODE = '23503';
  END IF;

  SELECT i.* INTO v_previous
  FROM public.producto_imagenes i
  WHERE i.tenant_id = p_tenant_id
    AND i.producto_id = v_operation.producto_id
    AND i.estado = 'ACTIVA'
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.producto_imagenes i
    SET estado = 'PENDIENTE_BORRADO',
        reemplazada_por_imagen_id = v_image_old.id,
        deletion_requested_at = now(),
        deleted_by = p_actor_id
    WHERE i.id = v_previous.id;
    v_cleanup := jsonb_build_object(
      'imagen_id', v_previous.id,
      'bucket_id', v_previous.bucket_id,
      'object_path', v_previous.object_path
    );
  END IF;

  UPDATE public.producto_imagenes i
  SET estado = 'ACTIVA',
      public_url = v_url,
      reemplaza_imagen_id = CASE WHEN v_previous.id IS NULL THEN NULL ELSE v_previous.id END,
      activated_at = now()
  WHERE i.id = v_image_old.id
  RETURNING * INTO v_image_new;

  PERFORM set_config('app.product_image_writer', '468', true);
  UPDATE public.productos p
  SET imagen_url = v_url,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE p.id = v_operation.producto_id AND p.tenant_id = p_tenant_id
  RETURNING * INTO v_product_new;

  v_response := jsonb_strip_nulls(jsonb_build_object(
    'operation_id', v_operation.id,
    'producto_id', v_operation.producto_id,
    'imagen_id', v_image_new.id,
    'bucket_id', v_image_new.bucket_id,
    'object_path', v_image_new.object_path,
    'imagen_url', v_image_new.public_url,
    'sha256', v_image_new.sha256,
    'mime_type', v_image_new.mime_type,
    'bytes', v_image_new.bytes,
    'estado', 'ACTIVA',
    'completed', true,
    'idempotent', false,
    'cleanup', v_cleanup
  ));
  UPDATE public.producto_imagen_operaciones o
  SET estado = 'COMPLETADA', response = v_response, completed_at = now()
  WHERE o.id = v_operation.id;

  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'productos', 'UPDATE', v_product_new.id,
    to_jsonb(v_product_old), to_jsonb(v_product_new),
    'FINALIZAR_IMAGEN_PRODUCTO', v_operation.id
  );
  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'producto_imagenes', 'UPDATE', v_image_new.id,
    to_jsonb(v_image_old), to_jsonb(v_image_new),
    'ACTIVAR_IMAGEN_PRODUCTO', v_operation.id
  );
  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reservar_borrado_imagen_producto_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_producto_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_fingerprint text;
  v_existing public.producto_imagen_operaciones%ROWTYPE;
  v_product_old public.productos%ROWTYPE;
  v_product_new public.productos%ROWTYPE;
  v_image_old public.producto_imagenes%ROWTYPE;
  v_image_new public.producto_imagenes%ROWTYPE;
  v_operation_id uuid := gen_random_uuid();
  v_response jsonb;
BEGIN
  PERFORM app.assert_inventory_master_actor_460(p_tenant_id, p_actor_id);
  IF p_producto_id IS NULL OR length(v_key) NOT BETWEEN 8 AND 180 THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_DELETE_INTENT_INVALID' USING ERRCODE = '23514';
  END IF;
  v_fingerprint := app.inventory_master_fingerprint_460(
    jsonb_build_object('producto_id', p_producto_id)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':PRODUCT_IMAGE:ELIMINAR:' || v_key,
    468
  ));

  SELECT o.* INTO v_existing
  FROM public.producto_imagen_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.accion = 'ELIMINAR'
    AND o.idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'PRODUCT_IMAGE_IDEMPOTENCY_ACTOR_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
    IF v_existing.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'PRODUCT_IMAGE_IDEMPOTENCY_KEY_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.response || jsonb_build_object(
      'operation_id', v_existing.id,
      'idempotent', true,
      'completed', v_existing.estado = 'COMPLETADA'
    );
  END IF;

  SELECT p.* INTO v_product_old
  FROM public.productos p
  WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_PRODUCT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  SELECT i.* INTO v_image_old
  FROM public.producto_imagenes i
  WHERE i.tenant_id = p_tenant_id
    AND i.producto_id = p_producto_id
    AND i.estado = 'ACTIVA'
  FOR UPDATE;

  PERFORM set_config('app.product_image_writer', '468', true);
  UPDATE public.productos p
  SET imagen_url = '', updated_by = p_actor_id, updated_at = now()
  WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id
  RETURNING * INTO v_product_new;

  IF NOT FOUND OR v_image_old.id IS NULL THEN
    v_response := jsonb_build_object(
      'operation_id', v_operation_id,
      'producto_id', p_producto_id,
      'estado', 'SIN_OBJETO',
      'legacy_url_removed', NULLIF(btrim(COALESCE(v_product_old.imagen_url, '')), '') IS NOT NULL,
      'completed', true,
      'idempotent', false
    );
    INSERT INTO public.producto_imagen_operaciones (
      id, tenant_id, actor_id, producto_id, accion, idempotency_key,
      fingerprint, estado, response, completed_at
    ) VALUES (
      v_operation_id, p_tenant_id, p_actor_id, p_producto_id, 'ELIMINAR', v_key,
      v_fingerprint, 'COMPLETADA', v_response, now()
    );
  ELSE
    UPDATE public.producto_imagenes i
    SET estado = 'PENDIENTE_BORRADO',
        deletion_requested_at = now(),
        deleted_by = p_actor_id
    WHERE i.id = v_image_old.id
    RETURNING * INTO v_image_new;
    v_response := jsonb_build_object(
      'operation_id', v_operation_id,
      'producto_id', p_producto_id,
      'imagen_id', v_image_new.id,
      'bucket_id', v_image_new.bucket_id,
      'object_path', v_image_new.object_path,
      'estado', 'PENDIENTE_BORRADO',
      'completed', false,
      'idempotent', false
    );
    INSERT INTO public.producto_imagen_operaciones (
      id, tenant_id, actor_id, producto_id, imagen_id, accion,
      idempotency_key, fingerprint, response
    ) VALUES (
      v_operation_id, p_tenant_id, p_actor_id, p_producto_id, v_image_new.id,
      'ELIMINAR', v_key, v_fingerprint, v_response
    );
  END IF;

  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'productos', 'UPDATE', p_producto_id,
    to_jsonb(v_product_old), to_jsonb(v_product_new),
    'RESERVAR_BORRADO_IMAGEN_PRODUCTO', v_operation_id
  );
  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_borrado_imagen_producto_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_operation public.producto_imagen_operaciones%ROWTYPE;
  v_image_old public.producto_imagenes%ROWTYPE;
  v_image_new public.producto_imagenes%ROWTYPE;
  v_response jsonb;
BEGIN
  PERFORM app.assert_inventory_master_actor_460(p_tenant_id, p_actor_id);
  SELECT o.* INTO v_operation
  FROM public.producto_imagen_operaciones o
  WHERE o.id = p_operation_id
    AND o.tenant_id = p_tenant_id
    AND o.actor_id = p_actor_id
    AND o.accion = 'ELIMINAR'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_DELETE_OPERATION_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF v_operation.estado = 'COMPLETADA' THEN
    RETURN v_operation.response || jsonb_build_object('idempotent', true, 'completed', true);
  END IF;

  SELECT i.* INTO v_image_old
  FROM public.producto_imagenes i
  WHERE i.id = v_operation.imagen_id
    AND i.tenant_id = p_tenant_id
    AND i.producto_id = v_operation.producto_id
  FOR UPDATE;
  IF NOT FOUND OR v_image_old.estado <> 'PENDIENTE_BORRADO' THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_DELETE_RESERVATION_INVALID' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.productos p
    WHERE p.id = v_operation.producto_id
      AND p.tenant_id = p_tenant_id
      AND p.imagen_url = v_image_old.public_url
      AND NULLIF(btrim(COALESCE(p.imagen_url, '')), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_STILL_REFERENCED' USING ERRCODE = '23514';
  END IF;

  UPDATE public.producto_imagenes i
  SET estado = 'BORRADA', deleted_at = now(), deleted_by = p_actor_id
  WHERE i.id = v_image_old.id
  RETURNING * INTO v_image_new;
  v_response := jsonb_build_object(
    'operation_id', v_operation.id,
    'producto_id', v_operation.producto_id,
    'imagen_id', v_image_new.id,
    'object_path', v_image_new.object_path,
    'estado', 'BORRADA',
    'completed', true,
    'idempotent', false
  );
  UPDATE public.producto_imagen_operaciones o
  SET estado = 'COMPLETADA', response = v_response, completed_at = now()
  WHERE o.id = v_operation.id;

  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'producto_imagenes', 'UPDATE', v_image_new.id,
    to_jsonb(v_image_old), to_jsonb(v_image_new),
    'FINALIZAR_BORRADO_IMAGEN_PRODUCTO', v_operation.id
  );
  RETURN v_response;
END;
$function$;

-- Limpieza del objeto reemplazado: forma parte de la intención SUBIR ya
-- completada y es idempotente por imagen, sin abrir otro writer público.
CREATE OR REPLACE FUNCTION public.confirmar_limpieza_imagen_producto_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_imagen_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old public.producto_imagenes%ROWTYPE;
  v_new public.producto_imagenes%ROWTYPE;
BEGIN
  PERFORM app.assert_inventory_master_actor_460(p_tenant_id, p_actor_id);
  SELECT i.* INTO v_old
  FROM public.producto_imagenes i
  WHERE i.id = p_imagen_id AND i.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_CLEANUP_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF v_old.estado = 'BORRADA' THEN
    RETURN jsonb_build_object(
      'imagen_id', v_old.id, 'estado', 'BORRADA', 'idempotent', true
    );
  END IF;
  IF v_old.estado <> 'PENDIENTE_BORRADO' OR EXISTS (
    SELECT 1 FROM public.productos p
    WHERE p.id = v_old.producto_id AND p.tenant_id = p_tenant_id
      AND p.imagen_url = v_old.public_url
      AND NULLIF(btrim(COALESCE(p.imagen_url, '')), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PRODUCT_IMAGE_CLEANUP_INVALID' USING ERRCODE = '23514';
  END IF;
  UPDATE public.producto_imagenes i
  SET estado = 'BORRADA', deleted_at = now(), deleted_by = p_actor_id
  WHERE i.id = v_old.id
  RETURNING * INTO v_new;
  RETURN jsonb_build_object(
    'imagen_id', v_new.id, 'estado', 'BORRADA', 'idempotent', false
  );
END;
$function$;

-- El bucket se configura al promover la migración sobre Supabase. Las pruebas
-- PostgreSQL puras no tienen schema storage, por eso el bloque es condicional.
DO $bucket$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (
        id, name, public, file_size_limit, allowed_mime_types
      ) VALUES (
        'product-images', 'product-images', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
      )
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          public = EXCLUDED.public,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types
    $sql$;
  END IF;
END;
$bucket$;

-- Incluso si existiera una política permisiva general, anon/authenticated no
-- pueden listar ni mutar este bucket. service_role (backend) omite RLS y usa la
-- Storage API; la descarga pública sólo usa la URL pública del objeto.
DO $storage_policies$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS product_images_backend_only_select_468 ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS product_images_backend_only_insert_468 ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS product_images_backend_only_update_468 ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS product_images_backend_only_delete_468 ON storage.objects';
    EXECUTE $sql$
      CREATE POLICY product_images_backend_only_select_468
      ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
      USING (bucket_id <> 'product-images')
    $sql$;
    EXECUTE $sql$
      CREATE POLICY product_images_backend_only_insert_468
      ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id <> 'product-images')
    $sql$;
    EXECUTE $sql$
      CREATE POLICY product_images_backend_only_update_468
      ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
      USING (bucket_id <> 'product-images')
      WITH CHECK (bucket_id <> 'product-images')
    $sql$;
    EXECUTE $sql$
      CREATE POLICY product_images_backend_only_delete_468
      ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
      USING (bucket_id <> 'product-images')
    $sql$;
  END IF;
END;
$storage_policies$;

REVOKE ALL ON TABLE public.producto_imagenes,
  public.producto_imagen_operaciones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.producto_imagenes,
  public.producto_imagen_operaciones TO service_role;

REVOKE ALL ON FUNCTION public.reservar_imagen_producto_tx(uuid, uuid, uuid, text, text, text, integer),
  public.finalizar_imagen_producto_tx(uuid, uuid, uuid, text),
  public.reservar_borrado_imagen_producto_tx(uuid, uuid, uuid, text),
  public.finalizar_borrado_imagen_producto_tx(uuid, uuid, uuid),
  public.confirmar_limpieza_imagen_producto_tx(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_imagen_producto_tx(uuid, uuid, uuid, text, text, text, integer),
  public.finalizar_imagen_producto_tx(uuid, uuid, uuid, text),
  public.reservar_borrado_imagen_producto_tx(uuid, uuid, uuid, text),
  public.finalizar_borrado_imagen_producto_tx(uuid, uuid, uuid),
  public.confirmar_limpieza_imagen_producto_tx(uuid, uuid, uuid)
  TO service_role;

COMMENT ON TABLE public.producto_imagenes IS
  'Metadata tenant-scoped de imágenes de producto almacenadas en el bucket Supabase product-images.';
COMMENT ON TABLE public.producto_imagen_operaciones IS
  'Intenciones idempotentes y multi-fase para subir o borrar objetos de producto sin perder consistencia DB/Storage.';
COMMENT ON FUNCTION public.reservar_imagen_producto_tx(uuid, uuid, uuid, text, text, text, integer) IS
  'Reserva metadata y ruta determinística antes de escribir el objeto mediante Storage API.';
COMMENT ON FUNCTION public.finalizar_imagen_producto_tx(uuid, uuid, uuid, text) IS
  'Activa la imagen cargada, cambia productos.imagen_url y reserva la anterior para limpieza en una sola transacción.';

COMMIT;

NOTIFY pgrst, 'reload schema';
