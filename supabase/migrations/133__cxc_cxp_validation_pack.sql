-- ============================================================================
-- 133__cxc_cxp_validation_pack.sql
-- Pack de validación runtime para cuentas_por_cobrar y cuentas_por_pagar.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_cxc_cxp_runtime(
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
  -- Triggers runtime
  RETURN QUERY
  SELECT
    'trigger_normalize_cuentas_por_cobrar_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cuentas_por_cobrar'
        AND t.tgname = 'trg_normalize_cuentas_por_cobrar_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de cuentas_por_cobrar';

  RETURN QUERY
  SELECT
    'trigger_enforce_cuentas_por_cobrar_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cuentas_por_cobrar'
        AND t.tgname = 'trg_enforce_cuentas_por_cobrar_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en cuentas_por_cobrar';

  RETURN QUERY
  SELECT
    'trigger_normalize_cuentas_por_pagar_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cuentas_por_pagar'
        AND t.tgname = 'trg_normalize_cuentas_por_pagar_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de cuentas_por_pagar';

  RETURN QUERY
  SELECT
    'trigger_enforce_cuentas_por_pagar_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cuentas_por_pagar'
        AND t.tgname = 'trg_enforce_cuentas_por_pagar_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en cuentas_por_pagar';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'cxc_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 25
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cuentas_por_cobrar'
        AND c.column_name IN (
          'tenant_id', 'cliente_id', 'pedido_id', 'documento_id',
          'serie', 'numero', 'numero_documento', 'tipo_documento',
          'fecha_emision', 'fecha_vencimiento', 'fecha_pago', 'moneda',
          'monto_total', 'monto_original', 'monto_pendiente',
          'saldo', 'saldo_pendiente', 'dias_mora',
          'retencion_total', 'percepcion_total', 'detraccion_total', 'anticipo_total',
          'event_id', 'idempotency_key', 'event_source'
        )
    ),
    'columnas runtime de cuentas_por_cobrar';

  RETURN QUERY
  SELECT
    'cxp_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 24
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cuentas_por_pagar'
        AND c.column_name IN (
          'tenant_id', 'proveedor_id', 'orden_id', 'recepcion_id',
          'referencia_tipo', 'referencia_id',
          'numero', 'numero_documento', 'tipo_documento',
          'fecha_emision', 'fecha_vencimiento',
          'condiciones_pago', 'dias_credito',
          'subtotal', 'igv', 'total', 'saldo', 'saldo_pendiente',
          'moneda', 'ultimo_pago',
          'estado_comparacion', 'discrepancias',
          'event_id', 'idempotency_key'
        )
    ),
    'columnas runtime de cuentas_por_pagar';

  -- FKs para embeds/joins.
  RETURN QUERY
  SELECT
    'fk_cxc_cliente_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'cuentas_por_cobrar_cliente_id_fkey'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ),
    'FK de CxC a clientes';

  RETURN QUERY
  SELECT
    'fk_cxc_pedido_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'cuentas_por_cobrar_pedido_id_fkey'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ),
    'FK de CxC a pedidos_venta';

  RETURN QUERY
  SELECT
    'fk_cxc_documento_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'cuentas_por_cobrar_documento_id_fkey'
        AND conrelid = 'public.cuentas_por_cobrar'::regclass
    ),
    'FK de CxC a documentos';

  RETURN QUERY
  SELECT
    'fk_cxp_proveedor_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'cuentas_por_pagar_proveedor_id_fkey'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ),
    'FK de CxP a proveedores';

  RETURN QUERY
  SELECT
    'fk_cxp_orden_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'cuentas_por_pagar_orden_id_fkey'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ),
    'FK de CxP a ordenes_compra';

  RETURN QUERY
  SELECT
    'fk_cxp_recepcion_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'cuentas_por_pagar_recepcion_id_fkey'
        AND conrelid = 'public.cuentas_por_pagar'::regclass
    ),
    'FK de CxP a recepciones';

  -- Índices de soporte.
  RETURN QUERY
  SELECT
    'ux_cxc_tenant_documento_active_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cuentas_por_cobrar'
        AND indexname = 'ux_cuentas_por_cobrar_tenant_documento_active'
    ),
    'unicidad documento activo por tenant en CxC';

  RETURN QUERY
  SELECT
    'ux_cxc_tenant_idempotency_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cuentas_por_cobrar'
        AND indexname = 'ux_cuentas_por_cobrar_tenant_idempotency'
    ),
    'unicidad tenant+idempotency en CxC';

  RETURN QUERY
  SELECT
    'ux_cxp_tenant_proveedor_numero_doc_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cuentas_por_pagar'
        AND indexname = 'ux_cuentas_por_pagar_tenant_proveedor_numero_doc'
    ),
    'unicidad tenant+proveedor+numero_documento en CxP';

  RETURN QUERY
  SELECT
    'ux_cxp_tenant_idempotency_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cuentas_por_pagar'
        AND indexname = 'ux_cuentas_por_pagar_tenant_idempotency'
    ),
    'unicidad tenant+idempotency en CxP';

  RETURN QUERY
  SELECT
    'ux_cxp_tenant_referencia_scope_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cuentas_por_pagar'
        AND indexname = 'ux_cuentas_por_pagar_tenant_referencia_scope'
    ),
    'unicidad de referencia operativa por tenant en CxP';

  -- RLS
  RETURN QUERY
  SELECT
    'rls_cxc_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cuentas_por_cobrar'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cuentas_por_cobrar';

  RETURN QUERY
  SELECT
    'rls_cxp_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cuentas_por_pagar'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cuentas_por_pagar';

  -- Duplicados de scope.
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, documento_id, COUNT(*) AS cnt
    FROM public.cuentas_por_cobrar
    WHERE tenant_id IS NOT NULL
      AND documento_id IS NOT NULL
      AND estado NOT IN ('ANULADA', 'REVERTIDA')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, documento_id
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'cxc_duplicate_documento_scope'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, idempotency_key, COUNT(*) AS cnt
    FROM public.cuentas_por_cobrar
    WHERE tenant_id IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND btrim(idempotency_key) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, idempotency_key
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'cxc_duplicate_idempotency'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, proveedor_id, upper(btrim(numero_documento)) AS doc_norm, COUNT(*) AS cnt
    FROM public.cuentas_por_pagar
    WHERE tenant_id IS NOT NULL
      AND proveedor_id IS NOT NULL
      AND numero_documento IS NOT NULL
      AND btrim(numero_documento) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, proveedor_id, upper(btrim(numero_documento))
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'cxp_duplicate_proveedor_numero_doc'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(referencia_tipo)) AS ref_tipo, referencia_id, COUNT(*) AS cnt
    FROM public.cuentas_por_pagar
    WHERE tenant_id IS NOT NULL
      AND referencia_tipo IS NOT NULL
      AND btrim(referencia_tipo) <> ''
      AND referencia_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(referencia_tipo)), referencia_id
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'cxp_duplicate_referencia_scope'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  -- Filas inválidas.
  SELECT COUNT(*)
  INTO v_count
  FROM public.cuentas_por_cobrar c
  WHERE (
      c.tenant_id IS NULL
      OR c.cliente_id IS NULL
      OR c.documento_id IS NULL
      OR c.fecha_emision IS NULL
      OR c.fecha_vencimiento IS NULL
      OR c.fecha_vencimiento < c.fecha_emision
      OR c.moneda IS NULL OR c.moneda !~ '^[A-Z]{3}$'
      OR c.monto_total IS NULL OR c.monto_total < 0
      OR c.monto_pendiente IS NULL OR c.monto_pendiente < 0
      OR c.saldo <> c.monto_pendiente
      OR c.saldo_pendiente <> c.monto_pendiente
      OR c.estado IS NULL OR c.estado NOT IN ('PENDIENTE', 'PARCIAL', 'CANCELADO', 'VENCIDA', 'ANULADA', 'REVERTIDA')
      OR (
        c.estado IN ('CANCELADO', 'ANULADA', 'REVERTIDA')
        AND c.monto_pendiente <> 0
      )
      OR (
        c.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDA')
        AND c.monto_pendiente <= 0
      )
      OR c.idempotency_key IS NULL OR btrim(c.idempotency_key) = ''
      OR c.event_source IS NULL OR btrim(c.event_source) = ''
    )
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'cxc_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.cuentas_por_pagar c
  WHERE (
      c.tenant_id IS NULL
      OR c.proveedor_id IS NULL
      OR c.numero_documento IS NULL OR btrim(c.numero_documento) = ''
      OR c.fecha_emision IS NULL
      OR c.fecha_vencimiento IS NULL
      OR c.fecha_vencimiento < c.fecha_emision
      OR c.condiciones_pago IS NULL OR btrim(c.condiciones_pago) = ''
      OR c.moneda IS NULL OR c.moneda !~ '^[A-Z]{3}$'
      OR c.subtotal IS NULL OR c.subtotal < 0
      OR c.igv IS NULL OR c.igv < 0
      OR c.total IS NULL OR c.total <= 0
      OR abs(c.total - round((c.subtotal + c.igv)::numeric, 2)) > 0.01
      OR c.saldo IS NULL OR c.saldo < 0 OR c.saldo > c.total
      OR c.saldo_pendiente <> c.saldo
      OR c.estado IS NULL OR c.estado NOT IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA')
      OR (
        c.estado = 'PAGADA'
        AND c.saldo <> 0
      )
      OR (
        c.estado = 'PARCIAL'
        AND NOT (c.saldo > 0 AND c.saldo < c.total)
      )
      OR (
        c.estado IN ('PENDIENTE', 'VENCIDA')
        AND c.saldo <= 0
      )
      OR c.estado_comparacion IS NULL OR c.estado_comparacion NOT IN ('PENDIENTE', 'OK', 'DESVIACION_CANTIDAD', 'DESVIACION_PRECIO')
      OR c.discrepancias IS NULL OR jsonb_typeof(c.discrepancias) <> 'array'
      OR c.idempotency_key IS NULL OR btrim(c.idempotency_key) = ''
    )
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'cxp_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  -- Mismatches tenant por relaciones.
  SELECT COUNT(*)
  INTO v_count
  FROM public.cuentas_por_cobrar c
  JOIN public.clientes cl
    ON cl.id = c.cliente_id
  WHERE c.tenant_id IS NOT NULL
    AND cl.tenant_id IS NOT NULL
    AND c.tenant_id <> cl.tenant_id
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'cxc_vs_clientes_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.cuentas_por_pagar c
  JOIN public.proveedores p
    ON p.id = c.proveedor_id
  WHERE c.tenant_id IS NOT NULL
    AND p.tenant_id IS NOT NULL
    AND c.tenant_id <> p.tenant_id
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'cxp_vs_proveedores_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.cuentas_por_pagar c
  JOIN public.ordenes_compra o
    ON o.id = c.orden_id
  WHERE c.orden_id IS NOT NULL
    AND c.tenant_id IS NOT NULL
    AND o.tenant_id IS NOT NULL
    AND c.tenant_id <> o.tenant_id
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'cxp_vs_ordenes_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.cuentas_por_pagar c
  JOIN public.recepciones r
    ON r.id = c.recepcion_id
  WHERE c.recepcion_id IS NOT NULL
    AND c.tenant_id IS NOT NULL
    AND r.tenant_id IS NOT NULL
    AND c.tenant_id <> r.tenant_id
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'cxp_vs_recepciones_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_cxc_cxp_runtime_status_actual AS
SELECT *
FROM public.validar_cxc_cxp_runtime(
  COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
);

COMMIT;
