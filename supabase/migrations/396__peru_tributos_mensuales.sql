-- Perú: borrador mensual de IGV/Renta con fuentes congeladas y constancia externa.
-- El ERP NO presenta FV 621/1611 ante SUNAT. Sólo calcula, versiona y registra
-- la constancia que el contador obtuvo fuera del sistema.

CREATE TABLE IF NOT EXISTS public.tributos_declaraciones_mensuales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  regimen text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  vigente boolean NOT NULL DEFAULT true,
  estado text NOT NULL DEFAULT 'BORRADOR',
  fuente_corte_at timestamptz NOT NULL DEFAULT now(),
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ventas_gravadas numeric(18,2) NOT NULL DEFAULT 0,
  ventas_exoneradas numeric(18,2) NOT NULL DEFAULT 0,
  ventas_inafectas numeric(18,2) NOT NULL DEFAULT 0,
  exportaciones numeric(18,2) NOT NULL DEFAULT 0,
  igv_ventas numeric(18,2) NOT NULL DEFAULT 0,
  compras_gravadas numeric(18,2) NOT NULL DEFAULT 0,
  igv_compras numeric(18,2) NOT NULL DEFAULT 0,
  saldo_favor_anterior numeric(18,2) NOT NULL DEFAULT 0,
  retenciones_igv numeric(18,2) NOT NULL DEFAULT 0,
  percepciones_igv numeric(18,2) NOT NULL DEFAULT 0,
  otros_creditos_igv numeric(18,2) NOT NULL DEFAULT 0,
  igv_resultante numeric(18,2) NOT NULL DEFAULT 0,
  saldo_favor_siguiente numeric(18,2) NOT NULL DEFAULT 0,
  ingresos_netos_mes numeric(18,2) NOT NULL DEFAULT 0,
  ingresos_netos_acumulados numeric(18,2) NOT NULL DEFAULT 0,
  coeficiente_renta numeric(12,8),
  pago_cuenta_renta numeric(18,2) NOT NULL DEFAULT 0,
  nrus_categoria integer,
  nrus_cuota numeric(18,2),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  constancia_numero text,
  fecha_presentacion timestamptz,
  presentado_por uuid,
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_tributos_periodo CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT ck_tributos_regimen CHECK (regimen IN ('NRUS', 'RER', 'MYPE', 'GENERAL')),
  CONSTRAINT ck_tributos_version CHECK (version > 0),
  CONSTRAINT ck_tributos_estado CHECK (estado IN ('BORRADOR', 'PRESENTADA', 'RECTIFICADA', 'ANULADA')),
  CONSTRAINT ck_tributos_coeficiente CHECK (coeficiente_renta IS NULL OR coeficiente_renta BETWEEN 0 AND 1),
  CONSTRAINT ck_tributos_nrus_categoria CHECK (nrus_categoria IS NULL OR nrus_categoria IN (1, 2)),
  CONSTRAINT ck_tributos_importes_no_negativos CHECK (
    ventas_gravadas >= 0 AND ventas_exoneradas >= 0 AND ventas_inafectas >= 0
    AND exportaciones >= 0 AND igv_ventas >= 0 AND compras_gravadas >= 0
    AND igv_compras >= 0 AND saldo_favor_anterior >= 0 AND retenciones_igv >= 0
    AND percepciones_igv >= 0 AND otros_creditos_igv >= 0 AND igv_resultante >= 0
    AND saldo_favor_siguiente >= 0 AND ingresos_netos_mes >= 0
    AND ingresos_netos_acumulados >= 0 AND pago_cuenta_renta >= 0
    AND COALESCE(nrus_cuota, 0) >= 0
  ),
  UNIQUE (tenant_id, periodo, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tributos_declaracion_vigente
  ON public.tributos_declaraciones_mensuales (tenant_id, periodo)
  WHERE vigente;

CREATE INDEX IF NOT EXISTS idx_tributos_declaraciones_periodo
  ON public.tributos_declaraciones_mensuales (tenant_id, periodo DESC, version DESC);

ALTER TABLE public.tributos_declaraciones_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tributos_declaraciones_mensuales FORCE ROW LEVEL SECURITY;
SELECT app.apply_tenant_policy('public', 'tributos_declaraciones_mensuales');

REVOKE ALL ON TABLE public.tributos_declaraciones_mensuales FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tributos_declaraciones_mensuales TO service_role;

CREATE OR REPLACE FUNCTION app.guardar_tributo_mensual_tx(
  p_tenant_id uuid,
  p_user_id uuid,
  p_payload jsonb
) RETURNS public.tributos_declaraciones_mensuales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_periodo text := p_payload->>'periodo';
  v_version integer;
  v_row public.tributos_declaraciones_mensuales;
BEGIN
  IF p_tenant_id IS NULL OR v_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING MESSAGE = 'Tenant o periodo inválido', ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_periodo, 0));

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.tributos_declaraciones_mensuales
  WHERE tenant_id = p_tenant_id AND periodo = v_periodo;

  UPDATE public.tributos_declaraciones_mensuales
  SET vigente = false,
      estado = CASE WHEN estado = 'PRESENTADA' THEN 'RECTIFICADA' ELSE estado END,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND periodo = v_periodo AND vigente;

  INSERT INTO public.tributos_declaraciones_mensuales (
    tenant_id, periodo, regimen, version, fuente_corte_at, source_snapshot,
    ventas_gravadas, ventas_exoneradas, ventas_inafectas, exportaciones, igv_ventas,
    compras_gravadas, igv_compras, saldo_favor_anterior, retenciones_igv,
    percepciones_igv, otros_creditos_igv, igv_resultante, saldo_favor_siguiente,
    ingresos_netos_mes, ingresos_netos_acumulados, coeficiente_renta,
    pago_cuenta_renta, nrus_categoria, nrus_cuota, warnings, notas, created_by
  ) VALUES (
    p_tenant_id, v_periodo, p_payload->>'regimen', v_version,
    COALESCE((p_payload->>'fuente_corte_at')::timestamptz, now()),
    COALESCE(p_payload->'source_snapshot', '{}'::jsonb),
    COALESCE((p_payload->>'ventas_gravadas')::numeric, 0),
    COALESCE((p_payload->>'ventas_exoneradas')::numeric, 0),
    COALESCE((p_payload->>'ventas_inafectas')::numeric, 0),
    COALESCE((p_payload->>'exportaciones')::numeric, 0),
    COALESCE((p_payload->>'igv_ventas')::numeric, 0),
    COALESCE((p_payload->>'compras_gravadas')::numeric, 0),
    COALESCE((p_payload->>'igv_compras')::numeric, 0),
    COALESCE((p_payload->>'saldo_favor_anterior')::numeric, 0),
    COALESCE((p_payload->>'retenciones_igv')::numeric, 0),
    COALESCE((p_payload->>'percepciones_igv')::numeric, 0),
    COALESCE((p_payload->>'otros_creditos_igv')::numeric, 0),
    COALESCE((p_payload->>'igv_resultante')::numeric, 0),
    COALESCE((p_payload->>'saldo_favor_siguiente')::numeric, 0),
    COALESCE((p_payload->>'ingresos_netos_mes')::numeric, 0),
    COALESCE((p_payload->>'ingresos_netos_acumulados')::numeric, 0),
    NULLIF(p_payload->>'coeficiente_renta', '')::numeric,
    COALESCE((p_payload->>'pago_cuenta_renta')::numeric, 0),
    NULLIF(p_payload->>'nrus_categoria', '')::integer,
    NULLIF(p_payload->>'nrus_cuota', '')::numeric,
    COALESCE(p_payload->'warnings', '[]'::jsonb), p_payload->>'notas', p_user_id
  ) RETURNING * INTO v_row;

  RETURN v_row;
END
$$;

CREATE OR REPLACE FUNCTION app.registrar_constancia_tributo_mensual_tx(
  p_tenant_id uuid,
  p_user_id uuid,
  p_declaracion_id uuid,
  p_constancia text,
  p_fecha_presentacion timestamptz
) RETURNS public.tributos_declaraciones_mensuales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.tributos_declaraciones_mensuales;
BEGIN
  IF NULLIF(btrim(p_constancia), '') IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'La constancia SUNAT es obligatoria', ERRCODE = '22023';
  END IF;

  UPDATE public.tributos_declaraciones_mensuales
  SET estado = 'PRESENTADA', constancia_numero = btrim(p_constancia),
      fecha_presentacion = COALESCE(p_fecha_presentacion, now()),
      presentado_por = p_user_id, updated_at = now()
  WHERE id = p_declaracion_id AND tenant_id = p_tenant_id
    AND vigente AND estado = 'BORRADOR'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Borrador vigente no encontrado o ya presentado', ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION app.guardar_tributo_mensual_tx(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.registrar_constancia_tributo_mensual_tx(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guardar_tributo_mensual_tx(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION app.registrar_constancia_tributo_mensual_tx(uuid, uuid, uuid, text, timestamptz) TO service_role;

COMMENT ON TABLE public.tributos_declaraciones_mensuales IS
  'Versiones tenant-scoped del borrador mensual peruano. No acredita presentación ante SUNAT sin constancia externa.';
COMMENT ON COLUMN public.tributos_declaraciones_mensuales.source_snapshot IS
  'Conteos, corte y origen de datos usados para que el cálculo pueda auditarse después.';
