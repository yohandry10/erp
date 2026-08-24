-- Verificador 507: el destino del credito fiscal existe, se valida y no cambia
-- nada de lo que ya estaba.
--
-- La tercera comprobacion es la que de verdad protege: **el defecto tiene que
-- seguir siendo GRAVADAS**. Si alguien cambia ese defecto a COMUN o a
-- NO_GRAVADAS "por prudencia", toda compra registrada sin clasificar dejaria de
-- dar credito fiscal integro y el IGV a pagar de todos los contribuyentes que no
-- usan la prorrata subiria sin que nadie tocara una declaracion.

BEGIN;

DO $verify$
DECLARE
  v_tenant uuid;
  v_proveedor uuid;
  v_destino text;
  v_ok boolean;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  ---------------------------------------------------------------------------
  -- 1. La columna existe con su restriccion
  ---------------------------------------------------------------------------
  PERFORM 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'cuentas_por_pagar'
    AND column_name = 'destino_credito_fiscal';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERIFY_507: falta cuentas_por_pagar.destino_credito_fiscal';
  END IF;

  PERFORM 1 FROM pg_constraint
  WHERE conname = 'ck_cuentas_por_pagar_destino_credito_fiscal';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'VERIFY_507: falta la restriccion que limita el destino a GRAVADAS, NO_GRAVADAS y COMUN';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. El defecto sigue siendo GRAVADAS
  ---------------------------------------------------------------------------
  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-CF', 14, 'PE', 'verify-cf-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  SELECT id INTO v_proveedor FROM public.proveedores WHERE tenant_id = v_tenant LIMIT 1;
  IF v_proveedor IS NULL THEN
    INSERT INTO public.proveedores (tenant_id, razon_social, estado)
    VALUES (v_tenant, 'Proveedor de prueba', 'ACTIVO')
    RETURNING id INTO v_proveedor;
  END IF;

  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento,
    fecha_emision, subtotal, igv, total, saldo, moneda, estado
  )
  VALUES (
    v_tenant, v_proveedor, 'F001-9001', 'FACTURA',
    current_date, 100, 18, 118, 118, 'PEN', 'PENDIENTE'
  );

  SELECT destino_credito_fiscal INTO v_destino
  FROM public.cuentas_por_pagar
  WHERE tenant_id = v_tenant AND numero_documento = 'F001-9001';

  IF v_destino IS DISTINCT FROM 'GRAVADAS' THEN
    RAISE EXCEPTION
      'VERIFY_507: una compra registrada sin clasificar quedo como % en vez de GRAVADAS. '
      'El defecto tiene que ser GRAVADAS: cambiarlo sube el IGV a pagar de todo el que no '
      'usa la prorrata, sin que nadie toque una declaracion.', v_destino;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Un destino inventado se rechaza
  ---------------------------------------------------------------------------
  v_ok := false;
  BEGIN
    UPDATE public.cuentas_por_pagar
    SET destino_credito_fiscal = 'PARCIAL'
    WHERE tenant_id = v_tenant AND numero_documento = 'F001-9001';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'CREDITO_FISCAL:%' THEN v_ok := true; ELSE RAISE; END IF;
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'VERIFY_507: se admitio un destino de credito fiscal que no existe en la ley';
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Los tres destinos legitimos se admiten, en minusculas tambien
  ---------------------------------------------------------------------------
  UPDATE public.cuentas_por_pagar
  SET destino_credito_fiscal = 'comun'
  WHERE tenant_id = v_tenant AND numero_documento = 'F001-9001';

  SELECT destino_credito_fiscal INTO v_destino
  FROM public.cuentas_por_pagar
  WHERE tenant_id = v_tenant AND numero_documento = 'F001-9001';

  IF v_destino IS DISTINCT FROM 'COMUN' THEN
    RAISE EXCEPTION 'VERIFY_507: el destino no se normalizo a mayusculas: %', v_destino;
  END IF;

  RAISE NOTICE
    'VERIFY_507 OK: destino del credito fiscal con sus tres valores, defecto GRAVADAS y normalizacion';
END;
$verify$;

ROLLBACK;
