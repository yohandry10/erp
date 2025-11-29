  -- =====================================================
  -- MIGRACIÓN 129: Constraints de Stock No Negativo
  -- =====================================================
  -- Q51: Agregar CHECK constraints para prevenir stock negativo
  -- Esto garantiza integridad a nivel de BD, no solo en código
  -- =====================================================

  -- 1. Agregar CHECK constraint a productos.stock (si existe el campo)
  DO $$
  BEGIN
    -- Verificar si existe el campo stock en productos
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'productos' AND column_name = 'stock'
    ) THEN
      -- Verificar si ya existe el constraint
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'productos' AND constraint_name = 'chk_productos_stock_no_negativo'
      ) THEN
        -- Primero corregir valores negativos existentes (si los hay)
        UPDATE productos SET stock = 0 WHERE stock < 0;
        
        ALTER TABLE productos 
          ADD CONSTRAINT chk_productos_stock_no_negativo 
          CHECK (stock >= 0);
        
        RAISE NOTICE '✅ Constraint chk_productos_stock_no_negativo agregado a productos.stock';
      ELSE
        RAISE NOTICE 'ℹ️ Constraint chk_productos_stock_no_negativo ya existe';
      END IF;
    END IF;
    
    -- Verificar si existe el campo stock_actual en productos
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'productos' AND column_name = 'stock_actual'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'productos' AND constraint_name = 'chk_productos_stock_actual_no_negativo'
      ) THEN
        UPDATE productos SET stock_actual = 0 WHERE stock_actual < 0;
        
        ALTER TABLE productos 
          ADD CONSTRAINT chk_productos_stock_actual_no_negativo 
          CHECK (stock_actual >= 0);
        
        RAISE NOTICE '✅ Constraint chk_productos_stock_actual_no_negativo agregado';
      END IF;
    END IF;
  END $$;

  -- 2. Agregar CHECK constraint a producto_existencias
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'producto_existencias'
    ) THEN
      -- stock_actual no negativo
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'producto_existencias' AND constraint_name = 'chk_existencias_stock_no_negativo'
      ) THEN
        UPDATE producto_existencias SET stock_actual = 0 WHERE stock_actual < 0;
        
        ALTER TABLE producto_existencias 
          ADD CONSTRAINT chk_existencias_stock_no_negativo 
          CHECK (stock_actual >= 0);
        
        RAISE NOTICE '✅ Constraint chk_existencias_stock_no_negativo agregado a producto_existencias';
      END IF;
      
      -- stock_reservado no negativo
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'producto_existencias' AND constraint_name = 'chk_existencias_reservado_no_negativo'
      ) THEN
        UPDATE producto_existencias SET stock_reservado = 0 WHERE stock_reservado < 0;
        
        ALTER TABLE producto_existencias 
          ADD CONSTRAINT chk_existencias_reservado_no_negativo 
          CHECK (stock_reservado >= 0);
        
        RAISE NOTICE '✅ Constraint chk_existencias_reservado_no_negativo agregado';
      END IF;
    END IF;
  END $$;

  -- 3. Agregar CHECK constraint a lotes_productos (de migración 128)
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'lotes_productos'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'lotes_productos' AND constraint_name = 'chk_lotes_cantidad_inicial_no_negativa'
      ) THEN
        ALTER TABLE lotes_productos 
          ADD CONSTRAINT chk_lotes_cantidad_inicial_no_negativa 
          CHECK (cantidad_inicial >= 0);
        
        RAISE NOTICE '✅ Constraint de cantidad_inicial agregado a lotes_productos';
      END IF;
    END IF;
  END $$;

  -- 4. Crear función de validación para operaciones de stock
  CREATE OR REPLACE FUNCTION validar_stock_suficiente(
    p_producto_id UUID,
    p_cantidad NUMERIC,
    p_almacen_id UUID DEFAULT NULL
  )
  RETURNS TABLE (
    es_valido BOOLEAN,
    stock_disponible NUMERIC,
    mensaje TEXT
  ) AS $$
  DECLARE
    v_stock NUMERIC;
    v_reservado NUMERIC;
    v_disponible NUMERIC;
  BEGIN
    IF p_almacen_id IS NOT NULL THEN
      -- Verificar en almacén específico
      SELECT 
        COALESCE(pe.stock_actual, 0),
        COALESCE(pe.stock_reservado, 0)
      INTO v_stock, v_reservado
      FROM producto_existencias pe
      WHERE pe.producto_id = p_producto_id
        AND pe.almacen_id = p_almacen_id;
    ELSE
      -- Verificar stock total del producto
      SELECT 
        COALESCE(p.stock, COALESCE(p.stock_actual, 0)),
        COALESCE(p.stock_reservado, 0)
      INTO v_stock, v_reservado
      FROM productos p
      WHERE p.id = p_producto_id;
    END IF;
    
    v_disponible := COALESCE(v_stock, 0) - COALESCE(v_reservado, 0);
    
    es_valido := v_disponible >= p_cantidad;
    stock_disponible := v_disponible;
    
    IF es_valido THEN
      mensaje := format('Stock suficiente. Disponible: %s, Solicitado: %s', v_disponible, p_cantidad);
    ELSE
      mensaje := format('Stock insuficiente. Disponible: %s, Solicitado: %s, Faltante: %s', 
        v_disponible, p_cantidad, p_cantidad - v_disponible);
    END IF;
    
    RETURN NEXT;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  COMMENT ON FUNCTION validar_stock_suficiente IS 'Valida si hay stock suficiente para una operación. Retorna disponibilidad y mensaje descriptivo.';

  -- 5. Crear trigger para prevenir stock negativo en actualizaciones
  CREATE OR REPLACE FUNCTION trigger_prevenir_stock_negativo()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Verificar stock principal
    IF TG_TABLE_NAME = 'productos' THEN
      IF NEW.stock IS NOT NULL AND NEW.stock < 0 THEN
        RAISE EXCEPTION 'No se permite stock negativo. Producto: %, Stock intentado: %', 
          NEW.id, NEW.stock;
      END IF;
      IF NEW.stock_actual IS NOT NULL AND NEW.stock_actual < 0 THEN
        RAISE EXCEPTION 'No se permite stock_actual negativo. Producto: %, Stock intentado: %', 
          NEW.id, NEW.stock_actual;
      END IF;
    END IF;
    
    -- Verificar existencias por almacén
    IF TG_TABLE_NAME = 'producto_existencias' THEN
      IF NEW.stock_actual IS NOT NULL AND NEW.stock_actual < 0 THEN
        RAISE EXCEPTION 'No se permite stock negativo en almacén. Producto: %, Almacén: %, Stock intentado: %', 
          NEW.producto_id, NEW.almacen_id, NEW.stock_actual;
      END IF;
    END IF;
    
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- Aplicar trigger a productos (si no existe)
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_productos_stock_no_negativo'
    ) THEN
      CREATE TRIGGER trg_productos_stock_no_negativo
        BEFORE INSERT OR UPDATE ON productos
        FOR EACH ROW
        EXECUTE FUNCTION trigger_prevenir_stock_negativo();
      
      RAISE NOTICE '✅ Trigger trg_productos_stock_no_negativo creado';
    END IF;
  END $$;

  -- Aplicar trigger a producto_existencias (si existe la tabla)
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'producto_existencias') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_existencias_stock_no_negativo'
      ) THEN
        CREATE TRIGGER trg_existencias_stock_no_negativo
          BEFORE INSERT OR UPDATE ON producto_existencias
          FOR EACH ROW
          EXECUTE FUNCTION trigger_prevenir_stock_negativo();
        
        RAISE NOTICE '✅ Trigger trg_existencias_stock_no_negativo creado';
      END IF;
    END IF;
  END $$;

  -- 6. Documentación
  COMMENT ON CONSTRAINT chk_stock_reservado_no_negativo ON productos IS 'Previene stock reservado negativo (ya existente de migración 002)';

  DO $$
  BEGIN
    RAISE NOTICE '✅ Migración 129: Constraints de Stock No Negativo completada';
  END $$;
