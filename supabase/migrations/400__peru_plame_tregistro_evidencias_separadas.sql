-- Separa la constancia mensual PLAME del ticket/CIR de T-Registro.
-- Sin novedades T-Registro sólo se exige constancia PLAME.

ALTER TABLE public.rrhh_peru_presentaciones_planilla
  ADD COLUMN IF NOT EXISTS tregistro_cir text;

DROP FUNCTION IF EXISTS app.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, timestamptz);

CREATE FUNCTION app.registrar_rrhh_peru_evidencia_tx(
  p_tenant_id uuid,
  p_user_id uuid,
  p_presentacion_id uuid,
  p_ticket_tregistro text,
  p_cir_tregistro text,
  p_constancia_plame text,
  p_fecha_presentacion timestamptz
) RETURNS public.rrhh_peru_presentaciones_planilla
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_planilla_id uuid;
  v_resumen jsonb;
  v_novedades integer;
  v_row public.rrhh_peru_presentaciones_planilla;
BEGIN
  IF NULLIF(btrim(p_constancia_plame), '') IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'La constancia PLAME es obligatoria', ERRCODE = '22023';
  END IF;
  SELECT planilla_id, resumen INTO v_planilla_id, v_resumen
  FROM public.rrhh_peru_presentaciones_planilla
  WHERE id = p_presentacion_id AND tenant_id = p_tenant_id AND vigente
    AND estado IN ('FUENTE_PVS', 'VALIDADA_PVS')
    AND jsonb_array_length(bloqueos) = 0
  FOR UPDATE;
  IF v_planilla_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Fuente vigente no encontrada, bloqueada o ya presentada', ERRCODE = 'P0002';
  END IF;
  v_novedades := COALESCE((v_resumen->>'tregistro_novedades')::integer, 0);
  IF v_novedades > 0 AND (
    NULLIF(btrim(p_ticket_tregistro), '') IS NULL OR NULLIF(btrim(p_cir_tregistro), '') IS NULL
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Las novedades T-Registro requieren ticket y CIR', ERRCODE = '22023';
  END IF;

  UPDATE public.rrhh_peru_presentaciones_planilla
  SET estado = 'RECTIFICADA', updated_at = now()
  WHERE tenant_id = p_tenant_id AND planilla_id = v_planilla_id
    AND id <> p_presentacion_id AND estado = 'PRESENTADA';

  IF v_novedades > 0 THEN
    UPDATE public.rrhh_peru_fichas_laborales f
    SET metadata = COALESCE(f.metadata, '{}'::jsonb) || jsonb_build_object(
          'tregistro_ultima_huella', h.value,
          'tregistro_ticket', btrim(p_ticket_tregistro),
          'tregistro_cir', btrim(p_cir_tregistro),
          'tregistro_confirmado_at', COALESCE(p_fecha_presentacion, now())
        ),
        updated_by = p_user_id,
        updated_at = now()
    FROM jsonb_each_text(COALESCE(v_resumen->'tregistro_huellas', '{}'::jsonb)) AS h
    WHERE f.tenant_id = p_tenant_id AND f.empleado_id::text = h.key;
  END IF;

  UPDATE public.rrhh_peru_presentaciones_planilla
  SET estado = 'PRESENTADA',
      ticket_sunat = NULLIF(btrim(p_ticket_tregistro), ''),
      tregistro_cir = NULLIF(btrim(p_cir_tregistro), ''),
      constancia_numero = btrim(p_constancia_plame),
      fecha_presentacion = COALESCE(p_fecha_presentacion, now()),
      presentado_por = p_user_id,
      updated_at = now()
  WHERE id = p_presentacion_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_row;
  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION app.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, text, timestamptz) TO service_role;

COMMENT ON COLUMN public.rrhh_peru_presentaciones_planilla.ticket_sunat IS 'Ticket SOL de carga masiva T-Registro; nulo cuando no hay novedades.';
COMMENT ON COLUMN public.rrhh_peru_presentaciones_planilla.tregistro_cir IS 'CIR de T-Registro; distinto de la constancia PLAME.';
COMMENT ON COLUMN public.rrhh_peru_presentaciones_planilla.constancia_numero IS 'Constancia de presentación PLAME.';
