-- Verificador 514: una cuenta bancaria recien sembrada puede registrar un
-- movimiento.
--
-- La comprobacion que vale es la segunda: **registrar el movimiento de verdad**.
-- Mirar solo que la columna no sea nula habria pasado en verde apuntando a la
-- 1042 --la de detracciones-- o a la 10 --de resumen--, y el movimiento habria
-- seguido fallando o, peor, habria entrado en la cuenta equivocada.

BEGIN;

DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_cuenta_bancaria uuid;
  v_contrapartida uuid;
  v_codigo text;
  v_huerfanas integer;
  v_resultado jsonb;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  ---------------------------------------------------------------------------
  -- 1. Ninguna cuenta bancaria se queda sin cuenta contable utilizable
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_huerfanas
  FROM public.cuentas_bancarias cb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.plan_cuentas pc
    WHERE pc.id = cb.cuenta_contable_id
      AND pc.tenant_id = cb.tenant_id
      AND coalesce(pc.acepta_movimiento, false)
      AND lower(coalesce(pc.estado::text, 'activo')) = 'activo'
  );

  IF v_huerfanas > 0 THEN
    RAISE EXCEPTION
      'VERIFY_514: % cuentas bancarias no apuntan a una cuenta del plan que admita '
      'movimiento; en esas, registrar un movimiento bancario falla con '
      'BANK_LEDGER_ACCOUNT_NOT_POSTABLE_IN_TENANT', v_huerfanas;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Una demo nueva registra el movimiento
  ---------------------------------------------------------------------------
  v_demo := public.create_demo_tenant_ready_tx(
    'VERIFY-BANCO-514', 1, 'PE', 'verify-banco-514-' || gen_random_uuid()::text
  );
  v_tenant := (v_demo->>'tenant_id')::uuid;

  SELECT id INTO v_actor FROM public.usuarios_sistema
  WHERE tenant_id = v_tenant AND coalesce(activo, true) LIMIT 1;

  SELECT cb.id, pc.codigo INTO v_cuenta_bancaria, v_codigo
  FROM public.cuentas_bancarias cb
  JOIN public.plan_cuentas pc ON pc.id = cb.cuenta_contable_id
  WHERE cb.tenant_id = v_tenant
  LIMIT 1;

  IF v_cuenta_bancaria IS NULL THEN
    RAISE EXCEPTION
      'VERIFY_514: la demo no sembro ninguna cuenta bancaria con cuenta contable, '
      'asi que la comprobacion anterior paso sin mirar nada';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Y lo hace contra una cuenta corriente operativa, no contra otra cosa
  ---------------------------------------------------------------------------
  IF v_codigo NOT IN ('1041', '104') THEN
    RAISE EXCEPTION
      'VERIFY_514: el banco quedo apuntando a la cuenta %, que no es una corriente '
      'operativa. La 1042 es la de detracciones y la 10 es de resumen: contabilizar '
      'ahi los movimientos del banco los pone en la cuenta equivocada', v_codigo;
  END IF;

  SELECT id INTO v_contrapartida FROM public.plan_cuentas
  WHERE tenant_id = v_tenant AND codigo = '101'
    AND coalesce(acepta_movimiento, false) LIMIT 1;

  IF v_contrapartida IS NULL THEN
    SELECT id INTO v_contrapartida FROM public.plan_cuentas
    WHERE tenant_id = v_tenant AND codigo <> v_codigo
      AND coalesce(acepta_movimiento, false)
      AND lower(coalesce(estado::text, 'activo')) = 'activo'
    LIMIT 1;
  END IF;

  v_resultado := public.registrar_movimiento_bancario_tx(
    v_tenant,
    jsonb_build_object(
      'cuenta_bancaria_id', v_cuenta_bancaria::text,
      'cuenta_contrapartida_id', v_contrapartida::text,
      'tipo', 'ABONO',
      'monto', 100,
      'fecha', current_date::text,
      'descripcion', 'Movimiento de comprobacion del verificador 514',
      'categoria', 'OTRO_INGRESO',
      'moneda', 'PEN'
    ),
    v_actor,
    'verify-514-' || gen_random_uuid()::text
  );

  IF coalesce((v_resultado->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION
      'VERIFY_514: el movimiento bancario no se registro: %', v_resultado;
  END IF;

  RAISE NOTICE
    'VERIFY_514 OK: sin cuentas bancarias huerfanas, la demo apunta a la % y registra su movimiento',
    v_codigo;
END;
$verify$;

ROLLBACK;
