import {
  BadRequestException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

type DbError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Un reporte contable que no pudo leer sus datos no es un reporte vacío: se
 * responde 503 para que el cliente reintente en vez de mostrar ceros.
 */
export function lecturaContableFallida(error: unknown, subject: string): HttpException {
  if (error instanceof HttpException) return error;
  const code = String((error as DbError)?.code ?? '');
  if (code === 'PGRST116') return new NotFoundException(`No se encontró ${subject}`);
  if (code === '22P02') return new BadRequestException(`Identificador inválido al consultar ${subject}`);
  return new ServiceUnavailableException(`No se pudo consultar ${subject}; reintente`);
}

/** Valida anio/mes del query; ambos o ninguno. */
export function periodoContable(anio?: unknown, mes?: unknown): { anio: number; mes: number } | null {
  const vacio = (v: unknown) => v === undefined || v === null || v === '';
  if (vacio(anio) && vacio(mes)) return null;
  const anioNum = Number(anio);
  const mesNum = Number(mes);
  if (!Number.isInteger(anioNum) || anioNum < 1900 || anioNum > 9999 || !Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) {
    throw new BadRequestException('Parámetros inválidos: anio debe ser un año y mes debe estar entre 1 y 12');
  }
  return { anio: anioNum, mes: mesNum };
}

/**
 * Los libros filtran por fechaDesde/fechaHasta; un anio/mes recibido se valida
 * y se traduce al rango del mes en vez de ignorarse.
 */
export function filtrosConPeriodo<T extends Record<string, any>>(filtros: T = {} as T): T {
  const periodo = periodoContable(filtros?.anio, filtros?.mes);
  if (!periodo) return filtros;
  const mes = String(periodo.mes).padStart(2, '0');
  const ultimoDia = new Date(Date.UTC(periodo.anio, periodo.mes, 0)).getUTCDate();
  return {
    ...filtros,
    fechaDesde: filtros.fechaDesde ?? `${periodo.anio}-${mes}-01`,
    fechaHasta: filtros.fechaHasta ?? `${periodo.anio}-${mes}-${String(ultimoDia).padStart(2, '0')}`,
  };
}
