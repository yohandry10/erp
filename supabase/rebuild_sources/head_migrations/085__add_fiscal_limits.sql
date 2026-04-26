-- =============================================
-- Migration 085: Agregar límites fiscales por país
-- =============================================
-- Agrega campos para límites de documentos específicos por país
-- Permite validaciones dinámicas (SUNAT vs DIAN)
-- =============================================

DO $$
BEGIN
  -- Campo: max_items_por_documento
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='configuracion_fiscal' AND column_name='max_items_por_documento'
  ) THEN
    ALTER TABLE configuracion_fiscal 
    ADD COLUMN max_items_por_documento INTEGER DEFAULT 999;
    
    RAISE NOTICE 'Campo max_items_por_documento agregado';
  END IF;
  
  -- Campo: monto_maximo_documento
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='configuracion_fiscal' AND column_name='monto_maximo_documento'
  ) THEN
    ALTER TABLE configuracion_fiscal 
    ADD COLUMN monto_maximo_documento NUMERIC(15,2) DEFAULT 999999999.99;
    
    RAISE NOTICE 'Campo monto_maximo_documento agregado';
  END IF;
END $$;

-- Comentarios explicativos
COMMENT ON COLUMN configuracion_fiscal.max_items_por_documento IS 'Máximo de items permitidos por documento (999 SUNAT, 1000 DIAN)';
COMMENT ON COLUMN configuracion_fiscal.monto_maximo_documento IS 'Monto máximo permitido por documento según autoridad fiscal';

-- Crear o actualizar registros por país
DO $$
DECLARE
  v_pais_pe integer;
  v_pais_co integer;
  v_exists_pe boolean;
  v_exists_co boolean;
BEGIN
  -- Obtener IDs de países
  SELECT id INTO v_pais_pe FROM paises WHERE codigo_iso = 'PE';
  SELECT id INTO v_pais_co FROM paises WHERE codigo_iso = 'CO';

  -- Verificar si ya existen registros
  SELECT EXISTS(SELECT 1 FROM configuracion_fiscal WHERE pais_id = v_pais_pe) INTO v_exists_pe;
  SELECT EXISTS(SELECT 1 FROM configuracion_fiscal WHERE pais_id = v_pais_co) INTO v_exists_co;

  -- Perú (SUNAT): 999 items, S/ 999,999,999.99
  IF v_pais_pe IS NOT NULL THEN
    IF v_exists_pe THEN
      -- Actualizar registro existente
      UPDATE configuracion_fiscal 
      SET 
        max_items_por_documento = 999,
        monto_maximo_documento = 999999999.99,
        updated_at = now()
      WHERE pais_id = v_pais_pe;
      
      RAISE NOTICE 'Límites SUNAT actualizados para Perú';
    ELSE
      -- Insertar nuevo registro
      INSERT INTO configuracion_fiscal (
        pais_id,
        impuesto_principal_nombre,
        impuesto_principal_porcentaje,
        max_items_por_documento,
        monto_maximo_documento,
        activo,
        created_at,
        updated_at
      )
      VALUES (
        v_pais_pe,
        'IGV',
        0.18,
        999,
        999999999.99,
        true,
        now(),
        now()
      );
      
      RAISE NOTICE 'Límites SUNAT creados para Perú';
    END IF;
  END IF;

  -- Colombia (DIAN): 1000 items, $999,999,999,999.99 COP
  IF v_pais_co IS NOT NULL THEN
    IF v_exists_co THEN
      -- Actualizar registro existente
      UPDATE configuracion_fiscal 
      SET 
        max_items_por_documento = 1000,
        monto_maximo_documento = 999999999999.99,
        updated_at = now()
      WHERE pais_id = v_pais_co;
      
      RAISE NOTICE 'Límites DIAN actualizados para Colombia';
    ELSE
      -- Insertar nuevo registro
      INSERT INTO configuracion_fiscal (
        pais_id,
        impuesto_principal_nombre,
        impuesto_principal_porcentaje,
        max_items_por_documento,
        monto_maximo_documento,
        activo,
        created_at,
        updated_at
      )
      VALUES (
        v_pais_co,
        'IVA',
        0.19,
        1000,
        999999999999.99,
        true,
        now(),
        now()
      );
      
      RAISE NOTICE 'Límites DIAN creados para Colombia';
    END IF;
  END IF;
END $$;

-- Verificación
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count 
  FROM information_schema.columns 
  WHERE table_name='configuracion_fiscal' 
    AND column_name IN ('max_items_por_documento', 'monto_maximo_documento');
  
  IF v_count = 2 THEN
    RAISE NOTICE 'Verificación exitosa: Campos de límites fiscales creados';
  ELSE
    RAISE EXCEPTION 'Error: Campos de límites fiscales NO fueron creados correctamente';
  END IF;
END $$;
