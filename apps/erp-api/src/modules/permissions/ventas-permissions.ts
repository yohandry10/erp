/**
 * Definición de permisos para el módulo de Ventas
 * Requirements: 14.1, 14.3, 14.4, 14.5, 14.6
 */

export interface PermissionDefinition {
  modulo: string;
  recurso: string;
  accion: string;
  descripcion: string;
}

/**
 * Permisos del módulo de Ventas - Clientes
 * Requirements: 14.1
 */
export const VENTAS_CLIENTES_PERMISSIONS: PermissionDefinition[] = [
  {
    modulo: 'ventas',
    recurso: 'clientes',
    accion: 'ver',
    descripcion: 'Ver lista y detalles de clientes',
  },
  {
    modulo: 'ventas',
    recurso: 'clientes',
    accion: 'crear',
    descripcion: 'Crear nuevos clientes',
  },
  {
    modulo: 'ventas',
    recurso: 'clientes',
    accion: 'editar',
    descripcion: 'Editar información de clientes existentes',
  },
  {
    modulo: 'ventas',
    recurso: 'clientes',
    accion: 'eliminar',
    descripcion: 'Eliminar clientes del sistema',
  },
  {
    modulo: 'ventas',
    recurso: 'clientes',
    accion: 'validar_ruc',
    descripcion: 'Validar RUC con SUNAT',
  },
];

/**
 * Permisos del módulo de Ventas - Cotizaciones
 * Requirements: 14.3
 */
export const VENTAS_COTIZACIONES_PERMISSIONS: PermissionDefinition[] = [
  {
    modulo: 'ventas',
    recurso: 'cotizaciones',
    accion: 'ver',
    descripcion: 'Ver lista y detalles de cotizaciones',
  },
  {
    modulo: 'ventas',
    recurso: 'cotizaciones',
    accion: 'crear',
    descripcion: 'Crear nuevas cotizaciones',
  },
  {
    modulo: 'ventas',
    recurso: 'cotizaciones',
    accion: 'editar',
    descripcion: 'Editar cotizaciones existentes',
  },
  {
    modulo: 'ventas',
    recurso: 'cotizaciones',
    accion: 'eliminar',
    descripcion: 'Eliminar cotizaciones',
  },
  {
    modulo: 'ventas',
    recurso: 'cotizaciones',
    accion: 'convertir_pedido',
    descripcion: 'Convertir cotizaciones a pedidos de venta',
  },
];

/**
 * Permisos del módulo de Ventas - Pedidos
 * Requirements: 14.4, 14.5
 */
export const VENTAS_PEDIDOS_PERMISSIONS: PermissionDefinition[] = [
  {
    modulo: 'ventas',
    recurso: 'pedidos',
    accion: 'ver',
    descripcion: 'Ver lista y detalles de pedidos de venta',
  },
  {
    modulo: 'ventas',
    recurso: 'pedidos',
    accion: 'crear',
    descripcion: 'Crear nuevos pedidos de venta',
  },
  {
    modulo: 'ventas',
    recurso: 'pedidos',
    accion: 'editar',
    descripcion: 'Editar pedidos de venta en estado PENDIENTE',
  },
  {
    modulo: 'ventas',
    recurso: 'pedidos',
    accion: 'confirmar',
    descripcion: 'Confirmar pedidos y reservar stock',
  },
  {
    modulo: 'ventas',
    recurso: 'pedidos',
    accion: 'cancelar',
    descripcion: 'Cancelar pedidos y liberar reservas',
  },
  {
    modulo: 'ventas',
    recurso: 'pedidos',
    accion: 'generar_factura',
    descripcion: 'Generar facturas desde pedidos',
  },
];

/**
 * Permisos del módulo de Ventas - Aprobaciones de pedidos
 */
export const VENTAS_APROBACIONES_PERMISSIONS: PermissionDefinition[] = [
  {
    modulo: 'ventas',
    recurso: 'aprobaciones',
    accion: 'ver',
    descripcion: 'Ver bandeja e historial de aprobaciones de pedidos',
  },
  {
    modulo: 'ventas',
    recurso: 'aprobaciones',
    accion: 'resolver',
    descripcion: 'Aprobar o rechazar pedidos pendientes de autorización',
  },
];

/**
 * Permisos del módulo de Inventario - Logística
 * Requirements: 14.6
 */
export const INVENTARIO_LOGISTICA_PERMISSIONS: PermissionDefinition[] = [
  {
    modulo: 'inventario',
    recurso: 'logistica',
    accion: 'ver',
    descripcion: 'Ver órdenes pendientes de preparación',
  },
  {
    modulo: 'inventario',
    recurso: 'logistica',
    accion: 'preparar',
    descripcion: 'Preparar pedidos en almacén',
  },
  {
    modulo: 'inventario',
    recurso: 'logistica',
    accion: 'despachar',
    descripcion: 'Confirmar despacho de pedidos',
  },
];

/**
 * Permisos núcleo de inventario (almacenes, recepciones, kardex)
 */
export const INVENTARIO_CORE_PERMISSIONS: PermissionDefinition[] = [
  {
    modulo: 'inventario',
    recurso: 'almacenes',
    accion: 'read',
    descripcion: 'Consultar almacenes y ubicaciones activas',
  },
  {
    modulo: 'inventario',
    recurso: 'ingresos',
    accion: 'write',
    descripcion: 'Registrar recepciones y notas de ingreso',
  },
  {
    modulo: 'inventario',
    recurso: 'salidas',
    accion: 'write',
    descripcion: 'Registrar salidas y notas de salida de almacén',
  },
  {
    modulo: 'inventario',
    recurso: 'transferencias',
    accion: 'write',
    descripcion: 'Gestionar transferencias entre almacenes y ubicaciones',
  },
  {
    modulo: 'inventario',
    recurso: 'kardex',
    accion: 'read',
    descripcion: 'Consultar kardex valorizado y movimientos por producto',
  },
  {
    modulo: 'inventario',
    recurso: 'movimientos',
    accion: 'read',
    descripcion: 'Listar movimientos de stock históricos',
  },
  {
    modulo: 'inventario',
    recurso: 'movimientos',
    accion: 'create',
    descripcion: 'Registrar movimientos manuales de inventario',
  },
  {
    modulo: 'inventario',
    recurso: 'stats',
    accion: 'read',
    descripcion: 'Visualizar estadísticas de inventario',
  },
];

export const VENTAS_RMA_PERMISSIONS: PermissionDefinition[] = [
  {
    modulo: 'ventas',
    recurso: 'rma',
    accion: 'ver',
    descripcion: 'Ver solicitudes de RMA y su historial',
  },
  {
    modulo: 'ventas',
    recurso: 'rma',
    accion: 'crear',
    descripcion: 'Registrar solicitudes de RMA y devoluciones',
  },
  {
    modulo: 'ventas',
    recurso: 'rma',
    accion: 'aprobar',
    descripcion: 'Aprobar o rechazar solicitudes de RMA',
  },
  {
    modulo: 'ventas',
    recurso: 'rma',
    accion: 'recepcionar',
    descripcion: 'Registrar la recepción física de devoluciones RMA',
  },
  {
    modulo: 'ventas',
    recurso: 'rma',
    accion: 'generar_nota_credito',
    descripcion: 'Generar notas de crédito asociadas a RMA',
  },
];

export const VENTAS_COMERCIAL_PERMISSIONS: PermissionDefinition[] = [
  {
    modulo: 'ventas',
    recurso: 'precios',
    accion: 'ver',
    descripcion: 'Consultar listas y precios comerciales vigentes',
  },
  {
    modulo: 'ventas',
    recurso: 'precios',
    accion: 'gestionar',
    descripcion: 'Registrar y activar o desactivar listas de precios',
  },
  {
    modulo: 'ventas',
    recurso: 'comisiones',
    accion: 'ver',
    descripcion: 'Consultar reglas, devengos, reversas y reintegros de comisión',
  },
  {
    modulo: 'ventas',
    recurso: 'comisiones',
    accion: 'gestionar',
    descripcion: 'Registrar y activar o desactivar reglas de comisión',
  },
  {
    modulo: 'ventas',
    recurso: 'consolidados',
    accion: 'ver',
    descripcion: 'Consultar bloques inmutables de ventas',
  },
  {
    modulo: 'ventas',
    recurso: 'consolidados',
    accion: 'crear',
    descripcion: 'Crear bloques inmutables de ventas válidas',
  },
];

/**
 * Todos los permisos del módulo de Ventas
 */
export const ALL_VENTAS_PERMISSIONS: PermissionDefinition[] = [
  ...VENTAS_CLIENTES_PERMISSIONS,
  ...VENTAS_COTIZACIONES_PERMISSIONS,
  ...VENTAS_PEDIDOS_PERMISSIONS,
  ...VENTAS_APROBACIONES_PERMISSIONS,
  ...INVENTARIO_CORE_PERMISSIONS,
  ...INVENTARIO_LOGISTICA_PERMISSIONS,
  ...VENTAS_RMA_PERMISSIONS,
  ...VENTAS_COMERCIAL_PERMISSIONS,
];

/**
 * Helper para generar el código de permiso completo
 * Formato: modulo.recurso.accion
 */
export function getPermissionCode(permission: PermissionDefinition): string {
  return `${permission.modulo}.${permission.recurso}.${permission.accion}`;
}

/**
 * Helper para verificar si un código de permiso es válido
 */
export function isValidPermissionCode(code: string): boolean {
  const parts = code.split('.');
  if (parts.length !== 3) return false;

  const [modulo, recurso, accion] = parts;
  return ALL_VENTAS_PERMISSIONS.some(
    p => p.modulo === modulo && p.recurso === recurso && p.accion === accion
  );
}
