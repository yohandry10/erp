-- ============================================================================
-- 331__production_accounting_flow_hardening.sql
-- Cierra brechas detectadas en auditoria forense contable 2026-05:
-- - defaults RRHH/retenciones por tenant
-- - unicidad operativa de conceptos de planilla
-- - alineacion historica source_event_id CPE/CxC/asientos
-- - materialized views contables pobladas despues de reconstruccion
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- RRHH: conceptos base completos por tenant y unicidad tenant+codigo
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, upper(btrim(COALESCE(codigo, '')))
      ORDER BY activo DESC NULLS LAST, created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.conceptos_planilla
  WHERE tenant_id IS NOT NULL
    AND NULLIF(btrim(COALESCE(codigo, '')), '') IS NOT NULL
)
DELETE FROM public.conceptos_planilla cp
USING ranked r
WHERE cp.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_conceptos_planilla_tenant_codigo
ON public.conceptos_planilla (tenant_id, upper(btrim(codigo)))
WHERE tenant_id IS NOT NULL
  AND codigo IS NOT NULL
  AND btrim(codigo) <> '';

INSERT INTO public.conceptos_planilla (
  tenant_id,
  codigo,
  nombre,
  estado,
  activo,
  metadata,
  created_at,
  updated_at
)
SELECT
  t.id,
  s.codigo,
  s.nombre,
  'ACTIVO',
  true,
  jsonb_build_object('tipo', s.tipo, 'seed', '331__production_accounting_flow_hardening'),
  now(),
  now()
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('001'::text, 'Sueldo basico'::text, 'ingreso'::text),
    ('002'::text, 'Asignacion familiar'::text, 'ingreso'::text),
    ('003'::text, 'Horas extras 25%'::text, 'ingreso'::text),
    ('004'::text, 'Horas extras 35%'::text, 'ingreso'::text),
    ('005'::text, 'Bono adicional'::text, 'ingreso'::text),
    ('101'::text, 'Aporte AFP'::text, 'descuento'::text),
    ('102'::text, 'Comision AFP'::text, 'descuento'::text),
    ('103'::text, 'Seguro AFP'::text, 'descuento'::text),
    ('104'::text, 'Aporte ONP'::text, 'descuento'::text),
    ('105'::text, 'Impuesto a la renta quinta categoria'::text, 'descuento'::text),
    ('106'::text, 'Tardanzas'::text, 'descuento'::text),
    ('107'::text, 'Faltas'::text, 'descuento'::text),
    ('201'::text, 'Aporte EsSalud'::text, 'aporte_empleador'::text)
) AS s(codigo, nombre, tipo)
WHERE COALESCE(t.activo, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.conceptos_planilla cp
    WHERE cp.tenant_id = t.id
      AND upper(btrim(COALESCE(cp.codigo, ''))) = s.codigo
  );

-- ----------------------------------------------------------------------------
-- Retenciones: categorias obligatorias CUARTA/QUINTA para tenants actuales
-- ----------------------------------------------------------------------------
INSERT INTO public.configuracion_retenciones (
  tenant_id,
  categoria,
  codigo,
  nombre,
  descripcion,
  tasa_porcentaje,
  monto_minimo,
  activo,
  estado,
  metadata,
  created_at,
  updated_at
)
SELECT
  t.id,
  s.categoria,
  s.categoria,
  format('RETENCION_%s', s.categoria),
  s.descripcion,
  s.tasa_porcentaje,
  s.monto_minimo,
  true,
  'ACTIVO',
  jsonb_build_object('source', '331__production_accounting_flow_hardening'),
  now(),
  now()
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('CUARTA'::text, 'Configuracion de retencion cuarta categoria'::text, 8.00::numeric, 1500.00::numeric),
    ('QUINTA'::text, 'Configuracion de retencion quinta categoria'::text, 8.00::numeric, 0.00::numeric)
) AS s(categoria, descripcion, tasa_porcentaje, monto_minimo)
WHERE COALESCE(t.activo, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.configuracion_retenciones cr
    WHERE cr.tenant_id = t.id
      AND upper(COALESCE(cr.categoria, '')) = s.categoria
      AND COALESCE(cr.activo, true) = true
  );

-- ----------------------------------------------------------------------------
-- PCGE runtime RRHH: cuentas necesarias para planillas y aportes empleador
-- ----------------------------------------------------------------------------
INSERT INTO public.plan_cuentas (
  tenant_id,
  codigo,
  nombre,
  tipo,
  tipo_cuenta,
  nivel,
  acepta_movimiento,
  activo,
  estado,
  metadata,
  created_at,
  updated_at
)
SELECT
  t.id,
  c.codigo,
  c.nombre,
  c.tipo,
  c.tipo_cuenta,
  c.nivel,
  true,
  true,
  'ACTIVO',
  jsonb_build_object('source', '331__production_accounting_flow_hardening'),
  now(),
  now()
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('401'::text, 'Gobierno central', 'PASIVO', 'PASIVO', 3),
    ('407'::text, 'Administradoras de fondos y aportes por pagar', 'PASIVO', 'PASIVO', 3),
    ('627'::text, 'Seguridad, prevision social y otras contribuciones', 'GASTO', 'GASTO', 3)
) AS c(codigo, nombre, tipo, tipo_cuenta, nivel)
WHERE COALESCE(t.activo, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.plan_cuentas pc
    WHERE pc.tenant_id = t.id
      AND pc.codigo = c.codigo
  );

-- ----------------------------------------------------------------------------
-- Tenants futuros: seed idempotente de defaults operativos al crear tenant
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.seed_operational_defaults_for_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  INSERT INTO public.conceptos_planilla (
    tenant_id, codigo, nombre, estado, activo, metadata, created_at, updated_at
  )
  SELECT
    NEW.id,
    s.codigo,
    s.nombre,
    'ACTIVO',
    true,
    jsonb_build_object('tipo', s.tipo, 'seed', 'trg_seed_operational_defaults_for_tenant'),
    now(),
    now()
  FROM (
    VALUES
      ('001'::text, 'Sueldo basico'::text, 'ingreso'::text),
      ('002'::text, 'Asignacion familiar'::text, 'ingreso'::text),
      ('003'::text, 'Horas extras 25%'::text, 'ingreso'::text),
      ('004'::text, 'Horas extras 35%'::text, 'ingreso'::text),
      ('005'::text, 'Bono adicional'::text, 'ingreso'::text),
      ('101'::text, 'Aporte AFP'::text, 'descuento'::text),
      ('102'::text, 'Comision AFP'::text, 'descuento'::text),
      ('103'::text, 'Seguro AFP'::text, 'descuento'::text),
      ('104'::text, 'Aporte ONP'::text, 'descuento'::text),
      ('105'::text, 'Impuesto a la renta quinta categoria'::text, 'descuento'::text),
      ('106'::text, 'Tardanzas'::text, 'descuento'::text),
      ('107'::text, 'Faltas'::text, 'descuento'::text),
      ('201'::text, 'Aporte EsSalud'::text, 'aporte_empleador'::text)
  ) AS s(codigo, nombre, tipo)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.conceptos_planilla cp
    WHERE cp.tenant_id = NEW.id
      AND upper(btrim(COALESCE(cp.codigo, ''))) = s.codigo
  );

  INSERT INTO public.configuracion_retenciones (
    tenant_id, categoria, codigo, nombre, descripcion, tasa_porcentaje,
    monto_minimo, activo, estado, metadata, created_at, updated_at
  )
  SELECT
    NEW.id,
    s.categoria,
    s.categoria,
    format('RETENCION_%s', s.categoria),
    s.descripcion,
    s.tasa_porcentaje,
    s.monto_minimo,
    true,
    'ACTIVO',
    jsonb_build_object('source', 'trg_seed_operational_defaults_for_tenant'),
    now(),
    now()
  FROM (
    VALUES
      ('CUARTA'::text, 'Configuracion de retencion cuarta categoria'::text, 8.00::numeric, 1500.00::numeric),
      ('QUINTA'::text, 'Configuracion de retencion quinta categoria'::text, 8.00::numeric, 0.00::numeric)
  ) AS s(categoria, descripcion, tasa_porcentaje, monto_minimo)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.configuracion_retenciones cr
    WHERE cr.tenant_id = NEW.id
      AND upper(COALESCE(cr.categoria, '')) = s.categoria
      AND COALESCE(cr.activo, true) = true
  );

  INSERT INTO public.plan_cuentas (
    tenant_id, codigo, nombre, tipo, tipo_cuenta, nivel, acepta_movimiento,
    activo, estado, metadata, created_at, updated_at
  )
  SELECT
    NEW.id,
    c.codigo,
    c.nombre,
    c.tipo,
    c.tipo_cuenta,
    c.nivel,
    true,
    true,
    'ACTIVO',
    jsonb_build_object('source', 'trg_seed_operational_defaults_for_tenant'),
    now(),
    now()
  FROM (
    VALUES
      ('401'::text, 'Gobierno central', 'PASIVO', 'PASIVO', 3),
      ('407'::text, 'Administradoras de fondos y aportes por pagar', 'PASIVO', 'PASIVO', 3),
      ('627'::text, 'Seguridad, prevision social y otras contribuciones', 'GASTO', 'GASTO', 3)
  ) AS c(codigo, nombre, tipo, tipo_cuenta, nivel)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.plan_cuentas pc
    WHERE pc.tenant_id = NEW.id
      AND pc.codigo = c.codigo
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_operational_defaults_for_tenant ON public.tenants;
CREATE TRIGGER trg_seed_operational_defaults_for_tenant
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION app.seed_operational_defaults_for_tenant();

-- ----------------------------------------------------------------------------
-- CPE/CxC/contabilidad: alinear asientos historicos al eventId canonico fiscal
-- ----------------------------------------------------------------------------
WITH cxc_events AS (
  SELECT
    oe.tenant_id,
    oe.event_id AS outbox_event_id,
    (oe.payload->>'eventId')::uuid AS canonical_event_id
  FROM public.outbox_events oe
  WHERE oe.event_type = 'cxc.creada'
    AND oe.payload ? 'eventId'
    AND oe.payload->>'eventId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND oe.event_id IS DISTINCT FROM (oe.payload->>'eventId')::uuid
),
ranked_matches AS (
  SELECT
    ac.id AS asiento_id,
    ce.tenant_id,
    ce.canonical_event_id,
    row_number() OVER (
      PARTITION BY ce.tenant_id, ce.canonical_event_id
      ORDER BY ac.created_at ASC NULLS LAST, ac.id ASC
    ) AS rn
  FROM cxc_events ce
  JOIN public.asientos_contables ac
    ON ac.tenant_id = ce.tenant_id
   AND ac.source_event_id = ce.outbox_event_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.asientos_contables existing
    WHERE existing.tenant_id = ce.tenant_id
      AND existing.source_event_id = ce.canonical_event_id
      AND existing.id <> ac.id
  )
)
UPDATE public.asientos_contables ac
SET source_event_id = rm.canonical_event_id,
    updated_at = now()
FROM ranked_matches rm
WHERE ac.id = rm.asiento_id
  AND rm.rn = 1;

UPDATE public.outbox_events oe
SET status = 'completed',
    processed_at = COALESCE(processed_at, updated_at, now()),
    error_message = NULL,
    next_retry_at = NULL,
    updated_at = now()
WHERE lower(oe.status::text) = 'dead_letter'
  AND oe.event_type = 'cxc.creada'
  AND oe.payload ? 'eventId'
  AND oe.payload->>'eventId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.asientos_contables ac
    WHERE ac.tenant_id = oe.tenant_id
      AND ac.source_event_id = (oe.payload->>'eventId')::uuid
  );

-- ----------------------------------------------------------------------------
-- Materialized views contables: poblarlas despues de reconstrucciones WITH NO DATA
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.mv_balance_comprobacion') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.mv_balance_comprobacion;
  END IF;

  IF to_regclass('public.mv_estado_resultados') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.mv_estado_resultados;
  END IF;

  IF to_regclass('public.mv_balance_general') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW public.mv_balance_general;
  END IF;
END $$;

COMMIT;
