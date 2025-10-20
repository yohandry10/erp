# Tenant Management Module

This module implements the Tenant Management Service for super-admin operations in the multi-level admin system.

## Overview

The TenantManagementService provides comprehensive tenant management capabilities exclusively for super-admin users. It handles tenant lifecycle operations including creation, updates, activation/deactivation, and statistics.

## Features Implemented

### ✅ Task 6.1: TenantManagementService Class
- Created service class with dependency injection
- Injected SupabaseService for database operations
- Injected UserManagementService for admin user creation
- Defined all method signatures

### ✅ Task 6.2: Create Tenant Method
- Validates email uniqueness across all tenants
- Generates unique tenant_id using crypto.randomUUID()
- Inserts tenant record with default configuration
- Creates ADMIN role for the new tenant
- Creates first admin user with ADMIN role assignment
- Returns tenant and admin user details with temporary password
- Implements rollback on failure (deletes tenant if user creation fails)

### ✅ Task 6.3: Update Tenant Method
- Validates tenant exists before update
- Updates tenant information
- Returns updated tenant record

### ✅ Task 6.4: Get Tenants Method
- Queries all tenants (no tenant filter for super-admin)
- Supports pagination (default 50 items per page)
- Supports search by nombre or email
- Supports filtering by estado
- Returns paginated results with metadata

### ✅ Task 6.5: Get Tenant By ID Method
- Retrieves single tenant by ID
- Returns tenant with full configuration
- Throws NotFoundException if tenant doesn't exist

### ✅ Task 6.6: Activate Tenant Method
- Updates tenant estado to 'ACTIVO'
- Enables user logins for the tenant
- Returns activated tenant

### ✅ Task 6.7: Deactivate Tenant Method
- Updates tenant estado to 'INACTIVO'
- Revokes all active sessions for tenant users
- Prevents new logins
- Returns deactivated tenant

### ✅ Task 6.8: Get Tenant Stats Method
- Counts total users in tenant
- Counts active users in tenant
- Calculates inactive users
- Returns storage usage (placeholder for future implementation)
- Returns comprehensive statistics object

### ✅ Task 6.9: Get Tenant Users Method
- Queries all users for a specific tenant
- Includes user roles in response
- Removes sensitive data (password_hash, password_reset_token)
- Returns sanitized user list

## DTOs Created

### CreateTenantDto
```typescript
{
  nombre: string;
  ruc?: string;
  direccion?: string;
  telefono?: string;
  email: string;
  pais: string;
  moneda: string;
  admin_email: string;
  admin_nombre: string;
  admin_apellido?: string;
}
```

### UpdateTenantDto
```typescript
{
  nombre?: string;
  ruc?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  pais?: string;
  moneda?: string;
  estado?: TenantEstado;
  plan?: string;
}
```

### TenantFiltersDto
```typescript
{
  search?: string;
  estado?: TenantEstado;
  page?: number;
  limit?: number;
}
```

## Requirements Satisfied

- ✅ Requirement 1.1: Super-Admin tenant management
- ✅ Requirement 1.2: Tenant creation
- ✅ Requirement 1.3: First admin user assignment
- ✅ Requirement 1.4: Tenant viewing and statistics
- ✅ Requirement 1.5: Super-admin privileges
- ✅ Requirement 1.6: Tenant deactivation

## Usage Example

```typescript
// Inject the service
constructor(private tenantService: TenantManagementService) {}

// Create a new tenant
const result = await this.tenantService.createTenant({
  nombre: 'Acme Corp',
  email: 'admin@acme.com',
  pais: 'PE',
  moneda: 'PEN',
  admin_email: 'admin@acme.com',
  admin_nombre: 'John Doe'
});

// Get tenant statistics
const stats = await this.tenantService.getTenantStats(tenantId);

// Deactivate tenant
await this.tenantService.deactivateTenant(tenantId);
```

## Security Considerations

- All methods should be protected by SuperAdminGuard (to be implemented in controller)
- Tenant creation includes automatic ADMIN role creation
- Session revocation on tenant deactivation prevents unauthorized access
- Sensitive user data is filtered from responses
- Rollback mechanism ensures data consistency

## Next Steps

The next task (Task 7) will implement the Permission Service for role-based access control.
