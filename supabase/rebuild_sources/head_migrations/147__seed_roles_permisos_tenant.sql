-- =====================================================
-- Migración 147: Seed de Roles y Permisos por Tenant
-- =====================================================
-- Descripción: Crea automáticamente roles, permisos y asignaciones
--              cuando se crea un nuevo tenant
-- Fecha: 2025-11-29
-- Prioridad: CRÍTICA - Habilita gestión de usuarios por tenant
-- =====================================================

BEGIN;

-- =====================================================
-- PARTE 1: FUNCIÓN PARA CREAR PERMISOS DEL TENANT
-- =====================================================

CREATE OR REPLACE FUNCTION seed_permisos_tenant(p_tenant_id UUID)
RETURNS INTEGER AS $fn$
DECLARE
  v_count INTEGER := 0;
  v_permiso RECORD;
BEGIN
  -- Verificar que el tenant existe
  IF NOT EXISTS (SELECT 1 FROM empresa_config WHERE tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant % no encontrado', p_tenant_id;
  END IF;

  -- ============================================
  -- MÓDULO: VENTAS
  -- ============================================
  
  -- Clientes
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('ventas', 'clientes', 'ver', 'Ver lista y detalles de clientes'),
      ('ventas', 'clientes', 'crear', 'Crear nuevos clientes'),
      ('ventas', 'clientes', 'editar', 'Editar información de clientes'),
      ('ventas', 'clientes', 'eliminar', 'Eliminar clientes del sistema'),
      ('ventas', 'clientes', 'validar_ruc', 'Validar RUC con SUNAT')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Cotizaciones
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('ventas', 'cotizaciones', 'ver', 'Ver lista y detalles de cotizaciones'),
      ('ventas', 'cotizaciones', 'crear', 'Crear nuevas cotizaciones'),
      ('ventas', 'cotizaciones', 'editar', 'Editar cotizaciones existentes'),
      ('ventas', 'cotizaciones', 'eliminar', 'Eliminar cotizaciones'),
      ('ventas', 'cotizaciones', 'convertir_pedido', 'Convertir cotización a pedido')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Pedidos
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('ventas', 'pedidos', 'ver', 'Ver lista y detalles de pedidos'),
      ('ventas', 'pedidos', 'crear', 'Crear nuevos pedidos de venta'),
      ('ventas', 'pedidos', 'editar', 'Editar pedidos en estado PENDIENTE'),
      ('ventas', 'pedidos', 'confirmar', 'Confirmar pedidos y reservar stock'),
      ('ventas', 'pedidos', 'cancelar', 'Cancelar pedidos y liberar reservas'),
      ('ventas', 'pedidos', 'generar_factura', 'Generar facturas desde pedidos'),
      ('ventas', 'pedidos', 'ver_historial', 'Ver historial de cambios del pedido'),
      ('ventas', 'pedidos', 'ver_gre', 'Ver guías de remisión del pedido')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Aprobaciones
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('ventas', 'aprobaciones', 'ver', 'Ver bandeja de aprobaciones pendientes'),
      ('ventas', 'aprobaciones', 'resolver', 'Aprobar o rechazar pedidos')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Facturas
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('ventas', 'facturas', 'ver', 'Ver lista y detalles de facturas'),
      ('ventas', 'facturas', 'crear', 'Crear nuevas facturas'),
      ('ventas', 'facturas', 'anular', 'Anular facturas emitidas')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Notas de crédito/débito
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('ventas', 'notas_credito', 'ver', 'Ver notas de crédito'),
      ('ventas', 'notas_credito', 'crear', 'Crear notas de crédito'),
      ('ventas', 'notas_debito', 'ver', 'Ver notas de débito'),
      ('ventas', 'notas_debito', 'crear', 'Crear notas de débito')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- RMA (Devoluciones)
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('ventas', 'rma', 'ver', 'Ver solicitudes de RMA'),
      ('ventas', 'rma', 'crear', 'Crear solicitudes de RMA'),
      ('ventas', 'rma', 'aprobar', 'Aprobar solicitudes de RMA'),
      ('ventas', 'rma', 'recepcionar', 'Recepcionar devoluciones RMA'),
      ('ventas', 'rma', 'generar_nota_credito', 'Generar NC desde RMA')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ============================================
  -- MÓDULO: INVENTARIO
  -- ============================================

  -- Productos
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('inventario', 'productos', 'ver', 'Ver lista y detalles de productos'),
      ('inventario', 'productos', 'crear', 'Crear nuevos productos'),
      ('inventario', 'productos', 'editar', 'Editar productos existentes'),
      ('inventario', 'productos', 'eliminar', 'Eliminar productos')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Almacenes
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('inventario', 'almacenes', 'ver', 'Ver almacenes y ubicaciones'),
      ('inventario', 'almacenes', 'crear', 'Crear nuevos almacenes'),
      ('inventario', 'almacenes', 'editar', 'Editar almacenes existentes')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Stock
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('inventario', 'stock', 'ver', 'Ver niveles de stock'),
      ('inventario', 'stock', 'ajustar', 'Realizar ajustes de inventario')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Movimientos
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('inventario', 'movimientos', 'ver', 'Ver historial de movimientos'),
      ('inventario', 'movimientos', 'crear', 'Registrar movimientos manuales')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Kardex
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('inventario', 'kardex', 'ver', 'Ver kardex valorizado')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Logística
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('inventario', 'logistica', 'ver', 'Ver órdenes de preparación'),
      ('inventario', 'logistica', 'preparar', 'Preparar pedidos en almacén'),
      ('inventario', 'logistica', 'despachar', 'Confirmar despacho de pedidos')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Transferencias
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('inventario', 'transferencias', 'ver', 'Ver transferencias entre almacenes'),
      ('inventario', 'transferencias', 'crear', 'Crear transferencias'),
      ('inventario', 'transferencias', 'aprobar', 'Aprobar transferencias')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Ingresos/Salidas
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('inventario', 'ingresos', 'ver', 'Ver notas de ingreso'),
      ('inventario', 'ingresos', 'crear', 'Crear notas de ingreso'),
      ('inventario', 'salidas', 'ver', 'Ver notas de salida'),
      ('inventario', 'salidas', 'crear', 'Crear notas de salida')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Stats
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('inventario', 'stats', 'ver', 'Ver estadísticas de inventario')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ============================================
  -- MÓDULO: FINANZAS
  -- ============================================

  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('finanzas', 'cxc', 'ver', 'Ver cuentas por cobrar'),
      ('finanzas', 'cxc', 'crear', 'Crear documentos CxC'),
      ('finanzas', 'cxc', 'editar', 'Editar documentos CxC'),
      ('finanzas', 'cxp', 'ver', 'Ver cuentas por pagar'),
      ('finanzas', 'cxp', 'crear', 'Crear documentos CxP'),
      ('finanzas', 'cxp', 'editar', 'Editar documentos CxP'),
      ('finanzas', 'cobros', 'ver', 'Ver registro de cobros'),
      ('finanzas', 'cobros', 'crear', 'Registrar cobros'),
      ('finanzas', 'cobros', 'anular', 'Anular cobros'),
      ('finanzas', 'pagos', 'ver', 'Ver registro de pagos'),
      ('finanzas', 'pagos', 'crear', 'Registrar pagos'),
      ('finanzas', 'pagos', 'anular', 'Anular pagos'),
      ('finanzas', 'bancos', 'ver', 'Ver cuentas bancarias'),
      ('finanzas', 'bancos', 'crear', 'Crear cuentas bancarias'),
      ('finanzas', 'bancos', 'conciliar', 'Conciliar movimientos bancarios'),
      ('finanzas', 'tesoreria', 'ver', 'Ver movimientos de tesorería'),
      ('finanzas', 'tesoreria', 'crear', 'Crear movimientos de tesorería')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ============================================
  -- MÓDULO: CONTABILIDAD
  -- ============================================

  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('contabilidad', 'asientos', 'ver', 'Ver asientos contables'),
      ('contabilidad', 'asientos', 'crear', 'Crear asientos contables'),
      ('contabilidad', 'asientos', 'editar', 'Editar asientos contables'),
      ('contabilidad', 'asientos', 'aprobar', 'Aprobar asientos contables'),
      ('contabilidad', 'plan_cuentas', 'ver', 'Ver plan de cuentas'),
      ('contabilidad', 'plan_cuentas', 'crear', 'Crear cuentas contables'),
      ('contabilidad', 'plan_cuentas', 'editar', 'Editar cuentas contables'),
      ('contabilidad', 'reportes', 'ver', 'Ver reportes contables'),
      ('contabilidad', 'reportes', 'exportar', 'Exportar reportes contables'),
      ('contabilidad', 'cierre', 'ejecutar', 'Ejecutar cierre de período')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ============================================
  -- MÓDULO: COMPRAS
  -- ============================================

  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('compras', 'proveedores', 'ver', 'Ver lista de proveedores'),
      ('compras', 'proveedores', 'crear', 'Crear nuevos proveedores'),
      ('compras', 'proveedores', 'editar', 'Editar proveedores'),
      ('compras', 'proveedores', 'eliminar', 'Eliminar proveedores'),
      ('compras', 'ordenes_compra', 'ver', 'Ver órdenes de compra'),
      ('compras', 'ordenes_compra', 'crear', 'Crear órdenes de compra'),
      ('compras', 'ordenes_compra', 'editar', 'Editar órdenes de compra'),
      ('compras', 'ordenes_compra', 'aprobar', 'Aprobar órdenes de compra'),
      ('compras', 'ordenes_compra', 'cancelar', 'Cancelar órdenes de compra'),
      ('compras', 'recepciones', 'ver', 'Ver recepciones de mercadería'),
      ('compras', 'recepciones', 'crear', 'Registrar recepciones')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ============================================
  -- MÓDULO: POS
  -- ============================================

  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('pos', 'ventas', 'ver', 'Ver ventas POS'),
      ('pos', 'ventas', 'crear', 'Crear ventas POS'),
      ('pos', 'ventas', 'anular', 'Anular ventas POS'),
      ('pos', 'cajas', 'ver', 'Ver estado de cajas'),
      ('pos', 'cajas', 'abrir', 'Abrir sesión de caja'),
      ('pos', 'cajas', 'cerrar', 'Cerrar sesión de caja'),
      ('pos', 'cajas', 'arqueo', 'Realizar arqueo de caja'),
      ('pos', 'turnos', 'ver', 'Ver turnos de caja'),
      ('pos', 'turnos', 'iniciar', 'Iniciar turno'),
      ('pos', 'turnos', 'cerrar', 'Cerrar turno'),
      ('pos', 'devoluciones', 'ver', 'Ver devoluciones POS'),
      ('pos', 'devoluciones', 'crear', 'Crear devoluciones POS')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ============================================
  -- MÓDULO: RRHH
  -- ============================================

  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('rrhh', 'empleados', 'ver', 'Ver lista de empleados'),
      ('rrhh', 'empleados', 'crear', 'Crear nuevos empleados'),
      ('rrhh', 'empleados', 'editar', 'Editar empleados'),
      ('rrhh', 'empleados', 'eliminar', 'Eliminar empleados'),
      ('rrhh', 'planillas', 'ver', 'Ver planillas de pago'),
      ('rrhh', 'planillas', 'crear', 'Crear planillas'),
      ('rrhh', 'planillas', 'aprobar', 'Aprobar planillas'),
      ('rrhh', 'asistencia', 'ver', 'Ver control de asistencia'),
      ('rrhh', 'asistencia', 'registrar', 'Registrar asistencia')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ============================================
  -- MÓDULO: CONFIGURACIÓN
  -- ============================================

  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('configuracion', 'empresa', 'ver', 'Ver configuración de empresa'),
      ('configuracion', 'empresa', 'editar', 'Editar configuración de empresa'),
      ('configuracion', 'usuarios', 'ver', 'Ver lista de usuarios'),
      ('configuracion', 'usuarios', 'crear', 'Crear nuevos usuarios'),
      ('configuracion', 'usuarios', 'editar', 'Editar usuarios'),
      ('configuracion', 'usuarios', 'eliminar', 'Eliminar usuarios'),
      ('configuracion', 'roles', 'ver', 'Ver roles del sistema'),
      ('configuracion', 'roles', 'crear', 'Crear nuevos roles'),
      ('configuracion', 'roles', 'editar', 'Editar roles'),
      ('configuracion', 'roles', 'eliminar', 'Eliminar roles'),
      ('configuracion', 'permisos', 'ver', 'Ver permisos disponibles'),
      ('configuracion', 'permisos', 'asignar', 'Asignar permisos a roles'),
      ('configuracion', 'fiscal', 'ver', 'Ver configuración fiscal'),
      ('configuracion', 'fiscal', 'editar', 'Editar configuración fiscal'),
      ('configuracion', 'integraciones', 'ver', 'Ver integraciones'),
      ('configuracion', 'integraciones', 'configurar', 'Configurar integraciones'),
      -- Permiso especial para API de usuarios (users.manage)
      ('users', '__global__', 'manage', 'Gestión completa de usuarios del sistema')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ============================================
  -- MÓDULO: REPORTES
  -- ============================================

  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('reportes', 'dashboard', 'ver', 'Ver dashboard general'),
      ('reportes', 'ventas', 'ver', 'Ver reportes de ventas'),
      ('reportes', 'ventas', 'exportar', 'Exportar reportes de ventas'),
      ('reportes', 'inventario', 'ver', 'Ver reportes de inventario'),
      ('reportes', 'inventario', 'exportar', 'Exportar reportes de inventario'),
      ('reportes', 'finanzas', 'ver', 'Ver reportes financieros'),
      ('reportes', 'finanzas', 'exportar', 'Exportar reportes financieros')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Contar permisos creados
  SELECT COUNT(*) INTO v_count FROM permisos WHERE tenant_id = p_tenant_id;
  
  RETURN v_count;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION seed_permisos_tenant(UUID) IS 
  'Crea todos los permisos del catálogo para un tenant específico';


-- =====================================================
-- PARTE 2: FUNCIÓN PARA CREAR ROLES DEL TENANT
-- =====================================================

CREATE OR REPLACE FUNCTION seed_roles_tenant(p_tenant_id UUID)
RETURNS INTEGER AS $fn$
DECLARE
  v_count INTEGER := 0;
  v_rol RECORD;
BEGIN
  -- Verificar que el tenant existe
  IF NOT EXISTS (SELECT 1 FROM empresa_config WHERE tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant % no encontrado', p_tenant_id;
  END IF;

  -- Crear roles por defecto
  FOR v_rol IN 
    SELECT * FROM (VALUES
      ('ADMIN', 'Administrador del tenant con acceso total a todas las funcionalidades', true),
      ('VENDEDOR', 'Personal de ventas - gestión de clientes, cotizaciones y pedidos', false),
      ('CAJERO', 'Operador de caja POS - ventas y gestión de caja', false),
      ('ALMACENERO', 'Personal de almacén - inventario, logística y recepciones', false),
      ('CONTADOR', 'Personal contable - finanzas, contabilidad y reportes', false),
      ('SUPERVISOR', 'Supervisor con permisos de aprobación y supervisión', false)
    ) AS t(nombre, descripcion, is_system_role)
  LOOP
    INSERT INTO roles (tenant_id, nombre, descripcion, is_system_role, created_at, updated_at)
    VALUES (p_tenant_id, v_rol.nombre, v_rol.descripcion, v_rol.is_system_role, NOW(), NOW())
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Contar roles creados
  SELECT COUNT(*) INTO v_count FROM roles WHERE tenant_id = p_tenant_id;
  
  RETURN v_count;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION seed_roles_tenant(UUID) IS 
  'Crea los roles por defecto para un tenant específico';

-- =====================================================
-- PARTE 3: FUNCIÓN PARA ASIGNAR PERMISOS A ROLES
-- =====================================================

CREATE OR REPLACE FUNCTION seed_rol_permisos_tenant(p_tenant_id UUID)
RETURNS INTEGER AS $fn$
DECLARE
  v_count INTEGER := 0;
  v_admin_id UUID;
  v_vendedor_id UUID;
  v_cajero_id UUID;
  v_almacenero_id UUID;
  v_contador_id UUID;
  v_supervisor_id UUID;
  v_permiso RECORD;
BEGIN
  -- Obtener IDs de roles
  SELECT id INTO v_admin_id FROM roles WHERE tenant_id = p_tenant_id AND nombre = 'ADMIN';
  SELECT id INTO v_vendedor_id FROM roles WHERE tenant_id = p_tenant_id AND nombre = 'VENDEDOR';
  SELECT id INTO v_cajero_id FROM roles WHERE tenant_id = p_tenant_id AND nombre = 'CAJERO';
  SELECT id INTO v_almacenero_id FROM roles WHERE tenant_id = p_tenant_id AND nombre = 'ALMACENERO';
  SELECT id INTO v_contador_id FROM roles WHERE tenant_id = p_tenant_id AND nombre = 'CONTADOR';
  SELECT id INTO v_supervisor_id FROM roles WHERE tenant_id = p_tenant_id AND nombre = 'SUPERVISOR';

  -- Verificar que existen los roles
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Rol ADMIN no encontrado para tenant %', p_tenant_id;
  END IF;

  -- ============================================
  -- ROL: ADMIN - TODOS LOS PERMISOS
  -- ============================================
  INSERT INTO rol_permisos (role_id, permiso_id, concedido, created_at)
  SELECT v_admin_id, p.id, true, NOW()
  FROM permisos p
  WHERE p.tenant_id = p_tenant_id
  ON CONFLICT DO NOTHING;

  -- ============================================
  -- ROL: SUPERVISOR - CASI TODOS LOS PERMISOS (excepto config crítica)
  -- ============================================
  IF v_supervisor_id IS NOT NULL THEN
    INSERT INTO rol_permisos (role_id, permiso_id, concedido, created_at)
    SELECT v_supervisor_id, p.id, true, NOW()
    FROM permisos p
    WHERE p.tenant_id = p_tenant_id
      AND NOT (p.modulo = 'configuracion' AND p.recurso IN ('roles', 'permisos'))
    ON CONFLICT DO NOTHING;
  END IF;

  -- ============================================
  -- ROL: VENDEDOR
  -- ============================================
  IF v_vendedor_id IS NOT NULL THEN
    -- Ventas: clientes (todo), cotizaciones (todo), pedidos (ver, crear, editar)
    INSERT INTO rol_permisos (role_id, permiso_id, concedido, created_at)
    SELECT v_vendedor_id, p.id, true, NOW()
    FROM permisos p
    WHERE p.tenant_id = p_tenant_id
      AND (
        (p.modulo = 'ventas' AND p.recurso = 'clientes')
        OR (p.modulo = 'ventas' AND p.recurso = 'cotizaciones')
        OR (p.modulo = 'ventas' AND p.recurso = 'pedidos' AND p.accion IN ('ver', 'crear', 'editar', 'ver_historial'))
        OR (p.modulo = 'ventas' AND p.recurso = 'facturas' AND p.accion IN ('ver', 'crear'))
        OR (p.modulo = 'ventas' AND p.recurso = 'rma' AND p.accion IN ('ver', 'crear'))
        OR (p.modulo = 'inventario' AND p.recurso = 'productos' AND p.accion = 'ver')
        OR (p.modulo = 'inventario' AND p.recurso = 'stock' AND p.accion = 'ver')
        OR (p.modulo = 'inventario' AND p.recurso = 'almacenes' AND p.accion = 'ver')
        OR (p.modulo = 'finanzas' AND p.recurso = 'cxc' AND p.accion = 'ver')
        OR (p.modulo = 'finanzas' AND p.recurso = 'cobros' AND p.accion IN ('ver', 'crear'))
        OR (p.modulo = 'pos' AND p.recurso = 'ventas')
        OR (p.modulo = 'reportes' AND p.recurso IN ('dashboard', 'ventas'))
      )
    ON CONFLICT DO NOTHING;
  END IF;

  -- ============================================
  -- ROL: CAJERO
  -- ============================================
  IF v_cajero_id IS NOT NULL THEN
    INSERT INTO rol_permisos (role_id, permiso_id, concedido, created_at)
    SELECT v_cajero_id, p.id, true, NOW()
    FROM permisos p
    WHERE p.tenant_id = p_tenant_id
      AND (
        (p.modulo = 'pos' AND p.recurso = 'ventas')
        OR (p.modulo = 'pos' AND p.recurso = 'cajas' AND p.accion IN ('ver', 'abrir', 'cerrar', 'arqueo'))
        OR (p.modulo = 'pos' AND p.recurso = 'turnos' AND p.accion IN ('ver', 'iniciar', 'cerrar'))
        OR (p.modulo = 'pos' AND p.recurso = 'devoluciones')
        OR (p.modulo = 'ventas' AND p.recurso = 'clientes' AND p.accion = 'ver')
        OR (p.modulo = 'inventario' AND p.recurso = 'productos' AND p.accion = 'ver')
        OR (p.modulo = 'inventario' AND p.recurso = 'stock' AND p.accion = 'ver')
        OR (p.modulo = 'finanzas' AND p.recurso = 'cobros' AND p.accion IN ('ver', 'crear'))
        OR (p.modulo = 'reportes' AND p.recurso = 'dashboard' AND p.accion = 'ver')
      )
    ON CONFLICT DO NOTHING;
  END IF;

  -- ============================================
  -- ROL: ALMACENERO
  -- ============================================
  IF v_almacenero_id IS NOT NULL THEN
    INSERT INTO rol_permisos (role_id, permiso_id, concedido, created_at)
    SELECT v_almacenero_id, p.id, true, NOW()
    FROM permisos p
    WHERE p.tenant_id = p_tenant_id
      AND (
        (p.modulo = 'inventario' AND p.recurso = 'productos')
        OR (p.modulo = 'inventario' AND p.recurso = 'almacenes')
        OR (p.modulo = 'inventario' AND p.recurso = 'stock')
        OR (p.modulo = 'inventario' AND p.recurso = 'movimientos')
        OR (p.modulo = 'inventario' AND p.recurso = 'kardex' AND p.accion = 'ver')
        OR (p.modulo = 'inventario' AND p.recurso = 'logistica')
        OR (p.modulo = 'inventario' AND p.recurso = 'transferencias')
        OR (p.modulo = 'inventario' AND p.recurso = 'ingresos')
        OR (p.modulo = 'inventario' AND p.recurso = 'salidas')
        OR (p.modulo = 'inventario' AND p.recurso = 'stats')
        OR (p.modulo = 'compras' AND p.recurso = 'proveedores' AND p.accion = 'ver')
        OR (p.modulo = 'compras' AND p.recurso = 'ordenes_compra' AND p.accion IN ('ver', 'crear'))
        OR (p.modulo = 'compras' AND p.recurso = 'recepciones')
        OR (p.modulo = 'ventas' AND p.recurso = 'pedidos' AND p.accion = 'ver')
        OR (p.modulo = 'ventas' AND p.recurso = 'rma' AND p.accion = 'recepcionar')
        OR (p.modulo = 'reportes' AND p.recurso IN ('dashboard', 'inventario'))
      )
    ON CONFLICT DO NOTHING;
  END IF;

  -- ============================================
  -- ROL: CONTADOR
  -- ============================================
  IF v_contador_id IS NOT NULL THEN
    INSERT INTO rol_permisos (role_id, permiso_id, concedido, created_at)
    SELECT v_contador_id, p.id, true, NOW()
    FROM permisos p
    WHERE p.tenant_id = p_tenant_id
      AND (
        (p.modulo = 'finanzas')
        OR (p.modulo = 'contabilidad')
        OR (p.modulo = 'ventas' AND p.recurso = 'facturas')
        OR (p.modulo = 'ventas' AND p.recurso = 'notas_credito')
        OR (p.modulo = 'ventas' AND p.recurso = 'notas_debito')
        OR (p.modulo = 'ventas' AND p.recurso IN ('clientes', 'pedidos', 'rma') AND p.accion = 'ver')
        OR (p.modulo = 'compras' AND p.recurso = 'proveedores' AND p.accion = 'ver')
        OR (p.modulo = 'compras' AND p.recurso = 'ordenes_compra' AND p.accion = 'ver')
        OR (p.modulo = 'compras' AND p.recurso = 'recepciones' AND p.accion = 'ver')
        OR (p.modulo = 'inventario' AND p.recurso IN ('productos', 'stock', 'almacenes', 'kardex') AND p.accion = 'ver')
        OR (p.modulo = 'pos' AND p.recurso IN ('ventas', 'cajas', 'turnos') AND p.accion = 'ver')
        OR (p.modulo = 'reportes')
      )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Contar asignaciones
  SELECT COUNT(*) INTO v_count 
  FROM rol_permisos rp
  JOIN roles r ON r.id = rp.role_id
  WHERE r.tenant_id = p_tenant_id;
  
  RETURN v_count;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION seed_rol_permisos_tenant(UUID) IS 
  'Asigna permisos a cada rol según la matriz de permisos definida';


-- =====================================================
-- PARTE 4: FUNCIÓN ORQUESTADORA PRINCIPAL
-- =====================================================

CREATE OR REPLACE FUNCTION seed_roles_permisos_tenant(p_tenant_id UUID)
RETURNS JSONB AS $fn$
DECLARE
  v_permisos_count INTEGER;
  v_roles_count INTEGER;
  v_asignaciones_count INTEGER;
  v_result JSONB;
BEGIN
  -- Verificar que el tenant existe
  IF NOT EXISTS (SELECT 1 FROM empresa_config WHERE tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant % no encontrado', p_tenant_id;
  END IF;

  -- Verificar si ya tiene roles (evitar duplicados)
  IF EXISTS (SELECT 1 FROM roles WHERE tenant_id = p_tenant_id LIMIT 1) THEN
    RAISE NOTICE 'Tenant % ya tiene roles configurados, omitiendo seed', p_tenant_id;
    
    SELECT COUNT(*) INTO v_permisos_count FROM permisos WHERE tenant_id = p_tenant_id;
    SELECT COUNT(*) INTO v_roles_count FROM roles WHERE tenant_id = p_tenant_id;
    SELECT COUNT(*) INTO v_asignaciones_count 
    FROM rol_permisos rp JOIN roles r ON r.id = rp.role_id WHERE r.tenant_id = p_tenant_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'message', 'Tenant ya tiene roles configurados',
      'permisos_count', v_permisos_count,
      'roles_count', v_roles_count,
      'asignaciones_count', v_asignaciones_count
    );
  END IF;

  -- Paso 1: Crear permisos
  v_permisos_count := seed_permisos_tenant(p_tenant_id);
  RAISE NOTICE '✅ Permisos creados: %', v_permisos_count;

  -- Paso 2: Crear roles
  v_roles_count := seed_roles_tenant(p_tenant_id);
  RAISE NOTICE '✅ Roles creados: %', v_roles_count;

  -- Paso 3: Asignar permisos a roles
  v_asignaciones_count := seed_rol_permisos_tenant(p_tenant_id);
  RAISE NOTICE '✅ Asignaciones rol-permiso: %', v_asignaciones_count;

  v_result := jsonb_build_object(
    'success', true,
    'skipped', false,
    'tenant_id', p_tenant_id,
    'permisos_count', v_permisos_count,
    'roles_count', v_roles_count,
    'asignaciones_count', v_asignaciones_count
  );

  RAISE NOTICE '🎉 Seed de roles y permisos completado para tenant %', p_tenant_id;
  
  RETURN v_result;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION seed_roles_permisos_tenant(UUID) IS 
  'Función principal que orquesta la creación de permisos, roles y asignaciones para un tenant';

-- =====================================================
-- PARTE 5: FUNCIÓN PARA ASIGNAR ROL ADMIN A USUARIO
-- =====================================================

CREATE OR REPLACE FUNCTION asignar_rol_admin_usuario(p_tenant_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $fn$
DECLARE
  v_admin_role_id UUID;
BEGIN
  -- Obtener el rol ADMIN del tenant
  SELECT id INTO v_admin_role_id 
  FROM roles 
  WHERE tenant_id = p_tenant_id AND nombre = 'ADMIN';

  IF v_admin_role_id IS NULL THEN
    RAISE WARNING 'Rol ADMIN no encontrado para tenant %, ejecutando seed primero', p_tenant_id;
    PERFORM seed_roles_permisos_tenant(p_tenant_id);
    
    SELECT id INTO v_admin_role_id 
    FROM roles 
    WHERE tenant_id = p_tenant_id AND nombre = 'ADMIN';
    
    IF v_admin_role_id IS NULL THEN
      RAISE EXCEPTION 'No se pudo crear el rol ADMIN para tenant %', p_tenant_id;
    END IF;
  END IF;

  -- Verificar que el usuario existe y pertenece al tenant
  IF NOT EXISTS (
    SELECT 1 FROM usuarios_sistema 
    WHERE id = p_user_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Usuario % no encontrado en tenant %', p_user_id, p_tenant_id;
  END IF;

  -- Asignar rol ADMIN al usuario
  INSERT INTO user_roles (usuario_sistema_id, role_id, created_at)
  VALUES (p_user_id, v_admin_role_id, NOW())
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✅ Rol ADMIN asignado a usuario % en tenant %', p_user_id, p_tenant_id;
  
  RETURN true;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION asignar_rol_admin_usuario(UUID, UUID) IS 
  'Asigna el rol ADMIN a un usuario específico del tenant';

-- =====================================================
-- PARTE 6: TRIGGER PARA NUEVOS TENANTS
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_seed_roles_permisos_on_tenant_create()
RETURNS TRIGGER AS $fn$
BEGIN
  -- Solo ejecutar si es un INSERT nuevo
  IF TG_OP = 'INSERT' THEN
    BEGIN
      PERFORM seed_roles_permisos_tenant(NEW.tenant_id);
      RAISE NOTICE '✅ Roles y permisos creados automáticamente para tenant %', NEW.tenant_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '⚠️ Error creando roles/permisos para tenant %: %', NEW.tenant_id, SQLERRM;
      -- No fallar la transacción, solo advertir
    END;
  END IF;
  
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger existente si existe
DROP TRIGGER IF EXISTS trigger_seed_roles_permisos_on_tenant ON empresa_config;

-- Crear trigger
CREATE TRIGGER trigger_seed_roles_permisos_on_tenant
  AFTER INSERT ON empresa_config
  FOR EACH ROW
  EXECUTE FUNCTION trigger_seed_roles_permisos_on_tenant_create();

COMMENT ON TRIGGER trigger_seed_roles_permisos_on_tenant ON empresa_config IS 
  'Crea automáticamente roles y permisos cuando se crea un nuevo tenant';

-- =====================================================
-- PARTE 7: ACTUALIZAR create_demo_tenant PARA ASIGNAR ROL
-- =====================================================

-- Recrear la función create_demo_tenant con asignación de rol
CREATE OR REPLACE FUNCTION create_demo_tenant(
  p_nombre VARCHAR DEFAULT 'DEMO COMERCIAL SAC',
  p_dias_duracion INTEGER DEFAULT 14
)
RETURNS JSONB AS $fn$
DECLARE
  v_tenant_id UUID := gen_random_uuid();
  v_user_id UUID := gen_random_uuid();
  v_demo_email VARCHAR;
  v_demo_password VARCHAR;
  v_expires_at TIMESTAMPTZ;
  v_roles_result JSONB;
BEGIN
  v_demo_email := 'demo-' || LEFT(v_tenant_id::text, 8) || '@temp.local';
  v_demo_password := UPPER(LEFT(md5(random()::text), 8));
  v_expires_at := NOW() + (p_dias_duracion || ' days')::INTERVAL;

  -- Establecer contexto para triggers de auditoría
  PERFORM set_config('app.current_tenant_id', v_tenant_id::text, false);
  PERFORM set_config('app.current_user_id', v_user_id::text, false);

  -- 1. Crear usuario primero (el audit necesita user_id válido)
  INSERT INTO usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, is_demo_user, demo_email_temp, activo, estado
  ) VALUES (
    v_user_id, v_tenant_id, 'Usuario', 'Demo', v_demo_email, 'demo',
    crypt(v_demo_password, gen_salt('bf', 10)), true, v_demo_email, true, 'ACTIVO'
  );

  -- 2. Crear empresa_config (esto dispara el trigger de roles/permisos)
  INSERT INTO empresa_config (
    tenant_id, razon_social, nombre_comercial, ruc, pais, moneda_defecto,
    is_demo, demo_created_at, demo_expires_at, demo_extended, 
    demo_conversion_attempted, estado, plan
  ) VALUES (
    v_tenant_id, p_nombre, p_nombre, 
    '20' || LPAD(FLOOR(RANDOM() * 1000000000)::TEXT, 9, '0'),
    'PE', 'PEN', true, NOW(), v_expires_at, false, false, 'PRUEBA', 'BASICO'
  );

  -- 3. Asignar rol ADMIN al usuario creado
  PERFORM asignar_rol_admin_usuario(v_tenant_id, v_user_id);

  -- 4. Seed de datos demo (opcional)
  BEGIN
    PERFORM seed_demo_tenant(v_tenant_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Seed parcial: %', SQLERRM;
  END;

  -- Limpiar contexto
  PERFORM set_config('app.current_tenant_id', '', false);
  PERFORM set_config('app.current_user_id', '', false);

  -- Obtener estadísticas de roles/permisos
  SELECT jsonb_build_object(
    'roles', (SELECT COUNT(*) FROM roles WHERE tenant_id = v_tenant_id),
    'permisos', (SELECT COUNT(*) FROM permisos WHERE tenant_id = v_tenant_id),
    'asignaciones', (SELECT COUNT(*) FROM rol_permisos rp JOIN roles r ON r.id = rp.role_id WHERE r.tenant_id = v_tenant_id)
  ) INTO v_roles_result;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'user_id', v_user_id,
    'email', v_demo_email,
    'password', v_demo_password,
    'expires_at', v_expires_at,
    'dias_restantes', p_dias_duracion,
    'roles_permisos', v_roles_result
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_demo_tenant(VARCHAR, INTEGER) IS 
  'Crea un tenant demo completo con usuario, roles, permisos y datos seed. Retorna credenciales.';

-- Grants
GRANT EXECUTE ON FUNCTION create_demo_tenant(VARCHAR, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION create_demo_tenant(VARCHAR, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION create_demo_tenant(VARCHAR, INTEGER) TO service_role;


-- =====================================================
-- PARTE 8: MIGRAR TENANTS EXISTENTES
-- =====================================================

DO $migrate$
DECLARE
  v_tenant RECORD;
  v_count INTEGER := 0;
  v_success INTEGER := 0;
  v_failed INTEGER := 0;
  v_result JSONB;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔄 Iniciando migración de roles y permisos para tenants existentes...';
  RAISE NOTICE '';

  -- Obtener todos los tenants que NO tienen roles
  FOR v_tenant IN 
    SELECT DISTINCT ec.tenant_id, ec.razon_social
    FROM empresa_config ec
    WHERE ec.tenant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM roles r WHERE r.tenant_id = ec.tenant_id
      )
  LOOP
    v_count := v_count + 1;
    
    BEGIN
      -- Ejecutar seed de roles y permisos
      v_result := seed_roles_permisos_tenant(v_tenant.tenant_id);
      
      -- Buscar el primer usuario del tenant y asignarle rol ADMIN
      DECLARE
        v_first_user_id UUID;
      BEGIN
        SELECT id INTO v_first_user_id
        FROM usuarios_sistema
        WHERE tenant_id = v_tenant.tenant_id
        ORDER BY created_at ASC
        LIMIT 1;
        
        IF v_first_user_id IS NOT NULL THEN
          PERFORM asignar_rol_admin_usuario(v_tenant.tenant_id, v_first_user_id);
          RAISE NOTICE '  ✅ Rol ADMIN asignado a usuario %', v_first_user_id;
        END IF;
      END;
      
      v_success := v_success + 1;
      RAISE NOTICE '✅ [%/%] Tenant % (%): roles=%s, permisos=%s', 
        v_count, v_count, v_tenant.tenant_id, v_tenant.razon_social,
        v_result->>'roles_count', v_result->>'permisos_count';
        
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING '❌ [%/%] Error en tenant % (%): %', 
        v_count, v_count, v_tenant.tenant_id, v_tenant.razon_social, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '📊 Resumen de migración:';
  RAISE NOTICE '  - Tenants procesados: %', v_count;
  RAISE NOTICE '  - Exitosos: %', v_success;
  RAISE NOTICE '  - Fallidos: %', v_failed;
  RAISE NOTICE '';

  IF v_count = 0 THEN
    RAISE NOTICE '✅ No hay tenants pendientes de migrar (todos ya tienen roles)';
  ELSIF v_failed = 0 THEN
    RAISE NOTICE '🎉 Migración completada exitosamente';
  ELSE
    RAISE WARNING '⚠️ Migración completada con % errores', v_failed;
  END IF;
END $migrate$;

-- =====================================================
-- PARTE 9: GRANTS Y PERMISOS
-- =====================================================

GRANT EXECUTE ON FUNCTION seed_permisos_tenant(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION seed_roles_tenant(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION seed_rol_permisos_tenant(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION seed_roles_permisos_tenant(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION asignar_rol_admin_usuario(UUID, UUID) TO service_role;

-- =====================================================
-- PARTE 10: VERIFICACIÓN FINAL
-- =====================================================

DO $verify$
DECLARE
  v_tenants_total INTEGER;
  v_tenants_con_roles INTEGER;
  v_tenants_sin_roles INTEGER;
  v_total_roles INTEGER;
  v_total_permisos INTEGER;
  v_total_asignaciones INTEGER;
BEGIN
  SELECT COUNT(DISTINCT tenant_id) INTO v_tenants_total FROM empresa_config;
  
  SELECT COUNT(DISTINCT tenant_id) INTO v_tenants_con_roles 
  FROM roles;
  
  v_tenants_sin_roles := v_tenants_total - v_tenants_con_roles;
  
  SELECT COUNT(*) INTO v_total_roles FROM roles;
  SELECT COUNT(*) INTO v_total_permisos FROM permisos;
  SELECT COUNT(*) INTO v_total_asignaciones FROM rol_permisos;

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ MIGRACIÓN 147 COMPLETADA: Seed de Roles y Permisos';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Estadísticas globales:';
  RAISE NOTICE '  - Tenants totales: %', v_tenants_total;
  RAISE NOTICE '  - Tenants con roles: %', v_tenants_con_roles;
  RAISE NOTICE '  - Tenants sin roles: %', v_tenants_sin_roles;
  RAISE NOTICE '  - Total roles: %', v_total_roles;
  RAISE NOTICE '  - Total permisos: %', v_total_permisos;
  RAISE NOTICE '  - Total asignaciones rol-permiso: %', v_total_asignaciones;
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Funciones creadas:';
  RAISE NOTICE '  - seed_permisos_tenant(UUID)';
  RAISE NOTICE '  - seed_roles_tenant(UUID)';
  RAISE NOTICE '  - seed_rol_permisos_tenant(UUID)';
  RAISE NOTICE '  - seed_roles_permisos_tenant(UUID)';
  RAISE NOTICE '  - asignar_rol_admin_usuario(UUID, UUID)';
  RAISE NOTICE '';
  RAISE NOTICE '⚡ Trigger creado:';
  RAISE NOTICE '  - trigger_seed_roles_permisos_on_tenant (AFTER INSERT ON empresa_config)';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Ahora cuando se crea un tenant:';
  RAISE NOTICE '  1. Se crean automáticamente 6 roles (ADMIN, VENDEDOR, CAJERO, etc.)';
  RAISE NOTICE '  2. Se crean ~85 permisos por módulo';
  RAISE NOTICE '  3. Se asignan permisos a cada rol según matriz';
  RAISE NOTICE '  4. El usuario admin recibe el rol ADMIN';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $verify$;

COMMIT;
