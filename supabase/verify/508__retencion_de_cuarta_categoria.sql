-- Verificador 508: la retencion de cuarta se anota, y solo cuando toca.
--
-- Las cuatro comprobaciones cubren las dos formas de equivocarse, que cuestan lo
-- mismo: no retener a quien hay que retener, y retener a quien no.
--
-- La ultima es la que cierra el circulo y la razon de ser de todo esto: lo
-- anotado tiene que quedar donde la planilla electronica lo busca, que es
-- `libro_retenciones` filtrando por `categoria_retencion = 'CUARTA'`. Anotarlo en
-- otro sitio seria trabajo perdido.

BEGIN;

DO $verify$
DECLARE
  v_tenant uuid;
  v_proveedor uuid;
  v_retencion numeric;
  v_tasa numeric;
  v_filas integer;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-4TA', 14, 'PE', 'verify-4ta-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  INSERT INTO public.proveedores (tenant_id, razon_social, estado)
  VALUES (v_tenant, 'Consultor independiente', 'ACTIVO')
  RETURNING id INTO v_proveedor;

  ---------------------------------------------------------------------------
  -- 1. Un recibo por encima del minimo retiene el 8 %
  ---------------------------------------------------------------------------
  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento,
    fecha_emision, subtotal, igv, total, saldo, moneda, estado
  ) VALUES (
    v_tenant, v_proveedor, 'E001-100', 'RECIBO_HONORARIOS',
    make_date(2026, 3, 15), 5000, 0, 5000, 5000, 'PEN', 'PENDIENTE'
  );

  SELECT monto_retencion, tasa_retencion INTO v_retencion, v_tasa
  FROM public.libro_retenciones
  WHERE tenant_id = v_tenant AND numero_comprobante = 'E001-100';

  IF v_retencion IS NULL THEN
    RAISE EXCEPTION
      'VERIFY_508: un recibo por honorarios de 5000 no dejo anotacion en libro_retenciones';
  END IF;

  IF round(v_retencion, 2) <> 400.00 THEN
    RAISE EXCEPTION
      'VERIFY_508: la retencion de un recibo de 5000 es % y deberia ser 400 (8 %%)', v_retencion;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Por debajo del minimo no se retiene
  ---------------------------------------------------------------------------
  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento,
    fecha_emision, subtotal, igv, total, saldo, moneda, estado
  ) VALUES (
    v_tenant, v_proveedor, 'E001-101', 'RECIBO_HONORARIOS',
    make_date(2026, 3, 16), 1200, 0, 1200, 1200, 'PEN', 'PENDIENTE'
  );

  PERFORM 1 FROM public.libro_retenciones
  WHERE tenant_id = v_tenant AND numero_comprobante = 'E001-101';
  IF FOUND THEN
    RAISE EXCEPTION
      'VERIFY_508: se retuvo sobre un recibo de 1200, por debajo del importe minimo';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Con suspension vigente no se retiene
  ---------------------------------------------------------------------------
  UPDATE public.proveedores
  SET suspension_retencion_cuarta_hasta = make_date(2026, 12, 31)
  WHERE id = v_proveedor;

  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento,
    fecha_emision, subtotal, igv, total, saldo, moneda, estado
  ) VALUES (
    v_tenant, v_proveedor, 'E001-102', 'RECIBO_HONORARIOS',
    make_date(2026, 4, 1), 8000, 0, 8000, 8000, 'PEN', 'PENDIENTE'
  );

  PERFORM 1 FROM public.libro_retenciones
  WHERE tenant_id = v_tenant AND numero_comprobante = 'E001-102';
  IF FOUND THEN
    RAISE EXCEPTION
      'VERIFY_508: se retuvo a un proveedor con constancia de suspension vigente';
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Una factura normal no genera retencion de cuarta
  ---------------------------------------------------------------------------
  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento,
    fecha_emision, subtotal, igv, total, saldo, moneda, estado
  ) VALUES (
    v_tenant, v_proveedor, 'F001-500', 'FACTURA',
    make_date(2026, 4, 2), 10000, 1800, 11800, 11800, 'PEN', 'PENDIENTE'
  );

  PERFORM 1 FROM public.libro_retenciones
  WHERE tenant_id = v_tenant AND numero_comprobante = 'F001-500';
  IF FOUND THEN
    RAISE EXCEPTION
      'VERIFY_508: una factura genero retencion de cuarta categoria';
  END IF;

  ---------------------------------------------------------------------------
  -- 5. Queda donde la planilla electronica lo busca
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_filas
  FROM public.libro_retenciones
  WHERE tenant_id = v_tenant
    AND categoria_retencion = 'CUARTA'
    AND estado <> 'ANULADO'
    AND fecha_pago BETWEEN make_date(2026, 3, 1) AND make_date(2026, 3, 31);

  IF v_filas <> 1 THEN
    RAISE EXCEPTION
      'VERIFY_508: la planilla electronica consulta libro_retenciones por categoria CUARTA y '
      'fecha_pago del periodo, y encuentra % filas en marzo de 2026 en vez de 1', v_filas;
  END IF;

  RAISE NOTICE
    'VERIFY_508 OK: se retiene el 8 %% por encima del minimo, no por debajo, no con suspension vigente, no sobre facturas, y queda donde la planilla lo busca';
END;
$verify$;

ROLLBACK;
