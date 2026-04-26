-- =====================================================
-- Migración 143: Seed de Datos Demo Realistas
-- =====================================================
-- Este seed crea datos realistas para demostrar el poder del ERP
-- Se ejecuta automáticamente al crear un tenant demo
-- NOTA: La función se ejecuta dentro de una transacción implícita de PostgreSQL

-- FUNCIÓN PRINCIPAL: Seed de Tenant Demo
CREATE OR REPLACE FUNCTION seed_demo_tenant(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_almacen_principal_id UUID;
  v_almacen_sucursal_id UUID;
  v_caja1_id UUID;
  v_caja2_id UUID;
  v_cliente_ids UUID[];
  v_proveedor_ids UUID[];
  v_producto_ids UUID[];
  v_cuenta_banco_id UUID;
BEGIN
  -- Verificar que el tenant existe
  IF NOT EXISTS (SELECT 1 FROM empresa_config WHERE tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant % no encontrado en empresa_config', p_tenant_id;
  END IF;

  -- ============================================
  -- PASO 1: CONFIGURACIÓN EMPRESARIAL
  -- ============================================
  
  UPDATE empresa_config
  SET 
    razon_social = 'DEMO COMERCIAL SAC',
    nombre_comercial = 'Demo Store',
    ruc = '20123456789',
    direccion_fiscal = 'Av. Javier Prado Este 4200, San Borja, Lima',
    telefono = '+51 1 234-5678',
    email = 'contacto@democomercial.pe',
    sitio_web = 'https://democomercial.pe',
    representante_legal = 'Juan Carlos Demo',
    dni_representante = '12345678',
    tipo_contribuyente = 'PERSONA_JURIDICA',
    regimen_tributario = 'GENERAL',
    actividad_economica = 'Venta al por menor de productos diversos',
    igv_porcentaje = 18.00,
    retencion_renta_porcentaje = 3.00,
    percepcion_porcentaje = 2.00,
    detraccion_porcentaje = 10.00,
    serie_factura = 'F001',
    serie_boleta = 'B001',
    serie_nota_credito = 'FC01',
    serie_nota_debito = 'FD01',
    serie_guia_remision = 'T001',
    ultimo_numero_factura = 15,
    ultimo_numero_boleta = 25,
    ultimo_numero_nota_credito = 2,
    ultimo_numero_nota_debito = 1,
    ultimo_numero_guia_remision = 5,
    moneda_defecto = 'PEN',
    redondeo_decimales = 2,
    incluir_igv_en_precio = true,
    envio_automatico_sunat = false,
    generar_pdf_automatico = true,
    enviar_email_cliente = false,
    validar_ruc_sunat = false,
    usar_codigos_barra = true,
    tipo_empresa = 'PEQUEÑA',
    usar_flujo_logistica = false,
    gre_obligatorio = false,
    umbral_gre_automatico = 700.00,
    gre_automatico_habilitado = true,
    monto_maximo_sin_aprobacion = 5000.00,
    porcentaje_descuento_maximo = 20.00,
    requiere_aprobacion_descuento = false,
    aplicar_limite_credito = true,
    dias_gracia_morosidad = 5,
    dias_vencimiento_factura = 30,
    aplicar_retencion = false,
    aplicar_percepcion = false,
    aplicar_detraccion = false,
    habilitar_multialmacen = true,
    requiere_ubicaciones_inventario = false,
    requiere_lotes_series = false,
    politica_rotacion_inventario = 'FIFO',
    habilitar_dashboards_sunat = true,
    habilitar_dashboards_otif = true,
    objetivo_otif = 95.00,
    estado = 'ACTIVO',
    configuracion_completa = true,
    demo_seed_version = '1.0',
    demo_seed_completed_at = NOW()
  WHERE tenant_id = p_tenant_id;
  
  v_result := jsonb_set(v_result, '{empresa_config}', 'true'::jsonb);

  -- ============================================
  -- PASO 2: ALMACENES
  -- ============================================
  
  INSERT INTO almacenes (tenant_id, nombre, codigo, direccion, es_principal, activo)
  VALUES 
    (p_tenant_id, 'Almacén Principal', 'ALM-001', 'Av. Javier Prado Este 4200', true, true),
    (p_tenant_id, 'Almacén Sucursal', 'ALM-002', 'Av. Larco 1234, Miraflores', false, true)
  ON CONFLICT DO NOTHING;
  
  SELECT id INTO v_almacen_principal_id FROM almacenes WHERE tenant_id = p_tenant_id AND codigo = 'ALM-001';
  SELECT id INTO v_almacen_sucursal_id FROM almacenes WHERE tenant_id = p_tenant_id AND codigo = 'ALM-002';
  
  v_result := jsonb_set(v_result, '{almacenes}', '2'::jsonb);

  -- ============================================
  -- PASO 3: CAJAS POS
  -- ============================================
  
  INSERT INTO cajas (tenant_id, nombre, codigo, ubicacion, estado, activa, monto_inicial, categoria, almacen_id)
  VALUES 
    (p_tenant_id, 'Caja Principal', 'CAJ-001', 'Tienda Principal - Piso 1', 'ACTIVA', true, 500.00, 'VENTAS', v_almacen_principal_id),
    (p_tenant_id, 'Caja Sucursal', 'CAJ-002', 'Sucursal Miraflores', 'ACTIVA', true, 300.00, 'VENTAS', v_almacen_sucursal_id)
  ON CONFLICT DO NOTHING;
  
  SELECT id INTO v_caja1_id FROM cajas WHERE tenant_id = p_tenant_id AND codigo = 'CAJ-001';
  SELECT id INTO v_caja2_id FROM cajas WHERE tenant_id = p_tenant_id AND codigo = 'CAJ-002';
  
  v_result := jsonb_set(v_result, '{cajas}', '2'::jsonb);

  -- ============================================
  -- PASO 4: CUENTA BANCARIA
  -- ============================================
  
  INSERT INTO cuentas_bancarias (tenant_id, banco, numero_cuenta, tipo_cuenta, moneda, saldo_actual, saldo_contable, activa)
  VALUES (p_tenant_id, 'BCP', '19412345678901', 'CORRIENTE', 'PEN', 25000.00, 25000.00, true)
  ON CONFLICT DO NOTHING;
  
  v_result := jsonb_set(v_result, '{cuentas_bancarias}', '1'::jsonb);

  -- ============================================
  -- PASO 5: CLIENTES
  -- ============================================
  
  INSERT INTO clientes (
    tenant_id, tipo_documento, numero_documento, razon_social, 
    nombre_comercial, direccion, telefono, email, 
    tipo, limite_credito, activo
  )
  VALUES 
    (p_tenant_id, 'RUC', '20456789012', 'CORPORACIÓN ALPHA SAC', 'Alpha Corp', 'Av. Arequipa 1234', '987654321', 'ventas@alphacorp.pe', 'CORPORATIVO', 50000.00, true),
    (p_tenant_id, 'RUC', '20567890123', 'DISTRIBUIDORA BETA EIRL', 'Beta Dist', 'Jr. Lampa 567', '987654322', 'compras@betadist.pe', 'DISTRIBUIDOR', 30000.00, true),
    (p_tenant_id, 'DNI', '45678901', 'García Pérez, Luis', 'Luis García', 'Av. La Marina 890', '987654323', 'luis.garcia@email.com', 'MINORISTA', 5000.00, true),
    (p_tenant_id, 'DNI', '56789012', 'Rodríguez Silva, Ana', 'Ana Rodríguez', 'Jr. Cusco 234', '987654324', 'ana.rodriguez@email.com', 'MINORISTA', 3000.00, true),
    (p_tenant_id, 'RUC', '20678901234', 'COMERCIAL GAMMA SA', 'Gamma', 'Av. Brasil 456', '987654325', 'info@gamma.pe', 'MAYORISTA', 80000.00, true),
    (p_tenant_id, 'DNI', '67890123', 'Martínez López, Carlos', 'Carlos Martínez', 'Av. Universitaria 789', '987654326', 'carlos.martinez@email.com', 'MINORISTA', 2000.00, true),
    (p_tenant_id, 'RUC', '20789012345', 'INVERSIONES DELTA SAC', 'Delta Inv', 'Av. Javier Prado 1234', '987654327', 'contacto@delta.pe', 'CORPORATIVO', 100000.00, true),
    (p_tenant_id, 'DNI', '78901234', 'Fernández Torres, María', 'María Fernández', 'Jr. Ancash 567', '987654328', 'maria.fernandez@email.com', 'MINORISTA', 4000.00, true),
    (p_tenant_id, 'RUC', '20890123456', 'SERVICIOS EPSILON EIRL', 'Epsilon', 'Av. Colonial 890', '987654329', 'ventas@epsilon.pe', 'DISTRIBUIDOR', 40000.00, true),
    (p_tenant_id, 'DNI', '89012345', 'Sánchez Vargas, Pedro', 'Pedro Sánchez', 'Av. Tacna 123', '987654330', 'pedro.sanchez@email.com', 'MINORISTA', 1500.00, true)
  ON CONFLICT DO NOTHING;
  
  v_result := jsonb_set(v_result, '{clientes}', '10'::jsonb);

  -- ============================================
  -- PASO 6: PROVEEDORES
  -- ============================================
  
  INSERT INTO proveedores (
    tenant_id, ruc, razon_social, nombre_comercial, 
    direccion, telefono, email, dias_credito, activo
  )
  VALUES 
    (p_tenant_id, '20123456789', 'IMPORTADORA TECH SAC', 'Tech Import', 'Av. Argentina 1234', '987111111', 'ventas@techimport.pe', 30, true),
    (p_tenant_id, '20234567890', 'DISTRIBUIDORA OFFICE EIRL', 'Office Dist', 'Jr. Quilca 567', '987222222', 'pedidos@officedist.pe', 45, true),
    (p_tenant_id, '20345678901', 'ALIMENTOS DEL PERÚ SA', 'Alimentos Perú', 'Av. Colonial 890', '987333333', 'ventas@alimentosperu.pe', 15, true),
    (p_tenant_id, '20456789012', 'TEXTILES ANDINOS SAC', 'Textiles Andinos', 'Jr. Gamarra 234', '987444444', 'info@textilesandinos.pe', 30, true),
    (p_tenant_id, '20567890123', 'HOGAR Y CONFORT EIRL', 'Hogar Confort', 'Av. Universitaria 456', '987555555', 'ventas@hogarconfort.pe', 60, true)
  ON CONFLICT DO NOTHING;
  
  v_result := jsonb_set(v_result, '{proveedores}', '5'::jsonb);

  -- ============================================
  -- PASO 7: PRODUCTOS CON STOCK
  -- ============================================
  
  INSERT INTO productos (
    tenant_id, codigo, nombre, descripcion, categoria,
    precio, precio_venta, precio_compra, stock, stock_minimo,
    impuesto, activo, es_servicio, controla_stock
  )
  VALUES 
    -- Electrónica
    (p_tenant_id, 'PROD-001', 'Laptop HP 15"', 'Laptop HP Core i5, 8GB RAM, 256GB SSD', 'Electrónica', 2500.00, 2500.00, 1800.00, 30, 5, 18.00, true, false, true),
    (p_tenant_id, 'PROD-002', 'Mouse Inalámbrico Logitech', 'Mouse óptico inalámbrico', 'Electrónica', 45.00, 45.00, 25.00, 100, 20, 18.00, true, false, true),
    (p_tenant_id, 'PROD-003', 'Teclado Mecánico RGB', 'Teclado mecánico con iluminación RGB', 'Electrónica', 180.00, 180.00, 120.00, 50, 10, 18.00, true, false, true),
    (p_tenant_id, 'PROD-004', 'Monitor LED 24"', 'Monitor Full HD 24 pulgadas', 'Electrónica', 650.00, 650.00, 450.00, 40, 8, 18.00, true, false, true),
    
    -- Oficina
    (p_tenant_id, 'PROD-005', 'Papel Bond A4 (500 hojas)', 'Papel bond blanco 75g', 'Oficina', 15.00, 15.00, 10.00, 200, 50, 18.00, true, false, true),
    (p_tenant_id, 'PROD-006', 'Lapiceros Azul (Caja 50)', 'Lapiceros punta fina', 'Oficina', 25.00, 25.00, 15.00, 150, 30, 18.00, true, false, true),
    (p_tenant_id, 'PROD-007', 'Archivador de Palanca', 'Archivador lomo ancho', 'Oficina', 8.50, 8.50, 5.00, 200, 40, 18.00, true, false, true),
    (p_tenant_id, 'PROD-008', 'Calculadora Científica', 'Calculadora Casio FX-991', 'Oficina', 85.00, 85.00, 60.00, 60, 15, 18.00, true, false, true),
    
    -- Hogar
    (p_tenant_id, 'PROD-009', 'Licuadora 3 Velocidades', 'Licuadora 600W', 'Hogar', 120.00, 120.00, 80.00, 40, 10, 18.00, true, false, true),
    (p_tenant_id, 'PROD-010', 'Juego de Sartenes (3 pzs)', 'Sartenes antiadherentes', 'Hogar', 95.00, 95.00, 60.00, 60, 15, 18.00, true, false, true),
    (p_tenant_id, 'PROD-011', 'Aspiradora 1200W', 'Aspiradora con filtro HEPA', 'Hogar', 280.00, 280.00, 200.00, 25, 5, 18.00, true, false, true),
    
    -- Alimentos
    (p_tenant_id, 'PROD-012', 'Aceite Vegetal 1L', 'Aceite vegetal premium', 'Alimentos', 12.50, 12.50, 8.00, 500, 100, 18.00, true, false, true),
    (p_tenant_id, 'PROD-013', 'Arroz Blanco 5kg', 'Arroz extra superior', 'Alimentos', 18.00, 18.00, 12.00, 400, 80, 18.00, true, false, true),
    (p_tenant_id, 'PROD-014', 'Azúcar Blanca 1kg', 'Azúcar refinada', 'Alimentos', 4.50, 4.50, 3.00, 600, 150, 18.00, true, false, true),
    (p_tenant_id, 'PROD-015', 'Café Molido 250g', 'Café premium tostado', 'Alimentos', 22.00, 22.00, 15.00, 250, 60, 18.00, true, false, true),
    
    -- Textil
    (p_tenant_id, 'PROD-016', 'Polo Algodón Talla M', 'Polo 100% algodón', 'Textil', 35.00, 35.00, 20.00, 150, 30, 18.00, true, false, true),
    (p_tenant_id, 'PROD-017', 'Jean Clásico Talla 32', 'Jean denim azul', 'Textil', 85.00, 85.00, 50.00, 100, 20, 18.00, true, false, true),
    (p_tenant_id, 'PROD-018', 'Zapatillas Deportivas', 'Zapatillas running', 'Textil', 150.00, 150.00, 90.00, 80, 15, 18.00, true, false, true),
    (p_tenant_id, 'PROD-019', 'Gorra Ajustable', 'Gorra deportiva ajustable', 'Textil', 28.00, 28.00, 15.00, 200, 40, 18.00, true, false, true),
    (p_tenant_id, 'PROD-020', 'Medias Deportivas (Pack 3)', 'Pack 3 pares medias', 'Textil', 18.00, 18.00, 10.00, 250, 50, 18.00, true, false, true)
  ON CONFLICT DO NOTHING;
  
  v_result := jsonb_set(v_result, '{productos}', '20'::jsonb);

  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error en seed_demo_tenant para tenant %: %', p_tenant_id, SQLERRM;
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentarios
COMMENT ON FUNCTION seed_demo_tenant(UUID) IS 
  'Crea datos seed realistas para un tenant demo: empresa, almacenes, cajas, clientes, proveedores, productos con stock.';

-- Grants
GRANT EXECUTE ON FUNCTION seed_demo_tenant(UUID) TO authenticated;
