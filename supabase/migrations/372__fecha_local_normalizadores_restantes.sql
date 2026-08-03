-- Cierre del cambio de 370. Estos seis normalizadores se quedaron en UTC
-- porque su cuerpo nunca mencionaba NEW.tenant_id, pero sus tablas si tienen
-- la columna: periodos_contables, feriados, conciliaciones_bancarias,
-- movimientos_bancarios, pagos_lote y asientos_contables_rrhh.
--
-- Dejarlos en UTC significaba que un periodo contable cerrado o un feriado
-- registrado despues de las 19:00 de Lima se fechaba al dia siguiente.


CREATE OR REPLACE FUNCTION app.normalize_asientos_contables_rrhh_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.planilla_id := app.to_uuid_or_null(COALESCE(NEW.planilla_id::text, ''));
  NEW.cuenta := COALESCE(
    NULLIF(btrim(COALESCE(NEW.cuenta, '')), ''),
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'RRHH-GENERICO'
  );
  NEW.descripcion := COALESCE(
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'Asiento RRHH'
  );

  NEW.debe := GREATEST(COALESCE(NEW.debe, 0), 0);
  NEW.haber := GREATEST(COALESCE(NEW.haber, 0), 0);
  NEW.fecha := COALESCE(NEW.fecha, app.hoy_tenant(NEW.tenant_id));

  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    'RRHH-' || COALESCE(NEW.planilla_id::text, NEW.id::text)
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_conciliaciones_bancarias_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_banco text;
  v_numero_cuenta text;
  v_moneda text;
BEGIN
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.created_by := app.to_uuid_or_null(COALESCE(NEW.created_by::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, NEW.created_by::text, ''));
  NEW.cerrado_by := app.to_uuid_or_null(COALESCE(NEW.cerrado_by::text, ''));

  NEW.fecha_desde := COALESCE(NEW.fecha_desde, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_hasta := COALESCE(NEW.fecha_hasta, NEW.fecha_desde);
  IF NEW.fecha_hasta < NEW.fecha_desde THEN
    NEW.fecha_hasta := NEW.fecha_desde;
  END IF;

  NEW.periodo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.periodo, '')), ''),
    to_char(NEW.fecha_desde, 'YYYY-MM')
  );
  IF NEW.periodo !~ '^\d{4}-\d{2}$' THEN
    NEW.periodo := to_char(NEW.fecha_desde, 'YYYY-MM');
  END IF;

  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ABIERTA'));
  IF NEW.estado NOT IN ('ABIERTA', 'EN_PROCESO', 'CERRADA') THEN
    NEW.estado := 'ABIERTA';
  END IF;

  NEW.saldo_libro := COALESCE(NEW.saldo_libro, 0);
  NEW.saldo_banco := COALESCE(NEW.saldo_banco, 0);
  NEW.diferencia := ROUND((NEW.saldo_libro - NEW.saldo_banco)::numeric, 2);

  NEW.banco := NULLIF(upper(btrim(COALESCE(NEW.banco, ''))), '');
  NEW.numero_cuenta := NULLIF(btrim(COALESCE(NEW.numero_cuenta, '')), '');
  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));

  IF NEW.cuenta_bancaria_id IS NOT NULL THEN
    SELECT
      upper(NULLIF(btrim(COALESCE(cb.banco, '')), '')),
      NULLIF(btrim(COALESCE(cb.numero_cuenta::text, '')), ''),
      upper(NULLIF(btrim(COALESCE(cb.moneda, '')), ''))
    INTO v_banco, v_numero_cuenta, v_moneda
    FROM public.cuentas_bancarias cb
    WHERE cb.id = NEW.cuenta_bancaria_id;

    NEW.banco := COALESCE(NEW.banco, v_banco);
    NEW.numero_cuenta := COALESCE(NEW.numero_cuenta, v_numero_cuenta);
    NEW.moneda := COALESCE(NEW.moneda, v_moneda, 'PEN');
  END IF;

  IF NEW.estado = 'CERRADA' THEN
    NEW.cerrado_at := COALESCE(NEW.cerrado_at, now());
  ELSE
    NEW.cerrado_at := NULL;
    NEW.cerrado_by := NULL;
  END IF;

  NEW.observaciones := NULLIF(btrim(COALESCE(NEW.observaciones, '')), '');
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    'CONC-' || replace(NEW.periodo, '-', '') || '-' || upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))
  );
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Conciliación ' || NEW.periodo);

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_feriados_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.pais := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.pais, '')), ''), 'PE'));
  NEW.fecha := COALESCE(NEW.fecha, app.hoy_tenant(NEW.tenant_id));

  NEW.descripcion := COALESCE(
    NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'Feriado'
  );

  NEW.es_nacional := COALESCE(NEW.es_nacional, true);
  NEW.recurrente_anual := COALESCE(NEW.recurrente_anual, true);
  NEW.activo := COALESCE(
    NEW.activo,
    CASE WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false ELSE true END
  );
  NEW.estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;

  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    NEW.pais || '-' || to_char(NEW.fecha, 'YYYYMMDD')
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_movimientos_bancarios_tesoreria_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
BEGIN
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.conciliacion_id := app.to_uuid_or_null(COALESCE(NEW.conciliacion_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.cxp_id := app.to_uuid_or_null(COALESCE(NEW.cxp_id::text, ''));
  NEW.cxc_id := app.to_uuid_or_null(COALESCE(NEW.cxc_id::text, ''));
  NEW.match_id := app.to_uuid_or_null(COALESCE(NEW.match_id::text, ''));
  NEW.movimiento_relacionado_id := app.to_uuid_or_null(COALESCE(NEW.movimiento_relacionado_id::text, ''));
  NEW.created_by := app.to_uuid_or_null(COALESCE(NEW.created_by::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, NEW.created_by::text, ''));

  NEW.tipo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'CARGO'));
  IF NEW.tipo NOT IN ('ABONO', 'CARGO') THEN
    NEW.tipo := 'CARGO';
  END IF;

  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.fecha := COALESCE(NEW.fecha, app.hoy_tenant(NEW.tenant_id));
  NEW.descripcion := COALESCE(NULLIF(btrim(COALESCE(NEW.descripcion, '')), ''), NEW.tipo || ' bancario');
  NEW.referencia := NULLIF(btrim(COALESCE(NEW.referencia, '')), '');
  NEW.metodo_pago := NULLIF(upper(btrim(COALESCE(NEW.metodo_pago, ''))), '');

  NEW.conciliado := COALESCE(NEW.conciliado, false);
  NEW.es_extracto := COALESCE(NEW.es_extracto, false);
  NEW.match_automatico := COALESCE(NEW.match_automatico, false);
  NEW.diferencia_conciliacion := GREATEST(COALESCE(NEW.diferencia_conciliacion, 0), 0);
  NEW.saldo_anterior := COALESCE(NEW.saldo_anterior, 0);
  NEW.saldo_nuevo := COALESCE(NEW.saldo_nuevo, 0);

  NEW.saldo := COALESCE(NEW.saldo, NEW.saldo_nuevo, NEW.saldo_anterior, 0);
  NEW.activo := COALESCE(NEW.activo, true);
  NEW.estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;

  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    'MB-' || to_char(now(), 'YYYYMMDDHH24MISSMS')
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_pagos_lote_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));

  NEW.referencia_lote := upper(COALESCE(
    NULLIF(btrim(COALESCE(NEW.referencia_lote, '')), ''),
    format(
      'LOTE-%s-%s',
      to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
      upper(left(replace(gen_random_uuid()::text, '-', ''), 8))
    )
  ));
  NEW.fecha_pago := COALESCE(NEW.fecha_pago, app.hoy_tenant(NEW.tenant_id));
  NEW.metodo_pago := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.metodo_pago, '')), ''), 'TRANSFERENCIA'));
  NEW.monto_total := GREATEST(COALESCE(NEW.monto_total, 0), 0);
  NEW.pagos := COALESCE(NEW.pagos, '[]'::jsonb);
  NEW.resultado := COALESCE(NEW.resultado, '{}'::jsonb);

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PROCESADO'));
  IF v_estado NOT IN ('PENDIENTE', 'PROCESADO', 'ERROR', 'CANCELADO') THEN
    v_estado := 'PROCESADO';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, (NEW.estado IN ('PENDIENTE', 'PROCESADO')));
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$fn$;


CREATE OR REPLACE FUNCTION app.normalize_periodos_contables_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_estado text;
BEGIN
  NEW.anio := COALESCE(NEW.anio, EXTRACT(YEAR FROM app.hoy_tenant(NEW.tenant_id))::integer);
  NEW.mes := COALESCE(NEW.mes, EXTRACT(MONTH FROM app.hoy_tenant(NEW.tenant_id))::integer);
  NEW.mes := LEAST(GREATEST(NEW.mes, 1), 12);

  v_estado := upper(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.estado, '')), ''),
      'ABIERTO'
    )
  );

  IF v_estado NOT IN ('ABIERTO', 'CERRADO', 'BLOQUEADO') THEN
    v_estado := 'ABIERTO';
  END IF;

  NEW.estado := v_estado;
  NEW.cerrado_por := app.to_uuid_or_null(COALESCE(NEW.cerrado_por::text, ''));

  IF NEW.estado = 'CERRADO' THEN
    NEW.fecha_cierre := COALESCE(NEW.fecha_cierre, app.hoy_tenant(NEW.tenant_id));
  ELSE
    NEW.fecha_cierre := NULL;
    NEW.cerrado_por := NULL;
  END IF;

  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('%s-%s', NEW.anio, lpad(NEW.mes::text, 2, '0'))
  );

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'Periodo ' || NEW.codigo
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$fn$;
