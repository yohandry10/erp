-- ============================================================================
-- 128__cxc_pagos_lotes_runtime_alignment.sql
-- Alineación runtime para cobros CxC y pagos por lote.
-- Tablas: cxc_pagos, pagos_lote.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas runtime: cxc_pagos.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cxc_pagos
  ADD COLUMN IF NOT EXISTS cuenta_id uuid,
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'PAGO',
  ADD COLUMN IF NOT EXISTS aplica_retencion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS retencion_monto numeric(14,2),
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS retencionmonto numeric(14,2),
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.cxc_pagos
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN fecha_pago TYPE date USING CASE
    WHEN fecha_pago IS NULL OR btrim(fecha_pago::text) = '' THEN NULL
    ELSE fecha_pago::date
  END,
  ALTER COLUMN aplica_retencion TYPE boolean USING CASE
    WHEN aplica_retencion IS NULL THEN false
    WHEN lower(btrim(aplica_retencion::text)) IN ('t', 'true', '1', 'si', 'yes') THEN true
    WHEN lower(btrim(aplica_retencion::text)) IN ('f', 'false', '0', 'no') THEN false
    ELSE false
  END,
  ALTER COLUMN retencion_monto TYPE numeric(14,2) USING app.to_numeric_or_zero(retencion_monto::text),
  ALTER COLUMN retencionmonto TYPE numeric(14,2) USING app.to_numeric_or_zero(retencionmonto::text),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN metodo_pago TYPE text USING NULLIF(upper(btrim(COALESCE(metodo_pago, ''))), ''),
  ALTER COLUMN tipo TYPE text USING NULLIF(upper(btrim(COALESCE(tipo, ''))), ''),
  ALTER COLUMN referencia TYPE text USING NULLIF(btrim(COALESCE(referencia, '')), ''),
  ALTER COLUMN idempotency_key TYPE text USING NULLIF(btrim(COALESCE(idempotency_key, '')), ''),
  ALTER COLUMN source TYPE text USING NULLIF(lower(btrim(COALESCE(source, ''))), ''),
  ALTER COLUMN monto SET DEFAULT 0,
  ALTER COLUMN aplica_retencion SET DEFAULT false,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN tipo SET DEFAULT 'PAGO';

-- ----------------------------------------------------------------------------
-- Columnas runtime: pagos_lote.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pagos_lote
  ADD COLUMN IF NOT EXISTS referencia_lote text,
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS monto_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pagos jsonb,
  ADD COLUMN IF NOT EXISTS resultado jsonb,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.pagos_lote
  ALTER COLUMN referencia_lote TYPE text USING NULLIF(upper(btrim(COALESCE(referencia_lote, ''))), ''),
  ALTER COLUMN fecha_pago TYPE date USING CASE
    WHEN fecha_pago IS NULL OR btrim(fecha_pago::text) = '' THEN NULL
    ELSE fecha_pago::date
  END,
  ALTER COLUMN metodo_pago TYPE text USING NULLIF(upper(btrim(COALESCE(metodo_pago, ''))), ''),
  ALTER COLUMN monto_total TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_total::text),
  ALTER COLUMN monto_total SET DEFAULT 0,
  ALTER COLUMN pagos SET DEFAULT '[]'::jsonb,
  ALTER COLUMN resultado SET DEFAULT '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- Normalización: cxc_pagos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cxc_pagos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
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

  NEW.fecha_pago := COALESCE(NEW.fecha_pago, current_date);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cxc_pagos_row ON public.cxc_pagos;
CREATE TRIGGER trg_normalize_cxc_pagos_row
BEFORE INSERT OR UPDATE ON public.cxc_pagos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_cxc_pagos_row();

-- ----------------------------------------------------------------------------
-- Normalización: pagos_lote.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_pagos_lote_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
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
  NEW.fecha_pago := COALESCE(NEW.fecha_pago, current_date);
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
$$;

DROP TRIGGER IF EXISTS trg_normalize_pagos_lote_row ON public.pagos_lote;
CREATE TRIGGER trg_normalize_pagos_lote_row
BEFORE INSERT OR UPDATE ON public.pagos_lote
FOR EACH ROW
EXECUTE FUNCTION app.normalize_pagos_lote_row();

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.cxc_pagos
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.pagos_lote
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Índices runtime.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cxc_pagos_tenant_tipo_fecha_runtime
ON public.cxc_pagos (tenant_id, tipo, fecha_pago DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cxc_pagos_tenant_referencia_runtime
ON public.cxc_pagos (tenant_id, referencia, created_at DESC)
WHERE referencia IS NOT NULL
  AND btrim(referencia) <> '';

CREATE INDEX IF NOT EXISTS idx_cxc_pagos_tenant_cuenta_bancaria_fecha_runtime
ON public.cxc_pagos (tenant_id, cuenta_bancaria_id, fecha_pago DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cxc_pagos_tenant_event_id
ON public.cxc_pagos (tenant_id, event_id)
WHERE tenant_id IS NOT NULL
  AND event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_lote_tenant_fecha_estado_runtime
ON public.pagos_lote (tenant_id, fecha_pago DESC, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pagos_lote_tenant_cuenta_fecha_runtime
ON public.pagos_lote (tenant_id, cuenta_bancaria_id, fecha_pago DESC);

COMMIT;
