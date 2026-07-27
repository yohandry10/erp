-- ============================================================================
-- 361__depositos_cts_semestrales.sql
-- La CTS solo se calculaba al cese, dentro de la liquidacion. La norma obliga a
-- depositarla dos veces al año (D.S. 001-97-TR, art. 21): en la primera quincena
-- de mayo por el semestre noviembre-abril, y en la de noviembre por el semestre
-- mayo-octubre.
--
-- La CTS no es un concepto de planilla: no se paga con la remuneracion del mes,
-- se deposita en la cuenta CTS del trabajador y esta inafecta de aportes y del
-- impuesto a la renta. Por eso tiene su propio libro y no una fila de planilla.
--
-- La unicidad por (tenant, empleado, periodo) hace idempotente el calculo:
-- recalcular un semestre actualiza el importe en vez de duplicar el deposito.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.depositos_cts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  empleado_id uuid NOT NULL,
  -- Semestre depositado, en formato AAAA-MM del mes de deposito: '2026-05' o '2026-11'.
  periodo text NOT NULL,
  semestre_inicio date NOT NULL,
  semestre_fin date NOT NULL,
  remuneracion_computable numeric(14,2) NOT NULL DEFAULT 0,
  meses_computables integer NOT NULL DEFAULT 0,
  dias_computables integer NOT NULL DEFAULT 0,
  monto numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'PEN',
  estado text NOT NULL DEFAULT 'CALCULADO',
  fecha_deposito date,
  observaciones text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_depositos_cts_periodo CHECK (periodo ~ '^[0-9]{4}-(05|11)$'),
  CONSTRAINT ck_depositos_cts_estado CHECK (upper(estado) IN ('CALCULADO', 'DEPOSITADO', 'ANULADO')),
  CONSTRAINT ck_depositos_cts_monto CHECK (monto >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_depositos_cts_tenant_empleado_periodo
  ON public.depositos_cts (tenant_id, empleado_id, periodo);

CREATE INDEX IF NOT EXISTS idx_depositos_cts_tenant_periodo
  ON public.depositos_cts (tenant_id, periodo);

ALTER TABLE public.depositos_cts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depositos_cts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.depositos_cts;
CREATE POLICY tenant_isolation ON public.depositos_cts
  FOR ALL
  USING (app.is_superadmin() OR (tenant_id = app.current_tenant_id()))
  WITH CHECK (app.is_superadmin() OR (tenant_id = app.current_tenant_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.depositos_cts TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_set_updated_at_depositos_cts ON public.depositos_cts;
CREATE TRIGGER trg_set_updated_at_depositos_cts
  BEFORE UPDATE ON public.depositos_cts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

COMMENT ON TABLE public.depositos_cts
IS 'Depositos semestrales de CTS (D.S. 001-97-TR art. 21). Uno por empleado y periodo; recalcular actualiza en vez de duplicar.';

COMMIT;
