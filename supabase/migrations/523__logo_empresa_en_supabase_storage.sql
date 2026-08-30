-- Logo empresarial en Supabase Storage.
--
-- PostgreSQL reserva la intencion, la ruta tenant-scoped y la metadata; el
-- backend escribe o borra el objeto con service_role. La referencia fiscal se
-- cambia exclusivamente mediante el writer atomico de configuracion 464.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

CREATE TABLE IF NOT EXISTS public.empresa_logo_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bucket_id text NOT NULL DEFAULT 'company-assets',
  object_path text NOT NULL,
  public_url text,
  mime_type text NOT NULL,
  bytes integer NOT NULL,
  sha256 text NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  reemplaza_asset_id uuid REFERENCES public.empresa_logo_assets(id) ON DELETE SET NULL,
  reemplazada_por_asset_id uuid REFERENCES public.empresa_logo_assets(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  deleted_by uuid REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT ck_empresa_logo_bucket_523 CHECK (bucket_id = 'company-assets'),
  CONSTRAINT ck_empresa_logo_mime_523 CHECK (mime_type IN ('image/jpeg', 'image/png')),
  CONSTRAINT ck_empresa_logo_bytes_523 CHECK (bytes BETWEEN 1 AND 2097152),
  CONSTRAINT ck_empresa_logo_sha_523 CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_empresa_logo_path_523 CHECK (
    object_path LIKE tenant_id::text || '/logos/%'
    AND object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png)$'
  ),
  CONSTRAINT ck_empresa_logo_estado_523 CHECK (
    estado IN ('PENDIENTE', 'ACTIVA', 'PENDIENTE_BORRADO', 'BORRADA')
  ),
  CONSTRAINT ck_empresa_logo_activation_523 CHECK (
    estado <> 'ACTIVA' OR (public_url IS NOT NULL AND activated_at IS NOT NULL)
  ),
  CONSTRAINT ck_empresa_logo_deletion_523 CHECK (
    estado <> 'BORRADA' OR deleted_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_empresa_logo_object_523
  ON public.empresa_logo_assets (bucket_id, object_path);
CREATE UNIQUE INDEX IF NOT EXISTS ux_empresa_logo_activa_523
  ON public.empresa_logo_assets (tenant_id) WHERE estado = 'ACTIVA';
CREATE INDEX IF NOT EXISTS idx_empresa_logo_cleanup_523
  ON public.empresa_logo_assets (tenant_id, deletion_requested_at)
  WHERE estado = 'PENDIENTE_BORRADO';
CREATE UNIQUE INDEX IF NOT EXISTS ux_empresa_logo_pending_payload_523
  ON public.empresa_logo_assets (tenant_id, uploaded_by, sha256, mime_type, bytes)
  WHERE estado = 'PENDIENTE';

CREATE TABLE IF NOT EXISTS public.empresa_logo_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES public.empresa_logo_assets(id) ON DELETE RESTRICT,
  accion text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  estado text NOT NULL DEFAULT 'RESERVADA',
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ck_empresa_logo_operacion_accion_523 CHECK (accion IN ('SUBIR', 'ELIMINAR')),
  CONSTRAINT ck_empresa_logo_operacion_key_523
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 180),
  CONSTRAINT ck_empresa_logo_operacion_fingerprint_523
    CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_empresa_logo_operacion_estado_523
    CHECK (estado IN ('RESERVADA', 'COMPLETADA')),
  CONSTRAINT ck_empresa_logo_operacion_completion_523 CHECK (
    (estado = 'RESERVADA' AND completed_at IS NULL)
    OR (estado = 'COMPLETADA' AND completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_empresa_logo_operacion_intent_523
  ON public.empresa_logo_operaciones (tenant_id, accion, idempotency_key);

SELECT app.apply_tenant_policy('public', 'empresa_logo_assets');
SELECT app.apply_tenant_policy('public', 'empresa_logo_operaciones');
ALTER TABLE public.empresa_logo_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_logo_operaciones FORCE ROW LEVEL SECURITY;

-- La columna fiscal no admite nuevas data URLs ni hosts arbitrarios. Instalar el
-- trigger no revalida ni bloquea filas legacy: el DELETE dedicado puede sanear
-- una referencia previa aun cuando todavia no exista metadata de Storage.
CREATE OR REPLACE FUNCTION app.guard_empresa_logo_url_523()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.logo_url IS NOT DISTINCT FROM OLD.logo_url THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NULLIF(btrim(COALESCE(NEW.logo_url, '')), '') IS NULL THEN
    NEW.logo_url := NULL;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.empresa_logo_assets a
    WHERE a.tenant_id = NEW.tenant_id
      AND a.estado = 'ACTIVA'
      AND a.public_url = NEW.logo_url
      AND a.object_path LIKE NEW.tenant_id::text || '/logos/%'
  ) THEN
    RAISE EXCEPTION 'COMPANY_LOGO_DIRECT_URL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_empresa_logo_url_523 ON public.empresa_config;
CREATE TRIGGER trg_guard_empresa_logo_url_523
BEFORE INSERT OR UPDATE OF logo_url ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.guard_empresa_logo_url_523();

CREATE OR REPLACE FUNCTION public.reservar_logo_empresa_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
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
  v_key text := lower(btrim(COALESCE(p_idempotency_key, '')));
  v_mime text := lower(btrim(COALESCE(p_mime_type, '')));
  v_sha text := lower(btrim(COALESCE(p_sha256, '')));
  v_extension text;
  v_fingerprint text;
  v_existing public.empresa_logo_operaciones%ROWTYPE;
  v_adopt public.empresa_logo_operaciones%ROWTYPE;
  v_asset_id uuid := gen_random_uuid();
  v_operation_id uuid := gen_random_uuid();
  v_path text;
  v_response jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  IF length(v_key) NOT BETWEEN 8 AND 180
     OR v_sha !~ '^[0-9a-f]{64}$'
     OR p_bytes NOT BETWEEN 1 AND 2097152 THEN
    RAISE EXCEPTION 'COMPANY_LOGO_INTENT_INVALID' USING ERRCODE = '23514';
  END IF;
  v_extension := CASE v_mime
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
    ELSE NULL
  END;
  IF v_extension IS NULL THEN
    RAISE EXCEPTION 'COMPANY_LOGO_MIME_INVALID' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'COMPANY_LOGO_TENANT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  v_fingerprint := app.configuration_fingerprint_464(jsonb_build_object(
    'tenant_id', p_tenant_id, 'sha256', v_sha, 'mime_type', v_mime, 'bytes', p_bytes
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':COMPANY_LOGO:SUBIR:' || v_key, 523
  ));
  -- Claves distintas del mismo navegador (por ejemplo, tras una recarga) no
  -- deben abrir dos rutas para el mismo contenido. El lock por tenant también
  -- serializa esta adopción con finalizar/reemplazar/eliminar.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'configuration:tenant:' || p_tenant_id::text, 464
  ));
  SELECT o.* INTO v_existing
  FROM public.empresa_logo_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.accion = 'SUBIR' AND o.idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'COMPANY_LOGO_IDEMPOTENCY_ACTOR_MISMATCH' USING ERRCODE = '42501';
    END IF;
    IF v_existing.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'COMPANY_LOGO_IDEMPOTENCY_KEY_DIFFERENT_PAYLOAD' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.response || jsonb_build_object(
      'operation_id', v_existing.id,
      'idempotent', true,
      'completed', v_existing.estado = 'COMPLETADA'
    );
  END IF;

  -- Si la reserva anterior no alcanzó a finalizar, la nueva intención adopta
  -- el mismo asset. Storage responderá 409 cuando el objeto ya exista y el
  -- backend comprobará su SHA antes de finalizarlo.
  SELECT o.* INTO v_adopt
  FROM public.empresa_logo_operaciones o
  JOIN public.empresa_logo_assets a
    ON a.id = o.asset_id AND a.tenant_id = o.tenant_id
  WHERE o.tenant_id = p_tenant_id
    AND o.actor_id = p_actor_id
    AND o.accion = 'SUBIR'
    AND o.fingerprint = v_fingerprint
    AND o.estado = 'RESERVADA'
    AND a.estado = 'PENDIENTE'
  ORDER BY o.created_at, o.id
  LIMIT 1
  FOR UPDATE OF o;
  IF FOUND THEN
    v_response := v_adopt.response || jsonb_build_object(
      'operation_id', v_operation_id,
      'adopted_from_operation_id', v_adopt.id,
      'completed', false,
      'idempotent', false
    );
    INSERT INTO public.empresa_logo_operaciones (
      id, tenant_id, actor_id, asset_id, accion, idempotency_key, fingerprint, response
    ) VALUES (
      v_operation_id, p_tenant_id, p_actor_id, v_adopt.asset_id, 'SUBIR', v_key,
      v_fingerprint, v_response
    );
    RETURN v_response;
  END IF;

  -- Si la transacción sí terminó pero se perdió la respuesta HTTP, una clave
  -- nueva obtiene un alias completado en vez de reemplazar el logo por sí mismo.
  SELECT o.* INTO v_adopt
  FROM public.empresa_logo_operaciones o
  JOIN public.empresa_logo_assets a
    ON a.id = o.asset_id AND a.tenant_id = o.tenant_id
  JOIN public.empresa_config ec
    ON ec.tenant_id = a.tenant_id AND ec.logo_url = a.public_url
  WHERE o.tenant_id = p_tenant_id
    AND o.actor_id = p_actor_id
    AND o.accion = 'SUBIR'
    AND o.fingerprint = v_fingerprint
    AND o.estado = 'COMPLETADA'
    AND a.estado = 'ACTIVA'
  ORDER BY o.completed_at DESC NULLS LAST, o.created_at DESC, o.id
  LIMIT 1
  FOR UPDATE OF o;
  IF FOUND THEN
    v_response := v_adopt.response || jsonb_build_object(
      'operation_id', v_operation_id,
      'adopted_from_operation_id', v_adopt.id,
      'completed', true,
      'idempotent', false
    );
    INSERT INTO public.empresa_logo_operaciones (
      id, tenant_id, actor_id, asset_id, accion, idempotency_key, fingerprint,
      estado, response, completed_at
    ) VALUES (
      v_operation_id, p_tenant_id, p_actor_id, v_adopt.asset_id, 'SUBIR', v_key,
      v_fingerprint, 'COMPLETADA', v_response, now()
    );
    RETURN v_response;
  END IF;

  v_path := p_tenant_id::text || '/logos/' || v_asset_id::text || '.' || v_extension;
  INSERT INTO public.empresa_logo_assets (
    id, tenant_id, object_path, mime_type, bytes, sha256, uploaded_by
  ) VALUES (v_asset_id, p_tenant_id, v_path, v_mime, p_bytes, v_sha, p_actor_id);

  v_response := jsonb_build_object(
    'operation_id', v_operation_id,
    'asset_id', v_asset_id,
    'bucket_id', 'company-assets',
    'object_path', v_path,
    'sha256', v_sha,
    'mime_type', v_mime,
    'bytes', p_bytes,
    'estado', 'RESERVADA',
    'completed', false,
    'idempotent', false
  );
  INSERT INTO public.empresa_logo_operaciones (
    id, tenant_id, actor_id, asset_id, accion, idempotency_key, fingerprint, response
  ) VALUES (
    v_operation_id, p_tenant_id, p_actor_id, v_asset_id, 'SUBIR', v_key,
    v_fingerprint, v_response
  );
  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_logo_empresa_tx(
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
  v_operation public.empresa_logo_operaciones%ROWTYPE;
  v_asset_old public.empresa_logo_assets%ROWTYPE;
  v_asset_new public.empresa_logo_assets%ROWTYPE;
  v_previous public.empresa_logo_assets%ROWTYPE;
  v_url text := btrim(COALESCE(p_public_url, ''));
  v_expected_origin text;
  v_expected_suffix text;
  v_expected_url text;
  v_cleanup jsonb := NULL;
  v_response jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  PERFORM pg_advisory_xact_lock(hashtextextended('configuration:tenant:' || p_tenant_id::text, 464));
  SELECT o.* INTO v_operation
  FROM public.empresa_logo_operaciones o
  WHERE o.id = p_operation_id AND o.tenant_id = p_tenant_id
    AND o.actor_id = p_actor_id AND o.accion = 'SUBIR'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPANY_LOGO_UPLOAD_OPERATION_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF v_operation.estado = 'COMPLETADA' THEN
    RETURN v_operation.response || jsonb_build_object('idempotent', true, 'completed', true);
  END IF;
  SELECT a.* INTO v_asset_old
  FROM public.empresa_logo_assets a
  WHERE a.id = v_operation.asset_id AND a.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_asset_old.estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'COMPANY_LOGO_RESERVATION_INVALID' USING ERRCODE = '23514';
  END IF;

  SELECT 'https://' || d.project_ref || '.supabase.co'
  INTO v_expected_origin
  FROM app.deployment_environment d
  WHERE d.singleton = true
    AND d.environment = 'PROD'
    AND d.project_ref = 'wypnbcptofqdmoynlonq';
  IF v_expected_origin IS NULL THEN
    RAISE EXCEPTION 'COMPANY_LOGO_STORAGE_ORIGIN_NOT_CONFIGURED' USING ERRCODE = '55000';
  END IF;
  v_expected_suffix := '/storage/v1/object/public/company-assets/' || v_asset_old.object_path;
  v_expected_url := v_expected_origin || v_expected_suffix;
  IF v_url = '' OR length(v_url) > 3000 OR v_url IS DISTINCT FROM v_expected_url THEN
    RAISE EXCEPTION 'COMPANY_LOGO_PUBLIC_URL_INVALID' USING ERRCODE = '23514';
  END IF;

  SELECT a.* INTO v_previous
  FROM public.empresa_logo_assets a
  WHERE a.tenant_id = p_tenant_id AND a.estado = 'ACTIVA'
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.empresa_logo_assets a
    SET estado = 'PENDIENTE_BORRADO', reemplazada_por_asset_id = v_asset_old.id,
        deletion_requested_at = now(), deleted_by = p_actor_id
    WHERE a.id = v_previous.id;
    v_cleanup := jsonb_build_object(
      'asset_id', v_previous.id,
      'bucket_id', v_previous.bucket_id,
      'object_path', v_previous.object_path
    );
  END IF;

  UPDATE public.empresa_logo_assets a
  SET estado = 'ACTIVA', public_url = v_url, activated_at = now(),
      reemplaza_asset_id = CASE WHEN v_previous.id IS NULL THEN NULL ELSE v_previous.id END
  WHERE a.id = v_asset_old.id
  RETURNING * INTO v_asset_new;

  PERFORM public.actualizar_empresa_config_tx(
    p_tenant_id, p_actor_id, 'logo-523:' || v_operation.id::text,
    'EMPRESA', jsonb_build_object('logo_url', v_url)
  );

  v_response := jsonb_strip_nulls(jsonb_build_object(
    'operation_id', v_operation.id,
    'asset_id', v_asset_new.id,
    'bucket_id', v_asset_new.bucket_id,
    'object_path', v_asset_new.object_path,
    'logo_url', v_asset_new.public_url,
    'sha256', v_asset_new.sha256,
    'mime_type', v_asset_new.mime_type,
    'bytes', v_asset_new.bytes,
    'estado', 'ACTIVA',
    'completed', true,
    'idempotent', false,
    'cleanup', v_cleanup
  ));
  UPDATE public.empresa_logo_operaciones o
  SET estado = 'COMPLETADA',
      response = v_response || jsonb_build_object(
        'operation_id', o.id,
        'idempotent', o.id IS DISTINCT FROM v_operation.id
      ),
      completed_at = now()
  WHERE o.tenant_id = p_tenant_id AND o.asset_id = v_asset_new.id
    AND o.accion = 'SUBIR' AND o.estado = 'RESERVADA';
  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirmar_limpieza_logo_empresa_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old public.empresa_logo_assets%ROWTYPE;
  v_new public.empresa_logo_assets%ROWTYPE;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  SELECT a.* INTO v_old FROM public.empresa_logo_assets a
  WHERE a.id = p_asset_id AND a.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPANY_LOGO_CLEANUP_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF v_old.estado = 'BORRADA' THEN
    UPDATE public.empresa_logo_operaciones o
    SET estado = 'COMPLETADA',
        response = jsonb_build_object(
          'operation_id', o.id, 'asset_id', v_old.id,
          'object_path', v_old.object_path, 'logo_url', NULL,
          'estado', 'BORRADA', 'completed', true, 'idempotent', true
        ),
        completed_at = COALESCE(o.completed_at, now())
    WHERE o.tenant_id = p_tenant_id AND o.asset_id = v_old.id
      AND o.accion = 'ELIMINAR' AND o.estado = 'RESERVADA';
    RETURN jsonb_build_object('asset_id', v_old.id, 'estado', 'BORRADA', 'idempotent', true);
  END IF;
  IF v_old.estado <> 'PENDIENTE_BORRADO' OR EXISTS (
    SELECT 1 FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id AND ec.logo_url = v_old.public_url
  ) THEN
    RAISE EXCEPTION 'COMPANY_LOGO_CLEANUP_INVALID' USING ERRCODE = '23514';
  END IF;
  UPDATE public.empresa_logo_assets a
  SET estado = 'BORRADA', deleted_at = now(), deleted_by = p_actor_id
  WHERE a.id = v_old.id RETURNING * INTO v_new;
  UPDATE public.empresa_logo_operaciones o
  SET estado = 'COMPLETADA',
      response = jsonb_build_object(
        'operation_id', o.id, 'asset_id', v_new.id,
        'object_path', v_new.object_path, 'logo_url', NULL,
        'estado', 'BORRADA', 'completed', true, 'idempotent', true
      ),
      completed_at = now()
  WHERE o.tenant_id = p_tenant_id AND o.asset_id = v_new.id
    AND o.accion = 'ELIMINAR' AND o.estado = 'RESERVADA';
  RETURN jsonb_build_object('asset_id', v_new.id, 'estado', 'BORRADA', 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_limpiezas_logo_empresa_tx(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  RETURN jsonb_build_object(
    'cleanup', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'asset_id', a.id,
          'bucket_id', a.bucket_id,
          'object_path', a.object_path
        ) ORDER BY a.deletion_requested_at NULLS LAST, a.created_at, a.id
      )
      FROM public.empresa_logo_assets a
      WHERE a.tenant_id = p_tenant_id
        AND a.estado = 'PENDIENTE_BORRADO'
        AND NOT EXISTS (
          SELECT 1 FROM public.empresa_config ec
          WHERE ec.tenant_id = p_tenant_id AND ec.logo_url = a.public_url
        )
    ), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reservar_borrado_logo_empresa_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := lower(btrim(COALESCE(p_idempotency_key, '')));
  v_fingerprint text;
  v_existing public.empresa_logo_operaciones%ROWTYPE;
  v_asset public.empresa_logo_assets%ROWTYPE;
  v_operation_id uuid := gen_random_uuid();
  v_response jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  IF length(v_key) NOT BETWEEN 8 AND 180 THEN
    RAISE EXCEPTION 'COMPANY_LOGO_DELETE_INTENT_INVALID' USING ERRCODE = '23514';
  END IF;
  v_fingerprint := app.configuration_fingerprint_464(
    jsonb_build_object('tenant_id', p_tenant_id, 'action', 'ELIMINAR')
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':COMPANY_LOGO:ELIMINAR:' || v_key, 523
  ));
  SELECT o.* INTO v_existing FROM public.empresa_logo_operaciones o
  WHERE o.tenant_id = p_tenant_id AND o.accion = 'ELIMINAR' AND o.idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'COMPANY_LOGO_IDEMPOTENCY_ACTOR_MISMATCH' USING ERRCODE = '42501';
    END IF;
    RETURN v_existing.response || jsonb_build_object(
      'operation_id', v_existing.id, 'idempotent', true,
      'completed', v_existing.estado = 'COMPLETADA'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('configuration:tenant:' || p_tenant_id::text, 464));
  SELECT a.* INTO v_asset FROM public.empresa_logo_assets a
  WHERE a.tenant_id = p_tenant_id AND a.estado = 'ACTIVA' FOR UPDATE;

  IF v_asset.id IS NULL THEN
    SELECT a.* INTO v_asset FROM public.empresa_logo_assets a
    WHERE a.tenant_id = p_tenant_id AND a.estado = 'PENDIENTE_BORRADO'
      AND NOT EXISTS (
        SELECT 1 FROM public.empresa_config ec
        WHERE ec.tenant_id = p_tenant_id AND ec.logo_url = a.public_url
      )
    ORDER BY a.deletion_requested_at NULLS LAST, a.created_at, a.id
    LIMIT 1 FOR UPDATE;

    IF v_asset.id IS NULL THEN
      PERFORM public.actualizar_empresa_config_tx(
        p_tenant_id, p_actor_id, 'logo-delete-523:' || v_operation_id::text,
        'EMPRESA', jsonb_build_object('logo_url', NULL)
      );
      v_response := jsonb_build_object(
        'operation_id', v_operation_id, 'logo_url', NULL, 'estado', 'SIN_OBJETO',
        'completed', true, 'idempotent', false
      );
      INSERT INTO public.empresa_logo_operaciones (
        id, tenant_id, actor_id, accion, idempotency_key, fingerprint,
        estado, response, completed_at
      ) VALUES (
        v_operation_id, p_tenant_id, p_actor_id, 'ELIMINAR', v_key, v_fingerprint,
        'COMPLETADA', v_response, now()
      );
      RETURN v_response;
    END IF;
  END IF;

  UPDATE public.empresa_logo_assets a
  SET estado = 'PENDIENTE_BORRADO', deletion_requested_at = now(), deleted_by = p_actor_id
  WHERE a.id = v_asset.id;
  PERFORM public.actualizar_empresa_config_tx(
    p_tenant_id, p_actor_id, 'logo-delete-523:' || v_operation_id::text,
    'EMPRESA', jsonb_build_object('logo_url', NULL)
  );
  v_response := jsonb_build_object(
    'operation_id', v_operation_id, 'asset_id', v_asset.id,
    'bucket_id', v_asset.bucket_id, 'object_path', v_asset.object_path,
    'logo_url', NULL, 'estado', 'PENDIENTE_BORRADO',
    'completed', false, 'idempotent', false
  );
  INSERT INTO public.empresa_logo_operaciones (
    id, tenant_id, actor_id, asset_id, accion, idempotency_key, fingerprint, response
  ) VALUES (
    v_operation_id, p_tenant_id, p_actor_id, v_asset.id, 'ELIMINAR', v_key,
    v_fingerprint, v_response
  );
  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_borrado_logo_empresa_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_operation public.empresa_logo_operaciones%ROWTYPE;
  v_asset public.empresa_logo_assets%ROWTYPE;
  v_response jsonb;
BEGIN
  PERFORM app.assert_configuration_actor_464(p_tenant_id, p_actor_id, false);
  SELECT o.* INTO v_operation FROM public.empresa_logo_operaciones o
  WHERE o.id = p_operation_id AND o.tenant_id = p_tenant_id
    AND o.actor_id = p_actor_id AND o.accion = 'ELIMINAR' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPANY_LOGO_DELETE_OPERATION_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF v_operation.estado = 'COMPLETADA' THEN
    RETURN v_operation.response || jsonb_build_object('idempotent', true, 'completed', true);
  END IF;
  SELECT a.* INTO v_asset FROM public.empresa_logo_assets a
  WHERE a.id = v_operation.asset_id AND a.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_asset.estado <> 'PENDIENTE_BORRADO' OR EXISTS (
    SELECT 1 FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id AND ec.logo_url = v_asset.public_url
  ) THEN
    RAISE EXCEPTION 'COMPANY_LOGO_DELETE_RESERVATION_INVALID' USING ERRCODE = '23514';
  END IF;
  UPDATE public.empresa_logo_assets a
  SET estado = 'BORRADA', deleted_at = now(), deleted_by = p_actor_id
  WHERE a.id = v_asset.id;
  v_response := jsonb_build_object(
    'operation_id', v_operation.id, 'asset_id', v_asset.id,
    'object_path', v_asset.object_path, 'logo_url', NULL,
    'estado', 'BORRADA', 'completed', true, 'idempotent', false
  );
  UPDATE public.empresa_logo_operaciones o
  SET estado = 'COMPLETADA',
      response = v_response || jsonb_build_object(
        'operation_id', o.id,
        'idempotent', o.id IS DISTINCT FROM v_operation.id
      ),
      completed_at = now()
  WHERE o.tenant_id = p_tenant_id AND o.asset_id = v_asset.id
    AND o.accion = 'ELIMINAR' AND o.estado = 'RESERVADA';
  RETURN v_response;
END;
$function$;

DO $bucket$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES (
        'company-assets', 'company-assets', true, 2097152,
        ARRAY['image/jpeg', 'image/png']::text[]
      )
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, public = EXCLUDED.public,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types
    $sql$;
  END IF;
END;
$bucket$;

-- La URL publica puede descargarse, pero los clientes no pueden listar ni
-- mutar objetos del bucket. service_role omite RLS y es el unico writer.
DO $storage_policies$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS company_assets_backend_only_select_523 ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS company_assets_backend_only_insert_523 ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS company_assets_backend_only_update_523 ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS company_assets_backend_only_delete_523 ON storage.objects';
    EXECUTE $sql$ CREATE POLICY company_assets_backend_only_select_523
      ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
      USING (bucket_id <> 'company-assets') $sql$;
    EXECUTE $sql$ CREATE POLICY company_assets_backend_only_insert_523
      ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id <> 'company-assets') $sql$;
    EXECUTE $sql$ CREATE POLICY company_assets_backend_only_update_523
      ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
      USING (bucket_id <> 'company-assets') WITH CHECK (bucket_id <> 'company-assets') $sql$;
    EXECUTE $sql$ CREATE POLICY company_assets_backend_only_delete_523
      ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
      USING (bucket_id <> 'company-assets') $sql$;
  END IF;
END;
$storage_policies$;

REVOKE ALL ON TABLE public.empresa_logo_assets, public.empresa_logo_operaciones
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.empresa_logo_assets, public.empresa_logo_operaciones
  TO service_role;

REVOKE ALL ON FUNCTION
  public.reservar_logo_empresa_tx(uuid,uuid,text,text,text,integer),
  public.finalizar_logo_empresa_tx(uuid,uuid,uuid,text),
  public.confirmar_limpieza_logo_empresa_tx(uuid,uuid,uuid),
  public.listar_limpiezas_logo_empresa_tx(uuid,uuid),
  public.reservar_borrado_logo_empresa_tx(uuid,uuid,text),
  public.finalizar_borrado_logo_empresa_tx(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.reservar_logo_empresa_tx(uuid,uuid,text,text,text,integer),
  public.finalizar_logo_empresa_tx(uuid,uuid,uuid,text),
  public.confirmar_limpieza_logo_empresa_tx(uuid,uuid,uuid),
  public.listar_limpiezas_logo_empresa_tx(uuid,uuid),
  public.reservar_borrado_logo_empresa_tx(uuid,uuid,text),
  public.finalizar_borrado_logo_empresa_tx(uuid,uuid,uuid)
  TO service_role;

COMMENT ON TABLE public.empresa_logo_assets IS
  'Metadata tenant-scoped del logo empresarial almacenado en company-assets.';
COMMENT ON TABLE public.empresa_logo_operaciones IS
  'Intenciones idempotentes para coordinar empresa_config y Supabase Storage.';

COMMIT;

NOTIFY pgrst, 'reload schema';
