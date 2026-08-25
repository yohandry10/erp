-- Verificador 509: la provision de cobranza dudosa provisiona lo que toca, una
-- sola vez, y deja el detalle que exige el Libro de Inventarios y Balances.
--
-- La comprobacion que mas vale es la segunda ejecucion. Un asiento de cierre que
-- se puede lanzar dos veces y duplica el gasto deja el balance peor que sin
-- provisionar, y no se nota: el asiento cuadra, el total simplemente esta al
-- doble.

BEGIN;

DO $verify$
DECLARE
  v_tenant uuid;
  v_cliente uuid;
  v_actor uuid;
  v_resultado jsonb;
  v_segunda jsonb;
  v_asientos integer;
  v_detalle integer;
  v_cxc uuid;
  v_saldo numeric;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-PCD', 14, 'PE', 'verify-pcd-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  SELECT id INTO v_actor FROM public.usuarios_sistema WHERE tenant_id = v_tenant LIMIT 1;
  SELECT id INTO v_cliente FROM public.clientes WHERE tenant_id = v_tenant LIMIT 1;
  IF v_cliente IS NULL THEN
    INSERT INTO public.clientes (tenant_id, razon_social, estado)
    VALUES (v_tenant, 'Cliente moroso', 'ACTIVO') RETURNING id INTO v_cliente;
  END IF;

  -- Las cuentas 68 y 19 se crean al vuelo desde CUENTAS_OPERATIVAS_RUNTIME en el
  -- API, pero esta funcion corre en la base: se siembran aqui igual que haria el
  -- primer asiento que las necesite.
  INSERT INTO public.plan_cuentas (tenant_id, codigo, nombre, tipo, tipo_cuenta, nivel, acepta_movimiento, activo, estado)
  VALUES
    (v_tenant, '68', 'Valuacion y deterioro de activos y provisiones', 'GASTO', 'GASTO', 2, true, true, 'ACTIVO'),
    (v_tenant, '19', 'Estimacion de cuentas de cobranza dudosa', 'ACTIVO', 'ACTIVO', 2, true, true, 'ACTIVO')
  ON CONFLICT DO NOTHING;

  ---------------------------------------------------------------------------
  -- Se trabaja sobre la cuenta por cobrar que deja el alta, no sobre filas
  -- fabricadas: `cuentas_por_cobrar` tiene un trigger que deriva `saldo` y
  -- `estado` de `monto_total`/`monto_pendiente`, asi que una fila insertada a
  -- mano sale normalizada a algo que no es lo que se quiso escribir.
  ---------------------------------------------------------------------------
  SELECT id, round(COALESCE(saldo_pendiente, saldo, 0), 2)
    INTO v_cxc, v_saldo
  FROM public.cuentas_por_cobrar
  WHERE tenant_id = v_tenant
    AND round(COALESCE(saldo_pendiente, saldo, 0), 2) > 0
  ORDER BY created_at
  LIMIT 1;

  IF v_cxc IS NULL THEN
    RAISE EXCEPTION
      'VERIFY_509: el alta no dejo ninguna cuenta por cobrar con saldo; la comprobacion no mide nada';
  END IF;

  ---------------------------------------------------------------------------
  -- 1. Deuda reciente: no se provisiona nada
  ---------------------------------------------------------------------------
  v_resultado := public.provisionar_cobranza_dudosa_tx(v_tenant, '2026-08', v_actor, 360);

  IF (v_resultado->>'documentos')::integer <> 0 THEN
    RAISE EXCEPTION
      'VERIFY_509: se provisiono deuda que no lleva 360 dias vencida: %', v_resultado;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. La misma deuda, vencida hace mas de un ano, si entra
  ---------------------------------------------------------------------------
  -- `ck_cuentas_por_cobrar_fechas_required` exige vencimiento >= emision, asi que
  -- se mueven las dos y no solo una.
  UPDATE public.cuentas_por_cobrar
  SET fecha_emision = make_date(2024, 1, 10),
      fecha_vencimiento = make_date(2024, 2, 10)
  WHERE id = v_cxc;

  v_resultado := public.provisionar_cobranza_dudosa_tx(v_tenant, '2026-08', v_actor, 360);

  IF (v_resultado->>'documentos')::integer <> 1 THEN
    RAISE EXCEPTION
      'VERIFY_509: la deuda vencida hace mas de un ano no se provisiono: %', v_resultado;
  END IF;

  IF round((v_resultado->>'monto_provisionado')::numeric, 2) <> v_saldo THEN
    RAISE EXCEPTION
      'VERIFY_509: se provisiono % y el saldo pendiente del documento es %',
      v_resultado->>'monto_provisionado', v_saldo;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Deja el detalle documento a documento
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_detalle
  FROM public.provisiones_cobranza_dudosa
  WHERE tenant_id = v_tenant AND periodo = '2026-08';

  IF v_detalle <> 1 THEN
    RAISE EXCEPTION
      'VERIFY_509: el detalle por documento tiene % filas; el Libro de Inventarios y Balances exige la estimacion discriminada', v_detalle;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Ejecutarla otra vez no duplica nada
  ---------------------------------------------------------------------------
  v_segunda := public.provisionar_cobranza_dudosa_tx(v_tenant, '2026-08', v_actor, 360);

  IF (v_segunda->>'documentos')::integer <> 0 THEN
    RAISE EXCEPTION
      'VERIFY_509: una segunda ejecucion provisiono % documentos otra vez; el gasto quedaria al doble y el asiento seguiria cuadrando',
      v_segunda->>'documentos';
  END IF;

  SELECT count(*) INTO v_asientos
  FROM public.asientos_contables
  WHERE tenant_id = v_tenant AND upper(COALESCE(origen, '')) = 'PROVISION_COBRANZA_DUDOSA';

  IF v_asientos <> 1 THEN
    RAISE EXCEPTION 'VERIFY_509: hay % asientos de provision y deberia haber uno', v_asientos;
  END IF;

  RAISE NOTICE
    'VERIFY_509 OK: no provisiona deuda reciente, si la vencida hace mas de un ano, deja el detalle por documento y no duplica en una segunda pasada';
END;
$verify$;

ROLLBACK;
