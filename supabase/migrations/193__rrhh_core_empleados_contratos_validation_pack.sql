-- ============================================================================
-- 193__rrhh_core_empleados_contratos_validation_pack.sql
-- Pack de validacion runtime para RRHH core:
-- departamentos, empleados y contratos.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rrhh_core_empleados_contratos_runtime(
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
  -- Triggers normalize
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('departamentos', 'trg_normalize_departamentos_row', 'normalizacion en departamentos'),
      ('empleados', 'trg_normalize_empleados_row', 'normalizacion en empleados'),
      ('contratos', 'trg_normalize_contratos_row', 'normalizacion en contratos')
  )
  SELECT
    format('trigger_%s_exists', e.trigger_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND t.tgname = e.trigger_name
        AND NOT t.tgisinternal
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Triggers enforce tenant
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('empleados', 'trg_enforce_empleados_tenant_consistency', 'consistencia tenant en empleados'),
      ('contratos', 'trg_enforce_contratos_tenant_consistency', 'consistencia tenant en contratos')
  )
  SELECT
    format('trigger_%s_exists', e.trigger_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND t.tgname = e.trigger_name
        AND NOT t.tgisinternal
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Shape runtime de columnas
  RETURN QUERY
  SELECT
    'departamentos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 6
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'departamentos'
        AND c.column_name IN ('tenant_id', 'nombre', 'descripcion', 'codigo', 'estado', 'activo')
    ),
    'columnas runtime de departamentos';

  RETURN QUERY
  SELECT
    'empleados_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 24
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'empleados'
        AND c.column_name IN (
          'tenant_id', 'nombres', 'apellidos', 'tipo_documento', 'numero_documento', 'email',
          'telefono', 'direccion', 'fecha_nacimiento', 'fecha_ingreso', 'id_departamento',
          'departamento_id', 'puesto', 'estado', 'activo', 'tiene_hijos', 'cantidad_hijos',
          'asignacion_familiar', 'cuenta_bancaria', 'banco', 'tipo_cuenta', 'contacto_emergencia',
          'telefono_emergencia', 'foto_url'
        )
    ),
    'columnas runtime de empleados';

  RETURN QUERY
  SELECT
    'contratos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 17
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'contratos'
        AND c.column_name IN (
          'tenant_id', 'id_empleado', 'empleado_id', 'tipo_contrato', 'fecha_inicio', 'fecha_fin',
          'sueldo_bruto', 'salario', 'moneda', 'regimen_pensionario', 'estado', 'activo',
          'motivo_finalizacion', 'observaciones', 'beneficios', 'jornada_laboral', 'periodo_prueba_meses'
        )
    ),
    'columnas runtime de contratos';

  -- FKs esperadas (solo una por relacion para embeds no ambiguos)
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('empleados', 'empleados_id_departamento_fkey_runtime', 'FK empleados -> departamentos'),
      ('contratos', 'contratos_id_empleado_fkey_runtime', 'FK contratos -> empleados')
  )
  SELECT
    format('fk_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = e.relname
        AND c.conname = e.conname
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Indices esperados
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('departamentos', 'idx_departamentos_tenant_estado_nombre_runtime', 'indice runtime departamentos'),
      ('empleados', 'idx_empleados_tenant_estado_nombre_runtime', 'indice runtime empleados'),
      ('empleados', 'idx_empleados_tenant_departamento_estado_runtime', 'indice runtime empleados por departamento'),
      ('empleados', 'idx_empleados_tenant_documento_runtime', 'indice runtime empleados por documento'),
      ('contratos', 'idx_contratos_tenant_empleado_estado_fecha_runtime', 'indice runtime contratos por empleado'),
      ('contratos', 'idx_contratos_tenant_tipo_estado_runtime', 'indice runtime contratos por tipo/estado'),
      ('contratos', 'idx_contratos_tenant_fecha_inicio_runtime', 'indice runtime contratos por fecha inicio'),
      ('departamentos', 'ux_departamentos_tenant_nombre_activo', 'unicidad departamentos activos'),
      ('empleados', 'ux_empleados_tenant_documento_activo', 'unicidad empleados por documento'),
      ('contratos', 'ux_contratos_tenant_empleado_fecha_tipo_activo', 'unicidad contratos activos')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- RLS enabled + forced
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('departamentos'),
      ('empleados'),
      ('contratos')
  )
  SELECT
    format('rls_%s_enabled_forced', e.table_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ) AS ok,
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  -- Duplicados por scope
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(nombre)), COUNT(*)
    FROM public.departamentos
    WHERE tenant_id IS NOT NULL
      AND nombre IS NOT NULL
      AND btrim(nombre) <> ''
      AND estado = 'activo'
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(nombre))
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY SELECT 'departamentos_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(tipo_documento)), upper(btrim(numero_documento)), COUNT(*)
    FROM public.empleados
    WHERE tenant_id IS NOT NULL
      AND tipo_documento IS NOT NULL
      AND numero_documento IS NOT NULL
      AND btrim(numero_documento) <> ''
      AND estado IN ('activo', 'inactivo', 'suspendido')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(tipo_documento)), upper(btrim(numero_documento))
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY SELECT 'empleados_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, id_empleado, fecha_inicio, tipo_contrato, COUNT(*)
    FROM public.contratos
    WHERE tenant_id IS NOT NULL
      AND id_empleado IS NOT NULL
      AND fecha_inicio IS NOT NULL
      AND tipo_contrato IS NOT NULL
      AND estado IN ('vigente', 'renovado', 'en_periodo_prueba', 'vencido')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, id_empleado, fecha_inicio, tipo_contrato
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY SELECT 'contratos_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count)::text;

  -- Filas invalidas por reglas de negocio
  SELECT COUNT(*) INTO v_count
  FROM public.departamentos d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      d.nombre IS NULL
      OR btrim(d.nombre) = ''
      OR d.estado NOT IN ('activo', 'inactivo')
    );
  RETURN QUERY SELECT 'departamentos_invalid_rows'::text, (v_count = 0), format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.empleados e
  WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
    AND (
      e.estado NOT IN ('activo', 'inactivo', 'suspendido', 'cesado')
      OR e.tipo_documento NOT IN ('DNI', 'CE', 'PASAPORTE', 'RUC', 'OTRO')
      OR e.cantidad_hijos < 0
      OR (e.fecha_nacimiento IS NOT NULL AND e.fecha_nacimiento > current_date)
      OR (e.fecha_ingreso IS NOT NULL AND e.fecha_nacimiento IS NOT NULL AND e.fecha_ingreso < e.fecha_nacimiento)
      OR (e.email IS NOT NULL AND e.email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
    );
  RETURN QUERY SELECT 'empleados_invalid_rows'::text, (v_count = 0), format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.contratos c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      c.estado NOT IN ('vigente', 'renovado', 'finalizado', 'terminado', 'vencido', 'en_periodo_prueba', 'anulado')
      OR c.tipo_contrato NOT IN ('indefinido', 'temporal', 'practicas', 'locacion_servicios', 'part_time', 'por_horas', 'servicios')
      OR c.sueldo_bruto < 0
      OR c.salario < 0
      OR c.periodo_prueba_meses < 0
      OR c.periodo_prueba_meses > 24
      OR (c.fecha_fin IS NOT NULL AND c.fecha_inicio IS NOT NULL AND c.fecha_fin < c.fecha_inicio)
      OR c.regimen_pensionario NOT IN ('AFP', 'ONP', 'MIXTO', 'SIN_REGIMEN')
    );
  RETURN QUERY SELECT 'contratos_invalid_rows'::text, (v_count = 0), format('filas invalidas: %s', v_count)::text;

  -- Mismatch tenant por relaciones
  SELECT COUNT(*) INTO v_count
  FROM public.empleados e
  LEFT JOIN public.departamentos d ON d.id = e.id_departamento
  WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
    AND d.id IS NOT NULL
    AND d.tenant_id IS NOT NULL
    AND e.tenant_id <> d.tenant_id;
  RETURN QUERY SELECT 'empleados_tenant_mismatch_departamento'::text, (v_count = 0), format('mismatches: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.contratos c
  LEFT JOIN public.empleados e ON e.id = c.id_empleado
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND e.id IS NOT NULL
    AND e.tenant_id IS NOT NULL
    AND c.tenant_id <> e.tenant_id;
  RETURN QUERY SELECT 'contratos_tenant_mismatch_empleado'::text, (v_count = 0), format('mismatches: %s', v_count)::text;

  -- Huerfanos por relaciones core
  SELECT COUNT(*) INTO v_count
  FROM public.empleados e
  LEFT JOIN public.departamentos d ON d.id = e.id_departamento
  WHERE e.id_departamento IS NOT NULL
    AND d.id IS NULL
    AND (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'empleados_orphans_departamento'::text, (v_count = 0), format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*) INTO v_count
  FROM public.contratos c
  LEFT JOIN public.empleados e ON e.id = c.id_empleado
  WHERE c.id_empleado IS NOT NULL
    AND e.id IS NULL
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'contratos_orphans_empleado'::text, (v_count = 0), format('huerfanos: %s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rrhh_core_empleados_contratos_runtime_status_actual AS
SELECT *
FROM public.validar_rrhh_core_empleados_contratos_runtime(app.current_tenant_id());

COMMIT;
