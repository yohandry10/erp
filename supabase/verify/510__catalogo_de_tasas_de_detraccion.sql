-- Verificador 510: el catalogo de detracciones contrasta, y no bloquea.
--
-- La comprobacion que mas importa es la primera: **un codigo que el catalogo no
-- conoce no puede impedir registrar una compra**. El catalogo lo carga la 511
-- desde los apendices de SUNAT, pero siempre habra codigos nuevos o retirados
-- antes de que alguien actualice la carga, y bloquear el registro por eso seria
-- peor que el problema que resuelve.
--
-- La segunda es que, con el catalogo cargado, contraste **sin imponer**. Hay
-- operaciones con reglas especiales y el contador tiene que poder apartarse del
-- catalogo a sabiendas; lo que no puede es hacerlo sin enterarse.

BEGIN;

DO $verify$
DECLARE
  v_tenant uuid;
  v_proveedor uuid;
  v_contraste jsonb;
  v_tasa numeric;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-SPOT', 14, 'PE', 'verify-spot-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  INSERT INTO public.proveedores (tenant_id, razon_social, estado)
  VALUES (v_tenant, 'Proveedor con detraccion', 'ACTIVO')
  RETURNING id INTO v_proveedor;

  ---------------------------------------------------------------------------
  -- 1. Un codigo que el catalogo no conoce no bloquea el registro
  ---------------------------------------------------------------------------
  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento, fecha_emision,
    subtotal, igv, total, saldo, moneda, estado, detraccion_total, codigo_detraccion
  ) VALUES (
    v_tenant, v_proveedor, 'F001-7001', 'FACTURA', make_date(2026, 5, 10),
    1000, 180, 1180, 1180, 'PEN', 'PENDIENTE', 141.60, '999'
  );

  PERFORM 1 FROM public.cuentas_por_pagar
  WHERE tenant_id = v_tenant AND numero_documento = 'F001-7001';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'VERIFY_510: un codigo de detraccion que el catalogo no conoce impidio registrar una compra. '
      'Siempre habra codigos nuevos o retirados antes de que alguien actualice la carga, y '
      'bloquear el registro por eso es peor que el problema que resuelve.';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Con el catalogo cargado, contrasta y deja la constancia
  ---------------------------------------------------------------------------
  -- Se usa un codigo que el catalogo real no trae, para no chocar con la carga
  -- de la 511 ni depender de su contenido.
  INSERT INTO public.tasas_detraccion (codigo, descripcion, anexo, tasa, vigente_desde, fuente)
  VALUES ('999', 'Codigo de prueba del verificador', 'PRUEBA', 0.1200, make_date(2020, 1, 1), 'verificador 510');

  v_tasa := public.tasa_detraccion_vigente('999', make_date(2026, 5, 10));
  IF v_tasa IS DISTINCT FROM 0.1200 THEN
    RAISE EXCEPTION 'VERIFY_510: la tasa vigente del codigo 999 es % y deberia ser 0.12', v_tasa;
  END IF;

  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento, fecha_emision,
    subtotal, igv, total, saldo, moneda, estado, detraccion_total, codigo_detraccion
  ) VALUES (
    v_tenant, v_proveedor, 'F001-7002', 'FACTURA', make_date(2026, 5, 11),
    1000, 180, 1180, 1180, 'PEN', 'PENDIENTE', 141.60, '999'
  );

  SELECT metadata #> '{detraccion_contraste}' INTO v_contraste
  FROM public.cuentas_por_pagar
  WHERE tenant_id = v_tenant AND numero_documento = 'F001-7002';

  IF v_contraste IS NULL THEN
    RAISE EXCEPTION 'VERIFY_510: no quedo constancia del contraste de la detraccion';
  END IF;

  -- 1180 x 12 % = 141.60, que es lo declarado: coinciden.
  IF round((v_contraste->>'importe_esperado')::numeric, 2) <> 141.60 THEN
    RAISE EXCEPTION
      'VERIFY_510: el importe esperado del contraste es % y deberia ser 141.60',
      v_contraste->>'importe_esperado';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Un importe que no cuadra se registra igual, pero queda a la vista
  ---------------------------------------------------------------------------
  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento, fecha_emision,
    subtotal, igv, total, saldo, moneda, estado, detraccion_total, codigo_detraccion
  ) VALUES (
    v_tenant, v_proveedor, 'F001-7003', 'FACTURA', make_date(2026, 5, 12),
    1000, 180, 1180, 1180, 'PEN', 'PENDIENTE', 47.20, '999'
  );

  SELECT metadata #> '{detraccion_contraste}' INTO v_contraste
  FROM public.cuentas_por_pagar
  WHERE tenant_id = v_tenant AND numero_documento = 'F001-7003';

  IF round((v_contraste->>'importe_declarado')::numeric, 2) <> 47.20
     OR round((v_contraste->>'importe_esperado')::numeric, 2) <> 141.60 THEN
    RAISE EXCEPTION
      'VERIFY_510: un importe que no cuadra deberia quedar registrado junto al esperado: %', v_contraste;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Un codigo desconocido no impide registrar la compra
  ---------------------------------------------------------------------------
  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento, fecha_emision,
    subtotal, igv, total, saldo, moneda, estado, detraccion_total, codigo_detraccion
  ) VALUES (
    v_tenant, v_proveedor, 'F001-7004', 'FACTURA', make_date(2026, 5, 13),
    1000, 180, 1180, 1180, 'PEN', 'PENDIENTE', 100, 'ZZZ'
  );

  PERFORM 1 FROM public.cuentas_por_pagar
  WHERE tenant_id = v_tenant AND numero_documento = 'F001-7004';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'VERIFY_510: un codigo de detraccion desconocido impidio registrar la compra';
  END IF;

  RAISE NOTICE
    'VERIFY_510 OK: un codigo desconocido no bloquea, uno del catalogo contrasta y deja constancia, y un importe distinto queda a la vista';
END;
$verify$;

ROLLBACK;
