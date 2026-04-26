-- ============================================================================
-- 076__rrhh_pagos_validation_pack.sql
-- Pack de validación runtime para consistencia de pagos RRHH.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_pagos_runtime(
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
  v_count bigint;
BEGIN
  RETURN QUERY
  SELECT
    'trigger_sync_rrhh_pagos_from_pagos_empleados'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pagos_empleados'
        AND t.tgname = 'trg_sync_rrhh_pagos_from_pagos_empleados'
        AND NOT t.tgisinternal
    ),
    'sync canónico -> alias';

  RETURN QUERY
  SELECT
    'trigger_sync_pagos_empleados_from_rrhh_pagos'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rrhh_pagos'
        AND t.tgname = 'trg_sync_pagos_empleados_from_rrhh_pagos'
        AND NOT t.tgisinternal
    ),
    'sync alias -> canónico';

  RETURN QUERY
  SELECT
    'trigger_normalize_pagos_empleados_pago'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pagos_empleados'
        AND t.tgname = 'trg_normalize_pagos_empleados_pago'
        AND NOT t.tgisinternal
    ),
    'normalización de pagos_empleados';

  RETURN QUERY
  SELECT
    'trigger_normalize_rrhh_pagos_pago'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rrhh_pagos'
        AND t.tgname = 'trg_normalize_rrhh_pagos_pago'
        AND NOT t.tgisinternal
    ),
    'normalización de rrhh_pagos';

  RETURN QUERY
  SELECT
    'usuario_id_type_text_pagos_empleados'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'pagos_empleados'
        AND column_name = 'usuario_id'
        AND udt_name = 'text'
    ),
    'compatibilidad con usuario_id=''sistema''';

  RETURN QUERY
  SELECT
    'usuario_id_type_text_rrhh_pagos'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'rrhh_pagos'
        AND column_name = 'usuario_id'
        AND udt_name = 'text'
    ),
    'compatibilidad con usuario_id=''sistema''';

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_empleados pe
  LEFT JOIN public.rrhh_pagos rp
    ON rp.id = pe.id
  WHERE rp.id IS NULL
    AND (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'missing_rrhh_rows_from_pagos_by_id'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rrhh_pagos rp
  LEFT JOIN public.pagos_empleados pe
    ON pe.id = rp.id
  WHERE pe.id IS NULL
    AND (p_tenant_id IS NULL OR rp.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'missing_pagos_rows_from_rrhh_by_id'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_empleados pe
  JOIN public.rrhh_pagos rp
    ON rp.id = pe.id
  WHERE (
      pe.tenant_id IS DISTINCT FROM rp.tenant_id
      OR pe.planilla_id IS DISTINCT FROM rp.planilla_id
      OR pe.empleado_id IS DISTINCT FROM rp.empleado_id
      OR pe.periodo IS DISTINCT FROM rp.periodo
      OR pe.fecha_pago IS DISTINCT FROM rp.fecha_pago
      OR pe.metodo_pago IS DISTINCT FROM rp.metodo_pago
      OR COALESCE(pe.sueldo_bruto, 0) IS DISTINCT FROM COALESCE(rp.monto_bruto, 0)
      OR COALESCE(pe.descuentos, 0) IS DISTINCT FROM COALESCE(rp.descuentos, 0)
      OR COALESCE(pe.monto_neto, 0) IS DISTINCT FROM COALESCE(rp.monto_neto, 0)
      OR pe.estado IS DISTINCT FROM rp.estado
    )
    AND (
      p_tenant_id IS NULL
      OR pe.tenant_id = p_tenant_id
      OR rp.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'field_mismatch_between_pagos_and_rrhh_by_id'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, planilla_id, empleado_id, COUNT(*) AS c
    FROM public.pagos_empleados
    WHERE tenant_id IS NOT NULL
      AND planilla_id IS NOT NULL
      AND empleado_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, planilla_id, empleado_id
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_logical_key_in_pagos_empleados'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, planilla_id, empleado_id, COUNT(*) AS c
    FROM public.rrhh_pagos
    WHERE tenant_id IS NOT NULL
      AND planilla_id IS NOT NULL
      AND empleado_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, planilla_id, empleado_id
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_logical_key_in_rrhh_pagos'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_empleados pe
  WHERE pe.periodo IS NOT NULL
    AND pe.periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    AND (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'invalid_periodo_format_pagos_empleados'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rrhh_pagos rp
  WHERE rp.periodo IS NOT NULL
    AND rp.periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    AND (p_tenant_id IS NULL OR rp.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'invalid_periodo_format_rrhh_pagos'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_empleados pe
  WHERE (
      COALESCE(pe.sueldo_bruto, 0) < 0
      OR COALESCE(pe.descuentos, 0) < 0
      OR COALESCE(pe.monto_neto, 0) < 0
    )
    AND (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'negative_amounts_pagos_empleados'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rrhh_pagos rp
  WHERE (
      COALESCE(rp.monto_bruto, 0) < 0
      OR COALESCE(rp.descuentos, 0) < 0
      OR COALESCE(rp.monto_neto, 0) < 0
    )
    AND (p_tenant_id IS NULL OR rp.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'negative_amounts_rrhh_pagos'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_empleados pe
  LEFT JOIN public.planillas p ON p.id = pe.planilla_id
  LEFT JOIN public.empleados e ON e.id = pe.empleado_id
  WHERE (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id)
    AND (
      (p.tenant_id IS NOT NULL AND pe.tenant_id IS DISTINCT FROM p.tenant_id)
      OR (e.tenant_id IS NOT NULL AND pe.tenant_id IS DISTINCT FROM e.tenant_id)
    );

  RETURN QUERY
  SELECT
    'tenant_mismatch_pagos_empleados'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rrhh_pagos rp
  LEFT JOIN public.planillas p ON p.id = rp.planilla_id
  LEFT JOIN public.empleados e ON e.id = rp.empleado_id
  WHERE (p_tenant_id IS NULL OR rp.tenant_id = p_tenant_id)
    AND (
      (p.tenant_id IS NOT NULL AND rp.tenant_id IS DISTINCT FROM p.tenant_id)
      OR (e.tenant_id IS NOT NULL AND rp.tenant_id IS DISTINCT FROM e.tenant_id)
    );

  RETURN QUERY
  SELECT
    'tenant_mismatch_rrhh_pagos'::text,
    (v_count = 0),
    format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_pagos_runtime_status_actual AS
SELECT *
FROM public.validar_rrhh_pagos_runtime(app.resolve_request_tenant_id());

COMMIT;
