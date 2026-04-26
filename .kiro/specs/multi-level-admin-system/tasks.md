# Implementation Plan

- [x] 1. Database Schema and Migration Setup



  - Create database migration files for new tables and columns
  - Add tenants table with proper indexes
  - Add is_super_admin, password_hash, and security columns to usuarios_sistema
  - Create audit_log and user_sessions tables
  - _Requirements: 1.1, 1.2, 2.1, 7.1, 8.1_

- [x] 1.1 Create tenants table migration

  - Write SQL migration to create tenants table with all required columns
  - Add indexes for estado, email fields
  - Add unique constraint on email
  - _Requirements: 1.1, 1.2_

- [x] 1.2 Update usuarios_sistema table

  - Add is_super_admin BOOLEAN column with default false
  - Add password_hash TEXT column
  - Add password_reset_token and password_reset_expires columns
  - Add failed_login_attempts INTEGER and locked_until TIMESTAMPTZ columns
  - Add apellido TEXT column if not exists
  - _Requirements: 1.1, 2.1, 3.1, 6.1, 6.6_

- [x] 1.3 Create audit_log table

  - Write SQL migration for audit_log table
  - Add indexes on tenant_id, user_id, timestamp, table_name
  - Create trigger function for automatic audit logging
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 1.4 Create user_sessions table

  - Write SQL migration for user_sessions table
  - Add indexes on usuario_sistema_id, tenant_id, expires_at, session_token
  - _Requirements: 4.1, 4.4, 6.6_

- [x] 1.5 Update RLS policies for new tables

  - Create RLS policies for tenants table (super-admin only)
  - Update usuarios_sistema RLS to support super-admin override
  - Create RLS policies for audit_log (tenant isolation)
  - Create RLS policies for user_sessions (tenant isolation)
  - _Requirements: 7.1, 7.2, 7.4_

- [x] 2. Authentication Service Implementation




  - Implement enhanced AuthService with tenant context
  - Update JWT payload to include tenant_id and is_super_admin
  - Implement account lockout mechanism
  - Implement password reset flow
  - _Requirements: 4.1, 4.2, 4.3, 6.1, 6.3, 6.6_

- [x] 2.1 Update AuthService login method


  - Modify login to include tenant_id in JWT payload
  - Add is_super_admin flag to JWT payload
  - Implement failed login attempt tracking
  - Implement account lockout after 5 failed attempts
  - Hash passwords with bcrypt
  - _Requirements: 4.1, 6.1, 6.6_


- [x] 2.2 Implement password reset functionality


  - Create generatePasswordResetToken method
  - Create validatePasswordResetToken method
  - Create resetPassword method
  - Set token expiration to 24 hours
  - _Requirements: 6.3_

- [x] 2.3 Implement tenant switching for super-admins


  - Create switchTenant method in AuthService
  - Validate user is super-admin before allowing switch
  - Generate new JWT with target tenant_id
  - Maintain is_super_admin flag in new token
  - Log tenant switch action to audit_log
  - _Requirements: 1.7, 4.3_

- [x] 2.4 Implement session management


  - Create session on successful login
  - Store session in user_sessions table
  - Implement session validation
  - Implement session revocation
  - Implement cleanup of expired sessions
  - _Requirements: 4.4, 4.5_

- [x] 2.5 Update JwtAuthGuard


  - Extract tenant_id from JWT payload
  - Extract is_super_admin flag from JWT payload
  - Attach tenant_id and is_super_admin to request object
  - Validate token signature and expiration
  - _Requirements: 4.2, 4.4_

- [x] 3. Tenant Middleware Implementation




  - Create TenantMiddleware to set database session context
  - Configure app.current_tenant_id for RLS
  - Configure app.current_user_id for RLS
  - _Requirements: 4.2, 7.1, 7.2_

- [x] 3.1 Create TenantMiddleware class


  - Implement NestMiddleware interface
  - Extract tenant_id from request.user (set by JwtAuthGuard)
  - Call Supabase set_config to set app.current_tenant_id
  - Call Supabase set_config to set app.current_user_id
  - Handle errors gracefully
  - _Requirements: 4.2, 7.1_

- [x] 3.2 Register TenantMiddleware globally


  - Configure middleware in AppModule
  - Apply to all routes except auth endpoints
  - Ensure it runs after JwtAuthGuard
  - _Requirements: 4.2_

- [x] 4. Create Custom Decorators





  - Implement @CurrentTenant() decorator
  - Implement @CurrentUser() decorator
  - Implement @RequirePermission() decorator
  - _Requirements: 2.1, 3.1, 5.2_

- [x] 4.1 Implement @CurrentTenant() decorator

  - Create custom parameter decorator
  - Extract tenant_id from request.user
  - Return tenant_id to controller method
  - _Requirements: 2.1, 3.1_


- [x] 4.2 Implement @CurrentUser() decorator

  - Create custom parameter decorator
  - Extract full user object from request.user
  - Return user object to controller method
  - _Requirements: 2.1, 3.1_


- [x] 4.3 Implement @RequirePermission() decorator

  - Create custom method decorator
  - Accept modulo, accion, recurso parameters
  - Integrate with PermissionGuard
  - _Requirements: 5.2, 5.3_


- [x] 5. User Management Service Implementation




  - Create UserManagementService with CRUD operations
  - Implement user creation with tenant isolation
  - Implement role assignment
  - Implement user activation/deactivation
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 6.1, 6.2, 6.4, 6.5_

- [x] 5.1 Create UserManagementService class


  - Inject SupabaseService
  - Create method signatures for all user operations
  - All methods accept tenantId as first parameter
  - _Requirements: 2.1_

- [x] 5.2 Implement createUser method

  - Accept CreateUserDto and tenantId
  - Validate email uniqueness within tenant
  - Hash password with bcrypt
  - Insert user with tenant_id
  - Generate temporary password if not provided
  - Send activation email with credentials
  - _Requirements: 2.1, 6.1_

- [x] 5.3 Implement updateUser method

  - Accept userId, UpdateUserDto, and tenantId
  - Validate user belongs to tenant
  - Update user record
  - Filter by tenant_id in WHERE clause
  - _Requirements: 2.2_

- [x] 5.4 Implement deleteUser method

  - Accept userId and tenantId
  - Validate user belongs to tenant
  - Delete user record
  - Filter by tenant_id in WHERE clause
  - Log deletion to audit_log
  - _Requirements: 2.3_

- [x] 5.5 Implement getUsers method

  - Accept tenantId and optional filters
  - Query usuarios_sistema filtered by tenant_id
  - Support pagination (default 50 items)
  - Support search by nombre, email
  - Support filter by estado
  - _Requirements: 2.8_

- [x] 5.6 Implement getUserById method

  - Accept userId and tenantId
  - Query user by id and tenant_id
  - Return user with roles
  - _Requirements: 2.8_

- [x] 5.7 Implement assignRoles method

  - Accept userId, roleIds array, and tenantId
  - Validate user belongs to tenant
  - Validate roles belong to tenant
  - Insert records into user_roles table
  - Prevent duplicate role assignments
  - _Requirements: 2.5_

- [x] 5.8 Implement removeRoles method

  - Accept userId, roleIds array, and tenantId
  - Validate user belongs to tenant
  - Delete records from user_roles table
  - Filter by tenant_id
  - _Requirements: 2.5_

- [x] 5.9 Implement activateUser method

  - Accept userId and tenantId
  - Update estado to 'ACTIVO'
  - Filter by tenant_id
  - _Requirements: 6.5_

- [x] 5.10 Implement deactivateUser method

  - Accept userId and tenantId
  - Update estado to 'INACTIVO'
  - Revoke all active sessions
  - Filter by tenant_id
  - _Requirements: 2.6, 6.4_

- [x] 5.11 Implement resetPassword method

  - Accept userId and tenantId
  - Generate secure reset token
  - Set token expiration (24 hours)
  - Update password_reset_token and password_reset_expires
  - Send password reset email
  - _Requirements: 6.3_


- [x] 6. Tenant Management Service Implementation (Super-Admin Only)




  - Create TenantManagementService
  - Implement tenant creation with first admin user
  - Implement tenant activation/deactivation
  - Implement tenant statistics
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 6.1 Create TenantManagementService class


  - Inject SupabaseService and UserManagementService
  - Create method signatures for tenant operations
  - _Requirements: 1.1_

- [x] 6.2 Implement createTenant method


  - Accept CreateTenantDto
  - Generate unique tenant_id
  - Insert tenant record
  - Create first admin user for tenant
  - Assign ADMIN role to first user
  - Return tenant and admin user details
  - _Requirements: 1.2, 1.3_

- [x] 6.3 Implement updateTenant method


  - Accept tenantId and UpdateTenantDto
  - Update tenant record
  - Validate tenant exists
  - _Requirements: 1.1_

- [x] 6.4 Implement getTenants method


  - Query all tenants (no tenant filter for super-admin)
  - Support pagination
  - Support filter by estado
  - Support search by nombre, email
  - _Requirements: 1.4_

- [x] 6.5 Implement getTenantById method


  - Accept tenantId
  - Query tenant by id
  - Return tenant with configuration
  - _Requirements: 1.4_

- [x] 6.6 Implement activateTenant method


  - Accept tenantId
  - Update estado to 'ACTIVO'
  - Enable all user logins for tenant
  - _Requirements: 1.1_

- [x] 6.7 Implement deactivateTenant method


  - Accept tenantId
  - Update estado to 'INACTIVO'
  - Revoke all active sessions for tenant users
  - Prevent new logins
  - _Requirements: 1.6_

- [x] 6.8 Implement getTenantStats method


  - Accept tenantId
  - Count active users
  - Count total users
  - Calculate storage usage
  - Return statistics object
  - _Requirements: 1.4_

- [x] 6.9 Implement getTenantUsers method


  - Accept tenantId
  - Query usuarios_sistema filtered by tenant_id
  - Return user list with roles
  - _Requirements: 1.4_

- [x] 7. Permission Service Implementation




  - Create PermissionService
  - Implement permission checking logic
  - Implement role-permission management
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 7.1 Create PermissionService class


  - Inject SupabaseService
  - Create method signatures for permission operations
  - _Requirements: 5.1_

- [x] 7.2 Implement getPermissions method


  - Accept tenantId
  - Query permisos table filtered by tenant_id
  - Return all available permissions
  - _Requirements: 5.1_


- [x] 7.3 Implement getRolePermissions method


  - Accept tenantId and roleId
  - Query rol_permisos joined with permisos
  - Filter by role_id and tenant_id
  - Return permissions for role
  - _Requirements: 5.1_

- [x] 7.4 Implement assignPermissionToRole method


  - Accept tenantId, roleId, permissionId
  - Validate role and permission belong to tenant
  - Insert into rol_permisos table
  - Set concedido to true
  - _Requirements: 5.1_

- [x] 7.5 Implement revokePermissionFromRole method


  - Accept tenantId, roleId, permissionId
  - Delete from rol_permisos table
  - Filter by role_id and permiso_id
  - _Requirements: 5.5_

- [x] 7.6 Implement checkUserPermission method


  - Accept userId, tenantId, modulo, accion, recurso
  - Query user roles
  - Query role permissions
  - Check if any role has the required permission
  - Return boolean
  - Cache result for 5 minutes
  - _Requirements: 5.2, 5.3_

- [x] 7.7 Implement getUserPermissions method


  - Accept userId and tenantId
  - Query all permissions from user's roles
  - Aggregate permissions (union)
  - Return unique permission list
  - _Requirements: 5.6_

- [x] 8. Role Service Implementation





  - Create RoleService
  - Implement role CRUD operations
  - Implement role-user relationship queries
  - _Requirements: 5.1, 5.4_

- [x] 8.1 Create RoleService class


  - Inject SupabaseService
  - Create method signatures for role operations
  - _Requirements: 5.1_

- [x] 8.2 Implement createRole method

  - Accept tenantId and CreateRoleDto
  - Insert role with tenant_id
  - Optionally assign initial permissions
  - Return created role
  - _Requirements: 5.1_

- [x] 8.3 Implement updateRole method

  - Accept tenantId, roleId, UpdateRoleDto
  - Update role record
  - Filter by tenant_id
  - Prevent updating system roles
  - _Requirements: 5.1_

- [x] 8.4 Implement deleteRole method

  - Accept tenantId and roleId
  - Validate role is not system role
  - Delete role record
  - Cascade delete user_roles and rol_permisos
  - _Requirements: 5.1_

- [x] 8.5 Implement getRoles method

  - Accept tenantId
  - Query roles filtered by tenant_id
  - Return role list
  - _Requirements: 5.1_

- [x] 8.6 Implement getRoleById method

  - Accept tenantId and roleId
  - Query role by id and tenant_id
  - Return role with permissions
  - _Requirements: 5.1_

- [x] 8.7 Implement getRoleUsers method

  - Accept tenantId and roleId
  - Query usuarios_sistema joined with user_roles
  - Filter by role_id and tenant_id
  - Return user list
  - _Requirements: 5.1_


- [x] 9. Audit Service Implementation




  - Create AuditService
  - Implement audit log querying
  - Implement manual audit logging
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 9.1 Create AuditService class


  - Inject SupabaseService
  - Create method signatures for audit operations
  - _Requirements: 8.1_

- [x] 9.2 Implement logAction method


  - Accept AuditLog object
  - Insert into audit_log table
  - Include tenant_id, user_id, timestamp
  - _Requirements: 8.1, 8.2_

- [x] 9.3 Implement getAuditLogs method


  - Accept tenantId and optional filters
  - Query audit_log filtered by tenant_id
  - Support pagination
  - Support filter by table_name, operation, user_id
  - Support date range filtering
  - Order by timestamp DESC
  - _Requirements: 8.6_

- [x] 9.4 Implement getUserAuditLogs method


  - Accept tenantId and userId
  - Query audit_log filtered by tenant_id and user_id
  - Return user's action history
  - _Requirements: 8.6_

- [x] 9.5 Implement getResourceAuditLogs method


  - Accept tenantId, tableName, resourceId
  - Query audit_log for specific resource
  - Return change history for resource
  - _Requirements: 8.6_

- [x] 10. User Management Controller Implementation





  - Create UserManagementController
  - Implement REST endpoints for user operations
  - Apply guards and decorators
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 9.1, 9.2, 9.3, 9.4_


- [x] 10.1 Create UserManagementController class

  - Apply @Controller('users') decorator
  - Apply @UseGuards(JwtAuthGuard) globally
  - Inject UserManagementService
  - _Requirements: 2.1_

- [x] 10.2 Implement GET /users endpoint


  - Use @CurrentTenant() decorator
  - Call userManagementService.getUsers(tenantId)
  - Support query parameters for filters
  - Return paginated user list
  - _Requirements: 2.8, 9.2_

- [x] 10.3 Implement GET /users/:id endpoint


  - Use @CurrentTenant() decorator
  - Call userManagementService.getUserById(tenantId, userId)
  - Return user details with roles
  - _Requirements: 2.8, 9.2_

- [x] 10.4 Implement POST /users endpoint


  - Use @CurrentTenant() decorator
  - Validate CreateUserDto with class-validator
  - Call userManagementService.createUser(tenantId, userData)
  - Return created user
  - _Requirements: 2.1, 9.3_

- [x] 10.5 Implement PUT /users/:id endpoint


  - Use @CurrentTenant() decorator
  - Validate UpdateUserDto
  - Call userManagementService.updateUser(tenantId, userId, userData)
  - Return updated user
  - _Requirements: 2.2, 9.3_

- [x] 10.6 Implement DELETE /users/:id endpoint


  - Use @CurrentTenant() decorator
  - Call userManagementService.deleteUser(tenantId, userId)
  - Return success message
  - _Requirements: 2.3, 9.3_


- [x] 10.7 Implement POST /users/:id/activate endpoint


  - Use @CurrentTenant() decorator
  - Call userManagementService.activateUser(tenantId, userId)
  - Return activated user
  - _Requirements: 2.4, 9.3_

- [x] 10.8 Implement POST /users/:id/deactivate endpoint


  - Use @CurrentTenant() decorator
  - Call userManagementService.deactivateUser(tenantId, userId)
  - Return deactivated user
  - _Requirements: 2.6, 9.3_

- [x] 10.9 Implement POST /users/:id/reset-password endpoint


  - Use @CurrentTenant() decorator
  - Call userManagementService.resetPassword(tenantId, userId)
  - Return reset token (for testing) or success message
  - _Requirements: 2.3, 9.3_

- [x] 10.10 Implement GET /users/:id/roles endpoint


  - Use @CurrentTenant() decorator
  - Query user_roles for user
  - Return user's roles
  - _Requirements: 2.5, 9.2_

- [x] 10.11 Implement POST /users/:id/roles endpoint


  - Use @CurrentTenant() decorator
  - Validate role IDs in request body
  - Call userManagementService.assignRoles(tenantId, userId, roleIds)
  - Return success message
  - _Requirements: 2.5, 9.3_

- [x] 10.12 Implement DELETE /users/:id/roles/:roleId endpoint


  - Use @CurrentTenant() decorator
  - Call userManagementService.removeRoles(tenantId, userId, [roleId])
  - Return success message
  - _Requirements: 2.5, 9.3_

- [x] 10.13 Implement GET /users/:id/permissions endpoint


  - Use @CurrentTenant() decorator
  - Call permissionService.getUserPermissions(userId, tenantId)
  - Return user's aggregated permissions
  - _Requirements: 9.2_

- [x] 10.14 Implement GET /users/:id/audit-logs endpoint


  - Use @CurrentTenant() decorator
  - Call auditService.getUserAuditLogs(tenantId, userId)
  - Return user's audit history
  - _Requirements: 9.2_

- [x] 11. Tenant Management Controller Implementation (Super-Admin Only)





  - Create TenantManagementController
  - Implement REST endpoints for tenant operations
  - Apply super-admin guard
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 9.1, 9.2, 9.3, 9.4_

- [x] 11.1 Create TenantManagementController class


  - Apply @Controller('tenants') decorator
  - Apply @UseGuards(JwtAuthGuard, SuperAdminGuard) globally
  - Inject TenantManagementService
  - _Requirements: 1.1_


- [x] 11.2 Create SuperAdminGuard

  - Implement CanActivate interface
  - Check request.user.is_super_admin flag
  - Deny access if not super-admin
  - _Requirements: 1.1, 1.5_

- [x] 11.3 Implement GET /tenants endpoint

  - Call tenantManagementService.getTenants()
  - Support query parameters for filters
  - Return paginated tenant list
  - _Requirements: 1.4, 9.1_

- [x] 11.4 Implement GET /tenants/:id endpoint

  - Call tenantManagementService.getTenantById(tenantId)
  - Return tenant details with configuration
  - _Requirements: 1.4, 9.1_



- [x] 11.5 Implement POST /tenants endpoint

  - Validate CreateTenantDto
  - Call tenantManagementService.createTenant(tenantData)
  - Return created tenant and admin user details
  - _Requirements: 1.2, 1.3, 9.1_

- [x] 11.6 Implement PUT /tenants/:id endpoint

  - Validate UpdateTenantDto
  - Call tenantManagementService.updateTenant(tenantId, tenantData)
  - Return updated tenant
  - _Requirements: 1.1, 9.1_


- [x] 11.7 Implement POST /tenants/:id/activate endpoint

  - Call tenantManagementService.activateTenant(tenantId)
  - Return activated tenant
  - _Requirements: 1.1, 9.1_

- [x] 11.8 Implement POST /tenants/:id/deactivate endpoint

  - Call tenantManagementService.deactivateTenant(tenantId)
  - Return deactivated tenant
  - _Requirements: 1.6, 9.1_

- [x] 11.9 Implement GET /tenants/:id/users endpoint

  - Call tenantManagementService.getTenantUsers(tenantId)
  - Return user list for tenant
  - _Requirements: 1.4, 9.1_

- [x] 11.10 Implement GET /tenants/:id/stats endpoint

  - Call tenantManagementService.getTenantStats(tenantId)
  - Return tenant statistics
  - _Requirements: 1.4, 9.1_

- [x] 12. Role Management Controller Implementation




  - Create RoleController
  - Implement REST endpoints for role operations
  - _Requirements: 5.1, 5.4, 9.2, 9.3_

- [x] 12.1 Create RoleController class


  - Apply @Controller('roles') decorator
  - Apply @UseGuards(JwtAuthGuard) globally
  - Inject RoleService and PermissionService
  - _Requirements: 5.1_

- [x] 12.2 Implement GET /roles endpoint


  - Use @CurrentTenant() decorator
  - Call roleService.getRoles(tenantId)
  - Return role list
  - _Requirements: 5.1, 9.2_

- [x] 12.3 Implement GET /roles/:id endpoint


  - Use @CurrentTenant() decorator
  - Call roleService.getRoleById(tenantId, roleId)
  - Return role details with permissions
  - _Requirements: 5.1, 9.2_

- [x] 12.4 Implement POST /roles endpoint


  - Use @CurrentTenant() decorator
  - Validate CreateRoleDto
  - Call roleService.createRole(tenantId, roleData)
  - Return created role
  - _Requirements: 5.1, 9.3_

- [x] 12.5 Implement PUT /roles/:id endpoint


  - Use @CurrentTenant() decorator
  - Validate UpdateRoleDto
  - Call roleService.updateRole(tenantId, roleId, roleData)
  - Return updated role
  - _Requirements: 5.1, 9.3_


- [x] 12.6 Implement DELETE /roles/:id endpoint

  - Use @CurrentTenant() decorator
  - Call roleService.deleteRole(tenantId, roleId)
  - Return success message
  - _Requirements: 5.1, 9.3_


- [x] 12.7 Implement GET /roles/:id/permissions endpoint

  - Use @CurrentTenant() decorator
  - Call permissionService.getRolePermissions(tenantId, roleId)
  - Return role's permissions
  - _Requirements: 5.1, 9.2_


- [x] 12.8 Implement POST /roles/:id/permissions endpoint


  - Use @CurrentTenant() decorator
  - Validate permission ID in request body
  - Call permissionService.assignPermissionToRole(tenantId, roleId, permissionId)
  - Return success message
  - _Requirements: 5.1, 9.3_


- [x] 12.9 Implement DELETE /roles/:id/permissions/:permissionId endpoint

  - Use @CurrentTenant() decorator
  - Call permissionService.revokePermissionFromRole(tenantId, roleId, permissionId)
  - Return success message
  - _Requirements: 5.5, 9.3_


- [x] 12.10 Implement GET /roles/:id/users endpoint

  - Use @CurrentTenant() decorator
  - Call roleService.getRoleUsers(tenantId, roleId)
  - Return users with this role
  - _Requirements: 5.1, 9.2_

- [x] 13. Permission Controller Implementation




  - Create PermissionController
  - Implement REST endpoints for permission operations
  - _Requirements: 5.1, 9.2_


- [x] 13.1 Create PermissionController class

  - Apply @Controller('permissions') decorator
  - Apply @UseGuards(JwtAuthGuard) globally
  - Inject PermissionService
  - _Requirements: 5.1_


- [x] 13.2 Implement GET /permissions endpoint


  - Use @CurrentTenant() decorator
  - Call permissionService.getPermissions(tenantId)
  - Return permission list
  - _Requirements: 5.1, 9.2_

- [x] 14. Audit Controller Implementation




  - Create AuditController
  - Implement REST endpoints for audit log queries
  - _Requirements: 8.6, 9.2_

- [x] 14.1 Create AuditController class


  - Apply @Controller('audit-logs') decorator
  - Apply @UseGuards(JwtAuthGuard) globally
  - Inject AuditService
  - _Requirements: 8.6_

- [x] 14.2 Implement GET /audit-logs endpoint

  - Use @CurrentTenant() decorator
  - Call auditService.getAuditLogs(tenantId, filters)
  - Support query parameters for filtering
  - Return paginated audit logs
  - _Requirements: 8.6, 9.2_

- [x] 14.3 Implement GET /audit-logs/user/:userId endpoint

  - Use @CurrentTenant() decorator
  - Call auditService.getUserAuditLogs(tenantId, userId)
  - Return user's audit history
  - _Requirements: 8.6, 9.2_

- [x] 14.4 Implement GET /audit-logs/resource/:tableName/:resourceId endpoint

  - Use @CurrentTenant() decorator
  - Call auditService.getResourceAuditLogs(tenantId, tableName, resourceId)
  - Return resource change history
  - _Requirements: 8.6, 9.2_

- [x] 15. Update Auth Controller




  - Update existing AuthController
  - Add tenant switching endpoint
  - Update login response to include tenant info
  - _Requirements: 4.1, 4.3_


- [x] 15.1 Update POST /auth/login endpoint

  - Ensure response includes tenant_id
  - Include is_super_admin flag in response
  - Return user with roles
  - _Requirements: 4.1_


- [x] 15.2 Implement POST /auth/switch-tenant endpoint

  - Apply @UseGuards(JwtAuthGuard, SuperAdminGuard)
  - Accept target tenant_id in request body
  - Call authService.switchTenant(userId, targetTenantId)
  - Return new JWT token with target tenant context
  - _Requirements: 4.3_


- [x] 16. Frontend: TenantContext Implementation




  - Create TenantContext provider
  - Extract tenant from JWT
  - Implement tenant switching for super-admins
  - _Requirements: 9.1, 9.2, 9.5_

- [x] 16.1 Create TenantContext and Provider


  - Create contexts/TenantContext.tsx
  - Define TenantContextValue interface
  - Implement TenantProvider component
  - Extract tenant_id from JWT token
  - Store tenant and user in state
  - _Requirements: 9.1, 9.2_

- [x] 16.2 Implement useTenant hook

  - Create custom hook to access TenantContext
  - Throw error if used outside TenantProvider
  - Return tenant, user, isSuperAdmin, and helper functions
  - _Requirements: 9.1, 9.2_

- [x] 16.3 Implement switchTenant function

  - Call /auth/switch-tenant API endpoint
  - Update JWT token in storage
  - Refresh tenant context
  - Reload application state
  - _Requirements: 9.2_


- [x] 16.4 Wrap application with TenantProvider

  - Update _app.tsx or layout.tsx
  - Wrap app with TenantProvider
  - Ensure provider is inside authentication provider
  - _Requirements: 9.1_

- [x] 17. Frontend: Super-Admin Dashboard



  - Create super-admin dashboard page
  - Implement tenant list component
  - Implement tenant creation form
  - Implement tenant management actions
  - _Requirements: 9.1, 9.2_

- [x] 17.1 Create SuperAdminDashboard page


  - Create pages/super-admin/dashboard.tsx
  - Add route protection for super-admins only
  - Display system-wide statistics
  - Show tenant list
  - _Requirements: 9.1_


- [x] 17.2 Create TenantList component

  - Display tenants in table format
  - Show tenant name, email, estado, user count
  - Add actions: view, edit, activate, deactivate
  - Support search and filtering
  - _Requirements: 9.1, 9.2_

- [x] 17.3 Create TenantForm component


  - Form for creating/editing tenants
  - Fields: nombre, ruc, email, pais, moneda
  - Fields for first admin: admin_email, admin_nombre
  - Validation with react-hook-form
  - _Requirements: 9.1, 9.3_

- [x] 17.4 Create TenantSwitcher component


  - Dropdown to select tenant
  - Only visible for super-admins
  - Call switchTenant on selection
  - Show current tenant name
  - _Requirements: 9.2_

- [x] 18. Frontend: Admin de Empresa Dashboard





  - Create admin dashboard page
  - Implement user management interface
  - Implement role assignment interface
  - _Requirements: 9.3, 9.4_


- [x] 18.1 Create AdminDashboard page

  - Create pages/admin/dashboard.tsx
  - Add route protection for admins
  - Display tenant statistics
  - Show user list
  - _Requirements: 9.3_

- [x] 18.2 Create UserList component


  - Display users in table format
  - Show nombre, email, cargo, estado, roles
  - Add actions: view, edit, activate, deactivate, reset password
  - Support search and filtering
  - Filter by tenant automatically
  - _Requirements: 9.3, 9.5_


- [x] 18.3 Create UserForm component


  - Form for creating/editing users
  - Fields: nombre, apellido, email, telefono, cargo, departamento
  - Role selection multi-select
  - Validation with react-hook-form
  - _Requirements: 9.3, 9.4_


- [x] 18.4 Create RoleAssignment component

  - Multi-select for roles
  - Display current roles
  - Add/Remove role actions
  - Show role descriptions
  - _Requirements: 9.4_


- [x] 18.5 Create PermissionViewer component

  - Display user's aggregated permissions
  - Group by module
  - Show permission descriptions
  - Read-only view
  - _Requirements: 9.4_

- [x] 19. Frontend: Update Existing Components





  - Update API client to use tenant context
  - Add permission checks to UI components
  - Hide features based on permissions
  - _Requirements: 9.5, 9.6_

- [x] 19.1 Update API client


  - Ensure JWT token is included in all requests
  - Token automatically includes tenant_id
  - Handle 401 Unauthorized errors
  - Handle 403 Forbidden errors
  - _Requirements: 9.5_

- [x] 19.2 Create usePermission hook


  - Accept modulo, accion, recurso parameters
  - Call permission check API or use cached permissions
  - Return boolean indicating if user has permission
  - _Requirements: 9.6_


- [x] 19.3 Create ProtectedComponent wrapper

  - Accept required permission as prop
  - Use usePermission hook
  - Render children if permission granted
  - Render null or fallback if permission denied
  - _Requirements: 9.6_

- [x] 19.4 Update navigation menu


  - Hide menu items based on permissions
  - Use usePermission hook for each menu item
  - Show only accessible modules
  - _Requirements: 9.4, 9.6_

- [x] 20. Refactor Existing Services for Tenant Isolation




  - Update all existing services to accept tenantId
  - Update all queries to filter by tenant_id
  - Update all controllers to use @CurrentTenant()
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 10.1, 10.2, 10.3_


- [x] 20.1 Update InventoryService

  - Add tenantId parameter to all methods
  - Add .eq('tenant_id', tenantId) to all queries
  - Update getProductos, createProducto, updateProducto, deleteProducto
  - _Requirements: 7.1, 7.2, 7.3, 7.4_



- [x] 20.2 Update InventoryController

  - Add @CurrentTenant() decorator to all endpoints
  - Pass tenantId to service methods
  - _Requirements: 10.1_


- [x] 20.3 Update POSService

  - Add tenantId parameter to all methods
  - Add .eq('tenant_id', tenantId) to all queries
  - Update getVentas, createVenta, getVentaItems
  - _Requirements: 7.1, 7.2, 7.3, 7.4_



- [x] 20.4 Update POSController
  - Add @CurrentTenant() decorator to all endpoints
  - Pass tenantId to service methods
  - _Requirements: 10.1_



- [x] 20.5 Update RRHHService (already partially done)

  - Verify all methods accept tenantId parameter
  - Verify all queries filter by tenant_id
  - Update any missing methods
  - _Requirements: 7.1, 7.2, 7.3, 7.4_



- [x] 20.6 Update RRHHController (already partially done)
  - Verify all endpoints use @CurrentTenant() decorator
  - Verify tenantId is passed to service methods
  - _Requirements: 10.1_

- [x] 20.7 Update ContabilidadService

  - Add tenantId parameter to all methods
  - Add .eq('tenant_id', tenantId) to all queries
  - Update asientos, plan_cuentas, libro_diario queries
  - _Requirements: 7.1, 7.2, 7.3, 7.4_


- [x] 20.8 Update ContabilidadController
  - Add @CurrentTenant() decorator to all endpoints
  - Pass tenantId to service methods
  - _Requirements: 10.1_


- [x] 20.9 Update ComprasService
  - Add tenantId parameter to all methods
  - Add .eq('tenant_id', tenantId) to all queries
  - Update ordenes_compra, proveedores queries
  - _Requirements: 7.1, 7.2, 7.3, 7.4_


- [x] 20.10 Update ComprasController
  - Add @CurrentTenant() decorator to all endpoints
  - Pass tenantId to service methods
  - _Requirements: 10.1_


- [x] 20.11 Update CotizacionesService
  - Add tenantId parameter to all methods (if not already done)
  - Verify all queries filter by tenant_id
  - _Requirements: 7.1, 7.2, 7.3, 7.4_


- [x] 20.12 Update CotizacionesController
  - Verify all endpoints use @CurrentTenant() decorator

  - _Requirements: 10.1_

- [x] 20.13 Update CPE/GRE Services
  - Add tenantId parameter to all methods
  - Add .eq('tenant_id', tenantId) to all queries

  - Update documentos, cpe_documentos, gre_documentos queries
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 20.14 Update CPE/GRE Controllers

  - Add @CurrentTenant() decorator to all endpoints
  - Pass tenantId to service methods
  - _Requirements: 10.1_


- [x] 20.15 Update SIREService
  - Verify all methods accept tenantId parameter (already partially done)
  - Verify all queries filter by tenant_id

  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 20.16 Update SIREController
  - Verify all endpoints use @CurrentTenant() decorator
  - _Requirements: 10.1_

- [x] 20.17 Update AnalyticsService

  - Add tenantId parameter to all methods
  - Add .eq('tenant_id', tenantId) to all queries
  - Critical: Dashboard queries must filter by tenant
  - _Requirements: 7.1, 7.2_


- [x] 20.18 Update AnalyticsController
  - Add @CurrentTenant() decorator to all endpoints
  - Pass tenantId to service methods
  - _Requirements: 10.1_

- [ ] 21. Data Migration



  - Migrate existing users to default tenant
  - Create default roles if not exist
  - Assign roles to existing users
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 21.1 Create migration script


  - Assign all existing users to default tenant
  - Set is_super_admin = false for all users
  - Generate password hashes for existing users (require reset)
  - _Requirements: 10.1_




- [ ] 21.2 Create default roles
  - Ensure ADMIN, CONTADOR, VENDEDOR, ALMACENERO roles exist
  - Mark as system roles (is_system_role = true)


  - _Requirements: 10.2_

- [ ] 21.3 Assign default permissions to roles
  - Assign all permissions to ADMIN role
  - Assign ventas permissions to VENDEDOR role


  - Assign contabilidad permissions to CONTADOR role
  - Assign inventario permissions to ALMACENERO role
  - _Requirements: 10.2_

- [ ] 21.4 Assign roles to existing users
  - Query existing user_roles
  - Ensure all users have at least one role
  - Assign ADMIN role to first user if no roles exist
  - _Requirements: 10.3_

- [x] 22. Create DTOs and Validation




  - Create DTOs for all request/response objects
  - Add validation decorators
  - _Requirements: All requirements_

- [x] 22.1 Create CreateUserDto


  - Fields: nombre, apellido, email, password, telefono, cargo, departamento, roles
  - Validation: @IsEmail(), @IsNotEmpty(), @MinLength(8) for password
  - _Requirements: 2.1, 6.1_

- [x] 22.2 Create UpdateUserDto


  - Fields: nombre, apellido, telefono, cargo, departamento, estado
  - All fields optional
  - Validation: @IsOptional(), @IsEmail() if email provided
  - _Requirements: 2.2_

- [x] 22.3 Create CreateTenantDto


  - Fields: nombre, ruc, direccion, telefono, email, pais, moneda, admin_email, admin_nombre
  - Validation: @IsNotEmpty() for required fields, @IsEmail() for emails
  - _Requirements: 1.2_


- [x] 22.4 Create UpdateTenantDto

  - Fields: nombre, ruc, direccion, telefono, pais, moneda, estado
  - All fields optional
  - _Requirements: 1.1_

- [x] 22.5 Create CreateRoleDto


  - Fields: nombre, descripcion, permission_ids
  - Validation: @IsNotEmpty() for nombre
  - _Requirements: 5.1_


- [x] 22.6 Create UpdateRoleDto

  - Fields: nombre, descripcion
  - All fields optional
  - _Requirements: 5.1_


- [x] 22.7 Create LoginDto

  - Fields: email, password
  - Validation: @IsEmail(), @IsNotEmpty()
  - _Requirements: 4.1_


- [x] 22.8 Create SwitchTenantDto

  - Fields: target_tenant_id
  - Validation: @IsUUID()
  - _Requirements: 4.3_


- [x] 22.9 Create ResetPasswordDto

  - Fields: token, new_password
  - Validation: @IsNotEmpty(), @MinLength(8)
  - _Requirements: 6.3_

- [x] 23. Error Handling and Validation



  - Create custom exception filters
  - Implement global validation pipe
  - Create domain-specific exceptions
  - _Requirements: All requirements_

- [x] 23.1 Create custom exceptions


  - TenantNotFoundException
  - UserNotFoundException
  - DuplicateEmailException
  - InsufficientPermissionsException
  - AccountLockedException
  - _Requirements: All requirements_


- [x] 23.2 Create GlobalExceptionFilter


  - Catch all exceptions
  - Format error responses consistently
  - Log errors with context (tenant_id, user_id)
  - Don't expose internal details to client
  - _Requirements: All requirements_

- [x] 23.3 Configure global validation pipe


  - Enable whitelist to strip unknown properties
  - Enable forbidNonWhitelisted to reject unknown properties
  - Enable transform to auto-transform types
  - _Requirements: All requirements_

- [-] 24. Documentation


  - Document API endpoints with Swagger
  - Create developer guide
  - Update README with setup instructions
  - _Requirements: All requirements_

- [x] 24.1 Add Swagger decorators to controllers




  - Add @ApiTags() to group endpoints
  - Add @ApiOperation() to describe endpoints
  - Add @ApiResponse() for response types
  - Add @ApiBearerAuth() for protected endpoints
  - _Requirements: All requirements_

- [x] 24.2 Create API documentation




  - Generate Swagger UI
  - Document authentication flow
  - Document tenant switching flow
  - Document permission model
  - _Requirements: All requirements_

- [ ] 24.3 Update README.md
  - Add multi-level admin system overview
  - Document environment variables
  - Document database setup
  - Document first-time setup (creating super-admin)
  - _Requirements: All requirements_

- [ ] 25. Testing
  - Write unit tests for services
  - Write integration tests for controllers
  - Write E2E tests for critical flows
  - Test tenant isolation
  - _Requirements: All requirements_

- [ ]* 25.1 Write AuthService unit tests
  - Test login with valid credentials
  - Test login with invalid credentials
  - Test account lockout after failed attempts
  - Test password reset flow
  - Test tenant switching for super-admin
  - _Requirements: 4.1, 4.3, 6.1, 6.3, 6.6_

- [ ]* 25.2 Write UserManagementService unit tests
  - Test createUser with tenant isolation
  - Test updateUser validates tenant
  - Test deleteUser validates tenant
  - Test assignRoles validates tenant
  - Test cannot access users from other tenants
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 7.1_

- [ ]* 25.3 Write TenantManagementService unit tests
  - Test createTenant with first admin user
  - Test deactivateTenant disables all users
  - Test getTenantStats calculation
  - _Requirements: 1.2, 1.3, 1.4, 1.6_

- [ ]* 25.4 Write PermissionService unit tests
  - Test checkUserPermission returns correct result
  - Test permission inheritance from multiple roles
  - Test permission revocation takes effect
  - _Requirements: 5.2, 5.3, 5.5_

- [ ]* 25.5 Write integration tests for UserManagementController
  - Test GET /users filters by tenant
  - Test POST /users creates user in correct tenant
  - Test PUT /users validates tenant
  - Test DELETE /users validates tenant
  - _Requirements: 2.1, 2.2, 2.3, 7.1_


- [ ]* 25.6 Write integration tests for TenantManagementController
  - Test only super-admins can access endpoints
  - Test POST /tenants creates tenant and admin user
  - Test POST /tenants/:id/deactivate disables tenant
  - _Requirements: 1.1, 1.2, 1.3, 1.6_

- [ ]* 25.7 Write E2E tests for authentication flow
  - Test complete login flow with JWT generation
  - Test token refresh maintains tenant context
  - Test super-admin can switch tenants
  - _Requirements: 4.1, 4.3, 4.4_

- [ ]* 25.8 Write E2E tests for tenant isolation
  - Test user from Tenant A cannot see data from Tenant B
  - Test queries automatically filter by tenant_id
  - Test RLS policies enforce isolation at database level
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ]* 25.9 Write E2E tests for permission flow
  - Test user with permission can access resource
  - Test user without permission is denied
  - Test permission changes apply immediately
  - _Requirements: 5.2, 5.3, 5.4_

- [ ]* 25.10 Write performance tests
  - Test login performance with 1000+ users
  - Test query performance with 100+ tenants
  - Test permission check performance
  - Measure RLS policy overhead
  - _Requirements: All requirements_

- [ ] 26. Security Audit
  - Review authentication implementation
  - Review authorization implementation
  - Test for SQL injection vulnerabilities
  - Test for authentication bypass
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 26.1 Verify tenant isolation
  - Test cannot access other tenant's data via API
  - Test cannot access other tenant's data via direct SQL
  - Test RLS policies are enabled on all tables
  - Test RLS policies cannot be bypassed
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 26.2 Test for SQL injection
  - Test all input fields for SQL injection
  - Verify parameterized queries are used
  - Test special characters in input
  - _Requirements: 7.1_

- [ ] 26.3 Test authentication security
  - Test password hashing is secure (bcrypt)
  - Test JWT tokens are signed correctly
  - Test tokens cannot be forged
  - Test account lockout works
  - _Requirements: 4.1, 4.2, 4.4, 6.6_

- [ ] 26.4 Test authorization security
  - Test permission checks cannot be bypassed
  - Test super-admin flag cannot be forged
  - Test tenant_id in JWT cannot be manipulated
  - _Requirements: 5.2, 5.3, 7.2_

- [ ] 27. Deployment Preparation
  - Configure environment variables
  - Set up database connection pooling
  - Configure monitoring and logging
  - Create deployment scripts
  - _Requirements: All requirements_

- [ ] 27.1 Configure production environment variables
  - Set JWT_SECRET to strong random value
  - Set JWT_EXPIRATION to 8h
  - Set BCRYPT_ROUNDS to 10
  - Set MAX_LOGIN_ATTEMPTS to 5
  - Set LOCKOUT_DURATION_MINUTES to 15
  - _Requirements: 4.1, 6.6_

- [ ] 27.2 Configure database for production
  - Set up connection pooling (10-20 connections)
  - Configure RLS settings
  - Create database indexes
  - Set up automated backups
  - _Requirements: 7.1_


- [ ] 27.3 Set up monitoring
  - Configure Sentry for error tracking
  - Set up APM (DataDog/New Relic)
  - Track custom metrics (tenant count, active users)
  - Set up alerts for high error rates
  - _Requirements: All requirements_

- [ ] 27.4 Set up logging
  - Configure structured logging
  - Include tenant_id in all log entries
  - Include user_id in all log entries
  - Set up log aggregation (ELK/CloudWatch)
  - _Requirements: 8.1, 8.2_

- [ ] 27.5 Create deployment scripts
  - Script to run database migrations
  - Script to create first super-admin user
  - Script to seed default roles and permissions
  - Script to verify deployment
  - _Requirements: All requirements_

- [ ] 28. Create First Super-Admin User
  - Create script or endpoint to create first super-admin
  - Document the process
  - _Requirements: 1.1, 1.2_

- [ ] 28.1 Create seed script for first super-admin
  - Accept email, password, nombre via environment variables or CLI
  - Create user with is_super_admin = true
  - Assign to default tenant or create special super-admin tenant
  - Hash password securely
  - _Requirements: 1.1, 1.2_

- [ ] 28.2 Document super-admin creation process
  - Add to README.md
  - Include example command
  - Document security considerations
  - _Requirements: 1.1_

- [ ] 29. Final Integration and Testing
  - Test complete workflows end-to-end
  - Verify all requirements are met
  - Performance testing with realistic data
  - Security audit
  - _Requirements: All requirements_

- [ ] 29.1 Test super-admin workflow
  - Create new tenant
  - Assign first admin
  - Switch between tenants
  - View system-wide statistics
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 29.2 Test admin de empresa workflow
  - Create users in tenant
  - Assign roles to users
  - Configure permissions
  - View audit logs
  - _Requirements: 2.1, 2.2, 2.5, 8.6_

- [ ] 29.3 Test regular user workflow
  - Login and access permitted modules
  - Denied access to restricted modules
  - Data filtered by tenant automatically
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 29.4 Verify tenant isolation
  - Create multiple tenants with users
  - Verify users cannot see other tenant's data
  - Test with direct database queries
  - Test with API calls
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 29.5 Performance testing
  - Load test with 100+ tenants
  - Load test with 1000+ users
  - Measure query performance
  - Optimize slow queries
  - _Requirements: All requirements_

- [ ] 29.6 Final security audit
  - Review all code for security issues
  - Test for common vulnerabilities (OWASP Top 10)
  - Verify all requirements are met
  - Document any remaining risks
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

---

**Implementation Notes:**
- Tasks marked with * are optional testing tasks that can be skipped if time is limited
- All core implementation tasks must be completed
- Follow the order of tasks as dependencies exist between them
- Each task should be tested before moving to the next
- Commit code after completing each major task group
