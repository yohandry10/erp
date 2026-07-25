/**
 * Afectación del IGV por ítem (SUNAT — Catálogo 07).
 *
 * En Perú no todo lo que se vende está gravado: hay bienes y servicios
 * exonerados (Apéndice I de la Ley del IGV), inafectos y exportaciones.
 * Calcular un IGV plano sobre el total cobra un impuesto que no corresponde
 * y lo declara mal ante SUNAT, así que el desglose debe hacerse por ítem.
 *
 * Este módulo es intencionalmente puro (sin BD ni Nest) para poder usarse
 * desde POS, Ventas y la construcción del XML con el mismo criterio.
 */

/** Códigos del Catálogo 07 que maneja el ERP para operaciones onerosas. */
export const AFECTACION_IGV = {
  GRAVADO: '10',
  EXONERADO: '20',
  INAFECTO: '30',
  EXPORTACION: '40',
} as const;

export type CategoriaAfectacion = 'GRAVADO' | 'EXONERADO' | 'INAFECTO' | 'EXPORTACION';

/** Código de esquema tributario que espera SUNAT en el XML por categoría. */
export const ESQUEMA_TRIBUTARIO: Record<
  CategoriaAfectacion,
  { id: string; nombre: string; tipo: string }
> = {
  GRAVADO: { id: '1000', nombre: 'IGV', tipo: 'VAT' },
  EXONERADO: { id: '9997', nombre: 'EXO', tipo: 'VAT' },
  INAFECTO: { id: '9998', nombre: 'INA', tipo: 'FRE' },
  EXPORTACION: { id: '9995', nombre: 'EXP', tipo: 'FRE' },
};

/**
 * Traduce un código del Catálogo 07 a la categoría con la que se agrupan los
 * totales. Los códigos de operaciones gratuitas (11..17, 21, 31..36) comparten
 * la primera cifra con su categoría onerosa, por eso se agrupan por decena.
 * Ante un valor ausente o desconocido se asume GRAVADO: es el caso mayoritario
 * y el que no subdeclara IGV.
 */
export function categoriaDeAfectacion(codigo?: string | null): CategoriaAfectacion {
  const normalizado = String(codigo ?? '').trim();
  if (!normalizado) return 'GRAVADO';

  if (normalizado === AFECTACION_IGV.EXPORTACION) return 'EXPORTACION';

  switch (normalizado.charAt(0)) {
    case '2':
      return 'EXONERADO';
    case '3':
      return 'INAFECTO';
    case '1':
    default:
      return 'GRAVADO';
  }
}

export function esGravado(codigo?: string | null): boolean {
  return categoriaDeAfectacion(codigo) === 'GRAVADO';
}

export interface ItemAfectacion {
  /** Valor de venta del ítem, sin IGV. */
  baseImponible: number;
  /** Código del Catálogo 07; si falta se asume gravado. */
  afectacionIgv?: string | null;
}

export interface DesgloseIgv {
  gravadas: number;
  exoneradas: number;
  inafectas: number;
  exportacion: number;
  /** IGV calculado únicamente sobre la base gravada. */
  igv: number;
  /** Suma de todas las bases más el IGV. */
  total: number;
}

const round2 = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;

/**
 * Desglosa las bases por categoría y calcula el IGV solo sobre lo gravado.
 *
 * @param items Ítems con su base imponible y su afectación.
 * @param tasaIgv Tasa en fracción (0.18 para 18%).
 */
export function calcularDesgloseIgv(items: ItemAfectacion[], tasaIgv: number): DesgloseIgv {
  const tasa = Number.isFinite(tasaIgv) && tasaIgv >= 0 ? tasaIgv : 0;

  const acumulado = { gravadas: 0, exoneradas: 0, inafectas: 0, exportacion: 0 };

  for (const item of items ?? []) {
    const base = Number(item?.baseImponible ?? 0);
    if (!Number.isFinite(base)) continue;

    switch (categoriaDeAfectacion(item?.afectacionIgv)) {
      case 'EXONERADO':
        acumulado.exoneradas += base;
        break;
      case 'INAFECTO':
        acumulado.inafectas += base;
        break;
      case 'EXPORTACION':
        acumulado.exportacion += base;
        break;
      default:
        acumulado.gravadas += base;
    }
  }

  const gravadas = round2(acumulado.gravadas);
  const exoneradas = round2(acumulado.exoneradas);
  const inafectas = round2(acumulado.inafectas);
  const exportacion = round2(acumulado.exportacion);
  const igv = round2(gravadas * tasa);

  return {
    gravadas,
    exoneradas,
    inafectas,
    exportacion,
    igv,
    total: round2(gravadas + exoneradas + inafectas + exportacion + igv),
  };
}
