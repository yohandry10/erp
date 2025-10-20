# Design Document

## Overview

This design document outlines the architecture and implementation strategy for a comprehensive multi-level administration system for the ERP platform. The system implements three distinct administrative hierarchies: Super-Admin (platform-wide), Admin de Empresa (tenant-level), and Regular Users (permission-based access).

The design builds upon the existing multi-tenant infrastructure (60% complete) documented in ANALISIS_MULTI_TENANT.md and addresses critical gaps in authentication, authorization, and user management. The solution leverages NestJS backend, Supabase PostgreSQL with Row Level Security (RLS), and Next.js frontend with React context management.

### Key Design Principles

1. **Security First**: Complete data isolation between tenants with defense-in-depth approach
2. **Scalability**: Support for 1,000+ tenants with minimal performance degradation
3. **Backward Compatibility**: Existing functionality continues working during migration
4. **Granular Control**: Fine-grained RBAC with module, action, and resource-level permissions
5. **Audit Trail**: Comprehensive logging of all administrative actions

### Technology Stack

- **Backend**: NestJS 10+ with TypeScript
- **Database**: Supabase (PostgreSQL 15+) with Row Level Security
- **Authentication**: JWT tokens with tenant context
- **Frontend**: Next.js 14+ with React 18+
- **State Management**: React Context API for tenant context
- **Validation**: class-validator and class-transformer

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Super-Admin  │  │ Admin Panel  │  │  User Panel  │      │
│  │  Dashboard   │  │  (Tenant)    │  │  (Regular)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│           │                │                │                │
│           └────────────────┴────────────────┘                │
│                          │                                   │
│                  TenantContext Provider                      │
└──────────────────────────┼──────────────────────────────────┘
                           │
                    JWT with tenant_id
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    API Gateway Layer                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              JwtAuthGuard (Global)                   │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           TenantMiddleware (Interceptor)             │   │
│  │    Sets: app.current_tenant_id, app.current_user_id │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                   Controller Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Super-Admin  │  │    Admin     │  │    Module    │      │
│  │ Controller   │  │  Controller  │  │ Controllers  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                  │               │
│         └─────────────────┴──────────────────┘               │
│                          │                                   │
│                  @CurrentTenant() Decorator                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    Service Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Tenant     │  │     User     │  │  Permission  │      │
│  │   Service    │  │   Service    │  │   Service    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  All methods accept tenantId parameter                      │
│  All queries filter by tenant_id                            │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                   Database Layer (Supabase)                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Row Level Security (RLS) Policies            │   │
│  │  - Tenant isolation on ALL tables                    │   │
│  │  - Permission-based access control                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Tables: usuarios_sistema, roles, permisos, rol_permisos,  │
│          user_roles, audit_log, user_sessions               │
└──────────────────────────────────────────────────────────────┘
```

### Request Flow

1. **User Authentication**
   - User submits credentials (email + password)
   - AuthService validates credentials against usuarios_sistema table
   - System generates JWT token containing: user_id, email, tenant_id, roles[], is_super_admin
   - Token returned to client

2. **Authenticated Request**
   - Client sends request with JWT in Authorization header
   - JwtAuthGuard validates token and extracts payload
   - TenantMiddleware sets database session context (app.current_tenant_id, app.current_user_id)
   - Controller receives request with @CurrentTenant() decorator injecting tenant_id
   - Service executes query with tenant_id filter
   - RLS policies validate access at database level
   - Response filtered by tenant context

3. **Super-Admin Tenant Switching**
   - Super-Admin selects different tenant from UI
   - Frontend requests new token with target tenant_id
   - Backend validates super-admin status
   - New JWT generated with target tenant_id + is_super_admin flag
   - Subsequent requests use new tenant context


## Components and Interfaces

### Backend Components

#### 1. Authentication Module

**AuthService**
```typescript
interface JwtPayload {
  sub: string;              // user_id
  email: string;
  username?: string;
  tenant_id: string;        // Current tenant context
  roles: string[];          // Array of role names
  is_super_admin: boolean;  // Super-admin flag
  iat: number;              // Issued at
  exp: number;              // Expiration
}

class AuthService {
  async login(loginDto: LoginDto): Promise<LoginResponse>
  async validateUser(email: string, password: string): Promise<User>
  async refreshToken(user: User): Promise<TokenResponse>
  async switchTenant(userId: string, targetTenantId: string): Promise<TokenResponse>
  async validateToken(token: string): Promise<User>
  async revokeUserSessions(userId: string): Promise<void>
}
```

**JwtAuthGuard**
```typescript
@Injectable()
class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // Validates JWT token
    // Extracts user payload
    // Attaches user to request object
  }
}
```

**TenantMiddleware**
```typescript
@Injectable()
class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Extract tenant_id from JWT payload
    // Set database session context
    // Configure app.current_tenant_id
    // Configure app.current_user_id
  }
}
```

#### 2. User Management Module

**UserManagementService**
```typescript
interface CreateUserDto {
  nombre: string;
  email: string;
  telefono?: string;
  cargo?: string;
  departamento?: string;
  roles: string[];          // Array of role IDs
}

interface UpdateUserDto {
  nombre?: string;
  telefono?: string;
  cargo?: string;
  departamento?: string;
  estado?: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';
}

class UserManagementService {
  async createUser(tenantId: string, userData: CreateUserDto): Promise<User>
  async updateUser(tenantId: string, userId: string, userData: UpdateUserDto): Promise<User>
  async deleteUser(tenantId: string, userId: string): Promise<void>
  async getUsers(tenantId: string, filters?: UserFilters): Promise<User[]>
  async getUserById(tenantId: string, userId: string): Promise<User>
  async assignRoles(tenantId: string, userId: string, roleIds: string[]): Promise<void>
  async removeRoles(tenantId: string, userId: string, roleIds: string[]): Promise<void>
  async activateUser(tenantId: string, userId: string): Promise<User>
  async deactivateUser(tenantId: string, userId: string): Promise<User>
  async resetPassword(tenantId: string, userId: string): Promise<ResetToken>
}
```


#### 3. Tenant Management Module (Super-Admin Only)

**TenantManagementService**
```typescript
interface CreateTenantDto {
  nombre: string;
  ruc?: string;
  direccion?: string;
  telefono?: string;
  email: string;
  pais: string;
  moneda: string;
  admin_email: string;      // First admin user email
  admin_nombre: string;     // First admin user name
}

interface TenantConfig {
  tenant_id: string;
  configuracion: {
    facturacion_electronica: boolean;
    multi_almacen: boolean;
    multi_moneda: boolean;
    modulos_activos: string[];
  };
}

class TenantManagementService {
  async createTenant(tenantData: CreateTenantDto): Promise<Tenant>
  async updateTenant(tenantId: string, tenantData: UpdateTenantDto): Promise<Tenant>
  async getTenants(filters?: TenantFilters): Promise<Tenant[]>
  async getTenantById(tenantId: string): Promise<Tenant>
  async activateTenant(tenantId: string): Promise<Tenant>
  async deactivateTenant(tenantId: string): Promise<Tenant>
  async getTenantStats(tenantId: string): Promise<TenantStats>
  async getTenantUsers(tenantId: string): Promise<User[]>
  async getTenantConfig(tenantId: string): Promise<TenantConfig>
  async updateTenantConfig(tenantId: string, config: Partial<TenantConfig>): Promise<TenantConfig>
}
```

#### 4. Permission Management Module

**PermissionService**
```typescript
interface Permission {
  id: string;
  tenant_id: string;
  modulo: string;           // ventas, compras, inventario, etc.
  accion: string;           // create, read, update, delete, export
  recurso: string;          // clientes, productos, facturas, etc.
  descripcion: string;
}

interface RolePermission {
  role_id: string;
  permiso_id: string;
  concedido: boolean;
}

class PermissionService {
  async getPermissions(tenantId: string): Promise<Permission[]>
  async getRolePermissions(tenantId: string, roleId: string): Promise<Permission[]>
  async assignPermissionToRole(tenantId: string, roleId: string, permissionId: string): Promise<void>
  async revokePermissionFromRole(tenantId: string, roleId: string, permissionId: string): Promise<void>
  async checkUserPermission(userId: string, tenantId: string, modulo: string, accion: string, recurso: string): Promise<boolean>
  async getUserPermissions(userId: string, tenantId: string): Promise<Permission[]>
}
```


#### 5. Role Management Module

**RoleService**
```typescript
interface Role {
  id: string;
  tenant_id: string;
  nombre: string;
  descripcion: string;
  permisos: string[];       // Legacy JSONB field (deprecated)
  created_at: Date;
  updated_at: Date;
}

interface CreateRoleDto {
  nombre: string;
  descripcion: string;
  permission_ids: string[]; // Permissions to assign
}

class RoleService {
  async createRole(tenantId: string, roleData: CreateRoleDto): Promise<Role>
  async updateRole(tenantId: string, roleId: string, roleData: UpdateRoleDto): Promise<Role>
  async deleteRole(tenantId: string, roleId: string): Promise<void>
  async getRoles(tenantId: string): Promise<Role[]>
  async getRoleById(tenantId: string, roleId: string): Promise<Role>
  async getRoleUsers(tenantId: string, roleId: string): Promise<User[]>
}
```

#### 6. Audit Service

**AuditService**
```typescript
interface AuditLog {
  id: string;
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  user_id: string;
  tenant_id: string;
  timestamp: Date;
}

class AuditService {
  async logAction(action: AuditLog): Promise<void>
  async getAuditLogs(tenantId: string, filters?: AuditFilters): Promise<AuditLog[]>
  async getUserAuditLogs(tenantId: string, userId: string): Promise<AuditLog[]>
  async getResourceAuditLogs(tenantId: string, tableName: string, resourceId: string): Promise<AuditLog[]>
}
```

### Frontend Components

#### 1. TenantContext Provider

```typescript
interface TenantContextValue {
  tenant: Tenant | null;
  user: User | null;
  isSuperAdmin: boolean;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [user, setUser] = useState<User | null>(null);
  
  // Load tenant from JWT token
  // Provide tenant switching for super-admins
  // Refresh tenant data
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error('useTenant must be used within TenantProvider');
  return context;
}
```


#### 2. Super-Admin Dashboard

```typescript
interface SuperAdminDashboardProps {
  tenants: Tenant[];
  stats: SystemStats;
}

function SuperAdminDashboard() {
  // Display all tenants
  // Show system-wide statistics
  // Tenant creation form
  // Tenant management actions
  // Tenant switching selector
}
```

#### 3. Admin de Empresa Dashboard

```typescript
interface AdminDashboardProps {
  users: User[];
  roles: Role[];
  permissions: Permission[];
}

function AdminDashboard() {
  // Display tenant users
  // User creation/management forms
  // Role assignment interface
  // Permission configuration
  // User activity logs
}
```

#### 4. User Management Components

```typescript
function UserListComponent() {
  // Table of users filtered by tenant
  // Search and filter capabilities
  // Actions: edit, deactivate, reset password
}

function UserFormComponent({ userId }: { userId?: string }) {
  // Create/Edit user form
  // Role selection multi-select
  // Validation
}

function RoleAssignmentComponent({ userId }: { userId: string }) {
  // Multi-select for roles
  // Display current roles
  // Add/Remove role actions
}
```

## Data Models

### Database Schema

#### usuarios_sistema Table
```sql
CREATE TABLE usuarios_sistema (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000',
    nombre TEXT NOT NULL,
    apellido TEXT,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    telefono TEXT,
    cargo TEXT,
    departamento TEXT,
    estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO')),
    is_super_admin BOOLEAN DEFAULT false,
    fecha_ultimo_acceso TIMESTAMPTZ,
    password_reset_token TEXT,
    password_reset_expires TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_usuarios_sistema_tenant_id ON usuarios_sistema(tenant_id);
CREATE INDEX idx_usuarios_sistema_email ON usuarios_sistema(email);
CREATE INDEX idx_usuarios_sistema_tenant_email ON usuarios_sistema(tenant_id, email);
```


#### roles Table
```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000',
    nombre TEXT NOT NULL,
    descripcion TEXT,
    permisos JSONB,  -- Legacy field, deprecated in favor of rol_permisos
    is_system_role BOOLEAN DEFAULT false,  -- Cannot be deleted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, nombre)
);

CREATE INDEX idx_roles_tenant_id ON roles(tenant_id);
```

#### user_roles Table
```sql
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,  -- From Supabase auth.users (legacy)
    usuario_sistema_id UUID REFERENCES usuarios_sistema(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(usuario_sistema_id, role_id)
);

CREATE INDEX idx_user_roles_usuario_sistema_id ON user_roles(usuario_sistema_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
```

#### permisos Table
```sql
CREATE TABLE permisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000',
    modulo TEXT NOT NULL,
    accion TEXT NOT NULL,
    recurso TEXT NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, modulo, accion, recurso)
);

CREATE INDEX idx_permisos_tenant_id ON permisos(tenant_id);
CREATE INDEX idx_permisos_modulo_accion_recurso ON permisos(modulo, accion, recurso);
```

#### rol_permisos Table
```sql
CREATE TABLE rol_permisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permiso_id UUID REFERENCES permisos(id) ON DELETE CASCADE,
    concedido BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permiso_id)
);

CREATE INDEX idx_rol_permisos_role_id ON rol_permisos(role_id);
CREATE INDEX idx_rol_permisos_permiso_id ON rol_permisos(permiso_id);
```


#### tenants Table (New)
```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    ruc TEXT,
    direccion TEXT,
    telefono TEXT,
    email TEXT NOT NULL,
    pais TEXT NOT NULL DEFAULT 'PE',
    moneda TEXT NOT NULL DEFAULT 'PEN',
    estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'PRUEBA')),
    fecha_inicio TIMESTAMPTZ DEFAULT NOW(),
    fecha_fin TIMESTAMPTZ,
    plan TEXT DEFAULT 'BASICO',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email)
);

CREATE INDEX idx_tenants_estado ON tenants(estado);
CREATE INDEX idx_tenants_email ON tenants(email);
```

#### audit_log Table
```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB,
    new_values JSONB,
    user_id UUID,
    tenant_id UUID,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_tenant_id ON audit_log(tenant_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_table_name ON audit_log(table_name);
```

#### user_sessions Table
```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    usuario_sistema_id UUID REFERENCES usuarios_sistema(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_usuario_sistema_id ON user_sessions(usuario_sistema_id);
CREATE INDEX idx_user_sessions_tenant_id ON user_sessions(tenant_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_session_token ON user_sessions(session_token);
```


### Row Level Security Policies

#### Tenant Isolation Policy (Applied to all tenant-scoped tables)
```sql
CREATE POLICY "tenant_isolation" ON {table_name}
    FOR ALL
    USING (tenant_id = get_current_tenant_id());
```

#### Super-Admin Override Policy
```sql
CREATE POLICY "super_admin_access" ON {table_name}
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM usuarios_sistema
            WHERE id = get_current_user_id()
            AND is_super_admin = true
        )
    );
```

#### Permission-Based Access Policy
```sql
CREATE POLICY "permission_based_access" ON {table_name}
    FOR SELECT
    USING (
        tenant_id = get_current_tenant_id() AND
        user_has_permission('{modulo}', 'read', '{recurso}')
    );
```

## Error Handling

### Error Types

1. **AuthenticationError**: Invalid credentials, expired token
2. **AuthorizationError**: Insufficient permissions, wrong tenant
3. **ValidationError**: Invalid input data
4. **TenantNotFoundError**: Tenant doesn't exist
5. **UserNotFoundError**: User doesn't exist
6. **DuplicateEmailError**: Email already exists in tenant
7. **SessionExpiredError**: Session token expired
8. **AccountLockedError**: Too many failed login attempts

### Error Response Format

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  details?: Record<string, any>;
}
```

### Error Handling Strategy

1. **Controller Level**: Catch and transform exceptions
2. **Service Level**: Throw domain-specific exceptions
3. **Global Exception Filter**: Format all errors consistently
4. **Logging**: Log all errors with context (tenant_id, user_id, request_id)
5. **User-Friendly Messages**: Don't expose internal details


## Testing Strategy

### Unit Tests

**AuthService Tests**
- Login with valid credentials
- Login with invalid credentials
- Token generation includes tenant_id
- Token validation
- Password reset flow
- Account lockout after failed attempts

**UserManagementService Tests**
- Create user with tenant isolation
- Update user validates tenant
- Delete user validates tenant
- Assign roles validates tenant
- Cannot access users from other tenants

**PermissionService Tests**
- Check permission returns correct result
- Permission inheritance from multiple roles
- Permission revocation takes effect immediately

**TenantManagementService Tests**
- Create tenant with first admin user
- Deactivate tenant disables all users
- Tenant stats calculation

### Integration Tests

**Multi-Tenant Isolation Tests**
- User from Tenant A cannot see data from Tenant B
- Queries automatically filter by tenant_id
- RLS policies enforce isolation at database level

**Authentication Flow Tests**
- Complete login flow with JWT generation
- Token refresh maintains tenant context
- Super-admin can switch tenants

**Permission Flow Tests**
- User with permission can access resource
- User without permission is denied
- Permission changes apply immediately

### End-to-End Tests

**Super-Admin Workflow**
- Create new tenant
- Assign first admin
- Switch between tenants
- View system-wide statistics

**Admin de Empresa Workflow**
- Create users in tenant
- Assign roles to users
- Configure permissions
- View audit logs

**Regular User Workflow**
- Login and access permitted modules
- Denied access to restricted modules
- Data filtered by tenant automatically

### Performance Tests

- Login performance with 1000+ users
- Query performance with 100+ tenants
- Permission check performance
- RLS policy overhead measurement


## Security Considerations

### Authentication Security

1. **Password Requirements**
   - Minimum 8 characters
   - Must include uppercase, lowercase, number, special character
   - Password hashing with bcrypt (cost factor 10)
   - Password history (prevent reuse of last 5 passwords)

2. **Account Lockout**
   - Lock account after 5 failed login attempts
   - Lockout duration: 15 minutes
   - Notify admin of lockout events

3. **Session Management**
   - JWT expiration: 8 hours
   - Refresh token expiration: 30 days
   - Revoke all sessions on password change
   - Track active sessions per user

4. **Token Security**
   - Sign tokens with RS256 algorithm
   - Include jti (JWT ID) for revocation
   - Validate token signature on every request
   - Blacklist revoked tokens

### Authorization Security

1. **Tenant Isolation**
   - Never trust tenant_id from client
   - Always extract tenant_id from JWT
   - Validate tenant_id on every database query
   - Use RLS as defense-in-depth

2. **Permission Validation**
   - Check permissions at controller level
   - Validate permissions at service level
   - Enforce permissions at database level (RLS)
   - Cache permission checks (5 minute TTL)

3. **Super-Admin Controls**
   - Require MFA for super-admin accounts
   - Log all super-admin actions
   - Limit super-admin tenant switching
   - Alert on suspicious super-admin activity

### Data Security

1. **Encryption**
   - Encrypt sensitive fields at rest
   - Use TLS 1.3 for data in transit
   - Encrypt database backups
   - Secure key management (AWS KMS, Vault)

2. **Data Isolation**
   - Physical separation not required (shared schema)
   - Logical separation via tenant_id + RLS
   - Regular audits of cross-tenant queries
   - Automated testing of isolation

3. **Audit Trail**
   - Log all administrative actions
   - Log all permission changes
   - Log all authentication events
   - Retain logs for 1 year minimum

### Input Validation

1. **DTO Validation**
   - Use class-validator decorators
   - Validate all input at controller level
   - Sanitize HTML/SQL injection attempts
   - Limit input sizes

2. **SQL Injection Prevention**
   - Use parameterized queries only
   - Never concatenate user input in SQL
   - Use ORM/query builder (Supabase client)
   - Regular security scans


## Performance Optimization

### Database Optimization

1. **Indexing Strategy**
   - Composite index on (tenant_id, frequently_queried_column)
   - Index on tenant_id for all tenant-scoped tables
   - Partial indexes for common filters (e.g., estado = 'ACTIVO')
   - Regular index maintenance and analysis

2. **Query Optimization**
   - Use EXPLAIN ANALYZE for slow queries
   - Avoid N+1 queries with proper joins
   - Limit result sets with pagination
   - Use database views for complex queries

3. **Connection Pooling**
   - Configure Supabase connection pool
   - Monitor connection usage
   - Set appropriate pool size (10-20 connections)

### Caching Strategy

1. **Permission Cache**
   - Cache user permissions for 5 minutes
   - Invalidate on permission change
   - Use Redis for distributed cache
   - Cache key: `permissions:${userId}:${tenantId}`

2. **Role Cache**
   - Cache role definitions for 10 minutes
   - Invalidate on role modification
   - Cache key: `role:${roleId}`

3. **Tenant Config Cache**
   - Cache tenant configuration for 30 minutes
   - Invalidate on config update
   - Cache key: `tenant:config:${tenantId}`

### API Performance

1. **Response Optimization**
   - Use pagination for list endpoints (default: 50 items)
   - Implement field selection (sparse fieldsets)
   - Compress responses with gzip
   - Use ETags for caching

2. **Rate Limiting**
   - 100 requests per minute per user
   - 1000 requests per minute per tenant
   - Stricter limits for expensive operations
   - Return 429 Too Many Requests

### Monitoring

1. **Metrics to Track**
   - Request latency (p50, p95, p99)
   - Database query time
   - Authentication success/failure rate
   - Active sessions per tenant
   - Permission check latency

2. **Alerting**
   - Alert on high error rates (>5%)
   - Alert on slow queries (>1s)
   - Alert on failed login spikes
   - Alert on RLS policy violations


## Migration Strategy

### Phase 1: Database Schema Updates (Week 1)

1. **Create New Tables**
   - Create tenants table
   - Add is_super_admin column to usuarios_sistema
   - Add password_hash, password_reset_token columns
   - Add failed_login_attempts, locked_until columns

2. **Migrate Existing Data**
   - Assign all existing users to default tenant
   - Set is_super_admin = false for all users
   - Generate password hashes for existing users (require reset)
   - Create default roles if not exist

3. **Update Indexes**
   - Add composite indexes (tenant_id, email)
   - Add indexes for new columns
   - Analyze query performance

### Phase 2: Backend Implementation (Week 2-3)

1. **Authentication Module**
   - Update AuthService to include tenant_id in JWT
   - Implement TenantMiddleware
   - Add super-admin tenant switching
   - Implement account lockout logic

2. **User Management Module**
   - Create UserManagementService
   - Create UserManagementController
   - Implement CRUD operations with tenant filtering
   - Add role assignment endpoints

3. **Tenant Management Module**
   - Create TenantManagementService
   - Create TenantManagementController (super-admin only)
   - Implement tenant creation with first admin
   - Add tenant activation/deactivation

4. **Update Existing Services**
   - Refactor all services to accept tenantId parameter
   - Update all queries to filter by tenant_id
   - Add tenant validation to all operations
   - Update controllers to use @CurrentTenant() decorator

### Phase 3: Frontend Implementation (Week 3-4)

1. **Context Setup**
   - Create TenantContext provider
   - Extract tenant from JWT
   - Implement tenant switching for super-admins

2. **Super-Admin UI**
   - Create super-admin dashboard
   - Tenant list and management
   - Tenant creation form
   - System statistics

3. **Admin de Empresa UI**
   - User management interface
   - Role assignment interface
   - Permission configuration
   - Audit log viewer

4. **Update Existing Components**
   - Wrap app with TenantProvider
   - Update API calls to include tenant context
   - Add permission checks to UI components
   - Hide features based on permissions


### Phase 4: Testing and Validation (Week 4)

1. **Unit Tests**
   - Write tests for all new services
   - Test tenant isolation
   - Test permission validation
   - Test authentication flows

2. **Integration Tests**
   - Test complete user workflows
   - Test multi-tenant isolation
   - Test RLS policies
   - Test API endpoints

3. **Security Audit**
   - Verify tenant isolation
   - Test for SQL injection
   - Test authentication bypass attempts
   - Validate permission enforcement

4. **Performance Testing**
   - Load test with multiple tenants
   - Measure query performance
   - Test with 1000+ users
   - Optimize slow queries

### Rollback Plan

1. **Database Rollback**
   - Keep migration scripts reversible
   - Backup database before migration
   - Test rollback procedure
   - Document rollback steps

2. **Code Rollback**
   - Use feature flags for new functionality
   - Maintain backward compatibility
   - Keep old endpoints functional
   - Gradual rollout strategy

3. **Data Integrity**
   - Verify no data loss during migration
   - Validate tenant_id assignments
   - Check for orphaned records
   - Audit cross-tenant data access

## Deployment Considerations

### Environment Configuration

```typescript
// .env configuration
JWT_SECRET=<strong-secret-key>
JWT_EXPIRATION=8h
REFRESH_TOKEN_EXPIRATION=30d
DEFAULT_TENANT_ID=550e8400-e29b-41d4-a716-446655440000
BCRYPT_ROUNDS=10
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
SESSION_CLEANUP_INTERVAL=1h
ENABLE_SUPER_ADMIN_MFA=true
```

### Database Configuration

```sql
-- Set RLS configuration
ALTER DATABASE postgres SET app.current_tenant_id = '550e8400-e29b-41d4-a716-446655440000';

-- Configure connection pooling
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '256MB';
```

### Monitoring Setup

1. **Application Monitoring**
   - Setup Sentry for error tracking
   - Configure DataDog/New Relic for APM
   - Track custom metrics (tenant count, active users)

2. **Database Monitoring**
   - Enable Supabase monitoring
   - Track slow queries
   - Monitor connection pool usage
   - Alert on high CPU/memory

3. **Security Monitoring**
   - Log all authentication failures
   - Alert on suspicious activity
   - Monitor for brute force attempts
   - Track permission violations


## API Endpoints

### Authentication Endpoints

```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
POST   /api/auth/change-password
POST   /api/auth/switch-tenant (super-admin only)
GET    /api/auth/me
```

### User Management Endpoints (Admin de Empresa)

```
GET    /api/users                    # List users in tenant
GET    /api/users/:id                # Get user details
POST   /api/users                    # Create user
PUT    /api/users/:id                # Update user
DELETE /api/users/:id                # Delete user
POST   /api/users/:id/activate       # Activate user
POST   /api/users/:id/deactivate     # Deactivate user
POST   /api/users/:id/reset-password # Reset user password
GET    /api/users/:id/roles          # Get user roles
POST   /api/users/:id/roles          # Assign roles to user
DELETE /api/users/:id/roles/:roleId  # Remove role from user
GET    /api/users/:id/permissions    # Get user permissions
GET    /api/users/:id/audit-logs     # Get user audit logs
```

### Tenant Management Endpoints (Super-Admin Only)

```
GET    /api/tenants                  # List all tenants
GET    /api/tenants/:id              # Get tenant details
POST   /api/tenants                  # Create tenant
PUT    /api/tenants/:id              # Update tenant
DELETE /api/tenants/:id              # Delete tenant
POST   /api/tenants/:id/activate     # Activate tenant
POST   /api/tenants/:id/deactivate   # Deactivate tenant
GET    /api/tenants/:id/users        # Get tenant users
GET    /api/tenants/:id/stats        # Get tenant statistics
GET    /api/tenants/:id/config       # Get tenant configuration
PUT    /api/tenants/:id/config       # Update tenant configuration
```

### Role Management Endpoints

```
GET    /api/roles                    # List roles in tenant
GET    /api/roles/:id                # Get role details
POST   /api/roles                    # Create role
PUT    /api/roles/:id                # Update role
DELETE /api/roles/:id                # Delete role
GET    /api/roles/:id/permissions    # Get role permissions
POST   /api/roles/:id/permissions    # Assign permission to role
DELETE /api/roles/:id/permissions/:permissionId # Remove permission
GET    /api/roles/:id/users          # Get users with role
```

### Permission Management Endpoints

```
GET    /api/permissions              # List all permissions
GET    /api/permissions/:id          # Get permission details
POST   /api/permissions              # Create permission (super-admin)
PUT    /api/permissions/:id          # Update permission (super-admin)
DELETE /api/permissions/:id          # Delete permission (super-admin)
```

### Audit Endpoints

```
GET    /api/audit-logs               # List audit logs (filtered by tenant)
GET    /api/audit-logs/:id           # Get audit log details
GET    /api/audit-logs/user/:userId  # Get user audit logs
GET    /api/audit-logs/resource/:tableName/:resourceId # Get resource logs
```


## Design Decisions and Rationale

### 1. Shared Schema vs Schema-per-Tenant

**Decision**: Use shared schema with tenant_id column

**Rationale**:
- Simpler to maintain (single set of migrations)
- Better for SaaS with many small tenants
- Easier to implement cross-tenant features (super-admin)
- Lower operational complexity
- RLS provides adequate isolation

**Trade-offs**:
- Requires careful query filtering
- Potential for data leakage if not implemented correctly
- All tenants affected by schema changes

### 2. JWT Token with Tenant Context

**Decision**: Include tenant_id in JWT payload

**Rationale**:
- Eliminates need to query database for tenant on every request
- Enables stateless authentication
- Simplifies middleware implementation
- Supports tenant switching for super-admins

**Trade-offs**:
- Token size slightly larger
- Tenant changes require new token
- Cannot revoke tenant access without token blacklist

### 3. Granular RBAC with Separate Permission Table

**Decision**: Use permisos and rol_permisos tables instead of JSONB in roles

**Rationale**:
- More flexible permission management
- Easier to query and audit permissions
- Supports permission inheritance
- Better performance for permission checks
- Enables dynamic permission creation

**Trade-offs**:
- More complex data model
- Additional joins for permission checks
- Requires migration from legacy JSONB field

### 4. Row Level Security (RLS) as Defense-in-Depth

**Decision**: Implement RLS policies in addition to application-level filtering

**Rationale**:
- Provides database-level security guarantee
- Protects against application bugs
- Enforces isolation even for direct database access
- Compliance requirement for multi-tenant systems

**Trade-offs**:
- Slight performance overhead
- More complex debugging
- Requires careful policy design

### 5. Super-Admin Tenant Switching

**Decision**: Allow super-admins to switch tenant context via new JWT

**Rationale**:
- Enables support and troubleshooting
- Maintains audit trail of super-admin actions
- Doesn't require separate authentication mechanism
- Preserves super-admin privileges across tenants

**Trade-offs**:
- Potential security risk if compromised
- Requires careful logging and monitoring
- Must implement MFA for super-admins


### 6. Password Management in usuarios_sistema

**Decision**: Store password_hash in usuarios_sistema table

**Rationale**:
- Full control over authentication logic
- Supports custom password policies
- Enables account lockout mechanism
- Independent from Supabase Auth

**Trade-offs**:
- Must implement password reset flow
- Responsible for secure password storage
- Need to handle password complexity validation

### 7. Account Lockout After Failed Attempts

**Decision**: Lock account for 15 minutes after 5 failed attempts

**Rationale**:
- Prevents brute force attacks
- Industry standard practice
- Balances security and usability
- Automatic unlock reduces support burden

**Trade-offs**:
- Potential for denial of service
- May frustrate legitimate users
- Requires notification mechanism

### 8. Audit Logging with Triggers

**Decision**: Use database triggers for automatic audit logging

**Rationale**:
- Captures all changes regardless of source
- Cannot be bypassed by application code
- Consistent audit trail
- Minimal application code changes

**Trade-offs**:
- Performance overhead on writes
- Large audit tables over time
- Requires log retention policy

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Multi-Factor Authentication (MFA)**
   - TOTP-based MFA for super-admins
   - SMS-based MFA option
   - Backup codes

2. **Advanced Permission Management**
   - Field-level permissions
   - Time-based permissions
   - IP-based access control
   - Conditional permissions

3. **Tenant Customization**
   - Custom branding per tenant
   - Custom domain support
   - Tenant-specific modules
   - White-label options

4. **Advanced Audit Features**
   - Audit log export
   - Compliance reports
   - Real-time audit alerts
   - Audit log retention policies

5. **User Self-Service**
   - User profile management
   - Password change without admin
   - Session management
   - Activity history

6. **Tenant Analytics**
   - Usage metrics per tenant
   - User activity analytics
   - Feature adoption tracking
   - Cost allocation

7. **API Key Management**
   - Generate API keys for integrations
   - Scope API keys to specific permissions
   - API key rotation
   - Usage tracking

8. **Tenant Isolation Improvements**
   - Schema-per-tenant option for large tenants
   - Tenant-specific database replicas
   - Geographic data residency
   - Tenant data export


## References and Resources

### Internal Documentation
- ANALISIS_MULTI_TENANT.md - Current multi-tenant analysis
- GUIA_DESARROLLO_MULTI_TENANT.md - Multi-tenant development guide
- PROGRESO_MULTI_TENANT.md - Implementation progress tracking

### Database Migrations
- 20241222_create_usuarios_sistema.sql - User system tables
- 20250127_implement_rls_rbac_security.sql - RLS and RBAC implementation
- 20251015_multi_tenant_rls_functions.sql - Multi-tenant helper functions

### External Resources
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Multi-Tenant Architecture Patterns](https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)

## Glossary

- **Tenant**: An isolated customer/company instance within the multi-tenant system
- **Super-Admin**: Platform administrator with access to all tenants
- **Admin de Empresa**: Tenant administrator with user management capabilities within their tenant
- **Regular User**: End user with permission-based access to modules
- **RLS**: Row Level Security - PostgreSQL feature for data isolation
- **RBAC**: Role-Based Access Control - Permission model based on roles
- **JWT**: JSON Web Token - Stateless authentication token
- **MFA**: Multi-Factor Authentication - Additional security layer
- **Audit Log**: Record of all system changes for compliance and debugging

## Appendix A: Sample Data

### Sample Tenants
```sql
INSERT INTO tenants (id, nombre, email, pais, moneda, estado) VALUES
('550e8400-e29b-41d4-a716-446655440000', 'Empresa Demo', 'demo@example.com', 'PE', 'PEN', 'ACTIVO'),
('550e8400-e29b-41d4-a716-446655440001', 'Empresa Test', 'test@example.com', 'PE', 'PEN', 'ACTIVO');
```

### Sample Roles
```sql
INSERT INTO roles (id, tenant_id, nombre, descripcion, is_system_role) VALUES
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'ADMIN', 'Administrador del sistema', true),
('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', 'CONTADOR', 'Contador', true),
('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', 'VENDEDOR', 'Vendedor', true);
```

### Sample Permissions
```sql
INSERT INTO permisos (tenant_id, modulo, accion, recurso, descripcion) VALUES
('550e8400-e29b-41d4-a716-446655440000', 'ventas', 'read', 'clientes', 'Ver clientes'),
('550e8400-e29b-41d4-a716-446655440000', 'ventas', 'create', 'clientes', 'Crear clientes'),
('550e8400-e29b-41d4-a716-446655440000', 'inventario', 'read', 'productos', 'Ver productos');
```

---

**Document Version**: 1.0  
**Last Updated**: October 15, 2025  
**Status**: Ready for Review
