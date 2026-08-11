-- RRHH operativo: una sola frontera transaccional para los writers que no
-- pertenecen a planilla (445) ni a liquidaciones/CTS (449).
-- La API conserva sus rutas, pero ninguna de ellas escribe tablas de dominio
-- directamente después de esta migración.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public, app, extensions, pg_temp;

CREATE TABLE IF NOT EXISTS public.rrhh_operaciones_475 (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  operacion text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  entidad_id uuid,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ck_rrhh_operaciones_key_475 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 200
  ),
  CONSTRAINT ck_rrhh_operaciones_name_475 CHECK (
    operacion = upper(btrim(operacion)) AND length(operacion) BETWEEN 3 AND 80
  ),
  CONSTRAINT ux_rrhh_operaciones_475 UNIQUE (tenant_id, operacion, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_rrhh_operaciones_tenant_475
  ON public.rrhh_operaciones_475 (tenant_id, created_at DESC);

ALTER TABLE public.rrhh_operaciones_475 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrhh_operaciones_475 FORCE ROW LEVEL SECURITY;

-- Los tipos contractuales ya usados por la UI AR/CO no estaban admitidos por
-- el constraint peruano heredado. Se conserva el vocabulario existente y se
-- amplía, sin introducir una segunda tabla de contratos.
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS ck_contratos_tipo_runtime;
ALTER TABLE public.contratos
  ADD CONSTRAINT ck_contratos_tipo_runtime CHECK (
    tipo_contrato = ANY (ARRAY[
      'indefinido','temporal','practicas','locacion_servicios','part_time',
      'por_horas','servicios','plazo_fijo','temporada','eventual','fijo',
      'obra_labor','prestacion_servicios'
    ]::text[])
  ) NOT VALID;
ALTER TABLE public.contratos VALIDATE CONSTRAINT ck_contratos_tipo_runtime;

ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS ck_contratos_regimen_runtime;
ALTER TABLE public.contratos
  ADD CONSTRAINT ck_contratos_regimen_runtime CHECK (
    regimen_pensionario = ANY (ARRAY[
      'AFP','ONP','MIXTO','SIN_REGIMEN','PENSION_COLOMBIA'
    ]::text[])
  ) NOT VALID;
ALTER TABLE public.contratos VALIDATE CONSTRAINT ck_contratos_regimen_runtime;

CREATE OR REPLACE FUNCTION app.rrhh_fingerprint_475(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(
    extensions.digest(
      convert_to(COALESCE(p_payload, '{}'::jsonb)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$function$;

CREATE OR REPLACE FUNCTION app.rrhh_pick_475(p_payload jsonb, p_allowed text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT COALESCE(jsonb_object_agg(e.key, e.value ORDER BY e.key), '{}'::jsonb)
  FROM jsonb_each(COALESCE(p_payload, '{}'::jsonb)) e
  WHERE e.key = ANY(COALESCE(p_allowed, '{}'::text[]))
$function$;

CREATE OR REPLACE FUNCTION app.assert_rrhh_actor_475(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_super boolean;
BEGIN
  SELECT COALESCE(u.is_super_admin, false)
  INTO v_super
  FROM public.usuarios_sistema u
  WHERE u.id = p_actor_id
    AND u.tenant_id = p_tenant_id
    AND COALESCE(u.activo, false)
    AND lower(COALESCE(u.estado::text, '')) = 'activo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RRHH_ACTOR_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '42501';
  END IF;
  IF v_super THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.id = ur.role_id
     AND r.tenant_id = p_tenant_id
     AND COALESCE(r.activo, true)
    JOIN public.rol_permisos rp
      ON rp.role_id = r.id
     AND COALESCE(rp.concedido, true)
    JOIN public.permisos p
      ON p.id = rp.permiso_id
     AND p.tenant_id = p_tenant_id
     AND COALESCE(p.activo, true)
    WHERE ur.usuario_sistema_id = p_actor_id
      AND ur.tenant_id = p_tenant_id
      AND lower(COALESCE(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion))
          = 'rrhh.access'
  ) THEN
    RAISE EXCEPTION 'RRHH_PERMISSION_REQUIRED: rrhh.access' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.audit_rrhh_475(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_table_name text,
  p_operation text,
  p_record_id uuid,
  p_old jsonb,
  p_new jsonb,
  p_action text,
  p_operation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_old jsonb := COALESCE(p_old, '{}'::jsonb) - ARRAY['pila_api_token','nomina_software_pin'];
  v_new jsonb := COALESCE(p_new, '{}'::jsonb) - ARRAY['pila_api_token','nomina_software_pin'];
BEGIN
  INSERT INTO public.audit_log (
    tenant_id, user_id, table_name, operation, record_id,
    old_values, new_values, changed_fields, metadata
  ) VALUES (
    p_tenant_id, p_actor_id, p_table_name, upper(p_operation), p_record_id::text,
    CASE WHEN p_old IS NULL THEN NULL ELSE v_old END,
    CASE WHEN p_new IS NULL THEN NULL ELSE v_new END,
    CASE WHEN upper(p_operation) = 'UPDATE' THEN (
      SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb)
      FROM (
        SELECT key AS k FROM jsonb_each(v_old)
        UNION
        SELECT key AS k FROM jsonb_each(v_new)
      ) keys
      WHERE v_old->k IS DISTINCT FROM v_new->k
    ) ELSE NULL END,
    jsonb_build_object(
      'accion', p_action,
      'source', 'rrhh_operational_475',
      'operation_id', p_operation_id
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ejecutar_operacion_rrhh_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_operacion text,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_op text := upper(btrim(COALESCE(p_operacion, '')));
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_input jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_clean jsonb;
  v_fp text;
  v_intent public.rrhh_operaciones_475%ROWTYPE;
  v_response jsonb;
  v_id uuid;
  v_ref_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_country text;
  v_date date;
  v_start time;
  v_end time;
  v_months integer;
  v_emp public.empleados%ROWTYPE;
  v_candidate public.candidatos%ROWTYPE;
  v_eval public.evaluaciones%ROWTYPE;
  v_contract public.contratos%ROWTYPE;
  v_config_ar public.rrhh_configuracion_argentina%ROWTYPE;
  v_config_co public.rrhh_configuracion_colombia%ROWTYPE;
  v_ficha public.rrhh_peru_fichas_laborales%ROWTYPE;
  v_schedule_row record;
BEGIN
  PERFORM app.assert_rrhh_actor_475(p_tenant_id, p_actor_id);
  IF length(v_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'RRHH_IDEMPOTENCY_KEY_INVALID' USING ERRCODE = '23514';
  END IF;
  IF v_op NOT IN (
    'CONFIG_AR_UPDATE','CONFIG_CO_UPDATE','PILA_TEST_RESULT',
    'EMPLOYEE_CREATE','EMPLOYEE_UPDATE','EMPLOYEE_DEACTIVATE','DEPARTMENT_CREATE',
    'VACANCY_CREATE','CANDIDATE_CREATE','CANDIDATE_UPDATE','CANDIDATE_STATUS',
    'ATTENDANCE_MARK','ATTENDANCE_ABSENCE_MARK','REQUEST_CREATE','REQUEST_DECIDE','BENEFIT_ASSIGN',
    'EVALUATION_CREATE','EVALUATION_UPDATE','TRAINING_ENROLL','SCHEDULE_ASSIGN',
    'FILE_ADD','CONTRACT_CREATE','CONTRACT_RENEW','CONTRACT_FINALIZE',
    'PERU_FICHA_UPSERT','PERU_JORNADA_UPDATE'
  ) THEN
    RAISE EXCEPTION 'RRHH_OPERATION_UNSUPPORTED: %', v_op USING ERRCODE = '22023';
  END IF;

  v_fp := app.rrhh_fingerprint_475(jsonb_build_object(
    'operacion', v_op,
    'payload', v_input
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':rrhh:intent:' || v_op || ':' || v_key,
    475
  ));

  SELECT * INTO v_intent
  FROM public.rrhh_operaciones_475 o
  WHERE o.tenant_id = p_tenant_id
    AND o.operacion = v_op
    AND o.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_intent.actor_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'RRHH_IDEMPOTENCY_KEY_DIFFERENT_ACTOR' USING ERRCODE = '23505';
    END IF;
    IF v_intent.fingerprint IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION 'RRHH_IDEMPOTENCY_KEY_DIFFERENT_PAYLOAD' USING ERRCODE = '23505';
    END IF;
    IF v_intent.response IS NULL THEN
      RAISE EXCEPTION 'RRHH_OPERATION_INCOMPLETE' USING ERRCODE = '40001';
    END IF;
    RETURN v_intent.response;
  END IF;

  INSERT INTO public.rrhh_operaciones_475 (
    tenant_id, actor_id, operacion, idempotency_key, fingerprint
  ) VALUES (
    p_tenant_id, p_actor_id, v_op, v_key, v_fp
  ) RETURNING * INTO v_intent;

  SELECT upper(COALESCE(ec.pais, t.pais, 'PE'))
  INTO v_country
  FROM public.tenants t
  LEFT JOIN public.empresa_config ec ON ec.tenant_id = t.id
  WHERE t.id = p_tenant_id;
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'RRHH_TENANT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  IF v_op = 'CONFIG_AR_UPDATE' THEN
    IF v_country <> 'AR' THEN
      RAISE EXCEPTION 'RRHH_CONFIGURATION_COUNTRY_MISMATCH' USING ERRCODE = '23514';
    END IF;
    v_clean := app.rrhh_pick_475(v_input, ARRAY[
      'tipo_empleador','jurisdiccion_laboral','actividad_codigo',
      'convenio_colectivo_codigo','convenio_colectivo_descripcion','categoria_default',
      'art_cuit','art_razon_social','art_tasa','obra_social_codigo_default',
      'sindicato_codigo_default','sindicato_aporte_default','contribucion_patronal',
      'seguro_vida_monto','periodo_prueba_max_meses','sistema_indemnizacion',
      'libro_sueldos_digital_habilitado','simplificacion_registral_habilitada',
      'formulario_931_habilitado','siradig_habilitado','configuracion_confirmada','metadata'
    ]);
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':rrhh:config:AR', 475));
    SELECT c.* INTO v_config_ar
    FROM public.rrhh_configuracion_argentina c
    WHERE c.tenant_id = p_tenant_id FOR UPDATE;
    IF FOUND THEN
      v_old := to_jsonb(v_config_ar);
      v_config_ar := jsonb_populate_record(v_config_ar, v_clean || jsonb_build_object('updated_at', now()));
      UPDATE public.rrhh_configuracion_argentina SET
        tipo_empleador=v_config_ar.tipo_empleador,
        jurisdiccion_laboral=v_config_ar.jurisdiccion_laboral,
        actividad_codigo=v_config_ar.actividad_codigo,
        convenio_colectivo_codigo=v_config_ar.convenio_colectivo_codigo,
        convenio_colectivo_descripcion=v_config_ar.convenio_colectivo_descripcion,
        categoria_default=v_config_ar.categoria_default,
        art_cuit=v_config_ar.art_cuit,
        art_razon_social=v_config_ar.art_razon_social,
        art_tasa=v_config_ar.art_tasa,
        obra_social_codigo_default=v_config_ar.obra_social_codigo_default,
        sindicato_codigo_default=v_config_ar.sindicato_codigo_default,
        sindicato_aporte_default=v_config_ar.sindicato_aporte_default,
        contribucion_patronal=v_config_ar.contribucion_patronal,
        seguro_vida_monto=v_config_ar.seguro_vida_monto,
        periodo_prueba_max_meses=v_config_ar.periodo_prueba_max_meses,
        sistema_indemnizacion=v_config_ar.sistema_indemnizacion,
        libro_sueldos_digital_habilitado=v_config_ar.libro_sueldos_digital_habilitado,
        simplificacion_registral_habilitada=v_config_ar.simplificacion_registral_habilitada,
        formulario_931_habilitado=v_config_ar.formulario_931_habilitado,
        siradig_habilitado=v_config_ar.siradig_habilitado,
        configuracion_confirmada=v_config_ar.configuracion_confirmada,
        metadata=v_config_ar.metadata,
        updated_at=now()
      WHERE tenant_id=p_tenant_id
      RETURNING to_jsonb(rrhh_configuracion_argentina.*), id
      INTO v_new, v_id;
    ELSE
      v_config_ar := jsonb_populate_record(NULL::public.rrhh_configuracion_argentina,
        jsonb_build_object(
          'id', extensions.gen_random_uuid(), 'tenant_id', p_tenant_id,
          'tipo_empleador','GENERAL','jurisdiccion_laboral','NACIONAL','art_tasa',0,
          'sindicato_aporte_default',0,'contribucion_patronal',0.18,
          'seguro_vida_monto',0,'periodo_prueba_max_meses',6,
          'sistema_indemnizacion','LCT_245','libro_sueldos_digital_habilitado',true,
          'simplificacion_registral_habilitada',true,'formulario_931_habilitado',true,
          'siradig_habilitado',true,'configuracion_confirmada',false,
          'metadata','{}'::jsonb,'created_at',now(),'updated_at',now()
        ) || v_clean);
      INSERT INTO public.rrhh_configuracion_argentina SELECT v_config_ar.*
      RETURNING to_jsonb(rrhh_configuracion_argentina.*), id INTO v_new, v_id;
    END IF;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'rrhh_configuracion_argentina',
      CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,v_id,v_old,v_new,v_op,v_intent.id);
    v_response := v_new;

  ELSIF v_op = 'CONFIG_CO_UPDATE' THEN
    IF v_country <> 'CO' THEN
      RAISE EXCEPTION 'RRHH_CONFIGURATION_COUNTRY_MISMATCH' USING ERRCODE = '23514';
    END IF;
    v_clean := app.rrhh_pick_475(v_input, ARRAY[
      'tipo_aportante','actividad_economica_ciiu','operador_pila','pila_integracion_modo',
      'pila_operador_codigo','pila_api_url','pila_api_usuario','pila_api_token',
      'eps_default','fondo_pension_default','arl_default','arl_clase_riesgo','arl_tasa',
      'caja_compensacion_default','sena_habilitado','icbf_habilitado',
      'exonerado_salud_sena_icbf','nomina_electronica_habilitada','nomina_software_id',
      'nomina_software_pin','nomina_test_set_id','pila_habilitada','salario_minimo',
      'auxilio_transporte','configuracion_confirmada','metadata'
    ]);
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':rrhh:config:CO', 475));
    SELECT c.* INTO v_config_co
    FROM public.rrhh_configuracion_colombia c
    WHERE c.tenant_id = p_tenant_id FOR UPDATE;
    IF FOUND THEN
      v_old := to_jsonb(v_config_co);
      v_config_co := jsonb_populate_record(v_config_co, v_clean || jsonb_build_object('updated_at', now()));
      UPDATE public.rrhh_configuracion_colombia SET
        tipo_aportante=v_config_co.tipo_aportante,
        actividad_economica_ciiu=v_config_co.actividad_economica_ciiu,
        operador_pila=v_config_co.operador_pila,
        pila_integracion_modo=v_config_co.pila_integracion_modo,
        pila_operador_codigo=v_config_co.pila_operador_codigo,
        pila_api_url=v_config_co.pila_api_url,
        pila_api_usuario=v_config_co.pila_api_usuario,
        pila_api_token=v_config_co.pila_api_token,
        eps_default=v_config_co.eps_default,
        fondo_pension_default=v_config_co.fondo_pension_default,
        arl_default=v_config_co.arl_default,
        arl_clase_riesgo=v_config_co.arl_clase_riesgo,
        arl_tasa=v_config_co.arl_tasa,
        caja_compensacion_default=v_config_co.caja_compensacion_default,
        sena_habilitado=v_config_co.sena_habilitado,
        icbf_habilitado=v_config_co.icbf_habilitado,
        exonerado_salud_sena_icbf=v_config_co.exonerado_salud_sena_icbf,
        nomina_electronica_habilitada=v_config_co.nomina_electronica_habilitada,
        nomina_software_id=v_config_co.nomina_software_id,
        nomina_software_pin=v_config_co.nomina_software_pin,
        nomina_test_set_id=v_config_co.nomina_test_set_id,
        pila_habilitada=v_config_co.pila_habilitada,
        salario_minimo=v_config_co.salario_minimo,
        auxilio_transporte=v_config_co.auxilio_transporte,
        configuracion_confirmada=v_config_co.configuracion_confirmada,
        metadata=v_config_co.metadata,
        updated_at=now()
      WHERE tenant_id=p_tenant_id
      RETURNING to_jsonb(rrhh_configuracion_colombia.*), id
      INTO v_new, v_id;
    ELSE
      v_config_co := jsonb_populate_record(NULL::public.rrhh_configuracion_colombia,
        jsonb_build_object(
          'id',extensions.gen_random_uuid(),'tenant_id',p_tenant_id,
          'tipo_aportante','EMPLEADOR','arl_clase_riesgo',1,'arl_tasa',0.00522,
          'sena_habilitado',true,'icbf_habilitado',true,
          'exonerado_salud_sena_icbf',false,'nomina_electronica_habilitada',true,
          'pila_habilitada',true,'salario_minimo',1750905,'auxilio_transporte',249095,
          'configuracion_confirmada',false,'metadata','{}'::jsonb,
          'pila_integracion_modo','ARCHIVO_OPERADOR','created_at',now(),'updated_at',now()
        ) || v_clean);
      INSERT INTO public.rrhh_configuracion_colombia SELECT v_config_co.*
      RETURNING to_jsonb(rrhh_configuracion_colombia.*), id INTO v_new, v_id;
    END IF;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'rrhh_configuracion_colombia',
      CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,v_id,v_old,v_new,v_op,v_intent.id);
    -- Nunca retornar los secretos cifrados a la API.
    v_response := v_new - ARRAY['pila_api_token','nomina_software_pin'];

  ELSIF v_op = 'PILA_TEST_RESULT' THEN
    IF v_country <> 'CO' OR upper(COALESCE(v_input->>'estado','')) NOT IN
      ('SIMULADA','CONFIGURADA','INCOMPLETA','ERROR') THEN
      RAISE EXCEPTION 'RRHH_PILA_TEST_RESULT_INVALID' USING ERRCODE = '23514';
    END IF;
    SELECT to_jsonb(c), c.id INTO v_old, v_id
    FROM public.rrhh_configuracion_colombia c
    WHERE c.tenant_id=p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RRHH_CO_CONFIGURATION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.rrhh_configuracion_colombia
    SET pila_ultima_prueba_at=now(),
        pila_ultima_prueba_estado=upper(v_input->>'estado'),
        updated_at=now()
    WHERE id=v_id AND tenant_id=p_tenant_id
    RETURNING to_jsonb(rrhh_configuracion_colombia.*) INTO v_new;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'rrhh_configuracion_colombia',
      'UPDATE',v_id,v_old,v_new,v_op,v_intent.id);
    v_response := v_new - ARRAY['pila_api_token','nomina_software_pin'];

  ELSIF v_op = 'EMPLOYEE_CREATE' THEN
    v_clean := app.rrhh_pick_475(v_input, ARRAY[
      'nombres','apellidos','tipo_documento','numero_documento','email','telefono',
      'direccion','fecha_nacimiento','fecha_ingreso','id_departamento','puesto','estado',
      'genero','estado_civil','nacionalidad','ubigeo','tiene_hijos','cantidad_hijos',
      'asignacion_familiar','cuenta_bancaria','banco','tipo_cuenta','contacto_emergencia',
      'telefono_emergencia','foto_url','cuil','obra_social_codigo','sindicato_codigo',
      'eps_codigo','fondo_pension_codigo','arl_codigo','caja_compensacion_codigo',
      'situacion_revista_codigo','modalidad_contratacion_codigo','condicion_codigo',
      'actividad_codigo','zona_codigo','metadata'
    ]);
    IF NULLIF(btrim(v_clean->>'nombres'),'') IS NULL
       OR NULLIF(btrim(v_clean->>'apellidos'),'') IS NULL
       OR NULLIF(btrim(v_clean->>'numero_documento'),'') IS NULL THEN
      RAISE EXCEPTION 'RRHH_EMPLOYEE_REQUIRED_FIELDS' USING ERRCODE = '23514';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_tenant_id::text || ':rrhh:employee-document:' || lower(btrim(v_clean->>'numero_documento')),475));
    IF EXISTS (SELECT 1 FROM public.empleados e WHERE e.tenant_id=p_tenant_id
      AND lower(btrim(e.numero_documento))=lower(btrim(v_clean->>'numero_documento'))) THEN
      RAISE EXCEPTION 'RRHH_EMPLOYEE_DOCUMENT_DUPLICATE' USING ERRCODE = '23505';
    END IF;
    IF v_clean ? 'id_departamento' AND v_clean->>'id_departamento' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.departamentos d WHERE d.id=(v_clean->>'id_departamento')::uuid
         AND d.tenant_id=p_tenant_id AND COALESCE(d.activo,true)) THEN
      RAISE EXCEPTION 'RRHH_DEPARTMENT_INVALID_OR_CROSS_TENANT' USING ERRCODE = '23503';
    END IF;
    v_emp := jsonb_populate_record(NULL::public.empleados,
      jsonb_build_object(
        'id',extensions.gen_random_uuid(),'tenant_id',p_tenant_id,
        'estado','activo','activo',true,'metadata','{}'::jsonb,
        'tiene_hijos',false,'cantidad_hijos',0,'asignacion_familiar',false,
        'familiares','[]'::jsonb,'created_at',now(),'updated_at',now()
      ) || v_clean);
    IF lower(v_emp.estado::text) = 'activo' THEN v_emp.activo := true;
    ELSIF lower(v_emp.estado::text) IN ('inactivo','cesado') THEN v_emp.activo := false;
    END IF;
    INSERT INTO public.empleados (
      id,tenant_id,estado,metadata,created_at,updated_at,activo,apellidos,email,
      fecha_ingreso,fecha_nacimiento,id_departamento,nombres,numero_documento,puesto,
      telefono,tipo_documento,direccion,genero,estado_civil,nacionalidad,ubigeo,
      tiene_hijos,cantidad_hijos,asignacion_familiar,cuenta_bancaria,banco,tipo_cuenta,
      contacto_emergencia,telefono_emergencia,foto_url,familiares,cuil,
      obra_social_codigo,sindicato_codigo,situacion_revista_codigo,
      modalidad_contratacion_codigo,condicion_codigo,actividad_codigo,zona_codigo,
      eps_codigo,fondo_pension_codigo,arl_codigo,caja_compensacion_codigo
    ) VALUES (
      v_emp.id,v_emp.tenant_id,v_emp.estado,v_emp.metadata,v_emp.created_at,v_emp.updated_at,
      v_emp.activo,v_emp.apellidos,v_emp.email,v_emp.fecha_ingreso,v_emp.fecha_nacimiento,
      v_emp.id_departamento,v_emp.nombres,v_emp.numero_documento,v_emp.puesto,v_emp.telefono,
      v_emp.tipo_documento,v_emp.direccion,v_emp.genero,v_emp.estado_civil,v_emp.nacionalidad,
      v_emp.ubigeo,v_emp.tiene_hijos,v_emp.cantidad_hijos,v_emp.asignacion_familiar,
      v_emp.cuenta_bancaria,v_emp.banco,v_emp.tipo_cuenta,v_emp.contacto_emergencia,
      v_emp.telefono_emergencia,v_emp.foto_url,v_emp.familiares,v_emp.cuil,
      v_emp.obra_social_codigo,v_emp.sindicato_codigo,v_emp.situacion_revista_codigo,
      v_emp.modalidad_contratacion_codigo,v_emp.condicion_codigo,v_emp.actividad_codigo,
      v_emp.zona_codigo,v_emp.eps_codigo,v_emp.fondo_pension_codigo,v_emp.arl_codigo,
      v_emp.caja_compensacion_codigo
    ) RETURNING to_jsonb(empleados.*), id INTO v_new,v_id;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'empleados','INSERT',v_id,NULL,v_new,v_op,v_intent.id);
    v_response := v_new;

  ELSIF v_op IN ('EMPLOYEE_UPDATE','EMPLOYEE_DEACTIVATE') THEN
    v_id := NULLIF(v_input->>'id','')::uuid;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':rrhh:employee:' || v_id::text,475));
    SELECT e.* INTO v_emp FROM public.empleados e
    WHERE e.id=v_id AND e.tenant_id=p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RRHH_EMPLOYEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    v_old := to_jsonb(v_emp);
    IF v_op='EMPLOYEE_DEACTIVATE' THEN
      v_clean := jsonb_build_object('estado','inactivo','activo',false);
    ELSE
      v_clean := app.rrhh_pick_475(v_input - 'id', ARRAY[
        'nombres','apellidos','tipo_documento','numero_documento','email','telefono',
        'direccion','fecha_nacimiento','fecha_ingreso','id_departamento','puesto','estado',
        'genero','estado_civil','nacionalidad','ubigeo','tiene_hijos','cantidad_hijos',
        'asignacion_familiar','cuenta_bancaria','banco','tipo_cuenta','contacto_emergencia',
        'telefono_emergencia','foto_url','cuil','obra_social_codigo','sindicato_codigo',
        'eps_codigo','fondo_pension_codigo','arl_codigo','caja_compensacion_codigo',
        'situacion_revista_codigo','modalidad_contratacion_codigo','condicion_codigo',
        'actividad_codigo','zona_codigo','metadata'
      ]);
    END IF;
    IF v_clean ? 'numero_documento' AND EXISTS (
      SELECT 1 FROM public.empleados e WHERE e.tenant_id=p_tenant_id AND e.id<>v_id
        AND lower(btrim(e.numero_documento))=lower(btrim(v_clean->>'numero_documento'))
    ) THEN RAISE EXCEPTION 'RRHH_EMPLOYEE_DOCUMENT_DUPLICATE' USING ERRCODE='23505'; END IF;
    IF v_clean ? 'id_departamento' AND v_clean->>'id_departamento' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.departamentos d WHERE d.id=(v_clean->>'id_departamento')::uuid
         AND d.tenant_id=p_tenant_id AND COALESCE(d.activo,true)) THEN
      RAISE EXCEPTION 'RRHH_DEPARTMENT_INVALID_OR_CROSS_TENANT' USING ERRCODE='23503';
    END IF;
    v_emp := jsonb_populate_record(v_emp,v_clean || jsonb_build_object('updated_at',now()));
    IF lower(v_emp.estado::text)='activo' THEN v_emp.activo:=true;
    ELSIF lower(v_emp.estado::text) IN ('inactivo','cesado') THEN v_emp.activo:=false; END IF;
    UPDATE public.empleados SET
      estado=v_emp.estado,metadata=v_emp.metadata,updated_at=now(),activo=v_emp.activo,
      apellidos=v_emp.apellidos,email=v_emp.email,fecha_ingreso=v_emp.fecha_ingreso,
      fecha_nacimiento=v_emp.fecha_nacimiento,id_departamento=v_emp.id_departamento,
      nombres=v_emp.nombres,numero_documento=v_emp.numero_documento,puesto=v_emp.puesto,
      telefono=v_emp.telefono,tipo_documento=v_emp.tipo_documento,direccion=v_emp.direccion,
      genero=v_emp.genero,estado_civil=v_emp.estado_civil,nacionalidad=v_emp.nacionalidad,
      ubigeo=v_emp.ubigeo,tiene_hijos=v_emp.tiene_hijos,cantidad_hijos=v_emp.cantidad_hijos,
      asignacion_familiar=v_emp.asignacion_familiar,cuenta_bancaria=v_emp.cuenta_bancaria,
      banco=v_emp.banco,tipo_cuenta=v_emp.tipo_cuenta,contacto_emergencia=v_emp.contacto_emergencia,
      telefono_emergencia=v_emp.telefono_emergencia,foto_url=v_emp.foto_url,cuil=v_emp.cuil,
      obra_social_codigo=v_emp.obra_social_codigo,sindicato_codigo=v_emp.sindicato_codigo,
      situacion_revista_codigo=v_emp.situacion_revista_codigo,
      modalidad_contratacion_codigo=v_emp.modalidad_contratacion_codigo,
      condicion_codigo=v_emp.condicion_codigo,actividad_codigo=v_emp.actividad_codigo,
      zona_codigo=v_emp.zona_codigo,eps_codigo=v_emp.eps_codigo,
      fondo_pension_codigo=v_emp.fondo_pension_codigo,arl_codigo=v_emp.arl_codigo,
      caja_compensacion_codigo=v_emp.caja_compensacion_codigo
    WHERE id=v_id AND tenant_id=p_tenant_id
    RETURNING to_jsonb(empleados.*) INTO v_new;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'empleados','UPDATE',v_id,v_old,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='DEPARTMENT_CREATE' THEN
    v_clean:=app.rrhh_pick_475(v_input,ARRAY['nombre','codigo','descripcion','responsable_id','estado','activo','metadata']);
    IF NULLIF(btrim(v_clean->>'nombre'),'') IS NULL THEN
      RAISE EXCEPTION 'RRHH_DEPARTMENT_NAME_REQUIRED' USING ERRCODE='23514';
    END IF;
    IF v_clean ? 'responsable_id' AND v_clean->>'responsable_id' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.empleados e WHERE e.id=(v_clean->>'responsable_id')::uuid
         AND e.tenant_id=p_tenant_id) THEN
      RAISE EXCEPTION 'RRHH_DEPARTMENT_MANAGER_INVALID' USING ERRCODE='23503';
    END IF;
    INSERT INTO public.departamentos(tenant_id,nombre,codigo,descripcion,responsable_id,estado,activo,metadata)
    VALUES(p_tenant_id,v_clean->>'nombre',NULLIF(v_clean->>'codigo',''),NULLIF(v_clean->>'descripcion',''),
      NULLIF(v_clean->>'responsable_id','')::uuid,COALESCE(v_clean->>'estado','activo'),
      COALESCE((v_clean->>'activo')::boolean,true),COALESCE(v_clean->'metadata','{}'::jsonb))
    RETURNING to_jsonb(departamentos.*),id INTO v_new,v_id;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'departamentos','INSERT',v_id,NULL,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='VACANCY_CREATE' THEN
    v_clean:=app.rrhh_pick_475(v_input,ARRAY[
      'titulo','descripcion','puesto_solicitado','departamento_id','departamento','ubicacion',
      'tipo_contrato','salario_minimo','salario_maximo','salario_min','salario_max',
      'experiencia_requerida','requisitos','beneficios','fecha_limite','fecha_publicacion',
      'fecha_cierre','estado','activo','metadata'
    ]);
    IF NULLIF(btrim(v_clean->>'titulo'),'') IS NULL OR NULLIF(btrim(v_clean->>'puesto_solicitado'),'') IS NULL THEN
      RAISE EXCEPTION 'RRHH_VACANCY_REQUIRED_FIELDS' USING ERRCODE='23514';
    END IF;
    IF v_clean ? 'departamento_id' AND v_clean->>'departamento_id' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.departamentos d WHERE d.id=(v_clean->>'departamento_id')::uuid
         AND d.tenant_id=p_tenant_id AND COALESCE(d.activo,true)) THEN
      RAISE EXCEPTION 'RRHH_VACANCY_DEPARTMENT_INVALID' USING ERRCODE='23503';
    END IF;
    INSERT INTO public.vacantes(
      tenant_id,titulo,descripcion,puesto_solicitado,departamento_id,departamento,ubicacion,
      tipo_contrato,salario_minimo,salario_maximo,salario_min,salario_max,
      experiencia_requerida,requisitos,beneficios,fecha_limite,fecha_publicacion,fecha_cierre,
      estado,activo,metadata
    ) VALUES(
      p_tenant_id,v_clean->>'titulo',v_clean->>'descripcion',v_clean->>'puesto_solicitado',
      NULLIF(v_clean->>'departamento_id','')::uuid,v_clean->>'departamento',v_clean->>'ubicacion',
      COALESCE(v_clean->>'tipo_contrato','tiempo_completo'),
      COALESCE(NULLIF(v_clean->>'salario_minimo','')::numeric,NULLIF(v_clean->>'salario_min','')::numeric,0),
      COALESCE(NULLIF(v_clean->>'salario_maximo','')::numeric,NULLIF(v_clean->>'salario_max','')::numeric,0),
      COALESCE(NULLIF(v_clean->>'salario_min','')::numeric,NULLIF(v_clean->>'salario_minimo','')::numeric,0),
      COALESCE(NULLIF(v_clean->>'salario_max','')::numeric,NULLIF(v_clean->>'salario_maximo','')::numeric,0),
      v_clean->>'experiencia_requerida',v_clean->>'requisitos',v_clean->>'beneficios',
      NULLIF(v_clean->>'fecha_limite','')::date,NULLIF(v_clean->>'fecha_publicacion','')::date,
      NULLIF(v_clean->>'fecha_cierre','')::date,COALESCE(v_clean->>'estado','activa'),
      COALESCE((v_clean->>'activo')::boolean,true),COALESCE(v_clean->'metadata','{}'::jsonb)
    ) RETURNING to_jsonb(vacantes.*),id INTO v_new,v_id;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'vacantes','INSERT',v_id,NULL,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op IN ('CANDIDATE_CREATE','CANDIDATE_UPDATE','CANDIDATE_STATUS') THEN
    IF v_op='CANDIDATE_CREATE' THEN
      v_clean:=app.rrhh_pick_475(v_input,ARRAY[
        'id_vacante','vacante_id','nombres','apellidos','email','telefono','numero_documento',
        'tipo_documento','fecha_nacimiento','direccion','nivel_educacion','experiencia_anos',
        'pretension_salarial','cv_url','linkedin_url','portfolio_url','idiomas',
        'habilidades_tecnicas','experiencia_laboral','formacion_academica','estado',
        'estado_proceso','puntuacion_cv','observaciones','disponibilidad_inmediata',
        'modalidad_trabajo_preferida','fecha_postulacion','activo','metadata'
      ]);
      IF NULLIF(btrim(v_clean->>'nombres'),'') IS NULL OR NULLIF(btrim(v_clean->>'apellidos'),'') IS NULL THEN
        RAISE EXCEPTION 'RRHH_CANDIDATE_REQUIRED_FIELDS' USING ERRCODE='23514';
      END IF;
      v_ref_id:=COALESCE(NULLIF(v_clean->>'id_vacante','')::uuid,NULLIF(v_clean->>'vacante_id','')::uuid);
      IF v_ref_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.vacantes v WHERE v.id=v_ref_id
        AND v.tenant_id=p_tenant_id) THEN
        RAISE EXCEPTION 'RRHH_CANDIDATE_VACANCY_INVALID' USING ERRCODE='23503';
      END IF;
      v_candidate:=jsonb_populate_record(NULL::public.candidatos,
        jsonb_build_object(
          'id',extensions.gen_random_uuid(),'tenant_id',p_tenant_id,'id_vacante',v_ref_id,
          'vacante_id',v_ref_id,'estado','postulante','metadata','{}'::jsonb,
          'created_at',now(),'updated_at',now(),'fecha_postulacion',now(),
          'experiencia_anos',0,'pretension_salarial',0,'idiomas','[]'::jsonb,
          'habilidades_tecnicas','[]'::jsonb,'experiencia_laboral','[]'::jsonb,
          'formacion_academica','[]'::jsonb,'puntuacion_cv',0,
          'disponibilidad_inmediata',true,'activo',true
        ) || v_clean || jsonb_build_object('id_vacante',v_ref_id,'vacante_id',v_ref_id));
      INSERT INTO public.candidatos(
        id,tenant_id,estado,metadata,created_at,updated_at,fecha_postulacion,id_vacante,
        vacante_id,nombres,apellidos,email,telefono,numero_documento,tipo_documento,
        fecha_nacimiento,direccion,nivel_educacion,experiencia_anos,pretension_salarial,
        cv_url,linkedin_url,portfolio_url,idiomas,habilidades_tecnicas,experiencia_laboral,
        formacion_academica,estado_proceso,puntuacion_cv,observaciones,
        disponibilidad_inmediata,modalidad_trabajo_preferida,activo
      ) VALUES(
        v_candidate.id,v_candidate.tenant_id,v_candidate.estado,v_candidate.metadata,
        v_candidate.created_at,v_candidate.updated_at,v_candidate.fecha_postulacion,
        v_candidate.id_vacante,v_candidate.vacante_id,v_candidate.nombres,v_candidate.apellidos,
        v_candidate.email,v_candidate.telefono,v_candidate.numero_documento,
        v_candidate.tipo_documento,v_candidate.fecha_nacimiento,v_candidate.direccion,
        v_candidate.nivel_educacion,v_candidate.experiencia_anos,v_candidate.pretension_salarial,
        v_candidate.cv_url,v_candidate.linkedin_url,v_candidate.portfolio_url,
        v_candidate.idiomas,v_candidate.habilidades_tecnicas,v_candidate.experiencia_laboral,
        v_candidate.formacion_academica,v_candidate.estado_proceso,v_candidate.puntuacion_cv,
        v_candidate.observaciones,v_candidate.disponibilidad_inmediata,
        v_candidate.modalidad_trabajo_preferida,v_candidate.activo
      ) RETURNING to_jsonb(candidatos.*),id INTO v_new,v_id;
      v_old:=NULL;
    ELSE
      v_id:=NULLIF(v_input->>'id','')::uuid;
      SELECT c.* INTO v_candidate FROM public.candidatos c
      WHERE c.id=v_id AND c.tenant_id=p_tenant_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'RRHH_CANDIDATE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      v_old := to_jsonb(v_candidate);
      IF v_op='CANDIDATE_STATUS' THEN
        v_clean:=app.rrhh_pick_475(v_input,ARRAY['estado','observaciones']);
      ELSE
        v_clean:=app.rrhh_pick_475(v_input-'id',ARRAY[
          'id_vacante','vacante_id','nombres','apellidos','email','telefono','numero_documento',
          'tipo_documento','fecha_nacimiento','direccion','nivel_educacion','experiencia_anos',
          'pretension_salarial','cv_url','linkedin_url','portfolio_url','idiomas',
          'habilidades_tecnicas','experiencia_laboral','formacion_academica','estado',
          'estado_proceso','puntuacion_cv','observaciones','disponibilidad_inmediata',
          'modalidad_trabajo_preferida','activo','metadata'
        ]);
      END IF;
      v_ref_id:=COALESCE(NULLIF(v_clean->>'id_vacante','')::uuid,
        NULLIF(v_clean->>'vacante_id','')::uuid,v_candidate.id_vacante,v_candidate.vacante_id);
      IF v_ref_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vacantes v WHERE v.id=v_ref_id
        AND v.tenant_id=p_tenant_id) THEN
        RAISE EXCEPTION 'RRHH_CANDIDATE_VACANCY_INVALID' USING ERRCODE='23503';
      END IF;
      v_candidate:=jsonb_populate_record(v_candidate,v_clean || jsonb_build_object(
        'id_vacante',v_ref_id,'vacante_id',v_ref_id,'updated_at',now()));
      UPDATE public.candidatos SET
        estado=v_candidate.estado,metadata=v_candidate.metadata,updated_at=now(),
        id_vacante=v_candidate.id_vacante,vacante_id=v_candidate.vacante_id,
        nombres=v_candidate.nombres,apellidos=v_candidate.apellidos,email=v_candidate.email,
        telefono=v_candidate.telefono,numero_documento=v_candidate.numero_documento,
        tipo_documento=v_candidate.tipo_documento,fecha_nacimiento=v_candidate.fecha_nacimiento,
        direccion=v_candidate.direccion,nivel_educacion=v_candidate.nivel_educacion,
        experiencia_anos=v_candidate.experiencia_anos,pretension_salarial=v_candidate.pretension_salarial,
        cv_url=v_candidate.cv_url,linkedin_url=v_candidate.linkedin_url,
        portfolio_url=v_candidate.portfolio_url,idiomas=v_candidate.idiomas,
        habilidades_tecnicas=v_candidate.habilidades_tecnicas,
        experiencia_laboral=v_candidate.experiencia_laboral,
        formacion_academica=v_candidate.formacion_academica,
        estado_proceso=v_candidate.estado_proceso,puntuacion_cv=v_candidate.puntuacion_cv,
        observaciones=v_candidate.observaciones,
        disponibilidad_inmediata=v_candidate.disponibilidad_inmediata,
        modalidad_trabajo_preferida=v_candidate.modalidad_trabajo_preferida,
        activo=v_candidate.activo
      WHERE id=v_id AND tenant_id=p_tenant_id
      RETURNING to_jsonb(candidatos.*) INTO v_new;
    END IF;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'candidatos',
      CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,v_id,v_old,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='ATTENDANCE_MARK' THEN
    v_ref_id:=NULLIF(v_input->>'empleado_id','')::uuid;
    v_date:=NULLIF(v_input->>'fecha','')::date;
    v_end:=NULLIF(v_input->>'hora','')::time;
    IF v_date IS NULL OR v_end IS NULL
       OR lower(COALESCE(v_input->>'tipo','')) NOT IN ('entrada','salida') THEN
      RAISE EXCEPTION 'RRHH_ATTENDANCE_PAYLOAD_INVALID' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.empleados e WHERE e.id=v_ref_id AND e.tenant_id=p_tenant_id
      AND COALESCE(e.activo,false)) THEN
      RAISE EXCEPTION 'RRHH_ATTENDANCE_EMPLOYEE_INVALID' USING ERRCODE='23503';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_tenant_id::text||':rrhh:attendance:'||v_ref_id::text||':'||v_date::text,475));
    SELECT to_jsonb(a),a.id,a.hora_entrada INTO v_old,v_id,v_start
    FROM public.asistencia a WHERE a.tenant_id=p_tenant_id AND a.id_empleado=v_ref_id
      AND a.fecha=v_date FOR UPDATE;
    IF lower(v_input->>'tipo')='entrada' THEN
      IF v_old IS NOT NULL THEN RAISE EXCEPTION 'RRHH_ATTENDANCE_ENTRY_EXISTS' USING ERRCODE='23505'; END IF;
      INSERT INTO public.asistencia(
        tenant_id,id_empleado,empleado_id,fecha,hora_entrada,estado,marcado_por,origen,activo
      ) VALUES(p_tenant_id,v_ref_id,v_ref_id,v_date,v_end,'presente',p_actor_id,'web',true)
      RETURNING to_jsonb(asistencia.*),id INTO v_new,v_id;
      v_old:=NULL;
    ELSE
      IF v_old IS NULL OR v_start IS NULL OR (v_old->>'hora_salida') IS NOT NULL THEN
        RAISE EXCEPTION 'RRHH_ATTENDANCE_EXIT_WITHOUT_OPEN_ENTRY' USING ERRCODE='23514';
      END IF;
      IF v_end IS NULL OR v_end<=v_start THEN
        RAISE EXCEPTION 'RRHH_ATTENDANCE_EXIT_NOT_AFTER_ENTRY' USING ERRCODE='23514';
      END IF;
      UPDATE public.asistencia SET
        hora_salida=v_end,
        horas_trabajadas=round((extract(epoch FROM (v_end-v_start))/3600)::numeric,4),
        marcado_por=p_actor_id,updated_at=now()
      WHERE id=v_id AND tenant_id=p_tenant_id
      RETURNING to_jsonb(asistencia.*) INTO v_new;
    END IF;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'asistencia',
      CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,v_id,v_old,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='ATTENDANCE_ABSENCE_MARK' THEN
    v_ref_id:=NULLIF(v_input->>'empleado_id','')::uuid;
    v_date:=NULLIF(v_input->>'fecha','')::date;
    IF v_date IS NULL THEN
      RAISE EXCEPTION 'RRHH_ATTENDANCE_ABSENCE_PAYLOAD_INVALID' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.empleados e WHERE e.id=v_ref_id AND e.tenant_id=p_tenant_id
      AND COALESCE(e.activo,false)) THEN
      RAISE EXCEPTION 'RRHH_ATTENDANCE_EMPLOYEE_INVALID' USING ERRCODE='23503';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_tenant_id::text||':rrhh:attendance:'||v_ref_id::text||':'||v_date::text,475));
    SELECT to_jsonb(a),a.id INTO v_old,v_id
    FROM public.asistencia a WHERE a.tenant_id=p_tenant_id AND a.id_empleado=v_ref_id
      AND a.fecha=v_date FOR UPDATE;
    IF FOUND THEN
      v_response:=jsonb_build_object('action','UNCHANGED','data',v_old);
    ELSE
      INSERT INTO public.asistencia(
        tenant_id,id_empleado,empleado_id,fecha,estado,horas_trabajadas,
        marcado_por,origen,activo
      ) VALUES(p_tenant_id,v_ref_id,v_ref_id,v_date,'ausente',0,p_actor_id,'job',true)
      RETURNING to_jsonb(asistencia.*),id INTO v_new,v_id;
      PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'asistencia',
        'INSERT',v_id,NULL,v_new,v_op,v_intent.id);
      v_response:=jsonb_build_object('action','CREATED','data',v_new);
    END IF;

  ELSIF v_op='REQUEST_CREATE' THEN
    v_clean:=app.rrhh_pick_475(v_input,ARRAY[
      'id_empleado','fecha_inicio','fecha_fin','dias','tipo','motivo','comentario',
      'observaciones','activo','metadata'
    ]);
    v_ref_id:=NULLIF(v_clean->>'id_empleado','')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.empleados e WHERE e.id=v_ref_id AND e.tenant_id=p_tenant_id) THEN
      RAISE EXCEPTION 'RRHH_REQUEST_EMPLOYEE_INVALID' USING ERRCODE='23503';
    END IF;
    INSERT INTO public.solicitudes(
      tenant_id,id_empleado,fecha_inicio,fecha_fin,dias,tipo,motivo,comentario,
      observaciones_aprobacion,estado,activo,metadata
    ) VALUES(
      p_tenant_id,v_ref_id,NULLIF(v_clean->>'fecha_inicio','')::date,
      NULLIF(v_clean->>'fecha_fin','')::date,
      COALESCE(NULLIF(v_clean->>'dias','')::integer,
        (NULLIF(v_clean->>'fecha_fin','')::date-NULLIF(v_clean->>'fecha_inicio','')::date+1),0),
      COALESCE(v_clean->>'tipo','otro'),v_clean->>'motivo',v_clean->>'comentario',
      v_clean->>'observaciones','pendiente',
      COALESCE((v_clean->>'activo')::boolean,true),COALESCE(v_clean->'metadata','{}'::jsonb)
    ) RETURNING to_jsonb(solicitudes.*),id INTO v_new,v_id;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'solicitudes','INSERT',v_id,NULL,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='REQUEST_DECIDE' THEN
    v_id:=NULLIF(v_input->>'id','')::uuid;
    IF lower(COALESCE(v_input->>'decision','')) NOT IN ('aprobada','rechazada') THEN
      RAISE EXCEPTION 'RRHH_REQUEST_DECISION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT to_jsonb(s) INTO v_old FROM public.solicitudes s
    WHERE s.id=v_id AND s.tenant_id=p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RRHH_REQUEST_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF lower(v_old->>'estado')<>'pendiente' THEN
      RAISE EXCEPTION 'RRHH_REQUEST_ALREADY_DECIDED' USING ERRCODE='23514';
    END IF;
    UPDATE public.solicitudes SET
      estado=lower(v_input->>'decision'),aprobado_por=p_actor_id,
      fecha_aprobacion=now(),observaciones_aprobacion=NULLIF(v_input->>'observaciones',''),
      updated_at=now()
    WHERE id=v_id AND tenant_id=p_tenant_id
    RETURNING to_jsonb(solicitudes.*) INTO v_new;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'solicitudes','UPDATE',v_id,v_old,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='BENEFIT_ASSIGN' THEN
    v_ref_id:=NULLIF(v_input->>'empleado_id','')::uuid;
    v_id:=NULLIF(v_input->>'beneficio_id','')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.empleados e WHERE e.id=v_ref_id AND e.tenant_id=p_tenant_id)
       OR NOT EXISTS(SELECT 1 FROM public.beneficios b WHERE b.id=v_id AND b.tenant_id=p_tenant_id
         AND COALESCE(b.activo,true)) THEN
      RAISE EXCEPTION 'RRHH_BENEFIT_REFERENCE_INVALID' USING ERRCODE='23503';
    END IF;
    INSERT INTO public.empleado_beneficios(
      tenant_id,id_empleado,empleado_id,id_beneficio,beneficio_id,fecha_inicio,estado,activo
    ) VALUES(p_tenant_id,v_ref_id,v_ref_id,v_id,v_id,NULLIF(v_input->>'fecha_inicio','')::date,'activo',true)
    RETURNING to_jsonb(empleado_beneficios.*),id INTO v_new,v_id;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'empleado_beneficios','INSERT',v_id,NULL,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op IN ('EVALUATION_CREATE','EVALUATION_UPDATE') THEN
    v_clean:=app.rrhh_pick_475(v_input - 'id',ARRAY[
      'id_empleado','evaluador_id','fecha_evaluacion','periodo','tipo','puntaje_total',
      'fortalezas','oportunidades_mejora','plan_accion','proxima_evaluacion',
      'estado','activo','metadata'
    ]);
    IF v_op='EVALUATION_CREATE' THEN
      v_ref_id:=NULLIF(v_clean->>'id_empleado','')::uuid;
      IF NOT EXISTS(SELECT 1 FROM public.empleados e WHERE e.id=v_ref_id AND e.tenant_id=p_tenant_id) THEN
        RAISE EXCEPTION 'RRHH_EVALUATION_EMPLOYEE_INVALID' USING ERRCODE='23503';
      END IF;
      IF NULLIF(v_clean->>'evaluador_id','') IS NOT NULL
         AND NOT EXISTS(SELECT 1 FROM public.usuarios_sistema u
        WHERE u.id=NULLIF(v_clean->>'evaluador_id','')::uuid
          AND u.tenant_id=p_tenant_id AND COALESCE(u.activo,false)) THEN
        RAISE EXCEPTION 'RRHH_EVALUATOR_INVALID' USING ERRCODE='23503';
      END IF;
      v_eval:=jsonb_populate_record(NULL::public.evaluaciones,
        jsonb_build_object('id',extensions.gen_random_uuid(),'tenant_id',p_tenant_id,
          'estado','borrador','metadata','{}'::jsonb,'created_at',now(),'updated_at',now(),
          'puntaje_total',0,'activo',true) || v_clean);
      INSERT INTO public.evaluaciones(
        id,tenant_id,estado,metadata,created_at,updated_at,fecha_evaluacion,id_empleado,
        evaluador_id,periodo,tipo,puntaje_total,fortalezas,oportunidades_mejora,
        plan_accion,proxima_evaluacion,activo
      ) VALUES(v_eval.id,v_eval.tenant_id,v_eval.estado,v_eval.metadata,v_eval.created_at,
        v_eval.updated_at,v_eval.fecha_evaluacion,v_eval.id_empleado,v_eval.evaluador_id,
        v_eval.periodo,v_eval.tipo,v_eval.puntaje_total,v_eval.fortalezas,
        v_eval.oportunidades_mejora,v_eval.plan_accion,v_eval.proxima_evaluacion,v_eval.activo)
      RETURNING to_jsonb(evaluaciones.*),id INTO v_new,v_id;
      v_old:=NULL;
    ELSE
      v_id:=NULLIF(v_input->>'id','')::uuid;
      SELECT e.* INTO v_eval FROM public.evaluaciones e
      WHERE e.id=v_id AND e.tenant_id=p_tenant_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'RRHH_EVALUATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      v_old := to_jsonb(v_eval);
      v_eval:=jsonb_populate_record(v_eval,v_clean||jsonb_build_object('updated_at',now()));
      IF NOT EXISTS(SELECT 1 FROM public.empleados e WHERE e.id=v_eval.id_empleado AND e.tenant_id=p_tenant_id) THEN
        RAISE EXCEPTION 'RRHH_EVALUATION_EMPLOYEE_INVALID' USING ERRCODE='23503';
      END IF;
      IF v_eval.evaluador_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.usuarios_sistema u
        WHERE u.id=v_eval.evaluador_id AND u.tenant_id=p_tenant_id AND COALESCE(u.activo,false)
      ) THEN
        RAISE EXCEPTION 'RRHH_EVALUATOR_INVALID' USING ERRCODE='23503';
      END IF;
      UPDATE public.evaluaciones SET estado=v_eval.estado,metadata=v_eval.metadata,updated_at=now(),
        fecha_evaluacion=v_eval.fecha_evaluacion,id_empleado=v_eval.id_empleado,
        evaluador_id=v_eval.evaluador_id,periodo=v_eval.periodo,tipo=v_eval.tipo,
        puntaje_total=v_eval.puntaje_total,fortalezas=v_eval.fortalezas,
        oportunidades_mejora=v_eval.oportunidades_mejora,plan_accion=v_eval.plan_accion,
        proxima_evaluacion=v_eval.proxima_evaluacion,activo=v_eval.activo
      WHERE id=v_id AND tenant_id=p_tenant_id RETURNING to_jsonb(evaluaciones.*) INTO v_new;
    END IF;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'evaluaciones',
      CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,v_id,v_old,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='TRAINING_ENROLL' THEN
    v_ref_id:=NULLIF(v_input->>'empleado_id','')::uuid;
    v_id:=NULLIF(v_input->>'capacitacion_id','')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.empleados e WHERE e.id=v_ref_id AND e.tenant_id=p_tenant_id)
       OR NOT EXISTS(SELECT 1 FROM public.capacitaciones c WHERE c.id=v_id AND c.tenant_id=p_tenant_id
         AND COALESCE(c.activo,true)) THEN
      RAISE EXCEPTION 'RRHH_TRAINING_REFERENCE_INVALID' USING ERRCODE='23503';
    END IF;
    INSERT INTO public.empleado_capacitaciones(
      tenant_id,id_empleado,empleado_id,id_capacitacion,capacitacion_id,
      fecha_inscripcion,estado,activo
    ) VALUES(p_tenant_id,v_ref_id,v_ref_id,v_id,v_id,
      COALESCE(NULLIF(v_input->>'fecha_inscripcion','')::date,CURRENT_DATE),'inscrito',true)
    RETURNING to_jsonb(empleado_capacitaciones.*),id INTO v_new,v_id;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'empleado_capacitaciones','INSERT',v_id,NULL,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='SCHEDULE_ASSIGN' THEN
    v_ref_id:=NULLIF(v_input->>'empleado_id','')::uuid;
    v_id:=NULLIF(v_input->>'horario_id','')::uuid;
    v_date:=NULLIF(v_input->>'fecha_inicio','')::date;
    IF NOT EXISTS(SELECT 1 FROM public.empleados e WHERE e.id=v_ref_id AND e.tenant_id=p_tenant_id)
       OR NOT EXISTS(SELECT 1 FROM public.horarios_trabajo h WHERE h.id=v_id AND h.tenant_id=p_tenant_id
         AND COALESCE(h.activo,true)) OR v_date IS NULL THEN
      RAISE EXCEPTION 'RRHH_SCHEDULE_REFERENCE_INVALID' USING ERRCODE='23503';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':rrhh:schedule:'||v_ref_id::text,475));
    FOR v_schedule_row IN
      SELECT eh.id, to_jsonb(eh) AS old_data
      FROM public.empleado_horarios eh
      WHERE eh.tenant_id=p_tenant_id
        AND (eh.id_empleado=v_ref_id OR eh.empleado_id=v_ref_id)
        AND COALESCE(eh.activo,false)
      FOR UPDATE
    LOOP
      UPDATE public.empleado_horarios SET activo=false,estado='inactivo',
        fecha_fin=CASE WHEN fecha_inicio IS NULL OR v_date>=fecha_inicio THEN v_date ELSE fecha_inicio END,
        updated_at=now()
      WHERE id=v_schedule_row.id AND tenant_id=p_tenant_id
      RETURNING to_jsonb(empleado_horarios.*) INTO v_new;
      PERFORM app.audit_rrhh_475(
        p_tenant_id,p_actor_id,'empleado_horarios','UPDATE',v_schedule_row.id,
        v_schedule_row.old_data,v_new,v_op,v_intent.id
      );
    END LOOP;
    INSERT INTO public.empleado_horarios(
      tenant_id,id_empleado,empleado_id,id_horario,horario_id,fecha_inicio,estado,activo
    ) VALUES(p_tenant_id,v_ref_id,v_ref_id,v_id,v_id,v_date,'activo',true)
    RETURNING to_jsonb(empleado_horarios.*),id INTO v_new,v_id;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'empleado_horarios','INSERT',v_id,NULL,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='FILE_ADD' THEN
    v_ref_id:=NULLIF(v_input->>'empleado_id','')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.empleados e WHERE e.id=v_ref_id AND e.tenant_id=p_tenant_id) THEN
      RAISE EXCEPTION 'RRHH_FILE_EMPLOYEE_INVALID' USING ERRCODE='23503';
    END IF;
    IF lower(COALESCE(v_input->>'tipo_documento','')) NOT IN
      ('contrato','dni','cv','certificado','licencia','otro')
       OR NULLIF(btrim(v_input->>'nombre_archivo'),'') IS NULL
       OR NULLIF(btrim(v_input->>'archivo_url'),'') IS NULL THEN
      RAISE EXCEPTION 'RRHH_FILE_PAYLOAD_INVALID' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.expediente_documentos(
      tenant_id,id_empleado,empleado_id,tipo_documento,nombre_archivo,archivo_url,
      subido_por,fecha_subida,mime_type,tamanio_bytes,descripcion,estado,activo
    ) VALUES(p_tenant_id,v_ref_id,v_ref_id,lower(v_input->>'tipo_documento'),
      v_input->>'nombre_archivo',v_input->>'archivo_url',p_actor_id,now(),
      NULLIF(v_input->>'mime_type',''),COALESCE(NULLIF(v_input->>'tamanio_bytes','')::bigint,0),
      NULLIF(v_input->>'descripcion',''),'activo',true)
    RETURNING to_jsonb(expediente_documentos.*),id INTO v_new,v_id;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'expediente_documentos','INSERT',v_id,NULL,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op IN ('CONTRACT_CREATE','CONTRACT_RENEW','CONTRACT_FINALIZE') THEN
    IF v_op='CONTRACT_CREATE' THEN
      v_clean:=app.rrhh_pick_475(v_input,ARRAY[
        'id_empleado','empleado_id','tipo_contrato','fecha_inicio','fecha_fin','sueldo_bruto',
        'salario','moneda','beneficios','regimen_pensionario','jornada_laboral',
        'periodo_prueba_meses','fecha_firma','estado','activo','metadata',
        'regimen_seguridad_social','convenio_colectivo_codigo','categoria_convenio',
        'modalidad_contratacion_codigo','situacion_revista_codigo','obra_social_codigo',
        'sindicato_codigo','sindicato_aporte_tasa','art_cuit','art_tasa','eps_codigo',
        'fondo_pension_codigo','arl_codigo','caja_compensacion_codigo',
        'ganancias_retencion_mensual','seguro_vida_monto',
        'mejor_remuneracion_normal_habitual','tope_indemnizatorio_convenio',
        'fondo_cese_reemplaza_indemnizacion'
      ]);
      v_ref_id:=COALESCE(NULLIF(v_clean->>'id_empleado','')::uuid,NULLIF(v_clean->>'empleado_id','')::uuid);
      IF NOT EXISTS(SELECT 1 FROM public.empleados e WHERE e.id=v_ref_id AND e.tenant_id=p_tenant_id
        AND COALESCE(e.activo,false)) THEN
        RAISE EXCEPTION 'RRHH_CONTRACT_EMPLOYEE_INVALID' USING ERRCODE='23503';
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':rrhh:contract:'||v_ref_id::text,475));
      IF lower(COALESCE(v_clean->>'estado','vigente'))='activo' THEN
        v_clean:=jsonb_set(v_clean,'{estado}','"vigente"'::jsonb,true);
      END IF;
      v_contract:=jsonb_populate_record(NULL::public.contratos,
        jsonb_build_object(
          'id',extensions.gen_random_uuid(),'tenant_id',p_tenant_id,'id_empleado',v_ref_id,
          'empleado_id',v_ref_id,'estado','vigente','metadata','{}'::jsonb,
          'created_at',now(),'updated_at',now(),'sueldo_bruto',0,'salario',0,
          'moneda',CASE v_country WHEN 'AR' THEN 'ARS' WHEN 'CO' THEN 'COP' ELSE 'PEN' END,
          'periodo_prueba_meses',0,'activo',true,'ganancias_retencion_mensual',0,
          'fondo_cese_reemplaza_indemnizacion',false
        ) || v_clean || jsonb_build_object('id_empleado',v_ref_id,'empleado_id',v_ref_id));
      INSERT INTO public.contratos(
        id,tenant_id,estado,metadata,created_at,updated_at,id_empleado,empleado_id,
        tipo_contrato,fecha_inicio,fecha_fin,sueldo_bruto,salario,moneda,beneficios,
        regimen_pensionario,jornada_laboral,periodo_prueba_meses,fecha_firma,activo,
        regimen_seguridad_social,convenio_colectivo_codigo,categoria_convenio,
        modalidad_contratacion_codigo,situacion_revista_codigo,obra_social_codigo,
        sindicato_codigo,sindicato_aporte_tasa,art_cuit,art_tasa,eps_codigo,
        fondo_pension_codigo,arl_codigo,caja_compensacion_codigo,
        ganancias_retencion_mensual,seguro_vida_monto,
        mejor_remuneracion_normal_habitual,tope_indemnizatorio_convenio,
        fondo_cese_reemplaza_indemnizacion
      ) VALUES(
        v_contract.id,v_contract.tenant_id,v_contract.estado,v_contract.metadata,
        v_contract.created_at,v_contract.updated_at,v_contract.id_empleado,v_contract.empleado_id,
        v_contract.tipo_contrato,v_contract.fecha_inicio,v_contract.fecha_fin,
        v_contract.sueldo_bruto,v_contract.salario,v_contract.moneda,v_contract.beneficios,
        v_contract.regimen_pensionario,v_contract.jornada_laboral,
        v_contract.periodo_prueba_meses,v_contract.fecha_firma,v_contract.activo,
        v_contract.regimen_seguridad_social,v_contract.convenio_colectivo_codigo,
        v_contract.categoria_convenio,v_contract.modalidad_contratacion_codigo,
        v_contract.situacion_revista_codigo,v_contract.obra_social_codigo,
        v_contract.sindicato_codigo,v_contract.sindicato_aporte_tasa,v_contract.art_cuit,
        v_contract.art_tasa,v_contract.eps_codigo,v_contract.fondo_pension_codigo,
        v_contract.arl_codigo,v_contract.caja_compensacion_codigo,
        v_contract.ganancias_retencion_mensual,v_contract.seguro_vida_monto,
        v_contract.mejor_remuneracion_normal_habitual,v_contract.tope_indemnizatorio_convenio,
        v_contract.fondo_cese_reemplaza_indemnizacion
      ) RETURNING to_jsonb(contratos.*),id INTO v_new,v_id;
      v_old:=NULL;
    ELSE
      v_id:=NULLIF(v_input->>'id','')::uuid;
      SELECT c.* INTO v_contract FROM public.contratos c
      WHERE c.id=v_id AND c.tenant_id=p_tenant_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'RRHH_CONTRACT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      v_old := to_jsonb(v_contract);
      IF v_op='CONTRACT_RENEW' THEN
        IF lower(v_contract.estado::text) NOT IN ('vigente','renovado','en_periodo_prueba','vencido') THEN
          RAISE EXCEPTION 'RRHH_CONTRACT_NOT_RENEWABLE' USING ERRCODE='23514';
        END IF;
        v_months:=NULLIF(v_input->>'meses','')::integer;
        IF v_months IS NULL OR v_months<1 OR v_months>120 THEN
          RAISE EXCEPTION 'RRHH_CONTRACT_RENEW_MONTHS_INVALID' USING ERRCODE='23514';
        END IF;
        UPDATE public.contratos SET
          fecha_fin=(COALESCE(fecha_fin,fecha_inicio)+(v_months||' months')::interval)::date,
          estado='renovado',activo=true,
          observaciones=concat_ws(E'\n',NULLIF(observaciones,''),
            'Renovado por '||v_months||' meses el '||CURRENT_DATE::text),updated_at=now()
        WHERE id=v_id AND tenant_id=p_tenant_id
        RETURNING to_jsonb(contratos.*) INTO v_new;
      ELSE
        IF NOT COALESCE(v_contract.activo,false)
           OR lower(v_contract.estado::text)='finalizado' THEN
          RAISE EXCEPTION 'RRHH_CONTRACT_ALREADY_FINALIZED' USING ERRCODE='23514';
        END IF;
        v_date:=NULLIF(v_input->>'fecha_finalizacion','')::date;
        IF v_date IS NULL OR NULLIF(btrim(v_input->>'motivo_finalizacion'),'') IS NULL THEN
          RAISE EXCEPTION 'RRHH_CONTRACT_FINALIZATION_INVALID' USING ERRCODE='23514';
        END IF;
        UPDATE public.contratos SET estado='finalizado',activo=false,fecha_fin=v_date,
          motivo_finalizacion=btrim(v_input->>'motivo_finalizacion'),updated_at=now()
        WHERE id=v_id AND tenant_id=p_tenant_id
        RETURNING to_jsonb(contratos.*) INTO v_new;
      END IF;
    END IF;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'contratos',
      CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,v_id,v_old,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='PERU_FICHA_UPSERT' THEN
    IF v_country<>'PE' THEN RAISE EXCEPTION 'RRHH_PERU_FICHA_COUNTRY_MISMATCH' USING ERRCODE='23514'; END IF;
    v_ref_id:=NULLIF(v_input->>'empleado_id','')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.empleados e WHERE e.id=v_ref_id AND e.tenant_id=p_tenant_id) THEN
      RAISE EXCEPTION 'RRHH_PERU_FICHA_EMPLOYEE_INVALID' USING ERRCODE='23503';
    END IF;
    v_clean:=app.rrhh_pick_475(v_input-'empleado_id',ARRAY[
      'apellido_paterno','apellido_materno','pais_emisor_documento','nacionalidad_codigo',
      'regimen_laboral_codigo','situacion_educativa_codigo','ocupacion_codigo','discapacidad',
      'cuspp','sctr_pension_codigo','tipo_contrato_codigo','jornada_atipica','jornada_maxima',
      'horario_nocturno','sindicalizado','periodicidad_remuneracion_codigo','situacion_codigo',
      'quinta_exonerada','situacion_especial_codigo','tipo_pago_codigo',
      'categoria_ocupacional_codigo','convenio_doble_tributacion_codigo',
      'tipo_trabajador_codigo','regimen_salud_codigo','regimen_pensionario_codigo',
      'sctr_salud_codigo','eps_servicios_propios_codigo','establecimiento_codigo',
      'direccion_tipo_via_codigo','direccion_nombre_via','direccion_numero_via',
      'direccion_tipo_zona_codigo','direccion_nombre_zona','direccion_referencia',
      'telefono_cldn','activo','metadata'
    ]);
    SELECT f.* INTO v_ficha FROM public.rrhh_peru_fichas_laborales f
    WHERE f.tenant_id=p_tenant_id AND f.empleado_id=v_ref_id FOR UPDATE;
    IF FOUND THEN
      v_old := to_jsonb(v_ficha);
      v_ficha:=jsonb_populate_record(v_ficha,v_clean||jsonb_build_object(
        'updated_by',p_actor_id,'updated_at',now()));
      UPDATE public.rrhh_peru_fichas_laborales SET
        apellido_paterno=v_ficha.apellido_paterno,apellido_materno=v_ficha.apellido_materno,
        pais_emisor_documento=v_ficha.pais_emisor_documento,
        nacionalidad_codigo=v_ficha.nacionalidad_codigo,
        regimen_laboral_codigo=v_ficha.regimen_laboral_codigo,
        situacion_educativa_codigo=v_ficha.situacion_educativa_codigo,
        ocupacion_codigo=v_ficha.ocupacion_codigo,discapacidad=v_ficha.discapacidad,
        cuspp=v_ficha.cuspp,sctr_pension_codigo=v_ficha.sctr_pension_codigo,
        tipo_contrato_codigo=v_ficha.tipo_contrato_codigo,jornada_atipica=v_ficha.jornada_atipica,
        jornada_maxima=v_ficha.jornada_maxima,horario_nocturno=v_ficha.horario_nocturno,
        sindicalizado=v_ficha.sindicalizado,
        periodicidad_remuneracion_codigo=v_ficha.periodicidad_remuneracion_codigo,
        situacion_codigo=v_ficha.situacion_codigo,quinta_exonerada=v_ficha.quinta_exonerada,
        situacion_especial_codigo=v_ficha.situacion_especial_codigo,
        tipo_pago_codigo=v_ficha.tipo_pago_codigo,
        categoria_ocupacional_codigo=v_ficha.categoria_ocupacional_codigo,
        convenio_doble_tributacion_codigo=v_ficha.convenio_doble_tributacion_codigo,
        tipo_trabajador_codigo=v_ficha.tipo_trabajador_codigo,
        regimen_salud_codigo=v_ficha.regimen_salud_codigo,
        regimen_pensionario_codigo=v_ficha.regimen_pensionario_codigo,
        sctr_salud_codigo=v_ficha.sctr_salud_codigo,
        eps_servicios_propios_codigo=v_ficha.eps_servicios_propios_codigo,
        establecimiento_codigo=v_ficha.establecimiento_codigo,
        direccion_tipo_via_codigo=v_ficha.direccion_tipo_via_codigo,
        direccion_nombre_via=v_ficha.direccion_nombre_via,
        direccion_numero_via=v_ficha.direccion_numero_via,
        direccion_tipo_zona_codigo=v_ficha.direccion_tipo_zona_codigo,
        direccion_nombre_zona=v_ficha.direccion_nombre_zona,
        direccion_referencia=v_ficha.direccion_referencia,telefono_cldn=v_ficha.telefono_cldn,
        activo=v_ficha.activo,metadata=v_ficha.metadata,updated_by=p_actor_id,updated_at=now()
      WHERE tenant_id=p_tenant_id AND empleado_id=v_ref_id
      RETURNING to_jsonb(rrhh_peru_fichas_laborales.*),id INTO v_new,v_id;
    ELSE
      v_ficha:=jsonb_populate_record(NULL::public.rrhh_peru_fichas_laborales,
        jsonb_build_object(
          'id',extensions.gen_random_uuid(),'tenant_id',p_tenant_id,'empleado_id',v_ref_id,
          'pais_emisor_documento','604','regimen_laboral_codigo','01','discapacidad',false,
          'jornada_atipica',false,'jornada_maxima',true,'horario_nocturno',false,
          'sindicalizado',false,'periodicidad_remuneracion_codigo','1','situacion_codigo','1',
          'quinta_exonerada',false,'tipo_pago_codigo','1','establecimiento_codigo','0000',
          'activo',true,'metadata','{}'::jsonb,'created_by',p_actor_id,'updated_by',p_actor_id,
          'created_at',now(),'updated_at',now()
        )||v_clean);
      INSERT INTO public.rrhh_peru_fichas_laborales SELECT v_ficha.*
      RETURNING to_jsonb(rrhh_peru_fichas_laborales.*),id INTO v_new,v_id;
    END IF;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'rrhh_peru_fichas_laborales',
      CASE WHEN v_old IS NULL THEN 'INSERT' ELSE 'UPDATE' END,v_id,v_old,v_new,v_op,v_intent.id);
    v_response:=v_new;

  ELSIF v_op='PERU_JORNADA_UPDATE' THEN
    IF v_country<>'PE' THEN RAISE EXCEPTION 'RRHH_PERU_JORNADA_COUNTRY_MISMATCH' USING ERRCODE='23514'; END IF;
    v_id:=NULLIF(v_input->>'detalle_id','')::uuid;
    IF NULLIF(v_input->>'horas_ordinarias','') IS NULL
       OR NULLIF(v_input->>'dias_no_laborados','') IS NULL
       OR NULLIF(v_input->>'horas_ordinarias','')::numeric<0
       OR NULLIF(v_input->>'horas_ordinarias','')::numeric>744
       OR NULLIF(v_input->>'dias_no_laborados','')::integer<0
       OR NULLIF(v_input->>'dias_no_laborados','')::integer>31 THEN
      RAISE EXCEPTION 'RRHH_PERU_JORNADA_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT to_jsonb(ep) INTO v_old FROM public.empleado_planilla ep
    WHERE ep.id=v_id AND ep.tenant_id=p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RRHH_PERU_JORNADA_DETAIL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    UPDATE public.empleado_planilla SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object(
      'plame_horas_ordinarias',round((v_input->>'horas_ordinarias')::numeric,2),
      'plame_dias_no_laborados',(v_input->>'dias_no_laborados')::integer,
      'plame_jornada_fuente','MANUAL_CONTADOR',
      'plame_jornada_actualizada_por',p_actor_id,
      'plame_jornada_actualizada_at',now()
    ),updated_at=now()
    WHERE id=v_id AND tenant_id=p_tenant_id
    RETURNING to_jsonb(empleado_planilla.*) INTO v_new;
    PERFORM app.audit_rrhh_475(p_tenant_id,p_actor_id,'empleado_planilla','UPDATE',v_id,v_old,v_new,v_op,v_intent.id);
    v_response:=v_new;
  END IF;

  IF v_response IS NULL THEN
    RAISE EXCEPTION 'RRHH_OPERATION_DID_NOT_RETURN_RESPONSE' USING ERRCODE='40001';
  END IF;
  UPDATE public.rrhh_operaciones_475
  SET entidad_id=v_id,response=v_response,completed_at=now()
  WHERE id=v_intent.id AND response IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RRHH_OPERATION_COMPLETION_FAILED' USING ERRCODE='40001'; END IF;
  RETURN v_response;
END;
$function$;

REVOKE ALL ON TABLE public.rrhh_operaciones_475 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rrhh_operaciones_475 FROM service_role;

-- Single-writer real: ni clientes ni el service role pueden saltarse la RPC
-- aunque exista un grant histórico. Las funciones SECURITY DEFINER 445/475
-- siguen operando como owner; SELECT permanece disponible para lecturas.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.rrhh_configuracion_argentina,
  public.rrhh_configuracion_colombia,
  public.empleados,
  public.departamentos,
  public.vacantes,
  public.candidatos,
  public.asistencia,
  public.asistencias,
  public.solicitudes,
  public.empleado_beneficios,
  public.evaluaciones,
  public.empleado_capacitaciones,
  public.empleado_horarios,
  public.expediente_documentos,
  public.contratos,
  public.rrhh_peru_fichas_laborales,
  public.empleado_planilla
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION app.rrhh_fingerprint_475(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.rrhh_pick_475(jsonb,text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_rrhh_actor_475(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.audit_rrhh_475(uuid,uuid,text,text,uuid,jsonb,jsonb,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)
  TO service_role;

COMMENT ON FUNCTION public.ejecutar_operacion_rrhh_tx(uuid,uuid,text,jsonb,text)
IS 'Writer canónico 475 para RRHH operativo; exige actor activo, rrhh.access, idempotencia y auditoría. Excluye planilla 445 y liquidaciones/CTS 449.';

COMMIT;
