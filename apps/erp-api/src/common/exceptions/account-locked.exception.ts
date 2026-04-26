import { UnauthorizedException } from '@nestjs/common';

export class AccountLockedException extends UnauthorizedException {
  constructor(lockedUntil?: Date) {
    const message = lockedUntil
      ? `Account is locked until ${lockedUntil.toISOString()}`
      : 'Account is locked due to too many failed login attempts';
    
    super(message, 'ACCOUNT_LOCKED');
  }
}
