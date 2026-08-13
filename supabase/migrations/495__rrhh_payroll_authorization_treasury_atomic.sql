-- RRHH financiero: permisos por acción, segregación de funciones y pago de
-- planilla ligado a tesorería en la misma transacción.

BEGIN;

SET LOCAL search_path = pg_catalog, public, app, extensions, pg_temp;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.rrhh_planilla_operaciones_495 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  planilla_id uuid REFERENCES public.planillas(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  cuenta_bancaria_id uuid REFERENCES public.cuentas_bancarias(id) ON DELETE RESTRICT,
  movimiento_bancario_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  sesion_caja_id uuid REFERENCES public.sesiones_caja(id) ON DELETE RESTRICT,
  movimiento_caja_id uuid REFERENCES public.movimientos_caja(id) ON DELETE RESTRICT,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_rrhh_planilla_operaciones_tipo_495 CHECK (
    tipo IN ('CREAR', 'ACTUALIZAR', 'ELIMINAR', 'PAGAR')
  ),
  CONSTRAINT ck_rrhh_planilla_operaciones_key_495 CHECK (
    length(btrim(idempotency_key)) BETWEEN 8 AND 180
  ),
  CONSTRAINT ck_rrhh_planilla_operaciones_fp_495 CHECK (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rrhh_planilla_operacion_key_495
  ON public.rrhh_planilla_operaciones_495 (tenant_id, tipo, lower(btrim(idempotency_key)));
CREATE UNIQUE INDEX IF NOT EXISTS ux_rrhh_planilla_pago_unico_495
  ON public.rrhh_planilla_operaciones_495 (tenant_id, planilla_id)
  WHERE tipo = 'PAGAR' AND planilla_id IS NOT NULL;

ALTER TABLE public.rrhh_planilla_operaciones_495 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrhh_planilla_operaciones_495 FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rrhh_planilla_operaciones_tenant_select_495
  ON public.rrhh_planilla_operaciones_495;
CREATE POLICY rrhh_planilla_operaciones_tenant_select_495
  ON public.rrhh_planilla_operaciones_495
  FOR SELECT TO authenticated
  USING (tenant_id = app.current_tenant_id());

CREATE OR REPLACE FUNCTION app.sembrar_permisos_rrhh_financiero_495(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id es obligatorio para sembrar permisos RRHH'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.permisos (
    tenant_id, modulo, recurso, accion, codigo, descripcion, activo
  ) VALUES
    (p_tenant_id, 'rrhh', 'planillas', 'create', 'rrhh.planillas.create',
      'Crear, editar o eliminar borradores de planilla', true),
    (p_tenant_id, 'rrhh', 'planillas', 'calculate', 'rrhh.planillas.calculate',
      'Calcular planillas', true),
    (p_tenant_id, 'rrhh', 'planillas', 'approve', 'rrhh.planillas.approve',
      'Aprobar y devengar planillas calculadas', true),
    (p_tenant_id, 'rrhh', 'planillas', 'pay', 'rrhh.planillas.pay',
      'Pagar planillas aprobadas contra tesorería', true),
    (p_tenant_id, 'rrhh', 'liquidaciones', 'calculate', 'rrhh.liquidaciones.calculate',
      'Calcular liquidaciones laborales', true),
    (p_tenant_id, 'rrhh', 'liquidaciones', 'approve', 'rrhh.liquidaciones.approve',
      'Aprobar liquidaciones laborales', true),
    (p_tenant_id, 'rrhh', 'liquidaciones', 'pay', 'rrhh.liquidaciones.pay',
      'Pagar liquidaciones laborales', true),
    (p_tenant_id, 'rrhh', 'liquidaciones', 'reverse', 'rrhh.liquidaciones.reverse',
      'Revertir pagos de liquidaciones', true),
    (p_tenant_id, 'rrhh', 'cts', 'calculate', 'rrhh.cts.calculate',
      'Calcular depósitos CTS', true),
    (p_tenant_id, 'rrhh', 'cts', 'deposit', 'rrhh.cts.deposit',
      'Depositar CTS contra tesorería', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true
  FROM public.roles r
  JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND COALESCE(r.activo, true)
    -- Los paquetes por nombre pertenecen únicamente a roles canónicos. Un
    -- ADMIN_DEMO puede crear roles custom, pero esos roles reciben sólo los
    -- permisos que el writer RBAC validó y solicitó explícitamente.
    AND COALESCE(r.is_system_role, false)
    AND COALESCE(p.activo, true)
    AND (
      upper(r.nombre) IN ('ADMIN', 'ADMIN_DEMO')
      OR (
        upper(r.nombre) = 'RRHH'
        AND lower(p.codigo) IN (
          'rrhh.planillas.read', 'rrhh.planillas.create',
          'rrhh.planillas.calculate', 'rrhh.planillas.approve',
          'rrhh.liquidaciones.calculate', 'rrhh.liquidaciones.approve',
          'rrhh.cts.calculate'
        )
      )
      OR (
        upper(r.nombre) IN ('FINANZAS', 'TESORERIA')
        AND lower(p.codigo) IN (
          'rrhh.planillas.read', 'rrhh.planillas.pay',
          'rrhh.liquidaciones.pay', 'rrhh.liquidaciones.reverse',
          'rrhh.cts.deposit'
        )
      )
    )
  ON CONFLICT (role_id, permiso_id) DO UPDATE SET concedido = true;
END;
$function$;

CREATE OR REPLACE FUNCTION app.seed_rrhh_role_495()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    PERFORM app.sembrar_permisos_rrhh_financiero_495(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_rrhh_role_495 ON public.roles;
CREATE TRIGGER trg_seed_rrhh_role_495
AFTER INSERT OR UPDATE OF nombre, activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_rrhh_role_495();

DO $do$
DECLARE v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM app.sembrar_permisos_rrhh_financiero_495(v_tenant.id);
  END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION app.assert_rrhh_permission_495(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_permission text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE v_super boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NULLIF(btrim(p_permission), '') IS NULL THEN
    RAISE EXCEPTION 'tenant, actor y permiso RRHH son obligatorios'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(u.is_super_admin, false)
  INTO v_super
  FROM public.usuarios_sistema u
  WHERE u.id = p_actor_id
    AND COALESCE(u.activo, false)
    AND upper(COALESCE(u.estado, 'ACTIVO')) = 'ACTIVO'
    AND (u.tenant_id = p_tenant_id OR COALESCE(u.is_super_admin, false));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Actor RRHH inactivo, inexistente o de otro tenant'
      USING ERRCODE = '42501';
  END IF;
  IF v_super THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.id = ur.role_id AND r.tenant_id = p_tenant_id AND COALESCE(r.activo, true)
    JOIN public.rol_permisos rp
      ON rp.role_id = r.id AND COALESCE(rp.concedido, true)
    JOIN public.permisos p
      ON p.id = rp.permiso_id
     AND p.tenant_id = p_tenant_id
     AND COALESCE(p.activo, true)
    WHERE ur.usuario_sistema_id = p_actor_id
      AND ur.tenant_id = p_tenant_id
      AND lower(p.codigo) = lower(p_permission)
  ) THEN
    RAISE EXCEPTION 'El actor no tiene el permiso %', p_permission
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.fingerprint_rrhh_495(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, extensions, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(p_value::text, 'UTF8'), 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION public.crear_planilla_tx_495(
  p_tenant_id uuid,
  p_planilla jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_periodo text := NULLIF(btrim(COALESCE(p_planilla->>'periodo', '')), '');
  v_pais text := upper(COALESCE(NULLIF(btrim(p_planilla->>'pais_codigo'), ''), 'PE'));
  v_moneda text := upper(COALESCE(NULLIF(btrim(p_planilla->>'moneda'), ''), 'PEN'));
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_payload jsonb;
  v_fingerprint text;
  v_existing public.rrhh_planilla_operaciones_495%ROWTYPE;
  v_planilla public.planillas%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_actor_id, 'rrhh.planillas.create');
  IF jsonb_typeof(p_planilla) <> 'object'
     OR v_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 180 THEN
    RAISE EXCEPTION 'Planilla, período YYYY-MM y clave idempotente son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  IF (v_pais, v_moneda) NOT IN (('PE','PEN'), ('AR','ARS'), ('CO','COP')) THEN
    RAISE EXCEPTION 'País/moneda laboral no permitido: %/%', v_pais, v_moneda
      USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'periodo', v_periodo, 'pais_codigo', v_pais, 'moneda', v_moneda,
    'metadata', COALESCE(p_planilla->'metadata', '{}'::jsonb)
  );
  v_fingerprint := app.fingerprint_rrhh_495(v_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':CREAR:' || lower(v_key), 495));

  SELECT * INTO v_existing
  FROM public.rrhh_planilla_operaciones_495
  WHERE tenant_id = p_tenant_id AND tipo = 'CREAR'
    AND lower(btrim(idempotency_key)) = lower(v_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM p_actor_id
       OR v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'La clave idempotente de alta ya pertenece a otra intención o actor'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':PLANILLA:' || v_periodo, 495));
  IF EXISTS (
    SELECT 1 FROM public.planillas
    WHERE tenant_id = p_tenant_id AND periodo = v_periodo
      AND lower(estado::text) <> 'anulada'
  ) THEN
    RAISE EXCEPTION 'Ya existe una planilla no anulada para el período %', v_periodo
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.planillas (
    tenant_id, periodo, pais_codigo, moneda, estado, estado_pago,
    total_ingresos, total_descuentos, total_aportes, total_neto,
    total_pagado, asientos_generados, metadata
  ) VALUES (
    p_tenant_id, v_periodo, v_pais, v_moneda, 'borrador', 'pendiente',
    0, 0, 0, 0, 0, 'false',
    COALESCE(p_planilla->'metadata', '{}'::jsonb) || jsonb_build_object(
      'creada_por', p_actor_id, 'creada_en', clock_timestamp()
    )
  ) RETURNING * INTO v_planilla;

  v_result := jsonb_build_object(
    'success', true, 'id', v_planilla.id, 'tenant_id', p_tenant_id,
    'periodo', v_periodo, 'pais_codigo', v_pais, 'moneda', v_moneda,
    'estado', 'borrador', 'estado_pago', 'pendiente', 'metadata', v_planilla.metadata,
    'idempotent', false
  );
  INSERT INTO public.rrhh_planilla_operaciones_495 (
    tenant_id, tipo, planilla_id, idempotency_key, request_fingerprint,
    actor_id, resultado
  ) VALUES (
    p_tenant_id, 'CREAR', v_planilla.id, v_key, v_fingerprint, p_actor_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_calculo_planilla_tx(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_empleados jsonb,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_planilla public.planillas%ROWTYPE;
  v_fingerprint text;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_actor_id, 'rrhh.planillas.calculate');
  IF jsonb_typeof(p_empleados) <> 'array' THEN
    RAISE EXCEPTION 'El cálculo requiere un arreglo de empleados' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := app.fingerprint_rrhh_495(p_empleados);

  SELECT * INTO v_planilla FROM public.planillas
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planilla no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;
  IF lower(v_planilla.estado::text) = 'calculada' THEN
    IF app.to_uuid_or_null(v_planilla.metadata->>'calculada_por') IS DISTINCT FROM p_actor_id
       OR v_planilla.metadata->>'calculation_fingerprint' IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'La planilla ya fue calculada por otra intención; no se recalcula'
        USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'success', true, 'planillaId', p_planilla_id,
      'totalEmpleados', (SELECT count(*) FROM public.empleado_planilla ep
        WHERE ep.tenant_id = p_tenant_id AND ep.planilla_id = p_planilla_id),
      'totalIngresos', v_planilla.total_ingresos,
      'totalDescuentos', v_planilla.total_descuentos,
      'totalAportes', v_planilla.total_aportes,
      'totalNeto', v_planilla.total_neto, 'idempotent', true
    );
  END IF;
  IF lower(v_planilla.estado::text) <> 'borrador' THEN
    RAISE EXCEPTION 'La planilla no puede calcularse desde estado %', v_planilla.estado
      USING ERRCODE = '23514';
  END IF;

  v_result := app.guardar_calculo_planilla_tx(p_tenant_id, p_planilla_id, p_empleados);
  UPDATE public.planillas
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'calculada_por', p_actor_id,
        'calculada_en', clock_timestamp(),
        'calculation_fingerprint', v_fingerprint
      ), updated_at = now()
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id;
  RETURN v_result || jsonb_build_object('planillaId', p_planilla_id, 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.aprobar_planilla_tx(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_usuario_id text DEFAULT 'sistema'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_actor uuid := app.to_uuid_or_null(p_usuario_id);
  v_planilla public.planillas%ROWTYPE;
  v_aprobador_durable uuid;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, v_actor, 'rrhh.planillas.approve');
  SELECT * INTO v_planilla FROM public.planillas
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planilla no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;
  IF app.to_uuid_or_null(v_planilla.metadata->>'calculada_por') IS NULL THEN
    RAISE EXCEPTION 'La planilla no tiene actor de cálculo durable; recalcule antes de aprobar'
      USING ERRCODE = '23514';
  END IF;
  IF app.to_uuid_or_null(v_planilla.metadata->>'calculada_por') = v_actor THEN
    RAISE EXCEPTION 'La persona que calculó la planilla no puede aprobarla'
      USING ERRCODE = '42501';
  END IF;
  v_aprobador_durable := app.to_uuid_or_null(v_planilla.metadata->>'aprobada_por');
  IF lower(v_planilla.estado::text) IN ('aprobada', 'pagada') THEN
    IF v_aprobador_durable IS NULL THEN
      RAISE EXCEPTION 'La planilla aprobada no tiene actor durable; requiere regularización'
        USING ERRCODE = '23514';
    END IF;
    IF v_aprobador_durable IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'La aprobación ya pertenece a otro actor; no se reatribuye'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN app.aprobar_planilla_tx(p_tenant_id, p_planilla_id, v_actor::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pagar_planilla_con_tesoreria_tx_495(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_pago jsonb,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_planilla public.planillas%ROWTYPE;
  v_operacion public.rrhh_planilla_operaciones_495%ROWTYPE;
  v_banco public.cuentas_bancarias%ROWTYPE;
  v_sesion public.sesiones_caja%ROWTYPE;
  v_mov_caja public.movimientos_caja%ROWTYPE;
  v_metodo text := lower(btrim(COALESCE(p_pago->>'metodo_pago', '')));
  v_key text := NULLIF(btrim(COALESCE(p_pago->>'idempotency_key', '')), '');
  v_cuenta_id uuid := app.to_uuid_or_null(p_pago->>'cuenta_bancaria_id');
  v_sesion_id uuid := app.to_uuid_or_null(p_pago->>'sesion_caja_id');
  v_referencia text := NULLIF(btrim(COALESCE(p_pago->>'referencia', '')), '');
  v_fecha_solicitada date := NULLIF(p_pago->>'fecha_pago', '')::date;
  v_fecha date;
  v_fecha_pago timestamptz;
  v_timezone text;
  v_moneda text;
  v_monto numeric(14,2);
  v_saldo_anterior numeric(14,2);
  v_saldo_nuevo numeric(14,2);
  v_mov_banco_id uuid;
  v_payload jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_event_id uuid;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_actor_id, 'rrhh.planillas.pay');
  IF jsonb_typeof(p_pago) <> 'object' OR v_metodo NOT IN ('efectivo', 'transferencia')
     OR v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 180 THEN
    RAISE EXCEPTION 'Pago, método y clave idempotente son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  IF v_metodo = 'transferencia'
     AND (v_cuenta_id IS NULL OR v_referencia IS NULL OR v_sesion_id IS NOT NULL) THEN
    RAISE EXCEPTION 'La transferencia requiere cuenta bancaria y referencia, sin sesión de caja'
      USING ERRCODE = '22023';
  END IF;
  IF v_metodo = 'efectivo' AND (v_sesion_id IS NULL OR v_cuenta_id IS NOT NULL) THEN
    RAISE EXCEPTION 'El efectivo requiere una sesión de caja explícita y no una cuenta bancaria'
      USING ERRCODE = '22023';
  END IF;
  SELECT app.zona_horaria_pais(t.pais) INTO v_timezone
  FROM public.tenants t WHERE t.id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant no encontrado para el pago de planilla' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':PAGAR:' || lower(v_key), 495));
  SELECT * INTO v_planilla FROM public.planillas
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planilla no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;
  IF lower(v_planilla.estado::text) NOT IN ('aprobada', 'pagada') THEN
    RAISE EXCEPTION 'Sólo se paga una planilla aprobada; estado %', v_planilla.estado
      USING ERRCODE = '23514';
  END IF;
  IF app.to_uuid_or_null(v_planilla.metadata->>'aprobada_por') IS NULL THEN
    RAISE EXCEPTION 'La planilla no tiene aprobación atribuible; requiere regularización'
      USING ERRCODE = '23514';
  END IF;
  IF app.to_uuid_or_null(v_planilla.metadata->>'aprobada_por') = p_actor_id THEN
    RAISE EXCEPTION 'La persona que aprobó la planilla no puede pagarla'
      USING ERRCODE = '42501';
  END IF;
  v_monto := round(COALESCE(v_planilla.total_neto, 0), 2);
  v_moneda := upper(COALESCE(NULLIF(v_planilla.moneda, ''), 'PEN'));
  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'La planilla no tiene importe neto por pagar' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_operacion
  FROM public.rrhh_planilla_operaciones_495
  WHERE tenant_id = p_tenant_id AND tipo = 'PAGAR'
    AND lower(btrim(idempotency_key)) = lower(v_key)
  FOR UPDATE;
  IF FOUND THEN
    IF v_operacion.planilla_id IS DISTINCT FROM p_planilla_id
       OR v_operacion.actor_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'La clave idempotente de pago ya pertenece a otra intención o actor'
        USING ERRCODE = '23505';
    END IF;
    -- Un retry sin fecha conserva el día comprometido por la primera ejecución.
    -- No se recalcula `hoy_tenant`: así una respuesta perdida antes de medianoche
    -- sigue siendo replay exacto al día siguiente y no vuelve a mover tesorería.
    v_fecha := COALESCE(
      v_fecha_solicitada,
      NULLIF(v_operacion.resultado->>'fechaPago', '')::date,
      (SELECT mb.fecha FROM public.movimientos_bancarios mb
        WHERE mb.id = v_operacion.movimiento_bancario_id
          AND mb.tenant_id = p_tenant_id),
      (SELECT (mc.created_at AT TIME ZONE v_timezone)::date
        FROM public.movimientos_caja mc
        WHERE mc.id = v_operacion.movimiento_caja_id
          AND mc.tenant_id = p_tenant_id),
      (v_planilla.fecha_pago AT TIME ZONE v_timezone)::date
    );
    IF v_fecha IS NULL THEN
      RAISE EXCEPTION 'El replay de pago no tiene fecha durable; requiere regularización'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    v_fecha := COALESCE(v_fecha_solicitada, app.hoy_tenant(p_tenant_id));
    IF v_metodo = 'efectivo' AND v_fecha IS DISTINCT FROM app.hoy_tenant(p_tenant_id) THEN
      RAISE EXCEPTION 'El pago de planilla en efectivo debe registrarse en la fecha local vigente de la sesión de caja'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  v_fecha_pago := ((v_fecha::timestamp + time '12:00') AT TIME ZONE v_timezone);

  v_payload := jsonb_build_object(
    'tenant_id', p_tenant_id, 'planilla_id', p_planilla_id,
    'monto', v_monto, 'moneda', v_moneda, 'metodo', v_metodo,
    'cuenta_bancaria_id', v_cuenta_id, 'sesion_caja_id', v_sesion_id,
    'referencia', v_referencia, 'fecha_pago', v_fecha
  );
  v_fingerprint := app.fingerprint_rrhh_495(v_payload);

  IF v_operacion.id IS NOT NULL THEN
    IF v_operacion.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'La clave idempotente de pago ya pertenece a otra intención o actor'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_operacion.resultado || jsonb_build_object('idempotent', true);
  END IF;
  IF lower(v_planilla.estado::text) = 'pagada' THEN
    RAISE EXCEPTION 'La planilla figura pagada sin evidencia tesorera 495; requiere conciliación'
      USING ERRCODE = '23514';
  END IF;

  IF v_metodo = 'transferencia' THEN
    SELECT * INTO v_banco FROM public.cuentas_bancarias
    WHERE id = v_cuenta_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta bancaria no encontrada para el tenant' USING ERRCODE = 'P0002';
    END IF;
    IF NOT COALESCE(v_banco.activa, false) OR NOT COALESCE(v_banco.activo, false)
       OR upper(COALESCE(v_banco.estado, '')) <> 'ACTIVO' THEN
      RAISE EXCEPTION 'Cuenta bancaria inactiva' USING ERRCODE = '23514';
    END IF;
    IF upper(COALESCE(v_banco.moneda, 'PEN')) <> v_moneda THEN
      RAISE EXCEPTION 'La moneda bancaria no coincide con la planilla'
        USING ERRCODE = '23514';
    END IF;
    v_saldo_anterior := round(COALESCE(v_banco.saldo, v_banco.saldo_actual, 0), 2);
    v_saldo_nuevo := round(v_saldo_anterior - v_monto, 2);
    IF NOT COALESCE(v_banco.permite_sobregiro, false) AND v_saldo_nuevo < 0 THEN
      RAISE EXCEPTION 'Saldo bancario insuficiente' USING ERRCODE = '23514';
    END IF;
    v_mov_banco_id := gen_random_uuid();
    INSERT INTO public.movimientos_bancarios (
      id, tenant_id, cuenta_bancaria_id, tipo, monto, monto_moneda_local,
      moneda, fecha, descripcion, referencia, metodo_pago, idempotency_key,
      conciliado, saldo_anterior, saldo_nuevo, created_by, metadata
    ) VALUES (
      v_mov_banco_id, p_tenant_id, v_cuenta_id, 'CARGO', v_monto, v_monto,
      v_moneda, v_fecha, format('Pago planilla %s', p_planilla_id),
      v_referencia, 'TRANSFERENCIA', format('rrhh-planilla:%s', v_key),
      false, v_saldo_anterior, v_saldo_nuevo, p_actor_id,
      jsonb_build_object('source', 'pagar_planilla_con_tesoreria_tx_495',
        'planilla_id', p_planilla_id, 'fingerprint', v_fingerprint)
    );
    UPDATE public.cuentas_bancarias
    SET saldo = v_saldo_nuevo, saldo_actual = v_saldo_nuevo,
        saldo_contable = v_saldo_nuevo, updated_at = now(), updated_by = p_actor_id
    WHERE id = v_cuenta_id AND tenant_id = p_tenant_id;
  ELSE
    v_sesion := app.resolve_cash_session_452(p_tenant_id, p_actor_id, v_sesion_id, v_moneda);
    v_mov_caja := app.append_cash_movement_452(
      v_sesion, p_actor_id, v_monto, 'OUT', 'rrhh_planilla_pago',
      p_planilla_id::text, format('Pago planilla %s', v_planilla.periodo),
      jsonb_build_object('source', 'pagar_planilla_con_tesoreria_tx_495',
        'planilla_id', p_planilla_id, 'fingerprint', v_fingerprint)
    );
  END IF;

  -- El writer 445 usa planillas.fecha_pago como fecha fuente para todas las
  -- proyecciones y para el outbox. Se fija antes de delegar, bajo el mismo lock
  -- y transacción, para que banco, nómina, historial y contabilidad compartan
  -- exactamente el mismo día solicitado.
  PERFORM set_config('app.planilla_transition', format('pagar:%s', p_planilla_id), true);
  UPDATE public.planillas
  SET fecha_pago = v_fecha_pago, updated_at = now()
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id;
  PERFORM set_config('app.planilla_transition', '', true);

  v_result := app.pagar_planilla_completa_tx(
    p_tenant_id, p_planilla_id, v_metodo, p_actor_id::text
  );
  v_event_id := app.to_uuid_or_null(v_result->>'eventId');
  UPDATE public.outbox_events
  SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
        'actorId', p_actor_id, 'moneda', v_moneda,
        'cuentaBancariaId', v_cuenta_id,
        'movimientoBancarioId', v_mov_banco_id,
        'sesionCajaId', v_sesion_id,
        'movimientoCajaId', v_mov_caja.id,
        'referenciaPago', v_referencia,
        'treasuryFingerprint', v_fingerprint
      ), updated_at = now()
  WHERE tenant_id = p_tenant_id AND event_id = v_event_id;

  v_result := v_result || jsonb_build_object(
    'cuentaBancariaId', v_cuenta_id,
    'movimientoBancarioId', v_mov_banco_id,
    'sesionCajaId', v_sesion_id,
    'movimientoCajaId', v_mov_caja.id,
    'fechaPago', v_fecha,
    'treasuryFingerprint', v_fingerprint,
    'idempotent', false
  );
  INSERT INTO public.rrhh_planilla_operaciones_495 (
    tenant_id, tipo, planilla_id, idempotency_key, request_fingerprint,
    actor_id, cuenta_bancaria_id, movimiento_bancario_id,
    sesion_caja_id, movimiento_caja_id, resultado
  ) VALUES (
    p_tenant_id, 'PAGAR', p_planilla_id, v_key, v_fingerprint,
    p_actor_id, v_cuenta_id, v_mov_banco_id,
    v_sesion_id, v_mov_caja.id, v_result
  );
  RETURN v_result;
END;
$function$;

-- Las mutaciones sensibles de liquidaciones y CTS conservan sus writers 449,
-- pero ahora exigen el permiso específico y segregación maker-checker.
CREATE OR REPLACE FUNCTION public.guardar_liquidacion_calculada_tx(
  p_tenant_id uuid, p_liquidacion jsonb, p_usuario_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_empleado_id uuid := app.to_uuid_or_null(p_liquidacion->>'id_empleado');
  v_fecha date := NULLIF(p_liquidacion->>'fecha_terminacion', '')::date;
  v_calculador uuid;
  v_estado text;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_usuario_id, 'rrhh.liquidaciones.calculate');
  IF v_empleado_id IS NOT NULL AND v_fecha IS NOT NULL THEN
    -- La función 449 identifica el replay por empleado+fecha, pero no incluía
    -- el actor en su fingerprint. Serializar esa identidad impide que dos
    -- calculadores se apropien del mismo resultado bajo carrera.
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_tenant_id::text || ':LIQUIDACION:' || v_empleado_id::text || ':' || v_fecha::text,
      495
    ));
    SELECT app.to_uuid_or_null(l.metadata->>'calculada_por'), lower(l.estado::text)
      INTO v_calculador, v_estado
    FROM public.liquidaciones l
    WHERE l.tenant_id = p_tenant_id
      AND l.id_empleado = v_empleado_id
      AND l.fecha_terminacion = v_fecha
      AND lower(l.estado::text) IN ('calculada', 'aprobada', 'pagada')
    ORDER BY l.created_at, l.id
    LIMIT 1
    FOR UPDATE;
    IF FOUND AND (v_calculador IS NULL OR v_calculador IS DISTINCT FROM p_usuario_id) THEN
      RAISE EXCEPTION 'El cálculo de liquidación ya pertenece a otro actor'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN app.guardar_liquidacion_calculada_tx(p_tenant_id, p_liquidacion, p_usuario_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirmar_liquidacion_tx(
  p_tenant_id uuid, p_liquidacion_id uuid, p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_calculador uuid;
  v_aprobador uuid;
  v_estado text;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_usuario_id, 'rrhh.liquidaciones.approve');
  SELECT app.to_uuid_or_null(metadata->>'calculada_por'), aprobado_por, lower(estado::text)
    INTO v_calculador, v_aprobador, v_estado
  FROM public.liquidaciones
  WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liquidación no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_estado = 'aprobada' THEN
    IF v_aprobador IS NULL THEN
      RAISE EXCEPTION 'La liquidación aprobada no tiene aprobador durable; requiere regularización'
        USING ERRCODE = '23514';
    END IF;
    IF v_aprobador IS DISTINCT FROM p_usuario_id THEN
      RAISE EXCEPTION 'La aprobación de liquidación ya pertenece a otro actor'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_calculador IS NULL OR v_calculador = p_usuario_id THEN
    RAISE EXCEPTION 'La liquidación exige aprobador distinto del calculador'
      USING ERRCODE = '42501';
  END IF;
  RETURN app.confirmar_liquidacion_tx(p_tenant_id, p_liquidacion_id, p_usuario_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pagar_liquidacion_tx(
  p_tenant_id uuid, p_liquidacion_id uuid, p_pago jsonb, p_usuario_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_aprobador uuid;
  v_estado text;
  v_fecha_durable timestamptz;
  v_pagador_durable uuid;
  v_pago_normalizado jsonb := COALESCE(p_pago, '{}'::jsonb);
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_usuario_id, 'rrhh.liquidaciones.pay');
  SELECT aprobado_por, lower(estado::text) INTO v_aprobador, v_estado FROM public.liquidaciones
  WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liquidación no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_aprobador IS NULL OR v_aprobador = p_usuario_id THEN
    RAISE EXCEPTION 'La liquidación exige pagador distinto del aprobador'
      USING ERRCODE = '42501';
  END IF;
  IF v_estado = 'pagada' THEN
    SELECT pl.pagado_por INTO v_pagador_durable
    FROM public.pagos_liquidaciones pl
    WHERE pl.tenant_id = p_tenant_id
      AND pl.liquidacion_id = p_liquidacion_id
      AND pl.estado = 'APLICADO'
    ORDER BY pl.created_at DESC, pl.id DESC
    LIMIT 1
    FOR SHARE;
    IF v_pagador_durable IS NULL THEN
      RAISE EXCEPTION 'La liquidación pagada no tiene pagador durable; requiere regularización'
        USING ERRCODE = '23514';
    END IF;
    IF v_pagador_durable IS DISTINCT FROM p_usuario_id THEN
      RAISE EXCEPTION 'El pago de liquidación ya pertenece a otro actor'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF lower(COALESCE(p_pago->>'metodo_pago', '')) = 'efectivo' THEN
    RAISE EXCEPTION 'El pago de liquidación en efectivo requiere la ruta tesorera explícita; use transferencia'
      USING ERRCODE = '23514';
  END IF;
  IF NULLIF(btrim(COALESCE(p_pago->>'fecha_pago', '')), '') IS NULL THEN
    IF v_estado = 'pagada' THEN
      SELECT pl.fecha_pago INTO v_fecha_durable
      FROM public.pagos_liquidaciones pl
      WHERE pl.tenant_id = p_tenant_id
        AND pl.liquidacion_id = p_liquidacion_id
        AND pl.estado = 'APLICADO'
      ORDER BY pl.created_at DESC
      LIMIT 1;
      IF v_fecha_durable IS NULL THEN
        RAISE EXCEPTION 'El retry de liquidación no tiene fecha de pago durable'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      v_fecha_durable := clock_timestamp();
    END IF;
    v_pago_normalizado := v_pago_normalizado || jsonb_build_object(
      'fecha_pago', v_fecha_durable
    );
  END IF;
  RETURN app.pagar_liquidacion_tx(
    p_tenant_id, p_liquidacion_id, v_pago_normalizado, p_usuario_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.revertir_pago_liquidacion_tx(
  p_tenant_id uuid, p_liquidacion_id uuid, p_motivo text, p_usuario_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_liquidacion public.liquidaciones%ROWTYPE;
  v_pago_aplicado public.pagos_liquidaciones%ROWTYPE;
  v_pago_revertido public.pagos_liquidaciones%ROWTYPE;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_usuario_id, 'rrhh.liquidaciones.reverse');
  SELECT * INTO v_liquidacion FROM public.liquidaciones
  WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liquidación no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'La reversa exige un motivo explícito' USING ERRCODE = '22023';
  END IF;

  IF lower(v_liquidacion.estado::text) = 'pagada' THEN
    IF v_liquidacion.pagado_por IS NULL OR v_liquidacion.pagado_por = p_usuario_id THEN
      RAISE EXCEPTION 'La reversa exige actor distinto del pagador'
        USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_pago_aplicado
    FROM public.pagos_liquidaciones
    WHERE tenant_id = p_tenant_id
      AND liquidacion_id = p_liquidacion_id
      AND estado = 'APLICADO'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR SHARE;
    IF NOT FOUND
       OR lower(coalesce(v_pago_aplicado.metodo_pago, '')) <> 'transferencia'
       OR v_pago_aplicado.cuenta_bancaria_id IS NULL
       OR v_pago_aplicado.movimiento_bancario_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.movimientos_bancarios mb
         JOIN public.plan_cuentas pc
           ON pc.id = app.to_uuid_or_null(mb.metadata->>'cuenta_contable_id')
          AND pc.tenant_id = mb.tenant_id
         WHERE mb.id = v_pago_aplicado.movimiento_bancario_id
           AND mb.tenant_id = p_tenant_id
           AND mb.cuenta_bancaria_id = v_pago_aplicado.cuenta_bancaria_id
           AND upper(coalesce(mb.tipo, '')) = 'CARGO'
           AND mb.metadata->>'ledger_frozen_by' = '492'
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'LIQUIDATION_PAYMENT_TREASURY_REGULARIZATION_REQUIRED',
        DETAIL = 'El pago original no tiene evidencia bancaria y cuenta contable congeladas; regularícelo antes de revertir.';
    END IF;
  ELSIF lower(v_liquidacion.estado::text) = 'aprobada' THEN
    SELECT * INTO v_pago_revertido
    FROM public.pagos_liquidaciones
    WHERE tenant_id = p_tenant_id
      AND liquidacion_id = p_liquidacion_id
      AND estado = 'REVERTIDO'
    ORDER BY fecha_reversion DESC, created_at DESC
    LIMIT 1
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La liquidación aprobada no tiene una reversa durable para reintentar'
        USING ERRCODE = '23514';
    END IF;
    IF v_pago_revertido.revertido_por IS DISTINCT FROM p_usuario_id THEN
      RAISE EXCEPTION 'La reversa ya pertenece a otro actor'
        USING ERRCODE = '42501';
    END IF;
    IF v_pago_revertido.motivo_reversion IS DISTINCT FROM v_motivo THEN
      RAISE EXCEPTION 'La reversa ya existe con un motivo diferente'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Sólo se revierte una liquidación pagada o un retry durable; estado %',
      v_liquidacion.estado USING ERRCODE = '23514';
  END IF;
  RETURN app.revertir_pago_liquidacion_tx(
    p_tenant_id, p_liquidacion_id, v_motivo, p_usuario_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_depositos_cts_calculados_tx(
  p_tenant_id uuid, p_periodo text, p_depositos jsonb, p_usuario_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_item jsonb;
  v_calculador uuid;
  v_estado text;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_usuario_id, 'rrhh.cts.calculate');
  IF jsonb_typeof(p_depositos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Los depósitos CTS deben enviarse como arreglo'
      USING ERRCODE = '22023';
  END IF;
  -- Serializa cada empleado en un orden estable. Así dos cálculos simultáneos
  -- sobre una fila aún inexistente no pueden reatribuir el maker mediante el
  -- ON CONFLICT histórico, y lotes con orden JSON inverso no se interbloquean.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':CTS:' || p_periodo || ':' || x.empleado_id::text,
    495
  ))
  FROM (
    SELECT DISTINCT app.to_uuid_or_null(value->>'empleado_id') AS empleado_id
    FROM jsonb_array_elements(p_depositos)
  ) x
  WHERE x.empleado_id IS NOT NULL
  ORDER BY x.empleado_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_depositos)
  LOOP
    SELECT app.to_uuid_or_null(d.metadata->>'calculado_por'), upper(d.estado)
      INTO v_calculador, v_estado
    FROM public.depositos_cts d
    WHERE d.tenant_id = p_tenant_id
      AND d.empleado_id = app.to_uuid_or_null(v_item->>'empleado_id')
      AND d.periodo = p_periodo
    FOR UPDATE;
    IF FOUND AND v_estado = 'CALCULADO'
       AND v_calculador IS DISTINCT FROM p_usuario_id THEN
      RAISE EXCEPTION 'El cálculo CTS ya pertenece a otro actor; no se puede reatribuir'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN app.guardar_depositos_cts_calculados_tx(p_tenant_id, p_periodo, p_depositos, p_usuario_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.depositar_cts_tx(
  p_tenant_id uuid, p_deposito_id uuid, p_pago jsonb, p_usuario_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_calculador uuid;
  v_estado text;
  v_fecha_durable date;
  v_depositante_durable uuid;
  v_pago_normalizado jsonb := COALESCE(p_pago, '{}'::jsonb);
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_usuario_id, 'rrhh.cts.deposit');
  SELECT app.to_uuid_or_null(metadata->>'calculado_por'), upper(estado), fecha_deposito,
         depositado_por
    INTO v_calculador, v_estado, v_fecha_durable, v_depositante_durable
  FROM public.depositos_cts
  WHERE id = p_deposito_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Depósito CTS no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_estado = 'DEPOSITADO' THEN
    IF v_depositante_durable IS NULL THEN
      RAISE EXCEPTION 'El depósito CTS no tiene actor durable; requiere regularización'
        USING ERRCODE = '23514';
    END IF;
    IF v_depositante_durable IS DISTINCT FROM p_usuario_id THEN
      RAISE EXCEPTION 'El depósito CTS ya pertenece a otro actor'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_calculador IS NULL OR v_calculador = p_usuario_id THEN
    RAISE EXCEPTION 'El depósito CTS exige actor distinto del calculador'
      USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(p_pago->>'fecha_deposito', '')), '') IS NULL THEN
    IF v_estado <> 'DEPOSITADO' THEN
      v_fecha_durable := app.hoy_tenant(p_tenant_id);
    ELSIF v_fecha_durable IS NULL THEN
      RAISE EXCEPTION 'El retry CTS no tiene fecha de depósito durable'
        USING ERRCODE = '23514';
    END IF;
    v_pago_normalizado := v_pago_normalizado || jsonb_build_object(
      'fecha_deposito', v_fecha_durable
    );
  END IF;
  RETURN app.depositar_cts_tx(
    p_tenant_id, p_deposito_id, v_pago_normalizado, p_usuario_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_planilla_borrador_tx_495(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_cambios jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_periodo text := NULLIF(btrim(COALESCE(p_cambios->>'periodo', '')), '');
  v_payload jsonb;
  v_fingerprint text;
  v_existing public.rrhh_planilla_operaciones_495%ROWTYPE;
  v_planilla public.planillas%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_actor_id, 'rrhh.planillas.create');
  IF jsonb_typeof(p_cambios) <> 'object' OR v_key IS NULL
     OR length(v_key) NOT BETWEEN 8 AND 180 THEN
    RAISE EXCEPTION 'Cambios y clave idempotente son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_cambios) k
    WHERE k NOT IN ('periodo', 'metadata', 'observaciones')
  ) THEN
    RAISE EXCEPTION 'Sólo se puede editar período, metadata u observaciones de un borrador'
      USING ERRCODE = '22023';
  END IF;
  IF p_cambios ? 'periodo' AND v_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'El período debe tener formato YYYY-MM' USING ERRCODE = '22023';
  END IF;
  IF p_cambios ? 'metadata' AND jsonb_typeof(p_cambios->'metadata') <> 'object' THEN
    RAISE EXCEPTION 'metadata debe ser un objeto JSON' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'planilla_id', p_planilla_id,
    'periodo', CASE WHEN p_cambios ? 'periodo' THEN v_periodo ELSE NULL END,
    'metadata', COALESCE(p_cambios->'metadata', '{}'::jsonb),
    'observaciones', NULLIF(btrim(COALESCE(p_cambios->>'observaciones', '')), '')
  );
  v_fingerprint := app.fingerprint_rrhh_495(v_payload);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':ACTUALIZAR:' || lower(v_key), 495));

  SELECT * INTO v_existing FROM public.rrhh_planilla_operaciones_495
  WHERE tenant_id = p_tenant_id AND tipo = 'ACTUALIZAR'
    AND lower(btrim(idempotency_key)) = lower(v_key) FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM p_actor_id
       OR v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'La clave idempotente de actualización pertenece a otra intención o actor'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_planilla FROM public.planillas
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planilla no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_planilla.estado::text) <> 'borrador' THEN
    RAISE EXCEPTION 'Sólo se edita una planilla en borrador' USING ERRCODE = '23514';
  END IF;

  IF p_cambios ? 'periodo' AND v_periodo IS DISTINCT FROM v_planilla.periodo THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':PLANILLA:' || v_periodo, 495));
    IF EXISTS (
      SELECT 1 FROM public.planillas
      WHERE tenant_id = p_tenant_id AND id <> p_planilla_id
        AND periodo = v_periodo AND lower(estado::text) <> 'anulada'
    ) THEN
      RAISE EXCEPTION 'Ya existe una planilla no anulada para el período %', v_periodo
        USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.planillas
  SET periodo = CASE WHEN p_cambios ? 'periodo' THEN v_periodo ELSE periodo END,
      metadata = COALESCE(metadata, '{}'::jsonb)
        || COALESCE(p_cambios->'metadata', '{}'::jsonb)
        || CASE WHEN p_cambios ? 'observaciones'
             THEN jsonb_build_object('observaciones', NULLIF(btrim(p_cambios->>'observaciones'), ''))
             ELSE '{}'::jsonb END
        || jsonb_build_object('actualizada_por', p_actor_id, 'actualizada_en', clock_timestamp()),
      updated_at = now()
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_planilla;

  v_result := jsonb_build_object(
    'success', true, 'id', v_planilla.id, 'tenant_id', p_tenant_id,
    'periodo', v_planilla.periodo, 'estado', v_planilla.estado,
    'estado_pago', v_planilla.estado_pago, 'metadata', v_planilla.metadata,
    'idempotent', false
  );
  INSERT INTO public.rrhh_planilla_operaciones_495 (
    tenant_id, tipo, planilla_id, idempotency_key, request_fingerprint, actor_id, resultado
  ) VALUES (
    p_tenant_id, 'ACTUALIZAR', p_planilla_id, v_key, v_fingerprint, p_actor_id, v_result
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_planilla_borrador_tx_495(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_fingerprint text;
  v_existing public.rrhh_planilla_operaciones_495%ROWTYPE;
  v_planilla public.planillas%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM app.assert_rrhh_permission_495(p_tenant_id, p_actor_id, 'rrhh.planillas.create');
  IF v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 180 THEN
    RAISE EXCEPTION 'La clave idempotente de eliminación es obligatoria' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := app.fingerprint_rrhh_495(jsonb_build_object(
    'tenant_id', p_tenant_id, 'planilla_id', p_planilla_id
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':ELIMINAR:' || lower(v_key), 495));

  SELECT * INTO v_existing FROM public.rrhh_planilla_operaciones_495
  WHERE tenant_id = p_tenant_id AND tipo = 'ELIMINAR'
    AND lower(btrim(idempotency_key)) = lower(v_key) FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_id IS DISTINCT FROM p_actor_id
       OR v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'La clave idempotente de eliminación pertenece a otra intención o actor'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.resultado || jsonb_build_object('idempotent', true);
  END IF;

  SELECT * INTO v_planilla FROM public.planillas
  WHERE id = p_planilla_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planilla no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF lower(v_planilla.estado::text) <> 'borrador' THEN
    RAISE EXCEPTION 'Sólo se elimina una planilla en borrador' USING ERRCODE = '23514';
  END IF;

  v_result := jsonb_build_object(
    'success', true, 'id', p_planilla_id, 'periodo', v_planilla.periodo,
    'estado', 'eliminada', 'idempotent', false
  );
  INSERT INTO public.rrhh_planilla_operaciones_495 (
    tenant_id, tipo, planilla_id, idempotency_key, request_fingerprint, actor_id, resultado
  ) VALUES (
    p_tenant_id, 'ELIMINAR', p_planilla_id, v_key, v_fingerprint, p_actor_id, v_result
  );
  DELETE FROM public.planillas WHERE id = p_planilla_id AND tenant_id = p_tenant_id;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION app.sembrar_permisos_rrhh_financiero_495(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.seed_rrhh_role_495()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_rrhh_permission_495(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.fingerprint_rrhh_495(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.guardar_calculo_planilla_tx(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.aprobar_planilla_tx(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.pagar_planilla_completa_tx(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.guardar_liquidacion_calculada_tx(uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.confirmar_liquidacion_tx(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.pagar_liquidacion_tx(uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.revertir_pago_liquidacion_tx(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.guardar_depositos_cts_calculados_tx(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.depositar_cts_tx(uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.crear_planilla_tx_495(uuid, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_planilla_borrador_tx_495(uuid, uuid, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eliminar_planilla_borrador_tx_495(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_calculo_planilla_tx(uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_calculo_planilla_tx(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.aprobar_planilla_tx(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pagar_planilla_completa_tx(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pagar_planilla_con_tesoreria_tx_495(uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_liquidacion_calculada_tx(uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirmar_liquidacion_tx(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pagar_liquidacion_tx(uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revertir_pago_liquidacion_tx(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_depositos_cts_calculados_tx(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.depositar_cts_tx(uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crear_planilla_tx_495(uuid, jsonb, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_planilla_borrador_tx_495(uuid, uuid, jsonb, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.eliminar_planilla_borrador_tx_495(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_calculo_planilla_tx(uuid, uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.aprobar_planilla_tx(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pagar_planilla_con_tesoreria_tx_495(uuid, uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_liquidacion_calculada_tx(uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_liquidacion_tx(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pagar_liquidacion_tx(uuid, uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revertir_pago_liquidacion_tx(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_depositos_cts_calculados_tx(uuid, text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.depositar_cts_tx(uuid, uuid, jsonb, uuid) TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.rrhh_planilla_operaciones_495,
     public.planillas, public.empleado_planilla,
     public.empleado_planilla_conceptos, public.pagos_empleados,
     public.rrhh_pagos, public.historial_pagos_planilla
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.rrhh_planilla_operaciones_495,
  public.planillas, public.empleado_planilla,
  public.empleado_planilla_conceptos, public.pagos_empleados,
  public.rrhh_pagos, public.historial_pagos_planilla,
  public.empleados, public.contratos, public.conceptos_planilla,
  public.liquidaciones, public.pagos_liquidaciones, public.depositos_cts,
  public.cuentas_bancarias, public.movimientos_bancarios,
  public.sesiones_caja, public.movimientos_caja
TO service_role;

COMMENT ON FUNCTION public.pagar_planilla_con_tesoreria_tx_495(uuid, uuid, jsonb, uuid) IS
  'Paga una planilla con maker-checker, banco/caja, nómina y outbox en un solo commit idempotente.';

COMMIT;

NOTIFY pgrst, 'reload schema';
