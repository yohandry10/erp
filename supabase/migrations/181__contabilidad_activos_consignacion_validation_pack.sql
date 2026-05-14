-- ============================================================================
-- 181__contabilidad_activos_consignacion_validation_pack.sql
-- Pack de validacion runtime para contabilidad de activos/consignacion.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_contabilidad_activos_consignacion_runtime(
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
      ('activos_fijos', 'trg_normalize_activos_fijos_row', 'normalizacion activos_fijos'),
      ('depreciaciones', 'trg_normalize_depreciaciones_row', 'normalizacion depreciaciones'),
      ('registro_consignaciones', 'trg_normalize_registro_consignaciones_row', 'normalizacion registro_consignaciones'),
      ('movimientos_consignacion', 'trg_normalize_movimientos_consignacion_row', 'normalizacion movimientos_consignacion')
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
    ),
    e.detail::text
  FROM expected e;

  -- Triggers enforce tenant
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('activos_fijos', 'trg_enforce_activos_fijos_tenant_consistency', 'consistencia tenant activos_fijos'),
      ('depreciaciones', 'trg_enforce_depreciaciones_tenant_consistency', 'consistencia tenant depreciaciones'),
      ('registro_consignaciones', 'trg_enforce_registro_consignaciones_tenant_consistency', 'consistencia tenant registro_consignaciones'),
      ('movimientos_consignacion', 'trg_enforce_movimientos_consignacion_tenant_consistency', 'consistencia tenant movimientos_consignacion'),
      ('inventarios_permanentes', 'trg_enforce_inventarios_permanentes_tenant_consistency', 'consistencia tenant inventarios_permanentes'),
      ('saldos_iniciales_cuentas', 'trg_enforce_saldos_iniciales_cuentas_tenant_consistency', 'consistencia tenant saldos_iniciales_cuentas')
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
    ),
    e.detail::text
  FROM expected e;

  -- Shape de columnas runtime
  RETURN QUERY
  SELECT 'activos_fijos_runtime_columns_present'::text,
         (SELECT COUNT(*) = 10 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activos_fijos' AND column_name IN ('tenant_id','nombre','codigo','descripcion','fecha_adquisicion','valor_adquisicion','depreciacion_acumulada','vida_util','moneda','centro_costo_id')),
         'shape runtime activos_fijos';

  RETURN QUERY
  SELECT 'depreciaciones_runtime_columns_present'::text,
         (SELECT COUNT(*) = 8 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'depreciaciones' AND column_name IN ('tenant_id','activo_id','periodo','fecha_depreciacion','monto_depreciacion','centro_costo_id','procesado_outbox','evento_id')),
         'shape runtime depreciaciones';

  RETURN QUERY
  SELECT 'registro_consignaciones_runtime_columns_present'::text,
         (SELECT COUNT(*) = 10 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registro_consignaciones' AND column_name IN ('tenant_id','numero','fecha_registro','fecha_entrega','producto_id','consignatario_nombre','cantidad','valor_unitario','valor_total','moneda')),
         'shape runtime registro_consignaciones';

  RETURN QUERY
  SELECT 'movimientos_consignacion_runtime_columns_present'::text,
         (SELECT COUNT(*) = 10 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'movimientos_consignacion' AND column_name IN ('tenant_id','registro_id','consignacion_id','producto_id','fecha_movimiento','tipo_movimiento','cantidad','valor_unitario','valor_total','usuario_id')),
         'shape runtime movimientos_consignacion';

  RETURN QUERY
  SELECT 'inventarios_permanentes_runtime_columns_present'::text,
         (SELECT COUNT(*) = 10 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventarios_permanentes' AND column_name IN ('tenant_id','producto_id','almacen_id','periodo','fecha_corte','stock_inicial','entradas','salidas','stock_final','valor_total')),
         'shape runtime inventarios_permanentes';

  RETURN QUERY
  SELECT 'asignacion_costos_runtime_columns_present'::text,
         (SELECT COUNT(*) = 7 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'asignacion_costos' AND column_name IN ('tenant_id','centro_costo_id','referencia_tipo','referencia_id','porcentaje','monto','fecha_inicio')),
         'shape runtime asignacion_costos';

  RETURN QUERY
  SELECT 'calendario_empresa_runtime_columns_present'::text,
         (SELECT COUNT(*) = 6 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendario_empresa' AND column_name IN ('tenant_id','fecha','tipo_dia','periodo','pais','es_feriado')),
         'shape runtime calendario_empresa';

  RETURN QUERY
  SELECT 'saldos_iniciales_cuentas_runtime_columns_present'::text,
         (SELECT COUNT(*) = 8 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saldos_iniciales_cuentas' AND column_name IN ('tenant_id','cuenta_id','periodo','fecha_inicio','saldo_debe','saldo_haber','saldo_neto','moneda')),
         'shape runtime saldos_iniciales_cuentas';

  -- FKs
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('activos_fijos', 'activos_fijos_centro_costo_id_fkey_runtime', 'FK activos_fijos -> centros_costo'),
      ('depreciaciones', 'depreciaciones_activo_id_fkey_runtime', 'FK depreciaciones -> activos_fijos'),
      ('depreciaciones', 'depreciaciones_centro_costo_id_fkey_runtime', 'FK depreciaciones -> centros_costo'),
      ('registro_consignaciones', 'registro_consignaciones_producto_id_fkey_runtime', 'FK registro_consignaciones -> productos'),
      ('movimientos_consignacion', 'movimientos_consignacion_registro_id_fkey_runtime', 'FK movimientos_consignacion -> registro_consignaciones'),
      ('movimientos_consignacion', 'movimientos_consignacion_producto_id_fkey_runtime', 'FK movimientos_consignacion -> productos'),
      ('inventarios_permanentes', 'inventarios_permanentes_producto_id_fkey_runtime', 'FK inventarios_permanentes -> productos'),
      ('inventarios_permanentes', 'inventarios_permanentes_almacen_id_fkey_runtime', 'FK inventarios_permanentes -> almacenes'),
      ('asignacion_costos', 'asignacion_costos_centro_costo_id_fkey_runtime', 'FK asignacion_costos -> centros_costo'),
      ('saldos_iniciales_cuentas', 'saldos_iniciales_cuentas_cuenta_id_fkey_runtime', 'FK saldos_iniciales_cuentas -> plan_cuentas')
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
    ),
    e.detail::text
  FROM expected e;

  -- Indices clave
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('activos_fijos', 'idx_activos_fijos_tenant_estado_fecha_runtime', 'indice runtime activos_fijos'),
      ('depreciaciones', 'idx_depreciaciones_tenant_periodo_estado_runtime', 'indice runtime depreciaciones'),
      ('registro_consignaciones', 'idx_registro_consignaciones_tenant_fecha_estado_runtime', 'indice runtime registro_consignaciones'),
      ('movimientos_consignacion', 'idx_movimientos_consignacion_tenant_fecha_runtime', 'indice runtime movimientos_consignacion'),
      ('inventarios_permanentes', 'idx_inventarios_permanentes_tenant_periodo_producto_runtime', 'indice runtime inventarios_permanentes'),
      ('asignacion_costos', 'idx_asignacion_costos_tenant_centro_estado_runtime', 'indice runtime asignacion_costos'),
      ('calendario_empresa', 'idx_calendario_empresa_tenant_fecha_runtime', 'indice runtime calendario_empresa'),
      ('saldos_iniciales_cuentas', 'idx_saldos_iniciales_cuentas_tenant_periodo_runtime', 'indice runtime saldos_iniciales_cuentas'),
      ('activos_fijos', 'ux_activos_fijos_tenant_codigo_activo', 'unicidad activos_fijos'),
      ('depreciaciones', 'ux_depreciaciones_tenant_activo_periodo_runtime', 'unicidad depreciaciones'),
      ('registro_consignaciones', 'ux_registro_consignaciones_tenant_numero_runtime', 'unicidad registro_consignaciones'),
      ('inventarios_permanentes', 'ux_inventarios_permanentes_tenant_producto_almacen_periodo_runtime', 'unicidad inventarios_permanentes'),
      ('calendario_empresa', 'ux_calendario_empresa_tenant_fecha_runtime', 'unicidad calendario_empresa'),
      ('saldos_iniciales_cuentas', 'ux_saldos_iniciales_cuentas_tenant_cuenta_periodo_runtime', 'unicidad saldos_iniciales_cuentas')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = left(e.indexname, 63)
    ),
    e.detail::text
  FROM expected e;

  -- RLS enabled+forced
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('activos_fijos'),
      ('depreciaciones'),
      ('registro_consignaciones'),
      ('movimientos_consignacion'),
      ('inventarios_permanentes'),
      ('asignacion_costos'),
      ('calendario_empresa'),
      ('saldos_iniciales_cuentas')
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
    ),
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  -- Duplicados por scope
  SELECT COUNT(*) INTO v_count FROM (
    SELECT tenant_id, upper(btrim(codigo)), COUNT(*)
    FROM public.activos_fijos
    WHERE tenant_id IS NOT NULL
      AND codigo IS NOT NULL
      AND btrim(codigo) <> ''
      AND estado IN ('ACTIVO', 'INACTIVO', 'DEPRECIADO')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(codigo))
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY SELECT 'activos_fijos_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count FROM (
    SELECT tenant_id, activo_id, periodo, COUNT(*)
    FROM public.depreciaciones
    WHERE tenant_id IS NOT NULL
      AND activo_id IS NOT NULL
      AND periodo IS NOT NULL
      AND estado IN ('PENDIENTE', 'PROCESADA')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, activo_id, periodo
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY SELECT 'depreciaciones_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count FROM (
    SELECT tenant_id, upper(btrim(numero)), COUNT(*)
    FROM public.registro_consignaciones
    WHERE tenant_id IS NOT NULL
      AND numero IS NOT NULL
      AND btrim(numero) <> ''
      AND estado IN ('PENDIENTE', 'VENDIDA', 'DEVUELTA', 'CERRADA')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(numero))
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY SELECT 'registro_consignaciones_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  -- Filas invalidas
  SELECT COUNT(*) INTO v_count
  FROM public.depreciaciones d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      d.tenant_id IS NULL
      OR d.activo_id IS NULL
      OR d.periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      OR d.monto_depreciacion < 0
      OR d.estado NOT IN ('PENDIENTE', 'PROCESADA', 'ANULADA', 'ERROR')
    );
  RETURN QUERY SELECT 'depreciaciones_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.inventarios_permanentes i
  WHERE (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id)
    AND (
      i.tenant_id IS NULL
      OR i.producto_id IS NULL
      OR i.almacen_id IS NULL
      OR i.periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      OR i.stock_inicial < 0
      OR i.entradas < 0
      OR i.salidas < 0
      OR i.stock_final < 0
      OR i.estado NOT IN ('ABIERTO', 'CERRADO', 'ANULADO')
    );
  RETURN QUERY SELECT 'inventarios_permanentes_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Mismatch tenant / orfandad
  SELECT COUNT(*) INTO v_count
  FROM public.depreciaciones d
  LEFT JOIN public.activos_fijos a ON a.id = d.activo_id
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      a.id IS NULL
      OR (a.tenant_id IS NOT NULL AND d.tenant_id <> a.tenant_id)
    );
  RETURN QUERY SELECT 'depreciaciones_orphan_or_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.movimientos_consignacion m
  LEFT JOIN public.registro_consignaciones r ON r.id = COALESCE(m.registro_id, m.consignacion_id)
  LEFT JOIN public.productos p ON p.id = m.producto_id
  WHERE (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id)
    AND (
      COALESCE(m.registro_id, m.consignacion_id) IS NULL
      OR r.id IS NULL
      OR (r.tenant_id IS NOT NULL AND m.tenant_id <> r.tenant_id)
      OR (p.id IS NOT NULL AND p.tenant_id IS NOT NULL AND m.tenant_id <> p.tenant_id)
    );
  RETURN QUERY SELECT 'movimientos_consignacion_orphan_or_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_contabilidad_activos_consignacion_runtime_status_actual AS
SELECT *
FROM public.validar_contabilidad_activos_consignacion_runtime(app.current_tenant_id());

COMMIT;
