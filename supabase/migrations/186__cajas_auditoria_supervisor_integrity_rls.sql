-- ============================================================================
-- 186__cajas_auditoria_supervisor_integrity_rls.sql
-- Integrity + RLS hardening for:
-- - caja_audit_log
-- - supervisor_pins
-- ============================================================================

BEGIN;

-- Backfill tenant consistency by parent relations.
UPDATE public.caja_audit_log c
SET tenant_id = s.tenant_id
FROM public.sesiones_caja s
WHERE c.sesion_caja_id = s.id
  AND s.tenant_id IS NOT NULL
  AND (c.tenant_id IS NULL OR c.tenant_id <> s.tenant_id);

UPDATE public.caja_audit_log c
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE c.usuario_id = u.id
  AND u.tenant_id IS NOT NULL
  AND c.tenant_id IS NULL;

UPDATE public.supervisor_pins sp
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE sp.usuario_id = u.id
  AND u.tenant_id IS NOT NULL
  AND (sp.tenant_id IS NULL OR sp.tenant_id <> u.tenant_id);

-- Runtime FKs for joins/embeds.
SELECT app.add_fk_if_possible(
  'caja_audit_log',
  'sesion_caja_id',
  'sesiones_caja',
  'id',
  'caja_audit_log_sesion_caja_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'caja_audit_log',
  'usuario_id',
  'usuarios_sistema',
  'id',
  'caja_audit_log_usuario_id_fkey_runtime'
);

SELECT app.add_fk_if_possible(
  'supervisor_pins',
  'usuario_id',
  'usuarios_sistema',
  'id',
  'supervisor_pins_usuario_id_fkey_runtime'
);

-- Dedupe: allow one active pin per tenant+usuario.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, usuario_id
      ORDER BY
        COALESCE(ultimo_cambio_at, updated_at, created_at, now()) DESC,
        id::text DESC
    ) AS rn
  FROM public.supervisor_pins
  WHERE tenant_id IS NOT NULL
    AND usuario_id IS NOT NULL
    AND COALESCE(activo, true) = true
)
UPDATE public.supervisor_pins sp
SET
  activo = false,
  estado = 'INACTIVO',
  updated_at = now()
FROM ranked
WHERE sp.id = ranked.id
  AND ranked.rn > 1;

-- Enforce tenant consistency.
CREATE OR REPLACE FUNCTION app.enforce_caja_audit_log_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_sesion uuid;
  v_tenant_usuario uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  IF NEW.sesion_caja_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_sesion
    FROM public.sesiones_caja
    WHERE id = NEW.sesion_caja_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        MESSAGE = format('sesion_caja no existe: %s', NEW.sesion_caja_id),
        ERRCODE = '23503';
    END IF;
  END IF;

  IF NEW.usuario_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_usuario
    FROM public.usuarios_sistema
    WHERE id = NEW.usuario_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        MESSAGE = format('usuario no existe: %s', NEW.usuario_id),
        ERRCODE = '23503';
    END IF;
  END IF;

  IF v_tenant_sesion IS NOT NULL AND v_tenant_usuario IS NOT NULL AND v_tenant_sesion <> v_tenant_usuario THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant de sesion y usuario no coincide en caja_audit_log',
      ERRCODE = '23514';
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_sesion, v_tenant_usuario);

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id es obligatorio en caja_audit_log',
      ERRCODE = '23514';
  END IF;

  IF v_tenant_sesion IS NOT NULL AND NEW.tenant_id <> v_tenant_sesion THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id no coincide con sesion_caja en caja_audit_log',
      ERRCODE = '23514';
  END IF;
  IF v_tenant_usuario IS NOT NULL AND NEW.tenant_id <> v_tenant_usuario THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id no coincide con usuario en caja_audit_log',
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_caja_audit_log_tenant_consistency ON public.caja_audit_log;
CREATE TRIGGER trg_enforce_caja_audit_log_tenant_consistency
BEFORE INSERT OR UPDATE ON public.caja_audit_log
FOR EACH ROW
EXECUTE FUNCTION app.enforce_caja_audit_log_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_supervisor_pins_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_usuario uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  IF NEW.usuario_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'usuario_id es obligatorio en supervisor_pins',
      ERRCODE = '23514';
  END IF;

  SELECT tenant_id INTO v_tenant_usuario
  FROM public.usuarios_sistema
  WHERE id = NEW.usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      MESSAGE = format('usuario no existe: %s', NEW.usuario_id),
      ERRCODE = '23503';
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_usuario);
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id es obligatorio en supervisor_pins',
      ERRCODE = '23514';
  END IF;

  IF v_tenant_usuario IS NOT NULL AND NEW.tenant_id <> v_tenant_usuario THEN
    RAISE EXCEPTION USING
      MESSAGE = 'tenant_id no coincide con usuario en supervisor_pins',
      ERRCODE = '23514';
  END IF;

  IF COALESCE(NEW.activo, true) = true AND (NEW.hash_pin IS NULL OR btrim(NEW.hash_pin) = '') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'hash_pin es obligatorio para supervisor_pins activo',
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_supervisor_pins_tenant_consistency ON public.supervisor_pins;
CREATE TRIGGER trg_enforce_supervisor_pins_tenant_consistency
BEFORE INSERT OR UPDATE ON public.supervisor_pins
FOR EACH ROW
EXECUTE FUNCTION app.enforce_supervisor_pins_tenant_consistency();

-- Business constraints.
ALTER TABLE public.caja_audit_log
DROP CONSTRAINT IF EXISTS ck_caja_audit_log_runtime;
ALTER TABLE public.caja_audit_log
ADD CONSTRAINT ck_caja_audit_log_runtime CHECK (
  tenant_id IS NOT NULL
  AND evento IS NOT NULL
  AND btrim(evento) <> ''
  AND "timestamp" IS NOT NULL
  AND riesgo IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO')
  AND estado IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO')
);

ALTER TABLE public.supervisor_pins
DROP CONSTRAINT IF EXISTS ck_supervisor_pins_runtime;
ALTER TABLE public.supervisor_pins
ADD CONSTRAINT ck_supervisor_pins_runtime CHECK (
  tenant_id IS NOT NULL
  AND usuario_id IS NOT NULL
  AND estado IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO', 'REVOCADO')
  AND intentos_fallidos >= 0
  AND intentos_fallidos <= 100
  AND pin_version >= 1
  AND (
    COALESCE(activo, false) = false
    OR (hash_pin IS NOT NULL AND btrim(hash_pin) <> '')
  )
);

-- Operational indexes / uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS ux_supervisor_pins_tenant_usuario_activo_runtime
ON public.supervisor_pins (tenant_id, usuario_id)
WHERE tenant_id IS NOT NULL
  AND usuario_id IS NOT NULL
  AND COALESCE(activo, true) = true;

CREATE INDEX IF NOT EXISTS idx_caja_audit_log_tenant_riesgo_timestamp_runtime
ON public.caja_audit_log (tenant_id, riesgo, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_supervisor_pins_tenant_usuario_bloqueo_runtime
ON public.supervisor_pins (tenant_id, usuario_id, bloqueado_hasta DESC);

-- Explicit RLS hardening.
ALTER TABLE IF EXISTS public.caja_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.caja_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.supervisor_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.supervisor_pins FORCE ROW LEVEL SECURITY;

SELECT app.apply_tenant_policy('public', 'caja_audit_log');
SELECT app.apply_tenant_policy('public', 'supervisor_pins');

COMMIT;
