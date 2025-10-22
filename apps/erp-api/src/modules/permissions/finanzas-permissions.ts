import type { PermissionDefinition } from './ventas-permissions';

/**
 * Permisos para módulo de Finanzas - Cuentas por Cobrar
 */
export const FINANZAS_CXC_PERMISSIONS: PermissionDefinition[] = [
  {
    modulo: 'finanzas',
    recurso: 'cxc',
    accion: 'ver',
    descripcion: 'Ver bandejas y detalle de cuentas por cobrar',
  },
  {
    modulo: 'finanzas',
    recurso: 'cxc',
    accion: 'gestionar',
    descripcion: 'Registrar pagos parciales, anticipos y actualizar estados de CxC',
  },
];

/**
 * Permisos del módulo de Finanzas
 */
export const ALL_FINANZAS_PERMISSIONS: PermissionDefinition[] = [...FINANZAS_CXC_PERMISSIONS];
