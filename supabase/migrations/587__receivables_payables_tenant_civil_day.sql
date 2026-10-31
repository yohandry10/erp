-- La fecha de deuda es la del contribuyente. No modifica filas ni recibos
-- existentes, importes, outbox, RLS o permisos. Se conserva toda la lógica
-- financiera original de344/465; cambia únicamente current_date por hoy_tenant.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30s';

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

  NEW.fecha_emision := COALESCE(NEW.fecha_emision, app.hoy_tenant(NEW.tenant_id));
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
  ELSIF NEW.fecha_vencimiento IS NOT NULL AND NEW.fecha_vencimiento < app.hoy_tenant(NEW.tenant_id) THEN
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
         AND NEW.fecha_vencimiento < app.hoy_tenant(NEW.tenant_id)
      THEN GREATEST(app.hoy_tenant(NEW.tenant_id) - NEW.fecha_vencimiento, 0)
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

CREATE OR REPLACE FUNCTION app.normalize_cuentas_por_pagar_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_estado text;
  v_obligacion numeric(14,2);
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(coalesce(NEW.tenant_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(coalesce(NEW.proveedor_id::text, ''));
  NEW.orden_id := app.to_uuid_or_null(coalesce(NEW.orden_id::text, ''));
  NEW.recepcion_id := app.to_uuid_or_null(coalesce(NEW.recepcion_id::text, ''));
  NEW.referencia_id := app.to_uuid_or_null(coalesce(NEW.referencia_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(coalesce(NEW.event_id::text, ''));
  NEW.created_by := app.to_uuid_or_null(coalesce(NEW.created_by::text, ''));
  NEW.updated_by := app.to_uuid_or_null(coalesce(NEW.updated_by::text, ''));

  NEW.numero := upper(nullif(btrim(coalesce(NEW.numero::text, '')), ''));
  NEW.numero_documento := upper(nullif(btrim(coalesce(NEW.numero_documento::text, '')), ''));
  NEW.tipo_documento := upper(coalesce(nullif(btrim(coalesce(NEW.tipo_documento, '')), ''), 'FACTURA'));
  NEW.referencia_tipo := upper(nullif(btrim(coalesce(NEW.referencia_tipo, '')), ''));
  NEW.condiciones_pago := upper(coalesce(nullif(btrim(coalesce(NEW.condiciones_pago, '')), ''), 'CONTADO'));
  NEW.fecha_emision := coalesce(NEW.fecha_emision, app.hoy_tenant(NEW.tenant_id));
  NEW.fecha_vencimiento := coalesce(NEW.fecha_vencimiento, NEW.fecha_emision);
  NEW.ultimo_pago := CASE WHEN NEW.ultimo_pago IS NULL THEN NULL ELSE NEW.ultimo_pago::date END;
  NEW.anulado_at := CASE WHEN NEW.anulado_at IS NULL THEN NULL ELSE NEW.anulado_at::timestamptz END;
  NEW.moneda := upper(coalesce(nullif(btrim(coalesce(NEW.moneda, '')), ''), 'PEN'));
  NEW.dias_credito := greatest(coalesce(NEW.dias_credito, 0), 0);
  NEW.subtotal := greatest(coalesce(NEW.subtotal, 0), 0);
  NEW.igv := greatest(coalesce(NEW.igv, 0), 0);
  NEW.total := greatest(coalesce(NEW.total, NEW.subtotal + NEW.igv, 0), 0);
  NEW.retencion_total := greatest(coalesce(NEW.retencion_total, 0), 0);
  NEW.percepcion_total := greatest(coalesce(NEW.percepcion_total, 0), 0);
  NEW.detraccion_total := greatest(coalesce(NEW.detraccion_total, 0), 0);
  NEW.anticipo_total := greatest(coalesce(NEW.anticipo_total, 0), 0);
  v_obligacion := greatest(round(NEW.total + NEW.percepcion_total
    - NEW.retencion_total - NEW.detraccion_total - NEW.anticipo_total, 2), 0);
  NEW.saldo := greatest(coalesce(NEW.saldo, NEW.saldo_pendiente, v_obligacion), 0);
  NEW.saldo := least(NEW.saldo, v_obligacion);
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

  NEW.discrepancias := coalesce(NEW.discrepancias, '[]'::jsonb);
  IF jsonb_typeof(NEW.discrepancias) <> 'array' THEN NEW.discrepancias := '[]'::jsonb; END IF;
  NEW.estado_comparacion := upper(coalesce(nullif(btrim(coalesce(NEW.estado_comparacion, '')), ''), 'PENDIENTE'));
  IF NEW.estado_comparacion NOT IN ('PENDIENTE', 'OK', 'DESVIACION_CANTIDAD', 'DESVIACION_PRECIO') THEN
    NEW.estado_comparacion := 'PENDIENTE';
  END IF;

  v_estado := upper(coalesce(nullif(btrim(coalesce(NEW.estado, '')), ''), 'PENDIENTE'));
  IF v_estado IN ('ACTIVO', 'ABIERTA') THEN v_estado := 'PENDIENTE';
  ELSIF v_estado = 'VENCIDO' THEN v_estado := 'VENCIDA';
  ELSIF v_estado = 'COBRADA' THEN v_estado := 'PAGADA';
  ELSIF v_estado = 'CANCELADA' THEN v_estado := 'ANULADA'; END IF;
  IF v_estado NOT IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA') THEN
    v_estado := 'PENDIENTE';
  END IF;
  IF v_estado = 'ANULADA' OR NEW.anulado_at IS NOT NULL THEN v_estado := 'ANULADA';
  ELSIF NEW.saldo <= 0 THEN
    v_estado := 'PAGADA'; NEW.saldo := 0; NEW.saldo_pendiente := 0;
  ELSIF NEW.fecha_vencimiento < app.hoy_tenant(NEW.tenant_id) THEN v_estado := 'VENCIDA';
  ELSIF NEW.saldo < v_obligacion THEN v_estado := 'PARCIAL';
  ELSE v_estado := 'PENDIENTE'; END IF;
  NEW.estado := v_estado;

  NEW.idempotency_key := coalesce(
    nullif(lower(btrim(coalesce(NEW.idempotency_key, ''))), ''),
    CASE
      WHEN NEW.event_id IS NOT NULL THEN format('cxp.event:%s', NEW.event_id)
      WHEN NEW.referencia_id IS NOT NULL THEN format('cxp.ref:%s:%s:%s',
        coalesce(NEW.tenant_id::text, 'no-tenant'), coalesce(lower(NEW.referencia_tipo), 'ref'), NEW.referencia_id)
      WHEN NEW.proveedor_id IS NOT NULL AND NEW.numero_documento IS NOT NULL THEN format('cxp.doc:%s:%s:%s',
        coalesce(NEW.tenant_id::text, 'no-tenant'), NEW.proveedor_id, lower(NEW.numero_documento))
      ELSE format('cxp.row:%s:%s', coalesce(NEW.tenant_id::text, 'no-tenant'), replace(gen_random_uuid()::text, '-', ''))
    END
  );
  NEW.created_at := coalesce(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
COMMIT;
