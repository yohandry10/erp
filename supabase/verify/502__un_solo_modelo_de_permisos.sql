-- Verificador 502: el modelo de permisos es UNO.
--
-- Lo que impide que la duplicacion vuelva. No comprueba que las dos tablas de hoy
-- hayan desaparecido --eso lo hace la migracion y seria un contrato de un solo
-- uso-- sino el invariante: **ninguna tabla espeja a `permisos` o a
-- `rol_permisos`, y ningun trigger sincroniza permisos entre tablas.**
--
-- Escrito asi, una migracion futura que reintrodujera un `permissions_v2` o un
-- `rbac_permissions` con su trigger de sincronizacion tambien lo pondria en rojo.

BEGIN;

DO $verify$
DECLARE
  v_tablas text;
  v_triggers text;
  v_funciones text;
  v_tenant uuid;
  v_permisos integer;
  v_rol_permisos integer;
BEGIN
  ---------------------------------------------------------------------------
  -- Control de la medicion: el modelo canonico tiene que existir y tener datos.
  -- Sin esto, borrar los dos modelos pasaria la comprobacion.
  ---------------------------------------------------------------------------
  IF to_regclass('public.permisos') IS NULL OR to_regclass('public.rol_permisos') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_502: falta el modelo canonico `permisos`/`rol_permisos`';
  END IF;

  -- La compuerta corre sobre un esquema recien creado y vacio, asi que el
  -- verificador siembra su propio contribuyente. Eso convierte el control en algo
  -- mas fuerte que una cuenta de filas: comprueba que el alta sigue poblando el
  -- modelo canonico despues de retirarle el espejo.
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-502', 14, 'PE', 'verify-502-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  SELECT count(*) INTO v_permisos FROM public.permisos WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_rol_permisos
  FROM public.rol_permisos rp
  JOIN public.roles r ON r.id = rp.role_id
  WHERE r.tenant_id = v_tenant;

  IF v_permisos < 100 OR v_rol_permisos < 100 THEN
    RAISE EXCEPTION
      'VERIFY_502: el alta sembro % permisos y % concesiones; sin el espejo el modelo canonico dejo de poblarse',
      v_permisos, v_rol_permisos;
  END IF;

  ---------------------------------------------------------------------------
  -- 1. Ninguna tabla espeja al modelo canonico
  --
  --    Una tabla espejo se reconoce por su forma: columnas `role_id` y
  --    `permission_id`/`permiso_id` fuera de `rol_permisos`, o una tabla de
  --    permisos con `codigo`+`modulo`+`accion` fuera de `permisos`.
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT t.table_name, ', ') INTO v_tablas
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name NOT IN ('rol_permisos', 'permisos')
    AND (
      (
        EXISTS (SELECT 1 FROM information_schema.columns c
                 WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                   AND c.column_name = 'role_id')
        AND EXISTS (SELECT 1 FROM information_schema.columns c
                     WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                       AND c.column_name IN ('permission_id', 'permiso_id'))
      )
      OR (
        EXISTS (SELECT 1 FROM information_schema.columns c
                 WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                   AND c.column_name = 'codigo')
        AND EXISTS (SELECT 1 FROM information_schema.columns c
                     WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                       AND c.column_name = 'modulo')
        AND EXISTS (SELECT 1 FROM information_schema.columns c
                     WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                       AND c.column_name = 'accion')
      )
    );

  IF v_tablas IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_502: hay tablas que espejan el modelo de permisos: %. El RBAC vive en `permisos`/`rol_permisos` y en ningun otro sitio.',
      v_tablas;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Ningun trigger sincroniza permisos entre tablas
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT c.relname || '.' || tg.tgname, ', ') INTO v_triggers
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT tg.tgisinternal
    AND n.nspname = 'public'
    AND c.relname IN ('permisos', 'rol_permisos')
    AND tg.tgname ~* 'sync|mirror|espejo|legacy';

  IF v_triggers IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_502: hay triggers de sincronizacion sobre el modelo canonico: %', v_triggers;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Ninguna funcion viva reintroduce el par legado
  ---------------------------------------------------------------------------
  SELECT string_agg(DISTINCT n.nspname || '.' || p.proname, ', ') INTO v_funciones
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('app', 'public')
    -- Referencias reales a la tabla, no la palabra suelta: hay funciones con
    -- variables `v_permissions`, CTEs `parsed_permissions` y parametros de salida
    -- `role_permissions_seeded` que no tocan tabla ninguna.
    AND p.prosrc ~* '(public[.]|from[[:space:]]+|join[[:space:]]+|into[[:space:]]+|update[[:space:]]+|table[[:space:]]+|''|")(role_)?permissions([^_[:alnum:]]|$)';

  IF v_funciones IS NOT NULL THEN
    RAISE EXCEPTION
      'VERIFY_502: hay funciones que siguen nombrando el modelo legado: %', v_funciones;
  END IF;

  RAISE NOTICE
    'VERIFY_502 OK: un solo modelo de permisos (% permisos, % concesiones), sin espejos, sin triggers de sincronizacion y sin funciones que lo nombren',
    v_permisos, v_rol_permisos;
END;
$verify$;

ROLLBACK;
