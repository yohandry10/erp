-- Cierre contable serializado y estados financieros en tiempo real.
--
-- La escritura de asientos y de eventos contables debe compartir el mismo
-- lock del periodo que usa el cierre. Sin esa frontera, un cierre podia
-- validar "cero pendientes" y, un instante despues, aparecer un asiento o un
-- evento fechado en el periodo ya cerrado. Las vistas materializadas tampoco
-- son una fuente valida para una consulta operativa: entre refreshes muestran
-- saldos antiguos aunque el libro diario ya haya cambiado.

BEGIN;

SET LOCAL search_path = public, app, extensions, pg_temp;

CREATE OR REPLACE FUNCTION app.assert_accounting_actor_458(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND COALESCE(u.activo, false)
      AND lower(COALESCE(u.estado::text, '')) = 'activo'
  ) THEN
    RAISE EXCEPTION 'ACCOUNTING_ACTOR_NOT_ACTIVE_IN_TENANT'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION app.ensure_accounting_period_open_458(
  p_tenant_id uuid,
  p_fecha date
)
RETURNS public.periodos_contables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_periodo public.periodos_contables;
  v_anio integer;
  v_mes integer;
BEGIN
  IF p_tenant_id IS NULL OR p_fecha IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_anio := EXTRACT(YEAR FROM p_fecha)::integer;
  v_mes := EXTRACT(MONTH FROM p_fecha)::integer;

  IF v_anio < 2000 OR v_anio > 2100 THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_DATE_OUT_OF_RANGE:%', p_fecha
      USING ERRCODE = '22008';
  END IF;

  INSERT INTO public.periodos_contables (tenant_id, anio, mes, estado)
  VALUES (p_tenant_id, v_anio, v_mes, 'ABIERTO')
  ON CONFLICT (tenant_id, anio, mes)
    WHERE tenant_id IS NOT NULL AND anio IS NOT NULL AND mes IS NOT NULL
  DO NOTHING;

  SELECT p.*
  INTO v_periodo
  FROM public.periodos_contables p
  WHERE p.tenant_id = p_tenant_id
    AND p.anio = v_anio
    AND p.mes = v_mes
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND:%-%', v_anio, v_mes;
  END IF;

  IF upper(v_periodo.estado::text) <> 'ABIERTO' THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_OPEN:%-%:%',
      v_anio, lpad(v_mes::text, 2, '0'), upper(v_periodo.estado::text)
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.periodos_contables later
    WHERE later.tenant_id = p_tenant_id
      AND upper(later.estado::text) = 'CERRADO'
      AND (later.anio, later.mes) > (v_anio, v_mes)
  ) THEN
    RAISE EXCEPTION 'ACCOUNTING_LATER_PERIOD_ALREADY_CLOSED:%-%', v_anio, v_mes
      USING ERRCODE = '55000';
  END IF;

  RETURN v_periodo;
END;
$function$;

CREATE OR REPLACE FUNCTION app.guard_asiento_period_458()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old_fecha date;
  v_new_fecha date;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_fecha := COALESCE(OLD.fecha, OLD.created_at)::date;
    PERFORM app.ensure_accounting_period_open_458(OLD.tenant_id, v_old_fecha);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_fecha := COALESCE(NEW.fecha, NEW.created_at, now())::date;
    IF TG_OP = 'INSERT'
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR v_new_fecha IS DISTINCT FROM v_old_fecha THEN
      PERFORM app.ensure_accounting_period_open_458(NEW.tenant_id, v_new_fecha);
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_asiento_period_458 ON public.asientos_contables;
CREATE TRIGGER trg_guard_asiento_period_458
BEFORE INSERT OR UPDATE OR DELETE ON public.asientos_contables
FOR EACH ROW
EXECUTE FUNCTION app.guard_asiento_period_458();

CREATE OR REPLACE FUNCTION app.guard_detalle_asiento_period_458()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_asiento_id uuid;
  v_tenant_id uuid;
  v_fecha date;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT a.tenant_id, COALESCE(a.fecha, a.created_at)::date
    INTO v_tenant_id, v_fecha
    FROM public.asientos_contables a
    WHERE a.id = OLD.asiento_id
      AND a.tenant_id = OLD.tenant_id
    FOR SHARE;

    IF NOT FOUND THEN
      -- En un DELETE en cascada la cabecera ya fue marcada para borrado; su
      -- propio BEFORE DELETE adquirio y valido el lock del periodo.
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'ACCOUNTING_ENTRY_PARENT_NOT_FOUND';
    END IF;
    PERFORM app.ensure_accounting_period_open_458(v_tenant_id, v_fecha);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND (
       TG_OP = 'INSERT'
       OR NEW.asiento_id IS DISTINCT FROM OLD.asiento_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     ) THEN
    SELECT a.tenant_id, COALESCE(a.fecha, a.created_at)::date
    INTO v_tenant_id, v_fecha
    FROM public.asientos_contables a
    WHERE a.id = NEW.asiento_id
      AND a.tenant_id = NEW.tenant_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACCOUNTING_ENTRY_PARENT_NOT_FOUND';
    END IF;
    PERFORM app.ensure_accounting_period_open_458(v_tenant_id, v_fecha);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_detalle_asiento_period_458 ON public.detalle_asientos;
CREATE TRIGGER trg_guard_detalle_asiento_period_458
BEFORE INSERT OR UPDATE OR DELETE ON public.detalle_asientos
FOR EACH ROW
EXECUTE FUNCTION app.guard_detalle_asiento_period_458();

-- La FK historica deja asiento_id en NULL al borrar la cabecera. El writer de
-- borradores debe retirar primero las lineas para no conservar detalles
-- huerfanos y para que cada DELETE valide el periodo mientras el padre existe.
CREATE OR REPLACE FUNCTION public.eliminar_asiento_borrador_tx(
  p_tenant_id uuid,
  p_asiento_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_estado text;
BEGIN
  SELECT a.estado::text INTO v_estado
  FROM public.asientos_contables a
  WHERE a.id = p_asiento_id
    AND a.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASIENTO_NO_ENCONTRADO';
  END IF;
  IF upper(COALESCE(v_estado, '')) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'ASIENTO_CAMBIO_CONCURRENTEMENTE:%', v_estado;
  END IF;

  DELETE FROM public.detalle_asientos d
  WHERE d.asiento_id = p_asiento_id
    AND d.tenant_id = p_tenant_id;

  DELETE FROM public.asientos_contables a
  WHERE a.id = p_asiento_id
    AND a.tenant_id = p_tenant_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.eliminar_asiento_borrador_tx(uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_asiento_borrador_tx(uuid, uuid)
TO service_role;

CREATE OR REPLACE FUNCTION app.is_accounting_event_458(p_event_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT lower(COALESCE(btrim(p_event_type), '')) = ANY (ARRAY[
    'venta.procesada',
    'ventafacturada',
    'pos.venta.registrada',
    'caja.cerrada',
    'cobro.registrado',
    'cobroregistrado',
    'cxc.ajuste.registrado',
    'cxcajusteregistrado',
    'recepcion.registrada',
    'recepcionregistrada',
    'factura.proveedor.registrada',
    'facturaproveedorregistrada',
    'devolucion.proveedor.registrada',
    'devolucionproveedoremitida',
    'cxc.creada',
    'cuentaporcobrarcreada',
    'pago.proveedor.registrado',
    'pagoproveedorregistrado',
    'ajuste.inventario.aplicado',
    'ajusteinventarioaplicado',
    'planilla.liquidada',
    'planillaliquidada',
    'planilla.pagada',
    'planillapagada',
    'liquidacion.aprobada',
    'liquidacion.pagada',
    'liquidacion.pago.revertido',
    'cts.depositado',
    'depreciacion.generada',
    'depreciaciongenerada',
    'cpe.anulado',
    'cpeanulado',
    'factura.emitida',
    'facturaemitida',
    'nota_credito.emitida',
    'saldo_favor.aplicado',
    'saldo_favor.reembolsado',
    'banco.movimiento.registrado',
    'banco.transferencia.registrada'
  ]::text[])
$function$;

CREATE OR REPLACE FUNCTION app.accounting_event_date_458(
  p_payload jsonb,
  p_occurred_at timestamptz
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_raw text;
BEGIN
  v_raw := COALESCE(
    NULLIF(p_payload->>'fechaContable', ''),
    NULLIF(p_payload->>'fecha_contable', ''),
    NULLIF(p_payload->>'fechaEmision', ''),
    NULLIF(p_payload->>'fecha_emision', ''),
    NULLIF(p_payload->>'fechaPago', ''),
    NULLIF(p_payload->>'fecha_pago', ''),
    NULLIF(p_payload->>'fechaRecepcion', ''),
    NULLIF(p_payload->>'fecha_recepcion', ''),
    NULLIF(p_payload->>'fechaCierre', ''),
    NULLIF(p_payload->>'fecha_cierre', ''),
    NULLIF(p_payload->>'fecha', ''),
    NULLIF(p_payload->>'periodo', '')
  );

  IF v_raw ~ '^\d{4}-\d{2}$' THEN
    RETURN make_date(substr(v_raw, 1, 4)::integer, substr(v_raw, 6, 2)::integer, 1);
  END IF;

  IF v_raw IS NOT NULL THEN
    BEGIN
      RETURN v_raw::timestamptz::date;
    EXCEPTION WHEN others THEN
      BEGIN
        RETURN v_raw::date;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END;
  END IF;

  RETURN COALESCE(p_occurred_at, now())::date;
END;
$function$;

CREATE OR REPLACE FUNCTION app.guard_accounting_outbox_period_458()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_old_date date;
  v_new_date date;
BEGIN
  IF TG_OP = 'UPDATE' AND app.is_accounting_event_458(OLD.event_type) THEN
    v_old_date := app.accounting_event_date_458(OLD.payload, OLD.occurred_at);
    PERFORM app.ensure_accounting_period_open_458(OLD.tenant_id, v_old_date);
  END IF;

  IF app.is_accounting_event_458(NEW.event_type) THEN
    v_new_date := app.accounting_event_date_458(NEW.payload, NEW.occurred_at);
    IF TG_OP = 'INSERT'
       OR NOT app.is_accounting_event_458(OLD.event_type)
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR v_new_date IS DISTINCT FROM v_old_date THEN
      PERFORM app.ensure_accounting_period_open_458(NEW.tenant_id, v_new_date);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_accounting_outbox_period_458 ON public.outbox_events;
CREATE TRIGGER trg_guard_accounting_outbox_period_458
BEFORE INSERT OR UPDATE OF tenant_id, event_type, payload, occurred_at, status, processed_at
ON public.outbox_events
FOR EACH ROW
EXECUTE FUNCTION app.guard_accounting_outbox_period_458();

CREATE OR REPLACE FUNCTION app.guard_period_transition_458()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF COALESCE(current_setting('app.period_transition_458', true), '') <> 'on' THEN
    IF TG_OP = 'INSERT' THEN
      IF upper(COALESCE(NEW.estado::text, 'ABIERTO')) <> 'ABIERTO' THEN
        RAISE EXCEPTION 'ACCOUNTING_PERIOD_INSERT_MUST_BE_OPEN' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'ACCOUNTING_PERIOD_DELETE_REQUIRES_RPC' USING ERRCODE = '42501';
    END IF;

    IF upper(OLD.estado::text) <> 'ABIERTO'
       OR NEW.estado IS DISTINCT FROM OLD.estado
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.anio IS DISTINCT FROM OLD.anio
       OR NEW.mes IS DISTINCT FROM OLD.mes THEN
      RAISE EXCEPTION 'ACCOUNTING_PERIOD_TRANSITION_REQUIRES_RPC' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_period_transition_458 ON public.periodos_contables;
CREATE TRIGGER trg_guard_period_transition_458
BEFORE INSERT OR UPDATE OR DELETE ON public.periodos_contables
FOR EACH ROW
EXECUTE FUNCTION app.guard_period_transition_458();

CREATE OR REPLACE FUNCTION public.balance_comprobacion_live(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer
)
RETURNS TABLE (
  cuenta text,
  nombre text,
  saldo_inicial numeric,
  debe numeric,
  haber numeric,
  saldo_final numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  WITH params AS (
    SELECT
      make_date(p_anio, p_mes, 1) AS inicio,
      (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date AS fin
  ), base AS (
    SELECT
      COALESCE(NULLIF(btrim(pc.codigo), ''), 'SIN_CUENTA') AS cuenta,
      COALESCE(NULLIF(btrim(pc.nombre), ''), 'Cuenta sin nombre') AS nombre,
      COALESCE(da.debe, 0)::numeric AS debe,
      COALESCE(da.haber, 0)::numeric AS haber,
      COALESCE(ac.fecha, ac.created_at)::date AS fecha,
      p.inicio,
      p.fin
    FROM public.asientos_contables ac
    JOIN public.detalle_asientos da
      ON da.asiento_id = ac.id
     AND da.tenant_id = ac.tenant_id
    JOIN public.plan_cuentas pc
      ON pc.id = da.cuenta_id
     AND pc.tenant_id = ac.tenant_id
    CROSS JOIN params p
    WHERE ac.tenant_id = p_tenant_id
      AND upper(COALESCE(ac.estado::text, '')) = 'CONFIRMADO'
      AND COALESCE(ac.fecha, ac.created_at)::date < p.fin
  )
  SELECT
    b.cuenta,
    max(b.nombre) AS nombre,
    round(COALESCE(sum(b.debe - b.haber) FILTER (WHERE b.fecha < b.inicio), 0), 2) AS saldo_inicial,
    round(COALESCE(sum(b.debe) FILTER (WHERE b.fecha >= b.inicio), 0), 2) AS debe,
    round(COALESCE(sum(b.haber) FILTER (WHERE b.fecha >= b.inicio), 0), 2) AS haber,
    round(COALESCE(sum(b.debe - b.haber), 0), 2) AS saldo_final
  FROM base b
  GROUP BY b.cuenta
  HAVING abs(COALESCE(sum(b.debe - b.haber), 0)) > 0.005
      OR abs(COALESCE(sum(b.debe) FILTER (WHERE b.fecha >= b.inicio), 0)) > 0.005
      OR abs(COALESCE(sum(b.haber) FILTER (WHERE b.fecha >= b.inicio), 0)) > 0.005
  ORDER BY b.cuenta
$function$;

CREATE OR REPLACE FUNCTION app.estado_resultados_live_458(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  WITH params AS (
    SELECT
      make_date(p_anio, 1, 1) AS inicio,
      (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date AS fin
  ), base AS (
    SELECT
      COALESCE(pc.codigo, '') AS codigo,
      COALESCE(da.debe, 0)::numeric AS debe,
      COALESCE(da.haber, 0)::numeric AS haber
    FROM public.asientos_contables ac
    JOIN public.detalle_asientos da
      ON da.asiento_id = ac.id
     AND da.tenant_id = ac.tenant_id
    JOIN public.plan_cuentas pc
      ON pc.id = da.cuenta_id
     AND pc.tenant_id = ac.tenant_id
    CROSS JOIN params p
    WHERE ac.tenant_id = p_tenant_id
      AND upper(COALESCE(ac.estado::text, '')) = 'CONFIRMADO'
      AND COALESCE(ac.fecha, ac.created_at)::date >= p.inicio
      AND COALESCE(ac.fecha, ac.created_at)::date < p.fin
  ), raw AS (
    SELECT
      round(COALESCE(sum(CASE WHEN codigo ~ '^(70|71|72)' THEN haber - debe ELSE 0 END), 0), 2) AS ventas,
      round(COALESCE(sum(CASE WHEN codigo ~ '^7[3-8]' THEN haber - debe ELSE 0 END), 0), 2) AS otros_ingresos,
      round(COALESCE(sum(CASE WHEN codigo ~ '^69' THEN debe - haber ELSE 0 END), 0), 2) AS costo_ventas,
      round(COALESCE(sum(CASE WHEN codigo ~ '^(62|63|64|65|66|68)' THEN debe - haber ELSE 0 END), 0), 2) AS naturaleza_admin,
      round(COALESCE(sum(CASE WHEN codigo ~ '^67' THEN debe - haber ELSE 0 END), 0), 2) AS naturaleza_financiera,
      round(COALESCE(sum(CASE WHEN codigo ~ '^94' THEN debe - haber ELSE 0 END), 0), 2) AS destino_admin,
      round(COALESCE(sum(CASE WHEN codigo ~ '^95' THEN debe - haber ELSE 0 END), 0), 2) AS destino_ventas,
      round(COALESCE(sum(CASE WHEN codigo ~ '^(96|97)' THEN debe - haber ELSE 0 END), 0), 2) AS destino_financiero
    FROM base
  ), agg AS (
    SELECT
      ventas,
      otros_ingresos,
      costo_ventas,
      destino_admin + greatest(naturaleza_admin - destino_admin - destino_ventas, 0) AS gastos_administrativos,
      destino_ventas AS gastos_ventas,
      destino_financiero + greatest(naturaleza_financiera - destino_financiero, 0) AS gastos_financieros
    FROM raw
  )
  SELECT jsonb_build_object(
    'ventas', ventas,
    'otros_ingresos', otros_ingresos,
    'total_ingresos', ventas + otros_ingresos,
    'costo_ventas', costo_ventas,
    'utilidad_bruta', ventas + otros_ingresos - costo_ventas,
    'gastos_administrativos', gastos_administrativos,
    'gastos_ventas', gastos_ventas,
    'gastos_financieros', gastos_financieros,
    'total_gastos', gastos_administrativos + gastos_ventas + gastos_financieros,
    'utilidad_neta', ventas + otros_ingresos - costo_ventas
      - gastos_administrativos - gastos_ventas - gastos_financieros
  )
  FROM agg
$function$;

CREATE OR REPLACE FUNCTION public.estado_resultados_live(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_anio < 2000 OR p_anio > 2100 OR p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'ACCOUNTING_REPORT_PARAMETERS_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN app.estado_resultados_live_458(p_tenant_id, p_anio, p_mes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.balance_general_live(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_resultado jsonb;
  v_resultado_ejercicio numeric;
  v_cierre_confirmado boolean;
  v_balance jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_anio < 2000 OR p_anio > 2100 OR p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'ACCOUNTING_REPORT_PARAMETERS_INVALID' USING ERRCODE = '22023';
  END IF;

  v_resultado := app.estado_resultados_live_458(p_tenant_id, p_anio, p_mes);
  v_resultado_ejercicio := COALESCE((v_resultado->>'utilidad_neta')::numeric, 0);

  SELECT EXISTS (
    SELECT 1
    FROM public.asientos_contables a
    WHERE a.tenant_id = p_tenant_id
      AND upper(COALESCE(a.estado::text, '')) = 'CONFIRMADO'
      AND upper(COALESCE(a.origen, '')) = 'CIERRE_ANUAL'
      AND EXTRACT(YEAR FROM COALESCE(a.fecha, a.created_at))::integer = p_anio
      AND COALESCE(a.fecha, a.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
  ) INTO v_cierre_confirmado;

  IF v_cierre_confirmado THEN
    v_resultado_ejercicio := 0;
  END IF;

  WITH balances AS (
    SELECT
      COALESCE(pc.codigo, '') AS codigo,
      round(COALESCE(sum(COALESCE(da.debe, 0) - COALESCE(da.haber, 0)), 0), 2) AS saldo
    FROM public.asientos_contables ac
    JOIN public.detalle_asientos da
      ON da.asiento_id = ac.id
     AND da.tenant_id = ac.tenant_id
    JOIN public.plan_cuentas pc
      ON pc.id = da.cuenta_id
     AND pc.tenant_id = ac.tenant_id
    WHERE ac.tenant_id = p_tenant_id
      AND upper(COALESCE(ac.estado::text, '')) = 'CONFIRMADO'
      AND COALESCE(ac.fecha, ac.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
    GROUP BY pc.codigo
  ), agg AS (
    SELECT
      COALESCE(sum(CASE WHEN codigo ~ '^10' THEN greatest(saldo, 0) ELSE 0 END), 0) AS efectivo,
      COALESCE(sum(CASE WHEN codigo ~ '^12' THEN greatest(saldo, 0) ELSE 0 END), 0) AS cuentas_por_cobrar,
      COALESCE(sum(CASE WHEN codigo ~ '^20' THEN greatest(saldo, 0) ELSE 0 END), 0) AS inventarios,
      COALESCE(sum(CASE WHEN codigo ~ '^(11|13|14|16|18)' THEN greatest(saldo, 0) ELSE 0 END), 0) AS otros_activos_corrientes,
      COALESCE(sum(CASE WHEN codigo ~ '^33' THEN greatest(saldo, 0) ELSE 0 END), 0) AS activos_fijos,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^39' THEN least(saldo, 0) ELSE 0 END), 0)) AS depreciacion_acumulada,
      COALESCE(sum(CASE WHEN codigo ~ '^(34|35|36|37|38)' THEN greatest(saldo, 0) ELSE 0 END), 0) AS otros_activos_no_corrientes,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^42' THEN least(saldo, 0) ELSE 0 END), 0)) AS cuentas_por_pagar,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^40' THEN least(saldo, 0) ELSE 0 END), 0)) AS tributos_por_pagar,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^41' THEN least(saldo, 0) ELSE 0 END), 0)) AS remuneraciones_por_pagar,
      abs(COALESCE(sum(CASE
        WHEN codigo ~ '^(43|44)' THEN least(saldo, 0)
        WHEN codigo ~ '^(10|12)' THEN least(saldo, 0)
        ELSE 0 END), 0)) AS otros_pasivos_corrientes,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^(45|46|47|48)' THEN least(saldo, 0) ELSE 0 END), 0)) AS deudas_largo_plazo,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^49' THEN least(saldo, 0) ELSE 0 END), 0)) AS otros_pasivos_no_corrientes,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^50' THEN least(saldo, 0) ELSE 0 END), 0)) AS capital,
      abs(COALESCE(sum(CASE WHEN codigo ~ '^(56|57|58|59)' THEN least(saldo, 0) ELSE 0 END), 0)) AS resultados_acumulados
    FROM balances
  )
  SELECT jsonb_build_object(
    'efectivo', round(efectivo, 2),
    'cuentas_por_cobrar', round(cuentas_por_cobrar, 2),
    'inventarios', round(inventarios, 2),
    'otros_activos_corrientes', round(otros_activos_corrientes, 2),
    'activos_fijos', round(activos_fijos, 2),
    'depreciacion_acumulada', round(depreciacion_acumulada, 2),
    'otros_activos_no_corrientes', round(otros_activos_no_corrientes, 2),
    'cuentas_por_pagar', round(cuentas_por_pagar, 2),
    'tributos_por_pagar', round(tributos_por_pagar, 2),
    'remuneraciones_por_pagar', round(remuneraciones_por_pagar, 2),
    'otros_pasivos_corrientes', round(otros_pasivos_corrientes, 2),
    'deudas_largo_plazo', round(deudas_largo_plazo, 2),
    'otros_pasivos_no_corrientes', round(otros_pasivos_no_corrientes, 2),
    'capital', round(capital, 2),
    'resultados_acumulados', round(resultados_acumulados, 2),
    'resultado_ejercicio', round(v_resultado_ejercicio, 2)
  ) INTO v_balance
  FROM agg;

  RETURN v_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calcular_resultado_ejercicio(
  p_tenant_id uuid,
  p_anio integer
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT COALESCE((app.estado_resultados_live_458(p_tenant_id, p_anio, 12)->>'utilidad_neta')::numeric, 0)
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_periodo_contable_tx(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_periodo public.periodos_contables;
  v_pending integer;
  v_drafts integer;
  v_invalid integer;
  v_resultado numeric;
  v_cuenta_89 uuid;
  v_cuenta_59 uuid;
  v_cierre_seq integer;
  v_source_event_id uuid;
  v_asiento jsonb;
  v_detalles jsonb;
BEGIN
  PERFORM app.assert_accounting_actor_458(p_tenant_id, p_actor_id);

  IF p_anio < 2000 OR p_anio > 2100 OR p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_PARAMETERS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_periodo
  FROM public.periodos_contables p
  WHERE p.tenant_id = p_tenant_id
    AND p.anio = p_anio
    AND p.mes = p_mes
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND:%-%', p_anio, p_mes;
  END IF;

  IF upper(v_periodo.estado::text) = 'CERRADO' THEN
    RETURN jsonb_build_object(
      'periodo', to_jsonb(v_periodo),
      'idempotent', true,
      'cierre_asiento_id', v_periodo.metadata->>'cierre_asiento_id'
    );
  END IF;

  IF upper(v_periodo.estado::text) <> 'ABIERTO' THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_OPEN:%', v_periodo.estado USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.periodos_contables prior
    WHERE prior.tenant_id = p_tenant_id
      AND prior.anio = p_anio
      AND prior.mes < p_mes
      AND upper(prior.estado::text) <> 'CERRADO'
  ) THEN
    RAISE EXCEPTION 'ACCOUNTING_PRIOR_PERIODS_MUST_BE_CLOSED' USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.outbox_events e
  WHERE e.tenant_id = p_tenant_id
    AND app.is_accounting_event_458(e.event_type)
    AND app.accounting_event_date_458(e.payload, e.occurred_at) >= make_date(p_anio, p_mes, 1)
    AND app.accounting_event_date_458(e.payload, e.occurred_at) <
      (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
    AND (e.processed_at IS NULL OR lower(COALESCE(e.status, '')) NOT IN ('completed', 'processed'));

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_PENDING_EVENTS:%', v_pending USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_drafts
  FROM public.asientos_contables a
  WHERE a.tenant_id = p_tenant_id
    AND upper(COALESCE(a.estado::text, '')) = 'BORRADOR'
    AND COALESCE(a.fecha, a.created_at)::date >= make_date(p_anio, p_mes, 1)
    AND COALESCE(a.fecha, a.created_at)::date <
      (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date;

  IF v_drafts > 0 THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_DRAFT_ENTRIES:%', v_drafts USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_invalid
  FROM (
    SELECT
      a.id,
      count(d.id) AS lines,
      round(COALESCE(sum(d.debe), 0), 2) AS debe,
      round(COALESCE(sum(d.haber), 0), 2) AS haber,
      round(COALESCE(a.total_debe, 0), 2) AS header_debe,
      round(COALESCE(a.total_haber, 0), 2) AS header_haber
    FROM public.asientos_contables a
    LEFT JOIN public.detalle_asientos d
      ON d.asiento_id = a.id
     AND d.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant_id
      AND upper(COALESCE(a.estado::text, '')) = 'CONFIRMADO'
      AND COALESCE(a.fecha, a.created_at)::date >= make_date(p_anio, p_mes, 1)
      AND COALESCE(a.fecha, a.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date
    GROUP BY a.id, a.total_debe, a.total_haber
    HAVING count(d.id) < 2
       OR round(COALESCE(sum(d.debe), 0), 2) <= 0
       OR round(COALESCE(sum(d.debe), 0), 2) <> round(COALESCE(sum(d.haber), 0), 2)
       OR round(COALESCE(sum(d.debe), 0), 2) <> round(COALESCE(a.total_debe, 0), 2)
       OR round(COALESCE(sum(d.haber), 0), 2) <> round(COALESCE(a.total_haber, 0), 2)
  ) invalid;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_INVALID_ENTRIES:%', v_invalid USING ERRCODE = '55000';
  END IF;

  v_cierre_seq := COALESCE((v_periodo.metadata->>'cierre_sequence')::integer, 0) + 1;

  IF p_mes = 12 THEN
    v_resultado := COALESCE((app.estado_resultados_live_458(p_tenant_id, p_anio, 12)->>'utilidad_neta')::numeric, 0);
    IF abs(v_resultado) > 0.005 THEN
      SELECT pc.id INTO v_cuenta_89
      FROM public.plan_cuentas pc
      WHERE pc.tenant_id = p_tenant_id AND btrim(pc.codigo) = '89'
      ORDER BY pc.created_at, pc.id
      LIMIT 1;

      SELECT pc.id INTO v_cuenta_59
      FROM public.plan_cuentas pc
      WHERE pc.tenant_id = p_tenant_id AND btrim(pc.codigo) = '59'
      ORDER BY pc.created_at, pc.id
      LIMIT 1;

      IF v_cuenta_89 IS NULL OR v_cuenta_59 IS NULL THEN
        RAISE EXCEPTION 'ACCOUNTING_YEAR_CLOSE_ACCOUNTS_89_59_REQUIRED';
      END IF;

      v_source_event_id := (
        substr(encode(extensions.digest(convert_to(
          format('cierre-anual:%s:%s:%s', p_tenant_id, p_anio, v_cierre_seq), 'UTF8'
        ), 'sha256'), 'hex'), 1, 32)
      )::uuid;

      v_detalles := CASE WHEN v_resultado > 0 THEN
        jsonb_build_array(
          jsonb_build_object('cuenta_id', v_cuenta_89, 'debe', round(v_resultado, 2), 'haber', 0, 'concepto', format('Determinacion del resultado %s', p_anio)),
          jsonb_build_object('cuenta_id', v_cuenta_59, 'debe', 0, 'haber', round(v_resultado, 2), 'concepto', format('Utilidad del ejercicio %s', p_anio))
        )
      ELSE
        jsonb_build_array(
          jsonb_build_object('cuenta_id', v_cuenta_59, 'debe', round(abs(v_resultado), 2), 'haber', 0, 'concepto', format('Perdida del ejercicio %s', p_anio)),
          jsonb_build_object('cuenta_id', v_cuenta_89, 'debe', 0, 'haber', round(abs(v_resultado), 2), 'concepto', format('Determinacion del resultado %s', p_anio))
        )
      END;

      v_asiento := public.crear_asiento_con_detalles_tx(
        p_tenant_id,
        jsonb_build_object(
          'fecha', make_date(p_anio, 12, 31)::text,
          'concepto', format('Asiento de cierre del ejercicio %s', p_anio),
          'descripcion', format('Asiento de cierre del ejercicio %s', p_anio),
          'tipo_asiento', 'CIERRE',
          'origen', 'CIERRE_ANUAL',
          'referencia', format('CIERRE-%s-%s', p_anio, v_cierre_seq),
          'source_event_id', v_source_event_id,
          'estado', 'CONFIRMADO',
          'created_by', p_actor_id,
          'confirmado_por', p_actor_id
        ),
        v_detalles
      );
    END IF;
  END IF;

  PERFORM set_config('app.period_transition_458', 'on', true);
  UPDATE public.periodos_contables p
  SET estado = 'CERRADO',
      fecha_cierre = app.hoy_tenant(p_tenant_id),
      cerrado_por = p_actor_id,
      metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'cierre_sequence', v_cierre_seq,
        'cierre_asiento_id', v_asiento->>'id',
        'cerrado_en', now(),
        'cerrado_por', p_actor_id
      ),
      updated_at = now()
  WHERE p.id = v_periodo.id
  RETURNING p.* INTO v_periodo;
  PERFORM set_config('app.period_transition_458', 'off', true);

  RETURN jsonb_build_object(
    'periodo', to_jsonb(v_periodo),
    'idempotent', false,
    'cierre_asiento_id', v_asiento->>'id'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reabrir_periodo_contable_tx(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_periodo public.periodos_contables;
  v_estado text;
BEGIN
  PERFORM app.assert_accounting_actor_458(p_tenant_id, p_actor_id);

  SELECT p.* INTO v_periodo
  FROM public.periodos_contables p
  WHERE p.tenant_id = p_tenant_id AND p.anio = p_anio AND p.mes = p_mes
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND:%-%', p_anio, p_mes;
  END IF;

  v_estado := upper(v_periodo.estado::text);
  IF v_estado = 'ABIERTO' THEN
    RETURN jsonb_build_object('periodo', to_jsonb(v_periodo), 'idempotent', true);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.periodos_contables later
    WHERE later.tenant_id = p_tenant_id
      AND upper(later.estado::text) = 'CERRADO'
      AND (later.anio, later.mes) > (p_anio, p_mes)
  ) THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_HAS_LATER_CLOSED_PERIODS' USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.period_transition_458', 'on', true);
  UPDATE public.periodos_contables p
  SET estado = 'ABIERTO',
      fecha_cierre = NULL,
      cerrado_por = NULL,
      metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'reabierto_en', now(),
        'reabierto_por', p_actor_id
      ),
      updated_at = now()
  WHERE p.id = v_periodo.id
  RETURNING p.* INTO v_periodo;
  PERFORM set_config('app.period_transition_458', 'off', true);

  IF v_estado = 'CERRADO' THEN
    UPDATE public.asientos_contables a
    SET estado = 'ANULADO',
        anulado_por = p_actor_id::text,
        anulado_en = now(),
        motivo_anulacion = format('Reapertura del periodo %s-%s', p_anio, lpad(p_mes::text, 2, '0')),
        updated_at = now()
    WHERE a.tenant_id = p_tenant_id
      AND upper(COALESCE(a.estado::text, '')) = 'CONFIRMADO'
      AND upper(COALESCE(a.origen, '')) = 'CIERRE_ANUAL'
      AND COALESCE(a.fecha, a.created_at)::date >= make_date(p_anio, p_mes, 1)
      AND COALESCE(a.fecha, a.created_at)::date <
        (make_date(p_anio, p_mes, 1) + INTERVAL '1 month')::date;
  END IF;

  RETURN jsonb_build_object('periodo', to_jsonb(v_periodo), 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bloquear_periodo_contable_tx(
  p_tenant_id uuid,
  p_anio integer,
  p_mes integer,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_periodo public.periodos_contables;
BEGIN
  PERFORM app.assert_accounting_actor_458(p_tenant_id, p_actor_id);

  SELECT p.* INTO v_periodo
  FROM public.periodos_contables p
  WHERE p.tenant_id = p_tenant_id AND p.anio = p_anio AND p.mes = p_mes
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND:%-%', p_anio, p_mes;
  END IF;

  IF upper(v_periodo.estado::text) = 'BLOQUEADO' THEN
    RETURN jsonb_build_object('periodo', to_jsonb(v_periodo), 'idempotent', true);
  END IF;

  IF upper(v_periodo.estado::text) <> 'ABIERTO' THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_CLOSED_CANNOT_BE_BLOCKED' USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.period_transition_458', 'on', true);
  UPDATE public.periodos_contables p
  SET estado = 'BLOQUEADO',
      metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'bloqueado_en', now(),
        'bloqueado_por', p_actor_id
      ),
      updated_at = now()
  WHERE p.id = v_periodo.id
  RETURNING p.* INTO v_periodo;
  PERFORM set_config('app.period_transition_458', 'off', true);

  RETURN jsonb_build_object('periodo', to_jsonb(v_periodo), 'idempotent', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.balance_comprobacion_live(uuid, integer, integer)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.estado_resultados_live(uuid, integer, integer)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.balance_general_live(uuid, integer, integer)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cerrar_periodo_contable_tx(uuid, integer, integer, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reabrir_periodo_contable_tx(uuid, integer, integer, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_periodo_contable_tx(uuid, integer, integer, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.balance_comprobacion_live(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.estado_resultados_live(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.balance_general_live(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_periodo_contable_tx(uuid, integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reabrir_periodo_contable_tx(uuid, integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bloquear_periodo_contable_tx(uuid, integer, integer, uuid) TO service_role;

REVOKE ALL ON TABLE public.mv_balance_comprobacion FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mv_estado_resultados FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mv_balance_general FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mv_balance_comprobacion TO service_role;
GRANT SELECT ON TABLE public.mv_estado_resultados TO service_role;
GRANT SELECT ON TABLE public.mv_balance_general TO service_role;

COMMENT ON FUNCTION public.balance_comprobacion_live(uuid, integer, integer)
IS 'Balance acumulado al cierre del mes: saldo inicial historico, movimientos del mes y saldo final; solo asientos CONFIRMADO.';
COMMENT ON FUNCTION public.estado_resultados_live(uuid, integer, integer)
IS 'Estado de resultados acumulado desde enero al mes solicitado; no depende de materialized views.';
COMMENT ON FUNCTION public.balance_general_live(uuid, integer, integer)
IS 'Balance general acumulado al cierre solicitado, con resultado YTD no duplicado tras el cierre anual.';
COMMENT ON FUNCTION public.cerrar_periodo_contable_tx(uuid, integer, integer, uuid)
IS 'Cierra un periodo bajo el mismo lock usado por asientos y outbox; valida pendientes, borradores y cuadre.';

COMMIT;
