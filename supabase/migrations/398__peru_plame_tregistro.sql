-- Perú: ficha laboral SUNAT, paquete PLAME/T-Registro versionado y evidencia externa.
-- El ERP genera fuentes para PVS y papeles de trabajo PLAME; no suplanta PVS/SOL.

CREATE TABLE IF NOT EXISTS public.rrhh_peru_fichas_laborales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  empleado_id uuid NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  apellido_paterno text,
  apellido_materno text,
  pais_emisor_documento text NOT NULL DEFAULT '604',
  nacionalidad_codigo text,
  regimen_laboral_codigo text NOT NULL DEFAULT '01',
  situacion_educativa_codigo text,
  ocupacion_codigo text,
  discapacidad boolean NOT NULL DEFAULT false,
  cuspp text,
  sctr_pension_codigo text,
  tipo_contrato_codigo text,
  jornada_atipica boolean NOT NULL DEFAULT false,
  jornada_maxima boolean NOT NULL DEFAULT true,
  horario_nocturno boolean NOT NULL DEFAULT false,
  sindicalizado boolean NOT NULL DEFAULT false,
  periodicidad_remuneracion_codigo text NOT NULL DEFAULT '1',
  situacion_codigo text NOT NULL DEFAULT '1',
  quinta_exonerada boolean NOT NULL DEFAULT false,
  situacion_especial_codigo text,
  tipo_pago_codigo text NOT NULL DEFAULT '1',
  categoria_ocupacional_codigo text,
  convenio_doble_tributacion_codigo text,
  tipo_trabajador_codigo text,
  regimen_salud_codigo text,
  regimen_pensionario_codigo text,
  sctr_salud_codigo text,
  eps_servicios_propios_codigo text,
  establecimiento_codigo text NOT NULL DEFAULT '0000',
  direccion_tipo_via_codigo text,
  direccion_nombre_via text,
  direccion_numero_via text,
  direccion_tipo_zona_codigo text,
  direccion_nombre_zona text,
  direccion_referencia text,
  telefono_cldn text,
  activo boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, empleado_id),
  CONSTRAINT ck_rrhh_peru_pais_emisor CHECK (pais_emisor_documento ~ '^[0-9]{3}$'),
  CONSTRAINT ck_rrhh_peru_establecimiento CHECK (establecimiento_codigo ~ '^[0-9]{4}$'),
  CONSTRAINT ck_rrhh_peru_codigos_booleanos CHECK (
    periodicidad_remuneracion_codigo ~ '^[0-9]$'
    AND situacion_codigo IN ('0', '1')
    AND tipo_pago_codigo ~ '^[0-9]$'
  )
);

CREATE INDEX IF NOT EXISTS idx_rrhh_peru_fichas_tenant_activo
  ON public.rrhh_peru_fichas_laborales (tenant_id, activo, empleado_id);

CREATE TABLE IF NOT EXISTS public.rrhh_peru_presentaciones_planilla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  planilla_id uuid NOT NULL REFERENCES public.planillas(id) ON DELETE RESTRICT,
  periodo text NOT NULL,
  version integer NOT NULL,
  vigente boolean NOT NULL DEFAULT true,
  estado text NOT NULL DEFAULT 'BORRADOR',
  fuente_corte_at timestamptz NOT NULL DEFAULT now(),
  resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  bloqueos jsonb NOT NULL DEFAULT '[]'::jsonb,
  advertencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  archivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ticket_sunat text,
  constancia_numero text,
  fecha_presentacion timestamptz,
  presentado_por uuid,
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, planilla_id, version),
  CONSTRAINT ck_rrhh_peru_presentacion_periodo CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT ck_rrhh_peru_presentacion_version CHECK (version > 0),
  CONSTRAINT ck_rrhh_peru_presentacion_estado CHECK (
    estado IN ('BORRADOR', 'FUENTE_PVS', 'VALIDADA_PVS', 'PRESENTADA', 'RECTIFICADA', 'ANULADA')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rrhh_peru_presentacion_vigente
  ON public.rrhh_peru_presentaciones_planilla (tenant_id, planilla_id) WHERE vigente;
CREATE INDEX IF NOT EXISTS idx_rrhh_peru_presentacion_historial
  ON public.rrhh_peru_presentaciones_planilla (tenant_id, periodo DESC, version DESC);

ALTER TABLE public.rrhh_peru_fichas_laborales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrhh_peru_fichas_laborales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rrhh_peru_presentaciones_planilla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrhh_peru_presentaciones_planilla FORCE ROW LEVEL SECURITY;
SELECT app.apply_tenant_policy('public', 'rrhh_peru_fichas_laborales');
SELECT app.apply_tenant_policy('public', 'rrhh_peru_presentaciones_planilla');

REVOKE ALL ON TABLE public.rrhh_peru_fichas_laborales FROM anon, authenticated;
REVOKE ALL ON TABLE public.rrhh_peru_presentaciones_planilla FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.rrhh_peru_fichas_laborales TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.rrhh_peru_presentaciones_planilla TO service_role;

CREATE OR REPLACE FUNCTION app.guardar_rrhh_peru_presentacion_tx(
  p_tenant_id uuid,
  p_user_id uuid,
  p_payload jsonb
) RETURNS public.rrhh_peru_presentaciones_planilla
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_planilla_id uuid := (p_payload->>'planilla_id')::uuid;
  v_periodo text := p_payload->>'periodo';
  v_version integer;
  v_row public.rrhh_peru_presentaciones_planilla;
BEGIN
  IF p_tenant_id IS NULL OR v_planilla_id IS NULL
     OR v_periodo IS NULL OR v_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING MESSAGE = 'Tenant, planilla o periodo inválido', ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.planillas
    WHERE id = v_planilla_id AND tenant_id = p_tenant_id AND periodo = v_periodo
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'La planilla no pertenece al tenant o no coincide con el periodo', ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':plame:' || v_planilla_id::text, 0));
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.rrhh_peru_presentaciones_planilla
  WHERE tenant_id = p_tenant_id AND planilla_id = v_planilla_id;
  UPDATE public.rrhh_peru_presentaciones_planilla
  SET vigente = false, updated_at = now()
  WHERE tenant_id = p_tenant_id AND planilla_id = v_planilla_id AND vigente;
  INSERT INTO public.rrhh_peru_presentaciones_planilla (
    tenant_id, planilla_id, periodo, version, estado, fuente_corte_at,
    resumen, bloqueos, advertencias, archivos, notas, created_by
  ) VALUES (
    p_tenant_id, v_planilla_id, v_periodo, v_version,
    CASE WHEN jsonb_array_length(COALESCE(p_payload->'bloqueos', '[]'::jsonb)) = 0
      THEN 'FUENTE_PVS' ELSE 'BORRADOR' END,
    COALESCE((p_payload->>'fuente_corte_at')::timestamptz, now()),
    COALESCE(p_payload->'resumen', '{}'::jsonb),
    COALESCE(p_payload->'bloqueos', '[]'::jsonb),
    COALESCE(p_payload->'advertencias', '[]'::jsonb),
    COALESCE(p_payload->'archivos', '[]'::jsonb),
    p_payload->>'notas', p_user_id
  ) RETURNING * INTO v_row;
  RETURN v_row;
END
$$;

CREATE OR REPLACE FUNCTION app.registrar_rrhh_peru_evidencia_tx(
  p_tenant_id uuid,
  p_user_id uuid,
  p_presentacion_id uuid,
  p_ticket text,
  p_constancia text,
  p_fecha_presentacion timestamptz
) RETURNS public.rrhh_peru_presentaciones_planilla
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_planilla_id uuid;
  v_row public.rrhh_peru_presentaciones_planilla;
BEGIN
  IF NULLIF(btrim(p_ticket), '') IS NULL OR NULLIF(btrim(p_constancia), '') IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Ticket y CIR/constancia SUNAT son obligatorios', ERRCODE = '22023';
  END IF;
  SELECT planilla_id INTO v_planilla_id
  FROM public.rrhh_peru_presentaciones_planilla
  WHERE id = p_presentacion_id AND tenant_id = p_tenant_id AND vigente
    AND estado IN ('FUENTE_PVS', 'VALIDADA_PVS')
    AND jsonb_array_length(bloqueos) = 0;
  IF v_planilla_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Fuente vigente no encontrada, bloqueada o ya presentada', ERRCODE = 'P0002';
  END IF;
  UPDATE public.rrhh_peru_presentaciones_planilla
  SET estado = 'RECTIFICADA', updated_at = now()
  WHERE tenant_id = p_tenant_id AND planilla_id = v_planilla_id
    AND id <> p_presentacion_id AND estado = 'PRESENTADA';
  UPDATE public.rrhh_peru_presentaciones_planilla
  SET estado = 'PRESENTADA', ticket_sunat = btrim(p_ticket),
      constancia_numero = btrim(p_constancia),
      fecha_presentacion = COALESCE(p_fecha_presentacion, now()),
      presentado_por = p_user_id, updated_at = now()
  WHERE id = p_presentacion_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_row;
  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION app.guardar_rrhh_peru_presentacion_tx(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guardar_rrhh_peru_presentacion_tx(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION app.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, timestamptz) TO service_role;

COMMENT ON TABLE public.rrhh_peru_fichas_laborales IS
  'Datos complementarios peruanos para validar fuentes T-Registro; los códigos deben contrastarse con tablas SUNAT vigentes.';
COMMENT ON TABLE public.rrhh_peru_presentaciones_planilla IS
  'Paquetes versionados PLAME/T-Registro. Sólo ticket y CIR/constancia externos acreditan presentación en SUNAT.';
