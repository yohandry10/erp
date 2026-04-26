-- ============================================================================
-- 160__finanzas_cobros_egresos_validation_pack.sql
-- Pack de validacion runtime para:
-- gastos, cobranzas, gestiones_cobranza, egresos, pagos_facturas.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_finanzas_cobros_egresos_runtime(
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
      ('gastos', 'trg_normalize_gastos_row', 'normalizacion en gastos'),
      ('egresos', 'trg_normalize_egresos_row', 'normalizacion en egresos'),
      ('cobranzas', 'trg_normalize_cobranzas_row', 'normalizacion en cobranzas'),
      ('gestiones_cobranza', 'trg_normalize_gestiones_cobranza_row', 'normalizacion en gestiones_cobranza'),
      ('pagos_facturas', 'trg_normalize_pagos_facturas_row', 'normalizacion en pagos_facturas')
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
      ('gastos', 'trg_enforce_gastos_tenant_consistency', 'consistencia tenant en gastos'),
      ('egresos', 'trg_enforce_egresos_tenant_consistency', 'consistencia tenant en egresos'),
      ('cobranzas', 'trg_enforce_cobranzas_tenant_consistency', 'consistencia tenant en cobranzas'),
      ('gestiones_cobranza', 'trg_enforce_gestiones_cobranza_tenant_consistency', 'consistencia tenant en gestiones_cobranza'),
      ('pagos_facturas', 'trg_enforce_pagos_facturas_tenant_consistency', 'consistencia tenant en pagos_facturas')
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

  -- Columnas runtime
  RETURN QUERY
  SELECT
    'gastos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 16
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'gastos'
        AND c.column_name IN (
          'tenant_id', 'fecha', 'monto', 'moneda', 'categoria', 'subcategoria',
          'descripcion', 'tipo_gasto', 'centro_costo_id', 'proveedor_id',
          'cuenta_contable_id', 'metodo_pago', 'usuario_id', 'fecha_pago',
          'numero_comprobante', 'activo'
        )
    ),
    'columnas runtime de gastos';

  RETURN QUERY
  SELECT
    'egresos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 16
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'egresos'
        AND c.column_name IN (
          'tenant_id', 'fecha', 'monto', 'moneda', 'tipo_egreso', 'concepto',
          'descripcion', 'metodo_pago', 'referencia', 'cuenta_bancaria_id',
          'cuenta_por_pagar_id', 'proveedor_id', 'usuario_id', 'fecha_aplicacion',
          'event_id', 'idempotency_key'
        )
    ),
    'columnas runtime de egresos';

  RETURN QUERY
  SELECT
    'cobranzas_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 15
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cobranzas'
        AND c.column_name IN (
          'tenant_id', 'cliente_id', 'cuenta_por_cobrar_id', 'fecha_programada',
          'fecha_vencimiento', 'fecha_cobro', 'monto', 'monto_cobrado', 'saldo',
          'prioridad', 'canal', 'responsable_id', 'referencia', 'observaciones', 'proxima_gestion_at'
        )
    ),
    'columnas runtime de cobranzas';

  RETURN QUERY
  SELECT
    'gestiones_cobranza_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 13
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'gestiones_cobranza'
        AND c.column_name IN (
          'tenant_id', 'cobranza_id', 'cliente_id', 'cuenta_por_cobrar_id',
          'usuario_id', 'fecha_gestion', 'tipo_gestion', 'resultado',
          'compromiso_pago', 'monto_compromiso', 'proxima_gestion_at', 'notas', 'activo'
        )
    ),
    'columnas runtime de gestiones_cobranza';

  RETURN QUERY
  SELECT
    'pagos_facturas_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 16
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pagos_facturas'
        AND c.column_name IN (
          'tenant_id', 'cuenta_por_pagar_id', 'proveedor_id', 'documento_id',
          'cuenta_bancaria_id', 'usuario_id', 'fecha_pago', 'monto', 'moneda',
          'metodo_pago', 'referencia', 'numero_operacion', 'event_id',
          'idempotency_key', 'aplicado_en', 'activo'
        )
    ),
    'columnas runtime de pagos_facturas';

  -- FKs esperadas
  RETURN QUERY
  WITH expected(conname, relname, detail) AS (
    VALUES
      ('gastos_centro_costo_id_fkey', 'gastos', 'FK gastos -> centros_costo'),
      ('gastos_proveedor_id_fkey', 'gastos', 'FK gastos -> proveedores'),
      ('gastos_cuenta_contable_id_fkey', 'gastos', 'FK gastos -> plan_cuentas'),
      ('gastos_usuario_id_fkey', 'gastos', 'FK gastos -> usuarios_sistema'),
      ('egresos_cuenta_por_pagar_id_fkey', 'egresos', 'FK egresos -> cuentas_por_pagar'),
      ('egresos_proveedor_id_fkey', 'egresos', 'FK egresos -> proveedores'),
      ('egresos_cuenta_bancaria_id_fkey', 'egresos', 'FK egresos -> cuentas_bancarias'),
      ('cobranzas_cliente_id_fkey', 'cobranzas', 'FK cobranzas -> clientes'),
      ('cobranzas_cuenta_por_cobrar_id_fkey', 'cobranzas', 'FK cobranzas -> cuentas_por_cobrar'),
      ('gestiones_cobranza_cobranza_id_fkey', 'gestiones_cobranza', 'FK gestiones_cobranza -> cobranzas'),
      ('pagos_facturas_cuenta_por_pagar_id_fkey', 'pagos_facturas', 'FK pagos_facturas -> cuentas_por_pagar'),
      ('pagos_facturas_proveedor_id_fkey', 'pagos_facturas', 'FK pagos_facturas -> proveedores'),
      ('pagos_facturas_documento_id_fkey', 'pagos_facturas', 'FK pagos_facturas -> documentos'),
      ('pagos_facturas_cuenta_bancaria_id_fkey', 'pagos_facturas', 'FK pagos_facturas -> cuentas_bancarias')
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
      ('gastos', 'idx_gastos_tenant_fecha_categoria_runtime', 'indice tenant+fecha+categoria en gastos'),
      ('egresos', 'idx_egresos_tenant_fecha_tipo_runtime', 'indice tenant+fecha+tipo en egresos'),
      ('cobranzas', 'idx_cobranzas_tenant_estado_vencimiento_runtime', 'indice tenant+estado+vencimiento en cobranzas'),
      ('gestiones_cobranza', 'idx_gestiones_cobranza_tenant_cobranza_fecha_runtime', 'indice tenant+cobranza+fecha en gestiones'),
      ('pagos_facturas', 'idx_pagos_facturas_tenant_fecha_metodo_runtime', 'indice tenant+fecha+metodo en pagos_facturas'),
      ('cobranzas', 'ux_cobranzas_tenant_referencia', 'unicidad tenant+referencia en cobranzas'),
      ('egresos', 'ux_egresos_tenant_referencia', 'unicidad tenant+referencia en egresos'),
      ('pagos_facturas', 'ux_pagos_facturas_tenant_referencia', 'unicidad tenant+referencia en pagos_facturas'),
      ('pagos_facturas', 'ux_pagos_facturas_tenant_idempotency', 'unicidad tenant+idempotency en pagos_facturas'),
      ('pagos_facturas', 'ux_pagos_facturas_tenant_event_id', 'unicidad tenant+event_id en pagos_facturas'),
      ('egresos', 'ux_egresos_tenant_event_id', 'unicidad tenant+event_id en egresos')
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
    VALUES ('gastos'), ('egresos'), ('cobranzas'), ('gestiones_cobranza'), ('pagos_facturas')
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
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(referencia)) AS ref_norm, COUNT(*) AS cnt
    FROM public.cobranzas
    WHERE tenant_id IS NOT NULL
      AND referencia IS NOT NULL
      AND btrim(referencia) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(referencia))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_cobranzas_tenant_referencia'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(referencia)) AS ref_norm, COUNT(*) AS cnt
    FROM public.egresos
    WHERE tenant_id IS NOT NULL
      AND referencia IS NOT NULL
      AND btrim(referencia) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(referencia))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_egresos_tenant_referencia'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(referencia)) AS ref_norm, COUNT(*) AS cnt
    FROM public.pagos_facturas
    WHERE tenant_id IS NOT NULL
      AND referencia IS NOT NULL
      AND btrim(referencia) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(referencia))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_pagos_facturas_tenant_referencia'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, lower(btrim(idempotency_key)) AS key_norm, COUNT(*) AS cnt
    FROM public.pagos_facturas
    WHERE tenant_id IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND btrim(idempotency_key) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, lower(btrim(idempotency_key))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_pagos_facturas_tenant_idempotency'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, event_id, COUNT(*) AS cnt
    FROM public.pagos_facturas
    WHERE tenant_id IS NOT NULL
      AND event_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, event_id
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_pagos_facturas_tenant_event_id'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  -- Filas invalidas por reglas de negocio
  SELECT COUNT(*)
  INTO v_count
  FROM public.gastos g
  WHERE (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id)
    AND (
      g.monto < 0
      OR upper(g.estado) NOT IN ('REGISTRADO', 'APROBADO', 'PAGADO', 'ANULADO')
      OR g.tipo_gasto NOT IN ('OPERATIVO', 'ADMINISTRATIVO', 'VENTAS', 'FINANCIERO', 'TRIBUTARIO', 'LOGISTICO')
      OR (g.moneda IS NOT NULL AND char_length(btrim(g.moneda)) <> 3)
    );
  RETURN QUERY SELECT 'gastos_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.egresos e
  WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
    AND (
      e.monto < 0
      OR upper(e.estado) NOT IN ('REGISTRADO', 'APLICADO', 'ANULADO')
      OR e.tipo_egreso NOT IN ('PAGO_PROVEEDOR', 'NOMINA', 'TRIBUTO', 'SERVICIO', 'TRANSFERENCIA', 'CAJA_CHICA', 'OTRO')
      OR (e.moneda IS NOT NULL AND char_length(btrim(e.moneda)) <> 3)
    );
  RETURN QUERY SELECT 'egresos_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.cobranzas c
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      c.monto < 0
      OR c.monto_cobrado < 0
      OR c.saldo < 0
      OR c.monto_cobrado > c.monto + 0.01
      OR upper(c.estado) NOT IN ('PENDIENTE', 'EN_GESTION', 'VENCIDA', 'COBRADA', 'ANULADA')
      OR c.prioridad NOT IN ('ALTA', 'MEDIA', 'BAJA')
      OR c.canal NOT IN ('SISTEMA', 'LLAMADA', 'EMAIL', 'WHATSAPP', 'VISITA', 'SMS', 'OTRO')
      OR (upper(c.estado) = 'COBRADA' AND c.fecha_cobro IS NULL)
    );
  RETURN QUERY SELECT 'cobranzas_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.gestiones_cobranza gc
  WHERE (p_tenant_id IS NULL OR gc.tenant_id = p_tenant_id)
    AND (
      gc.monto_compromiso < 0
      OR upper(gc.estado) NOT IN ('REGISTRADA', 'ANULADA')
      OR gc.tipo_gestion NOT IN ('LLAMADA', 'EMAIL', 'WHATSAPP', 'VISITA', 'SMS', 'NOTIFICACION', 'OTRO')
      OR gc.resultado NOT IN ('SIN_RESPUESTA', 'PROMESA_PAGO', 'PAGO_PARCIAL', 'PAGO_TOTAL', 'RECHAZADO', 'REPROGRAMADO', 'OTRO')
    );
  RETURN QUERY SELECT 'gestiones_cobranza_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_facturas pf
  WHERE (p_tenant_id IS NULL OR pf.tenant_id = p_tenant_id)
    AND (
      pf.monto < 0
      OR upper(pf.estado) NOT IN ('PENDIENTE', 'APLICADO', 'ANULADO')
      OR (pf.moneda IS NOT NULL AND char_length(btrim(pf.moneda)) <> 3)
      OR (upper(pf.estado) = 'APLICADO' AND pf.aplicado_en IS NULL)
    );
  RETURN QUERY SELECT 'pagos_facturas_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  -- Mismatch tenant por relaciones
  SELECT COUNT(*)
  INTO v_count
  FROM public.gastos g
  LEFT JOIN public.proveedores p ON p.id = g.proveedor_id
  LEFT JOIN public.centros_costo cc ON cc.id = g.centro_costo_id
  WHERE (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id)
    AND (
      (p.id IS NOT NULL AND p.tenant_id IS NOT NULL AND g.tenant_id <> p.tenant_id)
      OR (cc.id IS NOT NULL AND cc.tenant_id IS NOT NULL AND g.tenant_id <> cc.tenant_id)
    );
  RETURN QUERY SELECT 'gastos_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.egresos e
  LEFT JOIN public.cuentas_por_pagar cxp ON cxp.id = e.cuenta_por_pagar_id
  LEFT JOIN public.proveedores p ON p.id = e.proveedor_id
  LEFT JOIN public.cuentas_bancarias cb ON cb.id = e.cuenta_bancaria_id
  WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
    AND (
      (cxp.id IS NOT NULL AND cxp.tenant_id IS NOT NULL AND e.tenant_id <> cxp.tenant_id)
      OR (p.id IS NOT NULL AND p.tenant_id IS NOT NULL AND e.tenant_id <> p.tenant_id)
      OR (cb.id IS NOT NULL AND cb.tenant_id IS NOT NULL AND e.tenant_id <> cb.tenant_id)
    );
  RETURN QUERY SELECT 'egresos_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.cobranzas c
  LEFT JOIN public.cuentas_por_cobrar cxc ON cxc.id = c.cuenta_por_cobrar_id
  LEFT JOIN public.clientes cli ON cli.id = c.cliente_id
  WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
    AND (
      (cxc.id IS NOT NULL AND cxc.tenant_id IS NOT NULL AND c.tenant_id <> cxc.tenant_id)
      OR (cli.id IS NOT NULL AND cli.tenant_id IS NOT NULL AND c.tenant_id <> cli.tenant_id)
    );
  RETURN QUERY SELECT 'cobranzas_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.gestiones_cobranza gc
  JOIN public.cobranzas c ON c.id = gc.cobranza_id
  WHERE (p_tenant_id IS NULL OR gc.tenant_id = p_tenant_id)
    AND gc.tenant_id <> c.tenant_id;
  RETURN QUERY SELECT 'gestiones_cobranza_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_facturas pf
  LEFT JOIN public.cuentas_por_pagar cxp ON cxp.id = pf.cuenta_por_pagar_id
  LEFT JOIN public.proveedores p ON p.id = pf.proveedor_id
  LEFT JOIN public.documentos d ON d.id = pf.documento_id
  LEFT JOIN public.cuentas_bancarias cb ON cb.id = pf.cuenta_bancaria_id
  WHERE (p_tenant_id IS NULL OR pf.tenant_id = p_tenant_id)
    AND (
      (cxp.id IS NOT NULL AND cxp.tenant_id IS NOT NULL AND pf.tenant_id <> cxp.tenant_id)
      OR (p.id IS NOT NULL AND p.tenant_id IS NOT NULL AND pf.tenant_id <> p.tenant_id)
      OR (d.id IS NOT NULL AND d.tenant_id IS NOT NULL AND pf.tenant_id <> d.tenant_id)
      OR (cb.id IS NOT NULL AND cb.tenant_id IS NOT NULL AND pf.tenant_id <> cb.tenant_id)
    );
  RETURN QUERY SELECT 'pagos_facturas_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  -- Huerfanos por relaciones clave
  SELECT COUNT(*)
  INTO v_count
  FROM public.gestiones_cobranza gc
  LEFT JOIN public.cobranzas c ON c.id = gc.cobranza_id
  WHERE gc.cobranza_id IS NOT NULL
    AND c.id IS NULL
    AND (p_tenant_id IS NULL OR gc.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'gestiones_cobranza_orphans_cobranza'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.cobranzas c
  LEFT JOIN public.cuentas_por_cobrar cxc ON cxc.id = c.cuenta_por_cobrar_id
  WHERE c.cuenta_por_cobrar_id IS NOT NULL
    AND cxc.id IS NULL
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'cobranzas_orphans_cuenta_por_cobrar'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_facturas pf
  LEFT JOIN public.cuentas_por_pagar cxp ON cxp.id = pf.cuenta_por_pagar_id
  WHERE pf.cuenta_por_pagar_id IS NOT NULL
    AND cxp.id IS NULL
    AND (p_tenant_id IS NULL OR pf.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pagos_facturas_orphans_cuenta_por_pagar'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_finanzas_cobros_egresos_runtime_status_actual AS
SELECT *
FROM public.validar_finanzas_cobros_egresos_runtime(app.current_tenant_id());

COMMIT;
