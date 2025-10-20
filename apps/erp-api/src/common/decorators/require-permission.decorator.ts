import { SetMetadata } from '@nestjs/common';

/**
 * Key para almacenar los metadatos de permisos
 */
export const PERMISSION_KEY = 'permission';

/**
 * ✅ MULTI-TENANT: Decorator para requerir permisos específicos
 * 
 * Este decorator se usa en conjunto con el PermissionGuard para validar
 * que el usuario tenga los permisos necesarios para ejecutar una acción.
 * 
 * @param modulo - Módulo del sistema (ventas, compras, inventario, etc.)
 * @param accion - Acción a realizar (create, read, update, delete, export, etc.)
 * @param recurso - Recurso específico (clientes, productos, facturas, etc.)
 * 
 * Uso:
 * @UseGuards(JwtAuthGuard, PermissionGuard)
 * @RequirePermission('ventas', 'create', 'facturas')
 * @Post('facturas')
 * createFactura(@CurrentTenant() tenantId: string, @Body() data: CreateFacturaDto) {
 *   return this.service.createFactura(tenantId, data);
 * }
 * 
 * Ejemplos:
 * - @RequirePermission('ventas', 'read', 'facturas') - Ver facturas
 * - @RequirePermission('ventas', 'create', 'facturas') - Crear facturas
 * - @RequirePermission('inventario', 'update', 'productos') - Actualizar productos
 * - @RequirePermission('contabilidad', 'delete', 'asientos') - Eliminar asientos
 * - @RequirePermission('reportes', 'export', 'ventas') - Exportar reportes de ventas
 */
export const RequirePermission = (
  modulo: string,
  accion: string,
  recurso: string,
) => {
  return SetMetadata(PERMISSION_KEY, { modulo, accion, recurso });
};
