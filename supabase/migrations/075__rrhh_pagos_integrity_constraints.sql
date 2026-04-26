-- ============================================================================
-- 075__rrhh_pagos_integrity_constraints.sql
-- Endurece integridad y reglas de negocio mínimas para pagos RRHH.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill de tenant/periodo y normalización previa a constraints.
-- ----------------------------------------------------------------------------
UPDATE public.pagos_empleados pe
SET
  tenant_id = COALESCE(pe.tenant_id, x.tenant_planilla, x.tenant_empleado, x.tenant_rrhh),
  periodo = COALESCE(
    NULLIF(btrim(pe.periodo), ''),
    NULLIF(btrim(x.periodo_planilla), ''),
    NULLIF(btrim(x.periodo_rrhh), ''),
    CASE WHEN pe.fecha_pago IS NOT NULL THEN to_char(pe.fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM') ELSE NULL END
  ),
  fecha_pago = COALESCE(pe.fecha_pago, x.fecha_pago_rrhh),
  estado = upper(COALESCE(NULLIF(btrim(pe.estado), ''), NULLIF(btrim(x.estado_rrhh), ''), 'PENDIENTE')),
  metodo_pago = COALESCE(
    NULLIF(lower(btrim(COALESCE(pe.metodo_pago, ''))), ''),
    NULLIF(lower(btrim(COALESCE(x.metodo_rrhh, ''))), '')
  ),
  sueldo_bruto = COALESCE(pe.sueldo_bruto, x.monto_bruto_rrhh, 0),
  descuentos = COALESCE(pe.descuentos, x.descuentos_rrhh, 0),
  monto_neto = COALESCE(pe.monto_neto, x.monto_neto_rrhh, 0),
  updated_at = now()
FROM (
  SELECT
    pe2.id,
    p.tenant_id AS tenant_planilla,
    p.periodo AS periodo_planilla,
    e.tenant_id AS tenant_empleado,
    rp.tenant_id AS tenant_rrhh,
    rp.periodo AS periodo_rrhh,
    rp.fecha_pago AS fecha_pago_rrhh,
    rp.estado AS estado_rrhh,
    rp.metodo_pago AS metodo_rrhh,
    rp.monto_bruto AS monto_bruto_rrhh,
    rp.descuentos AS descuentos_rrhh,
    rp.monto_neto AS monto_neto_rrhh
  FROM public.pagos_empleados pe2
  LEFT JOIN public.planillas p
    ON p.id = pe2.planilla_id
  LEFT JOIN public.empleados e
    ON e.id = pe2.empleado_id
  LEFT JOIN public.rrhh_pagos rp
    ON rp.id = pe2.id
) x
WHERE pe.id = x.id;

UPDATE public.rrhh_pagos rp
SET
  tenant_id = COALESCE(rp.tenant_id, x.tenant_planilla, x.tenant_empleado, x.tenant_pagos),
  periodo = COALESCE(
    NULLIF(btrim(rp.periodo), ''),
    NULLIF(btrim(x.periodo_planilla), ''),
    NULLIF(btrim(x.periodo_pagos), ''),
    CASE WHEN rp.fecha_pago IS NOT NULL THEN to_char(rp.fecha_pago AT TIME ZONE 'UTC', 'YYYY-MM') ELSE NULL END
  ),
  fecha_pago = COALESCE(rp.fecha_pago, x.fecha_pago_pagos),
  estado = upper(COALESCE(NULLIF(btrim(rp.estado), ''), NULLIF(btrim(x.estado_pagos), ''), 'PENDIENTE')),
  metodo_pago = COALESCE(
    NULLIF(lower(btrim(COALESCE(rp.metodo_pago, ''))), ''),
    NULLIF(lower(btrim(COALESCE(x.metodo_pagos, ''))), '')
  ),
  monto_bruto = COALESCE(rp.monto_bruto, x.sueldo_bruto_pagos, 0),
  descuentos = COALESCE(rp.descuentos, x.descuentos_pagos, 0),
  monto_neto = COALESCE(rp.monto_neto, x.monto_neto_pagos, 0),
  updated_at = now()
FROM (
  SELECT
    rp2.id,
    p.tenant_id AS tenant_planilla,
    p.periodo AS periodo_planilla,
    e.tenant_id AS tenant_empleado,
    pe.tenant_id AS tenant_pagos,
    pe.periodo AS periodo_pagos,
    pe.fecha_pago AS fecha_pago_pagos,
    pe.estado AS estado_pagos,
    pe.metodo_pago AS metodo_pagos,
    pe.sueldo_bruto AS sueldo_bruto_pagos,
    pe.descuentos AS descuentos_pagos,
    pe.monto_neto AS monto_neto_pagos
  FROM public.rrhh_pagos rp2
  LEFT JOIN public.planillas p
    ON p.id = rp2.planilla_id
  LEFT JOIN public.empleados e
    ON e.id = rp2.empleado_id
  LEFT JOIN public.pagos_empleados pe
    ON pe.id = rp2.id
) x
WHERE rp.id = x.id;

-- ----------------------------------------------------------------------------
-- Dedupe por llave lógica de pago (tenant+planilla+empleado).
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, planilla_id, empleado_id
      ORDER BY
        COALESCE(fecha_pago, updated_at, created_at, now()) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.pagos_empleados
  WHERE tenant_id IS NOT NULL
    AND planilla_id IS NOT NULL
    AND empleado_id IS NOT NULL
)
DELETE FROM public.pagos_empleados pe
USING ranked r
WHERE pe.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, planilla_id, empleado_id
      ORDER BY
        COALESCE(fecha_pago, updated_at, created_at, now()) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.rrhh_pagos
  WHERE tenant_id IS NOT NULL
    AND planilla_id IS NOT NULL
    AND empleado_id IS NOT NULL
)
DELETE FROM public.rrhh_pagos rp
USING ranked r
WHERE rp.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de calidad de datos (estado, periodo, montos, fecha_pago).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.pagos_empleados') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_empleados_estado_upper_nonempty'
        AND conrelid = 'public.pagos_empleados'::regclass
    ) THEN
      ALTER TABLE public.pagos_empleados
      ADD CONSTRAINT ck_pagos_empleados_estado_upper_nonempty
      CHECK (estado = upper(btrim(estado)) AND btrim(estado) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_empleados_periodo_format'
        AND conrelid = 'public.pagos_empleados'::regclass
    ) THEN
      ALTER TABLE public.pagos_empleados
      ADD CONSTRAINT ck_pagos_empleados_periodo_format
      CHECK (periodo IS NULL OR periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_empleados_montos_nonnegative'
        AND conrelid = 'public.pagos_empleados'::regclass
    ) THEN
      ALTER TABLE public.pagos_empleados
      ADD CONSTRAINT ck_pagos_empleados_montos_nonnegative
      CHECK (
        COALESCE(sueldo_bruto, 0) >= 0
        AND COALESCE(descuentos, 0) >= 0
        AND COALESCE(monto_neto, 0) >= 0
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_pagos_empleados_fecha_pago_when_processed'
        AND conrelid = 'public.pagos_empleados'::regclass
    ) THEN
      ALTER TABLE public.pagos_empleados
      ADD CONSTRAINT ck_pagos_empleados_fecha_pago_when_processed
      CHECK (
        upper(btrim(COALESCE(estado, ''))) NOT IN ('PROCESADO', 'PAGADO')
        OR fecha_pago IS NOT NULL
      );
    END IF;
  END IF;

  IF to_regclass('public.rrhh_pagos') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rrhh_pagos_estado_upper_nonempty'
        AND conrelid = 'public.rrhh_pagos'::regclass
    ) THEN
      ALTER TABLE public.rrhh_pagos
      ADD CONSTRAINT ck_rrhh_pagos_estado_upper_nonempty
      CHECK (estado = upper(btrim(estado)) AND btrim(estado) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rrhh_pagos_periodo_format'
        AND conrelid = 'public.rrhh_pagos'::regclass
    ) THEN
      ALTER TABLE public.rrhh_pagos
      ADD CONSTRAINT ck_rrhh_pagos_periodo_format
      CHECK (periodo IS NULL OR periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rrhh_pagos_montos_nonnegative'
        AND conrelid = 'public.rrhh_pagos'::regclass
    ) THEN
      ALTER TABLE public.rrhh_pagos
      ADD CONSTRAINT ck_rrhh_pagos_montos_nonnegative
      CHECK (
        COALESCE(monto_bruto, 0) >= 0
        AND COALESCE(descuentos, 0) >= 0
        AND COALESCE(monto_neto, 0) >= 0
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_rrhh_pagos_fecha_pago_when_processed'
        AND conrelid = 'public.rrhh_pagos'::regclass
    ) THEN
      ALTER TABLE public.rrhh_pagos
      ADD CONSTRAINT ck_rrhh_pagos_fecha_pago_when_processed
      CHECK (
        upper(btrim(COALESCE(estado, ''))) NOT IN ('PROCESADO', 'PAGADO')
        OR fecha_pago IS NOT NULL
      );
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.pagos_empleados
  VALIDATE CONSTRAINT ck_pagos_empleados_estado_upper_nonempty;
ALTER TABLE IF EXISTS public.pagos_empleados
  VALIDATE CONSTRAINT ck_pagos_empleados_periodo_format;
ALTER TABLE IF EXISTS public.pagos_empleados
  VALIDATE CONSTRAINT ck_pagos_empleados_montos_nonnegative;
ALTER TABLE IF EXISTS public.pagos_empleados
  VALIDATE CONSTRAINT ck_pagos_empleados_fecha_pago_when_processed;

ALTER TABLE IF EXISTS public.rrhh_pagos
  VALIDATE CONSTRAINT ck_rrhh_pagos_estado_upper_nonempty;
ALTER TABLE IF EXISTS public.rrhh_pagos
  VALIDATE CONSTRAINT ck_rrhh_pagos_periodo_format;
ALTER TABLE IF EXISTS public.rrhh_pagos
  VALIDATE CONSTRAINT ck_rrhh_pagos_montos_nonnegative;
ALTER TABLE IF EXISTS public.rrhh_pagos
  VALIDATE CONSTRAINT ck_rrhh_pagos_fecha_pago_when_processed;

-- ----------------------------------------------------------------------------
-- Índices de integridad y performance para consultas de pagos RRHH.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_empleados_tenant_planilla_empleado
ON public.pagos_empleados (tenant_id, planilla_id, empleado_id)
WHERE tenant_id IS NOT NULL
  AND planilla_id IS NOT NULL
  AND empleado_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rrhh_pagos_tenant_planilla_empleado
ON public.rrhh_pagos (tenant_id, planilla_id, empleado_id)
WHERE tenant_id IS NOT NULL
  AND planilla_id IS NOT NULL
  AND empleado_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_empleados_tenant_periodo_created
ON public.pagos_empleados (tenant_id, periodo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pagos_empleados_tenant_empleado_periodo
ON public.pagos_empleados (tenant_id, empleado_id, periodo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rrhh_pagos_tenant_periodo_fecha_pago
ON public.rrhh_pagos (tenant_id, periodo, fecha_pago DESC);

CREATE INDEX IF NOT EXISTS idx_rrhh_pagos_tenant_empleado_fecha_pago
ON public.rrhh_pagos (tenant_id, empleado_id, fecha_pago DESC);

COMMIT;
