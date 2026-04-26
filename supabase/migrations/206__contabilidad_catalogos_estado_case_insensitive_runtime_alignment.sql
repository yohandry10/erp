-- ============================================================================
-- 206__contabilidad_catalogos_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para catalogos contables:
-- periodos_contables, centros_costo, presupuestos y plan_cuentas.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_periodos_estado_206(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'ABIERTO'));
BEGIN
  IF v IN ('ABIERTO', 'OPEN', 'ACTIVO', 'HABILITADO') THEN
    RETURN 'ABIERTO'::citext;
  END IF;

  IF v IN ('CERRADO', 'CLOSED', 'FINALIZADO', 'CLAUSURADO') THEN
    RETURN 'CERRADO'::citext;
  END IF;

  IF v IN ('BLOQUEADO', 'LOCKED', 'PAUSADO', 'SUSPENDIDO') THEN
    RETURN 'BLOQUEADO'::citext;
  END IF;

  RETURN 'ABIERTO'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_presupuestos_estado_206(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'ACTIVO'));
BEGIN
  IF v IN ('ACTIVO', 'ACTIVE', 'ABIERTO', 'VIGENTE') THEN
    RETURN 'ACTIVO'::citext;
  END IF;

  IF v IN ('BLOQUEADO', 'LOCKED', 'SUSPENDIDO', 'PAUSADO') THEN
    RETURN 'BLOQUEADO'::citext;
  END IF;

  IF v IN ('CERRADO', 'CLOSED', 'FINALIZADO', 'CONSUMIDO') THEN
    RETURN 'CERRADO'::citext;
  END IF;

  RETURN 'ACTIVO'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_activo_inactivo_estado_206(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_estado), ''), 'ACTIVO'));
BEGIN
  IF v IN ('INACTIVO', 'INACTIVE', 'DISABLED', 'BAJA') THEN
    RETURN 'INACTIVO'::citext;
  END IF;

  RETURN 'ACTIVO'::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_plan_cuentas_tipo_206(p_tipo text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := upper(COALESCE(NULLIF(btrim(p_tipo), ''), 'ACTIVO'));
BEGIN
  IF v IN ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO', 'ORDEN') THEN
    RETURN v;
  END IF;

  IF v IN ('INGRESOS') THEN
    RETURN 'INGRESO';
  END IF;

  IF v IN ('GASTOS') THEN
    RETURN 'GASTO';
  END IF;

  RETURN 'ACTIVO';
END;
$$;

-- ----------------------------------------------------------------------------
-- Shape runtime para plan_cuentas.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.plan_cuentas
  ADD COLUMN IF NOT EXISTS tipo_cuenta text,
  ADD COLUMN IF NOT EXISTS cuenta_padre_id uuid,
  ADD COLUMN IF NOT EXISTS acepta_movimiento boolean DEFAULT false;

ALTER TABLE IF EXISTS public.plan_cuentas
  ALTER COLUMN acepta_movimiento TYPE boolean
  USING (
    CASE
      WHEN lower(COALESCE(NULLIF(btrim(acepta_movimiento::text), ''), 'false')) IN
        ('true', 't', '1', 'si', 's', 'yes', 'y')
        THEN true
      ELSE false
    END
  ),
  ALTER COLUMN acepta_movimiento SET DEFAULT false;

ALTER TABLE IF EXISTS public.plan_cuentas
  ALTER COLUMN estado TYPE citext USING app.normalize_activo_inactivo_estado_206(estado::text),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE IF EXISTS public.periodos_contables
  ALTER COLUMN estado TYPE citext USING app.normalize_periodos_estado_206(estado::text),
  ALTER COLUMN estado SET DEFAULT 'ABIERTO'::citext;

ALTER TABLE IF EXISTS public.centros_costo
  ALTER COLUMN estado TYPE citext USING app.normalize_activo_inactivo_estado_206(estado::text),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE IF EXISTS public.presupuestos
  ALTER COLUMN estado TYPE citext USING app.normalize_presupuestos_estado_206(estado::text),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

ALTER TABLE IF EXISTS public.plan_cuentas
  ALTER COLUMN activo SET DEFAULT true;

-- ----------------------------------------------------------------------------
-- Backfill defensivo de estado/aliases/booleanos.
-- ----------------------------------------------------------------------------
UPDATE public.periodos_contables p
SET
  estado = app.normalize_periodos_estado_206(p.estado::text),
  updated_at = now()
WHERE p.id IS NOT NULL;

UPDATE public.centros_costo c
SET
  estado = app.normalize_activo_inactivo_estado_206(c.estado::text),
  activo = COALESCE(c.activo, lower(app.normalize_activo_inactivo_estado_206(c.estado::text)::text) = 'activo'),
  updated_at = now()
WHERE c.id IS NOT NULL;

UPDATE public.presupuestos p
SET
  estado = app.normalize_presupuestos_estado_206(p.estado::text),
  updated_at = now()
WHERE p.id IS NOT NULL;

UPDATE public.plan_cuentas pc
SET
  tipo = app.normalize_plan_cuentas_tipo_206(COALESCE(pc.tipo, pc.tipo_cuenta)),
  tipo_cuenta = app.normalize_plan_cuentas_tipo_206(COALESCE(pc.tipo_cuenta, pc.tipo)),
  cuenta_id = app.to_uuid_or_null(COALESCE(pc.cuenta_id::text, pc.cuenta_padre_id::text, '')),
  cuenta_padre_id = COALESCE(
    app.to_uuid_or_null(COALESCE(pc.cuenta_padre_id::text, '')),
    app.to_uuid_or_null(COALESCE(pc.cuenta_id::text, ''))
  ),
  estado = app.normalize_activo_inactivo_estado_206(pc.estado::text),
  activo = COALESCE(pc.activo, lower(app.normalize_activo_inactivo_estado_206(pc.estado::text)::text) = 'activo'),
  acepta_movimiento = COALESCE(pc.acepta_movimiento, false),
  updated_at = now()
WHERE pc.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Trigger runtime para normalizar plan_cuentas en escritura.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_plan_cuentas_row_206()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, app, pg_temp
AS $$
BEGIN
  NEW.cuenta_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_id::text, NEW.cuenta_padre_id::text, ''));
  NEW.cuenta_padre_id := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.cuenta_padre_id::text, '')),
    NEW.cuenta_id
  );

  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    'CTA-' || upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))
  );
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), NEW.codigo);

  NEW.tipo := app.normalize_plan_cuentas_tipo_206(COALESCE(NEW.tipo, NEW.tipo_cuenta));
  NEW.tipo_cuenta := NEW.tipo;

  NEW.estado := app.normalize_activo_inactivo_estado_206(NEW.estado::text);
  NEW.activo := COALESCE(NEW.activo, lower(NEW.estado::text) = 'activo');
  NEW.estado := CASE WHEN NEW.activo THEN 'ACTIVO'::citext ELSE 'INACTIVO'::citext END;

  NEW.acepta_movimiento := COALESCE(NEW.acepta_movimiento, false);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_plan_cuentas_estado_row_206 ON public.plan_cuentas;
CREATE TRIGGER trg_normalize_plan_cuentas_estado_row_206
BEFORE INSERT OR UPDATE OF estado, activo, tipo, tipo_cuenta, cuenta_id, cuenta_padre_id, acepta_movimiento, codigo, nombre
ON public.plan_cuentas
FOR EACH ROW
EXECUTE FUNCTION app.normalize_plan_cuentas_row_206();

-- ----------------------------------------------------------------------------
-- Indices runtime para filtros case-insensitive de estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_periodos_contables_tenant_estado_ci_runtime_206
ON public.periodos_contables (tenant_id, estado, anio DESC, mes DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_centros_costo_tenant_estado_ci_runtime_206
ON public.centros_costo (tenant_id, estado, codigo);

CREATE INDEX IF NOT EXISTS idx_presupuestos_tenant_estado_ci_runtime_206
ON public.presupuestos (tenant_id, estado, periodo_contable_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_cuentas_tenant_estado_ci_runtime_206
ON public.plan_cuentas (tenant_id, estado, codigo);

COMMIT;
