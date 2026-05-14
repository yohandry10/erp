-- ============================================================================
-- 179__contabilidad_activos_consignacion_runtime_alignment.sql
-- Alineacion runtime para contabilidad de activos/consignacion.
-- Tablas: activos_fijos, depreciaciones, registro_consignaciones,
-- movimientos_consignacion, inventarios_permanentes, asignacion_costos,
-- calendario_empresa, saldos_iniciales_cuentas.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.normalize_periodo_yyyy_mm(
  p_input text,
  p_fallback_date date DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := NULLIF(regexp_replace(COALESCE(p_input, ''), '\s+', '', 'g'), '');
  IF v IS NOT NULL THEN
    IF v ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
      RETURN v;
    END IF;
    IF v ~ '^[0-9]{6}$' THEN
      RETURN substr(v, 1, 4) || '-' || substr(v, 5, 2);
    END IF;
  END IF;
  IF p_fallback_date IS NOT NULL THEN
    RETURN to_char(p_fallback_date, 'YYYY-MM');
  END IF;
  RETURN NULL;
END;
$$;

-- activos_fijos
ALTER TABLE IF EXISTS public.activos_fijos
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS centro_costo_id uuid,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

DROP POLICY IF EXISTS tenant_isolation ON public.activos_fijos;
DROP POLICY IF EXISTS tenant_isolation ON public.depreciaciones;
DROP POLICY IF EXISTS tenant_isolation ON public.registro_consignaciones;
DROP POLICY IF EXISTS tenant_isolation ON public.movimientos_consignacion;
DROP POLICY IF EXISTS tenant_isolation ON public.inventarios_permanentes;
DROP POLICY IF EXISTS tenant_isolation ON public.asignacion_costos;
DROP POLICY IF EXISTS tenant_isolation ON public.calendario_empresa;
DROP POLICY IF EXISTS tenant_isolation ON public.saldos_iniciales_cuentas;

ALTER TABLE IF EXISTS public.activos_fijos
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN centro_costo_id TYPE uuid USING app.to_uuid_or_null(COALESCE(centro_costo_id::text, '')),
  ALTER COLUMN fecha_adquisicion TYPE date USING app.to_date_or_null(COALESCE(fecha_adquisicion::text, '')),
  ALTER COLUMN valor_adquisicion TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(valor_adquisicion::text, '0')), 0),
  ALTER COLUMN depreciacion_acumulada TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(depreciacion_acumulada::text, '0')), 0),
  ALTER COLUMN vida_util TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(vida_util::text, '0')), 0),
  ALTER COLUMN codigo TYPE text USING NULLIF(upper(btrim(COALESCE(codigo, ''))), ''),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN activo SET DEFAULT true;

UPDATE public.activos_fijos a
SET
  nombre = COALESCE(NULLIF(btrim(COALESCE(a.nombre, '')), ''), 'Activo Fijo'),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(a.codigo, ''))), ''), format('AF-%s', upper(left(replace(a.id::text, '-', ''), 8)))),
  descripcion = COALESCE(NULLIF(btrim(COALESCE(a.descripcion, '')), ''), COALESCE(NULLIF(btrim(COALESCE(a.nombre, '')), ''), 'Activo Fijo')),
  fecha_adquisicion = COALESCE(a.fecha_adquisicion, a.created_at::date, current_date),
  valor_adquisicion = GREATEST(COALESCE(a.valor_adquisicion, 0), 0),
  depreciacion_acumulada = LEAST(GREATEST(COALESCE(a.depreciacion_acumulada, 0), 0), GREATEST(COALESCE(a.valor_adquisicion, 0), 0)),
  vida_util = GREATEST(COALESCE(a.vida_util, 0), 0),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(a.moneda, ''))), ''), 'PEN'),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'BAJA', 'VENDIDO', 'DEPRECIADO') THEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'ACTIVO'))
    WHEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'ACTIVO')) = 'RETIRADO' THEN 'BAJA'
    ELSE 'ACTIVO'
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'ACTIVO')) IN ('INACTIVO', 'BAJA', 'VENDIDO') THEN false
    ELSE COALESCE(a.activo, true)
  END,
  metadata = COALESCE(a.metadata, '{}'::jsonb),
  updated_at = now()
WHERE a.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_activos_fijos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.centro_costo_id := app.to_uuid_or_null(COALESCE(NEW.centro_costo_id::text, ''));
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'Activo Fijo');
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), format('AF-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.fecha_adquisicion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_adquisicion::text, '')), NEW.created_at::date, current_date);
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
$$;

DROP TRIGGER IF EXISTS trg_normalize_activos_fijos_row ON public.activos_fijos;
CREATE TRIGGER trg_normalize_activos_fijos_row
BEFORE INSERT OR UPDATE ON public.activos_fijos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_activos_fijos_row();

-- depreciaciones
ALTER TABLE IF EXISTS public.depreciaciones
  ADD COLUMN IF NOT EXISTS fecha_depreciacion date,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.depreciaciones
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN activo_id TYPE uuid USING app.to_uuid_or_null(COALESCE(activo_id::text, '')),
  ALTER COLUMN centro_costo_id TYPE uuid USING app.to_uuid_or_null(COALESCE(centro_costo_id::text, '')),
  ALTER COLUMN evento_id TYPE uuid USING app.to_uuid_or_null(COALESCE(evento_id::text, '')),
  ALTER COLUMN fecha_depreciacion TYPE date USING app.to_date_or_null(COALESCE(fecha_depreciacion::text, '')),
  ALTER COLUMN periodo TYPE text USING app.normalize_periodo_yyyy_mm(COALESCE(periodo::text, ''), COALESCE(app.to_date_or_null(COALESCE(fecha_depreciacion::text, '')), created_at::date)),
  ALTER COLUMN monto_depreciacion TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(monto_depreciacion::text, '0')), 0),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN procesado_outbox SET DEFAULT false,
  ALTER COLUMN activo SET DEFAULT true;

UPDATE public.depreciaciones d
SET
  fecha_depreciacion = COALESCE(d.fecha_depreciacion, d.created_at::date, current_date),
  periodo = app.normalize_periodo_yyyy_mm(d.periodo, COALESCE(d.fecha_depreciacion, d.created_at::date, current_date)),
  monto_depreciacion = GREATEST(COALESCE(d.monto_depreciacion, 0), 0),
  procesado_outbox = COALESCE(d.procesado_outbox, false),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE')) IN ('PENDIENTE', 'PROCESADA', 'ANULADA', 'ERROR') THEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE'))
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE')) = 'ACTIVO' THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE')) = 'INACTIVO' THEN 'ANULADA'
    ELSE 'PENDIENTE'
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(d.estado), ''), 'PENDIENTE')) IN ('ANULADA', 'INACTIVO') THEN false
    ELSE COALESCE(d.activo, true)
  END,
  metadata = COALESCE(d.metadata, '{}'::jsonb),
  updated_at = now()
WHERE d.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_depreciaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.activo_id := app.to_uuid_or_null(COALESCE(NEW.activo_id::text, ''));
  NEW.centro_costo_id := app.to_uuid_or_null(COALESCE(NEW.centro_costo_id::text, ''));
  NEW.evento_id := app.to_uuid_or_null(COALESCE(NEW.evento_id::text, ''));
  NEW.fecha_depreciacion := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_depreciacion::text, '')), NEW.created_at::date, current_date);
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
$$;

DROP TRIGGER IF EXISTS trg_normalize_depreciaciones_row ON public.depreciaciones;
CREATE TRIGGER trg_normalize_depreciaciones_row
BEFORE INSERT OR UPDATE ON public.depreciaciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_depreciaciones_row();

-- registro_consignaciones
ALTER TABLE IF EXISTS public.registro_consignaciones
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS fecha_entrega date,
  ADD COLUMN IF NOT EXISTS consignatario_nombre text,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.registro_consignaciones
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN fecha_registro TYPE date USING app.to_date_or_null(COALESCE(fecha_registro::text, '')),
  ALTER COLUMN fecha_entrega TYPE date USING app.to_date_or_null(COALESCE(fecha_entrega::text, '')),
  ALTER COLUMN numero TYPE text USING NULLIF(upper(btrim(COALESCE(numero, ''))), ''),
  ALTER COLUMN cantidad TYPE numeric(14,3) USING GREATEST(app.to_numeric_or_zero(COALESCE(cantidad::text, '0')), 0),
  ALTER COLUMN valor_unitario TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(valor_unitario::text, '0')), 0),
  ALTER COLUMN valor_total TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(valor_total::text, '0')), 0),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'PENDIENTE')),
  ALTER COLUMN moneda TYPE text USING COALESCE(NULLIF(upper(btrim(COALESCE(moneda, ''))), ''), 'PEN'),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN activo SET DEFAULT true;

UPDATE public.registro_consignaciones r
SET
  numero = COALESCE(NULLIF(upper(btrim(COALESCE(r.numero, ''))), ''), format('RC-%s', upper(left(replace(r.id::text, '-', ''), 8)))),
  fecha_registro = COALESCE(r.fecha_registro, r.fecha_entrega, r.created_at::date, current_date),
  fecha_entrega = COALESCE(r.fecha_entrega, r.fecha_registro, r.created_at::date, current_date),
  consignatario_nombre = COALESCE(NULLIF(btrim(COALESCE(r.consignatario_nombre, '')), ''), 'CONSIGNATARIO'),
  cantidad = GREATEST(COALESCE(r.cantidad, 0), 0),
  valor_unitario = GREATEST(COALESCE(r.valor_unitario, 0), 0),
  valor_total = GREATEST(COALESCE(NULLIF(r.valor_total, 0), COALESCE(r.cantidad, 0) * COALESCE(r.valor_unitario, 0)), 0),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(r.estado), ''), 'PENDIENTE')) IN ('PENDIENTE', 'VENDIDA', 'DEVUELTA', 'ANULADA', 'CERRADA') THEN upper(COALESCE(NULLIF(btrim(r.estado), ''), 'PENDIENTE'))
    WHEN upper(COALESCE(NULLIF(btrim(r.estado), ''), 'PENDIENTE')) = 'ACTIVO' THEN 'PENDIENTE'
    WHEN upper(COALESCE(NULLIF(btrim(r.estado), ''), 'PENDIENTE')) IN ('INACTIVO', 'CANCELADA') THEN 'ANULADA'
    ELSE 'PENDIENTE'
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(r.estado), ''), 'PENDIENTE')) IN ('ANULADA', 'INACTIVO', 'CANCELADA') THEN false
    ELSE COALESCE(r.activo, true)
  END,
  metadata = COALESCE(r.metadata, '{}'::jsonb),
  updated_at = now()
WHERE r.id IS NOT NULL;
CREATE OR REPLACE FUNCTION app.normalize_registro_consignaciones_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.numero := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.numero, ''))), ''), format('RC-%s', upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 8))));
  NEW.fecha_registro := COALESCE(app.to_date_or_null(COALESCE(NEW.fecha_registro::text, '')), app.to_date_or_null(COALESCE(NEW.fecha_entrega::text, '')), NEW.created_at::date, current_date);
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
$$;

DROP TRIGGER IF EXISTS trg_normalize_registro_consignaciones_row ON public.registro_consignaciones;
CREATE TRIGGER trg_normalize_registro_consignaciones_row
BEFORE INSERT OR UPDATE ON public.registro_consignaciones
FOR EACH ROW
EXECUTE FUNCTION app.normalize_registro_consignaciones_row();

-- movimientos_consignacion
ALTER TABLE IF EXISTS public.movimientos_consignacion
  ADD COLUMN IF NOT EXISTS registro_id uuid,
  ADD COLUMN IF NOT EXISTS consignacion_id uuid,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_movimiento timestamptz,
  ADD COLUMN IF NOT EXISTS tipo_movimiento text DEFAULT 'ENTREGA',
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_unitario numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.movimientos_consignacion
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN registro_id TYPE uuid USING app.to_uuid_or_null(COALESCE(registro_id::text, '')),
  ALTER COLUMN consignacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(consignacion_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN fecha_movimiento TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_movimiento::text, '')),
  ALTER COLUMN tipo_movimiento TYPE text USING upper(COALESCE(NULLIF(btrim(tipo_movimiento), ''), 'ENTREGA')),
  ALTER COLUMN cantidad TYPE numeric(14,3) USING GREATEST(app.to_numeric_or_zero(COALESCE(cantidad::text, '0')), 0),
  ALTER COLUMN valor_unitario TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(valor_unitario::text, '0')), 0),
  ALTER COLUMN valor_total TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(valor_total::text, '0')), 0),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN activo SET DEFAULT true;

UPDATE public.movimientos_consignacion m
SET
  registro_id = COALESCE(m.registro_id, m.consignacion_id),
  consignacion_id = COALESCE(m.consignacion_id, m.registro_id),
  fecha_movimiento = COALESCE(m.fecha_movimiento, m.created_at, now()),
  tipo_movimiento = CASE
    WHEN upper(COALESCE(NULLIF(btrim(m.tipo_movimiento), ''), 'ENTREGA')) IN ('ENTREGA', 'VENTA', 'DEVOLUCION', 'AJUSTE', 'ANULACION') THEN upper(COALESCE(NULLIF(btrim(m.tipo_movimiento), ''), 'ENTREGA'))
    ELSE 'ENTREGA'
  END,
  cantidad = GREATEST(COALESCE(m.cantidad, 0), 0),
  valor_unitario = GREATEST(COALESCE(m.valor_unitario, 0), 0),
  valor_total = GREATEST(COALESCE(NULLIF(m.valor_total, 0), COALESCE(m.cantidad, 0) * COALESCE(m.valor_unitario, 0)), 0),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(m.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'ANULADO') THEN upper(COALESCE(NULLIF(btrim(m.estado), ''), 'ACTIVO'))
    WHEN upper(COALESCE(NULLIF(btrim(m.estado), ''), 'ACTIVO')) = 'INACTIVO' THEN 'ANULADO'
    ELSE 'ACTIVO'
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(m.estado), ''), 'ACTIVO')) IN ('ANULADO', 'INACTIVO') THEN false
    ELSE COALESCE(m.activo, true)
  END,
  metadata = COALESCE(m.metadata, '{}'::jsonb),
  updated_at = now()
WHERE m.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_movimientos_consignacion_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.registro_id := COALESCE(app.to_uuid_or_null(COALESCE(NEW.registro_id::text, '')), app.to_uuid_or_null(COALESCE(NEW.consignacion_id::text, '')));
  NEW.consignacion_id := COALESCE(app.to_uuid_or_null(COALESCE(NEW.consignacion_id::text, '')), NEW.registro_id);
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.fecha_movimiento := COALESCE(app.to_timestamptz_or_null(COALESCE(NEW.fecha_movimiento::text, '')), NEW.created_at, now());
  NEW.tipo_movimiento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_movimiento, '')), ''), 'ENTREGA'));
  IF NEW.tipo_movimiento NOT IN ('ENTREGA', 'VENTA', 'DEVOLUCION', 'AJUSTE', 'ANULACION') THEN NEW.tipo_movimiento := 'ENTREGA'; END IF;
  NEW.cantidad := GREATEST(COALESCE(NEW.cantidad, 0), 0);
  NEW.valor_unitario := GREATEST(COALESCE(NEW.valor_unitario, 0), 0);
  NEW.valor_total := GREATEST(COALESCE(NULLIF(NEW.valor_total, 0), NEW.cantidad * NEW.valor_unitario), 0);
  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado = 'INACTIVO' THEN NEW.estado := 'ANULADO'; END IF;
  IF NEW.estado NOT IN ('ACTIVO', 'ANULADO') THEN NEW.estado := 'ACTIVO'; END IF;
  NEW.activo := COALESCE(NEW.activo, NEW.estado = 'ACTIVO');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_movimientos_consignacion_row ON public.movimientos_consignacion;
CREATE TRIGGER trg_normalize_movimientos_consignacion_row
BEFORE INSERT OR UPDATE ON public.movimientos_consignacion
FOR EACH ROW
EXECUTE FUNCTION app.normalize_movimientos_consignacion_row();

-- inventarios_permanentes
ALTER TABLE IF EXISTS public.inventarios_permanentes
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS almacen_id uuid,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS fecha_corte date,
  ADD COLUMN IF NOT EXISTS saldo numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_inicial numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entradas numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salidas numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_final numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_unitario numeric(14,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.inventarios_permanentes
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN almacen_id TYPE uuid USING app.to_uuid_or_null(COALESCE(almacen_id::text, '')),
  ALTER COLUMN periodo TYPE text USING app.normalize_periodo_yyyy_mm(COALESCE(periodo::text, ''), COALESCE(app.to_date_or_null(COALESCE(fecha_corte::text, '')), created_at::date)),
  ALTER COLUMN fecha_corte TYPE date USING app.to_date_or_null(COALESCE(fecha_corte::text, '')),
  ALTER COLUMN saldo TYPE numeric(14,3) USING GREATEST(app.to_numeric_or_zero(COALESCE(saldo::text, '0')), 0),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ABIERTO')),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN activo SET DEFAULT true;

UPDATE public.inventarios_permanentes i
SET
  fecha_corte = COALESCE(i.fecha_corte, i.created_at::date, current_date),
  periodo = app.normalize_periodo_yyyy_mm(i.periodo, COALESCE(i.fecha_corte, i.created_at::date, current_date)),
  stock_inicial = GREATEST(COALESCE(i.stock_inicial, COALESCE(i.saldo, 0)), 0),
  entradas = GREATEST(COALESCE(i.entradas, 0), 0),
  salidas = GREATEST(COALESCE(i.salidas, 0), 0),
  stock_final = GREATEST(COALESCE(NULLIF(i.stock_final, 0), COALESCE(i.stock_inicial, COALESCE(i.saldo, 0)) + COALESCE(i.entradas, 0) - COALESCE(i.salidas, 0)), 0),
  costo_unitario = GREATEST(COALESCE(i.costo_unitario, 0), 0),
  valor_total = GREATEST(COALESCE(NULLIF(i.valor_total, 0), COALESCE(i.stock_final, 0) * COALESCE(i.costo_unitario, 0)), 0),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(i.moneda, ''))), ''), 'PEN'),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(i.estado), ''), 'ABIERTO')) IN ('ABIERTO', 'CERRADO', 'ANULADO') THEN upper(COALESCE(NULLIF(btrim(i.estado), ''), 'ABIERTO'))
    WHEN upper(COALESCE(NULLIF(btrim(i.estado), ''), 'ABIERTO')) = 'ACTIVO' THEN 'ABIERTO'
    WHEN upper(COALESCE(NULLIF(btrim(i.estado), ''), 'ABIERTO')) = 'INACTIVO' THEN 'ANULADO'
    ELSE 'ABIERTO'
  END,
  activo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(i.estado), ''), 'ABIERTO')) IN ('ANULADO', 'INACTIVO') THEN false
    ELSE COALESCE(i.activo, true)
  END,
  metadata = COALESCE(i.metadata, '{}'::jsonb),
  updated_at = now()
WHERE i.id IS NOT NULL;

-- asignacion_costos + calendario_empresa + saldos_iniciales_cuentas
ALTER TABLE IF EXISTS public.asignacion_costos
  ADD COLUMN IF NOT EXISTS centro_costo_id uuid,
  ADD COLUMN IF NOT EXISTS referencia_tipo text,
  ADD COLUMN IF NOT EXISTS referencia_id uuid,
  ADD COLUMN IF NOT EXISTS porcentaje numeric(7,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.calendario_empresa
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS tipo_dia text DEFAULT 'LABORABLE',
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS pais text,
  ADD COLUMN IF NOT EXISTS es_feriado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.saldos_iniciales_cuentas
  ADD COLUMN IF NOT EXISTS cuenta_id uuid,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS saldo_debe numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_haber numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_neto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

UPDATE public.asignacion_costos a
SET
  tenant_id = app.to_uuid_or_null(COALESCE(a.tenant_id::text, '')),
  centro_costo_id = app.to_uuid_or_null(COALESCE(a.centro_costo_id::text, '')),
  referencia_id = app.to_uuid_or_null(COALESCE(a.referencia_id::text, '')),
  referencia_tipo = COALESCE(NULLIF(upper(btrim(COALESCE(a.referencia_tipo, ''))), ''), 'OTRO'),
  porcentaje = LEAST(GREATEST(app.to_numeric_or_zero(COALESCE(a.porcentaje::text, '0')), 0), 100),
  monto = GREATEST(app.to_numeric_or_zero(COALESCE(a.monto::text, '0')), 0),
  fecha_inicio = COALESCE(app.to_date_or_null(COALESCE(a.fecha_inicio::text, '')), a.created_at::date, current_date),
  fecha_fin = app.to_date_or_null(COALESCE(a.fecha_fin::text, '')),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(a.moneda, ''))), ''), 'PEN'),
  estado = CASE WHEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'ACTIVA')) IN ('ACTIVA', 'INACTIVA', 'ANULADA') THEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'ACTIVA')) ELSE 'ACTIVA' END,
  activo = COALESCE(a.activo, true),
  metadata = COALESCE(a.metadata, '{}'::jsonb),
  updated_at = now()
WHERE a.id IS NOT NULL;

UPDATE public.calendario_empresa c
SET
  tenant_id = app.to_uuid_or_null(COALESCE(c.tenant_id::text, '')),
  fecha = COALESCE(app.to_date_or_null(COALESCE(c.fecha::text, '')), c.created_at::date, current_date),
  tipo_dia = CASE WHEN upper(COALESCE(NULLIF(btrim(c.tipo_dia), ''), 'LABORABLE')) IN ('LABORABLE', 'FERIADO', 'NO_LABORABLE', 'ESPECIAL') THEN upper(COALESCE(NULLIF(btrim(c.tipo_dia), ''), 'LABORABLE')) ELSE 'LABORABLE' END,
  periodo = app.normalize_periodo_yyyy_mm(c.periodo, COALESCE(app.to_date_or_null(COALESCE(c.fecha::text, '')), c.created_at::date, current_date)),
  pais = NULLIF(upper(btrim(COALESCE(c.pais, ''))), ''),
  es_feriado = COALESCE(c.es_feriado, false),
  estado = CASE WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO') THEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO')) ELSE 'ACTIVO' END,
  activo = COALESCE(c.activo, true),
  metadata = COALESCE(c.metadata, '{}'::jsonb),
  updated_at = now()
WHERE c.id IS NOT NULL;

UPDATE public.saldos_iniciales_cuentas s
SET
  tenant_id = app.to_uuid_or_null(COALESCE(s.tenant_id::text, '')),
  cuenta_id = app.to_uuid_or_null(COALESCE(s.cuenta_id::text, '')),
  fecha_inicio = COALESCE(app.to_date_or_null(COALESCE(s.fecha_inicio::text, '')), s.created_at::date, current_date),
  periodo = app.normalize_periodo_yyyy_mm(s.periodo, COALESCE(app.to_date_or_null(COALESCE(s.fecha_inicio::text, '')), s.created_at::date, current_date)),
  saldo_debe = GREATEST(app.to_numeric_or_zero(COALESCE(s.saldo_debe::text, '0')), 0),
  saldo_haber = GREATEST(app.to_numeric_or_zero(COALESCE(s.saldo_haber::text, '0')), 0),
  saldo_neto = COALESCE(NULLIF(app.to_numeric_or_zero(COALESCE(s.saldo_neto::text, '0')), 0), GREATEST(app.to_numeric_or_zero(COALESCE(s.saldo_debe::text, '0')), 0) - GREATEST(app.to_numeric_or_zero(COALESCE(s.saldo_haber::text, '0')), 0)),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(s.moneda, ''))), ''), 'PEN'),
  estado = CASE WHEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTO')) IN ('ABIERTO', 'CERRADO', 'ANULADO') THEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTO')) ELSE 'ABIERTO' END,
  activo = COALESCE(s.activo, true),
  metadata = COALESCE(s.metadata, '{}'::jsonb),
  updated_at = now()
WHERE s.id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activos_fijos_tenant_estado_fecha_runtime
ON public.activos_fijos (tenant_id, estado, fecha_adquisicion DESC);

CREATE INDEX IF NOT EXISTS idx_depreciaciones_tenant_periodo_estado_runtime
ON public.depreciaciones (tenant_id, periodo, estado, fecha_depreciacion DESC);

CREATE INDEX IF NOT EXISTS idx_registro_consignaciones_tenant_fecha_estado_runtime
ON public.registro_consignaciones (tenant_id, fecha_registro DESC, estado);

CREATE INDEX IF NOT EXISTS idx_movimientos_consignacion_tenant_fecha_runtime
ON public.movimientos_consignacion (tenant_id, fecha_movimiento DESC, tipo_movimiento);

CREATE INDEX IF NOT EXISTS idx_inventarios_permanentes_tenant_periodo_producto_runtime
ON public.inventarios_permanentes (tenant_id, periodo, producto_id, almacen_id);

CREATE INDEX IF NOT EXISTS idx_asignacion_costos_tenant_centro_estado_runtime
ON public.asignacion_costos (tenant_id, centro_costo_id, estado, fecha_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_calendario_empresa_tenant_fecha_runtime
ON public.calendario_empresa (tenant_id, fecha, tipo_dia);

CREATE INDEX IF NOT EXISTS idx_saldos_iniciales_cuentas_tenant_periodo_runtime
ON public.saldos_iniciales_cuentas (tenant_id, periodo, cuenta_id);

SELECT app.apply_tenant_policy('public', 'activos_fijos');
SELECT app.apply_tenant_policy('public', 'depreciaciones');
SELECT app.apply_tenant_policy('public', 'registro_consignaciones');
SELECT app.apply_tenant_policy('public', 'movimientos_consignacion');
SELECT app.apply_tenant_policy('public', 'inventarios_permanentes');
SELECT app.apply_tenant_policy('public', 'asignacion_costos');
SELECT app.apply_tenant_policy('public', 'calendario_empresa');
SELECT app.apply_tenant_policy('public', 'saldos_iniciales_cuentas');

COMMIT;
