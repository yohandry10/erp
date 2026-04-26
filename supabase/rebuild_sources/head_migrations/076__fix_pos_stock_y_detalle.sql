-- =============================================
-- Migration 076: Fix POS - Stock y Detalle de Ventas
-- =============================================
-- Corrige problemas críticos detectados en auditoría:
-- 1. Vista vista_pos_productos usa stock_actual (no existe en productos)
-- 2. Tabla detalle_ventas_pos no se está usando (datos en observaciones)
-- 3. RLS deshabilitado en stock_movimientos
-- 4. Falta columna producto_id en detalle_ventas_pos
-- =============================================

-- =============================================
-- PARTE 1: CORREGIR VISTA vista_pos_productos
-- =============================================
-- La vista usa stock_actual pero la columna real es 'stock'

DROP VIEW IF EXISTS vista_pos_productos;

-- Crear vista usando SOLO columnas que existen en productos
-- Columnas confirmadas: id, codigo, codigo_barras, nombre, descripcion, categoria, 
--                       precio_venta, stock, stock_minimo, impuesto, imagen_url, activo
CREATE OR REPLACE VIEW vista_pos_productos AS
SELECT 
  p.id::varchar as id,
  COALESCE(p.codigo, '')::varchar as codigo,
  COALESCE(p.codigo_barras, '')::varchar as codigo_barras,
  COALESCE(p.nombre, '')::varchar as nombre,
  COALESCE(p.descripcion, '')::varchar as descripcion,
  COALESCE(p.categoria, '')::varchar as categoria,
  ''::varchar as subcategoria,  -- No existe en productos
  ''::text as marca,  -- No existe en productos
  COALESCE(p.precio_venta, 0)::numeric as precio_venta,
  0::numeric as precio_mayorista,  -- No existe en productos
  0::numeric as precio_especial,  -- No existe en productos
  COALESCE(p.stock, 0)::integer as stock_actual,  -- ✅ CRÍTICO: usa 'stock' no 'stock_actual'
  COALESCE(p.stock_minimo, 0)::integer as stock_minimo,
  COALESCE(p.impuesto, 0)::numeric as impuesto,
  COALESCE(p.imagen_url, '')::text as imagen_url,
  COALESCE(p.activo, true)::boolean as activo
FROM productos p
WHERE COALESCE(p.activo, true) = true
ORDER BY p.nombre;

COMMENT ON VIEW vista_pos_productos IS 'Vista de productos para POS. IMPORTANTE: usa stock (no stock_actual). Columnas marca, subcategoria, precio_mayorista, precio_especial no existen en productos y se devuelven como valores por defecto.';

-- =============================================
-- PARTE 2: AGREGAR COLUMNA producto_id A detalle_ventas_pos
-- =============================================
-- La tabla tiene codigo_producto y nombre_producto pero no producto_id (FK)

DO $$
BEGIN
  -- Agregar producto_id si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'detalle_ventas_pos' AND column_name = 'producto_id'
  ) THEN
    ALTER TABLE detalle_ventas_pos 
    ADD COLUMN producto_id uuid;
    
    COMMENT ON COLUMN detalle_ventas_pos.producto_id IS 'FK al producto vendido';
  END IF;

  -- Agregar FK a productos
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'detalle_ventas_pos_producto_id_fkey'
  ) THEN
    ALTER TABLE detalle_ventas_pos
    ADD CONSTRAINT detalle_ventas_pos_producto_id_fkey
    FOREIGN KEY (producto_id) REFERENCES productos(id);
  END IF;

  -- Agregar FK a ventas_pos
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'detalle_ventas_pos_venta_id_fkey'
  ) THEN
    ALTER TABLE detalle_ventas_pos
    ADD CONSTRAINT detalle_ventas_pos_venta_id_fkey
    FOREIGN KEY (venta_id) REFERENCES ventas_pos(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =============================================
-- PARTE 3: HABILITAR RLS EN stock_movimientos
-- =============================================
-- CRÍTICO: Esta tabla NO tiene RLS habilitado

-- Habilitar RLS
ALTER TABLE stock_movimientos ENABLE ROW LEVEL SECURITY;

-- Política de aislamiento por tenant
DROP POLICY IF EXISTS stock_movimientos_tenant_isolation ON stock_movimientos;
CREATE POLICY stock_movimientos_tenant_isolation
  ON stock_movimientos
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Política para service_role (bypass RLS)
-- No crear política de superadmin ya que la columna 'rol' no existe en usuarios_sistema
-- El service_role de Supabase ya tiene acceso completo

COMMENT ON TABLE stock_movimientos IS 'Movimientos de stock con RLS habilitado (migración 076)';

-- =============================================
-- PARTE 4: AGREGAR ÍNDICES PARA PERFORMANCE
-- =============================================

-- Índice en detalle_ventas_pos por venta_id
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_pos_venta_id 
  ON detalle_ventas_pos(venta_id);

-- Índice en detalle_ventas_pos por producto_id
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_pos_producto_id 
  ON detalle_ventas_pos(producto_id);

-- Índice en detalle_ventas_pos por tenant_id
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_pos_tenant_id 
  ON detalle_ventas_pos(tenant_id);

-- Índice en stock_movimientos por tenant_id y created_at
CREATE INDEX IF NOT EXISTS idx_stock_movimientos_tenant_created 
  ON stock_movimientos(tenant_id, created_at DESC);

-- Índice en stock_movimientos por producto_id
CREATE INDEX IF NOT EXISTS idx_stock_movimientos_producto_id 
  ON stock_movimientos(producto_id);

-- =============================================
-- PARTE 5: FUNCIÓN PARA MIGRAR DATOS DE observaciones A detalle_ventas_pos
-- =============================================
-- Esta función permite migrar los detalles guardados en observaciones

CREATE OR REPLACE FUNCTION migrar_detalles_ventas_pos_desde_observaciones()
RETURNS TABLE(
  ventas_procesadas integer,
  detalles_creados integer,
  errores text[]
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_venta RECORD;
  v_item JSONB;
  v_ventas_count integer := 0;
  v_detalles_count integer := 0;
  v_errores text[] := ARRAY[]::text[];
BEGIN
  -- Iterar sobre ventas_pos que tienen observaciones con items
  -- NOTA: observaciones es TEXT, no JSONB, por lo que necesitamos convertir
  FOR v_venta IN 
    SELECT 
      id,
      tenant_id,
      observaciones::jsonb as observaciones  -- Convertir text a jsonb
    FROM ventas_pos
    WHERE observaciones IS NOT NULL
      AND observaciones::text LIKE '%items%'
      -- Solo procesar si no tiene detalles ya creados
      AND NOT EXISTS (
        SELECT 1 FROM detalle_ventas_pos 
        WHERE venta_id = ventas_pos.id
      )
  LOOP
    BEGIN
      -- Verificar que observaciones tiene items como array
      IF v_venta.observaciones ? 'items' AND 
         jsonb_typeof(v_venta.observaciones->'items') = 'array' AND
         jsonb_array_length(v_venta.observaciones->'items') > 0 THEN
        
        v_ventas_count := v_ventas_count + 1;
        
        -- Iterar sobre cada item en el array de items
        FOR v_item IN 
          SELECT * FROM jsonb_array_elements(v_venta.observaciones->'items')
        LOOP
        BEGIN
          -- Insertar detalle
          INSERT INTO detalle_ventas_pos (
            venta_id,
            tenant_id,
            producto_id,
            codigo_producto,
            nombre_producto,
            cantidad,
            precio_unitario,
            descuento,
            total_parcial,
            created_at
          )
          VALUES (
            v_venta.id,
            v_venta.tenant_id,
            (v_item->>'producto_id')::uuid,
            v_item->>'codigo',
            v_item->>'nombre',
            (v_item->>'cantidad')::numeric,
            (v_item->>'precio_unitario')::numeric,
            COALESCE((v_item->>'descuento')::numeric, 0),
            (v_item->>'total')::numeric,
            NOW()
          );
          
          v_detalles_count := v_detalles_count + 1;
          
          EXCEPTION WHEN OTHERS THEN
            v_errores := array_append(v_errores, 
              format('Error en item de venta %s: %s', v_venta.id, SQLERRM)
            );
          END;
        END LOOP;
      END IF;  -- Fin del IF que verifica items
      
    EXCEPTION WHEN OTHERS THEN
      v_errores := array_append(v_errores, 
        format('Error procesando venta %s: %s', v_venta.id, SQLERRM)
      );
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_ventas_count, v_detalles_count, v_errores;
END;
$$;

COMMENT ON FUNCTION migrar_detalles_ventas_pos_desde_observaciones() IS 
  'Migra detalles de ventas desde el campo observaciones a la tabla detalle_ventas_pos';

-- =============================================
-- PARTE 6: TRIGGER PARA VALIDAR STOCK ANTES DE VENTA
-- =============================================
-- Trigger que valida que haya stock disponible antes de crear detalle

CREATE OR REPLACE FUNCTION validar_stock_antes_detalle_venta()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_stock_actual integer;
  v_stock_reservado integer;
  v_stock_disponible integer;
  v_producto_nombre text;
BEGIN
  -- Obtener stock actual del producto
  SELECT 
    stock,
    stock_reservado,
    nombre
  INTO 
    v_stock_actual,
    v_stock_reservado,
    v_producto_nombre
  FROM productos
  WHERE id = NEW.producto_id
    AND tenant_id = NEW.tenant_id;
  
  -- Si no existe el producto, permitir (se manejará en otro lado)
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  
  -- Calcular stock disponible
  v_stock_disponible := COALESCE(v_stock_actual, 0) - COALESCE(v_stock_reservado, 0);
  
  -- Validar que haya stock suficiente
  IF v_stock_disponible < NEW.cantidad THEN
    RAISE WARNING 'Stock insuficiente para producto % (%): disponible %, solicitado %',
      v_producto_nombre,
      NEW.producto_id,
      v_stock_disponible,
      NEW.cantidad;
    -- No bloqueamos la venta, solo advertimos
    -- En producción podrías cambiar esto a RAISE EXCEPTION
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear trigger
DROP TRIGGER IF EXISTS trigger_validar_stock_detalle_venta ON detalle_ventas_pos;
CREATE TRIGGER trigger_validar_stock_detalle_venta
  BEFORE INSERT ON detalle_ventas_pos
  FOR EACH ROW
  EXECUTE FUNCTION validar_stock_antes_detalle_venta();

COMMENT ON FUNCTION validar_stock_antes_detalle_venta() IS 
  'Valida que haya stock disponible antes de crear un detalle de venta POS';

-- =============================================
-- PARTE 7: VISTA PARA AUDITORÍA DE VENTAS POS
-- =============================================
-- Vista que muestra ventas con sus detalles

CREATE OR REPLACE VIEW vw_ventas_pos_completas AS
SELECT 
  vp.id as venta_id,
  vp.tenant_id,
  vp.numero_venta,
  vp.numero_ticket,
  vp.fecha,
  vp.cliente_nombre,
  vp.cliente_documento,
  vp.subtotal,
  vp.impuestos,
  vp.descuentos,
  vp.total,
  vp.metodo_pago,
  vp.estado,
  vp.vendedor,
  vp.cpe_pendiente,
  vp.intentos_facturacion,
  vp.created_at,
  -- Detalles agregados
  COUNT(dvp.id) as num_items,
  COALESCE(SUM(dvp.cantidad), 0) as total_unidades,
  -- Indicador de si tiene detalles en tabla o en observaciones
  CASE 
    WHEN COUNT(dvp.id) > 0 THEN 'TABLA'
    WHEN vp.observaciones IS NOT NULL AND vp.observaciones::text LIKE '%items%' THEN 'OBSERVACIONES'
    ELSE 'SIN_DETALLES'
  END as ubicacion_detalles
FROM ventas_pos vp
LEFT JOIN detalle_ventas_pos dvp ON dvp.venta_id = vp.id
GROUP BY 
  vp.id,
  vp.tenant_id,
  vp.numero_venta,
  vp.numero_ticket,
  vp.fecha,
  vp.cliente_nombre,
  vp.cliente_documento,
  vp.subtotal,
  vp.impuestos,
  vp.descuentos,
  vp.total,
  vp.metodo_pago,
  vp.estado,
  vp.vendedor,
  vp.cpe_pendiente,
  vp.intentos_facturacion,
  vp.observaciones,
  vp.created_at;

COMMENT ON VIEW vw_ventas_pos_completas IS 
  'Vista de ventas POS con información de detalles (en tabla o en observaciones)';

-- =============================================
-- PARTE 8: FUNCIÓN DE DIAGNÓSTICO POS
-- =============================================

CREATE OR REPLACE FUNCTION diagnostico_pos(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(
  metrica text,
  valor text,
  estado text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_filter text;
BEGIN
  -- Preparar filtro de tenant
  v_tenant_filter := CASE 
    WHEN p_tenant_id IS NOT NULL THEN format('WHERE tenant_id = %L', p_tenant_id)
    ELSE ''
  END;

  -- Total de productos
  RETURN QUERY
  EXECUTE format('
    SELECT 
      ''Total Productos''::text,
      COUNT(*)::text,
      CASE WHEN COUNT(*) > 0 THEN ''✅ OK'' ELSE ''❌ VACÍO'' END
    FROM productos %s
  ', v_tenant_filter);

  -- Productos con stock
  RETURN QUERY
  EXECUTE format('
    SELECT 
      ''Productos con Stock''::text,
      COUNT(*)::text,
      CASE WHEN COUNT(*) > 0 THEN ''✅ OK'' ELSE ''⚠️ SIN STOCK'' END
    FROM productos 
    %s %s stock > 0
  ', 
    v_tenant_filter,
    CASE WHEN p_tenant_id IS NOT NULL THEN 'AND' ELSE 'WHERE' END
  );

  -- Total ventas POS
  RETURN QUERY
  EXECUTE format('
    SELECT 
      ''Total Ventas POS''::text,
      COUNT(*)::text,
      CASE WHEN COUNT(*) > 0 THEN ''✅ OK'' ELSE ''❌ VACÍO'' END
    FROM ventas_pos %s
  ', v_tenant_filter);

  -- Ventas con detalles en tabla
  RETURN QUERY
  EXECUTE format('
    SELECT 
      ''Ventas con Detalles en Tabla''::text,
      COUNT(DISTINCT venta_id)::text,
      CASE 
        WHEN COUNT(DISTINCT venta_id) > 0 THEN ''✅ OK''
        ELSE ''⚠️ USAR OBSERVACIONES''
      END
    FROM detalle_ventas_pos %s
  ', v_tenant_filter);

  -- Ventas con detalles en observaciones
  RETURN QUERY
  EXECUTE format('
    SELECT 
      ''Ventas con Detalles en Observaciones''::text,
      COUNT(*)::text,
      CASE 
        WHEN COUNT(*) > 0 THEN ''⚠️ MIGRAR A TABLA''
        ELSE ''✅ OK''
      END
    FROM ventas_pos 
    %s %s observaciones IS NOT NULL AND observaciones::text LIKE ''%%items%%''
  ',
    v_tenant_filter,
    CASE WHEN p_tenant_id IS NOT NULL THEN 'AND' ELSE 'WHERE' END
  );

  -- Movimientos de inventario
  RETURN QUERY
  EXECUTE format('
    SELECT 
      ''Movimientos Inventario''::text,
      COUNT(*)::text,
      CASE WHEN COUNT(*) > 0 THEN ''✅ OK'' ELSE ''❌ VACÍO'' END
    FROM movimientos_inventario %s
  ', v_tenant_filter);

  -- Stock movimientos
  RETURN QUERY
  EXECUTE format('
    SELECT 
      ''Stock Movimientos''::text,
      COUNT(*)::text,
      CASE WHEN COUNT(*) > 0 THEN ''✅ OK'' ELSE ''❌ VACÍO'' END
    FROM stock_movimientos %s
  ', v_tenant_filter);

  -- RLS en stock_movimientos
  RETURN QUERY
  SELECT 
    'RLS stock_movimientos'::text,
    CASE WHEN rowsecurity THEN 'HABILITADO' ELSE 'DESHABILITADO' END::text,
    CASE WHEN rowsecurity THEN '✅ OK' ELSE '❌ CRÍTICO' END::text
  FROM pg_tables
  WHERE tablename = 'stock_movimientos';

  -- Vista vista_pos_productos
  RETURN QUERY
  SELECT 
    'Vista vista_pos_productos'::text,
    CASE WHEN COUNT(*) > 0 THEN 'EXISTE' ELSE 'NO EXISTE' END::text,
    CASE WHEN COUNT(*) > 0 THEN '✅ OK' ELSE '❌ ERROR' END::text
  FROM pg_views
  WHERE viewname = 'vista_pos_productos';

END;
$$;

COMMENT ON FUNCTION diagnostico_pos(uuid) IS 
  'Diagnóstico completo del módulo POS - muestra estado de tablas, vistas y configuración';

-- =============================================
-- PARTE 9: EJECUTAR MIGRACIÓN DE DATOS (OPCIONAL)
-- =============================================
-- Descomentar para migrar automáticamente los datos existentes

-- SELECT * FROM migrar_detalles_ventas_pos_desde_observaciones();

-- =============================================
-- VERIFICACIÓN FINAL
-- =============================================

-- Mostrar diagnóstico
SELECT * FROM diagnostico_pos();

-- Mostrar resumen de cambios
DO $$
BEGIN
  RAISE NOTICE '✅ Migración 076 completada:';
  RAISE NOTICE '  1. Vista vista_pos_productos corregida (stock en lugar de stock_actual)';
  RAISE NOTICE '  2. Columna producto_id agregada a detalle_ventas_pos';
  RAISE NOTICE '  3. RLS habilitado en stock_movimientos';
  RAISE NOTICE '  4. Índices de performance creados';
  RAISE NOTICE '  5. Función de migración de datos disponible';
  RAISE NOTICE '  6. Trigger de validación de stock creado';
  RAISE NOTICE '  7. Vista de auditoría vw_ventas_pos_completas creada';
  RAISE NOTICE '  8. Función de diagnóstico disponible';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Para migrar datos existentes ejecutar:';
  RAISE NOTICE '   SELECT * FROM migrar_detalles_ventas_pos_desde_observaciones();';
END $$;
