export interface AsientoContable {
  fecha: string;
  concepto: string;
  referencia: string;
  detalles: AsientoDetalle[];
  sourceEventId?: string;
}

export interface AsientoDetalle {
  cuentaId: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  debe: number;
  haber: number;
  descripcion: string;
}

export interface FiltrosContables {
  fechaDesde?: string;
  fechaHasta?: string;
  numeroAsiento?: number;
  estado?: string;
  cuentaCodigo?: string;
}

export interface LibroContable {
  fecha: string;
  numeroAsiento: number;
  concepto: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  debe: number;
  haber: number;
  saldo?: number;
}

export interface MovimientoContable {
  fecha: string;
  numeroAsiento: number;
  concepto: string;
  debe: number;
  haber: number;
  saldo: number;
}

export interface BalanceComprobacion {
  cuentaCodigo: string;
  cuentaNombre: string;
  saldoAnterior: number;
  debe: number;
  haber: number;
  saldoActual: number;
}
