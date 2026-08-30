import { parseColombiaNit } from '../../paises/initial-country';

export const DIAN_IDENTITY_TYPES = ['31', '13', '22', '12', '41'] as const;
export type DianIdentityType = typeof DIAN_IDENTITY_TYPES[number];

export interface DianIdentity {
  type: DianIdentityType;
  canonicalNumber: string;
  xmlNumber: string;
  verificationDigit?: string;
  schemeName: 'NIT' | 'CC' | 'CE' | 'TI' | 'PASAPORTE';
}

const TYPE_ALIASES: Record<string, DianIdentityType> = {
  '31': '31',
  NIT: '31',
  '13': '13',
  CC: '13',
  CEDULA: '13',
  CEDULA_CIUDADANIA: '13',
  '22': '22',
  CE: '22',
  CEDULA_EXTRANJERIA: '22',
  '12': '12',
  TI: '12',
  TARJETA_IDENTIDAD: '12',
  '41': '41',
  PASAPORTE: '41',
  PASSPORT: '41',
};

const SCHEME_NAMES: Record<DianIdentityType, DianIdentity['schemeName']> = {
  '31': 'NIT',
  '13': 'CC',
  '22': 'CE',
  '12': 'TI',
  '41': 'PASAPORTE',
};

export function normalizeDianIdentityType(value: unknown): DianIdentityType | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s/-]+/g, '_');
  return TYPE_ALIASES[normalized] ?? null;
}

/**
 * Normaliza la identidad contra el catálogo DIAN sin adivinar el tipo a partir
 * de la longitud. El NIT conserva el número canónico (base + DV) para la BD,
 * pero separa el DV porque UBL lo declara en `schemeID`.
 */
export function normalizeDianIdentity(typeValue: unknown, numberValue: unknown): DianIdentity {
  const type = normalizeDianIdentityType(typeValue);
  if (!type) {
    throw new Error(
      'Tipo de documento DIAN inválido: use NIT (31), CC (13), CE (22), TI (12) o pasaporte (41)',
    );
  }

  const raw = String(numberValue ?? '').trim();
  if (type === '31') {
    const nit = parseColombiaNit(raw);
    if (!nit) throw new Error('NIT inválido: informe la base y su dígito de verificación');
    return {
      type,
      canonicalNumber: nit.compact,
      xmlNumber: nit.base,
      verificationDigit: nit.dv,
      schemeName: 'NIT',
    };
  }

  const compact = raw.replace(/[.\s-]/g, '').toUpperCase();
  const valid = type === '13'
    ? /^\d{6,10}$/.test(compact)
    : type === '12'
      ? /^\d{6,11}$/.test(compact)
      : type === '22'
        ? /^[A-Z0-9]{6,15}$/.test(compact)
        : /^[A-Z0-9]{5,20}$/.test(compact);
  if (!valid) {
    throw new Error(`Número de ${SCHEME_NAMES[type]} inválido para el catálogo DIAN`);
  }
  return {
    type,
    canonicalNumber: compact,
    xmlNumber: compact,
    schemeName: SCHEME_NAMES[type],
  };
}
