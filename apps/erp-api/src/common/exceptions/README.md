# Custom Exceptions

This directory contains domain-specific exceptions for the multi-level admin system.

## Available Exceptions

### TenantNotFoundException
Thrown when a tenant cannot be found by ID.

```typescript
throw new TenantNotFoundException(tenantId);
```

### UserNotFoundException
Thrown when a user cannot be found by ID.

```typescript
throw new UserNotFoundException(userId);
```

### DuplicateEmailException
Thrown when attempting to create a user with an email that already exists in the tenant.

```typescript
throw new DuplicateEmailException(email);
```

### InsufficientPermissionsException
Thrown when a user attempts to perform an action without the required permissions.

```typescript
throw new InsufficientPermissionsException('users', 'delete');
```

### AccountLockedException
Thrown when a user account is locked due to too many failed login attempts.

```typescript
throw new AccountLockedException(lockedUntil);
```

## Usage

Import exceptions from the common module:

```typescript
import {
  TenantNotFoundException,
  UserNotFoundException,
  DuplicateEmailException,
  InsufficientPermissionsException,
  AccountLockedException
} from '@/common';
```

All exceptions extend NestJS built-in HTTP exceptions and will be automatically caught and formatted by the GlobalExceptionFilter.
