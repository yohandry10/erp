-- ============================================================================
-- 200__rrhh_planillas_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime para planillas: compatibilidad case-insensitive en estado
-- y cierre de brecha con reportes contables que filtran planillas.estado='PAGADA'.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helpers de normalizacion de estado para planillas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_planilla_estado_pago(p_estado_pago text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := lower(COALESCE(NULLIF(btrim(p_estado_pago), ''), 'pendiente'));
BEGIN
  IF v IN ('pagado', 'pagada', 'paid', 'procesado', 'procesada', 'completado', 'completada', 'cerrado', 'cerrada') THEN
    RETURN 'pagado';
  END IF;

  IF v IN ('parcial', 'partial', 'partially_paid', 'abonado', 'en_proceso', 'procesando') THEN
    RETURN 'parcial';
  END IF;

  IF v IN ('anulado', 'anulada', 'cancelado', 'cancelada', 'rechazado', 'rechazada') THEN
    RETURN 'anulado';
  END IF;

  IF v IN ('pendiente', 'borrador', 'draft', 'activo', 'activa') THEN
    RETURN 'pendiente';
  END IF;

  RETURN 'pendiente';
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_planilla_estado(
  p_estado text,
  p_estado_pago text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_estado text := lower(COALESCE(NULLIF(btrim(p_estado), ''), 'borrador'));
  v_estado_pago text := app.normalize_planilla_estado_pago(p_estado_pago);
BEGIN
  IF v_estado_pago = 'pagado' THEN
    RETURN 'pagada';
  END IF;

  IF v_estado_pago = 'anulado' THEN
    RETURN 'anulada';
  END IF;

  IF v_estado IN ('calculada', 'calculo', 'lista', 'aprobada', 'confirmada') THEN
    RETURN 'calculada';
  END IF;

  IF v_estado IN ('pagada', 'pagado', 'cerrada', 'cerrado', 'finalizada', 'finalizado', 'completada', 'completado') THEN
    RETURN 'pagada';
  END IF;

  IF v_estado IN ('anulada', 'anulado', 'cancelada', 'cancelado', 'rechazada', 'rechazado', 'inactiva', 'inactivo', 'baja') THEN
    RETURN 'anulada';
  END IF;

  IF v_estado_pago = 'parcial' THEN
    RETURN 'calculada';
  END IF;

  RETURN 'borrador';
END;
$$;

-- ----------------------------------------------------------------------------
-- Planillas: tipado y normalizacion defensiva de estado/estado_pago.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.planillas
  ADD COLUMN IF NOT EXISTS estado_pago text,
  ADD COLUMN IF NOT EXISTS total_pagado numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_pago timestamptz;

ALTER TABLE IF EXISTS public.planillas
  ALTER COLUMN total_pagado TYPE numeric(14,2) USING app.to_numeric_or_zero(total_pagado::text),
  ALTER COLUMN total_pagado SET DEFAULT 0;

ALTER TABLE IF EXISTS public.planillas
  ALTER COLUMN estado TYPE citext
  USING app.normalize_planilla_estado(estado::text, estado_pago::text)::citext,
  ALTER COLUMN estado_pago TYPE citext
  USING app.normalize_planilla_estado_pago(estado_pago::text)::citext;

WITH normalized AS (
  SELECT
    p.id,
    app.normalize_planilla_estado_pago(
      COALESCE(
        NULLIF(btrim(COALESCE(p.estado_pago::text, '')), ''),
        CASE
          WHEN lower(COALESCE(NULLIF(btrim(COALESCE(p.estado::text, '')), ''), '')) IN ('pagada', 'pagado', 'cerrada', 'cerrado', 'finalizada', 'finalizado', 'completada', 'completado')
            THEN 'pagado'
          WHEN lower(COALESCE(NULLIF(btrim(COALESCE(p.estado::text, '')), ''), '')) IN ('anulada', 'anulado', 'cancelada', 'cancelado', 'rechazada', 'rechazado', 'inactiva', 'inactivo', 'baja')
            THEN 'anulado'
          WHEN COALESCE(p.total_pagado, 0) >= COALESCE(p.total_neto, 0)
               AND COALESCE(p.total_neto, 0) > 0 THEN 'pagado'
          WHEN COALESCE(p.total_pagado, 0) > 0 THEN 'parcial'
          ELSE 'pendiente'
        END
      )
    ) AS estado_pago_norm
  FROM public.planillas p
)
UPDATE public.planillas p
SET
  estado_pago = n.estado_pago_norm::citext,
  estado = app.normalize_planilla_estado(
    COALESCE(NULLIF(btrim(COALESCE(p.estado::text, '')), ''), 'borrador'),
    n.estado_pago_norm
  )::citext,
  updated_at = now()
FROM normalized n
WHERE n.id = p.id;

ALTER TABLE IF EXISTS public.planillas
  ALTER COLUMN estado SET DEFAULT 'borrador'::citext,
  ALTER COLUMN estado_pago SET DEFAULT 'pendiente'::citext;
CREATE OR REPLACE FUNCTION app.normalize_planillas_estado_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, app, pg_temp
AS $$
DECLARE
  v_estado_pago text;
BEGIN
  NEW.total_pagado := app.to_numeric_or_zero(NEW.total_pagado::text);
  NEW.total_neto := app.to_numeric_or_zero(NEW.total_neto::text);

  v_estado_pago := app.normalize_planilla_estado_pago(
    COALESCE(
      NULLIF(btrim(COALESCE(NEW.estado_pago::text, '')), ''),
      CASE
        WHEN lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado::text, '')), ''), '')) IN ('pagada', 'pagado', 'cerrada', 'cerrado', 'finalizada', 'finalizado', 'completada', 'completado')
          THEN 'pagado'
        WHEN lower(COALESCE(NULLIF(btrim(COALESCE(NEW.estado::text, '')), ''), '')) IN ('anulada', 'anulado', 'cancelada', 'cancelado', 'rechazada', 'rechazado', 'inactiva', 'inactivo', 'baja')
          THEN 'anulado'
        WHEN COALESCE(NEW.total_pagado, 0) >= COALESCE(NEW.total_neto, 0)
             AND COALESCE(NEW.total_neto, 0) > 0 THEN 'pagado'
        WHEN COALESCE(NEW.total_pagado, 0) > 0 THEN 'parcial'
        ELSE 'pendiente'
      END
    )
  );

  NEW.estado_pago := v_estado_pago::citext;
  NEW.estado := app.normalize_planilla_estado(
    COALESCE(NULLIF(btrim(COALESCE(NEW.estado::text, '')), ''), 'borrador'),
    v_estado_pago
  )::citext;

  IF NEW.estado_pago = 'pagado'::citext AND NEW.fecha_pago IS NULL THEN
    NEW.fecha_pago := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_planillas_estado_row ON public.planillas;
CREATE TRIGGER trg_normalize_planillas_estado_row
BEFORE INSERT OR UPDATE OF estado, estado_pago, total_pagado, total_neto, fecha_pago
ON public.planillas
FOR EACH ROW
EXECUTE FUNCTION app.normalize_planillas_estado_row();

-- ----------------------------------------------------------------------------
-- detalle_planillas: estado derivado de pagos por empleado (legacy accounting).
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.detalle_planillas
  ALTER COLUMN estado TYPE citext
  USING app.normalize_planilla_estado_pago(estado::text)::citext;

UPDATE public.detalle_planillas dp
SET
  estado = app.normalize_planilla_estado_pago(dp.estado::text)::citext,
  updated_at = now()
WHERE dp.id IS NOT NULL;

ALTER TABLE IF EXISTS public.detalle_planillas
  ALTER COLUMN estado SET DEFAULT 'pendiente'::citext;

CREATE OR REPLACE FUNCTION app.normalize_detalle_planillas_estado_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_planilla_estado_pago(NEW.estado::text)::citext;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_detalle_planillas_estado_row ON public.detalle_planillas;
CREATE TRIGGER trg_normalize_detalle_planillas_estado_row
BEFORE INSERT OR UPDATE OF estado
ON public.detalle_planillas
FOR EACH ROW
EXECUTE FUNCTION app.normalize_detalle_planillas_estado_row();

-- ----------------------------------------------------------------------------
-- Sincronizacion empleado_planilla -> detalle_planillas con estado normalizado.
-- ----------------------------------------------------------------------------
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
    app.normalize_planilla_estado_pago(COALESCE(NULLIF(btrim(NEW.estado_pago), ''), 'pendiente'))::citext,
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
  app.normalize_planilla_estado_pago(COALESCE(NULLIF(btrim(ep.estado_pago), ''), 'pendiente'))::citext,
  COALESCE(ep.metadata, '{}'::jsonb) || jsonb_build_object('sync_source', 'empleado_planilla_backfill_200'),
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

CREATE INDEX IF NOT EXISTS idx_planillas_tenant_estado_ci_runtime_200
ON public.planillas (tenant_id, estado, periodo, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_planillas_tenant_estado_pago_ci_runtime_200
ON public.planillas (tenant_id, estado_pago, periodo, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_planillas_tenant_estado_ci_runtime_200
ON public.detalle_planillas (tenant_id, estado, updated_at DESC);

COMMIT;
