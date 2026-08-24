-- Verificador 503: la sucursal es un establecimiento anexo, no una etiqueta.
--
-- Comprueba las cuatro cosas que pueden deshacerse por separado:
--
--   1. El invariante de datos --todo contribuyente tiene exactamente una casa
--      matriz-- y que lo sostiene un trigger, no el relleno de la migracion. Se
--      comprueba dando de alta un contribuyente nuevo dentro del propio
--      verificador: si alguien retira el trigger, el relleno historico seguiria
--      pareciendo correcto y esto fallaria igualmente.
--
--   2. Que la frontera entre contribuyentes es del motor. Se intenta enganchar
--      una serie al establecimiento de otro contribuyente y ha de reventar. Un
--      trigger de validacion se puede desactivar con ALTER TABLE; una clave
--      foranea compuesta no.
--
--   3. Que "sin asignacion, ve todas" sigue siendo cierto en los dos sentidos.
--      Es la regla que hace que aplicar la 503 no le quite el acceso a nadie, y
--      es facil de romper sin querer al escribir el primer filtro por sucursal.
--
--   4. Que la contabilidad NO esta partida por sucursal. Esto no es una
--      omision que haya que vigilar por si acaso: los libros electronicos son
--      por RUC y colgar `sucursal_id` de un asiento describiria mal el producto
--      y lo que SUNAT recibe. Se afirma aqui para que la proxima migracion que
--      lo intente se encuentre un rojo y una explicacion, en vez de colarlo.

BEGIN;

DO $verify$
DECLARE
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_sucursal_b uuid;
  v_serie_a uuid;
  v_usuario uuid;
  v_sucursal_nueva uuid;
  v_huerfanas text;
  v_sin_matriz text;
  v_visibles integer;
  v_infractores text;
  v_ok boolean;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  ---------------------------------------------------------------------------
  -- 1. Todo contribuyente tiene exactamente una casa matriz
  ---------------------------------------------------------------------------
  SELECT string_agg(t.id::text, ', ')
    INTO v_sin_matriz
  FROM public.tenants t
  WHERE (
    SELECT count(*) FROM public.sucursales s
    WHERE s.tenant_id = t.id AND s.es_principal
  ) <> 1;

  IF v_sin_matriz IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_503: hay contribuyentes sin exactamente una casa matriz: %', v_sin_matriz;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. La casa matriz la pone el trigger, no el relleno de la migracion
  ---------------------------------------------------------------------------
  v_tenant_a := (public.create_demo_tenant_ready_tx(
    'VERIFY-SUC-A', 14, 'PE', 'verify-suc-a-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  PERFORM 1 FROM public.sucursales
  WHERE tenant_id = v_tenant_a AND es_principal AND codigo_establecimiento = '0000';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'VERIFY_503: un contribuyente recien creado no recibio casa matriz; el trigger no esta puesto';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. El codigo de establecimiento es unico por contribuyente
  ---------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.sucursales (tenant_id, nombre, codigo_establecimiento)
    VALUES (v_tenant_a, 'Duplicada', '0000');
    RAISE EXCEPTION
      'VERIFY_503: se admitio un segundo establecimiento 0000 en el mismo contribuyente';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  -- Y se autoasigna correlativo cuando no se teclea.
  INSERT INTO public.sucursales (tenant_id, nombre)
  VALUES (v_tenant_a, 'Sucursal Arequipa')
  RETURNING id INTO v_sucursal_nueva;

  PERFORM 1 FROM public.sucursales
  WHERE id = v_sucursal_nueva AND codigo_establecimiento = '0001' AND NOT es_principal;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'VERIFY_503: la sucursal nueva no recibio el codigo correlativo 0001 o quedo marcada como principal';
  END IF;

  ---------------------------------------------------------------------------
  -- 4. La casa matriz no se apaga
  ---------------------------------------------------------------------------
  v_ok := false;
  BEGIN
    UPDATE public.sucursales
    SET activo = false
    WHERE tenant_id = v_tenant_a AND es_principal;
  EXCEPTION
    WHEN others THEN v_ok := true;
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'VERIFY_503: se pudo desactivar la casa matriz';
  END IF;

  ---------------------------------------------------------------------------
  -- 5. La frontera entre contribuyentes la sostiene el motor
  ---------------------------------------------------------------------------
  v_tenant_b := (public.create_demo_tenant_ready_tx(
    'VERIFY-SUC-B', 14, 'PE', 'verify-suc-b-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  SELECT id INTO v_sucursal_b
  FROM public.sucursales WHERE tenant_id = v_tenant_b AND es_principal;

  SELECT id INTO v_serie_a
  FROM public.documento_series WHERE tenant_id = v_tenant_a LIMIT 1;

  IF v_serie_a IS NULL THEN
    INSERT INTO public.documento_series (tenant_id, tipo_documento, serie, sucursal_id)
    SELECT v_tenant_a, '01', 'F900', s.id
    FROM public.sucursales s WHERE s.tenant_id = v_tenant_a AND s.es_principal
    RETURNING id INTO v_serie_a;
  END IF;

  v_ok := false;
  BEGIN
    UPDATE public.documento_series SET sucursal_id = v_sucursal_b WHERE id = v_serie_a;
  EXCEPTION
    WHEN foreign_key_violation THEN v_ok := true;
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'VERIFY_503: una serie acepto el establecimiento de otro contribuyente';
  END IF;

  ---------------------------------------------------------------------------
  -- 6. Nada operativo queda sin establecimiento
  ---------------------------------------------------------------------------
  SELECT string_agg(x.tabla || ':' || x.n, ', ')
    INTO v_huerfanas
  FROM (
    SELECT 'documento_series' AS tabla, count(*)::text AS n
      FROM public.documento_series WHERE tenant_id IS NOT NULL AND sucursal_id IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'almacenes', count(*)::text
      FROM public.almacenes WHERE tenant_id IS NOT NULL AND sucursal_id IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'cajas', count(*)::text
      FROM public.cajas WHERE tenant_id IS NOT NULL AND sucursal_id IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'ventas', count(*)::text
      FROM public.ventas WHERE tenant_id IS NOT NULL AND sucursal_id IS NULL
    HAVING count(*) > 0
  ) x;

  IF v_huerfanas IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_503: hay filas operativas sin establecimiento: %', v_huerfanas;
  END IF;

  ---------------------------------------------------------------------------
  -- 7. Sin asignacion ve todas; con asignacion ve las suyas
  ---------------------------------------------------------------------------
  SELECT id INTO v_usuario
  FROM public.usuarios_sistema WHERE tenant_id = v_tenant_a LIMIT 1;

  IF v_usuario IS NULL THEN
    RAISE EXCEPTION
      'VERIFY_503: el alta no dejo ningun usuario de sistema; la comprobacion de alcance no mide nada';
  END IF;

  SELECT count(*) INTO v_visibles
  FROM public.sucursales_visibles(v_tenant_a, v_usuario);

  IF v_visibles <> (SELECT count(*) FROM public.sucursales WHERE tenant_id = v_tenant_a AND activo) THEN
    RAISE EXCEPTION
      'VERIFY_503: un usuario sin asignacion no ve todos los establecimientos (%)', v_visibles;
  END IF;

  INSERT INTO public.usuario_sucursales (tenant_id, usuario_sistema_id, sucursal_id)
  VALUES (v_tenant_a, v_usuario, v_sucursal_nueva);

  SELECT count(*) INTO v_visibles
  FROM public.sucursales_visibles(v_tenant_a, v_usuario);

  IF v_visibles <> 1 THEN
    RAISE EXCEPTION
      'VERIFY_503: un usuario asignado a un establecimiento ve % en vez de 1', v_visibles;
  END IF;

  -- Y no se le puede asignar el establecimiento de otro contribuyente.
  v_ok := false;
  BEGIN
    INSERT INTO public.usuario_sucursales (tenant_id, usuario_sistema_id, sucursal_id)
    VALUES (v_tenant_a, v_usuario, v_sucursal_b);
  EXCEPTION
    WHEN foreign_key_violation THEN v_ok := true;
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'VERIFY_503: se asigno a un usuario el establecimiento de otro contribuyente';
  END IF;

  ---------------------------------------------------------------------------
  -- 8. El techo: dar de alta establecimientos es cosa de administracion
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT upper(r.nombre) || ':' || lower(p.codigo), ', ')
    INTO v_infractores
  FROM public.roles r
  JOIN public.rol_permisos rp ON rp.role_id = r.id AND COALESCE(rp.concedido, true)
  JOIN public.permisos p ON p.id = rp.permiso_id
  WHERE r.tenant_id = v_tenant_a
    AND upper(btrim(COALESCE(r.nombre, ''))) NOT IN ('ADMIN', 'ADMIN_DEMO', 'SUPER_ADMIN', 'ADMINISTRADOR')
    AND lower(p.codigo) IN (
      'configuracion.sucursales.create',
      'configuracion.sucursales.update',
      'configuracion.sucursales.delete',
      'configuracion.sucursales.assign'
    );

  IF v_infractores IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_503: un rol no administrativo puede gestionar establecimientos: %', v_infractores;
  END IF;

  -- Y el permiso existe, para que el techo no pase por estar vacio el catalogo.
  PERFORM 1 FROM public.permisos
  WHERE tenant_id = v_tenant_a AND lower(codigo) = 'configuracion.sucursales.create';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'VERIFY_503: el catalogo no tiene configuracion.sucursales.create; el techo no mide nada';
  END IF;

  ---------------------------------------------------------------------------
  -- 8b. La migracion no duplico sedes
  --
  --    Este fallo no se ve en una cadena limpia: alli `sucursales` esta vacia y
  --    la casa matriz se crea sin conflicto. En produccion habia 58 filas
  --    'Sede Lima', una por contribuyente, y la primera version de la 503 les
  --    creaba una casa matriz al lado y degradaba la sede real a anexo. La regla
  --    correcta es promover la que ya estaba; aqui se comprueba que se respeto:
  --    ninguna casa matriz creada por la migracion puede convivir con otra
  --    sucursal anterior en el mismo contribuyente.
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT s.tenant_id::text, ', ')
    INTO v_infractores
  FROM public.sucursales s
  WHERE s.metadata->>'source' = 'migration_503'
    AND EXISTS (
      SELECT 1 FROM public.sucursales o
      WHERE o.tenant_id = s.tenant_id
        AND o.id <> s.id
        AND o.created_at < s.created_at
    );

  IF v_infractores IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_503: la migracion creo una casa matriz junto a una sede que ya existia en %; '
      'la sede que el contribuyente ya tenia se promueve, no se duplica', v_infractores;
  END IF;

  ---------------------------------------------------------------------------
  -- 9. La contabilidad no esta partida por sucursal, y es a proposito
  ---------------------------------------------------------------------------
  PERFORM 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('asientos_contables', 'detalle_asientos')
    AND column_name = 'sucursal_id';

  IF FOUND THEN
    RAISE EXCEPTION
      'VERIFY_503: aparecio sucursal_id en la contabilidad. Los libros electronicos son '
      'por RUC, no por establecimiento: el resultado por local se obtiene con '
      'centros_costo, que ya llega a detalle_asientos y al que la sucursal apunta '
      'con centro_costo_id. Si de verdad hace falta contabilidad separada, lo que '
      'hace falta es otro RUC, y eso es un tenant con su grupo de consolidacion.';
  END IF;

  RAISE NOTICE
    'VERIFY_503 OK: casa matriz por trigger, codigos unicos, frontera por clave foranea compuesta, alcance de usuario y contabilidad sin partir';
END;
$verify$;

ROLLBACK;
