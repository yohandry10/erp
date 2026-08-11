-- GRE/SIRE: ciclo fiscal interno atómico, tenant-scoped e idempotente.
-- No habilita legalmente a ningún contribuyente ni transmite por sí solo.
-- La transmisión externa continúa fail-closed y sólo usa las credenciales
-- configuradas por el cliente desde el backend.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

CREATE OR REPLACE FUNCTION app.assert_fiscal_actor_463(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_allow_system boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_actor_id IS NULL AND p_allow_system THEN
    RETURN;
  END IF;

  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND COALESCE(u.activo, false)
      AND lower(COALESCE(u.estado::text, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'FISCAL_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.fiscal_fingerprint_463(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(
    extensions.digest(convert_to(COALESCE(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  )
$function$;

CREATE OR REPLACE FUNCTION app.audit_fiscal_463(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_table_name text,
  p_operation text,
  p_record_id uuid,
  p_old jsonb,
  p_new jsonb,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
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
    p_old, p_new, NULL,
    jsonb_build_object('accion', p_action, 'source', 'gre_sire_463') || COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$function$;

ALTER TABLE public.gre_guias
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS creation_fingerprint text,
  ADD COLUMN IF NOT EXISTS xml_ubl text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_consulted_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS despacho_evento_id uuid,
  ADD COLUMN IF NOT EXISTS sunat_ticket text;

ALTER TABLE public.sire_files
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS generation_idempotency_key text,
  ADD COLUMN IF NOT EXISTS generation_fingerprint text,
  ADD COLUMN IF NOT EXISTS generation_request_fingerprint text,
  ADD COLUMN IF NOT EXISTS contenido_local text,
  ADD COLUMN IF NOT EXISTS contenido_sha256 text,
  ADD COLUMN IF NOT EXISTS source_cutoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_fingerprint text,
  ADD COLUMN IF NOT EXISTS source_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS correction_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correction_reason text;

ALTER TABLE public.sire_operaciones
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS terminal_fingerprint text;

CREATE TABLE IF NOT EXISTS public.gre_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gre_id uuid NOT NULL REFERENCES public.gre_guias(id) ON DELETE CASCADE,
  accion text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  estado text NOT NULL DEFAULT 'RESERVADO',
  claim_token uuid,
  intento integer NOT NULL DEFAULT 1,
  actor_id uuid,
  origen text NOT NULL DEFAULT 'USUARIO',
  request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb,
  terminal_fingerprint text,
  codigo_respuesta text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ck_gre_operaciones_accion_463
    CHECK (accion IN ('FIRMAR', 'ENVIAR', 'CONSULTAR', 'ANULAR')),
  CONSTRAINT ck_gre_operaciones_estado_463
    CHECK (estado IN ('RESERVADO', 'PROCESANDO', 'TERMINADO', 'ERROR')),
  CONSTRAINT ck_gre_operaciones_origen_463
    CHECK (origen IN ('USUARIO', 'WORKER', 'SISTEMA')),
  CONSTRAINT ck_gre_operaciones_intento_463 CHECK (intento > 0),
  CONSTRAINT ck_gre_operaciones_key_463 CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT ck_gre_operaciones_fingerprint_463 CHECK (request_fingerprint ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.gre_operaciones
  ADD COLUMN IF NOT EXISTS terminal_fingerprint text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gre_guias_pedido_id_fkey_463'
      AND conrelid = 'public.gre_guias'::regclass
  ) THEN
    ALTER TABLE public.gre_guias
      ADD CONSTRAINT gre_guias_pedido_id_fkey_463
      FOREIGN KEY (pedido_id) REFERENCES public.pedidos_venta(id) ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gre_guias_despacho_evento_id_fkey_463'
      AND conrelid = 'public.gre_guias'::regclass
  ) THEN
    ALTER TABLE public.gre_guias
      ADD CONSTRAINT gre_guias_despacho_evento_id_fkey_463
      FOREIGN KEY (despacho_evento_id) REFERENCES public.logistica_eventos(id) ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$constraints$;

ALTER TABLE public.gre_guias VALIDATE CONSTRAINT gre_guias_pedido_id_fkey_463;
ALTER TABLE public.gre_guias VALIDATE CONSTRAINT gre_guias_despacho_evento_id_fkey_463;

CREATE UNIQUE INDEX IF NOT EXISTS ux_gre_operaciones_tenant_key_463
ON public.gre_operaciones (tenant_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_gre_operaciones_envio_activo_463
ON public.gre_operaciones (tenant_id, gre_id, accion)
WHERE accion = 'ENVIAR' AND estado IN ('RESERVADO', 'PROCESANDO');

CREATE UNIQUE INDEX IF NOT EXISTS ux_gre_operaciones_consulta_activa_463
ON public.gre_operaciones (tenant_id, gre_id, accion)
WHERE accion = 'CONSULTAR' AND estado IN ('RESERVADO', 'PROCESANDO');

CREATE UNIQUE INDEX IF NOT EXISTS ux_gre_pedido_sin_despacho_activa_463
ON public.gre_guias (tenant_id, pedido_id)
WHERE pedido_id IS NOT NULL
  AND despacho_evento_id IS NULL
  AND lower(estado::text) NOT IN ('anulado', 'rechazado');

CREATE UNIQUE INDEX IF NOT EXISTS ux_gre_despacho_activa_463
ON public.gre_guias (tenant_id, despacho_evento_id)
WHERE despacho_evento_id IS NOT NULL
  AND lower(estado::text) NOT IN ('anulado', 'rechazado');

CREATE INDEX IF NOT EXISTS idx_gre_operaciones_gre_fecha_463
ON public.gre_operaciones (tenant_id, gre_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gre_operaciones_lease_463
ON public.gre_operaciones (lease_expires_at)
WHERE estado='PROCESANDO';

CREATE UNIQUE INDEX IF NOT EXISTS ux_sire_files_generation_key_463
ON public.sire_files (tenant_id, generation_idempotency_key)
WHERE generation_idempotency_key IS NOT NULL AND btrim(generation_idempotency_key) <> '';

CREATE INDEX IF NOT EXISTS idx_sire_operaciones_active_query_463
ON public.sire_operaciones (tenant_id, reporte_id, accion, estado, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sire_incidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cpe_id uuid NOT NULL REFERENCES public.cpe(id) ON DELETE RESTRICT,
  reporte_id uuid REFERENCES public.sire_files(id) ON DELETE SET NULL,
  periodo text NOT NULL,
  tipo text NOT NULL,
  codigo text NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  detalle text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  CONSTRAINT ck_sire_incidencias_periodo_463 CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT ck_sire_incidencias_tipo_463 CHECK (tipo IN ('REG_VEN','REG_COM')),
  CONSTRAINT ck_sire_incidencias_estado_463 CHECK (estado IN ('PENDIENTE','RESUELTA'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sire_incidencias_cpe_codigo_463
ON public.sire_incidencias (tenant_id, cpe_id, codigo);
CREATE INDEX IF NOT EXISTS idx_sire_incidencias_pendientes_463
ON public.sire_incidencias (tenant_id, estado, periodo, created_at DESC);

ALTER TABLE public.gre_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gre_operaciones FORCE ROW LEVEL SECURITY;
SELECT app.apply_tenant_policy('public', 'gre_operaciones');
ALTER TABLE public.sire_incidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sire_incidencias FORCE ROW LEVEL SECURITY;
SELECT app.apply_tenant_policy('public', 'sire_incidencias');

-- ---------------------------------------------------------------------------
-- GRE: alta de cabecera, líneas y vínculo logístico en un solo commit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_gre_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_items jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_items jsonb := COALESCE(p_items, '[]'::jsonb);
  v_fingerprint text;
  v_existing public.gre_guias;
  v_created public.gre_guias;
  v_config public.empresa_config;
  v_serie text;
  v_correlativo integer;
  v_numero text;
  v_pedido_id uuid := NULLIF(v_payload->>'pedido_id', '')::uuid;
  v_cpe_id uuid := NULLIF(v_payload->>'cpe_relacionado', '')::uuid;
  v_despacho_evento_id uuid := NULLIF(v_payload->>'despacho_evento_id', '')::uuid;
  v_event_id uuid := COALESCE(NULLIF(v_payload->>'event_id', '')::uuid, gen_random_uuid());
  v_detalle jsonb;
  v_product_id uuid;
  v_item_count integer := 0;
  v_pedido public.pedidos_venta;
  v_cpe public.cpe;
  v_documento public.documentos;
  v_despacho public.logistica_eventos;
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id, p_actor_id);
  PERFORM set_config('app.gre_lifecycle_writer_463','on',true);
  IF v_key IS NULL OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'GRE_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_config
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR upper(COALESCE(v_config.pais, '')) <> 'PE' THEN
    RAISE EXCEPTION 'GRE_ONLY_PERU' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(v_payload->>'destinatario'), '') IS NULL
     OR NULLIF(btrim(v_payload->>'direccion_destino'), '') IS NULL
     OR NULLIF(btrim(v_payload->>'fecha_traslado'), '') IS NULL
     OR upper(COALESCE(v_payload->>'modalidad', '')) NOT IN ('TRANSPORTE_PUBLICO', 'TRANSPORTE_PRIVADO')
     OR NULLIF(btrim(v_payload->>'motivo'), '') IS NULL
     OR COALESCE((v_payload->>'peso_total')::numeric, 0) <= 0 THEN
    RAISE EXCEPTION 'GRE_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;

  IF v_pedido_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':gre:pedido:' || v_pedido_id::text, 0));
    SELECT * INTO v_pedido
    FROM public.pedidos_venta p
    WHERE p.id = v_pedido_id AND p.tenant_id = p_tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GRE_ORDER_ORIGIN_INVALID' USING ERRCODE = '23503';
    END IF;

    IF v_despacho_evento_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':gre:dispatch:' || v_despacho_evento_id::text, 0));
      SELECT * INTO v_despacho
      FROM public.logistica_eventos le
      WHERE le.id = v_despacho_evento_id
        AND le.tenant_id = p_tenant_id
        AND le.pedido_id = v_pedido_id
        AND upper(le.tipo) = 'DESPACHO'
      FOR UPDATE;
      IF NOT FOUND OR jsonb_typeof(v_despacho.datos->'resultado') <> 'object' THEN
        RAISE EXCEPTION 'GRE_DISPATCH_BATCH_INVALID' USING ERRCODE = '23514';
      END IF;

      PERFORM pd.id
      FROM public.pedido_despachos pd
      JOIN public.productos pr ON pr.id = pd.producto_id AND pr.tenant_id = pd.tenant_id
      WHERE pd.tenant_id = p_tenant_id
        AND pd.pedido_id = v_pedido_id
        AND pd.logistica_evento_id = v_despacho_evento_id
        AND NOT COALESCE(pr.es_servicio, false)
        AND COALESCE(pr.controla_stock, true)
      ORDER BY pd.producto_id, pd.detalle_id
      FOR SHARE OF pd, pr;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'producto_id', pd.producto_id,
        'descripcion', COALESCE(NULLIF(btrim(d.descripcion), ''), NULLIF(btrim(pr.descripcion), ''), pr.nombre),
        'cantidad', pd.cantidad,
        'unidad_medida', COALESCE(NULLIF(btrim(pr.unidad_medida), ''), 'NIU'),
        'peso', NULL,
        'pedido_detalle_id', pd.detalle_id,
        'pedido_despacho_id', pd.id,
        'despacho_evento_id', pd.logistica_evento_id
      ) ORDER BY pd.producto_id, pd.detalle_id), '[]'::jsonb)
      INTO v_items
      FROM public.pedido_despachos pd
      JOIN public.pedidos_venta_detalle d
        ON d.id = pd.detalle_id AND d.pedido_id = pd.pedido_id AND d.tenant_id = pd.tenant_id
      JOIN public.productos pr ON pr.id = pd.producto_id AND pr.tenant_id = pd.tenant_id
      WHERE pd.tenant_id = p_tenant_id
        AND pd.pedido_id = v_pedido_id
        AND pd.logistica_evento_id = v_despacho_evento_id
        AND COALESCE(pd.cantidad, 0) > 0
        AND NOT COALESCE(pr.es_servicio, false)
        AND COALESCE(pr.controla_stock, true);
    ELSE
      IF COALESCE(v_config.usar_flujo_logistica, false) THEN
        RAISE EXCEPTION 'GRE_DISPATCH_BATCH_REQUIRED' USING ERRCODE = '23514';
      END IF;

      PERFORM d.id
      FROM public.pedidos_venta_detalle d
      JOIN public.productos pr ON pr.id=d.producto_id AND pr.tenant_id=d.tenant_id
      WHERE d.tenant_id=p_tenant_id AND d.pedido_id=v_pedido_id
        AND COALESCE(d.cantidad,0)>0
        AND NOT COALESCE(pr.es_servicio,false)
        AND COALESCE(pr.controla_stock,true)
      ORDER BY d.producto_id,d.id
      FOR SHARE OF d,pr;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'producto_id', d.producto_id,
        'descripcion', COALESCE(NULLIF(btrim(d.descripcion), ''), NULLIF(btrim(pr.descripcion), ''), pr.nombre),
        'cantidad', d.cantidad,
        'unidad_medida', COALESCE(NULLIF(btrim(pr.unidad_medida), ''), 'NIU'),
        'peso', NULL,
        'pedido_detalle_id', d.id
      ) ORDER BY d.producto_id,d.id), '[]'::jsonb)
      INTO v_items
      FROM public.pedidos_venta_detalle d
      JOIN public.productos pr ON pr.id=d.producto_id AND pr.tenant_id=d.tenant_id
      WHERE d.tenant_id=p_tenant_id AND d.pedido_id=v_pedido_id
        AND COALESCE(d.cantidad,0)>0
        AND NOT COALESCE(pr.es_servicio,false)
        AND COALESCE(pr.controla_stock,true);
    END IF;
  ELSIF v_despacho_evento_id IS NOT NULL THEN
    RAISE EXCEPTION 'GRE_DISPATCH_REQUIRES_ORDER' USING ERRCODE = '23514';
  END IF;

  IF v_cpe_id IS NOT NULL THEN
    SELECT * INTO v_cpe
    FROM public.cpe c
    WHERE c.id = v_cpe_id AND c.tenant_id = p_tenant_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GRE_CPE_ORIGIN_INVALID' USING ERRCODE = '23503';
    END IF;
    IF v_pedido_id IS NOT NULL THEN
      IF v_cpe.documento_id IS NULL THEN
        RAISE EXCEPTION 'GRE_CPE_ORDER_LINK_MISSING' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO v_documento
      FROM public.documentos d
      WHERE d.id = v_cpe.documento_id AND d.tenant_id = p_tenant_id
      FOR SHARE;
      IF NOT FOUND OR v_documento.pedido_id IS DISTINCT FROM v_pedido_id THEN
        RAISE EXCEPTION 'GRE_CPE_ORDER_MISMATCH' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'GRE_ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  FOR v_detalle IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_product_id := NULLIF(v_detalle->>'producto_id', '')::uuid;
    IF NULLIF(btrim(v_detalle->>'descripcion'), '') IS NULL
       OR COALESCE((v_detalle->>'cantidad')::numeric, 0) <= 0
       OR COALESCE((v_detalle->>'peso')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'GRE_ITEM_INVALID' USING ERRCODE = '22023';
    END IF;
    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.productos p WHERE p.id = v_product_id AND p.tenant_id = p_tenant_id
    ) THEN
      RAISE EXCEPTION 'GRE_ITEM_PRODUCT_TENANT_INVALID' USING ERRCODE = '23514';
    END IF;
    v_item_count := v_item_count + 1;
  END LOOP;

  v_fingerprint := app.fiscal_fingerprint_463(jsonb_build_object(
    'payload', v_payload - 'event_id',
    'items', v_items
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':gre:create:' || v_key, 0));
  SELECT * INTO v_existing
  FROM public.gre_guias g
  WHERE g.tenant_id = p_tenant_id AND g.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.creation_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'GRE_IDEMPOTENCY_COLLISION' USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(v_existing) || jsonb_build_object('idempotent', true, 'item_count', (
      SELECT count(*) FROM public.gre_detalles gd
      WHERE gd.tenant_id = p_tenant_id AND gd.gre_id = v_existing.id
    ));
  END IF;

  IF v_despacho_evento_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.gre_guias g
    WHERE g.tenant_id=p_tenant_id
      AND g.despacho_evento_id=v_despacho_evento_id
      AND lower(g.estado::text) NOT IN ('anulado','rechazado')
  ) THEN
    RAISE EXCEPTION 'GRE_ACTIVE_EXISTS_FOR_DISPATCH' USING ERRCODE='23505';
  END IF;
  IF v_pedido_id IS NOT NULL AND v_despacho_evento_id IS NULL AND EXISTS (
    SELECT 1 FROM public.gre_guias g
    WHERE g.tenant_id=p_tenant_id AND g.pedido_id=v_pedido_id
      AND g.despacho_evento_id IS NULL
      AND lower(g.estado::text) NOT IN ('anulado','rechazado')
  ) THEN
    RAISE EXCEPTION 'GRE_ACTIVE_EXISTS_FOR_ORDER' USING ERRCODE='23505';
  END IF;

  v_serie := upper(COALESCE(NULLIF(btrim(v_config.serie_guia_remision), ''), 'T001'));
  IF v_serie !~ '^T[0-9A-Z]{3}$' THEN
    RAISE EXCEPTION 'GRE_SERIES_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':gre:series:' || v_serie, 0));
  SELECT COALESCE(max(g.correlativo), 0) + 1 INTO v_correlativo
  FROM public.gre_guias g
  WHERE g.tenant_id = p_tenant_id AND upper(g.serie) = v_serie;
  v_numero := v_serie || '-' || lpad(v_correlativo::text, 8, '0');

  INSERT INTO public.gre_guias (
    tenant_id, numero, serie, correlativo, estado, sunat_status,
    destinatario, direccion_destino, fecha_traslado, modalidad, motivo,
    peso_total, observaciones, transportista, placa_vehiculo, licencia_conducir,
    cpe_relacionado, datos_adicionales, idempotency_key, creation_fingerprint,
    event_id, es_automatica, venta_id, motivo_creacion, created_by, updated_by,
    pedido_id, despacho_evento_id,
    anio, mes
  ) VALUES (
    p_tenant_id, v_numero, v_serie, v_correlativo, 'BORRADOR', 'NOT_SENT',
    btrim(v_payload->>'destinatario'), btrim(v_payload->>'direccion_destino'),
    (v_payload->>'fecha_traslado')::timestamptz,
    upper(v_payload->>'modalidad'), upper(v_payload->>'motivo'),
    round((v_payload->>'peso_total')::numeric, 3),
    NULLIF(btrim(v_payload->>'observaciones'), ''),
    NULLIF(btrim(v_payload->>'transportista'), ''),
    NULLIF(upper(btrim(v_payload->>'placa_vehiculo')), ''),
    NULLIF(upper(btrim(v_payload->>'licencia_conducir')), ''),
    v_cpe_id, COALESCE(v_payload->'datos_adicionales', '{}'::jsonb),
    v_key, v_fingerprint, v_event_id,
    COALESCE((v_payload->>'es_automatica')::boolean, false),
    NULLIF(v_payload->>'venta_id', '')::uuid,
    NULLIF(upper(btrim(v_payload->>'motivo_creacion')), ''),
    p_actor_id, p_actor_id, v_pedido_id, v_despacho_evento_id,
    to_char((v_payload->>'fecha_traslado')::timestamptz, 'YYYY'),
    to_char((v_payload->>'fecha_traslado')::timestamptz, 'MM')
  ) RETURNING * INTO v_created;

  INSERT INTO public.gre_detalles (
    tenant_id, gre_id, producto_id, descripcion, cantidad, unidad_medida, peso, estado, metadata
  )
  SELECT
    p_tenant_id, v_created.id,
    NULLIF(x.value->>'producto_id', '')::uuid,
    btrim(x.value->>'descripcion'),
    round((x.value->>'cantidad')::numeric, 3),
    upper(COALESCE(NULLIF(btrim(x.value->>'unidad_medida'), ''), 'NIU')),
    CASE WHEN NULLIF(x.value->>'peso', '') IS NULL THEN NULL
         ELSE round((x.value->>'peso')::numeric, 3) END,
    'ACTIVO',
    jsonb_strip_nulls(jsonb_build_object(
      'pedido_detalle_id', NULLIF(x.value->>'pedido_detalle_id',''),
      'pedido_despacho_id', NULLIF(x.value->>'pedido_despacho_id',''),
      'despacho_evento_id', NULLIF(x.value->>'despacho_evento_id','')
    ))
  FROM jsonb_array_elements(v_items) WITH ORDINALITY AS x(value, ord);

  IF v_pedido_id IS NOT NULL THEN
    INSERT INTO public.pedido_gres (
      tenant_id, pedido_id, gre_id, estado, notas, creado_por, nombre, codigo, metadata
    ) VALUES (
      p_tenant_id, v_pedido_id, v_created.id, 'BORRADOR',
      NULLIF(btrim(v_payload->>'observaciones'), ''), p_actor_id,
      v_numero, v_numero,
      jsonb_strip_nulls(jsonb_build_object('despacho_evento_id',v_despacho_evento_id))
    )
    ON CONFLICT (tenant_id, pedido_id, gre_id) WHERE tenant_id IS NOT NULL AND pedido_id IS NOT NULL AND gre_id IS NOT NULL
    DO NOTHING;

    IF v_despacho_evento_id IS NULL THEN
      UPDATE public.pedidos_venta
      SET gre_id = v_created.id, updated_at = now()
      WHERE id = v_pedido_id AND tenant_id = p_tenant_id;
    END IF;
  END IF;

  PERFORM app.audit_fiscal_463(
    p_tenant_id, p_actor_id, 'gre_guias', 'INSERT', v_created.id,
    NULL, to_jsonb(v_created), 'CREAR_GRE',
    jsonb_build_object('idempotency_key', v_key, 'item_count', v_item_count)
  );

  RETURN to_jsonb(v_created) || jsonb_build_object('idempotent', false, 'item_count', v_item_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_firma_gre_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_gre_id uuid,
  p_xml_ubl text,
  p_xml_firmado text,
  p_hash text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_gre public.gre_guias;
  v_old jsonb;
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_fp text;
  v_op public.gre_operaciones;
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id, p_actor_id);
  PERFORM set_config('app.gre_lifecycle_writer_463','on',true);
  IF v_key IS NULL OR NULLIF(btrim(COALESCE(p_xml_ubl, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_xml_firmado, '')), '') IS NULL
     OR p_hash !~ '^[0-9a-fA-F]{32,64}$' THEN
    RAISE EXCEPTION 'GRE_SIGNATURE_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_fp := app.fiscal_fingerprint_463(jsonb_build_object(
    'gre_id', p_gre_id, 'xml_hash', lower(p_hash),
    'ubl_hash', encode(extensions.digest(convert_to(p_xml_ubl, 'UTF8'), 'sha256'), 'hex')
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':gre:sign:' || p_gre_id::text, 0));
  SELECT * INTO v_op FROM public.gre_operaciones
  WHERE tenant_id = p_tenant_id AND idempotency_key = v_key FOR UPDATE;
  IF FOUND THEN
    IF v_op.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'GRE_SIGNATURE_IDEMPOTENCY_COLLISION' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_gre FROM public.gre_guias WHERE id = p_gre_id AND tenant_id = p_tenant_id;
    RETURN to_jsonb(v_gre) || jsonb_build_object('idempotent', true, 'operation_id', v_op.id);
  END IF;

  SELECT * INTO v_gre FROM public.gre_guias
  WHERE id = p_gre_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_gre.estado::text) IN ('enviado', 'aceptado', 'anulado') THEN
    RAISE EXCEPTION 'GRE_SIGNATURE_STATE_INVALID' USING ERRCODE = '55000';
  END IF;
  v_old := to_jsonb(v_gre);

  INSERT INTO public.gre_operaciones (
    tenant_id, gre_id, accion, idempotency_key, request_fingerprint,
    estado, actor_id, origen, request_summary, response_summary, completed_at
  ) VALUES (
    p_tenant_id, p_gre_id, 'FIRMAR', v_key, v_fp,
    'TERMINADO', p_actor_id, 'USUARIO',
    jsonb_build_object('hash', lower(p_hash)), jsonb_build_object('firmado', true), now()
  ) RETURNING * INTO v_op;

  UPDATE public.gre_guias
  SET xml_ubl = p_xml_ubl,
      xml_firmado = p_xml_firmado,
      hash_gre = lower(p_hash),
      estado = 'FIRMADO', sunat_status = 'READY',
      error_message = NULL, signed_at = now(), updated_by = p_actor_id, updated_at = now()
  WHERE id = p_gre_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_gre;

  UPDATE public.pedido_gres
  SET estado = 'BORRADOR', updated_at = now()
  WHERE tenant_id = p_tenant_id AND gre_id = p_gre_id;

  PERFORM app.audit_fiscal_463(
    p_tenant_id, p_actor_id, 'gre_guias', 'UPDATE', p_gre_id,
    v_old, to_jsonb(v_gre), 'FIRMAR_GRE', jsonb_build_object('operation_id', v_op.id)
  );
  RETURN to_jsonb(v_gre) || jsonb_build_object('idempotent', false, 'operation_id', v_op.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_fallo_firma_gre_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_gre_id uuid,
  p_error_code text,
  p_error_message text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_gre public.gre_guias;
  v_op public.gre_operaciones;
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_fp text;
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id, p_actor_id);
  PERFORM set_config('app.gre_lifecycle_writer_463','on',true);
  IF v_key IS NULL THEN RAISE EXCEPTION 'GRE_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_gre FROM public.gre_guias
  WHERE id = p_gre_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF lower(v_gre.estado::text) IN ('enviado','aceptado','anulado') THEN
    RAISE EXCEPTION 'GRE_SIGNATURE_STATE_INVALID' USING ERRCODE='55000';
  END IF;
  v_fp := app.fiscal_fingerprint_463(jsonb_build_object(
    'gre_id', p_gre_id,
    'error_code', left(COALESCE(p_error_code, 'GRE_SIGNATURE_ERROR'), 100),
    'error_message', left(COALESCE(p_error_message, 'No se pudo firmar la GRE'), 1000)
  ));
  SELECT * INTO v_op FROM public.gre_operaciones
  WHERE tenant_id=p_tenant_id AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_op.gre_id IS DISTINCT FROM p_gre_id OR v_op.accion<>'FIRMAR'
       OR v_op.request_fingerprint IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION 'GRE_SIGNATURE_FAILURE_IDEMPOTENCY_COLLISION' USING ERRCODE='23505';
    END IF;
    RETURN to_jsonb(v_gre)||jsonb_build_object('idempotent',true,'operation_id',v_op.id);
  END IF;
  INSERT INTO public.gre_operaciones (
    tenant_id, gre_id, accion, idempotency_key, request_fingerprint,
    estado, actor_id, origen, error_message, codigo_respuesta, completed_at
  ) VALUES (
    p_tenant_id, p_gre_id, 'FIRMAR', v_key, v_fp, 'ERROR', p_actor_id, 'USUARIO',
    left(COALESCE(p_error_message, 'No se pudo firmar la GRE'), 1000),
    left(COALESCE(p_error_code, 'GRE_SIGNATURE_ERROR'), 100), now()
  );
  UPDATE public.gre_guias
  SET estado='BORRADOR', sunat_status='NOT_SENT',
      error_message=left(COALESCE(p_error_message, 'Firma pendiente'),1000),
      updated_by=p_actor_id, updated_at=now()
  WHERE id=p_gre_id AND tenant_id=p_tenant_id RETURNING * INTO v_gre;
  RETURN to_jsonb(v_gre);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reservar_envio_gre_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_gre_id uuid,
  p_idempotency_key text,
  p_origen text DEFAULT 'USUARIO'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_gre public.gre_guias;
  v_op public.gre_operaciones;
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key,'')), '');
  v_origin text := upper(COALESCE(NULLIF(btrim(p_origen),''),'USUARIO'));
  v_fp text;
  v_claim uuid := gen_random_uuid();
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id, p_actor_id, v_origin IN ('WORKER','SISTEMA'));
  PERFORM set_config('app.gre_lifecycle_writer_463','on',true);
  IF v_origin NOT IN ('USUARIO','WORKER','SISTEMA') OR v_key IS NULL THEN
    RAISE EXCEPTION 'GRE_SEND_REQUEST_INVALID' USING ERRCODE='22023';
  END IF;
  v_fp := app.fiscal_fingerprint_463(jsonb_build_object('gre_id',p_gre_id,'accion','ENVIAR'));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':gre:send:'||p_gre_id::text,0));

  SELECT * INTO v_op FROM public.gre_operaciones
  WHERE tenant_id=p_tenant_id AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_op.request_fingerprint<>v_fp THEN
      RAISE EXCEPTION 'GRE_SEND_IDEMPOTENCY_COLLISION' USING ERRCODE='23505';
    END IF;
    SELECT * INTO v_gre FROM public.gre_guias WHERE id=p_gre_id AND tenant_id=p_tenant_id;
    RETURN jsonb_build_object('claimed',false,'idempotent',true,'operation',to_jsonb(v_op),'gre',to_jsonb(v_gre));
  END IF;

  SELECT * INTO v_gre FROM public.gre_guias
  WHERE id=p_gre_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF lower(v_gre.estado::text)='aceptado' THEN
    RETURN jsonb_build_object('claimed',false,'idempotent',true,'gre',to_jsonb(v_gre),'reason','ALREADY_ACCEPTED');
  END IF;
  IF lower(v_gre.estado::text) NOT IN ('firmado','error')
     OR NULLIF(btrim(COALESCE(v_gre.xml_ubl,'')),'') IS NULL
     OR NULLIF(btrim(COALESCE(v_gre.xml_firmado,'')),'') IS NULL THEN
    RAISE EXCEPTION 'GRE_NOT_READY_TO_SEND' USING ERRCODE='55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.gre_operaciones o
    WHERE o.tenant_id=p_tenant_id AND o.gre_id=p_gre_id AND o.accion='ENVIAR'
      AND o.estado IN ('RESERVADO','PROCESANDO')
  ) THEN
    SELECT * INTO v_op FROM public.gre_operaciones o
    WHERE o.tenant_id=p_tenant_id AND o.gre_id=p_gre_id AND o.accion='ENVIAR'
      AND o.estado IN ('RESERVADO','PROCESANDO') ORDER BY o.created_at DESC LIMIT 1;
    RETURN jsonb_build_object('claimed',false,'idempotent',false,'operation',to_jsonb(v_op),'gre',to_jsonb(v_gre),'reason','IN_FLIGHT');
  END IF;

  INSERT INTO public.gre_operaciones (
    tenant_id,gre_id,accion,idempotency_key,request_fingerprint,estado,
    claim_token,intento,actor_id,origen,request_summary,lease_expires_at
  ) VALUES (
    p_tenant_id,p_gre_id,'ENVIAR',v_key,v_fp,'PROCESANDO',v_claim,
    COALESCE(v_gre.retry_count,0)+1,p_actor_id,v_origin,
    jsonb_build_object('numero',v_gre.numero,'hash',v_gre.hash_gre),now()+interval '5 minutes'
  ) RETURNING * INTO v_op;

  UPDATE public.gre_guias
  SET estado='ENVIADO',sunat_status='SENDING',error_message=NULL,
      last_sent_at=now(),updated_by=COALESCE(p_actor_id,updated_by),updated_at=now()
  WHERE id=p_gre_id AND tenant_id=p_tenant_id RETURNING * INTO v_gre;
  UPDATE public.pedido_gres SET estado='ENVIADO',updated_at=now()
  WHERE tenant_id=p_tenant_id AND gre_id=p_gre_id;

  RETURN jsonb_build_object('claimed',true,'idempotent',false,'operation',to_jsonb(v_op),'gre',to_jsonb(v_gre));
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_envio_gre_tx(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_claim_token uuid,
  p_success boolean,
  p_technical_error boolean,
  p_codigo text,
  p_descripcion text,
  p_ticket text DEFAULT NULL,
  p_numero_sunat text DEFAULT NULL,
  p_hash text DEFAULT NULL,
  p_cdr text DEFAULT NULL,
  p_response_summary jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_op public.gre_operaciones;
  v_gre public.gre_guias;
  v_estado text;
  v_sunat_status text;
  v_next_retry timestamptz;
  v_old jsonb;
  v_terminal_fp text;
BEGIN
  PERFORM set_config('app.gre_lifecycle_writer_463','on',true);
  SELECT * INTO v_op FROM public.gre_operaciones
  WHERE id=p_operation_id AND tenant_id=p_tenant_id AND accion='ENVIAR' FOR UPDATE;
  IF NOT FOUND OR v_op.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'GRE_SEND_CLAIM_INVALID' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_gre FROM public.gre_guias
  WHERE id=v_op.gre_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_terminal_fp:=app.fiscal_fingerprint_463(jsonb_build_object(
    'success',COALESCE(p_success,false),'technical_error',COALESCE(p_technical_error,false),
    'codigo',NULLIF(btrim(COALESCE(p_codigo,'')),''),
    'descripcion',NULLIF(btrim(COALESCE(p_descripcion,'')),''),
    'ticket',NULLIF(btrim(COALESCE(p_ticket,'')),''),
    'numero_sunat',NULLIF(btrim(COALESCE(p_numero_sunat,'')),''),
    'hash',NULLIF(btrim(COALESCE(p_hash,'')),''),
    'cdr_sha256',CASE WHEN NULLIF(btrim(COALESCE(p_cdr,'')),'') IS NULL THEN NULL
      ELSE encode(extensions.digest(convert_to(p_cdr,'UTF8'),'sha256'),'hex') END,
    'response_summary',COALESCE(p_response_summary,'{}'::jsonb)
  ));
  IF v_op.estado IN ('TERMINADO','ERROR') THEN
    IF v_op.terminal_fingerprint IS DISTINCT FROM v_terminal_fp THEN
      RAISE EXCEPTION 'GRE_SEND_TERMINAL_COLLISION' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('operation',to_jsonb(v_op),'gre',to_jsonb(v_gre),'idempotent',true);
  END IF;
  IF v_op.estado<>'PROCESANDO' THEN
    RAISE EXCEPTION 'GRE_SEND_OPERATION_CLOSED' USING ERRCODE='55000';
  END IF;
  v_old:=to_jsonb(v_gre);

  IF COALESCE(p_success,false) THEN
    IF NULLIF(btrim(COALESCE(p_codigo,'')),'') IS NULL
       OR NULLIF(btrim(COALESCE(v_gre.hash_gre,p_hash,'')),'') IS NULL THEN
      RAISE EXCEPTION 'GRE_SEND_SUCCESS_EVIDENCE_INVALID' USING ERRCODE='23514';
    END IF;
    IF NULLIF(btrim(COALESCE(p_ticket,'')),'') IS NOT NULL
       AND NULLIF(btrim(COALESCE(p_cdr,'')),'') IS NULL THEN
      NULL; -- Ticket REST: recibido, aún no aceptado.
    ELSIF NULLIF(btrim(COALESCE(p_cdr,'')),'') IS NULL THEN
      RAISE EXCEPTION 'GRE_SEND_ACCEPTANCE_REQUIRES_CDR' USING ERRCODE='23514';
    END IF;
  ELSIF NULLIF(btrim(COALESCE(p_codigo,'')),'') IS NULL
        OR NULLIF(btrim(COALESCE(p_descripcion,'')),'') IS NULL THEN
    RAISE EXCEPTION 'GRE_SEND_FAILURE_EVIDENCE_INVALID' USING ERRCODE='23514';
  END IF;

  IF p_success AND NULLIF(btrim(COALESCE(p_ticket,'')),'') IS NOT NULL AND NULLIF(btrim(COALESCE(p_cdr,'')),'') IS NULL THEN
    v_estado:='ENVIADO'; v_sunat_status:='SENDING';
  ELSIF p_success THEN
    v_estado:='ACEPTADO'; v_sunat_status:='ACCEPTED';
  ELSIF COALESCE(p_technical_error,false) THEN
    v_estado:='ERROR'; v_sunat_status:='ERROR';
    v_next_retry:=now()+make_interval(mins=>LEAST(60,GREATEST(1,power(2,LEAST(v_op.intento,6))::integer)));
  ELSE
    v_estado:='RECHAZADO'; v_sunat_status:='REJECTED';
  END IF;

  UPDATE public.gre_operaciones
  SET estado=CASE WHEN p_success THEN 'TERMINADO' ELSE 'ERROR' END,
      response_summary=COALESCE(p_response_summary,'{}'::jsonb),
      codigo_respuesta=left(NULLIF(btrim(COALESCE(p_codigo,'')),''),100),
      error_message=CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_descripcion,'Error GRE'),1000) END,
      terminal_fingerprint=v_terminal_fp,lease_expires_at=NULL,updated_at=now(),completed_at=now()
  WHERE id=v_op.id RETURNING * INTO v_op;

  UPDATE public.gre_guias
  SET estado=v_estado,sunat_status=v_sunat_status,
      sunat_ticket=COALESCE(NULLIF(btrim(p_ticket),''),sunat_ticket),
      numero_sunat=COALESCE(NULLIF(btrim(p_numero_sunat),''),numero_sunat),
      hash_gre=COALESCE(NULLIF(btrim(p_hash),''),hash_gre),
      cdr_sunat=COALESCE(NULLIF(btrim(p_cdr),''),cdr_sunat),
      error_message=CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_codigo||': ','')||COALESCE(p_descripcion,'Error GRE'),1000) END,
      retry_count=CASE WHEN p_success THEN retry_count ELSE COALESCE(retry_count,0)+1 END,
      next_retry_at=CASE WHEN v_estado='ERROR' THEN v_next_retry ELSE NULL END,
      updated_at=now()
  WHERE id=v_op.gre_id AND tenant_id=p_tenant_id RETURNING * INTO v_gre;
  UPDATE public.pedido_gres SET estado=v_estado,updated_at=now()
  WHERE tenant_id=p_tenant_id AND gre_id=v_gre.id;

  PERFORM app.audit_fiscal_463(
    p_tenant_id,v_op.actor_id,'gre_guias','UPDATE',v_gre.id,v_old,to_jsonb(v_gre),
    'FINALIZAR_ENVIO_GRE',jsonb_build_object('operation_id',v_op.id,'codigo',p_codigo)
  );
  RETURN jsonb_build_object('operation',to_jsonb(v_op),'gre',to_jsonb(v_gre),'idempotent',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reservar_consulta_gre_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_gre_id uuid,
  p_idempotency_key text,
  p_origen text DEFAULT 'USUARIO'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_gre public.gre_guias; v_op public.gre_operaciones;
  v_key text:=NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');
  v_origin text:=upper(COALESCE(NULLIF(btrim(p_origen),''),'USUARIO'));
  v_fp text; v_claim uuid:=gen_random_uuid();
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id,p_actor_id,v_origin IN ('WORKER','SISTEMA'));
  PERFORM set_config('app.gre_lifecycle_writer_463','on',true);
  IF v_key IS NULL THEN RAISE EXCEPTION 'GRE_QUERY_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
  v_fp:=app.fiscal_fingerprint_463(jsonb_build_object('gre_id',p_gre_id,'accion','CONSULTAR'));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':gre:query:'||p_gre_id::text,0));
  SELECT * INTO v_op FROM public.gre_operaciones WHERE tenant_id=p_tenant_id AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_op.request_fingerprint<>v_fp THEN RAISE EXCEPTION 'GRE_QUERY_IDEMPOTENCY_COLLISION' USING ERRCODE='23505'; END IF;
    SELECT * INTO v_gre FROM public.gre_guias WHERE id=p_gre_id AND tenant_id=p_tenant_id;
    RETURN jsonb_build_object('claimed',false,'idempotent',true,'operation',to_jsonb(v_op),'gre',to_jsonb(v_gre));
  END IF;
  SELECT * INTO v_gre FROM public.gre_guias WHERE id=p_gre_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF lower(v_gre.estado::text)='aceptado' THEN
    RETURN jsonb_build_object('claimed',false,'idempotent',true,'gre',to_jsonb(v_gre),'reason','ALREADY_ACCEPTED');
  END IF;
  IF lower(v_gre.estado::text) NOT IN ('enviado','error')
     OR NULLIF(btrim(COALESCE(v_gre.sunat_ticket,v_gre.numero_sunat,v_gre.numero,'')),'') IS NULL THEN
    RAISE EXCEPTION 'GRE_NOT_QUERYABLE' USING ERRCODE='55000';
  END IF;
  IF EXISTS(SELECT 1 FROM public.gre_operaciones o WHERE o.tenant_id=p_tenant_id AND o.gre_id=p_gre_id AND o.accion='CONSULTAR' AND o.estado IN('RESERVADO','PROCESANDO')) THEN
    SELECT * INTO v_op FROM public.gre_operaciones o WHERE o.tenant_id=p_tenant_id AND o.gre_id=p_gre_id AND o.accion='CONSULTAR' AND o.estado IN('RESERVADO','PROCESANDO') ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('claimed',false,'idempotent',false,'operation',to_jsonb(v_op),'gre',to_jsonb(v_gre),'reason','IN_FLIGHT');
  END IF;
  INSERT INTO public.gre_operaciones(tenant_id,gre_id,accion,idempotency_key,request_fingerprint,estado,claim_token,actor_id,origen,request_summary)
  VALUES(p_tenant_id,p_gre_id,'CONSULTAR',v_key,v_fp,'PROCESANDO',v_claim,p_actor_id,v_origin,jsonb_build_object('numero',v_gre.numero,'ticket',v_gre.sunat_ticket,'numero_sunat',v_gre.numero_sunat)) RETURNING * INTO v_op;
  UPDATE public.gre_guias SET last_consulted_at=now(),updated_by=COALESCE(p_actor_id,updated_by),updated_at=now() WHERE id=p_gre_id;
  RETURN jsonb_build_object('claimed',true,'idempotent',false,'operation',to_jsonb(v_op),'gre',to_jsonb(v_gre));
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_consulta_gre_tx(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_claim_token uuid,
  p_success boolean,
  p_pending boolean,
  p_technical_error boolean,
  p_codigo text,
  p_descripcion text,
  p_cdr text DEFAULT NULL,
  p_response_summary jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE v_op public.gre_operaciones; v_gre public.gre_guias; v_old jsonb; v_state text; v_status text;v_terminal_fp text;
BEGIN
  PERFORM set_config('app.gre_lifecycle_writer_463','on',true);
  SELECT * INTO v_op FROM public.gre_operaciones WHERE id=p_operation_id AND tenant_id=p_tenant_id AND accion='CONSULTAR' FOR UPDATE;
  IF NOT FOUND OR v_op.claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'GRE_QUERY_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_gre FROM public.gre_guias WHERE id=v_op.gre_id AND tenant_id=p_tenant_id FOR UPDATE;
  v_terminal_fp:=app.fiscal_fingerprint_463(jsonb_build_object(
    'success',COALESCE(p_success,false),'pending',COALESCE(p_pending,false),
    'technical_error',COALESCE(p_technical_error,false),
    'codigo',NULLIF(btrim(COALESCE(p_codigo,'')),''),
    'descripcion',NULLIF(btrim(COALESCE(p_descripcion,'')),''),
    'cdr_sha256',CASE WHEN NULLIF(btrim(COALESCE(p_cdr,'')),'') IS NULL THEN NULL
      ELSE encode(extensions.digest(convert_to(p_cdr,'UTF8'),'sha256'),'hex') END,
    'response_summary',COALESCE(p_response_summary,'{}'::jsonb)
  ));
  IF v_op.estado IN ('TERMINADO','ERROR') THEN
    IF v_op.terminal_fingerprint IS DISTINCT FROM v_terminal_fp THEN RAISE EXCEPTION 'GRE_QUERY_TERMINAL_COLLISION' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('operation',to_jsonb(v_op),'gre',to_jsonb(v_gre),'idempotent',true);
  END IF;
  IF v_op.estado<>'PROCESANDO' THEN RAISE EXCEPTION 'GRE_QUERY_OPERATION_CLOSED' USING ERRCODE='55000'; END IF;
  IF NULLIF(btrim(COALESCE(p_codigo,'')),'') IS NULL OR NULLIF(btrim(COALESCE(p_descripcion,'')),'') IS NULL THEN
    RAISE EXCEPTION 'GRE_QUERY_EVIDENCE_INVALID' USING ERRCODE='23514';
  END IF;
  IF COALESCE(p_success,false) AND NULLIF(btrim(COALESCE(p_cdr,'')),'') IS NULL THEN
    RAISE EXCEPTION 'GRE_QUERY_ACCEPTANCE_REQUIRES_CDR' USING ERRCODE='23514';
  END IF;
  v_old:=to_jsonb(v_gre);
  IF p_success THEN v_state:='ACEPTADO';v_status:='ACCEPTED';
  ELSIF COALESCE(p_pending,false) THEN v_state:='ENVIADO';v_status:='SENDING';
  ELSIF COALESCE(p_technical_error,false) THEN v_state:='ERROR';v_status:='ERROR';
  ELSE v_state:='RECHAZADO';v_status:='REJECTED'; END IF;
  UPDATE public.gre_operaciones SET estado=CASE WHEN p_success OR p_pending THEN 'TERMINADO' ELSE 'ERROR' END,
    response_summary=COALESCE(p_response_summary,'{}'::jsonb),codigo_respuesta=left(NULLIF(btrim(COALESCE(p_codigo,'')),''),100),
    error_message=CASE WHEN p_success OR p_pending THEN NULL ELSE left(COALESCE(p_descripcion,'Error GRE'),1000) END,
    terminal_fingerprint=v_terminal_fp,updated_at=now(),completed_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  UPDATE public.gre_guias SET estado=v_state,sunat_status=v_status,
    cdr_sunat=COALESCE(NULLIF(btrim(p_cdr),''),cdr_sunat),
    error_message=CASE WHEN p_success OR p_pending THEN NULL ELSE left(COALESCE(p_codigo||': ','')||COALESCE(p_descripcion,'Error GRE'),1000) END,
    next_retry_at=CASE WHEN v_state='ERROR' THEN now()+interval '5 minutes' ELSE NULL END,updated_at=now()
  WHERE id=v_gre.id AND tenant_id=p_tenant_id RETURNING * INTO v_gre;
  UPDATE public.pedido_gres SET estado=v_state,updated_at=now() WHERE tenant_id=p_tenant_id AND gre_id=v_gre.id;
  PERFORM app.audit_fiscal_463(p_tenant_id,v_op.actor_id,'gre_guias','UPDATE',v_gre.id,v_old,to_jsonb(v_gre),'FINALIZAR_CONSULTA_GRE',jsonb_build_object('operation_id',v_op.id,'codigo',p_codigo));
  RETURN jsonb_build_object('operation',to_jsonb(v_op),'gre',to_jsonb(v_gre),'idempotent',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.anular_gre_tx(
  p_tenant_id uuid,p_actor_id uuid,p_gre_id uuid,p_motivo text,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE v_gre public.gre_guias;v_old jsonb;v_key text:=NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');v_fp text;v_op public.gre_operaciones;
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id,p_actor_id);
  PERFORM set_config('app.gre_lifecycle_writer_463','on',true);
  IF v_key IS NULL OR length(btrim(COALESCE(p_motivo,'')))<5 THEN RAISE EXCEPTION 'GRE_CANCEL_REQUEST_INVALID' USING ERRCODE='22023'; END IF;
  v_fp:=app.fiscal_fingerprint_463(jsonb_build_object('gre_id',p_gre_id,'motivo',btrim(p_motivo)));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':gre:cancel:'||p_gre_id::text,0));
  SELECT * INTO v_op FROM public.gre_operaciones WHERE tenant_id=p_tenant_id AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_op.request_fingerprint<>v_fp THEN RAISE EXCEPTION 'GRE_CANCEL_IDEMPOTENCY_COLLISION' USING ERRCODE='23505'; END IF;
    SELECT * INTO v_gre FROM public.gre_guias WHERE id=p_gre_id AND tenant_id=p_tenant_id;
    RETURN to_jsonb(v_gre)||jsonb_build_object('idempotent',true,'operation_id',v_op.id);
  END IF;
  SELECT * INTO v_gre FROM public.gre_guias WHERE id=p_gre_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF lower(v_gre.estado::text) IN ('enviado','aceptado') THEN RAISE EXCEPTION 'GRE_CANCEL_REQUIRES_FISCAL_FLOW' USING ERRCODE='55000'; END IF;
  v_old:=to_jsonb(v_gre);
  INSERT INTO public.gre_operaciones(tenant_id,gre_id,accion,idempotency_key,request_fingerprint,estado,actor_id,origen,request_summary,response_summary,completed_at)
  VALUES(p_tenant_id,p_gre_id,'ANULAR',v_key,v_fp,'TERMINADO',p_actor_id,'USUARIO',jsonb_build_object('motivo',btrim(p_motivo)),jsonb_build_object('anulado',true),now()) RETURNING * INTO v_op;
  UPDATE public.gre_guias SET estado='ANULADO',sunat_status='NOT_SENT',motivo_anulacion=btrim(p_motivo),anulado_at=now(),anulado_por=p_actor_id,updated_by=p_actor_id,error_message=NULL,next_retry_at=NULL,updated_at=now()
  WHERE id=p_gre_id AND tenant_id=p_tenant_id RETURNING * INTO v_gre;
  UPDATE public.pedido_gres SET estado='ANULADO',updated_at=now() WHERE tenant_id=p_tenant_id AND gre_id=p_gre_id;
  UPDATE public.pedidos_venta SET gre_id=NULL,updated_at=now() WHERE tenant_id=p_tenant_id AND gre_id=p_gre_id;
  PERFORM app.audit_fiscal_463(p_tenant_id,p_actor_id,'gre_guias','UPDATE',p_gre_id,v_old,to_jsonb(v_gre),'ANULAR_GRE',jsonb_build_object('operation_id',v_op.id));
  RETURN to_jsonb(v_gre)||jsonb_build_object('idempotent',false,'operation_id',v_op.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_config_gre_tx(
  p_tenant_id uuid,p_actor_id uuid,p_payload jsonb,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE v_old public.empresa_config;v_new public.empresa_config;v_threshold numeric;v_key text:=NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id,p_actor_id);
  PERFORM set_config('app.gre_lifecycle_writer_463','on',true);
  IF v_key IS NULL THEN RAISE EXCEPTION 'GRE_CONFIG_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':gre:config:'||v_key,0));
  SELECT * INTO v_old FROM public.empresa_config WHERE tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND OR upper(COALESCE(v_old.pais,''))<>'PE' THEN RAISE EXCEPTION 'GRE_ONLY_PERU' USING ERRCODE='22023'; END IF;
  v_threshold:=CASE WHEN p_payload ? 'umbral_gre_automatico' THEN (p_payload->>'umbral_gre_automatico')::numeric ELSE v_old.umbral_gre_automatico END;
  IF v_threshold<0 OR v_threshold>999999999 THEN RAISE EXCEPTION 'GRE_THRESHOLD_INVALID' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.audit_log a WHERE a.tenant_id=p_tenant_id AND a.table_name='empresa_config' AND a.metadata->>'source'='gre_sire_463' AND a.metadata->>'idempotency_key'=v_key) THEN
    RETURN to_jsonb(v_old)||jsonb_build_object('idempotent',true);
  END IF;
  UPDATE public.empresa_config SET
    umbral_gre_automatico=v_threshold,
    gre_automatico_habilitado=CASE WHEN p_payload?'gre_automatico_habilitado' THEN (p_payload->>'gre_automatico_habilitado')::boolean ELSE gre_automatico_habilitado END,
    gre_obligatorio=CASE WHEN p_payload?'gre_obligatorio' THEN (p_payload->>'gre_obligatorio')::boolean ELSE gre_obligatorio END,
    updated_at=now()
  WHERE tenant_id=p_tenant_id RETURNING * INTO v_new;
  PERFORM app.audit_fiscal_463(p_tenant_id,p_actor_id,'empresa_config','UPDATE',v_new.id,to_jsonb(v_old),to_jsonb(v_new),'ACTUALIZAR_CONFIG_GRE',jsonb_build_object('idempotency_key',v_key));
  RETURN to_jsonb(v_new)||jsonb_build_object('idempotent',false);
END;
$function$;

-- ---------------------------------------------------------------------------
-- SIRE: comparación local congelada y aceptación/consulta con finalizadores
-- atómicos sobre bitácora + reporte.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.build_sire_snapshot_463(
  p_tenant_id uuid,
  p_tipo text,
  p_periodo text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tipo text := upper(COALESCE(p_tipo,''));
  v_periodo text := btrim(COALESCE(p_periodo,''));
  v_start date;
  v_end date;
  v_cutoff timestamptz := clock_timestamp();
  v_include_cancelled boolean := COALESCE((COALESCE(p_metadata,'{}'::jsonb)->>'incluirAnulados')::boolean,false);
  v_header text;
  v_rows text;
  v_content text;
  v_manifest jsonb := '[]'::jsonb;
  v_totals jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_fingerprint text;
BEGIN
  IF v_tipo NOT IN ('REG_VEN','REG_COM')
     OR v_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'SIRE_SNAPSHOT_REQUEST_INVALID' USING ERRCODE='22023';
  END IF;
  v_start := to_date(v_periodo||'-01','YYYY-MM-DD');
  v_end := (v_start + interval '1 month')::date;

  IF v_tipo='REG_VEN' THEN
    PERFORM c.id
    FROM public.cpe c
    WHERE c.tenant_id=p_tenant_id
      AND c.fecha_emision>=v_start AND c.fecha_emision<v_end
      AND c.created_at<=v_cutoff
      AND (lower(c.estado::text)='aceptado'
        OR (v_include_cancelled AND lower(c.estado::text)='anulado'))
    ORDER BY c.id
    FOR SHARE;

    v_header := 'PERIODO|FECHA_EMISION|TIPO_DOCUMENTO|SERIE|NUMERO|DOC_CLIENTE|CLIENTE|VALOR_FACTURADO|IGV|TOTAL|MONEDA';
    SELECT
      string_agg(
        concat_ws('|',
          v_periodo,
          to_char(c.fecha_emision AT TIME ZONE 'America/Lima','YYYY-MM-DD'),
          COALESCE(c.tipo_documento,''), COALESCE(c.serie,''),
          lpad(COALESCE(c.numero,c.numero_comprobante::text,''),8,'0'),
          COALESCE(c.documento_receptor,''),
          replace(replace(COALESCE(c.razon_social_receptor,''),'|',' '),E'\n',' '),
          (COALESCE(c.total_venta,c.total,0)-COALESCE(c.total_igv,0))::text,
          COALESCE(c.total_igv,0)::text,
          COALESCE(c.total_venta,c.total,0)::text,
          COALESCE(NULLIF(upper(c.moneda),''),'PEN')
        ), E'\n' ORDER BY c.fecha_emision,c.id
      ),
      COALESCE(jsonb_agg(jsonb_build_object(
        'id',c.id,'updated_at',c.updated_at,'estado',c.estado,
        'total',COALESCE(c.total_venta,c.total,0),'igv',COALESCE(c.total_igv,0)
      ) ORDER BY c.id),'[]'::jsonb),
      count(*)::integer,
      jsonb_build_object(
        'base',COALESCE(sum(COALESCE(c.total_venta,c.total,0)-COALESCE(c.total_igv,0)),0),
        'igv',COALESCE(sum(COALESCE(c.total_igv,0)),0),
        'total',COALESCE(sum(COALESCE(c.total_venta,c.total,0)),0)
      )
    INTO v_rows,v_manifest,v_count,v_totals
    FROM public.cpe c
    WHERE c.tenant_id=p_tenant_id
      AND c.fecha_emision>=v_start AND c.fecha_emision<v_end
      AND c.created_at<=v_cutoff
      AND (lower(c.estado::text)='aceptado'
        OR (v_include_cancelled AND lower(c.estado::text)='anulado'));
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.cuentas_por_pagar cp
      WHERE cp.tenant_id=p_tenant_id
        AND cp.fecha_emision>=v_start AND cp.fecha_emision<v_end
        AND cp.created_at<=v_cutoff
        AND upper(COALESCE(cp.moneda,'PEN'))<>'PEN'
        AND COALESCE(NULLIF(cp.fiscal_metadata->>'tipo_cambio','')::numeric,cp.tipo_cambio_origen,0)<=0
        AND (v_include_cancelled OR lower(cp.estado::text) NOT IN ('anulado','anulada','cancelado','cancelada'))
    ) THEN
      RAISE EXCEPTION 'SIRE_RCE_EXCHANGE_RATE_REQUIRED' USING ERRCODE='23514';
    END IF;

    PERFORM cp.id
    FROM public.cuentas_por_pagar cp
    WHERE cp.tenant_id=p_tenant_id
      AND cp.fecha_emision>=v_start AND cp.fecha_emision<v_end
      AND cp.created_at<=v_cutoff
      AND upper(COALESCE(cp.tipo_documento,'')) IN ('FACTURA','NOTA_CREDITO','NOTA_DEBITO','RECIBO_HONORARIOS')
      AND (v_include_cancelled OR lower(cp.estado::text) NOT IN ('anulado','anulada','cancelado','cancelada'))
    ORDER BY cp.id
    FOR SHARE;

    v_header := 'PERIODO|FECHA_EMISION|TIPO_DOCUMENTO|NUMERO|RUC_PROVEEDOR|PROVEEDOR|VALOR_ADQUISICIONES|IGV|TOTAL|MONEDA|TIPO_CAMBIO|DOC_MODIFICADO';
    SELECT
      string_agg(
        concat_ws('|',
          v_periodo, to_char(cp.fecha_emision,'YYYY-MM-DD'),
          COALESCE(cp.tipo_documento,''), COALESCE(cp.numero_documento,cp.numero,''),
          COALESCE(pr.ruc,pr.numero_documento,pr.documento_numero,''),
          replace(replace(COALESCE(pr.razon_social,pr.nombre,''),'|',' '),E'\n',' '),
          (CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END * COALESCE(cp.subtotal,0))::text,
          (CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END * COALESCE(cp.igv,0))::text,
          (CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END * COALESCE(cp.total,0))::text,
          COALESCE(NULLIF(upper(cp.moneda),''),'PEN'),
          CASE WHEN upper(COALESCE(cp.moneda,'PEN'))='PEN' THEN '1'
               ELSE COALESCE(NULLIF(cp.fiscal_metadata->>'tipo_cambio',''),cp.tipo_cambio_origen::text) END,
          concat_ws('-',NULLIF(cp.fiscal_metadata->>'documento_referencia_tipo',''),
            NULLIF(cp.fiscal_metadata->>'documento_referencia_serie',''),
            NULLIF(cp.fiscal_metadata->>'documento_referencia_numero',''))
        ), E'\n' ORDER BY cp.fecha_emision,cp.id
      ),
      COALESCE(jsonb_agg(jsonb_build_object(
        'id',cp.id,'updated_at',cp.updated_at,'estado',cp.estado,'tipo',cp.tipo_documento,
        'subtotal',cp.subtotal,'igv',cp.igv,'total',cp.total
      ) ORDER BY cp.id),'[]'::jsonb),
      count(*)::integer,
      jsonb_build_object(
        'base',COALESCE(sum((CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END)*COALESCE(cp.subtotal,0)),0),
        'igv',COALESCE(sum((CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END)*COALESCE(cp.igv,0)),0),
        'total',COALESCE(sum((CASE WHEN upper(COALESCE(cp.tipo_documento,''))='NOTA_CREDITO' THEN -1 ELSE 1 END)*COALESCE(cp.total,0)),0)
      )
    INTO v_rows,v_manifest,v_count,v_totals
    FROM public.cuentas_por_pagar cp
    LEFT JOIN public.proveedores pr
      ON pr.id=cp.proveedor_id AND pr.tenant_id=cp.tenant_id
    WHERE cp.tenant_id=p_tenant_id
      AND cp.fecha_emision>=v_start AND cp.fecha_emision<v_end
      AND cp.created_at<=v_cutoff
      AND upper(COALESCE(cp.tipo_documento,'')) IN ('FACTURA','NOTA_CREDITO','NOTA_DEBITO','RECIBO_HONORARIOS')
      AND (v_include_cancelled OR lower(cp.estado::text) NOT IN ('anulado','anulada','cancelado','cancelada'));
  END IF;

  v_content := v_header || CASE WHEN COALESCE(v_rows,'')='' THEN '' ELSE E'\n'||v_rows END;
  v_fingerprint := app.fiscal_fingerprint_463(jsonb_build_object(
    'tipo',v_tipo,'periodo',v_periodo,'manifest',v_manifest,'totals',v_totals,
    'content_sha256',encode(extensions.digest(convert_to(v_content,'UTF8'),'sha256'),'hex')
  ));
  RETURN jsonb_build_object(
    'contenido',v_content,'manifest',v_manifest,'total_registros',v_count,
    'totals',v_totals,'cutoff_at',v_cutoff,'source_fingerprint',v_fingerprint,
    'contenido_sha256',encode(extensions.digest(convert_to(v_content,'UTF8'),'sha256'),'hex')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.generar_reporte_sire_tx(
  p_tenant_id uuid,p_actor_id uuid,p_tipo text,p_periodo text,p_metadata jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE v_tipo text:=upper(COALESCE(p_tipo,''));v_periodo text:=btrim(COALESCE(p_periodo,''));v_key text:=NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');v_request_fp text;v_snapshot jsonb;v_existing public.sire_files;v_report public.sire_files;
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id,p_actor_id);
  PERFORM set_config('app.sire_lifecycle_writer_463','on',true);
  IF v_tipo NOT IN('REG_VEN','REG_COM') OR v_periodo!~'^[0-9]{4}-(0[1-9]|1[0-2])$' OR v_key IS NULL THEN RAISE EXCEPTION 'SIRE_GENERATION_REQUEST_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.empresa_config ec WHERE ec.tenant_id=p_tenant_id AND upper(ec.pais)='PE') THEN RAISE EXCEPTION 'SIRE_ONLY_PERU' USING ERRCODE='22023'; END IF;
  v_request_fp:=app.fiscal_fingerprint_463(jsonb_build_object('tipo',v_tipo,'periodo',v_periodo,'metadata',COALESCE(p_metadata,'{}'::jsonb)));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':sire:generate:'||v_key,0));
  SELECT * INTO v_existing FROM public.sire_files WHERE tenant_id=p_tenant_id AND generation_idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.generation_request_fingerprint IS DISTINCT FROM v_request_fp THEN RAISE EXCEPTION 'SIRE_GENERATION_IDEMPOTENCY_COLLISION' USING ERRCODE='23505'; END IF;
    RETURN to_jsonb(v_existing)||jsonb_build_object('idempotent',true);
  END IF;
  SELECT * INTO v_existing FROM public.sire_files WHERE tenant_id=p_tenant_id AND periodo=v_periodo AND tipo=v_tipo FOR UPDATE;
  IF FOUND AND (v_existing.sunat_ticket IS NOT NULL OR lower(v_existing.estado::text) IN('pendiente','enviado')) THEN RAISE EXCEPTION 'SIRE_REPORT_IMMUTABLE_AFTER_SUBMISSION' USING ERRCODE='55000'; END IF;
  v_snapshot:=app.build_sire_snapshot_463(p_tenant_id,v_tipo,v_periodo,COALESCE(p_metadata,'{}'::jsonb));
  IF FOUND THEN
    UPDATE public.sire_files SET estado='GENERADO',status='COMPLETED',metadata=COALESCE(p_metadata,'{}'::jsonb),filename='SIRE_'||v_tipo||'_'||v_periodo||'.txt',file_path='/sire/'||v_periodo||'/'||lower(v_tipo)||'.txt',file_size=octet_length(convert_to(v_snapshot->>'contenido','UTF8')),total_registros=(v_snapshot->>'total_registros')::integer,contenido_local=v_snapshot->>'contenido',contenido_sha256=v_snapshot->>'contenido_sha256',source_cutoff_at=(v_snapshot->>'cutoff_at')::timestamptz,source_manifest=v_snapshot->'manifest',source_fingerprint=v_snapshot->>'source_fingerprint',source_totals=v_snapshot->'totals',completed_at=now(),generation_idempotency_key=v_key,generation_fingerprint=v_snapshot->>'source_fingerprint',generation_request_fingerprint=v_request_fp,created_by=COALESCE(created_by,p_actor_id),updated_by=p_actor_id,error_message=NULL,correction_required=false,correction_reason=NULL,updated_at=now() WHERE id=v_existing.id RETURNING * INTO v_report;
  ELSE
    INSERT INTO public.sire_files(tenant_id,periodo,period,tipo,filename,file_path,file_size,total_registros,estado,status,metadata,contenido_local,contenido_sha256,source_cutoff_at,source_manifest,source_fingerprint,source_totals,completed_at,generation_idempotency_key,generation_fingerprint,generation_request_fingerprint,created_by,updated_by)
    VALUES(p_tenant_id,v_periodo,v_periodo,v_tipo,'SIRE_'||v_tipo||'_'||v_periodo||'.txt','/sire/'||v_periodo||'/'||lower(v_tipo)||'.txt',octet_length(convert_to(v_snapshot->>'contenido','UTF8')),(v_snapshot->>'total_registros')::integer,'GENERADO','COMPLETED',COALESCE(p_metadata,'{}'::jsonb),v_snapshot->>'contenido',v_snapshot->>'contenido_sha256',(v_snapshot->>'cutoff_at')::timestamptz,v_snapshot->'manifest',v_snapshot->>'source_fingerprint',v_snapshot->'totals',now(),v_key,v_snapshot->>'source_fingerprint',v_request_fp,p_actor_id,p_actor_id) RETURNING * INTO v_report;
  END IF;
  PERFORM app.audit_fiscal_463(p_tenant_id,p_actor_id,'sire_files',CASE WHEN v_existing.id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,v_report.id,CASE WHEN v_existing.id IS NULL THEN NULL ELSE to_jsonb(v_existing) END,to_jsonb(v_report),'GENERAR_REPORTE_SIRE',jsonb_build_object('idempotency_key',v_key,'source_fingerprint',v_snapshot->>'source_fingerprint'));
  RETURN to_jsonb(v_report)||jsonb_build_object('idempotent',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_comprobante_sire_tx(
  p_tenant_id uuid,p_cpe_id uuid,p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE v_cpe public.cpe;v_periodo text;v_report public.sire_files;v_detail public.sire_registros_detalle;v_incident public.sire_incidencias;v_inserted boolean:=false;
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id,NULL,true);
  PERFORM set_config('app.sire_lifecycle_writer_463','on',true);
  SELECT * INTO v_cpe FROM public.cpe WHERE id=p_cpe_id AND tenant_id=p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIRE_CPE_NOT_FOUND' USING ERRCODE='23503'; END IF;
  v_periodo:=to_char(COALESCE(v_cpe.fecha_emision,v_cpe.created_at),'YYYY-MM');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':sire:cpe:'||p_cpe_id::text,0));
  SELECT * INTO v_report FROM public.sire_files WHERE tenant_id=p_tenant_id AND periodo=v_periodo AND tipo='REG_VEN' FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.sire_files(tenant_id,periodo,period,tipo,filename,file_path,file_size,total_registros,estado,status,metadata,correlacion_id,correlacion_tipo)
    VALUES(p_tenant_id,v_periodo,v_periodo,'REG_VEN','SIRE_REG_VEN_'||v_periodo||'.txt','/sire/'||v_periodo||'/reg_ven.txt',0,0,'GENERANDO','RUNNING',jsonb_build_object('source','CPE_EVENT'),p_event_id,'CPE_EVENT') RETURNING * INTO v_report;
  ELSIF v_report.sunat_ticket IS NOT NULL OR lower(v_report.estado::text) IN('pendiente','enviado') THEN
    INSERT INTO public.sire_incidencias(
      tenant_id,cpe_id,reporte_id,periodo,tipo,codigo,estado,detalle,metadata
    ) VALUES (
      p_tenant_id,p_cpe_id,v_report.id,v_periodo,'REG_VEN','CPE_AFTER_REPORT_FROZEN','PENDIENTE',
      'CPE aceptado después de congelar/aceptar el período; requiere regularización o ajuste fiscal',
      jsonb_build_object('event_id',p_event_id,'report_estado',v_report.estado,'sunat_ticket',v_report.sunat_ticket)
    ) ON CONFLICT (tenant_id,cpe_id,codigo) DO UPDATE
      SET reporte_id=EXCLUDED.reporte_id,updated_at=now()
    RETURNING * INTO v_incident;
    UPDATE public.sire_files
    SET correction_required=true,
        correction_reason='Existen CPE posteriores al cierre del período; revise incidencias SIRE',
        updated_at=now()
    WHERE id=v_report.id AND tenant_id=p_tenant_id
    RETURNING * INTO v_report;
    RETURN jsonb_build_object(
      'inserted',false,'report',to_jsonb(v_report),'reason','REPORT_FROZEN',
      'correction_required',true,'incident',to_jsonb(v_incident)
    );
  END IF;
  SELECT * INTO v_detail FROM public.sire_registros_detalle WHERE tenant_id=p_tenant_id AND cpe_id=p_cpe_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.sire_registros_detalle(tenant_id,reporte_id,cpe_id,tipo_documento,serie,numero,cliente_id,total,fecha_registro,es_credito,venta_id,estado,metadata)
    VALUES(p_tenant_id,v_report.id,p_cpe_id,COALESCE(v_cpe.tipo_documento,'00'),COALESCE(v_cpe.serie,'SIN_SERIE'),COALESCE(NULLIF(v_cpe.numero,''),v_cpe.numero_comprobante::text,'0'),v_cpe.cliente_id,COALESCE(v_cpe.total_venta,v_cpe.total,0),COALESCE(v_cpe.fecha_emision,now()),false,NULL,'REGISTRADO',jsonb_build_object('event_id',p_event_id)) RETURNING * INTO v_detail;
    v_inserted:=true;
  END IF;
  UPDATE public.sire_files SET total_registros=(SELECT count(*) FROM public.sire_registros_detalle d WHERE d.tenant_id=p_tenant_id AND d.reporte_id=v_report.id AND lower(d.estado::text)='registrado'),estado='GENERANDO',status='RUNNING',updated_at=now() WHERE id=v_report.id RETURNING * INTO v_report;
  RETURN jsonb_build_object('inserted',v_inserted,'report',to_jsonb(v_report),'detail',to_jsonb(v_detail));
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_generacion_sire_evento_tx(
  p_tenant_id uuid,p_reporte_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE v_report public.sire_files;v_snapshot jsonb;
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id,NULL,true);
  PERFORM set_config('app.sire_lifecycle_writer_463','on',true);
  SELECT * INTO v_report FROM public.sire_files WHERE id=p_reporte_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIRE_REPORT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_report.sunat_ticket IS NOT NULL OR lower(v_report.estado::text) IN('pendiente','enviado') THEN RETURN to_jsonb(v_report)||jsonb_build_object('frozen',true); END IF;
  v_snapshot:=app.build_sire_snapshot_463(p_tenant_id,v_report.tipo,v_report.periodo,v_report.metadata);
  UPDATE public.sire_files SET estado='GENERADO',status='COMPLETED',
    contenido_local=v_snapshot->>'contenido',contenido_sha256=v_snapshot->>'contenido_sha256',
    file_size=octet_length(convert_to(v_snapshot->>'contenido','UTF8')),
    total_registros=(v_snapshot->>'total_registros')::integer,
    source_cutoff_at=(v_snapshot->>'cutoff_at')::timestamptz,
    source_manifest=v_snapshot->'manifest',source_fingerprint=v_snapshot->>'source_fingerprint',
    source_totals=v_snapshot->'totals',completed_at=now(),error_message=NULL,updated_at=now()
  WHERE id=p_reporte_id RETURNING * INTO v_report;
  RETURN to_jsonb(v_report);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reservar_aceptacion_sire_tx(
  p_tenant_id uuid,p_actor_id uuid,p_reporte_id uuid,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE v_report public.sire_files;v_op public.sire_operaciones;v_config public.empresa_config;v_key text:=NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');v_fp text;v_claim uuid:=gen_random_uuid();v_snapshot jsonb;
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id,p_actor_id);
  IF v_key IS NULL THEN RAISE EXCEPTION 'SIRE_ACCEPT_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_config FROM public.empresa_config WHERE tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND OR upper(COALESCE(v_config.pais,''))<>'PE' OR COALESCE(v_config.is_demo,false) OR NOT COALESCE(v_config.sire_activo,false) THEN RAISE EXCEPTION 'SIRE_REAL_NOT_ENABLED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':sire:accept:'||p_reporte_id::text,0));
  SELECT * INTO v_report FROM public.sire_files WHERE id=p_reporte_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIRE_REPORT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_fp:=app.fiscal_fingerprint_463(jsonb_build_object('reporte_id',p_reporte_id,'tipo',v_report.tipo,'periodo',v_report.periodo));
  SELECT * INTO v_op FROM public.sire_operaciones WHERE tenant_id=p_tenant_id AND idempotency_key=v_key ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_op.request_fingerprint IS DISTINCT FROM v_fp THEN RAISE EXCEPTION 'SIRE_ACCEPT_IDEMPOTENCY_COLLISION' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('claimed',false,'idempotent',true,'operation',to_jsonb(v_op),'report',to_jsonb(v_report));
  END IF;
  IF lower(v_report.estado::text)='enviado' AND v_report.sunat_ticket IS NOT NULL THEN RETURN jsonb_build_object('claimed',false,'idempotent',true,'report',to_jsonb(v_report),'reason','ALREADY_ACCEPTED'); END IF;
  IF lower(v_report.estado::text)='pendiente' AND v_report.sunat_ticket IS NOT NULL THEN RETURN jsonb_build_object('claimed',false,'idempotent',true,'report',to_jsonb(v_report),'reason','TICKET_PENDING'); END IF;
  IF lower(v_report.estado::text) NOT IN('generado','error') OR v_report.tipo NOT IN('REG_VEN','REG_COM') THEN RAISE EXCEPTION 'SIRE_REPORT_NOT_READY' USING ERRCODE='55000'; END IF;
  IF COALESCE(v_report.correction_required,false) OR v_report.source_fingerprint IS NULL THEN
    RAISE EXCEPTION 'SIRE_REPORT_REQUIRES_REGENERATION' USING ERRCODE='55000';
  END IF;
  v_snapshot:=app.build_sire_snapshot_463(p_tenant_id,v_report.tipo,v_report.periodo,v_report.metadata);
  IF v_snapshot->>'source_fingerprint' IS DISTINCT FROM v_report.source_fingerprint THEN
    RAISE EXCEPTION 'SIRE_SNAPSHOT_STALE_REGENERATE' USING ERRCODE='55000';
  END IF;
  INSERT INTO public.sire_operaciones(tenant_id,reporte_id,accion,tipo_libro,periodo,idempotency_key,request_fingerprint,claim_token,estado,solicitado_por,request_summary)
  VALUES(p_tenant_id,p_reporte_id,'ACEPTAR_PROPUESTA',v_report.tipo,replace(v_report.periodo,'-',''),v_key,v_fp,v_claim,'SOLICITADO',p_actor_id,jsonb_build_object('periodo',replace(v_report.periodo,'-',''),'libro',CASE WHEN v_report.tipo='REG_VEN' THEN 'RVIE' ELSE 'RCE' END,'origen','API')) RETURNING * INTO v_op;
  RETURN jsonb_build_object('claimed',true,'idempotent',false,'operation',to_jsonb(v_op),'report',to_jsonb(v_report));
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_aceptacion_sire_tx(
  p_tenant_id uuid,p_operation_id uuid,p_claim_token uuid,p_ticket text,p_http_status integer,p_response_summary jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE v_op public.sire_operaciones;v_report public.sire_files;v_ticket text:=NULLIF(btrim(COALESCE(p_ticket,'')),'');v_terminal_fp text;v_snapshot jsonb;v_source_changed boolean:=false;
BEGIN
  PERFORM set_config('app.sire_lifecycle_writer_463','on',true);
  IF v_ticket IS NULL OR v_ticket!~'^[A-Za-z0-9-]{6,40}$' THEN RAISE EXCEPTION 'SIRE_TICKET_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_op FROM public.sire_operaciones WHERE id=p_operation_id AND tenant_id=p_tenant_id AND accion='ACEPTAR_PROPUESTA' FOR UPDATE;
  IF NOT FOUND OR v_op.claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'SIRE_ACCEPT_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_report FROM public.sire_files WHERE id=v_op.reporte_id AND tenant_id=p_tenant_id FOR UPDATE;
  v_terminal_fp:=app.fiscal_fingerprint_463(jsonb_build_object('ticket',v_ticket,'http_status',p_http_status,'response_summary',COALESCE(p_response_summary,'{}'::jsonb)));
  IF v_op.estado='PROCESANDO' THEN
    IF v_op.terminal_fingerprint IS DISTINCT FROM v_terminal_fp THEN RAISE EXCEPTION 'SIRE_ACCEPT_TERMINAL_COLLISION' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('operation',to_jsonb(v_op),'report',to_jsonb(v_report),'idempotent',true);
  END IF;
  IF v_op.estado<>'SOLICITADO' THEN RAISE EXCEPTION 'SIRE_ACCEPT_OPERATION_CLOSED' USING ERRCODE='55000'; END IF;
  BEGIN
    v_snapshot:=app.build_sire_snapshot_463(p_tenant_id,v_report.tipo,v_report.periodo,v_report.metadata);
    v_source_changed:=v_snapshot->>'source_fingerprint' IS DISTINCT FROM v_report.source_fingerprint;
  EXCEPTION WHEN OTHERS THEN
    v_source_changed:=true;
  END;
  UPDATE public.sire_operaciones SET ticket=v_ticket,estado='PROCESANDO',http_status=p_http_status,response_summary=COALESCE(p_response_summary,'{}'::jsonb),terminal_fingerprint=v_terminal_fp,ultima_consulta_at=now(),updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  UPDATE public.sire_files SET estado='PENDIENTE',status='PENDING',sunat_ticket=v_ticket,sunat_estado='SOLICITADO',sunat_codigo_estado='01',sunat_operacion_id=v_op.id,sunat_ultima_consulta=now(),error_message=NULL,correction_required=v_source_changed,correction_reason=CASE WHEN v_source_changed THEN 'La fuente local cambió durante la aceptación; el ticket SUNAT se preservó y requiere conciliación' ELSE correction_reason END,updated_by=v_op.solicitado_por,updated_at=now() WHERE id=v_report.id RETURNING * INTO v_report;
  PERFORM app.audit_fiscal_463(p_tenant_id,v_op.solicitado_por,'sire_files','UPDATE',v_report.id,NULL,to_jsonb(v_report),'ACEPTAR_PROPUESTA_SIRE',jsonb_build_object('operation_id',v_op.id,'ticket',v_ticket));
  RETURN jsonb_build_object('operation',to_jsonb(v_op),'report',to_jsonb(v_report),'idempotent',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reservar_consulta_sire_tx(
  p_tenant_id uuid,p_actor_id uuid,p_reporte_id uuid,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE v_report public.sire_files;v_op public.sire_operaciones;v_key text:=NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');v_fp text;v_claim uuid:=gen_random_uuid();
BEGIN
  PERFORM app.assert_fiscal_actor_463(p_tenant_id,p_actor_id);
  IF v_key IS NULL THEN RAISE EXCEPTION 'SIRE_QUERY_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':sire:query:'||p_reporte_id::text,0));
  SELECT * INTO v_report FROM public.sire_files WHERE id=p_reporte_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIRE_REPORT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF lower(v_report.estado::text)='enviado' THEN RETURN jsonb_build_object('claimed',false,'idempotent',true,'report',to_jsonb(v_report),'reason','ALREADY_ACCEPTED'); END IF;
  IF lower(v_report.estado::text)<>'pendiente' OR NULLIF(btrim(COALESCE(v_report.sunat_ticket,'')),'') IS NULL THEN RAISE EXCEPTION 'SIRE_TICKET_NOT_QUERYABLE' USING ERRCODE='55000'; END IF;
  v_fp:=app.fiscal_fingerprint_463(jsonb_build_object('reporte_id',p_reporte_id,'ticket',v_report.sunat_ticket));
  SELECT * INTO v_op FROM public.sire_operaciones WHERE tenant_id=p_tenant_id AND idempotency_key=v_key ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_op.request_fingerprint IS DISTINCT FROM v_fp THEN RAISE EXCEPTION 'SIRE_QUERY_IDEMPOTENCY_COLLISION' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('claimed',false,'idempotent',true,'operation',to_jsonb(v_op),'report',to_jsonb(v_report));
  END IF;
  IF EXISTS(SELECT 1 FROM public.sire_operaciones o WHERE o.tenant_id=p_tenant_id AND o.reporte_id=p_reporte_id AND o.accion='CONSULTAR_TICKET' AND o.estado IN('SOLICITADO','PROCESANDO') AND o.created_at>now()-interval '2 minutes') THEN
    SELECT * INTO v_op FROM public.sire_operaciones o WHERE o.tenant_id=p_tenant_id AND o.reporte_id=p_reporte_id AND o.accion='CONSULTAR_TICKET' AND o.estado IN('SOLICITADO','PROCESANDO') ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('claimed',false,'idempotent',false,'operation',to_jsonb(v_op),'report',to_jsonb(v_report),'reason','IN_FLIGHT');
  END IF;
  INSERT INTO public.sire_operaciones(tenant_id,reporte_id,accion,tipo_libro,periodo,idempotency_key,request_fingerprint,claim_token,ticket,estado,solicitado_por,request_summary)
  VALUES(p_tenant_id,p_reporte_id,'CONSULTAR_TICKET',v_report.tipo,replace(v_report.periodo,'-',''),v_key,v_fp,v_claim,v_report.sunat_ticket,'SOLICITADO',p_actor_id,jsonb_build_object('ticket',v_report.sunat_ticket,'periodo',replace(v_report.periodo,'-',''))) RETURNING * INTO v_op;
  RETURN jsonb_build_object('claimed',true,'idempotent',false,'operation',to_jsonb(v_op),'report',to_jsonb(v_report));
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_consulta_sire_tx(
  p_tenant_id uuid,p_operation_id uuid,p_claim_token uuid,p_codigo_estado text,p_descripcion text,p_http_status integer,p_response_summary jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE v_op public.sire_operaciones;v_report public.sire_files;v_code text:=NULLIF(btrim(COALESCE(p_codigo_estado,'')),'');v_done boolean;v_error boolean;v_state text;v_status text;v_terminal_fp text;
BEGIN
  PERFORM set_config('app.sire_lifecycle_writer_463','on',true);
  SELECT * INTO v_op FROM public.sire_operaciones WHERE id=p_operation_id AND tenant_id=p_tenant_id AND accion='CONSULTAR_TICKET' FOR UPDATE;
  IF NOT FOUND OR v_op.claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'SIRE_QUERY_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_report FROM public.sire_files WHERE id=v_op.reporte_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF v_code IS NULL OR v_code NOT IN ('01','02','03','04','05','06','07')
     OR NULLIF(btrim(COALESCE(p_descripcion,'')),'') IS NULL THEN
    RAISE EXCEPTION 'SIRE_TICKET_STATUS_INVALID' USING ERRCODE='23514';
  END IF;
  v_terminal_fp:=app.fiscal_fingerprint_463(jsonb_build_object('codigo_estado',v_code,'descripcion',p_descripcion,'http_status',p_http_status,'response_summary',COALESCE(p_response_summary,'{}'::jsonb)));
  IF v_op.estado IN('TERMINADO','ERROR') THEN
    IF v_op.terminal_fingerprint IS DISTINCT FROM v_terminal_fp THEN RAISE EXCEPTION 'SIRE_QUERY_TERMINAL_COLLISION' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('operation',to_jsonb(v_op),'report',to_jsonb(v_report),'idempotent',true);
  END IF;
  v_done:=v_code='06';v_error:=v_code='03';v_state:=CASE WHEN v_done THEN 'ENVIADO' WHEN v_error THEN 'ERROR' ELSE 'PENDIENTE' END;v_status:=CASE WHEN v_done THEN 'SENT' WHEN v_error THEN 'ERROR' ELSE 'PENDING' END;
  UPDATE public.sire_operaciones SET estado=CASE WHEN v_error THEN 'ERROR' ELSE 'TERMINADO' END,codigo_estado_sunat=v_code,descripcion_estado_sunat=left(p_descripcion,1000),http_status=p_http_status,response_summary=COALESCE(p_response_summary,'{}'::jsonb),terminal_fingerprint=v_terminal_fp,ultima_consulta_at=now(),completado_at=now(),updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  UPDATE public.sire_files SET estado=v_state,status=v_status,sunat_estado=left(COALESCE(p_descripcion,'Estado no informado'),1000),sunat_codigo_estado=v_code,sunat_ultima_consulta=now(),sunat_aceptado_at=CASE WHEN v_done THEN now() ELSE NULL END,error_message=CASE WHEN v_error THEN left(COALESCE(p_descripcion,'Error SIRE'),1000) ELSE NULL END,updated_by=v_op.solicitado_por,updated_at=now() WHERE id=v_report.id RETURNING * INTO v_report;
  PERFORM app.audit_fiscal_463(p_tenant_id,v_op.solicitado_por,'sire_files','UPDATE',v_report.id,NULL,to_jsonb(v_report),'CONSULTAR_TICKET_SIRE',jsonb_build_object('operation_id',v_op.id,'codigo_estado',v_code));
  RETURN jsonb_build_object('operation',to_jsonb(v_op),'report',to_jsonb(v_report),'idempotent',false,'terminado',v_done,'con_errores',v_error);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fallar_operacion_sire_tx(
  p_tenant_id uuid,p_operation_id uuid,p_claim_token uuid,p_error_code text,p_error_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE v_op public.sire_operaciones;v_report public.sire_files;
BEGIN
  PERFORM set_config('app.sire_lifecycle_writer_463','on',true);
  SELECT * INTO v_op FROM public.sire_operaciones WHERE id=p_operation_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_op.claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'SIRE_OPERATION_CLAIM_INVALID' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_report FROM public.sire_files WHERE id=v_op.reporte_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF v_op.estado IN('TERMINADO','ERROR') THEN RETURN jsonb_build_object('operation',to_jsonb(v_op),'report',to_jsonb(v_report),'idempotent',true); END IF;
  UPDATE public.sire_operaciones SET estado='ERROR',error_code=left(COALESCE(p_error_code,'SIRE_ERROR'),100),error_message=left(COALESCE(p_error_message,'Error SIRE'),1000),completado_at=now(),updated_at=now() WHERE id=v_op.id RETURNING * INTO v_op;
  IF v_op.accion='ACEPTAR_PROPUESTA' AND v_op.ticket IS NULL THEN UPDATE public.sire_files SET estado='GENERADO',status='COMPLETED',error_message=left(COALESCE(p_error_message,'Error SIRE'),1000),updated_at=now() WHERE id=v_report.id RETURNING * INTO v_report;
  ELSIF v_op.accion='CONSULTAR_TICKET' THEN UPDATE public.sire_files SET estado='PENDIENTE',status='PENDING',error_message=left(COALESCE(p_error_message,'Error consultando ticket'),1000),updated_at=now() WHERE id=v_report.id RETURNING * INTO v_report;
  END IF;
  RETURN jsonb_build_object('operation',to_jsonb(v_op),'report',to_jsonb(v_report),'idempotent',false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.guard_gre_lifecycle_463()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF current_setting('app.gre_lifecycle_writer_463',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'GRE_LIFECYCLE_RPC_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_gre_lifecycle_463 ON public.gre_guias;
CREATE TRIGGER trg_guard_gre_lifecycle_463
BEFORE UPDATE OF estado,sunat_status,xml_ubl,xml_firmado,hash_gre,cdr_sunat,
  sunat_ticket,numero_sunat,retry_count,next_retry_at,signed_at,last_sent_at,
  last_consulted_at,anulado_at,anulado_por,motivo_anulacion
ON public.gre_guias
FOR EACH ROW EXECUTE FUNCTION app.guard_gre_lifecycle_463();

CREATE OR REPLACE FUNCTION app.guard_sire_lifecycle_463()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF current_setting('app.sire_lifecycle_writer_463',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'SIRE_LIFECYCLE_RPC_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_sire_lifecycle_463 ON public.sire_files;
CREATE TRIGGER trg_guard_sire_lifecycle_463
BEFORE UPDATE OF estado,status,contenido_local,contenido_sha256,source_cutoff_at,
  source_manifest,source_fingerprint,source_totals,sunat_ticket,sunat_estado,
  sunat_codigo_estado,sunat_operacion_id,sunat_ultima_consulta,sunat_aceptado_at,
  correction_required,correction_reason,error_message
ON public.sire_files
FOR EACH ROW EXECUTE FUNCTION app.guard_sire_lifecycle_463();

REVOKE ALL ON TABLE public.gre_operaciones, public.sire_incidencias
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.gre_operaciones, public.sire_incidencias TO service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.gre_guias, public.gre_detalles, public.pedido_gres,
  public.sire_files, public.sire_registros_detalle, public.sire_operaciones
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.gre_guias, public.gre_detalles, public.pedido_gres,
  public.sire_files, public.sire_registros_detalle, public.sire_operaciones TO service_role;

REVOKE ALL ON FUNCTION app.assert_fiscal_actor_463(uuid,uuid,boolean), app.fiscal_fingerprint_463(jsonb),
  app.audit_fiscal_463(uuid,uuid,text,text,uuid,jsonb,jsonb,text,jsonb),
  app.build_sire_snapshot_463(uuid,text,text,jsonb),
  app.guard_gre_lifecycle_463(), app.guard_sire_lifecycle_463()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.crear_gre_tx(uuid,uuid,jsonb,jsonb,text),
  public.guardar_firma_gre_tx(uuid,uuid,uuid,text,text,text,text),
  public.registrar_fallo_firma_gre_tx(uuid,uuid,uuid,text,text,text),
  public.reservar_envio_gre_tx(uuid,uuid,uuid,text,text),
  public.finalizar_envio_gre_tx(uuid,uuid,uuid,boolean,boolean,text,text,text,text,text,text,jsonb),
  public.reservar_consulta_gre_tx(uuid,uuid,uuid,text,text),
  public.finalizar_consulta_gre_tx(uuid,uuid,uuid,boolean,boolean,boolean,text,text,text,jsonb),
  public.anular_gre_tx(uuid,uuid,uuid,text,text),
  public.actualizar_config_gre_tx(uuid,uuid,jsonb,text),
  public.generar_reporte_sire_tx(uuid,uuid,text,text,jsonb,text),
  public.registrar_comprobante_sire_tx(uuid,uuid,uuid),
  public.finalizar_generacion_sire_evento_tx(uuid,uuid),
  public.reservar_aceptacion_sire_tx(uuid,uuid,uuid,text),
  public.finalizar_aceptacion_sire_tx(uuid,uuid,uuid,text,integer,jsonb),
  public.reservar_consulta_sire_tx(uuid,uuid,uuid,text),
  public.finalizar_consulta_sire_tx(uuid,uuid,uuid,text,text,integer,jsonb),
  public.fallar_operacion_sire_tx(uuid,uuid,uuid,text,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_gre_tx(uuid,uuid,jsonb,jsonb,text),
  public.guardar_firma_gre_tx(uuid,uuid,uuid,text,text,text,text),
  public.registrar_fallo_firma_gre_tx(uuid,uuid,uuid,text,text,text),
  public.reservar_envio_gre_tx(uuid,uuid,uuid,text,text),
  public.finalizar_envio_gre_tx(uuid,uuid,uuid,boolean,boolean,text,text,text,text,text,text,jsonb),
  public.reservar_consulta_gre_tx(uuid,uuid,uuid,text,text),
  public.finalizar_consulta_gre_tx(uuid,uuid,uuid,boolean,boolean,boolean,text,text,text,jsonb),
  public.anular_gre_tx(uuid,uuid,uuid,text,text),
  public.actualizar_config_gre_tx(uuid,uuid,jsonb,text),
  public.generar_reporte_sire_tx(uuid,uuid,text,text,jsonb,text),
  public.registrar_comprobante_sire_tx(uuid,uuid,uuid),
  public.finalizar_generacion_sire_evento_tx(uuid,uuid),
  public.reservar_aceptacion_sire_tx(uuid,uuid,uuid,text),
  public.finalizar_aceptacion_sire_tx(uuid,uuid,uuid,text,integer,jsonb),
  public.reservar_consulta_sire_tx(uuid,uuid,uuid,text),
  public.finalizar_consulta_sire_tx(uuid,uuid,uuid,text,text,integer,jsonb),
  public.fallar_operacion_sire_tx(uuid,uuid,uuid,text,text)
TO service_role;

COMMENT ON TABLE public.gre_operaciones IS
  'Bitácora idempotente de firma, envío, consulta y anulación GRE; no contiene credenciales.';
COMMENT ON COLUMN public.sire_files.contenido_local IS
  'Instantánea de comparación local RVIE/RCE. No es el libro final SUNAT ni reemplaza SOL.';

NOTIFY pgrst, 'reload schema';

COMMIT;
