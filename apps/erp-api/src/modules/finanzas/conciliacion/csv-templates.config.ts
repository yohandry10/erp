/**
 * Configuración de plantillas CSV para extractos bancarios
 * Permite definir formatos personalizados por banco
 */

export type TipoColumna = 
  | 'fecha' 
  | 'descripcion' 
  | 'referencia' 
  | 'tipo' 
  | 'monto' 
  | 'cargo' 
  | 'abono' 
  | 'saldo'
  | 'ignorar';

export interface MapeoColumna {
  /** Índice de la columna (0-based) */
  indice: number;
  /** Tipo de dato que contiene la columna */
  tipo: TipoColumna;
  /** Nombre alternativo de la columna (para identificación en encabezado) */
  nombres?: string[];
}

export interface FormatoFecha {
  /** Formato de fecha: 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', etc. */
  formato: string;
  /** Separador usado: '/', '-', '.' */
  separador: string;
}

export interface PlantillaCsvBanco {
  /** Código del banco */
  codigo: string;
  /** Nombre del banco */
  nombre: string;
  /** Descripción del formato */
  descripcion: string;
  /** Indica si la primera línea es encabezado */
  tieneEncabezado: boolean;
  /** Separador de columnas (por defecto ',') */
  separador: string;
  /** Formato de fecha usado por el banco */
  formatoFecha: FormatoFecha;
  /** Mapeo de columnas */
  columnas: MapeoColumna[];
  /** 
   * Indica si usa columnas separadas para cargo/abono (true) 
   * o una sola columna con tipo (false) 
   */
  usaCargoAbonoSeparado: boolean;
  /** Símbolos de moneda a eliminar al parsear */
  simbolosMoneda?: string[];
  /** Separador decimal ('.' o ',') */
  separadorDecimal: string;
  /** Separador de miles (',' o '.') */
  separadorMiles?: string;
}

/**
 * Plantillas predefinidas para bancos peruanos
 */
export const PLANTILLAS_BANCOS: Record<string, PlantillaCsvBanco> = {
  BCP: {
    codigo: 'BCP',
    nombre: 'Banco de Crédito del Perú',
    descripcion: 'Formato estándar de extracto BCP',
    tieneEncabezado: true,
    separador: ',',
    formatoFecha: {
      formato: 'DD/MM/YYYY',
      separador: '/',
    },
    columnas: [
      { indice: 0, tipo: 'fecha', nombres: ['fecha', 'date'] },
      { indice: 1, tipo: 'descripcion', nombres: ['descripcion', 'description', 'detalle'] },
      { indice: 2, tipo: 'cargo', nombres: ['cargo', 'cargos', 'debito'] },
      { indice: 3, tipo: 'abono', nombres: ['abono', 'abonos', 'credito'] },
      { indice: 4, tipo: 'saldo', nombres: ['saldo', 'balance'] },
    ],
    usaCargoAbonoSeparado: true,
    simbolosMoneda: ['S/', '$', 'S/.', 'PEN'],
    separadorDecimal: '.',
    separadorMiles: ',',
  },

  BBVA: {
    codigo: 'BBVA',
    nombre: 'BBVA Continental',
    descripcion: 'Formato estándar de extracto BBVA',
    tieneEncabezado: true,
    separador: ',',
    formatoFecha: {
      formato: 'DD/MM/YYYY',
      separador: '/',
    },
    columnas: [
      { indice: 0, tipo: 'fecha', nombres: ['fecha', 'date'] },
      { indice: 1, tipo: 'descripcion', nombres: ['descripcion', 'description', 'concepto'] },
      { indice: 2, tipo: 'cargo', nombres: ['cargo', 'cargos', 'debito'] },
      { indice: 3, tipo: 'abono', nombres: ['abono', 'abonos', 'credito'] },
      { indice: 4, tipo: 'saldo', nombres: ['saldo', 'balance'] },
    ],
    usaCargoAbonoSeparado: true,
    simbolosMoneda: ['S/', '$', 'S/.', 'PEN'],
    separadorDecimal: '.',
    separadorMiles: ',',
  },

  INTERBANK: {
    codigo: 'INTERBANK',
    nombre: 'Interbank',
    descripcion: 'Formato estándar de extracto Interbank',
    tieneEncabezado: true,
    separador: ',',
    formatoFecha: {
      formato: 'DD/MM/YYYY',
      separador: '/',
    },
    columnas: [
      { indice: 0, tipo: 'fecha', nombres: ['fecha', 'date'] },
      { indice: 1, tipo: 'descripcion', nombres: ['descripcion', 'description', 'detalle'] },
      { indice: 2, tipo: 'referencia', nombres: ['referencia', 'reference', 'numero', 'operacion'] },
      { indice: 3, tipo: 'tipo', nombres: ['tipo', 'type', 'movimiento'] },
      { indice: 4, tipo: 'monto', nombres: ['monto', 'amount', 'importe'] },
    ],
    usaCargoAbonoSeparado: false,
    simbolosMoneda: ['S/', '$', 'S/.', 'PEN'],
    separadorDecimal: '.',
    separadorMiles: ',',
  },

  SCOTIABANK: {
    codigo: 'SCOTIABANK',
    nombre: 'Scotiabank',
    descripcion: 'Formato estándar de extracto Scotiabank',
    tieneEncabezado: true,
    separador: ',',
    formatoFecha: {
      formato: 'DD/MM/YYYY',
      separador: '/',
    },
    columnas: [
      { indice: 0, tipo: 'fecha', nombres: ['fecha', 'date'] },
      { indice: 1, tipo: 'descripcion', nombres: ['descripcion', 'description', 'detalle'] },
      { indice: 2, tipo: 'cargo', nombres: ['cargo', 'cargos', 'debito'] },
      { indice: 3, tipo: 'abono', nombres: ['abono', 'abonos', 'credito'] },
    ],
    usaCargoAbonoSeparado: true,
    simbolosMoneda: ['S/', '$', 'S/.', 'PEN'],
    separadorDecimal: '.',
    separadorMiles: ',',
  },

  GENERICO: {
    codigo: 'GENERICO',
    nombre: 'Formato Genérico',
    descripcion: 'Formato genérico estándar: Fecha,Descripcion,Referencia,Tipo,Monto',
    tieneEncabezado: true,
    separador: ',',
    formatoFecha: {
      formato: 'YYYY-MM-DD',
      separador: '-',
    },
    columnas: [
      { indice: 0, tipo: 'fecha', nombres: ['fecha', 'date'] },
      { indice: 1, tipo: 'descripcion', nombres: ['descripcion', 'description', 'detalle'] },
      { indice: 2, tipo: 'referencia', nombres: ['referencia', 'reference', 'numero'] },
      { indice: 3, tipo: 'tipo', nombres: ['tipo', 'type', 'movimiento'] },
      { indice: 4, tipo: 'monto', nombres: ['monto', 'amount', 'importe'] },
    ],
    usaCargoAbonoSeparado: false,
    simbolosMoneda: ['S/', '$', 'S/.', 'PEN', 'USD'],
    separadorDecimal: '.',
    separadorMiles: ',',
  },
};

/**
 * Obtiene la plantilla de un banco específico
 */
export function obtenerPlantillaBanco(codigoBanco: string): PlantillaCsvBanco {
  const codigo = codigoBanco.toUpperCase();
  return PLANTILLAS_BANCOS[codigo] || PLANTILLAS_BANCOS.GENERICO;
}

/**
 * Lista todas las plantillas disponibles
 */
export function listarPlantillasDisponibles(): PlantillaCsvBanco[] {
  return Object.values(PLANTILLAS_BANCOS);
}

/**
 * Registra una nueva plantilla personalizada
 */
export function registrarPlantillaPersonalizada(plantilla: PlantillaCsvBanco): void {
  PLANTILLAS_BANCOS[plantilla.codigo.toUpperCase()] = plantilla;
}
