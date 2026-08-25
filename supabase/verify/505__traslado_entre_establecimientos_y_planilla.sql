-- Verificador 505: el traslado entre anexos se declara, y la planilla dice el
-- establecimiento de verdad.
--
-- Tres cosas que pueden deshacerse por separado:
--
--   1. Que un traslado entre almacenes de sucursales distintas se marque como
--      traslado entre establecimientos, con el motivo 04 y los dos codigos. Si
--      esto se rompe, la operacion sigue funcionando --el stock se mueve-- y el
--      contribuyente se queda sin la guia que SUNAT le va a pedir.
--
--   2. Que un traslado dentro de un mismo establecimiento NO se marque. Un
--      verificador que solo comprueba el caso positivo se queda contento con una
--      funcion que marque siempre, y entonces mover mercaderia entre dos
--      almacenes del mismo local pediria guia sin motivo.
--
--   3. Que el codigo de establecimiento de la ficha del T-Registro se derive de
--      la sucursal del empleado y no se pueda escribir a mano. Esta es la que
--      llevaba mal desde la 398: `DEFAULT '0000'` y nadie lo cambiaba, asi que
--      toda la planilla de todos los locales se declaraba en la casa matriz.

BEGIN;

DO $verify$
DECLARE
  v_tenant uuid;
  v_matriz uuid;
  v_anexo uuid;
  v_almacen_matriz uuid;
  v_almacen_matriz_2 uuid;
  v_almacen_anexo uuid;
  v_producto uuid;
  v_actor uuid;
  v_resultado jsonb;
  v_empleado uuid;
  v_codigo text;
  v_ok boolean;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-TRASLADO', 14, 'PE', 'verify-traslado-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  v_matriz := app.casa_matriz_de(v_tenant);

  INSERT INTO public.sucursales (tenant_id, nombre)
  VALUES (v_tenant, 'Anexo traslado')
  RETURNING id INTO v_anexo;

  SELECT id INTO v_actor FROM public.usuarios_sistema WHERE tenant_id = v_tenant LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'VERIFY_505: el alta no dejo usuario de sistema; la comprobacion no mide nada';
  END IF;

  ---------------------------------------------------------------------------
  -- Almacenes: dos en la matriz y uno en el anexo
  ---------------------------------------------------------------------------
  SELECT id INTO v_almacen_matriz
  FROM public.almacenes WHERE tenant_id = v_tenant AND sucursal_id = v_matriz
  ORDER BY created_at LIMIT 1;

  IF v_almacen_matriz IS NULL THEN
    RAISE EXCEPTION 'VERIFY_505: el alta no dejo almacen en la casa matriz';
  END IF;

  INSERT INTO public.almacenes (tenant_id, nombre, codigo, sucursal_id, activo, estado)
  VALUES (v_tenant, 'Segundo de matriz', 'ALM-M2', v_matriz, true, 'ACTIVO')
  RETURNING id INTO v_almacen_matriz_2;

  INSERT INTO public.almacenes (tenant_id, nombre, codigo, sucursal_id, activo, estado)
  VALUES (v_tenant, 'Almacen del anexo', 'ALM-ANX', v_anexo, true, 'ACTIVO')
  RETURNING id INTO v_almacen_anexo;

  ---------------------------------------------------------------------------
  -- Un producto con stock en la matriz
  ---------------------------------------------------------------------------
  SELECT id INTO v_producto
  FROM public.productos
  WHERE tenant_id = v_tenant
    AND COALESCE(activo, true)
    AND NOT COALESCE(es_servicio, false)
    AND COALESCE(controla_stock, true)
  ORDER BY created_at LIMIT 1;

  IF v_producto IS NULL THEN
    RAISE EXCEPTION 'VERIFY_505: el alta no dejo producto con control de stock';
  END IF;

  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant,
    p_producto_id := v_producto,
    p_almacen_id := v_almacen_matriz,
    p_tipo := 'ENTRADA',
    p_cantidad := 100,
    p_referencia_tipo := 'AJUSTE',
    p_referencia_id := gen_random_uuid(),
    p_notas := 'stock para verificar el traslado',
    p_metadata := jsonb_build_object('source', 'verify_505')
  );

  ---------------------------------------------------------------------------
  -- 1. Entre establecimientos: se declara, con motivo 04 y los dos codigos
  ---------------------------------------------------------------------------
  v_resultado := public.transferir_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'producto_id', v_producto,
      'almacen_origen_id', v_almacen_matriz,
      'almacen_destino_id', v_almacen_anexo,
      'cantidad', 5,
      'motivo', 'Reposicion del anexo'
    ),
    v_actor,
    'verify-505-entre-anexos'
  );

  IF COALESCE((v_resultado #>> '{traslado_entre_establecimientos,requiere_gre}')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'VERIFY_505: un traslado entre establecimientos distintos no quedo marcado como tal: %',
      v_resultado #> '{traslado_entre_establecimientos}';
  END IF;

  IF v_resultado #>> '{traslado_entre_establecimientos,motivo_traslado_sunat}' IS DISTINCT FROM '04' THEN
    RAISE EXCEPTION
      'VERIFY_505: el traslado entre establecimientos no declara el motivo 04 de SUNAT';
  END IF;

  IF v_resultado #>> '{traslado_entre_establecimientos,establecimiento_origen}' IS DISTINCT FROM '0000'
     OR v_resultado #>> '{traslado_entre_establecimientos,establecimiento_destino}' IS DISTINCT FROM '0001' THEN
    RAISE EXCEPTION
      'VERIFY_505: los codigos de establecimiento del traslado son % -> %, se esperaba 0000 -> 0001',
      v_resultado #>> '{traslado_entre_establecimientos,establecimiento_origen}',
      v_resultado #>> '{traslado_entre_establecimientos,establecimiento_destino}';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Dentro del mismo establecimiento: NO se declara
  ---------------------------------------------------------------------------
  v_resultado := public.transferir_inventario_tx(
    v_tenant,
    jsonb_build_object(
      'producto_id', v_producto,
      'almacen_origen_id', v_almacen_matriz,
      'almacen_destino_id', v_almacen_matriz_2,
      'cantidad', 3,
      'motivo', 'Reordenar dentro del mismo local'
    ),
    v_actor,
    'verify-505-mismo-local'
  );

  IF jsonb_typeof(COALESCE(v_resultado #> '{traslado_entre_establecimientos}', 'null'::jsonb)) <> 'null' THEN
    RAISE EXCEPTION
      'VERIFY_505: un traslado entre dos almacenes del mismo establecimiento pide guia de remision sin motivo: %',
      v_resultado #> '{traslado_entre_establecimientos}';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Con GRE obligatorio, el traslado entre anexos se bloquea sin guia
  ---------------------------------------------------------------------------
  UPDATE public.empresa_config SET gre_obligatorio = true WHERE tenant_id = v_tenant;

  v_ok := false;
  BEGIN
    PERFORM public.transferir_inventario_tx(
      v_tenant,
      jsonb_build_object(
        'producto_id', v_producto,
        'almacen_origen_id', v_almacen_matriz,
        'almacen_destino_id', v_almacen_anexo,
        'cantidad', 2,
        'motivo', 'Sin guia y con GRE obligatorio'
      ),
      v_actor,
      'verify-505-sin-guia'
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'INVENTORY_TRANSFER_REQUIRES_GRE%' THEN v_ok := true; ELSE RAISE; END IF;
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'VERIFY_505: con GRE obligatorio se pudo mover mercaderia entre establecimientos sin guia de remision';
  END IF;

  UPDATE public.empresa_config SET gre_obligatorio = false WHERE tenant_id = v_tenant;

  ---------------------------------------------------------------------------
  -- 4. La ficha del T-Registro hereda el establecimiento del empleado
  ---------------------------------------------------------------------------
  SELECT id INTO v_empleado FROM public.empleados WHERE tenant_id = v_tenant LIMIT 1;

  IF v_empleado IS NULL THEN
    INSERT INTO public.empleados (tenant_id, nombre, codigo, estado)
    VALUES (v_tenant, 'Empleado de prueba', 'EMP-505', 'ACTIVO')
    RETURNING id INTO v_empleado;
  END IF;

  -- Sin decir nada, el empleado nace en la casa matriz.
  SELECT sucursal_id INTO v_matriz FROM public.empleados WHERE id = v_empleado;
  IF v_matriz IS NULL THEN
    RAISE EXCEPTION 'VERIFY_505: un empleado quedo sin establecimiento';
  END IF;

  UPDATE public.empleados SET sucursal_id = v_anexo WHERE id = v_empleado;

  -- La ficha declara 0000 a mano y aun asi ha de salir con el codigo del anexo.
  INSERT INTO public.rrhh_peru_fichas_laborales (
    tenant_id, empleado_id, pais_emisor_documento, establecimiento_codigo
  )
  VALUES (v_tenant, v_empleado, '604', '0000')
  ON CONFLICT (tenant_id, empleado_id) DO UPDATE
  SET establecimiento_codigo = '0000';

  SELECT establecimiento_codigo INTO v_codigo
  FROM public.rrhh_peru_fichas_laborales
  WHERE tenant_id = v_tenant AND empleado_id = v_empleado;

  IF v_codigo IS DISTINCT FROM '0001' THEN
    RAISE EXCEPTION
      'VERIFY_505: la ficha del T-Registro dice el establecimiento % y el empleado trabaja en el 0001; '
      'el codigo de la planilla se hereda de la sucursal del empleado, no se escribe',
      v_codigo;
  END IF;

  RAISE NOTICE
    'VERIFY_505 OK: el traslado entre anexos se declara con motivo 04, el traslado dentro de un local no, GRE obligatorio lo bloquea sin guia y la planilla hereda el establecimiento del empleado';
END;
$verify$;

ROLLBACK;
