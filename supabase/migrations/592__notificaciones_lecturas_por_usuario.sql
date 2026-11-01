-- Un aviso compartido (global o de rol) se marca leído por usuario. Antes `leida`
-- era una sola columna: quien lo marcaba lo apagaba para todos, y por eso sólo podía
-- hacerlo quien tenía notifications.update. Los avisos personales siguen en `leida`.
-- Un compartido ya marcado queda leído para todos: no se puede saber quién lo vio.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.notificaciones_lecturas (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  notificacion_id uuid NOT NULL REFERENCES public.notificaciones(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL,
  leida_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (notificacion_id, usuario_id)
);
CREATE INDEX idx_notificaciones_lecturas_usuario
  ON public.notificaciones_lecturas (tenant_id, usuario_id);

ALTER TABLE public.notificaciones_lecturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_lecturas FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notificaciones_lecturas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.notificaciones_lecturas TO service_role;
CREATE POLICY notificaciones_lecturas_servicio ON public.notificaciones_lecturas
  FOR SELECT TO service_role USING (true);

CREATE FUNCTION public.marcar_aviso_compartido_leido_tx(
  p_tenant_id uuid, p_usuario_id uuid, p_notificacion_id uuid
) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_leida_at timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR p_usuario_id IS NULL OR p_notificacion_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'NOTIFICATION_READ_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notificaciones n
     WHERE n.id = p_notificacion_id AND n.tenant_id = p_tenant_id AND n.usuario_id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'NOTIFICATION_NOT_FOUND';
  END IF;
  INSERT INTO public.notificaciones_lecturas (tenant_id, notificacion_id, usuario_id)
  VALUES (p_tenant_id, p_notificacion_id, p_usuario_id)
  ON CONFLICT (notificacion_id, usuario_id)
  DO UPDATE SET leida_at = public.notificaciones_lecturas.leida_at
  RETURNING leida_at INTO v_leida_at;
  RETURN v_leida_at;
END;
$function$;
REVOKE ALL ON FUNCTION public.marcar_aviso_compartido_leido_tx(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_aviso_compartido_leido_tx(uuid, uuid, uuid) TO service_role;

COMMIT;
