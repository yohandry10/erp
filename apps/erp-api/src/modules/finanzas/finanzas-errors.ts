import {
  BadRequestException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

type DbError = { code?: string | null; message?: string | null } | null | undefined;

/** Una consulta financiera que no pudo leer no es un rechazo del cliente: 503. */
export function lecturaFinancieraFallida(subject: string): ServiceUnavailableException {
  return new ServiceUnavailableException(`No se pudo consultar ${subject}; reintente`);
}

function esInfraestructura(error: DbError): boolean {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  if (!code) return true;
  if (/^(08|53|57|58|XX)/.test(code) || code.startsWith('PGRST') || code === '42883') return true;
  return code === '42501' && message.includes('permission denied');
}

/**
 * Error de un writer financiero: inexistente o ajeno 404, regla de negocio 400
 * con su mensaje, indisponibilidad 503.
 */
export function errorWriterFinanciero(error: DbError, fallback: string): HttpException {
  const message = String(error?.message || fallback);
  if (error?.code === 'P0002' || /_NOT_FOUND\b/.test(message)) {
    return new NotFoundException(message);
  }
  if (esInfraestructura(error)) return new ServiceUnavailableException(`${fallback}; reintente`);
  return new BadRequestException(message);
}
