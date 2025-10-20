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
 * Todos los permisos del módulo de Ventas
 */
export const ALL_VENTAS_PERMISSIONS: PermissionDefinition[] = [
  ...VENTAS_CLIENTES_PERMISSIONS,
  ...VENTAS_COTIZACIONES_PERMISSIONS,
  ...VENTAS_PEDIDOS_PERMISSIONS,
  ...INVENTARIO_LOGISTICA_PERMISSIONS,
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
