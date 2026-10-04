import { ServiceUnavailableException } from '@nestjs/common';

type DbError = { code?: string | null; message?: string | null } | null | undefined;

/** Fila inexistente o identificador mal formado: el recurso no existe para el tenant. */
export function isNotFoundError(error: DbError): boolean {
  return ['PGRST116', '22P02'].includes(String(error?.code ?? ''));
}

/** Una lectura fallida no es un dato vacío ni un error de la petición. */
export function readUnavailable(subject: string): ServiceUnavailableException {
  return new ServiceUnavailableException(`No se pudo consultar ${subject}; reintente`);
}

/** Inexistente devuelve null; cualquier otro fallo de lectura es 503. */
export function rowOrUnavailable<T>(data: T | null, error: DbError, subject: string): T | null {
  if (error && !isNotFoundError(error)) throw readUnavailable(subject);
  return error ? null : data;
}
