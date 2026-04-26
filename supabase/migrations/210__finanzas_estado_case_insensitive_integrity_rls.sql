-- ============================================================================
-- 210__finanzas_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para contrato case-insensitive de estados
-- en CxC/CxP y conciliaciones bancarias.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo de estados para coherencia con dominio.
-- ----------------------------------------------------------------------------
UPDATE public.cuentas_por_cobrar c
SET
  estado = app.normalize_cxc_estado_209(c.estado::text),
  updated_at = now()
WHERE c.id IS NOT NULL;

UPDATE public.cuentas_por_pagar c
SET
  estado = app.normalize_cxp_estado_209(c.estado::text),
  estado_comparacion = app.normalize_cxp_estado_comparacion_209(c.estado_comparacion::text),
  updated_at = now()
WHERE c.id IS NOT NULL;

UPDATE public.conciliaciones_bancarias c
SET
  estado = app.normalize_conciliacion_estado_209(c.estado::text),
  updated_at = now()
WHERE c.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints case-insensitive (se conservan los nombres canonicos).
-- ----------------------------------------------------------------------------
ALTER TABLE public.cuentas_por_cobrar DROP CONSTRAINT IF EXISTS ck_cuentas_por_cobrar_estado_valid;
ALTER TABLE public.cuentas_por_cobrar
  ADD CONSTRAINT ck_cuentas_por_cobrar_estado_valid
  CHECK (lower(estado::text) IN ('pendiente', 'parcial', 'cancelado', 'vencida', 'anulada', 'revertida'));

ALTER TABLE public.cuentas_por_cobrar DROP CONSTRAINT IF EXISTS ck_cuentas_por_cobrar_estado_saldo_consistency;
ALTER TABLE public.cuentas_por_cobrar
  ADD CONSTRAINT ck_cuentas_por_cobrar_estado_saldo_consistency
  CHECK (
    (lower(estado::text) IN ('cancelado', 'anulada', 'revertida') AND monto_pendiente = 0)
    OR (lower(estado::text) IN ('pendiente', 'parcial', 'vencida') AND monto_pendiente > 0)
  );

ALTER TABLE public.cuentas_por_pagar DROP CONSTRAINT IF EXISTS ck_cuentas_por_pagar_estado_valid;
ALTER TABLE public.cuentas_por_pagar
  ADD CONSTRAINT ck_cuentas_por_pagar_estado_valid
  CHECK (lower(estado::text) IN ('pendiente', 'parcial', 'pagada', 'vencida', 'anulada'));

ALTER TABLE public.cuentas_por_pagar DROP CONSTRAINT IF EXISTS ck_cuentas_por_pagar_estado_saldo_consistency;
ALTER TABLE public.cuentas_por_pagar
  ADD CONSTRAINT ck_cuentas_por_pagar_estado_saldo_consistency
  CHECK (
    (lower(estado::text) = 'pagada' AND saldo = 0)
    OR (lower(estado::text) = 'parcial' AND saldo > 0 AND saldo < total)
    OR (lower(estado::text) IN ('pendiente', 'vencida') AND saldo > 0)
    OR (lower(estado::text) = 'anulada')
  );

ALTER TABLE public.cuentas_por_pagar DROP CONSTRAINT IF EXISTS ck_cuentas_por_pagar_estado_comparacion_valid;
ALTER TABLE public.cuentas_por_pagar
  ADD CONSTRAINT ck_cuentas_por_pagar_estado_comparacion_valid
  CHECK (lower(estado_comparacion::text) IN ('pendiente', 'ok', 'desviacion_cantidad', 'desviacion_precio'));

ALTER TABLE public.conciliaciones_bancarias DROP CONSTRAINT IF EXISTS ck_conciliaciones_bancarias_estado_valid;
ALTER TABLE public.conciliaciones_bancarias
  ADD CONSTRAINT ck_conciliaciones_bancarias_estado_valid
  CHECK (lower(estado::text) IN ('abierta', 'en_proceso', 'cerrada'));

ALTER TABLE public.conciliaciones_bancarias DROP CONSTRAINT IF EXISTS ck_conciliaciones_bancarias_cierre_consistency;
ALTER TABLE public.conciliaciones_bancarias
  ADD CONSTRAINT ck_conciliaciones_bancarias_cierre_consistency
  CHECK (
    (lower(estado::text) = 'cerrada' AND cerrado_at IS NOT NULL)
    OR (lower(estado::text) <> 'cerrada' AND cerrado_at IS NULL AND cerrado_by IS NULL)
  );

ALTER TABLE public.cuentas_por_cobrar
  ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.cuentas_por_pagar
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN estado_comparacion SET NOT NULL;
ALTER TABLE public.conciliaciones_bancarias
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.cuentas_por_cobrar VALIDATE CONSTRAINT ck_cuentas_por_cobrar_estado_valid;
ALTER TABLE public.cuentas_por_cobrar VALIDATE CONSTRAINT ck_cuentas_por_cobrar_estado_saldo_consistency;
ALTER TABLE public.cuentas_por_pagar VALIDATE CONSTRAINT ck_cuentas_por_pagar_estado_valid;
ALTER TABLE public.cuentas_por_pagar VALIDATE CONSTRAINT ck_cuentas_por_pagar_estado_saldo_consistency;
ALTER TABLE public.cuentas_por_pagar VALIDATE CONSTRAINT ck_cuentas_por_pagar_estado_comparacion_valid;
ALTER TABLE public.conciliaciones_bancarias VALIDATE CONSTRAINT ck_conciliaciones_bancarias_estado_valid;
ALTER TABLE public.conciliaciones_bancarias VALIDATE CONSTRAINT ck_conciliaciones_bancarias_cierre_consistency;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'cuentas_por_cobrar');
SELECT app.apply_tenant_policy('public', 'cuentas_por_pagar');
SELECT app.apply_tenant_policy('public', 'conciliaciones_bancarias');

COMMIT;
