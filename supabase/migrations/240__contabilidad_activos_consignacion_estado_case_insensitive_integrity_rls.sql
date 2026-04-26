-- ============================================================================
-- 240__contabilidad_activos_consignacion_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en contabilidad
-- de activos/consignacion.
-- Tablas foco:
--   public.activos_fijos
--   public.depreciaciones
--   public.registro_consignaciones
--   public.movimientos_consignacion
--   public.inventarios_permanentes
--   public.asignacion_costos
--   public.calendario_empresa
--   public.saldos_iniciales_cuentas
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.activos_fijos a
SET estado = app.normalize_activos_fijos_estado_239(a.estado::text)
WHERE a.id IS NOT NULL;

UPDATE public.depreciaciones d
SET estado = app.normalize_depreciaciones_estado_239(d.estado::text)
WHERE d.id IS NOT NULL;

UPDATE public.registro_consignaciones r
SET estado = app.normalize_registro_consignaciones_estado_239(r.estado::text)
WHERE r.id IS NOT NULL;

UPDATE public.movimientos_consignacion m
SET estado = app.normalize_movimientos_consignacion_estado_239(m.estado::text)
WHERE m.id IS NOT NULL;

UPDATE public.inventarios_permanentes i
SET estado = app.normalize_inventarios_permanentes_estado_239(i.estado::text)
WHERE i.id IS NOT NULL;

UPDATE public.asignacion_costos ac
SET estado = app.normalize_asignacion_costos_estado_239(ac.estado::text)
WHERE ac.id IS NOT NULL;

UPDATE public.calendario_empresa ce
SET estado = app.normalize_calendario_empresa_estado_239(ce.estado::text)
WHERE ce.id IS NOT NULL;

UPDATE public.saldos_iniciales_cuentas s
SET estado = app.normalize_saldos_iniciales_cuentas_estado_239(s.estado::text)
WHERE s.id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Constraints de dominio (case-insensitive) manteniendo reglas de negocio.
-- ----------------------------------------------------------------------------
ALTER TABLE public.activos_fijos DROP CONSTRAINT IF EXISTS ck_activos_fijos_runtime;
ALTER TABLE public.activos_fijos
  ADD CONSTRAINT ck_activos_fijos_runtime CHECK (
    tenant_id IS NOT NULL
    AND valor_adquisicion >= 0
    AND depreciacion_acumulada >= 0
    AND depreciacion_acumulada <= valor_adquisicion
    AND vida_util >= 0
    AND moneda ~ '^[A-Z]{3}$'
    AND lower(estado::text) IN ('activo', 'inactivo', 'baja', 'vendido', 'depreciado')
  ) NOT VALID;

ALTER TABLE public.depreciaciones DROP CONSTRAINT IF EXISTS ck_depreciaciones_runtime;
ALTER TABLE public.depreciaciones
  ADD CONSTRAINT ck_depreciaciones_runtime CHECK (
    tenant_id IS NOT NULL
    AND activo_id IS NOT NULL
    AND periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    AND monto_depreciacion >= 0
    AND lower(estado::text) IN ('pendiente', 'procesada', 'anulada', 'error')
  ) NOT VALID;

ALTER TABLE public.registro_consignaciones DROP CONSTRAINT IF EXISTS ck_registro_consignaciones_runtime;
ALTER TABLE public.registro_consignaciones
  ADD CONSTRAINT ck_registro_consignaciones_runtime CHECK (
    tenant_id IS NOT NULL
    AND fecha_registro IS NOT NULL
    AND numero IS NOT NULL
    AND btrim(numero) <> ''
    AND cantidad >= 0
    AND valor_unitario >= 0
    AND valor_total >= 0
    AND moneda ~ '^[A-Z]{3}$'
    AND lower(estado::text) IN ('pendiente', 'vendida', 'devuelta', 'anulada', 'cerrada')
  ) NOT VALID;

ALTER TABLE public.movimientos_consignacion DROP CONSTRAINT IF EXISTS ck_movimientos_consignacion_runtime;
ALTER TABLE public.movimientos_consignacion
  ADD CONSTRAINT ck_movimientos_consignacion_runtime CHECK (
    tenant_id IS NOT NULL
    AND COALESCE(registro_id, consignacion_id) IS NOT NULL
    AND cantidad >= 0
    AND valor_unitario >= 0
    AND valor_total >= 0
    AND tipo_movimiento IN ('ENTREGA', 'VENTA', 'DEVOLUCION', 'AJUSTE', 'ANULACION')
    AND lower(estado::text) IN ('activo', 'anulado')
  ) NOT VALID;

ALTER TABLE public.inventarios_permanentes DROP CONSTRAINT IF EXISTS ck_inventarios_permanentes_runtime;
ALTER TABLE public.inventarios_permanentes
  ADD CONSTRAINT ck_inventarios_permanentes_runtime CHECK (
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
    AND lower(estado::text) IN ('abierto', 'cerrado', 'anulado')
  ) NOT VALID;

ALTER TABLE public.asignacion_costos DROP CONSTRAINT IF EXISTS ck_asignacion_costos_runtime;
ALTER TABLE public.asignacion_costos
  ADD CONSTRAINT ck_asignacion_costos_runtime CHECK (
    tenant_id IS NOT NULL
    AND centro_costo_id IS NOT NULL
    AND porcentaje >= 0
    AND porcentaje <= 100
    AND monto >= 0
    AND lower(estado::text) IN ('activa', 'inactiva', 'anulada')
  ) NOT VALID;

ALTER TABLE public.calendario_empresa DROP CONSTRAINT IF EXISTS ck_calendario_empresa_runtime;
ALTER TABLE public.calendario_empresa
  ADD CONSTRAINT ck_calendario_empresa_runtime CHECK (
    tenant_id IS NOT NULL
    AND fecha IS NOT NULL
    AND periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    AND tipo_dia IN ('LABORABLE', 'FERIADO', 'NO_LABORABLE', 'ESPECIAL')
    AND lower(estado::text) IN ('activo', 'inactivo')
  ) NOT VALID;

ALTER TABLE public.saldos_iniciales_cuentas DROP CONSTRAINT IF EXISTS ck_saldos_iniciales_cuentas_runtime;
ALTER TABLE public.saldos_iniciales_cuentas
  ADD CONSTRAINT ck_saldos_iniciales_cuentas_runtime CHECK (
    tenant_id IS NOT NULL
    AND cuenta_id IS NOT NULL
    AND periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    AND saldo_debe >= 0
    AND saldo_haber >= 0
    AND moneda ~ '^[A-Z]{3}$'
    AND lower(estado::text) IN ('abierto', 'cerrado', 'anulado')
  ) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual para estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.activos_fijos
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.depreciaciones
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.registro_consignaciones
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.movimientos_consignacion
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.inventarios_permanentes
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.asignacion_costos
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.calendario_empresa
  ALTER COLUMN estado SET NOT NULL;

ALTER TABLE public.saldos_iniciales_cuentas
  ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Unicidades con predicados explícitos CI.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_activos_fijos_tenant_codigo_activo;
CREATE UNIQUE INDEX ux_activos_fijos_tenant_codigo_activo
ON public.activos_fijos (tenant_id, upper(btrim(codigo)))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> ''
  AND lower(estado::text) IN ('activo', 'inactivo', 'depreciado');

DROP INDEX IF EXISTS public.ux_depreciaciones_tenant_activo_periodo_runtime;
CREATE UNIQUE INDEX ux_depreciaciones_tenant_activo_periodo_runtime
ON public.depreciaciones (tenant_id, activo_id, periodo)
WHERE tenant_id IS NOT NULL
  AND activo_id IS NOT NULL
  AND periodo IS NOT NULL
  AND lower(estado::text) IN ('pendiente', 'procesada');

DROP INDEX IF EXISTS public.ux_registro_consignaciones_tenant_numero_runtime;
CREATE UNIQUE INDEX ux_registro_consignaciones_tenant_numero_runtime
ON public.registro_consignaciones (tenant_id, upper(btrim(numero)))
WHERE tenant_id IS NOT NULL
  AND numero IS NOT NULL
  AND btrim(numero) <> ''
  AND lower(estado::text) IN ('pendiente', 'vendida', 'devuelta', 'cerrada');

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.activos_fijos VALIDATE CONSTRAINT ck_activos_fijos_runtime;
ALTER TABLE public.depreciaciones VALIDATE CONSTRAINT ck_depreciaciones_runtime;
ALTER TABLE public.registro_consignaciones VALIDATE CONSTRAINT ck_registro_consignaciones_runtime;
ALTER TABLE public.movimientos_consignacion VALIDATE CONSTRAINT ck_movimientos_consignacion_runtime;
ALTER TABLE public.inventarios_permanentes VALIDATE CONSTRAINT ck_inventarios_permanentes_runtime;
ALTER TABLE public.asignacion_costos VALIDATE CONSTRAINT ck_asignacion_costos_runtime;
ALTER TABLE public.calendario_empresa VALIDATE CONSTRAINT ck_calendario_empresa_runtime;
ALTER TABLE public.saldos_iniciales_cuentas VALIDATE CONSTRAINT ck_saldos_iniciales_cuentas_runtime;

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'activos_fijos');
SELECT app.apply_tenant_policy('public', 'depreciaciones');
SELECT app.apply_tenant_policy('public', 'registro_consignaciones');
SELECT app.apply_tenant_policy('public', 'movimientos_consignacion');
SELECT app.apply_tenant_policy('public', 'inventarios_permanentes');
SELECT app.apply_tenant_policy('public', 'asignacion_costos');
SELECT app.apply_tenant_policy('public', 'calendario_empresa');
SELECT app.apply_tenant_policy('public', 'saldos_iniciales_cuentas');

COMMIT;
