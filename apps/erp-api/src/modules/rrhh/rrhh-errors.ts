import { HttpException, ServiceUnavailableException } from '@nestjs/common';

/** Una consulta de RRHH que no pudo leer responde 503, nunca una lista vacía ni 500. */
export function lecturaRrhhFallida(subject: string): ServiceUnavailableException {
  return new ServiceUnavailableException(`No se pudo consultar ${subject}; reintente`);
}

/** Conserva las excepciones HTTP ya clasificadas; cualquier otra falla de lectura es 503. */
export function relanzarLecturaRrhh(error: unknown, subject: string): never {
  if (error instanceof HttpException) throw error;
  throw lecturaRrhhFallida(subject);
}
