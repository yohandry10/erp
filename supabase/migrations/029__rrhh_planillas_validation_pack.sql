-- ============================================================================
-- 029__rrhh_planillas_validation_pack.sql
-- Pack de validación operativa para flujo de planillas RRHH.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Vista de integridad por planilla (cabecera vs detalle)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_planillas_integridad AS
SELECT
  p.tenant_id,
  p.id AS planilla_id,
  p.periodo,
  p.estado,
  COUNT(DISTINCT ep.id) AS total_empleados_detalle,
  COUNT(ep.id) FILTER (WHERE ep.planilla_id IS NULL OR ep.empleado_id IS NULL) AS empleados_detalle_con_fk_incompleta,
  COUNT(epc.id) AS total_conceptos_detalle,
  COALESCE(SUM(ep.total_ingresos), 0) AS suma_detalle_ingresos,
  COALESCE(SUM(ep.total_descuentos), 0) AS suma_detalle_descuentos,
  COALESCE(SUM(ep.total_aportes), 0) AS suma_detalle_aportes,
  COALESCE(SUM(ep.neto_pagar), 0) AS suma_detalle_neto,
  COALESCE(p.total_ingresos, 0) AS cabecera_total_ingresos,
  COALESCE(p.total_descuentos, 0) AS cabecera_total_descuentos,
  COALESCE(p.total_aportes, 0) AS cabecera_total_aportes,
  COALESCE(p.total_neto, 0) AS cabecera_total_neto,
  COALESCE(SUM(ep.total_ingresos), 0) - COALESCE(p.total_ingresos, 0) AS diff_ingresos,
  COALESCE(SUM(ep.total_descuentos), 0) - COALESCE(p.total_descuentos, 0) AS diff_descuentos,
  COALESCE(SUM(ep.total_aportes), 0) - COALESCE(p.total_aportes, 0) AS diff_aportes,
  COALESCE(SUM(ep.neto_pagar), 0) - COALESCE(p.total_neto, 0) AS diff_neto
FROM public.planillas p
LEFT JOIN public.empleado_planilla ep
  ON ep.planilla_id = p.id
LEFT JOIN public.empleado_planilla_conceptos epc
  ON epc.empleado_planilla_id = ep.id
GROUP BY
  p.tenant_id,
  p.id,
  p.periodo,
  p.estado,
  p.total_ingresos,
  p.total_descuentos,
  p.total_aportes,
  p.total_neto;

-- ----------------------------------------------------------------------------
-- Función de validación por tenant (o global)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_flujo_planillas(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  check_name text,
  status text,
  affected bigint,
  detail jsonb
)
LANGUAGE sql
AS $$
WITH
planillas_scope AS (
  SELECT p.id, p.tenant_id
  FROM public.planillas p
  WHERE p_tenant_id IS NULL OR p.tenant_id = p_tenant_id
),
c_planillas_sin_detalle AS (
  SELECT COUNT(*)::bigint AS cnt
  FROM planillas_scope ps
  LEFT JOIN public.empleado_planilla ep ON ep.planilla_id = ps.id
  WHERE ep.id IS NULL
),
c_empleado_planilla_sin_planilla AS (
  SELECT COUNT(*)::bigint AS cnt
  FROM public.empleado_planilla ep
  LEFT JOIN public.planillas p ON p.id = ep.planilla_id
  WHERE (p_tenant_id IS NULL OR ep.tenant_id = p_tenant_id)
    AND (ep.planilla_id IS NULL OR p.id IS NULL)
),
c_empleado_planilla_sin_empleado AS (
  SELECT COUNT(*)::bigint AS cnt
  FROM public.empleado_planilla ep
  LEFT JOIN public.empleados e ON e.id = ep.empleado_id
  WHERE (p_tenant_id IS NULL OR ep.tenant_id = p_tenant_id)
    AND (ep.empleado_id IS NULL OR e.id IS NULL)
),
c_conceptos_sin_empleado_planilla AS (
  SELECT COUNT(*)::bigint AS cnt
  FROM public.empleado_planilla_conceptos epc
  LEFT JOIN public.empleado_planilla ep ON ep.id = epc.empleado_planilla_id
  WHERE (p_tenant_id IS NULL OR epc.tenant_id = p_tenant_id)
    AND (epc.empleado_planilla_id IS NULL OR ep.id IS NULL)
),
c_pagos_empleados_sin_planilla AS (
  SELECT COUNT(*)::bigint AS cnt
  FROM public.pagos_empleados pe
  LEFT JOIN public.planillas p ON p.id = pe.planilla_id
  WHERE (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id)
    AND (pe.planilla_id IS NULL OR p.id IS NULL)
),
c_rrhh_pagos_sin_planilla AS (
  SELECT COUNT(*)::bigint AS cnt
  FROM public.rrhh_pagos rp
  LEFT JOIN public.planillas p ON p.id = rp.planilla_id
  WHERE (p_tenant_id IS NULL OR rp.tenant_id = p_tenant_id)
    AND (rp.planilla_id IS NULL OR p.id IS NULL)
),
c_rrhh_pagos_sin_empleado AS (
  SELECT COUNT(*)::bigint AS cnt
  FROM public.rrhh_pagos rp
  LEFT JOIN public.empleados e ON e.id = rp.empleado_id
  WHERE (p_tenant_id IS NULL OR rp.tenant_id = p_tenant_id)
    AND (rp.empleado_id IS NULL OR e.id IS NULL)
),
c_tenant_mismatch_ep AS (
  SELECT COUNT(*)::bigint AS cnt
  FROM public.empleado_planilla ep
  LEFT JOIN public.planillas p ON p.id = ep.planilla_id
  LEFT JOIN public.empleados e ON e.id = ep.empleado_id
  WHERE (p_tenant_id IS NULL OR ep.tenant_id = p_tenant_id)
    AND (
      (p.tenant_id IS NOT NULL AND ep.tenant_id IS DISTINCT FROM p.tenant_id)
      OR (e.tenant_id IS NOT NULL AND ep.tenant_id IS DISTINCT FROM e.tenant_id)
      OR (p.tenant_id IS NOT NULL AND e.tenant_id IS NOT NULL AND p.tenant_id IS DISTINCT FROM e.tenant_id)
    )
),
c_tenant_mismatch_rrhh_pagos AS (
  SELECT COUNT(*)::bigint AS cnt
  FROM public.rrhh_pagos rp
  LEFT JOIN public.planillas p ON p.id = rp.planilla_id
  LEFT JOIN public.empleados e ON e.id = rp.empleado_id
  WHERE (p_tenant_id IS NULL OR rp.tenant_id = p_tenant_id)
    AND (
      (p.tenant_id IS NOT NULL AND rp.tenant_id IS DISTINCT FROM p.tenant_id)
      OR (e.tenant_id IS NOT NULL AND rp.tenant_id IS DISTINCT FROM e.tenant_id)
    )
)
SELECT
  'planillas_sin_detalle'::text,
  CASE WHEN c.cnt = 0 THEN 'OK' ELSE 'WARN' END::text,
  c.cnt,
  jsonb_build_object('scope_tenant_id', p_tenant_id)
FROM c_planillas_sin_detalle c
UNION ALL
SELECT
  'empleado_planilla_sin_planilla',
  CASE WHEN c.cnt = 0 THEN 'OK' ELSE 'WARN' END,
  c.cnt,
  jsonb_build_object('scope_tenant_id', p_tenant_id)
FROM c_empleado_planilla_sin_planilla c
UNION ALL
SELECT
  'empleado_planilla_sin_empleado',
  CASE WHEN c.cnt = 0 THEN 'OK' ELSE 'WARN' END,
  c.cnt,
  jsonb_build_object('scope_tenant_id', p_tenant_id)
FROM c_empleado_planilla_sin_empleado c
UNION ALL
SELECT
  'conceptos_sin_empleado_planilla',
  CASE WHEN c.cnt = 0 THEN 'OK' ELSE 'WARN' END,
  c.cnt,
  jsonb_build_object('scope_tenant_id', p_tenant_id)
FROM c_conceptos_sin_empleado_planilla c
UNION ALL
SELECT
  'pagos_empleados_sin_planilla',
  CASE WHEN c.cnt = 0 THEN 'OK' ELSE 'WARN' END,
  c.cnt,
  jsonb_build_object('scope_tenant_id', p_tenant_id)
FROM c_pagos_empleados_sin_planilla c
UNION ALL
SELECT
  'rrhh_pagos_sin_planilla',
  CASE WHEN c.cnt = 0 THEN 'OK' ELSE 'WARN' END,
  c.cnt,
  jsonb_build_object('scope_tenant_id', p_tenant_id)
FROM c_rrhh_pagos_sin_planilla c
UNION ALL
SELECT
  'rrhh_pagos_sin_empleado',
  CASE WHEN c.cnt = 0 THEN 'OK' ELSE 'WARN' END,
  c.cnt,
  jsonb_build_object('scope_tenant_id', p_tenant_id)
FROM c_rrhh_pagos_sin_empleado c
UNION ALL
SELECT
  'tenant_mismatch_empleado_planilla',
  CASE WHEN c.cnt = 0 THEN 'OK' ELSE 'WARN' END,
  c.cnt,
  jsonb_build_object('scope_tenant_id', p_tenant_id)
FROM c_tenant_mismatch_ep c
UNION ALL
SELECT
  'tenant_mismatch_rrhh_pagos',
  CASE WHEN c.cnt = 0 THEN 'OK' ELSE 'WARN' END,
  c.cnt,
  jsonb_build_object('scope_tenant_id', p_tenant_id)
FROM c_tenant_mismatch_rrhh_pagos c;
$$;

CREATE OR REPLACE FUNCTION public.validar_flujo_planillas_final(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  check_name text,
  status text,
  affected bigint,
  detail jsonb
)
LANGUAGE sql
AS $$
  SELECT * FROM public.validar_flujo_planillas(p_tenant_id);
$$;

CREATE OR REPLACE VIEW public.v_planillas_validacion_actual AS
SELECT *
FROM public.validar_flujo_planillas(app.current_tenant_id());

COMMIT;
