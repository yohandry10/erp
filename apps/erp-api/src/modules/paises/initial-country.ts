export type ActiveCountryCode = 'PE' | 'AR' | 'CO';

export interface ActiveCountryProfile {
  id: number;
  codigo: ActiveCountryCode;
  nombre: string;
  autoridadFiscal: string;
  documentoFiscal: string;
  moneda: string;
  simboloMoneda: string;
  locale: string;
  impuesto: string;
  tasaImpuesto: number;
}

export const ACTIVE_COUNTRY_PROFILES: Record<ActiveCountryCode, ActiveCountryProfile> = {
  PE: {
    id: 1,
    codigo: 'PE',
    nombre: 'Perú',
    autoridadFiscal: 'SUNAT',
    documentoFiscal: 'RUC',
    moneda: 'PEN',
    simboloMoneda: 'S/',
    locale: 'es-PE',
    impuesto: 'IGV',
    tasaImpuesto: 0.18,
  },
  AR: {
    id: 5,
    codigo: 'AR',
    nombre: 'Argentina',
    autoridadFiscal: 'ARCA',
    documentoFiscal: 'CUIT',
    moneda: 'ARS',
    simboloMoneda: '$',
    locale: 'es-AR',
    impuesto: 'IVA',
    tasaImpuesto: 0.21,
  },
  CO: {
    id: 2,
    codigo: 'CO',
    nombre: 'Colombia',
    autoridadFiscal: 'DIAN',
    documentoFiscal: 'NIT',
    moneda: 'COP',
    simboloMoneda: '$',
    locale: 'es-CO',
    impuesto: 'IVA',
    tasaImpuesto: 0.19,
  },
};

export const ACTIVE_COUNTRY_CODES = Object.keys(ACTIVE_COUNTRY_PROFILES) as ActiveCountryCode[];
export const ACTIVE_COUNTRY_IDS = ACTIVE_COUNTRY_CODES.map(
  (code) => ACTIVE_COUNTRY_PROFILES[code].id,
);

// Compatibilidad: Perú sigue siendo el fallback seguro para datos históricos sin país.
export const INITIAL_ACTIVE_COUNTRY_ID = ACTIVE_COUNTRY_PROFILES.PE.id;
export const INITIAL_ACTIVE_COUNTRY_CODE = ACTIVE_COUNTRY_PROFILES.PE.codigo;
export const INITIAL_ACTIVE_COUNTRY_CURRENCY = ACTIVE_COUNTRY_PROFILES.PE.moneda;

export const ACTIVE_COUNTRY_MESSAGE =
  'El ERP opera actualmente para Perú (SUNAT), Argentina (ARCA) y Colombia (DIAN).';
export const INITIAL_ACTIVE_COUNTRY_MESSAGE = ACTIVE_COUNTRY_MESSAGE;

export function normalizeCountryCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function isActiveCountryCode(value: unknown): value is ActiveCountryCode {
  return ACTIVE_COUNTRY_CODES.includes(normalizeCountryCode(value) as ActiveCountryCode);
}

export function isActiveCountryId(value: unknown): boolean {
  return ACTIVE_COUNTRY_IDS.includes(Number(value));
}

export function getActiveCountryByCode(value: unknown): ActiveCountryProfile | null {
  const code = normalizeCountryCode(value);
  return isActiveCountryCode(code) ? ACTIVE_COUNTRY_PROFILES[code] : null;
}

export function getActiveCountryById(value: unknown): ActiveCountryProfile | null {
  const id = Number(value);
  return ACTIVE_COUNTRY_CODES
    .map((code) => ACTIVE_COUNTRY_PROFILES[code])
    .find((profile) => profile.id === id) ?? null;
}

export function validateArgentinaCuit(value: unknown): boolean {
  const cuit = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(cuit)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(cuit[index]) * weight, 0);
  const remainder = 11 - (sum % 11);
  const digit = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder;
  return digit === Number(cuit[10]);
}

export function validatePeruRuc(value: unknown): boolean {
  const ruc = String(value ?? '').replace(/\D/g, '');
  // Mantiene el contrato histórico de Perú: la validación de existencia y
  // estado del contribuyente se realiza mediante SUNAT/APIPERU, no por un
  // cálculo local más restrictivo que podría bloquear RUC ya admitidos.
  return /^\d{11}$/.test(ruc);
}

/**
 * Dígito de verificación del NIT según la DIAN.
 *
 * Los pesos se aplican desde el dígito más a la derecha hacia la izquierda,
 * empezando por 3. Estuvieron en orden inverso —el último dígito pesaba 71—, y
 * así el resultado sólo coincidía por casualidad: de cuatro NIT reales
 * comprobados acertaba uno.
 *
 * Se exporta para que exista una sola implementación: había una copia en
 * `ColombiaValidationService` con el mismo error, y dos copias divergen.
 */
export function calcularDigitoVerificacionNit(base: string): number {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const sum = base
    .split('')
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  const remainder = sum % 11;
  return remainder === 0 || remainder === 1 ? remainder : 11 - remainder;
}

export interface ColombiaNitParts {
  /** NIT sin el dígito de verificación, tal como se declara en CompanyID. */
  base: string;
  /** Dígito de verificación separado para el atributo schemeID de DIAN. */
  dv: string;
  /** Forma canónica persistible: sólo dígitos, incluyendo el DV al final. */
  compact: string;
  /** Forma legible para pantalla. */
  formatted: string;
}

/**
 * Separa el NIT y su DV sin perder información.
 *
 * Acepta las dos formas que usa el producto (9001234568 y 900123456-8), pero
 * siempre devuelve una representación canónica sólo-dígitos. La versión previa
 * aceptaba una base de diez dígitos únicamente si llevaba guion, por lo que el
 * wizard, la configuración y el XML podían interpretar el mismo NIT distinto.
 */
export function parseColombiaNit(value: unknown): ColombiaNitParts | null {
  const normalized = String(value ?? '').trim().replace(/\s+/g, '');
  const separated = normalized.match(/^(\d{9,10})-(\d)$/);
  const compact = normalized.match(/^\d{10,11}$/);
  const base = separated?.[1] ?? (compact ? normalized.slice(0, -1) : '');
  const dv = separated?.[2] ?? (compact ? normalized.slice(-1) : '');
  if (!base || !dv || calcularDigitoVerificacionNit(base) !== Number(dv)) {
    return null;
  }
  return {
    base,
    dv,
    compact: `${base}${dv}`,
    formatted: `${base}-${dv}`,
  };
}

export function validateColombiaNit(value: unknown): boolean {
  return parseColombiaNit(value) !== null;
}

export function validateCountryTaxId(country: unknown, value: unknown): boolean {
  const code = normalizeCountryCode(country);
  if (code === 'AR') return validateArgentinaCuit(value);
  if (code === 'PE') return validatePeruRuc(value);
  if (code === 'CO') return validateColombiaNit(value);
  return false;
}

// Alias conservados para evitar una migración masiva de imports.
export const isInitialActiveCountryCode = isActiveCountryCode;
export const isInitialActiveCountryId = isActiveCountryId;
