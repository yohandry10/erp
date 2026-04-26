-- ============================================================================
-- 129__cxc_pagos_lotes_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para cxc_pagos y pagos_lote.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.cxc_pagos p
SET tenant_id = c.tenant_id
FROM public.cuentas_por_cobrar c
WHERE p.cuenta_id = c.id
  AND c.tenant_id IS NOT NULL
  AND (p.tenant_id IS NULL OR p.tenant_id <> c.tenant_id);

UPDATE public.cxc_pagos p
SET tenant_id = cb.tenant_id
FROM public.cuentas_bancarias cb
WHERE p.cuenta_bancaria_id = cb.id
  AND cb.tenant_id IS NOT NULL
  AND p.tenant_id IS NULL;

UPDATE public.pagos_lote pl
SET tenant_id = cb.tenant_id
FROM public.cuentas_bancarias cb
WHERE pl.cuenta_bancaria_id = cb.id
  AND cb.tenant_id IS NOT NULL
  AND (pl.tenant_id IS NULL OR pl.tenant_id <> cb.tenant_id);

-- ----------------------------------------------------------------------------
-- FKs para embeds PostgREST y consistencia referencial.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible(
  'cxc_pagos',
  'cuenta_id',
  'cuentas_por_cobrar',
  'id',
  'cxc_pagos_cuenta_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cxc_pagos',
  'cuenta_bancaria_id',
  'cuentas_bancarias',
  'id',
  'cxc_pagos_cuenta_bancaria_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cxc_pagos',
  'pedido_id',
  'pedidos_venta',
  'id',
  'cxc_pagos_pedido_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cxc_pagos',
  'documento_id',
  'documentos',
  'id',
  'cxc_pagos_documento_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cxc_pagos',
  'usuario_id',
  'usuarios_sistema',
  'id',
  'cxc_pagos_usuario_id_fkey'
);

SELECT app.add_fk_if_possible(
  'pagos_lote',
  'cuenta_bancaria_id',
  'cuentas_bancarias',
  'id',
  'pagos_lote_cuenta_bancaria_id_fkey'
);

-- ----------------------------------------------------------------------------
-- Dedupe operativo para soportar índices únicos.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    p.id,
    p.tenant_id,
    p.cuenta_id,
    p.referencia,
    row_number() OVER (
      PARTITION BY p.tenant_id, p.cuenta_id, upper(btrim(p.referencia))
      ORDER BY COALESCE(p.updated_at, p.created_at, now()) DESC, p.id::text DESC
    ) AS rn
  FROM public.cxc_pagos p
  WHERE p.tenant_id IS NOT NULL
    AND p.cuenta_id IS NOT NULL
    AND p.referencia IS NOT NULL
    AND btrim(p.referencia) <> ''
)
UPDATE public.cxc_pagos p
SET
  referencia = format('%s-DUP-%s', upper(btrim(r.referencia)), r.rn),
  updated_at = now()
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    p.id,
    p.idempotency_key,
    row_number() OVER (
      PARTITION BY p.tenant_id, p.idempotency_key
      ORDER BY COALESCE(p.updated_at, p.created_at, now()) DESC, p.id::text DESC
    ) AS rn
  FROM public.cxc_pagos p
  WHERE p.tenant_id IS NOT NULL
    AND p.idempotency_key IS NOT NULL
    AND btrim(p.idempotency_key) <> ''
)
UPDATE public.cxc_pagos p
SET
  idempotency_key = format('%s-dup-%s', lower(btrim(r.idempotency_key)), r.rn),
  updated_at = now()
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    p.id,
    row_number() OVER (
      PARTITION BY p.tenant_id, p.event_id
      ORDER BY COALESCE(p.updated_at, p.created_at, now()) DESC, p.id::text DESC
    ) AS rn
  FROM public.cxc_pagos p
  WHERE p.tenant_id IS NOT NULL
    AND p.event_id IS NOT NULL
)
UPDATE public.cxc_pagos p
SET
  event_id = NULL,
  updated_at = now()
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    pl.id,
    pl.referencia_lote,
    row_number() OVER (
      PARTITION BY pl.tenant_id, upper(btrim(pl.referencia_lote))
      ORDER BY COALESCE(pl.updated_at, pl.created_at, now()) DESC, pl.id::text DESC
    ) AS rn
  FROM public.pagos_lote pl
  WHERE pl.tenant_id IS NOT NULL
    AND pl.referencia_lote IS NOT NULL
    AND btrim(pl.referencia_lote) <> ''
)
UPDATE public.pagos_lote pl
SET
  referencia_lote = format('%s-DUP-%s', upper(btrim(r.referencia_lote)), r.rn),
  updated_at = now()
FROM ranked r
WHERE pl.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant en cxc_pagos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_cxc_pagos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cuenta_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_id::text, ''));
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  IF NEW.cuenta_id IS NOT NULL THEN
    SELECT c.tenant_id
    INTO v_ref_tenant
    FROM public.cuentas_por_cobrar c
    WHERE c.id = NEW.cuenta_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Cuenta por cobrar no existe: %s', NEW.cuenta_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con la cuenta por cobrar del pago',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cuenta_bancaria_id IS NOT NULL THEN
    SELECT cb.tenant_id
    INTO v_ref_tenant
    FROM public.cuentas_bancarias cb
    WHERE cb.id = NEW.cuenta_bancaria_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Cuenta bancaria no existe: %s', NEW.cuenta_bancaria_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con la cuenta bancaria del pago',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.pedido_id IS NOT NULL THEN
    SELECT p.tenant_id
    INTO v_ref_tenant
    FROM public.pedidos_venta p
    WHERE p.id = NEW.pedido_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Pedido de venta no existe: %s', NEW.pedido_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con el pedido del pago',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.documento_id IS NOT NULL THEN
    SELECT d.tenant_id
    INTO v_ref_tenant
    FROM public.documentos d
    WHERE d.id = NEW.documento_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Documento no existe: %s', NEW.documento_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con el documento del pago',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en cxc_pagos',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cxc_pagos_tenant_consistency ON public.cxc_pagos;
CREATE TRIGGER trg_enforce_cxc_pagos_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cuenta_id, cuenta_bancaria_id, pedido_id, documento_id
ON public.cxc_pagos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_cxc_pagos_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant en pagos_lote.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_pagos_lote_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cuenta_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));

  IF NEW.cuenta_bancaria_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'cuenta_bancaria_id es obligatorio en pagos_lote',
            ERRCODE = '23514';
  END IF;

  SELECT cb.tenant_id
  INTO v_cuenta_tenant
  FROM public.cuentas_bancarias cb
  WHERE cb.id = NEW.cuenta_bancaria_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING MESSAGE = format('Cuenta bancaria no existe: %s', NEW.cuenta_bancaria_id),
            ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_cuenta_tenant;
  ELSIF v_cuenta_tenant IS NOT NULL AND NEW.tenant_id <> v_cuenta_tenant THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id no coincide con la cuenta bancaria del lote',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pagos_lote_tenant_consistency ON public.pagos_lote;
CREATE TRIGGER trg_enforce_pagos_lote_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cuenta_bancaria_id
ON public.pagos_lote
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pagos_lote_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cxc_pagos') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_ids_required'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_ids_required
      CHECK (tenant_id IS NOT NULL AND cuenta_id IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_monto_positive'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_monto_positive
      CHECK (monto IS NOT NULL AND monto > 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_fecha_required'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_fecha_required
      CHECK (fecha_pago IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_tipo_valid'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_tipo_valid
      CHECK (tipo IS NOT NULL AND tipo IN ('PAGO', 'ANTICIPO', 'DETRACCION', 'PERCEPCION', 'RETENCION', 'NOTA_CREDITO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_moneda_iso3'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_moneda_iso3
      CHECK (moneda IS NOT NULL AND moneda ~ '^[A-Z]{3}$');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_metodo_nonempty'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_metodo_nonempty
      CHECK (metodo_pago IS NOT NULL AND btrim(metodo_pago) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_retencion_consistency'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_retencion_consistency
      CHECK (
        (
          COALESCE(aplica_retencion, false) = true
          AND COALESCE(retencion_monto, 0) > 0
          AND COALESCE(retencion_monto, 0) <= monto
        )
        OR (
          COALESCE(aplica_retencion, false) = false
          AND COALESCE(retencion_monto, 0) = 0
        )
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_estado_valid'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_estado_valid
      CHECK (estado IS NOT NULL AND estado IN ('ACTIVO', 'INACTIVO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_estado_activo_consistency'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_estado_activo_consistency
      CHECK (COALESCE(activo, true) = (estado = 'ACTIVO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_idempotency_nonempty'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_idempotency_nonempty
      CHECK (idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cxc_pagos_source_nonempty'
        AND conrelid = 'public.cxc_pagos'::regclass
    ) THEN
      ALTER TABLE public.cxc_pagos
      ADD CONSTRAINT ck_cxc_pagos_source_nonempty
      CHECK (source IS NOT NULL AND btrim(source) <> '');
    END IF;
  END IF;

  IF to_regclass('public.pagos_lote') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_lote_ids_required'
        AND conrelid = 'public.pagos_lote'::regclass
    ) THEN
      ALTER TABLE public.pagos_lote
      ADD CONSTRAINT ck_pagos_lote_ids_required
      CHECK (tenant_id IS NOT NULL AND cuenta_bancaria_id IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_lote_referencia_nonempty'
        AND conrelid = 'public.pagos_lote'::regclass
    ) THEN
      ALTER TABLE public.pagos_lote
      ADD CONSTRAINT ck_pagos_lote_referencia_nonempty
      CHECK (referencia_lote IS NOT NULL AND btrim(referencia_lote) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_lote_fecha_required'
        AND conrelid = 'public.pagos_lote'::regclass
    ) THEN
      ALTER TABLE public.pagos_lote
      ADD CONSTRAINT ck_pagos_lote_fecha_required
      CHECK (fecha_pago IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_lote_metodo_nonempty'
        AND conrelid = 'public.pagos_lote'::regclass
    ) THEN
      ALTER TABLE public.pagos_lote
      ADD CONSTRAINT ck_pagos_lote_metodo_nonempty
      CHECK (metodo_pago IS NOT NULL AND btrim(metodo_pago) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_lote_monto_nonnegative'
        AND conrelid = 'public.pagos_lote'::regclass
    ) THEN
      ALTER TABLE public.pagos_lote
      ADD CONSTRAINT ck_pagos_lote_monto_nonnegative
      CHECK (monto_total IS NOT NULL AND monto_total >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_lote_pagos_array'
        AND conrelid = 'public.pagos_lote'::regclass
    ) THEN
      ALTER TABLE public.pagos_lote
      ADD CONSTRAINT ck_pagos_lote_pagos_array
      CHECK (pagos IS NOT NULL AND jsonb_typeof(pagos) = 'array');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_lote_resultado_object'
        AND conrelid = 'public.pagos_lote'::regclass
    ) THEN
      ALTER TABLE public.pagos_lote
      ADD CONSTRAINT ck_pagos_lote_resultado_object
      CHECK (resultado IS NOT NULL AND jsonb_typeof(resultado) = 'object');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_lote_estado_valid'
        AND conrelid = 'public.pagos_lote'::regclass
    ) THEN
      ALTER TABLE public.pagos_lote
      ADD CONSTRAINT ck_pagos_lote_estado_valid
      CHECK (estado IS NOT NULL AND estado IN ('PENDIENTE', 'PROCESADO', 'ERROR', 'CANCELADO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_lote_estado_activo_consistency'
        AND conrelid = 'public.pagos_lote'::regclass
    ) THEN
      ALTER TABLE public.pagos_lote
      ADD CONSTRAINT ck_pagos_lote_estado_activo_consistency
      CHECK (COALESCE(activo, false) = (estado IN ('PENDIENTE', 'PROCESADO')));
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_ids_required;
ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_monto_positive;
ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_fecha_required;
ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_tipo_valid;
ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_moneda_iso3;
ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_metodo_nonempty;
ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_retencion_consistency;
ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_estado_valid;
ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_estado_activo_consistency;
ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_idempotency_nonempty;
ALTER TABLE IF EXISTS public.cxc_pagos
  VALIDATE CONSTRAINT ck_cxc_pagos_source_nonempty;

ALTER TABLE IF EXISTS public.pagos_lote
  VALIDATE CONSTRAINT ck_pagos_lote_ids_required;
ALTER TABLE IF EXISTS public.pagos_lote
  VALIDATE CONSTRAINT ck_pagos_lote_referencia_nonempty;
ALTER TABLE IF EXISTS public.pagos_lote
  VALIDATE CONSTRAINT ck_pagos_lote_fecha_required;
ALTER TABLE IF EXISTS public.pagos_lote
  VALIDATE CONSTRAINT ck_pagos_lote_metodo_nonempty;
ALTER TABLE IF EXISTS public.pagos_lote
  VALIDATE CONSTRAINT ck_pagos_lote_monto_nonnegative;
ALTER TABLE IF EXISTS public.pagos_lote
  VALIDATE CONSTRAINT ck_pagos_lote_pagos_array;
ALTER TABLE IF EXISTS public.pagos_lote
  VALIDATE CONSTRAINT ck_pagos_lote_resultado_object;
ALTER TABLE IF EXISTS public.pagos_lote
  VALIDATE CONSTRAINT ck_pagos_lote_estado_valid;
ALTER TABLE IF EXISTS public.pagos_lote
  VALIDATE CONSTRAINT ck_pagos_lote_estado_activo_consistency;

-- ----------------------------------------------------------------------------
-- Índices de unicidad y soporte.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_cxc_pagos_tenant_cuenta_referencia
ON public.cxc_pagos (tenant_id, cuenta_id, upper(referencia))
WHERE tenant_id IS NOT NULL
  AND cuenta_id IS NOT NULL
  AND referencia IS NOT NULL
  AND btrim(referencia) <> '';

CREATE INDEX IF NOT EXISTS idx_pagos_lote_tenant_referencia_runtime
ON public.pagos_lote (tenant_id, referencia_lote, created_at DESC)
WHERE tenant_id IS NOT NULL
  AND referencia_lote IS NOT NULL
  AND btrim(referencia_lote) <> '';

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'cxc_pagos');
SELECT app.apply_tenant_policy('public', 'pagos_lote');

COMMIT;
