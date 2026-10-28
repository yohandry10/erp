-- ============================================================================
-- 580__fox_supply_migration.sql
-- F08 ALKHOFAR: migración desde FOX por sustitución con fecha de corte.
--
-- Se migran saldos abiertos, no historia: de cada contrato la cantidad aún no
-- ejecutada, de cada OC lo pendiente de entregar y del cronograma sólo las
-- entregas pendientes. Todo entra por los writers vigentes (570 y el de
-- inventario), así que valen las mismas validaciones, y nada genera pedidos,
-- despachos, comprobantes ni asientos. Cada registro FOX queda enlazado a su
-- par del ERP con la huella de su contenido: repetir el ensayo con los mismos
-- archivos no duplica, y un dato que cambió en el origen se rechaza.
-- El stock inicial acepta lote y vencimiento y los exige si el producto
-- controla lotes.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';

-- Tipos de lote de migración nuevos; se ubica la restricción por su definición.
DO $runtype$ DECLARE v_name text; BEGIN
  SELECT conname INTO v_name FROM pg_constraint
  WHERE conrelid = 'public.migration_runs'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%run_type%';
  IF v_name IS NULL THEN RAISE EXCEPTION 'MIGRATION_580_RUN_TYPE_CHECK_NOT_FOUND'; END IF;
  EXECUTE format('ALTER TABLE public.migration_runs DROP CONSTRAINT %I', v_name);
END $runtype$;
ALTER TABLE public.migration_runs ADD CONSTRAINT migration_runs_run_type_check CHECK (run_type IN (
  'clientes', 'proveedores', 'productos', 'plan_cuentas', 'cuentas_bancarias', 'cxc_abiertas', 'cxp_abiertas',
  'balance_apertura', 'stock_inicial', 'comprobantes_historico',
  'contratos_suministro', 'oc_suministro', 'cronograma_suministro'));

CREATE TABLE public.migracion_correspondencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  origen text NOT NULL CHECK (origen IN ('FOX')),
  entidad text NOT NULL CHECK (entidad IN ('CONTRATO', 'CONTRATO_LINEA', 'OC', 'OC_LINEA', 'ENTREGA')),
  id_origen text NOT NULL CHECK (length(btrim(id_origen)) BETWEEN 1 AND 250),
  erp_id uuid NOT NULL,
  huella text NOT NULL CHECK (huella ~ '^[0-9a-f]{64}$'),
  datos_origen jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_id uuid REFERENCES public.migration_runs(id),
  created_by uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, origen, entidad, id_origen)
);
CREATE INDEX migracion_correspondencias_erp_580 ON public.migracion_correspondencias (tenant_id, entidad, erp_id);
ALTER TABLE public.migracion_correspondencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migracion_correspondencias FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.migracion_correspondencias FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY migracion_correspondencias_private_580 ON public.migracion_correspondencias USING (false) WITH CHECK (false);

CREATE FUNCTION app.correspondencia_inmutable_580() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'MIGRATION_FOX_CORRESPONDENCE_IMMUTABLE' USING ERRCODE = '23514';
END $fn$;
CREATE TRIGGER migracion_correspondencias_inmutable_580 BEFORE UPDATE OR DELETE ON public.migracion_correspondencias
FOR EACH ROW EXECUTE FUNCTION app.correspondencia_inmutable_580();

CREATE FUNCTION app.fox_par_580(p_tenant_id uuid, p_entidad text, p_id_origen text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
  SELECT erp_id FROM public.migracion_correspondencias
  WHERE tenant_id = p_tenant_id AND origen = 'FOX' AND entidad = p_entidad AND id_origen = btrim(p_id_origen)
$fn$;

-- Cantidad abierta de una línea: original menos ejecutado; ambos en el origen.
CREATE FUNCTION app.fox_saldo_580(p_linea jsonb, p_original text, p_ejecutado text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE v_original numeric; v_ejecutado numeric;
BEGIN
  BEGIN
    v_original := (p_linea->>p_original)::numeric;
    v_ejecutado := coalesce(nullif(p_linea->>p_ejecutado, '')::numeric, 0);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'MIGRATION_FOX_QUANTITY_INVALID' USING ERRCODE = '22023';
  END;
  IF v_original IS NULL OR v_original <= 0 OR v_ejecutado < 0 OR v_ejecutado > v_original
     OR v_original <> round(v_original, 4) OR v_ejecutado <> round(v_ejecutado, 4) THEN
    RAISE EXCEPTION 'MIGRATION_FOX_QUANTITY_INVALID: original=% ejecutado=%', p_linea->>p_original, p_linea->>p_ejecutado
      USING ERRCODE = '22023';
  END IF;
  RETURN v_original - v_ejecutado;
END $fn$;

CREATE FUNCTION public.importar_suministro_fox_580(
  p_tenant_id uuid, p_actor_id uuid, p_run_id uuid, p_entidad text, p_id_origen text, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_id text := btrim(coalesce(p_id_origen, ''));
  v_huella text; v_corr public.migracion_correspondencias; v_res jsonb; v_erp uuid; v_cliente uuid; v_resp uuid;
  v_linea jsonb; v_lineas jsonb := '[]'::jsonb; v_abiertas jsonb := '[]'::jsonb; v_cerradas integer := 0;
  v_saldo numeric; v_padre uuid; v_par uuid; v_n integer; v_orden integer := 0; v_cl uuid;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, p_run_id);
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.suministro.import');
  IF p_entidad IS NULL OR p_entidad NOT IN ('CONTRATO', 'OC', 'ENTREGA') OR length(v_id) NOT BETWEEN 1 AND 120
     OR v_id ~ '#' OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'MIGRATION_FOX_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_huella := app.migration_fingerprint_473(p_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':fox:' || p_entidad || ':' || v_id, 580));
  SELECT * INTO v_corr FROM public.migracion_correspondencias
  WHERE tenant_id = p_tenant_id AND origen = 'FOX' AND entidad = p_entidad AND id_origen = v_id;
  IF FOUND THEN
    IF v_corr.huella <> v_huella THEN
      RAISE EXCEPTION 'MIGRATION_FOX_SOURCE_CHANGED: % %', p_entidad, v_id USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', v_corr.erp_id, 'action', 'IDEMPOTENT', 'idempotent', true);
  END IF;

  IF p_entidad = 'CONTRATO' THEN
    -- El cliente llega antes con el importador de clientes (external_id = código FOX).
    SELECT min(c.id::text)::uuid, count(*) INTO v_cliente, v_n FROM public.clientes c
    WHERE c.tenant_id = p_tenant_id AND coalesce(c.activo, true)
      AND btrim(coalesce(p_payload->>'cliente_codigo', '')) IN (c.external_id, c.ruc, c.documento_identidad);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'MIGRATION_FOX_CLIENT_NOT_FOUND: codigo=% coincidencias=%', p_payload->>'cliente_codigo', v_n
        USING ERRCODE = '23503';
    END IF;
    IF nullif(btrim(p_payload->>'responsable_email'), '') IS NULL THEN
      v_resp := p_actor_id;
    ELSE
      SELECT u.id INTO v_resp FROM public.usuarios_sistema u
      WHERE u.tenant_id = p_tenant_id AND lower(u.email) = lower(btrim(p_payload->>'responsable_email'))
        AND coalesce(u.activo, false) AND lower(u.estado::text) = 'activo';
      IF v_resp IS NULL THEN
        RAISE EXCEPTION 'MIGRATION_FOX_RESPONSIBLE_NOT_FOUND: %', p_payload->>'responsable_email' USING ERRCODE = '23503';
      END IF;
    END IF;
    IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lineas') = 0 THEN
      RAISE EXCEPTION 'MIGRATION_FOX_LINES_REQUIRED' USING ERRCODE = '22023';
    END IF;
    FOR v_linea IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
      IF length(btrim(coalesce(v_linea->>'id_origen', ''))) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'MIGRATION_FOX_INPUT_INVALID' USING ERRCODE = '22023';
      END IF;
      v_saldo := app.fox_saldo_580(v_linea, 'cantidad_original', 'cantidad_ejecutada');
      -- Una línea ya ejecutada por completo es historia: no se migra.
      IF v_saldo = 0 THEN v_cerradas := v_cerradas + 1; CONTINUE; END IF;
      SELECT min(p.id::text)::uuid, count(*) INTO v_par, v_n FROM public.productos p
      WHERE p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
        AND (upper(p.codigo) = upper(btrim(coalesce(v_linea->>'producto_codigo', '')))
          OR p.external_id = btrim(coalesce(v_linea->>'producto_codigo', '')));
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'MIGRATION_FOX_PRODUCT_NOT_FOUND: %', v_linea->>'producto_codigo' USING ERRCODE = '23503';
      END IF;
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('producto_id', v_par, 'cantidad', v_saldo,
        'precio_unitario', v_linea->'precio_unitario'));
      v_abiertas := v_abiertas || jsonb_build_array(v_linea);
    END LOOP;
    IF jsonb_array_length(v_lineas) = 0 THEN
      RAISE EXCEPTION 'MIGRATION_FOX_NOTHING_OPEN: contrato %', v_id USING ERRCODE = '22023';
    END IF;
    v_res := public.operar_suministro_570(p_tenant_id, p_actor_id, 'CREAR_CONTRATO', NULL, jsonb_build_object(
      'cliente_id', v_cliente, 'numero', p_payload->>'numero', 'asunto', p_payload->>'asunto', 'moneda', p_payload->>'moneda',
      'vigencia_desde', p_payload->>'vigencia_desde', 'vigencia_hasta', p_payload->>'vigencia_hasta', 'responsable_id', v_resp,
      'observaciones', concat_ws(' ', 'Migrado de FOX', v_id, nullif(btrim(p_payload->>'observaciones'), '')),
      'lineas', v_lineas), 'fox:contrato:' || v_id);
    v_erp := (v_res->>'id')::uuid;
    IF upper(coalesce(p_payload->>'estado', 'VIGENTE')) = 'VIGENTE' THEN
      PERFORM public.operar_suministro_570(p_tenant_id, p_actor_id, 'ACTIVAR', v_erp, '{"version":1}', 'fox:activar:' || v_id);
    END IF;
    -- Las líneas abiertas se insertaron en el orden recibido.
    FOR v_linea IN SELECT value FROM jsonb_array_elements(v_abiertas) LOOP
      v_orden := v_orden + 1;
      INSERT INTO public.migracion_correspondencias (tenant_id, origen, entidad, id_origen, erp_id, huella, datos_origen, run_id, created_by)
      SELECT p_tenant_id, 'FOX', 'CONTRATO_LINEA', v_id || '#' || btrim(v_linea->>'id_origen'), cl.id,
        app.migration_fingerprint_473(v_linea), v_linea, p_run_id, p_actor_id
      FROM public.suministro_contrato_lineas cl WHERE cl.tenant_id = p_tenant_id AND cl.contrato_id = v_erp AND cl.orden = v_orden;
    END LOOP;
    v_res := jsonb_build_object('lineas', jsonb_array_length(v_abiertas), 'lineas_cerradas', v_cerradas);
  ELSIF p_entidad = 'OC' THEN
    v_padre := app.fox_par_580(p_tenant_id, 'CONTRATO', p_payload->>'contrato_id_origen');
    IF v_padre IS NULL THEN
      RAISE EXCEPTION 'MIGRATION_FOX_PARENT_NOT_FOUND: contrato %', p_payload->>'contrato_id_origen' USING ERRCODE = '23503';
    END IF;
    IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lineas') = 0 THEN
      RAISE EXCEPTION 'MIGRATION_FOX_LINES_REQUIRED' USING ERRCODE = '22023';
    END IF;
    FOR v_linea IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
      IF length(btrim(coalesce(v_linea->>'id_origen', ''))) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'MIGRATION_FOX_INPUT_INVALID' USING ERRCODE = '22023';
      END IF;
      v_saldo := app.fox_saldo_580(v_linea, 'cantidad_original', 'cantidad_entregada');
      IF v_saldo = 0 THEN v_cerradas := v_cerradas + 1; CONTINUE; END IF;
      v_cl := app.fox_par_580(p_tenant_id, 'CONTRATO_LINEA',
        btrim(p_payload->>'contrato_id_origen') || '#' || btrim(coalesce(v_linea->>'contrato_linea_id_origen', '')));
      IF v_cl IS NULL THEN
        RAISE EXCEPTION 'MIGRATION_FOX_PARENT_NOT_FOUND: linea de contrato %', v_linea->>'contrato_linea_id_origen'
          USING ERRCODE = '23503';
      END IF;
      -- Una OC enlaza cada línea del contrato una sola vez; así su línea ERP es inequívoca.
      IF v_lineas @> jsonb_build_array(jsonb_build_object('contrato_linea_id', v_cl)) THEN
        RAISE EXCEPTION 'MIGRATION_FOX_DUPLICATE_LINE: %', v_linea->>'contrato_linea_id_origen' USING ERRCODE = '22023';
      END IF;
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('contrato_linea_id', v_cl, 'cantidad', v_saldo));
      v_abiertas := v_abiertas || jsonb_build_array(v_linea || jsonb_build_object('_erp_contrato_linea', v_cl));
    END LOOP;
    IF jsonb_array_length(v_lineas) = 0 THEN
      RAISE EXCEPTION 'MIGRATION_FOX_NOTHING_OPEN: OC %', v_id USING ERRCODE = '22023';
    END IF;
    v_res := public.operar_suministro_570(p_tenant_id, p_actor_id, 'CREAR_OC', v_padre, jsonb_build_object(
      'numero', p_payload->>'numero', 'fecha_emision', p_payload->>'fecha_emision', 'lineas', v_lineas), 'fox:oc:' || v_id);
    v_erp := (v_res->>'id')::uuid;
    FOR v_linea IN SELECT value FROM jsonb_array_elements(v_abiertas) LOOP
      INSERT INTO public.migracion_correspondencias (tenant_id, origen, entidad, id_origen, erp_id, huella, datos_origen, run_id, created_by)
      SELECT p_tenant_id, 'FOX', 'OC_LINEA', v_id || '#' || btrim(v_linea->>'id_origen'), ol.id,
        app.migration_fingerprint_473(v_linea - '_erp_contrato_linea'), v_linea - '_erp_contrato_linea', p_run_id, p_actor_id
      FROM public.suministro_orden_lineas ol WHERE ol.tenant_id = p_tenant_id AND ol.orden_cliente_id = v_erp
        AND ol.contrato_linea_id = (v_linea->>'_erp_contrato_linea')::uuid;
    END LOOP;
    v_res := jsonb_build_object('lineas', jsonb_array_length(v_abiertas), 'lineas_cerradas', v_cerradas);
  ELSE
    v_par := app.fox_par_580(p_tenant_id, 'OC_LINEA',
      btrim(coalesce(p_payload->>'oc_id_origen', '')) || '#' || btrim(coalesce(p_payload->>'oc_linea_id_origen', '')));
    IF v_par IS NULL THEN
      RAISE EXCEPTION 'MIGRATION_FOX_PARENT_NOT_FOUND: linea de OC %#%', p_payload->>'oc_id_origen', p_payload->>'oc_linea_id_origen'
        USING ERRCODE = '23503';
    END IF;
    v_saldo := app.fox_saldo_580(p_payload, 'cantidad', 'cantidad_entregada');
    IF v_saldo = 0 THEN RAISE EXCEPTION 'MIGRATION_FOX_NOTHING_OPEN: entrega %', v_id USING ERRCODE = '22023'; END IF;
    SELECT contrato_id INTO v_padre FROM public.suministro_orden_lineas WHERE id = v_par;
    v_res := public.operar_suministro_570(p_tenant_id, p_actor_id, 'PROGRAMAR', v_padre, jsonb_build_object(
      'orden_linea_id', v_par, 'cantidad', v_saldo, 'fecha_programada', p_payload->>'fecha_programada',
      'destino', p_payload->>'destino'), 'fox:entrega:' || v_id);
    v_erp := (v_res->>'id')::uuid;
    v_res := '{}'::jsonb;
  END IF;

  INSERT INTO public.migracion_correspondencias (tenant_id, origen, entidad, id_origen, erp_id, huella, datos_origen, run_id, created_by)
  VALUES (p_tenant_id, 'FOX', p_entidad, v_id, v_erp, v_huella, p_payload, p_run_id, p_actor_id);
  RETURN jsonb_build_object('id', v_erp, 'action', 'CREATED', 'idempotent', false) || v_res;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'MIGRATION_FOX_INPUT_INVALID: %', SQLERRM USING ERRCODE = '22023';
END $fn$;

-- Stock inicial con lote y vencimiento. Un producto con control de lote exige
-- lote (y vencimiento si su política lo pide); un lote para un producto sin
-- control se rechaza en vez de perderse.
CREATE OR REPLACE FUNCTION public.importar_stock_inicial_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_run_id uuid,
  p_external_id text,
  p_stock jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_external_id text := NULLIF(btrim(COALESCE(p_external_id, '')), '');
  v_payload jsonb;
  v_fingerprint text;
  v_operation public.migration_row_operations;
  v_existing public.movimientos_inventario;
  v_producto_id uuid;
  v_almacen_id uuid;
  v_sucursal_id uuid;
  v_fecha_corte date;
  v_cantidad numeric;
  v_costo numeric;
  v_movimiento_id uuid;
  v_lote text;
  v_vence date;
  v_pol public.inventario_lote_politicas;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, p_run_id);
  IF v_external_id IS NULL OR jsonb_typeof(COALESCE(p_stock, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;

  v_producto_id := NULLIF(p_stock->>'producto_id', '')::uuid;
  v_almacen_id := NULLIF(p_stock->>'almacen_id', '')::uuid;
  v_sucursal_id := NULLIF(p_stock->>'sucursal_id', '')::uuid;
  v_fecha_corte := NULLIF(p_stock->>'fecha_corte', '')::date;
  v_cantidad := COALESCE((p_stock->>'cantidad')::numeric, 0);
  v_costo := COALESCE((p_stock->>'costo_unitario')::numeric, 0);
  v_lote := NULLIF(upper(btrim(COALESCE(p_stock->>'lote', ''))), '');
  v_vence := NULLIF(p_stock->>'fecha_vencimiento', '')::date;
  IF v_producto_id IS NULL OR v_almacen_id IS NULL OR v_sucursal_id IS NULL
     OR v_fecha_corte IS NULL OR v_cantidad <= 0 OR v_costo < 0
     OR (v_vence IS NOT NULL AND v_lote IS NULL) OR length(v_lote) > 80 THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.productos p
    WHERE p.id = v_producto_id AND p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true) AND NOT COALESCE(p.es_servicio, false)
      AND COALESCE(p.controla_stock, true)
  ) THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_PRODUCT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.almacenes a
    WHERE a.id = v_almacen_id AND a.tenant_id = p_tenant_id AND COALESCE(a.activo, true)
  ) THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_WAREHOUSE_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sucursales s
    WHERE s.id = v_sucursal_id AND s.tenant_id = p_tenant_id
      AND lower(COALESCE(s.estado, 'activo')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_BRANCH_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  SELECT * INTO v_pol FROM public.inventario_lote_politicas
  WHERE tenant_id = p_tenant_id AND producto_id = v_producto_id;
  IF COALESCE(v_pol.controla_lote, false) AND v_lote IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_LOT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(v_pol.controla_lote, false) AND v_lote IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_LOT_NOT_CONTROLLED' USING ERRCODE = '22023';
  END IF;
  IF v_lote IS NOT NULL AND COALESCE(v_pol.requiere_vencimiento, true) AND v_vence IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_STOCK_EXPIRY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'external_id', v_external_id,
    'producto_id', v_producto_id,
    'almacen_id', v_almacen_id,
    'sucursal_id', v_sucursal_id,
    'fecha_corte', v_fecha_corte,
    'cantidad', round(v_cantidad, 6),
    'costo_unitario', round(v_costo, 6),
    'notas', NULLIF(btrim(p_stock->>'notas'), ''),
    'lote', v_lote,
    'fecha_vencimiento', v_vence
  ));
  v_fingerprint := app.migration_fingerprint_473(v_payload);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':migration:stock:' || v_external_id, 0
  ));
  SELECT * INTO v_operation
  FROM public.migration_row_operations o
  WHERE o.tenant_id = p_tenant_id
    AND o.operation_type = 'STOCK_INICIAL'
    AND o.external_id = v_external_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_operation.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MIGRATION_STOCK_IDEMPOTENCY_COLLISION' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_operation.target_id, 'action', 'IDEMPOTENT', 'idempotent', true
    );
  END IF;

  -- Adopción de aperturas previas al registro de operaciones: sólo sin lote,
  -- porque su identidad era producto, almacén y fecha.
  IF v_lote IS NULL THEN
    SELECT mi.* INTO v_existing
    FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = p_tenant_id
      AND mi.producto_id = v_producto_id
      AND mi.almacen_id = v_almacen_id
      AND mi.tipo = 'ENTRADA'
      AND mi.referencia_tipo = 'MIGRACION_APERTURA_' || v_fecha_corte::text
      AND mi.referencia_id = v_producto_id
      AND NOT (COALESCE(mi.metadata, '{}'::jsonb) ? 'lote')
    FOR UPDATE;
    IF FOUND THEN
      IF round(COALESCE(v_existing.cantidad, 0), 6) <> round(v_cantidad, 6)
         OR COALESCE(v_existing.metadata->>'sucursal_id', '') <> v_sucursal_id::text
         OR round(COALESCE((v_existing.metadata->>'costo_unitario')::numeric, 0), 6)
            <> round(v_costo, 6) THEN
        RAISE EXCEPTION 'MIGRATION_STOCK_REPLAY_PAYLOAD_CHANGED' USING ERRCODE = '55000';
      END IF;
      PERFORM app.register_migration_operation_473(
        p_tenant_id, 'STOCK_INICIAL', v_external_id, v_fingerprint,
        'movimientos_inventario', v_existing.id, 'ADOPTED', p_run_id, p_actor_id
      );
      RETURN jsonb_build_object('id', v_existing.id, 'action', 'ADOPTED', 'idempotent', true);
    END IF;
  END IF;

  -- El writer es idempotente por referencia: cada lote necesita la suya, estable
  -- por fila del origen; sin lote se conserva la referencia histórica (producto).
  v_movimiento_id := public.aplicar_movimiento_inventario_tx(
    p_tenant_id,
    v_producto_id,
    v_almacen_id,
    'ENTRADA',
    v_cantidad,
    'MIGRACION_APERTURA_' || v_fecha_corte::text,
    CASE WHEN v_lote IS NULL THEN v_producto_id ELSE md5(p_tenant_id::text || ':' || v_external_id)::uuid END,
    COALESCE(v_payload->>'notas', 'Apertura migrada al ' || v_fecha_corte::text),
    NULL,
    v_lote,
    v_vence,
    p_actor_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'origen', 'migracion_apertura',
      'fecha_corte', v_fecha_corte,
      'costo_unitario', v_costo,
      'valor_total', round(v_cantidad * v_costo, 2),
      'sucursal_id', v_sucursal_id,
      'almacen_id', v_almacen_id,
      'run_id', p_run_id,
      'external_id_producto', p_stock->>'external_id_producto',
      'lote', v_lote,
      'fecha_vencimiento', v_vence
    )),
    false
  );

  PERFORM app.register_migration_operation_473(
    p_tenant_id, 'STOCK_INICIAL', v_external_id, v_fingerprint,
    'movimientos_inventario', v_movimiento_id, 'CREATED', p_run_id, p_actor_id
  );
  RETURN jsonb_build_object('id', v_movimiento_id, 'action', 'CREATED', 'idempotent', false);
END;
$function$;

-- Conciliación del ensayo: lo que quedó en el ERP frente a los totales de
-- control calculados del extracto FOX.
CREATE FUNCTION public.conciliar_migracion_fox_580(p_tenant_id uuid, p_actor_id uuid, p_control jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE v_erp jsonb; v_res jsonb := '[]'::jsonb; k text; o jsonb; e jsonb; v_ok boolean := true; v_fila jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.validar.read');
  IF jsonb_typeof(p_control) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_control) x
       WHERE x NOT IN ('contratos', 'oc', 'entregas', 'stock')) THEN
    RAISE EXCEPTION 'MIGRATION_FOX_CONTROL_INVALID' USING ERRCODE = '22023';
  END IF;
  v_erp := jsonb_build_object(
    'contratos', (SELECT jsonb_build_object('registros', count(DISTINCT c.erp_id),
        'lineas', count(cl.id), 'cantidad', coalesce(sum(cl.cantidad), 0), 'valor', round(coalesce(sum(cl.cantidad * cl.precio_unitario), 0), 2))
      FROM public.migracion_correspondencias c
      LEFT JOIN public.suministro_contrato_lineas cl ON cl.tenant_id = c.tenant_id AND cl.contrato_id = c.erp_id
      WHERE c.tenant_id = p_tenant_id AND c.origen = 'FOX' AND c.entidad = 'CONTRATO'),
    'oc', (SELECT jsonb_build_object('registros', count(DISTINCT c.erp_id),
        'lineas', count(ol.id), 'cantidad', coalesce(sum(ol.cantidad), 0), 'valor', round(coalesce(sum(ol.cantidad * ol.precio_unitario), 0), 2))
      FROM public.migracion_correspondencias c
      LEFT JOIN public.suministro_orden_lineas ol ON ol.tenant_id = c.tenant_id AND ol.orden_cliente_id = c.erp_id
      WHERE c.tenant_id = p_tenant_id AND c.origen = 'FOX' AND c.entidad = 'OC'),
    'entregas', (SELECT jsonb_build_object('registros', count(*), 'cantidad', coalesce(sum(e.cantidad), 0))
      FROM public.migracion_correspondencias c
      JOIN public.suministro_entregas_programadas e ON e.tenant_id = c.tenant_id AND e.id = c.erp_id AND e.estado = 'PROGRAMADA'
      WHERE c.tenant_id = p_tenant_id AND c.origen = 'FOX' AND c.entidad = 'ENTREGA'),
    'stock', (SELECT jsonb_build_object('registros', count(*), 'lotes', count(DISTINCT mi.metadata->>'lote'),
        'cantidad', coalesce(sum(mi.cantidad), 0), 'valor', round(coalesce(sum((mi.metadata->>'valor_total')::numeric), 0), 2))
      FROM public.migration_row_operations o
      JOIN public.movimientos_inventario mi ON mi.tenant_id = o.tenant_id AND mi.id = o.target_id
      WHERE o.tenant_id = p_tenant_id AND o.operation_type = 'STOCK_INICIAL'));
  FOR k IN SELECT key FROM jsonb_each(p_control) ORDER BY key LOOP
    o := p_control->k; e := v_erp->k;
    v_fila := jsonb_build_object('entidad', k, 'origen', o, 'erp', e, 'diferencias', coalesce((
      SELECT jsonb_object_agg(m.key, (e->>m.key)::numeric - (m.value#>>'{}')::numeric)
      FROM jsonb_each(o) m WHERE jsonb_typeof(m.value) = 'number' AND e ? m.key
        AND (e->>m.key)::numeric <> (m.value#>>'{}')::numeric), '{}'::jsonb));
    v_fila := v_fila || jsonb_build_object('cuadra', v_fila->'diferencias' = '{}'::jsonb);
    v_ok := v_ok AND (v_fila->>'cuadra')::boolean;
    v_res := v_res || jsonb_build_array(v_fila);
  END LOOP;
  RETURN jsonb_build_object('cuadra', v_ok, 'entidades', v_res, 'erp', v_erp);
END $fn$;

-- Ensayo completo sin escritura: importa el lote en orden (contratos, OC,
-- cronograma y stock), cada registro en su propio subbloque para informar su
-- error, concilia contra el control y revierte todo al final.
CREATE FUNCTION public.ensayar_migracion_fox_580(p_tenant_id uuid, p_actor_id uuid, p_lote jsonb, p_control jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE
  v_registros jsonb := '[]'::jsonb; v_conc jsonb; v_detalle text; r jsonb; v jsonb; e record; v_prod uuid; v_n integer;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, NULL);
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.suministro.import');
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.validar.read');
  IF jsonb_typeof(p_lote) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_lote) k
       WHERE k NOT IN ('contratos', 'oc', 'entregas', 'stock'))
     OR EXISTS (SELECT 1 FROM jsonb_each(p_lote) x WHERE jsonb_typeof(x.value) <> 'array') THEN
    RAISE EXCEPTION 'MIGRATION_FOX_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  BEGIN
    FOR e IN SELECT * FROM (VALUES (1, 'contratos', 'CONTRATO'), (2, 'oc', 'OC'), (3, 'entregas', 'ENTREGA')) x(orden, clave, entidad)
      ORDER BY orden LOOP
      FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_lote->e.clave, '[]'::jsonb)) LOOP
        BEGIN
          v := public.importar_suministro_fox_580(p_tenant_id, p_actor_id, NULL, e.entidad, r->>'id_origen', r->'payload');
          v_registros := v_registros || jsonb_build_array(jsonb_build_object('entidad', e.entidad, 'id_origen', r->>'id_origen',
            'fila', r->'fila', 'ok', true, 'accion', v->>'action'));
        EXCEPTION WHEN OTHERS THEN
          v_registros := v_registros || jsonb_build_array(jsonb_build_object('entidad', e.entidad, 'id_origen', r->>'id_origen',
            'fila', r->'fila', 'ok', false, 'error', SQLERRM));
        END;
      END LOOP;
    END LOOP;
    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_lote->'stock', '[]'::jsonb)) LOOP
      BEGIN
        SELECT min(p.id::text)::uuid, count(*) INTO v_prod, v_n FROM public.productos p
        WHERE p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
          AND (upper(p.codigo) = upper(btrim(coalesce(r#>>'{stock,producto_codigo}', '')))
            OR p.external_id = btrim(coalesce(r#>>'{stock,producto_codigo}', '')));
        IF v_n <> 1 THEN
          RAISE EXCEPTION 'MIGRATION_FOX_PRODUCT_NOT_FOUND: %', r#>>'{stock,producto_codigo}' USING ERRCODE = '23503';
        END IF;
        v := public.importar_stock_inicial_tx(p_tenant_id, p_actor_id, NULL, r->>'external_id',
          (r->'stock') - 'producto_codigo' || jsonb_build_object('producto_id', v_prod));
        v_registros := v_registros || jsonb_build_array(jsonb_build_object('entidad', 'STOCK', 'id_origen', r->>'external_id',
          'fila', r->'fila', 'ok', true, 'accion', v->>'action'));
      EXCEPTION WHEN OTHERS THEN
        v_registros := v_registros || jsonb_build_array(jsonb_build_object('entidad', 'STOCK', 'id_origen', r->>'external_id',
          'fila', r->'fila', 'ok', false, 'error', SQLERRM));
      END;
    END LOOP;
    v_conc := CASE WHEN p_control IS NULL THEN NULL ELSE public.conciliar_migracion_fox_580(p_tenant_id, p_actor_id, p_control) END;
    RAISE EXCEPTION USING ERRCODE = 'P0580', MESSAGE = 'MIGRATION_FOX_REHEARSAL_ROLLBACK',
      DETAIL = jsonb_build_object('registros', v_registros, 'conciliacion', v_conc)::text;
  EXCEPTION WHEN SQLSTATE 'P0580' THEN
    GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
  END;
  RETURN v_detalle::jsonb || jsonb_build_object('ensayo', true,
    'errores', (SELECT count(*) FROM jsonb_array_elements(v_detalle::jsonb->'registros') x WHERE NOT (x->>'ok')::boolean));
END $fn$;

-- La importación de contratos pertenece a ADMIN, como el resto de migration.*.
CREATE FUNCTION app.seed_migracion_suministro_580(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  INSERT INTO public.permisos (tenant_id, modulo, recurso, accion, codigo, descripcion, activo)
  SELECT p_tenant_id, 'migration', 'suministro', 'import', 'migration.suministro.import',
    'Importar contratos, OC y cronogramas abiertos desde FOX', true
  WHERE NOT EXISTS (SELECT 1 FROM public.permisos p WHERE p.tenant_id = p_tenant_id AND p.codigo = 'migration.suministro.import');
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true FROM public.roles r JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND coalesce(r.activo, true) AND upper(btrim(r.nombre)) = 'ADMIN'
    AND p.codigo = 'migration.suministro.import'
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id = r.id AND rp.permiso_id = p.id);
END $fn$;
CREATE FUNCTION app.seed_migracion_suministro_role_580() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN PERFORM app.seed_migracion_suministro_580(NEW.tenant_id); RETURN NEW; END $fn$;
CREATE TRIGGER seed_migracion_suministro_role_580 AFTER INSERT OR UPDATE OF nombre, activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_migracion_suministro_role_580();
DO $seed$ DECLARE t uuid; BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP PERFORM app.seed_migracion_suministro_580(t); END LOOP;
END $seed$;

REVOKE ALL ON FUNCTION app.correspondencia_inmutable_580(), app.fox_par_580(uuid, text, text), app.fox_saldo_580(jsonb, text, text),
  app.seed_migracion_suministro_580(uuid), app.seed_migracion_suministro_role_580()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.importar_suministro_fox_580(uuid, uuid, uuid, text, text, jsonb),
  public.conciliar_migracion_fox_580(uuid, uuid, jsonb), public.ensayar_migracion_fox_580(uuid, uuid, jsonb, jsonb), public.importar_stock_inicial_tx(uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.importar_suministro_fox_580(uuid, uuid, uuid, text, text, jsonb),
  public.conciliar_migracion_fox_580(uuid, uuid, jsonb), public.ensayar_migracion_fox_580(uuid, uuid, jsonb, jsonb), public.importar_stock_inicial_tx(uuid, uuid, uuid, text, jsonb)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
