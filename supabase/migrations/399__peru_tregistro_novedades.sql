-- T-Registro sólo debe reenviar altas/modificaciones cuando cambió la fuente.
-- Al registrar ticket+CIR, conserva por empleado la última huella aceptada.

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
  v_resumen jsonb;
  v_row public.rrhh_peru_presentaciones_planilla;
BEGIN
  IF NULLIF(btrim(p_ticket), '') IS NULL OR NULLIF(btrim(p_constancia), '') IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Ticket y CIR/constancia SUNAT son obligatorios', ERRCODE = '22023';
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

  UPDATE public.rrhh_peru_presentaciones_planilla
  SET estado = 'RECTIFICADA', updated_at = now()
  WHERE tenant_id = p_tenant_id AND planilla_id = v_planilla_id
    AND id <> p_presentacion_id AND estado = 'PRESENTADA';

  UPDATE public.rrhh_peru_fichas_laborales f
  SET metadata = COALESCE(f.metadata, '{}'::jsonb) || jsonb_build_object(
        'tregistro_ultima_huella', h.value,
        'tregistro_ticket', btrim(p_ticket),
        'tregistro_cir', btrim(p_constancia),
        'tregistro_confirmado_at', COALESCE(p_fecha_presentacion, now())
      ),
      updated_by = p_user_id,
      updated_at = now()
  FROM jsonb_each_text(COALESCE(v_resumen->'tregistro_huellas', '{}'::jsonb)) AS h
  WHERE f.tenant_id = p_tenant_id AND f.empleado_id::text = h.key;

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

REVOKE ALL ON FUNCTION app.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION app.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, timestamptz) IS
  'Registra ticket/CIR y marca la huella T-Registro por empleado en la misma transacción.';
