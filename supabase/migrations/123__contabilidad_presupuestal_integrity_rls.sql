-- ============================================================================
-- 123__contabilidad_presupuestal_integrity_rls.sql
-- Integridad y hardening RLS para periodos_contables, centros_costo, presupuestos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Integridad referencial.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible(
  'periodos_contables',
  'cerrado_por',
  'usuarios_sistema',
  'id',
  'fk_periodos_contables_cerrado_por'
);

SELECT app.add_fk_if_possible(
  'presupuestos',
  'centro_costo_id',
  'centros_costo',
  'id',
  'fk_presupuestos_centro_costo_id'
);

SELECT app.add_fk_if_possible(
  'presupuestos',
  'cuenta_id',
  'plan_cuentas',
  'id',
  'fk_presupuestos_cuenta_id'
);

SELECT app.add_fk_if_possible(
  'presupuestos',
  'periodo_contable_id',
  'periodos_contables',
  'id',
  'fk_presupuestos_periodo_contable_id'
);

SELECT app.add_fk_if_possible(
  'presupuestos',
  'created_by',
  'usuarios_sistema',
  'id',
  'fk_presupuestos_created_by'
);

SELECT app.add_fk_if_possible(
  'presupuestos',
  'updated_by',
  'usuarios_sistema',
  'id',
  'fk_presupuestos_updated_by'
);

-- ----------------------------------------------------------------------------
-- Trigger de consistencia de tenant en presupuestos.
-- Permite referencias globales (tenant_id NULL) en catálogos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_presupuestos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.centro_costo_id IS NOT NULL THEN
    SELECT c.tenant_id
    INTO v_tenant_id
    FROM public.centros_costo c
    WHERE c.id = NEW.centro_costo_id;

    IF v_tenant_id IS NOT NULL AND v_tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION
        USING MESSAGE = 'centro_costo_id no pertenece al tenant del presupuesto',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cuenta_id IS NOT NULL THEN
    SELECT pc.tenant_id
    INTO v_tenant_id
    FROM public.plan_cuentas pc
    WHERE pc.id = NEW.cuenta_id;

    IF v_tenant_id IS NOT NULL AND v_tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION
        USING MESSAGE = 'cuenta_id no pertenece al tenant del presupuesto',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.periodo_contable_id IS NOT NULL THEN
    SELECT p.tenant_id
    INTO v_tenant_id
    FROM public.periodos_contables p
    WHERE p.id = NEW.periodo_contable_id;

    IF v_tenant_id IS NOT NULL AND v_tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION
        USING MESSAGE = 'periodo_contable_id no pertenece al tenant del presupuesto',
              ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_presupuestos_tenant_consistency ON public.presupuestos;
CREATE TRIGGER trg_enforce_presupuestos_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, centro_costo_id, cuenta_id, periodo_contable_id
ON public.presupuestos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_presupuestos_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de calidad.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.periodos_contables') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_periodos_contables_anio_range'
        AND conrelid = 'public.periodos_contables'::regclass
    ) THEN
      ALTER TABLE public.periodos_contables
      ADD CONSTRAINT ck_periodos_contables_anio_range
      CHECK (anio IS NOT NULL AND anio BETWEEN 2000 AND 2100);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_periodos_contables_mes_range'
        AND conrelid = 'public.periodos_contables'::regclass
    ) THEN
      ALTER TABLE public.periodos_contables
      ADD CONSTRAINT ck_periodos_contables_mes_range
      CHECK (mes IS NOT NULL AND mes BETWEEN 1 AND 12);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_periodos_contables_estado_valid'
        AND conrelid = 'public.periodos_contables'::regclass
    ) THEN
      ALTER TABLE public.periodos_contables
      ADD CONSTRAINT ck_periodos_contables_estado_valid
      CHECK (estado IS NOT NULL AND estado IN ('ABIERTO', 'CERRADO', 'BLOQUEADO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_periodos_contables_cierre_consistency'
        AND conrelid = 'public.periodos_contables'::regclass
    ) THEN
      ALTER TABLE public.periodos_contables
      ADD CONSTRAINT ck_periodos_contables_cierre_consistency
      CHECK (
        (estado = 'CERRADO' AND fecha_cierre IS NOT NULL)
        OR (estado <> 'CERRADO' AND fecha_cierre IS NULL AND cerrado_por IS NULL)
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_periodos_contables_codigo_nonempty'
        AND conrelid = 'public.periodos_contables'::regclass
    ) THEN
      ALTER TABLE public.periodos_contables
      ADD CONSTRAINT ck_periodos_contables_codigo_nonempty
      CHECK (codigo IS NOT NULL AND btrim(codigo) <> '');
    END IF;
  END IF;

  IF to_regclass('public.centros_costo') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_centros_costo_codigo_nonempty'
        AND conrelid = 'public.centros_costo'::regclass
    ) THEN
      ALTER TABLE public.centros_costo
      ADD CONSTRAINT ck_centros_costo_codigo_nonempty
      CHECK (codigo IS NOT NULL AND btrim(codigo) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_centros_costo_nombre_nonempty'
        AND conrelid = 'public.centros_costo'::regclass
    ) THEN
      ALTER TABLE public.centros_costo
      ADD CONSTRAINT ck_centros_costo_nombre_nonempty
      CHECK (nombre IS NOT NULL AND btrim(nombre) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_centros_costo_estado_valid'
        AND conrelid = 'public.centros_costo'::regclass
    ) THEN
      ALTER TABLE public.centros_costo
      ADD CONSTRAINT ck_centros_costo_estado_valid
      CHECK (estado IS NOT NULL AND estado IN ('ACTIVO', 'INACTIVO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_centros_costo_estado_activo_consistency'
        AND conrelid = 'public.centros_costo'::regclass
    ) THEN
      ALTER TABLE public.centros_costo
      ADD CONSTRAINT ck_centros_costo_estado_activo_consistency
      CHECK (COALESCE(activo, false) = (estado = 'ACTIVO'));
    END IF;
  END IF;

  IF to_regclass('public.presupuestos') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_presupuestos_ids_required'
        AND conrelid = 'public.presupuestos'::regclass
    ) THEN
      ALTER TABLE public.presupuestos
      ADD CONSTRAINT ck_presupuestos_ids_required
      CHECK (
        centro_costo_id IS NOT NULL
        AND cuenta_id IS NOT NULL
        AND periodo_contable_id IS NOT NULL
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_presupuestos_estado_valid'
        AND conrelid = 'public.presupuestos'::regclass
    ) THEN
      ALTER TABLE public.presupuestos
      ADD CONSTRAINT ck_presupuestos_estado_valid
      CHECK (estado IS NOT NULL AND estado IN ('ACTIVO', 'BLOQUEADO', 'CERRADO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_presupuestos_monto_presupuestado_nonnegative'
        AND conrelid = 'public.presupuestos'::regclass
    ) THEN
      ALTER TABLE public.presupuestos
      ADD CONSTRAINT ck_presupuestos_monto_presupuestado_nonnegative
      CHECK (monto_presupuestado IS NOT NULL AND monto_presupuestado >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_presupuestos_monto_ejecutado_nonnegative'
        AND conrelid = 'public.presupuestos'::regclass
    ) THEN
      ALTER TABLE public.presupuestos
      ADD CONSTRAINT ck_presupuestos_monto_ejecutado_nonnegative
      CHECK (monto_ejecutado IS NOT NULL AND monto_ejecutado >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_presupuestos_monto_comprometido_nonnegative'
        AND conrelid = 'public.presupuestos'::regclass
    ) THEN
      ALTER TABLE public.presupuestos
      ADD CONSTRAINT ck_presupuestos_monto_comprometido_nonnegative
      CHECK (monto_comprometido IS NOT NULL AND monto_comprometido >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_presupuestos_porcentaje_ejecutado_nonnegative'
        AND conrelid = 'public.presupuestos'::regclass
    ) THEN
      ALTER TABLE public.presupuestos
      ADD CONSTRAINT ck_presupuestos_porcentaje_ejecutado_nonnegative
      CHECK (porcentaje_ejecutado IS NOT NULL AND porcentaje_ejecutado >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_presupuestos_monto_disponible_formula'
        AND conrelid = 'public.presupuestos'::regclass
    ) THEN
      ALTER TABLE public.presupuestos
      ADD CONSTRAINT ck_presupuestos_monto_disponible_formula
      CHECK (
        monto_disponible IS NOT NULL
        AND monto_presupuestado IS NOT NULL
        AND monto_ejecutado IS NOT NULL
        AND monto_comprometido IS NOT NULL
        AND
        monto_disponible = (monto_presupuestado - monto_ejecutado - monto_comprometido)
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_presupuestos_porcentaje_formula'
        AND conrelid = 'public.presupuestos'::regclass
    ) THEN
      ALTER TABLE public.presupuestos
      ADD CONSTRAINT ck_presupuestos_porcentaje_formula
      CHECK (
        porcentaje_ejecutado IS NOT NULL
        AND monto_presupuestado IS NOT NULL
        AND monto_ejecutado IS NOT NULL
        AND
        porcentaje_ejecutado = CASE
          WHEN monto_presupuestado > 0
            THEN ROUND(((monto_ejecutado / monto_presupuestado) * 100)::numeric, 2)
          ELSE 0
        END
      );
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.periodos_contables
  VALIDATE CONSTRAINT ck_periodos_contables_anio_range;
ALTER TABLE IF EXISTS public.periodos_contables
  VALIDATE CONSTRAINT ck_periodos_contables_mes_range;
ALTER TABLE IF EXISTS public.periodos_contables
  VALIDATE CONSTRAINT ck_periodos_contables_estado_valid;
ALTER TABLE IF EXISTS public.periodos_contables
  VALIDATE CONSTRAINT ck_periodos_contables_cierre_consistency;
ALTER TABLE IF EXISTS public.periodos_contables
  VALIDATE CONSTRAINT ck_periodos_contables_codigo_nonempty;

ALTER TABLE IF EXISTS public.centros_costo
  VALIDATE CONSTRAINT ck_centros_costo_codigo_nonempty;
ALTER TABLE IF EXISTS public.centros_costo
  VALIDATE CONSTRAINT ck_centros_costo_nombre_nonempty;
ALTER TABLE IF EXISTS public.centros_costo
  VALIDATE CONSTRAINT ck_centros_costo_estado_valid;
ALTER TABLE IF EXISTS public.centros_costo
  VALIDATE CONSTRAINT ck_centros_costo_estado_activo_consistency;

ALTER TABLE IF EXISTS public.presupuestos
  VALIDATE CONSTRAINT ck_presupuestos_ids_required;
ALTER TABLE IF EXISTS public.presupuestos
  VALIDATE CONSTRAINT ck_presupuestos_estado_valid;
ALTER TABLE IF EXISTS public.presupuestos
  VALIDATE CONSTRAINT ck_presupuestos_monto_presupuestado_nonnegative;
ALTER TABLE IF EXISTS public.presupuestos
  VALIDATE CONSTRAINT ck_presupuestos_monto_ejecutado_nonnegative;
ALTER TABLE IF EXISTS public.presupuestos
  VALIDATE CONSTRAINT ck_presupuestos_monto_comprometido_nonnegative;
ALTER TABLE IF EXISTS public.presupuestos
  VALIDATE CONSTRAINT ck_presupuestos_porcentaje_ejecutado_nonnegative;
ALTER TABLE IF EXISTS public.presupuestos
  VALIDATE CONSTRAINT ck_presupuestos_monto_disponible_formula;
ALTER TABLE IF EXISTS public.presupuestos
  VALIDATE CONSTRAINT ck_presupuestos_porcentaje_formula;

-- ----------------------------------------------------------------------------
-- Unicidades operativas para evitar duplicados en `.single()` y upserts.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_periodos_contables_tenant_anio_mes
ON public.periodos_contables (tenant_id, anio, mes)
WHERE tenant_id IS NOT NULL
  AND anio IS NOT NULL
  AND mes IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_centros_costo_tenant_codigo
ON public.centros_costo (tenant_id, upper(codigo))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_presupuestos_tenant_scope
ON public.presupuestos (tenant_id, centro_costo_id, cuenta_id, periodo_contable_id)
WHERE tenant_id IS NOT NULL
  AND centro_costo_id IS NOT NULL
  AND cuenta_id IS NOT NULL
  AND periodo_contable_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito en tablas presupuestales.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'periodos_contables');
SELECT app.apply_tenant_policy('public', 'centros_costo');
SELECT app.apply_tenant_policy('public', 'presupuestos');

COMMIT;
