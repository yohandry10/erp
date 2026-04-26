-- ============================================================================
-- 163__ventas_historicas_validation_pack.sql
-- Pack de validacion runtime para ventas historicas y pagos legacy.
-- Tablas: ventas, venta_detalles, pagos_ventas.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_ventas_historicas_runtime(
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
      ('ventas', 'trg_normalize_ventas_row', 'normalizacion en ventas'),
      ('venta_detalles', 'trg_normalize_venta_detalles_row', 'normalizacion en venta_detalles'),
      ('pagos_ventas', 'trg_normalize_pagos_ventas_row', 'normalizacion en pagos_ventas')
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
      ('ventas', 'trg_enforce_ventas_tenant_consistency', 'consistencia tenant en ventas'),
      ('venta_detalles', 'trg_enforce_venta_detalles_tenant_consistency', 'consistencia tenant en venta_detalles'),
      ('pagos_ventas', 'trg_enforce_pagos_ventas_tenant_consistency', 'consistencia tenant en pagos_ventas')
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
    'ventas_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 17
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'ventas'
        AND c.column_name IN (
          'tenant_id', 'fecha', 'numero_documento', 'tipo_documento',
          'cliente_id', 'vendedor_id', 'sucursal_id', 'metodo_pago',
          'moneda', 'descuento', 'subtotal', 'igv', 'total',
          'referencia', 'cuenta_por_cobrar_id', 'event_id', 'idempotency_key'
        )
    ),
    'columnas runtime de ventas';

  RETURN QUERY
  SELECT
    'venta_detalles_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'venta_detalles'
        AND c.column_name IN (
          'tenant_id', 'venta_id', 'producto_id', 'cantidad', 'precio_unitario',
          'descuento', 'subtotal', 'igv', 'total_linea', 'unidad_medida'
        )
    ),
    'columnas runtime de venta_detalles';

  RETURN QUERY
  SELECT
    'pagos_ventas_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 12
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pagos_ventas'
        AND c.column_name IN (
          'tenant_id', 'venta_id', 'monto', 'moneda', 'metodo_pago', 'fecha_pago',
          'referencia', 'numero_operacion', 'usuario_id', 'event_id',
          'idempotency_key', 'aplicado_en'
        )
    ),
    'columnas runtime de pagos_ventas';

  -- FKs esperadas
  RETURN QUERY
  WITH expected(conname, relname, detail) AS (
    VALUES
      ('ventas_cliente_id_fkey', 'ventas', 'FK ventas -> clientes'),
      ('ventas_vendedor_id_fkey', 'ventas', 'FK ventas -> usuarios_sistema'),
      ('ventas_sucursal_id_fkey', 'ventas', 'FK ventas -> sucursales'),
      ('ventas_cuenta_por_cobrar_id_fkey', 'ventas', 'FK ventas -> cuentas_por_cobrar'),
      ('venta_detalles_venta_id_fkey', 'venta_detalles', 'FK venta_detalles -> ventas'),
      ('venta_detalles_producto_id_fkey', 'venta_detalles', 'FK venta_detalles -> productos'),
      ('pagos_ventas_venta_id_fkey', 'pagos_ventas', 'FK pagos_ventas -> ventas'),
      ('pagos_ventas_usuario_id_fkey', 'pagos_ventas', 'FK pagos_ventas -> usuarios_sistema')
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
      ('ventas', 'idx_ventas_tenant_estado_fecha_runtime', 'indice tenant+estado+fecha en ventas'),
      ('ventas', 'idx_ventas_tenant_documento_runtime', 'indice tenant+documento en ventas'),
      ('venta_detalles', 'idx_venta_detalles_tenant_venta_runtime', 'indice tenant+venta en venta_detalles'),
      ('pagos_ventas', 'idx_pagos_ventas_tenant_venta_fecha_runtime', 'indice tenant+venta+fecha en pagos_ventas'),
      ('ventas', 'ux_ventas_tenant_tipo_numero', 'unicidad tenant+tipo+numero en ventas'),
      ('pagos_ventas', 'ux_pagos_ventas_tenant_referencia', 'unicidad tenant+referencia en pagos_ventas'),
      ('pagos_ventas', 'ux_pagos_ventas_tenant_idempotency', 'unicidad tenant+idempotency en pagos_ventas'),
      ('pagos_ventas', 'ux_pagos_ventas_tenant_event_id', 'unicidad tenant+event_id en pagos_ventas')
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

  -- RLS enabled+forced
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES ('ventas'), ('venta_detalles'), ('pagos_ventas')
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
    SELECT tenant_id, upper(btrim(tipo_documento)) AS tipo_doc, upper(btrim(numero_documento)) AS numero_doc, COUNT(*) AS cnt
    FROM public.ventas
    WHERE tenant_id IS NOT NULL
      AND tipo_documento IS NOT NULL
      AND btrim(tipo_documento) <> ''
      AND numero_documento IS NOT NULL
      AND btrim(numero_documento) <> ''
      AND upper(estado) <> 'ANULADA'
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(tipo_documento)), upper(btrim(numero_documento))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_ventas_tenant_tipo_numero'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(referencia)) AS ref_norm, COUNT(*) AS cnt
    FROM public.pagos_ventas
    WHERE tenant_id IS NOT NULL
      AND referencia IS NOT NULL
      AND btrim(referencia) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(referencia))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_pagos_ventas_tenant_referencia'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, lower(btrim(idempotency_key)) AS key_norm, COUNT(*) AS cnt
    FROM public.pagos_ventas
    WHERE tenant_id IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND btrim(idempotency_key) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, lower(btrim(idempotency_key))
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_pagos_ventas_tenant_idempotency'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, event_id, COUNT(*) AS cnt
    FROM public.pagos_ventas
    WHERE tenant_id IS NOT NULL
      AND event_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, event_id
    HAVING COUNT(*) > 1
  ) q;
  RETURN QUERY SELECT 'dup_pagos_ventas_tenant_event_id'::text, v_count = 0, format('duplicados: %s', v_count)::text;

  -- Filas invalidas por reglas de negocio
  SELECT COUNT(*)
  INTO v_count
  FROM public.ventas v
  WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    AND (
      v.subtotal < 0
      OR v.igv < 0
      OR v.descuento < 0
      OR v.total < 0
      OR v.total < round(GREATEST(v.subtotal - v.descuento, 0) + v.igv - 0.01, 2)
      OR upper(v.estado) NOT IN ('BORRADOR', 'EMITIDA', 'PAGADA', 'CONFIRMADA', 'ANULADA')
      OR v.tipo_documento NOT IN ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'TICKET', 'GUIA')
      OR (v.moneda IS NOT NULL AND char_length(btrim(v.moneda)) <> 3)
    );
  RETURN QUERY SELECT 'ventas_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.venta_detalles vd
  WHERE (p_tenant_id IS NULL OR vd.tenant_id = p_tenant_id)
    AND (
      vd.cantidad <= 0
      OR vd.precio_unitario < 0
      OR vd.descuento < 0
      OR vd.subtotal < 0
      OR vd.igv < 0
      OR vd.total_linea < 0
      OR vd.total_linea < round(vd.subtotal + vd.igv - 0.01, 2)
      OR upper(vd.estado) NOT IN ('REGISTRADO', 'ANULADO')
    );
  RETURN QUERY SELECT 'venta_detalles_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_ventas pv
  WHERE (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id)
    AND (
      pv.monto < 0
      OR upper(pv.estado) NOT IN ('REGISTRADO', 'APLICADO', 'ANULADO')
      OR (pv.moneda IS NOT NULL AND char_length(btrim(pv.moneda)) <> 3)
      OR (upper(pv.estado) = 'APLICADO' AND pv.aplicado_en IS NULL)
    );
  RETURN QUERY SELECT 'pagos_ventas_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  -- Mismatch tenant por relaciones
  SELECT COUNT(*)
  INTO v_count
  FROM public.ventas v
  LEFT JOIN public.clientes c ON c.id = v.cliente_id
  LEFT JOIN public.usuarios_sistema u ON u.id = v.vendedor_id
  LEFT JOIN public.sucursales s ON s.id = v.sucursal_id
  LEFT JOIN public.cuentas_por_cobrar cxc ON cxc.id = v.cuenta_por_cobrar_id
  WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    AND (
      (c.id IS NOT NULL AND c.tenant_id IS NOT NULL AND v.tenant_id <> c.tenant_id)
      OR (u.id IS NOT NULL AND u.tenant_id IS NOT NULL AND v.tenant_id <> u.tenant_id)
      OR (s.id IS NOT NULL AND s.tenant_id IS NOT NULL AND v.tenant_id <> s.tenant_id)
      OR (cxc.id IS NOT NULL AND cxc.tenant_id IS NOT NULL AND v.tenant_id <> cxc.tenant_id)
    );
  RETURN QUERY SELECT 'ventas_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.venta_detalles vd
  LEFT JOIN public.ventas v ON v.id = vd.venta_id
  LEFT JOIN public.productos p ON p.id = vd.producto_id
  WHERE (p_tenant_id IS NULL OR vd.tenant_id = p_tenant_id)
    AND (
      (v.id IS NOT NULL AND v.tenant_id IS NOT NULL AND vd.tenant_id <> v.tenant_id)
      OR (p.id IS NOT NULL AND p.tenant_id IS NOT NULL AND vd.tenant_id <> p.tenant_id)
    );
  RETURN QUERY SELECT 'venta_detalles_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_ventas pv
  LEFT JOIN public.ventas v ON v.id = pv.venta_id
  LEFT JOIN public.usuarios_sistema u ON u.id = pv.usuario_id
  WHERE (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id)
    AND (
      (v.id IS NOT NULL AND v.tenant_id IS NOT NULL AND pv.tenant_id <> v.tenant_id)
      OR (u.id IS NOT NULL AND u.tenant_id IS NOT NULL AND pv.tenant_id <> u.tenant_id)
    );
  RETURN QUERY SELECT 'pagos_ventas_tenant_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  -- Huerfanos por relaciones clave
  SELECT COUNT(*)
  INTO v_count
  FROM public.venta_detalles vd
  LEFT JOIN public.ventas v ON v.id = vd.venta_id
  WHERE vd.venta_id IS NOT NULL
    AND v.id IS NULL
    AND (p_tenant_id IS NULL OR vd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'venta_detalles_orphans_venta'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.venta_detalles vd
  LEFT JOIN public.productos p ON p.id = vd.producto_id
  WHERE vd.producto_id IS NOT NULL
    AND p.id IS NULL
    AND (p_tenant_id IS NULL OR vd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'venta_detalles_orphans_producto'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_ventas pv
  LEFT JOIN public.ventas v ON v.id = pv.venta_id
  WHERE pv.venta_id IS NOT NULL
    AND v.id IS NULL
    AND (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pagos_ventas_orphans_venta'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_ventas pv
  LEFT JOIN public.usuarios_sistema u ON u.id = pv.usuario_id
  WHERE pv.usuario_id IS NOT NULL
    AND u.id IS NULL
    AND (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pagos_ventas_orphans_usuario'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_ventas_historicas_runtime_status_actual AS
SELECT *
FROM public.validar_ventas_historicas_runtime(app.current_tenant_id());

COMMIT;
