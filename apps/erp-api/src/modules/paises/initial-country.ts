export const INITIAL_ACTIVE_COUNTRY_ID = 1;
export const INITIAL_ACTIVE_COUNTRY_CODE = 'PE';
export const INITIAL_ACTIVE_COUNTRY_CURRENCY = 'PEN';

export const INITIAL_ACTIVE_COUNTRY_MESSAGE =
  'Por ahora el ERP opera solo para Peru (SUNAT). Los demas paises quedan en roadmap.';

export function normalizeCountryCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function isInitialActiveCountryCode(value: unknown): boolean {
  return normalizeCountryCode(value) === INITIAL_ACTIVE_COUNTRY_CODE;
}

export function isInitialActiveCountryId(value: unknown): boolean {
  return Number(value) === INITIAL_ACTIVE_COUNTRY_ID;
}
