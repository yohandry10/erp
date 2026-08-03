-- El servidor de base de datos corre en UTC, asi que current_date adelantaba el
-- dia frente a la hora local del pais: pasadas las 19:00 de Lima la base ya
-- creia estar en la fecha siguiente.
--
-- El efecto se veia en dos sitios. Una cuenta que vencia hoy quedaba marcada
-- VENCIDA cinco horas antes de tiempo. Y todo documento creado esa noche nacia
-- con la fecha del dia siguiente: el 31 de cualquier mes eso lo empujaba al
-- periodo tributario equivocado, y una venta quedaba registrada con fecha
-- futura en el Registro de Ventas.
--
-- La fecha se resuelve ahora en la zona horaria del pais del tenant. Se tocan
-- los normalizadores que tienen tenant_id a mano; los que no lo tienen
-- (feriados, periodos_contables, conciliaciones y pagos en lote) siguen en UTC.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.zona_horaria_pais(p_pais text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(COALESCE(NULLIF(btrim(p_pais), ''), 'PE'))
    WHEN 'PE' THEN 'America/Lima'
    WHEN 'CO' THEN 'America/Bogota'
    WHEN 'EC' THEN 'America/Guayaquil'
    WHEN 'BO' THEN 'America/La_Paz'
    WHEN 'CL' THEN 'America/Santiago'
    WHEN 'AR' THEN 'America/Argentina/Buenos_Aires'
    WHEN 'MX' THEN 'America/Mexico_City'
    ELSE 'America/Lima'
  END;
$$;

-- SECURITY DEFINER porque el trigger corre como el usuario de la peticion y la
-- RLS de tenants le impediria leer su propio pais. Si el tenant no se resuelve
-- devuelve la fecha de Lima, nunca NULL: current_date tampoco lo devolvia.
CREATE OR REPLACE FUNCTION app.hoy_tenant(p_tenant uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT (now() AT TIME ZONE app.zona_horaria_pais(
    (SELECT t.pais FROM public.tenants t WHERE t.id = p_tenant)
  ))::date;
$$;

GRANT EXECUTE ON FUNCTION app.zona_horaria_pais(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.hoy_tenant(uuid) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION app.normalize_activos_fijos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.centro_costo_id := app.to_uuid_or_null(COALESCE(NEW.centro_costo_id::text, ''));
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Activo Fijo');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('AF-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.fecha_adquisicion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_adquisicion::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.valor_adquisicion := GREATEST(COALESCE(NEW.valor_adquisicion, 0), 0);
  NEW.depreciacion_acumulada := LEAST(GREATEST(COALESCE(NEW.depreciacion_acumulada, 0), 0), NEW.valor_adquisicion);
  NEW.vida_util := GREATEST(COALESCE(NEW.vida_util, 0), 0);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado = 'RETIRADO' THEN NEW.estado := 'BAJA'; END IF;
  IF NEW.estado NOT IN ('ACTIVO', 'INACTIVO', 'BAJA', 'VENDIDO', 'DEPRECIADO') THEN NEW.estado := 'ACTIVO'; END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado NOT IN ('INACTIVO', 'BAJA', 'VENDIDO'));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_asistencia_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, NEW.empleado_id::text, ''));
  NEW.empleado_id := NEW.id_empleado;
  NEW.marcado_por := app.to_uuid_or_null(COALESCE(NEW.marcado_por::text, ''));
  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.hora_entrada := app.to_time_or_null(COALESCE(NEW.hora_entrada::text, ''));
  NEW.hora_salida := app.to_time_or_null(COALESCE(NEW.hora_salida::text, ''));

  IF NEW.hora_entrada IS NULL AND NEW.hora_salida IS NOT NULL THEN
    NEW.hora_entrada := NEW.hora_salida;
  END IF;

  NEW.horas_trabajadas := GREATEST(
    LEAST(
      COALESCE(
        NULLIF(app.to_numeric_or_zero(COALESCE(NEW.horas_trabajadas::text, '0')), 0),
        app.calc_horas_trabajadas(NEW.hora_entrada, NEW.hora_salida),
        0
      ),
      24
    ),
    0
  );

  NEW.tardanza_minutos := GREATEST(LEAST(app.to_int_or_zero(COALESCE(NEW.tardanza_minutos::text, '0')), 1440), 0);
  NEW.turno := NULLIF(lower(btrim(COALESCE(NEW.turno, ''))), '');
  IF NEW.turno IS NOT NULL AND NEW.turno NOT IN ('manana', 'tarde', 'noche', 'mixto') THEN
    NEW.turno := NULL;
  END IF;

  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.origen := COALESCE(NULLIF(lower(btrim(COALESCE(NEW.origen, ''))), ''), 'manual');
  IF NEW.origen NOT IN ('manual', 'web', 'api', 'biometrico', 'importacion', 'job', 'sistema') THEN
    NEW.origen := 'manual';
  END IF;

  v_estado := app.normalize_asistencia_estado(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
      CASE
        WHEN NEW.hora_entrada IS NULL THEN 'ausente'
        ELSE 'presente'
      END
    )
  );

  IF NEW.hora_entrada IS NULL AND NEW.hora_salida IS NULL AND v_estado IN ('presente', 'tardanza') THEN
    v_estado := 'ausente';
    NEW.horas_trabajadas := 0;
  ELSIF NEW.hora_entrada IS NOT NULL AND NEW.hora_salida IS NULL AND v_estado = 'ausente' THEN
    v_estado := CASE WHEN NEW.tardanza_minutos > 0 THEN 'tardanza' ELSE 'presente' END;
  ELSIF NEW.hora_entrada IS NOT NULL AND NEW.hora_salida IS NOT NULL AND v_estado = 'ausente' THEN
    v_estado := CASE WHEN NEW.tardanza_minutos > 0 THEN 'tardanza' ELSE 'presente' END;
  END IF;

  IF NEW.tardanza_minutos > 0 AND v_estado = 'presente' THEN
    v_estado := 'tardanza';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, true);
  NEW.metadata := COALESCE(
    CASE
      WHEN NEW.metadata IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(NEW.metadata) = 'object' THEN NEW.metadata
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  );
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_asistencias_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.empleado_id := app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, NEW.id_empleado::text, ''));
  NEW.id_empleado := NEW.empleado_id;
  NEW.marcado_por := app.to_uuid_or_null(COALESCE(NEW.marcado_por::text, ''));
  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.hora_entrada := app.to_time_or_null(COALESCE(NEW.hora_entrada::text, ''));
  NEW.hora_salida := app.to_time_or_null(COALESCE(NEW.hora_salida::text, ''));

  IF NEW.hora_entrada IS NULL AND NEW.hora_salida IS NOT NULL THEN
    NEW.hora_entrada := NEW.hora_salida;
  END IF;

  NEW.horas_trabajadas := GREATEST(
    LEAST(
      COALESCE(
        NULLIF(app.to_numeric_or_zero(COALESCE(NEW.horas_trabajadas::text, '0')), 0),
        app.calc_horas_trabajadas(NEW.hora_entrada, NEW.hora_salida),
        0
      ),
      24
    ),
    0
  );

  NEW.tardanza_minutos := GREATEST(LEAST(app.to_int_or_zero(COALESCE(NEW.tardanza_minutos::text, '0')), 1440), 0);
  NEW.turno := NULLIF(lower(btrim(COALESCE(NEW.turno, ''))), '');
  IF NEW.turno IS NOT NULL AND NEW.turno NOT IN ('manana', 'tarde', 'noche', 'mixto') THEN
    NEW.turno := NULL;
  END IF;

  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.origen := COALESCE(NULLIF(lower(btrim(COALESCE(NEW.origen, ''))), ''), 'manual');
  IF NEW.origen NOT IN ('manual', 'web', 'api', 'biometrico', 'importacion', 'job', 'sistema') THEN
    NEW.origen := 'manual';
  END IF;

  v_estado := app.normalize_asistencia_estado(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
      CASE
        WHEN NEW.hora_entrada IS NULL THEN 'ausente'
        ELSE 'presente'
      END
    )
  );

  IF NEW.hora_entrada IS NULL AND NEW.hora_salida IS NULL AND v_estado IN ('presente', 'tardanza') THEN
    v_estado := 'ausente';
    NEW.horas_trabajadas := 0;
  ELSIF NEW.hora_entrada IS NOT NULL AND NEW.hora_salida IS NULL AND v_estado = 'ausente' THEN
    v_estado := CASE WHEN NEW.tardanza_minutos > 0 THEN 'tardanza' ELSE 'presente' END;
  ELSIF NEW.hora_entrada IS NOT NULL AND NEW.hora_salida IS NOT NULL AND v_estado = 'ausente' THEN
    v_estado := CASE WHEN NEW.tardanza_minutos > 0 THEN 'tardanza' ELSE 'presente' END;
  END IF;

  IF NEW.tardanza_minutos > 0 AND v_estado = 'presente' THEN
    v_estado := 'tardanza';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, true);
  NEW.metadata := COALESCE(
    CASE
      WHEN NEW.metadata IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(NEW.metadata) = 'object' THEN NEW.metadata
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  );
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_beneficios_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.tipo := COALESCE(NULLIF(lower(btrim(COALESCE(NEW.tipo, ''))), ''), 'general');
  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_fin := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_fin::text, '')), NEW.fecha_inicio);
  IF NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;
  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF NEW.estado NOT IN ('activo', 'inactivo', 'archivado') THEN
    NEW.estado := 'activo';
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Beneficio');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('BEN-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_capacitaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.instructor := NULLIF(btrim(COALESCE(NEW.instructor, '')), '');
  NEW.duracion_horas := GREATEST(COALESCE(NEW.duracion_horas, 0), 0);
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_fin := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_fin::text, '')), NEW.fecha_inicio);
  IF NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;
  NEW.costo := GREATEST(COALESCE(NEW.costo, 0), 0);
  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF NEW.estado NOT IN ('activo', 'inactivo', 'completada', 'cancelada') THEN
    NEW.estado := 'activo';
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Capacitacion');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('CAP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_cobranzas_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.cuenta_por_cobrar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_cobrar_id::text, ''));
  NEW.responsable_id := app.to_uuid_or_null(COALESCE(NEW.responsable_id::text, ''));

  NEW.fecha_programada := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_programada::text, '')), app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_vencimiento := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_vencimiento::text, '')), NEW.fecha_programada + 30);
  NEW.fecha_cobro := app.to_date_or_null(COALESCE(NEW.fecha_cobro::text, ''));
  NEW.proxima_gestion_at := app.to_timestamptz_or_null(COALESCE(NEW.proxima_gestion_at::text, ''));

  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.monto_cobrado := GREATEST(COALESCE(NEW.monto_cobrado, 0), 0);
  IF NEW.monto_cobrado > NEW.monto AND NEW.monto > 0 THEN
    NEW.monto_cobrado := NEW.monto;
  END IF;
  NEW.saldo := round(GREATEST(NEW.monto - NEW.monto_cobrado, 0), 2);

  NEW.prioridad := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.prioridad, '')), ''), 'MEDIA'));
  IF NEW.prioridad NOT IN ('ALTA', 'MEDIA', 'BAJA') THEN
    NEW.prioridad := 'MEDIA';
  END IF;

  NEW.canal := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.canal, '')), ''), 'SISTEMA'));
  IF NEW.canal NOT IN ('SISTEMA', 'LLAMADA', 'EMAIL', 'WHATSAPP', 'VISITA', 'SMS', 'OTRO') THEN
    NEW.canal := 'OTRO';
  END IF;

  NEW.referencia := NULLIF(upper(btrim(COALESCE(NEW.referencia, ''))), '');
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF v_estado IN ('ACTIVO', 'REGISTRADO') THEN
    v_estado := 'PENDIENTE';
  ELSIF v_estado IN ('GESTION', 'EN_PROCESO') THEN
    v_estado := 'EN_GESTION';
  ELSIF v_estado IN ('INACTIVO', 'CANCELADO') THEN
    v_estado := 'ANULADA';
  END IF;
  IF v_estado NOT IN ('PENDIENTE', 'EN_GESTION', 'VENCIDA', 'COBRADA', 'ANULADA') THEN
    v_estado := 'PENDIENTE';
  END IF;

  IF NEW.monto > 0 AND NEW.monto_cobrado >= NEW.monto THEN
    v_estado := 'COBRADA';
    NEW.fecha_cobro := COALESCE(NEW.fecha_cobro, app.hoy_tenant(NEW.tenant_id));
    NEW.saldo := 0;
  ELSIF v_estado IN ('PENDIENTE', 'EN_GESTION')
    AND NEW.fecha_vencimiento IS NOT NULL
    AND NEW.fecha_vencimiento < app.hoy_tenant(NEW.tenant_id) THEN
    v_estado := 'VENCIDA';
  END IF;

  NEW.estado := v_estado;
  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADA');
  IF NEW.estado = 'ANULADA' THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('COBRANZA %s', to_char(COALESCE(NEW.fecha_programada, app.hoy_tenant(NEW.tenant_id)), 'YYYY-MM-DD'))
  );
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('COB-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_comunicaciones_baja_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.fecha_generacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_generacion::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_comunicacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_comunicacion::text, '')), NEW.fecha_generacion);
  NEW.numero_comunicacion := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.numero_comunicacion, ''))), ''), format('RA-%s-%s', to_char(NEW.fecha_generacion, 'YYYYMMDD'), upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 6))));
  NEW.comprobantes_ids := COALESCE(NEW.comprobantes_ids, '{}'::uuid[]);
  NEW.cantidad_comprobantes := CASE WHEN cardinality(NEW.comprobantes_ids) > 0 THEN cardinality(NEW.comprobantes_ids) ELSE GREATEST(COALESCE(NEW.cantidad_comprobantes, 0), 0) END;
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF NEW.estado NOT IN ('PENDIENTE','GENERADO','ENVIADO','ACEPTADO','RECHAZADO','ERROR','ANULADO') THEN
    NEW.estado := 'PENDIENTE';
  END IF;
  NEW.generado_por := app.to_uuid_or_null(COALESCE(NEW.generado_por::text, ''));
  NEW.enviado_por := app.to_uuid_or_null(COALESCE(NEW.enviado_por::text, ''));
  NEW.fecha_envio := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_envio::text, '')), app.to_timestamptz_or_null(COALESCE(NEW.enviado_en::text, '')));
  NEW.fecha_respuesta := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_respuesta::text, '')), app.to_timestamptz_or_null(COALESCE(NEW.respondido_en::text, '')));
  NEW.enviado_en := NEW.fecha_envio;
  NEW.respondido_en := NEW.fecha_respuesta;
  NEW.codigo_hash := COALESCE(NULLIF(btrim(COALESCE(NEW.codigo_hash, '')), ''), NULLIF(btrim(COALESCE(NEW.hash_xml, '')), ''));
  NEW.intentos_envio := GREATEST(COALESCE(NEW.intentos_envio, 0), 0);
  NEW.motivo_baja := NULLIF(btrim(COALESCE(NEW.motivo_baja, '')), '');
  NEW.ultimo_error := NULLIF(btrim(COALESCE(NEW.ultimo_error, '')), '');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_contratos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_tipo text;
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, NEW.empleado_id::text, ''));
  NEW.empleado_id := NEW.id_empleado;

  v_tipo := lower(COALESCE(NULLIF(replace(btrim(COALESCE(NEW.tipo_contrato, '')), ' ', '_'), ''), 'temporal'));
  IF v_tipo IN ('plazo_fijo', 'plazo') THEN
    v_tipo := 'temporal';
  ELSIF v_tipo IN ('locacion', 'locacion_de_servicios') THEN
    v_tipo := 'locacion_servicios';
  END IF;
  IF v_tipo NOT IN ('indefinido', 'temporal', 'practicas', 'locacion_servicios', 'part_time', 'por_horas', 'servicios') THEN
    v_tipo := 'temporal';
  END IF;
  NEW.tipo_contrato := v_tipo;

  NEW.sueldo_bruto := GREATEST(COALESCE(NEW.sueldo_bruto, NEW.salario, 0), 0);
  NEW.salario := NEW.sueldo_bruto;
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_firma := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_firma::text, '')), NEW.fecha_inicio, NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_fin := app.to_date_or_null(COALESCE(NEW.fecha_fin::text, ''));
  IF NEW.fecha_fin IS NOT NULL AND NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;

  v_estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'vigente'));
  IF v_estado IN ('activo', 'activa') THEN
    v_estado := 'vigente';
  ELSIF v_estado IN ('inactivo', 'inactiva') THEN
    v_estado := 'finalizado';
  END IF;
  IF v_estado NOT IN ('vigente', 'renovado', 'finalizado', 'terminado', 'vencido', 'en_periodo_prueba', 'anulado') THEN
    v_estado := 'vigente';
  END IF;
  NEW.estado := v_estado;

  NEW.beneficios := NULLIF(btrim(COALESCE(NEW.beneficios, '')), '');
  NEW.regimen_pensionario := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.regimen_pensionario, '')), ''), 'AFP'));
  IF NEW.regimen_pensionario = 'SNP' THEN
    NEW.regimen_pensionario := 'ONP';
  END IF;
  IF NEW.regimen_pensionario NOT IN ('AFP', 'ONP', 'MIXTO', 'SIN_REGIMEN') THEN
    NEW.regimen_pensionario := 'AFP';
  END IF;

  NEW.jornada_laboral := NULLIF(lower(replace(btrim(COALESCE(NEW.jornada_laboral, '')), ' ', '_')), '');
  NEW.periodo_prueba_meses := GREATEST(COALESCE(NEW.periodo_prueba_meses, 0), 0);
  NEW.motivo_finalizacion := NULLIF(btrim(COALESCE(NEW.motivo_finalizacion, '')), '');
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.activo := COALESCE(NEW.activo, NEW.estado IN ('vigente', 'renovado', 'en_periodo_prueba'));
  IF NEW.estado IN ('finalizado', 'terminado', 'vencido', 'anulado') THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), format('Contrato %s', upper(NEW.tipo_contrato)));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('CTR-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_cotizaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
  v_next integer;
BEGIN
  NEW.numero := upper(NULLIF(btrim(COALESCE(NEW.numero::text, '')), ''));
  IF NEW.numero IS NULL THEN
    SELECT COALESCE(MAX(app.to_int_or_zero(COALESCE(substring(c.numero FROM '([0-9]+)$'), '0'))), 0) + 1
    INTO v_next
    FROM public.cotizaciones c
    WHERE c.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
      AND c.numero LIKE format('COT-%s-%%', to_char(app.hoy_tenant(NEW.tenant_id), 'YYYY'));
    NEW.numero := format('COT-%s-%s', to_char(app.hoy_tenant(NEW.tenant_id), 'YYYY'), lpad(v_next::text, 4, '0'));
  END IF;
  NEW.fecha_cotizacion := COALESCE(NEW.fecha_cotizacion, NEW.fecha, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha := COALESCE(NEW.fecha, NEW.fecha_cotizacion, app.hoy_tenant(NEW.tenant_id));
  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  NEW.igv := GREATEST(COALESCE(NEW.igv, 0), 0);
  NEW.total := round(GREATEST(COALESCE(NEW.total, NEW.subtotal + NEW.igv, 0), 0)::numeric, 2);
  NEW.probabilidad := round(GREATEST(LEAST(COALESCE(NEW.probabilidad, 0), 100), 0)::numeric, 2);
  NEW.items := COALESCE(NEW.items, '[]'::jsonb);
  IF jsonb_typeof(NEW.items) <> 'array' THEN NEW.items := '[]'::jsonb; END IF;
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, NEW.notas, '')), '');
  NEW.notas := COALESCE(NULLIF(btrim(COALESCE(NEW.notas, '')), ''), NEW.observaciones);
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'BORRADOR'));
  IF v_estado = 'PENDIENTE' THEN v_estado := 'ENVIADA'; END IF;
  IF v_estado = 'ACEPTADA' OR v_estado = 'APROBADO' THEN v_estado := 'APROBADA'; END IF;
  IF v_estado = 'RECHAZADO' THEN v_estado := 'RECHAZADA'; END IF;
  IF v_estado = 'CONVERTIDO' THEN v_estado := 'CONVERTIDA'; END IF;
  IF v_estado = 'VENCIDO' THEN v_estado := 'VENCIDA'; END IF;
  IF v_estado NOT IN ('BORRADOR','ENVIADA','APROBADA','RECHAZADA','CONVERTIDA','VENCIDA') THEN v_estado := 'BORRADOR'; END IF;
  NEW.estado := v_estado;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_cxc_pagos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.cuenta_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.retencion_monto := COALESCE(NEW.retencion_monto, NEW.retencionmonto, 0);
  NEW.retencionmonto := NEW.retencion_monto;
  NEW.aplica_retencion := COALESCE(NEW.aplica_retencion, false);

  NEW.tipo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'PAGO'));
  IF NEW.tipo NOT IN ('PAGO', 'ANTICIPO', 'DETRACCION', 'PERCEPCION', 'RETENCION', 'NOTA_CREDITO') THEN
    NEW.tipo := 'PAGO';
  END IF;

  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.metodo_pago := upper(COALESCE(
    NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''),
    CASE
      WHEN NEW.tipo = 'NOTA_CREDITO' THEN 'NOTA_CREDITO'
      WHEN NEW.tipo = 'RETENCION' THEN 'RETENCION'
      WHEN NEW.tipo = 'DETRACCION' THEN 'DETRACCION'
      WHEN NEW.tipo = 'ANTICIPO' THEN 'ANTICIPO'
      ELSE 'EFECTIVO'
    END
  ));
  NEW.referencia := NULLIF(btrim(COALESCE(NEW.referencia, '')), '');
  NEW.notas := NULLIF(btrim(COALESCE(NEW.notas, '')), '');
  NEW.source := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.source, '')), ''), 'finanzas.cxc'));

  IF NEW.aplica_retencion THEN
    NEW.retencion_monto := GREATEST(COALESCE(NEW.retencion_monto, NEW.monto, 0), 0);
  ELSE
    NEW.retencion_monto := 0;
  END IF;
  NEW.retencionmonto := NEW.retencion_monto;

  NEW.estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.activo := COALESCE(NEW.activo, true);

  NEW.idempotency_key := COALESCE(
    NULLIF(btrim(COALESCE(NEW.idempotency_key, '')), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('cxc.event:%s', NEW.event_id::text)
      ELSE format(
        'cxc.%s:%s:%s:%s',
        lower(NEW.tipo),
        COALESCE(NEW.tenant_id::text, 'no-tenant'),
        COALESCE(NEW.cuenta_id::text, 'no-cuenta'),
        replace(gen_random_uuid()::text, '-', '')
      )
    END
  );

  NEW.fecha_pago := COALESCE(NEW.fecha_pago, app.hoy_tenant(NEW.tenant_id));
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_depreciaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.activo_id := app.to_uuid_or_null(COALESCE(NEW.activo_id::text, ''));
  NEW.centro_costo_id := app.to_uuid_or_null(COALESCE(NEW.centro_costo_id::text, ''));
  NEW.evento_id := app.to_uuid_or_null(COALESCE(NEW.evento_id::text, ''));
  NEW.fecha_depreciacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_depreciacion::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.periodo := app.normalize_periodo_yyyy_mm(NEW.periodo, NEW.fecha_depreciacion);
  NEW.monto_depreciacion := GREATEST(COALESCE(NEW.monto_depreciacion, 0), 0);
  NEW.procesado_outbox := COALESCE(NEW.procesado_outbox, false);
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF NEW.estado = 'ACTIVO' THEN NEW.estado := 'PENDIENTE'; END IF;
  IF NEW.estado = 'INACTIVO' THEN NEW.estado := 'ANULADA'; END IF;
  IF NEW.estado NOT IN ('PENDIENTE', 'PROCESADA', 'ANULADA', 'ERROR') THEN NEW.estado := 'PENDIENTE'; END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADA');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_egresos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.cuenta_por_pagar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_pagar_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), app.hoy_tenant(NEW.tenant_id));
  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.tipo_egreso := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_egreso, '')), ''), 'OTRO'));
  IF NEW.tipo_egreso NOT IN ('PAGO_PROVEEDOR', 'NOMINA', 'TRIBUTO', 'SERVICIO', 'TRANSFERENCIA', 'CAJA_CHICA', 'OTRO') THEN
    NEW.tipo_egreso := 'OTRO';
  END IF;

  NEW.concepto := COALESCE(NULLIF(btrim(COALESCE(NEW.concepto, '')), ''), NULLIF(btrim(COALESCE(NEW.nombre, '')), ''));
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.metodo_pago := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'TRANSFERENCIA'));
  IF NEW.metodo_pago NOT IN ('EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'CHEQUE', 'TARJETA', 'DETRACCION', 'RETENCION', 'OTRO') THEN
    NEW.metodo_pago := 'OTRO';
  END IF;

  NEW.referencia := NULLIF(upper(btrim(COALESCE(NEW.referencia, ''))), '');
  NEW.idempotency_key := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.idempotency_key, ''))), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('egreso.event:%s', NEW.event_id::text)
      ELSE format('egreso:%s:%s', COALESCE(NEW.tenant_id::text, 'no-tenant'), replace(gen_random_uuid()::text, '-', ''))
    END
  );

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'REGISTRADO'));
  IF v_estado IN ('ACTIVO', 'PAGADO') THEN
    v_estado := 'APLICADO';
  ELSIF v_estado IN ('INACTIVO', 'CANCELADO') THEN
    v_estado := 'ANULADO';
  END IF;
  IF v_estado NOT IN ('REGISTRADO', 'APLICADO', 'ANULADO') THEN
    v_estado := 'REGISTRADO';
  END IF;
  NEW.estado := v_estado;

  IF NEW.estado = 'APLICADO' THEN
    NEW.fecha_aplicacion := COALESCE(NEW.fecha_aplicacion, now());
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADO');
  IF NEW.estado = 'ANULADO' THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    NEW.concepto,
    format('EGRESO-%s', to_char(COALESCE(NEW.fecha, app.hoy_tenant(NEW.tenant_id)), 'YYYYMMDD'))
  );
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('EGR-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_empleado_beneficios_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.id_beneficio := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_beneficio::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.beneficio_id::text, ''))
  );
  NEW.beneficio_id := NEW.id_beneficio;
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_fin := app.to_date_or_null(COALESCE(NEW.fecha_fin::text, ''));
  IF NEW.fecha_fin IS NOT NULL AND NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF NEW.estado = 'vigente' THEN
    NEW.estado := 'activo';
  END IF;
  IF NEW.estado NOT IN ('activo', 'inactivo', 'suspendido', 'vencido') THEN
    NEW.estado := 'activo';
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  IF NEW.estado IN ('inactivo', 'suspendido', 'vencido') THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Beneficio Empleado');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('BENEMP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_empleado_capacitaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.id_capacitacion := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_capacitacion::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.capacitacion_id::text, ''))
  );
  NEW.capacitacion_id := NEW.id_capacitacion;
  NEW.fecha_inscripcion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inscripcion::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_completado := app.to_date_or_null(COALESCE(NEW.fecha_completado::text, ''));
  IF NEW.fecha_completado IS NOT NULL AND NEW.fecha_completado < NEW.fecha_inscripcion THEN
    NEW.fecha_completado := NEW.fecha_inscripcion;
  END IF;
  NEW.calificacion := LEAST(GREATEST(COALESCE(NEW.calificacion, 0), 0), 100);
  NEW.certificado_url := NULLIF(btrim(COALESCE(NEW.certificado_url, '')), '');
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'inscrito'));
  IF NEW.estado = 'activo' THEN
    NEW.estado := 'inscrito';
  ELSIF NEW.estado = 'inactivo' THEN
    NEW.estado := 'cancelado';
  END IF;
  IF NEW.estado NOT IN ('inscrito', 'en_progreso', 'completado', 'aprobado', 'reprobado', 'cancelado') THEN
    NEW.estado := 'inscrito';
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'cancelado');
  IF NEW.estado = 'cancelado' THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Capacitacion Empleado');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('CAPEMP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_empleado_horarios_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.id_horario := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_horario::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.horario_id::text, ''))
  );
  NEW.horario_id := NEW.id_horario;
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_fin := app.to_date_or_null(COALESCE(NEW.fecha_fin::text, ''));
  IF NEW.fecha_fin IS NOT NULL AND NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF NEW.estado = 'vigente' THEN
    NEW.estado := 'activo';
  END IF;
  IF NEW.estado NOT IN ('activo', 'inactivo', 'suspendido') THEN
    NEW.estado := 'activo';
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  IF NEW.estado IN ('inactivo', 'suspendido') THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Horario Asignado');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('HORASIG-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_empleados_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
  v_tipo_doc text;
  v_departamento text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_departamento := app.to_uuid_or_null(COALESCE(NEW.id_departamento::text, NEW.departamento_id::text, ''));
  NEW.departamento_id := NEW.id_departamento;
  NEW.id_empleado := COALESCE(app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')), app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, '')), NEW.id);
  NEW.empleado_id := NEW.id_empleado;

  NEW.nombres := COALESCE(NULLIF(btrim(COALESCE(NEW.nombres, '')), ''), NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'NOMBRE');
  NEW.apellidos := COALESCE(NULLIF(btrim(COALESCE(NEW.apellidos, '')), ''), 'APELLIDO');

  v_tipo_doc := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), 'DNI'));
  IF v_tipo_doc IN ('CARNET EXTRANJERIA', 'CARNET_DE_EXTRANJERIA', 'CARNET DE EXTRANJERIA') THEN
    v_tipo_doc := 'CE';
  END IF;
  IF v_tipo_doc NOT IN (
    'DNI', 'CE', 'PASAPORTE', 'RUC', 'CUIL', 'CUIT', 'CC', 'TI', 'NIT', 'OTRO'
  ) THEN
    v_tipo_doc := 'OTRO';
  END IF;
  NEW.tipo_documento := v_tipo_doc;

  NEW.numero_documento := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.numero_documento, ''))), ''), format('DOC-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.telefono := NULLIF(btrim(COALESCE(NEW.telefono, '')), '');
  NEW.direccion := NULLIF(btrim(COALESCE(NEW.direccion, '')), '');
  NEW.fecha_nacimiento := app.to_date_or_null(COALESCE(NEW.fecha_nacimiento::text, ''));
  NEW.fecha_ingreso := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_ingreso::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.puesto := COALESCE(NULLIF(btrim(COALESCE(NEW.puesto, '')), ''), 'Colaborador');
  NEW.genero := NULLIF(lower(btrim(COALESCE(NEW.genero, ''))), '');
  NEW.estado_civil := NULLIF(lower(btrim(COALESCE(NEW.estado_civil, ''))), '');
  NEW.nacionalidad := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.nacionalidad, ''))), ''), 'PE');
  NEW.ubigeo := NULLIF(upper(btrim(COALESCE(NEW.ubigeo, ''))), '');

  NEW.cantidad_hijos := GREATEST(COALESCE(NEW.cantidad_hijos, 0), 0);
  NEW.tiene_hijos := COALESCE(NEW.tiene_hijos, NEW.cantidad_hijos > 0);
  IF NEW.tiene_hijos = false THEN
    NEW.cantidad_hijos := 0;
  END IF;
  NEW.asignacion_familiar := COALESCE(NEW.asignacion_familiar, NEW.cantidad_hijos > 0);

  NEW.cuenta_bancaria := NULLIF(btrim(COALESCE(NEW.cuenta_bancaria, '')), '');
  NEW.banco := NULLIF(btrim(COALESCE(NEW.banco, '')), '');
  NEW.tipo_cuenta := NULLIF(lower(btrim(COALESCE(NEW.tipo_cuenta, ''))), '');
  NEW.contacto_emergencia := NULLIF(btrim(COALESCE(NEW.contacto_emergencia, '')), '');
  NEW.telefono_emergencia := NULLIF(btrim(COALESCE(NEW.telefono_emergencia, '')), '');
  NEW.foto_url := NULLIF(btrim(COALESCE(NEW.foto_url, '')), '');
  NEW.departamento := NULLIF(btrim(COALESCE(NEW.departamento, '')), '');

  v_estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activo'));
  IF v_estado IN ('activa', 'vigente') THEN
    v_estado := 'activo';
  ELSIF v_estado IN ('inactiva') THEN
    v_estado := 'inactivo';
  ELSIF v_estado IN ('baja', 'retirado', 'terminado', 'finalizado') THEN
    v_estado := 'cesado';
  END IF;
  IF v_estado NOT IN ('activo', 'inactivo', 'suspendido', 'cesado') THEN
    v_estado := 'activo';
  END IF;
  NEW.estado := v_estado;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'activo');
  IF NEW.estado IN ('inactivo', 'cesado') THEN
    NEW.activo := false;
  END IF;

  NEW.familiares := COALESCE(NEW.familiares, '[]'::jsonb);
  IF jsonb_typeof(NEW.familiares) <> 'array' THEN
    NEW.familiares := '[]'::jsonb;
  END IF;

  IF NEW.departamento IS NULL AND NEW.id_departamento IS NOT NULL THEN
    SELECT d.nombre INTO v_departamento
    FROM public.departamentos d
    WHERE d.id = NEW.id_departamento;
    NEW.departamento := v_departamento;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), concat_ws(' ', NEW.nombres, NEW.apellidos));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('EMP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_evaluaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, ''));
  NEW.evaluador_id := app.to_uuid_or_null(COALESCE(NEW.evaluador_id::text, ''));

  NEW.fecha_evaluacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_evaluacion::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.periodo := COALESCE(NULLIF(lower(btrim(COALESCE(NEW.periodo, ''))), ''), to_char(NEW.fecha_evaluacion, 'YYYY-MM'));
  NEW.tipo := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'desempeno'));
  IF NEW.tipo NOT IN ('desempeno', 'periodica', 'prueba', '360', 'objetivos', 'otro') THEN
    NEW.tipo := 'desempeno';
  END IF;

  NEW.puntaje_total := LEAST(GREATEST(COALESCE(NEW.puntaje_total, 0), 0), 100);
  NEW.fortalezas := NULLIF(btrim(COALESCE(NEW.fortalezas, '')), '');
  NEW.oportunidades_mejora := NULLIF(btrim(COALESCE(NEW.oportunidades_mejora, '')), '');
  NEW.plan_accion := NULLIF(btrim(COALESCE(NEW.plan_accion, '')), '');
  NEW.proxima_evaluacion := app.to_date_or_null(COALESCE(NEW.proxima_evaluacion::text, ''));

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'borrador'));
  IF NEW.estado = 'activo' THEN
    NEW.estado := 'programada';
  ELSIF NEW.estado = 'inactivo' THEN
    NEW.estado := 'rechazada';
  END IF;
  IF NEW.estado NOT IN ('borrador', 'programada', 'completada', 'aprobada', 'rechazada') THEN
    NEW.estado := 'borrador';
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'rechazada');

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), format('EVALUACION %s', upper(NEW.periodo)));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('EVAL-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_gastos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.centro_costo_id := app.to_uuid_or_null(COALESCE(NEW.centro_costo_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.cuenta_contable_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_contable_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_pago := app.to_date_or_null(COALESCE(NEW.fecha_pago::text, ''));
  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.categoria := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.categoria, ''))), ''), 'GENERAL');
  NEW.subcategoria := NULLIF(upper(btrim(COALESCE(NEW.subcategoria, ''))), '');
  NEW.descripcion := COALESCE(NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''), NULLIF(btrim(COALESCE(NEW.nombre, '')), ''));
  NEW.tipo_gasto := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_gasto, '')), ''), 'OPERATIVO'));
  IF NEW.tipo_gasto NOT IN ('OPERATIVO', 'ADMINISTRATIVO', 'VENTAS', 'FINANCIERO', 'TRIBUTARIO', 'LOGISTICO') THEN
    NEW.tipo_gasto := 'OPERATIVO';
  END IF;

  NEW.metodo_pago := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'EFECTIVO'));
  IF NEW.metodo_pago NOT IN ('EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'TARJETA', 'CHEQUE', 'DETRACCION', 'RETENCION', 'OTRO') THEN
    NEW.metodo_pago := 'OTRO';
  END IF;

  NEW.numero_comprobante := NULLIF(upper(btrim(COALESCE(NEW.numero_comprobante, ''))), '');
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'REGISTRADO'));
  IF v_estado IN ('ACTIVO', 'PENDIENTE', 'BORRADOR') THEN
    v_estado := 'REGISTRADO';
  ELSIF v_estado IN ('INACTIVO', 'CANCELADO') THEN
    v_estado := 'ANULADO';
  END IF;
  IF v_estado NOT IN ('REGISTRADO', 'APROBADO', 'PAGADO', 'ANULADO') THEN
    v_estado := 'REGISTRADO';
  END IF;
  NEW.estado := v_estado;

  IF NEW.estado = 'PAGADO' AND NEW.fecha_pago IS NULL THEN
    NEW.fecha_pago := NEW.fecha;
  END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADO');
  IF NEW.estado = 'ANULADO' THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    NEW.descripcion,
    format('GASTO-%s', to_char(COALESCE(NEW.fecha, app.hoy_tenant(NEW.tenant_id)), 'YYYYMMDD'))
  );
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('GST-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_historial_pagos_planilla_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.planilla_id := app.to_uuid_or_null(COALESCE(NEW.planilla_id::text, ''));
  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));

  NEW.metodo := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo, NEW.metodo_pago)), ''), 'transferencia'));
  IF NEW.metodo NOT IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'mixto', 'otro') THEN
    NEW.metodo := 'otro';
  END IF;
  NEW.metodo_pago := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, NEW.metodo)), ''), NEW.metodo));
  IF NEW.metodo_pago NOT IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'mixto', 'otro') THEN
    NEW.metodo_pago := NEW.metodo;
  END IF;

  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.empleados_count := GREATEST(COALESCE(NEW.empleados_count, 0), 0);
  NEW.numero_operacion := NULLIF(upper(btrim(COALESCE(NEW.numero_operacion, ''))), '');
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.procesado_por := app.to_uuid_or_null(COALESCE(NEW.procesado_por::text, ''));
  NEW.fecha_registro := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_registro::text, '')), NEW.created_at, now());

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'registrado'));
  IF NEW.estado = 'activo' THEN
    NEW.estado := 'registrado';
  ELSIF NEW.estado = 'inactivo' THEN
    NEW.estado := 'anulado';
  END IF;
  IF NEW.estado NOT IN ('registrado', 'anulado', 'conciliado') THEN
    NEW.estado := 'registrado';
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'anulado');
  IF NEW.estado = 'anulado' THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Historial Pago Planilla');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('HPP-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_liquidaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.aprobado_por := app.to_uuid_or_null(COALESCE(NEW.aprobado_por::text, ''));
  NEW.pagado_por := app.to_uuid_or_null(COALESCE(NEW.pagado_por::text, ''));

  NEW.fecha_terminacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_terminacion::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.ultimo_dia_trabajado := COALESCE(app.to_date_or_null(COALESCE(NEW.ultimo_dia_trabajado::text, '')), NEW.fecha_terminacion);
  IF NEW.ultimo_dia_trabajado > NEW.fecha_terminacion THEN
    NEW.ultimo_dia_trabajado := NEW.fecha_terminacion;
  END IF;
  NEW.fecha_calculo := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_calculo::text, '')), NEW.created_at, now());
  NEW.fecha_pago := app.to_timestamptz_or_null(COALESCE(NEW.fecha_pago::text, ''));

  NEW.motivo_terminacion := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.motivo_terminacion, '')), ''), 'otro'));
  IF NEW.motivo_terminacion NOT IN ('renuncia', 'despido', 'fin_contrato', 'mutuo_acuerdo', 'abandono', 'fallecimiento', 'otro') THEN
    NEW.motivo_terminacion := 'otro';
  END IF;

  NEW.metodo_pago := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'transferencia'));
  IF NEW.metodo_pago NOT IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'otro') THEN
    NEW.metodo_pago := 'otro';
  END IF;
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');

  NEW.monto_cts := GREATEST(COALESCE(NEW.monto_cts, 0), 0);
  NEW.vacaciones_pendientes := GREATEST(COALESCE(NEW.vacaciones_pendientes, 0), 0);
  NEW.indemnizacion := GREATEST(COALESCE(NEW.indemnizacion, 0), 0);
  NEW.dias_cts := GREATEST(COALESCE(NEW.dias_cts, 0), 0);
  NEW.total_liquidacion := GREATEST(COALESCE(NEW.total_liquidacion, 0), NEW.monto_cts + NEW.indemnizacion);

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'calculada'));
  IF NEW.estado = 'activo' THEN
    NEW.estado := 'calculada';
  ELSIF NEW.estado = 'inactivo' THEN
    NEW.estado := 'anulada';
  END IF;
  IF NEW.estado NOT IN ('calculada', 'aprobada', 'pagada', 'anulada') THEN
    NEW.estado := 'calculada';
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'anulada');
  IF NEW.estado = 'anulada' THEN
    NEW.activo := false;
  END IF;
  IF NEW.estado = 'pagada' AND NEW.fecha_pago IS NULL THEN
    NEW.fecha_pago := now();
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Liquidacion');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('LIQ-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_pagos_facturas_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cuenta_por_pagar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_pagar_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  NEW.fecha_pago := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_pago::text, '')), app.hoy_tenant(NEW.tenant_id));
  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');

  NEW.metodo_pago := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'TRANSFERENCIA'));
  IF NEW.metodo_pago NOT IN ('EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'CHEQUE', 'TARJETA', 'DETRACCION', 'RETENCION', 'OTRO') THEN
    NEW.metodo_pago := 'OTRO';
  END IF;

  NEW.referencia := NULLIF(upper(btrim(COALESCE(NEW.referencia, ''))), '');
  NEW.numero_operacion := NULLIF(upper(btrim(COALESCE(NEW.numero_operacion, ''))), '');
  NEW.notas := NULLIF(btrim(COALESCE(NEW.notas, '')), '');

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'APLICADO'));
  IF v_estado IN ('ACTIVO', 'PAGADO') THEN
    v_estado := 'APLICADO';
  ELSIF v_estado IN ('INACTIVO', 'CANCELADO') THEN
    v_estado := 'ANULADO';
  END IF;
  IF v_estado NOT IN ('PENDIENTE', 'APLICADO', 'ANULADO') THEN
    v_estado := 'APLICADO';
  END IF;
  NEW.estado := v_estado;

  IF NEW.estado = 'APLICADO' THEN
    NEW.aplicado_en := COALESCE(NEW.aplicado_en, now());
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADO');
  IF NEW.estado = 'ANULADO' THEN
    NEW.activo := false;
  END IF;

  NEW.idempotency_key := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.idempotency_key, ''))), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('pf.event:%s', NEW.event_id::text)
      ELSE format('pf:%s:%s', COALESCE(NEW.tenant_id::text, 'no-tenant'), replace(gen_random_uuid()::text, '-', ''))
    END
  );

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('PAGO FACTURA %s', to_char(COALESCE(NEW.fecha_pago, app.hoy_tenant(NEW.tenant_id)), 'YYYY-MM-DD'))
  );
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('PF-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_pagos_ventas_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.venta_id := app.to_uuid_or_null(COALESCE(NEW.venta_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.metodo_pago := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'EFECTIVO'));
  IF NEW.metodo_pago NOT IN ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO', 'MIXTO', 'OTRO') THEN
    NEW.metodo_pago := 'OTRO';
  END IF;

  NEW.fecha_pago := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_pago::text, '')), app.hoy_tenant(NEW.tenant_id));
  NEW.referencia := NULLIF(upper(btrim(COALESCE(NEW.referencia, ''))), '');
  NEW.numero_operacion := NULLIF(upper(btrim(COALESCE(NEW.numero_operacion, ''))), '');

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'APLICADO'));
  IF v_estado IN ('ACTIVO', 'PAGADO') THEN
    v_estado := 'APLICADO';
  ELSIF v_estado IN ('INACTIVO', 'CANCELADO') THEN
    v_estado := 'ANULADO';
  END IF;
  IF v_estado NOT IN ('REGISTRADO', 'APLICADO', 'ANULADO') THEN
    v_estado := 'APLICADO';
  END IF;
  NEW.estado := v_estado;

  IF NEW.estado = 'APLICADO' THEN
    NEW.aplicado_en := COALESCE(NEW.aplicado_en, now());
  END IF;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADO');
  IF NEW.estado = 'ANULADO' THEN
    NEW.activo := false;
  END IF;

  NEW.idempotency_key := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.idempotency_key, ''))), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('pv.event:%s', NEW.event_id::text)
      ELSE format('pv:%s:%s', COALESCE(NEW.tenant_id::text, 'no-tenant'), replace(gen_random_uuid()::text, '-', ''))
    END
  );

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), format('PAGO VENTA %s', to_char(NEW.fecha_pago, 'YYYY-MM-DD')));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('PV-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_pedidos_venta_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
  v_next integer;
BEGIN
  NEW.numero := upper(NULLIF(btrim(COALESCE(NEW.numero::text, '')), ''));
  IF NEW.numero IS NULL THEN
    SELECT COALESCE(MAX(app.to_int_or_zero(COALESCE(substring(p.numero FROM '([0-9]+)$'), '0'))), 0) + 1
    INTO v_next
    FROM public.pedidos_venta p
    WHERE p.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
      AND (p.numero LIKE format('PV-%s-%%', to_char(app.hoy_tenant(NEW.tenant_id), 'YYYY')) OR p.numero LIKE format('PED-%s-%%', to_char(app.hoy_tenant(NEW.tenant_id), 'YYYY')));
    NEW.numero := format('PV-%s-%s', to_char(app.hoy_tenant(NEW.tenant_id), 'YYYY'), lpad(v_next::text, 4, '0'));
  END IF;
  NEW.fecha_pedido := COALESCE(NEW.fecha_pedido, NEW.fecha, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha := COALESCE(NEW.fecha, NEW.fecha_pedido, app.hoy_tenant(NEW.tenant_id));
  NEW.subtotal := round(GREATEST(COALESCE(NEW.subtotal, 0), 0)::numeric, 2);
  NEW.igv := round(GREATEST(COALESCE(NEW.igv, 0), 0)::numeric, 2);
  NEW.total := round(GREATEST(COALESCE(NEW.total, NEW.subtotal + NEW.igv, 0), 0)::numeric, 2);
  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, NEW.notas, '')), '');
  NEW.notas := COALESCE(NULLIF(btrim(COALESCE(NEW.notas, '')), ''), NEW.observaciones);
  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'BORRADOR' THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado = 'APROBADO' THEN v_estado := 'CONFIRMADO'; END IF;
  IF v_estado IN ('RECHAZADO','ANULADO') THEN v_estado := 'CANCELADO'; END IF;
  IF v_estado = 'DESPACHADO' THEN v_estado := 'LISTO_FACTURAR'; END IF;
  IF v_estado = 'COMPLETO' THEN v_estado := 'COMPLETADO'; END IF;
  IF v_estado NOT IN ('PENDIENTE','PENDIENTE_APROBACION','CONFIRMADO','EN_PREPARACION','LISTO_DESPACHO','DESPACHO_PARCIAL','LISTO_FACTURAR','FACTURADO','COMPLETADO','COMPLETADO_CON_GRE','CANCELADO') THEN v_estado := 'PENDIENTE'; END IF;
  NEW.estado := v_estado;
  NEW.requiere_aprobacion := COALESCE(NEW.requiere_aprobacion, NEW.estado = 'PENDIENTE_APROBACION');
  NEW.estado_credito := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado_credito, '')), ''), 'PENDIENTE'));
  NEW.tracking_estado := COALESCE(upper(NULLIF(btrim(COALESCE(NEW.tracking_estado, '')), '')), 'PENDIENTE');
  NEW.tracking_actualizado_en := COALESCE(NEW.tracking_actualizado_en, now());
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_plantillas_asientos_historial_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_periodo text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.plantilla_id := app.to_uuid_or_null(COALESCE(NEW.plantilla_id::text, ''));
  NEW.asiento_id := app.to_uuid_or_null(COALESCE(NEW.asiento_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Ejecucion Plantilla');
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('PLH-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );
  NEW.fecha_generacion := COALESCE(
    app.to_date_or_null(COALESCE(NEW.fecha_generacion::text, '')),
    NEW.created_at::date,
    app.hoy_tenant(NEW.tenant_id)
  );

  v_periodo := NULLIF(regexp_replace(COALESCE(NEW.periodo, ''), '\s+', '', 'g'), '');
  IF v_periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    NEW.periodo := v_periodo;
  ELSIF v_periodo ~ '^[0-9]{6}$' THEN
    NEW.periodo := substr(v_periodo, 1, 4) || '-' || substr(v_periodo, 5, 2);
  ELSE
    NEW.periodo := to_char(COALESCE(NEW.fecha_generacion, app.hoy_tenant(NEW.tenant_id)), 'YYYY-MM');
  END IF;

  NEW.referencia := NULLIF(btrim(COALESCE(NEW.referencia, '')), '');
  NEW.mensaje_error := NULLIF(btrim(COALESCE(NEW.mensaje_error, '')), '');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'GENERADO'));
  IF NEW.estado = 'ACTIVO' THEN NEW.estado := 'GENERADO'; END IF;
  IF NEW.estado = 'INACTIVO' THEN NEW.estado := 'ANULADO'; END IF;
  IF NEW.estado NOT IN ('GENERADO', 'ERROR', 'PENDIENTE', 'ANULADO') THEN
    NEW.estado := 'GENERADO';
  END IF;
  NEW.payload := COALESCE(NEW.payload, '{}'::jsonb);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_registro_consignaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.numero := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.numero, ''))), ''), format('RC-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.fecha_registro := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_registro::text, '')), app.to_date_or_null(COALESCE(NEW.fecha_entrega::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_entrega := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_entrega::text, '')), NEW.fecha_registro);
  NEW.consignatario_nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.consignatario_nombre, '')), ''), 'CONSIGNATARIO');
  NEW.cantidad := GREATEST(COALESCE(NEW.cantidad, 0), 0);
  NEW.valor_unitario := GREATEST(COALESCE(NEW.valor_unitario, 0), 0);
  NEW.valor_total := GREATEST(COALESCE(NULLIF(NEW.valor_total, 0), NEW.cantidad * NEW.valor_unitario), 0);
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF NEW.estado = 'ACTIVO' THEN NEW.estado := 'PENDIENTE'; END IF;
  IF NEW.estado IN ('INACTIVO', 'CANCELADA') THEN NEW.estado := 'ANULADA'; END IF;
  IF NEW.estado NOT IN ('PENDIENTE', 'VENDIDA', 'DEVUELTA', 'ANULADA', 'CERRADA') THEN NEW.estado := 'PENDIENTE'; END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADA');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_resumenes_diarios_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.fecha_generacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_generacion::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_referencia := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_referencia::text, '')), NEW.fecha_generacion);
  NEW.numero_resumen := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.numero_resumen, ''))), ''), format('RC-%s-%s', to_char(NEW.fecha_generacion, 'YYYYMMDD'), upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 6))));
  NEW.comprobantes_ids := COALESCE(NEW.comprobantes_ids, '{}'::uuid[]);
  NEW.cantidad_comprobantes := CASE WHEN cardinality(NEW.comprobantes_ids) > 0 THEN cardinality(NEW.comprobantes_ids) ELSE GREATEST(COALESCE(NEW.cantidad_comprobantes, 0), 0) END;
  NEW.total_gravadas := GREATEST(COALESCE(NEW.total_gravadas, 0), 0);
  NEW.total_exoneradas := GREATEST(COALESCE(NEW.total_exoneradas, 0), 0);
  NEW.total_inafectas := GREATEST(COALESCE(NEW.total_inafectas, 0), 0);
  NEW.total_igv := GREATEST(COALESCE(NEW.total_igv, 0), 0);
  NEW.total_general := GREATEST(COALESCE(NEW.total_general, 0), 0);
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF NEW.estado NOT IN ('PENDIENTE','GENERADO','ENVIADO','ACEPTADO','RECHAZADO','ERROR','ANULADO') THEN
    NEW.estado := 'PENDIENTE';
  END IF;
  NEW.generado_por := app.to_uuid_or_null(COALESCE(NEW.generado_por::text, ''));
  NEW.enviado_por := app.to_uuid_or_null(COALESCE(NEW.enviado_por::text, ''));
  NEW.fecha_envio := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_envio::text, '')), app.to_timestamptz_or_null(COALESCE(NEW.enviado_en::text, '')));
  NEW.fecha_respuesta := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_respuesta::text, '')), app.to_timestamptz_or_null(COALESCE(NEW.respondido_en::text, '')));
  NEW.enviado_en := NEW.fecha_envio;
  NEW.respondido_en := NEW.fecha_respuesta;
  NEW.codigo_hash := COALESCE(NULLIF(btrim(COALESCE(NEW.codigo_hash, '')), ''), NULLIF(btrim(COALESCE(NEW.hash_xml, '')), ''));
  NEW.intentos_envio := GREATEST(COALESCE(NEW.intentos_envio, 0), 0);
  NEW.ultimo_error := NULLIF(btrim(COALESCE(NEW.ultimo_error, '')), '');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_solicitudes_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, ''));
  NEW.aprobado_por := app.to_uuid_or_null(COALESCE(NEW.aprobado_por::text, ''));

  NEW.tipo := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'vacaciones'));
  IF NEW.tipo NOT IN ('vacaciones', 'licencia', 'permiso', 'descanso_medico', 'compensacion', 'otro') THEN
    NEW.tipo := 'otro';
  END IF;

  NEW.motivo := NULLIF(btrim(COALESCE(NEW.motivo, '')), '');
  NEW.comentario := NULLIF(btrim(COALESCE(NEW.comentario, '')), '');
  NEW.fecha_inicio := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_inicio::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_fin := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_fin::text, '')), NEW.fecha_inicio);
  IF NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;

  NEW.dias := GREATEST(COALESCE(NEW.dias, 0), 0);
  IF NEW.dias = 0 AND NEW.fecha_inicio IS NOT NULL AND NEW.fecha_fin IS NOT NULL THEN
    NEW.dias := GREATEST((NEW.fecha_fin - NEW.fecha_inicio) + 1, 0);
  END IF;

  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'pendiente'));
  IF NEW.estado = 'aprobado' THEN
    NEW.estado := 'aprobada';
  ELSIF NEW.estado = 'rechazado' THEN
    NEW.estado := 'rechazada';
  ELSIF NEW.estado = 'activo' THEN
    NEW.estado := 'pendiente';
  END IF;
  IF NEW.estado NOT IN ('pendiente', 'aprobada', 'rechazada', 'cancelada') THEN
    NEW.estado := 'pendiente';
  END IF;

  NEW.fecha_aprobacion := app.to_timestamptz_or_null(COALESCE(NEW.fecha_aprobacion::text, ''));
  IF NEW.estado IN ('aprobada', 'rechazada') THEN
    NEW.fecha_aprobacion := COALESCE(NEW.fecha_aprobacion, now());
  END IF;

  NEW.observaciones_aprobacion := NULLIF(btrim(COALESCE(NEW.observaciones_aprobacion, '')), '');
  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'cancelada');

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), format('SOLICITUD %s', upper(NEW.tipo)));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('SOL-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_vacantes_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.departamento_id := app.to_uuid_or_null(COALESCE(NEW.departamento_id::text, ''));

  NEW.titulo := COALESCE(NULLIF(btrim(COALESCE(NEW.titulo, '')), ''), NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Vacante');
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.puesto_solicitado := COALESCE(NULLIF(btrim(COALESCE(NEW.puesto_solicitado, '')), ''), NEW.titulo);
  NEW.ubicacion := NULLIF(btrim(COALESCE(NEW.ubicacion, '')), '');
  NEW.tipo_contrato := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_contrato, '')), ''), 'tiempo_completo'));
  IF NEW.tipo_contrato NOT IN ('tiempo_completo', 'medio_tiempo', 'contrato', 'pasantia', 'freelance') THEN
    NEW.tipo_contrato := 'tiempo_completo';
  END IF;

  NEW.salario_minimo := GREATEST(COALESCE(NEW.salario_minimo, NEW.salario_min, 0), 0);
  NEW.salario_min := NEW.salario_minimo;
  NEW.salario_maximo := GREATEST(COALESCE(NEW.salario_maximo, NEW.salario_max, NEW.salario_minimo, 0), NEW.salario_minimo);
  NEW.salario_max := NEW.salario_maximo;

  NEW.experiencia_requerida := NULLIF(btrim(COALESCE(NEW.experiencia_requerida, '')), '');
  NEW.requisitos := NULLIF(btrim(COALESCE(NEW.requisitos, '')), '');
  NEW.beneficios := NULLIF(btrim(COALESCE(NEW.beneficios, '')), '');

  NEW.fecha_publicacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_publicacion::text, '')), NEW.created_at::date, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_limite := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_limite::text, '')), app.to_date_or_null(COALESCE(NEW.fecha_cierre::text, '')), NEW.fecha_publicacion + 30);
  NEW.fecha_cierre := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_cierre::text, '')), NEW.fecha_limite);
  IF NEW.fecha_cierre < NEW.fecha_publicacion THEN
    NEW.fecha_cierre := NEW.fecha_limite;
  END IF;
  IF NEW.fecha_limite < NEW.fecha_publicacion THEN
    NEW.fecha_limite := NEW.fecha_publicacion;
  END IF;

  v_estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'activa'));
  IF v_estado = 'activo' THEN
    v_estado := 'activa';
  ELSIF v_estado = 'inactivo' THEN
    v_estado := 'pausada';
  END IF;
  IF v_estado NOT IN ('activa', 'pausada', 'cerrada', 'cancelada', 'borrador') THEN
    v_estado := 'activa';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, NEW.estado NOT IN ('cerrada', 'cancelada'));
  IF NEW.estado IN ('cerrada', 'cancelada') THEN
    NEW.activo := false;
  END IF;

  NEW.departamento := NULLIF(btrim(COALESCE(NEW.departamento, '')), '');
  IF NEW.departamento IS NULL AND NEW.departamento_id IS NOT NULL THEN
    SELECT d.nombre INTO NEW.departamento
    FROM public.departamentos d
    WHERE d.id = NEW.departamento_id;
  END IF;

  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), NEW.titulo);
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('VAC-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_ventas_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.vendedor_id := app.to_uuid_or_null(COALESCE(NEW.vendedor_id::text, ''));
  NEW.sucursal_id := app.to_uuid_or_null(COALESCE(NEW.sucursal_id::text, ''));
  NEW.cuenta_por_cobrar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_cobrar_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), app.hoy_tenant(NEW.tenant_id));
  NEW.tipo_documento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), 'FACTURA'));
  IF NEW.tipo_documento NOT IN ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'TICKET', 'GUIA') THEN
    NEW.tipo_documento := 'FACTURA';
  END IF;

  NEW.numero_documento := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.numero_documento, ''))), ''),
    format('VTA-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );

  NEW.metodo_pago := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'EFECTIVO'));
  IF NEW.metodo_pago NOT IN ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO', 'MIXTO', 'OTRO') THEN
    NEW.metodo_pago := 'OTRO';
  END IF;

  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.descuento := GREATEST(COALESCE(NEW.descuento, 0), 0);
  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  NEW.igv := GREATEST(COALESCE(NEW.igv, 0), 0);
  NEW.total := GREATEST(COALESCE(NEW.total, 0), 0);
  IF NEW.total = 0 THEN
    NEW.total := round(GREATEST(NEW.subtotal - NEW.descuento, 0) + NEW.igv, 2);
  END IF;

  NEW.referencia := NULLIF(upper(btrim(COALESCE(NEW.referencia, ''))), '');

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'BORRADOR'));
  IF v_estado IN ('ACTIVO', 'CERRADA') THEN
    v_estado := 'CONFIRMADA';
  ELSIF v_estado IN ('INACTIVO', 'CANCELADA') THEN
    v_estado := 'ANULADA';
  END IF;
  IF v_estado NOT IN ('BORRADOR', 'EMITIDA', 'PAGADA', 'CONFIRMADA', 'ANULADA') THEN
    v_estado := 'BORRADOR';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADA');
  IF NEW.estado = 'ANULADA' THEN
    NEW.activo := false;
  END IF;

  NEW.idempotency_key := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.idempotency_key, ''))), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('venta.event:%s', NEW.event_id::text)
      ELSE format('venta:%s:%s', COALESCE(NEW.tenant_id::text, 'no-tenant'), replace(gen_random_uuid()::text, '-', ''))
    END
  );

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('%s %s', NEW.tipo_documento, NEW.numero_documento)
  );
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('VTA-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
