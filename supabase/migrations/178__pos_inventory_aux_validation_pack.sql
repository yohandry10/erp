-- ============================================================================
-- 178__pos_inventory_aux_validation_pack.sql
-- Pack de validacion runtime para POS + inventario auxiliar.
-- Tablas: configuracion_caja, detalle_ventas_pos, producto_existencias, eventos_pos.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_pos_inventory_aux_runtime(
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
  -- Triggers de normalizacion.
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('configuracion_caja', 'trg_normalize_configuracion_caja_row', 'normalizacion configuracion_caja'),
      ('detalle_ventas_pos', 'trg_normalize_detalle_ventas_pos_row', 'normalizacion detalle_ventas_pos'),
      ('producto_existencias', 'trg_normalize_producto_existencias_row', 'normalizacion producto_existencias'),
      ('eventos_pos', 'trg_normalize_eventos_pos_row', 'normalizacion eventos_pos')
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

  -- Triggers de consistencia tenant.
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('configuracion_caja', 'trg_enforce_configuracion_caja_tenant_consistency', 'consistencia tenant configuracion_caja'),
      ('detalle_ventas_pos', 'trg_enforce_detalle_ventas_pos_tenant_consistency', 'consistencia tenant detalle_ventas_pos'),
      ('producto_existencias', 'trg_enforce_producto_existencias_tenant_consistency', 'consistencia tenant producto_existencias'),
      ('eventos_pos', 'trg_enforce_eventos_pos_tenant_consistency', 'consistencia tenant eventos_pos')
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

  -- Columnas runtime esperadas.
  RETURN QUERY
  SELECT
    'configuracion_caja_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 14
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'configuracion_caja'
        AND c.column_name IN (
          'tenant_id', 'caja_id', 'monto_apertura_min', 'monto_apertura_max',
          'requiere_supervisor_fuera_rango', 'tolerancia_diferencia_cierre',
          'retiro_max_sin_autorizacion', 'saldo_minimo_operativo',
          'moneda', 'estado', 'activo', 'metadata', 'updated_by', 'updated_at'
        )
    ),
    'shape runtime de configuracion_caja';

  RETURN QUERY
  SELECT
    'detalle_ventas_pos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 16
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'detalle_ventas_pos'
        AND c.column_name IN (
          'tenant_id', 'venta_id', 'venta_pos_id', 'producto_id', 'item_index',
          'cantidad', 'precio_unitario', 'descuento', 'impuesto',
          'subtotal', 'total', 'nombre_producto', 'codigo_producto',
          'unidad_medida', 'estado', 'metadata'
        )
    ),
    'shape runtime de detalle_ventas_pos';

  RETURN QUERY
  SELECT
    'producto_existencias_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 15
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'producto_existencias'
        AND c.column_name IN (
          'tenant_id', 'producto_id', 'almacen_id', 'ubicacion_id', 'lote',
          'fecha_expiracion', 'stock_actual', 'stock_reservado', 'stock_danado',
          'stock_minimo', 'costo_promedio', 'ultimo_movimiento_at',
          'estado', 'metadata', 'updated_at'
        )
    ),
    'shape runtime de producto_existencias';

  RETURN QUERY
  SELECT
    'eventos_pos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 21
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'eventos_pos'
        AND c.column_name IN (
          'tenant_id', 'sesion_caja_id', 'usuario_id', 'tipo_evento', 'subtipo',
          'venta_id', 'producto_id', 'item_index', 'datos', 'timestamp',
          'ip_address', 'dispositivo', 'user_agent', 'requiere_supervisor',
          'supervisor_id', 'justificacion', 'riesgo_nivel', 'procesado_alerta',
          'alertado_en', 'estado', 'metadata'
        )
    ),
    'shape runtime de eventos_pos';

  -- FKs esperadas.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('configuracion_caja', 'configuracion_caja_caja_id_fkey_runtime', 'FK configuracion_caja -> cajas'),
      ('configuracion_caja', 'configuracion_caja_updated_by_fkey_runtime', 'FK configuracion_caja -> usuarios_sistema'),
      ('detalle_ventas_pos', 'fk_detalle_ventas_pos_venta_id', 'FK detalle_ventas_pos -> ventas_pos (venta_id)'),
      ('detalle_ventas_pos', 'detalle_ventas_pos_venta_pos_id_fkey_runtime', 'FK detalle_ventas_pos -> ventas_pos (venta_pos_id)'),
      ('detalle_ventas_pos', 'fk_detalle_ventas_pos_producto_id', 'FK detalle_ventas_pos -> productos'),
      ('producto_existencias', 'producto_existencias_producto_id_fkey_runtime', 'FK producto_existencias -> productos'),
      ('producto_existencias', 'producto_existencias_almacen_id_fkey_runtime', 'FK producto_existencias -> almacenes'),
      ('producto_existencias', 'producto_existencias_ubicacion_id_fkey_runtime', 'FK producto_existencias -> almacen_ubicaciones'),
      ('eventos_pos', 'eventos_pos_sesion_caja_id_fkey_runtime', 'FK eventos_pos -> sesiones_caja'),
      ('eventos_pos', 'eventos_pos_usuario_id_fkey_runtime', 'FK eventos_pos -> usuarios_sistema'),
      ('eventos_pos', 'eventos_pos_supervisor_id_fkey_runtime', 'FK eventos_pos -> usuarios_sistema (supervisor)'),
      ('eventos_pos', 'eventos_pos_venta_id_fkey_runtime', 'FK eventos_pos -> ventas_pos'),
      ('eventos_pos', 'eventos_pos_producto_id_fkey_runtime', 'FK eventos_pos -> productos')
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

  -- Indices esperados.
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('configuracion_caja', 'ux_configuracion_caja_tenant_caja', 'unicidad tenant+caja'),
      ('configuracion_caja', 'idx_configuracion_caja_tenant_caja_estado_runtime', 'indice runtime tenant+caja+estado'),
      ('configuracion_caja', 'idx_configuracion_caja_tenant_default_runtime', 'indice runtime configuracion default'),
      ('configuracion_caja', 'idx_configuracion_caja_tenant_activo_runtime', 'indice runtime tenant+activo'),
      ('detalle_ventas_pos', 'ux_detalle_ventas_pos_tenant_venta_item_runtime', 'unicidad detalle por item'),
      ('detalle_ventas_pos', 'idx_detalle_ventas_pos_tenant_venta_runtime', 'indice runtime por venta'),
      ('detalle_ventas_pos', 'idx_detalle_ventas_pos_tenant_producto_runtime', 'indice runtime por producto'),
      ('detalle_ventas_pos', 'idx_detalle_ventas_pos_tenant_venta_pos_runtime', 'indice runtime por venta_pos'),
      ('producto_existencias', 'ux_producto_existencias_tenant_producto_almacen', 'unicidad existencias por almacen'),
      ('producto_existencias', 'idx_producto_existencias_tenant_almacen_stock_runtime', 'indice runtime por almacen'),
      ('producto_existencias', 'idx_producto_existencias_tenant_producto_stock_runtime', 'indice runtime por producto'),
      ('producto_existencias', 'idx_producto_existencias_tenant_stock_minimo_runtime', 'indice runtime por stock minimo'),
      ('producto_existencias', 'idx_producto_existencias_tenant_producto_lote_runtime', 'indice runtime por lote'),
      ('eventos_pos', 'idx_eventos_pos_tenant_tipo_timestamp_runtime', 'indice runtime por tipo'),
      ('eventos_pos', 'idx_eventos_pos_tenant_sesion_timestamp_runtime', 'indice runtime por sesion'),
      ('eventos_pos', 'idx_eventos_pos_tenant_supervisor_runtime', 'indice runtime por supervisor'),
      ('eventos_pos', 'idx_eventos_pos_tenant_riesgo_alerta_runtime', 'indice runtime por riesgo/alerta')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ),
    e.detail::text
  FROM expected e;

  -- Constraints esperadas.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('configuracion_caja', 'ck_configuracion_caja_ids_required_runtime', 'constraint tenant requerido configuracion_caja'),
      ('configuracion_caja', 'ck_configuracion_caja_montos_runtime', 'constraint montos configuracion_caja'),
      ('detalle_ventas_pos', 'ck_detalle_ventas_pos_ids_required_runtime', 'constraint ids detalle_ventas_pos'),
      ('detalle_ventas_pos', 'ck_detalle_ventas_pos_montos_runtime', 'constraint montos detalle_ventas_pos'),
      ('producto_existencias', 'ck_producto_existencias_ids_required_runtime', 'constraint ids producto_existencias'),
      ('producto_existencias', 'ck_producto_existencias_stocks_runtime', 'constraint stocks producto_existencias'),
      ('eventos_pos', 'ck_eventos_pos_ids_runtime', 'constraint ids eventos_pos'),
      ('eventos_pos', 'ck_eventos_pos_riesgo_runtime', 'constraint riesgo eventos_pos')
  )
  SELECT
    format('constraint_%s_exists', e.conname)::text,
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

  -- RLS habilitado y forzado.
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES ('configuracion_caja'), ('detalle_ventas_pos'), ('producto_existencias'), ('eventos_pos')
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

  -- Duplicados por scope.
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, caja_id, COUNT(*) AS cnt
    FROM public.configuracion_caja
    WHERE tenant_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, caja_id
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY
  SELECT 'configuracion_caja_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, COALESCE(venta_pos_id, venta_id) AS venta_scope, item_index, COUNT(*) AS cnt
    FROM public.detalle_ventas_pos
    WHERE tenant_id IS NOT NULL
      AND COALESCE(venta_pos_id, venta_id) IS NOT NULL
      AND item_index IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, COALESCE(venta_pos_id, venta_id), item_index
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY
  SELECT 'detalle_ventas_pos_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, producto_id, almacen_id, COUNT(*) AS cnt
    FROM public.producto_existencias
    WHERE tenant_id IS NOT NULL
      AND producto_id IS NOT NULL
      AND almacen_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, producto_id, almacen_id
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY
  SELECT 'producto_existencias_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  -- Filas invalidas por reglas principales.
  SELECT COUNT(*)
  INTO v_count
  FROM public.configuracion_caja c
  WHERE (
      c.tenant_id IS NULL
      OR c.monto_apertura_min < 0
      OR c.monto_apertura_max <= c.monto_apertura_min
      OR c.tolerancia_diferencia_cierre < 0
      OR c.retiro_max_sin_autorizacion < 0
      OR c.saldo_minimo_operativo < 0
      OR c.moneda !~ '^[A-Z]{3}$'
      OR c.estado NOT IN ('ACTIVO', 'INACTIVO', 'BLOQUEADA')
    )
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'configuracion_caja_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.detalle_ventas_pos d
  WHERE (
      d.tenant_id IS NULL
      OR COALESCE(d.venta_pos_id, d.venta_id) IS NULL
      OR d.cantidad <= 0
      OR d.precio_unitario < 0
      OR d.descuento < 0
      OR d.impuesto < 0
      OR d.subtotal < 0
      OR d.total < 0
      OR (d.item_index IS NOT NULL AND d.item_index < 1)
      OR d.estado NOT IN ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'CONFIRMADO', 'ANULADO', 'DEVUELTO')
    )
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'detalle_ventas_pos_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.producto_existencias pe
  WHERE (
      pe.tenant_id IS NULL
      OR pe.producto_id IS NULL
      OR pe.almacen_id IS NULL
      OR pe.stock_actual < 0
      OR pe.stock_reservado < 0
      OR pe.stock_danado < 0
      OR pe.stock_minimo < 0
      OR pe.costo_promedio < 0
      OR pe.stock_reservado + pe.stock_danado > pe.stock_actual
      OR pe.estado NOT IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO')
    )
    AND (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'producto_existencias_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.eventos_pos e
  WHERE (
      e.tenant_id IS NULL
      OR e.tipo_evento IS NULL
      OR e."timestamp" IS NULL
      OR e.riesgo_nivel NOT IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO')
      OR e.estado NOT IN ('ACTIVO', 'INACTIVO', 'ANULADO')
      OR (e.procesado_alerta = true AND e.alertado_en IS NULL)
    )
    AND (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'eventos_pos_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Tenant mismatch / huerfanos principales.
  SELECT COUNT(*)
  INTO v_count
  FROM public.detalle_ventas_pos d
  LEFT JOIN public.ventas_pos v ON v.id = COALESCE(d.venta_pos_id, d.venta_id)
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      COALESCE(d.venta_pos_id, d.venta_id) IS NULL
      OR v.id IS NULL
      OR (v.tenant_id IS NOT NULL AND d.tenant_id <> v.tenant_id)
    );
  RETURN QUERY
  SELECT 'detalle_ventas_pos_orphan_or_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.producto_existencias pe
  LEFT JOIN public.productos p ON p.id = pe.producto_id
  LEFT JOIN public.almacenes a ON a.id = pe.almacen_id
  LEFT JOIN public.almacen_ubicaciones au ON au.id = pe.ubicacion_id
  WHERE (p_tenant_id IS NULL OR pe.tenant_id = p_tenant_id)
    AND (
      p.id IS NULL
      OR a.id IS NULL
      OR (p.tenant_id IS NOT NULL AND pe.tenant_id <> p.tenant_id)
      OR (a.tenant_id IS NOT NULL AND pe.tenant_id <> a.tenant_id)
      OR (pe.ubicacion_id IS NOT NULL AND au.id IS NULL)
      OR (au.tenant_id IS NOT NULL AND pe.tenant_id <> au.tenant_id)
    );
  RETURN QUERY
  SELECT 'producto_existencias_orphan_or_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.eventos_pos e
  LEFT JOIN public.sesiones_caja s ON s.id = e.sesion_caja_id
  LEFT JOIN public.ventas_pos v ON v.id = e.venta_id
  LEFT JOIN public.productos p ON p.id = e.producto_id
  WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
    AND (
      (e.sesion_caja_id IS NOT NULL AND s.id IS NULL)
      OR (e.venta_id IS NOT NULL AND v.id IS NULL)
      OR (e.producto_id IS NOT NULL AND p.id IS NULL)
      OR (s.tenant_id IS NOT NULL AND e.tenant_id <> s.tenant_id)
      OR (v.tenant_id IS NOT NULL AND e.tenant_id <> v.tenant_id)
      OR (p.tenant_id IS NOT NULL AND e.tenant_id <> p.tenant_id)
    );
  RETURN QUERY
  SELECT 'eventos_pos_orphan_or_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_pos_inventory_aux_runtime_status_actual AS
SELECT *
FROM public.validar_pos_inventory_aux_runtime(app.current_tenant_id());

COMMIT;
