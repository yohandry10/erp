-- Verificador 512: la suspension de cuarta se anota y surte efecto.
--
-- Lo que se comprueba, y por que:
--
--   1. Que anotarla la guarde. Antes de la 512 el campo llegaba a la funcion de
--      actualizacion y se ignoraba **sin decir nada**, que es la peor forma de
--      fallar: el contador cree que quedo registrada y al proveedor le siguen
--      reteniendo el 8 %.
--
--   2. Que sirva para lo que se anota, es decir, que con la constancia vigente
--      el recibo por honorarios no genere retencion. Guardar el dato sin que el
--      calculo lo mire seria igual de inutil.
--
--   3. Que se pueda retirar. La suspension caduca cada ano y hay que poder
--      quitarla sin borrar el proveedor.
--
--   4. Que la actualizacion siga haciendo lo de siempre. La 512 recrea la
--      funcion entera, asi que hay que comprobar que no se llevo nada por
--      delante al copiarla.

BEGIN;

DO $verify$
DECLARE
  v_demo jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_proveedor jsonb;
  v_proveedor_id uuid;
  v_actualizado jsonb;
  v_guardado date;
  v_retencion numeric;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_demo := public.create_demo_tenant('VERIFY SUSPENSION 512', 1, 'PE');
  v_tenant := (v_demo->>'tenant_id')::uuid;
  v_actor := (v_demo->>'user_id')::uuid;

  v_proveedor := public.crear_proveedor_maestro_tx(
    v_tenant, v_actor,
    jsonb_build_object(
      'ruc', '10412345678', 'documento_tipo', 'RUC',
      'razon_social', 'Consultor con suspension', 'email', 'consultor@example.com',
      'condiciones_pago', 'CONTADO', 'limite_credito', 0, 'dias_credito', 0
    )
  );
  v_proveedor_id := (v_proveedor->>'id')::uuid;

  ---------------------------------------------------------------------------
  -- 1. Anotarla la guarda
  ---------------------------------------------------------------------------
  PERFORM public.actualizar_proveedor_maestro_tx(
    v_proveedor_id, v_tenant, v_actor,
    jsonb_build_object('suspension_retencion_cuarta_hasta', '2026-12-31')
  );

  SELECT suspension_retencion_cuarta_hasta INTO v_guardado
  FROM public.proveedores WHERE id = v_proveedor_id;

  IF v_guardado IS DISTINCT FROM DATE '2026-12-31' THEN
    RAISE EXCEPTION
      'VERIFY_512: se anoto la suspension hasta 2026-12-31 y quedo guardado %. '
      'Sin esto el contador cree que la registro y al proveedor le siguen reteniendo.',
      coalesce(v_guardado::text, 'nada');
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Con la constancia vigente no se retiene
  ---------------------------------------------------------------------------
  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento,
    fecha_emision, subtotal, igv, total, saldo, moneda, estado
  ) VALUES (
    v_tenant, v_proveedor_id, 'E001-512', 'RECIBO_HONORARIOS',
    make_date(2026, 6, 10), 5000, 0, 5000, 5000, 'PEN', 'PENDIENTE'
  );

  SELECT monto_retencion INTO v_retencion
  FROM public.libro_retenciones
  WHERE tenant_id = v_tenant AND numero_comprobante = 'E001-512';

  IF v_retencion IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_512: con la suspension vigente se retuvo % sobre un recibo de 5000; '
      'no deberia retenerse nada', v_retencion;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Se puede retirar, y entonces vuelve a retenerse
  ---------------------------------------------------------------------------
  PERFORM public.actualizar_proveedor_maestro_tx(
    v_proveedor_id, v_tenant, v_actor,
    jsonb_build_object('suspension_retencion_cuarta_hasta', '')
  );

  SELECT suspension_retencion_cuarta_hasta INTO v_guardado
  FROM public.proveedores WHERE id = v_proveedor_id;

  IF v_guardado IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_512: la suspension no se pudo retirar y quedo en %. Caduca cada ano '
      'y hay que poder quitarla sin borrar el proveedor.', v_guardado;
  END IF;

  INSERT INTO public.cuentas_por_pagar (
    tenant_id, proveedor_id, numero_documento, tipo_documento,
    fecha_emision, subtotal, igv, total, saldo, moneda, estado
  ) VALUES (
    v_tenant, v_proveedor_id, 'E001-513', 'RECIBO_HONORARIOS',
    make_date(2026, 6, 11), 5000, 0, 5000, 5000, 'PEN', 'PENDIENTE'
  );

  SELECT monto_retencion INTO v_retencion
  FROM public.libro_retenciones
  WHERE tenant_id = v_tenant AND numero_comprobante = 'E001-513';

  IF round(coalesce(v_retencion, 0), 2) <> 400.00 THEN
    RAISE EXCEPTION
      'VERIFY_512: retirada la suspension, la retencion de un recibo de 5000 es % '
      'y deberia volver a ser 400', coalesce(v_retencion, 0);
  END IF;

  ---------------------------------------------------------------------------
  -- 4. La actualizacion sigue haciendo lo de siempre
  ---------------------------------------------------------------------------
  v_actualizado := public.actualizar_proveedor_maestro_tx(
    v_proveedor_id, v_tenant, v_actor,
    jsonb_build_object('razon_social', 'Consultor renombrado', 'limite_credito', 7500)
  );

  IF v_actualizado->>'razon_social' <> 'Consultor renombrado'
     OR (v_actualizado->>'limite_credito')::numeric <> 7500 THEN
    RAISE EXCEPTION
      'VERIFY_512: al recrear la funcion se perdio la actualizacion normal: %', v_actualizado;
  END IF;

  RAISE NOTICE
    'VERIFY_512 OK: la suspension se anota, evita la retencion, se puede retirar y la actualizacion normal sigue intacta';
END;
$verify$;

ROLLBACK;
