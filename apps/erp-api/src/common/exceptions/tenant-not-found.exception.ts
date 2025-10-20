import { NotFoundException } from '@nestjs/common';

export class TenantNotFoundException extends NotFoundException {
  constructor(tenantId?: string) {
    super(
      tenantId
        ? `Tenant with ID '${tenantId}' not found`
        : 'Tenant not found',
      'TENANT_NOT_FOUND'
    );
  }
}
