-- ============================================================================
-- 185__cajas_auditoria_supervisor_runtime_alignment.sql
-- Runtime alignment for:
-- - caja_audit_log
-- - supervisor_pins
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS tenant_isolation ON public.caja_audit_log;
DROP POLICY IF EXISTS tenant_isolation ON public.supervisor_pins;

CREATE OR REPLACE FUNCTION app.normalize_caja_audit_estado(
  p_input text,
  p_default text DEFAULT 'ACTIVO'
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(p_input), ''), upper(COALESCE(NULLIF(btrim(p_default), ''), 'ACTIVO'))));
  IF v IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO') THEN
    RETURN v;
  END IF;
  IF v IN ('HABILITADO', 'VIGENTE', 'OK') THEN
    RETURN 'ACTIVO';
  END IF;
  IF v IN ('DESHABILITADO', 'ANULADO', 'ANULADA') THEN
    RETURN 'INACTIVO';
  END IF;
  RETURN 'ACTIVO';
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_supervisor_pin_estado(
  p_input text,
  p_default text DEFAULT 'ACTIVO'
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(p_input), ''), upper(COALESCE(NULLIF(btrim(p_default), ''), 'ACTIVO'))));
  IF v IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO', 'REVOCADO') THEN
    RETURN v;
  END IF;
  IF v IN ('SUSPENDIDO', 'LOCKED') THEN
    RETURN 'BLOQUEADO';
  END IF;
  IF v IN ('DISABLED', 'ANULADO', 'ANULADA') THEN
    RETURN 'INACTIVO';
  END IF;
  RETURN 'ACTIVO';
END;
$$;

-- ----------------------------------------------------------------------------
-- caja_audit_log
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.caja_audit_log
  ADD COLUMN IF NOT EXISTS sesion_caja_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS evento text,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS parametros jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resultado text,
  ADD COLUMN IF NOT EXISTS riesgo text DEFAULT 'BAJO';

ALTER TABLE IF EXISTS public.caja_audit_log
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN sesion_caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(sesion_caja_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN nombre TYPE text USING NULLIF(btrim(COALESCE(nombre, '')), ''),
  ALTER COLUMN codigo TYPE text USING NULLIF(upper(btrim(COALESCE(codigo, ''))), ''),
  ALTER COLUMN evento TYPE text USING NULLIF(upper(btrim(COALESCE(evento, ''))), ''),
  ALTER COLUMN ip_address TYPE inet USING app.to_inet_or_null(COALESCE(ip_address::text, '')),
  ALTER COLUMN user_agent TYPE text USING NULLIF(left(btrim(COALESCE(user_agent, '')), 512), ''),
  ALTER COLUMN parametros SET DEFAULT '{}'::jsonb,
  ALTER COLUMN resultado TYPE text USING NULLIF(upper(btrim(COALESCE(resultado, ''))), ''),
  ALTER COLUMN riesgo TYPE text USING upper(COALESCE(NULLIF(btrim(riesgo), ''), 'BAJO')),
  ALTER COLUMN estado TYPE text USING app.normalize_caja_audit_estado(estado, 'ACTIVO'),
  ALTER COLUMN "timestamp" TYPE timestamptz USING COALESCE("timestamp", created_at, now()),
  ALTER COLUMN "timestamp" SET DEFAULT now(),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.caja_audit_log c
SET
  evento = COALESCE(NULLIF(upper(btrim(COALESCE(c.evento, ''))), ''), 'EVENTO'),
  nombre = COALESCE(NULLIF(btrim(COALESCE(c.nombre, '')), ''), replace(initcap(lower(COALESCE(c.evento, 'EVENTO'))), '_', ' ')),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(c.codigo, ''))), ''), format('CAL-%s', upper(left(replace(c.id::text, '-', ''), 8)))),
  ip_address = app.to_inet_or_null(COALESCE(c.ip_address::text, '')),
  user_agent = NULLIF(left(btrim(COALESCE(c.user_agent, '')), 512), ''),
  parametros = COALESCE(c.parametros, '{}'::jsonb),
  resultado = COALESCE(NULLIF(upper(btrim(COALESCE(c.resultado, ''))), ''), 'REGISTRADO'),
  riesgo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(c.riesgo), ''), 'BAJO')) IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO') THEN upper(COALESCE(NULLIF(btrim(c.riesgo), ''), 'BAJO'))
    WHEN upper(COALESCE(NULLIF(btrim(c.evento), ''), '')) IN ('ANOMALIA_DETECTADA', 'APERTURA_FORZOSA', 'INTENTO_CIERRE_FALLIDO', 'RETIRO_RECHAZADO') THEN 'ALTO'
    ELSE 'BAJO'
  END,
  estado = app.normalize_caja_audit_estado(c.estado, 'ACTIVO'),
  "timestamp" = COALESCE(c."timestamp", c.created_at, now()),
  metadata = COALESCE(c.metadata, '{}'::jsonb),
  updated_at = now()
WHERE c.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_caja_audit_log_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.evento := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.evento, ''))), ''), 'EVENTO');
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), replace(initcap(lower(NEW.evento)), '_', ' '));
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('CAL-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );
  NEW.ip_address := app.to_inet_or_null(COALESCE(NEW.ip_address::text, ''));
  NEW.user_agent := NULLIF(left(btrim(COALESCE(NEW.user_agent, '')), 512), '');
  NEW.parametros := COALESCE(NEW.parametros, '{}'::jsonb);
  NEW.resultado := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.resultado, ''))), ''), 'REGISTRADO');
  NEW.riesgo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.riesgo, '')), ''), 'BAJO'));
  IF NEW.riesgo NOT IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO') THEN
    NEW.riesgo := 'BAJO';
  END IF;
  NEW.estado := app.normalize_caja_audit_estado(NEW.estado, 'ACTIVO');
  NEW."timestamp" := COALESCE(NEW."timestamp", NEW.created_at, now());
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_caja_audit_log_row ON public.caja_audit_log;
CREATE TRIGGER trg_normalize_caja_audit_log_row
BEFORE INSERT OR UPDATE ON public.caja_audit_log
FOR EACH ROW
EXECUTE FUNCTION app.normalize_caja_audit_log_row();

-- ----------------------------------------------------------------------------
-- supervisor_pins
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.supervisor_pins
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS hash_pin text,
  ADD COLUMN IF NOT EXISTS salt text,
  ADD COLUMN IF NOT EXISTS algoritmo text DEFAULT 'BCRYPT',
  ADD COLUMN IF NOT EXISTS pin_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS intentos_fallidos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_intento_at timestamptz,
  ADD COLUMN IF NOT EXISTS bloqueado_hasta timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_cambio_at timestamptz,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.supervisor_pins
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN nombre TYPE text USING NULLIF(btrim(COALESCE(nombre, '')), ''),
  ALTER COLUMN codigo TYPE text USING NULLIF(upper(btrim(COALESCE(codigo, ''))), ''),
  ALTER COLUMN hash_pin TYPE text USING NULLIF(btrim(COALESCE(hash_pin, '')), ''),
  ALTER COLUMN salt TYPE text USING NULLIF(btrim(COALESCE(salt, '')), ''),
  ALTER COLUMN algoritmo TYPE text USING upper(COALESCE(NULLIF(btrim(algoritmo), ''), 'BCRYPT')),
  ALTER COLUMN pin_version TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(pin_version::text, '1')), 1),
  ALTER COLUMN intentos_fallidos TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(intentos_fallidos::text, '0')), 0),
  ALTER COLUMN ultimo_intento_at TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(ultimo_intento_at::text, '')),
  ALTER COLUMN bloqueado_hasta TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(bloqueado_hasta::text, '')),
  ALTER COLUMN ultimo_cambio_at TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(ultimo_cambio_at::text, '')),
  ALTER COLUMN estado TYPE text USING app.normalize_supervisor_pin_estado(estado, 'ACTIVO'),
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN algoritmo SET DEFAULT 'BCRYPT',
  ALTER COLUMN pin_version SET DEFAULT 1,
  ALTER COLUMN intentos_fallidos SET DEFAULT 0,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.supervisor_pins s
SET
  nombre = COALESCE(NULLIF(btrim(COALESCE(s.nombre, '')), ''), 'Supervisor PIN'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(s.codigo, ''))), ''), format('SPIN-%s', upper(left(replace(s.id::text, '-', ''), 8)))),
  hash_pin = NULLIF(btrim(COALESCE(s.hash_pin, '')), ''),
  salt = NULLIF(btrim(COALESCE(s.salt, '')), ''),
  algoritmo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(s.algoritmo), ''), 'BCRYPT')) IN ('BCRYPT', 'ARGON2', 'PBKDF2')
    THEN upper(COALESCE(NULLIF(btrim(s.algoritmo), ''), 'BCRYPT'))
    ELSE 'BCRYPT'
  END,
  pin_version = GREATEST(COALESCE(s.pin_version, 1), 1),
  intentos_fallidos = GREATEST(COALESCE(s.intentos_fallidos, 0), 0),
  estado = app.normalize_supervisor_pin_estado(s.estado, 'ACTIVO'),
  activo = CASE
    WHEN app.normalize_supervisor_pin_estado(s.estado, 'ACTIVO') = 'ACTIVO' THEN COALESCE(s.activo, true)
    ELSE false
  END,
  ultimo_cambio_at = COALESCE(s.ultimo_cambio_at, s.updated_at, s.created_at, now()),
  metadata = COALESCE(s.metadata, '{}'::jsonb),
  updated_at = now()
WHERE s.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_supervisor_pins_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Supervisor PIN');
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('SPIN-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );
  NEW.hash_pin := NULLIF(btrim(COALESCE(NEW.hash_pin, '')), '');
  NEW.salt := NULLIF(btrim(COALESCE(NEW.salt, '')), '');
  NEW.algoritmo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.algoritmo, '')), ''), 'BCRYPT'));
  IF NEW.algoritmo NOT IN ('BCRYPT', 'ARGON2', 'PBKDF2') THEN
    NEW.algoritmo := 'BCRYPT';
  END IF;
  NEW.pin_version := GREATEST(COALESCE(NEW.pin_version, 1), 1);
  NEW.intentos_fallidos := GREATEST(COALESCE(NEW.intentos_fallidos, 0), 0);
  NEW.ultimo_intento_at := app.to_timestamptz_or_null(COALESCE(NEW.ultimo_intento_at::text, ''));
  NEW.bloqueado_hasta := app.to_timestamptz_or_null(COALESCE(NEW.bloqueado_hasta::text, ''));
  NEW.ultimo_cambio_at := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.ultimo_cambio_at::text, '')), NEW.updated_at, NEW.created_at, now());
  NEW.estado := app.normalize_supervisor_pin_estado(NEW.estado, 'ACTIVO');
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'ACTIVO');
  IF NEW.estado <> 'ACTIVO' THEN
    NEW.activo := false;
  END IF;
  IF NEW.bloqueado_hasta IS NOT NULL AND NEW.bloqueado_hasta > now() THEN
    NEW.estado := 'BLOQUEADO';
    NEW.activo := false;
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_supervisor_pins_row ON public.supervisor_pins;
CREATE TRIGGER trg_normalize_supervisor_pins_row
BEFORE INSERT OR UPDATE ON public.supervisor_pins
FOR EACH ROW
EXECUTE FUNCTION app.normalize_supervisor_pins_row();

-- Runtime indexes for caja audit + supervisor pin checks.
CREATE INDEX IF NOT EXISTS idx_caja_audit_log_tenant_evento_timestamp_runtime
ON public.caja_audit_log (tenant_id, evento, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_caja_audit_log_tenant_usuario_timestamp_runtime
ON public.caja_audit_log (tenant_id, usuario_id, "timestamp" DESC)
WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_caja_audit_log_tenant_sesion_timestamp_runtime
ON public.caja_audit_log (tenant_id, sesion_caja_id, "timestamp" DESC)
WHERE sesion_caja_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supervisor_pins_tenant_usuario_estado_runtime
ON public.supervisor_pins (tenant_id, usuario_id, estado, activo);

CREATE INDEX IF NOT EXISTS idx_supervisor_pins_bloqueado_hasta_runtime
ON public.supervisor_pins (tenant_id, bloqueado_hasta)
WHERE bloqueado_hasta IS NOT NULL;

SELECT app.apply_tenant_policy('public', 'caja_audit_log');
SELECT app.apply_tenant_policy('public', 'supervisor_pins');

COMMIT;
