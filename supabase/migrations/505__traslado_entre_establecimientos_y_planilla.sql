-- 505__traslado_entre_establecimientos_y_planilla.sql
--
-- Cierra las dos cosas que la 503 y la 504 dejaron a medias y que no son
-- opcionales en Peru.
--
-- 1. TRASLADO ENTRE ESTABLECIMIENTOS
--
-- Con varias sucursales, mover mercaderia de un local a otro deja de ser un
-- apunte interno: para SUNAT es un traslado entre establecimientos y exige guia
-- de remision con motivo 04. El sistema ya sabia mapear ese motivo --esta en
-- `gre.service.ts` desde antes-- pero nadie lo disparaba, porque hasta la 503 no
-- habia establecimientos entre los que trasladar.
--
-- `transferir_inventario_tx` no puede emitir la guia por su cuenta: necesita
-- transportista, fechas y pesos que no viajan en su payload. Asi que hace lo que
-- si le corresponde: detecta que los dos almacenes son de sucursales distintas,
-- deja constancia --con los codigos de ambos establecimientos y el motivo 04--
-- en el resultado y en la metadata de los dos movimientos, y **bloquea** el
-- traslado si el contribuyente marco GRE obligatorio y no se referencia ninguna
-- guia. Se reutiliza ese interruptor en vez de inventar otro porque ya significa
-- exactamente eso: no completes la operacion sin guia.
--
-- 2. EL ESTABLECIMIENTO DE LA PLANILLA
--
-- El T-Registro pide, por trabajador, el codigo del establecimiento donde
-- trabaja. `rrhh_peru_fichas_laborales.establecimiento_codigo` existe desde la 398 con
-- `DEFAULT '0000'`, y como no habia sucursales nadie lo cambiaba nunca: toda la
-- planilla de todos los locales se declaraba en la casa matriz.
--
-- Se arregla en la raiz y no en el generador del PLAME: el empleado pertenece a
-- una sucursal, y el codigo de la ficha **se deriva** de ella en cada escritura.
-- Igual que en la 504, un valor derivado que se puede escribir a mano deja de
-- serlo, asi que aqui tampoco se escribe: se hereda. Quien necesite cambiarlo
-- cambia la sucursal del empleado, que es la afirmacion que de verdad se quiere
-- hacer.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. El empleado trabaja en un establecimiento
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empleados
  ADD COLUMN IF NOT EXISTS sucursal_id uuid;

UPDATE public.empleados e
SET sucursal_id = app.casa_matriz_de(e.tenant_id)
WHERE e.tenant_id IS NOT NULL AND e.sucursal_id IS NULL;

DROP TRIGGER IF EXISTS trg_sucursal_default_empleados ON public.empleados;
CREATE TRIGGER trg_sucursal_default_empleados
BEFORE INSERT OR UPDATE ON public.empleados
FOR EACH ROW
EXECUTE FUNCTION app.default_sucursal_casa_matriz();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_empleados_sucursal_tenant'
  ) THEN
    ALTER TABLE public.empleados
      ADD CONSTRAINT fk_empleados_sucursal_tenant
      FOREIGN KEY (tenant_id, sucursal_id)
      REFERENCES public.sucursales (tenant_id, id)
      ON DELETE RESTRICT NOT VALID;
    ALTER TABLE public.empleados VALIDATE CONSTRAINT fk_empleados_sucursal_tenant;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_empleados_sucursal_presente'
  ) THEN
    ALTER TABLE public.empleados
      ADD CONSTRAINT ck_empleados_sucursal_presente
      CHECK (sucursal_id IS NOT NULL OR tenant_id IS NULL) NOT VALID;
    ALTER TABLE public.empleados VALIDATE CONSTRAINT ck_empleados_sucursal_presente;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_empleados_sucursal
ON public.empleados (tenant_id, sucursal_id);

-- ----------------------------------------------------------------------------
-- 2. La ficha del T-Registro hereda el codigo de la sucursal del empleado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.derive_establecimiento_ficha_505()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_codigo text;
BEGIN
  SELECT s.codigo_establecimiento
    INTO v_codigo
  FROM public.empleados e
  JOIN public.sucursales s ON s.id = e.sucursal_id AND s.tenant_id = e.tenant_id
  WHERE e.id = NEW.empleado_id AND e.tenant_id = NEW.tenant_id;

  -- Sin sucursal resoluble se conserva lo que traiga la ficha, y en su defecto
  -- la casa matriz: una planilla no se queda sin generar por esto.
  NEW.establecimiento_codigo := COALESCE(
    v_codigo,
    NULLIF(btrim(COALESCE(NEW.establecimiento_codigo, '')), ''),
    '0000'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_establecimiento_ficha_505 ON public.rrhh_peru_fichas_laborales;
CREATE TRIGGER trg_derive_establecimiento_ficha_505
BEFORE INSERT OR UPDATE ON public.rrhh_peru_fichas_laborales
FOR EACH ROW
EXECUTE FUNCTION app.derive_establecimiento_ficha_505();

UPDATE public.rrhh_peru_fichas_laborales f
SET establecimiento_codigo = s.codigo_establecimiento
FROM public.empleados e
JOIN public.sucursales s ON s.id = e.sucursal_id AND s.tenant_id = e.tenant_id
WHERE e.id = f.empleado_id
  AND e.tenant_id = f.tenant_id
  AND f.establecimiento_codigo IS DISTINCT FROM s.codigo_establecimiento;

-- ----------------------------------------------------------------------------
-- 3. El writer de transferencias
--
--    Se reescribe entero --es un SECURITY DEFINER y no admite parches
--    parciales-- a partir de la definicion vigente de la 455, con la deteccion
--    del traslado entre anexos anadida.
-- ----------------------------------------------------------------------------
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

  IF v_traslado_anexos THEN
    SELECT codigo_establecimiento INTO v_establecimiento_origen
    FROM public.sucursales WHERE id = v_sucursal_origen;
    SELECT codigo_establecimiento INTO v_establecimiento_destino
    FROM public.sucursales WHERE id = v_sucursal_destino;

    SELECT COALESCE(ec.gre_obligatorio, false) INTO v_gre_obligatorio
    FROM public.empresa_config ec
    WHERE ec.tenant_id = p_tenant_id
    LIMIT 1;

    IF COALESCE(v_gre_obligatorio, false) AND v_guia_id IS NULL THEN
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

COMMIT;
