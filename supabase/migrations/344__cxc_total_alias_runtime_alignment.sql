-- ============================================================================
-- 344__cxc_total_alias_runtime_alignment.sql
-- Alias runtime total <-> monto_total en CxC.
--
-- Motivo:
-- - registrar_cxc_pago_tx (334) y consumidores legacy esperan total en
--   cuentas_por_cobrar, pero el contrato canonico post-rebuild usa monto_total.
-- - En PL/pgSQL un COALESCE(v_cuenta.monto_total, v_cuenta.total) falla si el
--   campo total no existe, aunque monto_total tenga valor.
-- ============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN total SET DEFAULT 0;

UPDATE public.cuentas_por_cobrar
SET total = round(GREATEST(COALESCE(monto_total, total, 0), 0)::numeric, 2),
    updated_at = COALESCE(updated_at, now())
WHERE total IS DISTINCT FROM round(GREATEST(COALESCE(monto_total, total, 0), 0)::numeric, 2);

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

  NEW.monto_total := GREATEST(COALESCE(NEW.monto_total, NEW.total, 0), 0);
  NEW.total := NEW.monto_total;
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_cuentas_por_cobrar_total_alias_consistency'
      AND conrelid = 'public.cuentas_por_cobrar'::regclass
  ) THEN
    ALTER TABLE public.cuentas_por_cobrar
    ADD CONSTRAINT ck_cuentas_por_cobrar_total_alias_consistency
    CHECK (abs(COALESCE(total, 0) - COALESCE(monto_total, 0)) <= 0.01);
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_total_alias_consistency;

COMMIT;
