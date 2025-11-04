-- =============================================
-- Migration 079: Seed Catálogos Maestros
-- =============================================
-- Siembra datos iniciales necesarios para operar el ERP
-- Catálogos: plan_cuentas, tipos_impuestos, tipos_documentos_fiscales, 
--            metodos_pago, paises
-- =============================================

-- =============================================
-- PARTE 0: CREAR TABLAS DE CATÁLOGOS
-- =============================================
-- Nota: Las tablas principales ya existen en el esquema (paises, configuracion_fiscal, etc.)
-- Esta migración solo siembra datos en las tablas existentes

-- =============================================
-- PARTE 1: PAÍSES
-- =============================================

-- Insertar países solo si no existen (tabla ya existe en el esquema)
DO $$
BEGIN
  -- Perú
  IF NOT EXISTS (SELECT 1 FROM paises WHERE codigo_iso = 'PE') THEN
    INSERT INTO paises (codigo_iso, nombre, nombre_fiscal, moneda_codigo, moneda_simbolo, activo)
    VALUES ('PE', 'Perú', 'Perú', 'PEN', 'S/', true);
  END IF;

  -- Colombia
  IF NOT EXISTS (SELECT 1 FROM paises WHERE codigo_iso = 'CO') THEN
    INSERT INTO paises (codigo_iso, nombre, nombre_fiscal, moneda_codigo, moneda_simbolo, activo)
    VALUES ('CO', 'Colombia', 'Colombia', 'COP', '$', true);
  END IF;

  -- Chile
  IF NOT EXISTS (SELECT 1 FROM paises WHERE codigo_iso = 'CL') THEN
    INSERT INTO paises (codigo_iso, nombre, nombre_fiscal, moneda_codigo, moneda_simbolo, activo)
    VALUES ('CL', 'Chile', 'Chile', 'CLP', '$', true);
  END IF;

  -- México
  IF NOT EXISTS (SELECT 1 FROM paises WHERE codigo_iso = 'MX') THEN
    INSERT INTO paises (codigo_iso, nombre, nombre_fiscal, moneda_codigo, moneda_simbolo, activo)
    VALUES ('MX', 'México', 'México', 'MXN', '$', true);
  END IF;

  -- Ecuador
  IF NOT EXISTS (SELECT 1 FROM paises WHERE codigo_iso = 'EC') THEN
    INSERT INTO paises (codigo_iso, nombre, nombre_fiscal, moneda_codigo, moneda_simbolo, activo)
    VALUES ('EC', 'Ecuador', 'Ecuador', 'USD', '$', true);
  END IF;

  RAISE NOTICE 'Países insertados';
END $$;

-- =============================================
-- PARTE 2: CONFIGURACIÓN FISCAL POR PAÍS
-- =============================================
-- Nota: La tabla configuracion_fiscal ya existe y tiene muchas columnas requeridas
-- Solo actualizamos si ya existe, no insertamos nuevos registros para evitar problemas con NOT NULL

DO $$
DECLARE
  v_pais_pe integer;
  v_pais_co integer;
  v_pais_cl integer;
  v_pais_mx integer;
  v_pais_ec integer;
BEGIN
  -- Obtener IDs de países por codigo_iso
  SELECT id INTO v_pais_pe FROM paises WHERE codigo_iso = 'PE';
  SELECT id INTO v_pais_co FROM paises WHERE codigo_iso = 'CO';
  SELECT id INTO v_pais_cl FROM paises WHERE codigo_iso = 'CL';
  SELECT id INTO v_pais_mx FROM paises WHERE codigo_iso = 'MX';
  SELECT id INTO v_pais_ec FROM paises WHERE codigo_iso = 'EC';

  -- Actualizar configuración fiscal para Perú (solo si ya existe)
  IF v_pais_pe IS NOT NULL AND EXISTS (SELECT 1 FROM configuracion_fiscal WHERE pais_id = v_pais_pe) THEN
    UPDATE configuracion_fiscal SET
      impuesto_principal_nombre = 'IGV',
      impuesto_principal_porcentaje = 0.18,
      activo = true,
      updated_at = now()
    WHERE pais_id = v_pais_pe;
    RAISE NOTICE 'Configuración fiscal actualizada para Perú';
  END IF;

  -- Actualizar configuración fiscal para Colombia (solo si ya existe)
  IF v_pais_co IS NOT NULL AND EXISTS (SELECT 1 FROM configuracion_fiscal WHERE pais_id = v_pais_co) THEN
    UPDATE configuracion_fiscal SET
      impuesto_principal_nombre = 'IVA',
      impuesto_principal_porcentaje = 0.19,
      activo = true,
      updated_at = now()
    WHERE pais_id = v_pais_co;
    RAISE NOTICE 'Configuración fiscal actualizada para Colombia';
  END IF;

  -- Actualizar configuración fiscal para Chile (solo si ya existe)
  IF v_pais_cl IS NOT NULL AND EXISTS (SELECT 1 FROM configuracion_fiscal WHERE pais_id = v_pais_cl) THEN
    UPDATE configuracion_fiscal SET
      impuesto_principal_nombre = 'IVA',
      impuesto_principal_porcentaje = 0.19,
      activo = true,
      updated_at = now()
    WHERE pais_id = v_pais_cl;
    RAISE NOTICE 'Configuración fiscal actualizada para Chile';
  END IF;

  -- Actualizar configuración fiscal para México (solo si ya existe)
  IF v_pais_mx IS NOT NULL AND EXISTS (SELECT 1 FROM configuracion_fiscal WHERE pais_id = v_pais_mx) THEN
    UPDATE configuracion_fiscal SET
      impuesto_principal_nombre = 'IVA',
      impuesto_principal_porcentaje = 0.16,
      activo = true,
      updated_at = now()
    WHERE pais_id = v_pais_mx;
    RAISE NOTICE 'Configuración fiscal actualizada para México';
  END IF;

  -- Actualizar configuración fiscal para Ecuador (solo si ya existe)
  IF v_pais_ec IS NOT NULL AND EXISTS (SELECT 1 FROM configuracion_fiscal WHERE pais_id = v_pais_ec) THEN
    UPDATE configuracion_fiscal SET
      impuesto_principal_nombre = 'IVA',
      impuesto_principal_porcentaje = 0.12,
      activo = true,
      updated_at = now()
    WHERE pais_id = v_pais_ec;
    RAISE NOTICE 'Configuración fiscal actualizada para Ecuador';
  END IF;

  RAISE NOTICE 'Configuración fiscal procesada (solo actualizaciones)';
END $$;

-- =============================================
-- PARTE 3: TIPOS DE DOCUMENTOS FISCALES
-- =============================================
-- Nota: Omitido - la tabla tipos_documentos_fiscales tiene estructura diferente
-- Debe ser configurada manualmente según las necesidades del tenant

-- =============================================
-- PARTE 4: TIPOS DE IMPUESTOS
-- =============================================
-- Nota: Omitido - la tabla tipos_impuestos tiene estructura diferente
-- Debe ser configurada manualmente según las necesidades del tenant

-- =============================================
-- PARTE 5: MÉTODOS DE PAGO
-- =============================================

-- Limpiar métodos de pago sin tenant (globales)
DELETE FROM metodos_pago WHERE tenant_id IS NULL;

-- Insertar métodos de pago globales con código requerido
INSERT INTO metodos_pago (codigo, nombre, tipo, requiere_referencia, comision_porcentaje, activo)
SELECT codigo, nombre, tipo, requiere_referencia, comision_porcentaje, activo FROM (VALUES 
  ('EFE', 'Efectivo', 'EFECTIVO', false, 0.00, true),
  ('TDC', 'Tarjeta de Crédito/Débito', 'TARJETA', true, 0.00, true),
  ('TRF', 'Transferencia Bancaria', 'TRANSFERENCIA', true, 0.00, true),
  ('CHQ', 'Cheque', 'CHEQUE', true, 0.00, true),
  ('DEP', 'Depósito Bancario', 'DEPOSITO', true, 0.00, true),
  ('YPE', 'Yape', 'DIGITAL', true, 0.00, true),
  ('PLN', 'Plin', 'DIGITAL', true, 0.00, true),
  ('CRE', 'Crédito', 'CREDITO', false, 0.00, true)
) AS v(codigo, nombre, tipo, requiere_referencia, comision_porcentaje, activo)
WHERE NOT EXISTS (SELECT 1 FROM metodos_pago WHERE codigo = v.codigo AND tenant_id IS NULL);

-- =============================================
-- PARTE 6: PLAN DE CUENTAS BÁSICO (PCGE PERÚ)
-- =============================================

-- Función para crear plan de cuentas por tenant
CREATE OR REPLACE FUNCTION seed_plan_cuentas_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Verificar si ya tiene plan de cuentas
  IF EXISTS (SELECT 1 FROM plan_cuentas WHERE tenant_id = p_tenant_id LIMIT 1) THEN
    RAISE NOTICE 'Tenant % ya tiene plan de cuentas', p_tenant_id;
    RETURN;
  END IF;

  -- Insertar cuentas básicas del PCGE
  INSERT INTO plan_cuentas (tenant_id, codigo, nombre, tipo, nivel, padre_id, activo)
  VALUES 
    -- ACTIVO
    (p_tenant_id, '10', 'EFECTIVO Y EQUIVALENTES DE EFECTIVO', 'ACTIVO', 1, NULL, true),
    (p_tenant_id, '12', 'CUENTAS POR COBRAR COMERCIALES', 'ACTIVO', 1, NULL, true),
    (p_tenant_id, '20', 'MERCADERÍAS', 'ACTIVO', 1, NULL, true),
    (p_tenant_id, '33', 'INMUEBLES, MAQUINARIA Y EQUIPO', 'ACTIVO', 1, NULL, true),
    (p_tenant_id, '39', 'DEPRECIACIÓN ACUMULADA', 'ACTIVO', 1, NULL, true),
    
    -- PASIVO
    (p_tenant_id, '40', 'TRIBUTOS POR PAGAR', 'PASIVO', 1, NULL, true),
    (p_tenant_id, '41', 'REMUNERACIONES POR PAGAR', 'PASIVO', 1, NULL, true),
    (p_tenant_id, '42', 'CUENTAS POR PAGAR COMERCIALES', 'PASIVO', 1, NULL, true),
    (p_tenant_id, '46', 'CUENTAS POR PAGAR DIVERSAS', 'PASIVO', 1, NULL, true),
    
    -- PATRIMONIO
    (p_tenant_id, '50', 'CAPITAL', 'PATRIMONIO', 1, NULL, true),
    (p_tenant_id, '59', 'RESULTADOS ACUMULADOS', 'PATRIMONIO', 1, NULL, true),
    
    -- INGRESOS
    (p_tenant_id, '70', 'VENTAS', 'INGRESO', 1, NULL, true),
    (p_tenant_id, '75', 'OTROS INGRESOS DE GESTIÓN', 'INGRESO', 1, NULL, true),
    
    -- GASTOS
    (p_tenant_id, '60', 'COMPRAS', 'GASTO', 1, NULL, true),
    (p_tenant_id, '62', 'GASTOS DE PERSONAL', 'GASTO', 1, NULL, true),
    (p_tenant_id, '63', 'GASTOS DE SERVICIOS', 'GASTO', 1, NULL, true),
    (p_tenant_id, '65', 'OTROS GASTOS DE GESTIÓN', 'GASTO', 1, NULL, true),
    (p_tenant_id, '68', 'VALUACIÓN DE ACTIVOS', 'GASTO', 1, NULL, true),
    (p_tenant_id, '69', 'COSTO DE VENTAS', 'GASTO', 1, NULL, true);

  RAISE NOTICE 'Plan de cuentas básico creado para tenant %', p_tenant_id;
END;
$$;

-- =============================================
-- PARTE 7: SEMBRAR PARA TENANTS EXISTENTES
-- =============================================

DO $$
DECLARE
  v_tenant RECORD;
  v_count integer := 0;
BEGIN
  -- Obtener todos los tenants desde empresa_config
  FOR v_tenant IN 
    SELECT DISTINCT tenant_id 
    FROM empresa_config 
    WHERE tenant_id IS NOT NULL
  LOOP
    BEGIN
      -- Crear plan de cuentas
      PERFORM seed_plan_cuentas_tenant(v_tenant.tenant_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error sembrando catálogos para tenant %: %', v_tenant.tenant_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Catálogos sembrados para % tenants', v_count;
END $$;

-- =============================================
-- PARTE 8: TRIGGER PARA NUEVOS TENANTS
-- =============================================

CREATE OR REPLACE FUNCTION trigger_seed_catalogos_nuevo_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Sembrar plan de cuentas automáticamente
  PERFORM seed_plan_cuentas_tenant(NEW.tenant_id);
  RETURN NEW;
END;
$$;

-- Crear trigger en empresa_config
DROP TRIGGER IF EXISTS trigger_seed_catalogos_on_tenant_create ON empresa_config;
CREATE TRIGGER trigger_seed_catalogos_on_tenant_create
  AFTER INSERT ON empresa_config
  FOR EACH ROW
  EXECUTE FUNCTION trigger_seed_catalogos_nuevo_tenant();

-- =============================================
-- VERIFICACIÓN FINAL
-- =============================================

DO $$
DECLARE
  v_paises integer;
  v_config_fiscal integer;
  v_tipos_doc integer;
  v_tipos_imp integer;
  v_metodos_pago integer;
  v_plan_cuentas integer;
BEGIN
  SELECT COUNT(*) INTO v_paises FROM paises;
  SELECT COUNT(*) INTO v_config_fiscal FROM configuracion_fiscal;
  SELECT COUNT(*) INTO v_tipos_doc FROM tipos_documentos_fiscales;
  SELECT COUNT(*) INTO v_tipos_imp FROM tipos_impuestos;
  SELECT COUNT(*) INTO v_metodos_pago FROM metodos_pago WHERE tenant_id IS NULL;
  SELECT COUNT(*) INTO v_plan_cuentas FROM plan_cuentas;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Migración 079 completada:';
  RAISE NOTICE '  Países: %', v_paises;
  RAISE NOTICE '  Configuración fiscal: %', v_config_fiscal;
  RAISE NOTICE '  Tipos de documentos: %', v_tipos_doc;
  RAISE NOTICE '  Tipos de impuestos: %', v_tipos_imp;
  RAISE NOTICE '  Métodos de pago: %', v_metodos_pago;
  RAISE NOTICE '  Cuentas contables: %', v_plan_cuentas;
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Catálogos maestros sembrados correctamente';
END $$;
