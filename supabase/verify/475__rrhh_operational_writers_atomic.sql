\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF current_database() NOT IN ('erp_e2e', 'erp_rrhh_475') THEN
    RAISE EXCEPTION 'VERIFY_475_SOLO_BASE_LOCAL_AISLADA:%', current_database();
  END IF;
END;
$guard$;

UPDATE app.deployment_environment
SET environment = 'PROD',
    project_ref = 'wypnbcptofqdmoynlonq',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

DO $catalog$
DECLARE
  v_definition text;
  v_table text;
  v_role text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'rrhh_operaciones_475'
      AND c.relrowsecurity
      AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'VERIFY_475_INTENT_TABLE_RLS_INCOMPLETE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'ejecutar_operacion_rrhh_tx'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'VERIFY_475_RPC_NOT_SECURITY_DEFINER';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_475_RPC_ACL_INVALID';
  END IF;

  IF has_table_privilege('anon', 'public.rrhh_operaciones_475', 'SELECT')
     OR has_table_privilege('authenticated', 'public.rrhh_operaciones_475', 'SELECT') THEN
    RAISE EXCEPTION 'VERIFY_475_INTENT_TABLE_EXPOSED';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'public.rrhh_configuracion_argentina','public.rrhh_configuracion_colombia',
    'public.empleados','public.departamentos','public.vacantes','public.candidatos',
    'public.asistencia','public.asistencias','public.solicitudes','public.empleado_beneficios',
    'public.evaluaciones','public.empleado_capacitaciones','public.empleado_horarios',
    'public.expediente_documentos','public.contratos','public.rrhh_peru_fichas_laborales',
    'public.empleado_planilla'
  ]::text[] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role']::text[] LOOP
      IF has_table_privilege(v_role, v_table, 'INSERT')
         OR has_table_privilege(v_role, v_table, 'UPDATE')
         OR has_table_privilege(v_role, v_table, 'DELETE') THEN
        RAISE EXCEPTION 'VERIFY_475_DOMAIN_DML_STILL_GRANTED:%:%', v_role, v_table;
      END IF;
    END LOOP;
  END LOOP;

  IF has_function_privilege('service_role', 'app.rrhh_fingerprint_475(jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.rrhh_pick_475(jsonb,text[])', 'EXECUTE')
     OR has_function_privilege('service_role', 'app.assert_rrhh_actor_475(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege(
       'service_role',
       'app.audit_rrhh_475(uuid,uuid,text,text,uuid,jsonb,jsonb,text,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'VERIFY_475_INTERNAL_HELPER_EXPOSED';
  END IF;

  SELECT pg_get_functiondef(
    'public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT LIKE '%pg_advisory_xact_lock%'
     OR v_definition NOT LIKE '%FOR UPDATE%'
     OR v_definition NOT LIKE '%RRHH_IDEMPOTENCY_KEY_DIFFERENT_ACTOR%'
     OR v_definition NOT LIKE '%app.audit_rrhh_475%' THEN
    RAISE EXCEPTION 'VERIFY_475_LOCK_IDEMPOTENCY_AUDIT_CONTRACT_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contratos'::regclass
      AND conname = 'ck_contratos_tipo_runtime'
      AND pg_get_constraintdef(oid) LIKE '%plazo_fijo%'
      AND pg_get_constraintdef(oid) LIKE '%obra_labor%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contratos'::regclass
      AND conname = 'ck_contratos_regimen_runtime'
      AND pg_get_constraintdef(oid) LIKE '%PENSION_COLOMBIA%'
  ) THEN
    RAISE EXCEPTION 'VERIFY_475_COUNTRY_CONTRACT_CONSTRAINTS_MISSING';
  END IF;
END;
$catalog$;

CREATE OR REPLACE FUNCTION app.verify_475_fail_late_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF NEW.table_name = 'expediente_documentos'
     AND NEW.new_values->>'nombre_archivo' = 'late-fail.pdf' THEN
    RAISE EXCEPTION 'VERIFY_475_LATE_AUDIT_FAILURE';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_verify_475_fail_late_audit ON public.audit_log;
CREATE TRIGGER trg_verify_475_fail_late_audit
BEFORE INSERT ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION app.verify_475_fail_late_audit();

DO $verify$
DECLARE
  v_demo_pe jsonb;
  v_demo_ar jsonb;
  v_demo_co jsonb;
  v_demo_other jsonb;
  v_tenant uuid;
  v_actor uuid;
  v_actor_2 uuid := gen_random_uuid();
  v_inactive_actor uuid := gen_random_uuid();
  v_other_tenant uuid;
  v_other_actor uuid;
  v_department_other uuid := gen_random_uuid();
  v_benefit uuid := gen_random_uuid();
  v_training uuid := gen_random_uuid();
  v_schedule_1 uuid := gen_random_uuid();
  v_schedule_2 uuid := gen_random_uuid();
  v_payroll uuid := gen_random_uuid();
  v_payroll_detail uuid := gen_random_uuid();
  v_employee jsonb;
  v_retry jsonb;
  v_department jsonb;
  v_vacancy jsonb;
  v_candidate jsonb;
  v_request jsonb;
  v_evaluation jsonb;
  v_contract jsonb;
  v_ar_employee jsonb;
  v_co_employee jsonb;
  v_result jsonb;
  v_failed boolean;
BEGIN
  v_demo_pe := public.create_demo_tenant(
    'Verify RRHH 475 PE ' || left(gen_random_uuid()::text, 8), 1, 'PE'
  );
  v_demo_ar := public.create_demo_tenant(
    'Verify RRHH 475 AR ' || left(gen_random_uuid()::text, 8), 1, 'AR'
  );
  v_demo_co := public.create_demo_tenant(
    'Verify RRHH 475 CO ' || left(gen_random_uuid()::text, 8), 1, 'CO'
  );
  v_demo_other := public.create_demo_tenant(
    'Verify RRHH 475 other ' || left(gen_random_uuid()::text, 8), 1, 'PE'
  );

  v_tenant := (v_demo_pe->>'tenant_id')::uuid;
  v_actor := (v_demo_pe->>'user_id')::uuid;
  v_other_tenant := (v_demo_other->>'tenant_id')::uuid;
  v_other_actor := (v_demo_other->>'user_id')::uuid;

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES
    (v_actor_2, v_tenant, 'Actor', 'Segundo',
     'rrhh475-second-' || left(v_actor_2::text, 8) || '@local.invalid',
     'rrhh475second', 'unused-local-hash', true, 'ACTIVO'),
    (v_inactive_actor, v_tenant, 'Actor', 'Inactivo',
     'rrhh475-inactive-' || left(v_inactive_actor::text, 8) || '@local.invalid',
     'rrhh475inactive', 'unused-local-hash', false, 'INACTIVO');

  INSERT INTO public.user_roles (
    id, usuario_sistema_id, role_id, tenant_id, assigned_by
  )
  SELECT gen_random_uuid(), v_actor_2, ur.role_id, v_tenant, v_actor
  FROM public.user_roles ur
  WHERE ur.usuario_sistema_id = v_actor
    AND ur.tenant_id = v_tenant;

  INSERT INTO public.departamentos (
    id, tenant_id, nombre, codigo, estado, activo
  ) VALUES (
    v_department_other, v_other_tenant, 'Departamento ajeno', 'OTHER-475', 'activo', true
  );

  -- Actor inactivo y actor de otro tenant no pueden abrir una intención.
  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_inactive_actor, 'DEPARTMENT_CREATE',
      '{"nombre":"No autorizado"}'::jsonb, 'verify475-inactive-actor'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_475_INACTIVE_ACTOR_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_other_actor, 'DEPARTMENT_CREATE',
      '{"nombre":"Cross tenant"}'::jsonb, 'verify475-cross-tenant-actor'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_475_CROSS_TENANT_ACTOR_ACCEPTED'; END IF;

  -- Maestro empleado: una intención exacta sólo materializa una fila.
  v_employee := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'EMPLOYEE_CREATE',
    jsonb_build_object(
      'nombres', 'Ada', 'apellidos', 'Lovelace',
      'tipo_documento', 'DNI', 'numero_documento', '47500001',
      'fecha_ingreso', '2026-08-01', 'estado', 'activo'
    ),
    'verify475-employee-create'
  );
  v_retry := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'EMPLOYEE_CREATE',
    jsonb_build_object(
      'nombres', 'Ada', 'apellidos', 'Lovelace',
      'tipo_documento', 'DNI', 'numero_documento', '47500001',
      'fecha_ingreso', '2026-08-01', 'estado', 'activo'
    ),
    'verify475-employee-create'
  );
  IF v_retry IS DISTINCT FROM v_employee
     OR (SELECT count(*) FROM public.empleados
         WHERE tenant_id = v_tenant AND numero_documento = '47500001') <> 1 THEN
    RAISE EXCEPTION 'VERIFY_475_EMPLOYEE_REPLAY_INVALID:%:%', v_employee, v_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_actor, 'EMPLOYEE_CREATE',
      jsonb_build_object(
        'nombres', 'Payload distinto', 'apellidos', 'Lovelace',
        'numero_documento', '47500002'
      ),
      'verify475-employee-create'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_475_FINGERPRINT_MISMATCH_ACCEPTED'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_actor_2, 'EMPLOYEE_CREATE',
      jsonb_build_object(
        'nombres', 'Ada', 'apellidos', 'Lovelace',
        'tipo_documento', 'DNI', 'numero_documento', '47500001',
        'fecha_ingreso', '2026-08-01', 'estado', 'activo'
      ),
      'verify475-employee-create'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_475_ACTOR_BOUNDARY_NOT_ENFORCED'; END IF;

  -- El departamento ajeno no puede enlazarse y la intención fallida no queda durable.
  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_actor, 'EMPLOYEE_UPDATE',
      jsonb_build_object('id', v_employee->>'id', 'id_departamento', v_department_other),
      'verify475-cross-reference'
    );
  EXCEPTION WHEN foreign_key_violation THEN v_failed := true;
  END;
  IF NOT v_failed OR EXISTS (
    SELECT 1 FROM public.rrhh_operaciones_475
    WHERE tenant_id = v_tenant AND idempotency_key = 'verify475-cross-reference'
  ) THEN
    RAISE EXCEPTION 'VERIFY_475_CROSS_REFERENCE_NOT_ROLLED_BACK';
  END IF;

  v_department := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'DEPARTMENT_CREATE',
    jsonb_build_object('nombre', 'Ingeniería', 'codigo', 'ENG-475'),
    'verify475-department-create'
  );
  v_result := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'EMPLOYEE_UPDATE',
    jsonb_build_object(
      'id', v_employee->>'id', 'id_departamento', v_department->>'id',
      'puesto', 'Arquitecta de software'
    ),
    'verify475-employee-update'
  );
  IF v_result->>'puesto' <> 'Arquitecta de software' THEN
    RAISE EXCEPTION 'VERIFY_475_EMPLOYEE_UPDATE_INVALID:%', v_result;
  END IF;

  v_vacancy := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'VACANCY_CREATE',
    jsonb_build_object(
      'titulo', 'Backend senior', 'puesto_solicitado', 'Backend senior',
      'departamento_id', v_department->>'id', 'tipo_contrato', 'tiempo_completo',
      'salario_minimo', 4000, 'salario_maximo', 6000
    ),
    'verify475-vacancy-create'
  );
  v_candidate := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'CANDIDATE_CREATE',
    jsonb_build_object(
      'vacante_id', v_vacancy->>'id', 'nombres', 'Grace', 'apellidos', 'Hopper',
      'email', 'grace.475@example.test'
    ),
    'verify475-candidate-create'
  );
  v_candidate := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'CANDIDATE_UPDATE',
    jsonb_build_object(
      'id', v_candidate->>'id', 'telefono', '999475000', 'puntuacion_cv', 95
    ),
    'verify475-candidate-update'
  );
  v_candidate := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'CANDIDATE_STATUS',
    jsonb_build_object(
      'id', v_candidate->>'id', 'estado', 'entrevista', 'observaciones', 'Pasa a entrevista'
    ),
    'verify475-candidate-status'
  );
  IF lower(v_candidate->>'estado') <> 'entrevista'
     OR v_candidate->>'telefono' <> '999475000' THEN
    RAISE EXCEPTION 'VERIFY_475_CANDIDATE_FLOW_INVALID:%', v_candidate;
  END IF;

  v_result := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'ATTENDANCE_MARK',
    jsonb_build_object(
      'empleado_id', v_employee->>'id', 'fecha', '2026-08-10',
      'tipo', 'entrada', 'hora', '08:00'
    ),
    'verify475-attendance-entry'
  );
  v_retry := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'ATTENDANCE_MARK',
    jsonb_build_object(
      'empleado_id', v_employee->>'id', 'fecha', '2026-08-10',
      'tipo', 'entrada', 'hora', '08:00'
    ),
    'verify475-attendance-entry'
  );
  IF v_result IS DISTINCT FROM v_retry THEN
    RAISE EXCEPTION 'VERIFY_475_ATTENDANCE_REPLAY_INVALID';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_actor, 'ATTENDANCE_MARK',
      jsonb_build_object(
        'empleado_id', v_employee->>'id', 'fecha', '2026-08-11', 'tipo', 'entrada'
      ),
      'verify475-attendance-missing-time'
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_475_ATTENDANCE_WITHOUT_TIME_ACCEPTED'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_actor, 'ATTENDANCE_MARK',
      jsonb_build_object(
        'empleado_id', v_employee->>'id', 'fecha', '2026-08-10',
        'tipo', 'salida', 'hora', '07:59'
      ),
      'verify475-attendance-exit-before-entry'
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_475_ATTENDANCE_EXIT_BEFORE_ENTRY_ACCEPTED'; END IF;
  v_result := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'ATTENDANCE_MARK',
    jsonb_build_object(
      'empleado_id', v_employee->>'id', 'fecha', '2026-08-10',
      'tipo', 'salida', 'hora', '17:00'
    ),
    'verify475-attendance-exit'
  );
  IF (v_result->>'horas_trabajadas')::numeric <> 9 THEN
    RAISE EXCEPTION 'VERIFY_475_ATTENDANCE_HOURS_INVALID:%', v_result;
  END IF;
  v_result := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'ATTENDANCE_ABSENCE_MARK',
    jsonb_build_object('empleado_id', v_employee->>'id', 'fecha', '2026-08-10'),
    'verify475-absence-existing'
  );
  IF v_result->>'action' <> 'UNCHANGED' THEN
    RAISE EXCEPTION 'VERIFY_475_ABSENCE_OVERWROTE_EXISTING_ATTENDANCE:%', v_result;
  END IF;
  v_result := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'ATTENDANCE_ABSENCE_MARK',
    jsonb_build_object('empleado_id', v_employee->>'id', 'fecha', '2026-08-12'),
    'verify475-absence-create'
  );
  v_retry := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'ATTENDANCE_ABSENCE_MARK',
    jsonb_build_object('empleado_id', v_employee->>'id', 'fecha', '2026-08-12'),
    'verify475-absence-create'
  );
  IF v_result->>'action' <> 'CREATED'
     OR v_result IS DISTINCT FROM v_retry
     OR lower(v_result#>>'{data,estado}') <> 'ausente'
     OR (v_result#>>'{data,marcado_por}')::uuid <> v_actor THEN
    RAISE EXCEPTION 'VERIFY_475_ABSENCE_ATOMIC_FLOW_INVALID:%:%', v_result, v_retry;
  END IF;

  v_request := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'REQUEST_CREATE',
    jsonb_build_object(
      'id_empleado', v_employee->>'id', 'tipo', 'vacaciones',
      'fecha_inicio', '2026-09-01', 'fecha_fin', '2026-09-03',
      'motivo', 'Descanso anual', 'estado', 'cancelada',
      'aprobado_por', v_other_actor
    ),
    'verify475-request-create'
  );
  IF lower(v_request->>'estado') <> 'pendiente'
     OR v_request->>'aprobado_por' IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY_475_REQUEST_CREATE_BYPASSED_APPROVAL:%', v_request;
  END IF;
  v_request := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'REQUEST_DECIDE',
    jsonb_build_object(
      'id', v_request->>'id', 'decision', 'aprobada',
      'aprobado_por', v_other_actor, 'observaciones', 'Aprobada localmente'
    ),
    'verify475-request-decide'
  );
  IF (v_request->>'aprobado_por')::uuid <> v_actor THEN
    RAISE EXCEPTION 'VERIFY_475_REQUEST_ACTOR_SPOOFED:%', v_request;
  END IF;

  INSERT INTO public.beneficios (id, tenant_id, nombre, codigo, estado, activo)
  VALUES (v_benefit, v_tenant, 'Seguro verify', 'BEN-475', 'ACTIVO', true);
  INSERT INTO public.capacitaciones (
    id, tenant_id, nombre, codigo, estado, activo, fecha_inicio
  ) VALUES (
    v_training, v_tenant, 'Seguridad verify', 'CAP-475', 'ACTIVO', true, '2026-08-15'
  );
  INSERT INTO public.horarios_trabajo (
    id, tenant_id, nombre, codigo, estado, activo, hora_inicio, hora_fin
  ) VALUES
    (v_schedule_1, v_tenant, 'Mañana', 'HOR-475-A', 'ACTIVO', true, '08:00', '17:00'),
    (v_schedule_2, v_tenant, 'Tarde', 'HOR-475-B', 'ACTIVO', true, '12:00', '20:00');

  PERFORM public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'BENEFIT_ASSIGN',
    jsonb_build_object(
      'empleado_id', v_employee->>'id', 'beneficio_id', v_benefit,
      'fecha_inicio', '2026-08-10'
    ),
    'verify475-benefit-assign'
  );
  PERFORM public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'TRAINING_ENROLL',
    jsonb_build_object(
      'empleado_id', v_employee->>'id', 'capacitacion_id', v_training,
      'fecha_inscripcion', '2026-08-10'
    ),
    'verify475-training-enroll'
  );
  PERFORM public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'SCHEDULE_ASSIGN',
    jsonb_build_object(
      'empleado_id', v_employee->>'id', 'horario_id', v_schedule_1,
      'fecha_inicio', '2026-08-10'
    ),
    'verify475-schedule-first'
  );
  PERFORM public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'SCHEDULE_ASSIGN',
    jsonb_build_object(
      'empleado_id', v_employee->>'id', 'horario_id', v_schedule_2,
      'fecha_inicio', '2026-08-11'
    ),
    'verify475-schedule-reassign'
  );
  IF (SELECT count(*) FROM public.empleado_horarios
      WHERE tenant_id = v_tenant AND empleado_id = (v_employee->>'id')::uuid AND activo) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.empleado_horarios
       WHERE tenant_id = v_tenant AND empleado_id = (v_employee->>'id')::uuid
         AND horario_id = v_schedule_1 AND NOT activo
     ) THEN
    RAISE EXCEPTION 'VERIFY_475_SCHEDULE_REASSIGN_NOT_ATOMIC';
  END IF;

  v_evaluation := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'EVALUATION_CREATE',
    jsonb_build_object(
      'id_empleado', v_employee->>'id', 'evaluador_id', v_actor,
      'fecha_evaluacion', '2026-08-10', 'periodo', '2026-Q3',
      'tipo', 'desempeno', 'puntaje_total', 80
    ),
    'verify475-evaluation-create'
  );
  v_evaluation := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'EVALUATION_UPDATE',
    jsonb_build_object(
      'id', v_evaluation->>'id', 'estado', 'completada', 'puntaje_total', 92
    ),
    'verify475-evaluation-update'
  );
  IF lower(v_evaluation->>'estado') <> 'completada'
     OR (v_evaluation->>'puntaje_total')::numeric <> 92 THEN
    RAISE EXCEPTION 'VERIFY_475_EVALUATION_FLOW_INVALID:%', v_evaluation;
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_actor, 'EVALUATION_UPDATE',
      jsonb_build_object('id', v_evaluation->>'id', 'evaluador_id', v_other_actor),
      'verify475-evaluation-cross-evaluator'
    );
  EXCEPTION WHEN foreign_key_violation OR check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_475_CROSS_TENANT_EVALUATOR_ACCEPTED'; END IF;

  v_result := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'FILE_ADD',
    jsonb_build_object(
      'empleado_id', v_employee->>'id', 'tipo_documento', 'cv',
      'nombre_archivo', 'cv-ada.pdf', 'archivo_url', 'https://local.invalid/cv-ada.pdf',
      'subido_por', v_other_actor
    ),
    'verify475-file-add'
  );
  IF (v_result->>'subido_por')::uuid <> v_actor THEN
    RAISE EXCEPTION 'VERIFY_475_FILE_ACTOR_SPOOFED:%', v_result;
  END IF;

  -- Si falla la auditoría después del INSERT, dominio e intención vuelven atrás.
  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_actor, 'FILE_ADD',
      jsonb_build_object(
        'empleado_id', v_employee->>'id', 'tipo_documento', 'otro',
        'nombre_archivo', 'late-fail.pdf',
        'archivo_url', 'https://local.invalid/late-fail.pdf'
      ),
      'verify475-file-late-fail'
    );
  EXCEPTION WHEN raise_exception THEN v_failed := true;
  END;
  IF NOT v_failed
     OR EXISTS (
       SELECT 1 FROM public.expediente_documentos
       WHERE tenant_id = v_tenant AND nombre_archivo = 'late-fail.pdf'
     )
     OR EXISTS (
       SELECT 1 FROM public.rrhh_operaciones_475
       WHERE tenant_id = v_tenant AND idempotency_key = 'verify475-file-late-fail'
     ) THEN
    RAISE EXCEPTION 'VERIFY_475_LATE_FAILURE_DID_NOT_ROLL_BACK';
  END IF;

  v_contract := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'CONTRACT_CREATE',
    jsonb_build_object(
      'empleado_id', v_employee->>'id', 'tipo_contrato', 'part_time',
      'fecha_inicio', '2026-08-01', 'sueldo_bruto', 900,
      'salario', 900, 'moneda', 'PEN', 'estado', 'activo',
      'regimen_pensionario', 'AFP'
    ),
    'verify475-contract-create'
  );
  IF lower(v_contract->>'estado') <> 'vigente' THEN
    RAISE EXCEPTION 'VERIFY_475_LEGACY_CONTRACT_STATE_NOT_NORMALIZED:%', v_contract;
  END IF;
  v_contract := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'CONTRACT_RENEW',
    jsonb_build_object('id', v_contract->>'id', 'meses', 3),
    'verify475-contract-renew'
  );
  v_contract := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'CONTRACT_FINALIZE',
    jsonb_build_object(
      'id', v_contract->>'id', 'fecha_finalizacion', '2026-10-01',
      'motivo_finalizacion', 'Fin de vínculo verify'
    ),
    'verify475-contract-finalize'
  );
  IF lower(v_contract->>'estado') <> 'finalizado'
     OR COALESCE((v_contract->>'activo')::boolean, true) THEN
    RAISE EXCEPTION 'VERIFY_475_CONTRACT_LIFECYCLE_INVALID:%', v_contract;
  END IF;

  v_result := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'PERU_FICHA_UPSERT',
    jsonb_build_object(
      'empleado_id', v_employee->>'id', 'apellido_paterno', 'Lovelace',
      'ocupacion_codigo', '2141', 'updated_by', v_other_actor
    ),
    'verify475-peru-ficha'
  );
  IF (v_result->>'updated_by')::uuid <> v_actor THEN
    RAISE EXCEPTION 'VERIFY_475_FICHA_ACTOR_SPOOFED:%', v_result;
  END IF;

  INSERT INTO public.planillas (
    id, tenant_id, periodo, pais_codigo, moneda, estado, estado_pago
  ) VALUES (
    v_payroll, v_tenant, '2026-08', 'PE', 'PEN', 'borrador', 'pendiente'
  );
  INSERT INTO public.empleado_planilla (
    id, tenant_id, id_empleado, empleado_id, id_planilla, planilla_id,
    dias_trabajados, estado, estado_pago
  ) VALUES (
    v_payroll_detail, v_tenant, v_employee->>'id', (v_employee->>'id')::uuid,
    v_payroll::text, v_payroll, 30, 'ACTIVO', 'pendiente'
  );
  v_result := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'PERU_JORNADA_UPDATE',
    jsonb_build_object(
      'detalle_id', v_payroll_detail, 'horas_ordinarias', 176.25,
      'dias_no_laborados', 2
    ),
    'verify475-peru-jornada'
  );
  IF v_result#>>'{metadata,plame_jornada_fuente}' <> 'MANUAL_CONTADOR'
     OR (v_result#>>'{metadata,plame_jornada_actualizada_por}')::uuid <> v_actor THEN
    RAISE EXCEPTION 'VERIFY_475_PERU_JORNADA_AUDIT_INVALID:%', v_result;
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_actor, 'PERU_JORNADA_UPDATE',
      jsonb_build_object('detalle_id', v_payroll_detail, 'dias_no_laborados', 0),
      'verify475-peru-jornada-missing-hours'
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_475_PERU_JORNADA_INCOMPLETE_ACCEPTED'; END IF;

  -- Configuración país: sólo el país correcto, secretos fuera de respuesta/audit.
  v_failed := false;
  BEGIN
    PERFORM public.ejecutar_operacion_rrhh_tx(
      v_tenant, v_actor, 'CONFIG_AR_UPDATE',
      '{"art_tasa":0.03}'::jsonb, 'verify475-config-country-mismatch'
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'VERIFY_475_CONFIG_COUNTRY_MISMATCH_ACCEPTED'; END IF;

  v_result := public.ejecutar_operacion_rrhh_tx(
    (v_demo_ar->>'tenant_id')::uuid, (v_demo_ar->>'user_id')::uuid,
    'CONFIG_AR_UPDATE',
    jsonb_build_object(
      'convenio_colectivo_codigo', '130/75', 'art_tasa', 0.03,
      'configuracion_confirmada', true
    ),
    'verify475-config-ar'
  );
  v_ar_employee := public.ejecutar_operacion_rrhh_tx(
    (v_demo_ar->>'tenant_id')::uuid, (v_demo_ar->>'user_id')::uuid,
    'EMPLOYEE_CREATE',
    jsonb_build_object(
      'nombres', 'Eva', 'apellidos', 'Argentina',
      'tipo_documento', 'CUIL', 'numero_documento', '20329642330'
    ),
    'verify475-employee-ar'
  );
  v_result := public.ejecutar_operacion_rrhh_tx(
    (v_demo_ar->>'tenant_id')::uuid, (v_demo_ar->>'user_id')::uuid,
    'CONTRACT_CREATE',
    jsonb_build_object(
      'empleado_id', v_ar_employee->>'id', 'tipo_contrato', 'plazo_fijo',
      'fecha_inicio', '2026-08-01', 'fecha_fin', '2027-08-01',
      'sueldo_bruto', 1000000, 'salario', 1000000,
      'moneda', 'ARS', 'regimen_pensionario', 'SIN_REGIMEN'
    ),
    'verify475-contract-ar'
  );

  v_result := public.ejecutar_operacion_rrhh_tx(
    (v_demo_co->>'tenant_id')::uuid, (v_demo_co->>'user_id')::uuid,
    'CONFIG_CO_UPDATE',
    jsonb_build_object(
      'operador_pila', 'OPERADOR_LOCAL', 'eps_default', 'EPS475',
      'fondo_pension_default', 'AFP475', 'arl_default', 'ARL475',
      'caja_compensacion_default', 'CCF475', 'arl_tasa', 0.00522,
      'pila_api_token', 'ciphertext-local-475',
      'nomina_software_pin', 'ciphertext-pin-475'
    ),
    'verify475-config-co'
  );
  IF v_result ? 'pila_api_token' OR v_result ? 'nomina_software_pin' THEN
    RAISE EXCEPTION 'VERIFY_475_CO_SECRET_RETURNED:%', v_result;
  END IF;
  PERFORM public.ejecutar_operacion_rrhh_tx(
    (v_demo_co->>'tenant_id')::uuid, (v_demo_co->>'user_id')::uuid,
    'PILA_TEST_RESULT', '{"estado":"CONFIGURADA"}'::jsonb,
    'verify475-pila-result'
  );
  v_co_employee := public.ejecutar_operacion_rrhh_tx(
    (v_demo_co->>'tenant_id')::uuid, (v_demo_co->>'user_id')::uuid,
    'EMPLOYEE_CREATE',
    jsonb_build_object(
      'nombres', 'Eva', 'apellidos', 'Colombia',
      'tipo_documento', 'CC', 'numero_documento', '47500003'
    ),
    'verify475-employee-co'
  );
  v_result := public.ejecutar_operacion_rrhh_tx(
    (v_demo_co->>'tenant_id')::uuid, (v_demo_co->>'user_id')::uuid,
    'CONTRACT_CREATE',
    jsonb_build_object(
      'empleado_id', v_co_employee->>'id', 'tipo_contrato', 'obra_labor',
      'fecha_inicio', '2026-08-01', 'sueldo_bruto', 3000000,
      'salario', 3000000, 'moneda', 'COP',
      'regimen_pensionario', 'PENSION_COLOMBIA'
    ),
    'verify475-contract-co'
  );

  IF EXISTS (
    SELECT 1
    FROM public.audit_log a
    WHERE a.metadata->>'source' = 'rrhh_operational_475'
      AND (
        COALESCE(a.old_values, '{}'::jsonb) ?| ARRAY['pila_api_token','nomina_software_pin']
        OR COALESCE(a.new_values, '{}'::jsonb) ?| ARRAY['pila_api_token','nomina_software_pin']
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.rrhh_operaciones_475 o
    WHERE o.response ?| ARRAY['pila_api_token','nomina_software_pin']
  ) THEN
    RAISE EXCEPTION 'VERIFY_475_SECRET_LEAK_IN_DURABLE_EVIDENCE';
  END IF;

  v_result := public.ejecutar_operacion_rrhh_tx(
    v_tenant, v_actor, 'EMPLOYEE_DEACTIVATE',
    jsonb_build_object('id', v_employee->>'id'),
    'verify475-employee-deactivate'
  );
  IF COALESCE((v_result->>'activo')::boolean, true)
     OR lower(v_result->>'estado') <> 'inactivo' THEN
    RAISE EXCEPTION 'VERIFY_475_EMPLOYEE_DEACTIVATE_INVALID:%', v_result;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rrhh_operaciones_475
    WHERE completed_at IS NULL OR response IS NULL
  ) THEN
    RAISE EXCEPTION 'VERIFY_475_INCOMPLETE_INTENT';
  END IF;
  IF (SELECT count(*) FROM public.audit_log
      WHERE metadata->>'source' = 'rrhh_operational_475') < 25 THEN
    RAISE EXCEPTION 'VERIFY_475_AUDIT_COVERAGE_TOO_LOW';
  END IF;
END;
$verify$;

ROLLBACK;

\echo 'VERIFY_475_OK: RRHH operativo atomico, aislado, idempotente y auditado'
