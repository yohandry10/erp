-- ============================================================================
-- 131__cxc_cxp_runtime_alignment.sql
-- Alineación runtime para cuentas por cobrar y cuentas por pagar.
-- Tablas: cuentas_por_cobrar, cuentas_por_pagar.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas runtime: cuentas_por_cobrar.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS numero_documento text,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS fecha_emision date,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS monto_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_original numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_pendiente numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_pendiente numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_mora integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percepcion_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detraccion_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anticipo_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS event_source text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  ALTER COLUMN cliente_id TYPE uuid USING app.to_uuid_or_null(COALESCE(cliente_id::text, '')),
  ALTER COLUMN pedido_id TYPE uuid USING app.to_uuid_or_null(COALESCE(pedido_id::text, '')),
  ALTER COLUMN documento_id TYPE uuid USING app.to_uuid_or_null(COALESCE(documento_id::text, '')),
  ALTER COLUMN event_id TYPE uuid USING app.to_uuid_or_null(COALESCE(event_id::text, '')),
  ALTER COLUMN serie TYPE text USING NULLIF(upper(btrim(COALESCE(serie, ''))), ''),
  ALTER COLUMN numero TYPE text USING NULLIF(btrim(COALESCE(numero::text, '')), ''),
  ALTER COLUMN numero_documento TYPE text USING NULLIF(upper(btrim(COALESCE(numero_documento::text, ''))), ''),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_documento, ''))), ''),
  ALTER COLUMN fecha_emision TYPE date USING CASE
    WHEN fecha_emision IS NULL OR btrim(fecha_emision::text) = '' THEN NULL
    ELSE fecha_emision::date
  END,
  ALTER COLUMN fecha_vencimiento TYPE date USING CASE
    WHEN fecha_vencimiento IS NULL OR btrim(fecha_vencimiento::text) = '' THEN NULL
    ELSE fecha_vencimiento::date
  END,
  ALTER COLUMN fecha_pago TYPE date USING CASE
    WHEN fecha_pago IS NULL OR btrim(fecha_pago::text) = '' THEN NULL
    ELSE fecha_pago::date
  END,
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN monto_total TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_total::text),
  ALTER COLUMN monto_original TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_original::text),
  ALTER COLUMN monto_pendiente TYPE numeric(14,2) USING app.to_numeric_or_zero(monto_pendiente::text),
  ALTER COLUMN saldo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo::text),
  ALTER COLUMN saldo_pendiente TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_pendiente::text),
  ALTER COLUMN dias_mora TYPE integer USING app.to_int_or_zero(dias_mora::text),
  ALTER COLUMN retencion_total TYPE numeric(14,2) USING app.to_numeric_or_zero(retencion_total::text),
  ALTER COLUMN percepcion_total TYPE numeric(14,2) USING app.to_numeric_or_zero(percepcion_total::text),
  ALTER COLUMN detraccion_total TYPE numeric(14,2) USING app.to_numeric_or_zero(detraccion_total::text),
  ALTER COLUMN anticipo_total TYPE numeric(14,2) USING app.to_numeric_or_zero(anticipo_total::text),
  ALTER COLUMN idempotency_key TYPE text USING NULLIF(lower(btrim(COALESCE(idempotency_key, ''))), ''),
  ALTER COLUMN event_source TYPE text USING NULLIF(lower(btrim(COALESCE(event_source, ''))), ''),
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado, ''))), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN monto_total SET DEFAULT 0,
  ALTER COLUMN monto_original SET DEFAULT 0,
  ALTER COLUMN monto_pendiente SET DEFAULT 0,
  ALTER COLUMN saldo SET DEFAULT 0,
  ALTER COLUMN saldo_pendiente SET DEFAULT 0,
  ALTER COLUMN dias_mora SET DEFAULT 0,
  ALTER COLUMN retencion_total SET DEFAULT 0,
  ALTER COLUMN percepcion_total SET DEFAULT 0,
  ALTER COLUMN detraccion_total SET DEFAULT 0,
  ALTER COLUMN anticipo_total SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN activo SET DEFAULT true;

-- ----------------------------------------------------------------------------
-- Columnas runtime: cuentas_por_pagar.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS proveedor_id uuid,
  ADD COLUMN IF NOT EXISTS orden_id uuid,
  ADD COLUMN IF NOT EXISTS recepcion_id uuid,
  ADD COLUMN IF NOT EXISTS referencia_tipo text,
  ADD COLUMN IF NOT EXISTS referencia_id uuid,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS numero_documento text,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS fecha_emision date,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS condiciones_pago text,
  ADD COLUMN IF NOT EXISTS dias_credito integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_pendiente numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS ultimo_pago date,
  ADD COLUMN IF NOT EXISTS estado_comparacion text DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS discrepancias jsonb,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_by text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE IF EXISTS public.cuentas_por_pagar
  ALTER COLUMN proveedor_id TYPE uuid USING app.to_uuid_or_null(COALESCE(proveedor_id::text, '')),
  ALTER COLUMN orden_id TYPE uuid USING app.to_uuid_or_null(COALESCE(orden_id::text, '')),
  ALTER COLUMN recepcion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(recepcion_id::text, '')),
  ALTER COLUMN referencia_id TYPE uuid USING app.to_uuid_or_null(COALESCE(referencia_id::text, '')),
  ALTER COLUMN event_id TYPE uuid USING app.to_uuid_or_null(COALESCE(event_id::text, '')),
  ALTER COLUMN created_by TYPE uuid USING app.to_uuid_or_null(COALESCE(created_by::text, '')),
  ALTER COLUMN updated_by TYPE uuid USING app.to_uuid_or_null(COALESCE(updated_by::text, '')),
  ALTER COLUMN numero TYPE text USING NULLIF(upper(btrim(COALESCE(numero::text, ''))), ''),
  ALTER COLUMN numero_documento TYPE text USING NULLIF(upper(btrim(COALESCE(numero_documento::text, ''))), ''),
  ALTER COLUMN tipo_documento TYPE text USING NULLIF(upper(btrim(COALESCE(tipo_documento, ''))), ''),
  ALTER COLUMN referencia_tipo TYPE text USING NULLIF(upper(btrim(COALESCE(referencia_tipo, ''))), ''),
  ALTER COLUMN fecha_emision TYPE date USING CASE
    WHEN fecha_emision IS NULL OR btrim(fecha_emision::text) = '' THEN NULL
    ELSE fecha_emision::date
  END,
  ALTER COLUMN fecha_vencimiento TYPE date USING CASE
    WHEN fecha_vencimiento IS NULL OR btrim(fecha_vencimiento::text) = '' THEN NULL
    ELSE fecha_vencimiento::date
  END,
  ALTER COLUMN ultimo_pago TYPE date USING CASE
    WHEN ultimo_pago IS NULL OR btrim(ultimo_pago::text) = '' THEN NULL
    ELSE ultimo_pago::date
  END,
  ALTER COLUMN anulado_at TYPE timestamptz USING CASE
    WHEN anulado_at IS NULL OR btrim(anulado_at::text) = '' THEN NULL
    ELSE anulado_at::timestamptz
  END,
  ALTER COLUMN condiciones_pago TYPE text USING NULLIF(upper(btrim(COALESCE(condiciones_pago, ''))), ''),
  ALTER COLUMN dias_credito TYPE integer USING app.to_int_or_zero(dias_credito::text),
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN saldo TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo::text),
  ALTER COLUMN saldo_pendiente TYPE numeric(14,2) USING app.to_numeric_or_zero(saldo_pendiente::text),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado, ''))), ''),
  ALTER COLUMN estado_comparacion TYPE text USING NULLIF(upper(btrim(COALESCE(estado_comparacion, ''))), ''),
  ALTER COLUMN idempotency_key TYPE text USING NULLIF(lower(btrim(COALESCE(idempotency_key, ''))), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN dias_credito SET DEFAULT 0,
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN igv SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN saldo SET DEFAULT 0,
  ALTER COLUMN saldo_pendiente SET DEFAULT 0,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN estado_comparacion SET DEFAULT 'PENDIENTE',
  ALTER COLUMN discrepancias SET DEFAULT '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- Normalización runtime: cuentas_por_cobrar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cuentas_por_cobrar_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  NEW.serie := upper(NULLIF(btrim(COALESCE(NEW.serie, '')), ''));
  NEW.numero := NULLIF(btrim(COALESCE(NEW.numero::text, '')), '');
  NEW.tipo_documento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), 'FACTURA'));
  NEW.numero_documento := upper(NULLIF(btrim(COALESCE(NEW.numero_documento, '')), ''));
  IF NEW.numero_documento IS NULL AND NEW.serie IS NOT NULL AND NEW.numero IS NOT NULL THEN
    NEW.numero_documento := format('%s-%s', NEW.serie, NEW.numero);
  END IF;

  NEW.fecha_emision := COALESCE(NEW.fecha_emision, current_date);
  NEW.fecha_vencimiento := COALESCE(NEW.fecha_vencimiento, NEW.fecha_emision);
  NEW.fecha_pago := CASE
    WHEN NEW.fecha_pago IS NULL THEN NULL
    ELSE NEW.fecha_pago::date
  END;

  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));

  NEW.monto_total := GREATEST(COALESCE(NEW.monto_total, 0), 0);
  NEW.monto_original := GREATEST(COALESCE(NEW.monto_original, NEW.monto_total, 0), 0);
  NEW.monto_pendiente := GREATEST(COALESCE(NEW.monto_pendiente, NEW.saldo_pendiente, NEW.saldo, NEW.monto_total), 0);
  NEW.saldo := NEW.monto_pendiente;
  NEW.saldo_pendiente := NEW.monto_pendiente;

  NEW.retencion_total := GREATEST(COALESCE(NEW.retencion_total, 0), 0);
  NEW.percepcion_total := GREATEST(COALESCE(NEW.percepcion_total, 0), 0);
  NEW.detraccion_total := GREATEST(COALESCE(NEW.detraccion_total, 0), 0);
  NEW.anticipo_total := GREATEST(COALESCE(NEW.anticipo_total, 0), 0);

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF v_estado IN ('ACTIVO', 'EMITIDO') THEN
    v_estado := 'PENDIENTE';
  ELSIF v_estado = 'COBRADA' THEN
    v_estado := 'CANCELADO';
  ELSIF v_estado = 'VENCIDO' THEN
    v_estado := 'VENCIDA';
  END IF;

  IF v_estado NOT IN ('PENDIENTE', 'PARCIAL', 'CANCELADO', 'VENCIDA', 'ANULADA', 'REVERTIDA') THEN
    v_estado := 'PENDIENTE';
  END IF;

  IF v_estado IN ('ANULADA', 'REVERTIDA') THEN
    NEW.monto_pendiente := 0;
    NEW.saldo := 0;
    NEW.saldo_pendiente := 0;
  ELSIF NEW.monto_pendiente <= 0 THEN
    v_estado := 'CANCELADO';
    NEW.monto_pendiente := 0;
    NEW.saldo := 0;
    NEW.saldo_pendiente := 0;
  ELSIF NEW.fecha_vencimiento IS NOT NULL AND NEW.fecha_vencimiento < current_date THEN
    v_estado := 'VENCIDA';
  ELSIF NEW.monto_pendiente < GREATEST(NEW.monto_total, NEW.monto_original) THEN
    v_estado := 'PARCIAL';
  ELSE
    v_estado := 'PENDIENTE';
  END IF;

  NEW.estado := v_estado;
  NEW.dias_mora := CASE
    WHEN NEW.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
         AND NEW.fecha_vencimiento IS NOT NULL
         AND NEW.fecha_vencimiento < current_date
      THEN GREATEST(current_date - NEW.fecha_vencimiento, 0)
    ELSE 0
  END;
  NEW.activo := COALESCE(NEW.activo, NEW.estado NOT IN ('ANULADA', 'REVERTIDA', 'CANCELADO'));

  NEW.event_source := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.event_source, '')), ''), 'finanzas.cxc'));
  NEW.idempotency_key := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.idempotency_key, ''))), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('cxc.event:%s', NEW.event_id::text)
      WHEN NEW.documento_id IS NOT NULL THEN format(
        'cxc.doc:%s:%s',
        COALESCE(NEW.tenant_id::text, 'no-tenant'),
        NEW.documento_id::text
      )
      ELSE format(
        'cxc.row:%s:%s',
        COALESCE(NEW.tenant_id::text, 'no-tenant'),
        replace(gen_random_uuid()::text, '-', '')
      )
    END
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cuentas_por_cobrar_row ON public.cuentas_por_cobrar;
CREATE TRIGGER trg_normalize_cuentas_por_cobrar_row
BEFORE INSERT OR UPDATE ON public.cuentas_por_cobrar
FOR EACH ROW
EXECUTE FUNCTION app.normalize_cuentas_por_cobrar_row();

-- ----------------------------------------------------------------------------
-- Normalización runtime: cuentas_por_pagar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_cuentas_por_pagar_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.orden_id := app.to_uuid_or_null(COALESCE(NEW.orden_id::text, ''));
  NEW.recepcion_id := app.to_uuid_or_null(COALESCE(NEW.recepcion_id::text, ''));
  NEW.referencia_id := app.to_uuid_or_null(COALESCE(NEW.referencia_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));
  NEW.created_by := app.to_uuid_or_null(COALESCE(NEW.created_by::text, ''));
  NEW.updated_by := app.to_uuid_or_null(COALESCE(NEW.updated_by::text, ''));

  NEW.numero := upper(NULLIF(btrim(COALESCE(NEW.numero::text, '')), ''));
  NEW.numero_documento := upper(NULLIF(btrim(COALESCE(NEW.numero_documento::text, '')), ''));
  NEW.tipo_documento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), 'FACTURA'));
  NEW.referencia_tipo := upper(NULLIF(btrim(COALESCE(NEW.referencia_tipo, '')), ''));
  NEW.condiciones_pago := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.condiciones_pago, '')), ''), 'CONTADO'));

  NEW.fecha_emision := COALESCE(NEW.fecha_emision, current_date);
  NEW.fecha_vencimiento := COALESCE(NEW.fecha_vencimiento, NEW.fecha_emision);
  NEW.ultimo_pago := CASE
    WHEN NEW.ultimo_pago IS NULL THEN NULL
    ELSE NEW.ultimo_pago::date
  END;
  NEW.anulado_at := CASE
    WHEN NEW.anulado_at IS NULL THEN NULL
    ELSE NEW.anulado_at::timestamptz
  END;

  NEW.moneda := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.moneda, '')), ''), 'PEN'));
  NEW.dias_credito := GREATEST(COALESCE(NEW.dias_credito, 0), 0);
  NEW.subtotal := GREATEST(COALESCE(NEW.subtotal, 0), 0);
  NEW.igv := GREATEST(COALESCE(NEW.igv, 0), 0);
  NEW.total := GREATEST(COALESCE(NEW.total, NEW.subtotal + NEW.igv, 0), 0);

  NEW.saldo := GREATEST(COALESCE(NEW.saldo, NEW.saldo_pendiente, NEW.total), 0);
  IF NEW.total > 0 THEN
    NEW.saldo := LEAST(NEW.saldo, NEW.total);
  END IF;
  NEW.saldo_pendiente := NEW.saldo;

  IF NEW.recepcion_id IS NOT NULL AND NEW.referencia_id IS NULL THEN
    NEW.referencia_id := NEW.recepcion_id;
  END IF;
  IF NEW.referencia_id IS NOT NULL AND NEW.referencia_tipo IS NULL THEN
    NEW.referencia_tipo := 'REFERENCIA';
  END IF;
  IF NEW.referencia_tipo = 'RECEPCION' AND NEW.recepcion_id IS NULL AND NEW.referencia_id IS NOT NULL THEN
    NEW.recepcion_id := NEW.referencia_id;
  END IF;
  IF NEW.recepcion_id IS NOT NULL AND (NEW.referencia_tipo IS NULL OR NEW.referencia_tipo = 'REFERENCIA') THEN
    NEW.referencia_tipo := 'RECEPCION';
    NEW.referencia_id := NEW.recepcion_id;
  END IF;

  NEW.discrepancias := COALESCE(NEW.discrepancias, '[]'::jsonb);
  IF jsonb_typeof(NEW.discrepancias) <> 'array' THEN
    NEW.discrepancias := '[]'::jsonb;
  END IF;

  NEW.estado_comparacion := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado_comparacion, '')), ''), 'PENDIENTE'));
  IF NEW.estado_comparacion NOT IN ('PENDIENTE', 'OK', 'DESVIACION_CANTIDAD', 'DESVIACION_PRECIO') THEN
    NEW.estado_comparacion := 'PENDIENTE';
  END IF;

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF v_estado IN ('ACTIVO', 'ABIERTA') THEN
    v_estado := 'PENDIENTE';
  ELSIF v_estado = 'VENCIDO' THEN
    v_estado := 'VENCIDA';
  ELSIF v_estado = 'COBRADA' THEN
    v_estado := 'PAGADA';
  ELSIF v_estado = 'CANCELADA' THEN
    v_estado := 'ANULADA';
  END IF;

  IF v_estado NOT IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA') THEN
    v_estado := 'PENDIENTE';
  END IF;

  IF v_estado = 'ANULADA' OR NEW.anulado_at IS NOT NULL THEN
    v_estado := 'ANULADA';
  ELSIF NEW.saldo <= 0 THEN
    v_estado := 'PAGADA';
    NEW.saldo := 0;
    NEW.saldo_pendiente := 0;
  ELSIF NEW.fecha_vencimiento < current_date THEN
    v_estado := 'VENCIDA';
  ELSIF NEW.saldo < NEW.total THEN
    v_estado := 'PARCIAL';
  ELSE
    v_estado := 'PENDIENTE';
  END IF;

  NEW.estado := v_estado;

  NEW.idempotency_key := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.idempotency_key, ''))), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('cxp.event:%s', NEW.event_id::text)
      WHEN NEW.referencia_id IS NOT NULL THEN format(
        'cxp.ref:%s:%s:%s',
        COALESCE(NEW.tenant_id::text, 'no-tenant'),
        COALESCE(lower(NEW.referencia_tipo), 'ref'),
        NEW.referencia_id::text
      )
      WHEN NEW.proveedor_id IS NOT NULL AND NEW.numero_documento IS NOT NULL THEN format(
        'cxp.doc:%s:%s:%s',
        COALESCE(NEW.tenant_id::text, 'no-tenant'),
        NEW.proveedor_id::text,
        lower(NEW.numero_documento)
      )
      ELSE format(
        'cxp.row:%s:%s',
        COALESCE(NEW.tenant_id::text, 'no-tenant'),
        replace(gen_random_uuid()::text, '-', '')
      )
    END
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cuentas_por_pagar_row ON public.cuentas_por_pagar;
CREATE TRIGGER trg_normalize_cuentas_por_pagar_row
BEFORE INSERT OR UPDATE ON public.cuentas_por_pagar
FOR EACH ROW
EXECUTE FUNCTION app.normalize_cuentas_por_pagar_row();

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.cuentas_por_cobrar
SET updated_at = COALESCE(updated_at, now())
WHERE true;

UPDATE public.cuentas_por_pagar
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Índices runtime (no únicos en esta fase).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_tenant_estado_vencimiento_runtime
ON public.cuentas_por_cobrar (tenant_id, estado, fecha_vencimiento, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_tenant_cliente_vencimiento_runtime
ON public.cuentas_por_cobrar (tenant_id, cliente_id, fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_tenant_documento_runtime
ON public.cuentas_por_cobrar (tenant_id, documento_id, created_at DESC)
WHERE documento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_tenant_numero_doc_runtime
ON public.cuentas_por_cobrar (tenant_id, upper(numero_documento), created_at DESC)
WHERE numero_documento IS NOT NULL
  AND btrim(numero_documento) <> '';

CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_tenant_estado_vencimiento_runtime
ON public.cuentas_por_pagar (tenant_id, estado, fecha_vencimiento, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_tenant_proveedor_vencimiento_runtime
ON public.cuentas_por_pagar (tenant_id, proveedor_id, fecha_vencimiento, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_tenant_referencia_runtime
ON public.cuentas_por_pagar (tenant_id, referencia_tipo, referencia_id, created_at DESC)
WHERE referencia_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_tenant_recepcion_runtime
ON public.cuentas_por_pagar (tenant_id, recepcion_id, created_at DESC)
WHERE recepcion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_tenant_numero_doc_runtime
ON public.cuentas_por_pagar (tenant_id, proveedor_id, upper(numero_documento), created_at DESC)
WHERE numero_documento IS NOT NULL
  AND btrim(numero_documento) <> '';

COMMIT;
