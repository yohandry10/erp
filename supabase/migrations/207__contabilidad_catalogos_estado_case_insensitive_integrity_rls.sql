-- ============================================================================
-- 207__contabilidad_catalogos_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para catalogos contables case-insensitive.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill de aliases/tenant en plan_cuentas.
-- ----------------------------------------------------------------------------
UPDATE public.plan_cuentas pc
SET
  cuenta_id = app.to_uuid_or_null(COALESCE(pc.cuenta_id::text, pc.cuenta_padre_id::text, '')),
  cuenta_padre_id = COALESCE(
    app.to_uuid_or_null(COALESCE(pc.cuenta_padre_id::text, '')),
    app.to_uuid_or_null(COALESCE(pc.cuenta_id::text, ''))
  ),
  tipo = app.normalize_plan_cuentas_tipo_206(COALESCE(pc.tipo, pc.tipo_cuenta)),
  tipo_cuenta = app.normalize_plan_cuentas_tipo_206(COALESCE(pc.tipo_cuenta, pc.tipo)),
  estado = app.normalize_activo_inactivo_estado_206(pc.estado::text),
  activo = COALESCE(pc.activo, lower(app.normalize_activo_inactivo_estado_206(pc.estado::text)::text) = 'activo'),
  acepta_movimiento = COALESCE(pc.acepta_movimiento, false),
  updated_at = now()
WHERE pc.id IS NOT NULL;

UPDATE public.plan_cuentas child
SET
  tenant_id = parent.tenant_id,
  updated_at = now()
FROM public.plan_cuentas parent
WHERE child.cuenta_id = parent.id
  AND child.tenant_id IS NULL
  AND parent.tenant_id IS NOT NULL;

SELECT app.add_fk_if_possible(
  'plan_cuentas',
  'cuenta_id',
  'plan_cuentas',
  'id',
  'fk_plan_cuentas_cuenta_id_runtime_206'
);

SELECT app.add_fk_if_possible(
  'plan_cuentas',
  'cuenta_padre_id',
  'plan_cuentas',
  'id',
  'fk_plan_cuentas_cuenta_padre_id_runtime_206'
);

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant en jerarquia plan_cuentas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_plan_cuentas_tenant_consistency_206()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, app, pg_temp
AS $$
DECLARE
  v_parent_id uuid;
  v_parent_tenant uuid;
BEGIN
  v_parent_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_id::text, NEW.cuenta_padre_id::text, ''));
  NEW.cuenta_id := v_parent_id;
  NEW.cuenta_padre_id := COALESCE(app.to_uuid_or_null(COALESCE(NEW.cuenta_padre_id::text, '')), v_parent_id);

  IF v_parent_id IS NOT NULL THEN
    SELECT p.tenant_id
    INTO v_parent_tenant
    FROM public.plan_cuentas p
    WHERE p.id = v_parent_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Cuenta padre no existe: %s', v_parent_id),
        ERRCODE = '23503';
    END IF;

    NEW.tenant_id := COALESCE(NEW.tenant_id, v_parent_tenant);

    IF NEW.tenant_id IS NOT NULL
       AND v_parent_tenant IS NOT NULL
       AND NEW.tenant_id IS DISTINCT FROM v_parent_tenant THEN
      RAISE EXCEPTION USING
        MESSAGE = 'tenant_id no coincide con cuenta padre en plan_cuentas',
        ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_cuentas_tenant_consistency_206 ON public.plan_cuentas;
CREATE TRIGGER trg_enforce_plan_cuentas_tenant_consistency_206
BEFORE INSERT OR UPDATE OF tenant_id, cuenta_id, cuenta_padre_id
ON public.plan_cuentas
FOR EACH ROW
EXECUTE FUNCTION app.enforce_plan_cuentas_tenant_consistency_206();

-- ----------------------------------------------------------------------------
-- Constraints de dominio case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.periodos_contables
  DROP CONSTRAINT IF EXISTS ck_periodos_contables_estado_ci_runtime_206;
ALTER TABLE public.periodos_contables
  ADD CONSTRAINT ck_periodos_contables_estado_ci_runtime_206
  CHECK (lower(estado::text) IN ('abierto', 'cerrado', 'bloqueado'));

ALTER TABLE public.periodos_contables
  DROP CONSTRAINT IF EXISTS ck_periodos_contables_cierre_ci_runtime_206;
ALTER TABLE public.periodos_contables
  ADD CONSTRAINT ck_periodos_contables_cierre_ci_runtime_206
  CHECK (
    (lower(estado::text) = 'cerrado' AND fecha_cierre IS NOT NULL)
    OR (lower(estado::text) <> 'cerrado' AND fecha_cierre IS NULL AND cerrado_por IS NULL)
  );

ALTER TABLE public.centros_costo
  DROP CONSTRAINT IF EXISTS ck_centros_costo_estado_ci_runtime_206;
ALTER TABLE public.centros_costo
  ADD CONSTRAINT ck_centros_costo_estado_ci_runtime_206
  CHECK (lower(estado::text) IN ('activo', 'inactivo'));

ALTER TABLE public.centros_costo
  DROP CONSTRAINT IF EXISTS ck_centros_costo_estado_activo_ci_runtime_206;
ALTER TABLE public.centros_costo
  ADD CONSTRAINT ck_centros_costo_estado_activo_ci_runtime_206
  CHECK (COALESCE(activo, false) = (lower(estado::text) = 'activo'));

ALTER TABLE public.presupuestos
  DROP CONSTRAINT IF EXISTS ck_presupuestos_estado_ci_runtime_206;
ALTER TABLE public.presupuestos
  ADD CONSTRAINT ck_presupuestos_estado_ci_runtime_206
  CHECK (lower(estado::text) IN ('activo', 'bloqueado', 'cerrado'));

ALTER TABLE public.plan_cuentas
  DROP CONSTRAINT IF EXISTS ck_plan_cuentas_estado_ci_runtime_206;
ALTER TABLE public.plan_cuentas
  ADD CONSTRAINT ck_plan_cuentas_estado_ci_runtime_206
  CHECK (lower(estado::text) IN ('activo', 'inactivo'));

ALTER TABLE public.plan_cuentas
  DROP CONSTRAINT IF EXISTS ck_plan_cuentas_estado_activo_ci_runtime_206;
ALTER TABLE public.plan_cuentas
  ADD CONSTRAINT ck_plan_cuentas_estado_activo_ci_runtime_206
  CHECK (COALESCE(activo, false) = (lower(estado::text) = 'activo'));

ALTER TABLE public.plan_cuentas
  DROP CONSTRAINT IF EXISTS ck_plan_cuentas_tipo_sync_runtime_206;
ALTER TABLE public.plan_cuentas
  ADD CONSTRAINT ck_plan_cuentas_tipo_sync_runtime_206
  CHECK (
    (
      tipo IS NULL
      AND tipo_cuenta IS NULL
    )
    OR (
      tipo IS NOT NULL
      AND tipo_cuenta IS NOT NULL
      AND upper(tipo) IN ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO', 'ORDEN')
      AND upper(tipo_cuenta) IN ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO', 'ORDEN')
      AND upper(tipo) = upper(tipo_cuenta)
    )
  );

ALTER TABLE public.plan_cuentas
  DROP CONSTRAINT IF EXISTS ck_plan_cuentas_acepta_movimiento_not_null_runtime_206;
ALTER TABLE public.plan_cuentas
  ADD CONSTRAINT ck_plan_cuentas_acepta_movimiento_not_null_runtime_206
  CHECK (acepta_movimiento IS NOT NULL);

ALTER TABLE public.periodos_contables
  ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.centros_costo
  ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.presupuestos
  ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.plan_cuentas
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN acepta_movimiento SET NOT NULL;

ALTER TABLE public.periodos_contables
  VALIDATE CONSTRAINT ck_periodos_contables_estado_ci_runtime_206;
ALTER TABLE public.periodos_contables
  VALIDATE CONSTRAINT ck_periodos_contables_cierre_ci_runtime_206;
ALTER TABLE public.centros_costo
  VALIDATE CONSTRAINT ck_centros_costo_estado_ci_runtime_206;
ALTER TABLE public.centros_costo
  VALIDATE CONSTRAINT ck_centros_costo_estado_activo_ci_runtime_206;
ALTER TABLE public.presupuestos
  VALIDATE CONSTRAINT ck_presupuestos_estado_ci_runtime_206;
ALTER TABLE public.plan_cuentas
  VALIDATE CONSTRAINT ck_plan_cuentas_estado_ci_runtime_206;
ALTER TABLE public.plan_cuentas
  VALIDATE CONSTRAINT ck_plan_cuentas_estado_activo_ci_runtime_206;
ALTER TABLE public.plan_cuentas
  VALIDATE CONSTRAINT ck_plan_cuentas_tipo_sync_runtime_206;
ALTER TABLE public.plan_cuentas
  VALIDATE CONSTRAINT ck_plan_cuentas_acepta_movimiento_not_null_runtime_206;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'periodos_contables');
SELECT app.apply_tenant_policy('public', 'centros_costo');
SELECT app.apply_tenant_policy('public', 'presupuestos');
SELECT app.apply_tenant_policy('public', 'plan_cuentas');

COMMIT;
