-- 621: credencial de integración externa por empresa y sucursal.
--
-- Un sistema externo cobra con boleta o factura sin sesión de usuario. Cada
-- credencial:
--   * pertenece a un tenant y a una sucursal, que salen siempre de ella;
--   * opera con una cuenta técnica propia (usuarios_sistema) que no puede
--     iniciar sesión y sólo tiene el rol INTEGRACION_EXTERNA, cuyos permisos
--     están acotados aquí mismo. Así las RPC canónicas del POS (actor activo,
--     RBAC, caja, idempotencia) siguen siendo la frontera sin reescribirlas;
--   * guarda sus secretos sólo como hash SHA-256, admite dos secretos válidos
--     durante una rotación con período de gracia y vence en la fecha que fije
--     el administrador;
--   * deja en `integracion_externa_eventos` (sólo inserción) el alta, la
--     rotación, la revocación, el vencimiento, cada uso y cada rechazo.
-- La venta POS gana `referencia_externa` y las dos identidades: la credencial
-- y la persona externa que cobra, escritas en la misma transacción que la
-- venta. La persona externa no crea usuarios del ERP.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- Cuenta técnica
-- ---------------------------------------------------------------------------
ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS es_cuenta_integracion boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION app.integracion_permisos_621()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT ARRAY[
    'pos.vender',
    'pos.read',
    'pos.caja.write',
    'inventario.productos.read',
    'cpe.comprobantes.descargar_pdf'
  ]::text[];
$function$;

CREATE OR REPLACE FUNCTION app.integracion_rol_nombre_621()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $function$ SELECT 'INTEGRACION_EXTERNA'::text; $function$;

-- La cuenta técnica nunca tiene contraseña ni privilegio global, no cambia de
-- empresa y no se convierte en una cuenta humana (ni al revés).
CREATE OR REPLACE FUNCTION app.guard_cuenta_integracion_621()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.es_cuenta_integracion IS DISTINCT FROM NEW.es_cuenta_integracion THEN
    RAISE EXCEPTION 'INTEGRATION_ACCOUNT_FLAG_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.es_cuenta_integracion THEN
    IF NEW.password_hash IS NOT NULL OR coalesce(NEW.is_super_admin, false) THEN
      RAISE EXCEPTION 'INTEGRATION_ACCOUNT_CANNOT_LOGIN' USING ERRCODE = '42501';
    END IF;
    IF NEW.tenant_id IS NULL OR (TG_OP = 'UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id) THEN
      RAISE EXCEPTION 'INTEGRATION_ACCOUNT_TENANT_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    -- Una cuenta de credencial revocada no vuelve a activarse por otra vía.
    IF TG_OP = 'UPDATE' AND coalesce(NEW.activo, false) AND EXISTS (
      SELECT 1 FROM public.integracion_externa_credenciales c
       WHERE c.cuenta_tecnica_id = NEW.id AND c.estado = 'REVOCADA'
    ) THEN
      RAISE EXCEPTION 'INTEGRATION_ACCOUNT_REVOKED' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Credenciales, secretos y eventos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integracion_externa_credenciales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL,
  nombre text NOT NULL,
  sistema text NOT NULL,
  cuenta_tecnica_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'ACTIVA',
  expira_en timestamptz NOT NULL,
  creada_por uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  revocada_en timestamptz,
  revocada_por uuid REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  motivo_revocacion text,
  vencimiento_registrado_en timestamptz,
  ultimo_uso_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_integracion_credencial_sucursal_621
    FOREIGN KEY (tenant_id, sucursal_id) REFERENCES public.sucursales(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_integracion_credencial_nombre_621 CHECK (length(btrim(nombre)) BETWEEN 3 AND 120),
  CONSTRAINT ck_integracion_credencial_sistema_621 CHECK (length(btrim(sistema)) BETWEEN 2 AND 80),
  CONSTRAINT ck_integracion_credencial_estado_621 CHECK (estado IN ('ACTIVA', 'REVOCADA')),
  CONSTRAINT ck_integracion_credencial_revocacion_621 CHECK (
    (estado = 'REVOCADA') = (revocada_en IS NOT NULL AND revocada_por IS NOT NULL)
  ),
  CONSTRAINT ck_integracion_credencial_key_621 CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_integracion_credencial_cuenta_621
  ON public.integracion_externa_credenciales (cuenta_tecnica_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_integracion_credencial_key_621
  ON public.integracion_externa_credenciales (tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_integracion_credencial_tenant_id_621
  ON public.integracion_externa_credenciales (tenant_id, id);
CREATE INDEX IF NOT EXISTS ix_integracion_credencial_tenant_621
  ON public.integracion_externa_credenciales (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.integracion_externa_secretos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  credencial_id uuid NOT NULL,
  prefijo text NOT NULL,
  hash_secreto text NOT NULL,
  estado text NOT NULL DEFAULT 'VIGENTE',
  valido_hasta timestamptz,
  creado_por uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  retirado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_integracion_secreto_credencial_621
    FOREIGN KEY (tenant_id, credencial_id)
    REFERENCES public.integracion_externa_credenciales(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ck_integracion_secreto_prefijo_621 CHECK (prefijo ~ '^[a-z0-9]{12}$'),
  CONSTRAINT ck_integracion_secreto_hash_621 CHECK (hash_secreto ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_integracion_secreto_estado_621 CHECK (estado IN ('VIGENTE', 'EN_GRACIA', 'RETIRADO')),
  CONSTRAINT ck_integracion_secreto_ciclo_621 CHECK (
    (estado = 'VIGENTE' AND valido_hasta IS NULL AND retirado_en IS NULL)
    OR (estado = 'EN_GRACIA' AND valido_hasta IS NOT NULL AND retirado_en IS NULL)
    OR (estado = 'RETIRADO' AND retirado_en IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_integracion_secreto_prefijo_621
  ON public.integracion_externa_secretos (prefijo);
CREATE UNIQUE INDEX IF NOT EXISTS ux_integracion_secreto_hash_621
  ON public.integracion_externa_secretos (hash_secreto);
CREATE UNIQUE INDEX IF NOT EXISTS ux_integracion_secreto_vigente_621
  ON public.integracion_externa_secretos (credencial_id) WHERE estado = 'VIGENTE';
CREATE UNIQUE INDEX IF NOT EXISTS ux_integracion_secreto_gracia_621
  ON public.integracion_externa_secretos (credencial_id) WHERE estado = 'EN_GRACIA';

CREATE TABLE IF NOT EXISTS public.integracion_externa_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  credencial_id uuid NOT NULL,
  secreto_id uuid,
  evento text NOT NULL,
  codigo text,
  actor_id uuid,
  sucursal_id uuid NOT NULL,
  sistema text NOT NULL,
  actor_externo_id text,
  actor_externo_nombre text,
  metodo text,
  ruta text,
  ip text,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_integracion_evento_credencial_621
    FOREIGN KEY (tenant_id, credencial_id)
    REFERENCES public.integracion_externa_credenciales(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ck_integracion_evento_tipo_621 CHECK (evento IN (
    'ALTA', 'ROTACION', 'ROTACION_FINALIZADA', 'SECRETO_RETIRADO', 'REVOCACION',
    'VENCIMIENTO', 'VENCIMIENTO_ACTUALIZADO', 'USO', 'RECHAZO'
  )),
  CONSTRAINT ck_integracion_evento_codigo_621 CHECK ((evento = 'RECHAZO') = (codigo IS NOT NULL)),
  CONSTRAINT ck_integracion_evento_actor_621 CHECK (
    evento NOT IN ('ALTA', 'ROTACION', 'ROTACION_FINALIZADA', 'REVOCACION', 'VENCIMIENTO_ACTUALIZADO')
    OR actor_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS ix_integracion_evento_credencial_621
  ON public.integracion_externa_eventos (tenant_id, credencial_id, created_at DESC);

-- Eventos: sólo inserción. Un evento corregido es otro evento.
CREATE OR REPLACE FUNCTION app.integracion_eventos_inmutables_621()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'INTEGRATION_EVENTS_APPEND_ONLY' USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_integracion_eventos_inmutables_621 ON public.integracion_externa_eventos;
CREATE TRIGGER trg_integracion_eventos_inmutables_621
BEFORE UPDATE OR DELETE ON public.integracion_externa_eventos
FOR EACH ROW EXECUTE FUNCTION app.integracion_eventos_inmutables_621();

DROP TRIGGER IF EXISTS trg_guard_cuenta_integracion_621 ON public.usuarios_sistema;
CREATE TRIGGER trg_guard_cuenta_integracion_621
BEFORE INSERT OR UPDATE ON public.usuarios_sistema
FOR EACH ROW EXECUTE FUNCTION app.guard_cuenta_integracion_621();

-- El rol técnico sólo lo tienen cuentas técnicas, y ellas sólo ese rol.
CREATE OR REPLACE FUNCTION app.guard_roles_integracion_621()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_es_cuenta boolean;
  v_es_rol boolean;
BEGIN
  SELECT coalesce(u.es_cuenta_integracion, false) INTO v_es_cuenta
    FROM public.usuarios_sistema u WHERE u.id = NEW.usuario_sistema_id;
  SELECT upper(btrim(r.nombre)) = app.integracion_rol_nombre_621() INTO v_es_rol
    FROM public.roles r WHERE r.id = NEW.role_id;
  IF coalesce(v_es_cuenta, false) IS DISTINCT FROM coalesce(v_es_rol, false) THEN
    RAISE EXCEPTION 'INTEGRATION_ROLE_ASSIGNMENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_roles_integracion_621 ON public.user_roles;
CREATE TRIGGER trg_guard_roles_integracion_621
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION app.guard_roles_integracion_621();

-- El rol técnico no puede ganar permisos fuera de la lista acotada.
CREATE OR REPLACE FUNCTION app.guard_permisos_rol_integracion_621()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF coalesce(NEW.concedido, true) AND EXISTS (
    SELECT 1 FROM public.roles r
     WHERE r.id = NEW.role_id AND upper(btrim(r.nombre)) = app.integracion_rol_nombre_621()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.permisos p
     WHERE p.id = NEW.permiso_id
       AND lower(coalesce(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
           = ANY(app.integracion_permisos_621())
  ) THEN
    RAISE EXCEPTION 'INTEGRATION_ROLE_PERMISSION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_permisos_rol_integracion_621 ON public.rol_permisos;
CREATE TRIGGER trg_guard_permisos_rol_integracion_621
BEFORE INSERT OR UPDATE ON public.rol_permisos
FOR EACH ROW EXECUTE FUNCTION app.guard_permisos_rol_integracion_621();

-- ---------------------------------------------------------------------------
-- Venta POS: referencia externa y dos identidades
-- ---------------------------------------------------------------------------
ALTER TABLE public.ventas_pos
  ADD COLUMN IF NOT EXISTS referencia_externa text,
  ADD COLUMN IF NOT EXISTS integracion_credencial_id uuid,
  ADD COLUMN IF NOT EXISTS actor_externo_id text,
  ADD COLUMN IF NOT EXISTS actor_externo_nombre text;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ventas_pos_integracion_621') THEN
    ALTER TABLE public.ventas_pos
      ADD CONSTRAINT fk_ventas_pos_integracion_621 FOREIGN KEY (integracion_credencial_id)
      REFERENCES public.integracion_externa_credenciales(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ventas_pos_referencia_externa_621') THEN
    ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ck_ventas_pos_referencia_externa_621 CHECK (
        referencia_externa IS NULL OR referencia_externa ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$'
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ventas_pos_actor_externo_621') THEN
    ALTER TABLE public.ventas_pos
      ADD CONSTRAINT ck_ventas_pos_actor_externo_621 CHECK (
        (integracion_credencial_id IS NULL AND actor_externo_id IS NULL AND actor_externo_nombre IS NULL)
        OR (integracion_credencial_id IS NOT NULL AND actor_externo_id IS NOT NULL AND actor_externo_nombre IS NOT NULL)
      ) NOT VALID;
  END IF;
END
$constraints$;

-- Columnas nuevas, todas nulas: la validación sólo confirma el contrato.
ALTER TABLE public.ventas_pos VALIDATE CONSTRAINT fk_ventas_pos_integracion_621;
ALTER TABLE public.ventas_pos VALIDATE CONSTRAINT ck_ventas_pos_referencia_externa_621;
ALTER TABLE public.ventas_pos VALIDATE CONSTRAINT ck_ventas_pos_actor_externo_621;

CREATE INDEX IF NOT EXISTS ix_ventas_pos_referencia_externa_621
  ON public.ventas_pos (tenant_id, referencia_externa) WHERE referencia_externa IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ventas_pos_integracion_621
  ON public.ventas_pos (integracion_credencial_id) WHERE integracion_credencial_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.registrar_evento_integracion_621(
  p_credencial public.integracion_externa_credenciales,
  p_evento text,
  p_codigo text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_secreto_id uuid DEFAULT NULL,
  p_detalle jsonb DEFAULT '{}'::jsonb,
  p_contexto jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  INSERT INTO public.integracion_externa_eventos (
    tenant_id, credencial_id, secreto_id, evento, codigo, actor_id, sucursal_id, sistema,
    actor_externo_id, actor_externo_nombre, metodo, ruta, ip, detalle
  ) VALUES (
    p_credencial.tenant_id, p_credencial.id, p_secreto_id, p_evento, p_codigo, p_actor_id,
    p_credencial.sucursal_id, p_credencial.sistema,
    left(nullif(btrim(p_contexto->>'actor_externo_id'), ''), 120),
    left(nullif(btrim(p_contexto->>'actor_externo_nombre'), ''), 160),
    left(nullif(btrim(p_contexto->>'metodo'), ''), 10),
    left(nullif(btrim(p_contexto->>'ruta'), ''), 300),
    left(nullif(btrim(p_contexto->>'ip'), ''), 64),
    coalesce(p_detalle, '{}'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION app.assert_secreto_integracion_621(p_prefijo text, p_hash text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF p_prefijo IS NULL OR p_prefijo !~ '^[a-z0-9]{12}$' OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INTEGRATION_SECRET_INVALID' USING ERRCODE = '22023';
  END IF;
END;
$function$;

-- Un administrador con alcance por sucursal (usuario_sucursales) sólo
-- administra credenciales de sus sedes; sin asignaciones, alcance total, igual
-- que SucursalScopeService.
CREATE OR REPLACE FUNCTION app.assert_actor_sucursal_621(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_sucursal_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.usuario_sucursales us
     WHERE us.tenant_id = p_tenant_id AND us.usuario_sistema_id = p_actor_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.usuario_sucursales us
     WHERE us.tenant_id = p_tenant_id AND us.usuario_sistema_id = p_actor_id
       AND us.sucursal_id = p_sucursal_id
  ) THEN
    RAISE EXCEPTION 'INTEGRATION_BRANCH_OUT_OF_ACTOR_SCOPE' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.credencial_integracion_admin_621(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_credencial_id uuid
)
RETURNS public.integracion_externa_credenciales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_credencial public.integracion_externa_credenciales%ROWTYPE;
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  SELECT * INTO v_credencial
    FROM public.integracion_externa_credenciales c
   WHERE c.id = p_credencial_id AND c.tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INTEGRATION_CREDENTIAL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM app.assert_actor_sucursal_621(p_tenant_id, p_actor_id, v_credencial.sucursal_id);
  RETURN v_credencial;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Administración (actor con users.manage del mismo tenant)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_integracion_externa_621(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_sucursal_id uuid,
  p_nombre text,
  p_sistema text,
  p_expira_en timestamptz,
  p_prefijo text,
  p_hash text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_existente public.integracion_externa_credenciales%ROWTYPE;
  v_credencial public.integracion_externa_credenciales%ROWTYPE;
  v_rol_id uuid;
  v_cuenta_id uuid;
  v_secreto_id uuid;
  v_permisos uuid[];
  v_key text := btrim(coalesce(p_idempotency_key, ''));
BEGIN
  PERFORM app.assert_admin_actor_462(p_tenant_id, p_actor_id);
  PERFORM app.assert_secreto_integracion_621(p_prefijo, p_hash);
  IF length(v_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'INTEGRATION_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('integracion.alta:' || p_tenant_id::text || ':' || v_key, 621));
  SELECT * INTO v_existente FROM public.integracion_externa_credenciales c
   WHERE c.tenant_id = p_tenant_id AND c.idempotency_key = v_key;
  IF FOUND THEN
    -- El secreto se mostró una sola vez: el reintento no lo repite ni crea otro.
    RAISE EXCEPTION 'INTEGRATION_CREDENTIAL_ALREADY_CREATED:%', v_existente.id USING ERRCODE = '23505';
  END IF;

  IF length(btrim(coalesce(p_nombre, ''))) NOT BETWEEN 3 AND 120
     OR length(btrim(coalesce(p_sistema, ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'INTEGRATION_CREDENTIAL_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_expira_en IS NULL OR p_expira_en <= now() + interval '1 hour'
     OR p_expira_en > now() + interval '731 days' THEN
    RAISE EXCEPTION 'INTEGRATION_EXPIRY_OUT_OF_RANGE' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sucursales s
     WHERE s.id = p_sucursal_id AND s.tenant_id = p_tenant_id
       AND coalesce(s.activo, true)
  ) THEN
    RAISE EXCEPTION 'INTEGRATION_BRANCH_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_actor_sucursal_621(p_tenant_id, p_actor_id, p_sucursal_id);

  -- Permisos del tenant que la credencial necesita. Si falta alguno, falla
  -- cerrado: no se crea una credencial que luego responda 403 en cada ruta.
  SELECT array_agg(p.id ORDER BY p.id) INTO v_permisos
    FROM public.permisos p
   WHERE p.tenant_id = p_tenant_id AND coalesce(p.activo, true)
     AND lower(coalesce(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
         = ANY(app.integracion_permisos_621());
  IF coalesce(cardinality(v_permisos), 0) <> cardinality(app.integracion_permisos_621()) THEN
    RAISE EXCEPTION 'INTEGRATION_TENANT_PERMISSIONS_MISSING' USING ERRCODE = '23514';
  END IF;

  SELECT r.id INTO v_rol_id FROM public.roles r
   WHERE r.tenant_id = p_tenant_id AND upper(btrim(r.nombre)) = app.integracion_rol_nombre_621()
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.roles (tenant_id, nombre, descripcion, is_system_role, activo, created_by, updated_by)
    VALUES (p_tenant_id, app.integracion_rol_nombre_621(),
            'Rol técnico de las credenciales de integración externa. No se asigna a personas.',
            true, true, p_actor_id, p_actor_id)
    RETURNING id INTO v_rol_id;
  END IF;
  UPDATE public.roles SET activo = true, updated_at = now() WHERE id = v_rol_id AND NOT coalesce(activo, false);
  -- Reconciliar exactamente la lista acotada.
  DELETE FROM public.rol_permisos rp WHERE rp.role_id = v_rol_id AND NOT (rp.permiso_id = ANY(v_permisos));
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido, assigned_by)
  SELECT v_rol_id, x, true, p_actor_id FROM unnest(v_permisos) x
  ON CONFLICT (role_id, permiso_id) DO UPDATE SET concedido = true;

  v_cuenta_id := gen_random_uuid();
  INSERT INTO public.usuarios_sistema (
    id, tenant_id, email, password_hash, nombre, apellido, estado, activo, is_super_admin,
    es_cuenta_integracion, cargo, created_by, updated_by
  ) VALUES (
    v_cuenta_id, p_tenant_id, 'integracion+' || v_cuenta_id::text || '@integracion.invalid', NULL,
    left(btrim(p_nombre), 120), NULL, 'ACTIVO', true, false,
    true, 'Integración externa', p_actor_id, p_actor_id
  );
  INSERT INTO public.user_roles (usuario_sistema_id, role_id, tenant_id, assigned_by)
  VALUES (v_cuenta_id, v_rol_id, p_tenant_id, p_actor_id);
  INSERT INTO public.usuario_sucursales (tenant_id, usuario_sistema_id, sucursal_id)
  VALUES (p_tenant_id, v_cuenta_id, p_sucursal_id);

  INSERT INTO public.integracion_externa_credenciales (
    tenant_id, sucursal_id, nombre, sistema, cuenta_tecnica_id, estado, expira_en,
    creada_por, idempotency_key
  ) VALUES (
    p_tenant_id, p_sucursal_id, btrim(p_nombre), btrim(p_sistema), v_cuenta_id, 'ACTIVA',
    p_expira_en, p_actor_id, v_key
  ) RETURNING * INTO v_credencial;

  INSERT INTO public.integracion_externa_secretos (tenant_id, credencial_id, prefijo, hash_secreto, estado, creado_por)
  VALUES (p_tenant_id, v_credencial.id, p_prefijo, p_hash, 'VIGENTE', p_actor_id)
  RETURNING id INTO v_secreto_id;

  PERFORM app.registrar_evento_integracion_621(
    v_credencial, 'ALTA', NULL, p_actor_id, v_secreto_id,
    jsonb_build_object('expira_en', p_expira_en, 'permisos', to_jsonb(app.integracion_permisos_621()))
  );

  RETURN jsonb_build_object(
    'id', v_credencial.id, 'tenant_id', p_tenant_id, 'sucursal_id', p_sucursal_id,
    'nombre', v_credencial.nombre, 'sistema', v_credencial.sistema,
    'expira_en', v_credencial.expira_en, 'estado', v_credencial.estado,
    'prefijo', p_prefijo, 'secreto_id', v_secreto_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rotar_integracion_externa_621(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_credencial_id uuid,
  p_prefijo text,
  p_hash text,
  p_gracia_horas integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_credencial public.integracion_externa_credenciales%ROWTYPE;
  v_anterior public.integracion_externa_secretos%ROWTYPE;
  v_nuevo_id uuid;
  v_valido_hasta timestamptz;
BEGIN
  v_credencial := app.credencial_integracion_admin_621(p_tenant_id, p_actor_id, p_credencial_id);
  PERFORM app.assert_secreto_integracion_621(p_prefijo, p_hash);
  IF v_credencial.estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'INTEGRATION_CREDENTIAL_REVOKED' USING ERRCODE = '42501';
  END IF;
  IF v_credencial.expira_en <= now() THEN
    RAISE EXCEPTION 'INTEGRATION_CREDENTIAL_EXPIRED' USING ERRCODE = '42501';
  END IF;
  IF p_gracia_horas IS NULL OR p_gracia_horas NOT BETWEEN 1 AND 720 THEN
    RAISE EXCEPTION 'INTEGRATION_GRACE_OUT_OF_RANGE' USING ERRCODE = '22023';
  END IF;

  -- Un secreto en gracia ya vencido se retira; uno todavía válido bloquea otra
  -- rotación: habría tres secretos y el sistema externo perdería el rastro.
  UPDATE public.integracion_externa_secretos s
     SET estado = 'RETIRADO', retirado_en = now()
   WHERE s.credencial_id = v_credencial.id AND s.estado = 'EN_GRACIA' AND s.valido_hasta <= now()
  RETURNING * INTO v_anterior;
  IF v_anterior.id IS NOT NULL THEN
    PERFORM app.registrar_evento_integracion_621(v_credencial, 'SECRETO_RETIRADO', NULL, p_actor_id, v_anterior.id,
      jsonb_build_object('motivo', 'fin_periodo_gracia'));
  END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_externa_secretos s
              WHERE s.credencial_id = v_credencial.id AND s.estado = 'EN_GRACIA') THEN
    RAISE EXCEPTION 'INTEGRATION_ROTATION_IN_PROGRESS' USING ERRCODE = '55000';
  END IF;

  v_valido_hasta := least(now() + make_interval(hours => p_gracia_horas), v_credencial.expira_en);
  UPDATE public.integracion_externa_secretos s
     SET estado = 'EN_GRACIA', valido_hasta = v_valido_hasta
   WHERE s.credencial_id = v_credencial.id AND s.estado = 'VIGENTE'
  RETURNING * INTO v_anterior;
  IF v_anterior.id IS NULL THEN
    RAISE EXCEPTION 'INTEGRATION_CURRENT_SECRET_MISSING' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.integracion_externa_secretos (tenant_id, credencial_id, prefijo, hash_secreto, estado, creado_por)
  VALUES (p_tenant_id, v_credencial.id, p_prefijo, p_hash, 'VIGENTE', p_actor_id)
  RETURNING id INTO v_nuevo_id;

  UPDATE public.integracion_externa_credenciales SET updated_at = now() WHERE id = v_credencial.id;
  PERFORM app.registrar_evento_integracion_621(v_credencial, 'ROTACION', NULL, p_actor_id, v_nuevo_id,
    jsonb_build_object('secreto_anterior_id', v_anterior.id, 'gracia_hasta', v_valido_hasta));

  RETURN jsonb_build_object(
    'id', v_credencial.id, 'prefijo', p_prefijo, 'secreto_id', v_nuevo_id,
    'secreto_anterior_id', v_anterior.id, 'gracia_hasta', v_valido_hasta
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_rotacion_integracion_externa_621(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_credencial_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_credencial public.integracion_externa_credenciales%ROWTYPE;
  v_secreto public.integracion_externa_secretos%ROWTYPE;
BEGIN
  v_credencial := app.credencial_integracion_admin_621(p_tenant_id, p_actor_id, p_credencial_id);
  UPDATE public.integracion_externa_secretos s
     SET estado = 'RETIRADO', retirado_en = now()
   WHERE s.credencial_id = v_credencial.id AND s.estado = 'EN_GRACIA'
  RETURNING * INTO v_secreto;
  IF v_secreto.id IS NULL THEN
    RAISE EXCEPTION 'INTEGRATION_NO_ROTATION_IN_PROGRESS' USING ERRCODE = '55000';
  END IF;
  PERFORM app.registrar_evento_integracion_621(v_credencial, 'ROTACION_FINALIZADA', NULL, p_actor_id, v_secreto.id,
    jsonb_build_object('gracia_hasta', v_secreto.valido_hasta));
  RETURN jsonb_build_object('id', v_credencial.id, 'secreto_retirado_id', v_secreto.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_vencimiento_integracion_externa_621(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_credencial_id uuid,
  p_expira_en timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_credencial public.integracion_externa_credenciales%ROWTYPE;
BEGIN
  v_credencial := app.credencial_integracion_admin_621(p_tenant_id, p_actor_id, p_credencial_id);
  IF v_credencial.estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'INTEGRATION_CREDENTIAL_REVOKED' USING ERRCODE = '42501';
  END IF;
  IF p_expira_en IS NULL OR p_expira_en <= now() + interval '1 hour'
     OR p_expira_en > now() + interval '731 days' THEN
    RAISE EXCEPTION 'INTEGRATION_EXPIRY_OUT_OF_RANGE' USING ERRCODE = '22023';
  END IF;
  UPDATE public.integracion_externa_credenciales
     SET expira_en = p_expira_en, vencimiento_registrado_en = NULL, updated_at = now()
   WHERE id = v_credencial.id;
  -- Un secreto en gracia no sobrevive a la credencial.
  UPDATE public.integracion_externa_secretos s
     SET valido_hasta = least(s.valido_hasta, p_expira_en)
   WHERE s.credencial_id = v_credencial.id AND s.estado = 'EN_GRACIA';
  PERFORM app.registrar_evento_integracion_621(v_credencial, 'VENCIMIENTO_ACTUALIZADO', NULL, p_actor_id, NULL,
    jsonb_build_object('expira_en_anterior', v_credencial.expira_en, 'expira_en', p_expira_en));
  RETURN jsonb_build_object('id', v_credencial.id, 'expira_en', p_expira_en);
END;
$function$;

CREATE OR REPLACE FUNCTION public.revocar_integracion_externa_621(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_credencial_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_credencial public.integracion_externa_credenciales%ROWTYPE;
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
BEGIN
  v_credencial := app.credencial_integracion_admin_621(p_tenant_id, p_actor_id, p_credencial_id);
  IF v_credencial.estado = 'REVOCADA' THEN
    RETURN jsonb_build_object('id', v_credencial.id, 'estado', 'REVOCADA', 'idempotente', true);
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'INTEGRATION_REVOCATION_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  UPDATE public.integracion_externa_credenciales
     SET estado = 'REVOCADA', revocada_en = now(), revocada_por = p_actor_id,
         motivo_revocacion = v_motivo, updated_at = now()
   WHERE id = v_credencial.id;
  UPDATE public.integracion_externa_secretos
     SET estado = 'RETIRADO', retirado_en = now()
   WHERE credencial_id = v_credencial.id AND estado <> 'RETIRADO';
  -- Defensa en profundidad: las RPC del POS exigen actor activo.
  UPDATE public.usuarios_sistema
     SET activo = false, estado = 'INACTIVO', updated_at = now(), updated_by = p_actor_id
   WHERE id = v_credencial.cuenta_tecnica_id;
  PERFORM app.registrar_evento_integracion_621(v_credencial, 'REVOCACION', NULL, p_actor_id, NULL,
    jsonb_build_object('motivo', v_motivo));
  RETURN jsonb_build_object('id', v_credencial.id, 'estado', 'REVOCADA', 'idempotente', false);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Autenticación de cada petición
-- ---------------------------------------------------------------------------
-- Devuelve el veredicto en vez de lanzarlo: así el rechazo queda auditado en la
-- misma transacción (un RAISE desharía el evento). El backend decide el código
-- HTTP con `codigo`. `p_contexto` trae método, ruta, IP, la persona externa y
-- lo que el request declara de tenant/sucursal, para decidir aquí el alcance.
CREATE OR REPLACE FUNCTION public.autenticar_integracion_externa_621(
  p_prefijo text,
  p_hash text,
  p_contexto jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_secreto public.integracion_externa_secretos%ROWTYPE;
  v_credencial public.integracion_externa_credenciales%ROWTYPE;
  v_ctx jsonb := coalesce(p_contexto, '{}'::jsonb);
  v_codigo text;
  v_valor text;
BEGIN
  IF p_prefijo IS NULL OR p_prefijo !~ '^[a-z0-9]{12}$' OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'INTEGRACION_CREDENCIAL_INVALIDA');
  END IF;

  SELECT * INTO v_secreto FROM public.integracion_externa_secretos s WHERE s.prefijo = p_prefijo FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'INTEGRACION_CREDENCIAL_INVALIDA');
  END IF;
  SELECT * INTO v_credencial FROM public.integracion_externa_credenciales c
   WHERE c.id = v_secreto.credencial_id FOR UPDATE;

  IF v_secreto.hash_secreto <> p_hash THEN
    v_codigo := 'INTEGRACION_CREDENCIAL_INVALIDA';
  ELSIF v_credencial.estado = 'REVOCADA' THEN
    v_codigo := 'INTEGRACION_CREDENCIAL_REVOCADA';
  ELSIF v_credencial.expira_en <= now() THEN
    v_codigo := 'INTEGRACION_CREDENCIAL_VENCIDA';
    IF v_credencial.vencimiento_registrado_en IS NULL THEN
      UPDATE public.integracion_externa_credenciales
         SET vencimiento_registrado_en = now() WHERE id = v_credencial.id;
      PERFORM app.registrar_evento_integracion_621(v_credencial, 'VENCIMIENTO', NULL, NULL, NULL,
        jsonb_build_object('expira_en', v_credencial.expira_en));
    END IF;
  ELSIF v_secreto.estado = 'RETIRADO' THEN
    v_codigo := 'INTEGRACION_SECRETO_RETIRADO';
  ELSIF v_secreto.estado = 'EN_GRACIA' AND v_secreto.valido_hasta <= now() THEN
    v_codigo := 'INTEGRACION_SECRETO_RETIRADO';
    UPDATE public.integracion_externa_secretos SET estado = 'RETIRADO', retirado_en = now() WHERE id = v_secreto.id;
    PERFORM app.registrar_evento_integracion_621(v_credencial, 'SECRETO_RETIRADO', NULL, NULL, v_secreto.id,
      jsonb_build_object('motivo', 'fin_periodo_gracia', 'gracia_hasta', v_secreto.valido_hasta));
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema u
     WHERE u.id = v_credencial.cuenta_tecnica_id AND u.tenant_id = v_credencial.tenant_id
       AND u.es_cuenta_integracion AND coalesce(u.activo, false)
       AND lower(coalesce(u.estado::text, '')) = 'activo'
  ) THEN
    v_codigo := 'INTEGRACION_CUENTA_INACTIVA';
  ELSIF coalesce((v_ctx->>'ruta_permitida')::boolean, false) IS NOT TRUE THEN
    v_codigo := 'INTEGRACION_RUTA_NO_PERMITIDA';
  ELSE
    FOR v_valor IN SELECT jsonb_array_elements_text(coalesce(v_ctx->'tenant_solicitado', '[]'::jsonb)) LOOP
      IF v_valor IS DISTINCT FROM v_credencial.tenant_id::text THEN
        v_codigo := 'INTEGRACION_ALCANCE_TENANT';
      END IF;
    END LOOP;
    IF v_codigo IS NULL THEN
      FOR v_valor IN SELECT jsonb_array_elements_text(coalesce(v_ctx->'sucursal_solicitada', '[]'::jsonb)) LOOP
        IF v_valor IS DISTINCT FROM v_credencial.sucursal_id::text THEN
          v_codigo := 'INTEGRACION_ALCANCE_SUCURSAL';
        END IF;
      END LOOP;
    END IF;
    IF v_codigo IS NULL AND coalesce((v_ctx->>'actor_externo_requerido')::boolean, false)
       AND (nullif(btrim(v_ctx->>'actor_externo_id'), '') IS NULL
            OR nullif(btrim(v_ctx->>'actor_externo_nombre'), '') IS NULL) THEN
      v_codigo := 'INTEGRACION_ACTOR_EXTERNO_REQUERIDO';
    END IF;
  END IF;

  IF v_codigo IS NOT NULL THEN
    PERFORM app.registrar_evento_integracion_621(v_credencial, 'RECHAZO', v_codigo, NULL, v_secreto.id, '{}'::jsonb, v_ctx);
    RETURN jsonb_build_object('ok', false, 'codigo', v_codigo);
  END IF;

  UPDATE public.integracion_externa_credenciales SET ultimo_uso_en = now() WHERE id = v_credencial.id;
  PERFORM app.registrar_evento_integracion_621(v_credencial, 'USO', NULL, NULL, v_secreto.id,
    jsonb_build_object('secreto_estado', v_secreto.estado), v_ctx);

  RETURN jsonb_build_object(
    'ok', true,
    'credencial_id', v_credencial.id,
    'tenant_id', v_credencial.tenant_id,
    'sucursal_id', v_credencial.sucursal_id,
    'cuenta_tecnica_id', v_credencial.cuenta_tecnica_id,
    'nombre', v_credencial.nombre,
    'sistema', v_credencial.sistema,
    'secreto_id', v_secreto.id,
    'secreto_estado', v_secreto.estado,
    'expira_en', v_credencial.expira_en
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Venta POS con las dos identidades
-- ---------------------------------------------------------------------------
-- p_integracion: {credencial_id|null, referencia_externa|null,
--                 actor_externo_id|null, actor_externo_nombre|null}
CREATE OR REPLACE FUNCTION app.vincular_integracion_venta_621(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_venta_id uuid,
  p_integracion jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_venta public.ventas_pos%ROWTYPE;
  v_credencial public.integracion_externa_credenciales%ROWTYPE;
  v_ref text := nullif(btrim(coalesce(p_integracion->>'referencia_externa', '')), '');
  v_cred uuid := app.to_uuid_or_null(coalesce(p_integracion->>'credencial_id', ''));
  v_actor_id text := left(nullif(btrim(coalesce(p_integracion->>'actor_externo_id', '')), ''), 120);
  v_actor_nombre text := left(nullif(btrim(coalesce(p_integracion->>'actor_externo_nombre', '')), ''), 160);
  v_sucursal uuid;
BEGIN
  SELECT * INTO v_venta FROM public.ventas_pos v
   WHERE v.id = p_venta_id AND v.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_INTEGRATION_SALE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_cred IS NULL THEN
    IF v_actor_id IS NOT NULL OR v_actor_nombre IS NOT NULL THEN
      RAISE EXCEPTION 'POS_EXTERNAL_ACTOR_REQUIRES_INTEGRATION' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO v_credencial FROM public.integracion_externa_credenciales c
     WHERE c.id = v_cred AND c.tenant_id = p_tenant_id;
    IF NOT FOUND OR v_credencial.estado <> 'ACTIVA' OR v_credencial.cuenta_tecnica_id <> p_usuario_id THEN
      RAISE EXCEPTION 'POS_INTEGRATION_CREDENTIAL_INVALID' USING ERRCODE = '42501';
    END IF;
    IF v_actor_id IS NULL OR v_actor_nombre IS NULL THEN
      RAISE EXCEPTION 'POS_EXTERNAL_ACTOR_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF v_venta.usuario_id IS NOT NULL AND v_venta.usuario_id <> p_usuario_id THEN
      RAISE EXCEPTION 'POS_INTEGRATION_SALE_ACTOR_MISMATCH' USING ERRCODE = '42501';
    END IF;
    SELECT coalesce(v_venta.sucursal_id, c.sucursal_id) INTO v_sucursal
      FROM public.sesiones_caja s LEFT JOIN public.cajas c ON c.id = s.caja_id AND c.tenant_id = s.tenant_id
     WHERE s.id = v_venta.sesion_caja_id AND s.tenant_id = p_tenant_id;
    v_sucursal := coalesce(v_sucursal, v_venta.sucursal_id);
    IF v_sucursal IS DISTINCT FROM v_credencial.sucursal_id THEN
      RAISE EXCEPTION 'POS_INTEGRATION_BRANCH_MISMATCH' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_ref IS NULL AND v_cred IS NULL THEN
    RETURN jsonb_build_object('referencia_externa', v_venta.referencia_externa);
  END IF;

  IF v_venta.referencia_externa IS NULL AND v_venta.integracion_credencial_id IS NULL THEN
    UPDATE public.ventas_pos
       SET referencia_externa = v_ref,
           integracion_credencial_id = v_cred,
           actor_externo_id = v_actor_id,
           actor_externo_nombre = v_actor_nombre,
           updated_at = now()
     WHERE id = v_venta.id;
  ELSIF v_venta.referencia_externa IS DISTINCT FROM v_ref
     OR v_venta.integracion_credencial_id IS DISTINCT FROM v_cred THEN
    -- La misma idempotency_key es la misma operación: otra referencia u otra
    -- credencial es un cobro distinto que debe usar otra clave.
    RAISE EXCEPTION 'POS_IDEMPOTENCY_PAYLOAD_MISMATCH' USING ERRCODE = '23505';
  END IF;

  RETURN jsonb_build_object(
    'referencia_externa', v_ref,
    'integracion_credencial_id', v_cred,
    'actor_externo_id', coalesce(v_venta.actor_externo_id, v_actor_id),
    'actor_externo_nombre', coalesce(v_venta.actor_externo_nombre, v_actor_nombre)
  );
END;
$function$;

-- Registra la venta con el writer comercial canónico y, en la misma
-- transacción, enlaza la referencia externa y las dos identidades.
CREATE OR REPLACE FUNCTION public.pos_registrar_venta_integracion_621(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_sesion_caja_id uuid,
  p_idempotency_key text,
  p_payload jsonb,
  p_integracion jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_result jsonb;
  v_link jsonb;
BEGIN
  v_result := public.pos_registrar_venta_comercial_tx(
    p_tenant_id, p_usuario_id, p_sesion_caja_id, p_idempotency_key, p_payload
  );
  v_link := app.vincular_integracion_venta_621(
    p_tenant_id, p_usuario_id,
    app.to_uuid_or_null(coalesce(v_result->>'venta_id', '')),
    coalesce(p_integracion, '{}'::jsonb)
  );
  RETURN v_result || v_link;
END;
$function$;

-- Reintento confirmado (la venta ya existía): sólo comprueba o completa el
-- enlace, sin volver a registrar nada.
CREATE OR REPLACE FUNCTION public.pos_vincular_integracion_venta_621(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_venta_id uuid,
  p_integracion jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.vincular_integracion_venta_621($1, $2, $3, coalesce($4, '{}'::jsonb));
$function$;

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------
ALTER TABLE public.integracion_externa_credenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracion_externa_credenciales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.integracion_externa_secretos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracion_externa_secretos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.integracion_externa_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracion_externa_eventos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_only_no_direct_access_621 ON public.integracion_externa_credenciales;
CREATE POLICY service_only_no_direct_access_621 ON public.integracion_externa_credenciales
  FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS service_only_no_direct_access_621 ON public.integracion_externa_secretos;
CREATE POLICY service_only_no_direct_access_621 ON public.integracion_externa_secretos
  FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS service_only_no_direct_access_621 ON public.integracion_externa_eventos;
CREATE POLICY service_only_no_direct_access_621 ON public.integracion_externa_eventos
  FOR ALL USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.integracion_externa_credenciales FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.integracion_externa_secretos FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.integracion_externa_eventos FROM PUBLIC, anon, authenticated, service_role;
-- El backend lee credenciales y eventos para la pantalla; los hashes, nunca.
GRANT SELECT ON TABLE public.integracion_externa_credenciales TO service_role;
GRANT SELECT ON TABLE public.integracion_externa_eventos TO service_role;
GRANT SELECT (id, tenant_id, credencial_id, prefijo, estado, valido_hasta, retirado_en, created_at)
  ON TABLE public.integracion_externa_secretos TO service_role;

REVOKE ALL ON FUNCTION app.integracion_permisos_621() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.integracion_rol_nombre_621() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.guard_cuenta_integracion_621() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.guard_roles_integracion_621() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.guard_permisos_rol_integracion_621() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.integracion_eventos_inmutables_621() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.registrar_evento_integracion_621(public.integracion_externa_credenciales, text, text, uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_secreto_integracion_621(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.credencial_integracion_admin_621(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_actor_sucursal_621(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.vincular_integracion_venta_621(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.crear_integracion_externa_621(uuid, uuid, uuid, text, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotar_integracion_externa_621(uuid, uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalizar_rotacion_integracion_externa_621(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_vencimiento_integracion_externa_621(uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revocar_integracion_externa_621(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.autenticar_integracion_externa_621(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_registrar_venta_integracion_621(uuid, uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_vincular_integracion_venta_621(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_integracion_externa_621(uuid, uuid, uuid, text, text, timestamptz, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotar_integracion_externa_621(uuid, uuid, uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalizar_rotacion_integracion_externa_621(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_vencimiento_integracion_externa_621(uuid, uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.revocar_integracion_externa_621(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.autenticar_integracion_externa_621(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_registrar_venta_integracion_621(uuid, uuid, uuid, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_vincular_integracion_venta_621(uuid, uuid, uuid, jsonb) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
