-- ============================================================================
-- 158__finanzas_cobros_egresos_runtime_alignment.sql
-- Runtime alignment for finanzas operativo (gastos/cobranzas/egresos/pagos).
-- Tablas: gastos, cobranzas, gestiones_cobranza, egresos, pagos_facturas.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.to_date_or_null(p_input text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN p_input::date;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- gastos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.gastos
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS subcategoria text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS tipo_gasto text DEFAULT 'OPERATIVO',
  ADD COLUMN IF NOT EXISTS centro_costo_id uuid,
  ADD COLUMN IF NOT EXISTS proveedor_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_contable_id uuid,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS numero_comprobante text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

DROP VIEW IF EXISTS public.v_costos_fijos_mensuales;
DROP VIEW IF EXISTS public.v_gastos_resumen;

DROP POLICY IF EXISTS tenant_isolation ON public.gastos;
DROP POLICY IF EXISTS tenant_isolation ON public.egresos;
DROP POLICY IF EXISTS tenant_isolation ON public.cobranzas;
DROP POLICY IF EXISTS tenant_isolation ON public.gestiones_cobranza;
DROP POLICY IF EXISTS tenant_isolation ON public.pagos_facturas;

ALTER TABLE IF EXISTS public.gastos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN centro_costo_id TYPE uuid USING app.to_uuid_or_null(COALESCE(centro_costo_id::text, '')),
  ALTER COLUMN proveedor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(proveedor_id::text, '')),
  ALTER COLUMN cuenta_contable_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cuenta_contable_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN fecha TYPE date USING app.to_date_or_null(COALESCE(fecha::text, '')),
  ALTER COLUMN fecha_pago TYPE date USING app.to_date_or_null(COALESCE(fecha_pago::text, '')),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN categoria TYPE text USING NULLIF(upper(btrim(COALESCE(categoria, ''))), ''),
  ALTER COLUMN subcategoria TYPE text USING NULLIF(upper(btrim(COALESCE(subcategoria, ''))), ''),
  ALTER COLUMN tipo_gasto TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_gasto, ''))), ''),
  ALTER COLUMN metodo_pago TYPE text USING NULLIF(upper(btrim(COALESCE(metodo_pago, ''))), ''),
  ALTER COLUMN numero_comprobante TYPE text USING NULLIF(upper(btrim(COALESCE(numero_comprobante, ''))), ''),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN monto SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN tipo_gasto SET DEFAULT 'OPERATIVO',
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.gastos g
SET
  fecha = COALESCE(g.fecha, g.created_at::date, current_date),
  monto = GREATEST(COALESCE(g.monto, 0), 0),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(g.moneda, ''))), ''), 'PEN'),
  categoria = COALESCE(NULLIF(upper(btrim(COALESCE(g.categoria, ''))), ''), 'GENERAL'),
  subcategoria = NULLIF(upper(btrim(COALESCE(g.subcategoria, ''))), ''),
  tipo_gasto = CASE
    WHEN upper(COALESCE(NULLIF(btrim(g.tipo_gasto), ''), 'OPERATIVO')) IN ('OPERATIVO', 'ADMINISTRATIVO', 'VENTAS', 'FINANCIERO', 'TRIBUTARIO', 'LOGISTICO')
      THEN upper(COALESCE(NULLIF(btrim(g.tipo_gasto), ''), 'OPERATIVO'))
    ELSE 'OPERATIVO'
  END,
  metodo_pago = COALESCE(NULLIF(upper(btrim(COALESCE(g.metodo_pago, ''))), ''), 'EFECTIVO'),
  descripcion = COALESCE(NULLIF(btrim(COALESCE(g.descripcion, '')), ''), NULLIF(btrim(COALESCE(g.nombre, '')), '')),
  numero_comprobante = NULLIF(upper(btrim(COALESCE(g.numero_comprobante, ''))), ''),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(g.estado), ''), 'REGISTRADO')) IN ('REGISTRADO', 'APROBADO', 'PAGADO', 'ANULADO')
      THEN upper(COALESCE(NULLIF(btrim(g.estado), ''), 'REGISTRADO'))
    WHEN upper(COALESCE(NULLIF(btrim(g.estado), ''), 'REGISTRADO')) IN ('ACTIVO', 'PENDIENTE', 'BORRADOR') THEN 'REGISTRADO'
    WHEN upper(COALESCE(NULLIF(btrim(g.estado), ''), 'REGISTRADO')) IN ('INACTIVO', 'CANCELADO') THEN 'ANULADO'
    ELSE 'REGISTRADO'
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(g.estado), ''), 'REGISTRADO')) IN ('ANULADO', 'INACTIVO', 'CANCELADO') THEN false
    ELSE COALESCE(g.activo, true)
  END,
  metadata = COALESCE(g.metadata, '{}'::jsonb)
WHERE g.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_gastos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.centro_costo_id := app.to_uuid_or_null(COALESCE(NEW.centro_costo_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.cuenta_contable_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_contable_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), current_date);
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
    format('GASTO-%s', to_char(COALESCE(NEW.fecha, current_date), 'YYYYMMDD'))
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
$$;

DROP TRIGGER IF EXISTS trg_normalize_gastos_row ON public.gastos;
CREATE TRIGGER trg_normalize_gastos_row
BEFORE INSERT OR UPDATE ON public.gastos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_gastos_row();

-- ----------------------------------------------------------------------------
-- egresos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.egresos
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS tipo_egreso text DEFAULT 'OTRO',
  ADD COLUMN IF NOT EXISTS concepto text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_por_pagar_id uuid,
  ADD COLUMN IF NOT EXISTS proveedor_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_aplicacion timestamptz,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.egresos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN cuenta_bancaria_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cuenta_bancaria_id::text, '')),
  ALTER COLUMN cuenta_por_pagar_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cuenta_por_pagar_id::text, '')),
  ALTER COLUMN proveedor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(proveedor_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN event_id TYPE uuid USING app.to_uuid_or_null(COALESCE(event_id::text, '')),
  ALTER COLUMN fecha TYPE date USING app.to_date_or_null(COALESCE(fecha::text, '')),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN tipo_egreso TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_egreso, ''))), ''),
  ALTER COLUMN concepto TYPE text USING NULLIF(btrim(COALESCE(concepto, '')), ''),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN metodo_pago TYPE text USING NULLIF(upper(btrim(COALESCE(metodo_pago, ''))), ''),
  ALTER COLUMN referencia TYPE text USING NULLIF(upper(btrim(COALESCE(referencia, ''))), ''),
  ALTER COLUMN idempotency_key TYPE text USING NULLIF(lower(btrim(COALESCE(idempotency_key, ''))), ''),
  ALTER COLUMN fecha_aplicacion TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_aplicacion::text, '')),
  ALTER COLUMN monto SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN tipo_egreso SET DEFAULT 'OTRO',
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.egresos e
SET
  fecha = COALESCE(e.fecha, e.created_at::date, current_date),
  monto = GREATEST(COALESCE(e.monto, 0), 0),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(e.moneda, ''))), ''), 'PEN'),
  tipo_egreso = CASE
    WHEN upper(COALESCE(NULLIF(btrim(e.tipo_egreso), ''), 'OTRO')) IN ('PAGO_PROVEEDOR', 'NOMINA', 'TRIBUTO', 'SERVICIO', 'TRANSFERENCIA', 'CAJA_CHICA', 'OTRO')
      THEN upper(COALESCE(NULLIF(btrim(e.tipo_egreso), ''), 'OTRO'))
    ELSE 'OTRO'
  END,
  concepto = COALESCE(NULLIF(btrim(COALESCE(e.concepto, '')), ''), NULLIF(btrim(COALESCE(e.nombre, '')), '')),
  descripcion = NULLIF(btrim(COALESCE(e.descripcion, '')), ''),
  metodo_pago = COALESCE(NULLIF(upper(btrim(COALESCE(e.metodo_pago, ''))), ''), 'TRANSFERENCIA'),
  referencia = NULLIF(upper(btrim(COALESCE(e.referencia, ''))), ''),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(e.estado), ''), 'REGISTRADO')) IN ('REGISTRADO', 'APLICADO', 'ANULADO')
      THEN upper(COALESCE(NULLIF(btrim(e.estado), ''), 'REGISTRADO'))
    WHEN upper(COALESCE(NULLIF(btrim(e.estado), ''), 'REGISTRADO')) IN ('ACTIVO', 'PAGADO') THEN 'APLICADO'
    WHEN upper(COALESCE(NULLIF(btrim(e.estado), ''), 'REGISTRADO')) IN ('INACTIVO', 'CANCELADO') THEN 'ANULADO'
    ELSE 'REGISTRADO'
  END,
  fecha_aplicacion = CASE
    WHEN upper(COALESCE(NULLIF(btrim(e.estado), ''), 'REGISTRADO')) IN ('APLICADO', 'PAGADO', 'ACTIVO') THEN COALESCE(e.fecha_aplicacion, now())
    ELSE e.fecha_aplicacion
  END,
  idempotency_key = COALESCE(NULLIF(lower(btrim(COALESCE(e.idempotency_key, ''))), ''),
    CASE WHEN e.event_id IS NOT NULL THEN format('egreso.event:%s', e.event_id::text) ELSE NULL END),
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(e.estado), ''), 'REGISTRADO')) IN ('ANULADO', 'INACTIVO', 'CANCELADO') THEN false
    ELSE COALESCE(e.activo, true)
  END,
  metadata = COALESCE(e.metadata, '{}'::jsonb)
WHERE e.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_egresos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.cuenta_por_pagar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_pagar_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  NEW.fecha := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha::text, '')), current_date);
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
    format('EGRESO-%s', to_char(COALESCE(NEW.fecha, current_date), 'YYYYMMDD'))
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
$$;

DROP TRIGGER IF EXISTS trg_normalize_egresos_row ON public.egresos;
CREATE TRIGGER trg_normalize_egresos_row
BEFORE INSERT OR UPDATE ON public.egresos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_egresos_row();

-- ----------------------------------------------------------------------------
-- cobranzas
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cobranzas
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_por_cobrar_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_programada date,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS fecha_cobro date,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_cobrado numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prioridad text DEFAULT 'MEDIA',
  ADD COLUMN IF NOT EXISTS canal text,
  ADD COLUMN IF NOT EXISTS responsable_id uuid,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS proxima_gestion_at timestamptz,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.cobranzas
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN cliente_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cliente_id::text, '')),
  ALTER COLUMN cuenta_por_cobrar_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cuenta_por_cobrar_id::text, '')),
  ALTER COLUMN responsable_id TYPE uuid USING app.to_uuid_or_null(COALESCE(responsable_id::text, '')),
  ALTER COLUMN fecha_programada TYPE date USING app.to_date_or_null(COALESCE(fecha_programada::text, '')),
  ALTER COLUMN fecha_vencimiento TYPE date USING app.to_date_or_null(COALESCE(fecha_vencimiento::text, '')),
  ALTER COLUMN fecha_cobro TYPE date USING app.to_date_or_null(COALESCE(fecha_cobro::text, '')),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN monto_cobrado TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_cobrado::text),
  ALTER COLUMN saldo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo::text),
  ALTER COLUMN prioridad TYPE text USING NULLIF(upper(btrim(COALESCE(prioridad, ''))), ''),
  ALTER COLUMN canal TYPE text USING NULLIF(upper(btrim(COALESCE(canal, ''))), ''),
  ALTER COLUMN referencia TYPE text USING NULLIF(upper(btrim(COALESCE(referencia, ''))), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN proxima_gestion_at TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(proxima_gestion_at::text, '')),
  ALTER COLUMN monto SET DEFAULT 0,
  ALTER COLUMN monto_cobrado SET DEFAULT 0,
  ALTER COLUMN saldo SET DEFAULT 0,
  ALTER COLUMN prioridad SET DEFAULT 'MEDIA',
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.cobranzas c
SET
  fecha_programada = COALESCE(c.fecha_programada, c.created_at::date, current_date),
  fecha_vencimiento = COALESCE(c.fecha_vencimiento, COALESCE(c.fecha_programada, current_date) + 30),
  monto = GREATEST(COALESCE(c.monto, 0), 0),
  monto_cobrado = GREATEST(COALESCE(c.monto_cobrado, 0), 0),
  saldo = GREATEST(COALESCE(c.monto, 0) - COALESCE(c.monto_cobrado, 0), 0),
  prioridad = CASE
    WHEN upper(COALESCE(NULLIF(btrim(c.prioridad), ''), 'MEDIA')) IN ('ALTA', 'MEDIA', 'BAJA')
      THEN upper(COALESCE(NULLIF(btrim(c.prioridad), ''), 'MEDIA'))
    ELSE 'MEDIA'
  END,
  canal = COALESCE(NULLIF(upper(btrim(COALESCE(c.canal, ''))), ''), 'SISTEMA'),
  referencia = NULLIF(upper(btrim(COALESCE(c.referencia, ''))), ''),
  observaciones = NULLIF(btrim(COALESCE(c.observaciones, '')), ''),
  estado = CASE
    WHEN GREATEST(COALESCE(c.monto_cobrado, 0), 0) >= GREATEST(COALESCE(c.monto, 0), 0)
      AND GREATEST(COALESCE(c.monto, 0), 0) > 0 THEN 'COBRADA'
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'PENDIENTE')) IN ('COBRADA', 'PENDIENTE', 'EN_GESTION', 'VENCIDA', 'ANULADA')
      THEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'PENDIENTE'))
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'PENDIENTE')) IN ('ACTIVO', 'REGISTRADO') THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'PENDIENTE')) IN ('GESTION', 'EN_PROCESO') THEN 'EN_GESTION'
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'PENDIENTE')) IN ('INACTIVO', 'CANCELADO') THEN 'ANULADA'
    ELSE 'PENDIENTE'
  END,
  fecha_cobro = CASE
    WHEN GREATEST(COALESCE(c.monto_cobrado, 0), 0) >= GREATEST(COALESCE(c.monto, 0), 0)
      AND GREATEST(COALESCE(c.monto, 0), 0) > 0 THEN COALESCE(c.fecha_cobro, current_date)
    ELSE c.fecha_cobro
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'PENDIENTE')) IN ('ANULADA', 'INACTIVO', 'CANCELADO') THEN false
    ELSE COALESCE(c.activo, true)
  END,
  metadata = COALESCE(c.metadata, '{}'::jsonb)
WHERE c.id IS NOT NULL;

UPDATE public.cobranzas c
SET estado = 'VENCIDA'
WHERE c.estado IN ('PENDIENTE', 'EN_GESTION')
  AND c.fecha_vencimiento IS NOT NULL
  AND c.fecha_vencimiento < current_date
  AND GREATEST(COALESCE(c.monto_cobrado, 0), 0) < GREATEST(COALESCE(c.monto, 0), 0);

CREATE OR REPLACE FUNCTION app.normalize_cobranzas_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.cuenta_por_cobrar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_cobrar_id::text, ''));
  NEW.responsable_id := app.to_uuid_or_null(COALESCE(NEW.responsable_id::text, ''));

  NEW.fecha_programada := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_programada::text, '')), current_date);
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
    NEW.fecha_cobro := COALESCE(NEW.fecha_cobro, current_date);
    NEW.saldo := 0;
  ELSIF v_estado IN ('PENDIENTE', 'EN_GESTION')
    AND NEW.fecha_vencimiento IS NOT NULL
    AND NEW.fecha_vencimiento < current_date THEN
    v_estado := 'VENCIDA';
  END IF;

  NEW.estado := v_estado;
  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADA');
  IF NEW.estado = 'ANULADA' THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('COBRANZA %s', to_char(COALESCE(NEW.fecha_programada, current_date), 'YYYY-MM-DD'))
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
$$;

DROP TRIGGER IF EXISTS trg_normalize_cobranzas_row ON public.cobranzas;
CREATE TRIGGER trg_normalize_cobranzas_row
BEFORE INSERT OR UPDATE ON public.cobranzas
FOR EACH ROW
EXECUTE FUNCTION app.normalize_cobranzas_row();

-- ----------------------------------------------------------------------------
-- gestiones_cobranza
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.gestiones_cobranza
  ADD COLUMN IF NOT EXISTS cobranza_id uuid,
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_por_cobrar_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_gestion timestamptz,
  ADD COLUMN IF NOT EXISTS tipo_gestion text DEFAULT 'LLAMADA',
  ADD COLUMN IF NOT EXISTS resultado text DEFAULT 'SIN_RESPUESTA',
  ADD COLUMN IF NOT EXISTS compromiso_pago date,
  ADD COLUMN IF NOT EXISTS monto_compromiso numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proxima_gestion_at timestamptz,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.gestiones_cobranza
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN cobranza_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cobranza_id::text, '')),
  ALTER COLUMN cliente_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cliente_id::text, '')),
  ALTER COLUMN cuenta_por_cobrar_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cuenta_por_cobrar_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN fecha_gestion TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_gestion::text, '')),
  ALTER COLUMN tipo_gestion TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_gestion, ''))), ''),
  ALTER COLUMN resultado TYPE text USING NULLIF(upper(btrim(COALESCE(resultado, ''))), ''),
  ALTER COLUMN compromiso_pago TYPE date USING app.to_date_or_null(COALESCE(compromiso_pago::text, '')),
  ALTER COLUMN monto_compromiso TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_compromiso::text),
  ALTER COLUMN proxima_gestion_at TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(proxima_gestion_at::text, '')),
  ALTER COLUMN notas TYPE text USING NULLIF(btrim(COALESCE(notas, '')), ''),
  ALTER COLUMN tipo_gestion SET DEFAULT 'LLAMADA',
  ALTER COLUMN resultado SET DEFAULT 'SIN_RESPUESTA',
  ALTER COLUMN monto_compromiso SET DEFAULT 0,
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.gestiones_cobranza gc
SET
  fecha_gestion = COALESCE(gc.fecha_gestion, gc.created_at, now()),
  tipo_gestion = CASE
    WHEN upper(COALESCE(NULLIF(btrim(gc.tipo_gestion), ''), 'LLAMADA')) IN ('LLAMADA', 'EMAIL', 'WHATSAPP', 'VISITA', 'SMS', 'NOTIFICACION', 'OTRO')
      THEN upper(COALESCE(NULLIF(btrim(gc.tipo_gestion), ''), 'LLAMADA'))
    ELSE 'LLAMADA'
  END,
  resultado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(gc.resultado), ''), 'SIN_RESPUESTA')) IN ('SIN_RESPUESTA', 'PROMESA_PAGO', 'PAGO_PARCIAL', 'PAGO_TOTAL', 'RECHAZADO', 'REPROGRAMADO', 'OTRO')
      THEN upper(COALESCE(NULLIF(btrim(gc.resultado), ''), 'SIN_RESPUESTA'))
    ELSE 'SIN_RESPUESTA'
  END,
  compromiso_pago = app.to_date_or_null(COALESCE(gc.compromiso_pago::text, '')),
  monto_compromiso = GREATEST(COALESCE(gc.monto_compromiso, 0), 0),
  proxima_gestion_at = app.to_timestamptz_or_null(COALESCE(gc.proxima_gestion_at::text, '')),
  notas = NULLIF(btrim(COALESCE(gc.notas, '')), ''),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(gc.estado), ''), 'REGISTRADA')) IN ('REGISTRADA', 'ANULADA')
      THEN upper(COALESCE(NULLIF(btrim(gc.estado), ''), 'REGISTRADA'))
    WHEN upper(COALESCE(NULLIF(btrim(gc.estado), ''), 'REGISTRADA')) IN ('ACTIVO') THEN 'REGISTRADA'
    WHEN upper(COALESCE(NULLIF(btrim(gc.estado), ''), 'REGISTRADA')) IN ('INACTIVO', 'CANCELADO') THEN 'ANULADA'
    ELSE 'REGISTRADA'
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(gc.estado), ''), 'REGISTRADA')) IN ('ANULADA', 'INACTIVO', 'CANCELADO') THEN false
    ELSE COALESCE(gc.activo, true)
  END,
  metadata = COALESCE(gc.metadata, '{}'::jsonb)
WHERE gc.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_gestiones_cobranza_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cobranza_id := app.to_uuid_or_null(COALESCE(NEW.cobranza_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.cuenta_por_cobrar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_cobrar_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  NEW.fecha_gestion := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_gestion::text, '')), now());
  NEW.tipo_gestion := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_gestion, '')), ''), 'LLAMADA'));
  IF NEW.tipo_gestion NOT IN ('LLAMADA', 'EMAIL', 'WHATSAPP', 'VISITA', 'SMS', 'NOTIFICACION', 'OTRO') THEN
    NEW.tipo_gestion := 'OTRO';
  END IF;

  NEW.resultado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.resultado, '')), ''), 'SIN_RESPUESTA'));
  IF NEW.resultado NOT IN ('SIN_RESPUESTA', 'PROMESA_PAGO', 'PAGO_PARCIAL', 'PAGO_TOTAL', 'RECHAZADO', 'REPROGRAMADO', 'OTRO') THEN
    NEW.resultado := 'SIN_RESPUESTA';
  END IF;

  NEW.compromiso_pago := app.to_date_or_null(COALESCE(NEW.compromiso_pago::text, ''));
  NEW.monto_compromiso := GREATEST(COALESCE(NEW.monto_compromiso, 0), 0);
  NEW.proxima_gestion_at := app.to_timestamptz_or_null(COALESCE(NEW.proxima_gestion_at::text, ''));
  NEW.notas := NULLIF(btrim(COALESCE(NEW.notas, '')), '');

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'REGISTRADA'));
  IF v_estado IN ('ACTIVO') THEN
    v_estado := 'REGISTRADA';
  ELSIF v_estado IN ('INACTIVO', 'CANCELADO') THEN
    v_estado := 'ANULADA';
  END IF;
  IF v_estado NOT IN ('REGISTRADA', 'ANULADA') THEN
    v_estado := 'REGISTRADA';
  END IF;
  NEW.estado := v_estado;

  NEW.activo := COALESCE(NEW.activo, NEW.estado <> 'ANULADA');
  IF NEW.estado = 'ANULADA' THEN
    NEW.activo := false;
  END IF;

  NEW.nombre := COALESCE(
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    format('GESTION %s', to_char(COALESCE(NEW.fecha_gestion, now()), 'YYYY-MM-DD HH24:MI'))
  );
  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    format('GES-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8)))
  );

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_gestiones_cobranza_row ON public.gestiones_cobranza;
CREATE TRIGGER trg_normalize_gestiones_cobranza_row
BEFORE INSERT OR UPDATE ON public.gestiones_cobranza
FOR EACH ROW
EXECUTE FUNCTION app.normalize_gestiones_cobranza_row();

-- ----------------------------------------------------------------------------
-- pagos_facturas
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pagos_facturas
  ADD COLUMN IF NOT EXISTS cuenta_por_pagar_id uuid,
  ADD COLUMN IF NOT EXISTS proveedor_id uuid,
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS numero_operacion text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS aplicado_en timestamptz,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.pagos_facturas
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN cuenta_por_pagar_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cuenta_por_pagar_id::text, '')),
  ALTER COLUMN proveedor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(proveedor_id::text, '')),
  ALTER COLUMN documento_id TYPE uuid USING app.to_uuid_or_null(COALESCE(documento_id::text, '')),
  ALTER COLUMN cuenta_bancaria_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cuenta_bancaria_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN event_id TYPE uuid USING app.to_uuid_or_null(COALESCE(event_id::text, '')),
  ALTER COLUMN fecha_pago TYPE date USING app.to_date_or_null(COALESCE(fecha_pago::text, '')),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN metodo_pago TYPE text USING NULLIF(upper(btrim(COALESCE(metodo_pago, ''))), ''),
  ALTER COLUMN referencia TYPE text USING NULLIF(upper(btrim(COALESCE(referencia, ''))), ''),
  ALTER COLUMN numero_operacion TYPE text USING NULLIF(upper(btrim(COALESCE(numero_operacion, ''))), ''),
  ALTER COLUMN notas TYPE text USING NULLIF(btrim(COALESCE(notas, '')), ''),
  ALTER COLUMN idempotency_key TYPE text USING NULLIF(lower(btrim(COALESCE(idempotency_key, ''))), ''),
  ALTER COLUMN aplicado_en TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(aplicado_en::text, '')),
  ALTER COLUMN monto SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.pagos_facturas pf
SET
  fecha_pago = COALESCE(pf.fecha_pago, pf.created_at::date, current_date),
  monto = GREATEST(COALESCE(pf.monto, 0), 0),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(pf.moneda, ''))), ''), 'PEN'),
  metodo_pago = COALESCE(NULLIF(upper(btrim(COALESCE(pf.metodo_pago, ''))), ''), 'TRANSFERENCIA'),
  referencia = NULLIF(upper(btrim(COALESCE(pf.referencia, ''))), ''),
  numero_operacion = NULLIF(upper(btrim(COALESCE(pf.numero_operacion, ''))), ''),
  notas = NULLIF(btrim(COALESCE(pf.notas, '')), ''),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(pf.estado), ''), 'APLICADO')) IN ('PENDIENTE', 'APLICADO', 'ANULADO')
      THEN upper(COALESCE(NULLIF(btrim(pf.estado), ''), 'APLICADO'))
    WHEN upper(COALESCE(NULLIF(btrim(pf.estado), ''), 'APLICADO')) IN ('ACTIVO', 'PAGADO') THEN 'APLICADO'
    WHEN upper(COALESCE(NULLIF(btrim(pf.estado), ''), 'APLICADO')) IN ('INACTIVO', 'CANCELADO') THEN 'ANULADO'
    ELSE 'APLICADO'
  END,
  aplicado_en = CASE
    WHEN upper(COALESCE(NULLIF(btrim(pf.estado), ''), 'APLICADO')) IN ('APLICADO', 'PAGADO', 'ACTIVO') THEN COALESCE(pf.aplicado_en, now())
    ELSE pf.aplicado_en
  END,
  idempotency_key = COALESCE(
    NULLIF(lower(btrim(COALESCE(pf.idempotency_key, ''))), ''),
    CASE
      WHEN pf.event_id IS NOT NULL THEN format('pf.event:%s', pf.event_id::text)
      ELSE NULL
    END
  ),
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(pf.estado), ''), 'APLICADO')) IN ('ANULADO', 'INACTIVO', 'CANCELADO') THEN false
    ELSE COALESCE(pf.activo, true)
  END,
  metadata = COALESCE(pf.metadata, '{}'::jsonb)
WHERE pf.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_pagos_facturas_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
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

  NEW.fecha_pago := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_pago::text, '')), current_date);
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
    format('PAGO FACTURA %s', to_char(COALESCE(NEW.fecha_pago, current_date), 'YYYY-MM-DD'))
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
$$;

DROP TRIGGER IF EXISTS trg_normalize_pagos_facturas_row ON public.pagos_facturas;
CREATE TRIGGER trg_normalize_pagos_facturas_row
BEFORE INSERT OR UPDATE ON public.pagos_facturas
FOR EACH ROW
EXECUTE FUNCTION app.normalize_pagos_facturas_row();

-- ----------------------------------------------------------------------------
-- Backfill defensivo de timestamps/estado.
-- ----------------------------------------------------------------------------
UPDATE public.gastos
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.egresos
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.cobranzas
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.gestiones_cobranza
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.pagos_facturas
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Indices runtime.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gastos_tenant_fecha_categoria_runtime
ON public.gastos (tenant_id, fecha DESC, categoria);

CREATE INDEX IF NOT EXISTS idx_gastos_tenant_estado_fecha_runtime
ON public.gastos (tenant_id, estado, fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gastos_tenant_centro_costo_fecha_runtime
ON public.gastos (tenant_id, centro_costo_id, fecha DESC)
WHERE centro_costo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gastos_tenant_proveedor_fecha_runtime
ON public.gastos (tenant_id, proveedor_id, fecha DESC)
WHERE proveedor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_egresos_tenant_fecha_tipo_runtime
ON public.egresos (tenant_id, fecha DESC, tipo_egreso, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_egresos_tenant_estado_fecha_runtime
ON public.egresos (tenant_id, estado, fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_egresos_tenant_cxp_fecha_runtime
ON public.egresos (tenant_id, cuenta_por_pagar_id, fecha DESC)
WHERE cuenta_por_pagar_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_egresos_tenant_event_id
ON public.egresos (tenant_id, event_id)
WHERE tenant_id IS NOT NULL
  AND event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cobranzas_tenant_estado_vencimiento_runtime
ON public.cobranzas (tenant_id, estado, fecha_vencimiento, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cobranzas_tenant_cliente_estado_runtime
ON public.cobranzas (tenant_id, cliente_id, estado, fecha_programada DESC)
WHERE cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cobranzas_tenant_responsable_estado_runtime
ON public.cobranzas (tenant_id, responsable_id, estado, fecha_programada DESC)
WHERE responsable_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gestiones_cobranza_tenant_cobranza_fecha_runtime
ON public.gestiones_cobranza (tenant_id, cobranza_id, fecha_gestion DESC)
WHERE cobranza_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gestiones_cobranza_tenant_cliente_fecha_runtime
ON public.gestiones_cobranza (tenant_id, cliente_id, fecha_gestion DESC)
WHERE cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gestiones_cobranza_tenant_usuario_fecha_runtime
ON public.gestiones_cobranza (tenant_id, usuario_id, fecha_gestion DESC)
WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_facturas_tenant_fecha_metodo_runtime
ON public.pagos_facturas (tenant_id, fecha_pago DESC, metodo_pago, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pagos_facturas_tenant_cxp_fecha_runtime
ON public.pagos_facturas (tenant_id, cuenta_por_pagar_id, fecha_pago DESC)
WHERE cuenta_por_pagar_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_facturas_tenant_proveedor_fecha_runtime
ON public.pagos_facturas (tenant_id, proveedor_id, fecha_pago DESC)
WHERE proveedor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_facturas_tenant_event_id
ON public.pagos_facturas (tenant_id, event_id)
WHERE tenant_id IS NOT NULL
  AND event_id IS NOT NULL;

SELECT app.apply_tenant_policy('public', 'gastos');
SELECT app.apply_tenant_policy('public', 'egresos');
SELECT app.apply_tenant_policy('public', 'cobranzas');
SELECT app.apply_tenant_policy('public', 'gestiones_cobranza');
SELECT app.apply_tenant_policy('public', 'pagos_facturas');

CREATE OR REPLACE VIEW public.v_costos_fijos_mensuales AS
SELECT
  tenant_id,
  date_trunc('month', created_at) AS periodo,
  SUM(COALESCE(monto, app.to_numeric_or_zero(metadata->>'total'), 0)) AS total_mes
FROM public.gastos
GROUP BY tenant_id, date_trunc('month', created_at);

CREATE OR REPLACE VIEW public.v_gastos_resumen AS
SELECT
  tenant_id,
  estado,
  COUNT(*) AS total_registros,
  SUM(COALESCE(monto, app.to_numeric_or_zero(metadata->>'total'), 0)) AS total_gastos
FROM public.gastos
GROUP BY tenant_id, estado;

COMMIT;
