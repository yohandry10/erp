import { ForbiddenException } from '@nestjs/common';

export class InsufficientPermissionsException extends ForbiddenException {
  constructor(resource?: string, action?: string) {
    const message = resource && action
      ? `Insufficient permissions to ${action} ${resource}`
      : 'Insufficient permissions to perform this action';
    
    super(message, 'INSUFFICIENT_PERMISSIONS');
  }
}
