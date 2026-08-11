-- Identidad canónica y mutaciones atómicas para clientes/proveedores.
-- No consulta padrones externos ni habilita emisión legal: conserva únicamente
-- la identidad que el cliente configura y evita duplicados/reintentos parciales.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

CREATE OR REPLACE FUNCTION app.normalizar_identidad_comercial_459(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT NULLIF(regexp_replace(upper(btrim(COALESCE(p_value, ''))), '[^0-9A-Z]', '', 'g'), '')
$function$;

CREATE OR REPLACE FUNCTION app.fingerprint_comercial_459(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(COALESCE(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION app.assert_actor_comercial_459(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND COALESCE(u.activo, false)
      AND lower(COALESCE(u.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_MASTER_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.auditar_comercial_459(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_table_name text,
  p_operation text,
  p_record_id uuid,
  p_old jsonb,
  p_new jsonb,
  p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id,
    old_values, new_values, changed_fields, metadata
  ) VALUES (
    p_tenant_id, p_actor_id, p_table_name, upper(p_operation), p_record_id::text,
    p_old, p_new,
    CASE
      WHEN upper(p_operation) = 'UPDATE' THEN (
        SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb)
        FROM (
          SELECT key AS k FROM jsonb_each(COALESCE(p_old, '{}'::jsonb))
          UNION
          SELECT key AS k FROM jsonb_each(COALESCE(p_new, '{}'::jsonb))
        ) keys
        WHERE COALESCE(p_old, '{}'::jsonb)->k IS DISTINCT FROM COALESCE(p_new, '{}'::jsonb)->k
      )
      ELSE NULL
    END,
    jsonb_build_object('accion', p_action, 'source', 'commercial_parties_459')
  );
END;
$function$;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS documento_identidad text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS creation_fingerprint text;

ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS documento_identidad text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS creation_fingerprint text;

UPDATE public.clientes c
SET documento_identidad = app.normalizar_identidad_comercial_459(
  COALESCE(NULLIF(c.ruc, ''), NULLIF(c.codigo, ''), c.numero_documento::text, c.documento_numero::text)
)
WHERE c.documento_identidad IS NULL;

UPDATE public.proveedores p
SET documento_identidad = app.normalizar_identidad_comercial_459(
  COALESCE(NULLIF(p.ruc, ''), NULLIF(p.documento_numero, ''), NULLIF(p.numero_documento, ''), NULLIF(p.codigo, ''))
)
WHERE p.documento_identidad IS NULL;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.tenant_id IS NOT NULL AND c.documento_identidad IS NOT NULL
    GROUP BY c.tenant_id, c.documento_identidad
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_MASTER_DUPLICATE_CUSTOMERS_PREFLIGHT' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.proveedores p
    WHERE p.tenant_id IS NOT NULL AND p.documento_identidad IS NOT NULL
    GROUP BY p.tenant_id, p.documento_identidad
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_MASTER_DUPLICATE_SUPPLIERS_PREFLIGHT' USING ERRCODE = '23505';
  END IF;
END;
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_tenant_identidad_459
ON public.clientes (tenant_id, documento_identidad)
WHERE tenant_id IS NOT NULL AND documento_identidad IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_tenant_identidad_459
ON public.proveedores (tenant_id, documento_identidad)
WHERE tenant_id IS NOT NULL AND documento_identidad IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_tenant_activo_nombre_459
ON public.clientes (tenant_id, activo, razon_social);

CREATE INDEX IF NOT EXISTS idx_proveedores_tenant_activo_nombre_459
ON public.proveedores (tenant_id, activo, razon_social);

CREATE OR REPLACE FUNCTION app.normalize_commercial_party_row_459()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_identity text;
  v_doc_type text;
BEGIN
  v_identity := app.normalizar_identidad_comercial_459(
    COALESCE(
      to_jsonb(NEW)->>'documento_identidad',
      to_jsonb(NEW)->>'ruc',
      to_jsonb(NEW)->>'codigo',
      to_jsonb(NEW)->>'documento_numero',
      to_jsonb(NEW)->>'numero_documento'
    )
  );
  v_doc_type := upper(NULLIF(btrim(COALESCE(NEW.documento_tipo, NEW.tipo_documento, '')), ''));

  NEW.documento_identidad := v_identity;
  NEW.documento_tipo := v_doc_type;
  NEW.tipo_documento := v_doc_type;
  NEW.razon_social := NULLIF(btrim(COALESCE(NEW.razon_social, NEW.nombre, '')), '');
  NEW.nombre := COALESCE(NEW.razon_social, NEW.nombre);
  NEW.nombre_comercial := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre_comercial, '')), ''), NEW.razon_social);
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.codigo := COALESCE(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''), v_identity);

  IF TG_TABLE_NAME = 'proveedores' THEN
    NEW.ruc := v_identity;
  ELSE
    NEW.ruc := CASE WHEN v_doc_type IN ('RUC', 'CUIT', 'NIT') THEN v_identity ELSE NULL END;
  END IF;

  NEW.activo := COALESCE(NEW.activo, lower(COALESCE(NEW.estado::text, 'activo')) = 'activo');
  NEW.estado := CASE WHEN NEW.activo THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_normalize_commercial_party_459 ON public.clientes;
CREATE TRIGGER trg_normalize_commercial_party_459
BEFORE INSERT OR UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION app.normalize_commercial_party_row_459();

DROP TRIGGER IF EXISTS trg_normalize_commercial_party_459 ON public.proveedores;
CREATE TRIGGER trg_normalize_commercial_party_459
BEFORE INSERT OR UPDATE ON public.proveedores
FOR EACH ROW EXECUTE FUNCTION app.normalize_commercial_party_row_459();

CREATE OR REPLACE FUNCTION public.crear_cliente_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cliente jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_doc text := app.normalizar_identidad_comercial_459(COALESCE(p_cliente->>'documento_identidad', p_cliente->>'documento_numero', p_cliente->>'ruc'));
  v_doc_type text := upper(NULLIF(btrim(COALESCE(p_cliente->>'documento_tipo', p_cliente->>'tipo_documento', '')), ''));
  v_party_type text := upper(NULLIF(btrim(COALESCE(p_cliente->>'tipo', '')), ''));
  v_name text := NULLIF(btrim(COALESCE(p_cliente->>'razon_social', '')), '');
  v_number integer;
  v_fingerprint text;
  v_existing public.clientes;
  v_created public.clientes;
BEGIN
  PERFORM app.assert_actor_comercial_459(p_tenant_id, p_actor_id);
  IF v_doc IS NULL OR v_doc_type IS NULL OR v_name IS NULL OR v_party_type NOT IN ('PERSONA', 'EMPRESA') THEN
    RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;
  IF v_doc_type IN ('RUC', 'CUIT') AND v_doc !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_INVALID_TAX_ID' USING ERRCODE = '22023';
  ELSIF v_doc_type = 'NIT' AND v_doc !~ '^[0-9]{9,10}$' THEN
    RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_INVALID_NIT' USING ERRCODE = '22023';
  ELSIF v_doc_type = 'DNI' AND v_doc !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_INVALID_DNI' USING ERRCODE = '22023';
  ELSIF v_doc_type IN ('CC', 'TI') AND v_doc !~ '^[0-9]{6,10}$' THEN
    RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_INVALID_ID' USING ERRCODE = '22023';
  ELSIF length(v_doc) < 6 OR length(v_doc) > 20 THEN
    RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_INVALID_ID_LENGTH' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := app.fingerprint_comercial_459(jsonb_build_object(
    'documento', v_doc, 'documento_tipo', v_doc_type, 'tipo', v_party_type,
    'razon_social', v_name,
    'nombre_comercial', NULLIF(btrim(COALESCE(p_cliente->>'nombre_comercial', '')), ''),
    'direccion', NULLIF(btrim(COALESCE(p_cliente->>'direccion', '')), ''),
    'email', NULLIF(lower(btrim(COALESCE(p_cliente->>'email', ''))), ''),
    'telefono', NULLIF(btrim(COALESCE(p_cliente->>'telefono', '')), '')
  ));

  IF v_doc ~ '^[0-9]+$' AND v_doc::numeric <= 2147483647 THEN
    v_number := v_doc::integer;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':cliente:' || v_doc, 0));
  SELECT * INTO v_existing
  FROM public.clientes c
  WHERE c.tenant_id = p_tenant_id AND c.documento_identidad = v_doc
  FOR UPDATE;

  IF FOUND THEN
    IF NOT COALESCE(v_existing.activo, true) THEN
      UPDATE public.clientes c SET
        tipo = v_party_type,
        documento_tipo = v_doc_type,
        tipo_documento = v_doc_type,
        documento_identidad = v_doc,
        documento_numero = v_number,
        numero_documento = v_number,
        razon_social = v_name,
        nombre = v_name,
        nombre_comercial = NULLIF(btrim(COALESCE(p_cliente->>'nombre_comercial', '')), ''),
        codigo = v_doc,
        ruc = CASE WHEN v_doc_type IN ('RUC', 'CUIT', 'NIT') THEN v_doc ELSE NULL END,
        direccion = NULLIF(btrim(COALESCE(p_cliente->>'direccion', '')), ''),
        email = NULLIF(lower(btrim(COALESCE(p_cliente->>'email', ''))), ''),
        telefono = NULLIF(btrim(COALESCE(p_cliente->>'telefono', '')), ''),
        activo = true,
        estado = 'ACTIVO',
        updated_by = p_actor_id,
        updated_at = now(),
        creation_fingerprint = v_fingerprint
      WHERE c.id = v_existing.id AND c.tenant_id = p_tenant_id
      RETURNING * INTO v_created;
      PERFORM app.auditar_comercial_459(
        p_tenant_id, p_actor_id, 'clientes', 'UPDATE', v_created.id,
        to_jsonb(v_existing), to_jsonb(v_created), 'REACTIVAR_CLIENTE'
      );
      RETURN to_jsonb(v_created) || jsonb_build_object('idempotent', false, 'reactivated', true);
    END IF;
    IF v_existing.creation_fingerprint = v_fingerprint THEN
      RETURN to_jsonb(v_existing) || jsonb_build_object('idempotent', true);
    END IF;
    RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_IDENTITY_CONFLICT' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.clientes (
    tenant_id, tipo, documento_tipo, tipo_documento, documento_identidad,
    documento_numero, numero_documento, razon_social, nombre, nombre_comercial,
    codigo, ruc, direccion, email, telefono, activo, estado,
    created_by, updated_by, creation_fingerprint
  ) VALUES (
    p_tenant_id, v_party_type, v_doc_type, v_doc_type, v_doc,
    v_number, v_number, v_name, v_name,
    NULLIF(btrim(COALESCE(p_cliente->>'nombre_comercial', '')), ''),
    v_doc, CASE WHEN v_doc_type IN ('RUC', 'CUIT', 'NIT') THEN v_doc ELSE NULL END,
    NULLIF(btrim(COALESCE(p_cliente->>'direccion', '')), ''),
    NULLIF(lower(btrim(COALESCE(p_cliente->>'email', ''))), ''),
    NULLIF(btrim(COALESCE(p_cliente->>'telefono', '')), ''),
    true, 'ACTIVO', p_actor_id, p_actor_id, v_fingerprint
  ) RETURNING * INTO v_created;

  PERFORM app.auditar_comercial_459(
    p_tenant_id, p_actor_id, 'clientes', 'INSERT', v_created.id,
    NULL, to_jsonb(v_created), 'CREAR_CLIENTE'
  );
  RETURN to_jsonb(v_created) || jsonb_build_object('idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_cliente_maestro_tx(
  p_cliente_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cambios jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old public.clientes;
  v_new public.clientes;
  v_doc text;
  v_doc_type text;
  v_number integer;
  v_name text;
BEGIN
  PERFORM app.assert_actor_comercial_459(p_tenant_id, p_actor_id);
  SELECT * INTO v_old FROM public.clientes c
  WHERE c.id = p_cliente_id AND c.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  v_doc := CASE WHEN p_cambios ? 'documento_numero' OR p_cambios ? 'documento_identidad'
    THEN app.normalizar_identidad_comercial_459(COALESCE(p_cambios->>'documento_identidad', p_cambios->>'documento_numero'))
    ELSE v_old.documento_identidad END;
  v_doc_type := CASE WHEN p_cambios ? 'documento_tipo'
    THEN upper(NULLIF(btrim(p_cambios->>'documento_tipo'), '')) ELSE v_old.documento_tipo END;
  v_name := CASE WHEN p_cambios ? 'razon_social'
    THEN NULLIF(btrim(p_cambios->>'razon_social'), '') ELSE v_old.razon_social END;
  IF v_doc IS NULL OR v_doc_type IS NULL OR v_name IS NULL OR length(v_doc) NOT BETWEEN 6 AND 20 THEN
    RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_INVALID_UPDATE' USING ERRCODE = '22023';
  END IF;
  IF v_doc ~ '^[0-9]+$' AND v_doc::numeric <= 2147483647 THEN v_number := v_doc::integer; END IF;

  UPDATE public.clientes c SET
    tipo = CASE WHEN p_cambios ? 'tipo' THEN upper(p_cambios->>'tipo') ELSE c.tipo END,
    documento_tipo = v_doc_type,
    tipo_documento = v_doc_type,
    documento_identidad = v_doc,
    documento_numero = v_number,
    numero_documento = v_number,
    codigo = v_doc,
    ruc = CASE WHEN v_doc_type IN ('RUC', 'CUIT', 'NIT') THEN v_doc ELSE NULL END,
    razon_social = v_name,
    nombre = v_name,
    nombre_comercial = CASE WHEN p_cambios ? 'nombre_comercial' THEN NULLIF(btrim(p_cambios->>'nombre_comercial'), '') ELSE c.nombre_comercial END,
    direccion = CASE WHEN p_cambios ? 'direccion' THEN NULLIF(btrim(p_cambios->>'direccion'), '') ELSE c.direccion END,
    email = CASE WHEN p_cambios ? 'email' THEN NULLIF(lower(btrim(p_cambios->>'email')), '') ELSE c.email END,
    telefono = CASE WHEN p_cambios ? 'telefono' THEN NULLIF(btrim(p_cambios->>'telefono'), '') ELSE c.telefono END,
    activo = CASE WHEN p_cambios ? 'activo' THEN COALESCE((p_cambios->>'activo')::boolean, c.activo) ELSE c.activo END,
    updated_by = p_actor_id,
    updated_at = now()
  WHERE c.id = p_cliente_id AND c.tenant_id = p_tenant_id
  RETURNING * INTO v_new;

  PERFORM app.auditar_comercial_459(
    p_tenant_id, p_actor_id, 'clientes', 'UPDATE', p_cliente_id,
    to_jsonb(v_old), to_jsonb(v_new), 'EDITAR_CLIENTE'
  );
  RETURN to_jsonb(v_new);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_IDENTITY_CONFLICT' USING ERRCODE = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.desactivar_cliente_maestro_tx(
  p_cliente_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old public.clientes;
  v_new public.clientes;
BEGIN
  PERFORM app.assert_actor_comercial_459(p_tenant_id, p_actor_id);
  SELECT * INTO v_old FROM public.clientes c
  WHERE c.id = p_cliente_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT COALESCE(v_old.activo, true) THEN
    RETURN to_jsonb(v_old) || jsonb_build_object('idempotent', true);
  END IF;
  UPDATE public.clientes SET activo = false, estado = 'INACTIVO', updated_by = p_actor_id, updated_at = now()
  WHERE id = p_cliente_id AND tenant_id = p_tenant_id RETURNING * INTO v_new;
  PERFORM app.auditar_comercial_459(p_tenant_id, p_actor_id, 'clientes', 'UPDATE', p_cliente_id, to_jsonb(v_old), to_jsonb(v_new), 'DESACTIVAR_CLIENTE');
  RETURN to_jsonb(v_new) || jsonb_build_object('idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_proveedor_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_proveedor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_doc text := app.normalizar_identidad_comercial_459(COALESCE(p_proveedor->>'documento_identidad', p_proveedor->>'ruc', p_proveedor->>'documento_numero'));
  v_doc_type text := upper(COALESCE(NULLIF(btrim(p_proveedor->>'documento_tipo'), ''), 'RUC'));
  v_name text := NULLIF(btrim(COALESCE(p_proveedor->>'razon_social', '')), '');
  v_fingerprint text;
  v_existing public.proveedores;
  v_created public.proveedores;
BEGIN
  PERFORM app.assert_actor_comercial_459(p_tenant_id, p_actor_id);
  IF v_doc IS NULL OR length(v_doc) NOT BETWEEN 9 AND 20 OR v_name IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(lower(btrim(COALESCE(p_proveedor->>'email', ''))), '') IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_EMAIL_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF COALESCE((p_proveedor->>'limite_credito')::numeric, 0) < 0 OR COALESCE((p_proveedor->>'dias_credito')::integer, 0) < 0 THEN
    RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_CREDIT_INVALID' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := app.fingerprint_comercial_459(jsonb_build_object(
    'documento', v_doc, 'documento_tipo', v_doc_type, 'razon_social', v_name,
    'nombre_comercial', NULLIF(btrim(COALESCE(p_proveedor->>'nombre_comercial', '')), ''),
    'direccion', NULLIF(btrim(COALESCE(p_proveedor->>'direccion', '')), ''),
    'telefono', NULLIF(btrim(COALESCE(p_proveedor->>'telefono', '')), ''),
    'email', NULLIF(lower(btrim(COALESCE(p_proveedor->>'email', ''))), ''),
    'contacto', NULLIF(btrim(COALESCE(p_proveedor->>'contacto', '')), ''),
    'condiciones_pago', upper(COALESCE(NULLIF(btrim(p_proveedor->>'condiciones_pago'), ''), 'CONTADO')),
    'limite_credito', COALESCE((p_proveedor->>'limite_credito')::numeric, 0),
    'dias_credito', COALESCE((p_proveedor->>'dias_credito')::integer, 0)
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':proveedor:' || v_doc, 0));
  SELECT * INTO v_existing FROM public.proveedores p
  WHERE p.tenant_id = p_tenant_id AND p.documento_identidad = v_doc FOR UPDATE;
  IF FOUND THEN
    IF NOT COALESCE(v_existing.activo, true) THEN
      UPDATE public.proveedores p SET
        documento_identidad = v_doc,
        ruc = v_doc,
        documento_tipo = v_doc_type,
        tipo_documento = v_doc_type,
        documento_numero = v_doc,
        numero_documento = v_doc,
        razon_social = v_name,
        nombre = v_name,
        nombre_comercial = COALESCE(NULLIF(btrim(p_proveedor->>'nombre_comercial'), ''), v_name),
        codigo = v_doc,
        direccion = NULLIF(btrim(p_proveedor->>'direccion'), ''),
        telefono = NULLIF(btrim(p_proveedor->>'telefono'), ''),
        email = NULLIF(lower(btrim(p_proveedor->>'email')), ''),
        contacto = NULLIF(btrim(p_proveedor->>'contacto'), ''),
        condiciones_pago = upper(COALESCE(NULLIF(btrim(p_proveedor->>'condiciones_pago'), ''), 'CONTADO')),
        limite_credito = COALESCE((p_proveedor->>'limite_credito')::numeric, 0),
        dias_credito = COALESCE((p_proveedor->>'dias_credito')::integer, 0),
        estado = 'ACTIVO',
        activo = true,
        updated_by = p_actor_id,
        updated_at = now(),
        creation_fingerprint = v_fingerprint
      WHERE p.id = v_existing.id AND p.tenant_id = p_tenant_id
      RETURNING * INTO v_created;
      PERFORM app.auditar_comercial_459(
        p_tenant_id, p_actor_id, 'proveedores', 'UPDATE', v_created.id,
        to_jsonb(v_existing), to_jsonb(v_created), 'REACTIVAR_PROVEEDOR'
      );
      RETURN to_jsonb(v_created) || jsonb_build_object('idempotent', false, 'reactivated', true);
    END IF;
    IF v_existing.creation_fingerprint = v_fingerprint THEN
      RETURN to_jsonb(v_existing) || jsonb_build_object('idempotent', true);
    END IF;
    RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_IDENTITY_CONFLICT' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.proveedores (
    tenant_id, documento_identidad, ruc, documento_tipo, tipo_documento,
    documento_numero, numero_documento, razon_social, nombre, nombre_comercial,
    codigo, direccion, telefono, email, contacto, condiciones_pago,
    limite_credito, dias_credito, estado, activo, created_by, updated_by, creation_fingerprint
  ) VALUES (
    p_tenant_id, v_doc, v_doc, v_doc_type, v_doc_type, v_doc, v_doc,
    v_name, v_name, COALESCE(NULLIF(btrim(p_proveedor->>'nombre_comercial'), ''), v_name),
    v_doc, NULLIF(btrim(p_proveedor->>'direccion'), ''), NULLIF(btrim(p_proveedor->>'telefono'), ''),
    NULLIF(lower(btrim(p_proveedor->>'email')), ''), NULLIF(btrim(p_proveedor->>'contacto'), ''),
    upper(COALESCE(NULLIF(btrim(p_proveedor->>'condiciones_pago'), ''), 'CONTADO')),
    COALESCE((p_proveedor->>'limite_credito')::numeric, 0), COALESCE((p_proveedor->>'dias_credito')::integer, 0),
    'ACTIVO', true, p_actor_id, p_actor_id, v_fingerprint
  ) RETURNING * INTO v_created;
  PERFORM app.auditar_comercial_459(p_tenant_id, p_actor_id, 'proveedores', 'INSERT', v_created.id, NULL, to_jsonb(v_created), 'CREAR_PROVEEDOR');
  RETURN to_jsonb(v_created) || jsonb_build_object('idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_proveedor_maestro_tx(
  p_proveedor_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_cambios jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old public.proveedores;
  v_new public.proveedores;
  v_doc text;
  v_name text;
BEGIN
  PERFORM app.assert_actor_comercial_459(p_tenant_id, p_actor_id);
  SELECT * INTO v_old FROM public.proveedores p
  WHERE p.id = p_proveedor_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  v_doc := CASE WHEN p_cambios ? 'ruc' OR p_cambios ? 'documento_identidad'
    THEN app.normalizar_identidad_comercial_459(COALESCE(p_cambios->>'documento_identidad', p_cambios->>'ruc'))
    ELSE v_old.documento_identidad END;
  v_name := CASE WHEN p_cambios ? 'razon_social' THEN NULLIF(btrim(p_cambios->>'razon_social'), '') ELSE v_old.razon_social END;
  IF v_doc IS NULL OR length(v_doc) NOT BETWEEN 9 AND 20 OR v_name IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_INVALID_UPDATE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.proveedores p SET
    documento_identidad = v_doc, ruc = v_doc, documento_numero = v_doc, numero_documento = v_doc, codigo = v_doc,
    documento_tipo = CASE WHEN p_cambios ? 'documento_tipo' THEN upper(p_cambios->>'documento_tipo') ELSE p.documento_tipo END,
    tipo_documento = CASE WHEN p_cambios ? 'documento_tipo' THEN upper(p_cambios->>'documento_tipo') ELSE p.tipo_documento END,
    razon_social = v_name, nombre = v_name,
    nombre_comercial = CASE WHEN p_cambios ? 'nombre_comercial' THEN COALESCE(NULLIF(btrim(p_cambios->>'nombre_comercial'), ''), v_name) ELSE p.nombre_comercial END,
    direccion = CASE WHEN p_cambios ? 'direccion' THEN NULLIF(btrim(p_cambios->>'direccion'), '') ELSE p.direccion END,
    telefono = CASE WHEN p_cambios ? 'telefono' THEN NULLIF(btrim(p_cambios->>'telefono'), '') ELSE p.telefono END,
    email = CASE WHEN p_cambios ? 'email' THEN NULLIF(lower(btrim(p_cambios->>'email')), '') ELSE p.email END,
    contacto = CASE WHEN p_cambios ? 'contacto' THEN NULLIF(btrim(p_cambios->>'contacto'), '') ELSE p.contacto END,
    condiciones_pago = CASE WHEN p_cambios ? 'condiciones_pago' THEN upper(p_cambios->>'condiciones_pago') ELSE p.condiciones_pago END,
    limite_credito = CASE WHEN p_cambios ? 'limite_credito' THEN (p_cambios->>'limite_credito')::numeric ELSE p.limite_credito END,
    dias_credito = CASE WHEN p_cambios ? 'dias_credito' THEN (p_cambios->>'dias_credito')::integer ELSE p.dias_credito END,
    activo = CASE WHEN p_cambios ? 'activo' THEN (p_cambios->>'activo')::boolean ELSE p.activo END,
    updated_by = p_actor_id, updated_at = now()
  WHERE p.id = p_proveedor_id AND p.tenant_id = p_tenant_id RETURNING * INTO v_new;
  IF COALESCE(v_new.limite_credito, 0) < 0 OR COALESCE(v_new.dias_credito, 0) < 0 OR v_new.email IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_INVALID_UPDATE' USING ERRCODE = '22023';
  END IF;
  PERFORM app.auditar_comercial_459(p_tenant_id, p_actor_id, 'proveedores', 'UPDATE', p_proveedor_id, to_jsonb(v_old), to_jsonb(v_new), 'EDITAR_PROVEEDOR');
  RETURN to_jsonb(v_new);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_IDENTITY_CONFLICT' USING ERRCODE = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.desactivar_proveedor_maestro_tx(
  p_proveedor_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old public.proveedores;
  v_new public.proveedores;
BEGIN
  PERFORM app.assert_actor_comercial_459(p_tenant_id, p_actor_id);
  SELECT * INTO v_old FROM public.proveedores p
  WHERE p.id = p_proveedor_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_SUPPLIER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_old.activo THEN RETURN to_jsonb(v_old) || jsonb_build_object('idempotent', true); END IF;
  UPDATE public.proveedores SET activo = false, estado = 'INACTIVO', updated_by = p_actor_id, updated_at = now()
  WHERE id = p_proveedor_id AND tenant_id = p_tenant_id RETURNING * INTO v_new;
  PERFORM app.auditar_comercial_459(p_tenant_id, p_actor_id, 'proveedores', 'UPDATE', p_proveedor_id, to_jsonb(v_old), to_jsonb(v_new), 'DESACTIVAR_PROVEEDOR');
  RETURN to_jsonb(v_new) || jsonb_build_object('idempotent', false);
END;
$function$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.clientes, public.proveedores
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.clientes, public.proveedores TO service_role;

REVOKE ALL ON FUNCTION app.normalizar_identidad_comercial_459(text), app.fingerprint_comercial_459(jsonb),
  app.assert_actor_comercial_459(uuid, uuid), app.auditar_comercial_459(uuid, uuid, text, text, uuid, jsonb, jsonb, text)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.crear_cliente_maestro_tx(uuid, uuid, jsonb),
  public.actualizar_cliente_maestro_tx(uuid, uuid, uuid, jsonb),
  public.desactivar_cliente_maestro_tx(uuid, uuid, uuid),
  public.crear_proveedor_maestro_tx(uuid, uuid, jsonb),
  public.actualizar_proveedor_maestro_tx(uuid, uuid, uuid, jsonb),
  public.desactivar_proveedor_maestro_tx(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_cliente_maestro_tx(uuid, uuid, jsonb),
  public.actualizar_cliente_maestro_tx(uuid, uuid, uuid, jsonb),
  public.desactivar_cliente_maestro_tx(uuid, uuid, uuid),
  public.crear_proveedor_maestro_tx(uuid, uuid, jsonb),
  public.actualizar_proveedor_maestro_tx(uuid, uuid, uuid, jsonb),
  public.desactivar_proveedor_maestro_tx(uuid, uuid, uuid)
TO service_role;

COMMIT;
