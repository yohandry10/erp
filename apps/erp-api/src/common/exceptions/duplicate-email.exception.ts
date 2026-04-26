import { ConflictException } from '@nestjs/common';

export class DuplicateEmailException extends ConflictException {
  constructor(email?: string) {
    super(
      email
        ? `Email '${email}' is already in use`
        : 'Email is already in use',
      'DUPLICATE_EMAIL'
    );
  }
}
