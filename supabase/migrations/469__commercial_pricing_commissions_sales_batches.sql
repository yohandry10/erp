-- ============================================================================
-- 469__commercial_pricing_commissions_sales_batches.sql
-- Precios comerciales por vendedor/cliente/producto o marca, snapshots
-- económicos en cotización/pedido/POS, ledger de comisiones reversible y
-- lotes inmutables de ventas. No genera asientos ni publica eventos contables.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, pg_temp;

DO $preflight$
BEGIN
  IF to_regclass('public.productos') IS NULL
     OR to_regclass('public.clientes') IS NULL
     OR to_regclass('public.cotizaciones') IS NULL
     OR to_regclass('public.cotizacion_detalles') IS NULL
     OR to_regclass('public.pedidos_venta') IS NULL
     OR to_regclass('public.pedidos_venta_detalle') IS NULL
     OR to_regclass('public.ventas_pos') IS NULL
     OR to_regclass('public.detalle_ventas_pos') IS NULL
     OR to_regclass('public.documentos') IS NULL
     OR to_regclass('public.documento_detalles') IS NULL
     OR to_regclass('public.permisos') IS NULL
     OR to_regclass('public.roles') IS NULL
     OR to_regclass('public.rol_permisos') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_attribute
       WHERE attrelid='public.productos'::regclass AND attname='marca' AND NOT attisdropped
     ) THEN
    RAISE EXCEPTION '469 requiere ventas, documentos, productos, clientes y RBAC operativos';
  END IF;
  IF to_regprocedure('public.crear_cotizacion_tx(uuid,uuid,uuid,date,text,text,text,numeric,numeric,numeric,jsonb)') IS NULL
     OR to_regprocedure('public.actualizar_cotizacion_tx(uuid,uuid,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.convertir_cotizacion_a_pedido(uuid,uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.crear_pedido_completo(jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.actualizar_pedido_venta_tx(uuid,uuid,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.crear_producto_maestro_tx(uuid,uuid,text,jsonb)') IS NULL
     OR to_regprocedure('public.actualizar_producto_maestro_tx(uuid,uuid,uuid,text,jsonb)') IS NULL
     OR to_regprocedure('public.pos_registrar_venta_atomic_tx(uuid,uuid,uuid,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION '469 requiere los writers canónicos 439, 441, 451 y 460';
  END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.listas_precios_venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  codigo text NOT NULL,
  nombre text NOT NULL,
  moneda text NOT NULL,
  prioridad integer NOT NULL DEFAULT 0,
  vendedor_id uuid,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  vigencia_desde date NOT NULL,
  vigencia_hasta date,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_lista_precios_codigo_469 CHECK (codigo = upper(btrim(codigo)) AND length(codigo) BETWEEN 2 AND 40),
  CONSTRAINT ck_lista_precios_nombre_469 CHECK (length(btrim(nombre)) BETWEEN 2 AND 160),
  CONSTRAINT ck_lista_precios_moneda_469 CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_lista_precios_prioridad_469 CHECK (prioridad BETWEEN -100000 AND 100000),
  CONSTRAINT ck_lista_precios_vigencia_469 CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde),
  CONSTRAINT ux_lista_precios_codigo_469 UNIQUE (tenant_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.lista_precios_venta_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  lista_id uuid NOT NULL REFERENCES public.listas_precios_venta(id) ON DELETE RESTRICT,
  producto_id uuid REFERENCES public.productos(id) ON DELETE RESTRICT,
  marca text,
  cantidad_minima numeric(14,4) NOT NULL DEFAULT 0,
  precio_unitario numeric(14,6) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_lista_precio_alcance_469 CHECK (
    (producto_id IS NOT NULL AND marca IS NULL)
    OR (producto_id IS NULL AND length(btrim(coalesce(marca, ''))) BETWEEN 1 AND 120)
  ),
  CONSTRAINT ck_lista_precio_cantidad_469 CHECK (cantidad_minima >= 0),
  CONSTRAINT ck_lista_precio_importe_469 CHECK (precio_unitario >= 0),
  CONSTRAINT ux_lista_precio_detalle_469 UNIQUE NULLS NOT DISTINCT
    (tenant_id, lista_id, producto_id, marca, cantidad_minima)
);

CREATE TABLE IF NOT EXISTS public.reglas_comisiones_venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  codigo text NOT NULL,
  nombre text NOT NULL,
  vendedor_id uuid,
  producto_id uuid REFERENCES public.productos(id) ON DELETE RESTRICT,
  marca text,
  porcentaje numeric(9,6) NOT NULL,
  prioridad integer NOT NULL DEFAULT 0,
  vigencia_desde date NOT NULL,
  vigencia_hasta date,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_reglas_comisiones_codigo_469 UNIQUE (tenant_id, codigo),
  CONSTRAINT ck_reglas_comisiones_codigo_469 CHECK (codigo = upper(btrim(codigo)) AND length(codigo) BETWEEN 2 AND 40),
  CONSTRAINT ck_reglas_comisiones_nombre_469 CHECK (length(btrim(nombre)) BETWEEN 2 AND 160),
  CONSTRAINT ck_reglas_comisiones_porcentaje_469 CHECK (porcentaje >= 0 AND porcentaje <= 100),
  CONSTRAINT ck_reglas_comisiones_vigencia_469 CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde),
  CONSTRAINT ck_reglas_comisiones_marca_469 CHECK (marca IS NULL OR length(btrim(marca)) BETWEEN 1 AND 120)
);

CREATE TABLE IF NOT EXISTS public.comisiones_venta_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  source_line_id uuid NOT NULL,
  vendedor_id uuid NOT NULL,
  producto_id uuid REFERENCES public.productos(id) ON DELETE RESTRICT,
  marca text,
  moneda text NOT NULL,
  base_comisionable numeric(14,2) NOT NULL,
  porcentaje numeric(9,6) NOT NULL,
  monto numeric(14,2) NOT NULL,
  regla_id uuid REFERENCES public.reglas_comisiones_venta(id) ON DELETE RESTRICT,
  reversa_de_id uuid REFERENCES public.comisiones_venta_movimientos(id) ON DELETE RESTRICT,
  trigger_type text,
  trigger_id uuid,
  idempotency_key text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_comision_movimiento_key_469 UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ck_comision_movimiento_tipo_469 CHECK (tipo IN ('DEVENGO','REVERSA','REINTEGRO')),
  CONSTRAINT ck_comision_movimiento_source_469 CHECK (source_type IN ('POS','DOCUMENTO')),
  CONSTRAINT ck_comision_movimiento_moneda_469 CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_comision_movimiento_base_469 CHECK (base_comisionable >= 0),
  CONSTRAINT ck_comision_movimiento_porcentaje_469 CHECK (porcentaje >= 0 AND porcentaje <= 100),
  CONSTRAINT ck_comision_movimiento_signo_469 CHECK (
    (tipo = 'DEVENGO' AND monto >= 0 AND reversa_de_id IS NULL)
    OR (tipo = 'REVERSA' AND monto <= 0 AND reversa_de_id IS NOT NULL)
    OR (tipo = 'REINTEGRO' AND monto >= 0 AND reversa_de_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.ventas_consolidados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  numero text NOT NULL,
  fecha date NOT NULL,
  moneda text NOT NULL,
  cantidad_fuentes integer NOT NULL,
  subtotal numeric(14,2) NOT NULL,
  impuestos numeric(14,2) NOT NULL,
  total numeric(14,2) NOT NULL,
  notas text,
  source_fingerprint text NOT NULL,
  idempotency_key text NOT NULL,
  created_by uuid NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_ventas_consolidados_numero_469 UNIQUE (tenant_id, numero),
  CONSTRAINT ux_ventas_consolidados_key_469 UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ux_ventas_consolidados_fingerprint_469 UNIQUE (tenant_id, source_fingerprint),
  CONSTRAINT ck_ventas_consolidados_moneda_469 CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_ventas_consolidados_count_469 CHECK (cantidad_fuentes BETWEEN 1 AND 100),
  CONSTRAINT ck_ventas_consolidados_totales_469 CHECK (
    subtotal >= 0 AND impuestos >= 0 AND total >= 0
    AND abs(total - round(subtotal + impuestos, 2)) <= 0.01
  )
);

CREATE TABLE IF NOT EXISTS public.ventas_consolidado_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  consolidado_id uuid NOT NULL REFERENCES public.ventas_consolidados(id) ON DELETE RESTRICT,
  orden integer NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  fecha timestamptz NOT NULL,
  documento_numero text NOT NULL,
  cliente_id uuid,
  cliente_nombre text,
  vendedor_id uuid,
  moneda text NOT NULL,
  subtotal numeric(14,2) NOT NULL,
  impuestos numeric(14,2) NOT NULL,
  total numeric(14,2) NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_ventas_consolidado_orden_469 UNIQUE (consolidado_id, orden),
  CONSTRAINT ux_venta_consolidada_una_vez_469 UNIQUE (tenant_id, source_type, source_id),
  CONSTRAINT ck_ventas_consolidado_detalle_source_469 CHECK (source_type IN ('POS','DOCUMENTO')),
  CONSTRAINT ck_ventas_consolidado_detalle_moneda_469 CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_ventas_consolidado_detalle_total_469 CHECK (
    orden > 0 AND subtotal >= 0 AND impuestos >= 0 AND total >= 0
    AND abs(total - round(subtotal + impuestos, 2)) <= 0.01
  )
);

CREATE TABLE IF NOT EXISTS public.operaciones_comerciales_469 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  operacion text NOT NULL,
  fingerprint text NOT NULL,
  result_id uuid,
  resultado jsonb NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_operaciones_comerciales_key_469 UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ck_operaciones_comerciales_key_469 CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 255)
);

ALTER TABLE public.cotizacion_detalles
  ADD COLUMN IF NOT EXISTS lista_precio_id uuid REFERENCES public.listas_precios_venta(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS precio_regla_snapshot jsonb;
ALTER TABLE public.pedidos_venta_detalle
  ADD COLUMN IF NOT EXISTS lista_precio_id uuid REFERENCES public.listas_precios_venta(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS precio_regla_snapshot jsonb;
ALTER TABLE public.detalle_ventas_pos
  ADD COLUMN IF NOT EXISTS lista_precio_id uuid REFERENCES public.listas_precios_venta(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS precio_regla_snapshot jsonb;
ALTER TABLE public.documento_detalles
  ADD COLUMN IF NOT EXISTS comision_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_lista_precios_resolver_469
  ON public.listas_precios_venta (tenant_id, activo, vigencia_desde, vigencia_hasta, prioridad DESC);
CREATE INDEX IF NOT EXISTS idx_lista_precios_vendedor_cliente_469
  ON public.listas_precios_venta (tenant_id, vendedor_id, cliente_id) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_lista_precios_detalle_producto_469
  ON public.lista_precios_venta_detalles (tenant_id, producto_id, cantidad_minima DESC);
CREATE INDEX IF NOT EXISTS idx_lista_precios_detalle_marca_469
  ON public.lista_precios_venta_detalles (tenant_id, upper(marca), cantidad_minima DESC) WHERE marca IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reglas_comision_resolver_469
  ON public.reglas_comisiones_venta (tenant_id, activo, vendedor_id, producto_id, upper(marca), prioridad DESC);
CREATE INDEX IF NOT EXISTS idx_comisiones_source_469
  ON public.comisiones_venta_movimientos (tenant_id, source_type, source_id, source_line_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_vendedor_fecha_469
  ON public.comisiones_venta_movimientos (tenant_id, vendedor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consolidados_fecha_469
  ON public.ventas_consolidados (tenant_id, fecha DESC, numero DESC);

-- Tablas de configuración/ledger: lectura tenant-scoped; todas las escrituras
-- atraviesan RPC service_role. Los dos libros históricos son append-only.
DO $rls$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'listas_precios_venta','lista_precios_venta_detalles',
    'reglas_comisiones_venta','comisiones_venta_movimientos',
    'ventas_consolidados','ventas_consolidado_detalles','operaciones_comerciales_469'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_select_469', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (tenant_id = app.current_tenant_id())',
      v_table || '_select_469', v_table
    );
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      v_table
    );
    IF v_table <> 'operaciones_comerciales_469' THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', v_table);
    END IF;
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', v_table);
  END LOOP;
END;
$rls$;

CREATE OR REPLACE FUNCTION app.prevent_immutable_commercial_change_469()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'COMMERCIAL_LEDGER_IMMUTABLE: %', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_comisiones_immutable_469 ON public.comisiones_venta_movimientos;
CREATE TRIGGER trg_comisiones_immutable_469
BEFORE UPDATE OR DELETE ON public.comisiones_venta_movimientos
FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_commercial_change_469();
DROP TRIGGER IF EXISTS trg_ventas_consolidados_immutable_469 ON public.ventas_consolidados;
CREATE TRIGGER trg_ventas_consolidados_immutable_469
BEFORE UPDATE OR DELETE ON public.ventas_consolidados
FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_commercial_change_469();
DROP TRIGGER IF EXISTS trg_ventas_consolidado_detalles_immutable_469 ON public.ventas_consolidado_detalles;
CREATE TRIGGER trg_ventas_consolidado_detalles_immutable_469
BEFORE UPDATE OR DELETE ON public.ventas_consolidado_detalles
FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_commercial_change_469();

CREATE OR REPLACE FUNCTION app.commercial_fingerprint_469(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION app.actor_comercial_valido_469(p_tenant_id uuid, p_actor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT p_tenant_id IS NOT NULL AND p_actor_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.usuarios_sistema u
      WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id
        AND coalesce(u.activo, true) AND upper(coalesce(u.estado::text, 'ACTIVO')) = 'ACTIVO'
    )
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id AND coalesce(u.activo, true)
    )
  );
$$;

CREATE OR REPLACE FUNCTION app.resolver_precio_venta_469(
  p_tenant_id uuid,
  p_vendedor_id uuid,
  p_cliente_id uuid,
  p_producto_id uuid,
  p_cantidad numeric,
  p_fecha date,
  p_precio_solicitado numeric DEFAULT NULL,
  p_moneda text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_producto public.productos;
  v_match record;
  v_fecha date := coalesce(p_fecha, app.hoy_tenant(p_tenant_id));
  v_cantidad numeric := greatest(coalesce(p_cantidad, 0), 0);
  v_precio numeric(14,6);
BEGIN
  SELECT p.* INTO v_producto
  FROM public.productos p
  WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id
    AND coalesce(p.activo, true)
    AND upper(coalesce(p.estado::text, 'ACTIVO')) = 'ACTIVO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMERCIAL_PRODUCT_NOT_ACTIVE_IN_TENANT: %', p_producto_id USING ERRCODE = 'P0002';
  END IF;

  SELECT lp.id AS lista_id, lp.codigo AS lista_codigo, lp.nombre AS lista_nombre,
         lp.moneda, lp.prioridad, lp.vendedor_id, lp.cliente_id,
         lpd.id AS detalle_id, lpd.producto_id, lpd.marca,
         lpd.cantidad_minima, lpd.precio_unitario
  INTO v_match
  FROM public.listas_precios_venta lp
  JOIN public.lista_precios_venta_detalles lpd
    ON lpd.lista_id = lp.id AND lpd.tenant_id = lp.tenant_id
  WHERE lp.tenant_id = p_tenant_id AND lp.activo
    AND (p_moneda IS NULL OR lp.moneda = upper(btrim(p_moneda)))
    AND lp.vigencia_desde <= v_fecha
    AND (lp.vigencia_hasta IS NULL OR lp.vigencia_hasta >= v_fecha)
    AND (lp.vendedor_id IS NULL OR lp.vendedor_id = p_vendedor_id)
    AND (lp.cliente_id IS NULL OR lp.cliente_id = p_cliente_id)
    AND lpd.cantidad_minima <= v_cantidad
    AND (
      lpd.producto_id = p_producto_id
      OR (lpd.producto_id IS NULL AND upper(btrim(coalesce(lpd.marca, '')))
          = upper(btrim(coalesce(v_producto.marca, '')))
          AND btrim(coalesce(v_producto.marca, '')) <> '')
    )
  ORDER BY
    (lpd.producto_id IS NOT NULL) DESC,
    ((lp.vendedor_id IS NOT NULL)::integer + (lp.cliente_id IS NOT NULL)::integer) DESC,
    lp.prioridad DESC,
    lpd.cantidad_minima DESC,
    lp.vigencia_desde DESC,
    lp.id, lpd.id
  LIMIT 1;

  IF FOUND THEN
    v_precio := round(v_match.precio_unitario, 6);
    RETURN jsonb_build_object(
      'regla_aplicada', true,
      'fuente', 'LISTA_PRECIOS',
      'lista_id', v_match.lista_id,
      'lista_codigo', v_match.lista_codigo,
      'lista_nombre', v_match.lista_nombre,
      'detalle_id', v_match.detalle_id,
      'alcance', CASE WHEN v_match.producto_id IS NOT NULL THEN 'PRODUCTO' ELSE 'MARCA' END,
      'marca', v_match.marca,
      'vendedor_id', v_match.vendedor_id,
      'cliente_id', v_match.cliente_id,
      'cantidad_minima', v_match.cantidad_minima,
      'prioridad', v_match.prioridad,
      'moneda', v_match.moneda,
      'fecha_efectiva', v_fecha,
      'producto_id', p_producto_id,
      'producto_marca', v_producto.marca,
      'precio_unitario', v_precio,
      'precio_solicitado', p_precio_solicitado,
      'snapshot_version', 469
    );
  END IF;

  v_precio := round(greatest(coalesce(
    p_precio_solicitado,
    nullif(v_producto.precio_unitario, 0),
    nullif(v_producto.precio_venta, 0),
    0
  ), 0), 6);
  RETURN jsonb_build_object(
    'regla_aplicada', false,
    'fuente', CASE WHEN p_precio_solicitado IS NULL THEN 'CATALOGO' ELSE 'PRECIO_SOLICITADO' END,
    'lista_id', NULL,
    'fecha_efectiva', v_fecha,
    'producto_id', p_producto_id,
    'marca', v_producto.marca,
    'producto_marca', v_producto.marca,
    'moneda', NULL,
    'precio_unitario', v_precio,
    'precio_solicitado', p_precio_solicitado,
    'snapshot_version', 469
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.resolver_detalle_precios_venta_469(
  p_tenant_id uuid,
  p_vendedor_id uuid,
  p_cliente_id uuid,
  p_detalle jsonb,
  p_fecha date DEFAULT NULL,
  p_moneda text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_row record;
  v_snapshot jsonb;
  v_result jsonb := '[]'::jsonb;
  v_producto_id uuid;
  v_cantidad numeric;
  v_precio numeric;
BEGIN
  IF jsonb_typeof(p_detalle) <> 'array' OR jsonb_array_length(p_detalle) NOT BETWEEN 1 AND 999 THEN
    RAISE EXCEPTION 'COMMERCIAL_PRICE_DETAIL_MUST_BE_ARRAY_1_999' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_detalle) item
    GROUP BY nullif(item->>'producto_id', '')::uuid
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PRICE_DUPLICATE_PRODUCT_LINE' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN
    SELECT value AS item, ordinality::integer AS orden
    FROM jsonb_array_elements(p_detalle) WITH ORDINALITY
  LOOP
    v_producto_id := nullif(v_row.item->>'producto_id', '')::uuid;
    v_cantidad := coalesce((v_row.item->>'cantidad')::numeric, 0);
    v_precio := coalesce((v_row.item->>'precio_unitario')::numeric,
                         (v_row.item->>'precio_original')::numeric);
    IF v_producto_id IS NULL OR v_cantidad <= 0 OR v_precio < 0 THEN
      RAISE EXCEPTION 'COMMERCIAL_PRICE_DETAIL_INVALID_AT: %', v_row.orden USING ERRCODE = '22023';
    END IF;
    v_snapshot := app.resolver_precio_venta_469(
      p_tenant_id, p_vendedor_id, p_cliente_id, v_producto_id,
      v_cantidad, p_fecha, v_precio, p_moneda
    );
    v_result := v_result || jsonb_build_array(
      (v_row.item - 'precio_regla_snapshot' - 'precio_snapshot') || jsonb_build_object(
        'orden', coalesce((v_row.item->>'orden')::integer, v_row.orden),
        'precio_unitario', (v_snapshot->>'precio_unitario')::numeric,
        'precio_regla_snapshot', v_snapshot
      )
    );
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION app.totales_detalle_comercial_469(p_tenant_id uuid, p_detalle jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  WITH lineas AS (
    SELECT e, nullif(e->>'producto_id','')::uuid AS producto_id,
      (e->>'cantidad')::numeric AS cantidad,
      (e->>'precio_unitario')::numeric AS precio
    FROM jsonb_array_elements(p_detalle) e
  ), total AS (
    SELECT round(coalesce(sum(round(l.cantidad * l.precio, 2)), 0), 2) AS subtotal,
      round(coalesce(sum(CASE
        WHEN left(coalesce(nullif(btrim(p.afectacion_igv), ''), '10'), 1) = '1'
        THEN round(l.cantidad * l.precio, 2) ELSE 0 END), 0)
        * app.tasa_impuesto_tenant(p_tenant_id), 2) AS igv
    FROM lineas l
    JOIN public.productos p ON p.id = l.producto_id AND p.tenant_id = p_tenant_id
  )
  SELECT jsonb_build_object('subtotal', subtotal, 'igv', igv,
    'total', round(subtotal + igv, 2)) FROM total;
$$;

-- Wrappers de los writers existentes. Resuelven y congelan el precio dentro de
-- la misma transacción; no crean una segunda cabecera ni un segundo detalle.
CREATE OR REPLACE FUNCTION public.crear_cotizacion_comercial_tx(
  p_tenant_id uuid,
  p_created_by uuid,
  p_cliente_id uuid,
  p_fecha_vencimiento date,
  p_observaciones text,
  p_vendedor text,
  p_moneda text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_detalle jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_detalle jsonb;
  v_totales jsonb;
  v_result jsonb;
  v_cotizacion_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':commercial-pricing:' || p_created_by::text, 469));
  v_detalle := app.resolver_detalle_precios_venta_469(
    p_tenant_id, p_created_by, p_cliente_id, p_detalle,
    app.hoy_tenant(p_tenant_id), upper(coalesce(nullif(btrim(p_moneda), ''), 'PEN')));
  v_totales := app.totales_detalle_comercial_469(p_tenant_id, v_detalle);
  v_result := public.crear_cotizacion_tx(
    p_tenant_id, p_created_by, p_cliente_id, p_fecha_vencimiento,
    p_observaciones, p_vendedor, p_moneda,
    (v_totales->>'subtotal')::numeric, (v_totales->>'igv')::numeric,
    (v_totales->>'total')::numeric, v_detalle
  );
  v_cotizacion_id := nullif(v_result #>> '{cotizacion,id}', '')::uuid;
  IF v_cotizacion_id IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_QUOTE_WRITER_DID_NOT_RETURN_ID' USING ERRCODE = '23514';
  END IF;

  UPDATE public.cotizacion_detalles cd
  SET lista_precio_id = nullif(x.item #>> '{precio_regla_snapshot,lista_id}', '')::uuid,
      precio_regla_snapshot = x.item->'precio_regla_snapshot',
      metadata = coalesce(cd.metadata, '{}'::jsonb) || jsonb_build_object(
        'commercial_price_snapshot', x.item->'precio_regla_snapshot',
        'commercial_schema_version', 469),
      updated_at = now()
  FROM (
    SELECT value AS item FROM jsonb_array_elements(v_detalle)
  ) x
  WHERE cd.cotizacion_id = v_cotizacion_id AND cd.tenant_id = p_tenant_id
    AND cd.orden = (x.item->>'orden')::integer;

  UPDATE public.cotizaciones
  SET items = v_detalle,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'commercial_pricing_applied', true, 'commercial_schema_version', 469),
      updated_at = now()
  WHERE id = v_cotizacion_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'cotizacion', (SELECT to_jsonb(c) FROM public.cotizaciones c
      WHERE c.id = v_cotizacion_id AND c.tenant_id = p_tenant_id),
    'detalle', (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.orden), '[]'::jsonb)
      FROM public.cotizacion_detalles d
      WHERE d.cotizacion_id = v_cotizacion_id AND d.tenant_id = p_tenant_id),
    'pricing_applied', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_cotizacion_comercial_tx(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_patch jsonb,
  p_detalle jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_cot public.cotizaciones;
  v_detalle jsonb;
  v_totales jsonb;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_result jsonb;
BEGIN
  SELECT * INTO v_cot FROM public.cotizaciones
  WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF p_detalle IS NOT NULL THEN
    v_detalle := app.resolver_detalle_precios_venta_469(
      p_tenant_id, v_cot.created_by,
      coalesce(nullif(v_patch->>'cliente_id','')::uuid, v_cot.cliente_id),
      p_detalle, app.hoy_tenant(p_tenant_id), v_cot.moneda);
    v_totales := app.totales_detalle_comercial_469(p_tenant_id, v_detalle);
    v_patch := v_patch || jsonb_build_object(
      'subtotal', (v_totales->>'subtotal')::numeric,
      'igv', (v_totales->>'igv')::numeric,
      'total', (v_totales->>'total')::numeric);
  ELSE
    v_detalle := NULL;
  END IF;
  v_result := public.actualizar_cotizacion_tx(
    p_cotizacion_id, p_tenant_id, v_patch, v_detalle);

  IF v_detalle IS NOT NULL THEN
    UPDATE public.cotizacion_detalles cd
    SET lista_precio_id = nullif(x.item #>> '{precio_regla_snapshot,lista_id}', '')::uuid,
        precio_regla_snapshot = x.item->'precio_regla_snapshot',
        metadata = coalesce(cd.metadata, '{}'::jsonb) || jsonb_build_object(
          'commercial_price_snapshot', x.item->'precio_regla_snapshot',
          'commercial_schema_version', 469), updated_at = now()
    FROM (SELECT value AS item FROM jsonb_array_elements(v_detalle)) x
    WHERE cd.cotizacion_id = p_cotizacion_id AND cd.tenant_id = p_tenant_id
      AND cd.orden = (x.item->>'orden')::integer;
    UPDATE public.cotizaciones SET items = v_detalle,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'commercial_pricing_applied', true, 'commercial_schema_version', 469),
      updated_at = now()
    WHERE id = p_cotizacion_id AND tenant_id = p_tenant_id;
  END IF;
  RETURN coalesce(v_result, '{}'::jsonb) || jsonb_build_object('pricing_applied', p_detalle IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_pedido_comercial_tx(
  p_pedido jsonb,
  p_detalle jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := nullif(p_pedido->>'tenant_id','')::uuid;
  v_actor_id uuid := nullif(p_pedido->>'created_by','')::uuid;
  v_cliente_id uuid := nullif(p_pedido->>'cliente_id','')::uuid;
  v_detalle jsonb;
  v_totales jsonb;
  v_pedido jsonb;
  v_result jsonb;
  v_pedido_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_tenant_id::text || ':commercial-pricing:' || v_actor_id::text, 469));
  v_detalle := app.resolver_detalle_precios_venta_469(
    v_tenant_id, v_actor_id, v_cliente_id, p_detalle,
    app.hoy_tenant(v_tenant_id), upper(coalesce(nullif(btrim(p_pedido->>'moneda'), ''), 'PEN')));
  v_totales := app.totales_detalle_comercial_469(v_tenant_id, v_detalle);
  v_pedido := p_pedido || jsonb_build_object(
    'subtotal', (v_totales->>'subtotal')::numeric,
    'igv', (v_totales->>'igv')::numeric,
    'total', (v_totales->>'total')::numeric);
  v_result := public.crear_pedido_completo(v_pedido, v_detalle);
  v_pedido_id := nullif(v_result->>'pedido_id','')::uuid;
  IF v_pedido_id IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_ORDER_WRITER_DID_NOT_RETURN_ID' USING ERRCODE = '23514';
  END IF;
  UPDATE public.pedidos_venta_detalle pd
  SET lista_precio_id = nullif(x.item #>> '{precio_regla_snapshot,lista_id}', '')::uuid,
      precio_regla_snapshot = x.item->'precio_regla_snapshot',
      metadata = coalesce(pd.metadata, '{}'::jsonb) || jsonb_build_object(
        'commercial_price_snapshot', x.item->'precio_regla_snapshot',
        'commercial_schema_version', 469), updated_at = now()
  FROM (SELECT value AS item FROM jsonb_array_elements(v_detalle)) x
  WHERE pd.pedido_id = v_pedido_id AND pd.tenant_id = v_tenant_id
    AND pd.producto_id = nullif(x.item->>'producto_id','')::uuid;
  UPDATE public.pedidos_venta SET metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('commercial_pricing_applied', true, 'commercial_schema_version', 469),
    updated_at = now()
  WHERE id = v_pedido_id AND tenant_id = v_tenant_id;
  RETURN v_result || jsonb_build_object('pricing_applied', true, 'resolved_detail', v_detalle);
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_pedido_comercial_tx(
  p_pedido_id uuid,
  p_tenant_id uuid,
  p_patch jsonb,
  p_detalle jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_venta;
  v_detalle jsonb;
  v_totales jsonb;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_result jsonb;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos_venta
  WHERE id = p_pedido_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF p_detalle IS NOT NULL THEN
    v_detalle := app.resolver_detalle_precios_venta_469(
      p_tenant_id, v_pedido.created_by,
      coalesce(nullif(v_patch->>'cliente_id','')::uuid, v_pedido.cliente_id),
      p_detalle, app.hoy_tenant(p_tenant_id), v_pedido.moneda);
    v_totales := app.totales_detalle_comercial_469(p_tenant_id, v_detalle);
    v_patch := v_patch || jsonb_build_object(
      'subtotal', (v_totales->>'subtotal')::numeric,
      'igv', (v_totales->>'igv')::numeric,
      'total', (v_totales->>'total')::numeric);
  ELSE
    v_detalle := NULL;
  END IF;
  v_result := public.actualizar_pedido_venta_tx(
    p_pedido_id, p_tenant_id, v_patch, v_detalle);
  IF v_detalle IS NOT NULL THEN
    UPDATE public.pedidos_venta_detalle pd
    SET lista_precio_id = nullif(x.item #>> '{precio_regla_snapshot,lista_id}', '')::uuid,
        precio_regla_snapshot = x.item->'precio_regla_snapshot',
        metadata = coalesce(pd.metadata, '{}'::jsonb) || jsonb_build_object(
          'commercial_price_snapshot', x.item->'precio_regla_snapshot',
          'commercial_schema_version', 469), updated_at = now()
    FROM (SELECT value AS item FROM jsonb_array_elements(v_detalle)) x
    WHERE pd.pedido_id = p_pedido_id AND pd.tenant_id = p_tenant_id
      AND pd.producto_id = nullif(x.item->>'producto_id','')::uuid;
    UPDATE public.pedidos_venta SET metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('commercial_pricing_applied', true, 'commercial_schema_version', 469),
      updated_at = now()
    WHERE id = p_pedido_id AND tenant_id = p_tenant_id;
  END IF;
  RETURN coalesce(v_result, '{}'::jsonb) || jsonb_build_object('pricing_applied', p_detalle IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.convertir_cotizacion_comercial_a_pedido_tx(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_pedido_id uuid;
BEGIN
  v_result := public.convertir_cotizacion_a_pedido(
    p_cotizacion_id, p_tenant_id, p_user_id, p_notas);
  v_pedido_id := nullif(v_result->>'pedido_id','')::uuid;
  UPDATE public.pedidos_venta_detalle pd
  SET lista_precio_id = cd.lista_precio_id,
      precio_regla_snapshot = cd.precio_regla_snapshot,
      metadata = coalesce(pd.metadata, '{}'::jsonb) || jsonb_build_object(
        'commercial_price_snapshot', cd.precio_regla_snapshot,
        'commercial_price_inherited_from_quote', p_cotizacion_id,
        'commercial_schema_version', 469), updated_at = now()
  FROM public.cotizacion_detalles cd
  WHERE pd.pedido_id = v_pedido_id AND pd.tenant_id = p_tenant_id
    AND cd.cotizacion_id = p_cotizacion_id AND cd.tenant_id = p_tenant_id
    AND cd.producto_id = pd.producto_id;
  UPDATE public.pedidos_venta SET metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('commercial_pricing_inherited_from_quote', p_cotizacion_id,
      'commercial_schema_version', 469), updated_at = now()
  WHERE id = v_pedido_id AND tenant_id = p_tenant_id;
  RETURN v_result || jsonb_build_object('pricing_snapshot_inherited', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_precios_venta_tx(
  p_tenant_id uuid,
  p_vendedor_id uuid,
  p_cliente_id uuid,
  p_detalle jsonb,
  p_fecha date DEFAULT NULL,
  p_moneda text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT app.resolver_detalle_precios_venta_469(
    p_tenant_id, p_vendedor_id, p_cliente_id, p_detalle,
    coalesce(p_fecha, app.hoy_tenant(p_tenant_id)), p_moneda);
$$;

-- Hook verificable para writers POS posteriores: no confía en un flag del
-- payload. Recalcula la regla vigente y compara precio, alcance y moneda con
-- el snapshot enviado. El precio de catálogo continúa validándose en 451.
CREATE OR REPLACE FUNCTION app.es_precio_pos_comercial_valido_469(
  p_tenant_id uuid,
  p_vendedor_id uuid,
  p_cliente_id uuid,
  p_moneda text,
  p_item jsonb,
  p_fecha date DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_snapshot jsonb := p_item->'precio_regla_snapshot';
  v_resolved jsonb;
  v_producto_id uuid := nullif(p_item->>'producto_id', '')::uuid;
  v_cantidad numeric := coalesce((p_item->>'cantidad')::numeric, 0);
  v_precio numeric := coalesce((p_item->>'precio_unitario')::numeric,
                                (p_item->>'precio_original')::numeric);
BEGIN
  IF p_tenant_id IS NULL OR p_vendedor_id IS NULL OR v_producto_id IS NULL
     OR v_cantidad <= 0 OR v_precio IS NULL OR v_precio < 0
     OR jsonb_typeof(coalesce(v_snapshot, 'null'::jsonb)) <> 'object'
     OR upper(coalesce(v_snapshot->>'moneda', '')) <> upper(btrim(coalesce(p_moneda, '')))
     OR coalesce((v_snapshot->>'snapshot_version')::integer, 0) <> 469 THEN
    RETURN false;
  END IF;
  v_resolved := app.resolver_precio_venta_469(
    p_tenant_id, p_vendedor_id, p_cliente_id, v_producto_id, v_cantidad,
    coalesce(p_fecha, app.hoy_tenant(p_tenant_id)), v_precio, p_moneda);
  RETURN coalesce((v_resolved->>'regla_aplicada')::boolean, false)
    AND abs((v_resolved->>'precio_unitario')::numeric - v_precio) <= 0.000001
    AND v_resolved->>'lista_id' IS NOT DISTINCT FROM v_snapshot->>'lista_id'
    AND v_resolved->>'detalle_id' IS NOT DISTINCT FROM v_snapshot->>'detalle_id'
    AND v_resolved->>'producto_id' IS NOT DISTINCT FROM v_snapshot->>'producto_id'
    AND upper(coalesce(v_resolved->>'moneda', '')) = upper(coalesce(v_snapshot->>'moneda', ''));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END;
$$;

-- 451 conserva un único writer fiscal y valida el precio dentro de ese mismo
-- límite transaccional. Añadimos el hook comercial de forma fail-closed: la
-- migración sólo continúa si reconoce exactamente una vez el fragmento
-- canónico de validación. Así no duplicamos el writer ni aceptamos un flag
-- forjable del navegador.
DO $patch_pos_fiscal_451$
DECLARE
  v_definition text;
  v_needle text := $needle$
         OR (coalesce(v_producto.precio_especial, 0) > 0
           AND abs(v_precio - v_producto.precio_especial) <= 0.01)
       )
$needle$;
  v_replacement text := $replacement$
         OR (coalesce(v_producto.precio_especial, 0) > 0
           AND abs(v_precio - v_producto.precio_especial) <= 0.01)
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(p_payload->'items') AS original(item)
           WHERE app.to_uuid_or_null(coalesce(original.item->>'producto_id', '')) = v_producto.id
             AND abs(app.to_numeric_or_zero(original.item->>'cantidad') - v_cantidad) <= 0.000001
             AND abs(app.to_numeric_or_zero(coalesce(
               original.item->>'precio_unitario', original.item->>'precio_original'
             )) - v_precio) <= 0.000001
             AND app.es_precio_pos_comercial_valido_469(
               p_tenant_id,
               p_usuario_id,
               app.to_uuid_or_null(coalesce(p_payload->>'cliente_id', '')),
               v_moneda,
               original.item,
               app.hoy_tenant(p_tenant_id)
             )
         )
       )
$replacement$;
  v_at integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'app.pos_registrar_venta_atomic_tx_451(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_definition;

  -- Reaplicar 469 no debe intentar insertar por segunda vez el hook dentro
  -- del writer 451. La presencia exacta del helper identifica la versión ya
  -- endurecida; más de una aparición sigue siendo una deriva bloqueante.
  IF strpos(v_definition, 'app.es_precio_pos_comercial_valido_469(') > 0 THEN
    IF (length(v_definition) - length(replace(
          v_definition, 'app.es_precio_pos_comercial_valido_469(', ''
        ))) / length('app.es_precio_pos_comercial_valido_469(') <> 1 THEN
      RAISE EXCEPTION
        'COMMERCIAL_POS_469_ALREADY_PATCHED_MORE_THAN_ONCE';
    END IF;
    RETURN;
  END IF;

  v_at := strpos(v_definition, v_needle);
  IF v_at = 0 OR strpos(substr(v_definition, v_at + length(v_needle)), v_needle) > 0 THEN
    RAISE EXCEPTION
      'COMMERCIAL_POS_469_CANNOT_PATCH_451: canonical validation fragment missing or duplicated';
  END IF;

  v_definition := overlay(v_definition PLACING v_replacement FROM v_at FOR length(v_needle));
  EXECUTE v_definition;
END;
$patch_pos_fiscal_451$;

COMMENT ON FUNCTION app.pos_registrar_venta_atomic_tx_451(uuid,uuid,uuid,text,jsonb) IS
  'Writer POS fiscal atómico de 451; 469 no confía en el snapshot recibido y recalcula la lista comercial antes de aceptar su precio.';

-- El maestro 460 es la única frontera canónica de alta/edición de productos.
-- Se amplía en sitio para que `marca` forme parte de su huella idempotente,
-- auditoría y respuesta, preservando el contrato de imágenes agregado por 468.
DO $patch_product_brand_460$
DECLARE
  v_create text;
  v_update text;
  v_create_payload_needle text := $needle$
    'nombre', v_nombre,
    'categoria', v_categoria,
$needle$;
  v_create_payload_replacement text := $replacement$
    'nombre', v_nombre,
    'categoria', v_categoria,
    'marca', NULLIF(btrim(COALESCE(p_payload->>'marca', '')), ''),
$replacement$;
  v_create_update_needle text := $needle$
  SET created_by = p_actor_id,
      updated_by = p_actor_id,
$needle$;
  v_create_update_replacement text := $replacement$
  SET marca = NULLIF(btrim(COALESCE(p_payload->>'marca', '')), ''),
      created_by = p_actor_id,
      updated_by = p_actor_id,
$replacement$;
  v_create_validation_needle text := $needle$
     OR (v_producto_payload->>'impuesto')::numeric NOT BETWEEN 0 AND 100 THEN
$needle$;
  v_create_validation_replacement text := $replacement$
     OR (v_producto_payload->>'impuesto')::numeric NOT BETWEEN 0 AND 100
     OR length(COALESCE(v_producto_payload->>'marca', '')) > 120 THEN
$replacement$;
  v_update_set_needle text := $needle$
      nombre = CASE WHEN p_cambios ? 'nombre' THEN NULLIF(btrim(p_cambios->>'nombre'), '') ELSE p.nombre END,
      descripcion = CASE WHEN p_cambios ? 'descripcion' THEN NULLIF(btrim(p_cambios->>'descripcion'), '') ELSE p.descripcion END,
$needle$;
  v_update_set_replacement text := $replacement$
      nombre = CASE WHEN p_cambios ? 'nombre' THEN NULLIF(btrim(p_cambios->>'nombre'), '') ELSE p.nombre END,
      marca = CASE WHEN p_cambios ? 'marca' THEN NULLIF(btrim(p_cambios->>'marca'), '') ELSE p.marca END,
      descripcion = CASE WHEN p_cambios ? 'descripcion' THEN NULLIF(btrim(p_cambios->>'descripcion'), '') ELSE p.descripcion END,
$replacement$;
  v_update_validation_needle text := $needle$
     OR v_new.impuesto NOT BETWEEN 0 AND 100
     OR jsonb_typeof(COALESCE(v_new.atributos_extra, '{}'::jsonb)) <> 'object' THEN
$needle$;
  v_update_validation_replacement text := $replacement$
     OR v_new.impuesto NOT BETWEEN 0 AND 100
     OR length(COALESCE(v_new.marca, '')) > 120
     OR jsonb_typeof(COALESCE(v_new.atributos_extra, '{}'::jsonb)) <> 'object' THEN
$replacement$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.crear_producto_maestro_tx(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_create;
  IF strpos(v_create, '''marca'', NULLIF(btrim(COALESCE(p_payload->>''marca''') > 0
     OR strpos(v_create, 'SET marca = NULLIF(btrim(COALESCE(p_payload->>''marca''') > 0
     OR strpos(v_create, 'length(COALESCE(v_producto_payload->>''marca''') > 0 THEN
    IF strpos(v_create, '''marca'', NULLIF(btrim(COALESCE(p_payload->>''marca''') = 0
       OR strpos(v_create, 'SET marca = NULLIF(btrim(COALESCE(p_payload->>''marca''') = 0
       OR strpos(v_create, 'length(COALESCE(v_producto_payload->>''marca''') = 0 THEN
      RAISE EXCEPTION 'COMMERCIAL_BRAND_469_PRODUCT_CREATE_PARTIALLY_PATCHED';
    END IF;
  ELSE
    IF length(v_create)-length(replace(v_create,v_create_payload_needle,'')) <> length(v_create_payload_needle)
       OR length(v_create)-length(replace(v_create,v_create_update_needle,'')) <> length(v_create_update_needle)
       OR length(v_create)-length(replace(v_create,v_create_validation_needle,'')) <> length(v_create_validation_needle) THEN
      RAISE EXCEPTION 'COMMERCIAL_BRAND_469_CANNOT_PATCH_PRODUCT_CREATE_460';
    END IF;
    v_create := replace(v_create, v_create_payload_needle, v_create_payload_replacement);
    v_create := replace(v_create, v_create_update_needle, v_create_update_replacement);
    v_create := replace(v_create, v_create_validation_needle, v_create_validation_replacement);
    EXECUTE v_create;
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.actualizar_producto_maestro_tx(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_update;
  IF strpos(v_update, 'marca = CASE WHEN p_cambios ? ''marca''') > 0
     OR strpos(v_update, 'length(COALESCE(v_new.marca') > 0 THEN
    IF strpos(v_update, 'marca = CASE WHEN p_cambios ? ''marca''') = 0
       OR strpos(v_update, 'length(COALESCE(v_new.marca') = 0 THEN
      RAISE EXCEPTION 'COMMERCIAL_BRAND_469_PRODUCT_UPDATE_PARTIALLY_PATCHED';
    END IF;
  ELSE
    IF length(v_update)-length(replace(v_update,v_update_set_needle,'')) <> length(v_update_set_needle)
       OR length(v_update)-length(replace(v_update,v_update_validation_needle,'')) <> length(v_update_validation_needle) THEN
      RAISE EXCEPTION 'COMMERCIAL_BRAND_469_CANNOT_PATCH_PRODUCT_UPDATE_460';
    END IF;
    v_update := replace(v_update, v_update_set_needle, v_update_set_replacement);
    v_update := replace(v_update, v_update_validation_needle, v_update_validation_replacement);
    EXECUTE v_update;
  END IF;
END;
$patch_product_brand_460$;

COMMENT ON COLUMN public.productos.marca IS
  'Marca comercial editable por el maestro canónico 460/469; se congela en cada movimiento de comisión.';

CREATE OR REPLACE FUNCTION app.pos_intencion_comercial_469(p_intencion jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT jsonb_build_object(
    'cliente_id', app.to_uuid_or_null(coalesce(p_intencion->>'cliente_id', '')),
    'cliente_documento', btrim(coalesce(p_intencion->>'cliente_documento', '')),
    'cliente_tipo_documento', btrim(coalesce(p_intencion->>'cliente_tipo_documento', '')),
    'cliente_nombre', btrim(coalesce(p_intencion->>'cliente_nombre', '')),
    'cliente_direccion', btrim(coalesce(p_intencion->>'cliente_direccion', '')),
    'moneda', upper(coalesce(nullif(btrim(p_intencion->>'moneda'), ''), 'PEN')),
    'emitir_cpe', coalesce((p_intencion->>'emitir_cpe')::boolean, true),
    'tipo_documento', coalesce(
      nullif(p_intencion #>> '{comprobante,tipo}', ''),
      nullif(p_intencion #>> '{cpe_data,tipo_documento}', ''),
      nullif(p_intencion->>'tipo_documento', ''), ''),
    'serie', upper(coalesce(
      nullif(p_intencion #>> '{comprobante,serie}', ''),
      nullif(p_intencion #>> '{cpe_data,serie}', ''), '')),
    'metodo_pago', lower(btrim(coalesce(p_intencion->>'metodo_pago', ''))),
    'metodo_pago_id', btrim(coalesce(p_intencion->>'metodo_pago_id', '')),
    'referencia_pago', nullif(btrim(coalesce(p_intencion->>'referencia_pago', '')), ''),
    'descuento_global', round(app.to_numeric_or_zero(p_intencion->>'descuento_global'), 2),
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'producto_id', app.to_uuid_or_null(coalesce(item->>'producto_id', '')),
        'cantidad', round(app.to_numeric_or_zero(item->>'cantidad'), 6),
        'precio_solicitado', round(app.to_numeric_or_zero(coalesce(
          item->>'precio_unitario', item->>'precio_original')), 6),
        'descuento_monto', round(app.to_numeric_or_zero(item->>'descuento_monto'), 2),
        'descuento_porcentaje', round(app.to_numeric_or_zero(item->>'descuento_porcentaje'), 6)
      ) ORDER BY ordinality), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(p_intencion->'items', '[]'::jsonb))
        WITH ORDINALITY AS lines(item, ordinality)
    ),
    'pagos', app.pos_payments_canonical_451(p_intencion->'pagos')
  );
$$;

CREATE OR REPLACE FUNCTION app.pos_reintento_comercial_469(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_sesion_caja_id uuid,
  p_idempotency_key text,
  p_intencion jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_fingerprint text;
  v_existing public.ventas_pos%ROWTYPE;
  v_tipo_emision text;
BEGIN
  IF NOT app.actor_comercial_valido_469(p_tenant_id, p_usuario_id)
     OR v_key IS NULL OR length(v_key) > 200
     OR jsonb_typeof(coalesce(p_intencion, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'COMMERCIAL_POS_RETRY_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := app.commercial_fingerprint_469(
    app.pos_intencion_comercial_469(p_intencion));

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pos.sale:' || p_tenant_id::text || ':' || v_key, 451));
  SELECT * INTO v_existing
  FROM public.ventas_pos v
  WHERE v.tenant_id = p_tenant_id AND v.idempotency_key = v_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_existing.usuario_id IS DISTINCT FROM p_usuario_id
     OR (p_sesion_caja_id IS NOT NULL
       AND v_existing.sesion_caja_id IS DISTINCT FROM p_sesion_caja_id) THEN
    -- La clave ya pertenece a otra intención/actor o sesión: se modela como
    -- colisión idempotente (igual que un payload económico distinto), no como
    -- una segunda autorización que pudiera reejecutar el writer.
    RAISE EXCEPTION 'COMMERCIAL_POS_RETRY_ACTOR_OR_SESSION_MISMATCH' USING ERRCODE = '23505';
  END IF;
  IF nullif(v_existing.metadata->>'commercial_request_fingerprint', '') IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_POS_LEGACY_RETRY_REQUIRES_RECONCILIATION' USING ERRCODE = '23514';
  END IF;
  IF v_existing.metadata->>'commercial_request_fingerprint' IS DISTINCT FROM v_fingerprint THEN
    RAISE EXCEPTION 'POS_IDEMPOTENCY_PAYLOAD_MISMATCH' USING ERRCODE = '23505';
  END IF;

  v_tipo_emision := upper(coalesce(to_jsonb(v_existing)->>'tipo_emision', ''));
  IF v_tipo_emision = 'TICKET'
     AND to_regprocedure('app.pos_ticket_sale_postconditions_471(public.ventas_pos)') IS NOT NULL THEN
    EXECUTE 'SELECT app.pos_ticket_sale_postconditions_471($1)'
      USING v_existing;
  ELSE
    PERFORM app.pos_sale_postconditions_451(v_existing);
  END IF;
  RETURN v_existing.atomic_result || jsonb_build_object(
    'idempotent', true,
    'commercial_pricing_applied', true,
    'commissions_accrued', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reintentar_venta_pos_comercial_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_idempotency_key text,
  p_intencion jsonb,
  p_sesion_caja_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  SELECT app.pos_reintento_comercial_469(
    p_tenant_id, p_usuario_id, p_sesion_caja_id,
    p_idempotency_key, p_intencion);
$$;

CREATE OR REPLACE FUNCTION app.devengar_comision_linea_469(
  p_tenant_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_source_line_id uuid,
  p_vendedor_id uuid,
  p_producto_id uuid,
  p_base numeric,
  p_moneda text,
  p_fecha date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_producto public.productos;
  v_regla public.reglas_comisiones_venta;
  v_marca_snapshot text;
  v_marca_origen text;
  v_tiene_marca_snapshot boolean := false;
  v_id uuid;
  v_key text;
  v_monto numeric(14,2);
  v_source_type text := upper(btrim(coalesce(p_source_type, '')));
BEGIN
  IF p_vendedor_id IS NULL OR p_producto_id IS NULL OR p_base <= 0
     OR v_source_type NOT IN ('POS','DOCUMENTO') THEN
    RETURN NULL;
  END IF;
  SELECT p.* INTO v_producto FROM public.productos p
  WHERE p.id = p_producto_id AND p.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_source_type = 'POS' THEN
    SELECT d.precio_regla_snapshot ? 'producto_marca',
      nullif(d.precio_regla_snapshot->>'producto_marca', '')
    INTO v_tiene_marca_snapshot, v_marca_snapshot
    FROM public.detalle_ventas_pos d
    WHERE d.tenant_id=p_tenant_id AND d.id=p_source_line_id
      AND coalesce(d.venta_pos_id,d.venta_id)=p_source_id;
  ELSE
    SELECT pd.precio_regla_snapshot ? 'producto_marca',
      nullif(pd.precio_regla_snapshot->>'producto_marca', '')
    INTO v_tiene_marca_snapshot, v_marca_snapshot
    FROM public.documento_detalles dd
    JOIN public.documentos doc ON doc.id=dd.documento_id AND doc.tenant_id=dd.tenant_id
    JOIN public.pedidos_venta_detalle pd ON pd.pedido_id=doc.pedido_id
      AND pd.tenant_id=doc.tenant_id AND pd.producto_id=dd.producto_id
    WHERE dd.tenant_id=p_tenant_id AND dd.id=p_source_line_id
      AND dd.documento_id=p_source_id
    ORDER BY pd.id
    LIMIT 1;
  END IF;
  v_marca_origen := CASE WHEN coalesce(v_tiene_marca_snapshot,false)
    THEN 'SNAPSHOT_VENTA' ELSE 'PRODUCTO_ACTUAL' END;
  IF NOT coalesce(v_tiene_marca_snapshot,false) THEN
    v_marca_snapshot := v_producto.marca;
  END IF;

  IF v_source_type = 'POS' AND NOT EXISTS (
    SELECT 1 FROM public.ventas_pos v WHERE v.id = p_source_id
      AND v.tenant_id = p_tenant_id
      AND upper(coalesce(v.estado::text, '')) IN ('PAGADA','CONFIRMADA','COMPLETADA')
  ) THEN RETURN NULL; END IF;
  IF v_source_type = 'DOCUMENTO' AND NOT EXISTS (
    SELECT 1 FROM public.documentos d WHERE d.id = p_source_id
      AND d.tenant_id = p_tenant_id
      AND upper(coalesce(d.tipo_documento,'')) IN ('FACTURA','BOLETA')
       AND upper(coalesce(d.estado::text,'')) IN ('EMITIDO','ENVIADO_SUNAT','ACEPTADO')
  ) THEN RETURN NULL; END IF;

  SELECT r.* INTO v_regla
  FROM public.reglas_comisiones_venta r
  WHERE r.tenant_id = p_tenant_id AND r.activo
    AND r.vigencia_desde <= coalesce(p_fecha, app.hoy_tenant(p_tenant_id))
    AND (r.vigencia_hasta IS NULL OR r.vigencia_hasta >= coalesce(p_fecha, app.hoy_tenant(p_tenant_id)))
    AND (r.vendedor_id IS NULL OR r.vendedor_id = p_vendedor_id)
    AND (r.producto_id IS NULL OR r.producto_id = p_producto_id)
    AND (r.marca IS NULL OR upper(btrim(r.marca)) = upper(btrim(coalesce(v_marca_snapshot,''))))
  ORDER BY (r.producto_id IS NOT NULL) DESC,
    (r.marca IS NOT NULL) DESC, (r.vendedor_id IS NOT NULL) DESC,
    r.prioridad DESC, r.vigencia_desde DESC, r.id
  LIMIT 1;
  IF NOT FOUND OR v_regla.porcentaje <= 0 THEN RETURN NULL; END IF;

  v_key := format('DEVENGO:%s:%s:%s', v_source_type, p_source_id, p_source_line_id);
  v_monto := round(p_base * v_regla.porcentaje / 100, 2);
  IF v_monto <= 0 THEN RETURN NULL; END IF;
  INSERT INTO public.comisiones_venta_movimientos (
    tenant_id, tipo, source_type, source_id, source_line_id, vendedor_id,
    producto_id, marca, moneda, base_comisionable, porcentaje, monto,
    regla_id, idempotency_key, snapshot
  ) VALUES (
    p_tenant_id, 'DEVENGO', v_source_type, p_source_id, p_source_line_id,
    p_vendedor_id, p_producto_id, v_marca_snapshot,
    upper(coalesce(nullif(btrim(p_moneda),''),'PEN')),
    round(p_base,2), v_regla.porcentaje, v_monto, v_regla.id, v_key,
    jsonb_build_object(
      'regla_id', v_regla.id, 'regla_codigo', v_regla.codigo,
      'regla_nombre', v_regla.nombre, 'porcentaje', v_regla.porcentaje,
      'vendedor_id', p_vendedor_id, 'producto_id', p_producto_id,
      'marca', v_marca_snapshot, 'marca_origen', v_marca_origen,
      'base', round(p_base,2),
      'fecha_efectiva', coalesce(p_fecha, app.hoy_tenant(p_tenant_id)),
      'snapshot_version', 469)
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.comisiones_venta_movimientos
    WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.revertir_comision_parcial_469(
  p_tenant_id uuid,
  p_source_line_id uuid,
  p_reversal_line_id uuid,
  p_reversal_document_id uuid,
  p_base_revertida numeric,
  p_trigger_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_devengo public.comisiones_venta_movimientos;
  v_neto numeric(14,2);
  v_reversa numeric(14,2);
  v_key text;
  v_count integer := 0;
BEGIN
  FOR v_devengo IN
    SELECT m.* FROM public.comisiones_venta_movimientos m
    WHERE m.tenant_id = p_tenant_id AND m.tipo = 'DEVENGO'
      AND m.source_line_id = p_source_line_id
    -- Serializa NC/anulaciones concurrentes sobre el mismo devengo. Un lock
    -- compartido permitiría que dos sesiones leyesen el mismo saldo y lo
    -- revirtieran dos veces con claves de trigger diferentes.
    ORDER BY m.id FOR UPDATE
  LOOP
    SELECT round(
      v_devengo.monto
      + coalesce((SELECT sum(r.monto)
          FROM public.comisiones_venta_movimientos r
          WHERE r.tenant_id = p_tenant_id AND r.tipo = 'REVERSA'
            AND r.reversa_de_id = v_devengo.id), 0)
      + coalesce((SELECT sum(i.monto)
          FROM public.comisiones_venta_movimientos i
          JOIN public.comisiones_venta_movimientos r ON r.id = i.reversa_de_id
          WHERE i.tenant_id = p_tenant_id AND i.tipo = 'REINTEGRO'
            AND r.tenant_id = p_tenant_id AND r.tipo = 'REVERSA'
            AND r.reversa_de_id = v_devengo.id), 0), 2)
    INTO v_neto;
    v_reversa := least(greatest(v_neto,0),
      round(greatest(coalesce(p_base_revertida,0),0) * v_devengo.porcentaje / 100,2));
    IF v_reversa > 0 THEN
      v_key := format('REVERSA:%s:%s:%s', p_trigger_type, p_reversal_document_id, v_devengo.id);
      INSERT INTO public.comisiones_venta_movimientos (
        tenant_id, tipo, source_type, source_id, source_line_id, vendedor_id,
        producto_id, marca, moneda, base_comisionable, porcentaje, monto,
        regla_id, reversa_de_id, trigger_type, trigger_id, idempotency_key, snapshot
      ) VALUES (
        p_tenant_id, 'REVERSA', v_devengo.source_type, v_devengo.source_id,
        p_reversal_line_id, v_devengo.vendedor_id, v_devengo.producto_id,
        v_devengo.marca, v_devengo.moneda, round(p_base_revertida,2),
        v_devengo.porcentaje, -v_reversa, v_devengo.regla_id, v_devengo.id,
        upper(p_trigger_type), p_reversal_document_id, v_key,
        jsonb_build_object('reversa_de_id', v_devengo.id,
          'source_line_id', p_source_line_id, 'base_revertida', round(p_base_revertida,2),
          'monto_revertido', v_reversa, 'snapshot_version', 469)
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
      GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION app.revertir_comisiones_fuente_469(
  p_tenant_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_trigger_type text,
  p_trigger_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_devengo public.comisiones_venta_movimientos;
  v_neto numeric(14,2);
  v_key text;
  v_inserted integer;
  v_count integer := 0;
BEGIN
  FOR v_devengo IN
    SELECT m.* FROM public.comisiones_venta_movimientos m
    WHERE m.tenant_id = p_tenant_id AND m.tipo = 'DEVENGO'
      AND m.source_type = upper(p_source_type) AND m.source_id = p_source_id
    ORDER BY m.id FOR UPDATE
  LOOP
    SELECT round(
      v_devengo.monto
      + coalesce((SELECT sum(r.monto)
          FROM public.comisiones_venta_movimientos r
          WHERE r.tenant_id = p_tenant_id AND r.tipo = 'REVERSA'
            AND r.reversa_de_id = v_devengo.id), 0)
      + coalesce((SELECT sum(i.monto)
          FROM public.comisiones_venta_movimientos i
          JOIN public.comisiones_venta_movimientos r ON r.id = i.reversa_de_id
          WHERE i.tenant_id = p_tenant_id AND i.tipo = 'REINTEGRO'
            AND r.tenant_id = p_tenant_id AND r.tipo = 'REVERSA'
            AND r.reversa_de_id = v_devengo.id), 0), 2)
    INTO v_neto;
    IF v_neto > 0 THEN
      v_key := format('REVERSA_TOTAL:%s:%s:%s', upper(p_trigger_type), p_trigger_id, v_devengo.id);
      INSERT INTO public.comisiones_venta_movimientos (
        tenant_id, tipo, source_type, source_id, source_line_id, vendedor_id,
        producto_id, marca, moneda, base_comisionable, porcentaje, monto,
        regla_id, reversa_de_id, trigger_type, trigger_id, idempotency_key, snapshot
      ) VALUES (
        p_tenant_id, 'REVERSA', v_devengo.source_type, v_devengo.source_id,
        v_devengo.source_line_id, v_devengo.vendedor_id, v_devengo.producto_id,
        v_devengo.marca, v_devengo.moneda, v_devengo.base_comisionable,
        v_devengo.porcentaje, -v_neto, v_devengo.regla_id, v_devengo.id,
        upper(p_trigger_type), p_trigger_id, v_key,
        jsonb_build_object('reversa_de_id', v_devengo.id,
          'monto_revertido', v_neto, 'reversa_total', true,
          'snapshot_version', 469)
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_count := v_count + v_inserted;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION app.reintegrar_comisiones_por_trigger_469(
  p_tenant_id uuid,
  p_trigger_type text,
  p_trigger_id uuid,
  p_new_trigger_type text,
  p_new_trigger_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_reversa public.comisiones_venta_movimientos;
  v_reintegrado numeric(14,2);
  v_pendiente numeric(14,2);
  v_inserted integer;
  v_count integer := 0;
  v_key text;
BEGIN
  FOR v_reversa IN
    SELECT r.*
    FROM public.comisiones_venta_movimientos r
    WHERE r.tenant_id = p_tenant_id AND r.tipo = 'REVERSA'
      AND upper(coalesce(r.trigger_type, '')) = upper(coalesce(p_trigger_type, ''))
      AND r.trigger_id = p_trigger_id
    ORDER BY r.id
    FOR UPDATE
  LOOP
    SELECT round(coalesce(sum(i.monto), 0), 2)
    INTO v_reintegrado
    FROM public.comisiones_venta_movimientos i
    WHERE i.tenant_id = p_tenant_id AND i.tipo = 'REINTEGRO'
      AND i.reversa_de_id = v_reversa.id;
    v_pendiente := greatest(round(abs(v_reversa.monto) - v_reintegrado, 2), 0);
    IF v_pendiente > 0 THEN
      v_key := format('REINTEGRO:%s:%s:%s', upper(p_new_trigger_type), p_new_trigger_id, v_reversa.id);
      INSERT INTO public.comisiones_venta_movimientos (
        tenant_id, tipo, source_type, source_id, source_line_id, vendedor_id,
        producto_id, marca, moneda, base_comisionable, porcentaje, monto,
        regla_id, reversa_de_id, trigger_type, trigger_id, idempotency_key, snapshot
      ) VALUES (
        p_tenant_id, 'REINTEGRO', v_reversa.source_type, v_reversa.source_id,
        v_reversa.source_line_id, v_reversa.vendedor_id, v_reversa.producto_id,
        v_reversa.marca, v_reversa.moneda, v_reversa.base_comisionable,
        v_reversa.porcentaje, v_pendiente, v_reversa.regla_id, v_reversa.id,
        upper(p_new_trigger_type), p_new_trigger_id, v_key,
        jsonb_build_object('reversa_reintegrada_id', v_reversa.id,
          'monto_reintegrado', v_pendiente, 'snapshot_version', 469)
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_count := v_count + v_inserted;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_registrar_venta_comercial_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_sesion_caja_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_resolved jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_retry jsonb;
  v_intencion jsonb := coalesce(p_payload->'commercial_request', p_payload);
  v_commercial_fingerprint text;
  v_venta_id uuid;
  v_row record;
  v_original jsonb;
  v_snapshot jsonb;
BEGIN
  v_commercial_fingerprint := app.commercial_fingerprint_469(
    app.pos_intencion_comercial_469(v_intencion));
  v_retry := app.pos_reintento_comercial_469(
    p_tenant_id, p_usuario_id, p_sesion_caja_id,
    p_idempotency_key, v_intencion);
  IF v_retry IS NOT NULL THEN
    RETURN v_retry;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':commercial-pricing:' || p_usuario_id::text, 469));
  v_resolved := app.resolver_detalle_precios_venta_469(
    p_tenant_id, p_usuario_id, nullif(p_payload->>'cliente_id','')::uuid,
    p_payload->'items', app.hoy_tenant(p_tenant_id),
    upper(coalesce(nullif(btrim(p_payload->>'moneda'), ''), 'PEN')));

  FOR v_row IN SELECT value AS item, ordinality::integer AS orden
    FROM jsonb_array_elements(v_resolved) WITH ORDINALITY
  LOOP
    v_original := p_payload->'items'->(v_row.orden - 1);
    v_snapshot := v_row.item->'precio_regla_snapshot';
    IF coalesce((v_snapshot->>'regla_aplicada')::boolean, false)
       AND abs(coalesce((v_original->>'precio_unitario')::numeric, -1)
         - (v_snapshot->>'precio_unitario')::numeric) > 0.000001 THEN
      RAISE EXCEPTION 'COMMERCIAL_PRICE_STALE: producto=% esperado=% recibido=%',
        v_row.item->>'producto_id', v_snapshot->>'precio_unitario',
        v_original->>'precio_unitario' USING ERRCODE = '40001';
    END IF;
  END LOOP;

  v_payload := jsonb_set(p_payload, '{items}', v_resolved, false);
  v_result := public.pos_registrar_venta_atomic_tx(
    p_tenant_id, p_usuario_id, p_sesion_caja_id, p_idempotency_key, v_payload);
  v_venta_id := nullif(v_result->>'venta_id','')::uuid;
  IF v_venta_id IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_POS_WRITER_DID_NOT_RETURN_ID' USING ERRCODE = '23514';
  END IF;

  UPDATE public.detalle_ventas_pos d
  SET lista_precio_id = nullif(x.item #>> '{precio_regla_snapshot,lista_id}', '')::uuid,
      precio_regla_snapshot = x.item->'precio_regla_snapshot',
      metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
        'commercial_price_snapshot', x.item->'precio_regla_snapshot',
        'commercial_schema_version', 469), updated_at = now()
  FROM (
    SELECT value AS item, ordinality::integer AS orden
    FROM jsonb_array_elements(v_resolved) WITH ORDINALITY
  ) x
  WHERE d.tenant_id = p_tenant_id AND coalesce(d.venta_pos_id,d.venta_id) = v_venta_id
    AND d.item_index = x.orden;

  UPDATE public.ventas_pos SET metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('commercial_pricing_applied', true,
      'commercial_schema_version', 469,
      'commercial_request_fingerprint', v_commercial_fingerprint),
    updated_at = now()
  WHERE id = v_venta_id AND tenant_id = p_tenant_id;

  FOR v_row IN
    SELECT d.id, d.producto_id, d.subtotal, v.moneda,
      coalesce(v.fecha::date, app.hoy_tenant(p_tenant_id)) AS fecha
    FROM public.detalle_ventas_pos d
    JOIN public.ventas_pos v ON v.id = coalesce(d.venta_pos_id,d.venta_id)
      AND v.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant_id AND coalesce(d.venta_pos_id,d.venta_id) = v_venta_id
    ORDER BY d.item_index, d.id
  LOOP
    PERFORM app.devengar_comision_linea_469(
      p_tenant_id, 'POS', v_venta_id, v_row.id, p_usuario_id,
      v_row.producto_id, v_row.subtotal, v_row.moneda, v_row.fecha);
  END LOOP;
  RETURN v_result || jsonb_build_object('commercial_pricing_applied', true,
    'commissions_accrued', true);
END;
$$;

CREATE OR REPLACE FUNCTION app.documento_comision_linea_trigger_469()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_doc public.documentos;
  v_pedido public.pedidos_venta;
  v_source_line uuid;
  v_comision_id uuid;
BEGIN
  SELECT d.* INTO v_doc FROM public.documentos d
  WHERE d.id = NEW.documento_id AND d.tenant_id = NEW.tenant_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF upper(coalesce(v_doc.tipo_documento,'')) IN ('FACTURA','BOLETA')
     AND upper(coalesce(v_doc.estado::text,'')) IN ('EMITIDO','ENVIADO_SUNAT','ACEPTADO')
     AND nullif(v_doc.metadata->>'venta_pos_id','') IS NULL THEN
    IF v_doc.pedido_id IS NOT NULL THEN
      SELECT p.* INTO v_pedido FROM public.pedidos_venta p
      WHERE p.id = v_doc.pedido_id AND p.tenant_id = NEW.tenant_id;
    END IF;
    v_comision_id := app.devengar_comision_linea_469(
      NEW.tenant_id, 'DOCUMENTO', v_doc.id, NEW.id,
      coalesce(v_pedido.created_by, v_doc.created_by),
      NEW.producto_id, NEW.valor_venta, v_doc.moneda, v_doc.fecha_emision::date);
    IF v_comision_id IS NOT NULL THEN
      UPDATE public.documento_detalles SET comision_snapshot = jsonb_build_object(
        'movimiento_id', v_comision_id, 'snapshot_version', 469)
      WHERE id = NEW.id;
    END IF;
  ELSIF upper(coalesce(v_doc.tipo_documento,'')) = 'NOTA_CREDITO'
     AND upper(coalesce(v_doc.estado::text,'')) IN ('EMITIDO','ENVIADO_SUNAT','ACEPTADO') THEN
    v_source_line := nullif(NEW.metadata->>'source_document_line_id','')::uuid;
    IF v_source_line IS NOT NULL THEN
      PERFORM app.revertir_comision_parcial_469(
        NEW.tenant_id, v_source_line, NEW.id, v_doc.id,
        NEW.valor_venta, 'NOTA_CREDITO');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documento_comision_linea_469 ON public.documento_detalles;
CREATE TRIGGER trg_documento_comision_linea_469
AFTER INSERT ON public.documento_detalles
FOR EACH ROW EXECUTE FUNCTION app.documento_comision_linea_trigger_469();

CREATE OR REPLACE FUNCTION app.documento_comision_anulacion_trigger_469()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_pos_id uuid;
  v_pedido public.pedidos_venta;
  v_line public.documento_detalles;
  v_source_line uuid;
  v_comision_id uuid;
BEGIN
  IF upper(coalesce(NEW.estado::text,'')) IN ('ANULADO','ANULADA','REVERTIDO','REVERTIDA')
     AND upper(coalesce(OLD.estado::text,'')) NOT IN ('ANULADO','ANULADA','REVERTIDO','REVERTIDA') THEN
    IF upper(coalesce(NEW.tipo_documento,'')) = 'NOTA_CREDITO' THEN
      PERFORM app.reintegrar_comisiones_por_trigger_469(
        NEW.tenant_id, 'NOTA_CREDITO', NEW.id, 'ANULACION_NOTA_CREDITO', NEW.id);
    ELSE
      v_pos_id := nullif(NEW.metadata->>'venta_pos_id','')::uuid;
      IF v_pos_id IS NOT NULL THEN
        PERFORM app.revertir_comisiones_fuente_469(
          NEW.tenant_id, 'POS', v_pos_id, 'ANULACION_DOCUMENTO', NEW.id);
      ELSE
        PERFORM app.revertir_comisiones_fuente_469(
          NEW.tenant_id, 'DOCUMENTO', NEW.id, 'ANULACION_DOCUMENTO', NEW.id);
      END IF;
    END IF;
  ELSIF upper(coalesce(NEW.estado::text,'')) IN ('EMITIDO','ENVIADO_SUNAT','ACEPTADO')
     AND upper(coalesce(OLD.estado::text,'')) NOT IN ('EMITIDO','ENVIADO_SUNAT','ACEPTADO') THEN
    IF upper(coalesce(NEW.tipo_documento,'')) IN ('FACTURA','BOLETA')
       AND nullif(NEW.metadata->>'venta_pos_id','') IS NULL THEN
      IF NEW.pedido_id IS NOT NULL THEN
        SELECT p.* INTO v_pedido FROM public.pedidos_venta p
        WHERE p.id = NEW.pedido_id AND p.tenant_id = NEW.tenant_id;
      END IF;
      FOR v_line IN SELECT d.* FROM public.documento_detalles d
        WHERE d.documento_id = NEW.id AND d.tenant_id = NEW.tenant_id ORDER BY d.orden,d.id
      LOOP
        v_comision_id := app.devengar_comision_linea_469(
          NEW.tenant_id, 'DOCUMENTO', NEW.id, v_line.id,
          coalesce(v_pedido.created_by, NEW.created_by),
          v_line.producto_id, v_line.valor_venta, NEW.moneda, NEW.fecha_emision::date);
        IF v_comision_id IS NOT NULL THEN
          UPDATE public.documento_detalles SET comision_snapshot = jsonb_build_object(
            'movimiento_id', v_comision_id, 'snapshot_version', 469)
          WHERE id = v_line.id;
        END IF;
      END LOOP;
    ELSIF upper(coalesce(NEW.tipo_documento,'')) = 'NOTA_CREDITO' THEN
      FOR v_line IN SELECT d.* FROM public.documento_detalles d
        WHERE d.documento_id = NEW.id AND d.tenant_id = NEW.tenant_id ORDER BY d.orden,d.id
      LOOP
        v_source_line := nullif(v_line.metadata->>'source_document_line_id','')::uuid;
        IF v_source_line IS NOT NULL THEN
          PERFORM app.revertir_comision_parcial_469(
            NEW.tenant_id, v_source_line, v_line.id, NEW.id,
            v_line.valor_venta, 'NOTA_CREDITO');
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documento_comision_anulacion_469 ON public.documentos;
CREATE TRIGGER trg_documento_comision_anulacion_469
AFTER UPDATE OF estado ON public.documentos
FOR EACH ROW EXECUTE FUNCTION app.documento_comision_anulacion_trigger_469();

CREATE OR REPLACE FUNCTION app.pos_comision_anulacion_trigger_469()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF upper(coalesce(NEW.estado::text,'')) IN ('ANULADO','ANULADA','REVERTIDO','REVERTIDA')
     AND upper(coalesce(OLD.estado::text,'')) NOT IN ('ANULADO','ANULADA','REVERTIDO','REVERTIDA') THEN
    PERFORM app.revertir_comisiones_fuente_469(
      NEW.tenant_id, 'POS', NEW.id, 'ANULACION_POS', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_comision_anulacion_469 ON public.ventas_pos;
CREATE TRIGGER trg_pos_comision_anulacion_469
AFTER UPDATE OF estado ON public.ventas_pos
FOR EACH ROW EXECUTE FUNCTION app.pos_comision_anulacion_trigger_469();

CREATE OR REPLACE FUNCTION public.registrar_lista_precios_venta_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_lista jsonb,
  p_detalles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key,''));
  v_payload jsonb;
  v_fingerprint text;
  v_existing public.operaciones_comerciales_469;
  v_lista public.listas_precios_venta;
  v_codigo text := upper(btrim(coalesce(p_lista->>'codigo','')));
  v_moneda text := upper(btrim(coalesce(p_lista->>'moneda','PEN')));
  v_vendedor uuid := nullif(p_lista->>'vendedor_id','')::uuid;
  v_cliente uuid := nullif(p_lista->>'cliente_id','')::uuid;
  v_item jsonb;
  v_producto uuid;
  v_marca text;
BEGIN
  IF NOT app.actor_comercial_valido_469(p_tenant_id,p_actor_id)
     OR length(v_key) NOT BETWEEN 8 AND 255
     OR jsonb_typeof(p_lista) <> 'object'
     OR jsonb_typeof(p_detalles) <> 'array'
     OR jsonb_array_length(p_detalles) NOT BETWEEN 1 AND 999 THEN
    RAISE EXCEPTION 'COMMERCIAL_PRICE_LIST_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('lista',p_lista,'detalles',p_detalles,'actor',p_actor_id);
  v_fingerprint := app.commercial_fingerprint_469(v_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':commercial-op:' || v_key,469));
  SELECT * INTO v_existing FROM public.operaciones_comerciales_469
  WHERE tenant_id=p_tenant_id AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.operacion <> 'REGISTRAR_LISTA_PRECIOS'
       OR v_existing.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'COMMERCIAL_IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent',true);
  END IF;
  IF v_codigo !~ '^[A-Z0-9][A-Z0-9._-]{1,39}$' OR v_moneda !~ '^[A-Z]{3}$'
     OR length(btrim(coalesce(p_lista->>'nombre',''))) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'COMMERCIAL_PRICE_LIST_HEADER_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_cliente IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id=v_cliente AND c.tenant_id=p_tenant_id AND c.activo
  ) THEN RAISE EXCEPTION 'COMMERCIAL_PRICE_LIST_CUSTOMER_INVALID' USING ERRCODE='P0002'; END IF;
  IF v_vendedor IS NOT NULL AND NOT app.actor_comercial_valido_469(p_tenant_id,v_vendedor) THEN
    RAISE EXCEPTION 'COMMERCIAL_PRICE_LIST_SELLER_INVALID' USING ERRCODE='P0002';
  END IF;
  IF nullif(p_lista->>'vigencia_desde','')::date IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_PRICE_LIST_START_DATE_REQUIRED' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.listas_precios_venta (
    tenant_id,codigo,nombre,moneda,prioridad,vendedor_id,cliente_id,
    vigencia_desde,vigencia_hasta,activo,created_by,metadata
  ) VALUES (
    p_tenant_id,v_codigo,btrim(p_lista->>'nombre'),v_moneda,
    coalesce((p_lista->>'prioridad')::integer,0),v_vendedor,v_cliente,
    (p_lista->>'vigencia_desde')::date,nullif(p_lista->>'vigencia_hasta','')::date,
    true,p_actor_id,jsonb_build_object('schema_version',469,'idempotency_key',v_key)
  ) RETURNING * INTO v_lista;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_detalles)
  LOOP
    v_producto := nullif(v_item->>'producto_id','')::uuid;
    v_marca := nullif(btrim(coalesce(v_item->>'marca','')),'');
    IF (v_producto IS NULL AND v_marca IS NULL)
       OR coalesce((v_item->>'cantidad_minima')::numeric,0) < 0
       OR coalesce((v_item->>'precio_unitario')::numeric,-1) < 0 THEN
      RAISE EXCEPTION 'COMMERCIAL_PRICE_LIST_LINE_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_producto IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.productos p WHERE p.id=v_producto AND p.tenant_id=p_tenant_id AND p.activo
    ) THEN RAISE EXCEPTION 'COMMERCIAL_PRICE_LIST_PRODUCT_INVALID: %',v_producto USING ERRCODE='P0002'; END IF;
    INSERT INTO public.lista_precios_venta_detalles (
      tenant_id,lista_id,producto_id,marca,cantidad_minima,precio_unitario,metadata
    ) VALUES (
      p_tenant_id,v_lista.id,v_producto,v_marca,
      round(coalesce((v_item->>'cantidad_minima')::numeric,0),4),
      round((v_item->>'precio_unitario')::numeric,6),
      jsonb_build_object('schema_version',469)
    );
  END LOOP;

  v_payload := jsonb_build_object(
    'lista',to_jsonb(v_lista),
    'detalles',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id)
      FROM public.lista_precios_venta_detalles d WHERE d.lista_id=v_lista.id),
    'idempotent',false);
  INSERT INTO public.operaciones_comerciales_469(
    tenant_id,idempotency_key,operacion,fingerprint,result_id,resultado,actor_id
  ) VALUES (p_tenant_id,v_key,'REGISTRAR_LISTA_PRECIOS',v_fingerprint,v_lista.id,v_payload,p_actor_id);
  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_regla_comision_venta_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_regla jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key,''));
  v_fingerprint text;
  v_existing public.operaciones_comerciales_469;
  v_regla public.reglas_comisiones_venta;
  v_codigo text := upper(btrim(coalesce(p_regla->>'codigo','')));
  v_vendedor uuid := nullif(p_regla->>'vendedor_id','')::uuid;
  v_producto uuid := nullif(p_regla->>'producto_id','')::uuid;
  v_marca text := nullif(btrim(coalesce(p_regla->>'marca','')),'');
  v_result jsonb;
BEGIN
  IF NOT app.actor_comercial_valido_469(p_tenant_id,p_actor_id)
     OR length(v_key) NOT BETWEEN 8 AND 255 OR jsonb_typeof(p_regla) <> 'object'
     OR v_codigo !~ '^[A-Z0-9][A-Z0-9._-]{1,39}$'
     OR length(btrim(coalesce(p_regla->>'nombre',''))) NOT BETWEEN 2 AND 160
     OR coalesce((p_regla->>'porcentaje')::numeric,-1) NOT BETWEEN 0 AND 100
     OR nullif(p_regla->>'vigencia_desde','')::date IS NULL THEN
    RAISE EXCEPTION 'COMMERCIAL_COMMISSION_RULE_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  v_fingerprint := app.commercial_fingerprint_469(
    jsonb_build_object('regla',p_regla,'actor',p_actor_id));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':commercial-op:' || v_key,469));
  SELECT * INTO v_existing FROM public.operaciones_comerciales_469
  WHERE tenant_id=p_tenant_id AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.operacion <> 'REGISTRAR_REGLA_COMISION'
       OR v_existing.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'COMMERCIAL_IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent',true);
  END IF;
  IF v_vendedor IS NOT NULL AND NOT app.actor_comercial_valido_469(p_tenant_id,v_vendedor) THEN
    RAISE EXCEPTION 'COMMERCIAL_COMMISSION_SELLER_INVALID' USING ERRCODE='P0002';
  END IF;
  IF v_producto IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.productos p WHERE p.id=v_producto AND p.tenant_id=p_tenant_id AND p.activo
  ) THEN RAISE EXCEPTION 'COMMERCIAL_COMMISSION_PRODUCT_INVALID' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.reglas_comisiones_venta(
    tenant_id,codigo,nombre,vendedor_id,producto_id,marca,porcentaje,prioridad,
    vigencia_desde,vigencia_hasta,activo,created_by,metadata
  ) VALUES (
    p_tenant_id,v_codigo,btrim(p_regla->>'nombre'),v_vendedor,v_producto,v_marca,
    round((p_regla->>'porcentaje')::numeric,6),coalesce((p_regla->>'prioridad')::integer,0),
    (p_regla->>'vigencia_desde')::date,nullif(p_regla->>'vigencia_hasta','')::date,
    true,p_actor_id,jsonb_build_object('schema_version',469,'idempotency_key',v_key)
  ) RETURNING * INTO v_regla;
  v_result := jsonb_build_object('regla',to_jsonb(v_regla),'idempotent',false);
  INSERT INTO public.operaciones_comerciales_469(
    tenant_id,idempotency_key,operacion,fingerprint,result_id,resultado,actor_id
  ) VALUES (p_tenant_id,v_key,'REGISTRAR_REGLA_COMISION',v_fingerprint,v_regla.id,v_result,p_actor_id);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_regla_comercial_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_tipo text,
  p_id uuid,
  p_activo boolean,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key,''));
  v_tipo text := upper(btrim(coalesce(p_tipo,'')));
  v_fingerprint text;
  v_existing public.operaciones_comerciales_469;
  v_result jsonb;
BEGIN
  IF NOT app.actor_comercial_valido_469(p_tenant_id,p_actor_id)
     OR v_tipo NOT IN ('LISTA_PRECIOS','REGLA_COMISION')
     OR p_id IS NULL OR p_activo IS NULL OR length(v_key) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION 'COMMERCIAL_STATUS_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  v_fingerprint := app.commercial_fingerprint_469(jsonb_build_object(
    'tipo',v_tipo,'id',p_id,'activo',p_activo,'actor',p_actor_id));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':commercial-op:' || v_key,469));
  SELECT * INTO v_existing FROM public.operaciones_comerciales_469
  WHERE tenant_id=p_tenant_id AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.operacion <> 'CAMBIAR_ESTADO_REGLA' OR v_existing.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'COMMERCIAL_IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent',true);
  END IF;
  IF v_tipo='LISTA_PRECIOS' THEN
    UPDATE public.listas_precios_venta SET activo=p_activo,updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'estado_cambiado_por',p_actor_id,'estado_key',v_key)
    WHERE id=p_id AND tenant_id=p_tenant_id RETURNING to_jsonb(listas_precios_venta.*) INTO v_result;
  ELSE
    UPDATE public.reglas_comisiones_venta SET activo=p_activo,updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'estado_cambiado_por',p_actor_id,'estado_key',v_key)
    WHERE id=p_id AND tenant_id=p_tenant_id RETURNING to_jsonb(reglas_comisiones_venta.*) INTO v_result;
  END IF;
  IF v_result IS NULL THEN RAISE EXCEPTION 'COMMERCIAL_RULE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_result := jsonb_build_object('tipo',v_tipo,'registro',v_result,'idempotent',false);
  INSERT INTO public.operaciones_comerciales_469(
    tenant_id,idempotency_key,operacion,fingerprint,result_id,resultado,actor_id
  ) VALUES (p_tenant_id,v_key,'CAMBIAR_ESTADO_REGLA',v_fingerprint,p_id,v_result,p_actor_id);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_ventas_consolidables_469(
  p_tenant_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
  WITH candidatos AS (
    SELECT 'POS'::text AS source_type, v.id AS source_id,
      coalesce(v.fecha,v.created_at) AS fecha,
      coalesce(v.numero_ticket,v.numero_venta::text,v.id::text) AS numero,
      v.cliente_id, v.cliente_nombre, v.usuario_id AS vendedor_id,
      upper(coalesce(v.moneda,'PEN')) AS moneda,
      round(coalesce(v.subtotal,0),2) AS subtotal,
      round(coalesce(v.impuestos,0),2) AS impuestos,
      round(coalesce(v.total,0),2) AS total
    FROM public.ventas_pos v
    WHERE v.tenant_id=p_tenant_id
      AND upper(coalesce(v.estado::text,'')) IN ('PAGADA','CONFIRMADA','COMPLETADA')
      AND NOT EXISTS (SELECT 1 FROM public.ventas_consolidado_detalles cd
        WHERE cd.tenant_id=p_tenant_id AND cd.source_type='POS' AND cd.source_id=v.id)
    UNION ALL
    SELECT 'DOCUMENTO',d.id,d.fecha_emision,
      concat_ws('-',d.serie,d.numero),d.cliente_id,
      coalesce(d.receptor_razon_social,d.receptor_nombre),
      coalesce(p.created_by,d.created_by),upper(coalesce(d.moneda,'PEN')),
      round(greatest(coalesce(d.subtotal,0)-coalesce(d.descuentos,0),0),2),
      round(coalesce(d.impuesto_igv,0)+coalesce(d.impuesto_isc,0)+coalesce(d.otros_impuestos,0),2),
      round(coalesce(d.total,0),2)
    FROM public.documentos d
    LEFT JOIN public.pedidos_venta p ON p.id=d.pedido_id AND p.tenant_id=d.tenant_id
    WHERE d.tenant_id=p_tenant_id AND upper(coalesce(d.tipo_documento,'')) IN ('FACTURA','BOLETA')
      AND upper(coalesce(d.estado::text,'')) IN ('EMITIDO','ENVIADO_SUNAT','ACEPTADO')
      AND nullif(d.metadata->>'venta_pos_id','') IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.ventas_consolidado_detalles cd
        WHERE cd.tenant_id=p_tenant_id AND cd.source_type='DOCUMENTO' AND cd.source_id=d.id)
  )
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.fecha DESC,c.source_type,c.source_id),'[]'::jsonb)
  FROM (SELECT * FROM candidatos ORDER BY fecha DESC,source_type,source_id
    LIMIT greatest(1,least(coalesce(p_limit,100),500))) c;
$$;

CREATE OR REPLACE FUNCTION public.crear_consolidado_ventas_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_fuentes jsonb,
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key,''));
  v_fuentes jsonb;
  v_fingerprint text;
  v_existing public.ventas_consolidados;
  v_row record;
  v_pos public.ventas_pos;
  v_doc public.documentos;
  v_pedido public.pedidos_venta;
  v_lineas jsonb := '[]'::jsonb;
  v_items jsonb;
  v_moneda text;
  v_subtotal numeric(14,2) := 0;
  v_impuestos numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_numero text;
  v_next integer;
  v_hoy date := app.hoy_tenant(p_tenant_id);
  v_consolidado public.ventas_consolidados;
BEGIN
  IF NOT app.actor_comercial_valido_469(p_tenant_id,p_actor_id)
     OR length(v_key) NOT BETWEEN 8 AND 255
     OR jsonb_typeof(p_fuentes) <> 'array'
     OR jsonb_array_length(p_fuentes) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'COMMERCIAL_BATCH_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_fuentes) f
    WHERE upper(coalesce(f->>'tipo','')) NOT IN ('POS','DOCUMENTO')
      OR nullif(f->>'id','')::uuid IS NULL
  ) THEN RAISE EXCEPTION 'COMMERCIAL_BATCH_SOURCE_INVALID' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(jsonb_build_object('tipo',tipo,'id',id) ORDER BY tipo,id)
  INTO v_fuentes FROM (
    SELECT DISTINCT upper(f->>'tipo') AS tipo,(f->>'id')::uuid AS id
    FROM jsonb_array_elements(p_fuentes) f
  ) normalized;
  IF jsonb_array_length(v_fuentes) <> jsonb_array_length(p_fuentes) THEN
    RAISE EXCEPTION 'COMMERCIAL_BATCH_DUPLICATE_SOURCE' USING ERRCODE='22023';
  END IF;
  v_fingerprint := app.commercial_fingerprint_469(
    jsonb_build_object('fuentes',v_fuentes,'notas',nullif(btrim(coalesce(p_notas,'')),'')));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':commercial-batch:' || v_key,469));
  SELECT * INTO v_existing FROM public.ventas_consolidados
  WHERE tenant_id=p_tenant_id AND idempotency_key=v_key FOR SHARE;
  IF FOUND THEN
    IF v_existing.source_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'COMMERCIAL_BATCH_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('consolidado',to_jsonb(v_existing),
      'detalles',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.orden),'[]'::jsonb)
        FROM public.ventas_consolidado_detalles d WHERE d.consolidado_id=v_existing.id),
      'idempotent',true,'accounting_events_created',0);
  END IF;

  FOR v_row IN SELECT value AS source,ordinality::integer AS orden
    FROM jsonb_array_elements(v_fuentes) WITH ORDINALITY
  LOOP
    IF EXISTS (SELECT 1 FROM public.ventas_consolidado_detalles d
      WHERE d.tenant_id=p_tenant_id AND d.source_type=v_row.source->>'tipo'
        AND d.source_id=(v_row.source->>'id')::uuid) THEN
      RAISE EXCEPTION 'COMMERCIAL_SALE_ALREADY_CONSOLIDATED: %',v_row.source USING ERRCODE='23505';
    END IF;
    IF v_row.source->>'tipo'='POS' THEN
      SELECT * INTO v_pos FROM public.ventas_pos v
      WHERE v.id=(v_row.source->>'id')::uuid AND v.tenant_id=p_tenant_id FOR SHARE;
      IF NOT FOUND OR upper(coalesce(v_pos.estado::text,'')) NOT IN ('PAGADA','CONFIRMADA','COMPLETADA') THEN
        RAISE EXCEPTION 'COMMERCIAL_BATCH_POS_NOT_VALID: %',v_row.source->>'id' USING ERRCODE='23514';
      END IF;
      SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.item_index,d.id),'[]'::jsonb)
      INTO v_items FROM public.detalle_ventas_pos d
      WHERE d.tenant_id=p_tenant_id AND coalesce(d.venta_pos_id,d.venta_id)=v_pos.id;
      IF jsonb_array_length(v_items)=0 THEN RAISE EXCEPTION 'COMMERCIAL_BATCH_POS_WITHOUT_LINES'; END IF;
      IF v_moneda IS NULL THEN v_moneda:=upper(coalesce(v_pos.moneda,'PEN'));
      ELSIF v_moneda<>upper(coalesce(v_pos.moneda,'PEN')) THEN RAISE EXCEPTION 'COMMERCIAL_BATCH_MIXED_CURRENCIES'; END IF;
      v_lineas:=v_lineas||jsonb_build_array(jsonb_build_object(
        'orden',v_row.orden,'source_type','POS','source_id',v_pos.id,
        'fecha',coalesce(v_pos.fecha,v_pos.created_at),'documento_numero',coalesce(v_pos.numero_ticket,v_pos.id::text),
        'cliente_id',v_pos.cliente_id,'cliente_nombre',v_pos.cliente_nombre,'vendedor_id',v_pos.usuario_id,
        'moneda',upper(coalesce(v_pos.moneda,'PEN')),'subtotal',round(coalesce(v_pos.subtotal,0),2),
        'impuestos',round(coalesce(v_pos.impuestos,0),2),'total',round(coalesce(v_pos.total,0),2),
        'snapshot',jsonb_build_object('cabecera',to_jsonb(v_pos),'items',v_items,'snapshot_version',469)));
      v_subtotal:=v_subtotal+round(coalesce(v_pos.subtotal,0),2);
      v_impuestos:=v_impuestos+round(coalesce(v_pos.impuestos,0),2);
      v_total:=v_total+round(coalesce(v_pos.total,0),2);
    ELSE
      SELECT * INTO v_doc FROM public.documentos d
      WHERE d.id=(v_row.source->>'id')::uuid AND d.tenant_id=p_tenant_id FOR SHARE;
      IF NOT FOUND OR upper(coalesce(v_doc.tipo_documento,'')) NOT IN ('FACTURA','BOLETA')
         OR upper(coalesce(v_doc.estado::text,'')) NOT IN ('EMITIDO','ENVIADO_SUNAT','ACEPTADO')
         OR nullif(v_doc.metadata->>'venta_pos_id','') IS NOT NULL THEN
        RAISE EXCEPTION 'COMMERCIAL_BATCH_DOCUMENT_NOT_VALID: %',v_row.source->>'id' USING ERRCODE='23514';
      END IF;
      SELECT * INTO v_pedido FROM public.pedidos_venta p
      WHERE p.id=v_doc.pedido_id AND p.tenant_id=p_tenant_id;
      SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.orden,d.id),'[]'::jsonb)
      INTO v_items FROM public.documento_detalles d
      WHERE d.tenant_id=p_tenant_id AND d.documento_id=v_doc.id;
      IF jsonb_array_length(v_items)=0 THEN RAISE EXCEPTION 'COMMERCIAL_BATCH_DOCUMENT_WITHOUT_LINES'; END IF;
      IF v_moneda IS NULL THEN v_moneda:=upper(coalesce(v_doc.moneda,'PEN'));
      ELSIF v_moneda<>upper(coalesce(v_doc.moneda,'PEN')) THEN RAISE EXCEPTION 'COMMERCIAL_BATCH_MIXED_CURRENCIES'; END IF;
      v_lineas:=v_lineas||jsonb_build_array(jsonb_build_object(
        'orden',v_row.orden,'source_type','DOCUMENTO','source_id',v_doc.id,
        'fecha',v_doc.fecha_emision,'documento_numero',concat_ws('-',v_doc.serie,v_doc.numero),
        'cliente_id',v_doc.cliente_id,'cliente_nombre',coalesce(v_doc.receptor_razon_social,v_doc.receptor_nombre),
        'vendedor_id',coalesce(v_pedido.created_by,v_doc.created_by),'moneda',upper(coalesce(v_doc.moneda,'PEN')),
        'subtotal',round(greatest(coalesce(v_doc.subtotal,0)-coalesce(v_doc.descuentos,0),0),2),
        'impuestos',round(coalesce(v_doc.impuesto_igv,0)+coalesce(v_doc.impuesto_isc,0)+coalesce(v_doc.otros_impuestos,0),2),
        'total',round(coalesce(v_doc.total,0),2),
        'snapshot',jsonb_build_object('cabecera',to_jsonb(v_doc),'items',v_items,'snapshot_version',469)));
      v_subtotal:=v_subtotal+round(greatest(coalesce(v_doc.subtotal,0)-coalesce(v_doc.descuentos,0),0),2);
      v_impuestos:=v_impuestos+round(coalesce(v_doc.impuesto_igv,0)+coalesce(v_doc.impuesto_isc,0)+coalesce(v_doc.otros_impuestos,0),2);
      v_total:=v_total+round(coalesce(v_doc.total,0),2);
    END IF;
  END LOOP;
  v_subtotal:=round(v_subtotal,2); v_impuestos:=round(v_impuestos,2); v_total:=round(v_total,2);
  IF abs(v_total-round(v_subtotal+v_impuestos,2))>0.01 THEN
    RAISE EXCEPTION 'COMMERCIAL_BATCH_TOTALS_DONT_BALANCE: subtotal=% impuestos=% total=%',v_subtotal,v_impuestos,v_total;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':commercial-batch-number:' || v_hoy::text,469));
  SELECT coalesce(max(substring(numero FROM '^VC-[0-9]{4}-([0-9]+)$')::integer),0)+1 INTO v_next
  FROM public.ventas_consolidados WHERE tenant_id=p_tenant_id AND numero LIKE 'VC-'||to_char(v_hoy,'YYYY')||'-%';
  v_numero:='VC-'||to_char(v_hoy,'YYYY')||'-'||lpad(v_next::text,6,'0');
  INSERT INTO public.ventas_consolidados(
    tenant_id,numero,fecha,moneda,cantidad_fuentes,subtotal,impuestos,total,notas,
    source_fingerprint,idempotency_key,created_by,snapshot
  ) VALUES (
    p_tenant_id,v_numero,v_hoy,v_moneda,jsonb_array_length(v_fuentes),v_subtotal,v_impuestos,v_total,
    nullif(btrim(coalesce(p_notas,'')),''),v_fingerprint,v_key,p_actor_id,
    jsonb_build_object('fuentes',v_fuentes,'lineas',v_lineas,'snapshot_version',469,
      'accounting_events_created',0)
  ) RETURNING * INTO v_consolidado;
  INSERT INTO public.ventas_consolidado_detalles(
    tenant_id,consolidado_id,orden,source_type,source_id,fecha,documento_numero,
    cliente_id,cliente_nombre,vendedor_id,moneda,subtotal,impuestos,total,snapshot
  ) SELECT p_tenant_id,v_consolidado.id,(x->>'orden')::integer,x->>'source_type',(x->>'source_id')::uuid,
    (x->>'fecha')::timestamptz,x->>'documento_numero',nullif(x->>'cliente_id','')::uuid,x->>'cliente_nombre',
    nullif(x->>'vendedor_id','')::uuid,x->>'moneda',(x->>'subtotal')::numeric,(x->>'impuestos')::numeric,
    (x->>'total')::numeric,x->'snapshot' FROM jsonb_array_elements(v_lineas) x;
  RETURN jsonb_build_object('consolidado',to_jsonb(v_consolidado),
    'detalles',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.orden) FROM public.ventas_consolidado_detalles d
      WHERE d.consolidado_id=v_consolidado.id),
    'idempotent',false,'accounting_events_created',0);
END;
$$;

-- Permisos comerciales para tenants existentes y futuros. El trigger sobre
-- roles cubre la primera cuenta de una instalación vacía sin reescribir el
-- seeder canónico histórico de la 379.
CREATE OR REPLACE FUNCTION app.seed_rbac_comercial_469(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  INSERT INTO public.permisos(tenant_id,modulo,recurso,accion,codigo,descripcion,activo)
  SELECT p_tenant_id,'ventas',v.recurso,v.accion,'ventas.'||v.recurso||'.'||v.accion,v.descripcion,true
  FROM (VALUES
    ('precios','ver','Consultar listas de precios y resolver precios vigentes'),
    ('precios','gestionar','Registrar y activar/desactivar listas de precios'),
    ('comisiones','ver','Consultar reglas y movimientos de comisiones'),
    ('comisiones','gestionar','Registrar y activar/desactivar reglas de comisión'),
    ('consolidados','ver','Consultar lotes consolidados de ventas'),
    ('consolidados','crear','Crear lotes inmutables de ventas')
  ) v(recurso,accion,descripcion)
  WHERE NOT EXISTS (SELECT 1 FROM public.permisos p WHERE p.tenant_id=p_tenant_id
    AND lower(coalesce(p.codigo,p.modulo||'.'||p.recurso||'.'||p.accion))='ventas.'||v.recurso||'.'||v.accion);

  INSERT INTO public.rol_permisos(role_id,permiso_id,concedido)
  SELECT r.id,p.id,true FROM public.roles r JOIN public.permisos p ON p.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant_id AND r.activo AND p.activo
    AND lower(p.codigo) LIKE 'ventas.%'
    AND (
      upper(r.nombre) IN ('ADMIN','GERENCIA')
      OR (upper(r.nombre)='VENDEDOR' AND lower(p.codigo) IN (
        'ventas.precios.ver','ventas.comisiones.ver','ventas.consolidados.ver','ventas.consolidados.crear'))
      OR (upper(r.nombre)='CAJERO' AND lower(p.codigo)='ventas.precios.ver')
      OR (upper(r.nombre)='AUDITOR' AND lower(p.codigo) IN (
        'ventas.comisiones.ver','ventas.consolidados.ver'))
    )
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp
      WHERE rp.role_id=r.id AND rp.permiso_id=p.id);
END;
$$;

CREATE OR REPLACE FUNCTION app.seed_rbac_comercial_role_trigger_469()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  PERFORM app.seed_rbac_comercial_469(NEW.tenant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_rbac_comercial_role_469 ON public.roles;
CREATE TRIGGER trg_seed_rbac_comercial_role_469
AFTER INSERT OR UPDATE OF nombre,activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_rbac_comercial_role_trigger_469();

DO $seed_existing$
DECLARE v_tenant uuid;
BEGIN
  FOR v_tenant IN SELECT DISTINCT tenant_id FROM public.roles WHERE tenant_id IS NOT NULL
  LOOP PERFORM app.seed_rbac_comercial_469(v_tenant); END LOOP;
END;
$seed_existing$;

REVOKE ALL ON FUNCTION app.commercial_fingerprint_469(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.actor_comercial_valido_469(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.resolver_precio_venta_469(uuid,uuid,uuid,uuid,numeric,date,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.resolver_detalle_precios_venta_469(uuid,uuid,uuid,jsonb,date,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.totales_detalle_comercial_469(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.es_precio_pos_comercial_valido_469(uuid,uuid,uuid,text,jsonb,date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.pos_intencion_comercial_469(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.pos_reintento_comercial_469(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.devengar_comision_linea_469(uuid,text,uuid,uuid,uuid,uuid,numeric,text,date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.revertir_comision_parcial_469(uuid,uuid,uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.revertir_comisiones_fuente_469(uuid,text,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.reintegrar_comisiones_por_trigger_469(uuid,text,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.seed_rbac_comercial_469(uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.crear_cotizacion_comercial_tx(uuid,uuid,uuid,date,text,text,text,numeric,numeric,numeric,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.actualizar_cotizacion_comercial_tx(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crear_pedido_comercial_tx(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.actualizar_pedido_comercial_tx(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.convertir_cotizacion_comercial_a_pedido_tx(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resolver_precios_venta_tx(uuid,uuid,uuid,jsonb,date,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pos_registrar_venta_comercial_tx(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reintentar_venta_pos_comercial_tx(uuid,uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.registrar_lista_precios_venta_tx(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.registrar_regla_comision_venta_tx(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cambiar_estado_regla_comercial_tx(uuid,uuid,text,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.listar_ventas_consolidables_469(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.crear_cotizacion_comercial_tx(uuid,uuid,uuid,date,text,text,text,numeric,numeric,numeric,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_cotizacion_comercial_tx(uuid,uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_pedido_comercial_tx(jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_pedido_comercial_tx(uuid,uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.convertir_cotizacion_comercial_a_pedido_tx(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_precios_venta_tx(uuid,uuid,uuid,jsonb,date,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_registrar_venta_comercial_tx(uuid,uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reintentar_venta_pos_comercial_tx(uuid,uuid,text,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_lista_precios_venta_tx(uuid,uuid,text,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_regla_comision_venta_tx(uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_regla_comercial_tx(uuid,uuid,text,uuid,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.listar_ventas_consolidables_469(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text) TO service_role;

COMMENT ON FUNCTION public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text) IS
  'Congela entre 1 y 100 ventas válidas del mismo tenant/moneda en un reporte inmutable. No publica outbox ni asientos.';
COMMENT ON TABLE public.comisiones_venta_movimientos IS
  'Ledger append-only de devengos y reversas. Las NC/anulaciones agregan movimientos negativos; nunca reescriben el devengo.';

COMMIT;
