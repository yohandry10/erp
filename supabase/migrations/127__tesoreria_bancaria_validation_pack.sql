-- ============================================================================
-- 127__tesoreria_bancaria_validation_pack.sql
-- Pack de validación runtime para tesorería bancaria.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_tesoreria_bancaria_runtime(
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
    'trigger_normalize_cuentas_bancarias_tesoreria_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cuentas_bancarias'
        AND t.tgname = 'trg_normalize_cuentas_bancarias_tesoreria_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de cuentas_bancarias';

  RETURN QUERY
  SELECT
    'trigger_normalize_movimientos_bancarios_tesoreria_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'movimientos_bancarios'
        AND t.tgname = 'trg_normalize_movimientos_bancarios_tesoreria_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de movimientos_bancarios';

  RETURN QUERY
  SELECT
    'trigger_normalize_conciliaciones_bancarias_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'conciliaciones_bancarias'
        AND t.tgname = 'trg_normalize_conciliaciones_bancarias_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de conciliaciones_bancarias';

  RETURN QUERY
  SELECT
    'trigger_enforce_movimientos_bancarios_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'movimientos_bancarios'
        AND t.tgname = 'trg_enforce_movimientos_bancarios_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en movimientos_bancarios';

  RETURN QUERY
  SELECT
    'trigger_enforce_conciliaciones_bancarias_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'conciliaciones_bancarias'
        AND t.tgname = 'trg_enforce_conciliaciones_bancarias_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en conciliaciones_bancarias';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'cuentas_bancarias_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 13
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cuentas_bancarias'
        AND c.column_name IN (
          'tenant_id', 'banco', 'numero_cuenta', 'tipo_cuenta', 'moneda',
          'saldo', 'saldo_actual', 'saldo_contable', 'permite_sobregiro',
          'activa', 'activo', 'created_by', 'updated_by'
        )
    ),
    'columnas runtime de cuentas_bancarias';

  RETURN QUERY
  SELECT
    'movimientos_bancarios_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 23
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'movimientos_bancarios'
        AND c.column_name IN (
          'tenant_id', 'cuenta_bancaria_id', 'tipo', 'monto', 'fecha',
          'descripcion', 'referencia', 'metodo_pago', 'proveedor_id',
          'cliente_id', 'cxp_id', 'cxc_id', 'conciliacion_id',
          'conciliado', 'es_extracto', 'match_automatico', 'match_id',
          'movimiento_relacionado_id', 'diferencia_conciliacion',
          'saldo_anterior', 'saldo_nuevo', 'created_by', 'updated_by'
        )
    ),
    'columnas runtime de movimientos_bancarios';

  RETURN QUERY
  SELECT
    'conciliaciones_bancarias_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 17
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'conciliaciones_bancarias'
        AND c.column_name IN (
          'tenant_id', 'cuenta_bancaria_id', 'periodo',
          'fecha_desde', 'fecha_hasta', 'saldo_libro', 'saldo_banco',
          'diferencia', 'estado', 'observaciones',
          'cerrado_at', 'cerrado_by', 'banco', 'numero_cuenta',
          'moneda', 'created_by', 'updated_by'
        )
    ),
    'columnas runtime de conciliaciones_bancarias';

  -- FK esperadas para embeds PostgREST / integridad.
  RETURN QUERY
  SELECT
    'fk_movimientos_bancarios_cuenta_bancaria_id_fkey_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'movimientos_bancarios_cuenta_bancaria_id_fkey'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ),
    'FK para embed movimientos->cuentas_bancarias';

  RETURN QUERY
  SELECT
    'fk_movimientos_bancarios_proveedor_id_fkey_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'movimientos_bancarios_proveedor_id_fkey'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ),
    'FK para embed movimientos->proveedores';

  RETURN QUERY
  SELECT
    'fk_movimientos_bancarios_cxp_id_fkey_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'movimientos_bancarios_cxp_id_fkey'
        AND conrelid = 'public.movimientos_bancarios'::regclass
    ),
    'FK para embed movimientos->cuentas_por_pagar';

  RETURN QUERY
  SELECT
    'fk_conciliaciones_bancarias_cuenta_bancaria_id_fkey_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'conciliaciones_bancarias_cuenta_bancaria_id_fkey'
        AND conrelid = 'public.conciliaciones_bancarias'::regclass
    ),
    'FK de conciliaciones a cuentas_bancarias';

  -- Índices runtime y unicidades.
  RETURN QUERY
  SELECT
    'idx_cuentas_bancarias_tenant_activa_moneda_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cuentas_bancarias'
        AND indexname = 'idx_cuentas_bancarias_tenant_activa_moneda_runtime'
    ),
    'índice por tenant/activa/moneda en cuentas_bancarias';

  RETURN QUERY
  SELECT
    'idx_movimientos_bancarios_tenant_cuenta_fecha_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'movimientos_bancarios'
        AND indexname = 'idx_movimientos_bancarios_tenant_cuenta_fecha_runtime'
    ),
    'índice por tenant/cuenta/fecha en movimientos_bancarios';

  RETURN QUERY
  SELECT
    'idx_conciliaciones_bancarias_tenant_cuenta_periodo_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'conciliaciones_bancarias'
        AND indexname = 'idx_conciliaciones_bancarias_tenant_cuenta_periodo_runtime'
    ),
    'índice por tenant/cuenta/periodo en conciliaciones_bancarias';

  RETURN QUERY
  SELECT
    'ux_cuentas_bancarias_tenant_numero_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cuentas_bancarias'
        AND indexname = 'ux_cuentas_bancarias_tenant_numero'
    ),
    'unicidad tenant+numero_cuenta en cuentas_bancarias';

  RETURN QUERY
  SELECT
    'ux_conciliaciones_bancarias_tenant_cuenta_periodo_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'conciliaciones_bancarias'
        AND indexname = 'ux_conciliaciones_bancarias_tenant_cuenta_periodo'
    ),
    'unicidad tenant+cuenta+periodo en conciliaciones_bancarias';

  -- RLS
  RETURN QUERY
  SELECT
    'rls_cuentas_bancarias_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cuentas_bancarias'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cuentas_bancarias';

  RETURN QUERY
  SELECT
    'rls_movimientos_bancarios_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'movimientos_bancarios'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en movimientos_bancarios';

  RETURN QUERY
  SELECT
    'rls_conciliaciones_bancarias_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'conciliaciones_bancarias'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en conciliaciones_bancarias';

  -- Duplicados operativos por scope.
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(numero_cuenta)) AS numero_norm, COUNT(*) AS cnt
    FROM public.cuentas_bancarias
    WHERE tenant_id IS NOT NULL
      AND numero_cuenta IS NOT NULL
      AND btrim(numero_cuenta) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(numero_cuenta))
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'cuentas_bancarias_duplicate_scope'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, cuenta_bancaria_id, upper(btrim(periodo)) AS periodo_norm, COUNT(*) AS cnt
    FROM public.conciliaciones_bancarias
    WHERE tenant_id IS NOT NULL
      AND cuenta_bancaria_id IS NOT NULL
      AND periodo IS NOT NULL
      AND btrim(periodo) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, cuenta_bancaria_id, upper(btrim(periodo))
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'conciliaciones_bancarias_duplicate_scope'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  -- Filas inválidas por reglas de negocio.
  SELECT COUNT(*)
  INTO v_count
  FROM public.cuentas_bancarias cb
  WHERE (
      cb.tenant_id IS NULL
      OR cb.nombre IS NULL OR btrim(cb.nombre) = ''
      OR cb.banco IS NULL OR btrim(cb.banco) = ''
      OR cb.numero_cuenta IS NULL OR btrim(cb.numero_cuenta) = ''
      OR cb.tipo_cuenta IS NULL OR cb.tipo_cuenta NOT IN ('CORRIENTE', 'AHORROS', 'DETRACCION', 'PLAZO_FIJO')
      OR cb.moneda IS NULL OR cb.moneda !~ '^[A-Z]{3}$'
      OR cb.estado IS NULL OR cb.estado NOT IN ('ACTIVO', 'INACTIVO')
      OR COALESCE(cb.activo, true) <> COALESCE(cb.activa, true)
      OR COALESCE(cb.activa, true) <> (cb.estado = 'ACTIVO')
      OR (
        COALESCE(cb.permite_sobregiro, false) = false
        AND (
          COALESCE(cb.saldo, 0) < 0
          OR COALESCE(cb.saldo_actual, 0) < 0
          OR COALESCE(cb.saldo_contable, 0) < 0
        )
      )
    )
    AND (p_tenant_id IS NULL OR cb.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'cuentas_bancarias_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.movimientos_bancarios m
  WHERE (
      m.tenant_id IS NULL
      OR m.cuenta_bancaria_id IS NULL
      OR m.tipo IS NULL OR m.tipo NOT IN ('ABONO', 'CARGO')
      OR m.monto IS NULL OR m.monto <= 0
      OR m.fecha IS NULL
      OR m.descripcion IS NULL OR btrim(m.descripcion) = ''
      OR (COALESCE(m.es_extracto, false) = true AND m.conciliacion_id IS NULL)
      OR (COALESCE(m.conciliado, false) = true AND m.conciliacion_id IS NULL)
      OR (
        COALESCE(m.match_automatico, false) = true
        AND (COALESCE(m.conciliado, false) = false OR m.match_id IS NULL)
      )
      OR COALESCE(m.diferencia_conciliacion, 0) < 0
      OR (m.cxp_id IS NOT NULL AND m.cxc_id IS NOT NULL)
      OR (m.proveedor_id IS NOT NULL AND m.cliente_id IS NOT NULL)
    )
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'movimientos_bancarios_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.conciliaciones_bancarias c
  WHERE (
      c.tenant_id IS NULL
      OR c.cuenta_bancaria_id IS NULL
      OR c.periodo IS NULL OR c.periodo !~ '^\d{4}-(0[1-9]|1[0-2])$'
      OR c.estado IS NULL OR c.estado NOT IN ('ABIERTA', 'EN_PROCESO', 'CERRADA')
      OR c.fecha_desde IS NULL OR c.fecha_hasta IS NULL OR c.fecha_hasta < c.fecha_desde
      OR c.saldo_libro IS NULL OR c.saldo_banco IS NULL OR c.diferencia IS NULL
      OR round((c.saldo_libro - c.saldo_banco)::numeric, 2) <> round(c.diferencia::numeric, 2)
      OR (
        c.estado = 'CERRADA'
        AND c.cerrado_at IS NULL
      )
      OR (
        c.estado <> 'CERRADA'
        AND (c.cerrado_at IS NOT NULL OR c.cerrado_by IS NOT NULL)
      )
      OR (c.moneda IS NOT NULL AND c.moneda !~ '^[A-Z]{3}$')
    )
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'conciliaciones_bancarias_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  -- Mismatches de tenant por relaciones.
  SELECT COUNT(*)
  INTO v_count
  FROM public.movimientos_bancarios m
  JOIN public.cuentas_bancarias cb
    ON cb.id = m.cuenta_bancaria_id
  WHERE cb.tenant_id IS NOT NULL
    AND m.tenant_id IS NOT NULL
    AND m.tenant_id <> cb.tenant_id
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'movimientos_vs_cuentas_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.movimientos_bancarios m
  JOIN public.conciliaciones_bancarias c
    ON c.id = m.conciliacion_id
  WHERE c.tenant_id IS NOT NULL
    AND m.tenant_id IS NOT NULL
    AND m.tenant_id <> c.tenant_id
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'movimientos_vs_conciliaciones_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.conciliaciones_bancarias c
  JOIN public.cuentas_bancarias cb
    ON cb.id = c.cuenta_bancaria_id
  WHERE cb.tenant_id IS NOT NULL
    AND c.tenant_id IS NOT NULL
    AND c.tenant_id <> cb.tenant_id
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'conciliaciones_vs_cuentas_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_tesoreria_bancaria_runtime_status_actual AS
SELECT *
FROM public.validar_tesoreria_bancaria_runtime(
  COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
);

COMMIT;

