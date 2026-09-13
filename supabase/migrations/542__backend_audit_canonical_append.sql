-- Evidencia técnica complementaria. Los writers de negocio siguen auditando
-- dentro de su propia transacción; este RPC no sustituye esa garantía.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS backend_event_fingerprint text;
ALTER TABLE public.integration_logs ADD COLUMN IF NOT EXISTS backend_event_fingerprint text;

CREATE OR REPLACE FUNCTION app.redact_audit_payload_542(p_value jsonb, p_depth integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, app, pg_temp
AS $fn$
DECLARE v_result jsonb; v_key text; v_value jsonb;
BEGIN
  IF p_depth > 8 THEN RETURN '"[REDACTED]"'::jsonb; END IF;
  IF jsonb_typeof(p_value) = 'object' THEN
    v_result := '{}'::jsonb;
    FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_value) LOOP
      v_result := v_result || jsonb_build_object(v_key,
        CASE WHEN v_key ~* 'password|secret|private.?key|certificado|pfx|clave|token|authorization|cookie|api.?key|(^|_)pin($|_)'
          THEN '"[REDACTED]"'::jsonb ELSE app.redact_audit_payload_542(v_value, p_depth + 1) END);
    END LOOP;
    RETURN v_result;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    SELECT COALESCE(jsonb_agg(app.redact_audit_payload_542(value, p_depth + 1) ORDER BY ord), '[]'::jsonb)
      INTO v_result FROM jsonb_array_elements(p_value) WITH ORDINALITY a(value, ord);
    RETURN v_result;
  END IF;
  RETURN p_value;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.registrar_auditoria_backend_tx(
  p_tenant_id uuid, p_event_id uuid, p_kind text, p_event jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $fn$
DECLARE
  v_event jsonb; v_actor uuid; v_fingerprint text; v_prior text; v_rows integer;
BEGIN
  IF p_tenant_id IS NULL OR p_event_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('audit','integration')
    OR p_event IS NULL OR jsonb_typeof(p_event) <> 'object' OR octet_length(p_event::text) > 100000
    OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id=p_tenant_id) THEN
    RAISE EXCEPTION 'AUDIT_EVENT_INVALID' USING ERRCODE='22023';
  END IF;
  v_fingerprint := app.admin_fingerprint_462(jsonb_build_object('kind',p_kind,'event',p_event));
  v_event := app.redact_audit_payload_542(p_event);
  IF jsonb_typeof(COALESCE(v_event->'metadata','{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'AUDIT_METADATA_INVALID' USING ERRCODE='22023';
  END IF;

  IF p_kind = 'audit' THEN
    IF COALESCE(v_event->>'table_name','') !~ '^[a-z][a-z0-9_]{0,99}$'
      OR COALESCE(v_event->>'operation','') NOT IN ('INSERT','UPDATE','DELETE') THEN
      RAISE EXCEPTION 'AUDIT_ACTION_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_event->'changed_fields' IS NOT NULL AND v_event->'changed_fields' <> 'null'::jsonb THEN
      IF jsonb_typeof(v_event->'changed_fields') <> 'array' THEN
        RAISE EXCEPTION 'AUDIT_CHANGED_FIELDS_INVALID' USING ERRCODE='22023';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_event->'changed_fields') a(value) WHERE jsonb_typeof(value) <> 'string') THEN
        RAISE EXCEPTION 'AUDIT_CHANGED_FIELDS_INVALID' USING ERRCODE='22023';
      END IF;
    END IF;
    v_actor := NULLIF(v_event->>'user_id','')::uuid;
    IF v_actor IS NOT NULL THEN PERFORM app.assert_admin_actor_462(p_tenant_id,v_actor); END IF;
    INSERT INTO public.audit_log (
      id,tenant_id,user_id,table_name,operation,record_id,old_values,new_values,
      changed_fields,ip_address,user_agent,metadata,backend_event_fingerprint
    ) VALUES (
      p_event_id,p_tenant_id,v_actor,v_event->>'table_name',v_event->>'operation',v_event->>'record_id',
      NULLIF(v_event->'old_values','null'::jsonb),NULLIF(v_event->'new_values','null'::jsonb),
      NULLIF(v_event->'changed_fields','null'::jsonb),NULLIF(v_event->>'ip_address','')::inet,v_event->>'user_agent',
      COALESCE(v_event->'metadata','{}'::jsonb) || jsonb_build_object('source','backend_audit_542',
        'actor_type',CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'USER' END),v_fingerprint
    ) ON CONFLICT (id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    SELECT backend_event_fingerprint INTO v_prior FROM public.audit_log WHERE id=p_event_id AND tenant_id=p_tenant_id;
  ELSE
    IF COALESCE(btrim(v_event->>'servicio'),'') = '' OR COALESCE(btrim(v_event->>'operacion'),'') = ''
      OR COALESCE(v_event->>'status','') NOT IN ('SUCCESS','ERROR','SKIP','PENDING','TIMEOUT','GENERATED','COMPLETED','WARNING','INFO') THEN
      RAISE EXCEPTION 'AUDIT_INTEGRATION_INVALID' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.integration_logs (
      id,tenant_id,servicio,operacion,correlacion_id,correlacion_tipo,status,
      request_summary,response_summary,status_code,error_message,duration_ms,metadata,backend_event_fingerprint
    ) VALUES (
      p_event_id,p_tenant_id,v_event->>'servicio',v_event->>'operacion',v_event->>'correlacion_id',v_event->>'correlacion_tipo',v_event->>'status',
      v_event->'request_summary',v_event->'response_summary',(v_event->>'status_code')::integer,v_event->>'error_message',
      (v_event->>'duration_ms')::integer,COALESCE(v_event->'metadata','{}'::jsonb) || jsonb_build_object('source','backend_audit_542'),v_fingerprint
    ) ON CONFLICT (id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    SELECT backend_event_fingerprint INTO v_prior FROM public.integration_logs WHERE id=p_event_id AND tenant_id=p_tenant_id;
  END IF;
  IF v_prior IS DISTINCT FROM v_fingerprint THEN
    RAISE EXCEPTION 'AUDIT_EVENT_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('id',p_event_id,'idempotent',v_rows=0);
END;
$fn$;

REVOKE ALL ON FUNCTION app.redact_audit_payload_542(jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.registrar_auditoria_backend_tx(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_auditoria_backend_tx(uuid,uuid,text,jsonb) TO service_role;
GRANT SELECT ON public.audit_log,public.integration_logs,public.auth_login_attempts TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.audit_log,public.integration_logs FROM anon,authenticated,service_role;

-- Sin backfill, sin cambiar RLS ni concesiones de lectura al navegador.
-- El PK serializa reintentos del mismo evento. No existe SQL dinámico.
-- Rollback de aplicación: conservar columnas/evidencia y restaurar la ACL y
-- funciones del respaldo previo sólo con el runtime compatible detenido.
COMMIT;
