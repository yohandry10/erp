-- Migration 028: Aplicar RLS a tablas de planilla faltantes
-- Fecha: 2025-10-23
-- Descripción: Aplica RLS a empleado_planilla e historial_pagos_planilla
-- Fase 1: Seguridad Multi-Tenant - Completar cobertura RRHH

BEGIN;

-- Aplicar RLS a empleado_planilla
SELECT add_tenant_id_if_missing('empleado_planilla');
SELECT enable_rls_tenant_isolation('empleado_planilla');

-- Aplicar RLS a historial_pagos_planilla
SELECT add_tenant_id_if_missing('historial_pagos_planilla');
SELECT enable_rls_tenant_isolation('historial_pagos_planilla');

-- Backfill de tenant_id para empleado_planilla
-- Asignar tenant_id basado en la relación con empleados
UPDATE empleado_planilla ep
SET tenant_id = (
  SELECT e.tenant_id 
  FROM empleados e 
  WHERE e.id = ep.id_empleado 
  LIMIT 1
)
WHERE ep.tenant_id IS NULL;

-- Backfill de tenant_id para empleado_planilla_conceptos
-- Asignar tenant_id basado en la relación con empleado_planilla
UPDATE empleado_planilla_conceptos epc
SET tenant_id = (
  SELECT ep.tenant_id 
  FROM empleado_planilla ep 
  WHERE ep.id = epc.id_empleado_planilla 
  LIMIT 1
)
WHERE epc.tenant_id IS NULL;

-- Backfill de tenant_id para historial_pagos_planilla
-- Asignar tenant_id basado en la relación con empleado_planilla
UPDATE historial_pagos_planilla hpp
SET tenant_id = (
  SELECT ep.tenant_id 
  FROM empleado_planilla ep 
  WHERE ep.id = hpp.planilla_id 
  LIMIT 1
)
WHERE hpp.tenant_id IS NULL;

COMMIT;
