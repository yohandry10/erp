import { BadRequestException, Injectable, ParseUUIDPipe } from '@nestjs/common';

/** Rechaza un identificador mal formado antes de consultar PostgreSQL. */
@Injectable()
export class UuidParamPipe extends ParseUUIDPipe {
  constructor() {
    super({
      exceptionFactory: () => new BadRequestException('El identificador no es válido'),
    });
  }
}
