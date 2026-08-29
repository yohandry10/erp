-- Verificador 522: un tenant no puede tener dos tasas de impuesto.
--
-- Habia tres sitios calculando el mismo numero:
--
--   ventas (RPC del POS, 451)   -> empresa_config.igv_porcentaje
--   compras (via 439/453/440..) -> app.tasa_impuesto_tenant, que prefiere
--                                  configuracion_fiscal por pais
--   navegador                   -> una constante de lib/initial-country
--
-- El tercero se corrigio antes: el POS exhibia y cobraba un total y registraba
-- otro. Quedaban los dos del servidor, y no coinciden en cuanto el contribuyente
-- toca su porcentaje --el asistente inicial deja escribirlo y
-- `PUT /configuration/empresa` deja cambiarlo--. Comprobado en produccion el
-- 2026-08-28 poniendo un tenant al 10 %: ventas 10,00 y compras 18,00.
--
-- Que las dos ramas discrepen es peor que cualquiera de las dos por separado:
-- el credito fiscal de las compras deja de cuadrar con el debito de las ventas.
--
-- `empresa_config.igv_porcentaje` es la que manda porque es la que el usuario
-- escribe y la que ya usa la venta, que es el camino de mas volumen.
-- `configuracion_fiscal` queda como valor por defecto del pais.

BEGIN;

DO $verify$
DECLARE
  v_tenant uuid;
  v_pais_id integer;
  v_devuelto numeric;
BEGIN
  -- El alta de un contribuyente exige el entorno declarado.
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  -- Se fabrica el contribuyente en vez de buscar uno: la base del gate nace
  -- vacia, y un verificador que se salta la comprobacion por falta de datos no
  -- comprueba nada.
  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-522', 14, 'PE', 'verify-522-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  SELECT ec.pais_id::integer INTO v_pais_id
  FROM public.empresa_config ec WHERE ec.tenant_id = v_tenant;

  IF v_pais_id IS NULL THEN
    RAISE EXCEPTION
      'VERIFY_522: el alta no dejo pais_id en empresa_config, la comprobacion no puede ejercitarse';
  END IF;

  ---------------------------------------------------------------------------
  -- 1. La tasa del contribuyente manda sobre la del pais
  ---------------------------------------------------------------------------

  -- Se separa la del contribuyente de la del pais a proposito, que es el caso
  -- que estaba roto.
  UPDATE public.empresa_config SET igv_porcentaje = 10 WHERE tenant_id = v_tenant;

  v_devuelto := app.tasa_impuesto_tenant(v_tenant);
  IF round(v_devuelto * 100, 2) <> 10.00 THEN
    RAISE EXCEPTION
      'VERIFY_522: el contribuyente declara 10 y compras calcula %; ventas usaria 10 '
      '(empresa_config.igv_porcentaje) y el credito fiscal no cuadraria con el debito',
      round(v_devuelto * 100, 2);
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Sin tasa propia sigue valiendo la del pais
  ---------------------------------------------------------------------------
  -- Quitarle la preferencia a configuracion_fiscal no puede dejar sin tasa a
  -- un tenant que nunca la fijo.
  UPDATE public.empresa_config SET igv_porcentaje = NULL WHERE tenant_id = v_tenant;

  v_devuelto := app.tasa_impuesto_tenant(v_tenant);
  IF v_devuelto IS NULL OR v_devuelto <= 0 THEN
    RAISE EXCEPTION
      'VERIFY_522: sin tasa propia el tenant se queda sin tasa (%), y deberia heredar la del pais',
      v_devuelto;
  END IF;

  IF round(v_devuelto * 100, 2) <> (
    SELECT round(coalesce(cf.tasa_igv, cf.impuesto_principal_porcentaje) * 100, 2)
    FROM public.configuracion_fiscal cf
    WHERE cf.pais_id::text = v_pais_id::text AND coalesce(cf.activo, true) AND cf.tenant_id IS NULL
    ORDER BY cf.updated_at DESC, cf.id LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'VERIFY_522: sin tasa propia deberia heredarse la del pais y se obtuvo %',
      round(v_devuelto * 100, 2);
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Un cero es una tasa, no un hueco
  ---------------------------------------------------------------------------
  -- Exonerado por la Ley de Amazonia. Si el 0 se tratara como «sin dato» se
  -- cobraria el 18 % del pais a quien no debe pagarlo.
  UPDATE public.empresa_config SET igv_porcentaje = 0 WHERE tenant_id = v_tenant;

  v_devuelto := app.tasa_impuesto_tenant(v_tenant);
  IF v_devuelto <> 0 THEN
    RAISE EXCEPTION
      'VERIFY_522: un contribuyente exonerado (tasa 0) recibio %; el cero se esta confundiendo con «sin dato»',
      round(v_devuelto * 100, 2);
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Una tasa imposible ni siquiera se puede guardar
  ---------------------------------------------------------------------------
  -- La funcion tiene un guardia de rango, pero no llega a hacer falta: la
  -- propia tabla lo impide. Se comprueba la restriccion en vez de intentar
  -- escribir un 250, que era lo que hacia este paso y fallaba por el motivo
  -- correcto en el sitio equivocado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_empresa_config_financial_runtime'
      AND pg_get_constraintdef(oid) LIKE '%igv_porcentaje%'
  ) THEN
    RAISE EXCEPTION
      'VERIFY_522: desaparecio la restriccion que acota igv_porcentaje a 0..100, '
      'asi que una tasa absurda podria llegar al calculo';
  END IF;

  RAISE NOTICE
    'VERIFY_522 OK: compras y ventas leen la misma tasa; sin tasa propia se hereda la del pais y el 0 se respeta';
END;
$verify$;

ROLLBACK;
