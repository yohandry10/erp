-- ============================================================================
-- 332__accounting_production_compliance_closure.sql
-- Cierre de brechas contables de produccion:
-- - parametros normativos Peru por periodo
-- - ajustes tributarios en CxP
-- - evidencia de bancarizacion en pagos a proveedores
-- - validacion runtime de cumplimiento contable
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Parametros normativos Peru por periodo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.normativa_peru_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  pais_codigo text NOT NULL DEFAULT 'PE',
  uit numeric(14,2) NOT NULL,
  rmv numeric(14,2) NOT NULL,
  asignacion_familiar numeric(14,2) NOT NULL,
  afp_aporte numeric(10,6) NOT NULL DEFAULT 0.100000,
  afp_prima_seguro numeric(10,6) NOT NULL DEFAULT 0.013700,
  afp_comision_flujo_default numeric(10,6) NOT NULL DEFAULT 0.015500,
  onp_aporte numeric(10,6) NOT NULL DEFAULT 0.130000,
  essalud_aporte numeric(10,6) NOT NULL DEFAULT 0.090000,
  quinta_deduccion_uit numeric(10,2) NOT NULL DEFAULT 7.00,
  bancarizacion_pen_min numeric(14,2) NOT NULL DEFAULT 2000.00,
  bancarizacion_usd_min numeric(14,2) NOT NULL DEFAULT 500.00,
  igv_tasa numeric(10,6) NOT NULL DEFAULT 0.180000,
  fuente jsonb NOT NULL DEFAULT '{}'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_normativa_peru_periodos_periodo CHECK (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT ck_normativa_peru_periodos_montos CHECK (
    uit > 0
    AND rmv > 0
    AND asignacion_familiar >= 0
    AND bancarizacion_pen_min > 0
    AND bancarizacion_usd_min > 0
  ),
  CONSTRAINT ck_normativa_peru_periodos_tasas CHECK (
    afp_aporte BETWEEN 0 AND 1
    AND afp_prima_seguro BETWEEN 0 AND 1
    AND afp_comision_flujo_default BETWEEN 0 AND 1
    AND onp_aporte BETWEEN 0 AND 1
    AND essalud_aporte BETWEEN 0 AND 1
    AND igv_tasa BETWEEN 0 AND 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_normativa_peru_periodos_scope_periodo_active
ON public.normativa_peru_periodos (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), periodo)
WHERE activo = true;

INSERT INTO public.normativa_peru_periodos (
  periodo,
  uit,
  rmv,
  asignacion_familiar,
  afp_aporte,
  afp_prima_seguro,
  afp_comision_flujo_default,
  onp_aporte,
  essalud_aporte,
  quinta_deduccion_uit,
  bancarizacion_pen_min,
  bancarizacion_usd_min,
  igv_tasa,
  fuente,
  activo
)
SELECT
  format('2026-%s', lpad(mes::text, 2, '0')),
  5500.00,
  1130.00,
  113.00,
  0.100000,
  0.013700,
  0.015500,
  0.130000,
  0.090000,
  7.00,
  2000.00,
  500.00,
  0.180000,
  jsonb_build_object(
    'uit', 'https://www.sunat.gob.pe/indicestasas/uit.html',
    'igv', 'https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/impuesto-general-las-ventas',
    'bancarizacion', 'https://emprender.sunat.gob.pe/comprobantes-libros/comprobantes-pago/bancarizacion',
    'sbs_afp', 'https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/paginas/comision_prima.aspx',
    'source_migration', '332__accounting_production_compliance_closure'
  ),
  true
FROM generate_series(1, 12) AS mes
ON CONFLICT DO NOTHING;

ALTER TABLE IF EXISTS public.normativa_peru_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.normativa_peru_periodos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS normativa_peru_periodos_tenant_or_global_select ON public.normativa_peru_periodos;
CREATE POLICY normativa_peru_periodos_tenant_or_global_select
ON public.normativa_peru_periodos
FOR SELECT
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
  OR (
    app.current_tenant_id() IS NOT NULL
    AND tenant_id IS NULL
  )
);

DROP POLICY IF EXISTS normativa_peru_periodos_tenant_write ON public.normativa_peru_periodos;
CREATE POLICY normativa_peru_periodos_tenant_write
ON public.normativa_peru_periodos
FOR ALL
USING (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = app.current_tenant_id()
);

-- ----------------------------------------------------------------------------
-- CxP: ajustes tributarios y evidencia de bancarizacion.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS retencion_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percepcion_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detraccion_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anticipo_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bancarizacion_requerida boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bancarizacion_validada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bancarizacion_medio_pago text,
  ADD COLUMN IF NOT EXISTS bancarizacion_referencia text,
  ADD COLUMN IF NOT EXISTS fiscal_metadata jsonb DEFAULT '{}'::jsonb;

UPDATE public.cuentas_por_pagar
SET
  retencion_total = COALESCE(retencion_total, 0),
  percepcion_total = COALESCE(percepcion_total, 0),
  detraccion_total = COALESCE(detraccion_total, 0),
  anticipo_total = COALESCE(anticipo_total, 0),
  bancarizacion_requerida = COALESCE(
    bancarizacion_requerida,
    CASE
      WHEN upper(COALESCE(moneda, 'PEN')) = 'PEN' AND COALESCE(total, 0) >= 2000 THEN true
      WHEN upper(COALESCE(moneda, 'PEN')) = 'USD' AND COALESCE(total, 0) >= 500 THEN true
      ELSE false
    END
  ),
  bancarizacion_validada = COALESCE(bancarizacion_validada, false),
  fiscal_metadata = COALESCE(fiscal_metadata, '{}'::jsonb)
WHERE true;

CREATE OR REPLACE FUNCTION app.normalize_cuentas_por_pagar_fiscal_row_332()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_moneda text;
  v_monto_base numeric;
BEGIN
  v_moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  v_monto_base := GREATEST(COALESCE(NEW.total, 0), COALESCE(NEW.saldo, 0));

  NEW.retencion_total := GREATEST(COALESCE(NEW.retencion_total, 0), 0);
  NEW.percepcion_total := GREATEST(COALESCE(NEW.percepcion_total, 0), 0);
  NEW.detraccion_total := GREATEST(COALESCE(NEW.detraccion_total, 0), 0);
  NEW.anticipo_total := GREATEST(COALESCE(NEW.anticipo_total, 0), 0);
  NEW.fiscal_metadata := COALESCE(NEW.fiscal_metadata, '{}'::jsonb);

  NEW.bancarizacion_requerida := COALESCE(
    NEW.bancarizacion_requerida,
    CASE
      WHEN v_moneda = 'PEN' AND v_monto_base >= 2000 THEN true
      WHEN v_moneda = 'USD' AND v_monto_base >= 500 THEN true
      ELSE false
    END
  );

  IF NEW.bancarizacion_requerida IS DISTINCT FROM true THEN
    IF v_moneda = 'PEN' AND v_monto_base >= 2000 THEN
      NEW.bancarizacion_requerida := true;
    ELSIF v_moneda = 'USD' AND v_monto_base >= 500 THEN
      NEW.bancarizacion_requerida := true;
    END IF;
  END IF;

  NEW.bancarizacion_validada := COALESCE(NEW.bancarizacion_validada, false);
  NEW.bancarizacion_medio_pago := upper(NULLIF(btrim(COALESCE(NEW.bancarizacion_medio_pago, '')), ''));
  NEW.bancarizacion_referencia := NULLIF(btrim(COALESCE(NEW.bancarizacion_referencia, '')), '');

  IF NEW.bancarizacion_validada
     AND (NEW.bancarizacion_medio_pago IS NULL OR NEW.bancarizacion_referencia IS NULL) THEN
    RAISE EXCEPTION 'La bancarizacion validada requiere medio de pago y referencia bancaria';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cuentas_por_pagar_fiscal_row_332 ON public.cuentas_por_pagar;
CREATE TRIGGER trg_normalize_cuentas_por_pagar_fiscal_row_332
BEFORE INSERT OR UPDATE ON public.cuentas_por_pagar
FOR EACH ROW
EXECUTE FUNCTION app.normalize_cuentas_por_pagar_fiscal_row_332();

DO $$
BEGIN
  IF to_regclass('public.cuentas_por_pagar') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_fiscal_nonnegative_332'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_fiscal_nonnegative_332
      CHECK (
        retencion_total >= 0
        AND percepcion_total >= 0
        AND detraccion_total >= 0
        AND anticipo_total >= 0
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_bancarizacion_evidence_332'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_bancarizacion_evidence_332
      CHECK (
        bancarizacion_validada IS DISTINCT FROM true
        OR (
          bancarizacion_medio_pago IS NOT NULL
          AND btrim(bancarizacion_medio_pago) <> ''
          AND bancarizacion_referencia IS NOT NULL
          AND btrim(bancarizacion_referencia) <> ''
        )
      );
    END IF;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_cxp_tenant_fiscal_ajustes_332
ON public.cuentas_por_pagar (tenant_id, created_at DESC)
WHERE retencion_total > 0
   OR percepcion_total > 0
   OR detraccion_total > 0
   OR anticipo_total > 0;

CREATE INDEX IF NOT EXISTS idx_cxp_tenant_bancarizacion_gap_332
ON public.cuentas_por_pagar (tenant_id, estado, created_at DESC)
WHERE bancarizacion_requerida = true
  AND bancarizacion_validada IS DISTINCT FROM true;

-- ----------------------------------------------------------------------------
-- Validacion runtime de cierre contable.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_accounting_production_compliance_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_count bigint;
BEGIN
  RETURN QUERY
  SELECT
    'normativa_peru_2026_seeded'::text,
    (
      SELECT COUNT(*) = 12
      FROM public.normativa_peru_periodos n
      WHERE n.tenant_id IS NULL
        AND n.periodo BETWEEN '2026-01' AND '2026-12'
        AND n.activo = true
        AND n.uit = 5500.00
        AND n.igv_tasa = 0.180000
        AND n.bancarizacion_pen_min = 2000.00
        AND n.bancarizacion_usd_min = 500.00
    ),
    '12 periodos 2026 con UIT, IGV y bancarizacion vigentes';

  RETURN QUERY
  SELECT
    'cxp_fiscal_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cuentas_por_pagar'
        AND c.column_name IN (
          'retencion_total',
          'percepcion_total',
          'detraccion_total',
          'anticipo_total',
          'bancarizacion_requerida',
          'bancarizacion_validada',
          'bancarizacion_medio_pago',
          'bancarizacion_referencia',
          'fiscal_metadata'
        )
    ),
    'CxP tiene columnas fiscales y de bancarizacion';

  RETURN QUERY
  SELECT
    'cxp_fiscal_normalization_trigger_present'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cuentas_por_pagar'
        AND t.tgname = 'trg_normalize_cuentas_por_pagar_fiscal_row_332'
        AND NOT t.tgisinternal
    ),
    'trigger fiscal CxP instalado';

  SELECT COUNT(*)
  INTO v_count
  FROM public.cuentas_por_pagar cxp
  WHERE (p_tenant_id IS NULL OR cxp.tenant_id = p_tenant_id)
    AND (
      COALESCE(cxp.retencion_total, 0) < 0
      OR COALESCE(cxp.percepcion_total, 0) < 0
      OR COALESCE(cxp.detraccion_total, 0) < 0
      OR COALESCE(cxp.anticipo_total, 0) < 0
    );

  RETURN QUERY
  SELECT
    'cxp_fiscal_adjustments_nonnegative'::text,
    v_count = 0,
    format('%s CxP con ajustes fiscales negativos', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.cuentas_por_pagar cxp
  WHERE (p_tenant_id IS NULL OR cxp.tenant_id = p_tenant_id)
    AND cxp.created_at >= timestamptz '2026-05-22 00:00:00-05'
    AND upper(COALESCE(cxp.estado, '')) IN ('PARCIAL', 'PAGADA')
    AND (
      (upper(COALESCE(cxp.moneda, 'PEN')) = 'PEN' AND COALESCE(cxp.total, 0) >= 2000)
      OR (upper(COALESCE(cxp.moneda, 'PEN')) = 'USD' AND COALESCE(cxp.total, 0) >= 500)
    )
    AND (
      cxp.bancarizacion_validada IS DISTINCT FROM true
      OR NULLIF(btrim(COALESCE(cxp.bancarizacion_medio_pago, '')), '') IS NULL
      OR NULLIF(btrim(COALESCE(cxp.bancarizacion_referencia, '')), '') IS NULL
    );

  RETURN QUERY
  SELECT
    'cxp_post_332_bancarizacion_evidence_gap'::text,
    v_count = 0,
    format('%s CxP pagadas/parciales post-332 sin evidencia completa de bancarizacion', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_accounting_production_compliance_status_actual AS
SELECT *
FROM public.validar_accounting_production_compliance_runtime(NULL);

COMMENT ON TABLE public.normativa_peru_periodos IS
  'Parametros normativos Peru por periodo usados por planillas, impuestos y validaciones contables.';
COMMENT ON FUNCTION public.validar_accounting_production_compliance_runtime(uuid) IS
  'Valida cierre de brechas contables productivas: normativa, CxP fiscal y bancarizacion.';

COMMIT;
