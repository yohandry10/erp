-- Reversas enlazadas: el documento original y su valuación no se actualizan.
-- Una intención sólo puede confirmar todos sus movimientos o ninguno.
BEGIN;
SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.inventario_reversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  tipo text NOT NULL CHECK (tipo IN ('TRANSFERENCIA', 'RECEPCION')),
  fuente_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 180),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  motivo text NOT NULL CHECK (motivo = btrim(motivo) AND length(motivo) BETWEEN 5 AND 500),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  movimientos_origen uuid[] NOT NULL,
  fuente_snapshot jsonb NOT NULL CHECK (jsonb_typeof(fuente_snapshot) = 'object'),
  resultado jsonb CHECK (resultado IS NULL OR jsonb_typeof(resultado) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo, fuente_id),
  UNIQUE (tenant_id, tipo, idempotency_key),
  CHECK (array_ndims(movimientos_origen) IS NULL OR array_ndims(movimientos_origen) = 1),
  CHECK (array_position(movimientos_origen, NULL) IS NULL),
  CHECK (tipo <> 'TRANSFERENCIA' OR cardinality(movimientos_origen) = 2)
);
ALTER TABLE public.inventario_reversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_reversas FORCE ROW LEVEL SECURITY;
CREATE POLICY inventario_reversas_private_613 ON public.inventario_reversas
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.inventario_reversas FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.inventario_reversa_resoluciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  tipo text NOT NULL CHECK (tipo IN ('TRANSFERENCIA','RECEPCION')),
  fuente_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 180),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,tipo,idempotency_key)
);
ALTER TABLE public.inventario_reversa_resoluciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_reversa_resoluciones FORCE ROW LEVEL SECURITY;
CREATE POLICY inventario_reversa_resoluciones_private_613 ON public.inventario_reversa_resoluciones USING(false) WITH CHECK(false);
REVOKE ALL ON public.inventario_reversa_resoluciones FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app.guard_inventory_reversal_resolution_613()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public,app,pg_temp AS $fn$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'INVENTORY_REVERSAL_RESOLUTION_IMMUTABLE' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:%s_REVERSA:%s',NEW.tenant_id,NEW.tipo,NEW.idempotency_key),0));
  PERFORM app.assert_actor_permission_466(NEW.tenant_id,NEW.actor_id,
    CASE NEW.tipo WHEN 'TRANSFERENCIA' THEN 'inventario.movimientos.create' ELSE 'compras.recepciones.cerrar' END);
  IF NEW.payload->>'tipo' IS DISTINCT FROM NEW.tipo OR NEW.payload->>'fuente_id' IS DISTINCT FROM NEW.fuente_id::text
     OR NEW.payload->>'actor_id' IS DISTINCT FROM NEW.actor_id::text
     OR NEW.fingerprint IS DISTINCT FROM app.inventory_operation_fingerprint_455(NEW.payload)
     OR EXISTS(SELECT 1 FROM public.inventario_reversas r WHERE r.tenant_id=NEW.tenant_id AND r.tipo=NEW.tipo AND r.idempotency_key=NEW.idempotency_key) THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_RESOLUTION_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_inventory_reversal_resolution_613
BEFORE INSERT OR UPDATE OR DELETE ON public.inventario_reversa_resoluciones
FOR EACH ROW EXECUTE FUNCTION app.guard_inventory_reversal_resolution_613();

CREATE FUNCTION app.validate_inventory_reversal_source_613()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE v_fuentes uuid[]; v_estado text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:%s_REVERSA:%s',NEW.tenant_id,NEW.tipo,NEW.idempotency_key),0));
  IF EXISTS(SELECT 1 FROM public.inventario_reversa_resoluciones r
    WHERE r.tenant_id=NEW.tenant_id AND r.tipo=NEW.tipo AND r.idempotency_key=NEW.idempotency_key) THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_ABANDONED' USING ERRCODE='40001';
  END IF;
  IF NEW.tipo = 'TRANSFERENCIA' THEN
    SELECT ARRAY[o.movimiento_entrada_id, o.movimiento_salida_id] INTO v_fuentes
    FROM public.operaciones_inventario o
    WHERE o.tenant_id = NEW.tenant_id AND o.id = NEW.fuente_id
      AND o.tipo = 'TRANSFERENCIA' AND o.resultado IS NOT NULL FOR UPDATE;
  ELSE
    SELECT r.estado::text INTO v_estado FROM public.recepciones r
    WHERE r.tenant_id = NEW.tenant_id AND r.id = NEW.fuente_id FOR UPDATE;
    IF v_estado IS NULL OR v_estado NOT IN ('CERRADA', 'ANULADA') THEN
      RAISE EXCEPTION 'INVENTORY_REVERSAL_SOURCE_NOT_CLOSED' USING ERRCODE = '23514';
    END IF;
    SELECT coalesce(array_agg(m.id ORDER BY m.id), '{}'::uuid[]) INTO v_fuentes
    FROM public.movimientos_inventario m
    WHERE m.tenant_id = NEW.tenant_id AND m.tipo = 'ENTRADA' AND m.referencia_tipo = 'RECEPCION'
      AND (m.metadata->>'recepcion_id' = NEW.fuente_id::text OR EXISTS (
        SELECT 1 FROM public.recepcion_items ri
        WHERE ri.tenant_id = NEW.tenant_id AND ri.recepcion_id = NEW.fuente_id AND ri.id = m.referencia_id
      ));
  END IF;
  IF v_fuentes IS NULL OR cardinality(v_fuentes) <> cardinality(NEW.movimientos_origen)
     OR NOT v_fuentes @> NEW.movimientos_origen OR NOT NEW.movimientos_origen @> v_fuentes THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_SOURCE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  PERFORM app.assert_actor_permission_466(NEW.tenant_id, NEW.actor_id,
    CASE NEW.tipo WHEN 'TRANSFERENCIA' THEN 'inventario.movimientos.create' ELSE 'compras.recepciones.cerrar' END);
  IF NEW.payload->>'tipo' IS DISTINCT FROM NEW.tipo
     OR NEW.payload->>'fuente_id' IS DISTINCT FROM NEW.fuente_id::text
     OR NEW.payload->>'actor_id' IS DISTINCT FROM NEW.actor_id::text
     OR NEW.payload->>'motivo' IS DISTINCT FROM NEW.motivo
     OR NEW.fingerprint IS DISTINCT FROM app.inventory_operation_fingerprint_455(NEW.payload) THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_INTENT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER validate_inventory_reversal_source_613
BEFORE INSERT ON public.inventario_reversas
FOR EACH ROW EXECUTE FUNCTION app.validate_inventory_reversal_source_613();

CREATE FUNCTION app.guard_inventory_reversal_record_613()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.resultado IS NULL AND NEW.resultado IS NOT NULL
     AND (to_jsonb(NEW) - 'resultado') = (to_jsonb(OLD) - 'resultado') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'INVENTORY_REVERSAL_RECORD_IMMUTABLE' USING ERRCODE = '23514';
END $fn$;
CREATE TRIGGER guard_inventory_reversal_record_613
BEFORE UPDATE OR DELETE ON public.inventario_reversas
FOR EACH ROW EXECUTE FUNCTION app.guard_inventory_reversal_record_613();

-- Se ejecuta después del congelador470. Sólo admite movimientos autorizados
-- por el ledger privado de la misma transacción, sin consultar el catálogo.
CREATE FUNCTION app.freeze_inventory_reversal_613()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE
  v_reversa public.inventario_reversas;
  v_origen public.movimientos_inventario;
  v_tipo text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.referencia_tipo IN ('TRANSFERENCIA_REVERSA', 'RECEPCION_REVERSA') THEN
      RAISE EXCEPTION 'INVENTORY_REVERSAL_MOVEMENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.referencia_tipo IN ('TRANSFERENCIA_REVERSA', 'RECEPCION_REVERSA')
       OR NEW.referencia_tipo IN ('TRANSFERENCIA_REVERSA', 'RECEPCION_REVERSA') THEN
      RAISE EXCEPTION 'INVENTORY_REVERSAL_MOVEMENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF coalesce(NEW.referencia_tipo, '') NOT IN ('TRANSFERENCIA_REVERSA', 'RECEPCION_REVERSA') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_reversa FROM public.inventario_reversas r
  WHERE r.id = app.to_uuid_or_null(NEW.metadata->>'reversa_id')
    AND r.tenant_id = NEW.tenant_id AND r.resultado IS NULL
    AND NEW.referencia_id = ANY(r.movimientos_origen)
    AND r.tipo || '_REVERSA' = NEW.referencia_tipo
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_AUTHORIZATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_origen FROM public.movimientos_inventario m
  WHERE m.id = NEW.referencia_id AND m.tenant_id = NEW.tenant_id;
  v_tipo := CASE v_origen.tipo WHEN 'ENTRADA' THEN 'SALIDA' WHEN 'SALIDA' THEN 'ENTRADA' END;
  IF v_tipo IS NULL OR v_origen.kardex_valuacion_estado IS DISTINCT FROM 'CONFIRMADA'
     OR NEW.metadata->>'source_movement_id' IS DISTINCT FROM v_origen.id::text
     OR NEW.tipo IS DISTINCT FROM v_tipo OR NEW.tipo_movimiento IS DISTINCT FROM v_tipo
     OR NEW.producto_id IS DISTINCT FROM v_origen.producto_id
     OR NEW.almacen_id IS DISTINCT FROM v_origen.almacen_id
     OR NEW.ubicacion_id IS DISTINCT FROM v_origen.ubicacion_id
     OR NEW.cantidad IS DISTINCT FROM v_origen.cantidad
     OR NEW.created_by IS DISTINCT FROM v_reversa.actor_id::text
     OR NOT coalesce(NEW.activo, false) OR NEW.estado IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_SOURCE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  NEW.lote := v_origen.lote;
  NEW.fecha_expiracion := v_origen.fecha_expiracion;
  NEW.kardex_moneda := v_origen.kardex_moneda;
  NEW.kardex_moneda_base := v_origen.kardex_moneda_base;
  NEW.kardex_tipo_cambio := v_origen.kardex_tipo_cambio;
  NEW.kardex_costo_unitario := v_origen.kardex_costo_unitario;
  NEW.kardex_valor_total := v_origen.kardex_valor_total;
  NEW.kardex_valuacion_estado := v_origen.kardex_valuacion_estado;
  NEW.metadata := NEW.metadata || jsonb_build_object('costo_unitario',v_origen.kardex_costo_unitario,
    'valor_total',v_origen.kardex_valor_total,'costo_cero_confirmado',v_origen.kardex_costo_unitario=0,
    'moneda_valorizacion',v_origen.kardex_moneda,'moneda_base_valorizacion',v_origen.kardex_moneda_base,
    'tipo_cambio_valorizacion',v_origen.kardex_tipo_cambio);
  RETURN NEW;
END $fn$;
CREATE TRIGGER zz_freeze_inventory_reversal_613
BEFORE INSERT OR UPDATE OR DELETE ON public.movimientos_inventario
FOR EACH ROW EXECUTE FUNCTION app.freeze_inventory_reversal_613();

-- Un resultado intermedio no puede escapar por un COMMIT accidental.
CREATE FUNCTION app.assert_inventory_reversal_complete_613()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE v_reversa public.inventario_reversas; v_n integer;
BEGIN
  SELECT * INTO v_reversa FROM public.inventario_reversas WHERE id = NEW.id;
  SELECT count(DISTINCT id) INTO v_n FROM unnest(v_reversa.movimientos_origen) x(id);
  IF v_reversa.resultado IS NULL OR v_n <> cardinality(v_reversa.movimientos_origen)
     OR (SELECT count(*) FROM public.movimientos_inventario m
         WHERE m.tenant_id = v_reversa.tenant_id
           AND m.referencia_tipo = v_reversa.tipo || '_REVERSA'
           AND m.referencia_id = ANY(v_reversa.movimientos_origen)
           AND m.metadata->>'reversa_id' = v_reversa.id::text) <> v_n THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  IF v_reversa.tipo = 'RECEPCION' AND NOT EXISTS (
    SELECT 1 FROM public.recepciones r WHERE r.tenant_id = v_reversa.tenant_id
      AND r.id = v_reversa.fuente_id AND r.estado = 'ANULADA'
  ) THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_SOURCE_NOT_CANCELLED' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER assert_inventory_reversal_complete_613
AFTER INSERT OR UPDATE ON public.inventario_reversas
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION app.assert_inventory_reversal_complete_613();

CREATE FUNCTION app.apply_inventory_reversal_movement_613(
  p_reversa_id uuid, p_movimiento_origen_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE
  v_reversa public.inventario_reversas;
  v_origen public.movimientos_inventario;
  v_producto public.productos;
  v_meta jsonb;
  v_lotes jsonb;
  v_lote_total numeric;
  v_stock numeric;
  v_unidades numeric;
  v_valor numeric;
  v_completo boolean;
  v_nuevo uuid;
BEGIN
  SELECT * INTO v_reversa FROM public.inventario_reversas r WHERE r.id = p_reversa_id FOR UPDATE;
  IF NOT FOUND OR v_reversa.resultado IS NOT NULL
     OR NOT p_movimiento_origen_id = ANY(v_reversa.movimientos_origen) THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_AUTHORIZATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  PERFORM app.assert_actor_permission_466(v_reversa.tenant_id, v_reversa.actor_id,
    CASE v_reversa.tipo WHEN 'TRANSFERENCIA' THEN 'inventario.movimientos.create' ELSE 'compras.recepciones.cerrar' END);
  SELECT * INTO v_origen FROM public.movimientos_inventario m
  WHERE m.id = p_movimiento_origen_id AND m.tenant_id = v_reversa.tenant_id;
  IF NOT FOUND OR v_origen.tipo NOT IN ('ENTRADA', 'SALIDA')
     OR v_origen.kardex_valuacion_estado IS DISTINCT FROM 'CONFIRMADA'
     OR v_origen.cantidad <= 0 OR v_origen.almacen_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_SOURCE_NOT_CONFIRMED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_producto FROM public.productos p
  WHERE p.id = v_origen.producto_id AND p.tenant_id = v_reversa.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_FOUND_OR_TENANT_MISMATCH' USING ERRCODE = '23503'; END IF;

  IF v_origen.tipo = 'ENTRADA' THEN
    SELECT pe.stock_actual INTO v_stock FROM public.producto_existencias pe
    WHERE pe.tenant_id = v_reversa.tenant_id AND pe.producto_id = v_origen.producto_id
      AND pe.almacen_id = v_origen.almacen_id FOR UPDATE;
    SELECT coalesce(sum(k.cantidad_firmada), 0), coalesce(sum(k.valor_firmado_base), 0),
      coalesce(bool_and(k.valuacion_estado = 'CONFIRMADA' AND k.cantidad_firmada IS NOT NULL
        AND k.valor_firmado_base IS NOT NULL AND k.moneda_base = v_origen.kardex_moneda_base), false)
      INTO v_unidades, v_valor, v_completo
    FROM public.vw_kardex_valorizado k
    WHERE k.tenant_id = v_reversa.tenant_id AND k.producto_id = v_origen.producto_id
      AND k.almacen_id = v_origen.almacen_id;
    IF NOT v_completo OR v_stock IS DISTINCT FROM v_unidades
       OR v_valor < round(v_origen.kardex_valor_total * v_origen.kardex_tipo_cambio, 2) THEN
      RAISE EXCEPTION 'INVENTORY_REVERSAL_WAREHOUSE_VALUATION_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT coalesce(sum(ml.cantidad), 0),
    jsonb_agg(jsonb_build_object('lote_id', ml.lote_id, 'ubicacion_id', ml.ubicacion_id,
      'cantidad', ml.cantidad) ORDER BY ml.lote_id, ml.ubicacion_id NULLS FIRST, ml.id)
    INTO v_lote_total, v_lotes
  FROM public.movimientos_inventario_lotes ml
  WHERE ml.tenant_id = v_reversa.tenant_id AND ml.movimiento_id = v_origen.id
    AND ml.producto_id = v_origen.producto_id AND ml.almacen_id = v_origen.almacen_id
    AND ml.tipo = v_origen.tipo;
  IF v_lote_total <> 0 AND v_lote_total <> v_origen.cantidad THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_LOT_ALLOCATION_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  IF v_lote_total > 0 AND NOT EXISTS (
    SELECT 1 FROM public.inventario_lote_politicas lp WHERE lp.tenant_id = v_reversa.tenant_id
      AND lp.producto_id = v_origen.producto_id AND lp.controla_lote
  ) THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_LOT_POLICY_REQUIRED' USING ERRCODE = '23514';
  END IF;
  v_meta := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'business_movement_type', v_reversa.tipo || '_REVERSA', 'reversa_id', v_reversa.id,
    'source_movement_id', v_origen.id, 'source_document_id', v_reversa.fuente_id,
    'actor_id', v_reversa.actor_id, 'idempotency_key', v_reversa.idempotency_key,
    'costo_unitario', v_origen.kardex_costo_unitario,
    'costo_cero_confirmado', v_origen.kardex_costo_unitario = 0,
    'moneda_valorizacion', v_origen.kardex_moneda,
    'moneda_base_valorizacion', v_origen.kardex_moneda_base,
    'tipo_cambio_valorizacion', v_origen.kardex_tipo_cambio,
    'metodo_costeo', coalesce(v_origen.metadata->>'metodo_costeo', 'SNAPSHOT_ORIGINAL')
  );
  v_meta := v_meta - 'lotes' - 'lotes_completar_fefo' - 'recepcion_item_id' - 'transferencia_id';
  IF v_lote_total > 0 THEN v_meta := v_meta || jsonb_build_object('lotes', v_lotes); END IF;
  v_nuevo := public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_reversa.tenant_id, p_producto_id := v_origen.producto_id,
    p_almacen_id := v_origen.almacen_id,
    p_tipo := CASE v_origen.tipo WHEN 'ENTRADA' THEN 'SALIDA' ELSE 'ENTRADA' END,
    p_cantidad := v_origen.cantidad, p_referencia_tipo := v_reversa.tipo || '_REVERSA',
    p_referencia_id := v_origen.id, p_notas := v_reversa.motivo,
    p_ubicacion_id := v_origen.ubicacion_id, p_lote := NULL, p_fecha_expiracion := NULL,
    p_created_by := v_reversa.actor_id::text, p_metadata := v_meta
  );
  RETURN v_nuevo;
END $fn$;

-- Una autoridad GRE para traslados originales y reversas: ambos consumen cupo.
CREATE FUNCTION app.inventory_transfer_route_613(
  p_tenant_id uuid, p_producto_id uuid, p_origen_id uuid, p_destino_id uuid,
  p_cantidad numeric, p_guia_id uuid, p_exigir_guia boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_producto_id uuid := p_producto_id; v_origen_id uuid := p_origen_id;
  v_destino_id uuid := p_destino_id; v_cantidad numeric := p_cantidad;
  v_guia_id uuid := p_guia_id; v_sucursal_origen uuid; v_sucursal_destino uuid;
  v_establecimiento_origen text; v_establecimiento_destino text;
  v_traslado_anexos boolean := false; v_gre_obligatorio boolean := false;
  v_traslado jsonb := 'null'::jsonb;
BEGIN
  -- Traslado entre establecimientos anexos (migracion 505).
  --
  -- Mover mercaderia entre dos locales del mismo RUC es, para SUNAT, un traslado
  -- entre establecimientos: exige guia de remision con motivo 04. Esta funcion no
  -- puede emitirla --necesita transportista, fechas y pesos que no estan en este
  -- payload-- asi que hace dos cosas. Deja constancia de que el movimiento la
  -- requiere, con los codigos de los dos establecimientos, para que la interfaz
  -- pueda ofrecerla y para que quede en el rastro. Y la exige de verdad si el
  -- contribuyente marco GRE obligatorio: se reutiliza ese interruptor a
  -- proposito en vez de inventar otro, porque ya significa exactamente eso.
  SELECT ao.sucursal_id, ad.sucursal_id
    INTO v_sucursal_origen, v_sucursal_destino
  FROM public.almacenes ao, public.almacenes ad
  WHERE ao.id = v_origen_id AND ao.tenant_id = p_tenant_id
    AND ad.id = v_destino_id AND ad.tenant_id = p_tenant_id;

  v_traslado_anexos := v_sucursal_origen IS DISTINCT FROM v_sucursal_destino
                       AND v_sucursal_origen IS NOT NULL
                       AND v_sucursal_destino IS NOT NULL;

  IF v_guia_id IS NOT NULL THEN
    IF NOT v_traslado_anexos THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_GRE_INVALID' USING ERRCODE='23514';
    END IF;
    PERFORM 1 FROM public.gre_guias g
    WHERE g.id=v_guia_id AND g.tenant_id=p_tenant_id
      AND g.estado IN ('FIRMADO','ENVIADO','ACEPTADO')
      AND g.motivo='TRASLADO_ENTRE_ESTABLECIMIENTOS'
      AND g.datos_adicionales->>'partidaSucursalId'=v_sucursal_origen::text
      AND g.datos_adicionales->>'llegadaSucursalId'=v_sucursal_destino::text
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_GRE_INVALID' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.gre_detalles gd JOIN public.productos p
        ON p.id=gd.producto_id AND p.tenant_id=gd.tenant_id
      WHERE gd.tenant_id=p_tenant_id AND gd.gre_id=v_guia_id
        AND gd.producto_id=v_producto_id
        AND upper(btrim(gd.unidad_medida))=upper(coalesce(nullif(btrim(p.unidad_medida),''),'NIU'))
    ) THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_GRE_PRODUCT_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF v_cantidad + coalesce((
      SELECT sum(m.cantidad) FROM public.movimientos_inventario m
      WHERE m.tenant_id=p_tenant_id AND m.producto_id=v_producto_id
        AND m.tipo='SALIDA' AND m.referencia_tipo IN ('TRANSFERENCIA_SALIDA','TRANSFERENCIA_REVERSA')
        AND m.metadata->'traslado_entre_establecimientos'->>'guia_remision_id'=v_guia_id::text
    ),0) > (
      SELECT sum(gd.cantidad) FROM public.gre_detalles gd JOIN public.productos p
        ON p.id=gd.producto_id AND p.tenant_id=gd.tenant_id
      WHERE gd.tenant_id=p_tenant_id AND gd.gre_id=v_guia_id AND gd.producto_id=v_producto_id
        AND upper(btrim(gd.unidad_medida))=upper(coalesce(nullif(btrim(p.unidad_medida),''),'NIU'))
    ) THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_GRE_QUANTITY_EXCEEDED' USING ERRCODE='23514';
    END IF;
  END IF;
  IF v_traslado_anexos THEN
    SELECT codigo_establecimiento INTO v_establecimiento_origen
    FROM public.sucursales WHERE id = v_sucursal_origen;
    SELECT codigo_establecimiento INTO v_establecimiento_destino
    FROM public.sucursales WHERE id = v_sucursal_destino;

    SELECT COALESCE(ec.gre_obligatorio, false) INTO v_gre_obligatorio
    FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id
    LIMIT 1;

    IF (COALESCE(v_gre_obligatorio, false) OR p_exigir_guia) AND v_guia_id IS NULL THEN
      RAISE EXCEPTION
        'INVENTORY_TRANSFER_REQUIRES_GRE: traslado del establecimiento % al %; este contribuyente exige guia de remision (motivo 04) antes de mover mercaderia entre locales',
        v_establecimiento_origen, v_establecimiento_destino
        USING ERRCODE = '23514';
    END IF;

    v_traslado := jsonb_build_object(
      'requiere_gre', true,
      'motivo_traslado_sunat', '04',
      'sucursal_origen_id', v_sucursal_origen,
      'sucursal_destino_id', v_sucursal_destino,
      'establecimiento_origen', v_establecimiento_origen,
      'establecimiento_destino', v_establecimiento_destino,
      'guia_remision_id', v_guia_id
    );
  END IF;


  RETURN v_traslado;
END $fn$;

CREATE OR REPLACE FUNCTION app.transferir_inventario_tx_455(p_tenant_id uuid, p_payload jsonb, p_actor_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_producto_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'producto_id', ''));
  v_origen_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'almacen_origen_id', ''));
  v_destino_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'almacen_destino_id', ''));
  v_ubicacion_origen_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'ubicacion_origen_id', ''));
  v_ubicacion_destino_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'ubicacion_destino_id', ''));
  v_cantidad numeric := NULLIF(p_payload->>'cantidad', '')::numeric;
  v_motivo text := NULLIF(btrim(COALESCE(p_payload->>'motivo', '')), '');
  v_lote text := NULLIF(btrim(COALESCE(p_payload->>'lote', '')), '');
  v_fecha_expiracion date := NULLIF(p_payload->>'fecha_expiracion', '')::date;
  v_canonical jsonb;
  v_fingerprint text;
  v_operacion public.operaciones_inventario%ROWTYPE;
  v_salida_id uuid;
  v_entrada_id uuid;
  v_resultado jsonb;
  v_sucursal_origen uuid;
  v_sucursal_destino uuid;
  v_establecimiento_origen text;
  v_establecimiento_destino text;
  v_traslado_anexos boolean := false;
  v_guia_id uuid := app.to_uuid_or_null(COALESCE(p_payload->>'guia_remision_id', ''));
  v_gre_obligatorio boolean := false;
  v_traslado jsonb := 'null'::jsonb;
BEGIN
  PERFORM app.assert_inventory_actor_455(p_tenant_id, p_actor_id);
  IF jsonb_typeof(COALESCE(p_payload, 'null'::jsonb)) <> 'object'
     OR length(v_key) NOT BETWEEN 8 AND 180
     OR v_producto_id IS NULL OR v_origen_id IS NULL OR v_destino_id IS NULL
     OR v_origen_id = v_destino_id
     OR v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad > 999999999999::numeric
     OR v_motivo IS NULL OR length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  v_cantidad := round(v_cantidad, 6);
  IF v_cantidad <= 0 THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_QUANTITY_TOO_SMALL' USING ERRCODE = '22023';
  END IF;

  v_canonical := jsonb_build_object(
    'producto_id', v_producto_id,
    'almacen_origen_id', v_origen_id,
    'almacen_destino_id', v_destino_id,
    'ubicacion_origen_id', v_ubicacion_origen_id,
    'ubicacion_destino_id', v_ubicacion_destino_id,
    'cantidad', v_cantidad,
    'motivo', v_motivo,
    'lote', v_lote,
    'fecha_expiracion', v_fecha_expiracion,
    'guia_remision_id', v_guia_id
  );
  v_fingerprint := app.inventory_operation_fingerprint_455(v_canonical);

  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('%s:TRANSFERENCIA:%s', p_tenant_id, v_key), 0)
  );

  PERFORM app.guard_inventory_operation_key_570(p_tenant_id,p_actor_id,'TRANSFERENCIA',v_key,v_canonical,true);
  SELECT * INTO v_operacion
  FROM public.operaciones_inventario o
  WHERE o.tenant_id = p_tenant_id
    AND o.tipo = 'TRANSFERENCIA'
    AND o.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'INVENTORY_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        USING ERRCODE = '23505';
    END IF;
    IF v_operacion.resultado IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_INCOMPLETE_RETRY' USING ERRCODE = '40001';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM 1 FROM public.productos p
  WHERE p.id = v_producto_id AND p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true)
    AND NOT COALESCE(p.es_servicio, false)
    AND COALESCE(p.controla_stock, true)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_STOCK_CONTROLLED' USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.almacenes a
  WHERE a.id IN (v_origen_id, v_destino_id)
    AND a.tenant_id = p_tenant_id
    AND COALESCE(a.activo, true)
  ORDER BY a.id
  FOR SHARE;
  IF (SELECT count(*) FROM public.almacenes a
      WHERE a.id IN (v_origen_id, v_destino_id)
        AND a.tenant_id = p_tenant_id AND COALESCE(a.activo, true)) <> 2 THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_WAREHOUSE_INVALID' USING ERRCODE = '23503';
  END IF;

  v_traslado := app.inventory_transfer_route_613(
    p_tenant_id, v_producto_id, v_origen_id, v_destino_id, v_cantidad, v_guia_id, false
  );

  IF v_ubicacion_origen_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacen_ubicaciones u
    WHERE u.id = v_ubicacion_origen_id AND u.tenant_id = p_tenant_id
      AND u.almacen_id = v_origen_id
  ) THEN
    RAISE EXCEPTION 'INVENTORY_ORIGIN_LOCATION_INVALID' USING ERRCODE = '23503';
  END IF;
  IF v_ubicacion_destino_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacen_ubicaciones u
    WHERE u.id = v_ubicacion_destino_id AND u.tenant_id = p_tenant_id
      AND u.almacen_id = v_destino_id
  ) THEN
    RAISE EXCEPTION 'INVENTORY_DESTINATION_LOCATION_INVALID' USING ERRCODE = '23503';
  END IF;

  v_operacion.id := gen_random_uuid();
  v_salida_id := public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id,
    p_producto_id := v_producto_id,
    p_almacen_id := v_origen_id,
    p_tipo := 'SALIDA',
    p_cantidad := v_cantidad,
    p_referencia_tipo := 'TRANSFERENCIA_SALIDA',
    p_referencia_id := v_operacion.id,
    p_notas := v_motivo,
    p_ubicacion_id := v_ubicacion_origen_id,
    p_lote := v_lote,
    p_fecha_expiracion := v_fecha_expiracion,
    p_created_by := p_actor_id::text,
    p_metadata := jsonb_build_object(
      'business_movement_type', 'TRANSFERENCIA',
      'transferencia_id', v_operacion.id,
      'almacen_destino_id', v_destino_id,
      'idempotency_key', v_key,
      'actor_id', p_actor_id,
      'traslado_entre_establecimientos', v_traslado
    )
  );

  v_entrada_id := public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id,
    p_producto_id := v_producto_id,
    p_almacen_id := v_destino_id,
    p_tipo := 'ENTRADA',
    p_cantidad := v_cantidad,
    p_referencia_tipo := 'TRANSFERENCIA_ENTRADA',
    p_referencia_id := v_operacion.id,
    p_notas := v_motivo,
    p_ubicacion_id := v_ubicacion_destino_id,
    p_lote := v_lote,
    p_fecha_expiracion := v_fecha_expiracion,
    p_created_by := p_actor_id::text,
    p_metadata := jsonb_build_object(
      'business_movement_type', 'TRANSFERENCIA',
      'transferencia_id', v_operacion.id,
      'almacen_origen_id', v_origen_id,
      'costo_unitario', (SELECT metadata->>'costo_unitario' FROM public.movimientos_inventario WHERE id=v_salida_id AND tenant_id=p_tenant_id),
      'costo_cero_confirmado', (SELECT coalesce((metadata->>'costo_cero_confirmado')::boolean,false) FROM public.movimientos_inventario WHERE id=v_salida_id AND tenant_id=p_tenant_id),
      'idempotency_key', v_key,
      'actor_id', p_actor_id,
      'traslado_entre_establecimientos', v_traslado
    )
  );

  v_resultado := jsonb_build_object(
    'success', true,
    'operacion_id', v_operacion.id,
    'producto_id', v_producto_id,
    'almacen_origen_id', v_origen_id,
    'almacen_destino_id', v_destino_id,
    'cantidad', v_cantidad,
    'movimiento_salida_id', v_salida_id,
    'movimiento_entrada_id', v_entrada_id,
    'traslado_entre_establecimientos', v_traslado,
    'idempotent', false
  );

  INSERT INTO public.operaciones_inventario (
    id, tenant_id, tipo, idempotency_key, fingerprint, producto_id,
    almacen_origen_id, almacen_destino_id,
    ubicacion_origen_id, ubicacion_destino_id,
    cantidad, delta, costo_unitario, motivo, actor_id,
    movimiento_salida_id, movimiento_entrada_id, resultado, metadata
  ) VALUES (
    v_operacion.id, p_tenant_id, 'TRANSFERENCIA', v_key, v_fingerprint,
    v_producto_id, v_origen_id, v_destino_id,
    v_ubicacion_origen_id, v_ubicacion_destino_id,
    v_cantidad, NULL, NULL, v_motivo, p_actor_id,
    v_salida_id, v_entrada_id, v_resultado,
    jsonb_build_object('payload', v_canonical)
  );

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION app.inventory_transfer_route_613(uuid,uuid,uuid,uuid,numeric,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app.transfer_reversal_request_613(p_actor_id uuid,p_operacion_id uuid,p_payload jsonb,p_key text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog,public,app,pg_temp AS $fn$
DECLARE v_motivo text:=btrim(coalesce(p_payload->>'motivo','')); v_guia uuid:=app.to_uuid_or_null(p_payload->>'guia_remision_id');
BEGIN
  IF p_actor_id IS NULL OR p_operacion_id IS NULL OR length(btrim(coalesce(p_key,''))) NOT BETWEEN 8 AND 180
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_payload->'motivo') IS DISTINCT FROM 'string' OR length(v_motivo) NOT BETWEEN 5 AND 500
    OR v_motivo !~ '[^[:space:]]'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN('motivo','guia_remision_id'))
    OR (p_payload ? 'guia_remision_id' AND p_payload->'guia_remision_id'<>'null'::jsonb
      AND (jsonb_typeof(p_payload->'guia_remision_id')<>'string' OR v_guia IS NULL)) THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('tipo','TRANSFERENCIA','fuente_id',p_operacion_id,'actor_id',p_actor_id,'motivo',v_motivo,'guia_remision_id',v_guia);
END $fn$;

CREATE FUNCTION app.reverse_inventory_transfer_613(
  p_tenant_id uuid, p_actor_id uuid, p_operacion_id uuid, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_motivo text := btrim(coalesce(p_payload->>'motivo', ''));
  v_guia_id uuid := app.to_uuid_or_null(p_payload->>'guia_remision_id');
  v_guia_original uuid;
  v_payload jsonb; v_fingerprint text;
  v_original public.operaciones_inventario;
  v_reversa public.inventario_reversas;
  v_salida public.movimientos_inventario; v_entrada public.movimientos_inventario;
  v_sucursal_salida uuid; v_sucursal_entrada uuid;
  v_traslado jsonb; v_meta jsonb; v_salida_id uuid; v_entrada_id uuid; v_resultado jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'inventario.movimientos.create');
  v_payload := app.transfer_reversal_request_613(p_actor_id,p_operacion_id,p_payload,v_key);
  v_fingerprint := app.inventory_operation_fingerprint_455(v_payload);
  PERFORM set_config('app.current_tenant_id',p_tenant_id::text,true);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:TRANSFERENCIA_REVERSA:%s',p_tenant_id,v_key),0));
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
  IF EXISTS(SELECT 1 FROM public.inventario_reversa_resoluciones r
    WHERE r.tenant_id=p_tenant_id AND r.tipo='TRANSFERENCIA' AND r.idempotency_key=v_key) THEN
    RAISE EXCEPTION 'INVENTORY_REVERSAL_ABANDONED' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v_reversa FROM public.inventario_reversas r
  WHERE r.tenant_id=p_tenant_id AND r.tipo='TRANSFERENCIA' AND r.idempotency_key=v_key FOR UPDATE;
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
  IF v_reversa.id IS NOT NULL THEN
    IF v_reversa.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'INVENTORY_REVERSAL_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF v_reversa.resultado IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_REVERSAL_INCOMPLETE' USING ERRCODE = '40001';
    END IF;
    RETURN v_reversa.resultado || jsonb_build_object('idempotent',true);
  END IF;
  SELECT * INTO v_original FROM public.operaciones_inventario o
  WHERE o.tenant_id=p_tenant_id AND o.id=p_operacion_id AND o.tipo='TRANSFERENCIA' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
  IF EXISTS(SELECT 1 FROM public.inventario_reversas r
    WHERE r.tenant_id=p_tenant_id AND r.tipo='TRANSFERENCIA' AND r.fuente_id=p_operacion_id) THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_ALREADY_REVERSED' USING ERRCODE = '23505';
  END IF;
  PERFORM 1 FROM public.productos p WHERE p.tenant_id=p_tenant_id AND p.id=v_original.producto_id
    AND coalesce(p.activo,true) AND NOT coalesce(p.es_servicio,false) AND coalesce(p.controla_stock,true) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_PRODUCT_NOT_STOCK_CONTROLLED' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public.almacenes a WHERE a.tenant_id=p_tenant_id
    AND a.id IN(v_original.almacen_origen_id,v_original.almacen_destino_id) AND coalesce(a.activo,true)
    ORDER BY a.id FOR SHARE;
  IF (SELECT count(*) FROM public.almacenes a WHERE a.tenant_id=p_tenant_id
    AND a.id IN(v_original.almacen_origen_id,v_original.almacen_destino_id) AND coalesce(a.activo,true))<>2 THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_WAREHOUSE_INVALID' USING ERRCODE = '23503';
  END IF;
  SELECT * INTO v_salida FROM public.movimientos_inventario m
  WHERE m.tenant_id=p_tenant_id AND m.id=v_original.movimiento_salida_id FOR SHARE;
  SELECT * INTO v_entrada FROM public.movimientos_inventario m
  WHERE m.tenant_id=p_tenant_id AND m.id=v_original.movimiento_entrada_id FOR SHARE;
  IF v_salida.id IS NULL OR v_entrada.id IS NULL
     OR v_salida.tipo IS DISTINCT FROM 'SALIDA' OR v_entrada.tipo IS DISTINCT FROM 'ENTRADA'
     OR v_salida.referencia_tipo IS DISTINCT FROM 'TRANSFERENCIA_SALIDA'
     OR v_entrada.referencia_tipo IS DISTINCT FROM 'TRANSFERENCIA_ENTRADA'
     OR v_salida.referencia_id IS DISTINCT FROM v_original.id OR v_entrada.referencia_id IS DISTINCT FROM v_original.id
     OR v_salida.producto_id IS DISTINCT FROM v_original.producto_id OR v_entrada.producto_id IS DISTINCT FROM v_original.producto_id
     OR v_salida.almacen_id IS DISTINCT FROM v_original.almacen_origen_id OR v_entrada.almacen_id IS DISTINCT FROM v_original.almacen_destino_id
     OR v_salida.ubicacion_id IS DISTINCT FROM v_original.ubicacion_origen_id OR v_entrada.ubicacion_id IS DISTINCT FROM v_original.ubicacion_destino_id
     OR v_salida.cantidad IS DISTINCT FROM v_original.cantidad OR v_entrada.cantidad IS DISTINCT FROM v_original.cantidad
     OR v_salida.kardex_valuacion_estado IS DISTINCT FROM 'CONFIRMADA' OR v_entrada.kardex_valuacion_estado IS DISTINCT FROM 'CONFIRMADA'
     OR ROW(v_salida.kardex_moneda,v_salida.kardex_moneda_base,v_salida.kardex_tipo_cambio,v_salida.kardex_costo_unitario,v_salida.kardex_valor_total)
       IS DISTINCT FROM ROW(v_entrada.kardex_moneda,v_entrada.kardex_moneda_base,v_entrada.kardex_tipo_cambio,v_entrada.kardex_costo_unitario,v_entrada.kardex_valor_total) THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_ORIGIN_EVIDENCE_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  SELECT sucursal_id INTO v_sucursal_salida FROM public.almacenes WHERE id=v_original.almacen_origen_id;
  SELECT sucursal_id INTO v_sucursal_entrada FROM public.almacenes WHERE id=v_original.almacen_destino_id;
  IF v_salida.sucursal_id IS DISTINCT FROM v_sucursal_salida OR v_entrada.sucursal_id IS DISTINCT FROM v_sucursal_entrada THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_ORIGIN_ROUTE_CHANGED' USING ERRCODE = '23514';
  END IF;
  v_guia_original := coalesce(app.to_uuid_or_null(v_original.metadata#>>'{payload,guia_remision_id}'),
    app.to_uuid_or_null(v_salida.metadata#>>'{traslado_entre_establecimientos,guia_remision_id}'));
  IF v_guia_original IS NOT NULL AND v_guia_original = v_guia_id THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_REVERSE_GRE_REQUIRED' USING ERRCODE = '23514';
  END IF;
  v_traslado := app.inventory_transfer_route_613(p_tenant_id,v_original.producto_id,
    v_original.almacen_destino_id,v_original.almacen_origen_id,v_original.cantidad,v_guia_id,v_guia_original IS NOT NULL);
  INSERT INTO public.inventario_reversas(tenant_id,tipo,fuente_id,idempotency_key,fingerprint,actor_id,motivo,payload,movimientos_origen,fuente_snapshot)
  VALUES(p_tenant_id,'TRANSFERENCIA',p_operacion_id,v_key,v_fingerprint,p_actor_id,v_motivo,v_payload,
    ARRAY[v_entrada.id,v_salida.id],jsonb_build_object('operacion',to_jsonb(v_original),'salida',to_jsonb(v_salida),'entrada',to_jsonb(v_entrada)))
  RETURNING * INTO v_reversa;
  v_meta := jsonb_build_object('transferencia_origen_id',v_original.id,'traslado_entre_establecimientos',v_traslado);
  v_salida_id := app.apply_inventory_reversal_movement_613(v_reversa.id,v_entrada.id,v_meta);
  v_entrada_id := app.apply_inventory_reversal_movement_613(v_reversa.id,v_salida.id,v_meta);
  v_resultado := jsonb_build_object('success',true,'tipo','TRANSFERENCIA_REVERSA','estado','COMPLETADA',
    'reversa_id',v_reversa.id,'operacion_origen_id',v_original.id,'tenant_id',p_tenant_id,'actor_id',p_actor_id,
    'idempotency_key',v_key,'request_fingerprint',v_fingerprint,'payload',v_payload,
    'producto_id',v_original.producto_id,'almacen_origen_id',v_original.almacen_destino_id,
    'almacen_destino_id',v_original.almacen_origen_id,'ubicacion_origen_id',v_original.ubicacion_destino_id,
    'ubicacion_destino_id',v_original.ubicacion_origen_id,'cantidad',v_original.cantidad::text,
    'motivo',v_motivo,'movimiento_salida_id',v_salida_id,'movimiento_entrada_id',v_entrada_id,
    'traslado_entre_establecimientos',v_traslado,'created_at',v_reversa.created_at,'idempotent',false);
  UPDATE public.inventario_reversas SET resultado=v_resultado WHERE id=v_reversa.id;
  RETURN v_resultado;
END $fn$;

CREATE FUNCTION public.revertir_transferencia_inventario_613(
  p_tenant_id uuid, p_actor_id uuid, p_operacion_id uuid, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
  SELECT app.reverse_inventory_transfer_613(p_tenant_id,p_actor_id,p_operacion_id,p_payload,p_idempotency_key)
$fn$;

REVOKE ALL ON FUNCTION app.reverse_inventory_transfer_613(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revertir_transferencia_inventario_613(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revertir_transferencia_inventario_613(uuid,uuid,uuid,jsonb,text) TO service_role;

-- Los importes y cantidades de los recibos nuevos son texto decimal: JSON/JS
-- no debe redondear silenciosamente numeric(18,6) a un float.
CREATE FUNCTION app.inventory_reversal_movement_receipt_613(p_tenant_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
  SELECT jsonb_build_object('id',m.id,'tenant_id',m.tenant_id,'producto_id',m.producto_id,
    'almacen_id',m.almacen_id,'ubicacion_id',m.ubicacion_id,'tipo',m.tipo,'cantidad',m.cantidad::text,
    'referencia_tipo',m.referencia_tipo,'referencia_id',m.referencia_id,'created_by',m.created_by,
    'lote',m.lote,'fecha_expiracion',m.fecha_expiracion,'activo',m.activo,'estado',m.estado,
    'moneda',m.kardex_moneda,'moneda_base',m.kardex_moneda_base,'tipo_cambio',m.kardex_tipo_cambio::text,
    'costo_unitario',m.kardex_costo_unitario::text,'valor_total',m.kardex_valor_total::text,
    'valuacion_estado',m.kardex_valuacion_estado,'metadata',m.metadata)
  FROM public.movimientos_inventario m WHERE m.tenant_id=p_tenant_id AND m.id=p_id
$fn$;

CREATE FUNCTION public.consultar_transferencia_inventario_613(
  p_tenant_id uuid,p_actor_id uuid,p_operacion_id uuid,p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE o public.operaciones_inventario; r public.inventario_reversas;
BEGIN
  IF p_idempotency_key IS NULL THEN
    PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.read');
    SELECT * INTO r FROM public.inventario_reversas
      WHERE tenant_id=p_tenant_id AND tipo='TRANSFERENCIA' AND fuente_id=p_operacion_id;
  ELSE
    PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
    IF length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 180 THEN
      RAISE EXCEPTION 'INVENTORY_REVERSAL_PAYLOAD_INVALID' USING ERRCODE='22023';
    END IF;
    SELECT * INTO r FROM public.inventario_reversas
      WHERE tenant_id=p_tenant_id AND tipo='TRANSFERENCIA' AND fuente_id=p_operacion_id
        AND actor_id=p_actor_id AND idempotency_key=btrim(p_idempotency_key);
    -- Crear no concede lectura general. Una clave sin recibo propio tampoco
    -- revela la transferencia ni demuestra que una intención fue abandonada.
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO o FROM public.operaciones_inventario
    WHERE tenant_id=p_tenant_id AND id=p_operacion_id AND tipo='TRANSFERENCIA';
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('operacion_id',o.id,'tenant_id',o.tenant_id,'tipo',o.tipo,
    'producto_id',o.producto_id,'almacen_origen_id',o.almacen_origen_id,'almacen_destino_id',o.almacen_destino_id,
    'ubicacion_origen_id',o.ubicacion_origen_id,'ubicacion_destino_id',o.ubicacion_destino_id,
    'cantidad',o.cantidad::text,'motivo',o.motivo,'actor_id',o.actor_id,'created_at',o.created_at,
    'movimiento_salida',app.inventory_reversal_movement_receipt_613(p_tenant_id,o.movimiento_salida_id),
    'movimiento_entrada',app.inventory_reversal_movement_receipt_613(p_tenant_id,o.movimiento_entrada_id),
    'reversa',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'tenant_id',r.tenant_id,
      'tipo',r.tipo,'fuente_id',r.fuente_id,'idempotency_key',r.idempotency_key,'fingerprint',r.fingerprint,
      'actor_id',r.actor_id,'motivo',r.motivo,'payload',r.payload,'resultado',r.resultado,'created_at',r.created_at,
      'movimiento_salida',app.inventory_reversal_movement_receipt_613(p_tenant_id,(r.resultado->>'movimiento_salida_id')::uuid),
      'movimiento_entrada',app.inventory_reversal_movement_receipt_613(p_tenant_id,(r.resultado->>'movimiento_entrada_id')::uuid)) END);
END $fn$;
REVOKE ALL ON FUNCTION app.inventory_reversal_movement_receipt_613(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.consultar_transferencia_inventario_613(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_transferencia_inventario_613(uuid,uuid,uuid,text) TO service_role;

-- Resolución explícita, nunca un writer de stock: conserva el commit previo o
-- cierra la clave bajo el mismo bloqueo para rechazar cualquier writer tardío.
CREATE FUNCTION public.resolver_reversa_transferencia_613(
  p_tenant_id uuid,p_actor_id uuid,p_operacion_id uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public,app,pg_temp AS $fn$
DECLARE v_key text:=btrim(coalesce(p_idempotency_key,'')); v_payload jsonb; v_fp text;
  r public.inventario_reversas; f public.inventario_reversa_resoluciones;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
  v_payload:=app.transfer_reversal_request_613(p_actor_id,p_operacion_id,p_payload,v_key);
  v_fp:=app.inventory_operation_fingerprint_455(v_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:TRANSFERENCIA_REVERSA:%s',p_tenant_id,v_key),0));
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
  SELECT * INTO r FROM public.inventario_reversas WHERE tenant_id=p_tenant_id AND tipo='TRANSFERENCIA' AND idempotency_key=v_key FOR UPDATE;
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
  IF r.id IS NOT NULL THEN
    IF r.fingerprint IS DISTINCT FROM v_fp OR r.resultado IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_REVERSAL_RESOLUTION_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('status','COMMITTED','receipt',r.resultado||'{"idempotent":true}'::jsonb,
      'detail',public.consultar_transferencia_inventario_613(p_tenant_id,p_actor_id,p_operacion_id,v_key));
  END IF;
  SELECT * INTO f FROM public.inventario_reversa_resoluciones WHERE tenant_id=p_tenant_id AND tipo='TRANSFERENCIA' AND idempotency_key=v_key FOR UPDATE;
  PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
  IF f.id IS NOT NULL THEN
    IF f.fingerprint IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION 'INVENTORY_REVERSAL_RESOLUTION_CONFLICT' USING ERRCODE='23505';
    END IF;
  ELSE
    PERFORM 1 FROM public.operaciones_inventario WHERE tenant_id=p_tenant_id AND id=p_operacion_id AND tipo='TRANSFERENCIA' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'inventario.movimientos.create');
    INSERT INTO public.inventario_reversa_resoluciones(tenant_id,tipo,fuente_id,actor_id,idempotency_key,fingerprint,payload)
    VALUES(p_tenant_id,'TRANSFERENCIA',p_operacion_id,p_actor_id,v_key,v_fp,v_payload) RETURNING * INTO f;
  END IF;
  RETURN jsonb_build_object('status','ABANDONED','resolution',jsonb_build_object('id',f.id,'type','TRANSFERENCIA_REVERSA',
    'tenant_id',f.tenant_id,'actor_id',f.actor_id,'source_operation_id',f.fuente_id,'idempotency_key',f.idempotency_key,
    'request_payload',f.payload,'request_fingerprint',f.fingerprint,'confirmed_at',f.created_at));
END $fn$;
REVOKE ALL ON FUNCTION public.resolver_reversa_transferencia_613(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolver_reversa_transferencia_613(uuid,uuid,uuid,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION app.transfer_reversal_request_613(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app.guard_inventory_reversal_resolution_613() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION app.guard_inventory_reversal_record_613() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.validate_inventory_reversal_source_613() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.freeze_inventory_reversal_613() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_inventory_reversal_complete_613() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.apply_inventory_reversal_movement_613(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
