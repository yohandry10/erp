
-- ============================================================================
-- 155__cajas_operational_runtime_alignment.sql
-- Alineacion runtime para Cajas/POS operativo.
-- Tablas: cajas, sesiones_caja, movimientos_caja, retiros_caja,
--         cambios_turno, cortes_caja, autorizaciones_caja.
-- ============================================================================

BEGIN;

-- Helpers de parseo seguro para payloads legacy.
CREATE OR REPLACE FUNCTION app.to_timestamptz_or_null(p_input text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN p_input::timestamptz;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION app.to_inet_or_null(p_input text)
RETURNS inet
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN p_input::inet;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;

-- cajas
ALTER TABLE IF EXISTS public.cajas
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS sucursal_id uuid,
  ADD COLUMN IF NOT EXISTS almacen_id uuid,
  ADD COLUMN IF NOT EXISTS dispositivo text,
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'TIENDA',
  ADD COLUMN IF NOT EXISTS creado_por uuid;

ALTER TABLE IF EXISTS public.cajas
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN sucursal_id TYPE uuid USING app.to_uuid_or_null(COALESCE(sucursal_id::text, '')),
  ALTER COLUMN almacen_id TYPE uuid USING app.to_uuid_or_null(COALESCE(almacen_id::text, '')),
  ALTER COLUMN creado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(creado_por::text, '')),
  ALTER COLUMN nombre TYPE text USING NULLIF(btrim(COALESCE(nombre, '')), ''),
  ALTER COLUMN codigo TYPE text USING upper(NULLIF(btrim(COALESCE(codigo, '')), '')),
  ALTER COLUMN descripcion TYPE text USING NULLIF(btrim(COALESCE(descripcion, '')), ''),
  ALTER COLUMN dispositivo TYPE text USING NULLIF(btrim(COALESCE(dispositivo, '')), ''),
  ALTER COLUMN tipo TYPE text USING upper(COALESCE(NULLIF(btrim(tipo::text), ''), 'TIENDA')),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'ACTIVO')),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(
    CASE WHEN metadata IS NULL THEN '{}'::jsonb
         WHEN jsonb_typeof(metadata) = 'object' THEN metadata
         ELSE '{}'::jsonb END,
    '{}'::jsonb
  ),
  ALTER COLUMN tipo SET DEFAULT 'TIENDA',
  ALTER COLUMN estado SET DEFAULT 'ACTIVO',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.cajas c
SET
  nombre = COALESCE(NULLIF(btrim(COALESCE(c.nombre, '')), ''), 'CAJA-' || right(replace(c.id::text, '-', ''), 6)),
  codigo = COALESCE(NULLIF(upper(btrim(COALESCE(c.codigo, ''))), ''), 'CAJA-' || right(replace(c.id::text, '-', ''), 6)),
  descripcion = NULLIF(btrim(COALESCE(c.descripcion, '')), ''),
  dispositivo = NULLIF(btrim(COALESCE(c.dispositivo, '')), ''),
  tipo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(c.tipo), ''), 'TIENDA')) IN ('STORE', 'TIENDA') THEN 'TIENDA'
    WHEN upper(COALESCE(NULLIF(btrim(c.tipo), ''), 'TIENDA')) IN ('MOSTRADOR', 'COUNTER') THEN 'MOSTRADOR'
    WHEN upper(COALESCE(NULLIF(btrim(c.tipo), ''), 'TIENDA')) IN ('KIOSKO', 'KIOSK') THEN 'KIOSKO'
    ELSE 'TIENDA'
  END,
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'MANTENIMIENTO', 'BLOQUEADA')
      THEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO'))
    WHEN upper(COALESCE(NULLIF(btrim(c.estado), ''), 'ACTIVO')) IN ('CERRADA', 'DISABLED') THEN 'INACTIVO'
    ELSE 'ACTIVO'
  END,
  metadata = COALESCE(c.metadata, '{}'::jsonb)
WHERE c.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_cajas_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sucursal_id := app.to_uuid_or_null(COALESCE(NEW.sucursal_id::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));
  NEW.creado_por := app.to_uuid_or_null(COALESCE(NEW.creado_por::text, ''));
  NEW.nombre := COALESCE(NULLIF(btrim(COALESCE(NEW.nombre, '')), ''), 'CAJA-' || right(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 6));
  NEW.codigo := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''), 'CAJA-' || right(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 6));
  NEW.descripcion := NULLIF(btrim(COALESCE(NEW.descripcion, '')), '');
  NEW.dispositivo := NULLIF(btrim(COALESCE(NEW.dispositivo, '')), '');
  NEW.tipo := CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'TIENDA')) IN ('STORE', 'TIENDA') THEN 'TIENDA'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'TIENDA')) IN ('MOSTRADOR', 'COUNTER') THEN 'MOSTRADOR'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'TIENDA')) IN ('KIOSKO', 'KIOSK') THEN 'KIOSKO'
    ELSE 'TIENDA'
  END;
  NEW.estado := CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'MANTENIMIENTO', 'BLOQUEADA')
      THEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'))
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO')) IN ('CERRADA', 'DISABLED') THEN 'INACTIVO'
    ELSE 'ACTIVO'
  END;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cajas_row ON public.cajas;
CREATE TRIGGER trg_normalize_cajas_row
BEFORE INSERT OR UPDATE ON public.cajas
FOR EACH ROW EXECUTE FUNCTION app.normalize_cajas_row();

-- sesiones_caja
ALTER TABLE IF EXISTS public.sesiones_caja
  ADD COLUMN IF NOT EXISTS usuario_apertura uuid,
  ADD COLUMN IF NOT EXISTS monto_cierre numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duracion_horas integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denominaciones_apertura jsonb,
  ADD COLUMN IF NOT EXISTS denominaciones_cierre jsonb,
  ADD COLUMN IF NOT EXISTS supervisor_cierre_id uuid,
  ADD COLUMN IF NOT EXISTS requirio_autorizacion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS autorizacion_supervisor_id uuid,
  ADD COLUMN IF NOT EXISTS razon_autorizacion text,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS geolocalizacion jsonb,
  ADD COLUMN IF NOT EXISTS foto_apertura text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS resumen jsonb;

ALTER TABLE IF EXISTS public.sesiones_caja
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(caja_id::text, '')),
  ALTER COLUMN cajero_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cajero_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN abierto_por TYPE uuid USING app.to_uuid_or_null(COALESCE(abierto_por::text, '')),
  ALTER COLUMN usuario_apertura TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_apertura::text, '')),
  ALTER COLUMN autorizacion_supervisor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(autorizacion_supervisor_id::text, '')),
  ALTER COLUMN supervisor_cierre_id TYPE uuid USING app.to_uuid_or_null(COALESCE(supervisor_cierre_id::text, '')),
  ALTER COLUMN monto_inicio TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_inicio::text),
  ALTER COLUMN monto_inicial TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_inicial::text),
  ALTER COLUMN monto_esperado TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_esperado::text),
  ALTER COLUMN monto_contado TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_contado::text),
  ALTER COLUMN monto_cierre TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_cierre::text),
  ALTER COLUMN diferencia TYPE numeric(14,2) USING app.to_numeric_or_zero(diferencia::text),
  ALTER COLUMN total_efectivo TYPE numeric(14,2) USING app.to_numeric_or_zero(total_efectivo::text),
  ALTER COLUMN total_tarjeta TYPE numeric(14,2) USING app.to_numeric_or_zero(total_tarjeta::text),
  ALTER COLUMN duracion_horas TYPE integer USING GREATEST(app.to_int_or_zero(duracion_horas::text), 0),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'ABIERTA')),
  ALTER COLUMN moneda TYPE text USING upper(COALESCE(NULLIF(btrim(moneda::text), ''), 'PEN')),
  ALTER COLUMN fecha_apertura TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_apertura::text, '')),
  ALTER COLUMN fecha_cierre TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_cierre::text, '')),
  ALTER COLUMN hora_apertura TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(hora_apertura::text, '')),
  ALTER COLUMN hora_cierre TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(hora_cierre::text, '')),
  ALTER COLUMN ip_address TYPE inet USING app.to_inet_or_null(COALESCE(ip_address::text, '')),
  ALTER COLUMN denominaciones_apertura TYPE jsonb USING COALESCE(denominaciones_apertura, '{"billetes": {}, "monedas": {}}'::jsonb),
  ALTER COLUMN denominaciones_cierre TYPE jsonb USING COALESCE(denominaciones_cierre, '{"billetes": {}, "monedas": {}}'::jsonb),
  ALTER COLUMN geolocalizacion TYPE jsonb USING COALESCE(geolocalizacion, '{}'::jsonb),
  ALTER COLUMN resumen TYPE jsonb USING COALESCE(resumen, '{}'::jsonb),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(metadata, '{}'::jsonb),
  ALTER COLUMN monto_inicio SET DEFAULT 0,
  ALTER COLUMN monto_inicial SET DEFAULT 0,
  ALTER COLUMN monto_esperado SET DEFAULT 0,
  ALTER COLUMN monto_contado SET DEFAULT 0,
  ALTER COLUMN monto_cierre SET DEFAULT 0,
  ALTER COLUMN diferencia SET DEFAULT 0,
  ALTER COLUMN total_efectivo SET DEFAULT 0,
  ALTER COLUMN total_tarjeta SET DEFAULT 0,
  ALTER COLUMN duracion_horas SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'ABIERTA',
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN cierre_administrativo SET DEFAULT false,
  ALTER COLUMN congelada SET DEFAULT false,
  ALTER COLUMN requirio_autorizacion SET DEFAULT false,
  ALTER COLUMN denominaciones_apertura SET DEFAULT '{"billetes": {}, "monedas": {}}'::jsonb,
  ALTER COLUMN denominaciones_cierre SET DEFAULT '{"billetes": {}, "monedas": {}}'::jsonb,
  ALTER COLUMN geolocalizacion SET DEFAULT '{}'::jsonb,
  ALTER COLUMN resumen SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.sesiones_caja s
SET
  cajero_id = COALESCE(s.cajero_id, s.usuario_id, s.abierto_por),
  usuario_apertura = COALESCE(s.usuario_apertura, s.abierto_por, s.usuario_id, s.cajero_id),
  monto_inicial = GREATEST(COALESCE(NULLIF(s.monto_inicial, 0), s.monto_inicio, 0), 0),
  monto_inicio = GREATEST(COALESCE(NULLIF(s.monto_inicio, 0), s.monto_inicial, 0), 0),
  monto_esperado = GREATEST(COALESCE(s.monto_esperado, s.monto_inicial, s.monto_inicio, 0), 0),
  monto_contado = GREATEST(COALESCE(s.monto_contado, 0), 0),
  monto_cierre = GREATEST(COALESCE(NULLIF(s.monto_cierre, 0), s.monto_contado, 0), 0),
  total_efectivo = GREATEST(COALESCE(s.total_efectivo, 0), 0),
  total_tarjeta = GREATEST(COALESCE(s.total_tarjeta, 0), 0),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTA')) IN ('ABIERTA', 'CERRADA', 'PAUSADA', 'ANULADA') THEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTA'))
    WHEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTA')) IN ('ACTIVO', 'OPEN') THEN 'ABIERTA'
    WHEN upper(COALESCE(NULLIF(btrim(s.estado), ''), 'ABIERTA')) IN ('INACTIVO', 'CLOSED', 'CERRADO') THEN 'CERRADA'
    ELSE 'ABIERTA'
  END,
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(s.moneda, ''))), ''), 'PEN'),
  fecha_apertura = COALESCE(s.fecha_apertura, s.hora_apertura, s.created_at, now()),
  hora_apertura = COALESCE(s.hora_apertura, s.fecha_apertura, s.created_at, now()),
  denominaciones_apertura = COALESCE(s.denominaciones_apertura, '{"billetes": {}, "monedas": {}}'::jsonb),
  denominaciones_cierre = COALESCE(s.denominaciones_cierre, '{"billetes": {}, "monedas": {}}'::jsonb),
  geolocalizacion = COALESCE(s.geolocalizacion, '{}'::jsonb),
  resumen = COALESCE(s.resumen, '{}'::jsonb),
  metadata = COALESCE(s.metadata, '{}'::jsonb)
WHERE s.id IS NOT NULL;

UPDATE public.sesiones_caja s
SET
  fecha_cierre = CASE WHEN s.estado = 'CERRADA' THEN COALESCE(s.fecha_cierre, s.hora_cierre, now()) ELSE NULL END,
  hora_cierre = CASE WHEN s.estado = 'CERRADA' THEN COALESCE(s.hora_cierre, s.fecha_cierre, now()) ELSE NULL END,
  diferencia = CASE WHEN s.estado = 'CERRADA'
    THEN round(COALESCE(s.monto_contado, 0) - COALESCE(s.monto_esperado, 0), 2)
    ELSE COALESCE(s.diferencia, 0) END,
  duracion_horas = CASE
    WHEN s.estado = 'CERRADA' AND COALESCE(s.hora_apertura, s.fecha_apertura) IS NOT NULL AND COALESCE(s.hora_cierre, s.fecha_cierre) IS NOT NULL
      THEN GREATEST(floor(EXTRACT(EPOCH FROM (COALESCE(s.hora_cierre, s.fecha_cierre) - COALESCE(s.hora_apertura, s.fecha_apertura))) / 3600)::integer, 0)
    ELSE COALESCE(s.duracion_horas, 0)
  END
WHERE s.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_sesiones_caja_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.caja_id := app.to_uuid_or_null(COALESCE(NEW.caja_id::text, ''));
  NEW.cajero_id := app.to_uuid_or_null(COALESCE(NEW.cajero_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.abierto_por := app.to_uuid_or_null(COALESCE(NEW.abierto_por::text, ''));
  NEW.usuario_apertura := app.to_uuid_or_null(COALESCE(NEW.usuario_apertura::text, ''));
  NEW.autorizacion_supervisor_id := app.to_uuid_or_null(COALESCE(NEW.autorizacion_supervisor_id::text, ''));
  NEW.supervisor_cierre_id := app.to_uuid_or_null(COALESCE(NEW.supervisor_cierre_id::text, ''));
  NEW.ip_address := app.to_inet_or_null(COALESCE(NEW.ip_address::text, ''));

  NEW.cajero_id := COALESCE(NEW.cajero_id, NEW.usuario_id, NEW.abierto_por);
  NEW.usuario_apertura := COALESCE(NEW.usuario_apertura, NEW.abierto_por, NEW.usuario_id, NEW.cajero_id);

  NEW.monto_inicial := GREATEST(COALESCE(NULLIF(NEW.monto_inicial, 0), NEW.monto_inicio, 0), 0);
  NEW.monto_inicio := GREATEST(COALESCE(NULLIF(NEW.monto_inicio, 0), NEW.monto_inicial, 0), 0);
  NEW.monto_esperado := GREATEST(COALESCE(NEW.monto_esperado, NEW.monto_inicial, NEW.monto_inicio, 0), 0);
  NEW.monto_contado := GREATEST(COALESCE(NEW.monto_contado, 0), 0);
  NEW.monto_cierre := GREATEST(COALESCE(NULLIF(NEW.monto_cierre, 0), NEW.monto_contado, 0), 0);
  NEW.total_efectivo := GREATEST(COALESCE(NEW.total_efectivo, 0), 0);
  NEW.total_tarjeta := GREATEST(COALESCE(NEW.total_tarjeta, 0), 0);

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ABIERTA'));
  IF v_estado IN ('ACTIVO', 'OPEN') THEN v_estado := 'ABIERTA'; END IF;
  IF v_estado IN ('INACTIVO', 'CLOSED', 'CERRADO') THEN v_estado := 'CERRADA'; END IF;
  IF v_estado NOT IN ('ABIERTA', 'CERRADA', 'PAUSADA', 'ANULADA') THEN v_estado := 'ABIERTA'; END IF;
  NEW.estado := v_estado;

  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.dispositivo := NULLIF(btrim(COALESCE(NEW.dispositivo, '')), '');
  NEW.notas := NULLIF(btrim(COALESCE(NEW.notas, '')), '');
  NEW.notas_cierre := NULLIF(btrim(COALESCE(NEW.notas_cierre, '')), '');
  NEW.razon_cierre_administrativo := NULLIF(btrim(COALESCE(NEW.razon_cierre_administrativo, '')), '');
  NEW.razon_autorizacion := NULLIF(btrim(COALESCE(NEW.razon_autorizacion, '')), '');

  NEW.fecha_apertura := COALESCE(NEW.fecha_apertura, NEW.hora_apertura, NEW.created_at, now());
  NEW.hora_apertura := COALESCE(NEW.hora_apertura, NEW.fecha_apertura, NEW.created_at, now());

  IF NEW.estado = 'CERRADA' THEN
    NEW.fecha_cierre := COALESCE(NEW.fecha_cierre, NEW.hora_cierre, now());
    NEW.hora_cierre := COALESCE(NEW.hora_cierre, NEW.fecha_cierre, now());
    NEW.diferencia := round(NEW.monto_contado - NEW.monto_esperado, 2);
    IF COALESCE(NEW.hora_apertura, NEW.fecha_apertura) IS NOT NULL AND COALESCE(NEW.hora_cierre, NEW.fecha_cierre) IS NOT NULL THEN
      NEW.duracion_horas := GREATEST(floor(EXTRACT(EPOCH FROM (COALESCE(NEW.hora_cierre, NEW.fecha_cierre) - COALESCE(NEW.hora_apertura, NEW.fecha_apertura))) / 3600)::integer, 0);
    END IF;
  ELSE
    NEW.fecha_cierre := NULL;
    NEW.hora_cierre := NULL;
    NEW.diferencia := COALESCE(NEW.diferencia, 0);
    NEW.duracion_horas := GREATEST(COALESCE(NEW.duracion_horas, 0), 0);
  END IF;

  NEW.denominaciones_apertura := COALESCE(NEW.denominaciones_apertura, '{"billetes": {}, "monedas": {}}'::jsonb);
  NEW.denominaciones_cierre := COALESCE(NEW.denominaciones_cierre, '{"billetes": {}, "monedas": {}}'::jsonb);
  NEW.geolocalizacion := COALESCE(NEW.geolocalizacion, '{}'::jsonb);
  NEW.resumen := COALESCE(NEW.resumen, '{}'::jsonb);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_sesiones_caja_row ON public.sesiones_caja;
CREATE TRIGGER trg_normalize_sesiones_caja_row
BEFORE INSERT OR UPDATE ON public.sesiones_caja
FOR EACH ROW EXECUTE FUNCTION app.normalize_sesiones_caja_row();

-- movimientos_caja
ALTER TABLE IF EXISTS public.movimientos_caja
  ADD COLUMN IF NOT EXISTS saldo_anterior numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_nuevo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid,
  ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ip_address inet;

ALTER TABLE IF EXISTS public.movimientos_caja
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN sesion_caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(sesion_caja_id::text, '')),
  ALTER COLUMN usuario_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_id::text, '')),
  ALTER COLUMN supervisor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(supervisor_id::text, '')),
  ALTER COLUMN secuencia TYPE integer USING GREATEST(app.to_int_or_zero(secuencia::text), 0),
  ALTER COLUMN tipo_movimiento TYPE text USING upper(COALESCE(NULLIF(btrim(tipo_movimiento::text), ''), 'INGRESO')),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN saldo_anterior TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_anterior::text),
  ALTER COLUMN saldo_nuevo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_nuevo::text),
  ALTER COLUMN referencia_documento TYPE text USING NULLIF(btrim(COALESCE(referencia_documento, '')), ''),
  ALTER COLUMN referencia_tipo TYPE text USING lower(NULLIF(btrim(COALESCE(referencia_tipo, '')), '')),
  ALTER COLUMN motivo TYPE text USING NULLIF(btrim(COALESCE(motivo, '')), ''),
  ALTER COLUMN "timestamp" TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE("timestamp"::text, '')),
  ALTER COLUMN ip_address TYPE inet USING app.to_inet_or_null(COALESCE(ip_address::text, '')),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(metadata, '{}'::jsonb),
  ALTER COLUMN saldo_anterior SET DEFAULT 0,
  ALTER COLUMN saldo_nuevo SET DEFAULT 0,
  ALTER COLUMN "timestamp" SET DEFAULT now(),
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

WITH ranked AS (
  SELECT m.id,
         row_number() OVER (PARTITION BY m.sesion_caja_id ORDER BY COALESCE(m."timestamp", m.created_at, now()), m.id::text) rn
  FROM public.movimientos_caja m
  WHERE m.sesion_caja_id IS NOT NULL
)
UPDATE public.movimientos_caja m
SET secuencia = r.rn,
    updated_at = now()
FROM ranked r
WHERE m.id = r.id
  AND (m.secuencia IS NULL OR m.secuencia < 1 OR m.secuencia <> r.rn);

UPDATE public.movimientos_caja m
SET
  tipo_movimiento = CASE
    WHEN upper(COALESCE(NULLIF(btrim(m.tipo_movimiento), ''), 'INGRESO')) IN ('VENTA','RETIRO','INGRESO','AJUSTE','CAMBIO_TURNO','APERTURA','CIERRE') THEN upper(COALESCE(NULLIF(btrim(m.tipo_movimiento), ''), 'INGRESO'))
    WHEN upper(COALESCE(NULLIF(btrim(m.tipo_movimiento), ''), 'INGRESO')) = 'GASTO' THEN 'RETIRO'
    ELSE 'INGRESO'
  END,
  monto = COALESCE(m.monto, 0),
  saldo_anterior = COALESCE(m.saldo_anterior, 0),
  saldo_nuevo = COALESCE(m.saldo_nuevo, COALESCE(m.saldo_anterior, 0) + COALESCE(m.monto, 0)),
  "timestamp" = COALESCE(m."timestamp", m.created_at, now()),
  metadata = COALESCE(m.metadata, '{}'::jsonb)
WHERE m.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_movimientos_caja_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_prev_saldo numeric(14,2);
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.supervisor_id := app.to_uuid_or_null(COALESCE(NEW.supervisor_id::text, ''));
  NEW.ip_address := app.to_inet_or_null(COALESCE(NEW.ip_address::text, ''));

  IF COALESCE(NEW.secuencia, 0) < 1 THEN
    SELECT COALESCE(MAX(m.secuencia), 0) + 1 INTO NEW.secuencia
    FROM public.movimientos_caja m
    WHERE m.sesion_caja_id = NEW.sesion_caja_id
      AND (TG_OP = 'INSERT' OR m.id <> NEW.id);
  END IF;

  NEW.tipo_movimiento := CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_movimiento, '')), ''), 'INGRESO')) IN ('VENTA','RETIRO','INGRESO','AJUSTE','CAMBIO_TURNO','APERTURA','CIERRE') THEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_movimiento, '')), ''), 'INGRESO'))
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_movimiento, '')), ''), 'INGRESO')) = 'GASTO' THEN 'RETIRO'
    ELSE 'INGRESO'
  END;

  NEW.monto := COALESCE(NEW.monto, 0);
  NEW.referencia_documento := NULLIF(btrim(COALESCE(NEW.referencia_documento, '')), '');
  NEW.referencia_tipo := lower(NULLIF(btrim(COALESCE(NEW.referencia_tipo, '')), ''));
  NEW.motivo := NULLIF(btrim(COALESCE(NEW.motivo, '')), '');
  NEW."timestamp" := COALESCE(NEW."timestamp", NEW.created_at, now());

  IF NEW.saldo_anterior IS NULL AND NEW.sesion_caja_id IS NOT NULL THEN
    SELECT m.saldo_nuevo INTO v_prev_saldo
    FROM public.movimientos_caja m
    WHERE m.sesion_caja_id = NEW.sesion_caja_id
      AND (TG_OP = 'INSERT' OR m.id <> NEW.id)
    ORDER BY m.secuencia DESC, m.created_at DESC
    LIMIT 1;

    IF v_prev_saldo IS NULL THEN
      SELECT COALESCE(s.monto_inicial, s.monto_inicio, 0) INTO v_prev_saldo
      FROM public.sesiones_caja s
      WHERE s.id = NEW.sesion_caja_id;
    END IF;

    NEW.saldo_anterior := COALESCE(v_prev_saldo, 0);
  ELSE
    NEW.saldo_anterior := COALESCE(NEW.saldo_anterior, 0);
  END IF;

  NEW.saldo_nuevo := COALESCE(NEW.saldo_nuevo, NEW.saldo_anterior + NEW.monto);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_movimientos_caja_row ON public.movimientos_caja;
CREATE TRIGGER trg_normalize_movimientos_caja_row
BEFORE INSERT OR UPDATE ON public.movimientos_caja
FOR EACH ROW EXECUTE FUNCTION app.normalize_movimientos_caja_row();

-- retiros_caja
ALTER TABLE IF EXISTS public.retiros_caja
  ADD COLUMN IF NOT EXISTS movimiento_caja_id uuid,
  ADD COLUMN IF NOT EXISTS autorizado_por uuid,
  ADD COLUMN IF NOT EXISTS codigo_autorizacion text,
  ADD COLUMN IF NOT EXISTS caja_id uuid,
  ADD COLUMN IF NOT EXISTS comprobante_url text;

ALTER TABLE IF EXISTS public.retiros_caja
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN sesion_caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(sesion_caja_id::text, '')),
  ALTER COLUMN movimiento_caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(movimiento_caja_id::text, '')),
  ALTER COLUMN autorizado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(autorizado_por::text, '')),
  ALTER COLUMN caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(caja_id::text, '')),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN motivo TYPE text USING upper(COALESCE(NULLIF(btrim(motivo::text), ''), 'OTRO')),
  ALTER COLUMN motivo_detalle TYPE text USING NULLIF(btrim(COALESCE(motivo_detalle, '')), ''),
  ALTER COLUMN estado_conciliacion TYPE text USING upper(COALESCE(NULLIF(btrim(estado_conciliacion::text), ''), 'PENDIENTE')),
  ALTER COLUMN fecha_conciliacion TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_conciliacion::text, '')),
  ALTER COLUMN banco_destino TYPE text USING NULLIF(btrim(COALESCE(banco_destino, '')), ''),
  ALTER COLUMN numero_operacion TYPE text USING NULLIF(btrim(COALESCE(numero_operacion::text, '')), ''),
  ALTER COLUMN foto_comprobante TYPE text USING NULLIF(btrim(COALESCE(foto_comprobante, '')), ''),
  ALTER COLUMN comprobante_url TYPE text USING NULLIF(btrim(COALESCE(comprobante_url, '')), ''),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(metadata, '{}'::jsonb),
  ALTER COLUMN monto SET DEFAULT 0,
  ALTER COLUMN estado_conciliacion SET DEFAULT 'PENDIENTE',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.retiros_caja r
SET
  monto = GREATEST(COALESCE(r.monto, 0), 0),
  motivo = CASE
    WHEN upper(COALESCE(NULLIF(btrim(r.motivo), ''), 'OTRO')) IN ('DEPOSITO_BANCARIO', 'COMPRA_EMERGENCIA', 'BOVEDA', 'BÓVEDA', 'OTRO')
      THEN replace(upper(COALESCE(NULLIF(btrim(r.motivo), ''), 'OTRO')), 'Ó', 'O')
    ELSE 'OTRO'
  END,
  estado_conciliacion = CASE
    WHEN upper(COALESCE(NULLIF(btrim(r.estado_conciliacion), ''), 'PENDIENTE')) IN ('PENDIENTE', 'CONCILIADO', 'RECHAZADO')
      THEN upper(COALESCE(NULLIF(btrim(r.estado_conciliacion), ''), 'PENDIENTE'))
    ELSE 'PENDIENTE'
  END,
  fecha_conciliacion = CASE WHEN upper(COALESCE(NULLIF(btrim(r.estado_conciliacion), ''), 'PENDIENTE')) = 'CONCILIADO' THEN COALESCE(r.fecha_conciliacion, now()) ELSE r.fecha_conciliacion END,
  comprobante_url = COALESCE(NULLIF(btrim(COALESCE(r.comprobante_url, '')), ''), NULLIF(btrim(COALESCE(r.foto_comprobante, '')), '')),
  metadata = COALESCE(r.metadata, '{}'::jsonb)
WHERE r.id IS NOT NULL;

UPDATE public.retiros_caja r
SET caja_id = s.caja_id
FROM public.sesiones_caja s
WHERE r.sesion_caja_id = s.id
  AND (r.caja_id IS NULL OR r.caja_id <> s.caja_id);

CREATE OR REPLACE FUNCTION app.normalize_retiros_caja_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.movimiento_caja_id := app.to_uuid_or_null(COALESCE(NEW.movimiento_caja_id::text, ''));
  NEW.autorizado_por := app.to_uuid_or_null(COALESCE(NEW.autorizado_por::text, ''));
  NEW.caja_id := app.to_uuid_or_null(COALESCE(NEW.caja_id::text, ''));

  NEW.monto := GREATEST(COALESCE(NEW.monto, 0), 0);
  NEW.motivo := CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.motivo, '')), ''), 'OTRO')) IN ('DEPOSITO_BANCARIO', 'COMPRA_EMERGENCIA', 'BOVEDA', 'BÓVEDA', 'OTRO')
      THEN replace(upper(COALESCE(NULLIF(btrim(COALESCE(NEW.motivo, '')), ''), 'OTRO')), 'Ó', 'O')
    ELSE 'OTRO'
  END;
  NEW.estado_conciliacion := CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado_conciliacion, '')), ''), 'PENDIENTE')) IN ('PENDIENTE', 'CONCILIADO', 'RECHAZADO')
      THEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado_conciliacion, '')), ''), 'PENDIENTE'))
    ELSE 'PENDIENTE'
  END;
  IF NEW.estado_conciliacion = 'CONCILIADO' THEN NEW.fecha_conciliacion := COALESCE(NEW.fecha_conciliacion, now()); END IF;

  NEW.numero_operacion := NULLIF(btrim(COALESCE(NEW.numero_operacion::text, '')), '');
  NEW.banco_destino := NULLIF(btrim(COALESCE(NEW.banco_destino, '')), '');
  NEW.foto_comprobante := NULLIF(btrim(COALESCE(NEW.foto_comprobante, '')), '');
  NEW.comprobante_url := COALESCE(NULLIF(btrim(COALESCE(NEW.comprobante_url, '')), ''), NULLIF(btrim(COALESCE(NEW.foto_comprobante, '')), ''));
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_retiros_caja_row ON public.retiros_caja;
CREATE TRIGGER trg_normalize_retiros_caja_row
BEFORE INSERT OR UPDATE ON public.retiros_caja
FOR EACH ROW EXECUTE FUNCTION app.normalize_retiros_caja_row();

-- cambios_turno
ALTER TABLE IF EXISTS public.cambios_turno
  ADD COLUMN IF NOT EXISTS usuario_saliente_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_entrante_id uuid,
  ADD COLUMN IF NOT EXISTS saldo_sistema numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denominaciones jsonb,
  ADD COLUMN IF NOT EXISTS razon_cancelacion text;

ALTER TABLE IF EXISTS public.cambios_turno
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN sesion_caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(sesion_caja_id::text, '')),
  ALTER COLUMN usuario_saliente_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_saliente_id::text, '')),
  ALTER COLUMN usuario_entrante_id TYPE uuid USING app.to_uuid_or_null(COALESCE(usuario_entrante_id::text, '')),
  ALTER COLUMN timestamp_inicio TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(timestamp_inicio::text, '')),
  ALTER COLUMN timestamp_fin TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(timestamp_fin::text, '')),
  ALTER COLUMN saldo_sistema TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_sistema::text),
  ALTER COLUMN saldo_contado TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_contado::text),
  ALTER COLUMN diferencia TYPE numeric(14,2) USING app.to_numeric_or_zero(diferencia::text),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'EN_PROCESO')),
  ALTER COLUMN denominaciones TYPE jsonb USING COALESCE(denominaciones, '{"billetes": {}, "monedas": {}}'::jsonb),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(metadata, '{}'::jsonb),
  ALTER COLUMN saldo_sistema SET DEFAULT 0,
  ALTER COLUMN saldo_contado SET DEFAULT 0,
  ALTER COLUMN diferencia SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'EN_PROCESO',
  ALTER COLUMN denominaciones SET DEFAULT '{"billetes": {}, "monedas": {}}'::jsonb,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.cambios_turno ct
SET
  saldo_sistema = GREATEST(COALESCE(ct.saldo_sistema, 0), 0),
  saldo_contado = GREATEST(COALESCE(ct.saldo_contado, 0), 0),
  diferencia = round(COALESCE(NULLIF(ct.diferencia, 0), COALESCE(ct.saldo_contado, 0) - COALESCE(ct.saldo_sistema, 0)), 2),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO')) IN ('EN_PROCESO', 'COMPLETADO', 'CANCELADO') THEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO'))
    WHEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO')) IN ('ACTIVO', 'BORRADOR', 'PENDIENTE') THEN 'EN_PROCESO'
    WHEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO')) IN ('FINALIZADO') THEN 'COMPLETADO'
    WHEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO')) IN ('ANULADO') THEN 'CANCELADO'
    ELSE 'EN_PROCESO'
  END,
  timestamp_inicio = COALESCE(ct.timestamp_inicio, ct.created_at, now()),
  timestamp_fin = CASE WHEN upper(COALESCE(NULLIF(btrim(ct.estado), ''), 'EN_PROCESO')) IN ('COMPLETADO', 'CANCELADO', 'FINALIZADO', 'ANULADO') THEN COALESCE(ct.timestamp_fin, now()) ELSE ct.timestamp_fin END,
  denominaciones = COALESCE(ct.denominaciones, '{"billetes": {}, "monedas": {}}'::jsonb),
  metadata = COALESCE(ct.metadata, '{}'::jsonb)
WHERE ct.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_cambios_turno_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.usuario_saliente_id := app.to_uuid_or_null(COALESCE(NEW.usuario_saliente_id::text, ''));
  NEW.usuario_entrante_id := app.to_uuid_or_null(COALESCE(NEW.usuario_entrante_id::text, ''));
  NEW.saldo_sistema := GREATEST(COALESCE(NEW.saldo_sistema, 0), 0);
  NEW.saldo_contado := GREATEST(COALESCE(NEW.saldo_contado, 0), 0);
  NEW.diferencia := round(COALESCE(NEW.diferencia, NEW.saldo_contado - NEW.saldo_sistema, 0), 2);
  NEW.timestamp_inicio := COALESCE(NEW.timestamp_inicio, NEW.created_at, now());

  NEW.estado := CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'EN_PROCESO')) IN ('EN_PROCESO', 'COMPLETADO', 'CANCELADO') THEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'EN_PROCESO'))
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'EN_PROCESO')) IN ('ACTIVO', 'BORRADOR', 'PENDIENTE') THEN 'EN_PROCESO'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'EN_PROCESO')) IN ('FINALIZADO') THEN 'COMPLETADO'
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'EN_PROCESO')) IN ('ANULADO') THEN 'CANCELADO'
    ELSE 'EN_PROCESO'
  END;

  IF NEW.estado IN ('COMPLETADO', 'CANCELADO') THEN
    NEW.timestamp_fin := COALESCE(NEW.timestamp_fin, now());
  END IF;

  NEW.denominaciones := COALESCE(NEW.denominaciones, '{"billetes": {}, "monedas": {}}'::jsonb);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cambios_turno_row ON public.cambios_turno;
CREATE TRIGGER trg_normalize_cambios_turno_row
BEFORE INSERT OR UPDATE ON public.cambios_turno
FOR EACH ROW EXECUTE FUNCTION app.normalize_cambios_turno_row();

-- cortes_caja
ALTER TABLE IF EXISTS public.cortes_caja
  ADD COLUMN IF NOT EXISTS sesion_caja_id uuid,
  ADD COLUMN IF NOT EXISTS caja_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_corte timestamptz,
  ADD COLUMN IF NOT EXISTS cajero_id uuid,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS total_ventas numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_impuestos numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_neto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_documentos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resumen_metodos_pago jsonb,
  ADD COLUMN IF NOT EXISTS resumen_fiscal jsonb,
  ADD COLUMN IF NOT EXISTS integridad_hash text;

ALTER TABLE IF EXISTS public.cortes_caja
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN sesion_caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(sesion_caja_id::text, '')),
  ALTER COLUMN caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(caja_id::text, '')),
  ALTER COLUMN cajero_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cajero_id::text, '')),
  ALTER COLUMN fecha_corte TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(fecha_corte::text, '')),
  ALTER COLUMN moneda TYPE text USING upper(COALESCE(NULLIF(btrim(moneda::text), ''), 'PEN')),
  ALTER COLUMN total_ventas TYPE numeric(14,2) USING app.to_numeric_or_zero(total_ventas::text),
  ALTER COLUMN total_impuestos TYPE numeric(14,2) USING app.to_numeric_or_zero(total_impuestos::text),
  ALTER COLUMN total_neto TYPE numeric(14,2) USING app.to_numeric_or_zero(total_neto::text),
  ALTER COLUMN total_documentos TYPE integer USING GREATEST(app.to_int_or_zero(total_documentos::text), 0),
  ALTER COLUMN resumen_metodos_pago TYPE jsonb USING COALESCE(resumen_metodos_pago, '{}'::jsonb),
  ALTER COLUMN resumen_fiscal TYPE jsonb USING COALESCE(resumen_fiscal, '{}'::jsonb),
  ALTER COLUMN integridad_hash TYPE text USING NULLIF(btrim(COALESCE(integridad_hash, '')), ''),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(metadata, '{}'::jsonb),
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN total_ventas SET DEFAULT 0,
  ALTER COLUMN total_impuestos SET DEFAULT 0,
  ALTER COLUMN total_neto SET DEFAULT 0,
  ALTER COLUMN total_documentos SET DEFAULT 0,
  ALTER COLUMN resumen_metodos_pago SET DEFAULT '{}'::jsonb,
  ALTER COLUMN resumen_fiscal SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.cortes_caja c
SET
  fecha_corte = COALESCE(c.fecha_corte, c.created_at, now()),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(c.moneda, ''))), ''), 'PEN'),
  total_ventas = GREATEST(COALESCE(c.total_ventas, 0), 0),
  total_impuestos = GREATEST(COALESCE(c.total_impuestos, 0), 0),
  total_neto = GREATEST(COALESCE(NULLIF(c.total_neto, 0), COALESCE(c.total_ventas, 0) - COALESCE(c.total_impuestos, 0)), 0),
  total_documentos = GREATEST(COALESCE(c.total_documentos, 0), 0),
  resumen_metodos_pago = COALESCE(c.resumen_metodos_pago, '{}'::jsonb),
  resumen_fiscal = COALESCE(c.resumen_fiscal, '{}'::jsonb),
  metadata = COALESCE(c.metadata, '{}'::jsonb)
WHERE c.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_cortes_caja_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.caja_id := app.to_uuid_or_null(COALESCE(NEW.caja_id::text, ''));
  NEW.cajero_id := app.to_uuid_or_null(COALESCE(NEW.cajero_id::text, ''));
  NEW.fecha_corte := COALESCE(NEW.fecha_corte, NEW.created_at, now());
  NEW.moneda := COALESCE(NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), ''), 'PEN');
  NEW.total_ventas := GREATEST(COALESCE(NEW.total_ventas, 0), 0);
  NEW.total_impuestos := GREATEST(COALESCE(NEW.total_impuestos, 0), 0);
  NEW.total_neto := GREATEST(COALESCE(NULLIF(NEW.total_neto, 0), NEW.total_ventas - NEW.total_impuestos, 0), 0);
  NEW.total_documentos := GREATEST(COALESCE(NEW.total_documentos, 0), 0);
  NEW.resumen_metodos_pago := COALESCE(NEW.resumen_metodos_pago, '{}'::jsonb);
  NEW.resumen_fiscal := COALESCE(NEW.resumen_fiscal, '{}'::jsonb);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cortes_caja_row ON public.cortes_caja;
CREATE TRIGGER trg_normalize_cortes_caja_row
BEFORE INSERT OR UPDATE ON public.cortes_caja
FOR EACH ROW EXECUTE FUNCTION app.normalize_cortes_caja_row();

-- autorizaciones_caja
ALTER TABLE IF EXISTS public.autorizaciones_caja
  ADD COLUMN IF NOT EXISTS sesion_caja_id uuid,
  ADD COLUMN IF NOT EXISTS monto_solicitado numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_min_configurado numeric(14,2),
  ADD COLUMN IF NOT EXISTS monto_max_configurado numeric(14,2),
  ADD COLUMN IF NOT EXISTS solicitante_id uuid,
  ADD COLUMN IF NOT EXISTS razon_autorizacion text,
  ADD COLUMN IF NOT EXISTS firma_digital text,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS dispositivo text,
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz;

ALTER TABLE IF EXISTS public.autorizaciones_caja
  ALTER COLUMN tenant_id TYPE uuid USING app.to_uuid_or_null(COALESCE(tenant_id::text, '')),
  ALTER COLUMN sesion_caja_id TYPE uuid USING app.to_uuid_or_null(COALESCE(sesion_caja_id::text, '')),
  ALTER COLUMN supervisor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(supervisor_id::text, '')),
  ALTER COLUMN solicitante_id TYPE uuid USING app.to_uuid_or_null(COALESCE(solicitante_id::text, '')),
  ALTER COLUMN tipo_autorizacion TYPE text USING upper(COALESCE(NULLIF(btrim(tipo_autorizacion::text), ''), 'AJUSTE_MANUAL')),
  ALTER COLUMN monto_solicitado TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_solicitado::text),
  ALTER COLUMN monto_min_configurado TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_min_configurado::text),
  ALTER COLUMN monto_max_configurado TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_max_configurado::text),
  ALTER COLUMN razon_autorizacion TYPE text USING NULLIF(btrim(COALESCE(razon_autorizacion, '')), ''),
  ALTER COLUMN firma_digital TYPE text USING NULLIF(btrim(COALESCE(firma_digital, '')), ''),
  ALTER COLUMN ip_address TYPE inet USING app.to_inet_or_null(COALESCE(ip_address::text, '')),
  ALTER COLUMN dispositivo TYPE text USING NULLIF(btrim(COALESCE(dispositivo, '')), ''),
  ALTER COLUMN aprobado_at TYPE timestamptz USING app.to_timestamptz_or_null(COALESCE(aprobado_at::text, '')),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado::text), ''), 'PENDIENTE')),
  ALTER COLUMN metadata TYPE jsonb USING COALESCE(metadata, '{}'::jsonb),
  ALTER COLUMN monto_solicitado SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.autorizaciones_caja a
SET
  tipo_autorizacion = CASE
    WHEN upper(COALESCE(NULLIF(btrim(a.tipo_autorizacion), ''), 'AJUSTE_MANUAL')) IN ('APERTURA_MONTO_BAJO','APERTURA_MONTO_ALTO','CIERRE_DIFERENCIA_ALTA','RETIRO_MONTO_ALTO','AJUSTE_MANUAL')
      THEN upper(COALESCE(NULLIF(btrim(a.tipo_autorizacion), ''), 'AJUSTE_MANUAL'))
    WHEN upper(COALESCE(NULLIF(btrim(a.tipo_autorizacion), ''), 'AJUSTE_MANUAL')) = 'APERTURA_ATIPICA' THEN 'APERTURA_MONTO_ALTO'
    ELSE 'AJUSTE_MANUAL'
  END,
  monto_solicitado = GREATEST(COALESCE(a.monto_solicitado, 0), 0),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'PENDIENTE')) IN ('APROBADO', 'RECHAZADO', 'PENDIENTE')
      THEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'PENDIENTE'))
    ELSE 'PENDIENTE'
  END,
  aprobado_at = CASE WHEN upper(COALESCE(NULLIF(btrim(a.estado), ''), 'PENDIENTE')) = 'APROBADO' THEN COALESCE(a.aprobado_at, a.created_at, now()) ELSE a.aprobado_at END,
  metadata = COALESCE(a.metadata, '{}'::jsonb)
WHERE a.id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_autorizaciones_caja_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.sesion_caja_id := app.to_uuid_or_null(COALESCE(NEW.sesion_caja_id::text, ''));
  NEW.supervisor_id := app.to_uuid_or_null(COALESCE(NEW.supervisor_id::text, ''));
  NEW.solicitante_id := app.to_uuid_or_null(COALESCE(NEW.solicitante_id::text, ''));
  NEW.ip_address := app.to_inet_or_null(COALESCE(NEW.ip_address::text, ''));

  NEW.tipo_autorizacion := CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_autorizacion, '')), ''), 'AJUSTE_MANUAL')) IN ('APERTURA_MONTO_BAJO','APERTURA_MONTO_ALTO','CIERRE_DIFERENCIA_ALTA','RETIRO_MONTO_ALTO','AJUSTE_MANUAL')
      THEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_autorizacion, '')), ''), 'AJUSTE_MANUAL'))
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_autorizacion, '')), ''), 'AJUSTE_MANUAL')) = 'APERTURA_ATIPICA' THEN 'APERTURA_MONTO_ALTO'
    ELSE 'AJUSTE_MANUAL'
  END;

  NEW.monto_solicitado := GREATEST(COALESCE(NEW.monto_solicitado, 0), 0);
  NEW.estado := CASE
    WHEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE')) IN ('APROBADO', 'RECHAZADO', 'PENDIENTE')
      THEN upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'))
    ELSE 'PENDIENTE'
  END;
  IF NEW.estado = 'APROBADO' THEN NEW.aprobado_at := COALESCE(NEW.aprobado_at, NEW.created_at, now()); END IF;

  NEW.razon_autorizacion := NULLIF(btrim(COALESCE(NEW.razon_autorizacion, '')), '');
  NEW.firma_digital := NULLIF(btrim(COALESCE(NEW.firma_digital, '')), '');
  NEW.dispositivo := NULLIF(btrim(COALESCE(NEW.dispositivo, '')), '');
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_autorizaciones_caja_row ON public.autorizaciones_caja;
CREATE TRIGGER trg_normalize_autorizaciones_caja_row
BEFORE INSERT OR UPDATE ON public.autorizaciones_caja
FOR EACH ROW EXECUTE FUNCTION app.normalize_autorizaciones_caja_row();

-- Índices runtime
CREATE INDEX IF NOT EXISTS idx_cajas_tenant_estado_runtime
ON public.cajas (tenant_id, estado)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cajas_tenant_codigo_runtime
ON public.cajas (tenant_id, codigo)
WHERE tenant_id IS NOT NULL AND codigo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_tenant_estado_apertura_runtime
ON public.sesiones_caja (tenant_id, estado, hora_apertura DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_tenant_caja_estado_runtime
ON public.sesiones_caja (tenant_id, caja_id, estado, hora_apertura DESC)
WHERE tenant_id IS NOT NULL AND caja_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_tenant_cajero_estado_runtime
ON public.sesiones_caja (tenant_id, cajero_id, estado, hora_apertura DESC)
WHERE tenant_id IS NOT NULL AND cajero_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_tenant_dispositivo_estado_runtime
ON public.sesiones_caja (tenant_id, dispositivo, estado, hora_apertura DESC)
WHERE tenant_id IS NOT NULL AND dispositivo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_tenant_sesion_secuencia_runtime
ON public.movimientos_caja (tenant_id, sesion_caja_id, secuencia)
WHERE tenant_id IS NOT NULL AND sesion_caja_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_tenant_tipo_timestamp_runtime
ON public.movimientos_caja (tenant_id, tipo_movimiento, "timestamp" DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retiros_caja_tenant_sesion_created_runtime
ON public.retiros_caja (tenant_id, sesion_caja_id, created_at DESC)
WHERE tenant_id IS NOT NULL AND sesion_caja_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retiros_caja_tenant_estado_conciliacion_runtime
ON public.retiros_caja (tenant_id, estado_conciliacion, created_at DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cambios_turno_tenant_sesion_estado_runtime
ON public.cambios_turno (tenant_id, sesion_caja_id, estado, timestamp_inicio DESC)
WHERE tenant_id IS NOT NULL AND sesion_caja_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cortes_caja_tenant_fecha_runtime
ON public.cortes_caja (tenant_id, fecha_corte DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cortes_caja_tenant_caja_fecha_runtime
ON public.cortes_caja (tenant_id, caja_id, fecha_corte DESC)
WHERE tenant_id IS NOT NULL AND caja_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autorizaciones_caja_tenant_created_runtime
ON public.autorizaciones_caja (tenant_id, created_at DESC)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autorizaciones_caja_tenant_supervisor_created_runtime
ON public.autorizaciones_caja (tenant_id, supervisor_id, created_at DESC)
WHERE tenant_id IS NOT NULL AND supervisor_id IS NOT NULL;

COMMIT;
