-- ============================================================================
-- 132__cxc_cxp_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para CxC/CxP.
-- Tablas: cuentas_por_cobrar, cuentas_por_pagar.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.cuentas_por_cobrar c
SET tenant_id = cl.tenant_id
FROM public.clientes cl
WHERE c.cliente_id = cl.id
  AND cl.tenant_id IS NOT NULL
  AND (c.tenant_id IS NULL OR c.tenant_id <> cl.tenant_id);

UPDATE public.cuentas_por_cobrar c
SET tenant_id = p.tenant_id
FROM public.pedidos_venta p
WHERE c.pedido_id = p.id
  AND p.tenant_id IS NOT NULL
  AND c.tenant_id IS NULL;

UPDATE public.cuentas_por_cobrar c
SET tenant_id = d.tenant_id
FROM public.documentos d
WHERE c.documento_id = d.id
  AND d.tenant_id IS NOT NULL
  AND c.tenant_id IS NULL;

UPDATE public.cuentas_por_pagar c
SET tenant_id = p.tenant_id
FROM public.proveedores p
WHERE c.proveedor_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (c.tenant_id IS NULL OR c.tenant_id <> p.tenant_id);

UPDATE public.cuentas_por_pagar c
SET tenant_id = oc.tenant_id
FROM public.ordenes_compra oc
WHERE c.orden_id = oc.id
  AND oc.tenant_id IS NOT NULL
  AND c.tenant_id IS NULL;

UPDATE public.cuentas_por_pagar c
SET tenant_id = r.tenant_id
FROM public.recepciones r
WHERE (c.recepcion_id = r.id OR c.referencia_id = r.id)
  AND r.tenant_id IS NOT NULL
  AND c.tenant_id IS NULL;

UPDATE public.cuentas_por_pagar
SET recepcion_id = referencia_id
WHERE recepcion_id IS NULL
  AND referencia_tipo = 'RECEPCION'
  AND referencia_id IS NOT NULL;

UPDATE public.cuentas_por_pagar
SET referencia_id = recepcion_id,
    referencia_tipo = 'RECEPCION'
WHERE recepcion_id IS NOT NULL
  AND (referencia_id IS NULL OR referencia_tipo IS NULL);

-- ----------------------------------------------------------------------------
-- FKs para embeds PostgREST y consistencia referencial.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible(
  'cuentas_por_cobrar',
  'cliente_id',
  'clientes',
  'id',
  'cuentas_por_cobrar_cliente_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cuentas_por_cobrar',
  'pedido_id',
  'pedidos_venta',
  'id',
  'cuentas_por_cobrar_pedido_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cuentas_por_cobrar',
  'documento_id',
  'documentos',
  'id',
  'cuentas_por_cobrar_documento_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cuentas_por_pagar',
  'proveedor_id',
  'proveedores',
  'id',
  'cuentas_por_pagar_proveedor_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cuentas_por_pagar',
  'orden_id',
  'ordenes_compra',
  'id',
  'cuentas_por_pagar_orden_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cuentas_por_pagar',
  'recepcion_id',
  'recepciones',
  'id',
  'cuentas_por_pagar_recepcion_id_fkey'
);

SELECT app.add_fk_if_possible(
  'cuentas_por_pagar',
  'created_by',
  'usuarios_sistema',
  'id',
  'cuentas_por_pagar_created_by_fkey'
);

SELECT app.add_fk_if_possible(
  'cuentas_por_pagar',
  'updated_by',
  'usuarios_sistema',
  'id',
  'cuentas_por_pagar_updated_by_fkey'
);

-- ----------------------------------------------------------------------------
-- Dedupe operativo para soportar índices únicos.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.idempotency_key
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cuentas_por_cobrar c
  WHERE c.tenant_id IS NOT NULL
    AND c.idempotency_key IS NOT NULL
    AND btrim(c.idempotency_key) <> ''
)
UPDATE public.cuentas_por_cobrar c
SET
  idempotency_key = format('%s-dup-%s', lower(btrim(r.idempotency_key)), r.rn),
  updated_at = now()
FROM (
  SELECT id, rn, idempotency_key
  FROM (
    SELECT
      c.id,
      c.idempotency_key,
      row_number() OVER (
        PARTITION BY c.tenant_id, c.idempotency_key
        ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
      ) AS rn
    FROM public.cuentas_por_cobrar c
    WHERE c.tenant_id IS NOT NULL
      AND c.idempotency_key IS NOT NULL
      AND btrim(c.idempotency_key) <> ''
  ) x
  WHERE rn > 1
) r
WHERE c.id = r.id;

WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.event_id
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cuentas_por_cobrar c
  WHERE c.tenant_id IS NOT NULL
    AND c.event_id IS NOT NULL
)
UPDATE public.cuentas_por_cobrar c
SET
  event_id = NULL,
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.documento_id
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cuentas_por_cobrar c
  WHERE c.tenant_id IS NOT NULL
    AND c.documento_id IS NOT NULL
)
UPDATE public.cuentas_por_cobrar c
SET
  estado = 'ANULADA',
  monto_pendiente = 0,
  saldo = 0,
  saldo_pendiente = 0,
  observaciones = COALESCE(c.observaciones || E'\n', '') || 'Registro desactivado por dedupe de documento_id',
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    c.id,
    c.numero_documento,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.proveedor_id, upper(btrim(c.numero_documento))
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cuentas_por_pagar c
  WHERE c.tenant_id IS NOT NULL
    AND c.proveedor_id IS NOT NULL
    AND c.numero_documento IS NOT NULL
    AND btrim(c.numero_documento) <> ''
)
UPDATE public.cuentas_por_pagar c
SET
  numero_documento = format('%s-DUP-%s', upper(btrim(r.numero_documento)), r.rn),
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.idempotency_key
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cuentas_por_pagar c
  WHERE c.tenant_id IS NOT NULL
    AND c.idempotency_key IS NOT NULL
    AND btrim(c.idempotency_key) <> ''
)
UPDATE public.cuentas_por_pagar c
SET
  idempotency_key = format('%s-dup-%s', lower(btrim(c.idempotency_key)), r.rn),
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.event_id
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cuentas_por_pagar c
  WHERE c.tenant_id IS NOT NULL
    AND c.event_id IS NOT NULL
)
UPDATE public.cuentas_por_pagar c
SET
  event_id = NULL,
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.tenant_id, upper(btrim(c.referencia_tipo)), c.referencia_id
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cuentas_por_pagar c
  WHERE c.tenant_id IS NOT NULL
    AND c.referencia_tipo IS NOT NULL
    AND c.referencia_id IS NOT NULL
    AND btrim(c.referencia_tipo) <> ''
)
UPDATE public.cuentas_por_pagar c
SET
  referencia_tipo = format('%s_DUP', upper(btrim(c.referencia_tipo))),
  referencia_id = NULL,
  recepcion_id = NULL,
  observaciones = COALESCE(c.observaciones || E'\n', '') || 'Registro desactivado por dedupe de referencia',
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: cuentas_por_cobrar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_cuentas_por_cobrar_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_doc_id uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT c.tenant_id
    INTO v_ref_tenant
    FROM public.clientes c
    WHERE c.id = NEW.cliente_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Cliente no existe: %s', NEW.cliente_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con el cliente de la CxC',
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
        USING MESSAGE = 'tenant_id no coincide con el pedido de la CxC',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.documento_id IS NOT NULL THEN
    SELECT d.tenant_id
    INTO v_ref_tenant
    FROM public.documentos d
    WHERE d.id = NEW.documento_id;

    IF NOT FOUND THEN
      SELECT cpe.documento_id, cpe.tenant_id
      INTO v_doc_id, v_ref_tenant
      FROM public.cpe cpe
      WHERE cpe.id = NEW.documento_id;

      IF FOUND AND v_doc_id IS NOT NULL THEN
        NEW.documento_id := v_doc_id;
      END IF;

      SELECT d.tenant_id
      INTO v_ref_tenant
      FROM public.documentos d
      WHERE d.id = NEW.documento_id;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Documento no existe: %s', NEW.documento_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con el documento de la CxC',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en cuentas_por_cobrar',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cuentas_por_cobrar_tenant_consistency ON public.cuentas_por_cobrar;
CREATE TRIGGER trg_enforce_cuentas_por_cobrar_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cliente_id, pedido_id, documento_id
ON public.cuentas_por_cobrar
FOR EACH ROW
EXECUTE FUNCTION app.enforce_cuentas_por_cobrar_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: cuentas_por_pagar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_cuentas_por_pagar_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.orden_id := app.to_uuid_or_null(COALESCE(NEW.orden_id::text, ''));
  NEW.recepcion_id := app.to_uuid_or_null(COALESCE(NEW.recepcion_id::text, ''));
  NEW.referencia_id := app.to_uuid_or_null(COALESCE(NEW.referencia_id::text, ''));
  NEW.referencia_tipo := upper(NULLIF(btrim(COALESCE(NEW.referencia_tipo, '')), ''));

  IF NEW.recepcion_id IS NULL AND NEW.referencia_tipo = 'RECEPCION' THEN
    NEW.recepcion_id := NEW.referencia_id;
  END IF;
  IF NEW.recepcion_id IS NOT NULL AND NEW.referencia_id IS NULL THEN
    NEW.referencia_id := NEW.recepcion_id;
    NEW.referencia_tipo := COALESCE(NEW.referencia_tipo, 'RECEPCION');
  END IF;

  IF NEW.proveedor_id IS NOT NULL THEN
    SELECT p.tenant_id
    INTO v_ref_tenant
    FROM public.proveedores p
    WHERE p.id = NEW.proveedor_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Proveedor no existe: %s', NEW.proveedor_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con el proveedor de la CxP',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.orden_id IS NOT NULL THEN
    SELECT oc.tenant_id
    INTO v_ref_tenant
    FROM public.ordenes_compra oc
    WHERE oc.id = NEW.orden_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Orden de compra no existe: %s', NEW.orden_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con la orden de compra de la CxP',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.recepcion_id IS NOT NULL THEN
    SELECT r.tenant_id
    INTO v_ref_tenant
    FROM public.recepciones r
    WHERE r.id = NEW.recepcion_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Recepción no existe: %s', NEW.recepcion_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con la recepción de la CxP',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en cuentas_por_pagar',
            ERRCODE = '23514';
  END IF;

  IF NEW.proveedor_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'proveedor_id es obligatorio en cuentas_por_pagar',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cuentas_por_pagar_tenant_consistency ON public.cuentas_por_pagar;
CREATE TRIGGER trg_enforce_cuentas_por_pagar_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, proveedor_id, orden_id, recepcion_id, referencia_tipo, referencia_id
ON public.cuentas_por_pagar
FOR EACH ROW
EXECUTE FUNCTION app.enforce_cuentas_por_pagar_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cuentas_por_cobrar') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_cobrar_ids_required'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT ck_cuentas_por_cobrar_ids_required
      CHECK (tenant_id IS NOT NULL AND cliente_id IS NOT NULL AND documento_id IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_cobrar_fechas_required'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT ck_cuentas_por_cobrar_fechas_required
      CHECK (
        fecha_emision IS NOT NULL
        AND fecha_vencimiento IS NOT NULL
        AND fecha_vencimiento >= fecha_emision
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_cobrar_montos_nonnegative'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT ck_cuentas_por_cobrar_montos_nonnegative
      CHECK (
        monto_total IS NOT NULL
        AND monto_total >= 0
        AND monto_original IS NOT NULL
        AND monto_original >= 0
        AND monto_pendiente IS NOT NULL
        AND monto_pendiente >= 0
        AND saldo IS NOT NULL
        AND saldo >= 0
        AND saldo_pendiente IS NOT NULL
        AND saldo_pendiente >= 0
        AND retencion_total >= 0
        AND percepcion_total >= 0
        AND detraccion_total >= 0
        AND anticipo_total >= 0
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_cobrar_saldos_consistency'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT ck_cuentas_por_cobrar_saldos_consistency
      CHECK (saldo = monto_pendiente AND saldo_pendiente = monto_pendiente);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_cobrar_estado_valid'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT ck_cuentas_por_cobrar_estado_valid
      CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'CANCELADO', 'VENCIDA', 'ANULADA', 'REVERTIDA'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_cobrar_estado_saldo_consistency'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT ck_cuentas_por_cobrar_estado_saldo_consistency
      CHECK (
        (estado IN ('CANCELADO', 'ANULADA', 'REVERTIDA') AND monto_pendiente = 0)
        OR (estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA') AND monto_pendiente > 0)
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_cobrar_moneda_iso3'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT ck_cuentas_por_cobrar_moneda_iso3
      CHECK (moneda IS NOT NULL AND moneda ~ '^[A-Z]{3}$');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_cobrar_dias_mora_nonnegative'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT ck_cuentas_por_cobrar_dias_mora_nonnegative
      CHECK (dias_mora IS NOT NULL AND dias_mora >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_cobrar_idempotency_nonempty'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT ck_cuentas_por_cobrar_idempotency_nonempty
      CHECK (idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_cobrar_event_source_nonempty'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT ck_cuentas_por_cobrar_event_source_nonempty
      CHECK (event_source IS NOT NULL AND btrim(event_source) <> '');
    END IF;
  END IF;

  IF to_regclass('public.cuentas_por_pagar') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_ids_required'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_ids_required
      CHECK (tenant_id IS NOT NULL AND proveedor_id IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_numero_documento_nonempty'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_numero_documento_nonempty
      CHECK (numero_documento IS NOT NULL AND btrim(numero_documento) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_fechas_required'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_fechas_required
      CHECK (
        fecha_emision IS NOT NULL
        AND fecha_vencimiento IS NOT NULL
        AND fecha_vencimiento >= fecha_emision
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_montos_nonnegative'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_montos_nonnegative
      CHECK (
        subtotal IS NOT NULL AND subtotal >= 0
        AND igv IS NOT NULL AND igv >= 0
        AND total IS NOT NULL AND total > 0
        AND saldo IS NOT NULL AND saldo >= 0
        AND saldo_pendiente IS NOT NULL AND saldo_pendiente >= 0
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_total_formula'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_total_formula
      CHECK (abs(total - round((subtotal + igv)::numeric, 2)) <= 0.01);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_saldo_range'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_saldo_range
      CHECK (saldo <= total AND saldo_pendiente = saldo);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_estado_valid'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_estado_valid
      CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_estado_saldo_consistency'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_estado_saldo_consistency
      CHECK (
        (estado = 'PAGADA' AND saldo = 0)
        OR (estado = 'PARCIAL' AND saldo > 0 AND saldo < total)
        OR (estado IN ('PENDIENTE', 'VENCIDA') AND saldo > 0)
        OR (estado = 'ANULADA')
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_moneda_iso3'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_moneda_iso3
      CHECK (moneda IS NOT NULL AND moneda ~ '^[A-Z]{3}$');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_condiciones_pago_nonempty'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_condiciones_pago_nonempty
      CHECK (condiciones_pago IS NOT NULL AND btrim(condiciones_pago) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_estado_comparacion_valid'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_estado_comparacion_valid
      CHECK (estado_comparacion IN ('PENDIENTE', 'OK', 'DESVIACION_CANTIDAD', 'DESVIACION_PRECIO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_discrepancias_array'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_discrepancias_array
      CHECK (discrepancias IS NOT NULL AND jsonb_typeof(discrepancias) = 'array');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_por_pagar_idempotency_nonempty'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ) THEN
      ALTER TABLE public.cuentas_por_pagar
      ADD CONSTRAINT ck_cuentas_por_pagar_idempotency_nonempty
      CHECK (idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '');
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_ids_required;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_fechas_required;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_montos_nonnegative;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_saldos_consistency;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_estado_valid;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_estado_saldo_consistency;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_moneda_iso3;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_dias_mora_nonnegative;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_idempotency_nonempty;
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  VALIDATE CONSTRAINT ck_cuentas_por_cobrar_event_source_nonempty;

ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_ids_required;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_numero_documento_nonempty;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_fechas_required;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_montos_nonnegative;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_total_formula;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_saldo_range;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_estado_valid;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_estado_saldo_consistency;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_moneda_iso3;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_condiciones_pago_nonempty;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_estado_comparacion_valid;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_discrepancias_array;
ALTER TABLE IF EXISTS public.cuentas_por_pagar
  VALIDATE CONSTRAINT ck_cuentas_por_pagar_idempotency_nonempty;

-- ----------------------------------------------------------------------------
-- Índices de unicidad y soporte.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_por_cobrar_tenant_idempotency
ON public.cuentas_por_cobrar (tenant_id, idempotency_key)
WHERE tenant_id IS NOT NULL
  AND idempotency_key IS NOT NULL
  AND btrim(idempotency_key) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_por_cobrar_tenant_documento_active
ON public.cuentas_por_cobrar (tenant_id, documento_id)
WHERE tenant_id IS NOT NULL
  AND documento_id IS NOT NULL
  AND estado NOT IN ('ANULADA', 'REVERTIDA');

CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_por_cobrar_tenant_event_id
ON public.cuentas_por_cobrar (tenant_id, event_id)
WHERE tenant_id IS NOT NULL
  AND event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_por_pagar_tenant_proveedor_numero_doc
ON public.cuentas_por_pagar (tenant_id, proveedor_id, upper(numero_documento))
WHERE tenant_id IS NOT NULL
  AND proveedor_id IS NOT NULL
  AND numero_documento IS NOT NULL
  AND btrim(numero_documento) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_por_pagar_tenant_idempotency
ON public.cuentas_por_pagar (tenant_id, idempotency_key)
WHERE tenant_id IS NOT NULL
  AND idempotency_key IS NOT NULL
  AND btrim(idempotency_key) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_por_pagar_tenant_event_id
ON public.cuentas_por_pagar (tenant_id, event_id)
WHERE tenant_id IS NOT NULL
  AND event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_por_pagar_tenant_referencia_scope
ON public.cuentas_por_pagar (tenant_id, upper(referencia_tipo), referencia_id)
WHERE tenant_id IS NOT NULL
  AND referencia_tipo IS NOT NULL
  AND btrim(referencia_tipo) <> ''
  AND referencia_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'cuentas_por_cobrar');
SELECT app.apply_tenant_policy('public', 'cuentas_por_pagar');

COMMIT;
