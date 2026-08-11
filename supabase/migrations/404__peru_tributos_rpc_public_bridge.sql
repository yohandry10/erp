-- Puentes PostgREST para las transacciones tributarias peruanas. Las funciones
-- de negocio siguen en app; public sólo expone wrappers restringidos al backend.

CREATE OR REPLACE FUNCTION public.guardar_tributo_mensual_tx(
  p_tenant_id uuid, p_user_id uuid, p_payload jsonb
) RETURNS public.tributos_declaraciones_mensuales
LANGUAGE sql SECURITY DEFINER SET search_path = public, app, pg_temp
AS $$ SELECT app.guardar_tributo_mensual_tx(p_tenant_id, p_user_id, p_payload) $$;

CREATE OR REPLACE FUNCTION public.registrar_constancia_tributo_mensual_tx(
  p_tenant_id uuid, p_user_id uuid, p_declaracion_id uuid,
  p_constancia text, p_fecha_presentacion timestamptz
) RETURNS public.tributos_declaraciones_mensuales
LANGUAGE sql SECURITY DEFINER SET search_path = public, app, pg_temp
AS $$
  SELECT app.registrar_constancia_tributo_mensual_tx(
    p_tenant_id, p_user_id, p_declaracion_id, p_constancia, p_fecha_presentacion
  )
$$;

CREATE OR REPLACE FUNCTION public.guardar_tributo_anual_tx(
  p_tenant_id uuid, p_user_id uuid, p_payload jsonb
) RETURNS public.tributos_declaraciones_anuales
LANGUAGE sql SECURITY DEFINER SET search_path = public, app, pg_temp
AS $$ SELECT app.guardar_tributo_anual_tx(p_tenant_id, p_user_id, p_payload) $$;

CREATE OR REPLACE FUNCTION public.registrar_constancia_tributo_anual_tx(
  p_tenant_id uuid, p_user_id uuid, p_declaracion_id uuid,
  p_constancia text, p_fecha_presentacion timestamptz
) RETURNS public.tributos_declaraciones_anuales
LANGUAGE sql SECURITY DEFINER SET search_path = public, app, pg_temp
AS $$
  SELECT app.registrar_constancia_tributo_anual_tx(
    p_tenant_id, p_user_id, p_declaracion_id, p_constancia, p_fecha_presentacion
  )
$$;

REVOKE ALL ON FUNCTION public.guardar_tributo_mensual_tx(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_constancia_tributo_mensual_tx(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_tributo_anual_tx(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_constancia_tributo_anual_tx(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- El backend escribe exclusivamente mediante los puentes públicos. Revocar
-- grants directos heredados evita que una reaplicación conserve writers viejos.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.tributos_declaraciones_mensuales,
           public.tributos_declaraciones_anuales
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.guardar_tributo_mensual_tx(uuid, uuid, jsonb),
  app.registrar_constancia_tributo_mensual_tx(uuid, uuid, uuid, text, timestamptz),
  app.guardar_tributo_anual_tx(uuid, uuid, jsonb),
  app.registrar_constancia_tributo_anual_tx(uuid, uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.guardar_tributo_mensual_tx(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_constancia_tributo_mensual_tx(uuid, uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_tributo_anual_tx(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_constancia_tributo_anual_tx(uuid, uuid, uuid, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.guardar_tributo_mensual_tx(uuid, uuid, jsonb) IS 'Puente PostgREST service_role hacia app.guardar_tributo_mensual_tx.';
COMMENT ON FUNCTION public.registrar_constancia_tributo_mensual_tx(uuid, uuid, uuid, text, timestamptz) IS 'Puente PostgREST service_role hacia app.registrar_constancia_tributo_mensual_tx.';
COMMENT ON FUNCTION public.guardar_tributo_anual_tx(uuid, uuid, jsonb) IS 'Puente PostgREST service_role hacia app.guardar_tributo_anual_tx.';
COMMENT ON FUNCTION public.registrar_constancia_tributo_anual_tx(uuid, uuid, uuid, text, timestamptz) IS 'Puente PostgREST service_role hacia app.registrar_constancia_tributo_anual_tx.';
