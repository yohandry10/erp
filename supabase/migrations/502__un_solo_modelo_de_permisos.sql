-- 502__un_solo_modelo_de_permisos.sql
--
-- El RBAC vivia por duplicado. `permisos`/`rol_permisos` es el modelo canonico
-- --el que consultan los guards del API, el que usan las 21 funciones de sembrado
-- y sobre el que estan escritas todas las exclusiones-- y `permissions`/
-- `role_permissions` es un modelo legado que nadie lee y que seis triggers
-- mantenian sincronizado en ambos sentidos:
--
--     permisos          <-> permissions        (2 triggers)
--     rol_permisos      <-> role_permissions   (4 triggers)
--
-- No es una molestia estetica. Al auditar el desbordamiento de ADMIN_DEMO
-- (migracion 501) mirar una sola de las dos tablas daba media respuesta, y ver una
-- fila en la legada no distinguia el origen del reflejo: hubo que instrumentar las
-- dos para saber cual disparaba primero. Un sistema de permisos con dos tablas
-- espejo es un sistema en el que cualquier comprobacion de seguridad puede estar
-- mirando la mitad equivocada.
--
-- Se comprueba antes de retirarlo, y no de oido:
--
--   * Conteos identicos en produccion: permisos 16 896 = permissions 16 896,
--     rol_permisos 59 809 = role_permissions 59 809.
--   * Espejo exacto fila a fila en las cuatro direcciones: cero permisos sin
--     reflejo, cero `permissions` huerfanos, cero `rol_permisos` sin reflejo, cero
--     `role_permissions` huerfanos. El par legado no contiene un solo dato propio.
--   * Cero codigo TypeScript lo consulta: no hay un `.from('permissions')` ni un
--     `.from('role_permissions')` en el API, la web, el worker ni las libs.
--   * Las cuatro funciones que parecian escribirlo --`seed_operational_rbac_for_`
--     `tenant`, `sembrar_rbac_canonico`, `sembrar_permiso_pos_canje_471` y
--     `seed_operational_rbac_for_tenant_base_383`-- son falsos positivos: nombran
--     `role_permissions_seeded`, que es un parametro de salida, no la tabla.
--   * El unico validador que lo nombraba de verdad, `validar_permissions_tenants_`
--     `runtime` con su vista, existe solo para vigilar la duplicacion; lo nombra
--     unicamente la migracion 059 que lo creo.
--
-- Las tablas se retiran con DROP TABLE sin CASCADE a proposito: si quedara una
-- dependencia sin localizar, la migracion falla en el clustar efimero en vez de
-- llevarsela por delante en silencio.
--
-- Lo que impide que vuelva es el verificador del mismo numero, que falla si
-- reaparece cualquiera de las dos tablas o cualquier trigger de sincronizacion.

BEGIN;

---------------------------------------------------------------------------
-- 1. Cortar el espejo
---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_sync_permissions_from_permisos ON public.permisos;
DROP TRIGGER IF EXISTS trg_sync_permisos_from_permissions ON public.permissions;
DROP TRIGGER IF EXISTS trg_sync_role_permissions_from_rol_permisos ON public.rol_permisos;
DROP TRIGGER IF EXISTS trg_sync_legacy_role_permissions_immediate_487 ON public.rol_permisos;
DROP TRIGGER IF EXISTS trg_sync_rol_permisos_from_role_permissions ON public.role_permissions;
DROP TRIGGER IF EXISTS trg_sync_role_permissions_immediate_487 ON public.role_permissions;

DROP FUNCTION IF EXISTS app.sync_permissions_from_permisos();
DROP FUNCTION IF EXISTS app.sync_permisos_from_permissions();
DROP FUNCTION IF EXISTS app.sync_rol_permisos_from_role_permissions();
DROP FUNCTION IF EXISTS app.sync_role_permissions_from_rol_permisos();
DROP FUNCTION IF EXISTS app.sync_legacy_role_permissions_immediate_487();
DROP FUNCTION IF EXISTS app.sync_role_permissions_deferred_487();

---------------------------------------------------------------------------
-- 2. Retirar el validador que solo existia para vigilar la duplicacion
---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_permissions_tenants_runtime_status_actual;
DROP FUNCTION IF EXISTS public.validar_permissions_tenants_runtime(uuid);

---------------------------------------------------------------------------
-- 3. Las tablas legadas y sus guardianes propios
---------------------------------------------------------------------------

DROP TABLE public.role_permissions;
DROP TABLE public.permissions;

DROP FUNCTION IF EXISTS app.enforce_tenant_role_permissions();
DROP FUNCTION IF EXISTS app.normalize_permissions_alias_fields();

---------------------------------------------------------------------------
-- 4. Los tres consumidores que las nombraban
--
--    `reiniciar_datos_tenant` las llevaba en su lista de tablas a conservar; los
--    dos validadores de runtime tenian ramas protegidas con `to_regclass`, que
--    habrian degradado solas, pero dejarlas seria dejar el segundo modelo medio
--    vivo en el codigo.
---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.reiniciar_datos_tenant(p_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app', 'pg_temp'
AS $function$
DECLARE
  v_conservar text[] := ARRAY[
    'tenants',
    'empresa_config',
    'usuarios',
    'usuarios_sistema',
    'usuario_configuracion',
    'roles',
    'permisos',
    'user_roles',
    'sucursales',
    'almacenes',
    'almacen_ubicaciones',
    'plan_cuentas',
    'metodos_pago',
    'cajas',
    'configuracion_fiscal',
    'conceptos_planilla',
    -- La aprobacion necesita esta fila para cerrarla DESPUES del reset.
    'demo_conversiones_pendientes'
  ];
  v_tabla text;
  v_borradas bigint;
  v_restantes bigint;
  v_total bigint := 0;
  v_vuelta int := 0;
  v_progreso bigint;
  v_detalle jsonb := '{}'::jsonb;
  v_pendientes jsonb := '{}'::jsonb;
BEGIN
  IF p_tenant IS NULL THEN
    RAISE EXCEPTION 'reiniciar_datos_tenant requiere un tenant';
  END IF;

  LOOP
    v_vuelta := v_vuelta + 1;
    v_progreso := 0;

    FOR v_tabla IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
       AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public'
        AND c.column_name = 'tenant_id'
        AND NOT (c.table_name = ANY (v_conservar))
      ORDER BY c.table_name
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_tabla)
          USING p_tenant;
        GET DIAGNOSTICS v_borradas = ROW_COUNT;

        IF v_borradas > 0 THEN
          v_progreso := v_progreso + v_borradas;
          v_total := v_total + v_borradas;
          v_detalle := v_detalle || jsonb_build_object(
            v_tabla,
            COALESCE((v_detalle ->> v_tabla)::bigint, 0) + v_borradas
          );
        END IF;
      EXCEPTION WHEN integrity_constraint_violation THEN
        -- Algunas FK usan ON DELETE SET NULL, pero la fila hija exige ese id
        -- mediante un CHECK (por ejemplo pedidos_venta.cliente_id). Esa tabla
        -- hija se elimina mas adelante y la tabla padre entra en la siguiente
        -- vuelta. Capturar solo foreign_key_violation dejaba la conversion rota.
        NULL;
      END;
    END LOOP;

    EXIT WHEN v_progreso = 0 OR v_vuelta >= 20;
  END LOOP;

  -- No se acepta un exito parcial. Toda tabla operativa que no esta en la lista
  -- de estructura debe quedar realmente vacia para este tenant.
  FOR v_tabla IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND NOT (c.table_name = ANY (v_conservar))
    ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1', v_tabla)
      INTO v_restantes
      USING p_tenant;
    IF v_restantes > 0 THEN
      v_pendientes := v_pendientes || jsonb_build_object(v_tabla, v_restantes);
    END IF;
  END LOOP;

  IF v_pendientes <> '{}'::jsonb THEN
    RAISE EXCEPTION 'El reinicio dejo filas operativas: %', v_pendientes;
  END IF;

  RETURN jsonb_build_object(
    'reiniciado', true,
    'filas_borradas', v_total,
    'vueltas', v_vuelta,
    'detalle', v_detalle,
    'pendientes', v_pendientes
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validar_rbac_tenant_integrity_runtime(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(check_name text, ok boolean, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'app', 'pg_temp'
AS $function$
DECLARE
  v_count bigint;
BEGIN
  RETURN QUERY
  SELECT
    'trigger_user_roles_tenant_integrity'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'user_roles'
        AND t.tgname = 'trg_enforce_tenant_user_roles'
        AND NOT t.tgisinternal
    ),
    'trigger BEFORE INSERT/UPDATE en user_roles';

  RETURN QUERY
  SELECT
    'trigger_rol_permisos_tenant_integrity'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rol_permisos'
        AND t.tgname = 'trg_enforce_tenant_rol_permisos'
        AND NOT t.tgisinternal
    ),
    'trigger BEFORE INSERT/UPDATE en rol_permisos';
  SELECT COUNT(*)
  INTO v_count
  FROM public.user_roles ur
  LEFT JOIN public.usuarios_sistema u
    ON u.id = ur.usuario_sistema_id
  LEFT JOIN public.roles r
    ON r.id = ur.role_id
  WHERE (
      (u.tenant_id IS NOT NULL AND ur.tenant_id IS NOT NULL AND ur.tenant_id <> u.tenant_id)
      OR (r.tenant_id IS NOT NULL AND ur.tenant_id IS NOT NULL AND ur.tenant_id <> r.tenant_id)
      OR (u.tenant_id IS NOT NULL AND r.tenant_id IS NOT NULL AND u.tenant_id <> r.tenant_id)
    )
    AND (
      p_tenant_id IS NULL
      OR ur.tenant_id = p_tenant_id
      OR u.tenant_id = p_tenant_id
      OR r.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'user_roles_cross_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.user_roles ur
  LEFT JOIN public.usuarios_sistema u
    ON u.id = ur.usuario_sistema_id
  LEFT JOIN public.roles r
    ON r.id = ur.role_id
  WHERE ur.tenant_id IS NULL
    AND COALESCE(u.tenant_id, r.tenant_id) IS NOT NULL
    AND (
      p_tenant_id IS NULL
      OR u.tenant_id = p_tenant_id
      OR r.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'user_roles_missing_tenant_id'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rol_permisos rp
  JOIN public.roles r
    ON r.id = rp.role_id
  JOIN public.permisos p
    ON p.id = rp.permiso_id
  WHERE p.tenant_id IS NOT NULL
    AND (r.tenant_id IS NULL OR r.tenant_id <> p.tenant_id)
    AND (
      p_tenant_id IS NULL
      OR r.tenant_id = p_tenant_id
      OR p.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'rol_permisos_cross_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validar_rls_security_runtime()
 RETURNS TABLE(check_name text, ok boolean, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'app', 'pg_temp'
AS $function$
DECLARE
  v_count bigint;
  v_table text;
  v_relrowsecurity boolean;
  v_relforcerowsecurity boolean;
  v_policy_count integer;
  v_policy_expr text;
  v_policy_expr_norm text;
  v_core_tables text[] := ARRAY[
    'usuarios_sistema',
    'user_roles',
    'roles',
    'permisos',
    'rol_permisos',
    'users',
    'auth_login_attempts',
    'user_sessions'
  ];
BEGIN
  RETURN QUERY
  SELECT
    'v_rls_tenant_tables_audit_exists'::text,
    to_regclass('public.v_rls_tenant_tables_audit') IS NOT NULL,
    'vista de auditoría de RLS para tablas con tenant_id';

  RETURN QUERY
  SELECT
    'v_rls_tenant_tables_audit_summary_exists'::text,
    to_regclass('public.v_rls_tenant_tables_audit_summary') IS NOT NULL,
    'vista resumen de auditoría de RLS';

  IF to_regclass('public.v_rls_tenant_tables_audit') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.v_rls_tenant_tables_audit
    WHERE needs_attention;

    RETURN QUERY
    SELECT
      'rls_tenant_tables_needing_attention'::text,
      v_count = 0,
      format('count=%s', v_count);
  END IF;

  FOREACH v_table IN ARRAY v_core_tables LOOP
    IF to_regclass(format('public.%s', v_table)) IS NULL THEN
      RETURN QUERY
      SELECT
        format('core_table_rls:%s', v_table),
        true,
        'table_not_present';
      CONTINUE;
    END IF;

    SELECT
      c.relrowsecurity,
      c.relforcerowsecurity,
      (
        SELECT COUNT(*)::integer
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = c.relname
      )
    INTO v_relrowsecurity, v_relforcerowsecurity, v_policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_table
      AND c.relkind = 'r';

    RETURN QUERY
    SELECT
      format('core_table_rls:%s', v_table),
      COALESCE(v_relrowsecurity, false) AND COALESCE(v_relforcerowsecurity, false) AND COALESCE(v_policy_count, 0) > 0,
      format(
        'rls_enabled=%s rls_forced=%s policy_count=%s',
        COALESCE(v_relrowsecurity, false),
        COALESCE(v_relforcerowsecurity, false),
        COALESCE(v_policy_count, 0)
      );
  END LOOP;

  -- --------------------------------------------------------------------------
  -- Guard de contexto para filas globales (tenant_id IS NULL) en políticas
  -- SELECT de seguridad/catálogo.
  -- --------------------------------------------------------------------------

  IF to_regclass('public.roles') IS NOT NULL THEN
    SELECT p.qual
    INTO v_policy_expr
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'roles'
      AND p.policyname = 'roles_tenant_or_global';

    v_policy_expr_norm := lower(regexp_replace(COALESCE(v_policy_expr, ''), '\s+', '', 'g'));

    RETURN QUERY
    SELECT
      'roles_global_guard'::text,
      v_policy_expr IS NOT NULL
      AND (
        position('tenant_idisnull' IN v_policy_expr_norm) = 0
        OR position('app.current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
        OR position('current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
      ),
      COALESCE(v_policy_expr, '<missing_policy>');
  END IF;

  IF to_regclass('public.permisos') IS NOT NULL THEN
    SELECT p.qual
    INTO v_policy_expr
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'permisos'
      AND p.policyname = 'permisos_tenant_select';

    v_policy_expr_norm := lower(regexp_replace(COALESCE(v_policy_expr, ''), '\s+', '', 'g'));

    RETURN QUERY
    SELECT
      'permisos_global_guard'::text,
      v_policy_expr IS NOT NULL
      AND (
        position('tenant_idisnull' IN v_policy_expr_norm) = 0
        OR position('app.current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
        OR position('current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
      ),
      COALESCE(v_policy_expr, '<missing_policy>');
  END IF;
END;
$function$
;

COMMIT;
