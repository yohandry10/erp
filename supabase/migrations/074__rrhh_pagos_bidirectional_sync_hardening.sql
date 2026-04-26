-- ============================================================================
-- 074__rrhh_pagos_bidirectional_sync_hardening.sql
-- Sincronización bidireccional y normalización entre pagos_empleados y rrhh_pagos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Shape mínimo y compatibilidad de tipos para runtime actual.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pagos_empleados
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS planilla_id uuid,
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS fecha_pago timestamptz,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS sueldo_bruto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuentos numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_neto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.rrhh_pagos
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS planilla_id uuid,
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS fecha_pago timestamptz,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS monto_bruto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuentos numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_neto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rrhh_pagos'
      AND column_name = 'fecha_pago'
      AND udt_name = 'date'
  ) THEN
    ALTER TABLE public.rrhh_pagos
      ALTER COLUMN fecha_pago TYPE timestamptz
      USING CASE
        WHEN fecha_pago IS NULL THEN NULL
        ELSE (fecha_pago::text || ' 00:00:00+00')::timestamptz
      END;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pagos_empleados'
      AND column_name = 'usuario_id'
      AND udt_name <> 'text'
  ) THEN
    ALTER TABLE public.pagos_empleados
      ALTER COLUMN usuario_id TYPE text
      USING NULLIF(btrim(usuario_id::text), '');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rrhh_pagos'
      AND column_name = 'usuario_id'
      AND udt_name <> 'text'
  ) THEN
    ALTER TABLE public.rrhh_pagos
      ALTER COLUMN usuario_id TYPE text
      USING NULLIF(btrim(usuario_id::text), '');
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.pagos_empleados
  ADD COLUMN IF NOT EXISTS usuario_id text;

ALTER TABLE IF EXISTS public.rrhh_pagos
  ADD COLUMN IF NOT EXISTS usuario_id text;

-- ----------------------------------------------------------------------------
-- Normalización de campos comunes para ambas tablas de pagos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_rrhh_payment_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_periodo text;
BEGIN
  NEW.periodo := NULLIF(btrim(COALESCE(NEW.periodo, '')), '');

  IF NEW.periodo IS NULL AND NEW.fecha_pago IS NOT NULL THEN
    NEW.periodo := to_char(NEW.fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM');
  END IF;

  IF NEW.periodo IS NULL AND NEW.planilla_id IS NOT NULL THEN
    SELECT NULLIF(btrim(p.periodo), '')
    INTO v_periodo
    FROM public.planillas p
    WHERE p.id = NEW.planilla_id;

    NEW.periodo := COALESCE(NEW.periodo, v_periodo);
  END IF;

  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  NEW.metodo_pago := NULLIF(lower(btrim(COALESCE(NEW.metodo_pago, ''))), '');
  NEW.descuentos := COALESCE(NEW.descuentos, 0);
  NEW.monto_neto := COALESCE(NEW.monto_neto, 0);
  NEW.usuario_id := NULLIF(btrim(COALESCE(NEW.usuario_id::text, '')), '');
  NEW.updated_at := now();

  IF TG_TABLE_NAME = 'pagos_empleados' THEN
    NEW.sueldo_bruto := COALESCE(NEW.sueldo_bruto, 0);
  ELSIF TG_TABLE_NAME = 'rrhh_pagos' THEN
    NEW.monto_bruto := COALESCE(NEW.monto_bruto, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pagos_empleados_pago ON public.pagos_empleados;
CREATE TRIGGER trg_normalize_pagos_empleados_pago
BEFORE INSERT OR UPDATE OF periodo, fecha_pago, metodo_pago, sueldo_bruto, descuentos, monto_neto, estado, usuario_id
ON public.pagos_empleados
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rrhh_payment_row();

DROP TRIGGER IF EXISTS trg_normalize_rrhh_pagos_pago ON public.rrhh_pagos;
CREATE TRIGGER trg_normalize_rrhh_pagos_pago
BEFORE INSERT OR UPDATE OF periodo, fecha_pago, metodo_pago, monto_bruto, descuentos, monto_neto, estado, usuario_id
ON public.rrhh_pagos
FOR EACH ROW
EXECUTE FUNCTION app.normalize_rrhh_payment_row();

-- ----------------------------------------------------------------------------
-- Sync canónico <-> alias entre pagos_empleados y rrhh_pagos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_rrhh_pagos_from_pagos_empleados()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.rrhh_pagos rp
    WHERE rp.id = OLD.id
       OR (
         OLD.tenant_id IS NOT NULL
         AND OLD.planilla_id IS NOT NULL
         AND OLD.empleado_id IS NOT NULL
         AND rp.tenant_id = OLD.tenant_id
         AND rp.planilla_id = OLD.planilla_id
         AND rp.empleado_id = OLD.empleado_id
       );
    RETURN OLD;
  END IF;

  INSERT INTO public.rrhh_pagos (
    id,
    tenant_id,
    nombre,
    codigo,
    estado,
    metadata,
    created_at,
    updated_at,
    planilla_id,
    empleado_id,
    periodo,
    fecha_pago,
    metodo_pago,
    monto_bruto,
    descuentos,
    monto_neto,
    usuario_id
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.nombre,
    NEW.codigo,
    NEW.estado,
    COALESCE(NEW.metadata, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    now(),
    NEW.planilla_id,
    NEW.empleado_id,
    NEW.periodo,
    NEW.fecha_pago,
    NEW.metodo_pago,
    COALESCE(NEW.sueldo_bruto, 0),
    COALESCE(NEW.descuentos, 0),
    COALESCE(NEW.monto_neto, 0),
    NEW.usuario_id
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    nombre = EXCLUDED.nombre,
    codigo = EXCLUDED.codigo,
    estado = EXCLUDED.estado,
    metadata = COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    updated_at = now(),
    planilla_id = EXCLUDED.planilla_id,
    empleado_id = EXCLUDED.empleado_id,
    periodo = EXCLUDED.periodo,
    fecha_pago = EXCLUDED.fecha_pago,
    metodo_pago = EXCLUDED.metodo_pago,
    monto_bruto = COALESCE(EXCLUDED.monto_bruto, 0),
    descuentos = COALESCE(EXCLUDED.descuentos, 0),
    monto_neto = COALESCE(EXCLUDED.monto_neto, 0),
    usuario_id = EXCLUDED.usuario_id;

  IF NEW.tenant_id IS NOT NULL AND NEW.planilla_id IS NOT NULL AND NEW.empleado_id IS NOT NULL THEN
    UPDATE public.rrhh_pagos rp
    SET
      nombre = NEW.nombre,
      codigo = NEW.codigo,
      estado = NEW.estado,
      metadata = COALESCE(NEW.metadata, rp.metadata),
      updated_at = now(),
      periodo = COALESCE(NEW.periodo, rp.periodo),
      fecha_pago = COALESCE(NEW.fecha_pago, rp.fecha_pago),
      metodo_pago = COALESCE(NEW.metodo_pago, rp.metodo_pago),
      monto_bruto = COALESCE(NEW.sueldo_bruto, rp.monto_bruto, 0),
      descuentos = COALESCE(NEW.descuentos, rp.descuentos, 0),
      monto_neto = COALESCE(NEW.monto_neto, rp.monto_neto, 0),
      usuario_id = COALESCE(NEW.usuario_id, rp.usuario_id)
    WHERE rp.id IS DISTINCT FROM NEW.id
      AND rp.tenant_id = NEW.tenant_id
      AND rp.planilla_id = NEW.planilla_id
      AND rp.empleado_id = NEW.empleado_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rrhh_pagos_from_pagos_empleados ON public.pagos_empleados;
CREATE TRIGGER trg_sync_rrhh_pagos_from_pagos_empleados
AFTER INSERT OR UPDATE OR DELETE
ON public.pagos_empleados
FOR EACH ROW
EXECUTE FUNCTION app.sync_rrhh_pagos_from_pagos_empleados();

CREATE OR REPLACE FUNCTION app.sync_pagos_empleados_from_rrhh_pagos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.pagos_empleados pe
    WHERE pe.id = OLD.id
       OR (
         OLD.tenant_id IS NOT NULL
         AND OLD.planilla_id IS NOT NULL
         AND OLD.empleado_id IS NOT NULL
         AND pe.tenant_id = OLD.tenant_id
         AND pe.planilla_id = OLD.planilla_id
         AND pe.empleado_id = OLD.empleado_id
       );
    RETURN OLD;
  END IF;

  INSERT INTO public.pagos_empleados (
    id,
    tenant_id,
    nombre,
    codigo,
    estado,
    metadata,
    created_at,
    updated_at,
    planilla_id,
    empleado_id,
    periodo,
    fecha_pago,
    metodo_pago,
    sueldo_bruto,
    descuentos,
    monto_neto,
    usuario_id
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.nombre,
    NEW.codigo,
    NEW.estado,
    COALESCE(NEW.metadata, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    now(),
    NEW.planilla_id,
    NEW.empleado_id,
    NEW.periodo,
    NEW.fecha_pago,
    NEW.metodo_pago,
    COALESCE(NEW.monto_bruto, 0),
    COALESCE(NEW.descuentos, 0),
    COALESCE(NEW.monto_neto, 0),
    NEW.usuario_id
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    nombre = EXCLUDED.nombre,
    codigo = EXCLUDED.codigo,
    estado = EXCLUDED.estado,
    metadata = COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    updated_at = now(),
    planilla_id = EXCLUDED.planilla_id,
    empleado_id = EXCLUDED.empleado_id,
    periodo = EXCLUDED.periodo,
    fecha_pago = EXCLUDED.fecha_pago,
    metodo_pago = EXCLUDED.metodo_pago,
    sueldo_bruto = COALESCE(EXCLUDED.sueldo_bruto, 0),
    descuentos = COALESCE(EXCLUDED.descuentos, 0),
    monto_neto = COALESCE(EXCLUDED.monto_neto, 0),
    usuario_id = EXCLUDED.usuario_id;

  IF NEW.tenant_id IS NOT NULL AND NEW.planilla_id IS NOT NULL AND NEW.empleado_id IS NOT NULL THEN
    UPDATE public.pagos_empleados pe
    SET
      nombre = NEW.nombre,
      codigo = NEW.codigo,
      estado = NEW.estado,
      metadata = COALESCE(NEW.metadata, pe.metadata),
      updated_at = now(),
      periodo = COALESCE(NEW.periodo, pe.periodo),
      fecha_pago = COALESCE(NEW.fecha_pago, pe.fecha_pago),
      metodo_pago = COALESCE(NEW.metodo_pago, pe.metodo_pago),
      sueldo_bruto = COALESCE(NEW.monto_bruto, pe.sueldo_bruto, 0),
      descuentos = COALESCE(NEW.descuentos, pe.descuentos, 0),
      monto_neto = COALESCE(NEW.monto_neto, pe.monto_neto, 0),
      usuario_id = COALESCE(NEW.usuario_id, pe.usuario_id)
    WHERE pe.id IS DISTINCT FROM NEW.id
      AND pe.tenant_id = NEW.tenant_id
      AND pe.planilla_id = NEW.planilla_id
      AND pe.empleado_id = NEW.empleado_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pagos_empleados_from_rrhh_pagos ON public.rrhh_pagos;
CREATE TRIGGER trg_sync_pagos_empleados_from_rrhh_pagos
AFTER INSERT OR UPDATE OR DELETE
ON public.rrhh_pagos
FOR EACH ROW
EXECUTE FUNCTION app.sync_pagos_empleados_from_rrhh_pagos();

-- ----------------------------------------------------------------------------
-- Backfill inicial bidireccional.
-- ----------------------------------------------------------------------------
INSERT INTO public.rrhh_pagos (
  id, tenant_id, nombre, codigo, estado, metadata, created_at, updated_at,
  planilla_id, empleado_id, periodo, fecha_pago, metodo_pago,
  monto_bruto, descuentos, monto_neto, usuario_id
)
SELECT
  pe.id,
  pe.tenant_id,
  pe.nombre,
  pe.codigo,
  upper(COALESCE(NULLIF(btrim(pe.estado), ''), 'PENDIENTE')),
  COALESCE(pe.metadata, '{}'::jsonb),
  COALESCE(pe.created_at, now()),
  now(),
  pe.planilla_id,
  pe.empleado_id,
  COALESCE(
    NULLIF(btrim(pe.periodo), ''),
    CASE WHEN pe.fecha_pago IS NOT NULL THEN to_char(pe.fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM') ELSE NULL END
  ),
  pe.fecha_pago,
  NULLIF(lower(btrim(COALESCE(pe.metodo_pago, ''))), ''),
  COALESCE(pe.sueldo_bruto, 0),
  COALESCE(pe.descuentos, 0),
  COALESCE(pe.monto_neto, 0),
  NULLIF(btrim(COALESCE(pe.usuario_id, '')), '')
FROM public.pagos_empleados pe
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  nombre = EXCLUDED.nombre,
  codigo = EXCLUDED.codigo,
  estado = EXCLUDED.estado,
  metadata = EXCLUDED.metadata,
  updated_at = now(),
  planilla_id = EXCLUDED.planilla_id,
  empleado_id = EXCLUDED.empleado_id,
  periodo = EXCLUDED.periodo,
  fecha_pago = EXCLUDED.fecha_pago,
  metodo_pago = EXCLUDED.metodo_pago,
  monto_bruto = EXCLUDED.monto_bruto,
  descuentos = EXCLUDED.descuentos,
  monto_neto = EXCLUDED.monto_neto,
  usuario_id = EXCLUDED.usuario_id;

INSERT INTO public.pagos_empleados (
  id, tenant_id, nombre, codigo, estado, metadata, created_at, updated_at,
  planilla_id, empleado_id, periodo, fecha_pago, metodo_pago,
  sueldo_bruto, descuentos, monto_neto, usuario_id
)
SELECT
  rp.id,
  rp.tenant_id,
  rp.nombre,
  rp.codigo,
  upper(COALESCE(NULLIF(btrim(rp.estado), ''), 'PENDIENTE')),
  COALESCE(rp.metadata, '{}'::jsonb),
  COALESCE(rp.created_at, now()),
  now(),
  rp.planilla_id,
  rp.empleado_id,
  COALESCE(
    NULLIF(btrim(rp.periodo), ''),
    CASE WHEN rp.fecha_pago IS NOT NULL THEN to_char(rp.fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM') ELSE NULL END
  ),
  rp.fecha_pago,
  NULLIF(lower(btrim(COALESCE(rp.metodo_pago, ''))), ''),
  COALESCE(rp.monto_bruto, 0),
  COALESCE(rp.descuentos, 0),
  COALESCE(rp.monto_neto, 0),
  NULLIF(btrim(COALESCE(rp.usuario_id, '')), '')
FROM public.rrhh_pagos rp
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  nombre = EXCLUDED.nombre,
  codigo = EXCLUDED.codigo,
  estado = EXCLUDED.estado,
  metadata = EXCLUDED.metadata,
  updated_at = now(),
  planilla_id = EXCLUDED.planilla_id,
  empleado_id = EXCLUDED.empleado_id,
  periodo = EXCLUDED.periodo,
  fecha_pago = EXCLUDED.fecha_pago,
  metodo_pago = EXCLUDED.metodo_pago,
  sueldo_bruto = EXCLUDED.sueldo_bruto,
  descuentos = EXCLUDED.descuentos,
  monto_neto = EXCLUDED.monto_neto,
  usuario_id = EXCLUDED.usuario_id;

COMMIT;
