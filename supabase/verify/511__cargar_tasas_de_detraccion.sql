-- Verificador 511: el catalogo de detracciones esta cargado y contrasta bien.
--
-- Lo que se comprueba, y por que cada cosa:
--
--   1. Que el catalogo no este vacio, y que sus tasas caigan en el rango de lo
--      que SUNAT publica. Una tasa fuera de ese rango es un error de carga, y un
--      error de carga en este dato es una multa mas la perdida del credito.
--
--   2. Que los codigos sean de tres digitos. SUNAT los publica asi, y un '37'
--      guardado como '37' no lo encuentra nadie.
--
--   3. Que el contraste use la tasa del catalogo.
--
--   4. Que **por debajo del importe minimo no avise**. Es el defecto que la 511
--      corrige: con el catalogo vacio no se veia, y en cuanto hay tasas, una
--      operacion pequena que no lleva detraccion habria salido senalada por no
--      declarar una que no le corresponde.
--
--   5. Que el 044 siga fuera. Figura como no vigente y cargarlo con cualquier
--      tasa seria inventarla.

BEGIN;

DO $verify$
DECLARE
  v_tenant uuid;
  v_proveedor uuid;
  v_filas integer;
  v_raros text;
  v_contraste jsonb;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  ---------------------------------------------------------------------------
  -- 1. Hay catalogo, y sus tasas son de las que publica SUNAT
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_filas FROM public.tasas_detraccion;
  IF v_filas < 30 THEN
    RAISE EXCEPTION
      'VERIFY_511: el catalogo de detracciones tiene % filas; la carga de la 511 trae 35', v_filas;
  END IF;

  SELECT string_agg(codigo || '=' || tasa, ', ')
    INTO v_raros
  FROM public.tasas_detraccion
  WHERE tasa NOT IN (0.0150, 0.0400, 0.1000, 0.1200, 0.1500);

  IF v_raros IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_511: hay tasas fuera de las que publica SUNAT (1.5, 4, 10, 12 y 15 %%): %', v_raros;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Codigos de tres digitos
  ---------------------------------------------------------------------------
  SELECT string_agg(codigo, ', ') INTO v_raros
  FROM public.tasas_detraccion WHERE codigo !~ '^[0-9]{3}$';

  IF v_raros IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_511: estos codigos no son de tres digitos: %. SUNAT los publica asi y el contraste no los encontraria', v_raros;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. El 044 no esta: figura como no vigente
  ---------------------------------------------------------------------------
  PERFORM 1 FROM public.tasas_detraccion WHERE codigo = '044';
  IF FOUND THEN
    RAISE EXCEPTION
      'VERIFY_511: el codigo 044 esta cargado y figura como no vigente; su tasa seria inventada';
  END IF;

  ---------------------------------------------------------------------------
  -- 4. El contraste usa la tasa del catalogo
  ---------------------------------------------------------------------------
  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-SPOT2', 14, 'PE', 'verify-spot2-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  INSERT INTO public.proveedores (tenant_id, razon_social, estado)
  VALUES (v_tenant, 'Proveedor de servicios', 'ACTIVO')
  RETURNING id INTO v_proveedor;

  -- Codigo 037, demas servicios gravados: 12 % sobre 1180 = 141.60
  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento, fecha_emision,
    subtotal, igv, total, saldo, moneda, estado, detraccion_total, codigo_detraccion
  ) VALUES (
    v_tenant, v_proveedor, 'F001-6001', 'FACTURA', make_date(2026, 5, 10),
    1000, 180, 1180, 1180, 'PEN', 'PENDIENTE', 141.60, '037'
  );

  SELECT metadata #> '{detraccion_contraste}' INTO v_contraste
  FROM public.cuentas_por_pagar
  WHERE tenant_id = v_tenant AND numero_documento = 'F001-6001';

  IF round((v_contraste->>'importe_esperado')::numeric, 2) <> 141.60 THEN
    RAISE EXCEPTION
      'VERIFY_511: el contraste del codigo 037 esperaba % y deberia ser 141.60 (12 %% de 1180)',
      v_contraste->>'importe_esperado';
  END IF;

  ---------------------------------------------------------------------------
  -- 5. Se admite el codigo sin el cero a la izquierda
  ---------------------------------------------------------------------------
  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento, fecha_emision,
    subtotal, igv, total, saldo, moneda, estado, detraccion_total, codigo_detraccion
  ) VALUES (
    v_tenant, v_proveedor, 'F001-6002', 'FACTURA', make_date(2026, 5, 11),
    1000, 180, 1180, 1180, 'PEN', 'PENDIENTE', 141.60, '37'
  );

  SELECT codigo_detraccion INTO v_raros
  FROM public.cuentas_por_pagar
  WHERE tenant_id = v_tenant AND numero_documento = 'F001-6002';

  IF v_raros IS DISTINCT FROM '037' THEN
    RAISE EXCEPTION
      'VERIFY_511: se tecleo el codigo 37 y quedo guardado como %; deberia normalizarse a 037', v_raros;
  END IF;

  ---------------------------------------------------------------------------
  -- 6. Por debajo del importe minimo no se contrasta
  ---------------------------------------------------------------------------
  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento, fecha_emision,
    subtotal, igv, total, saldo, moneda, estado, detraccion_total, codigo_detraccion
  ) VALUES (
    v_tenant, v_proveedor, 'F001-6003', 'FACTURA', make_date(2026, 5, 12),
    500, 90, 590, 590, 'PEN', 'PENDIENTE', 0, '037'
  );

  SELECT metadata #> '{detraccion_contraste}' INTO v_contraste
  FROM public.cuentas_por_pagar
  WHERE tenant_id = v_tenant AND numero_documento = 'F001-6003';

  IF v_contraste IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_511: una operacion de 590 --por debajo del minimo de 700-- se contrasto igual. '
      'No lleva detraccion, y avisarla senala como error lo que es correcto: %', v_contraste;
  END IF;

  RAISE NOTICE
    'VERIFY_511 OK: catalogo cargado con tasas de SUNAT, codigos de tres digitos, 044 fuera, contraste correcto y sin avisar por debajo del minimo';
END;
$verify$;

ROLLBACK;
