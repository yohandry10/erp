-- ============================================================================
-- 204__contabilidad_asientos_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para contrato de estado en asientos contables.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill de consistencia estado/montos y tenant en detalle_asientos.
-- ----------------------------------------------------------------------------
UPDATE public.asientos_contables a
SET
  total_debe = GREATEST(COALESCE(a.total_debe, 0), 0),
  total_haber = GREATEST(COALESCE(a.total_haber, 0), 0),
  estado = app.normalize_asientos_contables_estado(a.estado::text)::citext,
  updated_at = now()
WHERE a.id IS NOT NULL;

UPDATE public.detalle_asientos d
SET
  tenant_id = a.tenant_id,
  updated_at = now()
FROM public.asientos_contables a
WHERE d.asiento_id = a.id
  AND (
    d.tenant_id IS NULL
    OR d.tenant_id IS DISTINCT FROM a.tenant_id
  );

UPDATE public.asientos_contables a
SET
  tenant_id = x.tenant_id,
  updated_at = now()
FROM (
  SELECT d.asiento_id, min(d.tenant_id::text)::uuid AS tenant_id
  FROM public.detalle_asientos d
  WHERE d.asiento_id IS NOT NULL
    AND d.tenant_id IS NOT NULL
  GROUP BY d.asiento_id
) x
WHERE a.id = x.asiento_id
  AND a.tenant_id IS NULL;

CREATE OR REPLACE FUNCTION app.enforce_detalle_asientos_tenant_consistency_203()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, app, pg_temp
AS $$
DECLARE
  v_tenant_asiento uuid;
  v_tenant_cuenta uuid;
BEGIN
  NEW.asiento_id := app.to_uuid_or_null(COALESCE(NEW.asiento_id::text, ''));
  NEW.cuenta_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_id::text, ''));

  IF NEW.asiento_id IS NOT NULL THEN
    SELECT a.tenant_id INTO v_tenant_asiento
    FROM public.asientos_contables a
    WHERE a.id = NEW.asiento_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Asiento no existe: %s', NEW.asiento_id), ERRCODE = '23503';
    END IF;
  END IF;

  IF NEW.cuenta_id IS NOT NULL THEN
    SELECT pc.tenant_id INTO v_tenant_cuenta
    FROM public.plan_cuentas pc
    WHERE pc.id = NEW.cuenta_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cuenta contable no existe: %s', NEW.cuenta_id), ERRCODE = '23503';
    END IF;
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_asiento, v_tenant_cuenta);

  IF v_tenant_asiento IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_asiento THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con asiento en detalle_asientos', ERRCODE = '23514';
  END IF;

  IF v_tenant_cuenta IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant_cuenta THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cuenta en detalle_asientos', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_detalle_asientos_tenant_consistency_203 ON public.detalle_asientos;
CREATE TRIGGER trg_enforce_detalle_asientos_tenant_consistency_203
BEFORE INSERT OR UPDATE OF tenant_id, asiento_id, cuenta_id
ON public.detalle_asientos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_detalle_asientos_tenant_consistency_203();

-- ----------------------------------------------------------------------------
-- Constraints de negocio para asientos contables.
-- ----------------------------------------------------------------------------
ALTER TABLE public.asientos_contables DROP CONSTRAINT IF EXISTS ck_asientos_contables_estado_runtime_203;
ALTER TABLE public.asientos_contables
  ADD CONSTRAINT ck_asientos_contables_estado_runtime_203
  CHECK (lower(estado::text) IN ('borrador', 'confirmado', 'anulado'));

ALTER TABLE public.asientos_contables DROP CONSTRAINT IF EXISTS ck_asientos_contables_montos_runtime_203;
ALTER TABLE public.asientos_contables
  ADD CONSTRAINT ck_asientos_contables_montos_runtime_203
  CHECK (
    COALESCE(total_debe, 0) >= 0
    AND COALESCE(total_haber, 0) >= 0
  );

ALTER TABLE public.asientos_contables DROP CONSTRAINT IF EXISTS ck_asientos_contables_cuadre_confirmado_runtime_203;
ALTER TABLE public.asientos_contables
  ADD CONSTRAINT ck_asientos_contables_cuadre_confirmado_runtime_203
  CHECK (
    lower(estado::text) <> 'confirmado'
    OR abs(COALESCE(total_debe, 0) - COALESCE(total_haber, 0)) <= 0.01
  );

ALTER TABLE public.asientos_contables
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.asientos_contables VALIDATE CONSTRAINT ck_asientos_contables_estado_runtime_203;
ALTER TABLE public.asientos_contables VALIDATE CONSTRAINT ck_asientos_contables_montos_runtime_203;
ALTER TABLE public.asientos_contables VALIDATE CONSTRAINT ck_asientos_contables_cuadre_confirmado_runtime_203;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'asientos_contables');
SELECT app.apply_tenant_policy('public', 'detalle_asientos');
SELECT app.apply_tenant_policy('public', 'asientos_contables_rrhh');

COMMIT;
