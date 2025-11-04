import type { PermissionDefinition } from './ventas-permissions';

/**
 * Permisos para módulo de Finanzas - Cuentas por Cobrar
 */
export const FINANZAS_CXC_PERMISSIONS: PermissionDefinition[] = [
  {
    modulo: 'finanzas',
    recurso: 'cxc',
    accion: 'read',
    descripcion: 'Ver bandejas, aging y detalle de cuentas por cobrar',
  },
  {
    modulo: 'finanzas',
    recurso: 'cxc.cobros',
    accion: 'write',
    descripcion: 'Registrar cobros, notas de crédito y reprogramaciones de cartera',
  },
];

/**
 * Permisos del módulo de Finanzas
 */
export const ALL_FINANZAS_PERMISSIONS: PermissionDefinition[] = [...FINANZAS_CXC_PERMISSIONS];
