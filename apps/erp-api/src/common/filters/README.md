# Global Exception Filter

The GlobalExceptionFilter provides consistent error handling across the entire application.

## Features

- **Consistent Error Format**: All errors are returned in a standardized format
- **Context Logging**: Logs errors with tenant_id, user_id, and request context
- **Security**: Sanitizes error messages to avoid exposing internal details in production
- **Request Tracking**: Includes request ID for tracing errors across services

## Error Response Format

```typescript
{
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}
```

## Configuration

The filter is registered globally in `main.ts`:

```typescript
app.useGlobalFilters(new GlobalExceptionFilter());
```

## Logging

- **4xx errors**: Logged as warnings with context
- **5xx errors**: Logged as errors with full stack trace
- **Context includes**: tenant_id, user_id, request_id, method, IP, user agent

## Message Sanitization

In production, the filter automatically sanitizes:
- Internal server error details (5xx)
- Database constraint violation messages
- Foreign key constraint errors
- Duplicate key errors

## Example

```typescript
// In a service
throw new UserNotFoundException(userId);

// Client receives:
{
  statusCode: 404,
  message: "User with ID 'abc-123' not found",
  error: "USER_NOT_FOUND",
  timestamp: "2025-10-16T12:00:00.000Z",
  path: "/api/users/abc-123"
}

// Server logs include full context:
{
  ...errorResponse,
  tenantId: "tenant-123",
  userId: "user-456",
  requestId: "req-789",
  method: "GET",
  ip: "192.168.1.1",
  userAgent: "Mozilla/5.0..."
}
```
