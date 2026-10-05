import { HttpException, ServiceUnavailableException } from '@nestjs/common';

/** Conserva las excepciones HTTP ya clasificadas; cualquier otra falla de lectura es 503. */
export function lecturaInventarioFallida(error: unknown, subject: string): HttpException {
  if (error instanceof HttpException && error.getStatus() < 500) return error;
  return new ServiceUnavailableException(`No se pudo consultar ${subject}; reintente`);
}
