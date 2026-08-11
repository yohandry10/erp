-- Expone las transacciones PLAME al cliente PostgREST del backend.
-- Las implementaciones permanecen en app; public sólo contiene puentes
-- restringidos a service_role porque Supabase expone public por defecto.

CREATE OR REPLACE FUNCTION public.guardar_rrhh_peru_presentacion_tx(
  p_tenant_id uuid,
  p_user_id uuid,
  p_payload jsonb
) RETURNS public.rrhh_peru_presentaciones_planilla
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT app.guardar_rrhh_peru_presentacion_tx(p_tenant_id, p_user_id, p_payload)
$$;

CREATE OR REPLACE FUNCTION public.registrar_rrhh_peru_evidencia_tx(
  p_tenant_id uuid,
  p_user_id uuid,
  p_presentacion_id uuid,
  p_ticket_tregistro text,
  p_cir_tregistro text,
  p_constancia_plame text,
  p_fecha_presentacion timestamptz
) RETURNS public.rrhh_peru_presentaciones_planilla
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT app.registrar_rrhh_peru_evidencia_tx(
    p_tenant_id,
    p_user_id,
    p_presentacion_id,
    p_ticket_tregistro,
    p_cir_tregistro,
    p_constancia_plame,
    p_fecha_presentacion
  )
$$;

REVOKE ALL ON FUNCTION public.guardar_rrhh_peru_presentacion_tx(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.rrhh_peru_presentaciones_planilla
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.guardar_rrhh_peru_presentacion_tx(uuid, uuid, jsonb),
  app.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guardar_rrhh_peru_presentacion_tx(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.guardar_rrhh_peru_presentacion_tx(uuid, uuid, jsonb) IS
  'Puente PostgREST service_role hacia app.guardar_rrhh_peru_presentacion_tx.';
COMMENT ON FUNCTION public.registrar_rrhh_peru_evidencia_tx(uuid, uuid, uuid, text, text, text, timestamptz) IS
  'Puente PostgREST service_role hacia app.registrar_rrhh_peru_evidencia_tx.';
