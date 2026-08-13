-- 493: POS multi-caja sin colisiones, lectura de sesión con ACL mínima y
-- techo RBAC indelegable. No cambia los escritores económicos 469/471/491.

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- RBAC: todo writer administrativo vuelve a comprobar users.manage en SQL.
-- El permiso puede pertenecer únicamente a roles administrativos de sistema;
-- los roles creados desde la demo siguen pudiendo delegar permisos operativos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.assert_admin_actor_462(p_tenant_id uuid, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND COALESCE(u.activo, false)
      AND lower(COALESCE(u.estado::text, '')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'ADMIN_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.id = ur.role_id
     AND r.tenant_id = p_tenant_id
     AND COALESCE(r.activo, true)
    JOIN public.rol_permisos rp
      ON rp.role_id = r.id
     AND COALESCE(rp.concedido, true)
    JOIN public.permisos p
      ON p.id = rp.permiso_id
     AND p.tenant_id = p_tenant_id
     AND COALESCE(p.activo, true)
    WHERE ur.usuario_sistema_id = p_actor_id
      AND ur.tenant_id = p_tenant_id
      AND lower(COALESCE(
        p.codigo,
        p.modulo || '.' || p.recurso || '.' || p.accion
      )) = 'users.manage'
  ) THEN
    RAISE EXCEPTION 'ADMIN_ACTOR_REQUIRES_USERS_MANAGE' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.assert_permissions_462(p_tenant_id uuid, p_permission_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_ids uuid[] := app.normalized_uuid_array_462(p_permission_ids);
  v_count integer;
  v_is_demo boolean;
BEGIN
  IF cardinality(v_ids) <> cardinality(COALESCE(p_permission_ids, '{}'::uuid[])) THEN
    RAISE EXCEPTION 'ADMIN_PERMISSION_IDS_DUPLICATED' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(ec.is_demo, false) INTO v_is_demo
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id;

  SELECT count(*) INTO v_count
  FROM public.permisos p
  WHERE p.tenant_id = p_tenant_id
    AND p.id = ANY(v_ids)
    AND COALESCE(p.activo, true)
    -- users.manage es una capacidad del rol administrativo canónico, no un
    -- permiso que ese mismo administrador pueda copiar a roles personalizados.
    AND lower(COALESCE(
      p.codigo,
      p.modulo || '.' || p.recurso || '.' || p.accion
    )) <> 'users.manage'
    AND (
      NOT COALESCE(v_is_demo, false)
      OR (
        lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
          !~ '^(security\.audit\.|tenants\.manage$|system\.debug$)'
        AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
          <> 'documentos.audit.read'
      )
    );
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'ADMIN_PERMISSION_INVALID_CROSS_TENANT_OR_RESTRICTED'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_ids;
END;
$function$;

CREATE OR REPLACE FUNCTION app.grant_demo_admin_rbac_490()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF upper(btrim(COALESCE(NEW.nombre, ''))) <> 'ADMIN_DEMO'
     OR NOT COALESCE(NEW.is_system_role, false)
     OR NOT EXISTS (
       SELECT 1 FROM public.empresa_config ec
       WHERE ec.tenant_id = NEW.tenant_id AND COALESCE(ec.is_demo, false)
     ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.rol_permisos(role_id, permiso_id, concedido)
  SELECT NEW.id, p.id, true
  FROM public.permisos p
  WHERE p.tenant_id = NEW.tenant_id
    AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) = 'users.manage'
    AND COALESCE(p.activo, true)
  ON CONFLICT (role_id, permiso_id) DO UPDATE SET concedido = true;
  RETURN NEW;
END;
$function$;

-- Retira concesiones históricas que se hubieran copiado a roles custom. Los
-- ADMIN/ADMIN_DEMO canónicos conservan la capacidad de administrar su tenant.
DELETE FROM public.rol_permisos rp
USING public.roles r, public.permisos p
WHERE rp.role_id = r.id
  AND rp.permiso_id = p.id
  AND r.tenant_id = p.tenant_id
  AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) = 'users.manage'
  AND (
    NOT COALESCE(r.is_system_role, false)
    OR upper(btrim(COALESCE(r.nombre, ''))) NOT IN ('ADMIN', 'ADMIN_DEMO', 'SUPER_ADMIN', 'ADMINISTRADOR')
  );

-- ---------------------------------------------------------------------------
-- POS: Txxx es un identificador interno visible y por eso debe ser único en el
-- tenant. La caja sigue registrada en la venta/sesión, pero ya no particiona el
-- contador. Bxxx/Fxxx continúan delegando a la secuencia fiscal canónica.
-- ---------------------------------------------------------------------------
LOCK TABLE public.pos_numeracion IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE pos_ticket_scopes_493 ON COMMIT DROP AS
SELECT tenant_id, tipo_documento, serie, max(numero) AS max_numero
FROM (
  SELECT pn.tenant_id,
         upper(COALESCE(pn.tipo_documento, 'TICKET')) AS tipo_documento,
         upper(COALESCE(pn.serie, 'T001')) AS serie,
         COALESCE(pn.correlativo_actual, 0)::bigint AS numero
  FROM public.pos_numeracion pn
  WHERE pn.tenant_id IS NOT NULL
    AND upper(COALESCE(pn.serie, 'T001')) ~ '^T[A-Z0-9]{3}$'
  UNION ALL
  SELECT v.tenant_id, 'TICKET', upper(COALESCE(
           NULLIF(btrim(v.serie::text), ''), split_part(v.numero_ticket, '-', 1)
         )),
         CASE WHEN COALESCE(
           NULLIF(btrim(v.correlativo::text), ''), split_part(v.numero_ticket, '-', 2)
         ) ~ '^[0-9]+$'
           THEN COALESCE(
             NULLIF(btrim(v.correlativo::text), ''), split_part(v.numero_ticket, '-', 2)
           )::bigint
           ELSE 0
         END
  FROM public.ventas_pos v
  WHERE v.tenant_id IS NOT NULL
    AND upper(COALESCE(
      NULLIF(btrim(v.serie::text), ''), split_part(v.numero_ticket, '-', 1), ''
    )) ~ '^T[A-Z0-9]{3}$'
  UNION ALL
  SELECT d.tenant_id, 'TICKET', upper(d.serie),
         CASE WHEN d.numero ~ '^[0-9]+$' THEN d.numero::bigint ELSE 0 END
  FROM public.documentos d
  WHERE d.tenant_id IS NOT NULL
    AND upper(COALESCE(d.tipo_documento, '')) = 'TICKET'
    AND upper(COALESCE(d.serie, '')) ~ '^T[A-Z0-9]{3}$'
) occupied
GROUP BY tenant_id, tipo_documento, serie;

UPDATE public.pos_numeracion pn
SET activo = false,
    estado = 'INACTIVO',
    metadata = COALESCE(pn.metadata, '{}'::jsonb) || jsonb_build_object(
      'retired_by', 493,
      'reason', 'TICKET_COUNTER_IS_TENANT_SCOPED'
    ),
    updated_at = clock_timestamp()
WHERE pn.caja_id IS NOT NULL
  AND upper(COALESCE(pn.serie, 'T001')) ~ '^T[A-Z0-9]{3}$'
  AND COALESCE(pn.activo, true);

DO $backfill$
DECLARE
  v_scope record;
  v_updated integer;
BEGIN
  FOR v_scope IN SELECT * FROM pos_ticket_scopes_493 ORDER BY tenant_id, tipo_documento, serie LOOP
    UPDATE public.pos_numeracion pn
    SET correlativo_actual = greatest(COALESCE(pn.correlativo_actual, 0), v_scope.max_numero),
        correlativo_maximo = greatest(COALESCE(pn.correlativo_maximo, 99999999), v_scope.max_numero),
        activo = true,
        estado = 'ACTIVO',
        metadata = COALESCE(pn.metadata, '{}'::jsonb) || jsonb_build_object(
          'tenant_scoped_ticket_counter', true,
          'schema_version', 493
        ),
        updated_at = clock_timestamp()
    WHERE pn.tenant_id = v_scope.tenant_id
      AND upper(COALESCE(pn.tipo_documento, 'TICKET')) = v_scope.tipo_documento
      AND upper(COALESCE(pn.serie, 'T001')) = v_scope.serie
      AND pn.caja_id IS NULL
      AND COALESCE(pn.activo, true);
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      INSERT INTO public.pos_numeracion (
        tenant_id, nombre, codigo, tipo_documento, serie, caja_id,
        correlativo_actual, correlativo_maximo, activo, estado, metadata
      ) VALUES (
        v_scope.tenant_id,
        'Numeración interna ' || v_scope.serie,
        v_scope.tipo_documento || '-' || v_scope.serie,
        v_scope.tipo_documento,
        v_scope.serie,
        NULL,
        v_scope.max_numero,
        greatest(99999999, v_scope.max_numero),
        true,
        'ACTIVO',
        jsonb_build_object('tenant_scoped_ticket_counter', true, 'schema_version', 493)
      );
    END IF;
  END LOOP;
END;
$backfill$;

-- Los demos históricos pueden contener tickets seed duplicados anteriores al
-- documento TICKET real. No se renumeran documentos ya emitidos. Desde 493 un
-- trigger marca toda nueva identidad y la unicidad parcial serializa incluso
-- dos INSERT concurrentes; el check adicional impide reutilizar un número
-- legacy que no participa del índice parcial.
CREATE OR REPLACE FUNCTION app.enforce_pos_ticket_identity_493()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF NEW.tenant_id IS NULL OR NULLIF(btrim(COALESCE(NEW.numero_ticket, '')), '') IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ventas_pos v
    WHERE v.tenant_id = NEW.tenant_id
      AND upper(v.numero_ticket) = upper(NEW.numero_ticket)
      AND v.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'POS_TICKET_IDENTITY_CONFLICT:%', NEW.numero_ticket
      USING ERRCODE = '23505';
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
    || jsonb_build_object('ticket_sequence_version', 493);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_pos_ticket_identity_493 ON public.ventas_pos;
CREATE TRIGGER trg_enforce_pos_ticket_identity_493
BEFORE INSERT OR UPDATE OF tenant_id, numero_ticket ON public.ventas_pos
FOR EACH ROW EXECUTE FUNCTION app.enforce_pos_ticket_identity_493();

CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_pos_tenant_ticket_new_493
ON public.ventas_pos (tenant_id, upper(numero_ticket))
WHERE tenant_id IS NOT NULL
  AND numero_ticket IS NOT NULL
  AND btrim(numero_ticket) <> ''
  AND metadata->>'ticket_sequence_version' = '493';

CREATE OR REPLACE FUNCTION public.obtener_siguiente_numero_pos(
  p_tenant_id uuid,
  p_serie text DEFAULT 'T001',
  p_tipo_documento text DEFAULT 'TICKET',
  p_caja_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, app, pg_temp
AS $function$
DECLARE
  v_serie text := upper(COALESCE(NULLIF(btrim(COALESCE(p_serie, '')), ''), 'T001'));
  v_tipo text := upper(COALESCE(NULLIF(btrim(COALESCE(p_tipo_documento, '')), ''), 'TICKET'));
  v_scope_caja uuid;
  v_id uuid;
  v_actual bigint;
  v_maximo bigint;
  v_next bigint;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED';
  END IF;

  IF v_serie ~ '^B[A-Z0-9]{3}$' THEN
    RETURN public.obtener_siguiente_numero_documento(p_tenant_id, 'BOLETA', v_serie);
  ELSIF v_serie ~ '^F[A-Z0-9]{3}$' THEN
    RETURN public.obtener_siguiente_numero_documento(p_tenant_id, 'FACTURA', v_serie);
  END IF;

  -- Una serie Txxx se imprime y persiste en documentos: su alcance es tenant,
  -- no caja. Otras series internas legacy conservan su alcance anterior.
  v_scope_caja := CASE WHEN v_serie ~ '^T[A-Z0-9]{3}$' THEN NULL ELSE p_caja_id END;

  INSERT INTO public.pos_numeracion (
    id, tenant_id, tipo_documento, serie, caja_id, correlativo_actual,
    correlativo_maximo, activo, estado, metadata, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_tenant_id, v_tipo, v_serie, v_scope_caja, 0,
    99999999, true, 'ACTIVO',
    jsonb_build_object('tenant_scoped_ticket_counter', v_scope_caja IS NULL, 'schema_version', 493),
    now(), now()
  ) ON CONFLICT DO NOTHING;

  SELECT pn.id, pn.correlativo_actual, pn.correlativo_maximo
  INTO v_id, v_actual, v_maximo
  FROM public.pos_numeracion pn
  WHERE pn.tenant_id = p_tenant_id
    AND upper(COALESCE(pn.tipo_documento, 'TICKET')) = v_tipo
    AND upper(COALESCE(pn.serie, 'T001')) = v_serie
    AND pn.caja_id IS NOT DISTINCT FROM v_scope_caja
    AND COALESCE(pn.activo, true)
  ORDER BY COALESCE(pn.updated_at, pn.created_at, now()) DESC, pn.id::text DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'POS_NUMERACION_NOT_FOUND: tenant=% serie=% tipo=% caja=%',
      p_tenant_id, v_serie, v_tipo, COALESCE(v_scope_caja::text, 'TENANT');
  END IF;

  v_next := COALESCE(v_actual, 0) + 1;
  IF v_maximo IS NOT NULL AND v_next > v_maximo THEN
    RAISE EXCEPTION 'POS_NUMERACION_MAX_REACHED: tenant=% serie=% tipo=% next=% max=%',
      p_tenant_id, v_serie, v_tipo, v_next, v_maximo;
  END IF;

  UPDATE public.pos_numeracion
  SET correlativo_actual = v_next, updated_at = now()
  WHERE id = v_id;

  RETURN lpad(v_next::text, 8, '0');
END;
$function$;

-- ---------------------------------------------------------------------------
-- Lectura POS: proyección tenant/actor mediante SECURITY DEFINER. El backend
-- recupera la caja abierta sin reabrir ningún writer directo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_sesion_caja_actual_tx(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_actor_id);

  SELECT to_jsonb(s) INTO v_result
  FROM public.sesiones_caja s
  WHERE s.tenant_id = p_tenant_id
    AND (
      s.usuario_id = p_actor_id
      OR s.usuario_apertura = p_actor_id
      OR s.cajero_id = p_actor_id
      OR s.abierto_por = p_actor_id
    )
    AND upper(COALESCE(s.estado::text, '')) = 'ABIERTA'
    AND s.hora_cierre IS NULL
    AND s.fecha_cierre IS NULL
  ORDER BY s.hora_apertura DESC NULLS LAST, s.created_at DESC NULLS LAST, s.id
  LIMIT 1;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION app.assert_admin_actor_462(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_permissions_462(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.grant_demo_admin_rbac_490() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.enforce_pos_ticket_identity_493() FROM PUBLIC, anon, authenticated, service_role;
-- Helper interno de los writers POS SECURITY DEFINER. Exponer EXECUTE no
-- otorgaba DML hoy, pero dejaba un error-oracle y se volvería peligroso ante
-- cualquier grant futuro sobre la tabla de numeración.
REVOKE ALL ON FUNCTION public.obtener_siguiente_numero_pos(uuid, text, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.obtener_sesion_caja_actual_tx(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_sesion_caja_actual_tx(uuid, uuid) TO service_role;

-- SELECT mínimo necesario para consultas operativas existentes. Toda mutación
-- continúa revocada: apertura/cierre/venta sólo pasan por los RPC canónicos.
REVOKE ALL ON TABLE public.sesiones_caja FROM service_role;
GRANT SELECT ON TABLE public.sesiones_caja TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.sesiones_caja FROM service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
