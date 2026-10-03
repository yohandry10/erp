-- PLAME: la intención HTTP y su versión se guardan en la misma transacción.
-- Reutiliza el registro privado de operaciones RRHH; sin backfill de versiones.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.guardar_rrhh_peru_presentacion_tx(
  p_tenant_id uuid, p_user_id uuid, p_payload jsonb
) RETURNS public.rrhh_peru_presentaciones_planilla
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := btrim(coalesce(p_payload->>'idempotency_key', ''));
  v_planilla uuid := (p_payload->>'planilla_id')::uuid;
  v_notas text := nullif(btrim(p_payload->>'notas'), '');
  v_fingerprint text;
  v_intent public.rrhh_operaciones_475%ROWTYPE;
  v_row public.rrhh_peru_presentaciones_planilla;
BEGIN
  PERFORM app.assert_rrhh_actor_475(p_tenant_id, p_user_id);
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_user_id, 'rrhh.planilla_electronica.write');
  IF length(v_key) NOT BETWEEN 8 AND 200 OR v_planilla IS NULL THEN
    RAISE EXCEPTION 'PLAME_IDEMPOTENCY_KEY_OR_PLANILLA_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.planillas
    WHERE id=v_planilla AND tenant_id=p_tenant_id AND pais_codigo='PE') THEN
    RAISE EXCEPTION 'PLAME_PLANILLA_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  -- La huella identifica la solicitud del usuario. El corte y los archivos
  -- pueden cambiar durante un reintento; se devuelve la respuesta congelada.
  v_fingerprint := app.rrhh_fingerprint_475(jsonb_build_object(
    'planilla_id', v_planilla, 'notas', v_notas));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':rrhh:plame:intent:' || v_key, 559));
  SELECT * INTO v_intent FROM public.rrhh_operaciones_475
    WHERE tenant_id=p_tenant_id AND operacion='PERU_PACKAGE_CREATE'
      AND idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_intent.actor_id IS DISTINCT FROM p_user_id
      OR v_intent.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'PLAME_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF v_intent.response IS NULL THEN
      RAISE EXCEPTION 'PLAME_OPERATION_INCOMPLETE' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO v_row FROM jsonb_populate_record(
      NULL::public.rrhh_peru_presentaciones_planilla, v_intent.response);
    RETURN v_row;
  END IF;
  INSERT INTO public.rrhh_operaciones_475(
    tenant_id, actor_id, operacion, idempotency_key, fingerprint
  ) VALUES(p_tenant_id, p_user_id, 'PERU_PACKAGE_CREATE', v_key, v_fingerprint)
    RETURNING * INTO v_intent;
  v_row := app.guardar_rrhh_peru_presentacion_tx(p_tenant_id, p_user_id,
    (p_payload - 'idempotency_key') || jsonb_build_object('notas', v_notas));
  PERFORM app.audit_rrhh_475(p_tenant_id, p_user_id,
    'rrhh_peru_presentaciones_planilla', 'INSERT', v_row.id, NULL,
    jsonb_build_object('planilla_id',v_planilla,'version',v_row.version,'estado',v_row.estado),
    'PERU_PACKAGE_CREATE', v_intent.id);
  UPDATE public.rrhh_operaciones_475 SET entidad_id=v_row.id,
    response=to_jsonb(v_row), completed_at=now() WHERE id=v_intent.id;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb) TO service_role;
-- El respaldo PROD conservaba EXECUTE del writer interno para service_role.
-- La API usa el wrapper público; cerrar esa vía evita saltar su autorización.
REVOKE ALL ON FUNCTION app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb) IS
  'PLAME: actor y permiso vigentes, intención y versión atómicas; reintentos devuelven la respuesta congelada.';
COMMIT;
