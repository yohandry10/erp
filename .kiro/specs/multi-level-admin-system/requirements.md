# Requirements Document

## Introduction

This document defines the requirements for implementing a comprehensive multi-level administration system for the ERP platform. The system establishes three distinct administrative levels: Super-Admin (system-wide administrator), Admin de Empresa (tenant administrator), and Regular Users. This hierarchical structure ensures proper separation of concerns, security, and scalability for a multi-tenant SaaS ERP solution.

The implementation builds upon the existing multi-tenant infrastructure (60% complete) and addresses critical gaps in authentication, authorization, and user management workflows. The system must ensure complete data isolation between tenants while providing flexible role-based access control within each tenant.

## Requirements

### Requirement 1: Super-Admin Management

**User Story:** As a Super-Admin, I want to manage all tenants (companies) in the platform, so that I can onboard new clients and maintain system-wide control.

#### Acceptance Criteria

1. WHEN a Super-Admin logs into the system THEN the system SHALL display a dashboard showing all registered tenants with their status, subscription details, and user counts.

2. WHEN a Super-Admin creates a new tenant THEN the system SHALL generate a unique tenant_id, create the tenant record in the database, initialize default configurations, and assign the first administrator user for that tenant.

3. WHEN a Super-Admin assigns the first administrator to a new tenant THEN the system SHALL create the user account with ADMIN_EMPRESA role, send activation credentials, and link the user exclusively to that tenant.

4. WHEN a Super-Admin views tenant details THEN the system SHALL display tenant configuration, user list, subscription status, usage metrics, and audit logs without exposing sensitive business data.

5. WHEN a Super-Admin attempts to access tenant-specific business data THEN the system SHALL allow read-only access for support purposes with full audit trail logging.

6. WHEN a Super-Admin deactivates a tenant THEN the system SHALL disable all user logins for that tenant, maintain data integrity, and prevent any operations while preserving data for potential reactivation.

7. IF a Super-Admin is authenticated THEN the system SHALL include a special flag in the JWT token indicating super-admin privileges and allow tenant switching capabilities.

### Requirement 2: Tenant Administrator Management

**User Story:** As an Admin de Empresa, I want to manage users exclusively within my company, so that I can control access and permissions for my organization without affecting other tenants.

#### Acceptance Criteria

1. WHEN an Admin de Empresa logs into the system THEN the system SHALL display only users, data, and configurations belonging to their assigned tenant.

2. WHEN an Admin de Empresa creates a new user THEN the system SHALL automatically assign the user to the admin's tenant_id, validate email uniqueness within the tenant, and send activation credentials.

3. WHEN an Admin de Empresa assigns roles to a user THEN the system SHALL only display roles available within their tenant and prevent assignment of super-admin or cross-tenant roles.

4. WHEN an Admin de Empresa attempts to view or modify users from another tenant THEN the system SHALL deny access and return an authorization error.

5. WHEN an Admin de Empresa manages permissions THEN the system SHALL allow configuration of module-level and action-level permissions for users within their tenant only.

6. WHEN an Admin de Empresa deactivates a user THEN the system SHALL revoke all active sessions, disable login, and maintain audit trail of the action.

7. IF an Admin de Empresa attempts to modify their own admin role THEN the system SHALL prevent the action to avoid accidental privilege loss.

8. WHEN an Admin de Empresa views the user list THEN the system SHALL display user details, assigned roles, last login, and status filtered exclusively by their tenant_id.

### Requirement 3: Regular User Access Control

**User Story:** As a Regular User, I want to access only the features and data authorized by my administrator, so that I can perform my job functions within defined boundaries.

#### Acceptance Criteria

1. WHEN a Regular User logs into the system THEN the system SHALL authenticate the user, load their assigned roles and permissions, and restrict access based on their tenant_id.

2. WHEN a Regular User attempts to access a module THEN the system SHALL verify the user has the required permission for that module within their tenant before granting access.

3. WHEN a Regular User attempts to perform an action (create, read, update, delete) THEN the system SHALL validate the user has the specific action permission for that resource type.

4. WHEN a Regular User queries data THEN the system SHALL automatically filter all results by their tenant_id to ensure complete data isolation.

5. WHEN a Regular User attempts to create or modify data THEN the system SHALL automatically inject their tenant_id and prevent any cross-tenant operations.

6. IF a Regular User attempts to access user management features THEN the system SHALL deny access unless explicitly granted by their administrator.

7. WHEN a Regular User's permissions are modified by an administrator THEN the system SHALL invalidate existing sessions and require re-authentication to apply new permissions.

### Requirement 4: Authentication and JWT Token Management

**User Story:** As the system, I want to securely manage authentication tokens with tenant context, so that every request can be properly validated and isolated.

#### Acceptance Criteria

1. WHEN a user successfully authenticates THEN the system SHALL generate a JWT token containing user_id, email, tenant_id, roles array, and is_super_admin flag.

2. WHEN the system validates a JWT token THEN the system SHALL extract the tenant_id and configure the database session context (app.current_tenant_id) for Row Level Security.

3. WHEN a Super-Admin switches tenants THEN the system SHALL generate a new JWT token with the target tenant_id while maintaining the is_super_admin flag.

4. WHEN a JWT token expires THEN the system SHALL require re-authentication and prevent any operations with the expired token.

5. IF a user's roles or tenant assignment changes THEN the system SHALL invalidate all existing JWT tokens for that user.

6. WHEN the system processes any API request THEN the system SHALL validate the JWT token, extract tenant context, and apply it to all database operations.

### Requirement 5: Role-Based Access Control (RBAC)

**User Story:** As an administrator, I want to define granular roles and permissions, so that I can control exactly what each user can do within the system.

#### Acceptance Criteria

1. WHEN an administrator creates a role THEN the system SHALL associate the role with their tenant_id and allow assignment of module-level and action-level permissions.

2. WHEN the system evaluates a permission THEN the system SHALL check if the user's roles include the required permission for the specific module and action within their tenant.

3. WHEN a user has multiple roles THEN the system SHALL aggregate all permissions from all roles using a union approach (any role granting permission allows access).

4. WHEN an administrator modifies role permissions THEN the system SHALL apply changes immediately to all users with that role without requiring re-login.

5. IF a permission is revoked from a role THEN the system SHALL deny access to affected users on their next request.

6. WHEN the system checks permissions THEN the system SHALL validate tenant_id matches between the user, role, and resource being accessed.

### Requirement 6: User Management Workflows

**User Story:** As an administrator, I want streamlined workflows for creating and managing users, so that onboarding and maintenance are efficient and secure.

#### Acceptance Criteria

1. WHEN creating a new user THEN the system SHALL validate email uniqueness within the tenant, generate a secure temporary password, and send activation email with login instructions.

2. WHEN a user activates their account THEN the system SHALL require password change on first login and validate password complexity requirements.

3. WHEN an administrator resets a user's password THEN the system SHALL generate a secure reset token, send reset email, and expire the token after 24 hours or first use.

4. WHEN a user is deactivated THEN the system SHALL revoke all active sessions, disable login, and maintain data integrity for audit purposes.

5. WHEN a user is reactivated THEN the system SHALL restore access with previous roles and permissions and require password reset.

6. IF a user attempts to login with incorrect credentials 5 times THEN the system SHALL temporarily lock the account for 15 minutes and notify the administrator.

### Requirement 7: Tenant Isolation and Security

**User Story:** As the system, I want to enforce complete data isolation between tenants, so that no tenant can access or modify another tenant's data under any circumstances.

#### Acceptance Criteria

1. WHEN any database query executes THEN the system SHALL automatically filter by tenant_id using Row Level Security policies.

2. WHEN a user attempts to access a resource THEN the system SHALL validate the resource's tenant_id matches the user's tenant_id before allowing access.

3. WHEN the system performs INSERT operations THEN the system SHALL automatically inject the authenticated user's tenant_id into the record.

4. WHEN the system performs UPDATE or DELETE operations THEN the system SHALL validate tenant_id matches before executing the operation.

5. IF a query attempts to bypass tenant filtering THEN the system SHALL reject the query and log a security violation.

6. WHEN the system logs operations THEN the system SHALL include tenant_id in all log entries for audit and debugging purposes.

7. WHEN the system caches data THEN the system SHALL segregate cache by tenant_id to prevent cross-tenant data leakage.

### Requirement 8: Audit and Compliance

**User Story:** As an administrator, I want comprehensive audit logs of all administrative actions, so that I can track changes and maintain compliance.

#### Acceptance Criteria

1. WHEN any user management action occurs THEN the system SHALL log the action type, actor user_id, target user_id, tenant_id, timestamp, and changed values.

2. WHEN a Super-Admin accesses tenant data THEN the system SHALL log the access with full details including reason and data accessed.

3. WHEN permissions are modified THEN the system SHALL log the previous and new permission sets with actor and timestamp.

4. WHEN a user logs in or out THEN the system SHALL log the event with IP address, user agent, and timestamp.

5. WHEN a security violation occurs THEN the system SHALL log the violation, block the action, and optionally notify administrators.

6. IF an administrator queries audit logs THEN the system SHALL filter logs by their tenant_id unless they are a Super-Admin.

### Requirement 9: Frontend User Interface

**User Story:** As a user, I want an intuitive interface that adapts to my role and permissions, so that I can efficiently perform my tasks without confusion.

#### Acceptance Criteria

1. WHEN a user logs in THEN the system SHALL display only the modules and features they have permission to access.

2. WHEN a Super-Admin logs in THEN the system SHALL display a tenant selector allowing them to switch between tenants or access the super-admin dashboard.

3. WHEN an Admin de Empresa accesses user management THEN the system SHALL display a user list, role assignment interface, and permission configuration tools filtered to their tenant.

4. WHEN a Regular User navigates the system THEN the system SHALL hide administrative features and display only operational modules they can access.

5. WHEN the system displays data tables THEN the system SHALL automatically filter all data by the user's tenant_id without requiring manual filtering.

6. IF a user attempts to access a restricted feature THEN the system SHALL display a clear "Access Denied" message with explanation.

### Requirement 10: Migration and Backward Compatibility

**User Story:** As a developer, I want to migrate existing data and code to the new multi-level admin system, so that current functionality continues working while new features are added.

#### Acceptance Criteria

1. WHEN the system migrates existing users THEN the system SHALL assign them to the default tenant and preserve their current roles and permissions.

2. WHEN existing API endpoints are called THEN the system SHALL continue functioning with tenant context automatically applied.

3. WHEN the system refactors services THEN the system SHALL maintain backward compatibility for existing integrations while adding tenant filtering.

4. WHEN database migrations run THEN the system SHALL add tenant_id columns with default values to existing tables without data loss.

5. IF existing code doesn't specify tenant_id THEN the system SHALL use the authenticated user's tenant_id from the JWT token.

6. WHEN the migration completes THEN the system SHALL validate data integrity and ensure no cross-tenant data contamination occurred.
