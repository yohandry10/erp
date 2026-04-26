-- ============================================================================
-- 125__tesoreria_bancaria_runtime_alignment.sql
-- Alineación runtime para tesorería bancaria:
-- cuentas_bancarias, movimientos_bancarios, conciliaciones_bancarias.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas runtime: cuentas bancarias.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cuentas_bancarias
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS numero_cuenta text,
  ADD COLUMN IF NOT EXISTS tipo_cuenta text,
  ADD COLUMN IF NOT EXISTS moneda text,
  ADD COLUMN IF NOT EXISTS saldo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_actual numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_contable numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS permite_sobregiro boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS activa boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE IF EXISTS public.cuentas_bancarias
  ALTER COLUMN numero_cuenta TYPE text USING NULLIF(btrim(numero_cuenta::text), ''),
  ALTER COLUMN activa TYPE boolean USING CASE
    WHEN activa IS NULL THEN true
    WHEN lower(btrim(activa::text)) IN ('t', 'true', '1', 'si', 'yes') THEN true
    WHEN lower(btrim(activa::text)) IN ('f', 'false', '0', 'no') THEN false
    ELSE true
  END,
  ALTER COLUMN saldo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo::text),
  ALTER COLUMN saldo_actual TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_actual::text),
  ALTER COLUMN saldo_contable TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_contable::text),
  ALTER COLUMN tipo_cuenta SET DEFAULT 'CORRIENTE',
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN saldo SET DEFAULT 0,
  ALTER COLUMN saldo_actual SET DEFAULT 0,
  ALTER COLUMN saldo_contable SET DEFAULT 0,
  ALTER COLUMN permite_sobregiro SET DEFAULT false,
  ALTER COLUMN activa SET DEFAULT true,
  ALTER COLUMN activo SET DEFAULT true;

-- ----------------------------------------------------------------------------
-- Columnas runtime: movimientos bancarios.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS proveedor_id uuid,
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS cxp_id uuid,
  ADD COLUMN IF NOT EXISTS cxc_id uuid,
  ADD COLUMN IF NOT EXISTS conciliacion_id uuid,
  ADD COLUMN IF NOT EXISTS conciliado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS es_extracto boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_automatico boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_id uuid,
  ADD COLUMN IF NOT EXISTS movimiento_relacionado_id uuid,
  ADD COLUMN IF NOT EXISTS diferencia_conciliacion numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_anterior numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_nuevo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE IF EXISTS public.movimientos_bancarios
  ALTER COLUMN tipo TYPE text USING NULLIF(upper(btrim(COALESCE(tipo::text, ''))), ''),
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN fecha TYPE date USING CASE
    WHEN fecha IS NULL OR btrim(fecha::text) = '' THEN NULL
    ELSE fecha::date
  END,
  ALTER COLUMN match_automatico TYPE boolean USING CASE
    WHEN match_automatico IS NULL THEN false
    WHEN lower(btrim(match_automatico::text)) IN ('t', 'true', '1', 'si', 'yes') THEN true
    WHEN lower(btrim(match_automatico::text)) IN ('f', 'false', '0', 'no') THEN false
    ELSE false
  END,
  ALTER COLUMN diferencia_conciliacion TYPE numeric(14,2) USING app.to_numeric_or_zero(diferencia_conciliacion::text),
  ALTER COLUMN saldo_anterior TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_anterior::text),
  ALTER COLUMN saldo_nuevo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_nuevo::text),
  ALTER COLUMN monto SET DEFAULT 0,
  ALTER COLUMN conciliado SET DEFAULT false,
  ALTER COLUMN es_extracto SET DEFAULT false,
  ALTER COLUMN match_automatico SET DEFAULT false,
  ALTER COLUMN diferencia_conciliacion SET DEFAULT 0,
  ALTER COLUMN saldo_anterior SET DEFAULT 0,
  ALTER COLUMN saldo_nuevo SET DEFAULT 0;

-- ----------------------------------------------------------------------------
-- Columnas runtime: conciliaciones bancarias.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.conciliaciones_bancarias
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS fecha_desde date,
  ADD COLUMN IF NOT EXISTS fecha_hasta date,
  ADD COLUMN IF NOT EXISTS saldo_libro numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_banco numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diferencia numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ABIERTA',
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS cerrado_at timestamptz,
  ADD COLUMN IF NOT EXISTS cerrado_by uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS numero_cuenta text,
  ADD COLUMN IF NOT EXISTS moneda text;

ALTER TABLE IF EXISTS public.conciliaciones_bancarias
  ALTER COLUMN periodo TYPE text USING NULLIF(btrim(periodo::text), ''),
  ALTER COLUMN fecha_desde TYPE date USING CASE
    WHEN fecha_desde IS NULL OR btrim(fecha_desde::text) = '' THEN NULL
    ELSE fecha_desde::date
  END,
  ALTER COLUMN fecha_hasta TYPE date USING CASE
    WHEN fecha_hasta IS NULL OR btrim(fecha_hasta::text) = '' THEN NULL
    ELSE fecha_hasta::date
  END,
  ALTER COLUMN saldo_libro TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_libro::text),
  ALTER COLUMN saldo_banco TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_banco::text),
  ALTER COLUMN diferencia TYPE numeric(14,2) USING app.to_numeric_or_zero(diferencia::text),
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado::text, ''))), ''),
  ALTER COLUMN cerrado_by TYPE uuid USING app.to_uuid_or_null(COALESCE(cerrado_by::text, '')),
  ALTER COLUMN numero_cuenta TYPE text USING NULLIF(btrim(numero_cuenta::text), ''),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda::text, ''))), ''),
  ALTER COLUMN saldo_libro SET DEFAULT 0,
  ALTER COLUMN saldo_banco SET DEFAULT 0,
  ALTER COLUMN diferencia SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'ABIERTA';

-- ----------------------------------------------------------------------------
-- Normalización cuentas_bancarias.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cuentas_bancarias_tesoreria_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.nombre := NULLIF(btrim(COALESCE(NEW.nombre, '')), '');
  NEW.banco := NULLIF(upper(btrim(COALESCE(NEW.banco, ''))), '');
  NEW.numero_cuenta := NULLIF(btrim(COALESCE(NEW.numero_cuenta, '')), '');
  NEW.tipo_cuenta := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_cuenta, '')), ''), 'CORRIENTE'));
  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));

  IF NEW.tipo_cuenta NOT IN ('CORRIENTE', 'AHORROS', 'DETRACCION', 'PLAZO_FIJO') THEN
    NEW.tipo_cuenta := 'CORRIENTE';
  END IF;

  NEW.saldo := COALESCE(NEW.saldo, NEW.saldo_actual, NEW.saldo_contable, 0);
  NEW.saldo_actual := COALESCE(NEW.saldo_actual, NEW.saldo, 0);
  NEW.saldo_contable := COALESCE(NEW.saldo_contable, NEW.saldo_actual, NEW.saldo, 0);
  NEW.permite_sobregiro := COALESCE(NEW.permite_sobregiro, false);

  IF NOT NEW.permite_sobregiro THEN
    NEW.saldo := GREATEST(NEW.saldo, 0);
    NEW.saldo_actual := GREATEST(NEW.saldo_actual, 0);
    NEW.saldo_contable := GREATEST(NEW.saldo_contable, 0);
  END IF;

  NEW.activa := COALESCE(
    NEW.activa,
    CASE WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false ELSE true END
  );
  NEW.activo := COALESCE(NEW.activo, NEW.activa, true);
  NEW.activa := COALESCE(NEW.activa, NEW.activo, true);
  NEW.activo := NEW.activa;
  NEW.estado := CASE WHEN NEW.activa THEN 'ACTIVO' ELSE 'INACTIVO' END;

  NEW.codigo := COALESCE(
    NULLIF(upper(btrim(COALESCE(NEW.codigo, ''))), ''),
    'CB-' || upper(left(replace(COALESCE(NEW.id::text, gen_random_uuid()::text), '-', ''), 10))
  );

  NEW.nombre := COALESCE(NEW.nombre, NEW.codigo);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  NEW.created_by := app.to_uuid_or_null(COALESCE(NEW.created_by::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, NEW.created_by::text, ''));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cuentas_bancarias_tesoreria_row ON public.cuentas_bancarias;
CREATE TRIGGER trg_normalize_cuentas_bancarias_tesoreria_row
BEFORE INSERT OR UPDATE ON public.cuentas_bancarias
FOR EACH ROW
EXECUTE FUNCTION app.normalize_cuentas_bancarias_tesoreria_row();

-- ----------------------------------------------------------------------------
-- Normalización movimientos_bancarios.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_movimientos_bancarios_tesoreria_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
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
  NEW.fecha := COALESCE(NEW.fecha, current_date);
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
$$;

DROP TRIGGER IF EXISTS trg_normalize_movimientos_bancarios_tesoreria_row ON public.movimientos_bancarios;
CREATE TRIGGER trg_normalize_movimientos_bancarios_tesoreria_row
BEFORE INSERT OR UPDATE ON public.movimientos_bancarios
FOR EACH ROW
EXECUTE FUNCTION app.normalize_movimientos_bancarios_tesoreria_row();

-- ----------------------------------------------------------------------------
-- Normalización conciliaciones_bancarias.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_conciliaciones_bancarias_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_banco text;
  v_numero_cuenta text;
  v_moneda text;
BEGIN
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.created_by := app.to_uuid_or_null(COALESCE(NEW.created_by::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, NEW.created_by::text, ''));
  NEW.cerrado_by := app.to_uuid_or_null(COALESCE(NEW.cerrado_by::text, ''));

  NEW.fecha_desde := COALESCE(NEW.fecha_desde, current_date);
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
$$;

DROP TRIGGER IF EXISTS trg_normalize_conciliaciones_bancarias_row ON public.conciliaciones_bancarias;
CREATE TRIGGER trg_normalize_conciliaciones_bancarias_row
BEFORE INSERT OR UPDATE ON public.conciliaciones_bancarias
FOR EACH ROW
EXECUTE FUNCTION app.normalize_conciliaciones_bancarias_row();

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.cuentas_bancarias
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.movimientos_bancarios
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.conciliaciones_bancarias
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Índices runtime.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_tenant_activa_moneda_runtime
ON public.cuentas_bancarias (tenant_id, activa, moneda);

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_tenant_banco_numero_runtime
ON public.cuentas_bancarias (tenant_id, banco, numero_cuenta);

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant_cuenta_fecha_runtime
ON public.movimientos_bancarios (tenant_id, cuenta_bancaria_id, fecha DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant_tipo_fecha_runtime
ON public.movimientos_bancarios (tenant_id, tipo, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant_conciliado_extracto_fecha_runtime
ON public.movimientos_bancarios (tenant_id, conciliado, es_extracto, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant_cxp_fecha_runtime
ON public.movimientos_bancarios (tenant_id, cxp_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant_cxc_fecha_runtime
ON public.movimientos_bancarios (tenant_id, cxc_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant_conciliacion_extracto_runtime
ON public.movimientos_bancarios (tenant_id, conciliacion_id, es_extracto, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_bancarias_tenant_estado_created_runtime
ON public.conciliaciones_bancarias (tenant_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_bancarias_tenant_cuenta_periodo_runtime
ON public.conciliaciones_bancarias (tenant_id, cuenta_bancaria_id, periodo);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_bancarias_tenant_rango_fechas_runtime
ON public.conciliaciones_bancarias (tenant_id, fecha_desde, fecha_hasta);

COMMIT;
