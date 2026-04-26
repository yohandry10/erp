-- ============================================================================
-- 122__contabilidad_presupuestal_runtime_alignment.sql
-- Alineación runtime para contabilidad presupuestal:
-- periodos_contables, centros_costo, presupuestos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas runtime esperadas por servicios de contabilidad.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.periodos_contables
  ADD COLUMN IF NOT EXISTS anio integer,
  ADD COLUMN IF NOT EXISTS mes integer,
  ADD COLUMN IF NOT EXISTS fecha_cierre date,
  ADD COLUMN IF NOT EXISTS cerrado_por uuid;

ALTER TABLE IF EXISTS public.centros_costo
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.presupuestos
  ADD COLUMN IF NOT EXISTS centro_costo_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_id uuid,
  ADD COLUMN IF NOT EXISTS periodo_contable_id uuid,
  ADD COLUMN IF NOT EXISTS monto_presupuestado numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_ejecutado numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_comprometido numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_disponible numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS porcentaje_ejecutado numeric(7,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE IF EXISTS public.centros_costo
  ALTER COLUMN activo SET DEFAULT true;

ALTER TABLE IF EXISTS public.presupuestos
  ALTER COLUMN monto_presupuestado TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_presupuestado::text),
  ALTER COLUMN monto_ejecutado TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_ejecutado::text),
  ALTER COLUMN monto_comprometido TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_comprometido::text),
  ALTER COLUMN monto_disponible TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_disponible::text),
  ALTER COLUMN porcentaje_ejecutado TYPE numeric(7,2) USING app.to_numeric_or_zero(porcentaje_ejecutado::text),
  ALTER COLUMN monto_presupuestado SET DEFAULT 0,
  ALTER COLUMN monto_ejecutado SET DEFAULT 0,
  ALTER COLUMN monto_comprometido SET DEFAULT 0,
  ALTER COLUMN monto_disponible SET DEFAULT 0,
  ALTER COLUMN porcentaje_ejecutado SET DEFAULT 0;

-- ----------------------------------------------------------------------------
-- Normalización periodos_contables.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_periodos_contables_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.anio := COALESCE(NEW.anio, EXTRACT(YEAR FROM current_date)::integer);
  NEW.mes := COALESCE(NEW.mes, EXTRACT(MONTH FROM current_date)::integer);
  NEW.mes := LEAST(GREATEST(NEW.mes, 1), 12);

  v_estado := upper(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
      'ABIERTO'
    )
  );

  IF v_estado NOT IN ('ABIERTO', 'CERRADO', 'BLOQUEADO') THEN
    v_estado := 'ABIERTO';
  END IF;

  NEW.estado := v_estado;
  NEW.cerrado_por := app.to_uuid_or_null(COALESCE(NEW.cerrado_por::text, ''));

  IF NEW.estado = 'CERRADO' THEN
    NEW.fecha_cierre := COALESCE(NEW.fecha_cierre, current_date);
  ELSE
    NEW.fecha_cierre := NULL;
    NEW.cerrado_por := NULL;
  END IF;

  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('%s-%s', NEW.anio, lpad(NEW.mes::text, 2, '0'))
  );

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'Periodo ' || NEW.codigo
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_periodos_contables_row ON public.periodos_contables;
CREATE TRIGGER trg_normalize_periodos_contables_row
BEFORE INSERT OR UPDATE ON public.periodos_contables
FOR EACH ROW
EXECUTE FUNCTION app.normalize_periodos_contables_row();

-- ----------------------------------------------------------------------------
-- Normalización centros_costo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_centros_costo_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.codigo := NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), '');
  NEW.nombre := NULLIF(btrim(COALESCE(NEW.nombre, '')), '');
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');

  NEW.codigo := COALESCE(
    NEW.codigo,
    'CC-' || upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))
  );

  NEW.nombre := COALESCE(NEW.nombre, NEW.codigo);

  NEW.activo := COALESCE(
    NEW.activo,
    CASE
      WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false
      ELSE true
    END
  );

  NEW.estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_centros_costo_row ON public.centros_costo;
CREATE TRIGGER trg_normalize_centros_costo_row
BEFORE INSERT OR UPDATE ON public.centros_costo
FOR EACH ROW
EXECUTE FUNCTION app.normalize_centros_costo_row();

-- ----------------------------------------------------------------------------
-- Normalización presupuestos + cálculo derivado de ejecución/disponible.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_presupuestos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.centro_costo_id := app.to_uuid_or_null(COALESCE(NEW.centro_costo_id::text, ''));
  NEW.cuenta_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_id::text, ''));
  NEW.periodo_contable_id := app.to_uuid_or_null(COALESCE(NEW.periodo_contable_id::text, ''));
  NEW.created_by := app.to_uuid_or_null(COALESCE(NEW.created_by::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, ''));

  NEW.monto_presupuestado := GREATEST(COALESCE(NEW.monto_presupuestado, 0), 0);
  NEW.monto_ejecutado := GREATEST(COALESCE(NEW.monto_ejecutado, 0), 0);
  NEW.monto_comprometido := GREATEST(COALESCE(NEW.monto_comprometido, 0), 0);

  NEW.monto_disponible := NEW.monto_presupuestado - NEW.monto_ejecutado - NEW.monto_comprometido;
  NEW.porcentaje_ejecutado := CASE
    WHEN NEW.monto_presupuestado > 0
      THEN ROUND(((NEW.monto_ejecutado / NEW.monto_presupuestado) * 100)::numeric, 2)
    ELSE 0
  END;

  NEW.notas := NULLIF(btrim(COALESCE(NEW.notas, '')), '');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado NOT IN ('ACTIVO', 'BLOQUEADO', 'CERRADO') THEN
    NEW.estado := 'ACTIVO';
  END IF;

  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    'PR-' || to_char(now(), 'YYYYMMDDHH24MISSMS')
  );

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'Presupuesto ' || NEW.codigo
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(NEW.updated_by, NEW.created_by);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_presupuestos_row ON public.presupuestos;
CREATE TRIGGER trg_normalize_presupuestos_row
BEFORE INSERT OR UPDATE ON public.presupuestos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_presupuestos_row();

-- ----------------------------------------------------------------------------
-- Backfill defensivo para activar normalización sobre datos existentes.
-- ----------------------------------------------------------------------------
UPDATE public.periodos_contables
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.centros_costo
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.presupuestos
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Índices runtime por patrones de consulta reales.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_periodos_contables_tenant_anio_mes_runtime
ON public.periodos_contables (tenant_id, anio DESC, mes DESC);

CREATE INDEX IF NOT EXISTS idx_periodos_contables_tenant_estado_anio_mes_runtime
ON public.periodos_contables (tenant_id, estado, anio DESC, mes DESC);

CREATE INDEX IF NOT EXISTS idx_centros_costo_tenant_codigo_runtime
ON public.centros_costo (tenant_id, upper(codigo));

CREATE INDEX IF NOT EXISTS idx_centros_costo_tenant_activo_codigo_runtime
ON public.centros_costo (tenant_id, activo, codigo);

CREATE INDEX IF NOT EXISTS idx_presupuestos_tenant_periodo_estado_runtime
ON public.presupuestos (tenant_id, periodo_contable_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_presupuestos_tenant_centro_periodo_runtime
ON public.presupuestos (tenant_id, centro_costo_id, periodo_contable_id);

CREATE INDEX IF NOT EXISTS idx_presupuestos_tenant_cuenta_periodo_runtime
ON public.presupuestos (tenant_id, cuenta_id, periodo_contable_id);

CREATE INDEX IF NOT EXISTS idx_presupuestos_tenant_created_runtime
ON public.presupuestos (tenant_id, created_at DESC);

COMMIT;
