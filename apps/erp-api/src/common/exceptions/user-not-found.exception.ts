import { NotFoundException } from '@nestjs/common';

export class UserNotFoundException extends NotFoundException {
  constructor(userId?: string) {
    super(
      userId
        ? `User with ID '${userId}' not found`
        : 'User not found',
      'USER_NOT_FOUND'
    );
  }
}
