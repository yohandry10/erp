-- ============================================================================
-- 180__contabilidad_activos_consignacion_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para:
-- activos_fijos, depreciaciones, registro_consignaciones, movimientos_consignacion,
-- inventarios_permanentes, asignacion_costos, calendario_empresa,
-- saldos_iniciales_cuentas.
-- ============================================================================

BEGIN;

-- Backfill tenant por relaciones
UPDATE public.activos_fijos a
SET tenant_id = cc.tenant_id
FROM public.centros_costo cc
WHERE a.centro_costo_id = cc.id
  AND cc.tenant_id IS NOT NULL
  AND (a.tenant_id IS NULL OR a.tenant_id <> cc.tenant_id);

UPDATE public.depreciaciones d
SET
  tenant_id = a.tenant_id,
  activo_id = COALESCE(d.activo_id, a.id)
FROM public.activos_fijos a
WHERE d.activo_id = a.id
  AND a.tenant_id IS NOT NULL
  AND (d.tenant_id IS NULL OR d.tenant_id <> a.tenant_id);

UPDATE public.depreciaciones d
SET tenant_id = cc.tenant_id
FROM public.centros_costo cc
WHERE d.centro_costo_id = cc.id
  AND cc.tenant_id IS NOT NULL
  AND d.tenant_id IS NULL;

UPDATE public.registro_consignaciones r
SET tenant_id = p.tenant_id
FROM public.productos p
WHERE r.producto_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (r.tenant_id IS NULL OR r.tenant_id <> p.tenant_id);

UPDATE public.movimientos_consignacion m
SET
  tenant_id = r.tenant_id,
  registro_id = COALESCE(m.registro_id, m.consignacion_id, r.id),
  consignacion_id = COALESCE(m.consignacion_id, m.registro_id, r.id)
FROM public.registro_consignaciones r
WHERE COALESCE(m.registro_id, m.consignacion_id) = r.id
  AND r.tenant_id IS NOT NULL
  AND (
    m.tenant_id IS NULL OR m.tenant_id <> r.tenant_id
    OR m.registro_id IS NULL OR m.consignacion_id IS NULL
  );

UPDATE public.movimientos_consignacion m
SET tenant_id = p.tenant_id
FROM public.productos p
WHERE m.producto_id = p.id
  AND p.tenant_id IS NOT NULL
  AND m.tenant_id IS NULL;

UPDATE public.inventarios_permanentes i
SET tenant_id = p.tenant_id
FROM public.productos p
WHERE i.producto_id = p.id
  AND p.tenant_id IS NOT NULL
  AND (i.tenant_id IS NULL OR i.tenant_id <> p.tenant_id);

UPDATE public.inventarios_permanentes i
SET tenant_id = a.tenant_id
FROM public.almacenes a
WHERE i.almacen_id = a.id
  AND a.tenant_id IS NOT NULL
  AND i.tenant_id IS NULL;

UPDATE public.asignacion_costos a
SET tenant_id = cc.tenant_id
FROM public.centros_costo cc
WHERE a.centro_costo_id = cc.id
  AND cc.tenant_id IS NOT NULL
  AND (a.tenant_id IS NULL OR a.tenant_id <> cc.tenant_id);

UPDATE public.saldos_iniciales_cuentas s
SET tenant_id = pc.tenant_id
FROM public.plan_cuentas pc
WHERE s.cuenta_id = pc.id
  AND pc.tenant_id IS NOT NULL
  AND (s.tenant_id IS NULL OR s.tenant_id <> pc.tenant_id);

-- FKs runtime
SELECT app.add_fk_if_possible('activos_fijos', 'centro_costo_id', 'centros_costo', 'id', 'activos_fijos_centro_costo_id_fkey_runtime');
SELECT app.add_fk_if_possible('depreciaciones', 'activo_id', 'activos_fijos', 'id', 'depreciaciones_activo_id_fkey_runtime');
SELECT app.add_fk_if_possible('depreciaciones', 'centro_costo_id', 'centros_costo', 'id', 'depreciaciones_centro_costo_id_fkey_runtime');
SELECT app.add_fk_if_possible('registro_consignaciones', 'producto_id', 'productos', 'id', 'registro_consignaciones_producto_id_fkey_runtime');
SELECT app.add_fk_if_possible('movimientos_consignacion', 'registro_id', 'registro_consignaciones', 'id', 'movimientos_consignacion_registro_id_fkey_runtime');
SELECT app.add_fk_if_possible('movimientos_consignacion', 'consignacion_id', 'registro_consignaciones', 'id', 'movimientos_consignacion_consignacion_id_fkey_runtime');
SELECT app.add_fk_if_possible('movimientos_consignacion', 'producto_id', 'productos', 'id', 'movimientos_consignacion_producto_id_fkey_runtime');
SELECT app.add_fk_if_possible('inventarios_permanentes', 'producto_id', 'productos', 'id', 'inventarios_permanentes_producto_id_fkey_runtime');
SELECT app.add_fk_if_possible('inventarios_permanentes', 'almacen_id', 'almacenes', 'id', 'inventarios_permanentes_almacen_id_fkey_runtime');
SELECT app.add_fk_if_possible('asignacion_costos', 'centro_costo_id', 'centros_costo', 'id', 'asignacion_costos_centro_costo_id_fkey_runtime');
SELECT app.add_fk_if_possible('saldos_iniciales_cuentas', 'cuenta_id', 'plan_cuentas', 'id', 'saldos_iniciales_cuentas_cuenta_id_fkey_runtime');

-- Dedupe operativo
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, upper(btrim(codigo))
           ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
         ) AS rn
  FROM public.activos_fijos
  WHERE tenant_id IS NOT NULL
    AND codigo IS NOT NULL
    AND btrim(codigo) <> ''
    AND estado IN ('ACTIVO', 'INACTIVO', 'DEPRECIADO')
)
UPDATE public.activos_fijos a
SET codigo = format('%s-DUP-%s', upper(btrim(a.codigo)), r.rn),
    updated_at = now()
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, activo_id, periodo
           ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
         ) AS rn
  FROM public.depreciaciones
  WHERE tenant_id IS NOT NULL
    AND activo_id IS NOT NULL
    AND periodo IS NOT NULL
    AND estado IN ('PENDIENTE', 'PROCESADA')
)
UPDATE public.depreciaciones d
SET estado = 'ANULADA',
    activo = false,
    updated_at = now()
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, upper(btrim(numero))
           ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
         ) AS rn
  FROM public.registro_consignaciones
  WHERE tenant_id IS NOT NULL
    AND numero IS NOT NULL
    AND btrim(numero) <> ''
    AND estado IN ('PENDIENTE', 'VENDIDA', 'DEVUELTA', 'CERRADA')
)
UPDATE public.registro_consignaciones r
SET numero = format('%s-DUP-%s', upper(btrim(r.numero)), ranked.rn),
    updated_at = now()
FROM ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

WITH dups AS (
  SELECT tenant_id, producto_id, almacen_id, periodo
  FROM public.inventarios_permanentes
  WHERE tenant_id IS NOT NULL
    AND producto_id IS NOT NULL
    AND almacen_id IS NOT NULL
    AND periodo IS NOT NULL
  GROUP BY tenant_id, producto_id, almacen_id, periodo
  HAVING COUNT(*) > 1
), agg AS (
  SELECT
    i.tenant_id,
    i.producto_id,
    i.almacen_id,
    i.periodo,
    (array_agg(i.id ORDER BY COALESCE(i.updated_at, i.created_at, now()) DESC, i.id::text DESC))[1] AS keep_id,
    SUM(COALESCE(i.stock_inicial, 0)) AS stock_inicial_sum,
    SUM(COALESCE(i.entradas, 0)) AS entradas_sum,
    SUM(COALESCE(i.salidas, 0)) AS salidas_sum,
    MAX(COALESCE(i.costo_unitario, 0)) AS costo_max
  FROM public.inventarios_permanentes i
  JOIN dups d
    ON d.tenant_id = i.tenant_id
   AND d.producto_id = i.producto_id
   AND d.almacen_id = i.almacen_id
   AND d.periodo = i.periodo
  GROUP BY i.tenant_id, i.producto_id, i.almacen_id, i.periodo
), upd AS (
  UPDATE public.inventarios_permanentes i
  SET stock_inicial = GREATEST(a.stock_inicial_sum, 0),
      entradas = GREATEST(a.entradas_sum, 0),
      salidas = GREATEST(a.salidas_sum, 0),
      stock_final = GREATEST(a.stock_inicial_sum + a.entradas_sum - a.salidas_sum, 0),
      costo_unitario = GREATEST(a.costo_max, 0),
      valor_total = GREATEST((a.stock_inicial_sum + a.entradas_sum - a.salidas_sum) * a.costo_max, 0),
      updated_at = now()
  FROM agg a
  WHERE i.id = a.keep_id
  RETURNING a.tenant_id, a.producto_id, a.almacen_id, a.periodo, a.keep_id
)
DELETE FROM public.inventarios_permanentes i
USING upd u
WHERE i.tenant_id = u.tenant_id
  AND i.producto_id = u.producto_id
  AND i.almacen_id = u.almacen_id
  AND i.periodo = u.periodo
  AND i.id <> u.keep_id;

-- Triggers de consistencia tenant
CREATE OR REPLACE FUNCTION app.enforce_activos_fijos_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.centro_costo_id := app.to_uuid_or_null(COALESCE(NEW.centro_costo_id::text, ''));
  IF NEW.centro_costo_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.centros_costo WHERE id = NEW.centro_costo_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = format('centro_costo no existe: %s', NEW.centro_costo_id), ERRCODE = '23503'; END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con centro_costo en activos_fijos', ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en activos_fijos', ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_activos_fijos_tenant_consistency ON public.activos_fijos;
CREATE TRIGGER trg_enforce_activos_fijos_tenant_consistency BEFORE INSERT OR UPDATE ON public.activos_fijos FOR EACH ROW EXECUTE FUNCTION app.enforce_activos_fijos_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_depreciaciones_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.activo_id := app.to_uuid_or_null(COALESCE(NEW.activo_id::text, ''));
  IF NEW.activo_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.activos_fijos WHERE id = NEW.activo_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = format('activo no existe: %s', NEW.activo_id), ERRCODE = '23503'; END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con activo en depreciaciones', ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.tenant_id IS NULL OR NEW.periodo IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id/periodo obligatorios en depreciaciones', ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_depreciaciones_tenant_consistency ON public.depreciaciones;
CREATE TRIGGER trg_enforce_depreciaciones_tenant_consistency BEFORE INSERT OR UPDATE ON public.depreciaciones FOR EACH ROW EXECUTE FUNCTION app.enforce_depreciaciones_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_registro_consignaciones_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  IF NEW.producto_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.productos WHERE id = NEW.producto_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = format('producto no existe: %s', NEW.producto_id), ERRCODE = '23503'; END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con producto en registro_consignaciones', ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id obligatorio en registro_consignaciones', ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_registro_consignaciones_tenant_consistency ON public.registro_consignaciones;
CREATE TRIGGER trg_enforce_registro_consignaciones_tenant_consistency BEFORE INSERT OR UPDATE ON public.registro_consignaciones FOR EACH ROW EXECUTE FUNCTION app.enforce_registro_consignaciones_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_movimientos_consignacion_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.registro_id := COALESCE(app.to_uuid_or_null(COALESCE(NEW.registro_id::text, '')), app.to_uuid_or_null(COALESCE(NEW.consignacion_id::text, '')));
  NEW.consignacion_id := COALESCE(app.to_uuid_or_null(COALESCE(NEW.consignacion_id::text, '')), NEW.registro_id);
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  IF NEW.registro_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.registro_consignaciones WHERE id = NEW.registro_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = format('consignacion no existe: %s', NEW.registro_id), ERRCODE = '23503'; END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con registro en movimientos_consignacion', ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.producto_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.productos WHERE id = NEW.producto_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = format('producto no existe: %s', NEW.producto_id), ERRCODE = '23503'; END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con producto en movimientos_consignacion', ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id obligatorio en movimientos_consignacion', ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_movimientos_consignacion_tenant_consistency ON public.movimientos_consignacion;
CREATE TRIGGER trg_enforce_movimientos_consignacion_tenant_consistency BEFORE INSERT OR UPDATE ON public.movimientos_consignacion FOR EACH ROW EXECUTE FUNCTION app.enforce_movimientos_consignacion_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_inventarios_permanentes_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));
  IF NEW.producto_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.productos WHERE id = NEW.producto_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = format('producto no existe: %s', NEW.producto_id), ERRCODE = '23503'; END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con producto en inventarios_permanentes', ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.almacen_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.almacenes WHERE id = NEW.almacen_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = format('almacen no existe: %s', NEW.almacen_id), ERRCODE = '23503'; END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con almacen en inventarios_permanentes', ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.tenant_id IS NULL OR NEW.periodo IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id/periodo obligatorios en inventarios_permanentes', ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_inventarios_permanentes_tenant_consistency ON public.inventarios_permanentes;
CREATE TRIGGER trg_enforce_inventarios_permanentes_tenant_consistency BEFORE INSERT OR UPDATE ON public.inventarios_permanentes FOR EACH ROW EXECUTE FUNCTION app.enforce_inventarios_permanentes_tenant_consistency();

CREATE OR REPLACE FUNCTION app.enforce_saldos_iniciales_cuentas_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE v_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cuenta_id := app.to_uuid_or_null(COALESCE(NEW.cuenta_id::text, ''));
  IF NEW.cuenta_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.plan_cuentas WHERE id = NEW.cuenta_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = format('cuenta no existe: %s', NEW.cuenta_id), ERRCODE = '23503'; END IF;
    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant);
    IF v_tenant IS NOT NULL AND NEW.tenant_id <> v_tenant THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cuenta en saldos_iniciales_cuentas', ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.tenant_id IS NULL OR NEW.periodo IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'tenant_id/periodo obligatorios en saldos_iniciales_cuentas', ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_saldos_iniciales_cuentas_tenant_consistency ON public.saldos_iniciales_cuentas;
CREATE TRIGGER trg_enforce_saldos_iniciales_cuentas_tenant_consistency BEFORE INSERT OR UPDATE ON public.saldos_iniciales_cuentas FOR EACH ROW EXECUTE FUNCTION app.enforce_saldos_iniciales_cuentas_tenant_consistency();

-- Constraints
ALTER TABLE public.activos_fijos DROP CONSTRAINT IF EXISTS ck_activos_fijos_runtime;
ALTER TABLE public.activos_fijos ADD CONSTRAINT ck_activos_fijos_runtime CHECK (
  tenant_id IS NOT NULL
  AND valor_adquisicion >= 0
  AND depreciacion_acumulada >= 0
  AND depreciacion_acumulada <= valor_adquisicion
  AND vida_util >= 0
  AND moneda ~ '^[A-Z]{3}$'
  AND estado IN ('ACTIVO', 'INACTIVO', 'BAJA', 'VENDIDO', 'DEPRECIADO')
);

ALTER TABLE public.depreciaciones DROP CONSTRAINT IF EXISTS ck_depreciaciones_runtime;
ALTER TABLE public.depreciaciones ADD CONSTRAINT ck_depreciaciones_runtime CHECK (
  tenant_id IS NOT NULL
  AND activo_id IS NOT NULL
  AND periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  AND monto_depreciacion >= 0
  AND estado IN ('PENDIENTE', 'PROCESADA', 'ANULADA', 'ERROR')
);

ALTER TABLE public.registro_consignaciones DROP CONSTRAINT IF EXISTS ck_registro_consignaciones_runtime;
ALTER TABLE public.registro_consignaciones ADD CONSTRAINT ck_registro_consignaciones_runtime CHECK (
  tenant_id IS NOT NULL
  AND fecha_registro IS NOT NULL
  AND numero IS NOT NULL
  AND btrim(numero) <> ''
  AND cantidad >= 0
  AND valor_unitario >= 0
  AND valor_total >= 0
  AND moneda ~ '^[A-Z]{3}$'
  AND estado IN ('PENDIENTE', 'VENDIDA', 'DEVUELTA', 'ANULADA', 'CERRADA')
);

ALTER TABLE public.movimientos_consignacion DROP CONSTRAINT IF EXISTS ck_movimientos_consignacion_runtime;
ALTER TABLE public.movimientos_consignacion ADD CONSTRAINT ck_movimientos_consignacion_runtime CHECK (
  tenant_id IS NOT NULL
  AND COALESCE(registro_id, consignacion_id) IS NOT NULL
  AND cantidad >= 0
  AND valor_unitario >= 0
  AND valor_total >= 0
  AND tipo_movimiento IN ('ENTREGA', 'VENTA', 'DEVOLUCION', 'AJUSTE', 'ANULACION')
  AND estado IN ('ACTIVO', 'ANULADO')
);

ALTER TABLE public.inventarios_permanentes DROP CONSTRAINT IF EXISTS ck_inventarios_permanentes_runtime;
ALTER TABLE public.inventarios_permanentes ADD CONSTRAINT ck_inventarios_permanentes_runtime CHECK (
  tenant_id IS NOT NULL
  AND producto_id IS NOT NULL
  AND almacen_id IS NOT NULL
  AND periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  AND stock_inicial >= 0
  AND entradas >= 0
  AND salidas >= 0
  AND stock_final >= 0
  AND costo_unitario >= 0
  AND valor_total >= 0
  AND estado IN ('ABIERTO', 'CERRADO', 'ANULADO')
);

ALTER TABLE public.asignacion_costos DROP CONSTRAINT IF EXISTS ck_asignacion_costos_runtime;
ALTER TABLE public.asignacion_costos ADD CONSTRAINT ck_asignacion_costos_runtime CHECK (
  tenant_id IS NOT NULL
  AND centro_costo_id IS NOT NULL
  AND porcentaje >= 0
  AND porcentaje <= 100
  AND monto >= 0
  AND estado IN ('ACTIVA', 'INACTIVA', 'ANULADA')
);

ALTER TABLE public.calendario_empresa DROP CONSTRAINT IF EXISTS ck_calendario_empresa_runtime;
ALTER TABLE public.calendario_empresa ADD CONSTRAINT ck_calendario_empresa_runtime CHECK (
  tenant_id IS NOT NULL
  AND fecha IS NOT NULL
  AND periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  AND tipo_dia IN ('LABORABLE', 'FERIADO', 'NO_LABORABLE', 'ESPECIAL')
  AND estado IN ('ACTIVO', 'INACTIVO')
);

ALTER TABLE public.saldos_iniciales_cuentas DROP CONSTRAINT IF EXISTS ck_saldos_iniciales_cuentas_runtime;
ALTER TABLE public.saldos_iniciales_cuentas ADD CONSTRAINT ck_saldos_iniciales_cuentas_runtime CHECK (
  tenant_id IS NOT NULL
  AND cuenta_id IS NOT NULL
  AND periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  AND saldo_debe >= 0
  AND saldo_haber >= 0
  AND moneda ~ '^[A-Z]{3}$'
  AND estado IN ('ABIERTO', 'CERRADO', 'ANULADO')
);

-- Unicidades
CREATE UNIQUE INDEX IF NOT EXISTS ux_activos_fijos_tenant_codigo_activo
ON public.activos_fijos (tenant_id, upper(btrim(codigo)))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND estado IN ('ACTIVO', 'INACTIVO', 'DEPRECIADO');

CREATE UNIQUE INDEX IF NOT EXISTS ux_depreciaciones_tenant_activo_periodo_runtime
ON public.depreciaciones (tenant_id, activo_id, periodo)
WHERE tenant_id IS NOT NULL
  AND activo_id IS NOT NULL
  AND periodo IS NOT NULL
  AND estado IN ('PENDIENTE', 'PROCESADA');

CREATE UNIQUE INDEX IF NOT EXISTS ux_registro_consignaciones_tenant_numero_runtime
ON public.registro_consignaciones (tenant_id, upper(btrim(numero)))
WHERE tenant_id IS NOT NULL
  AND numero IS NOT NULL
  AND btrim(numero) <> ''
  AND estado IN ('PENDIENTE', 'VENDIDA', 'DEVUELTA', 'CERRADA');

CREATE UNIQUE INDEX IF NOT EXISTS ux_inventarios_permanentes_tenant_producto_almacen_periodo_runtime
ON public.inventarios_permanentes (tenant_id, producto_id, almacen_id, periodo)
WHERE tenant_id IS NOT NULL
  AND producto_id IS NOT NULL
  AND almacen_id IS NOT NULL
  AND periodo IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_calendario_empresa_tenant_fecha_runtime
ON public.calendario_empresa (tenant_id, fecha)
WHERE tenant_id IS NOT NULL
  AND fecha IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_saldos_iniciales_cuentas_tenant_cuenta_periodo_runtime
ON public.saldos_iniciales_cuentas (tenant_id, cuenta_id, periodo)
WHERE tenant_id IS NOT NULL
  AND cuenta_id IS NOT NULL
  AND periodo IS NOT NULL;

-- RLS hardening
ALTER TABLE IF EXISTS public.activos_fijos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activos_fijos FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.depreciaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.depreciaciones FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.registro_consignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.registro_consignaciones FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.movimientos_consignacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.movimientos_consignacion FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventarios_permanentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventarios_permanentes FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.asignacion_costos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.asignacion_costos FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.calendario_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.calendario_empresa FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.saldos_iniciales_cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.saldos_iniciales_cuentas FORCE ROW LEVEL SECURITY;

SELECT app.apply_tenant_policy('public', 'activos_fijos');
SELECT app.apply_tenant_policy('public', 'depreciaciones');
SELECT app.apply_tenant_policy('public', 'registro_consignaciones');
SELECT app.apply_tenant_policy('public', 'movimientos_consignacion');
SELECT app.apply_tenant_policy('public', 'inventarios_permanentes');
SELECT app.apply_tenant_policy('public', 'asignacion_costos');
SELECT app.apply_tenant_policy('public', 'calendario_empresa');
SELECT app.apply_tenant_policy('public', 'saldos_iniciales_cuentas');

COMMIT;
