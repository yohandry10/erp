-- Verificador 504: la operacion hereda su sucursal y no puede mentir.
--
-- Lo que puede deshacerse aqui, y por eso se comprueba por separado:
--
--   1. Que las cinco tablas operativas tengan la columna. Es lo barato y es lo
--      primero que se cae si alguien reconstruye una tabla.
--
--   2. Que la derivacion ocurra sola. Una venta de POS insertada sin decir nada
--      ha de salir sellada en la sucursal de su caja, no en la casa matriz. Si
--      esto se rompe todo sigue "funcionando" --hay un valor, hay informes-- solo
--      que todas las ventas de todas las sucursales aparecen en la matriz.
--
--   3. Que la mentira se rechace. Es el motivo entero del trigger: sin esto el
--      valor derivado deja de serlo en cuanto alguien lo escriba a mano, y el
--      descuadre no lo detecta nadie hasta que los informes no cuadran.
--
--   4. Que la vista de stock por sucursal exista y sea `security_invoker`. Una
--      vista sobre tablas con RLS que deje de serlo se convierte en un agujero
--      entre contribuyentes, no en una comodidad.
--
--   5. Que no quede operacion sin establecimiento.

BEGIN;

DO $verify$
DECLARE
  v_tenant uuid;
  v_matriz uuid;
  v_anexo uuid;
  v_almacen_anexo uuid;
  v_caja_anexo uuid;
  v_sesion uuid;
  v_venta uuid;
  v_faltan text;
  v_huerfanas text;
  v_sellada uuid;
  v_ok boolean;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  ---------------------------------------------------------------------------
  -- 1. Las cinco tablas tienen la columna
  ---------------------------------------------------------------------------
  SELECT string_agg(t, ', ')
    INTO v_faltan
  FROM unnest(ARRAY[
    'ventas_pos', 'sesiones_caja', 'movimientos_inventario',
    'cpe', 'documentos'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t AND column_name = 'sucursal_id'
  );

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_504: estas tablas operativas no saben en que establecimiento ocurrieron: %', v_faltan;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. La derivacion ocurre sola, y apunta al anexo y no a la matriz
  ---------------------------------------------------------------------------
  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-SUC-OP', 14, 'PE', 'verify-suc-op-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  v_matriz := app.casa_matriz_de(v_tenant);

  INSERT INTO public.sucursales (tenant_id, nombre)
  VALUES (v_tenant, 'Anexo de prueba')
  RETURNING id INTO v_anexo;

  IF v_anexo = v_matriz THEN
    RAISE EXCEPTION 'VERIFY_504: el anexo salio siendo la casa matriz; la comprobacion no mide nada';
  END IF;

  INSERT INTO public.almacenes (tenant_id, nombre, codigo, sucursal_id, activo, estado)
  VALUES (v_tenant, 'Almacen anexo', 'ALM-ANEXO', v_anexo, true, 'ACTIVO')
  RETURNING id INTO v_almacen_anexo;

  -- `cajas` no tiene columna `activo`: su estado vive solo en `estado`.
  INSERT INTO public.cajas (tenant_id, nombre, codigo, almacen_id, sucursal_id, estado)
  VALUES (v_tenant, 'Caja anexo', 'CAJA-ANEXO', v_almacen_anexo, v_anexo, 'ACTIVO')
  RETURNING id INTO v_caja_anexo;

  -- La sesion no dice su sucursal: ha de heredarla de la caja.
  INSERT INTO public.sesiones_caja (tenant_id, caja_id, estado)
  VALUES (v_tenant, v_caja_anexo, 'ABIERTA')
  RETURNING id INTO v_sesion;

  SELECT sucursal_id INTO v_sellada FROM public.sesiones_caja WHERE id = v_sesion;
  IF v_sellada IS DISTINCT FROM v_anexo THEN
    RAISE EXCEPTION
      'VERIFY_504: la sesion de caja quedo en % y su caja esta en %', v_sellada, v_anexo;
  END IF;

  -- La venta de POS tampoco: ha de heredarla de la caja de su sesion.
  -- `moneda` no tiene defecto desde la migracion 500: la venta declara la suya.
  INSERT INTO public.ventas_pos (tenant_id, sesion_caja_id, total, estado, moneda)
  VALUES (v_tenant, v_sesion, 100, 'PAGADA', 'PEN')
  RETURNING id INTO v_venta;

  SELECT sucursal_id INTO v_sellada FROM public.ventas_pos WHERE id = v_venta;
  IF v_sellada IS DISTINCT FROM v_anexo THEN
    RAISE EXCEPTION
      'VERIFY_504: la venta de POS quedo en % y la caja de su sesion esta en %', v_sellada, v_anexo;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. La mentira se rechaza
  ---------------------------------------------------------------------------
  v_ok := false;
  BEGIN
    UPDATE public.ventas_pos SET sucursal_id = v_matriz WHERE id = v_venta;
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'SUCURSAL_DERIVADA:%' THEN v_ok := true; ELSE RAISE; END IF;
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'VERIFY_504: se pudo sellar a mano una venta de POS en una sucursal distinta a la de su caja';
  END IF;

  ---------------------------------------------------------------------------
  -- 4. La vista de stock por sucursal existe y no escala privilegios
  ---------------------------------------------------------------------------
  IF to_regclass('public.stock_por_sucursal') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_504: falta la vista stock_por_sucursal';
  END IF;

  PERFORM 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'stock_por_sucursal'
    AND c.reloptions @> ARRAY['security_invoker=true'];

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'VERIFY_504: stock_por_sucursal no es security_invoker; una vista sobre tablas con RLS que '
      'corre con los privilegios de su dueno cruza la frontera entre contribuyentes';
  END IF;

  ---------------------------------------------------------------------------
  -- 5. Nada operativo sin establecimiento
  ---------------------------------------------------------------------------
  SELECT string_agg(x.tabla || ':' || x.n, ', ')
    INTO v_huerfanas
  FROM (
    SELECT 'ventas_pos' AS tabla, count(*)::text AS n
      FROM public.ventas_pos WHERE tenant_id IS NOT NULL AND sucursal_id IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'sesiones_caja', count(*)::text
      FROM public.sesiones_caja WHERE tenant_id IS NOT NULL AND sucursal_id IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'movimientos_inventario', count(*)::text
      FROM public.movimientos_inventario WHERE tenant_id IS NOT NULL AND sucursal_id IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'cpe', count(*)::text
      FROM public.cpe WHERE tenant_id IS NOT NULL AND sucursal_id IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'documentos', count(*)::text
      FROM public.documentos WHERE tenant_id IS NOT NULL AND sucursal_id IS NULL
    HAVING count(*) > 0
  ) x;

  IF v_huerfanas IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_504: hay operaciones sin establecimiento: %', v_huerfanas;
  END IF;

  ---------------------------------------------------------------------------
  -- 6. El API sabe exactamente que tablas filtrar
  --
  --    `TABLAS_CON_SUCURSAL`, en
  --    apps/erp-api/src/shared/tenant/sucursal-scope.ts, es la lista que decide
  --    a que consultas se les aplica el alcance del usuario. Una lista escrita a
  --    mano se queda obsoleta el dia que alguien anade la columna a una tabla
  --    nueva --y entonces esa tabla deja de filtrar, en silencio, que es la peor
  --    forma de fallar--. Aqui se compara con lo que la base dice de verdad.
  ---------------------------------------------------------------------------
  SELECT string_agg(rel, ', ' ORDER BY rel)
    INTO v_faltan
  FROM (
    SELECT c.relname AS rel
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND a.attname = 'sucursal_id'
      AND NOT a.attisdropped
      AND c.relkind IN ('r', 'v')
      AND c.relname <> 'usuario_sucursales'
    EXCEPT
    SELECT unnest(ARRAY[
      'documento_series', 'almacenes', 'cajas', 'ventas',
      'ventas_pos', 'sesiones_caja', 'movimientos_inventario', 'cpe', 'documentos',
      'cpe_documentos', 'stock_por_sucursal',
      -- Estas dos llevan la columna desde la migracion 025 y su NULL significa
      -- "global, sin establecimiento": es la clave de los upsert de inventario.
      'producto_precios_sucursal', 'producto_stock_sucursal'
    ])
  ) x;

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_504: estas relaciones llevan sucursal_id y el API no las filtra: %. '
      'Anadelas a TABLAS_CON_SUCURSAL en apps/erp-api/src/shared/tenant/sucursal-scope.ts '
      'y a la lista de este verificador, o el alcance por sucursal no se aplica sobre ellas.',
      v_faltan;
  END IF;

  RAISE NOTICE
    'VERIFY_504 OK: cinco tablas operativas heredan su sucursal del ancla, la mentira se rechaza, el stock por sucursal se consulta sin saltos y el API filtra todas las relaciones que llevan la columna';
END;
$verify$;

ROLLBACK;
