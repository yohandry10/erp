import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

type DbError = { code?: string | null; message?: string | null } | null | undefined;

/** Fila inexistente o identificador mal formado: el recurso no existe para el tenant. */
export function isNotFoundError(error: DbError): boolean {
  return ['PGRST116', '22P02'].includes(String(error?.code ?? ''));
}

/** Una lectura fallida no es un dato vacío ni un error de la petición. */
export function readUnavailable(subject: string): ServiceUnavailableException {
  return new ServiceUnavailableException(`No se pudo consultar ${subject}; reintente`);
}

/**
 * Clasifica el error de un writer de ventas: reglas de negocio 400, colisión de
 * intención 409, permiso de dominio 403 e infraestructura 503 recuperable.
 */
export function writerFailure(error: DbError, fallback: string): HttpException {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').trim();
  if (code === '23505') return new ConflictException(message || fallback);
  if (code === '42501') {
    return /permission denied/i.test(message)
      ? new ServiceUnavailableException(`${fallback}; reintente con la misma intención`)
      : new ForbiddenException(message || fallback);
  }
  if (!code || /^(08|53|57|58|XX|PGRST)/.test(code)) {
    return new ServiceUnavailableException(`${fallback}; reintente con la misma intención`);
  }
  if (isNotFoundError(error)) return new NotFoundException(message || fallback);
  return new BadRequestException(message || fallback);
}
