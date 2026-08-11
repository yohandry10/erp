-- Maestros de inventario: productos, categorias, almacenes y ubicaciones.
-- Todas las mutaciones publicas son service_role-only, tenant-scoped,
-- idempotentes por intencion y auditan en el mismo commit.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS creation_fingerprint text;

ALTER TABLE public.categorias_producto
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS creation_fingerprint text;

ALTER TABLE public.almacenes
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS creation_fingerprint text;

ALTER TABLE public.almacen_ubicaciones
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS creation_fingerprint text;

CREATE TABLE IF NOT EXISTS public.inventario_maestro_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  entidad text NOT NULL,
  accion text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  record_id uuid,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ck_inventario_maestro_entidad_460
    CHECK (entidad IN ('PRODUCTO', 'CATEGORIA', 'ALMACEN', 'UBICACION')),
  CONSTRAINT ck_inventario_maestro_accion_460
    CHECK (accion IN ('CREAR', 'ACTUALIZAR', 'DESACTIVAR')),
  CONSTRAINT ck_inventario_maestro_key_460
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 180),
  CONSTRAINT ck_inventario_maestro_fingerprint_460
    CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_inventario_maestro_completion_460
    CHECK ((response IS NULL AND completed_at IS NULL) OR (response IS NOT NULL AND completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_inventario_maestro_intent_460
  ON public.inventario_maestro_operaciones (tenant_id, entidad, accion, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_inventario_maestro_record_460
  ON public.inventario_maestro_operaciones (tenant_id, entidad, record_id, created_at DESC);

SELECT app.apply_tenant_policy('public', 'inventario_maestro_operaciones');
ALTER TABLE public.inventario_maestro_operaciones FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.inventory_master_fingerprint_460(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(COALESCE(p_value, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION app.inventory_master_numeric_460(
  p_value jsonb,
  p_key text,
  p_default numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_text text;
BEGIN
  IF NOT COALESCE(p_value, '{}'::jsonb) ? p_key OR p_value->p_key = 'null'::jsonb THEN
    RETURN p_default;
  END IF;
  v_text := btrim(p_value->>p_key);
  IF v_text !~ '^-?[0-9]+([.][0-9]+)?$' THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_INVALID_NUMERIC:%', p_key USING ERRCODE = '23514';
  END IF;
  RETURN v_text::numeric;
END;
$function$;

CREATE OR REPLACE FUNCTION app.assert_inventory_master_actor_460(
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
    RAISE EXCEPTION 'INVENTORY_MASTER_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.claim_inventory_master_operation_460(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_entidad text,
  p_accion text,
  p_idempotency_key text,
  p_fingerprint text
)
RETURNS TABLE(operation_id uuid, replay boolean, stored_response jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_existing public.inventario_maestro_operaciones%ROWTYPE;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
BEGIN
  PERFORM app.assert_inventory_master_actor_460(p_tenant_id, p_actor_id);
  IF length(v_key) NOT BETWEEN 8 AND 180 THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_IDEMPOTENCY_KEY_INVALID' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':' || upper(p_entidad) || ':' || upper(p_accion) || ':' || v_key,
    460
  ));

  SELECT o.* INTO v_existing
  FROM public.inventario_maestro_operaciones o
  WHERE o.tenant_id = p_tenant_id
    AND o.entidad = upper(p_entidad)
    AND o.accion = upper(p_accion)
    AND o.idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.fingerprint IS DISTINCT FROM p_fingerprint THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_IDEMPOTENCY_KEY_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    IF v_existing.response IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_OPERATION_INCOMPLETE' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT v_existing.id, true, v_existing.response;
    RETURN;
  END IF;

  INSERT INTO public.inventario_maestro_operaciones (
    tenant_id, actor_id, entidad, accion, idempotency_key, fingerprint
  ) VALUES (
    p_tenant_id, p_actor_id, upper(p_entidad), upper(p_accion), v_key, p_fingerprint
  ) RETURNING id INTO operation_id;
  replay := false;
  stored_response := NULL;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION app.complete_inventory_master_operation_460(
  p_operation_id uuid,
  p_record_id uuid,
  p_response jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  UPDATE public.inventario_maestro_operaciones o
  SET record_id = p_record_id,
      response = p_response,
      completed_at = now()
  WHERE o.id = p_operation_id
    AND o.response IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_OPERATION_COMPLETION_FAILED' USING ERRCODE = '40001';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.audit_inventory_master_460(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_table_name text,
  p_operation text,
  p_record_id uuid,
  p_old jsonb,
  p_new jsonb,
  p_action text,
  p_operation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id,
    old_values, new_values, changed_fields, metadata
  ) VALUES (
    p_tenant_id, p_actor_id, p_table_name, upper(p_operation), p_record_id::text,
    p_old, p_new,
    CASE WHEN upper(p_operation) = 'UPDATE' THEN (
      SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
      FROM (
        SELECT key FROM jsonb_each(COALESCE(p_old, '{}'::jsonb))
        UNION
        SELECT key FROM jsonb_each(COALESCE(p_new, '{}'::jsonb))
      ) keys
      WHERE COALESCE(p_old, '{}'::jsonb)->key IS DISTINCT FROM COALESCE(p_new, '{}'::jsonb)->key
    ) ELSE NULL END,
    jsonb_build_object(
      'accion', p_action,
      'source', 'inventory_master_460',
      'operation_id', p_operation_id
    )
  );
END;
$function$;

DO $normalized_unique_preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.categorias_producto
    WHERE tenant_id IS NOT NULL AND NULLIF(btrim(nombre), '') IS NOT NULL
    GROUP BY tenant_id, lower(btrim(nombre)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_DUPLICATE_CATEGORY_NAME_PREFLIGHT' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.categorias_producto
    WHERE tenant_id IS NOT NULL AND NULLIF(btrim(codigo), '') IS NOT NULL
    GROUP BY tenant_id, lower(btrim(codigo)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_DUPLICATE_CATEGORY_CODE_PREFLIGHT' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.almacenes
    WHERE tenant_id IS NOT NULL AND NULLIF(btrim(codigo), '') IS NOT NULL
    GROUP BY tenant_id, lower(btrim(codigo)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_DUPLICATE_WAREHOUSE_CODE_PREFLIGHT' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.almacen_ubicaciones
    WHERE tenant_id IS NOT NULL AND almacen_id IS NOT NULL AND NULLIF(btrim(codigo), '') IS NOT NULL
    GROUP BY tenant_id, almacen_id, lower(btrim(codigo)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_DUPLICATE_LOCATION_CODE_PREFLIGHT' USING ERRCODE = '23505';
  END IF;
END;
$normalized_unique_preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_categorias_producto_tenant_nombre_ci_460
  ON public.categorias_producto (tenant_id, lower(btrim(nombre)))
  WHERE tenant_id IS NOT NULL AND NULLIF(btrim(nombre), '') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_categorias_producto_tenant_codigo_ci_460
  ON public.categorias_producto (tenant_id, lower(btrim(codigo)))
  WHERE tenant_id IS NOT NULL AND NULLIF(btrim(codigo), '') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_almacenes_tenant_codigo_ci_460
  ON public.almacenes (tenant_id, lower(btrim(codigo)))
  WHERE tenant_id IS NOT NULL AND NULLIF(btrim(codigo), '') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ubicaciones_tenant_almacen_codigo_ci_460
  ON public.almacen_ubicaciones (tenant_id, almacen_id, lower(btrim(codigo)))
  WHERE tenant_id IS NOT NULL AND almacen_id IS NOT NULL AND NULLIF(btrim(codigo), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crear_producto_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_codigo text := upper(NULLIF(btrim(COALESCE(p_payload->>'codigo', '')), ''));
  v_nombre text := NULLIF(btrim(COALESCE(p_payload->>'nombre', '')), '');
  v_categoria_input text := NULLIF(btrim(COALESCE(p_payload->>'categoria', '')), '');
  v_categoria text;
  v_es_servicio boolean := COALESCE((p_payload->>'es_servicio')::boolean, false);
  v_controla_stock boolean := COALESCE((p_payload->>'controla_stock')::boolean, true);
  v_stock_inicial numeric := app.inventory_master_numeric_460(p_payload, 'stock_inicial', 0);
  v_stock_reservado numeric := app.inventory_master_numeric_460(p_payload, 'stock_reservado', 0);
  v_almacen_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'almacen_id', ''));
  v_producto_payload jsonb;
  v_canonical jsonb;
  v_fingerprint text;
  v_claim record;
  v_result jsonb;
  v_producto public.productos%ROWTYPE;
BEGIN
  IF v_codigo IS NULL OR v_nombre IS NULL OR v_categoria_input IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_REQUIRED_FIELDS' USING ERRCODE = '23514';
  END IF;
  IF v_es_servicio THEN v_controla_stock := false; END IF;
  IF v_stock_inicial < 0 OR v_stock_reservado < 0 OR v_stock_reservado > v_stock_inicial THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_INITIAL_STOCK_INVALID' USING ERRCODE = '23514';
  END IF;
  IF NOT v_controla_stock AND (v_stock_inicial <> 0 OR v_stock_reservado <> 0) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_NON_STOCK_PRODUCT_WITH_STOCK' USING ERRCODE = '23514';
  END IF;

  SELECT c.nombre INTO v_categoria
  FROM public.categorias_producto c
  WHERE c.tenant_id = p_tenant_id
    AND COALESCE(c.activo, false)
    AND (
      lower(btrim(c.nombre)) = lower(v_categoria_input)
      OR lower(btrim(COALESCE(c.codigo, ''))) = lower(v_categoria_input)
    )
  ORDER BY CASE WHEN lower(btrim(c.nombre)) = lower(v_categoria_input) THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_categoria IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_CATEGORY_NOT_FOUND_OR_INACTIVE' USING ERRCODE = '23503';
  END IF;

  v_producto_payload := jsonb_build_object(
    'codigo', v_codigo,
    'nombre', v_nombre,
    'categoria', v_categoria,
    'descripcion', NULLIF(btrim(COALESCE(p_payload->>'descripcion', '')), ''),
    'precio_venta', app.inventory_master_numeric_460(p_payload, 'precio_venta', 0),
    'precio_compra', app.inventory_master_numeric_460(p_payload, 'precio_compra', 0),
    'stock_minimo', app.inventory_master_numeric_460(p_payload, 'stock_minimo', 0),
    'codigo_barras', COALESCE(NULLIF(btrim(p_payload->>'codigo_barras'), ''), v_codigo),
    'impuesto', app.inventory_master_numeric_460(p_payload, 'impuesto', 0),
    'es_servicio', v_es_servicio,
    'controla_stock', v_controla_stock,
    'afectacion_igv', COALESCE(NULLIF(btrim(p_payload->>'afectacion_igv'), ''), '10'),
    'tipo_operacion', NULLIF(btrim(p_payload->>'tipo_operacion'), ''),
    'clasificador_sunat', NULLIF(btrim(p_payload->>'clasificador_sunat'), ''),
    'favorito', COALESCE((p_payload->>'favorito')::boolean, false),
    'imagen_url', COALESCE(p_payload->>'imagen_url', ''),
    'atributos_extra', CASE WHEN jsonb_typeof(p_payload->'atributos_extra') = 'object'
      THEN p_payload->'atributos_extra' ELSE '{}'::jsonb END
  );
  IF (v_producto_payload->>'precio_venta')::numeric < 0
     OR (v_producto_payload->>'precio_compra')::numeric < 0
     OR (v_producto_payload->>'stock_minimo')::numeric < 0
     OR (v_producto_payload->>'impuesto')::numeric NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_NUMERIC_RANGE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(COALESCE(p_payload->'precios_sucursal', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_BRANCH_PRICES_MUST_BE_ARRAY' USING ERRCODE = '23514';
  END IF;

  v_canonical := jsonb_build_object(
    'producto', v_producto_payload,
    'almacen_id', v_almacen_id,
    'stock_inicial', v_stock_inicial,
    'stock_reservado', v_stock_reservado,
    'precios_sucursal', COALESCE(p_payload->'precios_sucursal', '[]'::jsonb)
  );
  v_fingerprint := app.inventory_master_fingerprint_460(v_canonical);
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'PRODUCTO', 'CREAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN
    RETURN v_claim.stored_response || jsonb_build_object('idempotent', true);
  END IF;

  v_result := public.crear_producto_inventario_tx(
    p_tenant_id,
    v_producto_payload,
    v_almacen_id,
    v_stock_inicial,
    v_stock_reservado,
    COALESCE(p_payload->'precios_sucursal', '[]'::jsonb)
  );
  SELECT p.* INTO STRICT v_producto
  FROM public.productos p
  WHERE p.id = (v_result->>'id')::uuid AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  UPDATE public.productos
  SET created_by = p_actor_id,
      updated_by = p_actor_id,
      creation_fingerprint = v_fingerprint,
      estado = 'ACTIVO'
  WHERE id = v_producto.id
  RETURNING * INTO v_producto;

  v_result := to_jsonb(v_producto) || jsonb_build_object(
    'idempotent', false,
    'operation_id', v_claim.operation_id
  );
  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'productos', 'INSERT', v_producto.id,
    NULL, to_jsonb(v_producto), 'CREAR_PRODUCTO', v_claim.operation_id
  );
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, v_producto.id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_producto_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_producto_id uuid,
  p_idempotency_key text,
  p_cambios jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_old public.productos%ROWTYPE;
  v_new public.productos%ROWTYPE;
  v_categoria text;
  v_es_servicio boolean;
  v_controla_stock boolean;
  v_canonical jsonb;
  v_fingerprint text;
  v_claim record;
  v_precio record;
  v_result jsonb;
BEGIN
  IF p_producto_id IS NULL OR jsonb_typeof(COALESCE(p_cambios, '{}'::jsonb)) <> 'object'
     OR p_cambios = '{}'::jsonb THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_UPDATE_EMPTY' USING ERRCODE = '23514';
  END IF;
  IF p_cambios ?| ARRAY[
    'stock', 'stock_actual', 'stockActual', 'stock_reservado', 'stockReservado',
    'stock_inicial', 'almacen_id', 'ubicacion_id'
  ] THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_STOCK_DIRECT_UPDATE_FORBIDDEN' USING ERRCODE = '23514';
  END IF;

  v_canonical := jsonb_build_object('producto_id', p_producto_id, 'cambios', p_cambios);
  v_fingerprint := app.inventory_master_fingerprint_460(v_canonical);
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'PRODUCTO', 'ACTUALIZAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN
    RETURN v_claim.stored_response || jsonb_build_object('idempotent', true);
  END IF;

  SELECT p.* INTO v_old
  FROM public.productos p
  WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  IF p_cambios ? 'categoria' THEN
    SELECT c.nombre INTO v_categoria
    FROM public.categorias_producto c
    WHERE c.tenant_id = p_tenant_id
      AND COALESCE(c.activo, false)
      AND (
        lower(btrim(c.nombre)) = lower(btrim(p_cambios->>'categoria'))
        OR lower(btrim(COALESCE(c.codigo, ''))) = lower(btrim(p_cambios->>'categoria'))
      )
    LIMIT 1;
    IF v_categoria IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_CATEGORY_NOT_FOUND_OR_INACTIVE' USING ERRCODE = '23503';
    END IF;
  ELSE
    v_categoria := v_old.categoria;
  END IF;

  v_es_servicio := CASE WHEN p_cambios ? 'es_servicio'
    THEN (p_cambios->>'es_servicio')::boolean ELSE COALESCE(v_old.es_servicio, false) END;
  v_controla_stock := CASE WHEN p_cambios ? 'controla_stock'
    THEN (p_cambios->>'controla_stock')::boolean ELSE COALESCE(v_old.controla_stock, true) END;
  IF v_es_servicio THEN v_controla_stock := false; END IF;
  IF (v_es_servicio OR NOT v_controla_stock) AND EXISTS (
    SELECT 1 FROM public.producto_existencias pe
    WHERE pe.tenant_id = p_tenant_id AND pe.producto_id = p_producto_id
      AND (COALESCE(pe.stock_actual, 0) <> 0
        OR COALESCE(pe.stock_reservado, 0) <> 0
        OR COALESCE(pe.stock_danado, 0) <> 0)
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_HAS_STOCK_OR_RESERVATIONS' USING ERRCODE = '23514';
  END IF;

  UPDATE public.productos p
  SET codigo = CASE WHEN p_cambios ? 'codigo' THEN upper(NULLIF(btrim(p_cambios->>'codigo'), '')) ELSE p.codigo END,
      nombre = CASE WHEN p_cambios ? 'nombre' THEN NULLIF(btrim(p_cambios->>'nombre'), '') ELSE p.nombre END,
      descripcion = CASE WHEN p_cambios ? 'descripcion' THEN NULLIF(btrim(p_cambios->>'descripcion'), '') ELSE p.descripcion END,
      categoria = v_categoria,
      precio_venta = app.inventory_master_numeric_460(p_cambios, 'precio_venta', p.precio_venta),
      precio_compra = app.inventory_master_numeric_460(p_cambios, 'precio_compra', p.precio_compra),
      stock_minimo = app.inventory_master_numeric_460(p_cambios, 'stock_minimo', p.stock_minimo),
      codigo_barras = CASE WHEN p_cambios ? 'codigo_barras' THEN NULLIF(btrim(p_cambios->>'codigo_barras'), '') ELSE p.codigo_barras END,
      impuesto = app.inventory_master_numeric_460(p_cambios, 'impuesto', p.impuesto),
      es_servicio = v_es_servicio,
      controla_stock = v_controla_stock,
      afectacion_igv = CASE WHEN p_cambios ? 'afectacion_igv' THEN NULLIF(btrim(p_cambios->>'afectacion_igv'), '') ELSE p.afectacion_igv END,
      tipo_operacion = CASE WHEN p_cambios ? 'tipo_operacion' THEN NULLIF(btrim(p_cambios->>'tipo_operacion'), '') ELSE p.tipo_operacion END,
      clasificador_sunat = CASE WHEN p_cambios ? 'clasificador_sunat' THEN NULLIF(btrim(p_cambios->>'clasificador_sunat'), '') ELSE p.clasificador_sunat END,
      favorito = CASE WHEN p_cambios ? 'favorito' THEN (p_cambios->>'favorito')::boolean ELSE p.favorito END,
      imagen_url = CASE WHEN p_cambios ? 'imagen_url' THEN COALESCE(p_cambios->>'imagen_url', '') ELSE p.imagen_url END,
      atributos_extra = CASE WHEN p_cambios ? 'atributos_extra' THEN p_cambios->'atributos_extra' ELSE p.atributos_extra END,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id
  RETURNING * INTO v_new;

  IF NULLIF(btrim(v_new.codigo), '') IS NULL OR NULLIF(btrim(v_new.nombre), '') IS NULL
     OR v_new.precio_venta < 0 OR v_new.precio_compra < 0 OR v_new.stock_minimo < 0
     OR v_new.impuesto NOT BETWEEN 0 AND 100
     OR jsonb_typeof(COALESCE(v_new.atributos_extra, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_UPDATE_INVALID' USING ERRCODE = '23514';
  END IF;

  IF p_cambios ? 'precios_sucursal' THEN
    IF jsonb_typeof(COALESCE(p_cambios->'precios_sucursal', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_BRANCH_PRICES_MUST_BE_ARRAY' USING ERRCODE = '23514';
    END IF;
    FOR v_precio IN
      SELECT x.sucursal_id,
             upper(COALESCE(NULLIF(btrim(x.moneda), ''), 'PEN')) AS moneda,
             x.precio,
             COALESCE(x.activo, true) AS activo
      FROM jsonb_to_recordset(COALESCE(p_cambios->'precios_sucursal', '[]'::jsonb))
        AS x(sucursal_id uuid, moneda text, precio numeric, activo boolean)
    LOOP
      IF v_precio.sucursal_id IS NULL OR v_precio.precio IS NULL OR v_precio.precio < 0
         OR NOT EXISTS (
           SELECT 1 FROM public.sucursales s
           WHERE s.id = v_precio.sucursal_id AND s.tenant_id = p_tenant_id
         ) THEN
        RAISE EXCEPTION 'INVENTORY_MASTER_BRANCH_PRICE_INVALID' USING ERRCODE = '23514';
      END IF;
      INSERT INTO public.producto_precios_sucursal (
        tenant_id, producto_id, sucursal_id, moneda, precio, activo,
        estado, metadata, created_at, updated_at
      ) VALUES (
        p_tenant_id, p_producto_id, v_precio.sucursal_id, v_precio.moneda,
        v_precio.precio, v_precio.activo, 'ACTIVO',
        jsonb_build_object('source', 'inventory_master_460'), now(), now()
      )
      ON CONFLICT (producto_id, sucursal_id, moneda)
      DO UPDATE SET precio = EXCLUDED.precio, activo = EXCLUDED.activo, updated_at = now();
    END LOOP;
  END IF;

  v_result := to_jsonb(v_new) || jsonb_build_object('idempotent', false, 'operation_id', v_claim.operation_id);
  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'productos', 'UPDATE', p_producto_id,
    to_jsonb(v_old), to_jsonb(v_new), 'ACTUALIZAR_PRODUCTO', v_claim.operation_id
  );
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, p_producto_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.desactivar_producto_maestro_tx(
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
  v_old public.productos%ROWTYPE;
  v_new public.productos%ROWTYPE;
  v_fingerprint text := app.inventory_master_fingerprint_460(jsonb_build_object('producto_id', p_producto_id));
  v_claim record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'PRODUCTO', 'DESACTIVAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN
    RETURN v_claim.stored_response || jsonb_build_object('idempotent', true);
  END IF;
  SELECT p.* INTO v_old FROM public.productos p
  WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.producto_existencias pe
    WHERE pe.tenant_id = p_tenant_id AND pe.producto_id = p_producto_id
      AND (COALESCE(pe.stock_actual, 0) <> 0
        OR COALESCE(pe.stock_reservado, 0) <> 0
        OR COALESCE(pe.stock_danado, 0) <> 0)
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_HAS_STOCK_OR_RESERVATIONS' USING ERRCODE = '23514';
  END IF;
  IF NOT COALESCE(v_old.activo, false) THEN
    v_result := to_jsonb(v_old) || jsonb_build_object('idempotent', false, 'already_inactive', true, 'operation_id', v_claim.operation_id);
  ELSE
    UPDATE public.productos
    SET activo = false, estado = 'INACTIVO', updated_by = p_actor_id, updated_at = now()
    WHERE id = p_producto_id AND tenant_id = p_tenant_id RETURNING * INTO v_new;
    v_result := to_jsonb(v_new) || jsonb_build_object('idempotent', false, 'operation_id', v_claim.operation_id);
    PERFORM app.audit_inventory_master_460(
      p_tenant_id, p_actor_id, 'productos', 'UPDATE', p_producto_id,
      to_jsonb(v_old), to_jsonb(v_new), 'DESACTIVAR_PRODUCTO', v_claim.operation_id
    );
  END IF;
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, p_producto_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_categoria_producto_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_payload jsonb;
  v_fingerprint text;
  v_claim record;
  v_row public.categorias_producto%ROWTYPE;
  v_result jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'nombre', upper(NULLIF(btrim(COALESCE(p_payload->>'nombre', '')), '')),
    'codigo', upper(NULLIF(btrim(COALESCE(p_payload->>'codigo', '')), '')),
    'descripcion', NULLIF(btrim(COALESCE(p_payload->>'descripcion', '')), ''),
    'campos_extra', COALESCE(p_payload->'campos_extra', '[]'::jsonb),
    'orden', app.inventory_master_numeric_460(p_payload, 'orden', 0)
  );
  IF v_payload->>'nombre' IS NULL
     OR jsonb_typeof(v_payload->'campos_extra') <> 'array'
     OR (v_payload->>'orden')::numeric < 0
     OR trunc((v_payload->>'orden')::numeric) <> (v_payload->>'orden')::numeric THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_CATEGORY_INVALID' USING ERRCODE = '23514';
  END IF;
  v_fingerprint := app.inventory_master_fingerprint_460(v_payload);
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'CATEGORIA', 'CREAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN
    RETURN v_claim.stored_response || jsonb_build_object('idempotent', true);
  END IF;

  INSERT INTO public.categorias_producto (
    tenant_id, nombre, codigo, descripcion, campos_extra, activo, orden,
    created_by, updated_by, creation_fingerprint, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_payload->>'nombre', NULLIF(v_payload->>'codigo', ''),
    NULLIF(v_payload->>'descripcion', ''), v_payload->'campos_extra', true,
    (v_payload->>'orden')::integer, p_actor_id, p_actor_id, v_fingerprint, now(), now()
  ) RETURNING * INTO v_row;

  v_result := to_jsonb(v_row) || jsonb_build_object('idempotent', false, 'operation_id', v_claim.operation_id);
  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'categorias_producto', 'INSERT', v_row.id,
    NULL, to_jsonb(v_row), 'CREAR_CATEGORIA_PRODUCTO', v_claim.operation_id
  );
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, v_row.id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_categoria_producto_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_categoria_id uuid,
  p_idempotency_key text,
  p_cambios jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_old public.categorias_producto%ROWTYPE;
  v_new public.categorias_producto%ROWTYPE;
  v_fingerprint text := app.inventory_master_fingerprint_460(
    jsonb_build_object('categoria_id', p_categoria_id, 'cambios', p_cambios)
  );
  v_claim record;
  v_activo boolean;
  v_result jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_cambios, '{}'::jsonb)) <> 'object' OR p_cambios = '{}'::jsonb THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_CATEGORY_UPDATE_EMPTY' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'CATEGORIA', 'ACTUALIZAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN
    RETURN v_claim.stored_response || jsonb_build_object('idempotent', true);
  END IF;
  SELECT c.* INTO v_old FROM public.categorias_producto c
  WHERE c.id = p_categoria_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_CATEGORY_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  v_activo := CASE WHEN p_cambios ? 'activo' THEN (p_cambios->>'activo')::boolean ELSE v_old.activo END;
  IF NOT v_activo AND EXISTS (
    SELECT 1 FROM public.productos p
    WHERE p.tenant_id = p_tenant_id AND COALESCE(p.activo, false)
      AND lower(btrim(COALESCE(p.categoria, ''))) = lower(btrim(v_old.nombre))
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_CATEGORY_HAS_ACTIVE_PRODUCTS' USING ERRCODE = '23514';
  END IF;
  IF p_cambios ? 'campos_extra'
     AND jsonb_typeof(COALESCE(p_cambios->'campos_extra', 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_CATEGORY_FIELDS_MUST_BE_ARRAY' USING ERRCODE = '23514';
  END IF;

  UPDATE public.categorias_producto c
  SET nombre = CASE WHEN p_cambios ? 'nombre' THEN upper(NULLIF(btrim(p_cambios->>'nombre'), '')) ELSE c.nombre END,
      codigo = CASE WHEN p_cambios ? 'codigo' THEN upper(NULLIF(btrim(p_cambios->>'codigo'), '')) ELSE c.codigo END,
      descripcion = CASE WHEN p_cambios ? 'descripcion' THEN NULLIF(btrim(p_cambios->>'descripcion'), '') ELSE c.descripcion END,
      campos_extra = CASE WHEN p_cambios ? 'campos_extra' THEN p_cambios->'campos_extra' ELSE c.campos_extra END,
      orden = CASE WHEN p_cambios ? 'orden' THEN app.inventory_master_numeric_460(p_cambios, 'orden', c.orden)::integer ELSE c.orden END,
      activo = v_activo,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE c.id = p_categoria_id AND c.tenant_id = p_tenant_id
  RETURNING * INTO v_new;
  IF NULLIF(btrim(v_new.nombre), '') IS NULL OR v_new.orden < 0 THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_CATEGORY_INVALID' USING ERRCODE = '23514';
  END IF;

  IF v_new.nombre IS DISTINCT FROM v_old.nombre THEN
    UPDATE public.productos p
    SET categoria = v_new.nombre, updated_by = p_actor_id, updated_at = now()
    WHERE p.tenant_id = p_tenant_id
      AND lower(btrim(COALESCE(p.categoria, ''))) = lower(btrim(v_old.nombre));
  END IF;

  v_result := to_jsonb(v_new) || jsonb_build_object('idempotent', false, 'operation_id', v_claim.operation_id);
  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'categorias_producto', 'UPDATE', p_categoria_id,
    to_jsonb(v_old), to_jsonb(v_new), 'ACTUALIZAR_CATEGORIA_PRODUCTO', v_claim.operation_id
  );
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, p_categoria_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.desactivar_categoria_producto_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_categoria_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_old public.categorias_producto%ROWTYPE;
  v_new public.categorias_producto%ROWTYPE;
  v_claim record;
  v_result jsonb;
  v_fingerprint text := app.inventory_master_fingerprint_460(jsonb_build_object('categoria_id', p_categoria_id));
BEGIN
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'CATEGORIA', 'DESACTIVAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN RETURN v_claim.stored_response || jsonb_build_object('idempotent', true); END IF;
  SELECT c.* INTO v_old FROM public.categorias_producto c
  WHERE c.id = p_categoria_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_MASTER_CATEGORY_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.productos p
    WHERE p.tenant_id = p_tenant_id AND COALESCE(p.activo, false)
      AND lower(btrim(COALESCE(p.categoria, ''))) = lower(btrim(v_old.nombre))
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_CATEGORY_HAS_ACTIVE_PRODUCTS' USING ERRCODE = '23514';
  END IF;
  IF NOT COALESCE(v_old.activo, false) THEN
    v_result := to_jsonb(v_old) || jsonb_build_object('idempotent', false, 'already_inactive', true, 'operation_id', v_claim.operation_id);
  ELSE
    UPDATE public.categorias_producto
    SET activo = false, updated_by = p_actor_id, updated_at = now()
    WHERE id = p_categoria_id AND tenant_id = p_tenant_id RETURNING * INTO v_new;
    v_result := to_jsonb(v_new) || jsonb_build_object('idempotent', false, 'operation_id', v_claim.operation_id);
    PERFORM app.audit_inventory_master_460(
      p_tenant_id, p_actor_id, 'categorias_producto', 'UPDATE', p_categoria_id,
      to_jsonb(v_old), to_jsonb(v_new), 'DESACTIVAR_CATEGORIA_PRODUCTO', v_claim.operation_id
    );
  END IF;
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, p_categoria_id, v_result);
  RETURN v_result;
END;
$function$;

-- Normaliza el legado antes de imponer la unicidad: conserva primero el
-- principal existente y, si faltaba, promueve el almacen activo mas antiguo.
WITH ranked AS (
  SELECT a.id,
         row_number() OVER (
           PARTITION BY a.tenant_id
           ORDER BY COALESCE(a.es_principal, false) DESC, a.created_at, a.id
         ) AS rn
  FROM public.almacenes a
  WHERE COALESCE(a.activo, false)
)
UPDATE public.almacenes a
SET es_principal = (r.rn = 1), updated_at = now()
FROM ranked r
WHERE a.id = r.id AND a.es_principal IS DISTINCT FROM (r.rn = 1);

UPDATE public.almacenes
SET es_principal = false, updated_at = now()
WHERE NOT COALESCE(activo, false) AND COALESCE(es_principal, false);

CREATE UNIQUE INDEX IF NOT EXISTS ux_almacenes_tenant_principal_activo_460
  ON public.almacenes (tenant_id)
  WHERE COALESCE(activo, false) AND COALESCE(es_principal, false);

CREATE OR REPLACE FUNCTION app.assert_warehouse_principal_460()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_active integer;
  v_principal integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE COALESCE(a.es_principal, false))
    INTO v_active, v_principal
  FROM public.almacenes a
  WHERE a.tenant_id = v_tenant AND COALESCE(a.activo, false);
  IF v_active > 0 AND v_principal <> 1 THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_PRINCIPAL_INVARIANT:%/%', v_principal, v_active
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assert_warehouse_principal_460 ON public.almacenes;
CREATE CONSTRAINT TRIGGER trg_assert_warehouse_principal_460
AFTER INSERT OR UPDATE OF activo, es_principal OR DELETE ON public.almacenes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_warehouse_principal_460();

CREATE OR REPLACE FUNCTION public.crear_almacen_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_payload jsonb;
  v_fingerprint text;
  v_claim record;
  v_row public.almacenes%ROWTYPE;
  v_old_primary public.almacenes%ROWTYPE;
  v_new_primary public.almacenes%ROWTYPE;
  v_primary boolean;
  v_result jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'codigo', upper(NULLIF(btrim(COALESCE(p_payload->>'codigo', '')), '')),
    'nombre', NULLIF(btrim(COALESCE(p_payload->>'nombre', '')), ''),
    'descripcion', NULLIF(btrim(COALESCE(p_payload->>'descripcion', '')), ''),
    'direccion', NULLIF(btrim(COALESCE(p_payload->>'direccion', '')), ''),
    'telefono', NULLIF(btrim(COALESCE(p_payload->>'telefono', '')), ''),
    'es_principal', COALESCE((p_payload->>'es_principal')::boolean, false)
  );
  IF v_payload->>'codigo' IS NULL OR v_payload->>'nombre' IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_REQUIRED_FIELDS' USING ERRCODE = '23514';
  END IF;
  v_fingerprint := app.inventory_master_fingerprint_460(v_payload);
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'ALMACEN', 'CREAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN RETURN v_claim.stored_response || jsonb_build_object('idempotent', true); END IF;

  PERFORM 1 FROM public.almacenes a WHERE a.tenant_id = p_tenant_id ORDER BY a.id FOR UPDATE;
  v_primary := COALESCE((v_payload->>'es_principal')::boolean, false)
    OR NOT EXISTS (
      SELECT 1 FROM public.almacenes a
      WHERE a.tenant_id = p_tenant_id AND COALESCE(a.activo, false) AND COALESCE(a.es_principal, false)
    );
  IF v_primary THEN
    FOR v_old_primary IN
      SELECT a.* FROM public.almacenes a
      WHERE a.tenant_id = p_tenant_id AND COALESCE(a.activo, false) AND COALESCE(a.es_principal, false)
      FOR UPDATE
    LOOP
      UPDATE public.almacenes
      SET es_principal = false, updated_by = p_actor_id, updated_at = now()
      WHERE id = v_old_primary.id RETURNING * INTO v_new_primary;
      PERFORM app.audit_inventory_master_460(
        p_tenant_id, p_actor_id, 'almacenes', 'UPDATE', v_old_primary.id,
        to_jsonb(v_old_primary), to_jsonb(v_new_primary), 'REASIGNAR_ALMACEN_PRINCIPAL', v_claim.operation_id
      );
    END LOOP;
  END IF;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, descripcion, direccion, telefono,
    activo, estado, es_principal, created_by, updated_by,
    creation_fingerprint, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_payload->>'codigo', v_payload->>'nombre',
    NULLIF(v_payload->>'descripcion', ''), NULLIF(v_payload->>'direccion', ''),
    NULLIF(v_payload->>'telefono', ''), true, 'ACTIVO', v_primary,
    p_actor_id, p_actor_id, v_fingerprint, now(), now()
  ) RETURNING * INTO v_row;
  v_result := to_jsonb(v_row) || jsonb_build_object('idempotent', false, 'operation_id', v_claim.operation_id);
  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'almacenes', 'INSERT', v_row.id,
    NULL, to_jsonb(v_row), 'CREAR_ALMACEN', v_claim.operation_id
  );
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, v_row.id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_almacen_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_almacen_id uuid,
  p_idempotency_key text,
  p_cambios jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_old public.almacenes%ROWTYPE;
  v_new public.almacenes%ROWTYPE;
  v_old_primary public.almacenes%ROWTYPE;
  v_new_primary public.almacenes%ROWTYPE;
  v_claim record;
  v_fingerprint text := app.inventory_master_fingerprint_460(
    jsonb_build_object('almacen_id', p_almacen_id, 'cambios', p_cambios)
  );
  v_activo boolean;
  v_primary boolean;
  v_result jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_cambios, '{}'::jsonb)) <> 'object' OR p_cambios = '{}'::jsonb THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_UPDATE_EMPTY' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'ALMACEN', 'ACTUALIZAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN RETURN v_claim.stored_response || jsonb_build_object('idempotent', true); END IF;
  PERFORM 1 FROM public.almacenes a WHERE a.tenant_id = p_tenant_id ORDER BY a.id FOR UPDATE;
  SELECT a.* INTO v_old FROM public.almacenes a
  WHERE a.id = p_almacen_id AND a.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_NOT_FOUND' USING ERRCODE = '23503'; END IF;

  v_activo := CASE WHEN p_cambios ? 'activo' THEN (p_cambios->>'activo')::boolean ELSE COALESCE(v_old.activo, false) END;
  v_primary := CASE WHEN p_cambios ? 'es_principal' THEN (p_cambios->>'es_principal')::boolean ELSE COALESCE(v_old.es_principal, false) END;
  IF NOT v_activo THEN
    IF EXISTS (
      SELECT 1 FROM public.producto_existencias pe
      WHERE pe.tenant_id = p_tenant_id AND pe.almacen_id = p_almacen_id
        AND (COALESCE(pe.stock_actual, 0) <> 0 OR COALESCE(pe.stock_reservado, 0) <> 0 OR COALESCE(pe.stock_danado, 0) <> 0)
    ) THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_HAS_STOCK_OR_RESERVATIONS' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.almacen_ubicaciones u
      WHERE u.tenant_id = p_tenant_id AND u.almacen_id = p_almacen_id
        AND lower(COALESCE(u.estado::text, 'activo')) = 'activo'
    ) THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_HAS_ACTIVE_LOCATIONS' USING ERRCODE = '23514';
    END IF;
    IF COALESCE(v_old.es_principal, false) AND EXISTS (
      SELECT 1 FROM public.almacenes a
      WHERE a.tenant_id = p_tenant_id AND a.id <> p_almacen_id AND COALESCE(a.activo, false)
    ) THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_REASSIGN_PRINCIPAL_BEFORE_DEACTIVATE' USING ERRCODE = '23514';
    END IF;
    v_primary := false;
  ELSE
    IF NOT v_primary AND COALESCE(v_old.es_principal, false) THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_SET_ANOTHER_PRINCIPAL_FIRST' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.almacenes a
      WHERE a.tenant_id = p_tenant_id AND a.id <> p_almacen_id
        AND COALESCE(a.activo, false) AND COALESCE(a.es_principal, false)
    ) AND NOT COALESCE(v_old.activo, false) THEN
      v_primary := true;
    END IF;
  END IF;

  IF v_activo AND v_primary THEN
    FOR v_old_primary IN
      SELECT a.* FROM public.almacenes a
      WHERE a.tenant_id = p_tenant_id AND a.id <> p_almacen_id
        AND COALESCE(a.activo, false) AND COALESCE(a.es_principal, false)
      FOR UPDATE
    LOOP
      UPDATE public.almacenes
      SET es_principal = false, updated_by = p_actor_id, updated_at = now()
      WHERE id = v_old_primary.id RETURNING * INTO v_new_primary;
      PERFORM app.audit_inventory_master_460(
        p_tenant_id, p_actor_id, 'almacenes', 'UPDATE', v_old_primary.id,
        to_jsonb(v_old_primary), to_jsonb(v_new_primary), 'REASIGNAR_ALMACEN_PRINCIPAL', v_claim.operation_id
      );
    END LOOP;
  END IF;

  UPDATE public.almacenes a
  SET codigo = CASE WHEN p_cambios ? 'codigo' THEN upper(NULLIF(btrim(p_cambios->>'codigo'), '')) ELSE a.codigo END,
      nombre = CASE WHEN p_cambios ? 'nombre' THEN NULLIF(btrim(p_cambios->>'nombre'), '') ELSE a.nombre END,
      descripcion = CASE WHEN p_cambios ? 'descripcion' THEN NULLIF(btrim(p_cambios->>'descripcion'), '') ELSE a.descripcion END,
      direccion = CASE WHEN p_cambios ? 'direccion' THEN NULLIF(btrim(p_cambios->>'direccion'), '') ELSE a.direccion END,
      telefono = CASE WHEN p_cambios ? 'telefono' THEN NULLIF(btrim(p_cambios->>'telefono'), '') ELSE a.telefono END,
      activo = v_activo,
      estado = CASE WHEN v_activo THEN 'ACTIVO' ELSE 'INACTIVO' END,
      es_principal = v_primary,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE a.id = p_almacen_id AND a.tenant_id = p_tenant_id RETURNING * INTO v_new;
  IF NULLIF(btrim(v_new.codigo), '') IS NULL OR NULLIF(btrim(v_new.nombre), '') IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_REQUIRED_FIELDS' USING ERRCODE = '23514';
  END IF;
  v_result := to_jsonb(v_new) || jsonb_build_object('idempotent', false, 'operation_id', v_claim.operation_id);
  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'almacenes', 'UPDATE', p_almacen_id,
    to_jsonb(v_old), to_jsonb(v_new), 'ACTUALIZAR_ALMACEN', v_claim.operation_id
  );
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, p_almacen_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.desactivar_almacen_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_almacen_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_old public.almacenes%ROWTYPE;
  v_new public.almacenes%ROWTYPE;
  v_claim record;
  v_fingerprint text := app.inventory_master_fingerprint_460(jsonb_build_object('almacen_id', p_almacen_id));
  v_result jsonb;
BEGIN
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'ALMACEN', 'DESACTIVAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN RETURN v_claim.stored_response || jsonb_build_object('idempotent', true); END IF;
  PERFORM 1 FROM public.almacenes a WHERE a.tenant_id = p_tenant_id ORDER BY a.id FOR UPDATE;
  SELECT a.* INTO v_old FROM public.almacenes a
  WHERE a.id = p_almacen_id AND a.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.producto_existencias pe
    WHERE pe.tenant_id = p_tenant_id AND pe.almacen_id = p_almacen_id
      AND (COALESCE(pe.stock_actual, 0) <> 0 OR COALESCE(pe.stock_reservado, 0) <> 0 OR COALESCE(pe.stock_danado, 0) <> 0)
  ) THEN RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_HAS_STOCK_OR_RESERVATIONS' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.almacen_ubicaciones u
    WHERE u.tenant_id = p_tenant_id AND u.almacen_id = p_almacen_id
      AND lower(COALESCE(u.estado::text, 'activo')) = 'activo'
  ) THEN RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_HAS_ACTIVE_LOCATIONS' USING ERRCODE = '23514'; END IF;
  IF COALESCE(v_old.es_principal, false) AND EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.tenant_id = p_tenant_id AND a.id <> p_almacen_id AND COALESCE(a.activo, false)
  ) THEN RAISE EXCEPTION 'INVENTORY_MASTER_REASSIGN_PRINCIPAL_BEFORE_DEACTIVATE' USING ERRCODE = '23514'; END IF;

  IF NOT COALESCE(v_old.activo, false) THEN
    v_result := to_jsonb(v_old) || jsonb_build_object('idempotent', false, 'already_inactive', true, 'operation_id', v_claim.operation_id);
  ELSE
    UPDATE public.almacenes
    SET activo = false, estado = 'INACTIVO', es_principal = false,
        updated_by = p_actor_id, updated_at = now()
    WHERE id = p_almacen_id AND tenant_id = p_tenant_id RETURNING * INTO v_new;
    v_result := to_jsonb(v_new) || jsonb_build_object('idempotent', false, 'operation_id', v_claim.operation_id);
    PERFORM app.audit_inventory_master_460(
      p_tenant_id, p_actor_id, 'almacenes', 'UPDATE', p_almacen_id,
      to_jsonb(v_old), to_jsonb(v_new), 'DESACTIVAR_ALMACEN', v_claim.operation_id
    );
  END IF;
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, p_almacen_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_ubicacion_almacen_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_almacen_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_payload jsonb;
  v_fingerprint text;
  v_claim record;
  v_row public.almacen_ubicaciones%ROWTYPE;
  v_result jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'almacen_id', p_almacen_id,
    'codigo', upper(NULLIF(btrim(COALESCE(p_payload->>'codigo', '')), '')),
    'nombre', NULLIF(btrim(COALESCE(p_payload->>'nombre', '')), ''),
    'descripcion', NULLIF(btrim(COALESCE(p_payload->>'descripcion', '')), ''),
    'tipo', upper(COALESCE(NULLIF(btrim(p_payload->>'tipo'), ''), 'OTRO'))
  );
  IF v_payload->>'codigo' IS NULL OR v_payload->>'nombre' IS NULL
     OR v_payload->>'tipo' NOT IN ('PISO', 'PASILLO', 'RACK', 'ESTANTE', 'BIN', 'OTRO') THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_INVALID' USING ERRCODE = '23514';
  END IF;
  v_fingerprint := app.inventory_master_fingerprint_460(v_payload);
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'UBICACION', 'CREAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN RETURN v_claim.stored_response || jsonb_build_object('idempotent', true); END IF;
  PERFORM 1 FROM public.almacenes a
  WHERE a.id = p_almacen_id AND a.tenant_id = p_tenant_id AND COALESCE(a.activo, false)
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_NOT_FOUND_OR_INACTIVE' USING ERRCODE = '23503'; END IF;

  INSERT INTO public.almacen_ubicaciones (
    tenant_id, almacen_id, codigo, nombre, descripcion, tipo, estado,
    created_by, updated_by, creation_fingerprint, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_almacen_id, v_payload->>'codigo', v_payload->>'nombre',
    NULLIF(v_payload->>'descripcion', ''), v_payload->>'tipo', 'ACTIVO',
    p_actor_id, p_actor_id, v_fingerprint, now(), now()
  ) RETURNING * INTO v_row;
  v_result := to_jsonb(v_row) || jsonb_build_object('activo', true, 'idempotent', false, 'operation_id', v_claim.operation_id);
  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'almacen_ubicaciones', 'INSERT', v_row.id,
    NULL, to_jsonb(v_row), 'CREAR_UBICACION_ALMACEN', v_claim.operation_id
  );
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, v_row.id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_ubicacion_almacen_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_almacen_id uuid,
  p_ubicacion_id uuid,
  p_idempotency_key text,
  p_cambios jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_old public.almacen_ubicaciones%ROWTYPE;
  v_new public.almacen_ubicaciones%ROWTYPE;
  v_claim record;
  v_fingerprint text := app.inventory_master_fingerprint_460(jsonb_build_object(
    'almacen_id', p_almacen_id, 'ubicacion_id', p_ubicacion_id, 'cambios', p_cambios
  ));
  v_activo boolean;
  v_tipo text;
  v_result jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_cambios, '{}'::jsonb)) <> 'object' OR p_cambios = '{}'::jsonb THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_UPDATE_EMPTY' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'UBICACION', 'ACTUALIZAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN RETURN v_claim.stored_response || jsonb_build_object('idempotent', true); END IF;
  SELECT u.* INTO v_old FROM public.almacen_ubicaciones u
  WHERE u.id = p_ubicacion_id AND u.tenant_id = p_tenant_id AND u.almacen_id = p_almacen_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  v_activo := CASE WHEN p_cambios ? 'activo' THEN (p_cambios->>'activo')::boolean
    ELSE lower(COALESCE(v_old.estado::text, 'activo')) = 'activo' END;
  v_tipo := CASE WHEN p_cambios ? 'tipo' THEN upper(COALESCE(NULLIF(btrim(p_cambios->>'tipo'), ''), 'OTRO'))
    ELSE COALESCE(v_old.tipo, 'OTRO') END;
  IF v_tipo NOT IN ('PISO', 'PASILLO', 'RACK', 'ESTANTE', 'BIN', 'OTRO') THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_TYPE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF NOT v_activo AND EXISTS (
    SELECT 1 FROM public.producto_existencias pe
    WHERE pe.tenant_id = p_tenant_id AND pe.almacen_id = p_almacen_id AND pe.ubicacion_id = p_ubicacion_id
      AND (COALESCE(pe.stock_actual, 0) <> 0 OR COALESCE(pe.stock_reservado, 0) <> 0 OR COALESCE(pe.stock_danado, 0) <> 0)
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_HAS_STOCK_OR_RESERVATIONS' USING ERRCODE = '23514';
  END IF;
  IF v_activo AND NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = p_almacen_id AND a.tenant_id = p_tenant_id AND COALESCE(a.activo, false)
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_WAREHOUSE_NOT_FOUND_OR_INACTIVE' USING ERRCODE = '23503';
  END IF;

  UPDATE public.almacen_ubicaciones u
  SET codigo = CASE WHEN p_cambios ? 'codigo' THEN upper(NULLIF(btrim(p_cambios->>'codigo'), '')) ELSE u.codigo END,
      nombre = CASE WHEN p_cambios ? 'nombre' THEN NULLIF(btrim(p_cambios->>'nombre'), '') ELSE u.nombre END,
      descripcion = CASE WHEN p_cambios ? 'descripcion' THEN NULLIF(btrim(p_cambios->>'descripcion'), '') ELSE u.descripcion END,
      tipo = v_tipo,
      estado = CASE WHEN v_activo THEN 'ACTIVO' ELSE 'INACTIVO' END,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE u.id = p_ubicacion_id AND u.tenant_id = p_tenant_id AND u.almacen_id = p_almacen_id
  RETURNING * INTO v_new;
  IF NULLIF(btrim(v_new.codigo), '') IS NULL OR NULLIF(btrim(v_new.nombre), '') IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_INVALID' USING ERRCODE = '23514';
  END IF;
  v_result := to_jsonb(v_new) || jsonb_build_object(
    'activo', lower(v_new.estado::text) = 'activo',
    'idempotent', false,
    'operation_id', v_claim.operation_id
  );
  PERFORM app.audit_inventory_master_460(
    p_tenant_id, p_actor_id, 'almacen_ubicaciones', 'UPDATE', p_ubicacion_id,
    to_jsonb(v_old), to_jsonb(v_new), 'ACTUALIZAR_UBICACION_ALMACEN', v_claim.operation_id
  );
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, p_ubicacion_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.desactivar_ubicacion_almacen_maestro_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_almacen_id uuid,
  p_ubicacion_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_old public.almacen_ubicaciones%ROWTYPE;
  v_new public.almacen_ubicaciones%ROWTYPE;
  v_claim record;
  v_fingerprint text := app.inventory_master_fingerprint_460(jsonb_build_object(
    'almacen_id', p_almacen_id, 'ubicacion_id', p_ubicacion_id
  ));
  v_result jsonb;
BEGIN
  SELECT * INTO v_claim FROM app.claim_inventory_master_operation_460(
    p_tenant_id, p_actor_id, 'UBICACION', 'DESACTIVAR', p_idempotency_key, v_fingerprint
  );
  IF v_claim.replay THEN RETURN v_claim.stored_response || jsonb_build_object('idempotent', true); END IF;
  SELECT u.* INTO v_old FROM public.almacen_ubicaciones u
  WHERE u.id = p_ubicacion_id AND u.tenant_id = p_tenant_id AND u.almacen_id = p_almacen_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.producto_existencias pe
    WHERE pe.tenant_id = p_tenant_id AND pe.almacen_id = p_almacen_id AND pe.ubicacion_id = p_ubicacion_id
      AND (COALESCE(pe.stock_actual, 0) <> 0 OR COALESCE(pe.stock_reservado, 0) <> 0 OR COALESCE(pe.stock_danado, 0) <> 0)
  ) THEN RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_HAS_STOCK_OR_RESERVATIONS' USING ERRCODE = '23514'; END IF;
  IF lower(COALESCE(v_old.estado::text, 'inactivo')) <> 'activo' THEN
    v_result := to_jsonb(v_old) || jsonb_build_object('activo', false, 'idempotent', false, 'already_inactive', true, 'operation_id', v_claim.operation_id);
  ELSE
    UPDATE public.almacen_ubicaciones
    SET estado = 'INACTIVO', updated_by = p_actor_id, updated_at = now()
    WHERE id = p_ubicacion_id AND tenant_id = p_tenant_id AND almacen_id = p_almacen_id
    RETURNING * INTO v_new;
    v_result := to_jsonb(v_new) || jsonb_build_object('activo', false, 'idempotent', false, 'operation_id', v_claim.operation_id);
    PERFORM app.audit_inventory_master_460(
      p_tenant_id, p_actor_id, 'almacen_ubicaciones', 'UPDATE', p_ubicacion_id,
      to_jsonb(v_old), to_jsonb(v_new), 'DESACTIVAR_UBICACION_ALMACEN', v_claim.operation_id
    );
  END IF;
  PERFORM app.complete_inventory_master_operation_460(v_claim.operation_id, p_ubicacion_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION app.guard_active_inventory_location_460()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_location public.almacen_ubicaciones%ROWTYPE;
BEGIN
  IF NEW.ubicacion_id IS NOT NULL THEN
    SELECT u.* INTO v_location
    FROM public.almacen_ubicaciones u
    WHERE u.id = NEW.ubicacion_id AND u.tenant_id = NEW.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_NOT_FOUND' USING ERRCODE = '23514';
    END IF;
    IF v_location.almacen_id IS DISTINCT FROM NEW.almacen_id THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_WAREHOUSE_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF (COALESCE(NEW.stock_actual, 0) <> 0
        OR COALESCE(NEW.stock_reservado, 0) <> 0
        OR COALESCE(NEW.stock_danado, 0) <> 0)
       AND lower(COALESCE(v_location.estado::text, 'inactivo')) <> 'activo' THEN
      RAISE EXCEPTION 'INVENTORY_MASTER_LOCATION_INACTIVE_WITH_STOCK' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_active_inventory_location_460 ON public.producto_existencias;
CREATE TRIGGER trg_guard_active_inventory_location_460
BEFORE INSERT OR UPDATE OF ubicacion_id, stock_actual, stock_reservado, stock_danado
ON public.producto_existencias
FOR EACH ROW EXECUTE FUNCTION app.guard_active_inventory_location_460();

CREATE OR REPLACE FUNCTION app.seed_inventory_master_permissions_460(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN RETURN; END IF;
  WITH defs(modulo, recurso, accion, codigo, descripcion) AS (
    VALUES
      ('inventario', 'almacenes', 'create', 'inventario.almacenes.create', 'Crear almacenes'),
      ('inventario', 'almacenes', 'update', 'inventario.almacenes.update', 'Actualizar almacenes'),
      ('inventario', 'almacenes', 'delete', 'inventario.almacenes.delete', 'Desactivar almacenes'),
      ('inventario', 'ubicaciones', 'read', 'inventario.ubicaciones.read', 'Consultar ubicaciones'),
      ('inventario', 'ubicaciones', 'create', 'inventario.ubicaciones.create', 'Crear ubicaciones'),
      ('inventario', 'ubicaciones', 'update', 'inventario.ubicaciones.update', 'Actualizar ubicaciones'),
      ('inventario', 'ubicaciones', 'delete', 'inventario.ubicaciones.delete', 'Desactivar ubicaciones')
  )
  INSERT INTO public.permisos (tenant_id, modulo, recurso, accion, codigo, descripcion, activo)
  SELECT p_tenant_id, d.modulo, d.recurso, d.accion, d.codigo, d.descripcion, true
  FROM defs d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permisos p
    WHERE p.tenant_id = p_tenant_id AND lower(p.codigo) = lower(d.codigo)
  );

  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND COALESCE(r.activo, true)
    AND COALESCE(p.activo, true)
    AND (
      upper(r.nombre) IN ('ADMIN', 'ALMACEN')
      OR (upper(r.nombre) = 'COMPRAS' AND lower(p.codigo) = 'inventario.ubicaciones.read')
    )
    AND lower(p.codigo) IN (
      'inventario.almacenes.create', 'inventario.almacenes.update', 'inventario.almacenes.delete',
      'inventario.ubicaciones.read', 'inventario.ubicaciones.create',
      'inventario.ubicaciones.update', 'inventario.ubicaciones.delete'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.rol_permisos rp
      WHERE rp.role_id = r.id AND rp.permiso_id = p.id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION app.seed_inventory_master_permissions_tenant_trigger_460()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  PERFORM app.seed_inventory_master_permissions_460(NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app.seed_inventory_master_permissions_role_trigger_460()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  PERFORM app.seed_inventory_master_permissions_460(NEW.tenant_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_inventory_master_permissions_tenant_460 ON public.tenants;
CREATE TRIGGER trg_seed_inventory_master_permissions_tenant_460
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION app.seed_inventory_master_permissions_tenant_trigger_460();

DROP TRIGGER IF EXISTS trg_seed_inventory_master_permissions_role_460 ON public.roles;
CREATE TRIGGER trg_seed_inventory_master_permissions_role_460
AFTER INSERT ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_inventory_master_permissions_role_trigger_460();

DO $seed_existing_permissions$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM app.seed_inventory_master_permissions_460(v_tenant.id);
  END LOOP;
END;
$seed_existing_permissions$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.productos, public.categorias_producto, public.almacenes, public.almacen_ubicaciones
  FROM anon, authenticated;
REVOKE ALL ON TABLE public.inventario_maestro_operaciones FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.inventario_maestro_operaciones TO service_role;

REVOKE ALL ON FUNCTION app.inventory_master_fingerprint_460(jsonb),
  app.inventory_master_numeric_460(jsonb, text, numeric),
  app.assert_inventory_master_actor_460(uuid, uuid),
  app.claim_inventory_master_operation_460(uuid, uuid, text, text, text, text),
  app.complete_inventory_master_operation_460(uuid, uuid, jsonb),
  app.audit_inventory_master_460(uuid, uuid, text, text, uuid, jsonb, jsonb, text, uuid),
  app.assert_warehouse_principal_460(),
  app.guard_active_inventory_location_460(),
  app.seed_inventory_master_permissions_460(uuid),
  app.seed_inventory_master_permissions_tenant_trigger_460(),
  app.seed_inventory_master_permissions_role_trigger_460()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.crear_producto_maestro_tx(uuid, uuid, text, jsonb),
  public.actualizar_producto_maestro_tx(uuid, uuid, uuid, text, jsonb),
  public.desactivar_producto_maestro_tx(uuid, uuid, uuid, text),
  public.crear_categoria_producto_maestro_tx(uuid, uuid, text, jsonb),
  public.actualizar_categoria_producto_maestro_tx(uuid, uuid, uuid, text, jsonb),
  public.desactivar_categoria_producto_maestro_tx(uuid, uuid, uuid, text),
  public.crear_almacen_maestro_tx(uuid, uuid, text, jsonb),
  public.actualizar_almacen_maestro_tx(uuid, uuid, uuid, text, jsonb),
  public.desactivar_almacen_maestro_tx(uuid, uuid, uuid, text),
  public.crear_ubicacion_almacen_maestro_tx(uuid, uuid, uuid, text, jsonb),
  public.actualizar_ubicacion_almacen_maestro_tx(uuid, uuid, uuid, uuid, text, jsonb),
  public.desactivar_ubicacion_almacen_maestro_tx(uuid, uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_producto_maestro_tx(uuid, uuid, text, jsonb),
  public.actualizar_producto_maestro_tx(uuid, uuid, uuid, text, jsonb),
  public.desactivar_producto_maestro_tx(uuid, uuid, uuid, text),
  public.crear_categoria_producto_maestro_tx(uuid, uuid, text, jsonb),
  public.actualizar_categoria_producto_maestro_tx(uuid, uuid, uuid, text, jsonb),
  public.desactivar_categoria_producto_maestro_tx(uuid, uuid, uuid, text),
  public.crear_almacen_maestro_tx(uuid, uuid, text, jsonb),
  public.actualizar_almacen_maestro_tx(uuid, uuid, uuid, text, jsonb),
  public.desactivar_almacen_maestro_tx(uuid, uuid, uuid, text),
  public.crear_ubicacion_almacen_maestro_tx(uuid, uuid, uuid, text, jsonb),
  public.actualizar_ubicacion_almacen_maestro_tx(uuid, uuid, uuid, uuid, text, jsonb),
  public.desactivar_ubicacion_almacen_maestro_tx(uuid, uuid, uuid, uuid, text)
  TO service_role;

COMMENT ON TABLE public.inventario_maestro_operaciones IS
  'Barrera durable de idempotencia y fingerprint para maestros de inventario.';
COMMENT ON FUNCTION public.crear_producto_maestro_tx(uuid, uuid, text, jsonb) IS
  'Contrato canonico de alta atomica de producto; conserva crear_producto_inventario_tx como puente legacy.';

NOTIFY pgrst, 'reload schema';

COMMIT;
