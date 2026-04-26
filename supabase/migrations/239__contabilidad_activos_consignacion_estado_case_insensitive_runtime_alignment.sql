-- ============================================================================
-- 239__contabilidad_activos_consignacion_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive para estados en contabilidad de
-- activos/consignacion.
-- Tablas foco:
--   public.activos_fijos
--   public.depreciaciones
--   public.registro_consignaciones
--   public.movimientos_consignacion
--   public.inventarios_permanentes
--   public.asignacion_costos
--   public.calendario_empresa
--   public.saldos_iniciales_cuentas
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_activos_fijos_estado_239(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ACTIVO'));
  IF v_estado = 'RETIRADO' THEN v_estado := 'BAJA'; END IF;
  IF v_estado NOT IN ('ACTIVO', 'INACTIVO', 'BAJA', 'VENDIDO', 'DEPRECIADO') THEN
    v_estado := 'ACTIVO';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_depreciaciones_estado_239(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'ACTIVO' THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado = 'INACTIVO' THEN v_estado := 'ANULADA'; END IF;
  IF v_estado NOT IN ('PENDIENTE', 'PROCESADA', 'ANULADA', 'ERROR') THEN
    v_estado := 'PENDIENTE';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_registro_consignaciones_estado_239(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'ACTIVO' THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado IN ('INACTIVO', 'CANCELADA') THEN v_estado := 'ANULADA'; END IF;
  IF v_estado NOT IN ('PENDIENTE', 'VENDIDA', 'DEVUELTA', 'ANULADA', 'CERRADA') THEN
    v_estado := 'PENDIENTE';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_movimientos_consignacion_estado_239(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ACTIVO'));
  IF v_estado = 'INACTIVO' THEN v_estado := 'ANULADO'; END IF;
  IF v_estado NOT IN ('ACTIVO', 'ANULADO') THEN
    v_estado := 'ACTIVO';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_inventarios_permanentes_estado_239(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ABIERTO'));
  IF v_estado = 'ACTIVO' THEN v_estado := 'ABIERTO'; END IF;
  IF v_estado = 'INACTIVO' THEN v_estado := 'ANULADO'; END IF;
  IF v_estado NOT IN ('ABIERTO', 'CERRADO', 'ANULADO') THEN
    v_estado := 'ABIERTO';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_asignacion_costos_estado_239(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ACTIVA'));
  IF v_estado = 'ACTIVO' THEN v_estado := 'ACTIVA'; END IF;
  IF v_estado = 'INACTIVO' THEN v_estado := 'INACTIVA'; END IF;
  IF v_estado NOT IN ('ACTIVA', 'INACTIVA', 'ANULADA') THEN
    v_estado := 'ACTIVA';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_calendario_empresa_estado_239(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ACTIVO'));
  IF v_estado NOT IN ('ACTIVO', 'INACTIVO') THEN
    v_estado := 'ACTIVO';
  END IF;
  RETURN v_estado::citext;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_saldos_iniciales_cuentas_estado_239(p_estado text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), 'ABIERTO'));
  IF v_estado NOT IN ('ABIERTO', 'CERRADO', 'ANULADO') THEN
    v_estado := 'ABIERTO';
  END IF;
  RETURN v_estado::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Migracion de tipos a citext para contrato case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.activos_fijos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_activos_fijos_estado_239(estado::text);

ALTER TABLE public.depreciaciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_depreciaciones_estado_239(estado::text);

ALTER TABLE public.registro_consignaciones
  ALTER COLUMN estado TYPE citext
  USING app.normalize_registro_consignaciones_estado_239(estado::text);

ALTER TABLE public.movimientos_consignacion
  ALTER COLUMN estado TYPE citext
  USING app.normalize_movimientos_consignacion_estado_239(estado::text);

ALTER TABLE public.inventarios_permanentes
  ALTER COLUMN estado TYPE citext
  USING app.normalize_inventarios_permanentes_estado_239(estado::text);

ALTER TABLE public.asignacion_costos
  ALTER COLUMN estado TYPE citext
  USING app.normalize_asignacion_costos_estado_239(estado::text);

ALTER TABLE public.calendario_empresa
  ALTER COLUMN estado TYPE citext
  USING app.normalize_calendario_empresa_estado_239(estado::text);

ALTER TABLE public.saldos_iniciales_cuentas
  ALTER COLUMN estado TYPE citext
  USING app.normalize_saldos_iniciales_cuentas_estado_239(estado::text);

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.activos_fijos a
SET estado = app.normalize_activos_fijos_estado_239(a.estado::text)
WHERE a.id IS NOT NULL;

UPDATE public.depreciaciones d
SET estado = app.normalize_depreciaciones_estado_239(d.estado::text)
WHERE d.id IS NOT NULL;

UPDATE public.registro_consignaciones r
SET estado = app.normalize_registro_consignaciones_estado_239(r.estado::text)
WHERE r.id IS NOT NULL;

UPDATE public.movimientos_consignacion m
SET estado = app.normalize_movimientos_consignacion_estado_239(m.estado::text)
WHERE m.id IS NOT NULL;

UPDATE public.inventarios_permanentes i
SET estado = app.normalize_inventarios_permanentes_estado_239(i.estado::text)
WHERE i.id IS NOT NULL;

UPDATE public.asignacion_costos ac
SET estado = app.normalize_asignacion_costos_estado_239(ac.estado::text)
WHERE ac.id IS NOT NULL;

UPDATE public.calendario_empresa ce
SET estado = app.normalize_calendario_empresa_estado_239(ce.estado::text)
WHERE ce.id IS NOT NULL;

UPDATE public.saldos_iniciales_cuentas s
SET estado = app.normalize_saldos_iniciales_cuentas_estado_239(s.estado::text)
WHERE s.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Indices runtime por estado (CI).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_activos_fijos_tenant_estado_ci_runtime_239
ON public.activos_fijos (tenant_id, estado, fecha_adquisicion DESC);

CREATE INDEX IF NOT EXISTS idx_depreciaciones_tenant_estado_ci_runtime_239
ON public.depreciaciones (tenant_id, estado, periodo, fecha_depreciacion DESC);

CREATE INDEX IF NOT EXISTS idx_registro_consignaciones_tenant_estado_ci_runtime_239
ON public.registro_consignaciones (tenant_id, estado, fecha_registro DESC);

CREATE INDEX IF NOT EXISTS idx_movimientos_consignacion_tenant_estado_ci_runtime_239
ON public.movimientos_consignacion (tenant_id, estado, fecha_movimiento DESC);

CREATE INDEX IF NOT EXISTS idx_inventarios_permanentes_tenant_estado_ci_runtime_239
ON public.inventarios_permanentes (tenant_id, estado, periodo, producto_id, almacen_id);

CREATE INDEX IF NOT EXISTS idx_asignacion_costos_tenant_estado_ci_runtime_239
ON public.asignacion_costos (tenant_id, estado, centro_costo_id, fecha_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_calendario_empresa_tenant_estado_ci_runtime_239
ON public.calendario_empresa (tenant_id, estado, fecha);

CREATE INDEX IF NOT EXISTS idx_saldos_iniciales_cuentas_tenant_estado_ci_runtime_239
ON public.saldos_iniciales_cuentas (tenant_id, estado, periodo, cuenta_id);

COMMIT;
