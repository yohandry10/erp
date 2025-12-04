-- =====================================================
-- Migración 153: Agregar permiso de auditoría de seguridad
-- =====================================================
-- Descripción: Agrega el permiso security.audit.read para que
--              el Admin del tenant pueda ver los logs de auditoría
-- Fecha: 2025-11-29
-- =====================================================

BEGIN;

-- Deshabilitar triggers temporalmente para evitar errores de contexto de tenant
SET session_replication_role = replica;

-- =====================================================
-- PARTE 1: Agregar permiso de auditoría a la función seed
-- =====================================================

-- Actualizar la función seed_permisos_tenant para incluir permisos de seguridad
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
  -- MÓDULO: SEGURIDAD (NUEVO)
  -- ============================================
  
  FOR v_permiso IN 
    SELECT * FROM (VALUES
      ('security', 'audit', 'read', 'Ver logs de auditoría del sistema'),
      ('security', 'audit', 'export', 'Exportar logs de auditoría'),
      ('security', 'sessions', 'view', 'Ver sesiones activas de usuarios'),
      ('security', 'sessions', 'terminate', 'Terminar sesiones de usuarios')
    ) AS t(modulo, recurso, accion, descripcion)
  LOOP
    INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
    VALUES (p_tenant_id, v_permiso.modulo, v_permiso.recurso, v_permiso.accion, v_permiso.descripcion, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

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

-- =====================================================
-- PARTE 2: Agregar permisos de seguridad a tenants existentes
-- =====================================================

-- Insertar permisos de seguridad para todos los tenants existentes
INSERT INTO permisos (tenant_id, modulo, recurso, accion, descripcion, activo)
SELECT 
  ec.tenant_id,
  p.modulo,
  p.recurso,
  p.accion,
  p.descripcion,
  true
FROM empresa_config ec
CROSS JOIN (VALUES
  ('security', 'audit', 'read', 'Ver logs de auditoría del sistema'),
  ('security', 'audit', 'export', 'Exportar logs de auditoría'),
  ('security', 'sessions', 'view', 'Ver sesiones activas de usuarios'),
  ('security', 'sessions', 'terminate', 'Terminar sesiones de usuarios')
) AS p(modulo, recurso, accion, descripcion)
ON CONFLICT DO NOTHING;

-- =====================================================
-- PARTE 3: Asignar permisos de seguridad al rol ADMIN
-- =====================================================

-- Asignar permisos de seguridad al rol ADMIN de cada tenant
INSERT INTO rol_permisos (role_id, permiso_id, concedido, created_at)
SELECT 
  r.id as role_id,
  p.id as permiso_id,
  true as concedido,
  NOW() as created_at
FROM roles r
JOIN permisos p ON p.tenant_id = r.tenant_id
WHERE r.nombre = 'ADMIN'
  AND p.modulo = 'security'
ON CONFLICT DO NOTHING;

-- También asignar al rol SUPERVISOR si existe
INSERT INTO rol_permisos (role_id, permiso_id, concedido, created_at)
SELECT 
  r.id as role_id,
  p.id as permiso_id,
  true as concedido,
  NOW() as created_at
FROM roles r
JOIN permisos p ON p.tenant_id = r.tenant_id
WHERE r.nombre = 'SUPERVISOR'
  AND p.modulo = 'security'
  AND p.accion = 'read'  -- Solo lectura para supervisor
ON CONFLICT DO NOTHING;

-- Rehabilitar triggers
SET session_replication_role = DEFAULT;

COMMIT;
