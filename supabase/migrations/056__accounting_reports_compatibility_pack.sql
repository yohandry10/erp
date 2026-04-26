-- ============================================================================
-- 056__accounting_reports_compatibility_pack.sql
-- Compatibilidad de esquema para AccountingReportsService (compras/activos/planillas).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Compras: columnas y FK esperadas por reportes contables
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.compras
  ADD COLUMN IF NOT EXISTS proveedor_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS numero_documento text,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN';

ALTER TABLE IF EXISTS public.compras
  ALTER COLUMN subtotal TYPE numeric(14,2) USING app.to_numeric_or_zero(subtotal::text),
  ALTER COLUMN igv TYPE numeric(14,2) USING app.to_numeric_or_zero(igv::text),
  ALTER COLUMN total TYPE numeric(14,2) USING app.to_numeric_or_zero(total::text),
  ALTER COLUMN subtotal SET DEFAULT 0,
  ALTER COLUMN igv SET DEFAULT 0,
  ALTER COLUMN total SET DEFAULT 0;

SELECT app.add_fk_if_possible('compras', 'proveedor_id', 'proveedores', 'id', 'fk_compras_proveedor_id');

CREATE INDEX IF NOT EXISTS idx_compras_tenant_fecha_estado_proveedor
ON public.compras (tenant_id, fecha DESC, estado, proveedor_id);

-- ----------------------------------------------------------------------------
-- Activos fijos: columnas esperadas por reporte de activos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.activos_fijos
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS valor_adquisicion numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciacion_acumulada numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vida_util integer DEFAULT 0;

ALTER TABLE IF EXISTS public.activos_fijos
  ALTER COLUMN valor_adquisicion TYPE numeric(14,2) USING app.to_numeric_or_zero(valor_adquisicion::text),
  ALTER COLUMN depreciacion_acumulada TYPE numeric(14,2) USING app.to_numeric_or_zero(depreciacion_acumulada::text),
  ALTER COLUMN vida_util TYPE integer USING app.to_int_or_zero(vida_util::text),
  ALTER COLUMN valor_adquisicion SET DEFAULT 0,
  ALTER COLUMN depreciacion_acumulada SET DEFAULT 0,
  ALTER COLUMN vida_util SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_activos_fijos_tenant_fecha_adquisicion
ON public.activos_fijos (tenant_id, fecha_adquisicion DESC);

-- ----------------------------------------------------------------------------
-- detalle_planillas (alias legacy) para consultas anidadas en planillas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.detalle_planillas (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  planilla_id uuid REFERENCES public.planillas(id) ON DELETE CASCADE,
  empleado_id uuid REFERENCES public.empleados(id) ON DELETE CASCADE,
  sueldo_basico numeric(14,2) NOT NULL DEFAULT 0,
  bonificaciones numeric(14,2) NOT NULL DEFAULT 0,
  descuentos numeric(14,2) NOT NULL DEFAULT 0,
  sueldo_neto numeric(14,2) NOT NULL DEFAULT 0,
  aporte_essalud numeric(14,2) NOT NULL DEFAULT 0,
  onp numeric(14,2) NOT NULL DEFAULT 0,
  quinta_categoria numeric(14,2) NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

SELECT app.add_fk_if_possible('detalle_planillas', 'tenant_id', 'tenants', 'id', 'fk_detalle_planillas_tenant_id');
SELECT app.add_fk_if_possible('detalle_planillas', 'planilla_id', 'planillas', 'id', 'fk_detalle_planillas_planilla_id');
SELECT app.add_fk_if_possible('detalle_planillas', 'empleado_id', 'empleados', 'id', 'fk_detalle_planillas_empleado_id');

SELECT app.apply_tenant_policy('public', 'detalle_planillas');

CREATE UNIQUE INDEX IF NOT EXISTS ux_detalle_planillas_planilla_empleado
ON public.detalle_planillas (planilla_id, empleado_id)
WHERE planilla_id IS NOT NULL AND empleado_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_detalle_planillas_tenant_planilla
ON public.detalle_planillas (tenant_id, planilla_id);

CREATE INDEX IF NOT EXISTS idx_detalle_planillas_tenant_empleado
ON public.detalle_planillas (tenant_id, empleado_id);

DROP TRIGGER IF EXISTS trg_set_updated_at_detalle_planillas ON public.detalle_planillas;
CREATE TRIGGER trg_set_updated_at_detalle_planillas
BEFORE UPDATE ON public.detalle_planillas
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE FUNCTION app.sync_detalle_planillas_from_empleado_planilla()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_planilla_id uuid;
  v_empleado_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.detalle_planillas dp
    WHERE dp.id = OLD.id;
    RETURN OLD;
  END IF;

  v_planilla_id := COALESCE(NEW.planilla_id, app.to_uuid_or_null(NEW.id_planilla));
  v_empleado_id := COALESCE(NEW.empleado_id, app.to_uuid_or_null(NEW.id_empleado));

  IF NEW.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.detalle_planillas (
    id,
    tenant_id,
    planilla_id,
    empleado_id,
    sueldo_basico,
    bonificaciones,
    descuentos,
    sueldo_neto,
    aporte_essalud,
    onp,
    quinta_categoria,
    estado,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    v_planilla_id,
    v_empleado_id,
    COALESCE(NEW.total_ingresos, 0),
    0,
    COALESCE(NEW.total_descuentos, 0),
    COALESCE(NEW.neto_pagar, 0),
    COALESCE(NEW.total_aportes, 0),
    0,
    0,
    COALESCE(NULLIF(btrim(NEW.estado_pago), ''), 'ACTIVO'),
    COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'empleado_planilla'),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    planilla_id = EXCLUDED.planilla_id,
    empleado_id = EXCLUDED.empleado_id,
    sueldo_basico = EXCLUDED.sueldo_basico,
    bonificaciones = EXCLUDED.bonificaciones,
    descuentos = EXCLUDED.descuentos,
    sueldo_neto = EXCLUDED.sueldo_neto,
    aporte_essalud = EXCLUDED.aporte_essalud,
    onp = EXCLUDED.onp,
    quinta_categoria = EXCLUDED.quinta_categoria,
    estado = EXCLUDED.estado,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_detalle_planillas_from_empleado_planilla ON public.empleado_planilla;

CREATE TRIGGER trg_sync_detalle_planillas_from_empleado_planilla
AFTER INSERT OR UPDATE OR DELETE
ON public.empleado_planilla
FOR EACH ROW
EXECUTE FUNCTION app.sync_detalle_planillas_from_empleado_planilla();

INSERT INTO public.detalle_planillas (
  id,
  tenant_id,
  planilla_id,
  empleado_id,
  sueldo_basico,
  bonificaciones,
  descuentos,
  sueldo_neto,
  aporte_essalud,
  onp,
  quinta_categoria,
  estado,
  metadata,
  created_at,
  updated_at
)
SELECT
  ep.id,
  ep.tenant_id,
  COALESCE(ep.planilla_id, app.to_uuid_or_null(ep.id_planilla)),
  COALESCE(ep.empleado_id, app.to_uuid_or_null(ep.id_empleado)),
  COALESCE(ep.total_ingresos, 0),
  0,
  COALESCE(ep.total_descuentos, 0),
  COALESCE(ep.neto_pagar, 0),
  COALESCE(ep.total_aportes, 0),
  0,
  0,
  COALESCE(NULLIF(btrim(ep.estado_pago), ''), 'ACTIVO'),
  COALESCE(ep.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'empleado_planilla_backfill'),
  COALESCE(ep.created_at, now()),
  COALESCE(ep.updated_at, now())
FROM public.empleado_planilla ep
WHERE ep.id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  planilla_id = EXCLUDED.planilla_id,
  empleado_id = EXCLUDED.empleado_id,
  sueldo_basico = EXCLUDED.sueldo_basico,
  bonificaciones = EXCLUDED.bonificaciones,
  descuentos = EXCLUDED.descuentos,
  sueldo_neto = EXCLUDED.sueldo_neto,
  aporte_essalud = EXCLUDED.aporte_essalud,
  onp = EXCLUDED.onp,
  quinta_categoria = EXCLUDED.quinta_categoria,
  estado = EXCLUDED.estado,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- Validación rápida de prerequisitos para AccountingReportsService
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_accounting_reports_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id());
  v_count bigint;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN QUERY
    SELECT
      'tenant_context'::text,
      false,
      'No se pudo resolver tenant para validar accounting reports';
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    'view_orden_compra_exists'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = 'orden_compra'
    ),
    'alias legacy para background jobs';

  RETURN QUERY
  SELECT
    'detalle_planillas_table_exists'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'detalle_planillas'
    ),
    'tabla legacy para nested select de planillas';

  SELECT COUNT(*)
  INTO v_count
  FROM public.empleado_planilla ep
  WHERE ep.tenant_id = v_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.detalle_planillas dp
      WHERE dp.id = ep.id
        AND dp.tenant_id = v_tenant_id
    );

  RETURN QUERY
  SELECT
    'detalle_planillas_sync_gap'::text,
    (v_count = 0),
    format('missing_rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_accounting_reports_runtime_status_actual AS
SELECT *
FROM public.validar_accounting_reports_runtime(app.resolve_request_tenant_id());

COMMIT;
