-- ============================================================================
-- 126__tesoreria_bancaria_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para tesorería bancaria.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id en tablas bancarias por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.movimientos_bancarios m
SET tenant_id = cb.tenant_id
FROM public.cuentas_bancarias cb
WHERE m.cuenta_bancaria_id = cb.id
  AND cb.tenant_id IS NOT NULL
  AND (m.tenant_id IS NULL OR m.tenant_id <> cb.tenant_id);

UPDATE public.conciliaciones_bancarias c
SET tenant_id = cb.tenant_id
FROM public.cuentas_bancarias cb
WHERE c.cuenta_bancaria_id = cb.id
  AND cb.tenant_id IS NOT NULL
  AND (c.tenant_id IS NULL OR c.tenant_id <> cb.tenant_id);

UPDATE public.movimientos_bancarios m
SET tenant_id = c.tenant_id
FROM public.conciliaciones_bancarias c
WHERE m.conciliacion_id = c.id
  AND c.tenant_id IS NOT NULL
  AND m.tenant_id IS NULL;

UPDATE public.movimientos_bancarios m
SET tenant_id = cxp.tenant_id
FROM public.cuentas_por_pagar cxp
WHERE m.cxp_id = cxp.id
  AND cxp.tenant_id IS NOT NULL
  AND m.tenant_id IS NULL;

UPDATE public.movimientos_bancarios m
SET tenant_id = cxc.tenant_id
FROM public.cuentas_por_cobrar cxc
WHERE m.cxc_id = cxc.id
  AND cxc.tenant_id IS NOT NULL
  AND m.tenant_id IS NULL;

UPDATE public.movimientos_bancarios m
SET tenant_id = p.tenant_id
FROM public.proveedores p
WHERE m.proveedor_id = p.id
  AND p.tenant_id IS NOT NULL
  AND m.tenant_id IS NULL;

UPDATE public.movimientos_bancarios m
SET tenant_id = c.tenant_id
FROM public.clientes c
WHERE m.cliente_id = c.id
  AND c.tenant_id IS NOT NULL
  AND m.tenant_id IS NULL;

-- ----------------------------------------------------------------------------
-- FKs para embeds PostgREST y consistencia referencial.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible(
  'cuentas_bancarias',
  'created_by',
  'usuarios_sistema',
  'id',
  'cuentas_bancarias_created_by_fkey'
);

SELECT app.add_fk_if_possible(
  'cuentas_bancarias',
  'updated_by',
  'usuarios_sistema',
  'id',
  'cuentas_bancarias_updated_by_fkey'
);

SELECT app.add_fk_if_possible(
  'movimientos_bancarios',
  'cuenta_bancaria_id',
  'cuentas_bancarias',
  'id',
  'movimientos_bancarios_cuenta_bancaria_id_fkey'
);

SELECT app.add_fk_if_possible(
  'movimientos_bancarios',
  'conciliacion_id',
  'conciliaciones_bancarias',
  'id',
  'movimientos_bancarios_conciliacion_id_fkey'
);

SELECT app.add_fk_if_possible(
  'movimientos_bancarios',
  'proveedor_id',
  'proveedores',
  'id',
  'movimientos_bancarios_proveedor_id_fkey'
);

SELECT app.add_fk_if_possible(
  'movimientos_bancarios',
  'cliente_id',
  'clientes',
  'id',
  'movimientos_bancarios_cliente_id_fkey'
);

SELECT app.add_fk_if_possible(
  'movimientos_bancarios',
  'cxp_id',
  'cuentas_por_pagar',
  'id',
  'movimientos_bancarios_cxp_id_fkey'
);

SELECT app.add_fk_if_possible(
  'movimientos_bancarios',
  'cxc_id',
  'cuentas_por_cobrar',
  'id',
  'movimientos_bancarios_cxc_id_fkey'
);

SELECT app.add_fk_if_possible(
  'movimientos_bancarios',
  'created_by',
  'usuarios_sistema',
  'id',
  'movimientos_bancarios_created_by_fkey'
);

SELECT app.add_fk_if_possible(
  'movimientos_bancarios',
  'updated_by',
  'usuarios_sistema',
  'id',
  'movimientos_bancarios_updated_by_fkey'
);

SELECT app.add_fk_if_possible(
  'conciliaciones_bancarias',
  'cuenta_bancaria_id',
  'cuentas_bancarias',
  'id',
  'conciliaciones_bancarias_cuenta_bancaria_id_fkey'
);

SELECT app.add_fk_if_possible(
  'conciliaciones_bancarias',
  'cerrado_by',
  'usuarios_sistema',
  'id',
  'conciliaciones_bancarias_cerrado_by_fkey'
);

SELECT app.add_fk_if_possible(
  'conciliaciones_bancarias',
  'created_by',
  'usuarios_sistema',
  'id',
  'conciliaciones_bancarias_created_by_fkey'
);

SELECT app.add_fk_if_possible(
  'conciliaciones_bancarias',
  'updated_by',
  'usuarios_sistema',
  'id',
  'conciliaciones_bancarias_updated_by_fkey'
);

-- ----------------------------------------------------------------------------
-- Dedupe operativo para permitir unicidades por scope.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    cb.id,
    first_value(cb.id) OVER (
      PARTITION BY cb.tenant_id, upper(btrim(cb.numero_cuenta))
      ORDER BY
        COALESCE(cb.activa, true) DESC,
        COALESCE(cb.updated_at, cb.created_at, now()) DESC,
        cb.id::text DESC
    ) AS kept_id,
    row_number() OVER (
      PARTITION BY cb.tenant_id, upper(btrim(cb.numero_cuenta))
      ORDER BY
        COALESCE(cb.activa, true) DESC,
        COALESCE(cb.updated_at, cb.created_at, now()) DESC,
        cb.id::text DESC
    ) AS rn
  FROM public.cuentas_bancarias cb
  WHERE cb.tenant_id IS NOT NULL
    AND cb.numero_cuenta IS NOT NULL
    AND btrim(cb.numero_cuenta) <> ''
)
UPDATE public.movimientos_bancarios m
SET
  cuenta_bancaria_id = r.kept_id,
  updated_at = now()
FROM ranked r
WHERE m.cuenta_bancaria_id = r.id
  AND r.rn > 1
  AND m.cuenta_bancaria_id <> r.kept_id;

WITH ranked AS (
  SELECT
    cb.id,
    first_value(cb.id) OVER (
      PARTITION BY cb.tenant_id, upper(btrim(cb.numero_cuenta))
      ORDER BY
        COALESCE(cb.activa, true) DESC,
        COALESCE(cb.updated_at, cb.created_at, now()) DESC,
        cb.id::text DESC
    ) AS kept_id,
    row_number() OVER (
      PARTITION BY cb.tenant_id, upper(btrim(cb.numero_cuenta))
      ORDER BY
        COALESCE(cb.activa, true) DESC,
        COALESCE(cb.updated_at, cb.created_at, now()) DESC,
        cb.id::text DESC
    ) AS rn
  FROM public.cuentas_bancarias cb
  WHERE cb.tenant_id IS NOT NULL
    AND cb.numero_cuenta IS NOT NULL
    AND btrim(cb.numero_cuenta) <> ''
)
UPDATE public.conciliaciones_bancarias c
SET
  cuenta_bancaria_id = r.kept_id,
  updated_at = now()
FROM ranked r
WHERE c.cuenta_bancaria_id = r.id
  AND r.rn > 1
  AND c.cuenta_bancaria_id <> r.kept_id;

WITH ranked AS (
  SELECT
    cb.id,
    row_number() OVER (
      PARTITION BY cb.tenant_id, upper(btrim(cb.numero_cuenta))
      ORDER BY
        COALESCE(cb.activa, true) DESC,
        COALESCE(cb.updated_at, cb.created_at, now()) DESC,
        cb.id::text DESC
    ) AS rn
  FROM public.cuentas_bancarias cb
  WHERE cb.tenant_id IS NOT NULL
    AND cb.numero_cuenta IS NOT NULL
    AND btrim(cb.numero_cuenta) <> ''
)
DELETE FROM public.cuentas_bancarias cb
USING ranked r
WHERE cb.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    c.id,
    first_value(c.id) OVER (
      PARTITION BY c.tenant_id, c.cuenta_bancaria_id, upper(btrim(c.periodo))
      ORDER BY
        COALESCE(c.updated_at, c.created_at, now()) DESC,
        c.id::text DESC
    ) AS kept_id,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.cuenta_bancaria_id, upper(btrim(c.periodo))
      ORDER BY
        COALESCE(c.updated_at, c.created_at, now()) DESC,
        c.id::text DESC
    ) AS rn
  FROM public.conciliaciones_bancarias c
  WHERE c.tenant_id IS NOT NULL
    AND c.cuenta_bancaria_id IS NOT NULL
    AND c.periodo IS NOT NULL
    AND btrim(c.periodo) <> ''
)
UPDATE public.movimientos_bancarios m
SET
  conciliacion_id = r.kept_id,
  updated_at = now()
FROM ranked r
WHERE m.conciliacion_id = r.id
  AND r.rn > 1
  AND m.conciliacion_id <> r.kept_id;

WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.tenant_id, c.cuenta_bancaria_id, upper(btrim(c.periodo))
      ORDER BY
        COALESCE(c.updated_at, c.created_at, now()) DESC,
        c.id::text DESC
    ) AS rn
  FROM public.conciliaciones_bancarias c
  WHERE c.tenant_id IS NOT NULL
    AND c.cuenta_bancaria_id IS NOT NULL
    AND c.periodo IS NOT NULL
    AND btrim(c.periodo) <> ''
)
DELETE FROM public.conciliaciones_bancarias c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant en movimientos bancarios.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_movimientos_bancarios_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
  v_conciliacion_tenant uuid;
  v_conciliacion_cuenta_id uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.conciliacion_id := app.to_uuid_or_null(COALESCE(NEW.conciliacion_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.cxp_id := app.to_uuid_or_null(COALESCE(NEW.cxp_id::text, ''));
  NEW.cxc_id := app.to_uuid_or_null(COALESCE(NEW.cxc_id::text, ''));

  IF NEW.cxp_id IS NOT NULL AND NEW.cxc_id IS NOT NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'Un movimiento no puede referenciar CxP y CxC al mismo tiempo',
            ERRCODE = '23514';
  END IF;

  IF NEW.proveedor_id IS NOT NULL AND NEW.cliente_id IS NOT NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'Un movimiento no puede referenciar proveedor y cliente al mismo tiempo',
            ERRCODE = '23514';
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
        USING MESSAGE = 'tenant_id no coincide con la cuenta bancaria del movimiento',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.conciliacion_id IS NOT NULL THEN
    SELECT c.tenant_id, c.cuenta_bancaria_id
    INTO v_conciliacion_tenant, v_conciliacion_cuenta_id
    FROM public.conciliaciones_bancarias c
    WHERE c.id = NEW.conciliacion_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Conciliación bancaria no existe: %s', NEW.conciliacion_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_conciliacion_tenant;
    ELSIF v_conciliacion_tenant IS NOT NULL AND NEW.tenant_id <> v_conciliacion_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con la conciliación del movimiento',
              ERRCODE = '23514';
    END IF;

    IF NEW.cuenta_bancaria_id IS NULL THEN
      NEW.cuenta_bancaria_id := v_conciliacion_cuenta_id;
    ELSIF v_conciliacion_cuenta_id IS NOT NULL AND NEW.cuenta_bancaria_id <> v_conciliacion_cuenta_id THEN
      RAISE EXCEPTION
        USING MESSAGE = 'cuenta_bancaria_id no coincide con la cuenta de la conciliación',
              ERRCODE = '23514';
    END IF;
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
        USING MESSAGE = 'tenant_id no coincide con el proveedor del movimiento',
              ERRCODE = '23514';
    END IF;
  END IF;

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
        USING MESSAGE = 'tenant_id no coincide con el cliente del movimiento',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cxp_id IS NOT NULL THEN
    SELECT cxp.tenant_id
    INTO v_ref_tenant
    FROM public.cuentas_por_pagar cxp
    WHERE cxp.id = NEW.cxp_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Cuenta por pagar no existe: %s', NEW.cxp_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con la CxP del movimiento',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cxc_id IS NOT NULL THEN
    SELECT cxc.tenant_id
    INTO v_ref_tenant
    FROM public.cuentas_por_cobrar cxc
    WHERE cxc.id = NEW.cxc_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING MESSAGE = format('Cuenta por cobrar no existe: %s', NEW.cxc_id),
              ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION
        USING MESSAGE = 'tenant_id no coincide con la CxC del movimiento',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en movimientos_bancarios',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_movimientos_bancarios_tenant_consistency ON public.movimientos_bancarios;
CREATE TRIGGER trg_enforce_movimientos_bancarios_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cuenta_bancaria_id, conciliacion_id, proveedor_id, cliente_id, cxp_id, cxc_id
ON public.movimientos_bancarios
FOR EACH ROW
EXECUTE FUNCTION app.enforce_movimientos_bancarios_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant en conciliaciones bancarias.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_conciliaciones_bancarias_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cuenta_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));

  IF NEW.cuenta_bancaria_id IS NOT NULL THEN
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
        USING MESSAGE = 'tenant_id no coincide con la cuenta de la conciliación',
              ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION
      USING MESSAGE = 'tenant_id es obligatorio en conciliaciones_bancarias',
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_conciliaciones_bancarias_tenant_consistency ON public.conciliaciones_bancarias;
CREATE TRIGGER trg_enforce_conciliaciones_bancarias_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cuenta_bancaria_id
ON public.conciliaciones_bancarias
FOR EACH ROW
EXECUTE FUNCTION app.enforce_conciliaciones_bancarias_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio y calidad de datos.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cuentas_bancarias') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_bancarias_nombre_nonempty'
        AND conrelid = 'public.cuentas_bancarias'::regclass
    ) THEN
      ALTER TABLE public.cuentas_bancarias
      ADD CONSTRAINT ck_cuentas_bancarias_nombre_nonempty
      CHECK (nombre IS NOT NULL AND btrim(nombre) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_bancarias_banco_nonempty'
        AND conrelid = 'public.cuentas_bancarias'::regclass
    ) THEN
      ALTER TABLE public.cuentas_bancarias
      ADD CONSTRAINT ck_cuentas_bancarias_banco_nonempty
      CHECK (banco IS NOT NULL AND btrim(banco) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_bancarias_numero_nonempty'
        AND conrelid = 'public.cuentas_bancarias'::regclass
    ) THEN
      ALTER TABLE public.cuentas_bancarias
      ADD CONSTRAINT ck_cuentas_bancarias_numero_nonempty
      CHECK (numero_cuenta IS NOT NULL AND btrim(numero_cuenta) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_bancarias_tipo_valid'
        AND conrelid = 'public.cuentas_bancarias'::regclass
    ) THEN
      ALTER TABLE public.cuentas_bancarias
      ADD CONSTRAINT ck_cuentas_bancarias_tipo_valid
      CHECK (tipo_cuenta IS NOT NULL AND tipo_cuenta IN ('CORRIENTE', 'AHORROS', 'DETRACCION', 'PLAZO_FIJO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_bancarias_moneda_iso3'
        AND conrelid = 'public.cuentas_bancarias'::regclass
    ) THEN
      ALTER TABLE public.cuentas_bancarias
      ADD CONSTRAINT ck_cuentas_bancarias_moneda_iso3
      CHECK (moneda IS NOT NULL AND moneda ~ '^[A-Z]{3}$');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_bancarias_estado_valid'
        AND conrelid = 'public.cuentas_bancarias'::regclass
    ) THEN
      ALTER TABLE public.cuentas_bancarias
      ADD CONSTRAINT ck_cuentas_bancarias_estado_valid
      CHECK (estado IS NOT NULL AND estado IN ('ACTIVO', 'INACTIVO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_bancarias_estado_activo_consistency'
        AND conrelid = 'public.cuentas_bancarias'::regclass
    ) THEN
      ALTER TABLE public.cuentas_bancarias
      ADD CONSTRAINT ck_cuentas_bancarias_estado_activo_consistency
      CHECK (
        COALESCE(activo, true) = COALESCE(activa, true)
        AND COALESCE(activa, true) = (estado = 'ACTIVO')
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_cuentas_bancarias_sobregiro_saldos'
        AND conrelid = 'public.cuentas_bancarias'::regclass
    ) THEN
      ALTER TABLE public.cuentas_bancarias
      ADD CONSTRAINT ck_cuentas_bancarias_sobregiro_saldos
      CHECK (
        COALESCE(permite_sobregiro, false)
        OR (
          COALESCE(saldo, 0) >= 0
          AND COALESCE(saldo_actual, 0) >= 0
          AND COALESCE(saldo_contable, 0) >= 0
        )
      );
    END IF;
  END IF;

  IF to_regclass('public.movimientos_bancarios') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_movimientos_bancarios_tipo_valid'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ) THEN
      ALTER TABLE public.movimientos_bancarios
      ADD CONSTRAINT ck_movimientos_bancarios_tipo_valid
      CHECK (tipo IS NOT NULL AND tipo IN ('ABONO', 'CARGO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_movimientos_bancarios_monto_positive'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ) THEN
      ALTER TABLE public.movimientos_bancarios
      ADD CONSTRAINT ck_movimientos_bancarios_monto_positive
      CHECK (monto IS NOT NULL AND monto > 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_movimientos_bancarios_fecha_required'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ) THEN
      ALTER TABLE public.movimientos_bancarios
      ADD CONSTRAINT ck_movimientos_bancarios_fecha_required
      CHECK (fecha IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_movimientos_bancarios_descripcion_nonempty'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ) THEN
      ALTER TABLE public.movimientos_bancarios
      ADD CONSTRAINT ck_movimientos_bancarios_descripcion_nonempty
      CHECK (descripcion IS NOT NULL AND btrim(descripcion) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_movimientos_bancarios_diferencia_nonnegative'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ) THEN
      ALTER TABLE public.movimientos_bancarios
      ADD CONSTRAINT ck_movimientos_bancarios_diferencia_nonnegative
      CHECK (COALESCE(diferencia_conciliacion, 0) >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_movimientos_bancarios_extracto_conciliacion'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ) THEN
      ALTER TABLE public.movimientos_bancarios
      ADD CONSTRAINT ck_movimientos_bancarios_extracto_conciliacion
      CHECK (COALESCE(es_extracto, false) = false OR conciliacion_id IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_movimientos_bancarios_conciliado_conciliacion'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ) THEN
      ALTER TABLE public.movimientos_bancarios
      ADD CONSTRAINT ck_movimientos_bancarios_conciliado_conciliacion
      CHECK (COALESCE(conciliado, false) = false OR conciliacion_id IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_movimientos_bancarios_match_consistency'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ) THEN
      ALTER TABLE public.movimientos_bancarios
      ADD CONSTRAINT ck_movimientos_bancarios_match_consistency
      CHECK (
        COALESCE(match_automatico, false) = false
        OR (COALESCE(conciliado, false) = true AND match_id IS NOT NULL)
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_movimientos_bancarios_counterparty_exclusive'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ) THEN
      ALTER TABLE public.movimientos_bancarios
      ADD CONSTRAINT ck_movimientos_bancarios_counterparty_exclusive
      CHECK (NOT (proveedor_id IS NOT NULL AND cliente_id IS NOT NULL));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_movimientos_bancarios_doc_exclusive'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ) THEN
      ALTER TABLE public.movimientos_bancarios
      ADD CONSTRAINT ck_movimientos_bancarios_doc_exclusive
      CHECK (NOT (cxp_id IS NOT NULL AND cxc_id IS NOT NULL));
    END IF;
  END IF;

  IF to_regclass('public.conciliaciones_bancarias') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_conciliaciones_bancarias_cuenta_required'
        AND conrelid = 'public.conciliaciones_bancarias'::regclass
    ) THEN
      ALTER TABLE public.conciliaciones_bancarias
      ADD CONSTRAINT ck_conciliaciones_bancarias_cuenta_required
      CHECK (cuenta_bancaria_id IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_conciliaciones_bancarias_periodo_shape'
        AND conrelid = 'public.conciliaciones_bancarias'::regclass
    ) THEN
      ALTER TABLE public.conciliaciones_bancarias
      ADD CONSTRAINT ck_conciliaciones_bancarias_periodo_shape
      CHECK (periodo IS NOT NULL AND periodo ~ '^\d{4}-(0[1-9]|1[0-2])$');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_conciliaciones_bancarias_estado_valid'
        AND conrelid = 'public.conciliaciones_bancarias'::regclass
    ) THEN
      ALTER TABLE public.conciliaciones_bancarias
      ADD CONSTRAINT ck_conciliaciones_bancarias_estado_valid
      CHECK (estado IS NOT NULL AND estado IN ('ABIERTA', 'EN_PROCESO', 'CERRADA'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_conciliaciones_bancarias_fecha_range'
        AND conrelid = 'public.conciliaciones_bancarias'::regclass
    ) THEN
      ALTER TABLE public.conciliaciones_bancarias
      ADD CONSTRAINT ck_conciliaciones_bancarias_fecha_range
      CHECK (
        fecha_desde IS NOT NULL
        AND fecha_hasta IS NOT NULL
        AND fecha_hasta >= fecha_desde
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_conciliaciones_bancarias_diferencia_formula'
        AND conrelid = 'public.conciliaciones_bancarias'::regclass
    ) THEN
      ALTER TABLE public.conciliaciones_bancarias
      ADD CONSTRAINT ck_conciliaciones_bancarias_diferencia_formula
      CHECK (
        saldo_libro IS NOT NULL
        AND saldo_banco IS NOT NULL
        AND diferencia IS NOT NULL
        AND round((saldo_libro - saldo_banco)::numeric, 2) = round(diferencia::numeric, 2)
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_conciliaciones_bancarias_cierre_consistency'
        AND conrelid = 'public.conciliaciones_bancarias'::regclass
    ) THEN
      ALTER TABLE public.conciliaciones_bancarias
      ADD CONSTRAINT ck_conciliaciones_bancarias_cierre_consistency
      CHECK (
        (estado = 'CERRADA' AND cerrado_at IS NOT NULL)
        OR (estado <> 'CERRADA' AND cerrado_at IS NULL AND cerrado_by IS NULL)
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_conciliaciones_bancarias_moneda_iso3'
        AND conrelid = 'public.conciliaciones_bancarias'::regclass
    ) THEN
      ALTER TABLE public.conciliaciones_bancarias
      ADD CONSTRAINT ck_conciliaciones_bancarias_moneda_iso3
      CHECK (moneda IS NULL OR moneda ~ '^[A-Z]{3}$');
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.cuentas_bancarias
  VALIDATE CONSTRAINT ck_cuentas_bancarias_nombre_nonempty;
ALTER TABLE IF EXISTS public.cuentas_bancarias
  VALIDATE CONSTRAINT ck_cuentas_bancarias_banco_nonempty;
ALTER TABLE IF EXISTS public.cuentas_bancarias
  VALIDATE CONSTRAINT ck_cuentas_bancarias_numero_nonempty;
ALTER TABLE IF EXISTS public.cuentas_bancarias
  VALIDATE CONSTRAINT ck_cuentas_bancarias_tipo_valid;
ALTER TABLE IF EXISTS public.cuentas_bancarias
  VALIDATE CONSTRAINT ck_cuentas_bancarias_moneda_iso3;
ALTER TABLE IF EXISTS public.cuentas_bancarias
  VALIDATE CONSTRAINT ck_cuentas_bancarias_estado_valid;
ALTER TABLE IF EXISTS public.cuentas_bancarias
  VALIDATE CONSTRAINT ck_cuentas_bancarias_estado_activo_consistency;
ALTER TABLE IF EXISTS public.cuentas_bancarias
  VALIDATE CONSTRAINT ck_cuentas_bancarias_sobregiro_saldos;

ALTER TABLE IF EXISTS public.movimientos_bancarios
  VALIDATE CONSTRAINT ck_movimientos_bancarios_tipo_valid;
ALTER TABLE IF EXISTS public.movimientos_bancarios
  VALIDATE CONSTRAINT ck_movimientos_bancarios_monto_positive;
ALTER TABLE IF EXISTS public.movimientos_bancarios
  VALIDATE CONSTRAINT ck_movimientos_bancarios_fecha_required;
ALTER TABLE IF EXISTS public.movimientos_bancarios
  VALIDATE CONSTRAINT ck_movimientos_bancarios_descripcion_nonempty;
ALTER TABLE IF EXISTS public.movimientos_bancarios
  VALIDATE CONSTRAINT ck_movimientos_bancarios_diferencia_nonnegative;
ALTER TABLE IF EXISTS public.movimientos_bancarios
  VALIDATE CONSTRAINT ck_movimientos_bancarios_extracto_conciliacion;
ALTER TABLE IF EXISTS public.movimientos_bancarios
  VALIDATE CONSTRAINT ck_movimientos_bancarios_conciliado_conciliacion;
ALTER TABLE IF EXISTS public.movimientos_bancarios
  VALIDATE CONSTRAINT ck_movimientos_bancarios_match_consistency;
ALTER TABLE IF EXISTS public.movimientos_bancarios
  VALIDATE CONSTRAINT ck_movimientos_bancarios_counterparty_exclusive;
ALTER TABLE IF EXISTS public.movimientos_bancarios
  VALIDATE CONSTRAINT ck_movimientos_bancarios_doc_exclusive;

ALTER TABLE IF EXISTS public.conciliaciones_bancarias
  VALIDATE CONSTRAINT ck_conciliaciones_bancarias_cuenta_required;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias
  VALIDATE CONSTRAINT ck_conciliaciones_bancarias_periodo_shape;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias
  VALIDATE CONSTRAINT ck_conciliaciones_bancarias_estado_valid;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias
  VALIDATE CONSTRAINT ck_conciliaciones_bancarias_fecha_range;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias
  VALIDATE CONSTRAINT ck_conciliaciones_bancarias_diferencia_formula;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias
  VALIDATE CONSTRAINT ck_conciliaciones_bancarias_cierre_consistency;
ALTER TABLE IF EXISTS public.conciliaciones_bancarias
  VALIDATE CONSTRAINT ck_conciliaciones_bancarias_moneda_iso3;

-- ----------------------------------------------------------------------------
-- Índices de unicidad y performance operacional.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_cuentas_bancarias_tenant_numero
ON public.cuentas_bancarias (tenant_id, upper(numero_cuenta))
WHERE tenant_id IS NOT NULL
  AND numero_cuenta IS NOT NULL
  AND btrim(numero_cuenta) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_conciliaciones_bancarias_tenant_cuenta_periodo
ON public.conciliaciones_bancarias (tenant_id, cuenta_bancaria_id, periodo)
WHERE tenant_id IS NOT NULL
  AND cuenta_bancaria_id IS NOT NULL
  AND periodo IS NOT NULL
  AND btrim(periodo) <> '';

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant_match_runtime
ON public.movimientos_bancarios (tenant_id, match_automatico, conciliado, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant_ref_runtime
ON public.movimientos_bancarios (tenant_id, referencia, created_at DESC)
WHERE referencia IS NOT NULL
  AND btrim(referencia) <> '';

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'cuentas_bancarias');
SELECT app.apply_tenant_policy('public', 'movimientos_bancarios');
SELECT app.apply_tenant_policy('public', 'conciliaciones_bancarias');

COMMIT;

