-- ============================================================================
-- 162__ventas_historicas_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para:
-- ventas, venta_detalles, pagos_ventas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.ventas v
SET tenant_id = c.tenant_id
FROM public.clientes c
WHERE v.cliente_id = c.id
  AND c.tenant_id IS NOT NULL
  AND (v.tenant_id IS NULL OR v.tenant_id <> c.tenant_id);

UPDATE public.ventas v
SET tenant_id = s.tenant_id
FROM public.sucursales s
WHERE v.sucursal_id = s.id
  AND s.tenant_id IS NOT NULL
  AND v.tenant_id IS NULL;

UPDATE public.ventas v
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE v.vendedor_id = u.id
  AND u.tenant_id IS NOT NULL
  AND v.tenant_id IS NULL;

UPDATE public.ventas v
SET tenant_id = cxc.tenant_id
FROM public.cuentas_por_cobrar cxc
WHERE v.cuenta_por_cobrar_id = cxc.id
  AND cxc.tenant_id IS NOT NULL
  AND v.tenant_id IS NULL;

UPDATE public.venta_detalles vd
SET tenant_id = v.tenant_id
FROM public.ventas v
WHERE vd.venta_id = v.id
  AND v.tenant_id IS NOT NULL
  AND (vd.tenant_id IS NULL OR vd.tenant_id <> v.tenant_id);

UPDATE public.venta_detalles vd
SET tenant_id = p.tenant_id
FROM public.productos p
WHERE vd.producto_id = p.id
  AND p.tenant_id IS NOT NULL
  AND vd.tenant_id IS NULL;

UPDATE public.pagos_ventas pv
SET tenant_id = v.tenant_id
FROM public.ventas v
WHERE pv.venta_id = v.id
  AND v.tenant_id IS NOT NULL
  AND (pv.tenant_id IS NULL OR pv.tenant_id <> v.tenant_id);

UPDATE public.pagos_ventas pv
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE pv.usuario_id = u.id
  AND u.tenant_id IS NOT NULL
  AND pv.tenant_id IS NULL;

-- ----------------------------------------------------------------------------
-- FKs runtime para joins/embeds.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('ventas', 'cliente_id', 'clientes', 'id', 'ventas_cliente_id_fkey');
SELECT app.add_fk_if_possible('ventas', 'vendedor_id', 'usuarios_sistema', 'id', 'ventas_vendedor_id_fkey');
SELECT app.add_fk_if_possible('ventas', 'sucursal_id', 'sucursales', 'id', 'ventas_sucursal_id_fkey');
SELECT app.add_fk_if_possible('ventas', 'cuenta_por_cobrar_id', 'cuentas_por_cobrar', 'id', 'ventas_cuenta_por_cobrar_id_fkey');

SELECT app.add_fk_if_possible('venta_detalles', 'venta_id', 'ventas', 'id', 'venta_detalles_venta_id_fkey');
SELECT app.add_fk_if_possible('venta_detalles', 'producto_id', 'productos', 'id', 'venta_detalles_producto_id_fkey');

SELECT app.add_fk_if_possible('pagos_ventas', 'venta_id', 'ventas', 'id', 'pagos_ventas_venta_id_fkey');
SELECT app.add_fk_if_possible('pagos_ventas', 'usuario_id', 'usuarios_sistema', 'id', 'pagos_ventas_usuario_id_fkey');

-- ----------------------------------------------------------------------------
-- Dedupe operativo para soportar unicidades.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    v.id,
    v.tenant_id,
    v.tipo_documento,
    v.numero_documento,
    row_number() OVER (
      PARTITION BY v.tenant_id, upper(btrim(v.tipo_documento)), upper(btrim(v.numero_documento))
      ORDER BY COALESCE(v.updated_at, v.created_at, now()) DESC, v.id::text DESC
    ) AS rn
  FROM public.ventas v
  WHERE v.tenant_id IS NOT NULL
    AND v.numero_documento IS NOT NULL
    AND btrim(v.numero_documento) <> ''
    AND v.tipo_documento IS NOT NULL
    AND btrim(v.tipo_documento) <> ''
)
UPDATE public.ventas v
SET
  numero_documento = format('%s-DUP-%s', upper(btrim(r.numero_documento)), r.rn),
  updated_at = now()
FROM ranked r
WHERE v.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    pv.id,
    pv.referencia,
    row_number() OVER (
      PARTITION BY pv.tenant_id, upper(btrim(pv.referencia))
      ORDER BY COALESCE(pv.updated_at, pv.created_at, now()) DESC, pv.id::text DESC
    ) AS rn
  FROM public.pagos_ventas pv
  WHERE pv.tenant_id IS NOT NULL
    AND pv.referencia IS NOT NULL
    AND btrim(pv.referencia) <> ''
)
UPDATE public.pagos_ventas pv
SET
  referencia = format('%s-DUP-%s', upper(btrim(r.referencia)), r.rn),
  updated_at = now()
FROM ranked r
WHERE pv.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    pv.id,
    pv.idempotency_key,
    row_number() OVER (
      PARTITION BY pv.tenant_id, lower(btrim(pv.idempotency_key))
      ORDER BY COALESCE(pv.updated_at, pv.created_at, now()) DESC, pv.id::text DESC
    ) AS rn
  FROM public.pagos_ventas pv
  WHERE pv.tenant_id IS NOT NULL
    AND pv.idempotency_key IS NOT NULL
    AND btrim(pv.idempotency_key) <> ''
)
UPDATE public.pagos_ventas pv
SET
  idempotency_key = format('%s-dup-%s', lower(btrim(r.idempotency_key)), r.rn),
  updated_at = now()
FROM ranked r
WHERE pv.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    pv.id,
    row_number() OVER (
      PARTITION BY pv.tenant_id, pv.event_id
      ORDER BY COALESCE(pv.updated_at, pv.created_at, now()) DESC, pv.id::text DESC
    ) AS rn
  FROM public.pagos_ventas pv
  WHERE pv.tenant_id IS NOT NULL
    AND pv.event_id IS NOT NULL
)
UPDATE public.pagos_ventas pv
SET
  event_id = NULL,
  updated_at = now()
FROM ranked r
WHERE pv.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: ventas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_ventas_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.vendedor_id := app.to_uuid_or_null(COALESCE(NEW.vendedor_id::text, ''));
  NEW.sucursal_id := app.to_uuid_or_null(COALESCE(NEW.sucursal_id::text, ''));
  NEW.cuenta_por_cobrar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_cobrar_id::text, ''));

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_ref_tenant
    FROM public.clientes c
    WHERE c.id = NEW.cliente_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cliente no existe: %s', NEW.cliente_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cliente de ventas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.vendedor_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.vendedor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Vendedor no existe: %s', NEW.vendedor_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con vendedor de ventas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.sucursal_id IS NOT NULL THEN
    SELECT s.tenant_id INTO v_ref_tenant
    FROM public.sucursales s
    WHERE s.id = NEW.sucursal_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Sucursal no existe: %s', NEW.sucursal_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con sucursal de ventas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cuenta_por_cobrar_id IS NOT NULL THEN
    SELECT cxc.tenant_id INTO v_ref_tenant
    FROM public.cuentas_por_cobrar cxc
    WHERE cxc.id = NEW.cuenta_por_cobrar_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cuenta por cobrar no existe: %s', NEW.cuenta_por_cobrar_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cuenta_por_cobrar de ventas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en ventas', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ventas_tenant_consistency ON public.ventas;
CREATE TRIGGER trg_enforce_ventas_tenant_consistency
BEFORE INSERT OR UPDATE ON public.ventas
FOR EACH ROW
EXECUTE FUNCTION app.enforce_ventas_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: venta_detalles.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_venta_detalles_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.venta_id := app.to_uuid_or_null(COALESCE(NEW.venta_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));

  IF NEW.venta_id IS NOT NULL THEN
    SELECT v.tenant_id INTO v_ref_tenant
    FROM public.ventas v
    WHERE v.id = NEW.venta_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Venta no existe: %s', NEW.venta_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con venta en venta_detalles', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.producto_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_ref_tenant
    FROM public.productos p
    WHERE p.id = NEW.producto_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Producto no existe: %s', NEW.producto_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con producto en venta_detalles', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en venta_detalles', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_venta_detalles_tenant_consistency ON public.venta_detalles;
CREATE TRIGGER trg_enforce_venta_detalles_tenant_consistency
BEFORE INSERT OR UPDATE ON public.venta_detalles
FOR EACH ROW
EXECUTE FUNCTION app.enforce_venta_detalles_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: pagos_ventas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_pagos_ventas_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.venta_id := app.to_uuid_or_null(COALESCE(NEW.venta_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  IF NEW.venta_id IS NOT NULL THEN
    SELECT v.tenant_id INTO v_ref_tenant
    FROM public.ventas v
    WHERE v.id = NEW.venta_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Venta no existe: %s', NEW.venta_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con venta en pagos_ventas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.usuario_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.usuario_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Usuario no existe: %s', NEW.usuario_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con usuario en pagos_ventas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en pagos_ventas', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pagos_ventas_tenant_consistency ON public.pagos_ventas;
CREATE TRIGGER trg_enforce_pagos_ventas_tenant_consistency
BEFORE INSERT OR UPDATE ON public.pagos_ventas
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pagos_ventas_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ck_ventas_montos_runtime;
ALTER TABLE public.ventas
  ADD CONSTRAINT ck_ventas_montos_runtime
  CHECK (
    subtotal >= 0
    AND igv >= 0
    AND descuento >= 0
    AND total >= 0
    AND total >= round(GREATEST(subtotal - descuento, 0) + igv - 0.01, 2)
  );

ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ck_ventas_estado_runtime;
ALTER TABLE public.ventas
  ADD CONSTRAINT ck_ventas_estado_runtime
  CHECK (upper(estado) IN ('BORRADOR', 'EMITIDA', 'PAGADA', 'CONFIRMADA', 'ANULADA'));

ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ck_ventas_tipo_documento_runtime;
ALTER TABLE public.ventas
  ADD CONSTRAINT ck_ventas_tipo_documento_runtime
  CHECK (tipo_documento IN ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'TICKET', 'GUIA'));

ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ck_ventas_moneda_len_runtime;
ALTER TABLE public.ventas
  ADD CONSTRAINT ck_ventas_moneda_len_runtime
  CHECK (moneda IS NULL OR char_length(btrim(moneda)) = 3);

ALTER TABLE public.venta_detalles DROP CONSTRAINT IF EXISTS ck_venta_detalles_montos_runtime;
ALTER TABLE public.venta_detalles
  ADD CONSTRAINT ck_venta_detalles_montos_runtime
  CHECK (
    cantidad > 0
    AND precio_unitario >= 0
    AND descuento >= 0
    AND subtotal >= 0
    AND igv >= 0
    AND total_linea >= 0
    AND total_linea >= round(subtotal + igv - 0.01, 2)
  );

ALTER TABLE public.venta_detalles DROP CONSTRAINT IF EXISTS ck_venta_detalles_estado_runtime;
ALTER TABLE public.venta_detalles
  ADD CONSTRAINT ck_venta_detalles_estado_runtime
  CHECK (upper(estado) IN ('REGISTRADO', 'ANULADO'));

ALTER TABLE public.pagos_ventas DROP CONSTRAINT IF EXISTS ck_pagos_ventas_monto_nonnegative_runtime;
ALTER TABLE public.pagos_ventas
  ADD CONSTRAINT ck_pagos_ventas_monto_nonnegative_runtime
  CHECK (monto >= 0);

ALTER TABLE public.pagos_ventas DROP CONSTRAINT IF EXISTS ck_pagos_ventas_estado_runtime;
ALTER TABLE public.pagos_ventas
  ADD CONSTRAINT ck_pagos_ventas_estado_runtime
  CHECK (upper(estado) IN ('REGISTRADO', 'APLICADO', 'ANULADO'));

ALTER TABLE public.pagos_ventas DROP CONSTRAINT IF EXISTS ck_pagos_ventas_moneda_len_runtime;
ALTER TABLE public.pagos_ventas
  ADD CONSTRAINT ck_pagos_ventas_moneda_len_runtime
  CHECK (moneda IS NULL OR char_length(btrim(moneda)) = 3);

ALTER TABLE public.pagos_ventas DROP CONSTRAINT IF EXISTS ck_pagos_ventas_aplicado_runtime;
ALTER TABLE public.pagos_ventas
  ADD CONSTRAINT ck_pagos_ventas_aplicado_runtime
  CHECK (upper(estado) <> 'APLICADO' OR aplicado_en IS NOT NULL);

ALTER TABLE public.ventas VALIDATE CONSTRAINT ck_ventas_montos_runtime;
ALTER TABLE public.ventas VALIDATE CONSTRAINT ck_ventas_estado_runtime;
ALTER TABLE public.ventas VALIDATE CONSTRAINT ck_ventas_tipo_documento_runtime;
ALTER TABLE public.ventas VALIDATE CONSTRAINT ck_ventas_moneda_len_runtime;

ALTER TABLE public.venta_detalles VALIDATE CONSTRAINT ck_venta_detalles_montos_runtime;
ALTER TABLE public.venta_detalles VALIDATE CONSTRAINT ck_venta_detalles_estado_runtime;

ALTER TABLE public.pagos_ventas VALIDATE CONSTRAINT ck_pagos_ventas_monto_nonnegative_runtime;
ALTER TABLE public.pagos_ventas VALIDATE CONSTRAINT ck_pagos_ventas_estado_runtime;
ALTER TABLE public.pagos_ventas VALIDATE CONSTRAINT ck_pagos_ventas_moneda_len_runtime;
ALTER TABLE public.pagos_ventas VALIDATE CONSTRAINT ck_pagos_ventas_aplicado_runtime;

-- ----------------------------------------------------------------------------
-- Unicidades operativas e indices.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_tenant_tipo_numero
ON public.ventas (tenant_id, upper(btrim(tipo_documento)), upper(btrim(numero_documento)))
WHERE tenant_id IS NOT NULL
  AND tipo_documento IS NOT NULL
  AND btrim(tipo_documento) <> ''
  AND numero_documento IS NOT NULL
  AND btrim(numero_documento) <> ''
  AND upper(estado) <> 'ANULADA';

CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_ventas_tenant_referencia
ON public.pagos_ventas (tenant_id, upper(btrim(referencia)))
WHERE tenant_id IS NOT NULL
  AND referencia IS NOT NULL
  AND btrim(referencia) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_ventas_tenant_idempotency
ON public.pagos_ventas (tenant_id, lower(btrim(idempotency_key)))
WHERE tenant_id IS NOT NULL
  AND idempotency_key IS NOT NULL
  AND btrim(idempotency_key) <> '';

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'ventas');
SELECT app.apply_tenant_policy('public', 'venta_detalles');
SELECT app.apply_tenant_policy('public', 'pagos_ventas');

COMMIT;
