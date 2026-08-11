-- Verificacion transaccional de depreciacion + outbox. Nunca debe ejecutarse
-- contra una base remota ni dejar fixtures persistidos.

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY_454_SOLO_ERP_E2E:%', current_database();
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'DEV',
    project_ref = 'localqaerpephemeralx',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

CREATE FUNCTION app.verify_454_fail_outbox()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.event_type = 'depreciacion.generada'
     AND NEW.payload->>'periodo' = '2026-02' THEN
    RAISE EXCEPTION 'VERIFY_454_FALLO_INDUCIDO';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_verify_454_fail_outbox
BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.verify_454_fail_outbox();

DO $verify$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_tenant_ajeno uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_actor_ajeno uuid := gen_random_uuid();
  v_activo uuid := gen_random_uuid();
  v_activo_backfill uuid := gen_random_uuid();
  v_activo_rollback uuid := gen_random_uuid();
  v_dep_backfill uuid := gen_random_uuid();
  v_event_backfill uuid := gen_random_uuid();
  v_result jsonb;
  v_dep_id uuid;
  v_event_id uuid;
  v_failed boolean;
  v_count integer;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, activo, estado)
  VALUES
    (v_tenant, 'V454-' || left(v_tenant::text, 8), 'Verify depreciacion 454', true, 'ACTIVO'),
    (v_tenant_ajeno, 'V454-' || left(v_tenant_ajeno::text, 8), 'Verify ajeno 454', true, 'ACTIVO');

  INSERT INTO public.usuarios_sistema (id, tenant_id, email, activo, estado)
  VALUES
    (v_actor, v_tenant, 'v454-' || v_actor || '@example.test', true, 'ACTIVO'),
    (v_actor_ajeno, v_tenant_ajeno, 'v454-' || v_actor_ajeno || '@example.test', true, 'ACTIVO');

  INSERT INTO public.activos_fijos (
    id, tenant_id, codigo, nombre, fecha_adquisicion, valor_adquisicion,
    valor_residual, depreciacion_acumulada, vida_util, vida_util_meses,
    fecha_inicio_depreciacion, metodo_depreciacion, situacion, moneda,
    estado, activo, created_by
  ) VALUES
    (v_activo, v_tenant, 'AF-454-1', 'Activo principal', '2026-01-01', 1200,
     0, 0, 12, 12, '2026-01-01', 'LINEAL', 'ACTIVO', 'PEN', 'ACTIVO', true, v_actor::text),
    (v_activo_backfill, v_tenant, 'AF-454-2', 'Activo backfill', '2026-01-01', 1200,
     0, 100, 12, 12, '2026-01-01', 'LINEAL', 'ACTIVO', 'PEN', 'ACTIVO', true, v_actor::text),
    (v_activo_rollback, v_tenant, 'AF-454-3', 'Activo rollback', '2026-01-01', 1200,
     0, 0, 12, 12, '2026-01-01', 'LINEAL', 'ACTIVO', 'PEN', 'ACTIVO', true, v_actor::text);

  v_result := public.registrar_depreciacion_tx(
    v_tenant, v_activo, '2026-01', '2026-01-31',
    100, 100, 1100, NULL, v_actor::text
  );
  v_dep_id := (v_result->'depreciacion'->>'id')::uuid;
  v_event_id := (v_result->'outbox'->>'eventId')::uuid;

  IF COALESCE((v_result->>'idempotent')::boolean, true) THEN
    RAISE EXCEPTION 'VERIFY_454_ALTA_REPORTADA_COMO_RETRY';
  END IF;
  IF v_dep_id IS NULL OR v_event_id IS NULL THEN
    RAISE EXCEPTION 'VERIFY_454_IDS_DURABLES_AUSENTES:%', v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.outbox_events o
  WHERE o.tenant_id = v_tenant
    AND o.event_type = 'depreciacion.generada'
    AND o.event_id = v_event_id
    AND o.aggregate_id = v_dep_id::text
    AND o.payload->>'activoId' = v_activo::text
    AND o.payload->>'periodo' = '2026-01'
    AND round((o.payload->>'monto')::numeric, 2) = 100;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_454_OUTBOX_NO_CANONICO:%', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.depreciaciones d
    WHERE d.id = v_dep_id AND d.procesado_outbox AND d.evento_id = v_event_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.activos_fijos a
    WHERE a.id = v_activo AND a.depreciacion_acumulada = 100
  ) THEN
    RAISE EXCEPTION 'VERIFY_454_CUOTA_ACTIVO_OUTBOX_DESCONECTADOS';
  END IF;

  v_result := public.registrar_depreciacion_tx(
    v_tenant, v_activo, '2026-01', '2026-01-31',
    100, 100, 1100, NULL, v_actor::text
  );
  IF NOT COALESCE((v_result->>'idempotent')::boolean, false)
     OR (v_result->'outbox'->>'eventId')::uuid <> v_event_id THEN
    RAISE EXCEPTION 'VERIFY_454_RETRY_NO_ESTABLE:%', v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.depreciaciones d
  WHERE d.tenant_id = v_tenant AND d.activo_id = v_activo AND d.periodo = '2026-01';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'VERIFY_454_RETRY_DUPLICO_CUOTA:%', v_count;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_depreciacion_tx(
      v_tenant, v_activo, '2026-01', '2026-01-31',
      99, 99, 1101, NULL, v_actor::text
    );
  EXCEPTION WHEN SQLSTATE '23505' THEN
    v_failed := position('DEPRECIACION_PAYLOAD_CONFLICTO' IN SQLERRM) > 0;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_454_REUSO_DIFERENTE_NO_RECHAZADO';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_depreciacion_tx(
      v_tenant, v_activo_rollback, '2026-01', '2026-01-31',
      100, 100, 1100, NULL, v_actor_ajeno::text
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_failed := position('DEPRECIACION_ACTOR_INVALIDO' IN SQLERRM) > 0;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_454_ACTOR_CROSS_TENANT_ACEPTADO';
  END IF;

  -- Reproduce la marca falsa del scheduler anterior: evento_id presente y
  -- procesado_outbox=true, pero sin fila durable en outbox_events.
  INSERT INTO public.depreciaciones (
    id, tenant_id, activo_id, periodo, fecha_depreciacion, monto_depreciacion,
    depreciacion_acumulada, valor_neto, procesado_outbox, evento_id,
    created_by, estado, activo
  ) VALUES (
    v_dep_backfill, v_tenant, v_activo_backfill, '2026-01', '2026-01-31', 100,
    100, 1100, true, v_event_backfill, v_actor::text, 'PENDIENTE', true
  );

  v_result := public.asegurar_depreciacion_outbox_tx(v_tenant, v_dep_backfill);
  IF (v_result->>'eventId')::uuid <> v_event_backfill
     OR NOT COALESCE((v_result->>'repaired')::boolean, false)
     OR NOT EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE event_id = v_event_backfill
         AND idempotency_key = format(
           'depreciacion.generada:%s:%s', v_tenant, v_dep_backfill
         )
     ) THEN
    RAISE EXCEPTION 'VERIFY_454_BACKFILL_NO_REPARO:%', v_result;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.registrar_depreciacion_tx(
      v_tenant, v_activo_rollback, '2026-02', '2026-02-28',
      100, 100, 1100, NULL, v_actor::text
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := position('VERIFY_454_FALLO_INDUCIDO' IN SQLERRM) > 0;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_454_NO_PROPAGO_FALLO_OUTBOX';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.depreciaciones
    WHERE tenant_id = v_tenant AND activo_id = v_activo_rollback
  ) OR EXISTS (
    SELECT 1 FROM public.activos_fijos
    WHERE id = v_activo_rollback AND depreciacion_acumulada <> 0
  ) THEN
    RAISE EXCEPTION 'VERIFY_454_FALLO_OUTBOX_NO_REIRTIO_DOMINIO';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.registrar_depreciacion_tx(uuid,uuid,text,date,numeric,numeric,numeric,uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.asegurar_depreciacion_outbox_tx(uuid,uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.registrar_depreciacion_tx(uuid,uuid,text,date,numeric,numeric,numeric,uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'app.asegurar_depreciacion_outbox_454(uuid,uuid)', 'EXECUTE'
     )
     OR has_table_privilege('authenticated', 'public.depreciaciones', 'INSERT')
     OR has_table_privilege('authenticated', 'public.depreciaciones', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.depreciaciones', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY_454_ACL_INCORRECTO';
  END IF;
END;
$verify$;

DROP TRIGGER trg_verify_454_fail_outbox ON public.outbox_events;
DROP FUNCTION app.verify_454_fail_outbox();

ROLLBACK;
