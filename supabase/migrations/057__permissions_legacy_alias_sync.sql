-- ============================================================================
-- 057__permissions_legacy_alias_sync.sql
-- Compatibilidad legacy para consultas anidadas con permissions/role_permissions
-- y sincronizacion bidireccional con permisos/rol_permisos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Canonico permisos: codigo operativo (ej. compras.aprobar)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.permisos
  ADD COLUMN IF NOT EXISTS codigo text;

ALTER TABLE IF EXISTS public.permisos
  ALTER COLUMN recurso SET DEFAULT '__global__';

CREATE OR REPLACE FUNCTION app.build_permission_code(
  p_modulo text,
  p_accion text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    concat_ws(
      '.',
      NULLIF(btrim(COALESCE(p_modulo, '')), ''),
      NULLIF(btrim(COALESCE(p_accion, '')), '')
    )
  );
$$;

CREATE OR REPLACE FUNCTION app.normalize_permisos_codigo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.modulo := COALESCE(NULLIF(btrim(NEW.modulo), ''), 'general');
  NEW.recurso := COALESCE(NULLIF(btrim(NEW.recurso), ''), '__global__');
  NEW.accion := COALESCE(NULLIF(btrim(NEW.accion), ''), 'read');
  NEW.codigo := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.codigo, ''))), ''),
    app.build_permission_code(NEW.modulo, NEW.accion)
  );
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_permisos_codigo ON public.permisos;
CREATE TRIGGER trg_normalize_permisos_codigo
BEFORE INSERT OR UPDATE
ON public.permisos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_permisos_codigo();

UPDATE public.permisos p
SET
  modulo = COALESCE(NULLIF(btrim(p.modulo), ''), 'general'),
  recurso = COALESCE(NULLIF(btrim(p.recurso), ''), '__global__'),
  accion = COALESCE(NULLIF(btrim(p.accion), ''), 'read'),
  codigo = COALESCE(
    NULLIF(lower(btrim(COALESCE(p.codigo, ''))), ''),
    app.build_permission_code(p.modulo, p.accion)
  ),
  updated_at = now()
WHERE p.id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_permisos_tenant_codigo
ON public.permisos (tenant_id, codigo);

CREATE INDEX IF NOT EXISTS idx_permisos_global_codigo
ON public.permisos (codigo)
WHERE tenant_id IS NULL;

-- ----------------------------------------------------------------------------
-- Tabla legacy permissions (alias materializado para PostgREST nested selects)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  modulo text NOT NULL,
  recurso text NOT NULL DEFAULT '__global__',
  accion text NOT NULL,
  codigo text,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.permissions
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS modulo text,
  ADD COLUMN IF NOT EXISTS recurso text DEFAULT '__global__',
  ADD COLUMN IF NOT EXISTS accion text,
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

SELECT app.add_fk_if_possible('permissions', 'tenant_id', 'tenants', 'id', 'fk_permissions_tenant_id');

CREATE INDEX IF NOT EXISTS idx_permissions_tenant_codigo
ON public.permissions (tenant_id, codigo);

CREATE INDEX IF NOT EXISTS idx_permissions_global_codigo
ON public.permissions (codigo)
WHERE tenant_id IS NULL;

DROP TRIGGER IF EXISTS trg_set_updated_at_permissions ON public.permissions;
CREATE TRIGGER trg_set_updated_at_permissions
BEFORE UPDATE ON public.permissions
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE IF EXISTS public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissions_tenant_select ON public.permissions;
DROP POLICY IF EXISTS permissions_tenant_write ON public.permissions;

CREATE POLICY permissions_tenant_select
ON public.permissions
FOR SELECT
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR tenant_id IS NULL
);

CREATE POLICY permissions_tenant_write
ON public.permissions
FOR ALL
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
);

CREATE OR REPLACE FUNCTION app.normalize_permissions_alias_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.modulo := COALESCE(NULLIF(btrim(NEW.modulo), ''), 'general');
  NEW.recurso := COALESCE(NULLIF(btrim(NEW.recurso), ''), '__global__');
  NEW.accion := COALESCE(NULLIF(btrim(NEW.accion), ''), 'read');
  NEW.codigo := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.codigo, ''))), ''),
    app.build_permission_code(NEW.modulo, NEW.accion)
  );
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  IF NEW.activo IS NULL THEN
    NEW.activo := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_permissions_alias_fields ON public.permissions;
CREATE TRIGGER trg_normalize_permissions_alias_fields
BEFORE INSERT OR UPDATE
ON public.permissions
FOR EACH ROW
EXECUTE FUNCTION app.normalize_permissions_alias_fields();

-- ----------------------------------------------------------------------------
-- Tabla legacy role_permissions (alias materializado para nested selects)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  concedido boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.role_permissions
  ADD COLUMN IF NOT EXISTS role_id uuid,
  ADD COLUMN IF NOT EXISTS permission_id uuid,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS concedido boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

SELECT app.add_fk_if_possible('role_permissions', 'role_id', 'roles', 'id', 'fk_role_permissions_role_id');
SELECT app.add_fk_if_possible('role_permissions', 'permission_id', 'permissions', 'id', 'fk_role_permissions_permission_id');
SELECT app.add_fk_if_possible('role_permissions', 'tenant_id', 'tenants', 'id', 'fk_role_permissions_tenant_id');

CREATE UNIQUE INDEX IF NOT EXISTS ux_role_permissions_role_permission
ON public.role_permissions (role_id, permission_id);

CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_role
ON public.role_permissions (tenant_id, role_id);

CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_permission
ON public.role_permissions (tenant_id, permission_id);

DROP TRIGGER IF EXISTS trg_set_updated_at_role_permissions ON public.role_permissions;
CREATE TRIGGER trg_set_updated_at_role_permissions
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE IF EXISTS public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.role_permissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_permissions_tenant_select ON public.role_permissions;
DROP POLICY IF EXISTS role_permissions_tenant_write ON public.role_permissions;

CREATE POLICY role_permissions_tenant_select
ON public.role_permissions
FOR SELECT
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR tenant_id IS NULL
);

CREATE POLICY role_permissions_tenant_write
ON public.role_permissions
FOR ALL
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
);

-- ----------------------------------------------------------------------------
-- Sync canónico -> legacy (permisos -> permissions)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_permissions_from_permisos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.permissions p
    WHERE p.id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.permissions (
    id,
    tenant_id,
    modulo,
    recurso,
    accion,
    codigo,
    descripcion,
    activo,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    COALESCE(NULLIF(btrim(NEW.modulo), ''), 'general'),
    COALESCE(NULLIF(btrim(NEW.recurso), ''), '__global__'),
    COALESCE(NULLIF(btrim(NEW.accion), ''), 'read'),
    COALESCE(NULLIF(lower(btrim(COALESCE(NEW.codigo, ''))), ''), app.build_permission_code(NEW.modulo, NEW.accion)),
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    COALESCE(NEW.activo, true),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    modulo = EXCLUDED.modulo,
    recurso = EXCLUDED.recurso,
    accion = EXCLUDED.accion,
    codigo = EXCLUDED.codigo,
    descripcion = EXCLUDED.descripcion,
    activo = EXCLUDED.activo,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_permissions_from_permisos ON public.permisos;
CREATE TRIGGER trg_sync_permissions_from_permisos
AFTER INSERT OR UPDATE OR DELETE
ON public.permisos
FOR EACH ROW
EXECUTE FUNCTION app.sync_permissions_from_permisos();

-- ----------------------------------------------------------------------------
-- Sync legacy -> canónico (permissions -> permisos)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_permisos_from_permissions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.permisos p
    WHERE p.id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.permisos (
    id,
    tenant_id,
    modulo,
    recurso,
    accion,
    codigo,
    descripcion,
    activo,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    COALESCE(NULLIF(btrim(NEW.modulo), ''), 'general'),
    COALESCE(NULLIF(btrim(NEW.recurso), ''), '__global__'),
    COALESCE(NULLIF(btrim(NEW.accion), ''), 'read'),
    COALESCE(NULLIF(lower(btrim(COALESCE(NEW.codigo, ''))), ''), app.build_permission_code(NEW.modulo, NEW.accion)),
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    COALESCE(NEW.activo, true),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    modulo = EXCLUDED.modulo,
    recurso = EXCLUDED.recurso,
    accion = EXCLUDED.accion,
    codigo = EXCLUDED.codigo,
    descripcion = EXCLUDED.descripcion,
    activo = EXCLUDED.activo,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_permisos_from_permissions ON public.permissions;
CREATE TRIGGER trg_sync_permisos_from_permissions
AFTER INSERT OR UPDATE OR DELETE
ON public.permissions
FOR EACH ROW
EXECUTE FUNCTION app.sync_permisos_from_permissions();

-- ----------------------------------------------------------------------------
-- Sync canónico -> legacy (rol_permisos -> role_permissions)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_role_permissions_from_rol_permisos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.role_permissions rp
    WHERE rp.id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.permissions (
    id,
    tenant_id,
    modulo,
    recurso,
    accion,
    codigo,
    descripcion,
    activo,
    created_at,
    updated_at
  )
  SELECT
    p.id,
    p.tenant_id,
    COALESCE(NULLIF(btrim(p.modulo), ''), 'general'),
    COALESCE(NULLIF(btrim(p.recurso), ''), '__global__'),
    COALESCE(NULLIF(btrim(p.accion), ''), 'read'),
    COALESCE(NULLIF(lower(btrim(COALESCE(p.codigo, ''))), ''), app.build_permission_code(p.modulo, p.accion)),
    NULLIF(btrim(COALESCE(p.descripcion, '')), ''),
    COALESCE(p.activo, true),
    COALESCE(p.created_at, now()),
    now()
  FROM public.permisos p
  WHERE p.id = NEW.permiso_id
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    modulo = EXCLUDED.modulo,
    recurso = EXCLUDED.recurso,
    accion = EXCLUDED.accion,
    codigo = EXCLUDED.codigo,
    descripcion = EXCLUDED.descripcion,
    activo = EXCLUDED.activo,
    updated_at = now();

  SELECT r.tenant_id
  INTO v_tenant_id
  FROM public.roles r
  WHERE r.id = NEW.role_id;

  INSERT INTO public.role_permissions (
    id,
    role_id,
    permission_id,
    tenant_id,
    concedido,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.role_id,
    NEW.permiso_id,
    v_tenant_id,
    COALESCE(NEW.concedido, true),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    role_id = EXCLUDED.role_id,
    permission_id = EXCLUDED.permission_id,
    tenant_id = EXCLUDED.tenant_id,
    concedido = EXCLUDED.concedido,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_role_permissions_from_rol_permisos ON public.rol_permisos;
CREATE TRIGGER trg_sync_role_permissions_from_rol_permisos
AFTER INSERT OR UPDATE OR DELETE
ON public.rol_permisos
FOR EACH ROW
EXECUTE FUNCTION app.sync_role_permissions_from_rol_permisos();

-- ----------------------------------------------------------------------------
-- Sync legacy -> canónico (role_permissions -> rol_permisos)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_rol_permisos_from_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.rol_permisos rp
    WHERE rp.id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.permisos (
    id,
    tenant_id,
    modulo,
    recurso,
    accion,
    codigo,
    descripcion,
    activo,
    created_at,
    updated_at
  )
  SELECT
    p.id,
    p.tenant_id,
    COALESCE(NULLIF(btrim(p.modulo), ''), 'general'),
    COALESCE(NULLIF(btrim(p.recurso), ''), '__global__'),
    COALESCE(NULLIF(btrim(p.accion), ''), 'read'),
    COALESCE(NULLIF(lower(btrim(COALESCE(p.codigo, ''))), ''), app.build_permission_code(p.modulo, p.accion)),
    NULLIF(btrim(COALESCE(p.descripcion, '')), ''),
    COALESCE(p.activo, true),
    COALESCE(p.created_at, now()),
    now()
  FROM public.permissions p
  WHERE p.id = NEW.permission_id
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    modulo = EXCLUDED.modulo,
    recurso = EXCLUDED.recurso,
    accion = EXCLUDED.accion,
    codigo = EXCLUDED.codigo,
    descripcion = EXCLUDED.descripcion,
    activo = EXCLUDED.activo,
    updated_at = now();

  INSERT INTO public.rol_permisos (
    id,
    role_id,
    permiso_id,
    concedido,
    created_at
  )
  VALUES (
    NEW.id,
    NEW.role_id,
    NEW.permission_id,
    COALESCE(NEW.concedido, true),
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (id) DO UPDATE
  SET
    role_id = EXCLUDED.role_id,
    permiso_id = EXCLUDED.permiso_id,
    concedido = EXCLUDED.concedido;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rol_permisos_from_role_permissions ON public.role_permissions;
CREATE TRIGGER trg_sync_rol_permisos_from_role_permissions
AFTER INSERT OR UPDATE OR DELETE
ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION app.sync_rol_permisos_from_role_permissions();

-- ----------------------------------------------------------------------------
-- Backfill inicial: permisos -> permissions
-- ----------------------------------------------------------------------------
INSERT INTO public.permissions (
  id,
  tenant_id,
  modulo,
  recurso,
  accion,
  codigo,
  descripcion,
  activo,
  created_at,
  updated_at
)
SELECT
  p.id,
  p.tenant_id,
  COALESCE(NULLIF(btrim(p.modulo), ''), 'general'),
  COALESCE(NULLIF(btrim(p.recurso), ''), '__global__'),
  COALESCE(NULLIF(btrim(p.accion), ''), 'read'),
  COALESCE(NULLIF(lower(btrim(COALESCE(p.codigo, ''))), ''), app.build_permission_code(p.modulo, p.accion)),
  NULLIF(btrim(COALESCE(p.descripcion, '')), ''),
  COALESCE(p.activo, true),
  COALESCE(p.created_at, now()),
  COALESCE(p.updated_at, now())
FROM public.permisos p
WHERE p.id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  modulo = EXCLUDED.modulo,
  recurso = EXCLUDED.recurso,
  accion = EXCLUDED.accion,
  codigo = EXCLUDED.codigo,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- Backfill inicial: rol_permisos -> role_permissions
-- ----------------------------------------------------------------------------
INSERT INTO public.role_permissions (
  id,
  role_id,
  permission_id,
  tenant_id,
  concedido,
  created_at,
  updated_at
)
SELECT
  rp.id,
  rp.role_id,
  rp.permiso_id,
  r.tenant_id,
  COALESCE(rp.concedido, true),
  COALESCE(rp.created_at, now()),
  now()
FROM public.rol_permisos rp
LEFT JOIN public.roles r
  ON r.id = rp.role_id
WHERE rp.id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  role_id = EXCLUDED.role_id,
  permission_id = EXCLUDED.permission_id,
  tenant_id = EXCLUDED.tenant_id,
  concedido = EXCLUDED.concedido,
  updated_at = now();

COMMIT;
