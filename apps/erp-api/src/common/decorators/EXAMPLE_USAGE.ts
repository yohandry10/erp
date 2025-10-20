/**
 * EXAMPLE USAGE - Custom Decorators
 * 
 * This file demonstrates how to use the custom decorators in controllers.
 * DO NOT import this file - it's for reference only.
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { CurrentTenant } from './current-tenant.decorator';
import { CurrentUser } from './current-user.decorator';
import { RequirePermission } from './require-permission.decorator';
import { PermissionGuard } from '../guards/permission.guard';

// Example DTO
class CreateProductoDto {
  nombre: string;
  precio: number;
  stock: number;
}

class UpdateProductoDto {
  nombre?: string;
  precio?: number;
  stock?: number;
}

/**
 * Example Controller demonstrating decorator usage
 */
@Controller('example')
@UseGuards(JwtAuthGuard) // Apply JWT authentication to all routes
export class ExampleController {
  
  /**
   * Example 1: Using @CurrentTenant() to get tenant_id
   */
  @Get('productos')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventario', 'read', 'productos')
  async getProductos(@CurrentTenant() tenantId: string) {
    // tenantId is automatically extracted from JWT token
    console.log('Tenant ID:', tenantId);
    return { tenantId, productos: [] };
  }

  /**
   * Example 2: Using @CurrentUser() to get full user object
   */
  @Get('profile')
  async getProfile(@CurrentUser() user: any) {
    // user contains: id, email, tenant_id, roles, is_super_admin, etc.
    return {
      id: user.id,
      email: user.email,
      tenant_id: user.tenant_id,
      roles: user.roles,
      is_super_admin: user.is_super_admin,
    };
  }

  /**
   * Example 3: Combining @CurrentTenant() and @CurrentUser()
   */
  @Get('dashboard')
  async getDashboard(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return {
      tenant: tenantId,
      user: user.email,
      message: `Dashboard for ${user.email} in tenant ${tenantId}`,
    };
  }

  /**
   * Example 4: Using @RequirePermission() for CREATE operations
   */
  @Post('productos')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventario', 'create', 'productos')
  async createProducto(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() data: CreateProductoDto,
  ) {
    console.log(`User ${user.email} creating product in tenant ${tenantId}`);
    return { tenantId, data, createdBy: user.id };
  }

  /**
   * Example 5: Using @RequirePermission() for UPDATE operations
   */
  @Put('productos/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventario', 'update', 'productos')
  async updateProducto(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: UpdateProductoDto,
  ) {
    console.log(`User ${user.email} updating product ${id} in tenant ${tenantId}`);
    return { tenantId, id, data, updatedBy: user.id };
  }

  /**
   * Example 6: Using @RequirePermission() for DELETE operations
   */
  @Delete('productos/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('inventario', 'delete', 'productos')
  async deleteProducto(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    console.log(`User ${user.email} deleting product ${id} in tenant ${tenantId}`);
    return { tenantId, id, deletedBy: user.id };
  }

  /**
   * Example 7: Using @RequirePermission() for EXPORT operations
   */
  @Get('reportes/ventas/export')
  @UseGuards(PermissionGuard)
  @RequirePermission('reportes', 'export', 'ventas')
  async exportVentas(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query() filters: any,
  ) {
    console.log(`User ${user.email} exporting sales report in tenant ${tenantId}`);
    return { tenantId, filters, exportedBy: user.id };
  }

  /**
   * Example 8: Different modules and resources
   */
  @Post('facturas')
  @UseGuards(PermissionGuard)
  @RequirePermission('ventas', 'create', 'facturas')
  async createFactura(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() data: any,
  ) {
    return { tenantId, data, createdBy: user.id };
  }

  @Get('clientes')
  @UseGuards(PermissionGuard)
  @RequirePermission('ventas', 'read', 'clientes')
  async getClientes(@CurrentTenant() tenantId: string) {
    return { tenantId, clientes: [] };
  }

  @Post('asientos')
  @UseGuards(PermissionGuard)
  @RequirePermission('contabilidad', 'create', 'asientos')
  async createAsiento(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() data: any,
  ) {
    return { tenantId, data, createdBy: user.id };
  }

  @Get('proveedores')
  @UseGuards(PermissionGuard)
  @RequirePermission('compras', 'read', 'proveedores')
  async getProveedores(@CurrentTenant() tenantId: string) {
    return { tenantId, proveedores: [] };
  }

  /**
   * Example 9: Route without permission requirement
   * (Will be accessible to any authenticated user)
   */
  @Get('public-info')
  async getPublicInfo(@CurrentTenant() tenantId: string) {
    // No @RequirePermission decorator, so any authenticated user can access
    return { tenantId, info: 'This is accessible to all authenticated users' };
  }

  /**
   * Example 10: Super-admin only route
   * (Super-admins bypass all permission checks)
   */
  @Get('admin/stats')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin', 'read', 'stats')
  async getAdminStats(@CurrentUser() user: any) {
    // Super-admins will have access regardless of their roles
    // Regular users need the specific permission
    return {
      is_super_admin: user.is_super_admin,
      stats: {},
    };
  }
}

/**
 * PERMISSION VALIDATION FLOW:
 * 
 * 1. JwtAuthGuard validates the JWT token and attaches user to request
 * 2. @CurrentTenant() extracts tenant_id from request.user
 * 3. @CurrentUser() extracts full user object from request.user
 * 4. PermissionGuard checks if user has required permission:
 *    a. Super-admins (is_super_admin: true) → Access granted
 *    b. Admins (ADMIN/ADMIN_EMPRESA role) → Access granted
 *    c. Regular users → Check role permissions
 * 5. If permission check passes, controller method executes
 * 6. If permission check fails, ForbiddenException is thrown
 * 
 * ROLE-BASED ACCESS (Current Implementation):
 * - ADMIN / ADMIN_EMPRESA: Full access within tenant
 * - VENDEDOR: ventas, pos, clientes, productos
 * - CONTADOR: contabilidad, finanzas, reportes
 * - ALMACENERO: inventario, productos, almacenes
 * - COMPRADOR: compras, proveedores, productos
 * - GERENTE: ventas, compras, inventario, contabilidad, reportes, rrhh
 * 
 * NOTE: The current implementation uses hardcoded role-to-module mapping.
 * This will be replaced with database queries when PermissionService is implemented.
 */
