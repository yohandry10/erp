-- =============================================
-- Migration 083: Seed Catálogos Colombia (DIAN)
-- =============================================
-- Siembra tipos de documentos fiscales e impuestos para Colombia
-- Complementa la migración 079 que sembró países
-- =============================================

-- =============================================
-- PARTE 1: TIPOS DE DOCUMENTOS FISCALES - COLOMBIA
-- =============================================

DO $$
DECLARE
  v_pais_co integer;
BEGIN
  -- Obtener ID de Colombia
  SELECT id INTO v_pais_co FROM paises WHERE codigo_iso = 'CO';

  IF v_pais_co IS NULL THEN
    RAISE EXCEPTION 'País Colombia (CO) no encontrado. Ejecutar migración 079 primero.';
  END IF;

  -- Insertar tipos de documentos fiscales para Colombia
  -- Solo si no existen

  -- Factura de Venta Electrónica (FE)
  IF NOT EXISTS (SELECT 1 FROM tipos_documentos_fiscales WHERE pais_id = v_pais_co AND codigo = '01') THEN
    INSERT INTO tipos_documentos_fiscales (pais_id, codigo, nombre, descripcion, requiere_ruc, permite_exportacion, activo)
    VALUES (
      v_pais_co,
      '01',
      'Factura de Venta',
      'Factura de Venta Electrónica (FE) - DIAN Colombia',
      true,
      true,
      true
    );
  END IF;

  -- Nota Crédito Electrónica (NC)
  IF NOT EXISTS (SELECT 1 FROM tipos_documentos_fiscales WHERE pais_id = v_pais_co AND codigo = '91') THEN
    INSERT INTO tipos_documentos_fiscales (pais_id, codigo, nombre, descripcion, requiere_ruc, permite_exportacion, activo)
    VALUES (
      v_pais_co,
      '91',
      'Nota Crédito',
      'Nota Crédito Electrónica (NC) - DIAN Colombia',
      true,
      false,
      true
    );
  END IF;

  -- Nota Débito Electrónica (ND)
  IF NOT EXISTS (SELECT 1 FROM tipos_documentos_fiscales WHERE pais_id = v_pais_co AND codigo = '92') THEN
    INSERT INTO tipos_documentos_fiscales (pais_id, codigo, nombre, descripcion, requiere_ruc, permite_exportacion, activo)
    VALUES (
      v_pais_co,
      '92',
      'Nota Débito',
      'Nota Débito Electrónica (ND) - DIAN Colombia',
      true,
      false,
      true
    );
  END IF;

  -- Factura de Exportación
  IF NOT EXISTS (SELECT 1 FROM tipos_documentos_fiscales WHERE pais_id = v_pais_co AND codigo = '02') THEN
    INSERT INTO tipos_documentos_fiscales (pais_id, codigo, nombre, descripcion, requiere_ruc, permite_exportacion, activo)
    VALUES (
      v_pais_co,
      '02',
      'Factura de Exportación',
      'Factura de Exportación Electrónica - DIAN Colombia',
      true,
      true,
      true
    );
  END IF;

  -- Documento Soporte en Adquisiciones (DSA)
  IF NOT EXISTS (SELECT 1 FROM tipos_documentos_fiscales WHERE pais_id = v_pais_co AND codigo = '05') THEN
    INSERT INTO tipos_documentos_fiscales (pais_id, codigo, nombre, descripcion, requiere_ruc, permite_exportacion, activo)
    VALUES (
      v_pais_co,
      '05',
      'Documento Soporte',
      'Documento Soporte en Adquisiciones (DSA) - DIAN Colombia',
      false,
      false,
      true
    );
  END IF;

  RAISE NOTICE '✅ Tipos de documentos fiscales para Colombia insertados';
END $$;

-- =============================================
-- PARTE 2: TIPOS DE IMPUESTOS - COLOMBIA
-- =============================================

DO $$
DECLARE
  v_pais_co integer;
BEGIN
  SELECT id INTO v_pais_co FROM paises WHERE codigo_iso = 'CO';

  -- IVA 19% (Tarifa general)
  IF NOT EXISTS (SELECT 1 FROM tipos_impuestos WHERE pais_id = v_pais_co AND codigo = 'IVA19') THEN
    INSERT INTO tipos_impuestos (pais_id, codigo, nombre, porcentaje, tipo_calculo, aplica_a, activo)
    VALUES (
      v_pais_co,
      'IVA19',
      'IVA 19%',
      0.19,
      'porcentaje',
      'venta',
      true
    );
  END IF;

  -- IVA 5% (Tarifa reducida)
  IF NOT EXISTS (SELECT 1 FROM tipos_impuestos WHERE pais_id = v_pais_co AND codigo = 'IVA5') THEN
    INSERT INTO tipos_impuestos (pais_id, codigo, nombre, porcentaje, tipo_calculo, aplica_a, activo)
    VALUES (
      v_pais_co,
      'IVA5',
      'IVA 5%',
      0.05,
      'porcentaje',
      'venta',
      true
    );
  END IF;

  -- IVA 0% (Exento)
  IF NOT EXISTS (SELECT 1 FROM tipos_impuestos WHERE pais_id = v_pais_co AND codigo = 'IVA0') THEN
    INSERT INTO tipos_impuestos (pais_id, codigo, nombre, porcentaje, tipo_calculo, aplica_a, activo)
    VALUES (
      v_pais_co,
      'IVA0',
      'IVA 0% (Exento)',
      0.00,
      'porcentaje',
      'venta',
      true
    );
  END IF;

  -- INC (Impuesto Nacional al Consumo) 8%
  IF NOT EXISTS (SELECT 1 FROM tipos_impuestos WHERE pais_id = v_pais_co AND codigo = 'INC8') THEN
    INSERT INTO tipos_impuestos (pais_id, codigo, nombre, porcentaje, tipo_calculo, aplica_a, activo)
    VALUES (
      v_pais_co,
      'INC8',
      'INC 8%',
      0.08,
      'porcentaje',
      'venta',
      true
    );
  END IF;

  -- INC 4%
  IF NOT EXISTS (SELECT 1 FROM tipos_impuestos WHERE pais_id = v_pais_co AND codigo = 'INC4') THEN
    INSERT INTO tipos_impuestos (pais_id, codigo, nombre, porcentaje, tipo_calculo, aplica_a, activo)
    VALUES (
      v_pais_co,
      'INC4',
      'INC 4%',
      0.04,
      'porcentaje',
      'venta',
      true
    );
  END IF;

  -- Retención en la Fuente 2.5%
  IF NOT EXISTS (SELECT 1 FROM tipos_impuestos WHERE pais_id = v_pais_co AND codigo = 'RETEFUENTE') THEN
    INSERT INTO tipos_impuestos (pais_id, codigo, nombre, porcentaje, tipo_calculo, aplica_a, activo)
    VALUES (
      v_pais_co,
      'RETEFUENTE',
      'Retención en la Fuente 2.5%',
      0.025,
      'porcentaje',
      'compra',
      true
    );
  END IF;

  -- ReteIVA
  IF NOT EXISTS (SELECT 1 FROM tipos_impuestos WHERE pais_id = v_pais_co AND codigo = 'RETEIVA') THEN
    INSERT INTO tipos_impuestos (pais_id, codigo, nombre, porcentaje, tipo_calculo, aplica_a, activo)
    VALUES (
      v_pais_co,
      'RETEIVA',
      'Retención de IVA 15%',
      0.15,
      'porcentaje',
      'compra',
      true
    );
  END IF;

  RAISE NOTICE '✅ Tipos de impuestos para Colombia insertados';
END $$;

-- =============================================
-- PARTE 3: ACTUALIZAR CONFIGURACIÓN FISCAL COLOMBIA
-- =============================================

DO $$
DECLARE
  v_pais_co integer;
BEGIN
  SELECT id INTO v_pais_co FROM paises WHERE codigo_iso = 'CO';

  -- Actualizar o insertar configuración fiscal para Colombia
  IF EXISTS (SELECT 1 FROM configuracion_fiscal WHERE pais_id = v_pais_co) THEN
    UPDATE configuracion_fiscal SET
      impuesto_principal_nombre = 'IVA',
      impuesto_principal_porcentaje = 0.19,
      retencion_renta_porcentaje = 0.025,
      retencion_iva_porcentaje = 0.15,
      documento_identidad_empresa = 'NIT',
      longitud_documento_empresa = 9,
      requiere_libro_diario = true,
      requiere_libro_mayor = true,
      requiere_libro_inventarios = true,
      requiere_libro_compras = true,
      requiere_libro_ventas = true,
      requiere_kardex_valorizado = false,
      requiere_libro_mayor_balances = true,
      requiere_libros_societarios = true,
      formato_fecha = 'DD/MM/YYYY',
      separador_decimal = ',',
      separador_miles = '.',
      url_webservice_principal = 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
      url_webservice_secundario = 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      activo = true,
      updated_at = now()
    WHERE pais_id = v_pais_co;
    
    RAISE NOTICE '✅ Configuración fiscal de Colombia actualizada';
  ELSE
    -- Si no existe, crear configuración básica
    INSERT INTO configuracion_fiscal (
      pais_id,
      impuesto_principal_nombre,
      impuesto_principal_porcentaje,
      retencion_renta_porcentaje,
      retencion_iva_porcentaje,
      documento_identidad_empresa,
      longitud_documento_empresa,
      requiere_libro_diario,
      requiere_libro_mayor,
      requiere_libro_inventarios,
      requiere_libro_compras,
      requiere_libro_ventas,
      requiere_kardex_valorizado,
      requiere_libro_mayor_balances,
      requiere_libros_societarios,
      formato_fecha,
      separador_decimal,
      separador_miles,
      url_webservice_principal,
      url_webservice_secundario,
      activo
    ) VALUES (
      v_pais_co,
      'IVA',
      0.19,
      0.025,
      0.15,
      'NIT',
      9,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      'DD/MM/YYYY',
      ',',
      '.',
      'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
      'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      true
    );
    
    RAISE NOTICE '✅ Configuración fiscal de Colombia creada';
  END IF;
END $$;

-- =============================================
-- PARTE 4: ÍNDICES PARA PERFORMANCE
-- =============================================

-- Índice para búsqueda rápida de documentos por país
CREATE INDEX IF NOT EXISTS idx_tipos_documentos_pais_codigo 
  ON tipos_documentos_fiscales(pais_id, codigo) 
  WHERE activo = true;

-- Índice para búsqueda rápida de impuestos por país
CREATE INDEX IF NOT EXISTS idx_tipos_impuestos_pais_codigo 
  ON tipos_impuestos(pais_id, codigo) 
  WHERE activo = true;

-- =============================================
-- VERIFICACIÓN FINAL
-- =============================================

DO $$
DECLARE
  v_docs_colombia integer;
  v_impuestos_colombia integer;
  v_config_colombia integer;
BEGIN
  SELECT COUNT(*) INTO v_docs_colombia 
  FROM tipos_documentos_fiscales 
  WHERE pais_id = (SELECT id FROM paises WHERE codigo_iso = 'CO');
  
  SELECT COUNT(*) INTO v_impuestos_colombia 
  FROM tipos_impuestos 
  WHERE pais_id = (SELECT id FROM paises WHERE codigo_iso = 'CO');
  
  SELECT COUNT(*) INTO v_config_colombia 
  FROM configuracion_fiscal 
  WHERE pais_id = (SELECT id FROM paises WHERE codigo_iso = 'CO');

  RAISE NOTICE '';
  RAISE NOTICE '✅ Migración 083 completada:';
  RAISE NOTICE '  🇨🇴 Colombia - Tipos de documentos: %', v_docs_colombia;
  RAISE NOTICE '  🇨🇴 Colombia - Tipos de impuestos: %', v_impuestos_colombia;
  RAISE NOTICE '  🇨🇴 Colombia - Configuración fiscal: %', v_config_colombia;
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Catálogos de Colombia (DIAN) sembrados correctamente';
END $$;
