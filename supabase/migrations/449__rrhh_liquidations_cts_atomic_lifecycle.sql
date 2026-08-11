-- ============================================================================
-- 449__rrhh_liquidations_cts_atomic_lifecycle.sql
-- Cierra el ciclo operativo de liquidaciones y CTS:
--   calculo (sin cese) -> aprobacion/devengo -> pago/tesoreria -> reversa
--   calculo CTS -> deposito/tesoreria
-- Cada cambio de estado sensible exige actor, lock, idempotencia y outbox.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, extensions, pg_temp;

CREATE TABLE IF NOT EXISTS public.pagos_liquidaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  liquidacion_id uuid NOT NULL REFERENCES public.liquidaciones(id) ON DELETE RESTRICT,
  monto numeric(14,2) NOT NULL,
  moneda text NOT NULL,
  metodo_pago text NOT NULL,
  cuenta_bancaria_id uuid REFERENCES public.cuentas_bancarias(id) ON DELETE RESTRICT,
  movimiento_bancario_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'APLICADO',
  referencia text,
  fecha_pago timestamptz NOT NULL,
  pagado_por uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  fecha_reversion timestamptz,
  revertido_por uuid REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  motivo_reversion text,
  movimiento_reversion_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL,
  reversion_event_id uuid,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pagos_liquidaciones_monto CHECK (monto > 0),
  CONSTRAINT ck_pagos_liquidaciones_moneda CHECK (moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_pagos_liquidaciones_metodo CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  CONSTRAINT ck_pagos_liquidaciones_estado CHECK (estado IN ('APLICADO', 'REVERTIDO')),
  CONSTRAINT ck_pagos_liquidaciones_banco CHECK (
    (metodo_pago = 'transferencia' AND cuenta_bancaria_id IS NOT NULL AND referencia IS NOT NULL)
    OR (metodo_pago = 'efectivo' AND cuenta_bancaria_id IS NULL)
  ),
  CONSTRAINT ck_pagos_liquidaciones_reversion CHECK (
    (estado = 'APLICADO' AND fecha_reversion IS NULL AND revertido_por IS NULL)
    OR (estado = 'REVERTIDO' AND fecha_reversion IS NOT NULL AND revertido_por IS NOT NULL
        AND motivo_reversion IS NOT NULL AND reversion_event_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_liquidaciones_idempotency
  ON public.pagos_liquidaciones (tenant_id, lower(btrim(idempotency_key)));
CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_liquidaciones_event_id
  ON public.pagos_liquidaciones (tenant_id, event_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_liquidaciones_reversion_event_id
  ON public.pagos_liquidaciones (tenant_id, reversion_event_id)
  WHERE reversion_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_liquidaciones_activo
  ON public.pagos_liquidaciones (tenant_id, liquidacion_id)
  WHERE estado = 'APLICADO';
CREATE INDEX IF NOT EXISTS idx_pagos_liquidaciones_historial
  ON public.pagos_liquidaciones (tenant_id, liquidacion_id, created_at DESC);

ALTER TABLE public.pagos_liquidaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_liquidaciones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.pagos_liquidaciones;
CREATE POLICY tenant_isolation ON public.pagos_liquidaciones
  FOR SELECT
  USING (app.is_superadmin() OR tenant_id = app.current_tenant_id());

DROP TRIGGER IF EXISTS trg_set_updated_at_pagos_liquidaciones ON public.pagos_liquidaciones;
CREATE TRIGGER trg_set_updated_at_pagos_liquidaciones
  BEFORE UPDATE ON public.pagos_liquidaciones
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE public.depositos_cts
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid REFERENCES public.cuentas_bancarias(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS movimiento_bancario_id uuid REFERENCES public.movimientos_bancarios(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS depositado_por uuid REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_depositos_cts_event_id_449
  ON public.depositos_cts (tenant_id, event_id)
  WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_depositos_cts_idempotency_449
  ON public.depositos_cts (tenant_id, lower(btrim(idempotency_key)))
  WHERE idempotency_key IS NOT NULL;

-- El normalizador legado inventaba "transferencia" incluso en CALCULADA o
-- APROBADA. El medio sólo existe cuando hay un pago aplicado.
CREATE OR REPLACE FUNCTION app.normalize_liquidaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $function$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.id_empleado := COALESCE(
    app.to_uuid_or_null(COALESCE(NEW.id_empleado::text, '')),
    app.to_uuid_or_null(COALESCE(NEW.empleado_id::text, ''))
  );
  NEW.empleado_id := NEW.id_empleado;
  NEW.aprobado_por := app.to_uuid_or_null(COALESCE(NEW.aprobado_por::text, ''));
  NEW.pagado_por := app.to_uuid_or_null(COALESCE(NEW.pagado_por::text, ''));
  NEW.fecha_terminacion := COALESCE(
    app.to_date_or_null(COALESCE(NEW.fecha_terminacion::text, '')),
    NEW.created_at::date,
    app.hoy_tenant(NEW.tenant_id)
  );
  NEW.ultimo_dia_trabajado := COALESCE(
    app.to_date_or_null(COALESCE(NEW.ultimo_dia_trabajado::text, '')),
    NEW.fecha_terminacion
  );
  IF NEW.ultimo_dia_trabajado > NEW.fecha_terminacion THEN
    NEW.ultimo_dia_trabajado := NEW.fecha_terminacion;
  END IF;
  NEW.fecha_calculo := COALESCE(
    app.to_timestamptz_or_null(COALESCE(NEW.fecha_calculo::text, '')),
    NEW.created_at,
    now()
  );
  NEW.fecha_pago := app.to_timestamptz_or_null(COALESCE(NEW.fecha_pago::text, ''));
  NEW.motivo_terminacion := lower(COALESCE(
    NULLIF(btrim(COALESCE(NEW.motivo_terminacion, '')), ''), 'otro'
  ));
  IF NEW.motivo_terminacion NOT IN (
    'renuncia', 'despido', 'fin_contrato', 'mutuo_acuerdo',
    'abandono', 'fallecimiento', 'otro'
  ) THEN
    NEW.motivo_terminacion := 'otro';
  END IF;
  NEW.estado := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'calculada'));
  IF NEW.estado = 'activo' THEN
    NEW.estado := 'calculada';
  ELSIF NEW.estado = 'inactivo' THEN
    NEW.estado := 'anulada';
  END IF;
  IF NEW.estado NOT IN ('calculada', 'aprobada', 'pagada', 'anulada') THEN
    NEW.estado := 'calculada';
  END IF;
  IF NEW.estado = 'pagada' THEN
    NEW.metodo_pago := lower(COALESCE(
      NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'transferencia'
    ));
    IF NEW.metodo_pago NOT IN ('transferencia', 'efectivo', 'cheque', 'deposito', 'otro') THEN
      NEW.metodo_pago := 'otro';
    END IF;
    IF NEW.fecha_pago IS NULL THEN NEW.fecha_pago := now(); END IF;
  ELSE
    NEW.metodo_pago := CASE
      WHEN NEW.fecha_pago IS NULL AND NEW.pagado_por IS NULL THEN NULL
      ELSE NULLIF(lower(btrim(COALESCE(NEW.metodo_pago, ''))), '')
    END;
  END IF;
  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.monto_cts := GREATEST(COALESCE(NEW.monto_cts, 0), 0);
  NEW.vacaciones_pendientes := GREATEST(COALESCE(NEW.vacaciones_pendientes, 0), 0);
  NEW.indemnizacion := GREATEST(COALESCE(NEW.indemnizacion, 0), 0);
  NEW.dias_cts := GREATEST(COALESCE(NEW.dias_cts, 0), 0);
  NEW.total_liquidacion := GREATEST(
    COALESCE(NEW.total_liquidacion, 0), NEW.monto_cts + NEW.indemnizacion
  );
  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'anulada');
  IF NEW.estado = 'anulada' THEN NEW.activo := false; END IF;
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Liquidacion');
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('LIQ-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- Corrige filas heredadas donde el normalizador anterior invento un medio de
-- pago antes de que existiera evidencia aplicada. Se retira temporalmente solo
-- el guard 449 para que la propia migracion pueda limpiar ese dato derivado.
DROP TRIGGER IF EXISTS trg_liquidacion_lifecycle_449 ON public.liquidaciones;
UPDATE public.liquidaciones
SET metodo_pago = NULL, updated_at = now()
WHERE lower(estado::text) <> 'pagada'
  AND fecha_pago IS NULL
  AND pagado_por IS NULL
  AND metodo_pago IS NOT NULL;

CREATE OR REPLACE FUNCTION app.enforce_liquidacion_lifecycle_449()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_transition text := COALESCE(current_setting('app.liquidacion_transition', true), '');
BEGIN
  IF lower(OLD.estado::text) IS DISTINCT FROM lower(NEW.estado::text) THEN
    IF NOT (
      (lower(OLD.estado::text) = 'calculada' AND lower(NEW.estado::text) = 'aprobada'
        AND v_transition = format('confirmar:%s', OLD.id))
      OR (lower(OLD.estado::text) = 'aprobada' AND lower(NEW.estado::text) = 'pagada'
        AND v_transition = format('pagar:%s', OLD.id))
      OR (lower(OLD.estado::text) = 'pagada' AND lower(NEW.estado::text) = 'aprobada'
        AND v_transition = format('revertir:%s', OLD.id))
    ) THEN
      RAISE EXCEPTION 'Transicion directa de liquidacion no permitida: % -> %', OLD.estado, NEW.estado
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF ROW(OLD.fecha_pago, OLD.metodo_pago, OLD.pagado_por)
       IS DISTINCT FROM ROW(NEW.fecha_pago, NEW.metodo_pago, NEW.pagado_por)
     AND v_transition NOT IN (format('pagar:%s', OLD.id), format('revertir:%s', OLD.id)) THEN
    RAISE EXCEPTION 'Los datos de pago de una liquidacion solo cambian por su RPC canonica'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_liquidacion_lifecycle_449 ON public.liquidaciones;
CREATE TRIGGER trg_liquidacion_lifecycle_449
  BEFORE UPDATE ON public.liquidaciones
  FOR EACH ROW EXECUTE FUNCTION app.enforce_liquidacion_lifecycle_449();

CREATE OR REPLACE FUNCTION app.enforce_deposito_cts_lifecycle_449()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_transition text := COALESCE(current_setting('app.cts_transition', true), '');
BEGIN
  IF upper(OLD.estado) IS DISTINCT FROM upper(NEW.estado) THEN
    IF NOT (
      (upper(OLD.estado) = 'CALCULADO' AND upper(NEW.estado) = 'DEPOSITADO'
        AND v_transition = format('depositar:%s', OLD.id))
      OR (upper(OLD.estado) = 'CALCULADO' AND upper(NEW.estado) = 'ANULADO'
        AND v_transition LIKE 'liquidacion:%')
    ) THEN
      RAISE EXCEPTION 'Transicion directa de CTS no permitida: % -> %', OLD.estado, NEW.estado
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_deposito_cts_lifecycle_449 ON public.depositos_cts;
CREATE TRIGGER trg_deposito_cts_lifecycle_449
  BEFORE UPDATE ON public.depositos_cts
  FOR EACH ROW EXECUTE FUNCTION app.enforce_deposito_cts_lifecycle_449();

CREATE OR REPLACE FUNCTION app.assert_rrhh_actor_449(p_tenant_id uuid, p_usuario_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_usuario_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema us
    WHERE us.id = p_usuario_id AND us.tenant_id = p_tenant_id
      AND COALESCE(us.activo, false)
      AND lower(us.estado::text) = 'activo'
  ) THEN
    RAISE EXCEPTION 'Actor RRHH obligatorio y perteneciente al tenant'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.enforce_pagos_liquidaciones_tenant_449()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_liquidacion public.liquidaciones%ROWTYPE;
  v_ref_tenant uuid;
  v_ref_cuenta uuid;
BEGIN
  SELECT * INTO v_liquidacion
  FROM public.liquidaciones l
  WHERE l.id = NEW.liquidacion_id;
  IF NOT FOUND OR v_liquidacion.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'El pago y su liquidacion deben pertenecer al mismo tenant'
      USING ERRCODE = '23514';
  END IF;
  IF round(NEW.monto, 2) IS DISTINCT FROM round(v_liquidacion.total_liquidacion, 2)
     OR upper(NEW.moneda) IS DISTINCT FROM upper(v_liquidacion.moneda) THEN
    RAISE EXCEPTION 'El pago debe congelar importe y moneda de la liquidacion'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.pagado_por IS DISTINCT FROM OLD.pagado_por THEN
    PERFORM app.assert_rrhh_actor_449(NEW.tenant_id, NEW.pagado_por);
  END IF;
  IF NEW.revertido_por IS NOT NULL THEN
    PERFORM app.assert_rrhh_actor_449(NEW.tenant_id, NEW.revertido_por);
  END IF;

  IF NEW.metodo_pago = 'transferencia' THEN
    SELECT cb.tenant_id INTO v_ref_tenant
    FROM public.cuentas_bancarias cb WHERE cb.id = NEW.cuenta_bancaria_id;
    IF NOT FOUND OR v_ref_tenant IS DISTINCT FROM NEW.tenant_id
       OR NEW.movimiento_bancario_id IS NULL THEN
      RAISE EXCEPTION 'La cuenta/movimiento bancario del pago no pertenece al tenant'
        USING ERRCODE = '23514';
    END IF;
    SELECT mb.tenant_id, mb.cuenta_bancaria_id INTO v_ref_tenant, v_ref_cuenta
    FROM public.movimientos_bancarios mb WHERE mb.id = NEW.movimiento_bancario_id;
    IF NOT FOUND OR v_ref_tenant IS DISTINCT FROM NEW.tenant_id
       OR v_ref_cuenta IS DISTINCT FROM NEW.cuenta_bancaria_id THEN
      RAISE EXCEPTION 'El movimiento bancario original no coincide con el pago'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.cuenta_bancaria_id IS NOT NULL OR NEW.movimiento_bancario_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un pago en efectivo no puede enlazar tesoreria bancaria'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.movimiento_reversion_id IS NOT NULL THEN
    SELECT mb.tenant_id, mb.cuenta_bancaria_id INTO v_ref_tenant, v_ref_cuenta
    FROM public.movimientos_bancarios mb WHERE mb.id = NEW.movimiento_reversion_id;
    IF NOT FOUND OR v_ref_tenant IS DISTINCT FROM NEW.tenant_id
       OR v_ref_cuenta IS DISTINCT FROM NEW.cuenta_bancaria_id THEN
      RAISE EXCEPTION 'El movimiento bancario de reversa no coincide con el pago'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pagos_liquidaciones_tenant_449 ON public.pagos_liquidaciones;
CREATE TRIGGER trg_pagos_liquidaciones_tenant_449
  BEFORE INSERT OR UPDATE ON public.pagos_liquidaciones
  FOR EACH ROW EXECUTE FUNCTION app.enforce_pagos_liquidaciones_tenant_449();

CREATE OR REPLACE FUNCTION app.enforce_depositos_cts_tenant_449()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_ref_tenant uuid;
  v_ref_cuenta uuid;
BEGIN
  SELECT e.tenant_id INTO v_ref_tenant
  FROM public.empleados e WHERE e.id = NEW.empleado_id;
  IF NOT FOUND OR v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'El deposito CTS y su empleado deben pertenecer al mismo tenant'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.cuenta_bancaria_id IS NOT NULL THEN
    SELECT cb.tenant_id INTO v_ref_tenant
    FROM public.cuentas_bancarias cb WHERE cb.id = NEW.cuenta_bancaria_id;
    IF NOT FOUND OR v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'La cuenta bancaria CTS no pertenece al tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.movimiento_bancario_id IS NOT NULL THEN
    SELECT mb.tenant_id, mb.cuenta_bancaria_id INTO v_ref_tenant, v_ref_cuenta
    FROM public.movimientos_bancarios mb WHERE mb.id = NEW.movimiento_bancario_id;
    IF NOT FOUND OR v_ref_tenant IS DISTINCT FROM NEW.tenant_id
       OR v_ref_cuenta IS DISTINCT FROM NEW.cuenta_bancaria_id THEN
      RAISE EXCEPTION 'El movimiento bancario CTS no coincide con su cuenta y tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.depositado_por IS NOT NULL THEN
    PERFORM app.assert_rrhh_actor_449(NEW.tenant_id, NEW.depositado_por);
  END IF;
  IF upper(NEW.estado) = 'DEPOSITADO' AND (
    NEW.fecha_deposito IS NULL OR NEW.cuenta_bancaria_id IS NULL
    OR NEW.movimiento_bancario_id IS NULL OR NEW.depositado_por IS NULL
    OR NEW.event_id IS NULL OR NULLIF(btrim(NEW.idempotency_key), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'CTS depositada requiere evidencia completa de tesoreria y evento'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_depositos_cts_tenant_449 ON public.depositos_cts;
CREATE TRIGGER trg_depositos_cts_tenant_449
  BEFORE INSERT OR UPDATE ON public.depositos_cts
  FOR EACH ROW EXECUTE FUNCTION app.enforce_depositos_cts_tenant_449();

CREATE OR REPLACE FUNCTION app.guardar_liquidacion_calculada_tx(
  p_tenant_id uuid,
  p_liquidacion jsonb,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_empleado public.empleados%ROWTYPE;
  v_existente public.liquidaciones%ROWTYPE;
  v_creada public.liquidaciones%ROWTYPE;
  v_empleado_id uuid := app.to_uuid_or_null(p_liquidacion->>'id_empleado');
  v_fecha date := NULLIF(p_liquidacion->>'fecha_terminacion', '')::date;
  v_motivo text := lower(btrim(COALESCE(p_liquidacion->>'motivo_terminacion', '')));
  v_pais text := upper(btrim(COALESCE(p_liquidacion->>'pais_codigo', '')));
  v_moneda text := upper(btrim(COALESCE(p_liquidacion->>'moneda', '')));
  v_monto_cts numeric(14,2) := round(COALESCE((p_liquidacion->>'monto_cts')::numeric, 0), 2);
  v_vacaciones numeric(14,2) := round(COALESCE((p_liquidacion->>'vacaciones_pendientes')::numeric, 0), 2);
  v_indemnizacion numeric(14,2) := round(COALESCE((p_liquidacion->>'indemnizacion')::numeric, 0), 2);
  v_dias_cts integer := COALESCE((p_liquidacion->>'dias_cts')::integer, 0);
  v_total numeric(14,2) := round(COALESCE((p_liquidacion->>'total_liquidacion')::numeric, 0), 2);
  v_metadata jsonb := COALESCE(p_liquidacion->'metadata', '{}'::jsonb);
  v_fingerprint text;
  v_contratos integer;
BEGIN
  IF p_tenant_id IS NULL OR jsonb_typeof(p_liquidacion) <> 'object'
     OR v_empleado_id IS NULL OR v_fecha IS NULL THEN
    RAISE EXCEPTION 'tenant, empleado y fecha de terminacion son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_rrhh_actor_449(p_tenant_id, p_usuario_id);
  IF v_motivo NOT IN (
    'renuncia', 'despido', 'fin_contrato', 'mutuo_acuerdo',
    'abandono', 'fallecimiento', 'otro'
  ) OR v_pais NOT IN ('PE', 'AR', 'CO') OR v_moneda !~ '^[A-Z]{3}$'
     OR v_monto_cts < 0 OR v_vacaciones < 0 OR v_indemnizacion < 0
     OR v_dias_cts < 0 OR v_total <= 0 OR v_total < v_monto_cts + v_indemnizacion THEN
    RAISE EXCEPTION 'Datos calculados de liquidacion invalidos' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_empleado FROM public.empleados
  WHERE id = v_empleado_id AND tenant_id = p_tenant_id
    AND lower(estado::text) = 'activo'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empleado inexistente, inactivo o de otro tenant' USING ERRCODE = '23503';
  END IF;
  IF v_fecha < v_empleado.fecha_ingreso THEN
    RAISE EXCEPTION 'La terminacion no puede ser anterior al ingreso' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_contratos FROM public.contratos
  WHERE tenant_id = p_tenant_id AND id_empleado = v_empleado_id
    AND lower(estado::text) IN ('vigente', 'renovado', 'en_periodo_prueba');
  IF v_contratos <> 1 THEN
    RAISE EXCEPTION 'El calculo requiere exactamente un contrato laboral activo; encontrados %', v_contratos
      USING ERRCODE = '23514';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'empleado_id', v_empleado_id, 'fecha_terminacion', v_fecha,
    'motivo', v_motivo, 'pais', v_pais, 'moneda', v_moneda,
    'monto_cts', v_monto_cts, 'vacaciones_pendientes', v_vacaciones,
    'indemnizacion', v_indemnizacion, 'dias_cts', v_dias_cts,
    'total', v_total, 'metadata', v_metadata
  )::text, 'UTF8'), 'sha256'), 'hex');

  SELECT * INTO v_existente FROM public.liquidaciones
  WHERE tenant_id = p_tenant_id AND id_empleado = v_empleado_id
    AND fecha_terminacion = v_fecha
    AND lower(estado::text) IN ('calculada', 'aprobada', 'pagada')
  LIMIT 1;
  IF FOUND THEN
    IF lower(v_existente.estado::text) = 'calculada'
       AND COALESCE(v_existente.metadata->>'calculation_fingerprint', '') = v_fingerprint THEN
      RETURN jsonb_build_object('success', true, 'data', to_jsonb(v_existente), 'idempotent', true);
    END IF;
    RAISE EXCEPTION 'Ya existe una liquidacion activa para el empleado y fecha con otro calculo o estado'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.liquidaciones (
    tenant_id, id_empleado, motivo_terminacion, fecha_terminacion,
    ultimo_dia_trabajado, monto_cts, vacaciones_pendientes, indemnizacion,
    dias_cts, total_liquidacion, estado, pais_codigo, moneda, metadata
  ) VALUES (
    p_tenant_id, v_empleado_id, v_motivo, v_fecha, v_fecha,
    v_monto_cts, v_vacaciones, v_indemnizacion, v_dias_cts, v_total,
    'calculada', v_pais, v_moneda,
    v_metadata || jsonb_build_object(
      'calculation_fingerprint', v_fingerprint,
      'calculada_por', p_usuario_id,
      'calculada_en', clock_timestamp()
    )
  ) RETURNING * INTO v_creada;

  RETURN jsonb_build_object('success', true, 'data', to_jsonb(v_creada), 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION app.confirmar_liquidacion_tx(
  p_tenant_id uuid,
  p_liquidacion_id uuid,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_liquidacion public.liquidaciones%ROWTYPE;
  v_estado_inicial text;
  v_event_id uuid;
  v_outbox_id uuid;
  v_key text;
  v_contratos integer;
  v_cts_pendiente numeric(14,2);
BEGIN
  IF p_tenant_id IS NULL OR p_liquidacion_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id y liquidacion_id son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_rrhh_actor_449(p_tenant_id, p_usuario_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  SELECT * INTO v_liquidacion
  FROM public.liquidaciones
  WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidacion no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;
  v_estado_inicial := lower(v_liquidacion.estado::text);
  IF v_estado_inicial NOT IN ('calculada', 'aprobada') THEN
    RAISE EXCEPTION 'Solo se puede confirmar una liquidacion calculada; estado actual %', v_liquidacion.estado
      USING ERRCODE = '23514';
  END IF;
  IF COALESCE(v_liquidacion.total_liquidacion, 0) <= 0 THEN
    RAISE EXCEPTION 'La liquidacion debe tener un total positivo' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.empleados
  WHERE id = v_liquidacion.id_empleado AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empleado no encontrado para el tenant' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado_inicial = 'calculada' THEN
    SELECT count(*) INTO v_contratos
    FROM public.contratos
    WHERE tenant_id = p_tenant_id
      AND id_empleado = v_liquidacion.id_empleado
      AND lower(estado::text) IN ('vigente', 'renovado', 'en_periodo_prueba');
    IF v_contratos <> 1 THEN
      RAISE EXCEPTION 'La confirmacion requiere exactamente un contrato laboral activo; encontrados %', v_contratos
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.contratos
    SET estado = 'terminado', fecha_fin = v_liquidacion.fecha_terminacion,
        activo = false, updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND id_empleado = v_liquidacion.id_empleado
      AND lower(estado::text) IN ('vigente', 'renovado', 'en_periodo_prueba');
    GET DIAGNOSTICS v_contratos = ROW_COUNT;
    IF v_contratos <> 1 THEN
      RAISE EXCEPTION 'El cese no pudo cerrar exactamente un contrato laboral; afectados %', v_contratos
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.empleados
    SET estado = 'inactivo', activo = false, updated_at = now()
    WHERE id = v_liquidacion.id_empleado AND tenant_id = p_tenant_id;

    IF upper(COALESCE(v_liquidacion.pais_codigo, 'PE')) = 'PE' THEN
      SELECT round(COALESCE(sum(d.monto), 0), 2) INTO v_cts_pendiente
      FROM public.depositos_cts d
      WHERE d.tenant_id = p_tenant_id
        AND d.empleado_id = v_liquidacion.id_empleado
        AND upper(d.estado) = 'CALCULADO'
        AND d.semestre_fin < v_liquidacion.fecha_terminacion;
      IF abs(v_cts_pendiente - COALESCE(
        (v_liquidacion.metadata->>'monto_cts_semestres_pendientes')::numeric, 0
      )) > 0.01 THEN
        RAISE EXCEPTION 'Los depositos CTS pendientes cambiaron desde el calculo; recalcule la liquidacion'
          USING ERRCODE = '40001';
      END IF;
      PERFORM set_config('app.cts_transition', format('liquidacion:%s', p_liquidacion_id), true);
      UPDATE public.depositos_cts
      SET estado = 'ANULADO',
          observaciones = COALESCE(observaciones || E'\n', '') || 'Incluido en liquidacion final',
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'incluido_en_liquidacion_id', p_liquidacion_id,
            'incluido_en_liquidacion_at', clock_timestamp()
          ),
          updated_at = now()
      WHERE tenant_id = p_tenant_id
        AND empleado_id = v_liquidacion.id_empleado
        AND upper(estado) = 'CALCULADO'
        AND semestre_fin < v_liquidacion.fecha_terminacion;
      PERFORM set_config('app.cts_transition', '', true);
    END IF;

    PERFORM set_config('app.liquidacion_transition', format('confirmar:%s', p_liquidacion_id), true);
    UPDATE public.liquidaciones
    SET estado = 'aprobada', aprobado_por = p_usuario_id,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'accounting_handled_by_outbox', true,
          'aprobada_por', p_usuario_id,
          'aprobada_en', clock_timestamp()
        ),
        updated_at = now()
    WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id;
    PERFORM set_config('app.liquidacion_transition', '', true);
  END IF;

  v_key := format('liquidacion.aprobada:%s:%s', p_tenant_id, p_liquidacion_id);
  SELECT id, event_id INTO v_outbox_id, v_event_id
  FROM public.outbox_events
  WHERE tenant_id = p_tenant_id
    AND event_type = 'liquidacion.aprobada'
    AND (idempotency_key = v_key OR aggregate_id = p_liquidacion_id::text)
  ORDER BY (idempotency_key = v_key) DESC, created_at, id
  LIMIT 1 FOR UPDATE;

  IF v_outbox_id IS NULL THEN
    v_event_id := gen_random_uuid();
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, idempotency_key, event_id, occurred_at
    ) VALUES (
      p_tenant_id, 'liquidacion', p_liquidacion_id::text, 'liquidacion.aprobada',
      jsonb_build_object(
        'eventId', v_event_id, 'tenantId', p_tenant_id, 'idempotencyKey', v_key,
        'liquidacionId', p_liquidacion_id, 'empleadoId', v_liquidacion.id_empleado,
        'fecha', v_liquidacion.fecha_terminacion,
        'totalLiquidacion', v_liquidacion.total_liquidacion,
        'paisCodigo', v_liquidacion.pais_codigo, 'moneda', v_liquidacion.moneda,
        'actorId', p_usuario_id, 'accountingHandledByOutbox', true
      ),
      'pending', 0, v_key, v_event_id, clock_timestamp()
    );
  ELSE
    v_event_id := COALESCE(v_event_id, gen_random_uuid());
    UPDATE public.outbox_events
    SET event_id = v_event_id,
        idempotency_key = v_key,
        aggregate_type = 'liquidacion',
        aggregate_id = p_liquidacion_id::text,
        payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
          'eventId', v_event_id, 'tenantId', p_tenant_id, 'idempotencyKey', v_key,
          'liquidacionId', p_liquidacion_id, 'empleadoId', v_liquidacion.id_empleado,
          'fecha', v_liquidacion.fecha_terminacion,
          'totalLiquidacion', v_liquidacion.total_liquidacion,
          'paisCodigo', v_liquidacion.pais_codigo, 'moneda', v_liquidacion.moneda,
          'accountingHandledByOutbox', true
        ),
        updated_at = now()
    WHERE id = v_outbox_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'liquidacionId', p_liquidacion_id,
    'empleadoId', v_liquidacion.id_empleado, 'estado', 'aprobada',
    'eventId', v_event_id, 'idempotent', v_estado_inicial = 'aprobada'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.pagar_liquidacion_tx(
  p_tenant_id uuid,
  p_liquidacion_id uuid,
  p_pago jsonb,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_liquidacion public.liquidaciones%ROWTYPE;
  v_pago public.pagos_liquidaciones%ROWTYPE;
  v_banco public.cuentas_bancarias%ROWTYPE;
  v_estado text;
  v_metodo text := lower(btrim(COALESCE(p_pago->>'metodo_pago', '')));
  v_cuenta_id uuid := app.to_uuid_or_null(p_pago->>'cuenta_bancaria_id');
  v_referencia text := NULLIF(btrim(COALESCE(p_pago->>'referencia', '')), '');
  v_fecha timestamptz := COALESCE(NULLIF(p_pago->>'fecha_pago', '')::timestamptz, clock_timestamp());
  v_monto numeric(14,2);
  v_saldo_anterior numeric(14,2);
  v_saldo_nuevo numeric(14,2);
  v_movimiento_id uuid;
  v_event_id uuid := gen_random_uuid();
  v_ciclo integer;
  v_key text;
  v_fingerprint text;
BEGIN
  IF p_tenant_id IS NULL OR p_liquidacion_id IS NULL OR jsonb_typeof(p_pago) <> 'object' THEN
    RAISE EXCEPTION 'tenant_id, liquidacion_id y pago son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_rrhh_actor_449(p_tenant_id, p_usuario_id);
  IF v_metodo NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION 'Metodo de pago no permitido: %', v_metodo USING ERRCODE = '22023';
  END IF;
  IF v_metodo = 'transferencia' AND (v_cuenta_id IS NULL OR v_referencia IS NULL) THEN
    RAISE EXCEPTION 'La transferencia requiere cuenta bancaria y referencia' USING ERRCODE = '22023';
  END IF;
  IF v_metodo = 'efectivo' AND v_cuenta_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un pago en efectivo no puede afectar una cuenta bancaria' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  SELECT * INTO v_liquidacion
  FROM public.liquidaciones
  WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidacion no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;
  v_estado := lower(v_liquidacion.estado::text);
  IF v_estado NOT IN ('aprobada', 'pagada') THEN
    RAISE EXCEPTION 'Solo se puede pagar una liquidacion aprobada; estado actual %', v_liquidacion.estado
      USING ERRCODE = '23514';
  END IF;
  v_monto := round(COALESCE(v_liquidacion.total_liquidacion, 0), 2);
  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'La liquidacion no tiene importe por pagar' USING ERRCODE = '23514';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', p_tenant_id, 'liquidacion_id', p_liquidacion_id,
    'monto', v_monto, 'moneda', upper(COALESCE(v_liquidacion.moneda, 'PEN')),
    'metodo', v_metodo, 'cuenta_id', v_cuenta_id, 'referencia', v_referencia,
    'fecha', v_fecha::date
  )::text, 'UTF8'), 'sha256'), 'hex');

  IF v_estado = 'pagada' THEN
    SELECT * INTO v_pago
    FROM public.pagos_liquidaciones
    WHERE tenant_id = p_tenant_id AND liquidacion_id = p_liquidacion_id AND estado = 'APLICADO'
    ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND OR v_pago.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'La liquidacion ya fue pagada con datos diferentes'
        USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'success', true, 'liquidacionId', p_liquidacion_id, 'estado', 'pagada',
      'pagoId', v_pago.id, 'eventId', v_pago.event_id,
      'movimientoBancarioId', v_pago.movimiento_bancario_id,
      'idempotent', true
    );
  END IF;

  SELECT count(*) + 1 INTO v_ciclo
  FROM public.pagos_liquidaciones
  WHERE tenant_id = p_tenant_id AND liquidacion_id = p_liquidacion_id;
  v_key := COALESCE(NULLIF(btrim(p_pago->>'idempotency_key'), ''),
    format('liquidacion:pago:%s:%s:%s', p_tenant_id, p_liquidacion_id, v_fingerprint));

  IF EXISTS (
    SELECT 1 FROM public.pagos_liquidaciones
    WHERE tenant_id = p_tenant_id AND lower(btrim(idempotency_key)) = lower(v_key)
  ) THEN
    RAISE EXCEPTION 'La clave de idempotencia ya pertenece a otra operacion de pago'
      USING ERRCODE = '23505';
  END IF;

  IF v_cuenta_id IS NOT NULL THEN
    SELECT * INTO v_banco
    FROM public.cuentas_bancarias
    WHERE tenant_id = p_tenant_id AND id = v_cuenta_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta bancaria no encontrada para el tenant' USING ERRCODE = 'P0002';
    END IF;
    IF NOT COALESCE(v_banco.activa, false) OR upper(COALESCE(v_banco.estado, '')) <> 'ACTIVO' THEN
      RAISE EXCEPTION 'Cuenta bancaria inactiva' USING ERRCODE = '23514';
    END IF;
    IF upper(COALESCE(v_banco.moneda, 'PEN')) <> upper(COALESCE(v_liquidacion.moneda, 'PEN')) THEN
      RAISE EXCEPTION 'La moneda bancaria no coincide con la liquidacion' USING ERRCODE = '23514';
    END IF;
    v_saldo_anterior := round(COALESCE(v_banco.saldo, v_banco.saldo_actual, 0), 2);
    v_saldo_nuevo := round(v_saldo_anterior - v_monto, 2);
    IF NOT COALESCE(v_banco.permite_sobregiro, false) AND v_saldo_nuevo < 0 THEN
      RAISE EXCEPTION 'Saldo bancario insuficiente' USING ERRCODE = '23514';
    END IF;
    v_movimiento_id := gen_random_uuid();
    INSERT INTO public.movimientos_bancarios (
      id, tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion,
      referencia, metodo_pago, idempotency_key, conciliado,
      saldo_anterior, saldo_nuevo, created_by, metadata
    ) VALUES (
      v_movimiento_id, p_tenant_id, v_cuenta_id, 'CARGO', v_monto, v_fecha::date,
      format('Pago de liquidacion laboral %s', p_liquidacion_id),
      v_referencia, upper(v_metodo), format('%s:banco', v_key), false,
      v_saldo_anterior, v_saldo_nuevo, p_usuario_id,
      jsonb_build_object('source', 'pagar_liquidacion_tx', 'liquidacion_id', p_liquidacion_id)
    );
    UPDATE public.cuentas_bancarias
    SET saldo = v_saldo_nuevo, saldo_actual = v_saldo_nuevo,
        saldo_contable = v_saldo_nuevo, updated_at = now(), updated_by = p_usuario_id
    WHERE tenant_id = p_tenant_id AND id = v_cuenta_id;
  END IF;

  INSERT INTO public.pagos_liquidaciones (
    tenant_id, liquidacion_id, monto, moneda, metodo_pago,
    cuenta_bancaria_id, movimiento_bancario_id, estado, referencia,
    fecha_pago, pagado_por, event_id, idempotency_key, fingerprint, metadata
  ) VALUES (
    p_tenant_id, p_liquidacion_id, v_monto, upper(COALESCE(v_liquidacion.moneda, 'PEN')),
    v_metodo, v_cuenta_id, v_movimiento_id, 'APLICADO', v_referencia,
    v_fecha, p_usuario_id, v_event_id, v_key, v_fingerprint,
    jsonb_build_object('payment_cycle', v_ciclo)
  ) RETURNING * INTO v_pago;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'liquidacion_pago', v_pago.id::text, 'liquidacion.pagada',
    jsonb_build_object(
      'eventId', v_event_id, 'tenantId', p_tenant_id,
      'idempotencyKey', format('liquidacion.pagada:%s:%s', p_tenant_id, v_pago.id),
      'liquidacionId', p_liquidacion_id, 'pagoId', v_pago.id,
      'empleadoId', v_liquidacion.id_empleado, 'fechaPago', v_fecha,
      'totalPagado', v_monto, 'metodoPago', v_metodo,
      'cuentaBancariaId', v_cuenta_id, 'movimientoBancarioId', v_movimiento_id,
      'moneda', v_liquidacion.moneda, 'accountingHandledByOutbox', true
    ),
    'pending', 0, format('liquidacion.pagada:%s:%s', p_tenant_id, v_pago.id),
    v_event_id, v_fecha
  );

  PERFORM set_config('app.liquidacion_transition', format('pagar:%s', p_liquidacion_id), true);
  UPDATE public.liquidaciones
  SET estado = 'pagada', fecha_pago = v_fecha, metodo_pago = v_metodo,
      pagado_por = p_usuario_id,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'pago_actual_id', v_pago.id, 'payment_event_id', v_event_id,
        'payment_fingerprint', v_fingerprint
      ),
      updated_at = now()
  WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id;
  PERFORM set_config('app.liquidacion_transition', '', true);

  RETURN jsonb_build_object(
    'success', true, 'liquidacionId', p_liquidacion_id, 'estado', 'pagada',
    'pagoId', v_pago.id, 'eventId', v_event_id,
    'movimientoBancarioId', v_movimiento_id, 'idempotent', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.revertir_pago_liquidacion_tx(
  p_tenant_id uuid,
  p_liquidacion_id uuid,
  p_motivo text,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_liquidacion public.liquidaciones%ROWTYPE;
  v_pago public.pagos_liquidaciones%ROWTYPE;
  v_banco public.cuentas_bancarias%ROWTYPE;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_event_id uuid := gen_random_uuid();
  v_movimiento_id uuid;
  v_fecha timestamptz := clock_timestamp();
  v_saldo_anterior numeric(14,2);
  v_saldo_nuevo numeric(14,2);
  v_key text;
BEGIN
  IF p_tenant_id IS NULL OR p_liquidacion_id IS NULL OR v_motivo IS NULL THEN
    RAISE EXCEPTION 'tenant_id, liquidacion_id y motivo son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_rrhh_actor_449(p_tenant_id, p_usuario_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  SELECT * INTO v_liquidacion FROM public.liquidaciones
  WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidacion no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;

  IF lower(v_liquidacion.estado::text) = 'aprobada' THEN
    SELECT * INTO v_pago FROM public.pagos_liquidaciones
    WHERE tenant_id = p_tenant_id AND liquidacion_id = p_liquidacion_id
      AND estado = 'REVERTIDO'
    ORDER BY fecha_reversion DESC, created_at DESC LIMIT 1;
    IF FOUND THEN
      IF v_pago.motivo_reversion IS DISTINCT FROM v_motivo THEN
        RAISE EXCEPTION 'La reversa ya existe con un motivo diferente'
          USING ERRCODE = '23514';
      END IF;
      RETURN jsonb_build_object(
        'success', true, 'liquidacionId', p_liquidacion_id, 'estado', 'aprobada',
        'pagoId', v_pago.id, 'eventId', v_pago.reversion_event_id,
        'movimientoBancarioId', v_pago.movimiento_reversion_id,
        'idempotent', true
      );
    END IF;
    RAISE EXCEPTION 'La liquidacion aprobada no tiene un pago para revertir' USING ERRCODE = '23514';
  END IF;
  IF lower(v_liquidacion.estado::text) <> 'pagada' THEN
    RAISE EXCEPTION 'Solo se puede revertir una liquidacion pagada; estado actual %', v_liquidacion.estado
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_pago FROM public.pagos_liquidaciones
  WHERE tenant_id = p_tenant_id AND liquidacion_id = p_liquidacion_id
    AND estado = 'APLICADO'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe evidencia aplicada del pago a revertir' USING ERRCODE = 'P0002';
  END IF;
  v_key := format('liquidacion.pago.revertido:%s:%s', p_tenant_id, v_pago.id);

  IF v_pago.cuenta_bancaria_id IS NOT NULL THEN
    SELECT * INTO v_banco FROM public.cuentas_bancarias
    WHERE tenant_id = p_tenant_id AND id = v_pago.cuenta_bancaria_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta bancaria original no encontrada' USING ERRCODE = 'P0002';
    END IF;
    v_saldo_anterior := round(COALESCE(v_banco.saldo, v_banco.saldo_actual, 0), 2);
    v_saldo_nuevo := round(v_saldo_anterior + v_pago.monto, 2);
    v_movimiento_id := gen_random_uuid();
    INSERT INTO public.movimientos_bancarios (
      id, tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion,
      referencia, metodo_pago, idempotency_key, conciliado,
      saldo_anterior, saldo_nuevo, created_by, movimiento_relacionado_id, metadata
    ) VALUES (
      v_movimiento_id, p_tenant_id, v_pago.cuenta_bancaria_id, 'ABONO', v_pago.monto,
      v_fecha::date, format('Reversa pago liquidacion laboral %s', p_liquidacion_id),
      v_pago.referencia, upper(v_pago.metodo_pago), format('%s:banco', v_key), false,
      v_saldo_anterior, v_saldo_nuevo, p_usuario_id, v_pago.movimiento_bancario_id,
      jsonb_build_object('source', 'revertir_pago_liquidacion_tx', 'pago_id', v_pago.id)
    );
    UPDATE public.cuentas_bancarias
    SET saldo = v_saldo_nuevo, saldo_actual = v_saldo_nuevo,
        saldo_contable = v_saldo_nuevo, updated_at = now(), updated_by = p_usuario_id
    WHERE tenant_id = p_tenant_id AND id = v_pago.cuenta_bancaria_id;
  END IF;

  UPDATE public.pagos_liquidaciones
  SET estado = 'REVERTIDO', fecha_reversion = v_fecha, revertido_por = p_usuario_id,
      motivo_reversion = v_motivo, movimiento_reversion_id = v_movimiento_id,
      reversion_event_id = v_event_id,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reversion_key', v_key),
      updated_at = now()
  WHERE id = v_pago.id AND tenant_id = p_tenant_id;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'liquidacion_pago', v_pago.id::text, 'liquidacion.pago.revertido',
    jsonb_build_object(
      'eventId', v_event_id, 'tenantId', p_tenant_id, 'idempotencyKey', v_key,
      'liquidacionId', p_liquidacion_id, 'pagoId', v_pago.id,
      'fechaReversion', v_fecha, 'montoRevertido', v_pago.monto,
      'metodoPago', v_pago.metodo_pago, 'motivo', v_motivo,
      'cuentaBancariaId', v_pago.cuenta_bancaria_id,
      'movimientoBancarioId', v_movimiento_id,
      'moneda', v_pago.moneda, 'accountingHandledByOutbox', true
    ),
    'pending', 0, v_key, v_event_id, v_fecha
  );

  PERFORM set_config('app.liquidacion_transition', format('revertir:%s', p_liquidacion_id), true);
  UPDATE public.liquidaciones
  SET estado = 'aprobada', fecha_pago = NULL, metodo_pago = NULL, pagado_por = NULL,
      metadata = (COALESCE(metadata, '{}'::jsonb) - 'pago_actual_id' - 'payment_event_id'
        - 'payment_fingerprint') || jsonb_build_object(
          'ultimo_pago_revertido_id', v_pago.id,
          'ultimo_pago_revertido_event_id', v_event_id,
          'ultimo_pago_revertido_en', v_fecha,
          'ultimo_pago_revertido_motivo', v_motivo
        ),
      updated_at = now()
  WHERE id = p_liquidacion_id AND tenant_id = p_tenant_id;
  PERFORM set_config('app.liquidacion_transition', '', true);

  RETURN jsonb_build_object(
    'success', true, 'liquidacionId', p_liquidacion_id, 'estado', 'aprobada',
    'pagoId', v_pago.id, 'eventId', v_event_id,
    'movimientoBancarioId', v_movimiento_id, 'idempotent', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.guardar_depositos_cts_calculados_tx(
  p_tenant_id uuid,
  p_periodo text,
  p_depositos jsonb,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_rows integer;
  v_contratos integer;
  v_periodo_fecha date;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_periodo IS NULL OR p_periodo !~ '^[0-9]{4}-(05|11)$'
     OR p_depositos IS NULL OR jsonb_typeof(p_depositos) <> 'array'
     OR jsonb_array_length(p_depositos) = 0 THEN
    RAISE EXCEPTION 'tenant, periodo CTS y depositos son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_rrhh_actor_449(p_tenant_id, p_usuario_id);
  v_periodo_fecha := to_date(p_periodo || '-01', 'YYYY-MM-DD');
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_depositos) x
    GROUP BY x->>'empleado_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'El calculo CTS contiene empleados duplicados' USING ERRCODE = '23505';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_depositos)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR app.to_uuid_or_null(v_item->>'empleado_id') IS NULL
       OR COALESCE((v_item->>'remuneracion_computable')::numeric, -1) <= 0
       OR COALESCE((v_item->>'monto')::numeric, -1) <= 0
       OR COALESCE((v_item->>'meses_computables')::integer, -1) NOT BETWEEN 0 AND 6
       OR COALESCE((v_item->>'dias_computables')::integer, -1) NOT BETWEEN 0 AND 30
       OR COALESCE((v_item->>'meses_computables')::integer, 0)
          + COALESCE((v_item->>'dias_computables')::integer, 0) = 0
       OR upper(COALESCE(v_item->>'moneda', 'PEN')) <> 'PEN'
       OR (v_item->>'semestre_inicio')::date IS DISTINCT FROM
          (v_periodo_fecha - interval '6 months')::date
       OR (v_item->>'semestre_fin')::date IS DISTINCT FROM
          (v_periodo_fecha - interval '1 day')::date THEN
      RAISE EXCEPTION 'Deposito CTS calculado invalido' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.empleados e
      WHERE e.id = (v_item->>'empleado_id')::uuid AND e.tenant_id = p_tenant_id
        AND lower(e.estado::text) = 'activo'
    ) THEN
      RAISE EXCEPTION 'Empleado CTS inexistente, inactivo o de otro tenant' USING ERRCODE = '23503';
    END IF;
    SELECT count(*) INTO v_contratos
    FROM public.contratos c
    WHERE c.tenant_id = p_tenant_id
      AND c.id_empleado = (v_item->>'empleado_id')::uuid
      AND lower(c.estado::text) IN ('vigente', 'renovado', 'en_periodo_prueba');
    IF v_contratos <> 1 THEN
      RAISE EXCEPTION 'El calculo CTS requiere exactamente un contrato laboral activo; encontrados %', v_contratos
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.depositos_cts (
      tenant_id, empleado_id, periodo, semestre_inicio, semestre_fin,
      remuneracion_computable, meses_computables, dias_computables,
      monto, moneda, estado, metadata
    ) VALUES (
      p_tenant_id, (v_item->>'empleado_id')::uuid, p_periodo,
      (v_item->>'semestre_inicio')::date, (v_item->>'semestre_fin')::date,
      round((v_item->>'remuneracion_computable')::numeric, 2),
      (v_item->>'meses_computables')::integer,
      (v_item->>'dias_computables')::integer,
      round((v_item->>'monto')::numeric, 2),
      upper(COALESCE(NULLIF(v_item->>'moneda', ''), 'PEN')), 'CALCULADO',
      COALESCE(v_item->'metadata', '{}'::jsonb) || jsonb_build_object(
        'calculado_por', p_usuario_id, 'calculado_en', clock_timestamp()
      )
    )
    ON CONFLICT (tenant_id, empleado_id, periodo) DO UPDATE SET
      semestre_inicio = EXCLUDED.semestre_inicio,
      semestre_fin = EXCLUDED.semestre_fin,
      remuneracion_computable = EXCLUDED.remuneracion_computable,
      meses_computables = EXCLUDED.meses_computables,
      dias_computables = EXCLUDED.dias_computables,
      monto = EXCLUDED.monto,
      moneda = EXCLUDED.moneda,
      metadata = COALESCE(public.depositos_cts.metadata, '{}'::jsonb) || EXCLUDED.metadata,
      updated_at = now()
    WHERE upper(public.depositos_cts.estado) = 'CALCULADO'
    RETURNING id INTO v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'Un deposito CTS ya fue depositado o anulado y no puede recalcularse'
        USING ERRCODE = '23514';
    END IF;
    v_result := v_result || jsonb_build_array(v_id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'periodo', p_periodo,
    'depositosIds', v_result, 'total', (
      SELECT round(COALESCE(sum((x->>'monto')::numeric), 0), 2)
      FROM jsonb_array_elements(p_depositos) x
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app.depositar_cts_tx(
  p_tenant_id uuid,
  p_deposito_id uuid,
  p_pago jsonb,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_deposito public.depositos_cts%ROWTYPE;
  v_banco public.cuentas_bancarias%ROWTYPE;
  v_cuenta_id uuid := app.to_uuid_or_null(p_pago->>'cuenta_bancaria_id');
  v_referencia text := NULLIF(btrim(COALESCE(p_pago->>'referencia', '')), '');
  v_fecha date := COALESCE(NULLIF(p_pago->>'fecha_deposito', '')::date, app.hoy_tenant(p_tenant_id));
  v_saldo_anterior numeric(14,2);
  v_saldo_nuevo numeric(14,2);
  v_movimiento_id uuid := gen_random_uuid();
  v_event_id uuid := gen_random_uuid();
  v_key text;
  v_fingerprint text;
BEGIN
  IF p_tenant_id IS NULL OR p_deposito_id IS NULL OR jsonb_typeof(p_pago) <> 'object'
     OR v_cuenta_id IS NULL OR v_referencia IS NULL THEN
    RAISE EXCEPTION 'tenant, deposito, cuenta bancaria y referencia son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_rrhh_actor_449(p_tenant_id, p_usuario_id);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);

  SELECT * INTO v_deposito FROM public.depositos_cts
  WHERE id = p_deposito_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposito CTS no encontrado para el tenant' USING ERRCODE = 'P0002';
  END IF;
  IF upper(v_deposito.estado) NOT IN ('CALCULADO', 'DEPOSITADO') THEN
    RAISE EXCEPTION 'El deposito CTS no admite deposito en estado %', v_deposito.estado
      USING ERRCODE = '23514';
  END IF;
  IF v_deposito.monto <= 0 THEN
    RAISE EXCEPTION 'El deposito CTS debe tener monto positivo' USING ERRCODE = '23514';
  END IF;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'tenant_id', p_tenant_id, 'deposito_id', p_deposito_id,
    'monto', v_deposito.monto, 'cuenta_id', v_cuenta_id,
    'referencia', v_referencia, 'fecha', v_fecha
  )::text, 'UTF8'), 'sha256'), 'hex');
  IF upper(v_deposito.estado) = 'DEPOSITADO' THEN
    IF COALESCE(v_deposito.metadata->>'payment_fingerprint', '') IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'La CTS ya fue depositada con datos diferentes' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'success', true, 'depositoId', p_deposito_id, 'estado', 'DEPOSITADO',
      'eventId', v_deposito.event_id, 'movimientoBancarioId', v_deposito.movimiento_bancario_id,
      'idempotent', true
    );
  END IF;

  SELECT * INTO v_banco FROM public.cuentas_bancarias
  WHERE tenant_id = p_tenant_id AND id = v_cuenta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta bancaria no encontrada para el tenant' USING ERRCODE = 'P0002';
  END IF;
  IF NOT COALESCE(v_banco.activa, false) OR upper(COALESCE(v_banco.estado, '')) <> 'ACTIVO' THEN
    RAISE EXCEPTION 'Cuenta bancaria inactiva' USING ERRCODE = '23514';
  END IF;
  IF upper(COALESCE(v_banco.moneda, 'PEN')) <> upper(COALESCE(v_deposito.moneda, 'PEN')) THEN
    RAISE EXCEPTION 'La moneda bancaria no coincide con la CTS' USING ERRCODE = '23514';
  END IF;
  v_saldo_anterior := round(COALESCE(v_banco.saldo, v_banco.saldo_actual, 0), 2);
  v_saldo_nuevo := round(v_saldo_anterior - v_deposito.monto, 2);
  IF NOT COALESCE(v_banco.permite_sobregiro, false) AND v_saldo_nuevo < 0 THEN
    RAISE EXCEPTION 'Saldo bancario insuficiente' USING ERRCODE = '23514';
  END IF;
  v_key := format('cts.depositado:%s:%s', p_tenant_id, p_deposito_id);

  INSERT INTO public.movimientos_bancarios (
    id, tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion,
    referencia, metodo_pago, idempotency_key, conciliado,
    saldo_anterior, saldo_nuevo, created_by, metadata
  ) VALUES (
    v_movimiento_id, p_tenant_id, v_cuenta_id, 'CARGO', v_deposito.monto, v_fecha,
    format('Deposito CTS %s - empleado %s', v_deposito.periodo, v_deposito.empleado_id),
    v_referencia, 'TRANSFERENCIA', format('%s:banco', v_key), false,
    v_saldo_anterior, v_saldo_nuevo, p_usuario_id,
    jsonb_build_object('source', 'depositar_cts_tx', 'deposito_cts_id', p_deposito_id)
  );
  UPDATE public.cuentas_bancarias
  SET saldo = v_saldo_nuevo, saldo_actual = v_saldo_nuevo,
      saldo_contable = v_saldo_nuevo, updated_at = now(), updated_by = p_usuario_id
  WHERE tenant_id = p_tenant_id AND id = v_cuenta_id;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload,
    status, retry_count, idempotency_key, event_id, occurred_at
  ) VALUES (
    p_tenant_id, 'deposito_cts', p_deposito_id::text, 'cts.depositado',
    jsonb_build_object(
      'eventId', v_event_id, 'tenantId', p_tenant_id, 'idempotencyKey', v_key,
      'depositoId', p_deposito_id, 'empleadoId', v_deposito.empleado_id,
      'periodo', v_deposito.periodo, 'fechaDeposito', v_fecha,
      'totalDepositado', v_deposito.monto, 'moneda', v_deposito.moneda,
      'cuentaBancariaId', v_cuenta_id, 'movimientoBancarioId', v_movimiento_id,
      'accountingHandledByOutbox', true
    ),
    'pending', 0, v_key, v_event_id, v_fecha::timestamptz
  );

  PERFORM set_config('app.cts_transition', format('depositar:%s', p_deposito_id), true);
  UPDATE public.depositos_cts
  SET estado = 'DEPOSITADO', fecha_deposito = v_fecha,
      cuenta_bancaria_id = v_cuenta_id, movimiento_bancario_id = v_movimiento_id,
      depositado_por = p_usuario_id, event_id = v_event_id, idempotency_key = v_key,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_fingerprint', v_fingerprint, 'referencia_deposito', v_referencia
      ),
      updated_at = now()
  WHERE id = p_deposito_id AND tenant_id = p_tenant_id;
  PERFORM set_config('app.cts_transition', '', true);

  RETURN jsonb_build_object(
    'success', true, 'depositoId', p_deposito_id, 'estado', 'DEPOSITADO',
    'eventId', v_event_id, 'movimientoBancarioId', v_movimiento_id,
    'idempotent', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirmar_liquidacion_tx(
  p_tenant_id uuid, p_liquidacion_id uuid, p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.confirmar_liquidacion_tx(p_tenant_id, p_liquidacion_id, p_usuario_id);
$function$;

CREATE OR REPLACE FUNCTION public.guardar_liquidacion_calculada_tx(
  p_tenant_id uuid, p_liquidacion jsonb, p_usuario_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.guardar_liquidacion_calculada_tx(p_tenant_id, p_liquidacion, p_usuario_id);
$function$;

CREATE OR REPLACE FUNCTION public.pagar_liquidacion_tx(
  p_tenant_id uuid, p_liquidacion_id uuid, p_pago jsonb, p_usuario_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.pagar_liquidacion_tx(p_tenant_id, p_liquidacion_id, p_pago, p_usuario_id);
$function$;

CREATE OR REPLACE FUNCTION public.revertir_pago_liquidacion_tx(
  p_tenant_id uuid, p_liquidacion_id uuid, p_motivo text, p_usuario_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.revertir_pago_liquidacion_tx(p_tenant_id, p_liquidacion_id, p_motivo, p_usuario_id);
$function$;

CREATE OR REPLACE FUNCTION public.guardar_depositos_cts_calculados_tx(
  p_tenant_id uuid, p_periodo text, p_depositos jsonb, p_usuario_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.guardar_depositos_cts_calculados_tx(p_tenant_id, p_periodo, p_depositos, p_usuario_id);
$function$;

CREATE OR REPLACE FUNCTION public.depositar_cts_tx(
  p_tenant_id uuid, p_deposito_id uuid, p_pago jsonb, p_usuario_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.depositar_cts_tx(p_tenant_id, p_deposito_id, p_pago, p_usuario_id);
$function$;

REVOKE ALL ON FUNCTION app.assert_rrhh_actor_449(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.enforce_liquidacion_lifecycle_449() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.enforce_deposito_cts_lifecycle_449() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.enforce_pagos_liquidaciones_tenant_449() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.enforce_depositos_cts_tenant_449() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.confirmar_liquidacion_tx(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.guardar_liquidacion_calculada_tx(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.pagar_liquidacion_tx(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.revertir_pago_liquidacion_tx(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.guardar_depositos_cts_calculados_tx(uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.depositar_cts_tx(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirmar_liquidacion_tx(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_liquidacion_calculada_tx(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pagar_liquidacion_tx(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revertir_pago_liquidacion_tx(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_depositos_cts_calculados_tx(uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.depositar_cts_tx(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirmar_liquidacion_tx(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_liquidacion_calculada_tx(uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pagar_liquidacion_tx(uuid, uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revertir_pago_liquidacion_tx(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.guardar_depositos_cts_calculados_tx(uuid, text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.depositar_cts_tx(uuid, uuid, jsonb, uuid) TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.liquidaciones, public.depositos_cts, public.pagos_liquidaciones
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.empleados, public.contratos, public.cuentas_bancarias,
     public.movimientos_bancarios, public.outbox_events
  FROM anon, authenticated;
GRANT SELECT ON public.pagos_liquidaciones TO authenticated, service_role;
GRANT SELECT ON public.liquidaciones, public.depositos_cts TO service_role;

COMMENT ON FUNCTION public.confirmar_liquidacion_tx(uuid, uuid, uuid) IS
  'Confirma una liquidacion con actor, cese atomico, consumo de CTS pendiente y outbox de devengo.';
COMMENT ON FUNCTION public.guardar_liquidacion_calculada_tx(uuid, jsonb, uuid) IS
  'Guarda el calculo auditable e idempotente sin cesar empleado ni contrato; la confirmacion cierra el vinculo.';
COMMENT ON FUNCTION public.pagar_liquidacion_tx(uuid, uuid, jsonb, uuid) IS
  'Paga una liquidacion aprobada, registra evidencia, tesoreria y outbox en una transaccion idempotente.';
COMMENT ON FUNCTION public.revertir_pago_liquidacion_tx(uuid, uuid, text, uuid) IS
  'Revierte un pago de liquidacion, restaura tesoreria y publica el contra-asiento durable.';
COMMENT ON FUNCTION public.depositar_cts_tx(uuid, uuid, jsonb, uuid) IS
  'Deposita CTS calculada mediante cuenta bancaria, tesoreria y outbox contable atomicos.';

-- Eventos heredados que el worker generico pudo cerrar sin asiento vuelven a
-- quedar pendientes ahora que tienen un consumidor contable explicito. Se
-- completa el snapshot antiguo (427 usaba fechaTerminacion) y se garantiza un
-- event_id durable antes de entregarlo al generador idempotente.
WITH candidatos AS (
  SELECT
    o.id,
    COALESCE(o.event_id, gen_random_uuid()) AS event_id,
    l.id AS liquidacion_id,
    l.id_empleado,
    l.fecha_terminacion,
    l.total_liquidacion,
    l.pais_codigo,
    l.moneda,
    COALESCE(
      NULLIF(o.idempotency_key, ''),
      format('liquidacion.aprobada:legacy:%s', o.id)
    ) AS idempotency_key
  FROM public.outbox_events o
  JOIN public.liquidaciones l
    ON l.tenant_id = o.tenant_id
   AND (
     l.id::text = o.aggregate_id
     OR l.id::text = COALESCE(o.payload->>'liquidacionId', '')
   )
  WHERE o.event_type = 'liquidacion.aprobada'
    AND NOT EXISTS (
      SELECT 1 FROM public.asientos_contables a
      WHERE a.tenant_id = o.tenant_id AND a.source_event_id = o.event_id
    )
)
UPDATE public.outbox_events o
SET event_id = c.event_id,
    aggregate_type = 'liquidacion',
    aggregate_id = c.liquidacion_id::text,
    status = 'pending',
    processed_at = NULL,
    error_message = NULL,
    payload = COALESCE(o.payload, '{}'::jsonb) || jsonb_build_object(
      'eventId', c.event_id,
      'tenantId', o.tenant_id,
      'idempotencyKey', c.idempotency_key,
      'liquidacionId', c.liquidacion_id,
      'empleadoId', c.id_empleado,
      'fecha', c.fecha_terminacion,
      'totalLiquidacion', c.total_liquidacion,
      'paisCodigo', c.pais_codigo,
      'moneda', c.moneda,
      'accountingHandledByOutbox', true
    ),
    updated_at = now()
FROM candidatos c
WHERE o.id = c.id;

COMMIT;

NOTIFY pgrst, 'reload schema';
