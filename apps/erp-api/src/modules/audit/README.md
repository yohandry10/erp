# Audit Service

The Audit Service provides comprehensive audit logging and querying capabilities for the multi-tenant ERP system.

## Features

- **Manual Audit Logging**: Log any action to the audit_log table
- **Filtered Queries**: Query audit logs with multiple filter options
- **User History**: Get complete action history for specific users
- **Resource Tracking**: Track all changes to specific resources
- **Tenant Isolation**: All queries are automatically filtered by tenant_id

## Usage

### Import the Module

```typescript
import { AuditModule } from './modules/audit';

@Module({
  imports: [AuditModule],
  // ...
})
export class YourModule {}
```

### Inject the Service

```typescript
import { AuditService } from './modules/audit';

@Injectable()
export class YourService {
  constructor(private readonly auditService: AuditService) {}
}
```

### Log an Action

```typescript
await this.auditService.logAction({
  table_name: 'usuarios_sistema',
  operation: 'UPDATE',
  old_values: { estado: 'ACTIVO' },
  new_values: { estado: 'INACTIVO' },
  user_id: currentUserId,
  tenant_id: tenantId,
  ip_address: request.ip,
  user_agent: request.headers['user-agent']
});
```

### Query Audit Logs

```typescript
// Get all audit logs for a tenant with pagination
const logs = await this.auditService.getAuditLogs(tenantId, {
  page: 1,
  limit: 50
});

// Filter by table name
const userLogs = await this.auditService.getAuditLogs(tenantId, {
  table_name: 'usuarios_sistema',
  operation: 'DELETE'
});

// Filter by date range
const recentLogs = await this.auditService.getAuditLogs(tenantId, {
  start_date: '2024-01-01T00:00:00Z',
  end_date: '2024-12-31T23:59:59Z'
});
```

### Get User Audit History

```typescript
const userHistory = await this.auditService.getUserAuditLogs(tenantId, userId);
```

### Get Resource Change History

```typescript
const resourceHistory = await this.auditService.getResourceAuditLogs(
  tenantId,
  'productos',
  productId
);
```

## API Reference

### `logAction(auditLog: AuditLog): Promise<void>`

Logs an action to the audit_log table. This method is non-blocking and will not throw errors to avoid breaking the main operation.

**Parameters:**
- `auditLog.table_name` (string, required): Name of the table being audited
- `auditLog.operation` (string, required): Operation type ('INSERT', 'UPDATE', 'DELETE')
- `auditLog.old_values` (object, optional): Previous values before the change
- `auditLog.new_values` (object, optional): New values after the change
- `auditLog.user_id` (string, optional): ID of the user performing the action
- `auditLog.tenant_id` (string, required): Tenant ID for isolation
- `auditLog.ip_address` (string, optional): IP address of the request
- `auditLog.user_agent` (string, optional): User agent of the request

### `getAuditLogs(tenantId: string, filters?: AuditFiltersDto)`

Retrieves audit logs with optional filters and pagination.

**Parameters:**
- `tenantId` (string, required): Tenant ID for filtering
- `filters.page` (number, optional): Page number (default: 1)
- `filters.limit` (number, optional): Items per page (default: 50)
- `filters.table_name` (string, optional): Filter by table name
- `filters.operation` (string, optional): Filter by operation type
- `filters.user_id` (string, optional): Filter by user ID
- `filters.start_date` (string, optional): Filter by start date (ISO 8601)
- `filters.end_date` (string, optional): Filter by end date (ISO 8601)

**Returns:**
```typescript
{
  data: AuditLog[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number
  }
}
```

### `getUserAuditLogs(tenantId: string, userId: string)`

Retrieves all audit logs for a specific user.

**Parameters:**
- `tenantId` (string, required): Tenant ID for filtering
- `userId` (string, required): User ID to get history for

**Returns:** `AuditLog[]`

### `getResourceAuditLogs(tenantId: string, tableName: string, resourceId: string)`

Retrieves all audit logs for a specific resource.

**Parameters:**
- `tenantId` (string, required): Tenant ID for filtering
- `tableName` (string, required): Name of the table containing the resource
- `resourceId` (string, required): ID of the resource to track

**Returns:** `AuditLog[]`

## Database Schema

The audit service uses the `audit_log` table with the following structure:

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
```

## Requirements Covered

- **8.1**: Log all user management actions with actor, target, tenant_id, and timestamp
- **8.2**: Log super-admin access to tenant data with full details
- **8.6**: Query audit logs filtered by tenant_id (unless super-admin)

## Notes

- Audit logging is non-blocking - errors in logging will not break the main operation
- All queries are automatically filtered by tenant_id for security
- Results are ordered by timestamp in descending order (most recent first)
- The service uses a 5-minute cache for permission checks (inherited from PermissionService pattern)
