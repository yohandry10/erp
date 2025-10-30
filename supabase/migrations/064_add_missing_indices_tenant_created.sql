-- =====================================================
-- MIGRACIÓN 064: Agregar Índices Faltantes en tenant_id y created_at
-- =====================================================
-- Descripción: Agrega índices explícitos en tenant_id y created_at para todas las
--              tablas principales que no los tienen. También crea índices compuestos
--              (tenant_id, created_at) para queries comunes que filtran por tenant y fecha.
-- Prioridad: MEDIA - Tarea 20: Índices en columnas frecuentemente consultadas
-- Fecha: 2025-01-XX
-- =====================================================
-- 
-- OBJETIVO:
-- - Optimizar queries que filtran por tenant_id (crítico para RLS)
-- - Optimizar queries que filtran por created_at (reportes, dashboards)
-- - Crear índices compuestos (tenant_id, created_at) para queries comunes
--
-- IMPACTO ESPERADO:
-- - Mejora significativa en performance de queries con RLS habilitado
-- - Reducción de table scans completos
-- - Mejora en queries de reportes y dashboards que filtran por fecha
-- =====================================================

BEGIN;

-- =====================================================
-- FUNCIÓN HELPER: Verificar y crear índice si no existe
-- =====================================================

CREATE OR REPLACE FUNCTION create_index_if_not_exists(
  p_index_name TEXT,
  p_table_name TEXT,
  p_columns TEXT,
  p_where_clause TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_index_exists boolean;
  v_sql TEXT;
BEGIN
  -- Verificar si el índice ya existe
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = p_index_name
  ) INTO v_index_exists;
  
  IF NOT v_index_exists THEN
    -- Construir SQL para crear índice
    v_sql := format('CREATE INDEX IF NOT EXISTS %I ON %I(%s)', 
      p_index_name, p_table_name, p_columns);
    
    -- Agregar WHERE clause si se proporciona
    IF p_where_clause IS NOT NULL THEN
      v_sql := v_sql || format(' WHERE %s', p_where_clause);
    END IF;
    
    -- Ejecutar creación de índice
    EXECUTE v_sql;
    RAISE NOTICE '✓ Índice creado: %', p_index_name;
  ELSE
    RAISE NOTICE '→ Índice ya existe: %', p_index_name;
  END IF;
END;
$$;

-- =====================================================
-- FUNCIÓN HELPER: Verificar si tabla tiene columna
-- =====================================================

CREATE OR REPLACE FUNCTION table_has_column(
  p_table_name TEXT,
  p_column_name TEXT
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$;

-- =====================================================
-- 1. MÓDULO CONTABILIDAD
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== CREANDO ÍNDICES PARA MÓDULO CONTABILIDAD ===';
  
  -- asientos_contables
  IF table_has_column('asientos_contables', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_asientos_contables_tenant_id',
      'asientos_contables',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('asientos_contables', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_asientos_contables_created_at',
      'asientos_contables',
      'created_at DESC'
    );
    
    IF table_has_column('asientos_contables', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_asientos_contables_tenant_created',
        'asientos_contables',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- detalle_asientos
  IF table_has_column('detalle_asientos', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_detalle_asientos_tenant_id',
      'detalle_asientos',
      'tenant_id'
    );
  END IF;
  
  -- periodos_contables
  IF table_has_column('periodos_contables', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_periodos_contables_tenant_id',
      'periodos_contables',
      'tenant_id'
    );
  END IF;
  
  -- plan_cuentas
  IF table_has_column('plan_cuentas', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_plan_cuentas_tenant_id',
      'plan_cuentas',
      'tenant_id'
    );
  END IF;
  
  RAISE NOTICE '✓ Índices de Contabilidad creados';
END $$;

-- =====================================================
-- 2. MÓDULO VENTAS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== CREANDO ÍNDICES PARA MÓDULO VENTAS ===';
  
  -- ventas
  IF table_has_column('ventas', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_ventas_tenant_id',
      'ventas',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('ventas', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_ventas_created_at',
      'ventas',
      'created_at DESC'
    );
    
    IF table_has_column('ventas', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_ventas_tenant_created',
        'ventas',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- ventas_pos
  IF table_has_column('ventas_pos', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_ventas_pos_tenant_id',
      'ventas_pos',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('ventas_pos', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_ventas_pos_created_at',
      'ventas_pos',
      'created_at DESC'
    );
    
    IF table_has_column('ventas_pos', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_ventas_pos_tenant_created',
        'ventas_pos',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- cotizaciones
  IF table_has_column('cotizaciones', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_cotizaciones_tenant_id',
      'cotizaciones',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('cotizaciones', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_cotizaciones_created_at',
      'cotizaciones',
      'created_at DESC'
    );
    
    IF table_has_column('cotizaciones', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_cotizaciones_tenant_created',
        'cotizaciones',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  RAISE NOTICE '✓ Índices de Ventas creados';
END $$;

-- =====================================================
-- 3. MÓDULO COMPRAS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== CREANDO ÍNDICES PARA MÓDULO COMPRAS ===';
  
  -- ordenes_compra
  IF table_has_column('ordenes_compra', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_ordenes_compra_tenant_id',
      'ordenes_compra',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('ordenes_compra', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_ordenes_compra_created_at',
      'ordenes_compra',
      'created_at DESC'
    );
    
    IF table_has_column('ordenes_compra', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_ordenes_compra_tenant_created',
        'ordenes_compra',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- recepciones
  IF table_has_column('recepciones', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_recepciones_created_at',
      'recepciones',
      'created_at DESC'
    );
    
    IF table_has_column('recepciones', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_recepciones_tenant_created',
        'recepciones',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- cotizaciones_compra
  IF table_has_column('cotizaciones_compra', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_cotizaciones_compra_created_at',
      'cotizaciones_compra',
      'created_at DESC'
    );
    
    IF table_has_column('cotizaciones_compra', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_cotizaciones_compra_tenant_created',
        'cotizaciones_compra',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- devoluciones_proveedor
  IF table_has_column('devoluciones_proveedor', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_devoluciones_proveedor_created_at',
      'devoluciones_proveedor',
      'created_at DESC'
    );
    
    IF table_has_column('devoluciones_proveedor', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_devoluciones_proveedor_tenant_created',
        'devoluciones_proveedor',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  RAISE NOTICE '✓ Índices de Compras creados';
END $$;

-- =====================================================
-- 4. MÓDULO FINANZAS (Verificar índices existentes)
-- =====================================================
-- Nota: Ya hay índices en algunas tablas de finanzas (migración 031)
-- Solo agregamos los que falten

DO $$
BEGIN
  RAISE NOTICE '=== CREANDO ÍNDICES ADICIONALES PARA MÓDULO FINANZAS ===';
  
  -- cuentas_por_cobrar
  IF table_has_column('cuentas_por_cobrar', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_cuentas_por_cobrar_created_at',
      'cuentas_por_cobrar',
      'created_at DESC'
    );
    
    IF table_has_column('cuentas_por_cobrar', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_cuentas_por_cobrar_tenant_created',
        'cuentas_por_cobrar',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- cuentas_por_pagar
  IF table_has_column('cuentas_por_pagar', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_cuentas_por_pagar_created_at',
      'cuentas_por_pagar',
      'created_at DESC'
    );
    
    IF table_has_column('cuentas_por_pagar', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_cuentas_por_pagar_tenant_created',
        'cuentas_por_pagar',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- cobranzas
  IF table_has_column('cobranzas', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_cobranzas_created_at',
      'cobranzas',
      'created_at DESC'
    );
    
    IF table_has_column('cobranzas', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_cobranzas_tenant_created',
        'cobranzas',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- gestiones_cobranza
  IF table_has_column('gestiones_cobranza', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_gestiones_cobranza_created_at',
      'gestiones_cobranza',
      'created_at DESC'
    );
    
    IF table_has_column('gestiones_cobranza', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_gestiones_cobranza_tenant_created',
        'gestiones_cobranza',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- egresos
  IF table_has_column('egresos', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_egresos_created_at',
      'egresos',
      'created_at DESC'
    );
    
    IF table_has_column('egresos', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_egresos_tenant_created',
        'egresos',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- gastos
  IF table_has_column('gastos', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_gastos_created_at',
      'gastos',
      'created_at DESC'
    );
    
    IF table_has_column('gastos', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_gastos_tenant_created',
        'gastos',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- pagos_empleados
  IF table_has_column('pagos_empleados', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_pagos_empleados_created_at',
      'pagos_empleados',
      'created_at DESC'
    );
    
    IF table_has_column('pagos_empleados', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_pagos_empleados_tenant_created',
        'pagos_empleados',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- pagos_facturas
  IF table_has_column('pagos_facturas', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_pagos_facturas_created_at',
      'pagos_facturas',
      'created_at DESC'
    );
    
    IF table_has_column('pagos_facturas', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_pagos_facturas_tenant_created',
        'pagos_facturas',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- movimientos_bancarios (ya tiene algunos índices, agregamos created_at si falta)
  IF table_has_column('movimientos_bancarios', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_movimientos_bancarios_created_at',
      'movimientos_bancarios',
      'created_at DESC'
    );
    
    IF table_has_column('movimientos_bancarios', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_movimientos_bancarios_tenant_created',
        'movimientos_bancarios',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  RAISE NOTICE '✓ Índices adicionales de Finanzas creados';
END $$;

-- =====================================================
-- 5. MÓDULO INVENTARIO
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== CREANDO ÍNDICES PARA MÓDULO INVENTARIO ===';
  
  -- productos
  IF table_has_column('productos', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_productos_tenant_id',
      'productos',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('productos', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_productos_created_at',
      'productos',
      'created_at DESC'
    );
    
    IF table_has_column('productos', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_productos_tenant_created',
        'productos',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- stock_movimientos
  IF table_has_column('stock_movimientos', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_stock_movimientos_tenant_id',
      'stock_movimientos',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('stock_movimientos', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_stock_movimientos_created_at',
      'stock_movimientos',
      'created_at DESC'
    );
    
    IF table_has_column('stock_movimientos', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_stock_movimientos_tenant_created',
        'stock_movimientos',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- inventarios_permanentes
  IF table_has_column('inventarios_permanentes', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_inventarios_permanentes_tenant_id',
      'inventarios_permanentes',
      'tenant_id'
    );
  END IF;
  
  -- almacenes
  IF table_has_column('almacenes', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_almacenes_tenant_id',
      'almacenes',
      'tenant_id'
    );
  END IF;
  
  RAISE NOTICE '✓ Índices de Inventario creados';
END $$;

-- =====================================================
-- 6. MÓDULO RRHH
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== CREANDO ÍNDICES PARA MÓDULO RRHH ===';
  
  -- empleados
  IF table_has_column('empleados', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_empleados_tenant_id',
      'empleados',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('empleados', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_empleados_created_at',
      'empleados',
      'created_at DESC'
    );
    
    IF table_has_column('empleados', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_empleados_tenant_created',
        'empleados',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- planillas
  IF table_has_column('planillas', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_planillas_created_at',
      'planillas',
      'created_at DESC'
    );
    
    IF table_has_column('planillas', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_planillas_tenant_created',
        'planillas',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- liquidaciones
  IF table_has_column('liquidaciones', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_liquidaciones_created_at',
      'liquidaciones',
      'created_at DESC'
    );
    
    IF table_has_column('liquidaciones', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_liquidaciones_tenant_created',
        'liquidaciones',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- asistencia
  IF table_has_column('asistencia', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_asistencia_tenant_id',
      'asistencia',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('asistencia', 'fecha') THEN
    PERFORM create_index_if_not_exists(
      'idx_asistencia_fecha',
      'asistencia',
      'fecha DESC'
    );
    
    IF table_has_column('asistencia', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_asistencia_tenant_fecha',
        'asistencia',
        'tenant_id, fecha DESC'
      );
    END IF;
  END IF;
  
  -- contratos
  IF table_has_column('contratos', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_contratos_tenant_id',
      'contratos',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('contratos', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_contratos_created_at',
      'contratos',
      'created_at DESC'
    );
    
    IF table_has_column('contratos', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_contratos_tenant_created',
        'contratos',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  RAISE NOTICE '✓ Índices de RRHH creados';
END $$;

-- =====================================================
-- 7. MÓDULO FISCAL / SUNAT
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== CREANDO ÍNDICES PARA MÓDULO FISCAL ===';
  
  -- cpe
  IF table_has_column('cpe', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_cpe_tenant_id',
      'cpe',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('cpe', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_cpe_created_at',
      'cpe',
      'created_at DESC'
    );
    
    IF table_has_column('cpe', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_cpe_tenant_created',
        'cpe',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- gre
  IF table_has_column('gre', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_gre_tenant_id',
      'gre',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('gre', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_gre_created_at',
      'gre',
      'created_at DESC'
    );
    
    IF table_has_column('gre', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_gre_tenant_created',
        'gre',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- gre_guias
  IF table_has_column('gre_guias', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_gre_guias_tenant_id',
      'gre_guias',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('gre_guias', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_gre_guias_created_at',
      'gre_guias',
      'created_at DESC'
    );
    
    IF table_has_column('gre_guias', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_gre_guias_tenant_created',
        'gre_guias',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- documentos
  IF table_has_column('documentos', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_documentos_tenant_id',
      'documentos',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('documentos', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_documentos_created_at',
      'documentos',
      'created_at DESC'
    );
    
    IF table_has_column('documentos', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_documentos_tenant_created',
        'documentos',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- sire_files
  IF table_has_column('sire_files', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_sire_files_tenant_id',
      'sire_files',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('sire_files', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_sire_files_created_at',
      'sire_files',
      'created_at DESC'
    );
    
    IF table_has_column('sire_files', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_sire_files_tenant_created',
        'sire_files',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  RAISE NOTICE '✓ Índices de Fiscal creados';
END $$;

-- =====================================================
-- 8. MÓDULO AUDITORÍA Y LOGS
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== CREANDO ÍNDICES PARA MÓDULO AUDITORÍA ===';
  
  -- audit_log (usa 'timestamp' como columna de fecha)
  IF table_has_column('audit_log', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_audit_log_tenant_id',
      'audit_log',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('audit_log', 'timestamp') THEN
    -- Índice simple en timestamp (si no existe)
    PERFORM create_index_if_not_exists(
      'idx_audit_log_timestamp',
      'audit_log',
      'timestamp DESC'
    );
    
    -- Índice compuesto tenant_id + timestamp (crítico para queries con RLS)
    IF table_has_column('audit_log', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_audit_log_tenant_timestamp',
        'audit_log',
        'tenant_id, timestamp DESC'
      );
    END IF;
  END IF;
  
  -- audit_log_archive (tabla de archivo para logs antiguos)
  IF table_has_column('audit_log_archive', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_audit_log_archive_tenant_id',
      'audit_log_archive',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('audit_log_archive', 'timestamp') THEN
    -- Índice simple en timestamp
    PERFORM create_index_if_not_exists(
      'idx_audit_log_archive_timestamp',
      'audit_log_archive',
      'timestamp DESC'
    );
    
    -- Índice compuesto tenant_id + timestamp (ya existe en migración 063, pero verificamos)
    IF table_has_column('audit_log_archive', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_audit_log_archive_tenant_timestamp',
        'audit_log_archive',
        'tenant_id, timestamp DESC'
      );
    END IF;
  END IF;
  
  IF table_has_column('audit_log_archive', 'archived_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_audit_log_archive_archived_at',
      'audit_log_archive',
      'archived_at DESC'
    );
  END IF;
  
  -- integration_logs (usa 'timestamp' como columna de fecha)
  IF table_has_column('integration_logs', 'tenant_id') THEN
    -- Verificar si ya existe (se crea en migración 008)
    PERFORM create_index_if_not_exists(
      'idx_integration_logs_tenant',
      'integration_logs',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('integration_logs', 'timestamp') THEN
    -- Índice simple en timestamp (ya existe en migración 008, pero verificamos)
    PERFORM create_index_if_not_exists(
      'idx_integration_logs_timestamp',
      'integration_logs',
      'timestamp DESC'
    );
    
    -- Índice compuesto tenant_id + timestamp (ya existe parcialmente en migración 008 con servicio)
    -- Crear uno adicional sin servicio para queries más generales
    IF table_has_column('integration_logs', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_integration_logs_tenant_timestamp',
        'integration_logs',
        'tenant_id, timestamp DESC'
      );
    END IF;
  END IF;
  
  -- rls_audit_log (no tiene tenant_id directo, usa attempted_tenant_id y actual_tenant_id)
  IF table_has_column('rls_audit_log', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_rls_audit_log_created_at',
      'rls_audit_log',
      'created_at DESC'
    );
  END IF;
  
  IF table_has_column('rls_audit_log', 'timestamp') THEN
    -- Índice simple en timestamp (ya existe en migración 033, pero verificamos)
    PERFORM create_index_if_not_exists(
      'idx_rls_audit_log_timestamp',
      'rls_audit_log',
      'timestamp DESC'
    );
    
    -- Índice compuesto con attempted_tenant_id para queries por tenant intentado
    IF table_has_column('rls_audit_log', 'attempted_tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_rls_audit_log_attempted_tenant_timestamp',
        'rls_audit_log',
        'attempted_tenant_id, timestamp DESC'
      );
    END IF;
    
    -- Índice compuesto con actual_tenant_id para queries por tenant real
    IF table_has_column('rls_audit_log', 'actual_tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_rls_audit_log_actual_tenant_timestamp',
        'rls_audit_log',
        'actual_tenant_id, timestamp DESC'
      );
    END IF;
  END IF;
  
  -- auditoria (tabla general de auditoría)
  IF table_has_column('auditoria', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_auditoria_tenant_id',
      'auditoria',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('auditoria', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_auditoria_created_at',
      'auditoria',
      'created_at DESC'
    );
    
    IF table_has_column('auditoria', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_auditoria_tenant_created',
        'auditoria',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- event_processing_log
  IF table_has_column('event_processing_log', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_event_processing_log_tenant_id',
      'event_processing_log',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('event_processing_log', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_event_processing_log_created_at',
      'event_processing_log',
      'created_at DESC'
    );
    
    IF table_has_column('event_processing_log', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_event_processing_log_tenant_created',
        'event_processing_log',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  RAISE NOTICE '✓ Índices de Auditoría creados';
END $$;

-- =====================================================
-- 9. TABLAS ADICIONALES IMPORTANTES
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== CREANDO ÍNDICES PARA TABLAS ADICIONALES ===';
  
  -- clientes
  IF table_has_column('clientes', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_clientes_tenant_id',
      'clientes',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('clientes', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_clientes_created_at',
      'clientes',
      'created_at DESC'
    );
    
    IF table_has_column('clientes', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_clientes_tenant_created',
        'clientes',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- proveedores
  IF table_has_column('proveedores', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_proveedores_tenant_id',
      'proveedores',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('proveedores', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_proveedores_created_at',
      'proveedores',
      'created_at DESC'
    );
    
    IF table_has_column('proveedores', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_proveedores_tenant_created',
        'proveedores',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- pagos_lote
  IF table_has_column('pagos_lote', 'created_at') THEN
    IF table_has_column('pagos_lote', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_pagos_lote_tenant_created',
        'pagos_lote',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- rls_alert_history
  IF table_has_column('rls_alert_history', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_rls_alert_history_tenant_id',
      'rls_alert_history',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('rls_alert_history', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_rls_alert_history_created_at',
      'rls_alert_history',
      'created_at DESC'
    );
    
    IF table_has_column('rls_alert_history', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_rls_alert_history_tenant_created',
        'rls_alert_history',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  -- notificaciones
  IF table_has_column('notificaciones', 'tenant_id') THEN
    PERFORM create_index_if_not_exists(
      'idx_notificaciones_tenant_id',
      'notificaciones',
      'tenant_id'
    );
  END IF;
  
  IF table_has_column('notificaciones', 'created_at') THEN
    PERFORM create_index_if_not_exists(
      'idx_notificaciones_created_at',
      'notificaciones',
      'created_at DESC'
    );
    
    IF table_has_column('notificaciones', 'tenant_id') THEN
      PERFORM create_index_if_not_exists(
        'idx_notificaciones_tenant_created',
        'notificaciones',
        'tenant_id, created_at DESC'
      );
    END IF;
  END IF;
  
  RAISE NOTICE '✓ Índices de tablas adicionales creados';
END $$;

-- =====================================================
-- 10. CREAR VISTA DE RESUMEN DE ÍNDICES CREADOS
-- =====================================================

CREATE OR REPLACE VIEW v_indices_tenant_created_summary AS
SELECT 
  i.tablename AS tabla,
  i.indexname AS indice,
  i.indexdef AS definicion,
  pg_size_pretty(pg_relation_size(i.indexname::regclass)) AS tamaño_indice,
  pg_size_pretty(pg_total_relation_size(i.tablename::regclass)) AS tamaño_tabla,
  CASE 
    WHEN i.indexname LIKE '%tenant_id%' AND (i.indexname LIKE '%created_at%' OR i.indexname LIKE '%timestamp%') THEN 'Compuesto (tenant_id, fecha)'
    WHEN i.indexname LIKE '%attempted_tenant_id%' AND (i.indexname LIKE '%created_at%' OR i.indexname LIKE '%timestamp%') THEN 'Compuesto (attempted_tenant_id, fecha)'
    WHEN i.indexname LIKE '%actual_tenant_id%' AND (i.indexname LIKE '%created_at%' OR i.indexname LIKE '%timestamp%') THEN 'Compuesto (actual_tenant_id, fecha)'
    WHEN i.indexname LIKE '%tenant_id%' THEN 'tenant_id'
    WHEN i.indexname LIKE '%created_at%' OR i.indexname LIKE '%timestamp%' THEN 'created_at/timestamp'
    ELSE 'Otro'
  END AS tipo_indice
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND (
    i.indexname LIKE '%tenant_id%' 
    OR i.indexname LIKE '%created_at%'
    OR i.indexname LIKE '%timestamp%'
    OR i.indexname LIKE '%attempted_tenant%'
    OR i.indexname LIKE '%actual_tenant%'
  )
ORDER BY i.tablename, i.indexname;

COMMENT ON VIEW v_indices_tenant_created_summary IS 
  'Resumen de índices creados en tenant_id y created_at/timestamp para optimización de queries';

-- =====================================================
-- VALIDACIÓN FINAL
-- =====================================================

DO $$
DECLARE
  v_total_indices integer;
BEGIN
  SELECT COUNT(*) INTO v_total_indices
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND (
      indexname LIKE '%tenant_id%' 
      OR indexname LIKE '%created_at%'
      OR indexname LIKE '%timestamp%'
      OR indexname LIKE '%attempted_tenant%'
      OR indexname LIKE '%actual_tenant%'
    );
  
  RAISE NOTICE '=== VALIDACIÓN COMPLETADA ===';
  RAISE NOTICE 'Total de índices en tenant_id/created_at: %', v_total_indices;
  RAISE NOTICE 'Ver resumen: SELECT * FROM v_indices_tenant_created_summary;';
END $$;

COMMIT;

-- =====================================================
-- NOTAS POST-MIGRACIÓN
-- =====================================================

/*
  VERIFICACIÓN:
  =============
  
  1. Ver todos los índices creados:
     SELECT * FROM v_indices_tenant_created_summary ORDER BY tabla, tipo_indice;
  
  2. Verificar índices por tabla específica:
     SELECT * FROM pg_indexes 
     WHERE tablename = 'nombre_tabla' 
     AND schemaname = 'public';
  
  3. Verificar que las queries usan los índices:
     -- NOTA: Estos son EJEMPLOS. Reemplazar 'nombre_tabla' y el UUID con valores reales.
     -- Ejemplo con UUID válido:
     -- EXPLAIN ANALYZE SELECT * FROM ventas WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::UUID;
     -- EXPLAIN ANALYZE SELECT * FROM ventas WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::UUID ORDER BY created_at DESC;
  
  IMPACTO ESPERADO:
  ================
  
  - Mejora significativa en queries con RLS (filtran por tenant_id)
  - Mejora en queries de reportes que filtran por fecha
  - Reducción de table scans completos
  - Mejora en performance de dashboards
  
  MANTENIMIENTO:
  ==============
  
  - PostgreSQL mantiene índices automáticamente
  - Ejecutar ANALYZE periódicamente:
    ANALYZE nombre_tabla;
  
  - Monitorear uso de índices:
    SELECT * FROM pg_stat_user_indexes 
    WHERE schemaname = 'public' 
    ORDER BY idx_scan DESC;
  
  ROLLBACK:
  =========
  
  Si es necesario eliminar índices específicos:
  
  DROP INDEX IF EXISTS idx_nombre_tabla_tenant_id;
  DROP INDEX IF EXISTS idx_nombre_tabla_created_at;
  DROP INDEX IF EXISTS idx_nombre_tabla_tenant_created;
  
  REFERENCIAS:
  ============
  
  - PostgreSQL Index Documentation: https://www.postgresql.org/docs/current/indexes.html
  - RLS Performance: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
  - Index Monitoring: https://www.postgresql.org/docs/current/monitoring-stats.html
*/

