-- ============================================================================
-- 043__dashboard_query_performance_indexes.sql
-- Índices para consultas de dashboard (métricas y actividad reciente).
-- ============================================================================

BEGIN;

-- Ventas POS (hoy/mes + actividad reciente)
DO $$
BEGIN
  IF app.column_exists('ventas_pos', 'tenant_id')
     AND app.column_exists('ventas_pos', 'fecha')
     AND app.column_exists('ventas_pos', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ventas_pos_tenant_fecha_created ON public.ventas_pos (tenant_id, fecha DESC, created_at DESC)';
  END IF;

  IF app.column_exists('ventas_pos', 'tenant_id')
     AND app.column_exists('ventas_pos', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ventas_pos_tenant_created ON public.ventas_pos (tenant_id, created_at DESC)';
  END IF;
END
$$;

-- Compras
DO $$
BEGIN
  IF app.column_exists('ordenes_compra', 'tenant_id')
     AND app.column_exists('ordenes_compra', 'fecha_orden')
     AND app.column_exists('ordenes_compra', 'estado') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ordenes_compra_tenant_fecha_estado ON public.ordenes_compra (tenant_id, fecha_orden DESC, estado)';
  END IF;

  IF app.column_exists('ordenes_compra', 'tenant_id')
     AND app.column_exists('ordenes_compra', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ordenes_compra_tenant_created ON public.ordenes_compra (tenant_id, created_at DESC)';
  END IF;
END
$$;

-- Cotizaciones
DO $$
BEGIN
  IF app.column_exists('cotizaciones', 'tenant_id')
     AND app.column_exists('cotizaciones', 'fecha_cotizacion')
     AND app.column_exists('cotizaciones', 'estado') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_fecha_estado ON public.cotizaciones (tenant_id, fecha_cotizacion DESC, estado)';
  END IF;

  IF app.column_exists('cotizaciones', 'tenant_id')
     AND app.column_exists('cotizaciones', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_created ON public.cotizaciones (tenant_id, created_at DESC)';
  END IF;
END
$$;

-- CPE / GRE / SIRE
DO $$
BEGIN
  IF app.column_exists('cpe', 'tenant_id')
     AND app.column_exists('cpe', 'fecha_emision')
     AND app.column_exists('cpe', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cpe_tenant_fecha_emision_created ON public.cpe (tenant_id, fecha_emision DESC, created_at DESC)';
  END IF;

  IF app.column_exists('gre', 'tenant_id')
     AND app.column_exists('gre', 'fecha_emision')
     AND app.column_exists('gre', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_gre_tenant_fecha_emision_created ON public.gre (tenant_id, fecha_emision DESC, created_at DESC)';
  END IF;

  IF app.column_exists('sire_files', 'tenant_id')
     AND app.column_exists('sire_files', 'created_at')
     AND app.column_exists('sire_files', 'status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sire_files_tenant_created_status ON public.sire_files (tenant_id, created_at DESC, status)';
  END IF;
END
$$;

-- Usuarios (conteo dashboard)
DO $$
BEGIN
  IF app.column_exists('usuarios_sistema', 'tenant_id')
     AND app.column_exists('usuarios_sistema', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_tenant_created ON public.usuarios_sistema (tenant_id, created_at DESC)';
  END IF;
END
$$;

-- Movimientos de stock (ambos nombres legacy/canónico)
DO $$
BEGIN
  IF app.column_exists('movimientos_stock', 'tenant_id')
     AND app.column_exists('movimientos_stock', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_movimientos_stock_tenant_created ON public.movimientos_stock (tenant_id, created_at DESC)';
  END IF;

  IF app.column_exists('stock_movimientos', 'tenant_id')
     AND app.column_exists('stock_movimientos', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_stock_movimientos_tenant_created ON public.stock_movimientos (tenant_id, created_at DESC)';
  END IF;
END
$$;

COMMIT;

