-- Perú: conciliación tributaria anual FV 710 e ITAN, con versionado.
-- Corrige además la semántica mensual: una declaración presentada sólo pasa
-- a RECTIFICADA cuando se registra la constancia de la nueva versión.

CREATE TABLE IF NOT EXISTS public.tributos_declaraciones_anuales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ejercicio integer NOT NULL,
  regimen text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  vigente boolean NOT NULL DEFAULT true,
  estado text NOT NULL DEFAULT 'BORRADOR',
  formulario text NOT NULL,
  fuente_corte_at timestamptz NOT NULL DEFAULT now(),
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  uit numeric(18,2) NOT NULL,
  ingresos_netos numeric(18,2) NOT NULL DEFAULT 0,
  resultado_contable numeric(18,2) NOT NULL DEFAULT 0,
  adiciones_tributarias numeric(18,2) NOT NULL DEFAULT 0,
  deducciones_tributarias numeric(18,2) NOT NULL DEFAULT 0,
  perdidas_compensables numeric(18,2) NOT NULL DEFAULT 0,
  renta_neta_imponible numeric(18,2) NOT NULL DEFAULT 0,
  impuesto_renta_calculado numeric(18,2) NOT NULL DEFAULT 0,
  pagos_cuenta_renta numeric(18,2) NOT NULL DEFAULT 0,
  credito_itan_renta numeric(18,2) NOT NULL DEFAULT 0,
  otros_creditos_renta numeric(18,2) NOT NULL DEFAULT 0,
  renta_por_pagar numeric(18,2) NOT NULL DEFAULT 0,
  saldo_favor_renta numeric(18,2) NOT NULL DEFAULT 0,
  activos_netos numeric(18,2) NOT NULL DEFAULT 0,
  deducciones_itan numeric(18,2) NOT NULL DEFAULT 0,
  base_imponible_itan numeric(18,2) NOT NULL DEFAULT 0,
  itan_calculado numeric(18,2) NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  constancia_numero text,
  fecha_presentacion timestamptz,
  presentado_por uuid,
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_tributos_anuales_ejercicio CHECK (ejercicio BETWEEN 2000 AND 2100),
  CONSTRAINT ck_tributos_anuales_regimen CHECK (regimen IN ('MYPE', 'GENERAL')),
  CONSTRAINT ck_tributos_anuales_version CHECK (version > 0),
  CONSTRAINT ck_tributos_anuales_estado CHECK (estado IN ('BORRADOR', 'PRESENTADA', 'RECTIFICADA', 'ANULADA')),
  CONSTRAINT ck_tributos_anuales_formulario CHECK (formulario IN ('FV710_SIMPLIFICADO', 'FV710_COMPLETO')),
  CONSTRAINT ck_tributos_anuales_no_negativos CHECK (
    uit > 0 AND ingresos_netos >= 0 AND adiciones_tributarias >= 0
    AND deducciones_tributarias >= 0 AND perdidas_compensables >= 0
    AND renta_neta_imponible >= 0 AND impuesto_renta_calculado >= 0
    AND pagos_cuenta_renta >= 0 AND credito_itan_renta >= 0
    AND otros_creditos_renta >= 0 AND renta_por_pagar >= 0
    AND saldo_favor_renta >= 0 AND activos_netos >= 0
    AND deducciones_itan >= 0 AND base_imponible_itan >= 0
    AND itan_calculado >= 0
  ),
  UNIQUE (tenant_id, ejercicio, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tributos_anual_vigente
  ON public.tributos_declaraciones_anuales (tenant_id, ejercicio) WHERE vigente;
CREATE INDEX IF NOT EXISTS idx_tributos_anual_historial
  ON public.tributos_declaraciones_anuales (tenant_id, ejercicio DESC, version DESC);

ALTER TABLE public.tributos_declaraciones_anuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tributos_declaraciones_anuales FORCE ROW LEVEL SECURITY;
SELECT app.apply_tenant_policy('public', 'tributos_declaraciones_anuales');
REVOKE ALL ON TABLE public.tributos_declaraciones_anuales FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tributos_declaraciones_anuales TO service_role;

CREATE OR REPLACE FUNCTION app.guardar_tributo_anual_tx(
  p_tenant_id uuid,
  p_user_id uuid,
  p_payload jsonb
) RETURNS public.tributos_declaraciones_anuales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ejercicio integer := (p_payload->>'ejercicio')::integer;
  v_version integer;
  v_row public.tributos_declaraciones_anuales;
BEGIN
  IF p_tenant_id IS NULL OR v_ejercicio NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION USING MESSAGE = 'Tenant o ejercicio inválido', ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':anual:' || v_ejercicio, 0));
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.tributos_declaraciones_anuales
  WHERE tenant_id = p_tenant_id AND ejercicio = v_ejercicio;

  UPDATE public.tributos_declaraciones_anuales
  SET vigente = false, updated_at = now()
  WHERE tenant_id = p_tenant_id AND ejercicio = v_ejercicio AND vigente;

  INSERT INTO public.tributos_declaraciones_anuales (
    tenant_id, ejercicio, regimen, version, formulario, fuente_corte_at,
    source_snapshot, uit, ingresos_netos, resultado_contable,
    adiciones_tributarias, deducciones_tributarias, perdidas_compensables,
    renta_neta_imponible, impuesto_renta_calculado, pagos_cuenta_renta,
    credito_itan_renta, otros_creditos_renta, renta_por_pagar,
    saldo_favor_renta, activos_netos, deducciones_itan,
    base_imponible_itan, itan_calculado, warnings, notas, created_by
  ) VALUES (
    p_tenant_id, v_ejercicio, p_payload->>'regimen', v_version,
    p_payload->>'formulario', COALESCE((p_payload->>'fuente_corte_at')::timestamptz, now()),
    COALESCE(p_payload->'source_snapshot', '{}'::jsonb),
    (p_payload->>'uit')::numeric,
    COALESCE((p_payload->>'ingresos_netos')::numeric, 0),
    COALESCE((p_payload->>'resultado_contable')::numeric, 0),
    COALESCE((p_payload->>'adiciones_tributarias')::numeric, 0),
    COALESCE((p_payload->>'deducciones_tributarias')::numeric, 0),
    COALESCE((p_payload->>'perdidas_compensables')::numeric, 0),
    COALESCE((p_payload->>'renta_neta_imponible')::numeric, 0),
    COALESCE((p_payload->>'impuesto_renta_calculado')::numeric, 0),
    COALESCE((p_payload->>'pagos_cuenta_renta')::numeric, 0),
    COALESCE((p_payload->>'credito_itan_renta')::numeric, 0),
    COALESCE((p_payload->>'otros_creditos_renta')::numeric, 0),
    COALESCE((p_payload->>'renta_por_pagar')::numeric, 0),
    COALESCE((p_payload->>'saldo_favor_renta')::numeric, 0),
    COALESCE((p_payload->>'activos_netos')::numeric, 0),
    COALESCE((p_payload->>'deducciones_itan')::numeric, 0),
    COALESCE((p_payload->>'base_imponible_itan')::numeric, 0),
    COALESCE((p_payload->>'itan_calculado')::numeric, 0),
    COALESCE(p_payload->'warnings', '[]'::jsonb), p_payload->>'notas', p_user_id
  ) RETURNING * INTO v_row;
  RETURN v_row;
END
$$;

CREATE OR REPLACE FUNCTION app.registrar_constancia_tributo_anual_tx(
  p_tenant_id uuid,
  p_user_id uuid,
  p_declaracion_id uuid,
  p_constancia text,
  p_fecha_presentacion timestamptz
) RETURNS public.tributos_declaraciones_anuales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ejercicio integer;
  v_row public.tributos_declaraciones_anuales;
BEGIN
  IF NULLIF(btrim(p_constancia), '') IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'La constancia SUNAT es obligatoria', ERRCODE = '22023';
  END IF;
  SELECT ejercicio INTO v_ejercicio FROM public.tributos_declaraciones_anuales
  WHERE id = p_declaracion_id AND tenant_id = p_tenant_id AND vigente AND estado = 'BORRADOR';
  IF v_ejercicio IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Borrador vigente no encontrado o ya presentado', ERRCODE = 'P0002';
  END IF;

  UPDATE public.tributos_declaraciones_anuales
  SET estado = 'RECTIFICADA', updated_at = now()
  WHERE tenant_id = p_tenant_id AND ejercicio = v_ejercicio
    AND id <> p_declaracion_id AND estado = 'PRESENTADA';

  UPDATE public.tributos_declaraciones_anuales
  SET estado = 'PRESENTADA', constancia_numero = btrim(p_constancia),
      fecha_presentacion = COALESCE(p_fecha_presentacion, now()),
      presentado_por = p_user_id, updated_at = now()
  WHERE id = p_declaracion_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_row;
  RETURN v_row;
END
$$;

-- Sustituye únicamente la transición defectuosa de la 396: guardar una nueva
-- versión ya no declara rectificada una constancia anterior.
CREATE OR REPLACE FUNCTION app.guardar_tributo_mensual_tx(
  p_tenant_id uuid,
  p_user_id uuid,
  p_payload jsonb
) RETURNS public.tributos_declaraciones_mensuales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_periodo text := p_payload->>'periodo';
  v_version integer;
  v_row public.tributos_declaraciones_mensuales;
BEGIN
  IF p_tenant_id IS NULL OR v_periodo IS NULL OR v_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING MESSAGE = 'Tenant o periodo inválido', ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_periodo, 0));
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.tributos_declaraciones_mensuales
  WHERE tenant_id = p_tenant_id AND periodo = v_periodo;
  UPDATE public.tributos_declaraciones_mensuales
  SET vigente = false, updated_at = now()
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_periodo text;
  v_row public.tributos_declaraciones_mensuales;
BEGIN
  IF NULLIF(btrim(p_constancia), '') IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'La constancia SUNAT es obligatoria', ERRCODE = '22023';
  END IF;
  SELECT periodo INTO v_periodo FROM public.tributos_declaraciones_mensuales
  WHERE id = p_declaracion_id AND tenant_id = p_tenant_id AND vigente AND estado = 'BORRADOR';
  IF v_periodo IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Borrador vigente no encontrado o ya presentado', ERRCODE = 'P0002';
  END IF;
  UPDATE public.tributos_declaraciones_mensuales
  SET estado = 'RECTIFICADA', updated_at = now()
  WHERE tenant_id = p_tenant_id AND periodo = v_periodo
    AND id <> p_declaracion_id AND estado = 'PRESENTADA';
  UPDATE public.tributos_declaraciones_mensuales
  SET estado = 'PRESENTADA', constancia_numero = btrim(p_constancia),
      fecha_presentacion = COALESCE(p_fecha_presentacion, now()),
      presentado_por = p_user_id, updated_at = now()
  WHERE id = p_declaracion_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_row;
  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION app.guardar_tributo_anual_tx(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.registrar_constancia_tributo_anual_tx(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guardar_tributo_anual_tx(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION app.registrar_constancia_tributo_anual_tx(uuid, uuid, uuid, text, timestamptz) TO service_role;

COMMENT ON TABLE public.tributos_declaraciones_anuales IS
  'Conciliación tributaria anual peruana versionada; no reemplaza la presentación FV 710 ni ITAN en SUNAT.';
