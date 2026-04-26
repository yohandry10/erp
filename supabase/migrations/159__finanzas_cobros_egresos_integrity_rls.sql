-- ============================================================================
-- 159__finanzas_cobros_egresos_integrity_rls.sql
-- Integridad, tenant consistency y hardening RLS para:
-- gastos, cobranzas, gestiones_cobranza, egresos, pagos_facturas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill tenant_id por relaciones parent.
-- ----------------------------------------------------------------------------
UPDATE public.gastos g
SET tenant_id = cc.tenant_id
FROM public.centros_costo cc
WHERE g.centro_costo_id = cc.id
  AND cc.tenant_id IS NOT NULL
  AND (g.tenant_id IS NULL OR g.tenant_id <> cc.tenant_id);

UPDATE public.gastos g
SET tenant_id = p.tenant_id
FROM public.proveedores p
WHERE g.proveedor_id = p.id
  AND p.tenant_id IS NOT NULL
  AND g.tenant_id IS NULL;

UPDATE public.gastos g
SET tenant_id = u.tenant_id
FROM public.usuarios_sistema u
WHERE g.usuario_id = u.id
  AND u.tenant_id IS NOT NULL
  AND g.tenant_id IS NULL;

UPDATE public.egresos e
SET tenant_id = cxp.tenant_id
FROM public.cuentas_por_pagar cxp
WHERE e.cuenta_por_pagar_id = cxp.id
  AND cxp.tenant_id IS NOT NULL
  AND (e.tenant_id IS NULL OR e.tenant_id <> cxp.tenant_id);

UPDATE public.egresos e
SET tenant_id = p.tenant_id
FROM public.proveedores p
WHERE e.proveedor_id = p.id
  AND p.tenant_id IS NOT NULL
  AND e.tenant_id IS NULL;

UPDATE public.egresos e
SET tenant_id = cb.tenant_id
FROM public.cuentas_bancarias cb
WHERE e.cuenta_bancaria_id = cb.id
  AND cb.tenant_id IS NOT NULL
  AND e.tenant_id IS NULL;

UPDATE public.cobranzas c
SET tenant_id = cxc.tenant_id
FROM public.cuentas_por_cobrar cxc
WHERE c.cuenta_por_cobrar_id = cxc.id
  AND cxc.tenant_id IS NOT NULL
  AND (c.tenant_id IS NULL OR c.tenant_id <> cxc.tenant_id);

UPDATE public.cobranzas c
SET tenant_id = cli.tenant_id
FROM public.clientes cli
WHERE c.cliente_id = cli.id
  AND cli.tenant_id IS NOT NULL
  AND c.tenant_id IS NULL;

UPDATE public.gestiones_cobranza gc
SET tenant_id = c.tenant_id
FROM public.cobranzas c
WHERE gc.cobranza_id = c.id
  AND c.tenant_id IS NOT NULL
  AND (gc.tenant_id IS NULL OR gc.tenant_id <> c.tenant_id);

UPDATE public.gestiones_cobranza gc
SET tenant_id = cxc.tenant_id
FROM public.cuentas_por_cobrar cxc
WHERE gc.cuenta_por_cobrar_id = cxc.id
  AND cxc.tenant_id IS NOT NULL
  AND gc.tenant_id IS NULL;

UPDATE public.gestiones_cobranza gc
SET tenant_id = cli.tenant_id
FROM public.clientes cli
WHERE gc.cliente_id = cli.id
  AND cli.tenant_id IS NOT NULL
  AND gc.tenant_id IS NULL;

UPDATE public.pagos_facturas pf
SET tenant_id = cxp.tenant_id
FROM public.cuentas_por_pagar cxp
WHERE pf.cuenta_por_pagar_id = cxp.id
  AND cxp.tenant_id IS NOT NULL
  AND (pf.tenant_id IS NULL OR pf.tenant_id <> cxp.tenant_id);

UPDATE public.pagos_facturas pf
SET tenant_id = p.tenant_id
FROM public.proveedores p
WHERE pf.proveedor_id = p.id
  AND p.tenant_id IS NOT NULL
  AND pf.tenant_id IS NULL;

UPDATE public.pagos_facturas pf
SET tenant_id = cb.tenant_id
FROM public.cuentas_bancarias cb
WHERE pf.cuenta_bancaria_id = cb.id
  AND cb.tenant_id IS NOT NULL
  AND pf.tenant_id IS NULL;

UPDATE public.pagos_facturas pf
SET tenant_id = d.tenant_id
FROM public.documentos d
WHERE pf.documento_id = d.id
  AND d.tenant_id IS NOT NULL
  AND pf.tenant_id IS NULL;

-- ----------------------------------------------------------------------------
-- FKs runtime para joins/embeds.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('gastos', 'centro_costo_id', 'centros_costo', 'id', 'gastos_centro_costo_id_fkey');
SELECT app.add_fk_if_possible('gastos', 'proveedor_id', 'proveedores', 'id', 'gastos_proveedor_id_fkey');
SELECT app.add_fk_if_possible('gastos', 'cuenta_contable_id', 'plan_cuentas', 'id', 'gastos_cuenta_contable_id_fkey');
SELECT app.add_fk_if_possible('gastos', 'usuario_id', 'usuarios_sistema', 'id', 'gastos_usuario_id_fkey');

SELECT app.add_fk_if_possible('egresos', 'cuenta_por_pagar_id', 'cuentas_por_pagar', 'id', 'egresos_cuenta_por_pagar_id_fkey');
SELECT app.add_fk_if_possible('egresos', 'proveedor_id', 'proveedores', 'id', 'egresos_proveedor_id_fkey');
SELECT app.add_fk_if_possible('egresos', 'cuenta_bancaria_id', 'cuentas_bancarias', 'id', 'egresos_cuenta_bancaria_id_fkey');
SELECT app.add_fk_if_possible('egresos', 'usuario_id', 'usuarios_sistema', 'id', 'egresos_usuario_id_fkey');

SELECT app.add_fk_if_possible('cobranzas', 'cliente_id', 'clientes', 'id', 'cobranzas_cliente_id_fkey');
SELECT app.add_fk_if_possible('cobranzas', 'cuenta_por_cobrar_id', 'cuentas_por_cobrar', 'id', 'cobranzas_cuenta_por_cobrar_id_fkey');
SELECT app.add_fk_if_possible('cobranzas', 'responsable_id', 'usuarios_sistema', 'id', 'cobranzas_responsable_id_fkey');

SELECT app.add_fk_if_possible('gestiones_cobranza', 'cobranza_id', 'cobranzas', 'id', 'gestiones_cobranza_cobranza_id_fkey');
SELECT app.add_fk_if_possible('gestiones_cobranza', 'cliente_id', 'clientes', 'id', 'gestiones_cobranza_cliente_id_fkey');
SELECT app.add_fk_if_possible('gestiones_cobranza', 'cuenta_por_cobrar_id', 'cuentas_por_cobrar', 'id', 'gestiones_cobranza_cuenta_por_cobrar_id_fkey');
SELECT app.add_fk_if_possible('gestiones_cobranza', 'usuario_id', 'usuarios_sistema', 'id', 'gestiones_cobranza_usuario_id_fkey');

SELECT app.add_fk_if_possible('pagos_facturas', 'cuenta_por_pagar_id', 'cuentas_por_pagar', 'id', 'pagos_facturas_cuenta_por_pagar_id_fkey');
SELECT app.add_fk_if_possible('pagos_facturas', 'proveedor_id', 'proveedores', 'id', 'pagos_facturas_proveedor_id_fkey');
SELECT app.add_fk_if_possible('pagos_facturas', 'documento_id', 'documentos', 'id', 'pagos_facturas_documento_id_fkey');
SELECT app.add_fk_if_possible('pagos_facturas', 'cuenta_bancaria_id', 'cuentas_bancarias', 'id', 'pagos_facturas_cuenta_bancaria_id_fkey');
SELECT app.add_fk_if_possible('pagos_facturas', 'usuario_id', 'usuarios_sistema', 'id', 'pagos_facturas_usuario_id_fkey');

-- ----------------------------------------------------------------------------
-- Dedupe operativo para soportar unicidades de referencia/idempotencia.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    c.id,
    c.referencia,
    row_number() OVER (
      PARTITION BY c.tenant_id, upper(btrim(c.referencia))
      ORDER BY COALESCE(c.updated_at, c.created_at, now()) DESC, c.id::text DESC
    ) AS rn
  FROM public.cobranzas c
  WHERE c.tenant_id IS NOT NULL
    AND c.referencia IS NOT NULL
    AND btrim(c.referencia) <> ''
)
UPDATE public.cobranzas c
SET
  referencia = format('%s-DUP-%s', upper(btrim(r.referencia)), r.rn),
  updated_at = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    e.id,
    e.referencia,
    row_number() OVER (
      PARTITION BY e.tenant_id, upper(btrim(e.referencia))
      ORDER BY COALESCE(e.updated_at, e.created_at, now()) DESC, e.id::text DESC
    ) AS rn
  FROM public.egresos e
  WHERE e.tenant_id IS NOT NULL
    AND e.referencia IS NOT NULL
    AND btrim(e.referencia) <> ''
)
UPDATE public.egresos e
SET
  referencia = format('%s-DUP-%s', upper(btrim(r.referencia)), r.rn),
  updated_at = now()
FROM ranked r
WHERE e.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    pf.id,
    pf.referencia,
    row_number() OVER (
      PARTITION BY pf.tenant_id, upper(btrim(pf.referencia))
      ORDER BY COALESCE(pf.updated_at, pf.created_at, now()) DESC, pf.id::text DESC
    ) AS rn
  FROM public.pagos_facturas pf
  WHERE pf.tenant_id IS NOT NULL
    AND pf.referencia IS NOT NULL
    AND btrim(pf.referencia) <> ''
)
UPDATE public.pagos_facturas pf
SET
  referencia = format('%s-DUP-%s', upper(btrim(r.referencia)), r.rn),
  updated_at = now()
FROM ranked r
WHERE pf.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    pf.id,
    pf.idempotency_key,
    row_number() OVER (
      PARTITION BY pf.tenant_id, lower(btrim(pf.idempotency_key))
      ORDER BY COALESCE(pf.updated_at, pf.created_at, now()) DESC, pf.id::text DESC
    ) AS rn
  FROM public.pagos_facturas pf
  WHERE pf.tenant_id IS NOT NULL
    AND pf.idempotency_key IS NOT NULL
    AND btrim(pf.idempotency_key) <> ''
)
UPDATE public.pagos_facturas pf
SET
  idempotency_key = format('%s-dup-%s', lower(btrim(r.idempotency_key)), r.rn),
  updated_at = now()
FROM ranked r
WHERE pf.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    pf.id,
    row_number() OVER (
      PARTITION BY pf.tenant_id, pf.event_id
      ORDER BY COALESCE(pf.updated_at, pf.created_at, now()) DESC, pf.id::text DESC
    ) AS rn
  FROM public.pagos_facturas pf
  WHERE pf.tenant_id IS NOT NULL
    AND pf.event_id IS NOT NULL
)
UPDATE public.pagos_facturas pf
SET
  event_id = NULL,
  updated_at = now()
FROM ranked r
WHERE pf.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: gastos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_gastos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.centro_costo_id := app.to_uuid_or_null(COALESCE(NEW.centro_costo_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.cuenta_contable_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_contable_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  IF NEW.centro_costo_id IS NOT NULL THEN
    SELECT cc.tenant_id INTO v_ref_tenant
    FROM public.centros_costo cc
    WHERE cc.id = NEW.centro_costo_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Centro de costo no existe: %s', NEW.centro_costo_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con centro_costo de gastos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.proveedor_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_ref_tenant
    FROM public.proveedores p
    WHERE p.id = NEW.proveedor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Proveedor no existe: %s', NEW.proveedor_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con proveedor de gastos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cuenta_contable_id IS NOT NULL THEN
    SELECT pc.tenant_id INTO v_ref_tenant
    FROM public.plan_cuentas pc
    WHERE pc.id = NEW.cuenta_contable_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cuenta contable no existe: %s', NEW.cuenta_contable_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cuenta contable de gastos', ERRCODE = '23514';
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
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con usuario de gastos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en gastos', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_gastos_tenant_consistency ON public.gastos;
CREATE TRIGGER trg_enforce_gastos_tenant_consistency
BEFORE INSERT OR UPDATE ON public.gastos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_gastos_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: egresos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_egresos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cuenta_por_pagar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_pagar_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  IF NEW.cuenta_por_pagar_id IS NOT NULL THEN
    SELECT cxp.tenant_id INTO v_ref_tenant
    FROM public.cuentas_por_pagar cxp
    WHERE cxp.id = NEW.cuenta_por_pagar_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cuenta por pagar no existe: %s', NEW.cuenta_por_pagar_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cuenta_por_pagar de egresos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.proveedor_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_ref_tenant
    FROM public.proveedores p
    WHERE p.id = NEW.proveedor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Proveedor no existe: %s', NEW.proveedor_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con proveedor de egresos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cuenta_bancaria_id IS NOT NULL THEN
    SELECT cb.tenant_id INTO v_ref_tenant
    FROM public.cuentas_bancarias cb
    WHERE cb.id = NEW.cuenta_bancaria_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cuenta bancaria no existe: %s', NEW.cuenta_bancaria_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cuenta_bancaria de egresos', ERRCODE = '23514';
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
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con usuario de egresos', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en egresos', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_egresos_tenant_consistency ON public.egresos;
CREATE TRIGGER trg_enforce_egresos_tenant_consistency
BEFORE INSERT OR UPDATE ON public.egresos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_egresos_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: cobranzas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_cobranzas_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.cuenta_por_cobrar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_cobrar_id::text, ''));
  NEW.responsable_id := app.to_uuid_or_null(COALESCE(NEW.responsable_id::text, ''));

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
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cuenta_por_cobrar de cobranzas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT cli.tenant_id INTO v_ref_tenant
    FROM public.clientes cli
    WHERE cli.id = NEW.cliente_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cliente no existe: %s', NEW.cliente_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cliente de cobranzas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.responsable_id IS NOT NULL THEN
    SELECT u.tenant_id INTO v_ref_tenant
    FROM public.usuarios_sistema u
    WHERE u.id = NEW.responsable_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Usuario responsable no existe: %s', NEW.responsable_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con usuario responsable de cobranzas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en cobranzas', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cobranzas_tenant_consistency ON public.cobranzas;
CREATE TRIGGER trg_enforce_cobranzas_tenant_consistency
BEFORE INSERT OR UPDATE ON public.cobranzas
FOR EACH ROW
EXECUTE FUNCTION app.enforce_cobranzas_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: gestiones_cobranza.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_gestiones_cobranza_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cobranza_id := app.to_uuid_or_null(COALESCE(NEW.cobranza_id::text, ''));
  NEW.cliente_id := app.to_uuid_or_null(COALESCE(NEW.cliente_id::text, ''));
  NEW.cuenta_por_cobrar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_cobrar_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));

  IF NEW.cobranza_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_ref_tenant
    FROM public.cobranzas c
    WHERE c.id = NEW.cobranza_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cobranza no existe: %s', NEW.cobranza_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cobranza en gestiones_cobranza', ERRCODE = '23514';
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
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cuenta_por_cobrar en gestiones_cobranza', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT cli.tenant_id INTO v_ref_tenant
    FROM public.clientes cli
    WHERE cli.id = NEW.cliente_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cliente no existe: %s', NEW.cliente_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cliente en gestiones_cobranza', ERRCODE = '23514';
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
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con usuario en gestiones_cobranza', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en gestiones_cobranza', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_gestiones_cobranza_tenant_consistency ON public.gestiones_cobranza;
CREATE TRIGGER trg_enforce_gestiones_cobranza_tenant_consistency
BEFORE INSERT OR UPDATE ON public.gestiones_cobranza
FOR EACH ROW
EXECUTE FUNCTION app.enforce_gestiones_cobranza_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant: pagos_facturas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_pagos_facturas_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_ref_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cuenta_por_pagar_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_por_pagar_id::text, ''));
  NEW.proveedor_id := app.to_uuid_or_null(COALESCE(NEW.proveedor_id::text, ''));
  NEW.documento_id := app.to_uuid_or_null(COALESCE(NEW.documento_id::text, ''));
  NEW.cuenta_bancaria_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_bancaria_id::text, ''));
  NEW.usuario_id := app.to_uuid_or_null(COALESCE(NEW.usuario_id::text, ''));
  NEW.event_id := app.to_uuid_or_null(COALESCE(NEW.event_id::text, ''));

  IF NEW.cuenta_por_pagar_id IS NOT NULL THEN
    SELECT cxp.tenant_id INTO v_ref_tenant
    FROM public.cuentas_por_pagar cxp
    WHERE cxp.id = NEW.cuenta_por_pagar_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cuenta por pagar no existe: %s', NEW.cuenta_por_pagar_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cuenta_por_pagar de pagos_facturas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.proveedor_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_ref_tenant
    FROM public.proveedores p
    WHERE p.id = NEW.proveedor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Proveedor no existe: %s', NEW.proveedor_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con proveedor de pagos_facturas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.documento_id IS NOT NULL THEN
    SELECT d.tenant_id INTO v_ref_tenant
    FROM public.documentos d
    WHERE d.id = NEW.documento_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Documento no existe: %s', NEW.documento_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con documento de pagos_facturas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cuenta_bancaria_id IS NOT NULL THEN
    SELECT cb.tenant_id INTO v_ref_tenant
    FROM public.cuentas_bancarias cb
    WHERE cb.id = NEW.cuenta_bancaria_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('Cuenta bancaria no existe: %s', NEW.cuenta_bancaria_id), ERRCODE = '23503';
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_ref_tenant;
    ELSIF v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cuenta_bancaria de pagos_facturas', ERRCODE = '23514';
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
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con usuario de pagos_facturas', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en pagos_facturas', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pagos_facturas_tenant_consistency ON public.pagos_facturas;
CREATE TRIGGER trg_enforce_pagos_facturas_tenant_consistency
BEFORE INSERT OR UPDATE ON public.pagos_facturas
FOR EACH ROW
EXECUTE FUNCTION app.enforce_pagos_facturas_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio.
-- ----------------------------------------------------------------------------
ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS ck_gastos_monto_nonnegative_runtime;
ALTER TABLE public.gastos
  ADD CONSTRAINT ck_gastos_monto_nonnegative_runtime
  CHECK (monto >= 0);

ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS ck_gastos_estado_runtime;
ALTER TABLE public.gastos
  ADD CONSTRAINT ck_gastos_estado_runtime
  CHECK (upper(estado) IN ('REGISTRADO', 'APROBADO', 'PAGADO', 'ANULADO'));

ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS ck_gastos_tipo_runtime;
ALTER TABLE public.gastos
  ADD CONSTRAINT ck_gastos_tipo_runtime
  CHECK (tipo_gasto IN ('OPERATIVO', 'ADMINISTRATIVO', 'VENTAS', 'FINANCIERO', 'TRIBUTARIO', 'LOGISTICO'));

ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS ck_gastos_moneda_len_runtime;
ALTER TABLE public.gastos
  ADD CONSTRAINT ck_gastos_moneda_len_runtime
  CHECK (moneda IS NULL OR char_length(btrim(moneda)) = 3);

ALTER TABLE public.egresos DROP CONSTRAINT IF EXISTS ck_egresos_monto_nonnegative_runtime;
ALTER TABLE public.egresos
  ADD CONSTRAINT ck_egresos_monto_nonnegative_runtime
  CHECK (monto >= 0);

ALTER TABLE public.egresos DROP CONSTRAINT IF EXISTS ck_egresos_estado_runtime;
ALTER TABLE public.egresos
  ADD CONSTRAINT ck_egresos_estado_runtime
  CHECK (upper(estado) IN ('REGISTRADO', 'APLICADO', 'ANULADO'));

ALTER TABLE public.egresos DROP CONSTRAINT IF EXISTS ck_egresos_tipo_runtime;
ALTER TABLE public.egresos
  ADD CONSTRAINT ck_egresos_tipo_runtime
  CHECK (tipo_egreso IN ('PAGO_PROVEEDOR', 'NOMINA', 'TRIBUTO', 'SERVICIO', 'TRANSFERENCIA', 'CAJA_CHICA', 'OTRO'));

ALTER TABLE public.egresos DROP CONSTRAINT IF EXISTS ck_egresos_moneda_len_runtime;
ALTER TABLE public.egresos
  ADD CONSTRAINT ck_egresos_moneda_len_runtime
  CHECK (moneda IS NULL OR char_length(btrim(moneda)) = 3);

ALTER TABLE public.cobranzas DROP CONSTRAINT IF EXISTS ck_cobranzas_montos_runtime;
ALTER TABLE public.cobranzas
  ADD CONSTRAINT ck_cobranzas_montos_runtime
  CHECK (
    monto >= 0
    AND monto_cobrado >= 0
    AND saldo >= 0
    AND monto_cobrado <= monto + 0.01
  );

ALTER TABLE public.cobranzas DROP CONSTRAINT IF EXISTS ck_cobranzas_estado_runtime;
ALTER TABLE public.cobranzas
  ADD CONSTRAINT ck_cobranzas_estado_runtime
  CHECK (upper(estado) IN ('PENDIENTE', 'EN_GESTION', 'VENCIDA', 'COBRADA', 'ANULADA'));

ALTER TABLE public.cobranzas DROP CONSTRAINT IF EXISTS ck_cobranzas_prioridad_runtime;
ALTER TABLE public.cobranzas
  ADD CONSTRAINT ck_cobranzas_prioridad_runtime
  CHECK (prioridad IN ('ALTA', 'MEDIA', 'BAJA'));

ALTER TABLE public.cobranzas DROP CONSTRAINT IF EXISTS ck_cobranzas_canal_runtime;
ALTER TABLE public.cobranzas
  ADD CONSTRAINT ck_cobranzas_canal_runtime
  CHECK (canal IN ('SISTEMA', 'LLAMADA', 'EMAIL', 'WHATSAPP', 'VISITA', 'SMS', 'OTRO'));

ALTER TABLE public.cobranzas DROP CONSTRAINT IF EXISTS ck_cobranzas_fecha_cobro_runtime;
ALTER TABLE public.cobranzas
  ADD CONSTRAINT ck_cobranzas_fecha_cobro_runtime
  CHECK (upper(estado) <> 'COBRADA' OR fecha_cobro IS NOT NULL);

ALTER TABLE public.gestiones_cobranza DROP CONSTRAINT IF EXISTS ck_gestiones_cobranza_monto_compromiso_nonnegative_runtime;
ALTER TABLE public.gestiones_cobranza
  ADD CONSTRAINT ck_gestiones_cobranza_monto_compromiso_nonnegative_runtime
  CHECK (monto_compromiso >= 0);

ALTER TABLE public.gestiones_cobranza DROP CONSTRAINT IF EXISTS ck_gestiones_cobranza_estado_runtime;
ALTER TABLE public.gestiones_cobranza
  ADD CONSTRAINT ck_gestiones_cobranza_estado_runtime
  CHECK (upper(estado) IN ('REGISTRADA', 'ANULADA'));

ALTER TABLE public.gestiones_cobranza DROP CONSTRAINT IF EXISTS ck_gestiones_cobranza_tipo_runtime;
ALTER TABLE public.gestiones_cobranza
  ADD CONSTRAINT ck_gestiones_cobranza_tipo_runtime
  CHECK (tipo_gestion IN ('LLAMADA', 'EMAIL', 'WHATSAPP', 'VISITA', 'SMS', 'NOTIFICACION', 'OTRO'));

ALTER TABLE public.gestiones_cobranza DROP CONSTRAINT IF EXISTS ck_gestiones_cobranza_resultado_runtime;
ALTER TABLE public.gestiones_cobranza
  ADD CONSTRAINT ck_gestiones_cobranza_resultado_runtime
  CHECK (resultado IN ('SIN_RESPUESTA', 'PROMESA_PAGO', 'PAGO_PARCIAL', 'PAGO_TOTAL', 'RECHAZADO', 'REPROGRAMADO', 'OTRO'));

ALTER TABLE public.pagos_facturas DROP CONSTRAINT IF EXISTS ck_pagos_facturas_monto_nonnegative_runtime;
ALTER TABLE public.pagos_facturas
  ADD CONSTRAINT ck_pagos_facturas_monto_nonnegative_runtime
  CHECK (monto >= 0);

ALTER TABLE public.pagos_facturas DROP CONSTRAINT IF EXISTS ck_pagos_facturas_estado_runtime;
ALTER TABLE public.pagos_facturas
  ADD CONSTRAINT ck_pagos_facturas_estado_runtime
  CHECK (upper(estado) IN ('PENDIENTE', 'APLICADO', 'ANULADO'));

ALTER TABLE public.pagos_facturas DROP CONSTRAINT IF EXISTS ck_pagos_facturas_moneda_len_runtime;
ALTER TABLE public.pagos_facturas
  ADD CONSTRAINT ck_pagos_facturas_moneda_len_runtime
  CHECK (moneda IS NULL OR char_length(btrim(moneda)) = 3);

ALTER TABLE public.pagos_facturas DROP CONSTRAINT IF EXISTS ck_pagos_facturas_aplicado_runtime;
ALTER TABLE public.pagos_facturas
  ADD CONSTRAINT ck_pagos_facturas_aplicado_runtime
  CHECK (upper(estado) <> 'APLICADO' OR aplicado_en IS NOT NULL);

ALTER TABLE public.gastos VALIDATE CONSTRAINT ck_gastos_monto_nonnegative_runtime;
ALTER TABLE public.gastos VALIDATE CONSTRAINT ck_gastos_estado_runtime;
ALTER TABLE public.gastos VALIDATE CONSTRAINT ck_gastos_tipo_runtime;
ALTER TABLE public.gastos VALIDATE CONSTRAINT ck_gastos_moneda_len_runtime;

ALTER TABLE public.egresos VALIDATE CONSTRAINT ck_egresos_monto_nonnegative_runtime;
ALTER TABLE public.egresos VALIDATE CONSTRAINT ck_egresos_estado_runtime;
ALTER TABLE public.egresos VALIDATE CONSTRAINT ck_egresos_tipo_runtime;
ALTER TABLE public.egresos VALIDATE CONSTRAINT ck_egresos_moneda_len_runtime;

ALTER TABLE public.cobranzas VALIDATE CONSTRAINT ck_cobranzas_montos_runtime;
ALTER TABLE public.cobranzas VALIDATE CONSTRAINT ck_cobranzas_estado_runtime;
ALTER TABLE public.cobranzas VALIDATE CONSTRAINT ck_cobranzas_prioridad_runtime;
ALTER TABLE public.cobranzas VALIDATE CONSTRAINT ck_cobranzas_canal_runtime;
ALTER TABLE public.cobranzas VALIDATE CONSTRAINT ck_cobranzas_fecha_cobro_runtime;

ALTER TABLE public.gestiones_cobranza VALIDATE CONSTRAINT ck_gestiones_cobranza_monto_compromiso_nonnegative_runtime;
ALTER TABLE public.gestiones_cobranza VALIDATE CONSTRAINT ck_gestiones_cobranza_estado_runtime;
ALTER TABLE public.gestiones_cobranza VALIDATE CONSTRAINT ck_gestiones_cobranza_tipo_runtime;
ALTER TABLE public.gestiones_cobranza VALIDATE CONSTRAINT ck_gestiones_cobranza_resultado_runtime;

ALTER TABLE public.pagos_facturas VALIDATE CONSTRAINT ck_pagos_facturas_monto_nonnegative_runtime;
ALTER TABLE public.pagos_facturas VALIDATE CONSTRAINT ck_pagos_facturas_estado_runtime;
ALTER TABLE public.pagos_facturas VALIDATE CONSTRAINT ck_pagos_facturas_moneda_len_runtime;
ALTER TABLE public.pagos_facturas VALIDATE CONSTRAINT ck_pagos_facturas_aplicado_runtime;

-- ----------------------------------------------------------------------------
-- Unicidades operativas e indices.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobranzas_tenant_referencia
ON public.cobranzas (tenant_id, upper(btrim(referencia)))
WHERE tenant_id IS NOT NULL
  AND referencia IS NOT NULL
  AND btrim(referencia) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_egresos_tenant_referencia
ON public.egresos (tenant_id, upper(btrim(referencia)))
WHERE tenant_id IS NOT NULL
  AND referencia IS NOT NULL
  AND btrim(referencia) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_facturas_tenant_referencia
ON public.pagos_facturas (tenant_id, upper(btrim(referencia)))
WHERE tenant_id IS NOT NULL
  AND referencia IS NOT NULL
  AND btrim(referencia) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_facturas_tenant_idempotency
ON public.pagos_facturas (tenant_id, lower(btrim(idempotency_key)))
WHERE tenant_id IS NOT NULL
  AND idempotency_key IS NOT NULL
  AND btrim(idempotency_key) <> '';

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'gastos');
SELECT app.apply_tenant_policy('public', 'egresos');
SELECT app.apply_tenant_policy('public', 'cobranzas');
SELECT app.apply_tenant_policy('public', 'gestiones_cobranza');
SELECT app.apply_tenant_policy('public', 'pagos_facturas');

COMMIT;
