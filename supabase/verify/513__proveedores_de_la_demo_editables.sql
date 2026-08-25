-- Verificador 513: ningun proveedor queda con una condicion de pago que el
-- sistema no admita.
--
-- La comprobacion que importa es la tercera, y conviene decir por que las otras
-- dos no bastan:
--
--   1. Que no queden filas con 'CREDITO' a secas. Necesaria pero no suficiente:
--      arreglar los datos sin arreglar la semilla solo aplaza el problema hasta
--      la siguiente demo.
--
--   2. Que la semilla escriba una condicion valida. Es la causa.
--
--   3. Que la condicion sembrada **se corresponda con los dias de credito** de
--      ese mismo proveedor. Poner cualquier valor valido habria pasado las dos
--      primeras y habria dejado a un proveedor de 15 dias figurando a 30, que es
--      peor que el error original: este al menos se notaba.

BEGIN;

DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_invalidas integer;
  v_descuadre text;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  ---------------------------------------------------------------------------
  -- 1. No quedan condiciones que el sistema no admita
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_invalidas
  FROM public.proveedores
  WHERE coalesce(condiciones_pago, 'CONTADO')
        NOT IN ('CONTADO', 'CREDITO_15', 'CREDITO_30', 'CREDITO_45', 'CREDITO_60', 'CREDITO_90');

  IF v_invalidas > 0 THEN
    RAISE EXCEPTION
      'VERIFY_513: quedan % proveedores con una condicion de pago que el formulario no admite; '
      'esos proveedores no se pueden editar desde la pantalla', v_invalidas;
  END IF;

  ---------------------------------------------------------------------------
  -- 2 y 3. La semilla siembra una condicion valida y acorde a sus dias
  ---------------------------------------------------------------------------
  -- `create_demo_tenant` no siembra proveedores: quien lo hace es
  -- `hydrate_demo_foundation_464`, y a esa solo se llega por aqui. La
  -- comprobacion de mas abajo se encarga de que esto no pase inadvertido.
  v_demo := public.create_demo_tenant_ready_tx(
    'VERIFY-PROV-513', 1, 'PE', 'verify-prov-513-' || gen_random_uuid()::text
  );
  v_tenant := (v_demo->>'tenant_id')::uuid;

  SELECT string_agg(razon_social || ': ' || coalesce(condiciones_pago, '(nulo)')
                    || ' con ' || coalesce(dias_credito::text, '(nulo)') || ' dias', '; ')
    INTO v_descuadre
  FROM public.proveedores
  WHERE tenant_id = v_tenant
    AND coalesce(condiciones_pago, '') IS DISTINCT FROM
        CASE WHEN coalesce(dias_credito, 0) > 0
             THEN 'CREDITO_' || dias_credito::text
             ELSE 'CONTADO' END;

  IF v_descuadre IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_513: la demo siembra proveedores cuya condicion no se corresponde con sus dias '
      'de credito: %', v_descuadre;
  END IF;

  PERFORM 1 FROM public.proveedores WHERE tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'VERIFY_513: la demo no sembro ningun proveedor, asi que la comprobacion anterior '
      'paso sin mirar nada';
  END IF;

  RAISE NOTICE
    'VERIFY_513 OK: sin condiciones de pago invalidas, y la demo las siembra acordes a sus dias de credito';
END;
$verify$;

ROLLBACK;
