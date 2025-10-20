# Custom Decorators

This directory contains custom parameter and method decorators for the ERP API.

## Available Decorators

### @CurrentTenant()

Extracts the `tenant_id` from the authenticated user's JWT token.

**Usage:**
```typescript
@Get()
@UseGuards(JwtAuthGuard)
findAll(@CurrentTenant() tenantId: string) {
  return this.service.findAll(tenantId);
}
```

**Requirements:** User must be authenticated with a valid JWT token containing `tenant_id`.

---

### @CurrentUser()

Extracts the complete user object from the request.

**Usage:**
```typescript
@Get('profile')
@UseGuards(JwtAuthGuard)
getProfile(@CurrentUser() user: any) {
  return {
    id: user.id,
    email: user.email,
    tenant_id: user.tenant_id,
    roles: user.roles,
  };
}
```

**Requirements:** User must be authenticated with a valid JWT token.

---

### @RequirePermission(modulo, accion, recurso)

Validates that the authenticated user has the required permission to execute an action.

**Parameters:**
- `modulo` (string): System module (e.g., 'ventas', 'compras', 'inventario', 'contabilidad')
- `accion` (string): Action to perform (e.g., 'create', 'read', 'update', 'delete', 'export')
- `recurso` (string): Specific resource (e.g., 'clientes', 'productos', 'facturas', 'asientos')

**Usage:**
```typescript
@Post('facturas')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('ventas', 'create', 'facturas')
createFactura(
  @CurrentTenant() tenantId: string,
  @CurrentUser() user: any,
  @Body() data: CreateFacturaDto
) {
  return this.service.createFactura(tenantId, data);
}
```

**Examples:**

```typescript
// Read permissions
@Get('productos')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('inventario', 'read', 'productos')
getProductos(@CurrentTenant() tenantId: string) {
  return this.service.getProductos(tenantId);
}

// Create permissions
@Post('clientes')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('ventas', 'create', 'clientes')
createCliente(@CurrentTenant() tenantId: string, @Body() data: CreateClienteDto) {
  return this.service.createCliente(tenantId, data);
}

// Update permissions
@Put('productos/:id')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('inventario', 'update', 'productos')
updateProducto(
  @CurrentTenant() tenantId: string,
  @Param('id') id: string,
  @Body() data: UpdateProductoDto
) {
  return this.service.updateProducto(tenantId, id, data);
}

// Delete permissions
@Delete('asientos/:id')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('contabilidad', 'delete', 'asientos')
deleteAsiento(@CurrentTenant() tenantId: string, @Param('id') id: string) {
  return this.service.deleteAsiento(tenantId, id);
}

// Export permissions
@Get('reportes/ventas/export')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('reportes', 'export', 'ventas')
exportVentas(@CurrentTenant() tenantId: string, @Query() filters: any) {
  return this.service.exportVentas(tenantId, filters);
}
```

**Permission Behavior:**
- Super-admins (`is_super_admin: true`) have access to all resources
- Admin users (`ADMIN` or `ADMIN_EMPRESA` role) have full access within their tenant
- Regular users are validated against their role permissions
- If no permission is required (decorator not used), access is allowed

**Requirements:** 
- User must be authenticated with JwtAuthGuard
- PermissionGuard must be applied to the route
- User must have the required permission or be a super-admin/admin

---

## Combining Decorators

You can combine multiple decorators for comprehensive access control:

```typescript
@Post('facturas')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('ventas', 'create', 'facturas')
createFactura(
  @CurrentTenant() tenantId: string,
  @CurrentUser() user: any,
  @Body() data: CreateFacturaDto
) {
  // tenantId is automatically extracted from JWT
  // user contains full user object
  // Permission is validated before this method executes
  
  return this.service.createFactura(tenantId, user.id, data);
}
```

## Implementation Notes

### Current Implementation
The `PermissionGuard` currently uses a basic role-to-module mapping for permission validation. This is a temporary implementation.

### Future Implementation
The guard will be updated to query the database using the `PermissionService` to check:
1. User's roles (from `user_roles` table)
2. Role permissions (from `rol_permisos` table)
3. Permission definitions (from `permisos` table)

This will enable granular permission control at the module, action, and resource level.

### Migration Path
When the `PermissionService` is implemented (Task 7), the `checkUserPermission` method in `PermissionGuard` will be updated to use the service instead of the hardcoded role mapping.
