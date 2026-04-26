-- ============================================================================
-- 157__cajas_operational_validation_pack.sql
-- Pack de validacion runtime para Cajas/POS operativo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_cajas_operational_runtime(
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
  -- Triggers de normalizacion runtime.
  RETURN QUERY
  SELECT
    format('trigger_%s', x.trigger_name)::text AS check_name,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = x.table_name
        AND t.tgname = x.trigger_name
        AND NOT t.tgisinternal
    ) AS ok,
    x.detail
  FROM (
    VALUES
      ('cajas', 'trg_normalize_cajas_row', 'normalizacion en cajas'),
      ('sesiones_caja', 'trg_normalize_sesiones_caja_row', 'normalizacion en sesiones_caja'),
      ('movimientos_caja', 'trg_normalize_movimientos_caja_row', 'normalizacion en movimientos_caja'),
      ('retiros_caja', 'trg_normalize_retiros_caja_row', 'normalizacion en retiros_caja'),
      ('cambios_turno', 'trg_normalize_cambios_turno_row', 'normalizacion en cambios_turno'),
      ('cortes_caja', 'trg_normalize_cortes_caja_row', 'normalizacion en cortes_caja'),
      ('autorizaciones_caja', 'trg_normalize_autorizaciones_caja_row', 'normalizacion en autorizaciones_caja')
  ) AS x(table_name, trigger_name, detail);

  -- Triggers de consistencia tenant.
  RETURN QUERY
  SELECT
    format('trigger_%s', x.trigger_name)::text AS check_name,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = x.table_name
        AND t.tgname = x.trigger_name
        AND NOT t.tgisinternal
    ) AS ok,
    x.detail
  FROM (
    VALUES
      ('cajas', 'trg_enforce_cajas_tenant_consistency', 'consistencia tenant en cajas'),
      ('sesiones_caja', 'trg_enforce_sesiones_caja_tenant_consistency', 'consistencia tenant en sesiones_caja'),
      ('movimientos_caja', 'trg_enforce_movimientos_caja_tenant_consistency', 'consistencia tenant en movimientos_caja'),
      ('retiros_caja', 'trg_enforce_retiros_caja_tenant_consistency', 'consistencia tenant en retiros_caja'),
      ('cambios_turno', 'trg_enforce_cambios_turno_tenant_consistency', 'consistencia tenant en cambios_turno'),
      ('cortes_caja', 'trg_enforce_cortes_caja_tenant_consistency', 'consistencia tenant en cortes_caja'),
      ('autorizaciones_caja', 'trg_enforce_autorizaciones_caja_tenant_consistency', 'consistencia tenant en autorizaciones_caja')
  ) AS x(table_name, trigger_name, detail);

  -- Columnas runtime esperadas.
  RETURN QUERY
  SELECT
    'cajas_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cajas'
        AND c.column_name IN (
          'tenant_id', 'nombre', 'codigo', 'descripcion', 'sucursal_id',
          'almacen_id', 'dispositivo', 'tipo', 'estado', 'creado_por'
        )
    ),
    'shape runtime de cajas';

  RETURN QUERY
  SELECT
    'sesiones_caja_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 29
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'sesiones_caja'
        AND c.column_name IN (
          'tenant_id', 'caja_id', 'cajero_id', 'usuario_id', 'abierto_por',
          'usuario_apertura', 'monto_inicio', 'monto_inicial', 'monto_esperado',
          'monto_contado', 'monto_cierre', 'diferencia', 'total_efectivo',
          'total_tarjeta', 'duracion_horas', 'estado', 'moneda',
          'fecha_apertura', 'fecha_cierre', 'hora_apertura', 'hora_cierre',
          'congelada', 'cierre_administrativo', 'requirio_autorizacion',
          'autorizacion_supervisor_id', 'supervisor_cierre_id',
          'denominaciones_apertura', 'denominaciones_cierre', 'resumen'
        )
    ),
    'shape runtime de sesiones_caja';

  RETURN QUERY
  SELECT
    'movimientos_caja_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 11
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'movimientos_caja'
        AND c.column_name IN (
          'tenant_id', 'sesion_caja_id', 'secuencia', 'tipo_movimiento',
          'monto', 'saldo_anterior', 'saldo_nuevo', 'usuario_id',
          'supervisor_id', 'timestamp', 'ip_address'
        )
    ),
    'shape runtime de movimientos_caja';

  RETURN QUERY
  SELECT
    'retiros_caja_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 14
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'retiros_caja'
        AND c.column_name IN (
          'tenant_id', 'sesion_caja_id', 'movimiento_caja_id', 'caja_id',
          'autorizado_por', 'codigo_autorizacion', 'monto', 'motivo',
          'motivo_detalle', 'estado_conciliacion', 'fecha_conciliacion',
          'banco_destino', 'numero_operacion', 'comprobante_url'
        )
    ),
    'shape runtime de retiros_caja';

  RETURN QUERY
  SELECT
    'cambios_turno_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 13
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cambios_turno'
        AND c.column_name IN (
          'tenant_id', 'sesion_caja_id', 'usuario_saliente_id',
          'usuario_entrante_id', 'saldo_sistema', 'saldo_contado',
          'diferencia', 'estado', 'timestamp_inicio', 'timestamp_fin',
          'denominaciones', 'foto_arqueo', 'razon_cancelacion'
        )
    ),
    'shape runtime de cambios_turno';

  RETURN QUERY
  SELECT
    'cortes_caja_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 13
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cortes_caja'
        AND c.column_name IN (
          'tenant_id', 'sesion_caja_id', 'caja_id', 'cajero_id', 'fecha_corte',
          'moneda', 'total_ventas', 'total_impuestos', 'total_neto',
          'total_documentos', 'resumen_metodos_pago', 'resumen_fiscal',
          'integridad_hash'
        )
    ),
    'shape runtime de cortes_caja';

  RETURN QUERY
  SELECT
    'autorizaciones_caja_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 14
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'autorizaciones_caja'
        AND c.column_name IN (
          'tenant_id', 'sesion_caja_id', 'tipo_autorizacion', 'monto_solicitado',
          'monto_min_configurado', 'monto_max_configurado', 'supervisor_id',
          'solicitante_id', 'razon_autorizacion', 'firma_digital',
          'ip_address', 'dispositivo', 'estado', 'aprobado_at'
        )
    ),
    'shape runtime de autorizaciones_caja';

  -- FKs operativas esperadas.
  RETURN QUERY
  SELECT
    format('fk_%s_exists', x.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.conname = x.conname
        AND c.conrelid = to_regclass(format('public.%s', x.table_name))
    ),
    x.detail
  FROM (
    VALUES
      ('cajas', 'cajas_sucursal_id_fkey_runtime', 'FK cajas -> sucursales'),
      ('cajas', 'cajas_almacen_id_fkey_runtime', 'FK cajas -> almacenes'),
      ('sesiones_caja', 'sesiones_caja_caja_id_fkey_runtime', 'FK sesiones_caja -> cajas'),
      ('movimientos_caja', 'movimientos_caja_sesion_caja_id_fkey_runtime', 'FK movimientos_caja -> sesiones_caja'),
      ('retiros_caja', 'retiros_caja_sesion_caja_id_fkey_runtime', 'FK retiros_caja -> sesiones_caja'),
      ('retiros_caja', 'retiros_caja_movimiento_caja_id_fkey_runtime', 'FK retiros_caja -> movimientos_caja'),
      ('cambios_turno', 'cambios_turno_sesion_caja_id_fkey_runtime', 'FK cambios_turno -> sesiones_caja'),
      ('cortes_caja', 'cortes_caja_sesion_caja_id_fkey_runtime', 'FK cortes_caja -> sesiones_caja'),
      ('autorizaciones_caja', 'autorizaciones_caja_sesion_caja_id_fkey_runtime', 'FK autorizaciones_caja -> sesiones_caja')
  ) AS x(table_name, conname, detail);

  -- Indices/constraints de soporte.
  RETURN QUERY
  SELECT
    format('index_%s_exists', x.index_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = x.table_name
        AND i.indexname = x.index_name
    ),
    x.detail
  FROM (
    VALUES
      ('cajas', 'ux_cajas_tenant_codigo_runtime', 'unicidad tenant+codigo en cajas'),
      ('sesiones_caja', 'ux_sesiones_caja_open_by_caja_runtime', 'sesion abierta unica por caja'),
      ('sesiones_caja', 'ux_sesiones_caja_open_by_cajero_runtime', 'sesion abierta unica por cajero'),
      ('sesiones_caja', 'ux_sesiones_caja_open_by_dispositivo_runtime', 'sesion abierta unica por dispositivo'),
      ('movimientos_caja', 'ux_movimientos_caja_tenant_sesion_secuencia_runtime', 'secuencia unica por sesion'),
      ('autorizaciones_caja', 'ux_autorizaciones_caja_pending_scope_runtime', 'autorizacion pendiente unica por scope')
  ) AS x(table_name, index_name, detail);

  -- RLS habilitado/forzado.
  RETURN QUERY
  SELECT
    format('rls_%s_enabled', x.table_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = x.table_name
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    format('RLS habilitado/forzado en %s', x.table_name)
  FROM (
    VALUES ('cajas'), ('sesiones_caja'), ('movimientos_caja'),
           ('retiros_caja'), ('cambios_turno'), ('cortes_caja'),
           ('autorizaciones_caja')
  ) AS x(table_name);

  -- Duplicados por scope.
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(codigo)) AS codigo_norm, COUNT(*) AS cnt
    FROM public.cajas
    WHERE tenant_id IS NOT NULL
      AND codigo IS NOT NULL AND btrim(codigo) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(codigo))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'cajas_duplicate_codigo_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, caja_id, COUNT(*) AS cnt
    FROM public.sesiones_caja
    WHERE tenant_id IS NOT NULL
      AND caja_id IS NOT NULL
      AND estado = 'ABIERTA'
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, caja_id
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'sesiones_open_duplicate_by_caja'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, cajero_id, COUNT(*) AS cnt
    FROM public.sesiones_caja
    WHERE tenant_id IS NOT NULL
      AND cajero_id IS NOT NULL
      AND estado = 'ABIERTA'
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, cajero_id
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'sesiones_open_duplicate_by_cajero'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, lower(btrim(dispositivo)) AS dispositivo_norm, COUNT(*) AS cnt
    FROM public.sesiones_caja
    WHERE tenant_id IS NOT NULL
      AND dispositivo IS NOT NULL
      AND btrim(dispositivo) <> ''
      AND estado = 'ABIERTA'
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, lower(btrim(dispositivo))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'sesiones_open_duplicate_by_dispositivo'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, sesion_caja_id, secuencia, COUNT(*) AS cnt
    FROM public.movimientos_caja
    WHERE tenant_id IS NOT NULL
      AND sesion_caja_id IS NOT NULL
      AND secuencia IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, sesion_caja_id, secuencia
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'movimientos_duplicate_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, sesion_caja_id, upper(btrim(tipo_autorizacion)) AS tipo_norm, solicitante_id, COUNT(*) AS cnt
    FROM public.autorizaciones_caja
    WHERE tenant_id IS NOT NULL
      AND sesion_caja_id IS NOT NULL
      AND tipo_autorizacion IS NOT NULL
      AND btrim(tipo_autorizacion) <> ''
      AND solicitante_id IS NOT NULL
      AND estado = 'PENDIENTE'
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, sesion_caja_id, upper(btrim(tipo_autorizacion)), solicitante_id
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'autorizaciones_pending_duplicate_scope'::text, (v_count = 0), format('groups=%s', v_count);

  -- Filas invalidas por reglas core.
  SELECT COUNT(*) INTO v_count
  FROM public.sesiones_caja s
  WHERE (
      s.tenant_id IS NULL
      OR s.caja_id IS NULL
      OR s.estado NOT IN ('ABIERTA', 'CERRADA', 'PAUSADA', 'ANULADA')
      OR s.moneda IS NULL OR s.moneda !~ '^[A-Z]{3}$'
      OR s.monto_inicio < 0 OR s.monto_inicial < 0 OR s.monto_esperado < 0
      OR s.monto_contado < 0 OR s.monto_cierre < 0 OR s.total_efectivo < 0 OR s.total_tarjeta < 0
      OR s.duracion_horas < 0
      OR (
        COALESCE(s.hora_cierre, s.fecha_cierre) IS NOT NULL
        AND (
          COALESCE(s.hora_apertura, s.fecha_apertura) IS NULL
          OR COALESCE(s.hora_cierre, s.fecha_cierre) < COALESCE(s.hora_apertura, s.fecha_apertura)
        )
      )
    )
    AND (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'sesiones_caja_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.movimientos_caja m
  WHERE (
      m.tenant_id IS NULL
      OR m.sesion_caja_id IS NULL
      OR m.secuencia < 1
      OR m.tipo_movimiento NOT IN ('VENTA', 'RETIRO', 'INGRESO', 'AJUSTE', 'CAMBIO_TURNO', 'APERTURA', 'CIERRE')
      OR m."timestamp" IS NULL
      OR round(COALESCE(m.saldo_anterior, 0) + COALESCE(m.monto, 0), 2) <> round(COALESCE(m.saldo_nuevo, 0), 2)
    )
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'movimientos_caja_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.retiros_caja r
  WHERE (
      r.tenant_id IS NULL
      OR r.sesion_caja_id IS NULL
      OR r.monto < 0
      OR r.motivo NOT IN ('DEPOSITO_BANCARIO', 'COMPRA_EMERGENCIA', 'BOVEDA', 'OTRO')
      OR r.estado_conciliacion NOT IN ('PENDIENTE', 'CONCILIADO', 'RECHAZADO')
      OR (r.estado_conciliacion = 'CONCILIADO' AND r.fecha_conciliacion IS NULL)
    )
    AND (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'retiros_caja_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.cambios_turno ct
  WHERE (
      ct.tenant_id IS NULL
      OR ct.sesion_caja_id IS NULL
      OR ct.usuario_saliente_id IS NULL
      OR ct.usuario_entrante_id IS NULL
      OR ct.estado NOT IN ('EN_PROCESO', 'COMPLETADO', 'CANCELADO')
      OR ct.saldo_sistema < 0
      OR ct.saldo_contado < 0
      OR ct.timestamp_inicio IS NULL
      OR (ct.timestamp_fin IS NOT NULL AND ct.timestamp_fin < ct.timestamp_inicio)
      OR (
        (ct.estado = 'EN_PROCESO' AND ct.timestamp_fin IS NOT NULL)
        OR (ct.estado IN ('COMPLETADO', 'CANCELADO') AND ct.timestamp_fin IS NULL)
      )
    )
    AND (p_tenant_id IS NULL OR ct.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'cambios_turno_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.cortes_caja cc
  WHERE (
      cc.tenant_id IS NULL
      OR cc.sesion_caja_id IS NULL
      OR cc.caja_id IS NULL
      OR cc.fecha_corte IS NULL
      OR cc.moneda IS NULL OR cc.moneda !~ '^[A-Z]{3}$'
      OR cc.total_ventas < 0 OR cc.total_impuestos < 0 OR cc.total_neto < 0 OR cc.total_documentos < 0
    )
    AND (p_tenant_id IS NULL OR cc.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'cortes_caja_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.autorizaciones_caja a
  WHERE (
      a.tenant_id IS NULL
      OR a.sesion_caja_id IS NULL
      OR a.supervisor_id IS NULL
      OR a.solicitante_id IS NULL
      OR a.tipo_autorizacion NOT IN ('APERTURA_MONTO_BAJO', 'APERTURA_MONTO_ALTO', 'CIERRE_DIFERENCIA_ALTA', 'RETIRO_MONTO_ALTO', 'AJUSTE_MANUAL')
      OR a.estado NOT IN ('APROBADO', 'RECHAZADO', 'PENDIENTE')
      OR a.monto_solicitado < 0
      OR a.razon_autorizacion IS NULL OR btrim(a.razon_autorizacion) = ''
      OR (a.estado = 'APROBADO' AND a.aprobado_at IS NULL)
    )
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'autorizaciones_caja_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Tenant mismatch por relaciones.
  SELECT COUNT(*) INTO v_count
  FROM public.sesiones_caja s
  JOIN public.cajas c ON c.id = s.caja_id
  WHERE s.tenant_id IS NOT NULL
    AND c.tenant_id IS NOT NULL
    AND s.tenant_id <> c.tenant_id
    AND (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'sesiones_vs_cajas_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.movimientos_caja m
  JOIN public.sesiones_caja s ON s.id = m.sesion_caja_id
  WHERE m.tenant_id IS NOT NULL
    AND s.tenant_id IS NOT NULL
    AND m.tenant_id <> s.tenant_id
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'movimientos_vs_sesiones_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.retiros_caja r
  JOIN public.sesiones_caja s ON s.id = r.sesion_caja_id
  WHERE r.tenant_id IS NOT NULL
    AND s.tenant_id IS NOT NULL
    AND r.tenant_id <> s.tenant_id
    AND (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'retiros_vs_sesiones_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.cambios_turno ct
  JOIN public.sesiones_caja s ON s.id = ct.sesion_caja_id
  WHERE ct.tenant_id IS NOT NULL
    AND s.tenant_id IS NOT NULL
    AND ct.tenant_id <> s.tenant_id
    AND (p_tenant_id IS NULL OR ct.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'cambios_vs_sesiones_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.cortes_caja cc
  JOIN public.sesiones_caja s ON s.id = cc.sesion_caja_id
  WHERE cc.tenant_id IS NOT NULL
    AND s.tenant_id IS NOT NULL
    AND cc.tenant_id <> s.tenant_id
    AND (p_tenant_id IS NULL OR cc.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'cortes_vs_sesiones_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.autorizaciones_caja a
  JOIN public.sesiones_caja s ON s.id = a.sesion_caja_id
  WHERE a.tenant_id IS NOT NULL
    AND s.tenant_id IS NOT NULL
    AND a.tenant_id <> s.tenant_id
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'autorizaciones_vs_sesiones_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  -- Huerfanos de relaciones clave.
  SELECT COUNT(*) INTO v_count
  FROM public.sesiones_caja s
  LEFT JOIN public.cajas c ON c.id = s.caja_id
  WHERE s.caja_id IS NOT NULL
    AND c.id IS NULL
    AND (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'sesiones_caja_orphan_caja_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.movimientos_caja m
  LEFT JOIN public.sesiones_caja s ON s.id = m.sesion_caja_id
  WHERE m.sesion_caja_id IS NOT NULL
    AND s.id IS NULL
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'movimientos_caja_orphan_sesion_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.retiros_caja r
  LEFT JOIN public.sesiones_caja s ON s.id = r.sesion_caja_id
  WHERE r.sesion_caja_id IS NOT NULL
    AND s.id IS NULL
    AND (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'retiros_caja_orphan_sesion_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.cambios_turno ct
  LEFT JOIN public.sesiones_caja s ON s.id = ct.sesion_caja_id
  WHERE ct.sesion_caja_id IS NOT NULL
    AND s.id IS NULL
    AND (p_tenant_id IS NULL OR ct.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'cambios_turno_orphan_sesion_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.cortes_caja cc
  LEFT JOIN public.sesiones_caja s ON s.id = cc.sesion_caja_id
  WHERE cc.sesion_caja_id IS NOT NULL
    AND s.id IS NULL
    AND (p_tenant_id IS NULL OR cc.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'cortes_caja_orphan_sesion_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.autorizaciones_caja a
  LEFT JOIN public.sesiones_caja s ON s.id = a.sesion_caja_id
  WHERE a.sesion_caja_id IS NOT NULL
    AND s.id IS NULL
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'autorizaciones_caja_orphan_sesion_rows'::text, (v_count = 0), format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_cajas_operational_runtime_status_actual AS
SELECT *
FROM public.validar_cajas_operational_runtime(
  COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
);

COMMIT;
